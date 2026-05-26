create table if not exists public.monitoreo_errores_equipos (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  detected_at timestamptz not null,
  numero_serie text not null,
  modelo text,
  codigo_error text not null,
  descripcion_error text,
  seccion_error text,
  analizador_id text,
  tipo_mensaje text,
  monitor_name text not null,
  machine_name text,
  source_file text not null,
  source_basename text not null,
  line_number bigint not null,
  byte_offset_start bigint not null,
  byte_offset_end bigint not null,
  raw_line text not null,
  line_hash text not null unique,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists monitoreo_errores_equipos_detected_at_idx
  on public.monitoreo_errores_equipos (detected_at desc);

create index if not exists monitoreo_errores_equipos_numero_serie_idx
  on public.monitoreo_errores_equipos (numero_serie);

create index if not exists monitoreo_errores_equipos_modelo_idx
  on public.monitoreo_errores_equipos (modelo);

create index if not exists monitoreo_errores_equipos_codigo_error_idx
  on public.monitoreo_errores_equipos (codigo_error);

alter table public.monitoreo_errores_equipos enable row level security;

drop policy if exists "anon_insert_monitoreo_errores_equipos" on public.monitoreo_errores_equipos;
create policy "anon_insert_monitoreo_errores_equipos"
on public.monitoreo_errores_equipos
for insert
to anon
with check (true);

drop policy if exists "anon_select_monitoreo_errores_equipos" on public.monitoreo_errores_equipos;
create policy "anon_select_monitoreo_errores_equipos"
on public.monitoreo_errores_equipos
for select
to anon
using (true);
