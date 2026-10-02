create table if not exists public.sat_report_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_size bigint not null check (file_size > 0),
  file_sha256 text not null unique,
  storage_path text,
  equipment_model text not null check (equipment_model in ('BA400', 'BA200', 'A15')),
  serial_number text not null,
  report_generated_at timestamptz,
  software_version text,
  encrypted boolean not null default true,
  processing_status text not null default 'processed' check (processing_status in ('processed', 'partial', 'failed')),
  parser_version text not null,
  findings jsonb not null default '{}'::jsonb,
  coverage jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sat_report_events (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.sat_report_imports(id) on delete cascade,
  event_index integer not null,
  category text not null check (category in ('error', 'warning', 'qc', 'calibration', 'operation')),
  occurred_at timestamptz,
  error_code text,
  message text not null,
  source_file text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (import_id, event_index)
);

create table if not exists public.sat_report_lots (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.sat_report_imports(id) on delete cascade,
  lot_kind text not null check (lot_kind in ('reagent', 'control', 'calibrator', 'ise', 'barcode', 'unknown')),
  item_name text not null,
  lot_number text not null,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  source_file text not null,
  tests text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  unique (import_id, lot_kind, item_name, lot_number)
);

create index if not exists sat_report_imports_equipment_idx
  on public.sat_report_imports (serial_number, report_generated_at desc);

create index if not exists sat_report_events_import_category_idx
  on public.sat_report_events (import_id, category, occurred_at desc);

create index if not exists sat_report_events_error_code_idx
  on public.sat_report_events (error_code)
  where error_code is not null;

create index if not exists sat_report_lots_import_kind_idx
  on public.sat_report_lots (import_id, lot_kind, last_seen_at desc);

alter table public.sat_report_imports enable row level security;
alter table public.sat_report_events enable row level security;
alter table public.sat_report_lots enable row level security;

create policy "authenticated can manage sat imports"
on public.sat_report_imports
for all
to authenticated
using (true)
with check (true);

create policy "authenticated can manage sat events"
on public.sat_report_events
for all
to authenticated
using (true)
with check (true);

create policy "authenticated can manage sat lots"
on public.sat_report_lots
for all
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated_insert_consumo_reactivos_hora" on public.consumo_reactivos_hora;
create policy "authenticated_insert_consumo_reactivos_hora"
on public.consumo_reactivos_hora
for insert
to authenticated
with check (true);

drop policy if exists "authenticated_update_consumo_reactivos_hora" on public.consumo_reactivos_hora;
create policy "authenticated_update_consumo_reactivos_hora"
on public.consumo_reactivos_hora
for update
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated_insert_consumo_rotores_mensual" on public.consumo_rotores_mensual;
create policy "authenticated_insert_consumo_rotores_mensual"
on public.consumo_rotores_mensual
for insert
to authenticated
with check (true);

drop policy if exists "authenticated_update_consumo_rotores_mensual" on public.consumo_rotores_mensual;
create policy "authenticated_update_consumo_rotores_mensual"
on public.consumo_rotores_mensual
for update
to authenticated
using (true)
with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sat-reports', 'sat-reports', false, 104857600, array['application/octet-stream'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "authenticated can read sat reports"
on storage.objects
for select
to authenticated
using (bucket_id = 'sat-reports');

create policy "authenticated can upload sat reports"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'sat-reports');

create policy "authenticated can update sat reports"
on storage.objects
for update
to authenticated
using (bucket_id = 'sat-reports')
with check (bucket_id = 'sat-reports');
