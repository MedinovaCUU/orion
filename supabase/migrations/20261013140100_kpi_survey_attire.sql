-- Indicadores del personal: presentación (bata de laboratorio y gafete) de la encuesta de satisfacción.
-- Las filas de encuesta exponen attire; la tarjeta usa solo respuestas de visitas en sitio (both, coat,
-- badge, none): «no hubo visita» y las encuestas sin la pregunta quedan fuera del denominador.
-- service_kpi_summary_data no cambia: el resumen agrega las proporciones al periodo actual y al
-- anterior, y la proporción por especialista al desglose del personal.

drop function public.service_kpi_survey_rows(jsonb);
create function public.service_kpi_survey_rows(p_filters jsonb default '{}'::jsonb)
returns table (
 survey_id uuid, ticket_id uuid, folio text, specialist_id uuid, specialist_name text, team text,
 answered_at timestamptz, answered_date date, bucket date, in_period boolean,
 satisfaction smallint, speed smallint, clarity smallint, resolution text, improvement text, comment text,
 serial text, platform text, client text, priority text, search_text text, attire text)
language sql stable set search_path = public as $$
with w as (select * from public.service_kpi_window(p_filters)),
f as (
 select public.service_kpi_filter(p_filters, 'team') as team, public.service_kpi_filter(p_filters, 'person')::uuid as person,
  public.service_kpi_filter(p_filters, 'client') as client, public.service_kpi_filter(p_filters, 'platform') as platform,
  public.normalize_equipment_serial(public.service_kpi_filter(p_filters, 'serial')) as serial_key,
  public.service_kpi_filter(p_filters, 'service_type') as service_type, public.service_kpi_filter(p_filters, 'priority') as priority
),
eqs as (
 select distinct on (public.normalize_equipment_serial(e.numero_serie)) public.normalize_equipment_serial(e.numero_serie) as serial_key, e.modelo, c.razon_social
 from public.equipos e left join public.clientes c on c.id = e.cliente_id
 where public.normalize_equipment_serial(e.numero_serie) is not null
 order by public.normalize_equipment_serial(e.numero_serie), (e.fecha_fin is null) desc, e.actualizado_en desc nulls last
),
rows_ as (
 select s.id, s.ticket_id, coalesce(t.numero_caso, s.case_number) as folio, s.specialist_id, s.specialist_name,
  coalesce(public.service_staff_team(p.employee_type), nullif(s.area, 'sin_clasificar'), 'sin_clasificar') as team,
  s.answered_at, (s.answered_at at time zone w.tz)::date as answered_date,
  s.satisfaction, s.speed, s.clarity, s.resolution, s.improvement, s.comment, s.attire,
  t.numero_serie_equipo as serial, public.normalize_equipment_serial(t.numero_serie_equipo) as serial_key,
  eqs.modelo, eqs.razon_social, coalesce(t.prioridad, 'sin_prioridad') as priority,
  case when public.ticket_is_planning(t.descripcion) then 'planeacion' else 'soporte_' || coalesce(public.ticket_support_area(t.asunto), 'sin_especialidad') end as service_type
 from public.ticket_satisfaction s cross join w
 left join public.tickets t on t.id = s.ticket_id
 left join public.profiles p on p.id = s.specialist_id
 left join eqs on eqs.serial_key = public.normalize_equipment_serial(t.numero_serie_equipo)
 where s.answered_at is not null and not s.is_test
)
select r.id, r.ticket_id, r.folio, r.specialist_id, r.specialist_name, r.team, r.answered_at, r.answered_date,
 public.service_kpi_bucket(r.answered_date, w.granularity), r.answered_date between w.from_date and w.to_date,
 r.satisfaction, r.speed, r.clarity, r.resolution, r.improvement, r.comment, r.serial, r.modelo, r.razon_social, r.priority,
 lower(concat_ws(' ', r.folio, r.specialist_name, r.serial, r.modelo, r.razon_social, r.comment)), r.attire
from rows_ r cross join w cross join f
where (f.team is null or r.team = f.team)
 and (f.person is null or r.specialist_id = f.person)
 and (f.client is null or r.razon_social = f.client)
 and (f.platform is null or r.modelo = f.platform)
 and (f.serial_key is null or r.serial_key = f.serial_key)
 and (f.service_type is null or r.service_type = f.service_type)
 and (f.priority is null or r.priority = f.priority)
