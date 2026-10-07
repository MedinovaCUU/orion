-- A creation receipt discloses only the case number and assigned display name.
-- Creators may see this receipt without gaining access to another assignee's case.
create or replace function public.get_ticket_creation_receipt(p_ticket_id uuid)
returns table(numero_caso text, responsable text)
language sql stable security definer set search_path=public as $$
 select t.numero_caso::text, nullif(btrim(p.nombre_completo),'')
 from public.tickets t
 left join public.ticket_assignments a on a.ticket_id=t.id
 left join public.profiles p on p.id=a.assigned_to
 where t.id=p_ticket_id and auth.uid() is not null
   and (t.user_id=auth.uid() or public.can_work_ticket(t.id));
$$;
revoke all on function public.get_ticket_creation_receipt(uuid) from public,anon;
grant execute on function public.get_ticket_creation_receipt(uuid) to authenticated;
