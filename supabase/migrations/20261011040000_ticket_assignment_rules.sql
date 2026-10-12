-- Owner's assignment rules (2026-10-11), in force until the owner says otherwise. Every new support
-- case goes, always within its area (engineering → engineers, chemistry → chemists), to:
-- 1) continuity: whoever attended the case being reopened, the equipment's habitual owner or whoever
--    attended the equipment's previous case of the same area, unless that person is busy today;
-- 2) region: whoever covers the equipment's state (ticket_staff_coverage), in case travel is needed;
-- 3) balanced load: fewest open cases, then whoever closed their last case longest ago, then random.
-- Government cases (Falcon, Genesis, Centrum, Dicipa) weigh one case less for the government team.
-- Busy today = 3 or more open support cases, a planning dated exactly today that names the person, or
-- a trip that covers today. A week-long planning does not count: the person can still take the case.
-- Replaces "habitual owner → random territory", which left every case pending while coverage and
-- habitual owners were empty (production, 2026-10-11). Same ranking as the Alexa skill.

alter table public.ticket_assignments drop constraint if exists ticket_assignments_source_check;
alter table public.ticket_assignments add constraint ticket_assignments_source_check
 check (source in ('manual','habitual','territorio','continuidad','region','carga'));

-- Government team: a little more weight on government cases, never mandatory. Admins manage it.
create table public.ticket_government_team (
 user_id uuid primary key references public.profiles(id),
 updated_by uuid references public.profiles(id) default auth.uid(),
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.ticket_government_team enable row level security;
create policy "Admins manage government team" on public.ticket_government_team for all to authenticated
 using (public.is_admin()) with check (public.is_admin());
grant select, insert, delete on public.ticket_government_team to authenticated;
revoke all on public.ticket_government_team from anon;
-- Benjamín and Ángel, as the owner named them.
insert into public.ticket_government_team(user_id)
select p.id from public.profiles p
where p.rol in ('admin','tecnico') and public.ticket_receiver_eligible(p.id)
  and string_to_array(public.ticket_person_key(p.nombre_completo), ' ') && array['benjamin','angel']
on conflict do nothing;

-- Same reading as Orion web (ticketIntake) and Alexa (channelOf).
create function public.ticket_is_government(p_subject text, p_description text, p_client text) returns boolean
language sql immutable as $$
 select (' ' || regexp_replace(public.ticket_routing_key(concat_ws(' ', p_subject, p_description)), '\s+', ' ', 'g') || ' ')
   ~ '\[(falcon|centrum|genesis|dicipa)\]|canal: ?(falcon|centrum|genesis|dicipa)|reporte falcon|reporte genesis|genesis healthcare|ticket zendesk| genesis |centrum|dicipa'
   or public.ticket_routing_key(p_client) ~ '(falcon|centrum|genesis|dicipa)'
$$;

-- Everyone of the case's area who may receive it, best first, with the rule that places them.
-- p_today only for tests; by default "today" is the service time zone's date.
create function public.ticket_assignment_ranking(p_ticket_id uuid, p_today date default null)
returns table(user_id uuid, full_name text, ranking integer, rule text, reason text,
 continuity text, busy_reason text, open_cases integer, last_closed_at timestamptz)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
 t public.tickets%rowtype; v_area text; v_serial text; v_today date; v_region text; v_client text; v_gov boolean;
 v_reopened uuid; v_owner uuid; v_previous uuid;
begin
 select * into t from public.tickets where id = p_ticket_id;
 if not found or public.ticket_is_planning(t.descripcion) then return; end if;
 v_area := public.ticket_support_area(t.asunto);
 if v_area is null then return; end if;
 v_serial := public.normalize_equipment_serial(t.numero_serie_equipo);
 v_today := coalesce(p_today, (clock_timestamp() at time zone
   coalesce((select s.timezone from public.service_kpi_settings s limit 1), 'America/Chihuahua'))::date);

 -- Region: the equipment's state, or the intake's "Estado:" line when the equipment is not in the fleet.
 select case when count(distinct public.ticket_routing_key(e.estado)) filter (where public.ticket_routing_key(e.estado) <> '') = 1
             then max(public.ticket_routing_key(e.estado)) filter (where public.ticket_routing_key(e.estado) <> '') end,
        max(c.razon_social)
   into v_region, v_client
   from public.equipos e left join public.clientes c on c.id = e.cliente_id
  where v_serial is not null and e.fecha_fin is null and public.normalize_equipment_serial(e.numero_serie) = v_serial;
 v_region := coalesce(v_region, nullif(public.ticket_routing_key(
   (regexp_match(coalesce(t.descripcion, ''), '(?:^|\n)[ \t]*estado[ \t]*:[ \t]*([^\n]+)', 'i'))[1]), ''));
 v_gov := public.ticket_is_government(t.asunto, t.descripcion, v_client);

 -- Continuity, in order: the case being reopened, the equipment's habitual owner, its previous case.
 if t.reabre_ticket_id is not null then
   v_reopened := coalesce(
     (select a.assigned_to from public.ticket_assignments a where a.ticket_id = t.reabre_ticket_id),
     (select h.assigned_to from public.ticket_assignment_history h
       where h.ticket_id = t.reabre_ticket_id and h.assigned_to is not null order by h.assigned_at desc, h.id desc limit 1));
 end if;
 select o.assigned_to into v_owner from public.ticket_equipment_owners o
  where v_serial is not null and public.normalize_equipment_serial(o.serial) = v_serial and o.area = v_area;
 select a.assigned_to into v_previous from public.tickets x join public.ticket_assignments a on a.ticket_id = x.id
  where v_serial is not null and x.id <> t.id and a.assigned_to is not null
    and public.normalize_equipment_serial(x.numero_serie_equipo) = v_serial
    and public.ticket_support_area(x.asunto) = v_area and not public.ticket_is_planning(x.descripcion)
  order by x.creado_en desc, x.id limit 1;

 return query
 with pool as (
   select p.id, btrim(p.nombre_completo) as name,
     exists(select 1 from public.ticket_government_team g where g.user_id = p.id) as gov_member
   from public.profiles p
   where p.rol in ('admin','tecnico') and public.ticket_receiver_eligible(p.id) and public.service_staff_team(p.employee_type) = v_area
 ), open_load as (
   select a.assigned_to as id, count(*)::integer as n
   from public.ticket_assignments a join public.tickets x on x.id = a.ticket_id
   where x.estado <> 'cerrado' and not public.ticket_is_planning(x.descripcion)
   group by 1
 ), last_close as (
   select a.assigned_to as id, max(ev.occurred_at) as at
   from public.ticket_service_events ev
   join public.ticket_assignments a on a.ticket_id = ev.ticket_id
   join public.tickets x on x.id = ev.ticket_id
   where ev.kind = 'cierre' and not public.ticket_is_planning(x.descripcion)
   group by 1
 ), today_plans as (
   select x.descripcion from public.tickets x
   cross join lateral (select public.try_parse_planning_metadata(x.descripcion) as m) meta
   where x.estado <> 'cerrado' and public.ticket_is_planning(x.descripcion)
     and (coalesce(public.try_parse_iso_date(meta.m->>'scheduled_date'), public.try_parse_iso_date(meta.m->>'fecha_acordada')) = v_today
       or (public.try_parse_iso_date(meta.m->>'week_start') = v_today and public.try_parse_iso_date(meta.m->>'week_end') = v_today))
 ), trips as (
   select r.engineer_id as id from public.travel_requests r
   where r.engineer_id is not null and r.workflow_status::text not in ('borrador','rechazado','cancelado')
     and v_today between r.desired_departure_date and coalesce(r.desired_return_date, r.desired_departure_date)
 ), continuity_people as (
   select c.id, c.why, c.prio from (values
     (v_reopened, 'atendió el caso que se reabre', 1),
     (v_owner, 'es responsable habitual del equipo', 2),
     (v_previous, 'atendió el caso anterior de este equipo', 3)) c(id, why, prio)
   where c.id is not null
 ), people as (
   select p.id, p.name, coalesce(l.n, 0) as n, lc.at as closed_at,
     (select c.why from continuity_people c where c.id = p.id order by c.prio limit 1) as why,
     (select min(c.prio) from continuity_people c where c.id = p.id) as prio,
     case when exists(select 1 from trips tp where tp.id = p.id) then 'hoy está de viaje'
          when exists(select 1 from today_plans tp where public.ticket_names_person(tp.descripcion, p.name)) then 'hoy tiene una visita programada'
          when coalesce(l.n, 0) >= 3 then 'atiende ' || l.n || ' casos abiertos' end as busy,
     v_gov and p.gov_member as gov_weight,
     v_region is not null and exists(select 1 from public.ticket_staff_coverage sc
       where sc.user_id = p.id and sc.area = v_area and public.ticket_routing_key(sc.territory) = v_region) as regional,
     random() as draw
   from pool p left join open_load l on l.id = p.id left join last_close lc on lc.id = p.id
 ), tiered as (
   select pe.*, pe.n - case when pe.gov_weight then 1 else 0 end as weighted,
     case when pe.busy is not null then 4
          when pe.prio = (select min(q.prio) from people q where q.busy is null) then 1
          when pe.regional then 2 else 3 end as tier
   from people pe
 )
 select tr.id, tr.name,
   (row_number() over (order by tr.tier, tr.weighted, tr.closed_at nulls first, tr.draw))::integer,
   case tr.tier when 1 then 'continuidad' when 2 then 'region' else 'carga' end,
   case tr.tier
     when 1 then tr.why
     when 2 then 'cubre la región de ' || v_region
     when 3 then case when tr.n = 0 then 'no tiene casos abiertos'
                      else 'tiene la menor carga, ' || tr.n || case when tr.n = 1 then ' caso abierto' else ' casos abiertos' end end
                 || case when count(*) over (partition by tr.tier, tr.weighted) > 1
                         then ', y en el empate es quien lleva más tiempo sin cerrar un caso' else '' end
     else 'todos están ocupados; tiene la menor carga, aunque ' || tr.busy end
   || case when tr.gov_weight and tr.tier in (2, 3) then '; caso de gobierno y es del equipo de gobierno' else '' end,
   tr.why, tr.busy, tr.n, tr.closed_at
 from tiered tr;
end; $$;
revoke all on function public.ticket_assignment_ranking(uuid, date) from public, anon, authenticated;

create or replace function public.route_support_ticket(p_ticket_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare t public.tickets%rowtype; r record; v_person uuid; v_name text; v_rule text; v_reason text; v_skipped text;
begin
 select * into t from public.tickets where id = p_ticket_id for update;
 if not found or t.estado = 'cerrado' or public.ticket_is_planning(t.descripcion) then return false; end if;
 -- One case at a time: cases created together see each other's load.
 perform pg_advisory_xact_lock(hashtext('public.route_support_ticket'));
 if exists(select 1 from public.ticket_assignments a where a.ticket_id = t.id) then return false; end if;
 for r in select * from public.ticket_assignment_ranking(t.id) k order by k.ranking loop
   if v_person is null then v_person := r.user_id; v_name := r.full_name; v_rule := r.rule; v_reason := r.reason; end if;
   if r.continuity is not null and r.busy_reason is not null then
     v_skipped := concat_ws(' ', v_skipped, 'Se omitió a ' || r.full_name || ' (' || r.continuity || ') porque ' || r.busy_reason || '.');
   end if;
 end loop;
 if v_person is null then return false; end if;
 insert into public.ticket_assignments(ticket_id, assigned_to, source) values (t.id, v_person, v_rule);
 insert into public.ticket_bitacora(ticket_id, numero_serie_equipo, tipo, detalle, visible_cliente, creado_por)
 values (t.id, t.numero_serie_equipo, 'nota',
   'Asignación automática a ' || coalesce(v_name, v_person::text) || ' ('
   || case v_rule when 'continuidad' then 'continuidad' when 'region' then 'región' else 'carga equilibrada' end
   || '): ' || v_reason || '.' || coalesce(' ' || v_skipped, ''), false, v_person);
 return true;
end; $$;
revoke all on function public.route_support_ticket(uuid) from public, anon, authenticated;

create or replace function public.route_pending_support_tickets() returns integer
language plpgsql security definer set search_path = public as $$
declare t record; routed integer := 0;
begin
 if not public.is_admin() then raise exception 'Solo administradores pueden distribuir pendientes'; end if;
 for t in select x.id from public.tickets x
   where x.estado <> 'cerrado' and not public.ticket_is_planning(x.descripcion)
     and not exists(select 1 from public.ticket_assignments a where a.ticket_id = x.id)
   order by x.creado_en, x.id loop
   if public.route_support_ticket(t.id) then routed := routed + 1; end if;
 end loop;
 return routed;
end; $$;
