drop policy if exists "anon_insert_consumo_reactivos_hora" on public.consumo_reactivos_hora;
drop policy if exists "anon_update_consumo_reactivos_hora" on public.consumo_reactivos_hora;
drop policy if exists "anon_select_consumo_reactivos_hora" on public.consumo_reactivos_hora;

drop table if exists public.consumo_reactivos_hora;

create table public.consumo_reactivos_hora (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  summary_key text not null unique,
  bucket_month text not null,
  numero_serie text not null,
  test_name text not null,
  pipetting_count bigint not null default 0,
  vr1_total_ul numeric(14,2) not null default 0,
  vr2_total_ul numeric(14,2) not null default 0,
  sample_volume_total_ul numeric(14,2) not null default 0,
  patient_count bigint not null default 0,
  blank_count bigint not null default 0,
  calib_count bigint not null default 0,
  ctrl_count bigint not null default 0,
  factory_test_count bigint not null default 0,
  non_factory_test_count bigint not null default 0,
  first_event_at timestamptz,
  last_event_at timestamptz,
  source_basename text not null
);

create index consumo_reactivos_hora_bucket_month_idx
  on public.consumo_reactivos_hora (bucket_month desc);

create index consumo_reactivos_hora_numero_serie_idx
  on public.consumo_reactivos_hora (numero_serie);

create index consumo_reactivos_hora_test_name_idx
  on public.consumo_reactivos_hora (test_name);

alter table public.consumo_reactivos_hora enable row level security;

create policy "anon_insert_consumo_reactivos_hora"
on public.consumo_reactivos_hora
for insert
to anon
with check (true);

create policy "anon_update_consumo_reactivos_hora"
on public.consumo_reactivos_hora
for update
to anon
using (true)
with check (true);

create policy "anon_select_consumo_reactivos_hora"
on public.consumo_reactivos_hora
for select
to anon
using (true);
