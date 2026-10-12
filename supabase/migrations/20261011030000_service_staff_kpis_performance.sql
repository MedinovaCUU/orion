-- Rendimiento de service_kpi_activity_rows (20261011020000): misma definición y mismas filas, con
-- uniones por equipo y mes en lugar de subconsultas por fila entre planeación y visitas. En
-- producción el conjunto tardaba ~0,9 s y se calcula dos veces por consulta (periodo actual y anterior).
create or replace function public.service_kpi_activity_rows(p_filters jsonb default '{}'::jsonb)
returns table (
 activity_id text, category text, source text, kind text, kinds text[], unplanned_kinds text[],
 is_planned boolean, is_visit boolean, is_call boolean, is_maintenance_visit boolean,
 training_kind text, counts_training boolean, preventive_off_schedule boolean,
 plan_status text, evidence text, done boolean,
 activity_date date, bucket date, in_period boolean,
 ticket_id uuid, folio text,
 participant_ids uuid[], participant_names text, unmatched_names text, teams text[], team_inferred boolean,
 serial text, serial_key text, platform text, client text, priority text,
 reason text, result text, has_result boolean, duration_min integer, has_duration boolean,
 failure_codes text[], failure_labels text, solution_codes text[], solution_labels text,
 records integer, search_text text)
