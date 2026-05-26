create or replace function public.normalize_equipment_serial(value text)
returns text
language sql
immutable
as $$
  select nullif(upper(regexp_replace(trim(coalesce(value, '')), '\s+', '', 'g')), '');
$$;

create index if not exists equipos_serial_normalized_idx
  on public.equipos (public.normalize_equipment_serial(numero_serie));

create index if not exists tickets_serial_normalized_idx
  on public.tickets (public.normalize_equipment_serial(numero_serie_equipo));

create index if not exists servicios_historial_serial_normalized_idx
  on public.servicios_historial (public.normalize_equipment_serial(no_serie));

create index if not exists client_service_units_serial_normalized_idx
  on public.client_service_units (public.normalize_equipment_serial(numero_serie));

create index if not exists service_reports_serial_normalized_idx
  on public.service_reports (public.normalize_equipment_serial(equipment_serial));

create index if not exists travel_requests_serial_normalized_idx
  on public.travel_requests (public.normalize_equipment_serial(equipment_serial));

create index if not exists monitoreo_errores_equipos_serial_normalized_idx
  on public.monitoreo_errores_equipos (public.normalize_equipment_serial(numero_serie));

create index if not exists estado_insumos_equipo_actual_serial_normalized_idx
  on public.estado_insumos_equipo_actual (public.normalize_equipment_serial(numero_serie));

create index if not exists consumo_rotores_mensual_serial_normalized_idx
  on public.consumo_rotores_mensual (public.normalize_equipment_serial(numero_serie));

create index if not exists consumo_reactivos_hora_serial_normalized_idx
  on public.consumo_reactivos_hora (public.normalize_equipment_serial(numero_serie));

