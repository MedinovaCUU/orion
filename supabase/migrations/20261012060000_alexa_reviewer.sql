-- Amazon's certification reviewer for the Orion Alexa skill.
-- Amazon tests the skill with an account we give them. That account must never read Biosystems data:
--   · it is an ordinary 'cliente' profile listed in alexa_reviewers (staff can never be demoted by this list);
--   · a RESTRICTIVE policy on every public table with RLS hides all rows from it (its own profile excepted), so the
--     Orion web and the REST API show it nothing even though it can sign in;
--   · it may claim an Alexa link code, and the Alexa function answers it with fictitious demo data only.
-- The account itself (auth user + password) is created by the owner in Supabase Auth; this only names its e-mail.

create table if not exists public.alexa_reviewers (
  email text primary key check (email = lower(btrim(email))),
  note text,
  created_at timestamptz not null default now()
);
alter table public.alexa_reviewers enable row level security;
revoke all on public.alexa_reviewers from anon, authenticated;

insert into public.alexa_reviewers(email, note)
values ('revision.alexa@biosystems.com.mx', 'Revisor de certificación de Amazon para la skill Orion')
on conflict (email) do nothing;

-- Listed e-mail AND not staff: a real engineer, chemist or admin is never treated as a reviewer.
create or replace function public.is_alexa_reviewer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from auth.users u
    join public.alexa_reviewers r on r.email = lower(u.email)
    where u.id = (select auth.uid())
      and not exists (select 1 from public.profiles p where p.id = u.id and p.rol in ('admin', 'tecnico'))
  );
$$;
revoke all on function public.is_alexa_reviewer() from public, anon;
grant execute on function public.is_alexa_reviewer() to authenticated;

-- No business rows for the reviewer. Restrictive policies AND with the existing permissive ones, so nobody else
-- changes: for everyone who is not a reviewer the expression is true. `(select …)` runs once per query.
-- alexa_* tables keep their own per-user policies (the reviewer's link, drafts and alerts live there).
-- A table owned by another role (none expected) cannot take a policy from this migration: it is named in a NOTICE.
do $$
declare r record;
begin
  for r in
    select c.relname, pg_has_role(current_user, c.relowner, 'MEMBER') as owned
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
      and c.relname not like 'alexa\_%' and c.relname <> 'profiles'
  loop
    if not r.owned then
      raise notice 'alexa_reviewer_sin_datos: sin permiso para public.%, aplicar como su dueño', r.relname;
      continue;
    end if;
    execute format('drop policy if exists alexa_reviewer_sin_datos on public.%I', r.relname);
    execute format(
      'create policy alexa_reviewer_sin_datos on public.%I as restrictive for all to authenticated '
      'using (not (select public.is_alexa_reviewer())) with check (not (select public.is_alexa_reviewer()))',
      r.relname);
  end loop;
end $$;

drop policy if exists alexa_reviewer_solo_su_perfil on public.profiles;
create policy alexa_reviewer_solo_su_perfil on public.profiles as restrictive for all to authenticated
  using (id = (select auth.uid()) or not (select public.is_alexa_reviewer()))
  with check (id = (select auth.uid()) or not (select public.is_alexa_reviewer()));

-- Linking: staff as before, plus the reviewer.
create or replace function public.claim_alexa_code(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare v_alexa text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión en Orion' using errcode = '42501'; end if;
  if not (public.is_staff() or public.is_alexa_reviewer()) then
    raise exception 'Alexa está disponible para ingenieros, químicos y administradores de Orion' using errcode = '42501';
  end if;
  if (select count(*) from public.alexa_link_failures where user_id = auth.uid() and at > now() - interval '15 minutes') >= 8 then
    return 'bloqueado';
  end if;
  delete from public.alexa_link_codes where expires_at < now();
  select alexa_user_id into v_alexa from public.alexa_link_codes where code = btrim(coalesce(p_code, ''));
  if v_alexa is null then
    insert into public.alexa_link_failures(user_id) values (auth.uid());
    return 'invalido';
  end if;
  insert into public.alexa_links(alexa_user_id, user_id) values (v_alexa, auth.uid())
  on conflict (alexa_user_id) do update set user_id = excluded.user_id, linked_at = now(), last_digest = null;
  delete from public.alexa_link_codes where alexa_user_id = v_alexa;
  delete from public.alexa_link_failures where user_id = auth.uid();
  return 'ok';
end;
$$;
revoke all on function public.claim_alexa_code(text) from public, anon;
grant execute on function public.claim_alexa_code(text) to authenticated;
