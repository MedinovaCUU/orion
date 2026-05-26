create table if not exists public.estado_errores_equipo_actual (
  numero_serie text primary key,
  modelo text,
  monitor_name text,
  machine_name text,
  analizador_id text,
  estado_actual text not null check (estado_actual in ('ok', 'warning', 'fatal')),
  tipo_mensaje text not null check (tipo_mensaje in ('ok', 'warning', 'fatal')),
  codigos_error text[] not null default '{}',
  errores_activos jsonb not null default '[]'::jsonb,
  error_principal_codigo text,
  error_principal_descripcion text,
  error_principal_seccion text,
  activo_desde timestamptz,
  last_event_at timestamptz not null,
  resolved_at timestamptz,
  source_file text,
  source_basename text,
  line_number bigint,
  raw_line text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists estado_errores_equipo_actual_estado_idx
  on public.estado_errores_equipo_actual (estado_actual);

create index if not exists estado_errores_equipo_actual_updated_at_idx
  on public.estado_errores_equipo_actual (updated_at desc);

do $$
begin
  if exists (
    select 1
    from pg_proc proc
    join pg_namespace nsp on nsp.oid = proc.pronamespace
    where nsp.nspname = 'public'
      and proc.proname = 'normalize_equipment_serial'
  ) then
    execute 'create index if not exists estado_errores_equipo_actual_serial_normalized_idx on public.estado_errores_equipo_actual (public.normalize_equipment_serial(numero_serie))';
  else
    execute 'create index if not exists estado_errores_equipo_actual_numero_serie_idx on public.estado_errores_equipo_actual (numero_serie)';
  end if;
end
$$;

alter table public.estado_errores_equipo_actual enable row level security;

drop policy if exists "anon_insert_estado_errores_equipo_actual" on public.estado_errores_equipo_actual;
create policy "anon_insert_estado_errores_equipo_actual"
on public.estado_errores_equipo_actual
for insert
to anon
with check (true);

drop policy if exists "anon_update_estado_errores_equipo_actual" on public.estado_errores_equipo_actual;
create policy "anon_update_estado_errores_equipo_actual"
on public.estado_errores_equipo_actual
for update
to anon
using (true)
with check (true);

drop policy if exists "anon_select_estado_errores_equipo_actual" on public.estado_errores_equipo_actual;
create policy "anon_select_estado_errores_equipo_actual"
on public.estado_errores_equipo_actual
for select
to anon
using (true);

drop policy if exists "authenticated_select_estado_errores_equipo_actual" on public.estado_errores_equipo_actual;
create policy "authenticated_select_estado_errores_equipo_actual"
on public.estado_errores_equipo_actual
for select
to authenticated
using (true);
