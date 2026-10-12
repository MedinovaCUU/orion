-- TEST ONLY. Objects that production gets from other Supabase services or from tools outside supabase/migrations,
-- so the full migration chain can be replayed in a throwaway supabase/postgres container (test/setup-db.sh).
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb
$$;
grant execute on function auth.jwt() to anon, authenticated, service_role;

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text not null, owner uuid, owner_id text, public boolean default false,
  avif_autodetection boolean default false, file_size_limit bigint, allowed_mime_types text[], type text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text,
  owner uuid, owner_id text, metadata jsonb, user_metadata jsonb, version text,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  created_at timestamptz default now(), updated_at timestamptz default now(), last_accessed_at timestamptz default now()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
create or replace function storage.filename(name text) returns text language sql immutable as $$
  select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;
create or replace function storage.extension(name text) returns text language sql immutable as $$
  select reverse(split_part(reverse(name), '.', 1))
$$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;

-- ba400_bpl_events: written by the Windows BPL monitor (no DDL in this repo). Columns as confirmed on 2026-10-09.
create table if not exists public.ba400_bpl_events (
  id uuid primary key default gen_random_uuid(),
  monitor_name text, monitor_version text, machine_name text, effective_equipment_serial text,
  event_category text default 'bpl', event_type text, bpl_stage text, bpl_status text, diagnostic_status text,
  rule_version text, rule_ids text[], missing_data_for_acceptance text[], source_file text, source_basename text,
  line_number integer, occurred_at timestamptz, occurred_at_raw text, analyzer_sn text, test_name text,
  sample_class text, sample_type text, calibration_control_name text, calibration_control_lot_number text,
  line_hash text, detected_at timestamptz default now(), payload jsonb
);
alter table public.ba400_bpl_events enable row level security;
create policy bpl_events_authenticated_read on public.ba400_bpl_events for select to authenticated using (true);
grant select on public.ba400_bpl_events to authenticated;