$$;

create function public.service_kpi_attire_ratios(p_filters jsonb) returns jsonb
language sql stable set search_path = public as $$
 select jsonb_build_object(
  'attire', public.service_kpi_ratio(count(*) filter (where x.attire = 'both'), count(*) filter (where x.attire in ('both','coat','badge','none'))),
  'attire_coat', public.service_kpi_ratio(count(*) filter (where x.attire in ('both','coat')), count(*) filter (where x.attire in ('both','coat','badge','none'))),
  'attire_badge', public.service_kpi_ratio(count(*) filter (where x.attire in ('both','badge')), count(*) filter (where x.attire in ('both','coat','badge','none'))),
  'attire_no_visit', count(*) filter (where x.attire = 'no_visit'))
 from public.service_kpi_survey_rows(p_filters) x where x.in_period
$$;

create or replace function public.get_service_kpi_summary(p_filters jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare w public.service_kpi_window; v_previous jsonb; v_data jsonb; v_people jsonb;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Los indicadores del personal son exclusivos para administradores'; end if;
 w := public.service_kpi_window(coalesce(p_filters, '{}'::jsonb));
 v_previous := coalesce(p_filters, '{}'::jsonb) || jsonb_build_object('from', w.prev_from, 'to', w.prev_to);
 v_data := public.service_kpi_summary_data(p_filters, v_previous);
 v_data := jsonb_set(v_data, '{current}', coalesce(v_data->'current', '{}'::jsonb) || public.service_kpi_attire_ratios(coalesce(p_filters, '{}'::jsonb)));
 v_data := jsonb_set(v_data, '{previous}', coalesce(v_data->'previous', '{}'::jsonb) || public.service_kpi_attire_ratios(v_previous));
 select coalesce(jsonb_object_agg(q.specialist_id::text, q.ratio), '{}'::jsonb) into v_people
 from (select x.specialist_id, public.service_kpi_ratio(count(*) filter (where x.attire = 'both'), count(*) filter (where x.attire in ('both','coat','badge','none'))) as ratio
  from public.service_kpi_survey_rows(coalesce(p_filters, '{}'::jsonb)) x where x.in_period and x.specialist_id is not null group by x.specialist_id) q;
 if jsonb_typeof(v_data->'breakdowns'->'staff') = 'array' then
   v_data := jsonb_set(v_data, '{breakdowns,staff}', coalesce((select jsonb_agg(e.value || jsonb_build_object('attire', coalesce(v_people->(e.value->>'id'), public.service_kpi_ratio(0, 0))) order by e.ordinality)
     from jsonb_array_elements(v_data->'breakdowns'->'staff') with ordinality as e), '[]'::jsonb));
 end if;
 return jsonb_build_object(
  'period', jsonb_build_object('from', w.from_date, 'to', w.to_date, 'previous_from', w.prev_from, 'previous_to', w.prev_to,
    'cut_at', w.cut_at, 'cut_is_now', w.cut_is_now, 'timezone', w.tz, 'granularity', w.granularity,
    'recurrence_days', w.recurrence_days, 'min_sample', w.min_sample, 'capture_since', w.capture_since),
  'policies', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'channel', p.channel, 'region', p.region, 'area', p.area,
     'priority', p.priority, 'target_hours', p.target_hours, 'clock', p.clock, 'business_start', p.business_start, 'business_end', p.business_end,
     'business_days', p.business_days, 'timezone', p.timezone, 'pause_states', p.pause_states, 'precedence', p.precedence, 'active', p.active,
     'notes', p.notes) order by p.precedence, p.created_at) from public.ticket_sla_policies p), '[]'::jsonb)
 ) || v_data;
end; $$;

-- Funciones internas: solo dentro de las API de indicadores.
revoke all on function public.service_kpi_survey_rows(jsonb), public.service_kpi_attire_ratios(jsonb) from public, anon, authenticated;
revoke all on function public.get_service_kpi_summary(jsonb) from public, anon;
grant execute on function public.get_service_kpi_summary(jsonb) to authenticated;
