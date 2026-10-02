-- Bounded projection used by DRI and Monitoring. Raw instrument history remains in
-- the encrypted SAT object (or at the equipment); this table only keeps the latest
-- result for each equipment + test + control level.
create table if not exists public.equipment_qc_latest (
  id uuid primary key default gen_random_uuid(),
  serial_number text not null,
  equipment_model text not null check (equipment_model in ('BA400', 'BA200', 'A15')),
  test_key text not null,
  test_id integer,
  test_name text not null,
  test_short_name text,
  reagent_id text,
  control_id integer,
  control_name text,
  control_lot text,
  control_level text not null check (control_level in ('level_1', 'level_2', 'level_3', 'unknown')),
  result_value double precision not null,
  result_at timestamptz not null,
  unit text,
  analyzer_min double precision,
  analyzer_max double precision,
  analyzer_target double precision,
  analyzer_sd double precision,
  analyzer_validation_status text,
  source_type text not null check (source_type in ('sat_report', 'live_equipment')),
  source_import_id uuid references public.sat_report_imports(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (serial_number, test_key, control_level)
);

create index if not exists equipment_qc_latest_equipment_idx
  on public.equipment_qc_latest (serial_number, result_at desc);

create index if not exists equipment_qc_latest_reagent_idx
  on public.equipment_qc_latest (reagent_id, result_at desc)
  where reagent_id is not null;

alter table public.equipment_qc_latest enable row level security;

create policy "authenticated can read latest equipment qc"
on public.equipment_qc_latest
for select
to authenticated
using (true);

create policy "authenticated can insert latest equipment qc"
on public.equipment_qc_latest
for insert
to authenticated
with check (true);

create policy "authenticated can update latest equipment qc"
on public.equipment_qc_latest
for update
to authenticated
using (true)
with check (true);
