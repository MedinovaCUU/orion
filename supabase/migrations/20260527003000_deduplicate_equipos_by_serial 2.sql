begin;

create table if not exists public.equipos_dedup_archive (
  archive_id bigserial primary key,
  archived_at timestamptz not null default now(),
  serial_normalized text not null,
  keep_id text not null,
  drop_id text not null,
  removed_row jsonb not null,
  keep_row jsonb not null
);

create unique index if not exists equipos_dedup_archive_drop_id_idx
  on public.equipos_dedup_archive (drop_id);

create temp table tmp_equipment_duplicate_ranking on commit drop as
with scored as (
  select
    e.*,
    public.normalize_equipment_serial(e.numero_serie) as serial_normalized,
    (
      (case when e.cliente_id is not null then 40 else 0 end) +
      (case when nullif(trim(coalesce(e.modelo, '')), '') is not null then 10 else 0 end) +
      (case when nullif(trim(coalesce(e.estado, '')), '') is not null then 8 else 0 end) +
      (case when nullif(trim(coalesce(e.ciudad, '')), '') is not null then 8 else 0 end) +
      (case when nullif(trim(coalesce(e.municipio, '')), '') is not null then 4 else 0 end) +
      (case when nullif(trim(coalesce(e.colonia, '')), '') is not null then 4 else 0 end) +
      (case when nullif(trim(coalesce(e.direccion, '')), '') is not null then 12 else 0 end) +
      (case when nullif(trim(coalesce(e.codigo_postal, '')), '') is not null then 4 else 0 end) +
      (case when nullif(trim(coalesce(e.software, '')), '') is not null then 3 else 0 end) +
      (case when nullif(trim(coalesce(e.firmware, '')), '') is not null then 3 else 0 end) +
      (case when nullif(trim(coalesce(e.supremo_id, '')), '') is not null then 4 else 0 end) +
      (case when coalesce(e.supremo_enabled, false) then 2 else 0 end) +
      (case when e.fecha_fin is null then 16 else 0 end) +
      (case when e.fecha_inicio is not null then 3 else 0 end) +
      (case when e.termino_garantia is not null then 3 else 0 end)
    ) as dedupe_score
  from public.equipos e
  where public.normalize_equipment_serial(e.numero_serie) is not null
),
ranked as (
  select
    scored.*,
    count(*) over (partition by serial_normalized) as group_size,
    row_number() over (
      partition by serial_normalized
      order by
        dedupe_score desc,
        (fecha_fin is null) desc,
        actualizado_en desc nulls last,
        creado_en desc nulls last,
        id desc
    ) as rn,
    first_value(id) over (
      partition by serial_normalized
      order by
        dedupe_score desc,
        (fecha_fin is null) desc,
        actualizado_en desc nulls last,
        creado_en desc nulls last,
        id desc
    ) as keep_id
  from scored
)
select *
from ranked
where group_size > 1;

create temp table tmp_equipment_duplicate_map on commit drop as
select distinct
  serial_normalized,
  keep_id,
  id as drop_id
from tmp_equipment_duplicate_ranking
where id <> keep_id;

