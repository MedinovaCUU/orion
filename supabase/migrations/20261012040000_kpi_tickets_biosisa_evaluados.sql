-- Decisión del dueño (2026-10-12): los tickets importados de Biosisa (BIO-) SÍ se evalúan.
-- Revierte el estado 'historico' de 20261012020000: cada ticket cuenta dentro o fuera del plazo según sus
-- tiempos reales, y entra a primera respuesta como cualquier otro (sin dato cuando no hay registro).
-- Se conservan las mejoras de rendimiento de 20261012030000 (facts materializado, canal en plpgsql,
-- filtros de actividad al final, desempates); solo se vuelve a calcular el reloj de plazo para BIO-.

CREATE OR REPLACE FUNCTION public.service_kpi_ticket_rows(p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(ticket_id uuid, folio text, asunto text, service_type text, team text, team_source text, priority text, channel text, region text, serial text, serial_key text, platform text, client text, responsible_id uuid, responsible_name text, reassignments integer, estado text, opened_at timestamp with time zone, first_response_at timestamp with time zone, first_response_hours numeric, has_first_response boolean, closed_at timestamp with time zone, closure_reason text, closure_class text, resolution_hours numeric, sla_policy text, sla_target_hours numeric, sla_clock text, sla_hours numeric, sla_result text, sla_evaluable boolean, justified boolean, reopen_of_id uuid, reopen_of_folio text, reopened boolean, reopen_evaluable boolean, visits integer, calls integer, ftf_eligible boolean, ftf_ok boolean, opened_in_period boolean, closed_in_period boolean, opened_bucket date, closed_bucket date, state_at_cut text, pending_at_cut boolean, overdue_at_cut boolean, age_days numeric, age_bucket text, relevant boolean, search_text text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
with w as (select * from public.service_kpi_window(p_filters)),
f as (
 select public.service_kpi_filter(p_filters, 'team') as team, public.service_kpi_filter(p_filters, 'person')::uuid as person,
  public.service_kpi_filter(p_filters, 'client') as client, public.service_kpi_filter(p_filters, 'platform') as platform,
  public.normalize_equipment_serial(public.service_kpi_filter(p_filters, 'serial')) as serial_key,
  public.service_kpi_filter(p_filters, 'service_type') as service_type, public.service_kpi_filter(p_filters, 'priority') as priority,
  public.service_kpi_filter(p_filters, 'status') as status
),
prof as (select p.id, p.nombre_completo, public.service_staff_team(p.employee_type) as team from public.profiles p),
base as (
 select t.id, t.numero_caso, t.asunto, t.descripcion, t.estado::text as estado, t.creado_en, t.prioridad, t.reabre_ticket_id,
  t.numero_serie_equipo, public.normalize_equipment_serial(t.numero_serie_equipo) as serial_key,
  public.ticket_support_area(t.asunto) as area, t.nombre_cliente_guest
 from public.tickets t
 where not public.ticket_is_planning(t.descripcion)
),
eq as (
 select distinct on (b.id) b.id, e.modelo, c.razon_social, e.ciudad, e.municipio, e.estado as state_name, e.direccion
 from base b
 join public.equipos e on public.normalize_equipment_serial(e.numero_serie) = b.serial_key
 left join public.clientes c on c.id = e.cliente_id
 order by b.id, (e.fecha_fin is null) desc, e.actualizado_en desc nulls last
),
ev as (
 select e.ticket_id,
  min(e.occurred_at) filter (where e.kind = 'respuesta') as response_at,
  min(e.occurred_at) filter (where e.kind = 'cierre') as closed_at,
  min(e.closure_reason) filter (where e.kind = 'cierre') as closure_reason,
  bool_or(e.kind = 'justificacion') as justified
 from public.ticket_service_events e group by e.ticket_id
),
contacts as (
 select x.ticket_id, min(x.at_) as first_contact,
  count(distinct x.day_) filter (where x.visit) as visits, count(*) filter (where x.call) as calls
 from (
  select b.ticket_id, b.creado_en as at_, (b.creado_en at time zone (select tz from w))::date as day_, b.tipo = 'visita' as visit, b.tipo = 'llamada' as call
  from public.ticket_bitacora b where b.tipo in ('visita','llamada')
  union all
  select h.ticket_id, null, h.fecha_servicio, true, false
  from public.servicios_historial h
  where h.ticket_id is not null and public.service_history_kind(h.tipo_servicio, h.motivo) <> 'prueba'
  union all
  select r.service_ticket_id, null, coalesce(r.service_date, r.call_date), r.report_type::text = 'servicio', r.report_type::text = 'remoto'
  from public.service_reports r
  where r.service_ticket_id is not null and r.status::text <> 'borrador' and coalesce(r.external_source, '') <> 'sap_fsm'
 ) x group by x.ticket_id
),
asg as (
 select a.ticket_id, a.assigned_to, p.nombre_completo, p.team,
  greatest((select count(*) from public.ticket_assignment_history h where h.ticket_id = a.ticket_id)::integer - 1, 0) as reassignments
 from public.ticket_assignments a left join prof p on p.id = a.assigned_to
 where a.assigned_to is not null
),
reo as (select r.reabre_ticket_id as id, count(*) as n from public.tickets r where r.reabre_ticket_id is not null group by r.reabre_ticket_id),
facts as materialized (
 select b.*, eq.modelo, eq.razon_social, ev.response_at, ev.closed_at, ev.closure_reason, coalesce(ev.justified, false) as justified,
  least(ev.response_at, c.first_contact) as first_response_at, coalesce(c.visits, 0)::integer as visits, coalesce(c.calls, 0)::integer as calls,
  a.assigned_to, a.nombre_completo as responsible_name, a.team as responsible_team, coalesce(a.reassignments, 0) as reassignments,
  public.service_ticket_channel(b.asunto, b.descripcion, eq.razon_social) as channel,
  public.service_ticket_region(b.descripcion, eq.ciudad, eq.municipio, eq.state_name, eq.direccion) as region,
  parent.numero_caso as parent_folio, coalesce(reo.n, 0) > 0 as reopened,
  nullif(btrim((regexp_match(coalesce(b.descripcion, ''), '(?:^|\n)\s*Cliente(?:/Localidad|/Instituci[oó]n)?\s*:\s*([^\n]+)', 'i'))[1]), '') as described_client
 from base b
 left join eq on eq.id = b.id
 left join ev on ev.ticket_id = b.id
 left join contacts c on c.ticket_id = b.id
 left join asg a on a.ticket_id = b.id
 left join reo on reo.id = b.id
 left join public.tickets parent on parent.id = b.reabre_ticket_id
),
pol as (
 select fa.*, sp.policy
 from facts fa
 left join lateral (
  select p as policy from public.ticket_sla_policies p
  where p.active and (p.channel is null or p.channel = fa.channel) and (p.region is null or p.region = fa.region)
    and (p.area is null or p.area = fa.area) and (p.priority is null or p.priority = fa.prioridad)
  order by p.precedence, p.created_at, p.id limit 1
 ) sp on true
),
state as (
 select p.*, w.start_at, w.end_at, w.cut_at, w.cut_is_now, w.tz, w.granularity, w.capture_since,
  case
   when p.estado = 'cerrado' and p.closed_at is null then 'sin_fecha'
   when p.closed_at is null then null
   when p.closure_reason = 'administrativo' then 'cancelado'
   when p.closure_reason is null then 'sin_clasificar'
   else p.closure_reason end as closure_class,
  case
   when p.creado_en >= w.cut_at then 'no_existia'
   when p.closed_at is not null and p.closed_at <= w.cut_at then 'cerrado'
   when p.estado = 'cerrado' and p.closed_at is null then case when w.cut_is_now then 'cerrado' else 'desconocido' end
   else 'abierto' end as state_at_cut
 from pol p cross join w
),
sla as (
 select s.*,
  case when (s.policy).id is not null and s.state_at_cut in ('cerrado','abierto') and not (s.state_at_cut = 'cerrado' and s.closed_at is null)
   then public.service_sla_hours(s.id, s.creado_en, case when s.state_at_cut = 'cerrado' then s.closed_at else s.cut_at end, s.policy) end as sla_hours
 from state s
),
calc as (
 select s.*,
  case
   when s.state_at_cut = 'no_existia' then null
   when (s.policy).id is null then 'sin_plazo'
   when s.state_at_cut = 'cerrado' and s.closure_class = 'cancelado' then 'no_aplica'
   when s.state_at_cut = 'cerrado' and s.closed_at is null then 'no_evaluable'
   when s.state_at_cut = 'desconocido' then 'no_evaluable'
   when s.state_at_cut = 'cerrado' then case when s.sla_hours <= (s.policy).target_hours then 'dentro' else 'fuera' end
   else case when s.sla_hours > (s.policy).target_hours then 'vencido' else 'en_curso' end end as sla_result,
  s.creado_en >= s.start_at and s.creado_en < s.end_at as opened_in_period,
  s.closed_at is not null and s.closed_at >= s.start_at and s.closed_at < s.end_at as closed_in_period,
  case when s.state_at_cut = 'abierto' then round((extract(epoch from s.cut_at - s.creado_en) / 86400)::numeric, 1) end as age_days
 from sla s
)
select c.id, c.numero_caso, c.asunto,
 'soporte_' || coalesce(c.area, 'sin_especialidad'),
 coalesce(case when c.responsible_team in ('quimica','ingenieria','otro') then c.responsible_team end, c.area, 'sin_clasificar'),
 case when c.assigned_to is not null and c.responsible_team is not null then 'responsable' when c.area is not null then 'especialidad' else 'sin_dato' end,
 coalesce(c.prioridad, 'sin_prioridad'), c.channel, c.region, c.numero_serie_equipo, c.serial_key, c.modelo,
 coalesce(c.razon_social, c.described_client),
 c.assigned_to, c.responsible_name, c.reassignments, c.estado,
 c.creado_en, c.first_response_at,
 case when c.first_response_at >= c.creado_en then round((extract(epoch from c.first_response_at - c.creado_en) / 3600)::numeric, 2) end,
 c.first_response_at is not null,
 c.closed_at, c.closure_reason, c.closure_class,
 case when c.closure_class = 'solucionado' and c.closed_at >= c.creado_en then round((extract(epoch from c.closed_at - c.creado_en) / 3600)::numeric, 2) end,
 (c.policy).name, (c.policy).target_hours, (c.policy).clock, c.sla_hours, c.sla_result,
 c.closed_in_period and c.sla_result in ('dentro','fuera'), c.justified,
 c.reabre_ticket_id, c.parent_folio, c.reopened,
 c.closed_in_period and c.closure_class not in ('cancelado','sin_fecha') and c.closed_at >= c.capture_since,
 c.visits, c.calls,
 c.closed_in_period and c.closure_class = 'solucionado' and c.visits >= 1,
 c.closed_in_period and c.closure_class = 'solucionado' and c.visits = 1,
 c.opened_in_period, c.closed_in_period,
 public.service_kpi_bucket((c.creado_en at time zone c.tz)::date, c.granularity),
 public.service_kpi_bucket((c.closed_at at time zone c.tz)::date, c.granularity),
 c.state_at_cut, c.state_at_cut = 'abierto', c.state_at_cut = 'abierto' and c.sla_result = 'vencido',
 c.age_days,
 case when c.age_days is null then null when c.age_days < 1 then '0-1 d' when c.age_days < 3 then '1-3 d' when c.age_days < 7 then '3-7 d'
  when c.age_days < 15 then '7-15 d' when c.age_days < 30 then '15-30 d' else '30+ d' end,
 c.opened_in_period or c.closed_in_period or c.state_at_cut = 'abierto',
 lower(concat_ws(' ', c.numero_caso, c.asunto, c.numero_serie_equipo, c.razon_social, c.described_client, c.modelo, c.responsible_name, c.nombre_cliente_guest))
from calc c cross join f
where (f.team is null or f.team = coalesce(case when c.responsible_team in ('quimica','ingenieria','otro') then c.responsible_team end, c.area, 'sin_clasificar'))
 and (f.person is null or c.assigned_to = f.person)
 and (f.client is null or coalesce(c.razon_social, c.described_client) = f.client)
 and (f.platform is null or c.modelo = f.platform)
 and (f.serial_key is null or c.serial_key = f.serial_key)
 and (f.service_type is null or f.service_type = 'soporte_' || coalesce(c.area, 'sin_especialidad'))
 and (f.priority is null or f.priority = coalesce(c.prioridad, 'sin_prioridad'))
 and (f.status is null or f.status = c.estado)
$function$
;


CREATE OR REPLACE FUNCTION public.service_kpi_summary_data(p_filters jsonb, p_previous jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
with w as (select * from public.service_kpi_window(p_filters)),
periods(per) as (values ('current'::text), ('previous'::text)),
t_all as (select 'current'::text as per, x.* from public.service_kpi_ticket_rows(p_filters) x
 union all select 'previous'::text, x.* from public.service_kpi_ticket_rows(p_previous) x),
a_all as (select 'current'::text as per, x.* from public.service_kpi_activity_rows(p_filters) x where x.in_period
 union all select 'previous'::text, x.* from public.service_kpi_activity_rows(p_previous) x where x.in_period),
fl_all as (select 'current'::text as per, x.* from public.service_kpi_failure_rows(p_filters) x where x.in_period
 union all select 'previous'::text, x.* from public.service_kpi_failure_rows(p_previous) x where x.in_period),
pt_all as (select 'current'::text as per, x.* from public.service_kpi_part_rows(p_filters) x where x.in_period
 union all select 'previous'::text, x.* from public.service_kpi_part_rows(p_previous) x where x.in_period),
sv_all as (select 'current'::text as per, x.* from public.service_kpi_survey_rows(p_filters) x where x.in_period
 union all select 'previous'::text, x.* from public.service_kpi_survey_rows(p_previous) x where x.in_period),
t as (select * from t_all where per = 'current'),
a as (select * from a_all where per = 'current'),
fl as (select * from fl_all where per = 'current'),
pt as (select * from pt_all where per = 'current'),
sv as (select * from sv_all where per = 'current'),
core as (
 select p.per,
  (select jsonb_build_object(
    'tickets_opened', count(*) filter (where x.opened_in_period),
    'tickets_closed', count(*) filter (where x.closed_in_period),
    'tickets_cancelled', count(*) filter (where x.closed_in_period and x.closure_class = 'cancelado'),
    'sla_evaluable', count(*) filter (where x.sla_evaluable),
    'sla_on_time', count(*) filter (where x.closed_in_period and x.sla_result = 'dentro'),
    'sla_late', count(*) filter (where x.closed_in_period and x.sla_result = 'fuera'),
    'sla_late_justified', count(*) filter (where x.closed_in_period and x.sla_result = 'fuera' and x.justified),
    'sla_no_policy', count(*) filter (where x.closed_in_period and x.sla_result = 'sin_plazo'),
    'sla_compliance', public.service_kpi_ratio(count(*) filter (where x.closed_in_period and x.sla_result = 'dentro'), count(*) filter (where x.sla_evaluable)),
    'late_rate', public.service_kpi_ratio(count(*) filter (where x.closed_in_period and x.sla_result = 'fuera'), count(*) filter (where x.sla_evaluable)),
    'first_response_base', count(*) filter (where x.opened_in_period),
    'first_response_n', count(*) filter (where x.opened_in_period and x.first_response_hours is not null),
    'first_response_avg', round(avg(x.first_response_hours) filter (where x.opened_in_period), 2),
    'first_response_median', round((percentile_cont(0.5) within group (order by x.first_response_hours) filter (where x.opened_in_period and x.first_response_hours is not null))::numeric, 2),
    'resolution_n', count(*) filter (where x.closed_in_period and x.resolution_hours is not null),
    'resolution_avg', round(avg(x.resolution_hours) filter (where x.closed_in_period), 2),
    'resolution_median', round((percentile_cont(0.5) within group (order by x.resolution_hours) filter (where x.closed_in_period and x.resolution_hours is not null))::numeric, 2),
    'resolution_p90', round((percentile_cont(0.9) within group (order by x.resolution_hours) filter (where x.closed_in_period and x.resolution_hours is not null))::numeric, 2),
    'pending_at_cut', count(*) filter (where x.pending_at_cut),
    'overdue_at_cut', count(*) filter (where x.overdue_at_cut),
    'unknown_at_cut', count(*) filter (where x.state_at_cut = 'desconocido'),
    'unassigned_pending', count(*) filter (where x.pending_at_cut and x.responsible_id is null),
    'reopen_rate', public.service_kpi_ratio(count(*) filter (where x.reopen_evaluable and x.reopened), count(*) filter (where x.reopen_evaluable)),
    'ftf_rate', public.service_kpi_ratio(count(*) filter (where x.ftf_eligible and x.ftf_ok), count(*) filter (where x.ftf_eligible))
   ) from t_all x where x.per = p.per)
  || (select jsonb_build_object(
    'trainings_total', count(*) filter (where x.counts_training),
    'trainings', count(*) filter (where x.training_kind = 'capacitacion'),
    'retrainings', count(*) filter (where x.training_kind = 'recapacitacion'),
    'trainings_done', count(*) filter (where x.counts_training and x.done),
    'trainings_pending', count(*) filter (where x.counts_training and x.plan_status = 'pendiente'),
    'trainings_overdue', count(*) filter (where x.counts_training and x.plan_status in ('vencido','cerrado_sin_evidencia')),
    'visits', count(*) filter (where x.is_visit),
    'visits_with_failure', count(*) filter (where x.is_visit and cardinality(x.failure_codes) > 0),
    'calls', count(*) filter (where x.is_call),
    'calls_with_duration', count(*) filter (where x.is_call and x.has_duration),
    'call_minutes_avg', round(avg(x.duration_min) filter (where x.is_call), 1),
    'call_minutes_total', sum(x.duration_min) filter (where x.is_call),
    'calls_resolved_rate', public.service_kpi_ratio(count(*) filter (where x.is_call and x.result = 'resuelto'), count(*) filter (where x.is_call and x.has_result)),
    'preventive_programmed', count(*) filter (where x.is_planned and x.kind = 'preventivo'),
    'preventive_done', count(*) filter (where x.is_planned and x.kind = 'preventivo' and x.plan_status = 'realizado'),
    'preventive_pending', count(*) filter (where x.is_planned and x.kind = 'preventivo' and x.plan_status = 'pendiente'),
    'preventive_overdue', count(*) filter (where x.is_planned and x.kind = 'preventivo' and x.plan_status = 'vencido'),
    'preventive_no_evidence', count(*) filter (where x.is_planned and x.kind = 'preventivo' and x.plan_status = 'cerrado_sin_evidencia'),
    'preventive_compliance', public.service_kpi_ratio(count(*) filter (where x.is_planned and x.kind = 'preventivo' and x.plan_status = 'realizado'), count(*) filter (where x.is_planned and x.kind = 'preventivo')),
    'preventive_off_schedule', count(*) filter (where x.preventive_off_schedule),
    'preventive_executed', count(*) filter (where x.is_visit and 'preventivo' = any(x.kinds)),
    'corrective', count(*) filter (where x.is_visit and 'correctivo' = any(x.kinds)),
    'maintenance_visits', count(*) filter (where x.is_maintenance_visit),
    'corrective_share', public.service_kpi_ratio(count(*) filter (where x.is_visit and 'correctivo' = any(x.kinds)), count(*) filter (where x.is_maintenance_visit))
   ) from a_all x where x.per = p.per)
  || (select jsonb_build_object(
    'failure_events', count(*),
    'recurrence_rate', public.service_kpi_ratio(count(*) filter (where x.recurred), count(*) filter (where x.recurrence_evaluable))
   ) from fl_all x where x.per = p.per)
  || (select jsonb_build_object(
    'parts_lines', count(*),
    'parts_qty', coalesce(sum(x.quantity), 0),
    'parts_qty_preventive', coalesce(sum(x.quantity) filter (where x.maintenance_kind = 'preventivo'), 0),
    'parts_qty_corrective', coalesce(sum(x.quantity) filter (where x.maintenance_kind = 'correctivo'), 0),
    'parts_cost_lines', count(*) filter (where x.has_cost),
    'parts_cost_total', sum(x.line_cost) filter (where x.has_cost)
   ) from pt_all x where x.per = p.per)
  || (select jsonb_build_object(
    'surveys', count(*),
    'csat', public.service_kpi_ratio(count(*) filter (where x.satisfaction >= 4), count(*)),
    'satisfaction_avg', round(avg(x.satisfaction), 2),
    'resolution_total_rate', public.service_kpi_ratio(count(*) filter (where x.resolution = 'total'), count(*))
   ) from sv_all x where x.per = p.per) as j
 from periods p
),
b as (
 select g::date as bucket from w,
 generate_series(public.service_kpi_bucket(w.from_date, w.granularity), public.service_kpi_bucket(w.to_date, w.granularity),
  case w.granularity when 'week' then interval '1 week' when 'quarter' then interval '3 months' else interval '1 month' end) as g
),
team_filter as (select public.service_kpi_filter(p_filters, 'team') as team, public.service_kpi_filter(p_filters, 'person')::uuid as person),
staff as (
 select p.id, p.nombre_completo as name, public.service_staff_team(p.employee_type) as team
 from public.profiles p, team_filter tf
 where p.rol::text in ('admin','tecnico')
   and (tf.person is null or p.id = tf.person)
   and (tf.team is null or public.service_staff_team(p.employee_type) = tf.team
     or exists (select 1 from t where t.responsible_id = p.id and t.relevant)
     or exists (select 1 from a where p.id = any(a.participant_ids)))
),
cat as (select c.catalog_kind, c.catalog_code, c.catalog_detail from public.catalogo_servicio c),
plan as (select * from public.service_kpi_plan_records()),
hist as (select public.service_history_kind(h.tipo_servicio, h.motivo) as kind, h.fecha_servicio from public.servicios_historial h)
select jsonb_build_object(
 'current', (select core.j from core where core.per = 'current'),
 'previous', (select core.j from core where core.per = 'previous'),
 'series', (select coalesce(jsonb_agg(jsonb_build_object(
 'bucket', b.bucket,
 'opened', (select count(*) from t where opened_in_period and opened_bucket = b.bucket),
 'closed', (select count(*) from t where closed_in_period and closed_bucket = b.bucket),
 'sla_evaluable', (select count(*) from t where sla_evaluable and closed_bucket = b.bucket),
 'closed_late', (select count(*) from t where closed_in_period and sla_result = 'fuera' and closed_bucket = b.bucket),
 'trainings', (select count(*) from a where training_kind = 'capacitacion' and a.bucket = b.bucket),
 'retrainings', (select count(*) from a where training_kind = 'recapacitacion' and a.bucket = b.bucket),
 'visits', (select count(*) from a where is_visit and a.bucket = b.bucket),
 'calls', (select count(*) from a where is_call and a.bucket = b.bucket),
 'preventive_programmed', (select count(*) from a where is_planned and kind = 'preventivo' and a.bucket = b.bucket),
 'preventive_done', (select count(*) from a where is_planned and kind = 'preventivo' and plan_status = 'realizado' and a.bucket = b.bucket),
 'preventive_off_schedule', (select count(*) from a where preventive_off_schedule and a.bucket = b.bucket),
 'preventive_executed', (select count(*) from a where is_visit and 'preventivo' = any(kinds) and a.bucket = b.bucket),
 'corrective', (select count(*) from a where is_visit and 'correctivo' = any(kinds) and a.bucket = b.bucket),
 'maintenance_visits', (select count(*) from a where is_maintenance_visit and a.bucket = b.bucket),
 'failure_events', (select count(*) from fl where fl.bucket = b.bucket)
) order by b.bucket), '[]'::jsonb)
from b),
 'breakdowns', (select jsonb_build_object(
 'staff', coalesce((select jsonb_agg(x order by x->>'name') from (
   select jsonb_build_object('id', s.id, 'name', coalesce(s.name, 'Sin nombre'), 'team', coalesce(s.team, 'sin_clasificar'),
    'tickets_relevant', (select count(*) from t where t.responsible_id = s.id and t.relevant),
    'tickets_opened', (select count(*) from t where t.responsible_id = s.id and t.opened_in_period),
    'tickets_closed', (select count(*) from t where t.responsible_id = s.id and t.closed_in_period),
    'sla_evaluable', (select count(*) from t where t.responsible_id = s.id and t.sla_evaluable),
    'sla_late', (select count(*) from t where t.responsible_id = s.id and t.closed_in_period and t.sla_result = 'fuera'),
    'pending_at_cut', (select count(*) from t where t.responsible_id = s.id and t.pending_at_cut),
    'overdue_at_cut', (select count(*) from t where t.responsible_id = s.id and t.overdue_at_cut),
    'pending_by_priority', (select coalesce(jsonb_object_agg(pr, n), '{}'::jsonb) from (select t.priority as pr, count(*) as n from t where t.responsible_id = s.id and t.pending_at_cut group by t.priority) q),
    'pending_by_type', (select coalesce(jsonb_object_agg(ty, n), '{}'::jsonb) from (select t.service_type as ty, count(*) as n from t where t.responsible_id = s.id and t.pending_at_cut group by t.service_type) q),
    'resolution_median', (select round(percentile_cont(0.5) within group (order by t.resolution_hours)::numeric, 2) from t where t.responsible_id = s.id and t.closed_in_period and t.resolution_hours is not null),
    'trainings', (select count(*) from a where s.id = any(a.participant_ids) and a.counts_training),
    'trainings_done', (select count(*) from a where s.id = any(a.participant_ids) and a.counts_training and a.done),
    'visits', (select count(*) from a where s.id = any(a.participant_ids) and a.is_visit),
    'calls', (select count(*) from a where s.id = any(a.participant_ids) and a.is_call),
    'call_minutes', (select sum(a.duration_min) from a where s.id = any(a.participant_ids) and a.is_call),
    'preventive_programmed', (select count(*) from a where s.id = any(a.participant_ids) and a.is_planned and a.kind = 'preventivo'),
    'preventive_done', (select count(*) from a where s.id = any(a.participant_ids) and a.is_planned and a.kind = 'preventivo' and a.plan_status = 'realizado'),
    'corrective', (select count(*) from a where s.id = any(a.participant_ids) and a.is_visit and 'correctivo' = any(a.kinds)),
    'surveys', (select count(*) from sv where sv.specialist_id = s.id),
    'satisfaction_avg', (select round(avg(sv.satisfaction), 2) from sv where sv.specialist_id = s.id)
   ) as x from staff s) q), '[]'::jsonb),
 'aging', coalesce((select jsonb_agg(jsonb_build_object('bucket', g.bucket, 'total', (select count(*) from t where t.pending_at_cut and t.age_bucket = g.bucket),
    'overdue', (select count(*) from t where t.overdue_at_cut and t.age_bucket = g.bucket)) order by g.ord)
   from (values (1, '0-1 d'), (2, '1-3 d'), (3, '3-7 d'), (4, '7-15 d'), (5, '15-30 d'), (6, '30+ d')) as g(ord, bucket)), '[]'::jsonb),
 'resolution_by', coalesce((select jsonb_agg(jsonb_build_object('service_type', q.service_type, 'priority', q.priority, 'n', q.n, 'avg', q.avg, 'median', q.median, 'p90', q.p90)
    order by q.service_type, q.priority)
   from (select t.service_type, t.priority, count(*) as n, round(avg(t.resolution_hours), 2) as avg,
     round(percentile_cont(0.5) within group (order by t.resolution_hours)::numeric, 2) as median,
     round(percentile_cont(0.9) within group (order by t.resolution_hours)::numeric, 2) as p90
    from t where t.closed_in_period and t.resolution_hours is not null group by t.service_type, t.priority) q), '[]'::jsonb),
 'trainings_by_client', coalesce((select jsonb_agg(jsonb_build_object('label', q.label, 'capacitacion', q.c, 'recapacitacion', q.r, 'done', q.d) order by q.c + q.r desc, q.label)
   from (select coalesce(a.client, 'Sin cliente identificado') as label, count(*) filter (where a.training_kind = 'capacitacion') as c,
     count(*) filter (where a.training_kind = 'recapacitacion') as r, count(*) filter (where a.done) as d
    from a where a.counts_training group by 1) q), '[]'::jsonb),
 'trainings_by_platform', coalesce((select jsonb_agg(jsonb_build_object('label', q.label, 'capacitacion', q.c, 'recapacitacion', q.r, 'done', q.d) order by q.c + q.r desc, q.label)
   from (select coalesce(a.platform, 'Sin plataforma') as label, count(*) filter (where a.training_kind = 'capacitacion') as c,
     count(*) filter (where a.training_kind = 'recapacitacion') as r, count(*) filter (where a.done) as d
    from a where a.counts_training group by 1) q), '[]'::jsonb),
 'visits_by_kind', coalesce((select jsonb_agg(jsonb_build_object('label', q.kind, 'n', q.n) order by q.n desc, q.kind)
   from (select a.kind, count(*) as n from a where a.is_visit group by a.kind) q), '[]'::jsonb),
 'visits_by_result', coalesce((select jsonb_agg(jsonb_build_object('label', q.result, 'n', q.n) order by q.n desc, q.result)
   from (select coalesce(a.result, 'sin_dato') as result, count(*) as n from a where a.is_visit group by 1) q), '[]'::jsonb),
 'calls_by_reason', coalesce((select jsonb_agg(jsonb_build_object('label', q.reason, 'n', q.n, 'minutes', q.m) order by q.n desc, q.reason)
   from (select coalesce(a.reason, 'sin_dato') as reason, count(*) as n, sum(a.duration_min) as m from a where a.is_call group by 1) q), '[]'::jsonb),
 'calls_by_result', coalesce((select jsonb_agg(jsonb_build_object('label', q.result, 'n', q.n) order by q.n desc, q.result)
   from (select coalesce(a.result, 'sin_dato') as result, count(*) as n from a where a.is_call group by 1) q), '[]'::jsonb),
 'failures_top', coalesce((select jsonb_agg(jsonb_build_object('code', q.code, 'label', q.label, 'n', q.n) order by q.n desc, q.code)
   from (select fl.failure_code as code, max(fl.failure_label) as label, count(*) as n from fl group by fl.failure_code order by count(*) desc, fl.failure_code limit 15) q), '[]'::jsonb),
 'failure_solution', coalesce((select jsonb_agg(jsonb_build_object('failure', q.failure, 'failure_label', q.fl, 'solution', q.solution, 'solution_label', q.sl,
    'n', q.n, 'evaluable', q.ev, 'recurred', q.rc, 'effectiveness', case when q.ev = 0 then null else round(100.0 * (q.ev - q.rc) / q.ev, 1) end,
    'small_sample', q.ev < w.min_sample) order by q.n desc, q.failure, q.solution)
   from (select fl.failure_code as failure, max(fl.failure_label) as fl, coalesce(s.code, 'sin_solucion') as solution,
     max(c.catalog_detail) as sl, count(*) as n, count(*) filter (where fl.recurrence_evaluable) as ev, count(*) filter (where fl.recurred) as rc
    from fl left join lateral unnest(case when cardinality(fl.solution_codes) = 0 then array[null::text] else fl.solution_codes end) as s(code) on true
    left join cat c on c.catalog_kind = 'solucion' and c.catalog_code = s.code
    group by fl.failure_code, coalesce(s.code, 'sin_solucion')) q), '[]'::jsonb),
 'corrective_by_platform', coalesce((select jsonb_agg(jsonb_build_object('label', q.label, 'n', q.n) order by q.n desc, q.label)
   from (select coalesce(a.platform, 'Sin plataforma') as label, count(*) as n from a where a.is_visit and 'correctivo' = any(a.kinds) group by 1) q), '[]'::jsonb),
 'corrective_by_client', coalesce((select jsonb_agg(jsonb_build_object('label', q.label, 'n', q.n) order by q.n desc, q.label)
   from (select coalesce(a.client, 'Sin cliente identificado') as label, count(*) as n from a where a.is_visit and 'correctivo' = any(a.kinds) group by 1 order by count(*) desc, 1 limit 15) q), '[]'::jsonb),
 'corrective_by_serial', coalesce((select jsonb_agg(jsonb_build_object('label', q.label, 'platform', q.platform, 'client', q.client, 'n', q.n) order by q.n desc, q.label)
   from (select coalesce(a.serial, 'Sin serie') as label, max(a.platform) as platform, max(a.client) as client, count(*) as n
    from a where a.is_visit and 'correctivo' = any(a.kinds) group by 1 order by count(*) desc, 1 limit 15) q), '[]'::jsonb),
 'parts_by_platform', coalesce((select jsonb_agg(jsonb_build_object('platform', q.platform, 'kind', q.kind, 'lines', q.lines, 'qty', q.qty, 'cost_lines', q.cl, 'cost', q.cost)
    order by q.platform, q.kind)
   from (select coalesce(pt.platform, 'Sin plataforma') as platform, pt.maintenance_kind as kind, count(*) as lines, sum(pt.quantity) as qty,
     count(*) filter (where pt.has_cost) as cl, sum(pt.line_cost) as cost from pt group by 1, 2) q), '[]'::jsonb),
 'parts_top', coalesce((select jsonb_agg(jsonb_build_object('code', q.code, 'description', q.description, 'qty', q.qty, 'preventive', q.pv, 'corrective', q.cr) order by q.qty desc, q.code)
   from (select coalesce(pt.code, 'Sin código') as code, max(pt.description) as description, sum(pt.quantity) as qty,
     sum(pt.quantity) filter (where pt.maintenance_kind = 'preventivo') as pv, sum(pt.quantity) filter (where pt.maintenance_kind = 'correctivo') as cr
    from pt group by 1 order by sum(pt.quantity) desc, 1 limit 15) q), '[]'::jsonb)
)
from w),
 'quality', (select jsonb_build_object(
 'capture_since', (select capture_since from w),
 'tickets_without_closure_date', (select count(*) from t where closure_class = 'sin_fecha'),
 'tickets_without_priority', (select count(*) from t where relevant and priority = 'sin_prioridad'),
 'tickets_without_responsible', (select count(*) from t where relevant and responsible_id is null),
 'tickets_without_first_response', (select count(*) from t where opened_in_period and first_response_at is null),
 'closures_unclassified', (select count(*) from t where closed_in_period and closure_class = 'sin_clasificar'),
 'planning_without_date', (select count(*) from plan where prog_date is null),
 'planning_unmatched_names', (select count(distinct x) from plan cross join lateral regexp_split_to_table(coalesce(plan.unmatched, ''), ' / ') as x where x <> ''),
 'activities_team_inferred', (select count(*) from a where in_period and team_inferred),
 'history_test_records', (select count(*) from hist where kind = 'prueba'),
 'history_unclassified', (select count(*) from hist where kind = 'sin_clasificar'),
 'history_invalid_date', (select count(*) from hist where kind <> 'prueba' and (fecha_servicio is null or fecha_servicio < date '2000-01-01' or fecha_servicio > w.today)),
 'calls_without_duration', (select count(*) from a where in_period and is_call and not has_duration),
 'calls_without_result', (select count(*) from a where in_period and is_call and not has_result),
 'visits_without_result', (select count(*) from a where in_period and is_visit and not has_result),
 'surveys_answered_total', (select count(*) from public.ticket_satisfaction s where s.answered_at is not null and not s.is_test)
)
from w)
)
$function$
;


-- [reloj] Atajo para reloj corrido sin pausas en el cálculo de horas de plazo.
CREATE OR REPLACE FUNCTION public.service_sla_hours(p_ticket_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_policy ticket_sla_policies)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare v_total numeric; v_paused numeric := 0; r record;
begin
 if p_policy.id is null or p_end is null or p_end < p_start then return null; end if;
 -- Horas corridas sin pausas (las tres reglas actuales): mismo resultado que service_clock_hours sin
 -- pasar por esa función SQL, que no se puede "inline" y costaba ~0.2 ms por ticket.
 if p_policy.clock = 'corridas' and coalesce(cardinality(p_policy.pause_states), 0) = 0 then
   return round(greatest(case when p_end <= p_start then 0::numeric else (extract(epoch from p_end - p_start) / 3600)::numeric end, 0), 2);
 end if;
 v_total := public.service_clock_hours(p_start, p_end, p_policy.clock, p_policy.timezone, p_policy.business_start, p_policy.business_end, p_policy.business_days);
 if cardinality(p_policy.pause_states) > 0 then
   for r in
     with changes as (
       select greatest(h.changed_at, p_start) as from_at, h.estado::text as state, h.changed_at
       from public.ticket_state_history h
       where h.ticket_id = p_ticket_id and h.changed_at < p_end
         and h.changed_at >= coalesce((select max(h2.changed_at) from public.ticket_state_history h2
                                       where h2.ticket_id = p_ticket_id and h2.changed_at <= p_start), '-infinity'::timestamptz)
     )
     select c.from_at, lead(c.from_at, 1, p_end) over (order by c.changed_at) as to_at, c.state from changes c
   loop
     if r.state = any(p_policy.pause_states) and r.to_at > r.from_at then
       v_paused := v_paused + public.service_clock_hours(r.from_at, r.to_at, p_policy.clock, p_policy.timezone, p_policy.business_start, p_policy.business_end, p_policy.business_days);
     end if;
   end loop;
 end if;
 return round(greatest(v_total - v_paused, 0), 2);
end; $function$
;
