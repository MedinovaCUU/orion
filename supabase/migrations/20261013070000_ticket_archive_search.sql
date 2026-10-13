-- Ticket archive: the Tickets inbox only downloads its working set (open cases and those opened,
-- updated or closed in the last 30 days). Older cases are found with search_ticket_archive, one page
-- at a time, instead of downloading the whole history (3,000+ rows) on every 30-second refresh.

-- Cases tied to the signed-in person, evaluated as one set. The tickets RLS policy calls
-- can_view_ticket() once per row (~0.25 ms each: ~0.8 s over 3,000 cases for a technician); this
-- is the same boundary the inbox applies (ticketVisibility.ts, can_work_ticket): administrators see
-- everything; everyone else their own cases, explicit assignments and planning that names them.
-- Internal: only the security-definer functions below call it.
create or replace function public.ticket_personal_scope() returns table(ticket_id uuid)
language sql stable security definer set search_path = public as $$
 with me as (
   select auth.uid() as uid, public.is_admin() as admin, public.is_staff() as staff,
          (select p.nombre_completo from public.profiles p where p.id = auth.uid()) as name
 )
 select t.id from public.tickets t, me
 where me.uid is not null and (me.admin or t.user_id = me.uid or (me.staff and (
   exists(select 1 from public.ticket_assignments a where a.ticket_id = t.id and a.assigned_to = me.uid)
   or (public.ticket_is_planning(t.descripcion) and public.ticket_names_person(t.descripcion, me.name)))))
$$;

-- Inbox working set. p_since null returns the person's whole history (administrators' control center).
create or replace function public.get_ticket_inbox(p_since timestamptz default null)
returns setof public.tickets
language sql stable security definer set search_path = public as $$
 select t.* from public.tickets t
 join public.ticket_personal_scope() s on s.ticket_id = t.id
 where p_since is null or t.estado::text <> 'cerrado' or t.creado_en >= p_since or t.actualizado_en >= p_since
    or exists(select 1 from public.ticket_service_events e where e.ticket_id = t.id and e.kind = 'cierre' and e.occurred_at >= p_since)
$$;

-- Accent-insensitive regex for one search term: "garcia" also finds "García".
-- translate() over every row costs ~10x more than a case-insensitive regex, so only the term is normalized.
create or replace function public.ticket_search_pattern(p_term text) returns text
language sql immutable set search_path = public as $$
 select replace(replace(replace(replace(replace(replace(
   regexp_replace(lower(translate(p_term, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '([.\\+*?\[\]^$(){}=!<>|:#-])', '\\\1', 'g'),
   'a', '[aá]'), 'e', '[eé]'), 'i', '[ií]'), 'o', '[oó]'), 'u', '[uúü]'), 'n', '[nñ]')
$$;

-- p_query: words that must all appear (folio, serie, asunto, cliente, teléfono, correo, descripción,
--          responsable asignado or the client registered for the serial). Up to 120 characters.
-- p_status: 'abiertos' | 'cerrados' | 'todos'.  p_scope: 'soporte' | 'planeacion' | 'todos'.
-- p_from / p_to: opening day (Chihuahua time), inclusive.  p_serial: exact serial (recurrences).
-- An exact folio match is listed first; then the newest cases. total_count ignores the page.
create or replace function public.search_ticket_archive(
  p_query text default null,
  p_status text default 'todos',
  p_scope text default 'todos',
  p_from date default null,
  p_to date default null,
  p_serial text default null,
  p_limit integer default 20,
  p_offset integer default 0
) returns table(ticket jsonb, total_count bigint)
language sql stable security definer set search_path = public as $$
 with params as (
   select
     coalesce((select array_agg(public.ticket_search_pattern(term))
               from regexp_split_to_table(btrim(left(coalesce(p_query, ''), 120)), '\s+') term
               where term <> ''), '{}'::text[]) as patterns,
     upper(btrim(coalesce(p_query, ''))) as exact,
     public.normalize_equipment_serial(p_serial) as serial
 ),
 serial_clients as (
   select public.normalize_equipment_serial(e.numero_serie) as serial, string_agg(distinct c.razon_social, ' ') as clients
   from public.equipos e join public.clientes c on c.id = e.cliente_id
   where (select cardinality(patterns) > 0 from params)
   group by 1
 ),
 assignees as (
   select a.ticket_id, string_agg(p.nombre_completo, ' ') as names
   from public.ticket_assignments a join public.profiles p on p.id = a.assigned_to
   where (select cardinality(patterns) > 0 from params)
   group by 1
 )
 select to_jsonb(t) as ticket, count(*) over () as total_count
 from public.tickets t
 join public.ticket_personal_scope() s on s.ticket_id = t.id
 cross join params p
 left join serial_clients sc on sc.serial = public.normalize_equipment_serial(t.numero_serie_equipo)
 left join assignees an on an.ticket_id = t.id
 where case coalesce(p_status, 'todos')
         when 'abiertos' then t.estado::text <> 'cerrado'
         when 'cerrados' then t.estado::text = 'cerrado'
         else true end
   and case coalesce(p_scope, 'todos')
         when 'soporte' then not public.ticket_is_planning(t.descripcion)
         when 'planeacion' then public.ticket_is_planning(t.descripcion)
         else true end
   and (p_from is null or timezone('America/Chihuahua', t.creado_en)::date >= p_from)
   and (p_to is null or timezone('America/Chihuahua', t.creado_en)::date <= p_to)
   and (p.serial is null or public.normalize_equipment_serial(t.numero_serie_equipo) = p.serial)
   and not exists (
     select 1 from unnest(p.patterns) pattern
     where not concat_ws(' ', t.numero_caso, left(t.id::text, 6), t.asunto, t.numero_serie_equipo,
       t.nombre_cliente_guest, t.telefono_cliente_guest, regexp_replace(coalesce(t.telefono_cliente_guest, ''), '\D', '', 'g'),
       t.email_cliente_guest, t.descripcion, sc.clients, an.names) ~* pattern)
 order by (upper(t.numero_caso) = p.exact) desc, t.creado_en desc, t.id
 limit least(greatest(coalesce(p_limit, 20), 1), 100)
 offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function public.ticket_personal_scope() from public, anon, authenticated;
revoke all on function public.get_ticket_inbox(timestamptz) from public, anon;
grant execute on function public.get_ticket_inbox(timestamptz) to authenticated;
revoke all on function public.ticket_search_pattern(text) from public, anon;
grant execute on function public.ticket_search_pattern(text) to authenticated;
revoke all on function public.search_ticket_archive(text, text, text, date, date, text, integer, integer) from public, anon;
grant execute on function public.search_ticket_archive(text, text, text, date, date, text, integer, integer) to authenticated;