update public.equipos as target
set
  cliente_id = coalesce(
    target.cliente_id,
    case when source.distinct_cliente_id = 1 then source.best_cliente_id else null end
  ),
  modelo = case
    when nullif(trim(coalesce(target.modelo, '')), '') is not null then target.modelo
    when source.distinct_modelo = 1 then source.best_modelo
    else target.modelo
  end,
  pais = case
    when nullif(trim(coalesce(target.pais, '')), '') is not null then target.pais
    when source.distinct_pais = 1 then source.best_pais
    else target.pais
  end,
  estado = case
    when nullif(trim(coalesce(target.estado, '')), '') is not null then target.estado
    when source.distinct_estado = 1 then source.best_estado
    else target.estado
  end,
  ciudad = case
    when nullif(trim(coalesce(target.ciudad, '')), '') is not null then target.ciudad
    when source.distinct_ciudad = 1 then source.best_ciudad
    else target.ciudad
  end,
  municipio = case
    when nullif(trim(coalesce(target.municipio, '')), '') is not null then target.municipio
    when source.distinct_municipio = 1 then source.best_municipio
    else target.municipio
  end,
  colonia = case
    when nullif(trim(coalesce(target.colonia, '')), '') is not null then target.colonia
    when source.distinct_colonia = 1 then source.best_colonia
    else target.colonia
  end,
  direccion = case
    when nullif(trim(coalesce(target.direccion, '')), '') is not null then target.direccion
    when source.distinct_direccion = 1 then source.best_direccion
    else target.direccion
  end,
  codigo_postal = case
    when nullif(trim(coalesce(target.codigo_postal, '')), '') is not null then target.codigo_postal
    when source.distinct_codigo_postal = 1 then source.best_codigo_postal
    else target.codigo_postal
  end,
  software = case
    when nullif(trim(coalesce(target.software, '')), '') is not null then target.software
    when source.distinct_software = 1 then source.best_software
    else target.software
  end,
  firmware = case
    when nullif(trim(coalesce(target.firmware, '')), '') is not null then target.firmware
    when source.distinct_firmware = 1 then source.best_firmware
    else target.firmware
  end,
  supremo_id = case
    when nullif(trim(coalesce(target.supremo_id, '')), '') is not null then target.supremo_id
    when source.distinct_supremo_id = 1 then source.best_supremo_id
    else target.supremo_id
  end,
  supremo_alias = case
    when nullif(trim(coalesce(target.supremo_alias, '')), '') is not null then target.supremo_alias
    when source.distinct_supremo_alias = 1 then source.best_supremo_alias
    else target.supremo_alias
  end,
  empleado_asignado = coalesce(
    target.empleado_asignado,
    case when source.distinct_empleado_asignado = 1 then source.best_empleado_asignado else null end
  ),
  empleado_retira = coalesce(
    target.empleado_retira,
    case when source.distinct_empleado_retira = 1 then source.best_empleado_retira else null end
  ),
  fecha_inicio = coalesce(target.fecha_inicio, source.min_fecha_inicio),
  termino_garantia = coalesce(target.termino_garantia, source.max_termino_garantia),
  fecha_fin = case
    when source.has_open_row then null
    else coalesce(target.fecha_fin, source.max_fecha_fin)
  end,
  doc_asignacion = coalesce(target.doc_asignacion, false) or source.any_doc_asignacion,
  doc_terminacion = coalesce(target.doc_terminacion, false) or source.any_doc_terminacion,
  supremo_enabled = case
    when coalesce(target.supremo_enabled, false) then true
    else source.any_supremo_enabled
  end,
  actualizado_en = coalesce(source.latest_actualizado_en, target.actualizado_en)
