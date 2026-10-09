-- Visibility follows association, not creation alone: an explicit assignment, the user's own
-- cases, or a planning that names the person. Planning stays readable for every staff member
-- because the weekly board is shared; the Tickets inbox narrows it per person in the frontend.
-- Idempotent on purpose: the 20260924040000 boundaries are recreated whether or not they still exist.

-- Production had row level security switched off on tickets, which silently bypassed every policy.
alter table public.tickets enable row level security;
alter table public.ticket_bitacora enable row level security;
alter table public.ticket_service_events enable row level security;
alter table public.servicios enable row level security;
alter table public.servicios_historial enable row level security;

-- With RLS on, administrators still need to register planning on behalf of an engineer
-- (user_id is the lead) and to delete planning rows when a week is re-imported.
drop policy if exists "Admins registran casos a nombre de otros" on public.tickets;
create policy "Admins registran casos a nombre de otros" on public.tickets for insert to authenticated with check (public.is_admin());
drop policy if exists "Admins eliminan casos" on public.tickets;
create policy "Admins eliminan casos" on public.tickets for delete to authenticated using (public.is_admin());

create or replace function public.ticket_is_planning(p_description text) returns boolean
language sql immutable as $$
 select position('[METADATA_PLANEACION]' in coalesce(p_description,'')) > 0
$$;

-- Accent-, case-, dot- and spacing-insensitive person key ("R. Vilchis" = "r vilchis").
create or replace function public.ticket_person_key(value text) returns text
language sql immutable as $$
 select nullif(btrim(regexp_replace(lower(translate(replace(coalesce(value,''),'.',' '),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')),'\s+',' ','g')),'')
$$;

-- People named by the planning metadata: ingeniero_csv ("A / B", "A, B", "A y B") and companions_csv (array or text).
create or replace function public.ticket_planning_people(p_description text) returns setof text
language sql immutable as $$
 with meta as (select public.try_parse_planning_metadata(p_description) as m)
 select btrim(person) from meta, lateral (
   select regexp_split_to_table(coalesce(m->>'ingeniero_csv',''), '\s*[/,;]\s*|\s+y\s+') as person
   union all
   select regexp_split_to_table(case when jsonb_typeof(m->'companions_csv')='string' then m->>'companions_csv' else '' end, '\s*[/,;]\s*|\s+y\s+')
   union all
   select entry from jsonb_array_elements_text(case when jsonb_typeof(m->'companions_csv')='array' then m->'companions_csv' else '[]'::jsonb end) entry
 ) people
 where btrim(person) <> ''
$$;

create or replace function public.ticket_names_person(p_description text, p_name text) returns boolean
language sql immutable as $$
 select public.ticket_person_key(p_name) is not null and exists (
   select 1 from public.ticket_planning_people(p_description) person
   where public.ticket_person_key(person) = public.ticket_person_key(p_name))
$$;

-- Working a case (movements, closures, updates): administrators, the assignee, the user who
-- registered it, or a staff member named by its planning.
create or replace function public.can_work_ticket(p_ticket_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (public.is_admin() or (public.is_staff() and exists(
   select 1 from public.tickets t
   where t.id = p_ticket_id and (
     t.user_id = auth.uid()
     or exists(select 1 from public.ticket_assignments a where a.ticket_id = t.id and a.assigned_to = auth.uid())
     or (public.ticket_is_planning(t.descripcion) and public.ticket_names_person(t.descripcion,
          (select p.nombre_completo from public.profiles p where p.id = auth.uid())))))))
$$;

-- Reading a case: everything a person can work, plus every planning for staff (shared board)
-- and a client's own cases.
create or replace function public.can_view_ticket(p_ticket_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (public.is_admin() or exists(
   select 1 from public.tickets t
   where t.id = p_ticket_id and (
     t.user_id = auth.uid()
     or (public.is_staff() and (public.ticket_is_planning(t.descripcion)
         or exists(select 1 from public.ticket_assignments a where a.ticket_id = t.id and a.assigned_to = auth.uid()))))))
$$;
revoke all on function public.can_view_ticket(uuid) from public,anon;
grant execute on function public.can_view_ticket(uuid) to authenticated;
revoke all on function public.ticket_planning_people(text), public.ticket_names_person(text,text), public.ticket_person_key(text), public.ticket_is_planning(text) from public,anon;
grant execute on function public.ticket_planning_people(text), public.ticket_names_person(text,text), public.ticket_person_key(text), public.ticket_is_planning(text) to authenticated;

drop policy if exists "Ticket assignment boundary" on public.tickets;
create policy "Ticket assignment boundary" on public.tickets as restrictive for select to authenticated
using (public.can_view_ticket(id));
drop policy if exists "Ticket update assignment boundary" on public.tickets;
create policy "Ticket update assignment boundary" on public.tickets as restrictive for update to authenticated
using (public.can_work_ticket(id)) with check (public.can_work_ticket(id));
drop policy if exists "Ticket delete admin boundary" on public.tickets;
create policy "Ticket delete admin boundary" on public.tickets as restrictive for delete to authenticated using (public.is_admin());

-- Clients keep seeing only the entries marked visible on their own cases.
drop policy if exists "Ticket history assignment boundary" on public.ticket_bitacora;
create policy "Ticket history assignment boundary" on public.ticket_bitacora as restrictive for select to authenticated
using ((public.is_staff() and public.can_view_ticket(ticket_id))
  or (not public.is_staff() and visible_cliente and exists(select 1 from public.tickets t where t.id=ticket_id and t.user_id=auth.uid())));
drop policy if exists "Ticket history write boundary" on public.ticket_bitacora;
create policy "Ticket history write boundary" on public.ticket_bitacora as restrictive for insert to authenticated
with check (public.can_work_ticket(ticket_id) and creado_por=auth.uid());
drop policy if exists "Ticket metrics assignment boundary" on public.ticket_service_events;
create policy "Ticket metrics assignment boundary" on public.ticket_service_events as restrictive for select to authenticated
using (public.can_view_ticket(ticket_id));
drop policy if exists "Linked service history assignment boundary" on public.servicios_historial;
create policy "Linked service history assignment boundary" on public.servicios_historial as restrictive for select to authenticated
using (ticket_id is null or public.can_view_ticket(ticket_id));
drop policy if exists "Linked services assignment boundary" on public.servicios;
create policy "Linked services assignment boundary" on public.servicios as restrictive for select to authenticated
using (public.can_view_ticket(ticket_id));
