-- Access follows explicit assignments, never the author of an internal case.
create function public.can_work_ticket(p_ticket_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (public.is_admin() or (public.is_staff() and exists(
 select 1 from public.ticket_assignments where ticket_id=p_ticket_id and assigned_to=auth.uid())))
$$;
revoke all on function public.can_work_ticket(uuid) from public,anon;
grant execute on function public.can_work_ticket(uuid) to authenticated;
-- Restrictive policies also constrain any older permissive policies.
create policy "Ticket assignment boundary" on public.tickets as restrictive for select to authenticated
using (public.can_work_ticket(id) or (not public.is_staff() and user_id=auth.uid()));
create policy "Ticket update assignment boundary" on public.tickets as restrictive for update to authenticated
using (public.can_work_ticket(id)) with check(public.can_work_ticket(id));
create policy "Ticket delete admin boundary" on public.tickets as restrictive for delete to authenticated using(public.is_admin());
create policy "Ticket history assignment boundary" on public.ticket_bitacora as restrictive for select to authenticated
using(public.can_work_ticket(ticket_id) or (not public.is_staff() and visible_cliente and exists(select 1 from public.tickets t where t.id=ticket_id and t.user_id=auth.uid())));
create policy "Ticket history write boundary" on public.ticket_bitacora as restrictive for insert to authenticated
with check(public.can_work_ticket(ticket_id) and creado_por=auth.uid());
create policy "Ticket metrics assignment boundary" on public.ticket_service_events as restrictive for select to authenticated using(public.can_work_ticket(ticket_id));

create function public.ticket_routing_key(value text) returns text language sql immutable as $$
 select lower(btrim(translate(coalesce(value,''),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')))
$$;
create function public.ticket_support_area(subject text) returns text language sql immutable as $$
 select case when public.ticket_routing_key(subject) ~ '^(\[soporte ingeniero\]|soporte ingeniero:)' then 'ingenieria'
 when public.ticket_routing_key(subject) ~ '^(\[soporte quimico\]|soporte quimico:)' then 'quimica' end
$$;
create table public.ticket_staff_coverage (
 user_id uuid not null references public.profiles(id), territory text not null check(length(btrim(territory))>0),
 area text not null check(area in ('ingenieria','quimica')), updated_by uuid references public.profiles(id),
 updated_at timestamptz not null default clock_timestamp(), primary key(user_id,territory,area)
);
create table public.ticket_equipment_owners (
 serial text not null, area text not null check(area in ('ingenieria','quimica')),
 assigned_to uuid not null references public.profiles(id), updated_by uuid references public.profiles(id),
 updated_at timestamptz not null default clock_timestamp(), primary key(serial,area)
);
alter table public.ticket_staff_coverage enable row level security;
alter table public.ticket_equipment_owners enable row level security;
create policy "Admins manage ticket coverage" on public.ticket_staff_coverage for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "Admins manage equipment owners" on public.ticket_equipment_owners for all to authenticated using(public.is_admin()) with check(public.is_admin());
grant select,insert,update,delete on public.ticket_staff_coverage,public.ticket_equipment_owners to authenticated;
revoke all on public.ticket_staff_coverage,public.ticket_equipment_owners from anon;
alter table public.ticket_assignments add column source text not null default 'manual' check(source in ('manual','habitual','territorio'));

create function public.ticket_receiver_eligible(person uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles p join public.user_module_permissions m on m.user_id=p.id
 where p.id=person and p.rol in ('admin','tecnico') and m.can_receive_tickets and 'tickets'=any(m.modules))
$$;
revoke all on function public.ticket_receiver_eligible(uuid) from public,anon;
grant execute on function public.ticket_receiver_eligible(uuid) to authenticated;

create function public.route_support_ticket(p_ticket_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare t public.tickets%rowtype; area_key text; territory_key text; serial_key text; person uuid; origin text; equipment_count integer;
begin
 select * into t from public.tickets where id=p_ticket_id for update;
 if not found or t.estado='cerrado' or exists(select 1 from public.ticket_assignments where ticket_id=t.id) then return false; end if;
 area_key:=public.ticket_support_area(t.asunto); serial_key:=public.normalize_equipment_serial(t.numero_serie_equipo);
 if area_key is null or serial_key is null then return false; end if;
 select count(*),min(public.ticket_routing_key(estado)) into equipment_count,territory_key from public.equipos where public.normalize_equipment_serial(numero_serie)=serial_key and fecha_fin is null;
 if equipment_count<>1 then return false; end if;
 select assigned_to into person from public.ticket_equipment_owners where public.normalize_equipment_serial(serial)=serial_key and area=area_key and public.ticket_receiver_eligible(assigned_to);
 origin:='habitual';
 if person is null then
   select c.user_id into person from public.ticket_staff_coverage c
   where public.ticket_routing_key(c.territory)=territory_key and territory_key<>'' and c.area=area_key and public.ticket_receiver_eligible(c.user_id)
   order by random() limit 1;
   origin:='territorio';
 end if;
 if person is null then return false; end if;
 insert into public.ticket_assignments(ticket_id,assigned_to,source) values(t.id,person,origin);
 insert into public.ticket_bitacora(ticket_id,numero_serie_equipo,tipo,detalle,visible_cliente,creado_por)
 select t.id,t.numero_serie_equipo,'nota','Asignación automática ('||origin||'): '||coalesce(p.nombre_completo,p.id::text)||'. Área: '||area_key||'. Estado: '||territory_key||'.',false,person from public.profiles p where p.id=person;
 return true;
end; $$;
-- Internal routing cannot be invoked by staff to reroll assignments.
revoke all on function public.route_support_ticket(uuid) from public,anon,authenticated;
create function public.route_new_support_ticket() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.route_support_ticket(new.id); return new; end; $$;
revoke all on function public.route_new_support_ticket() from public,anon,authenticated;
create trigger route_new_support_ticket after insert on public.tickets for each row execute function public.route_new_support_ticket();
create function public.route_pending_support_tickets() returns integer language plpgsql security definer set search_path=public as $$
declare t record; routed integer:=0;
begin
 if not public.is_admin() then raise exception 'Solo administradores pueden distribuir pendientes'; end if;
 for t in select id from public.tickets where estado<>'cerrado' and not exists(select 1 from public.ticket_assignments a where a.ticket_id=tickets.id) order by creado_en,id loop
 if public.route_support_ticket(t.id) then routed:=routed+1; end if;
 end loop;
 return routed;
end; $$;
revoke all on function public.route_pending_support_tickets() from public,anon;
grant execute on function public.route_pending_support_tickets() to authenticated;

create or replace function public.register_ticket_service_event(p_ticket_id uuid, p_kind text, p_detail text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tickets%rowtype; v_end timestamptz;
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Acceso restringido a personal de servicio'; end if;
 if p_kind not in ('respuesta','cierre','justificacion') or p_kind is null then raise exception 'Movimiento inválido'; end if;
 if char_length(btrim(coalesce(p_detail,''))) not between 2 and 3900 then raise exception 'Escribe un detalle de 2 a 3900 caracteres'; end if;
 select * into t from public.tickets where id = p_ticket_id for update;
 if not found then raise exception 'Ticket no encontrado'; end if;
 if not public.can_work_ticket(t.id) then raise exception 'El ticket no está asignado a tu usuario'; end if;
 if p_kind in ('respuesta','cierre') and t.estado = 'cerrado' then raise exception 'El ticket ya está cerrado'; end if;
 if p_kind = 'justificacion' then
   if not public.can_approve_ticket_delay() then raise exception 'Solo administración o gerencia autorizada puede aprobar'; end if;
   select occurred_at into v_end from public.ticket_service_events where ticket_id = t.id and kind = 'cierre';
   if t.estado = 'cerrado' and v_end is null then raise exception 'Cierre histórico sin fecha verificable'; end if;
   if coalesce(v_end, clock_timestamp()) <= t.creado_en + interval '48 hours' then raise exception 'El ticket no excedió 48 horas'; end if;
 end if;
 insert into public.ticket_service_events(ticket_id,kind,detail,actor_id,closure_reason)
 values(t.id,p_kind,btrim(p_detail),auth.uid(),case when p_kind = 'cierre' then 'solucionado' else null end);
 insert into public.ticket_bitacora(ticket_id,numero_serie_equipo,tipo,detalle,estado_resultante,visible_cliente,creado_por)
 values(t.id,t.numero_serie_equipo,'nota',
 case p_kind when 'respuesta' then 'Respuesta al cliente: ' when 'cierre' then 'Cierre de caso: ' else 'Demora aprobada: ' end || btrim(p_detail),
 case when p_kind = 'cierre' then 'cerrado'::public.ticket_status else null end,false,auth.uid());
end; $$;
revoke all on function public.register_ticket_service_event(uuid,text,text) from public;
grant execute on function public.register_ticket_service_event(uuid,text,text) to authenticated;


-- One transaction for classification, closure, server time and audit trail.
create or replace function public.register_ticket_closure(p_ticket_id uuid, p_reason text, p_detail text)
returns void language plpgsql security definer set search_path = public as $$
begin
 if p_reason is null or p_reason not in ('solucionado','visita_programada','sin_respuesta','administrativo') then
   raise exception 'Selecciona un motivo de cierre válido';
 end if;
 perform public.register_ticket_service_event(p_ticket_id,'cierre',p_detail);
 update public.ticket_service_events set closure_reason = p_reason where ticket_id = p_ticket_id and kind = 'cierre';
end; $$;
revoke all on function public.register_ticket_closure(uuid,text,text) from public;
grant execute on function public.register_ticket_closure(uuid,text,text) to authenticated;

create or replace function public.review_ticket_closure(p_ticket_id uuid, p_detail text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tickets%rowtype;
begin
 if auth.uid() is null or not public.can_approve_ticket_delay() then raise exception 'Solo administración o gerencia autorizada puede revisar cierres'; end if;
 if char_length(btrim(coalesce(p_detail,''))) not between 2 and 3900 then raise exception 'Escribe una observación de revisión de 2 a 3900 caracteres'; end if;
 select * into t from public.tickets where id = p_ticket_id for update;
 if not found then raise exception 'Ticket no encontrado'; end if;
 if not public.can_work_ticket(t.id) then raise exception 'El ticket no está asignado a tu usuario'; end if;
 if t.estado <> 'cerrado' then raise exception 'El ticket debe estar cerrado para su revisión'; end if;
 insert into public.ticket_service_events(ticket_id,kind,detail,actor_id)
 values(t.id,'revision_cierre',btrim(p_detail),auth.uid());
 insert into public.ticket_bitacora(ticket_id,numero_serie_equipo,tipo,detalle,visible_cliente,creado_por)
 values(t.id,t.numero_serie_equipo,'nota','Revisión de cierre: ' || btrim(p_detail),false,auth.uid());
end; $$;
revoke all on function public.review_ticket_closure(uuid,text) from public;
grant execute on function public.review_ticket_closure(uuid,text) to authenticated;

-- Unified capture: one note produces one log entry and the required metric.
create or replace function public.register_ticket_movement(
 p_ticket_id uuid, p_action text, p_detail text,
 p_state text default null, p_visible boolean default false, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare t public.tickets%rowtype;
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Acceso restringido a personal de servicio'; end if;
 if char_length(btrim(coalesce(p_detail,''))) not between 2 and 3900 then raise exception 'Escribe un detalle de 2 a 3900 caracteres'; end if;
 if p_action is null or p_action not in ('avance','diagnostico','llamada','visita','pieza','escalamiento','nota','respuesta','cierre','justificacion','revision_cierre') then
   raise exception 'Selecciona un movimiento válido';
 end if;
 select * into t from public.tickets where id = p_ticket_id for update;
 if not found then raise exception 'Ticket no encontrado'; end if;
 if not public.can_work_ticket(t.id) then raise exception 'El ticket no está asignado a tu usuario'; end if;
 if p_action = 'cierre' then
   perform public.register_ticket_closure(t.id,p_reason,p_detail);
 elsif p_action = 'justificacion' then
   perform public.register_ticket_service_event(t.id,'justificacion',p_detail);
 elsif p_action = 'revision_cierre' then
   perform public.review_ticket_closure(t.id,p_detail);
 else
   if t.estado = 'cerrado' then raise exception 'El ticket ya está cerrado'; end if;
   if p_state is not null and p_state not in ('abierto','en_progreso','pendiente_piezas','en_observacion') then
     raise exception 'Estado de seguimiento inválido';
   end if;
   if p_action = 'respuesta' and not exists (
     select 1 from public.ticket_service_events where ticket_id = t.id and kind = 'respuesta'
   ) then
     perform public.register_ticket_service_event(t.id,'respuesta',p_detail);
   else
     insert into public.ticket_bitacora(ticket_id,numero_serie_equipo,tipo,detalle,estado_resultante,visible_cliente,creado_por)
     values(t.id,t.numero_serie_equipo,
       case when p_action = 'respuesta' then 'llamada' else p_action end,
       case when p_action = 'respuesta' then 'Seguimiento de respuesta al cliente: ' else '' end || btrim(p_detail),
       case when p_action = 'respuesta' then null else p_state::public.ticket_status end,
       case when p_action in ('respuesta','nota') then false else coalesce(p_visible,false) end,auth.uid());
   end if;
 end if;
end; $$;
revoke all on function public.register_ticket_movement(uuid,text,text,text,boolean,text) from public;
grant execute on function public.register_ticket_movement(uuid,text,text,text,boolean,text) to authenticated;

create or replace function public.assign_support_ticket(p_ticket_id uuid, p_assigned_to uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tickets%rowtype; old_assignee uuid; assignee_name text;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Solo administradores pueden asignar tickets'; end if;
 select * into t from public.tickets where id = p_ticket_id for update;
 if not found then raise exception 'Ticket no encontrado'; end if;
 if t.estado = 'cerrado' then raise exception 'No se puede reasignar un ticket cerrado'; end if;
 if p_assigned_to is not null then
   if not public.ticket_receiver_eligible(p_assigned_to) then raise exception 'El responsable debe tener habilitada la recepción de tickets'; end if;
   select nombre_completo into assignee_name from public.profiles where id = p_assigned_to and rol in ('admin','tecnico');
   if not found then raise exception 'Selecciona personal de servicio válido'; end if;
 end if;
 select assigned_to into old_assignee from public.ticket_assignments where ticket_id = t.id;
 if old_assignee is not distinct from p_assigned_to and exists(select 1 from public.ticket_assignments where ticket_id=t.id) then return; end if;
 insert into public.ticket_assignments(ticket_id,assigned_to,assigned_by,assigned_at)
 values(t.id,p_assigned_to,auth.uid(),clock_timestamp())
 on conflict(ticket_id) do update set assigned_to=excluded.assigned_to,assigned_by=excluded.assigned_by,assigned_at=excluded.assigned_at,source='manual';
 insert into public.ticket_bitacora(ticket_id,numero_serie_equipo,tipo,detalle,visible_cliente,creado_por)
 values(t.id,t.numero_serie_equipo,'nota',case when p_assigned_to is null then 'Asignación retirada. Caso pendiente de asignar.' else 'Caso asignado a ' || coalesce(assignee_name,p_assigned_to::text) || '.' end,false,auth.uid());
end; $$;
revoke all on function public.assign_support_ticket(uuid,uuid) from public,anon;
grant execute on function public.assign_support_ticket(uuid,uuid) to authenticated;


-- Canonical keys prevent duplicate rules; every configuration edit is attributed.
create function public.validate_ticket_routing_rule() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Solo administradores pueden configurar asignaciones'; end if;
 if tg_table_name='ticket_staff_coverage' then
   new.territory:=public.ticket_routing_key(new.territory);
   if not public.ticket_receiver_eligible(new.user_id) then raise exception 'Habilita la recepción de tickets para esta persona'; end if;
 else
   new.serial:=public.normalize_equipment_serial(new.serial);
   if new.serial is null or not exists(select 1 from public.equipos where public.normalize_equipment_serial(numero_serie)=new.serial and fecha_fin is null) then raise exception 'Selecciona la serie de un equipo activo'; end if;
   if not public.ticket_receiver_eligible(new.assigned_to) then raise exception 'Habilita la recepción de tickets para esta persona'; end if;
 end if;
 new.updated_by:=auth.uid(); new.updated_at:=clock_timestamp(); return new;
end; $$;
revoke all on function public.validate_ticket_routing_rule() from public,anon,authenticated;
create trigger validate_ticket_coverage before insert or update on public.ticket_staff_coverage for each row execute function public.validate_ticket_routing_rule();
create trigger validate_ticket_owner before insert or update on public.ticket_equipment_owners for each row execute function public.validate_ticket_routing_rule();
