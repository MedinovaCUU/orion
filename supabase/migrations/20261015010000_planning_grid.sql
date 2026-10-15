-- Planning grid: Planeación becomes an Excel-like editable grid over the planning rows of public.tickets
-- (asunto «[PLAN] TYPE - PLATFORM - LOCALITY», descripcion «Cliente/Localidad: …\nObservaciones: …\n\n
-- [METADATA_PLANEACION] {json}»). The database provides:
--   1. optimistic concurrency: tickets.planning_version, bumped by the server on every real change;
--   2. per-field change history: public.planning_changes, written only by a trigger, readable under the
--      ticket read boundary and published to Realtime for live updates;
--   3. custom columns: public.planning_custom_columns (definitions; values live in meta.custom_fields);
--   4. per-user grid settings and saved views.
-- Nothing here rewrites existing tickets: the new column is metadata-only (constant default).

-- 1) Optimistic concurrency ------------------------------------------------------------------------
alter table public.tickets add column if not exists planning_version integer not null default 1;
comment on column public.tickets.planning_version is
  'Server-maintained row version for the planning grid: +1 on every real change of asunto, descripcion, numero_serie_equipo, user_id or estado. Clients update with "where planning_version = <expected>"; 0 rows = conflict or no permission.';

-- Always old + 1 on a real change, whatever the client sent; unchanged otherwise. Touches nothing else
-- (actualizado_en keeps its current semantics). Named «tickets_…» so it fires after the other BEFORE
-- UPDATE triggers (ticket_capture_closure, ticket_reopen_link) and judges the final row.
create or replace function public.bump_planning_version() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.asunto, new.descripcion, new.numero_serie_equipo, new.user_id, new.estado)
     is distinct from (old.asunto, old.descripcion, old.numero_serie_equipo, old.user_id, old.estado) then
    new.planning_version := old.planning_version + 1;
  else
    new.planning_version := old.planning_version;
  end if;
  return new;
end $$;
revoke all on function public.bump_planning_version() from public, anon, authenticated;

drop trigger if exists tickets_planning_version on public.tickets;
create trigger tickets_planning_version before update on public.tickets
  for each row execute function public.bump_planning_version();

-- 2) Per-field change history ----------------------------------------------------------------------
-- No foreign key to tickets: the history of a deleted planning row survives (administrators read it).
create table if not exists public.planning_changes (
  id bigint generated always as identity primary key,
  ticket_id uuid not null,
  ticket_subject text,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  changed_by_name text,
  action text not null check (action in ('insert', 'update', 'delete')),
  field text,
  old_value text,
  new_value text,
  version integer
);
create index if not exists planning_changes_ticket_idx on public.planning_changes (ticket_id, changed_at desc);
create index if not exists planning_changes_recent_idx on public.planning_changes (changed_at desc);
comment on table public.planning_changes is
  'Planning grid audit: one row per insert/delete and one per changed field on update. Written only by log_planning_changes(); field keys: tipo, plataforma, localidad, observaciones, numero_serie, ingeniero, acompanantes, semana, fecha_programada, fecha_fin, dias, estados, prioridad, estado_ticket, custom:<key>.';

