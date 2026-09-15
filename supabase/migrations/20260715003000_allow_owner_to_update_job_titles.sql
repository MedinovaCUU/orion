create or replace function public.update_user_job_title(target_user_id uuid, new_job_title text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_user_permissions() then
    raise exception 'No autorizado para actualizar puestos';
  end if;

  update public.profiles
  set puesto = nullif(trim(new_job_title), '')
  where id = target_user_id;

  if not found then
    raise exception 'Perfil no encontrado';
  end if;
end;
$$;

revoke all on function public.update_user_job_title(uuid, text) from public;
grant execute on function public.update_user_job_title(uuid, text) to authenticated;
