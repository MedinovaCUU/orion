-- Assignment suggestions for administrators (the Alexa skill's «¿A quién se lo asigno?» and anything else that runs
-- as the signed-in person). ticket_assignment_ranking stays private: it reads every profile, load and trip, so it is
-- exposed only through this check. Same columns, same order: one source of truth for the owner's rules.
create function public.get_ticket_assignment_suggestions(p_ticket_id uuid)
returns table(user_id uuid, full_name text, ranking integer, rule text, reason text,
 continuity text, busy_reason text, open_cases integer, last_closed_at timestamptz)
language plpgsql volatile security definer set search_path = public as $$
begin
 if auth.uid() is null or not public.is_admin() then
   raise exception 'Solo administradores pueden ver sugerencias de asignación';
 end if;
 return query select * from public.ticket_assignment_ranking(p_ticket_id) k order by k.ranking;
end; $$;
revoke all on function public.get_ticket_assignment_suggestions(uuid) from public, anon;
grant execute on function public.get_ticket_assignment_suggestions(uuid) to authenticated;

-- The owner named the government team by full name (2026-10-11): Benjamín Martínez and Luis Angel Pérez.
-- 20261011040000 seeded it with anyone called Benjamín or Ángel; keep exactly those two.
delete from public.ticket_government_team g
using public.profiles p
where p.id = g.user_id
  and not (string_to_array(public.ticket_person_key(p.nombre_completo), ' ') @> array['benjamin', 'martinez']
        or string_to_array(public.ticket_person_key(p.nombre_completo), ' ') @> array['luis', 'angel', 'perez']);
insert into public.ticket_government_team(user_id)
select p.id from public.profiles p
where p.rol in ('admin', 'tecnico')
  and (string_to_array(public.ticket_person_key(p.nombre_completo), ' ') @> array['benjamin', 'martinez']
    or string_to_array(public.ticket_person_key(p.nombre_completo), ' ') @> array['luis', 'angel', 'perez'])
on conflict do nothing;
