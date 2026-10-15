-- Planning absences: who is out and when (TXT «tiempo por tiempo», vacations, permits, sick leave,
-- birthdays, other), per person and date range, so Planeación can show them on the calendar/table and
-- warn when someone absent has a service that day. Until now they only lived as notes in the owner's
-- Google sheet; rows imported from it carry source = 'sheet' and a stable sheet_key for upserts.
-- Optimistic concurrency like tickets.planning_version: «update … where id = $1 and version = $n
-- returning *» (0 rows = conflict, deleted or no permission). New table only; nothing existing changes.

create table if not exists public.planning_absences (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.profiles(id) on delete set null,
  person_name text not null check (length(btrim(person_name)) between 1 and 120),
  kind text not null check (kind in ('TXT', 'VAC', 'PERMISO', 'INCAPACIDAD', 'CUMPLEANOS', 'OTRO')),
  start_date date not null,
  end_date date not null,
  note text,
  source text not null default 'orion' check (source in ('orion', 'sheet')),
  sheet_key text unique,
  sheet_synced_at timestamptz,
  orion_edited_at timestamptz,
  version integer not null default 1,
  created_by uuid default auth.uid(),
  created_by_name text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (end_date - start_date <= 366)
);
create index if not exists planning_absences_dates_idx on public.planning_absences (start_date, end_date);
create index if not exists planning_absences_person_idx on public.planning_absences (person_id);

comment on table public.planning_absences is
  'Absences for Planeación (TXT, VAC, PERMISO, INCAPACIDAD, CUMPLEANOS, OTRO) per person and inclusive date range (at most 367 days). Staff read all; admins write all; technicians write only their own (person_id = auth.uid()).';
comment on column public.planning_absences.person_id is
  'Profile of the absent person; null when the name (person_name) does not match a profile or the profile was deleted. Only admins write rows without a person.';
comment on column public.planning_absences.sheet_key is
  'Stable key of the planning-sheet note the row came from (upsert with on conflict (sheet_key)); null when created in Orion.';
comment on column public.planning_absences.orion_edited_at is
  'Set by the client when a person edits the row in Orion (so a sheet sync can leave it alone).';
comment on column public.planning_absences.version is
  'Server-maintained row version: 1 on insert, +1 on every real change of any other column except updated_at; client values ignored. Update with "where version = <expected>"; 0 rows = conflict or no permission.';

-- Server-maintained fields. Insert: version 1, timestamps now, created_by = the JWT user (a JWT-less
-- service/SQL insert keeps what it sent). Update: created_by/created_at are immutable; version and
-- updated_at move only when something else really changed (old + 1 / now()), otherwise keep the old
-- values whatever the client sent.
create or replace function public.planning_absences_versioning() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_at := now();
    new.updated_at := now();
    new.created_by := coalesce(auth.uid(), new.created_by);
    return new;
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.version := old.version;
  new.updated_at := old.updated_at;
  if new is distinct from old then
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end $$;
revoke all on function public.planning_absences_versioning() from public, anon, authenticated;

drop trigger if exists planning_absences_versioning on public.planning_absences;
create trigger planning_absences_versioning before insert or update on public.planning_absences
  for each row execute function public.planning_absences_versioning();

-- Access: the whole team's availability is visible to staff; writes by admins, or by a technician on
-- their own absences only (WITH CHECK: an absence cannot be handed to someone else).
alter table public.planning_absences enable row level security;
drop policy if exists planning_absences_read on public.planning_absences;
create policy planning_absences_read on public.planning_absences for select to authenticated
using ((select public.is_staff()));
drop policy if exists planning_absences_insert on public.planning_absences;
create policy planning_absences_insert on public.planning_absences for insert to authenticated
with check ((select public.is_admin()) or ((select public.is_staff()) and person_id = (select auth.uid())));
drop policy if exists planning_absences_update on public.planning_absences;
create policy planning_absences_update on public.planning_absences for update to authenticated
using ((select public.is_admin()) or ((select public.is_staff()) and person_id = (select auth.uid())))
with check ((select public.is_admin()) or ((select public.is_staff()) and person_id = (select auth.uid())));
drop policy if exists planning_absences_delete on public.planning_absences;
create policy planning_absences_delete on public.planning_absences for delete to authenticated
using ((select public.is_admin()) or ((select public.is_staff()) and person_id = (select auth.uid())));
revoke all on public.planning_absences from public, anon, authenticated;
grant select, insert, update, delete on public.planning_absences to authenticated;

-- Live updates (Realtime applies the read policy per subscriber).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'planning_absences') then
    alter publication supabase_realtime add table public.planning_absences;
  end if;
end $$;
