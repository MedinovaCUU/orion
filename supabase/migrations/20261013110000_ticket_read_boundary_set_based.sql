-- Ticket read boundaries: the same rule as can_view_ticket() (20261009010000), evaluated once per
-- query instead of once per row. can_view_ticket(id) is a SECURITY DEFINER function that re-reads the
-- ticket and calls is_admin()/is_staff() for every row (~0.25 ms each): reading 3,000 tickets as a
-- technician took ~0.8 s, and service events (5,700 rows) more. Here the per-person facts become
-- per-statement initPlans, tickets use their own columns, and tables keyed by ticket_id test
-- membership in one hashed set of visible ids.
-- Write boundaries (tickets UPDATE, bitácora INSERT) keep can_work_ticket(): they touch single rows,
-- and their WITH CHECK must keep judging the stored ticket exactly as before.

-- Tickets explicitly assigned to the signed-in person, read past the assignments RLS like can_view_ticket.
create or replace function public.my_assigned_ticket_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
 select a.ticket_id from public.ticket_assignments a where a.assigned_to = (select auth.uid())
$$;

-- Every existing ticket can_view_ticket() accepts for the signed-in person, as one set.
create or replace function public.viewable_ticket_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
 select t.id from public.tickets t
 where (select auth.uid()) is not null and (
   (select public.is_admin()) or t.user_id = (select auth.uid())
   or ((select public.is_staff()) and (public.ticket_is_planning(t.descripcion)
       or t.id in (select public.my_assigned_ticket_ids()))))
$$;

revoke all on function public.my_assigned_ticket_ids(), public.viewable_ticket_ids() from public, anon;
grant execute on function public.my_assigned_ticket_ids(), public.viewable_ticket_ids() to authenticated;

-- can_view_ticket(id) on the row itself: administrators; the registering user; staff on every
-- planning (shared board) and on explicit assignments.
drop policy if exists "Ticket assignment boundary" on public.tickets;
create policy "Ticket assignment boundary" on public.tickets as restrictive for select to authenticated
using ((select auth.uid()) is not null and (
  (select public.is_admin()) or user_id = (select auth.uid())
  or ((select public.is_staff()) and (public.ticket_is_planning(descripcion)
      or id in (select public.my_assigned_ticket_ids())))));

-- can_view_ticket(ticket_id) for child rows. Administrators keep every row, even one whose ticket no
-- longer exists, exactly as can_view_ticket() answered for them.
drop policy if exists "Ticket history assignment boundary" on public.ticket_bitacora;
create policy "Ticket history assignment boundary" on public.ticket_bitacora as restrictive for select to authenticated
using (((select public.is_staff()) and ((select public.is_admin()) or ticket_id in (select public.viewable_ticket_ids())))
  or (not (select public.is_staff()) and visible_cliente and exists(
    select 1 from public.tickets t where t.id = ticket_bitacora.ticket_id and t.user_id = (select auth.uid()))));

drop policy if exists "Ticket metrics assignment boundary" on public.ticket_service_events;
create policy "Ticket metrics assignment boundary" on public.ticket_service_events as restrictive for select to authenticated
using ((select public.is_admin()) or ticket_id in (select public.viewable_ticket_ids()));

drop policy if exists "Linked service history assignment boundary" on public.servicios_historial;
create policy "Linked service history assignment boundary" on public.servicios_historial as restrictive for select to authenticated
using (ticket_id is null or (select public.is_admin()) or ticket_id in (select public.viewable_ticket_ids()));

drop policy if exists "Linked services assignment boundary" on public.servicios;
create policy "Linked services assignment boundary" on public.servicios as restrictive for select to authenticated
using ((select public.is_admin()) or ticket_id in (select public.viewable_ticket_ids()));

drop policy if exists "Ticket service links follow ticket visibility" on public.ticket_service_links;
create policy "Ticket service links follow ticket visibility" on public.ticket_service_links for select to authenticated
using ((select public.is_admin()) or ticket_id in (select public.viewable_ticket_ids()));
