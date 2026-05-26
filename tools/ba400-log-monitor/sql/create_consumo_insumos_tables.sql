create table if not exists public.consumo_reactivos_hora (
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
  blank_count bigint not null default 0,
  calib_count bigint not null default 0,
  ctrl_count bigint not null default 0,
  patient_count bigint not null default 0,
  factory_test_count bigint not null default 0,
  non_factory_test_count bigint not null default 0,
  first_event_at timestamptz,
  last_event_at timestamptz,
  source_basename text not null
);

create index if not exists consumo_reactivos_hora_bucket_month_idx
  on public.consumo_reactivos_hora (bucket_month desc);

create index if not exists consumo_reactivos_hora_numero_serie_idx
  on public.consumo_reactivos_hora (numero_serie);

create index if not exists consumo_reactivos_hora_test_name_idx
  on public.consumo_reactivos_hora (test_name);

create table if not exists public.consumo_rotores_mensual (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  summary_key text not null unique,
  bucket_month text not null,
  numero_serie text not null,
  modelo text,
  rotor_change_count bigint not null default 0,
  first_change_at timestamptz,
  last_change_at timestamptz,
  change_timestamps jsonb not null default '[]'::jsonb,
  source_basename text not null,
  monitor_name text not null,
  machine_name text
);

create index if not exists consumo_rotores_mensual_bucket_month_idx
  on public.consumo_rotores_mensual (bucket_month desc);

create index if not exists consumo_rotores_mensual_numero_serie_idx
  on public.consumo_rotores_mensual (numero_serie);

create table if not exists public.estado_insumos_equipo_actual (
  numero_serie text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ultimo_evento_consumo_at timestamptz,
  modelo text,
  monitor_name text not null,
  machine_name text,
  pack_ise_sn text not null default '',
  ref_electrode text not null default '',
  na_electrode text not null default '',
  k_electrode text not null default '',
  cl_electrode text not null default '',
  li_electrode text not null default '',
  payload jsonb not null default '{}'::jsonb
);

create index if not exists estado_insumos_equipo_actual_updated_at_idx
  on public.estado_insumos_equipo_actual (updated_at desc);

alter table public.consumo_reactivos_hora enable row level security;
alter table public.consumo_rotores_mensual enable row level security;
alter table public.estado_insumos_equipo_actual enable row level security;

drop policy if exists "anon_insert_consumo_reactivos_hora" on public.consumo_reactivos_hora;
create policy "anon_insert_consumo_reactivos_hora"
on public.consumo_reactivos_hora
for insert
to anon
with check (true);

drop policy if exists "anon_update_consumo_reactivos_hora" on public.consumo_reactivos_hora;
create policy "anon_update_consumo_reactivos_hora"
on public.consumo_reactivos_hora
for update
to anon
using (true)
with check (true);

drop policy if exists "anon_select_consumo_reactivos_hora" on public.consumo_reactivos_hora;
create policy "anon_select_consumo_reactivos_hora"
on public.consumo_reactivos_hora
for select
to anon
using (true);

drop policy if exists "anon_insert_consumo_rotores_mensual" on public.consumo_rotores_mensual;
create policy "anon_insert_consumo_rotores_mensual"
on public.consumo_rotores_mensual
for insert
to anon
with check (true);

drop policy if exists "anon_update_consumo_rotores_mensual" on public.consumo_rotores_mensual;
create policy "anon_update_consumo_rotores_mensual"
on public.consumo_rotores_mensual
for update
to anon
using (true)
with check (true);

drop policy if exists "anon_select_consumo_rotores_mensual" on public.consumo_rotores_mensual;
create policy "anon_select_consumo_rotores_mensual"
on public.consumo_rotores_mensual
for select
to anon
using (true);

drop policy if exists "anon_insert_estado_insumos_equipo_actual" on public.estado_insumos_equipo_actual;
create policy "anon_insert_estado_insumos_equipo_actual"
on public.estado_insumos_equipo_actual
for insert
to anon
with check (true);

drop policy if exists "anon_update_estado_insumos_equipo_actual" on public.estado_insumos_equipo_actual;
create policy "anon_update_estado_insumos_equipo_actual"
on public.estado_insumos_equipo_actual
for update
to anon
using (true)
with check (true);

drop policy if exists "anon_select_estado_insumos_equipo_actual" on public.estado_insumos_equipo_actual;
create policy "anon_select_estado_insumos_equipo_actual"
on public.estado_insumos_equipo_actual
for select
to anon
using (true);