from (
  select
    keep_id,
    count(distinct cliente_id) filter (where cliente_id is not null) as distinct_cliente_id,
    (array_agg(cliente_id order by dedupe_score desc, actualizado_en desc nulls last, creado_en desc nulls last, id desc)
      filter (where cliente_id is not null))[1] as best_cliente_id,
    count(distinct upper(trim(modelo))) filter (where nullif(trim(coalesce(modelo, '')), '') is not null) as distinct_modelo,
    (array_agg(modelo order by dedupe_score desc, actualizado_en desc nulls last, creado_en desc nulls last, id desc)
      filter (where nullif(trim(coalesce(modelo, '')), '') is not null))[1] as best_modelo,
    count(distinct upper(trim(pais))) filter (where nullif(trim(coalesce(pais, '')), '') is not null) as distinct_pais,
    (array_agg(pais order by dedupe_score desc, actualizado_en desc nulls last, creado_en desc nulls last, id desc)
      filter (where nullif(trim(coalesce(pais, '')), '') is not null))[1] as best_pais,
    count(distinct upper(trim(estado))) filter (where nullif(trim(coalesce(estado, '')), '') is not null) as distinct_estado,
    (array_agg(estado order by dedupe_score desc, actualizado_en desc nulls last, creado_en desc nulls last, id desc)
      filter (where nullif(trim(coalesce(estado, '')), '') is not null))[1] as best_estado,
    count(distinct upper(trim(ciudad))) filter (where nullif(trim(coalesce(ciudad, '')), '') is not null) as distinct_ciudad,
    (array_agg(ciudad order by dedupe_score desc, actualizado_en desc nulls last, creado_en desc nulls last, id desc)
      filter (where nullif(trim(coalesce(ciudad, '')), '') is not null))[1] as best_ciudad,
    count(distinct upper(trim(municipio))) filter (where nullif(trim(coalesce(municipio, '')), '') is not null) as distinct_municipio,
    (array_agg(municipio order by dedupe_score desc, actualizado_en desc nulls last, creado_en desc nulls last, id desc)
      filter (where nullif(trim(coalesce(municipio, '')), '') is not null))[1] as best_municipio,
    count(distinct upper(trim(colonia))) filter (where nullif(trim(coalesce(colonia, '')), '') is not null) as distinct_colonia,
    (array_agg(colonia order by dedupe_score desc, actualizado_en desc nulls last, creado_en desc nulls last, id desc)
      filter (where nullif(trim(coalesce(colonia, '')), '') is not null))[1] as best_colonia,
    count(distinct upper(trim(direccion))) filter (where nullif(trim(coalesce(direccion, '')), '') is not null) as distinct_direccion,
    (array_agg(direccion order by dedupe_score desc, actualizado_en desc nulls last, creado_en desc nulls last, id desc)
      filter (where nullif(trim(coalesce(direccion, '')), '') is not null))[1] as best_direccion,
    count(distinct upper(trim(codigo_postal))) filter (where nullif(trim(coalesce(codigo_postal, '')), '') is not null) as distinct_codigo_postal,
    (array_agg(codigo_postal order by dedupe_score desc, actualizado_en desc nulls last, creado_en desc nulls last, id desc)
      filter (where nullif(trim(coalesce(codigo_postal, '')), '') is not null))[1] as best_codigo_postal,
    count(distinct upper(trim(software))) filter (where nullif(trim(coalesce(software, '')), '') is not null) as distinct_software,
    (array_agg(software order by dedupe_score desc, actualizado_en desc nulls last, creado_en desc nulls last, id desc)
      filter (where nullif(trim(coalesce(software, '')), '') is not null))[1] as best_software,
    count(distinct upper(trim(firmware))) filter (where nullif(trim(coalesce(firmware, '')), '') is not null) as distinct_firmware,
    (array_agg(firmware order by dedupe_score desc, actualizado_en desc nulls last, creado_en desc nulls last, id desc)
      filter (where nullif(trim(coalesce(firmware, '')), '') is not null))[1] as best_firmware,
    count(distinct upper(trim(supremo_id))) filter (where nullif(trim(coalesce(supremo_id, '')), '') is not null) as distinct_supremo_id,
    (array_agg(supremo_id order by dedupe_score desc, actualizado_en desc nulls last, creado_en desc nulls last, id desc)
      filter (where nullif(trim(coalesce(supremo_id, '')), '') is not null))[1] as best_supremo_id,
    count(distinct upper(trim(supremo_alias))) filter (where nullif(trim(coalesce(supremo_alias, '')), '') is not null) as distinct_supremo_alias,
    (array_agg(supremo_alias order by dedupe_score desc, actualizado_en desc nulls last, creado_en desc nulls last, id desc)
      filter (where nullif(trim(coalesce(supremo_alias, '')), '') is not null))[1] as best_supremo_alias,
    count(distinct empleado_asignado) filter (where empleado_asignado is not null) as distinct_empleado_asignado,
    (array_agg(empleado_asignado order by dedupe_score desc, actualizado_en desc nulls last, creado_en desc nulls last, id desc)
      filter (where empleado_asignado is not null))[1] as best_empleado_asignado,
    count(distinct empleado_retira) filter (where empleado_retira is not null) as distinct_empleado_retira,
    (array_agg(empleado_retira order by dedupe_score desc, actualizado_en desc nulls last, creado_en desc nulls last, id desc)
      filter (where empleado_retira is not null))[1] as best_empleado_retira,
    min(fecha_inicio) filter (where fecha_inicio is not null) as min_fecha_inicio,
    max(termino_garantia) filter (where termino_garantia is not null) as max_termino_garantia,
    max(fecha_fin) filter (where fecha_fin is not null) as max_fecha_fin,
    max(actualizado_en) filter (where actualizado_en is not null) as latest_actualizado_en,
    bool_or(fecha_fin is null) as has_open_row,
    bool_or(coalesce(doc_asignacion, false)) as any_doc_asignacion,
    bool_or(coalesce(doc_terminacion, false)) as any_doc_terminacion,
    bool_or(coalesce(supremo_enabled, false)) as any_supremo_enabled
  from tmp_equipment_duplicate_ranking
  group by keep_id
) as source
where target.id = source.keep_id;