language sql stable set search_path = public as $$
with w as (select * from public.service_kpi_window(p_filters)),
f as (
 select public.service_kpi_filter(p_filters, 'team') as team, public.service_kpi_filter(p_filters, 'person')::uuid as person,
  public.service_kpi_filter(p_filters, 'client') as client, public.service_kpi_filter(p_filters, 'platform') as platform,
  public.normalize_equipment_serial(public.service_kpi_filter(p_filters, 'serial')) as serial_key,
  public.service_kpi_filter(p_filters, 'service_type') as service_type, public.service_kpi_filter(p_filters, 'priority') as priority
),
prof as (select p.id, p.nombre_completo, public.service_staff_team(p.employee_type) as team from public.profiles p),
eqs as (
 select distinct on (public.normalize_equipment_serial(e.numero_serie)) public.normalize_equipment_serial(e.numero_serie) as serial_key, e.modelo, c.razon_social
 from public.equipos e left join public.clientes c on c.id = e.cliente_id
 where public.normalize_equipment_serial(e.numero_serie) is not null
 order by public.normalize_equipment_serial(e.numero_serie), (e.fecha_fin is null) desc, e.actualizado_en desc nulls last
),
cat as (select c.catalog_kind, c.catalog_code, c.catalog_detail from public.catalogo_servicio c),
tk as (select t.id, t.numero_caso, t.prioridad, public.ticket_support_area(t.asunto) as area from public.tickets t),
ex as (select e.* from w cross join lateral public.service_kpi_exec_records(w.tz) e where e.kind <> 'prueba'),
vis_src as (
 select e.*, coalesce(e.serial_key, 'T:' || e.ticket_id::text, e.rid) || '|' || coalesce(e.act_date::text, 'sin-fecha:' || e.rid) as vkey
 from ex e where e.is_visit
),
vis_people as (select v.vkey, array_agg(distinct p) as ids from vis_src v cross join lateral unnest(v.people) as p group by v.vkey),
vis as (
 select v.vkey, string_agg(distinct v.source, ' + ') as sources,
  (array_agg(v.ticket_id order by v.created_ts) filter (where v.ticket_id is not null))[1] as ticket_id,
  max(v.serial_key) as serial_key, max(v.serial) as serial, min(v.act_date) as act_date,
  array_agg(distinct v.kind) as kinds, string_agg(distinct v.unmatched, ' / ') as unmatched,
  left(string_agg(distinct v.reason, ' · '), 400) as reason,
  (array_agg(v.result order by v.created_ts desc) filter (where v.result is not null))[1] as result,
  sum(v.duration_min)::integer as duration_min,
  coalesce(array_agg(distinct v.failure_code) filter (where v.failure_code is not null), '{}') as failure_codes,
  coalesce(array_agg(distinct v.solution_code) filter (where v.solution_code is not null), '{}') as solution_codes,
  count(*)::integer as records
 from vis_src v group by v.vkey
),
plan as (select p.*, date_trunc('month', p.prog_date)::date as prog_month from public.service_kpi_plan_records() p),
vis_month as (select v.vkey, v.serial_key, v.act_date, v.sources, v.kinds, date_trunc('month', v.act_date)::date as act_month from vis v where v.serial_key is not null and v.act_date is not null),
plan_match as (
 select distinct on (pl.ticket_id) pl.ticket_id, v.vkey as matched_vkey, v.act_date as matched_date, v.sources as matched_sources
 from plan pl join vis_month v on v.serial_key = pl.serial_key and v.act_month = pl.prog_month
 where pl.kind = any(v.kinds) or pl.kind in ('visita','ingenieria_soporte','otro')
 order by pl.ticket_id, v.act_date
),
plan_eval as (select pl.*, pm.matched_vkey, pm.matched_date, pm.matched_sources from plan pl left join plan_match pm on pm.ticket_id = pl.ticket_id),
-- Kinds of each visit without a programmed service of the same kind, equipment and month.
vis_unplanned as (
 select v.vkey, array_agg(k order by k) as kinds
 from vis_month v cross join lateral unnest(v.kinds) as k
 where not exists (select 1 from plan pl where pl.serial_key = v.serial_key and pl.prog_month = v.act_month and pl.kind = k)
 group by v.vkey
),
plan_rows as (
 select 'plan:' || pe.ticket_id::text as activity_id, 'programada'::text as category, 'Planeación'::text as source,
  pe.kind, array[pe.kind] as kinds, '{}'::text[] as unplanned_kinds,
  true as is_planned, false as is_visit, false as is_call, false as is_maintenance_visit,
  case when pe.kind in ('capacitacion','recapacitacion') then pe.kind end as training_kind,
  case
   when pe.closure_reason = 'solucionado' then 'realizado'
   when coalesce(pe.meta->'status_values', '[]'::jsonb) ? 'realizado' then 'realizado'
   when pe.matched_vkey is not null then 'realizado'
   when pe.estado = 'cerrado' then 'cerrado_sin_evidencia'
   when pe.prog_date is null then 'sin_fecha'
   when pe.prog_date < (select cut_date from w) then 'vencido'
   else 'pendiente' end as plan_status,
  case
   when pe.closure_reason = 'solucionado' then 'Cierre registrado como solucionado'
   when coalesce(pe.meta->'status_values', '[]'::jsonb) ? 'realizado' then 'Marcado como realizado en la planeación'
   when pe.matched_vkey is not null then 'Visita registrada el ' || to_char(pe.matched_date, 'DD/MM/YYYY') || ' (' || pe.matched_sources || ')'
   when pe.estado = 'cerrado' then 'Cerrado sin registro de ejecución'
   end as evidence,
  pe.prog_date as activity_date, pe.ticket_id, pe.folio, pe.participant_ids, pe.unmatched,
  pe.serial, pe.serial_key,
  coalesce(eqs.modelo, nullif(upper(btrim(split_part(pe.asunto, ' - ', 2))), '')) as platform,
  coalesce(eqs.razon_social, nullif(btrim((regexp_match(coalesce(pe.descripcion, ''), '(?:^|\n)\s*Cliente(?:/Localidad)?\s*:\s*([^\n]+)', 'i'))[1]), ''),
   nullif(btrim(split_part(pe.asunto, ' - ', 3)), '')) as client,
  coalesce(nullif(lower(btrim(pe.meta->>'priority_csv')), ''), 'sin_prioridad') as priority,
  nullif(btrim((regexp_match(coalesce(pe.descripcion, ''), '(?:^|\n)\s*Observaciones\s*:\s*([^\n]+)', 'i'))[1]), '') as reason,
  null::text as result, null::integer as duration_min, '{}'::text[] as failure_codes, '{}'::text[] as solution_codes, 1 as records
 from plan_eval pe left join eqs on eqs.serial_key = pe.serial_key
),
vis_rows as (
 select 'visita:' || v.vkey, 'visita'::text, v.sources,
  (select k from unnest(v.kinds) k order by array_position(array['correctivo','preventivo','instalacion','capacitacion','recapacitacion','reacondicionamiento','retiro','otro','visita','sin_clasificar'], k) limit 1),
  v.kinds,
  case when v.serial_key is null or v.act_date is null then v.kinds else coalesce(vu.kinds, '{}'::text[]) end,
  false, true, false, v.kinds && array['preventivo','correctivo'],
  null::text, null::text, null::text,
  v.act_date, v.ticket_id, tk.numero_caso, coalesce(vp.ids, '{}'::uuid[]), v.unmatched,
  v.serial, v.serial_key, eqs.modelo, eqs.razon_social, coalesce(tk.prioridad, 'sin_prioridad'),
  v.reason, v.result, v.duration_min, v.failure_codes, v.solution_codes, v.records
 from vis v left join vis_people vp on vp.vkey = v.vkey left join vis_unplanned vu on vu.vkey = v.vkey
 left join eqs on eqs.serial_key = v.serial_key left join tk on tk.id = v.ticket_id
),
call_rows as (
 select 'llamada:' || e.rid, 'llamada'::text, e.source, 'llamada'::text, array['llamada'], '{}'::text[],
  false, false, true, false, null::text, null::text, null::text,
  e.act_date, e.ticket_id, tk.numero_caso, e.people, e.unmatched,
  e.serial, e.serial_key, eqs.modelo, eqs.razon_social, coalesce(tk.prioridad, 'sin_prioridad'),
  e.reason, e.result, e.duration_min,
  case when e.failure_code is null then '{}'::text[] else array[e.failure_code] end,
  case when e.solution_code is null then '{}'::text[] else array[e.solution_code] end, 1
 from ex e left join eqs on eqs.serial_key = e.serial_key left join tk on tk.id = e.ticket_id
 where e.is_call
),
unioned as (
 select * from plan_rows
 union all
 select * from vis_rows
 union all
 select * from call_rows
),
shaped as (
 select u.*,
  case when u.is_planned then u.training_kind
   when u.is_visit then (select k from unnest(u.unplanned_kinds) k where k in ('capacitacion','recapacitacion') order by k limit 1) end as training_kind2,
  array(select distinct pr.team from prof pr where pr.id = any(u.participant_ids) and pr.team is not null) as people_teams,
  (select string_agg(pr.nombre_completo, ' / ' order by pr.nombre_completo) from prof pr where pr.id = any(u.participant_ids)) as participant_names,
  tk.area as ticket_area
 from unioned u left join tk on tk.id = u.ticket_id
)
select s.activity_id, s.category, s.source, s.kind, s.kinds, s.unplanned_kinds,
 s.is_planned, s.is_visit, s.is_call, s.is_maintenance_visit,
 s.training_kind2, s.training_kind2 is not null,
 s.is_visit and 'preventivo' = any(s.unplanned_kinds),
 s.plan_status, s.evidence, case when s.is_planned then s.plan_status = 'realizado' else true end,
 s.activity_date, public.service_kpi_bucket(s.activity_date, w.granularity),
 coalesce(s.activity_date between w.from_date and w.to_date, false),
 s.ticket_id, s.folio, s.participant_ids, s.participant_names, s.unmatched,
 case when cardinality(s.people_teams) > 0 then s.people_teams else array[coalesce(s.ticket_area, public.service_kind_team(s.kind))] end,
 cardinality(s.people_teams) = 0,
 s.serial, s.serial_key, s.platform, s.client, s.priority,
 s.reason, s.result, s.result is not null, s.duration_min, s.duration_min is not null,
 s.failure_codes,
 (select string_agg(x || coalesce(' · ' || c.catalog_detail, ''), ' | ' order by x) from unnest(s.failure_codes) x left join cat c on c.catalog_kind = 'averia' and c.catalog_code = x),
 s.solution_codes,
 (select string_agg(x || coalesce(' · ' || c.catalog_detail, ''), ' | ' order by x) from unnest(s.solution_codes) x left join cat c on c.catalog_kind = 'solucion' and c.catalog_code = x),
 s.records,
 lower(concat_ws(' ', s.folio, s.source, s.kind, s.serial, s.platform, s.client, s.participant_names, s.unmatched, s.reason, array_to_string(s.failure_codes, ' '), array_to_string(s.solution_codes, ' ')))
from shaped s cross join w cross join f
where (f.team is null or f.team = any(case when cardinality(s.people_teams) > 0 then s.people_teams else array[coalesce(s.ticket_area, public.service_kind_team(s.kind))] end))
 and (f.person is null or f.person = any(s.participant_ids))
 and (f.client is null or s.client = f.client)
 and (f.platform is null or s.platform = f.platform)
 and (f.serial_key is null or s.serial_key = f.serial_key)
 and (f.service_type is null or f.service_type = any(s.kinds))
 and (f.priority is null or f.priority = s.priority)
$$;
revoke all on function public.service_kpi_activity_rows(jsonb) from public, anon, authenticated;