create or replace view public.v_equipment_serial_hub
with (security_invoker = true)
as
with current_error_timestamp as (
  select
    public.normalize_equipment_serial(numero_serie) as serial_normalized,
    max(detected_at) as latest_error_at
  from public.monitoreo_errores_equipos
  where public.normalize_equipment_serial(numero_serie) is not null
  group by 1
),
latest_error as (
  select
    ts.serial_normalized,
    ts.latest_error_at,
    case
      when bool_or(coalesce(err.tipo_mensaje, '') = 'fatal') then 'fatal'
      when bool_or(coalesce(err.tipo_mensaje, '') = 'warning') then 'warning'
      else 'ok'
    end as latest_error_status,
    string_agg(distinct err.codigo_error, ', ' order by err.codigo_error)
      filter (where err.codigo_error is not null and err.codigo_error <> '') as latest_error_codes,
    string_agg(distinct err.descripcion_error, ' | ' order by err.descripcion_error)
      filter (where err.descripcion_error is not null and err.descripcion_error <> '') as latest_error_descriptions
  from current_error_timestamp ts
  join public.monitoreo_errores_equipos err
    on public.normalize_equipment_serial(err.numero_serie) = ts.serial_normalized
   and err.detected_at = ts.latest_error_at
  group by 1, 2
),
service_stats as (
  select
    public.normalize_equipment_serial(no_serie) as serial_normalized,
    count(*) as total_services,
    max(coalesce(fecha_servicio::timestamptz, creado_en)) as last_service_at
  from public.servicios_historial
  where public.normalize_equipment_serial(no_serie) is not null
  group by 1
),
ticket_stats as (
  select
    public.normalize_equipment_serial(numero_serie_equipo) as serial_normalized,
    count(*) as total_tickets,
    count(*) filter (
      where coalesce(lower(estado::text), '') not in ('cerrado', 'closed', 'resuelto', 'finalizado')
    ) as open_tickets,
    max(creado_en) as last_ticket_at
  from public.tickets
  where public.normalize_equipment_serial(numero_serie_equipo) is not null
  group by 1
),
unit_stats as (
  select
    public.normalize_equipment_serial(numero_serie) as serial_normalized,
    count(*) as total_units
  from public.client_service_units
  where public.normalize_equipment_serial(numero_serie) is not null
  group by 1
),
latest_supply as (
  select distinct on (public.normalize_equipment_serial(numero_serie))
    public.normalize_equipment_serial(numero_serie) as serial_normalized,
    updated_at as insumos_updated_at,
    ultimo_evento_consumo_at,
    monitor_name as insumos_monitor_name,
    machine_name as insumos_machine_name,
    pack_ise_sn,
    ref_electrode,
    na_electrode,
    k_electrode,
    cl_electrode,
    li_electrode
  from public.estado_insumos_equipo_actual
  where public.normalize_equipment_serial(numero_serie) is not null
  order by public.normalize_equipment_serial(numero_serie), updated_at desc
),
latest_rotor as (
  select distinct on (public.normalize_equipment_serial(numero_serie))
    public.normalize_equipment_serial(numero_serie) as serial_normalized,
    bucket_month as rotor_bucket_month,
    rotor_change_count,
    last_change_at as last_rotor_change_at,
    updated_at as rotor_updated_at
  from public.consumo_rotores_mensual
  where public.normalize_equipment_serial(numero_serie) is not null
  order by public.normalize_equipment_serial(numero_serie), updated_at desc, bucket_month desc
),
latest_reagent as (
  select distinct on (public.normalize_equipment_serial(numero_serie))
    public.normalize_equipment_serial(numero_serie) as serial_normalized,
    bucket_month as reagent_bucket_month,
    test_name as reagent_test_name,
    pipetting_count as reagent_pipetting_count,
    last_event_at as reagent_last_event_at,
    updated_at as reagent_updated_at
  from public.consumo_reactivos_hora
  where public.normalize_equipment_serial(numero_serie) is not null
  order by public.normalize_equipment_serial(numero_serie), updated_at desc, bucket_month desc
)
select
  eq.id as equipment_id,
  eq.numero_serie,
  public.normalize_equipment_serial(eq.numero_serie) as serial_normalized,
  eq.modelo,
  eq.cliente_id,
  cli.razon_social as cliente_nombre,
  eq.pais,
  eq.estado,
  eq.ciudad,
  eq.municipio,
  eq.colonia,
  eq.direccion,
  eq.codigo_postal,
  eq.fecha_inicio,
  eq.fecha_fin,
  coalesce(ts.total_tickets, 0) as total_tickets,
  coalesce(ts.open_tickets, 0) as open_tickets,
  ts.last_ticket_at,
  coalesce(ss.total_services, 0) as total_services,
  ss.last_service_at,
  coalesce(us.total_units, 0) as total_client_units,
  le.latest_error_status,
  le.latest_error_at,
  le.latest_error_codes,
  le.latest_error_descriptions,
  ls.insumos_updated_at,
  ls.ultimo_evento_consumo_at,
  ls.insumos_monitor_name,
  ls.insumos_machine_name,
  ls.pack_ise_sn,
  ls.ref_electrode,
  ls.na_electrode,
  ls.k_electrode,
  ls.cl_electrode,
  ls.li_electrode,
  lr.rotor_bucket_month,
  lr.rotor_change_count,
  lr.last_rotor_change_at,
  lr.rotor_updated_at,
  rg.reagent_bucket_month,
  rg.reagent_test_name,
  rg.reagent_pipetting_count,
  rg.reagent_last_event_at,
  rg.reagent_updated_at
from public.equipos eq
left join public.clientes cli
  on cli.id = eq.cliente_id
left join ticket_stats ts
  on ts.serial_normalized = public.normalize_equipment_serial(eq.numero_serie)
left join service_stats ss
  on ss.serial_normalized = public.normalize_equipment_serial(eq.numero_serie)
left join unit_stats us
  on us.serial_normalized = public.normalize_equipment_serial(eq.numero_serie)
left join latest_error le
  on le.serial_normalized = public.normalize_equipment_serial(eq.numero_serie)
left join latest_supply ls
  on ls.serial_normalized = public.normalize_equipment_serial(eq.numero_serie)
left join latest_rotor lr
  on lr.serial_normalized = public.normalize_equipment_serial(eq.numero_serie)
left join latest_reagent rg
  on rg.serial_normalized = public.normalize_equipment_serial(eq.numero_serie)
where public.normalize_equipment_serial(eq.numero_serie) is not null;