-- A metadata value as the text a person reads: strings with collapsed whitespace, arrays joined with
-- ', ', numbers/booleans as JSON text, objects as compact JSON; empty → null.
create or replace function public.planning_value_text(p_value jsonb) returns text
language sql immutable set search_path = public as $$
  select case jsonb_typeof(p_value)
    when 'string' then nullif(btrim(regexp_replace(p_value #>> '{}', '\s+', ' ', 'g')), '')
    when 'array' then (
      select string_agg(item, ', ' order by ord)
      from jsonb_array_elements(p_value) with ordinality as element(value, ord),
        lateral (select case jsonb_typeof(element.value)
                   when 'string' then nullif(btrim(regexp_replace(element.value #>> '{}', '\s+', ' ', 'g')), '')
                   when 'null' then null
                   else element.value::text end) as rendered(item)
      where item is not null)
    when 'object' then nullif(p_value::text, '{}')
    when 'number' then p_value::text
    when 'boolean' then p_value::text
    else null
  end
$$;

-- The grid's fields of one ticket version as {field: text|null}; custom_fields keys become «custom:<key>».
create or replace function public.planning_grid_values(p_asunto text, p_descripcion text, p_numero_serie text, p_estado text)
returns jsonb language sql immutable set search_path = public as $$
  with parsed as (
    select public.try_parse_planning_metadata(p_descripcion) as raw,
      split_part(coalesce(p_descripcion, ''), '[METADATA_PLANEACION]', 1) as body
  ), src as (
    select case when jsonb_typeof(raw) = 'object' then raw else '{}'::jsonb end as meta, body from parsed
  )
  select jsonb_build_object(
      'tipo', public.planning_value_text(meta -> 'service_type'),
      'plataforma', public.planning_value_text(to_jsonb(split_part(regexp_replace(coalesce(p_asunto, ''), '^\s*\[PLAN\]\s*', ''), ' - ', 2))),
      'localidad', public.planning_value_text(to_jsonb(substring(body from '(?n)^[ \t]*Cliente/Localidad:([^\n]*)'))),
      'observaciones', public.planning_value_text(to_jsonb(substring(body from '(?n)^[ \t]*Observaciones:([^\n]*)'))),
      'numero_serie', public.planning_value_text(to_jsonb(p_numero_serie)),
      'ingeniero', public.planning_value_text(meta -> 'ingeniero_csv'),
      'acompanantes', public.planning_value_text(meta -> 'companions_csv'),
      'semana', public.planning_value_text(meta -> 'fecha_tentativa'),
      'fecha_programada', public.planning_value_text(meta -> 'scheduled_date'),
      'fecha_fin', public.planning_value_text(meta -> 'scheduled_end_date'),
      'dias', public.planning_value_text(meta -> 'scheduled_day'),
      'estados', public.planning_value_text(meta -> 'status_values'),
      'prioridad', public.planning_value_text(meta -> 'priority_csv'),
      'estado_ticket', public.planning_value_text(to_jsonb(p_estado)))
    || coalesce((
      select jsonb_object_agg('custom:' || custom.key, public.planning_value_text(custom.value))
      from jsonb_each(case when jsonb_typeof(meta -> 'custom_fields') = 'object' then meta -> 'custom_fields' else '{}'::jsonb end) as custom
    ), '{}'::jsonb)
  from src
$$;
revoke all on function public.planning_value_text(jsonb), public.planning_grid_values(text, text, text, text) from public, anon, authenticated;

create or replace function public.log_planning_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'INSERT' then
    if not public.ticket_is_planning(new.descripcion) then return null; end if;
  elsif tg_op = 'DELETE' then
    if not public.ticket_is_planning(old.descripcion) then return null; end if;
  else
    if not (public.ticket_is_planning(new.descripcion) or public.ticket_is_planning(old.descripcion)) then return null; end if;
    -- Only these columns feed the grid's fields; anything else (prioridad, actualizado_en, …) logs nothing.
    if (new.asunto, new.descripcion, new.numero_serie_equipo, new.estado::text)
       is not distinct from (old.asunto, old.descripcion, old.numero_serie_equipo, old.estado::text) then
      return null;
    end if;
  end if;

  -- Who: the signed-in profile; without a JWT (service role, SQL, jobs) the editor the client recorded
  -- in the new metadata. A delete has no new metadata, so it stays anonymous there.
  if v_uid is not null then
    select p.nombre_completo into v_name from public.profiles p where p.id = v_uid;
  elsif tg_op <> 'DELETE' then
    v_name := public.planning_value_text(public.try_parse_planning_metadata(new.descripcion) -> 'updated_by_name');
  end if;

  if tg_op = 'INSERT' then
    insert into public.planning_changes (ticket_id, ticket_subject, changed_by, changed_by_name, action, version)
    values (new.id, new.asunto, v_uid, v_name, 'insert', new.planning_version);
  elsif tg_op = 'DELETE' then
    insert into public.planning_changes (ticket_id, ticket_subject, changed_by, changed_by_name, action, version)
    values (old.id, old.asunto, v_uid, v_name, 'delete', old.planning_version);
  else
    v_old := public.planning_grid_values(old.asunto, old.descripcion, old.numero_serie_equipo, old.estado::text);
    v_new := public.planning_grid_values(new.asunto, new.descripcion, new.numero_serie_equipo, new.estado::text);
    insert into public.planning_changes (ticket_id, ticket_subject, changed_by, changed_by_name, action, field, old_value, new_value, version)
    select new.id, new.asunto, v_uid, v_name, 'update', k.field, v_old ->> k.field, v_new ->> k.field, new.planning_version
    from (
      select fixed.field, fixed.ord
      from unnest(array['tipo', 'plataforma', 'localidad', 'observaciones', 'numero_serie', 'ingeniero', 'acompanantes',
                        'semana', 'fecha_programada', 'fecha_fin', 'dias', 'estados', 'prioridad', 'estado_ticket'])
        with ordinality as fixed(field, ord)
      union all
      select custom.field, 1000
      from (select jsonb_object_keys(v_old) union select jsonb_object_keys(v_new)) as custom(field)
      where custom.field like 'custom:%'
    ) as k
    where (v_old ->> k.field) is distinct from (v_new ->> k.field)
    order by k.ord, k.field;
  end if;
  return null;
end $$;
revoke all on function public.log_planning_changes() from public, anon, authenticated;

drop trigger if exists tickets_planning_changes_log on public.tickets;
create trigger tickets_planning_changes_log after insert or update or delete on public.tickets
  for each row execute function public.log_planning_changes();

-- Read under the ticket read boundary (20261013110000); administrators also keep deleted tickets' history.
-- No write policies or grants: only the trigger writes.
alter table public.planning_changes enable row level security;
drop policy if exists planning_changes_read on public.planning_changes;
create policy planning_changes_read on public.planning_changes for select to authenticated
using ((select public.is_admin()) or ticket_id in (select public.viewable_ticket_ids()));
revoke all on public.planning_changes from public, anon, authenticated;
grant select on public.planning_changes to authenticated;

-- Live updates: the grid subscribes to INSERTs here (Realtime applies the policy above per subscriber).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'planning_changes') then
    alter publication supabase_realtime add table public.planning_changes;
  end if;
end $$;

-- Shared updated_at maintenance for the grid's own tables.
create or replace function public.planning_touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.planning_touch_updated_at() from public, anon, authenticated;

-- 3) Custom columns --------------------------------------------------------------------------------
-- Definitions only: each ticket keeps its values in meta.custom_fields[key]. Columns are archived,
-- never deleted, and their key never changes (it is the link to the stored values).
create table if not exists public.planning_custom_columns (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null check (length(btrim(label)) between 1 and 60),
  data_type text not null check (data_type in ('text', 'number', 'date', 'boolean', 'select')),
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  width integer,
  position integer not null default 0,
  archived_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.guard_planning_custom_column() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.key is distinct from old.key then
    raise exception 'La clave de una columna no cambia: archívala y crea otra' using errcode = 'check_violation';
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end $$;
revoke all on function public.guard_planning_custom_column() from public, anon, authenticated;
drop trigger if exists planning_custom_columns_guard on public.planning_custom_columns;
create trigger planning_custom_columns_guard before update on public.planning_custom_columns
  for each row execute function public.guard_planning_custom_column();
drop trigger if exists planning_custom_columns_touch on public.planning_custom_columns;
create trigger planning_custom_columns_touch before update on public.planning_custom_columns
  for each row execute function public.planning_touch_updated_at();

alter table public.planning_custom_columns enable row level security;
drop policy if exists planning_custom_columns_read on public.planning_custom_columns;
create policy planning_custom_columns_read on public.planning_custom_columns for select to authenticated
using ((select public.is_staff()));
drop policy if exists planning_custom_columns_insert on public.planning_custom_columns;
create policy planning_custom_columns_insert on public.planning_custom_columns for insert to authenticated
with check ((select public.is_admin()));
drop policy if exists planning_custom_columns_update on public.planning_custom_columns;
create policy planning_custom_columns_update on public.planning_custom_columns for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.planning_custom_columns from public, anon, authenticated;
grant select, insert, update on public.planning_custom_columns to authenticated;

-- 4) Per-user grid settings ------------------------------------------------------------------------
create table if not exists public.planning_user_settings (
  user_id uuid primary key default auth.uid(),
  grid jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
drop trigger if exists planning_user_settings_touch on public.planning_user_settings;
create trigger planning_user_settings_touch before update on public.planning_user_settings
  for each row execute function public.planning_touch_updated_at();

alter table public.planning_user_settings enable row level security;
drop policy if exists planning_user_settings_read on public.planning_user_settings;
create policy planning_user_settings_read on public.planning_user_settings for select to authenticated
using (user_id = (select auth.uid()));
drop policy if exists planning_user_settings_insert on public.planning_user_settings;
create policy planning_user_settings_insert on public.planning_user_settings for insert to authenticated
with check (user_id = (select auth.uid()));
drop policy if exists planning_user_settings_update on public.planning_user_settings;
create policy planning_user_settings_update on public.planning_user_settings for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.planning_user_settings from public, anon, authenticated;
grant select, insert, update on public.planning_user_settings to authenticated;

-- 5) Per-user saved views --------------------------------------------------------------------------
create table if not exists public.planning_saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null check (length(btrim(name)) between 1 and 60),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);
drop trigger if exists planning_saved_views_touch on public.planning_saved_views;
create trigger planning_saved_views_touch before update on public.planning_saved_views
  for each row execute function public.planning_touch_updated_at();

alter table public.planning_saved_views enable row level security;
drop policy if exists planning_saved_views_read on public.planning_saved_views;
create policy planning_saved_views_read on public.planning_saved_views for select to authenticated
using (user_id = (select auth.uid()));
drop policy if exists planning_saved_views_insert on public.planning_saved_views;
create policy planning_saved_views_insert on public.planning_saved_views for insert to authenticated
with check (user_id = (select auth.uid()));
drop policy if exists planning_saved_views_update on public.planning_saved_views;
create policy planning_saved_views_update on public.planning_saved_views for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists planning_saved_views_delete on public.planning_saved_views;
create policy planning_saved_views_delete on public.planning_saved_views for delete to authenticated
using (user_id = (select auth.uid()));
revoke all on public.planning_saved_views from public, anon, authenticated;
grant select, insert, update, delete on public.planning_saved_views to authenticated;
