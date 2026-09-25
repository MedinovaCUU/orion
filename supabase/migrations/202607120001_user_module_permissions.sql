create table if not exists public.user_module_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  modules text[] not null default array['tickets', 'tutoriales']::text[],
  can_receive_tickets boolean not null default false,
  can_view_restricted_tutorials boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint user_module_permissions_valid_modules check (
    modules <@ array['tickets','servicios','asesoria','trazabilidad','refacciones','inventario','tutoriales','pno','equipos','monitoreo','dri','permisos']::text[]
  )
);

alter table public.user_module_permissions enable row level security;

create or replace function public.is_permissions_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and rol = 'admin');
$$;

drop policy if exists "Users read own module permissions" on public.user_module_permissions;
create policy "Users read own module permissions" on public.user_module_permissions for select
using (user_id = auth.uid() or public.is_permissions_admin());

drop policy if exists "Admins manage module permissions" on public.user_module_permissions;
create policy "Admins manage module permissions" on public.user_module_permissions for all
using (public.is_permissions_admin()) with check (public.is_permissions_admin());

create or replace function public.create_default_module_permissions()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.user_module_permissions(user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created_module_permissions on auth.users;
create trigger on_auth_user_created_module_permissions
after insert on auth.users for each row execute function public.create_default_module_permissions();

insert into public.user_module_permissions(user_id)
select id from auth.users on conflict (user_id) do nothing;

grant select on public.user_module_permissions to authenticated;
grant insert, update, delete on public.user_module_permissions to authenticated;
