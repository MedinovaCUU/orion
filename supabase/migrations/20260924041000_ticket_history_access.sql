-- Linked service records must not disclose another assignee's ticket history.
create policy "Linked service history assignment boundary" on public.servicios_historial as restrictive for select to authenticated
using(ticket_id is null or public.can_work_ticket(ticket_id) or (not public.is_staff() and exists(select 1 from public.tickets t where t.id=ticket_id and t.user_id=auth.uid())));
create policy "Linked services assignment boundary" on public.servicios as restrictive for select to authenticated
using(public.can_work_ticket(ticket_id) or (not public.is_staff() and exists(select 1 from public.tickets t where t.id=ticket_id and t.user_id=auth.uid())));
