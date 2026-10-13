-- Laboratorio de refacciones: la plataforma toma primero el modelo registrado en el servicio y solo si no
-- lo trae, el del catálogo de equipos. El catálogo es menos específico (por ejemplo, registra un A15C o un
-- IPRO2 como A15 o IPRO) y la hoja de control de refacciones usa el modelo del servicio.

create or replace function public.get_service_parts_lab(p_filters jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare w public.service_kpi_window; v_client text; v_platform text; v_serial text; v_person uuid; v_type text;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Los indicadores del personal son exclusivos para administradores'; end if;
 w := public.service_kpi_window(coalesce(p_filters, '{}'::jsonb));
 v_client := public.service_kpi_filter(p_filters, 'client');
 v_platform := public.service_platform_family(public.service_kpi_filter(p_filters, 'platform'));
 v_serial := public.normalize_equipment_serial(public.service_kpi_filter(p_filters, 'serial'));
 v_type := public.service_kpi_filter(p_filters, 'service_type');
 begin v_person := public.service_kpi_filter(p_filters, 'person')::uuid; exception when others then raise exception 'Colaborador no válido'; end;
 return (
  with eqs as (
   select distinct on (public.normalize_equipment_serial(e.numero_serie)) public.normalize_equipment_serial(e.numero_serie) as serial_key, e.modelo, c.razon_social
   from public.equipos e left join public.clientes c on c.id = e.cliente_id
   where public.normalize_equipment_serial(e.numero_serie) is not null
   order by public.normalize_equipment_serial(e.numero_serie), (e.fecha_fin is null) desc, e.actualizado_en desc nulls last
  ),
  known_sector as (
   select distinct on (k.serial_key) k.serial_key, k.sector
   from (select public.normalize_equipment_serial(h.no_serie) as serial_key, public.service_sector_key(h.datos_origen->>'sector') as sector, h.fecha_servicio
         from public.servicios_historial h) k
   where k.serial_key is not null and k.sector is not null
   order by k.serial_key, k.fecha_servicio desc nulls last
  ),
  raw as (
   select 'hist:' || h.id::text as id, 'Historial de servicio'::text as source, h.fecha_servicio as day,
    public.service_history_kind(h.tipo_servicio, h.motivo) as kind, h.ticket_id,
    coalesce('Servicio ' || h.id_legacy::text, 'Servicio ' || left(h.id::text, 8)) as ref,
    h.no_serie as serial, public.normalize_equipment_serial(h.no_serie) as serial_key,
    public.service_sector_key(h.datos_origen->>'sector') as own_sector, nullif(btrim(h.datos_origen->>'modelo'), '') as model,
    nullif(btrim(h.datos_origen->>'cliente_biosisa'), '') as client_src,
    case when h.tecnico_id is null then '{}'::uuid[] else array[h.tecnico_id] end as people
   from public.servicios_historial h
   where h.origen is distinct from 'biosisa_llamada' and h.origen is distinct from 'biosisa_capacitacion'
    and h.fecha_servicio between w.from_date and w.to_date
   union all
   select 'rep:' || r.id::text, case when r.external_source = 'sap_fsm' then 'Parte SAP' else 'Reporte de servicio' end,
    coalesce(r.service_date, (r.created_at at time zone w.tz)::date), public.service_report_kind(r.service_type), r.service_ticket_id,
    coalesce(r.report_reference, r.external_document_number, left(r.id::text, 8)),
    r.equipment_serial, public.normalize_equipment_serial(r.equipment_serial), null::text, nullif(btrim(r.equipment_name), ''),
    nullif(btrim(r.client_name), ''), case when r.engineer_id is null then '{}'::uuid[] else array[r.engineer_id] end
   from public.service_reports r
   where r.report_type::text = 'servicio' and r.status::text <> 'borrador'
    and coalesce(r.service_date, (r.created_at at time zone w.tz)::date) between w.from_date and w.to_date
  ),
  svc as materialized (
   select x.*, public.service_platform_family(coalesce(x.model, eqs.modelo)) as platform, coalesce(eqs.razon_social, x.client_src) as client,
    coalesce(x.own_sector, ks.sector) as sector, x.own_sector is null and ks.sector is not null as sector_inferred
   from raw x left join eqs on eqs.serial_key = x.serial_key left join known_sector ks on ks.serial_key = x.serial_key
   where x.kind not in ('prueba', 'capacitacion', 'recapacitacion', 'llamada')
  ),
  picked as materialized (
   select s.* from svc s
   where (v_client is null or s.client = v_client)
    and (v_platform is null or s.platform = v_platform)
    and (v_serial is null or s.serial_key = v_serial)
    and (v_person is null or v_person = any(s.people))
    and (v_type is null or s.kind = v_type)
  ),
  lines as (
   select 'hist:' || sr.servicio_id::text as service_id, nullif(btrim(sr.codigo_refaccion), '') as code, sr.cantidad::numeric as qty, null::text as name
   from public.servicios_refacciones sr
   union all
   select 'rep:' || m.service_report_id::text, coalesce(nullif(btrim(m.reference_code), ''), nullif(btrim(m.catalog_code), '')), m.quantity::numeric,
    nullif(btrim(m.product_name), '')
   from public.service_report_materials m where m.material_kind = 'refaccion'
  ),
  used as materialized (
   select l.service_id, coalesce(l.code, 'Sin código') as code, sum(coalesce(l.qty, 0)) as qty, max(l.name) as name
   from lines l join picked p on p.id = l.service_id
   group by l.service_id, coalesce(l.code, 'Sin código')
  ),
  prof as (select p.id, p.nombre_completo from public.profiles p)
  select jsonb_build_object(
   'period', jsonb_build_object('from', w.from_date, 'to', w.to_date, 'timezone', w.tz),
   'services', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'source', p.source, 'day', p.day, 'kind', p.kind, 'ticket_id', p.ticket_id, 'folio', t.numero_caso, 'ref', p.ref,
      'serial', p.serial, 'platform', p.platform, 'client', p.client, 'sector', p.sector, 'sector_inferred', p.sector_inferred,
      'people', (select string_agg(pr.nombre_completo, ' / ' order by pr.nombre_completo) from prof pr where pr.id = any(p.people)),
      'parts', coalesce((select sum(u.qty) from used u where u.service_id = p.id), 0)) order by p.day, p.id)
     from picked p left join public.tickets t on t.id = p.ticket_id), '[]'::jsonb),
   'lines', coalesce((select jsonb_agg(jsonb_build_array(u.service_id, u.code, u.qty) order by u.service_id, u.code) from used u), '[]'::jsonb),
   'codes', coalesce((select jsonb_object_agg(c.code, c.label) from (
      -- Nombre en español antes de « — » en la descripción; si no, el nombre del catálogo; nunca la nota de alta.
      select u.code, coalesce(max(case when rc.descripcion like '% — %' then nullif(btrim(split_part(rc.descripcion, ' — ', 1)), '') end),
        max(nullif(btrim(rc.nombre), '')), max(case when rc.descripcion not ilike 'Alta creada%' then left(rc.descripcion, 80) end), max(u.name)) as label
      from used u left join public.refacciones_catalogo rc on rc.codigo_refaccion = u.code group by u.code) c where c.label is not null), '{}'::jsonb)
  )
 );
end; $$;

revoke all on function public.get_service_parts_lab(jsonb) from public, anon;
grant execute on function public.get_service_parts_lab(jsonb) to authenticated;
