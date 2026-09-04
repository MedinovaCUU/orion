create or replace function public.update_user_access_role(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_user_permissions() then
    raise exception 'No autorizado para actualizar roles';
  end if;

  if new_role not in ('cliente', 'tecnico', 'admin') then
    raise exception 'Rol de acceso no válido';
  end if;

  update public.profiles
  set rol = new_role::public.user_role
  where id = target_user_id;

  if not found then
    raise exception 'Perfil no encontrado';
  end if;
end;
$$;

revoke all on function public.update_user_access_role(uuid, text) from public;
grant execute on function public.update_user_access_role(uuid, text) to authenticated;

update public.user_module_permissions as permissions
set
  modules = case profiles.rol
    when 'tecnico' then array['tickets', 'asesoria', 'tutoriales', 'equipos']::text[]
    when 'admin' then array['tickets', 'servicios', 'asesoria', 'tutoriales', 'equipos']::text[]
    else array['tickets', 'tutoriales']::text[]
  end,
  sub_permissions = case profiles.rol
    when 'tecnico' then '{"tickets":["crear","seguimiento","diagnostico"],"asesoria":["crear","bandeja","metricas"],"tutoriales":["basico","medio","alto"]}'::jsonb
    when 'admin' then '{"tickets":["crear","seguimiento","diagnostico"],"servicios":["planeacion","viajes","reportes"],"asesoria":["crear","bandeja","metricas"],"tutoriales":["basico","medio","alto","critico"]}'::jsonb
    else '{"tickets":["crear"],"tutoriales":["basico"]}'::jsonb
  end,
  can_receive_tickets = profiles.rol in ('tecnico', 'admin'),
  can_view_restricted_tutorials = profiles.rol in ('tecnico', 'admin'),
  updated_at = now()
from public.profiles as profiles
where permissions.user_id = profiles.id
  and permissions.modules = array['tickets', 'tutoriales']::text[]
  and permissions.sub_permissions = '{}'::jsonb
  and permissions.can_receive_tickets = false
  and permissions.can_view_restricted_tutorials = false;