insert into public.equipos_dedup_archive (
  serial_normalized,
  keep_id,
  drop_id,
  removed_row,
  keep_row
)
select
  map.serial_normalized,
  map.keep_id,
  map.drop_id,
  to_jsonb(drop_row),
  to_jsonb(keep_row)
from tmp_equipment_duplicate_map map
join public.equipos drop_row
  on drop_row.id = map.drop_id
join public.equipos keep_row
  on keep_row.id = map.keep_id
on conflict (drop_id) do nothing;

insert into public.equipment_map_manual_overrides (
  equipment_id,
  x_percent,
  y_percent,
  updated_at
)
select
  chosen.keep_id,
  chosen.x_percent,
  chosen.y_percent,
  chosen.updated_at
from (
  select distinct on (mapping.keep_id)
    mapping.keep_id,
    overrides.x_percent,
    overrides.y_percent,
    overrides.updated_at
  from (
    select serial_normalized, keep_id, drop_id as equipment_id
    from tmp_equipment_duplicate_map
    union all
    select serial_normalized, keep_id, keep_id as equipment_id
    from tmp_equipment_duplicate_map
    group by serial_normalized, keep_id
  ) as mapping
  join public.equipment_map_manual_overrides overrides
    on overrides.equipment_id = mapping.equipment_id
  order by
    mapping.keep_id,
    (overrides.equipment_id = mapping.keep_id) desc,
    overrides.updated_at desc
) as chosen
on conflict (equipment_id) do update
set
  x_percent = excluded.x_percent,
  y_percent = excluded.y_percent,
  updated_at = excluded.updated_at;

update public.client_service_units target
set equipment_id = map.keep_id
from tmp_equipment_duplicate_map map
where target.equipment_id = map.drop_id;

update public.service_reports target
set equipment_id = map.keep_id
from tmp_equipment_duplicate_map map
where target.equipment_id = map.drop_id;

update public.service_report_version_alerts target
set equipment_id = map.keep_id
from tmp_equipment_duplicate_map map
where target.equipment_id = map.drop_id;

update public.refacciones_solicitudes target
set equipo_id = map.keep_id
from tmp_equipment_duplicate_map map
where target.equipo_id = map.drop_id;

delete from public.equipment_map_manual_overrides target
using tmp_equipment_duplicate_map map
where target.equipment_id = map.drop_id;

delete from public.equipos target
using tmp_equipment_duplicate_map map
where target.id = map.drop_id;

do $$
begin
  if exists (
    select 1
    from public.equipos
    where public.normalize_equipment_serial(numero_serie) is not null
    group by public.normalize_equipment_serial(numero_serie)
    having count(*) > 1
  ) then
    raise exception 'equipos still contains duplicate serials after dedupe';
  end if;
end;
$$;

create unique index if not exists equipos_numero_serie_normalized_unique_idx
  on public.equipos (public.normalize_equipment_serial(numero_serie))
  where public.normalize_equipment_serial(numero_serie) is not null;

commit;
