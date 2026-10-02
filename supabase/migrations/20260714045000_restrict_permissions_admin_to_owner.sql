create or replace function public.can_manage_user_permissions()
returns boolean language sql stable security definer set search_path = public
as $$
  select auth.uid() = '2a87dde5-76ef-4365-8690-870efc7d9d82'::uuid;
$$;

drop policy if exists "Users read own module permissions" on public.user_module_permissions;
create policy "Users read own module permissions" on public.user_module_permissions for select
using (user_id = auth.uid() or public.can_manage_user_permissions());

drop policy if exists "Admins manage module permissions" on public.user_module_permissions;
create policy "Owner manages module permissions" on public.user_module_permissions for all
using (public.can_manage_user_permissions()) with check (public.can_manage_user_permissions());
