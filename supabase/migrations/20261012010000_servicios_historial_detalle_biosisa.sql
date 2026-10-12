-- Historial de servicio: detalle de los reportes importados de Biosisa.
-- * origen distingue servicios, capacitaciones y servicios telefónicos importados; con id_legacy
--   forma la llave de idempotencia (los Ids de Biosisa se repiten entre secciones).
-- * horario, duración y textos del ingeniero (diagnóstico / trabajo realizado) de cada PDF.
-- * KPIs: los servicios telefónicos importados cuentan como llamada (no como visita) y la duración
--   de un servicio de un solo día alimenta duration_min.

alter table public.servicios_historial
  add column if not exists origen text,
  add column if not exists fecha_fin date,
  add column if not exists hora_inicio time,
  add column if not exists hora_fin time,
  add column if not exists duracion_min integer,
  add column if not exists detalle_averia text,
  add column if not exists detalle_solucion text,
  add column if not exists diagnostico text,
  add column if not exists trabajo_realizado text,
  add column if not exists datos_origen jsonb not null default '{}'::jsonb;

alter table public.servicios_historial drop constraint if exists servicios_historial_origen_check;
alter table public.servicios_historial add constraint servicios_historial_origen_check
  check (origen is null or origen in ('biosisa_servicio', 'biosisa_capacitacion', 'biosisa_llamada'));
alter table public.servicios_historial drop constraint if exists servicios_historial_duracion_min_check;
alter table public.servicios_historial add constraint servicios_historial_duracion_min_check
  check (duracion_min is null or duracion_min >= 0);

update public.servicios_historial
set origen = 'biosisa_servicio'
where origen is null and id_legacy is not null and ticket_id is null;

create unique index if not exists servicios_historial_origen_legacy_key
  on public.servicios_historial (origen, id_legacy)
  where origen is not null and id_legacy is not null;

CREATE OR REPLACE FUNCTION "public"."service_kpi_exec_records"("p_tz" "text") RETURNS TABLE("rid" "text", "source" "text", "ticket_id" "uuid", "serial_key" "text", "serial" "text", "act_date" "date", "created_ts" timestamp with time zone, "kind" "text", "people" "uuid"[], "unmatched" "text", "reason" "text", "result" "text", "duration_min" integer, "failure_code" "text", "solution_code" "text", "is_visit" boolean, "is_call" boolean)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
with prof as (select p.id, public.ticket_person_key(p.nombre_completo) as pkey from public.profiles p where p.rol::text in ('admin','tecnico')),
today as (select (now() at time zone p_tz)::date as d)
select 'hist:' || h.id::text, 'Historial de servicio', h.ticket_id, public.normalize_equipment_serial(h.no_serie), h.no_serie,
 case when h.fecha_servicio between date '2000-01-01' and (select d from today) then h.fecha_servicio end,
 coalesce(h.creado_en, h.fecha_servicio::timestamptz),
 case when h.origen = 'biosisa_llamada' then 'llamada' else public.service_history_kind(h.tipo_servicio, h.motivo) end,
 case when h.tecnico_id is null then '{}'::uuid[] else array[h.tecnico_id] end, null::text,
 nullif(btrim(h.motivo), ''), h.resultado, case when h.duracion_min between 1 and 1440 then h.duracion_min end,
 nullif(upper(btrim(h.cda)), ''), nullif(upper(btrim(h.cds)), ''),
 h.origen is distinct from 'biosisa_llamada', h.origen is not distinct from 'biosisa_llamada'
from public.servicios_historial h
union all
select 'sap:' || s.id::text, 'Parte SAP ' || s.report_number, null::uuid, public.normalize_equipment_serial(s.equipment_serial), s.equipment_serial,
 case when coalesce(s.end_date, s.start_date) between date '2000-01-01' and (select d from today) then coalesce(s.end_date, s.start_date) end,
 s.first_imported_at,
 case s.service_kind when 'preventivo' then 'preventivo' when 'correctivo' then 'correctivo' else 'otro' end,
 coalesce((select array_agg(p.id) from prof p where p.pkey = public.ticket_person_key(s.technician_name)), '{}'::uuid[]),
 case when not exists (select 1 from prof p where p.pkey = public.ticket_person_key(s.technician_name)) then nullif(btrim(s.technician_name), '') end,
 nullif(btrim(s.description), ''), null, nullif(s.total_duration_minutes, 0), null, null, true, false
from public.sap_service_reports s
union all
select 'rep:' || r.id::text, case when r.report_type::text = 'remoto' then 'Reporte remoto' else 'Reporte de servicio' end,
 r.service_ticket_id, public.normalize_equipment_serial(r.equipment_serial), r.equipment_serial,
 case when coalesce(r.service_date, r.call_date, (r.created_at at time zone p_tz)::date) between date '2000-01-01' and (select d from today)
  then coalesce(r.service_date, r.call_date, (r.created_at at time zone p_tz)::date) end,
 r.created_at,
 case when r.report_type::text = 'remoto' then 'llamada' else public.service_report_kind(r.service_type) end,
 case when r.engineer_id is null then '{}'::uuid[] else array[r.engineer_id] end,
 case when r.engineer_id is null then nullif(btrim(r.engineer_name), '') end,
 nullif(btrim(coalesce(r.subject, r.comments)), ''),
 case when r.report_type::text = 'remoto' then case when r.status::text = 'requiere_visita' then 'requiere_visita' else 'resuelto' end end,
 case when r.ended_at > r.started_at then (extract(epoch from (r.ended_at - r.started_at)) / 60)::integer end,
 nullif(upper(btrim(r.diagnostic_code)), ''), nullif(upper(btrim(r.solution_code)), ''),
 r.report_type::text = 'servicio', r.report_type::text = 'remoto'
from public.service_reports r
where r.status::text <> 'borrador' and coalesce(r.external_source, '') <> 'sap_fsm'
union all
select 'bit:' || b.id::text, case when b.tipo = 'visita' then 'Bitácora · visita' else 'Bitácora · llamada' end, b.ticket_id,
 public.normalize_equipment_serial(coalesce(b.numero_serie_equipo, t.numero_serie_equipo)), coalesce(b.numero_serie_equipo, t.numero_serie_equipo),
 (b.creado_en at time zone p_tz)::date, b.creado_en,
 case when b.tipo = 'visita' then 'visita' else 'llamada' end,
 case when b.creado_por is null then '{}'::uuid[] else array[b.creado_por] end, null,
 b.actividad_motivo, b.actividad_resultado, b.actividad_duracion_min, b.codigo_averia, b.codigo_solucion,
 b.tipo = 'visita', b.tipo = 'llamada'
from public.ticket_bitacora b join public.tickets t on t.id = b.ticket_id
where b.tipo in ('visita','llamada')
$$;
