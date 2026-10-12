-- Indicadores del personal de servicio (químicos e ingenieros) del centro de control.
-- Los indicadores se calculan en el servidor sobre registros reales. Nada se infiere para
-- rellenar huecos: cada indicador expone su denominador y los registros sin dato suficiente
-- se cuentan aparte. Los históricos no se modifican; los campos nuevos solo se capturan
-- desde la aplicación de esta migración (service_kpi_settings.capture_since).

-- 1) Parámetros y reglas de plazo explícitas ------------------------------------------------
create table public.service_kpi_settings (
 id boolean primary key default true check (id),
 timezone text not null default 'America/Chihuahua',
 recurrence_days integer not null default 30 check (recurrence_days between 1 and 365),
 min_sample integer not null default 5 check (min_sample between 1 and 100),
 capture_since timestamptz not null default clock_timestamp(),
 updated_by uuid references public.profiles(id),
 updated_at timestamptz not null default clock_timestamp()
);
insert into public.service_kpi_settings(id) values (true);

-- Una regla aplica al ticket de soporte que coincide en canal, región, especialidad y prioridad
-- (nulo = cualquiera); gana la de menor precedencia. Sin regla activa el ticket queda
-- "sin plazo definido": nunca se supone un plazo.
create table public.ticket_sla_policies (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(btrim(name)) between 3 and 120),
 channel text check (channel in ('falcon','centrum','genesis')),
 region text check (region in ('cdmx','foraneo')),
 area text check (area in ('ingenieria','quimica')),
 priority text check (priority in ('baja','media','alta','critica')),
 target_hours numeric(7,2) not null check (target_hours > 0 and target_hours <= 2160),
 clock text not null default 'corridas' check (clock in ('corridas','habiles')),
 business_start time not null default '09:00',
 business_end time not null default '18:00',
 business_days smallint[] not null default '{1,2,3,4,5}',
 timezone text not null default 'America/Chihuahua',
 pause_states text[] not null default '{}',
 precedence integer not null default 100 check (precedence between 0 and 1000),
 active boolean not null default true,
 notes text check (char_length(notes) <= 500),
 created_at timestamptz not null default clock_timestamp(),
 updated_by uuid references public.profiles(id),
 updated_at timestamptz not null default clock_timestamp(),
 check (business_end > business_start),
 check (cardinality(business_days) between 1 and 7 and business_days <@ array[1,2,3,4,5,6,7]::smallint[]),
 check (pause_states <@ array['pendiente_piezas','en_observacion']::text[])
);
-- Reglas vigentes antes de esta migración, sin cambios: ticketControlModel (48 h corridas,
-- sin pausas) y getFalconTicketSla (Falcon: 24 h en CDMX, 48 h foráneo).
insert into public.ticket_sla_policies(name, channel, region, target_hours, precedence, notes) values
 ('Falcon · Ciudad de México', 'falcon', 'cdmx', 24, 10, 'Regla vigente de alertas Falcon: 24 horas corridas desde la apertura.'),
 ('Falcon · foráneo', 'falcon', null, 48, 20, 'Regla vigente de alertas Falcon fuera de CDMX: 48 horas corridas desde la apertura.'),
 ('Soporte general', null, null, 48, 100, 'Regla vigente del centro de control: 48 horas corridas desde la apertura, sin pausas ni horario hábil.');

create function public.validate_service_kpi_config() returns trigger
language plpgsql security definer set search_path = public as $$
begin
 if auth.uid() is null or not public.is_admin() then
   raise exception 'Solo administradores pueden modificar la configuración de indicadores';
 end if;
 if tg_op = 'DELETE' then return old; end if;
 if not exists (select 1 from pg_timezone_names where name = new.timezone) then
   raise exception 'Zona horaria no válida: %', new.timezone;
 end if;
 if tg_table_name = 'service_kpi_settings' and tg_op = 'UPDATE' then
   if to_jsonb(new)->'capture_since' is distinct from to_jsonb(old)->'capture_since' then
     raise exception 'La fecha de inicio de captura es inmutable';
   end if;
 end if;
 new.updated_by := auth.uid();
 new.updated_at := clock_timestamp();
 return new;
end; $$;
revoke all on function public.validate_service_kpi_config() from public, anon, authenticated;
create trigger validate_service_kpi_settings before update on public.service_kpi_settings
 for each row execute function public.validate_service_kpi_config();
create trigger validate_ticket_sla_policies before insert or update or delete on public.ticket_sla_policies
 for each row execute function public.validate_service_kpi_config();

alter table public.service_kpi_settings enable row level security;
alter table public.ticket_sla_policies enable row level security;
create policy "Admins read kpi settings" on public.service_kpi_settings for select to authenticated using (public.is_admin());
create policy "Admins update kpi settings" on public.service_kpi_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins read sla policies" on public.ticket_sla_policies for select to authenticated using (public.is_admin());
create policy "Admins manage sla policies" on public.ticket_sla_policies for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.service_kpi_settings, public.ticket_sla_policies from anon;
grant select, update on public.service_kpi_settings to authenticated;
grant select, insert, update, delete on public.ticket_sla_policies to authenticated;

-- 2) Campos de captura ----------------------------------------------------------------------
-- Prioridad del caso (antes no existía: los históricos quedan "sin prioridad").
alter table public.tickets
 add column if not exists prioridad text check (prioridad in ('baja','media','alta','critica')),
 add column if not exists reabre_ticket_id uuid references public.tickets(id);
create index if not exists tickets_reabre_ticket_idx on public.tickets(reabre_ticket_id) where reabre_ticket_id is not null;

-- Un caso cerrado no vuelve a abrirse (capture_ticket_closure); la reapertura es un caso nuevo
-- vinculado al anterior. El vínculo se valida y no se reescribe.
create function public.validate_ticket_reopen_link() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_parent public.tickets%rowtype;
begin
 if new.reabre_ticket_id is null then
   if tg_op = 'UPDATE' and old.reabre_ticket_id is not null then raise exception 'El vínculo de reapertura es inmutable'; end if;
   return new;
 end if;
 if tg_op = 'UPDATE' and new.reabre_ticket_id is not distinct from old.reabre_ticket_id then return new; end if;
 if tg_op = 'UPDATE' and old.reabre_ticket_id is not null then raise exception 'El vínculo de reapertura es inmutable'; end if;
 if new.reabre_ticket_id = new.id then raise exception 'Un caso no puede reabrirse a sí mismo'; end if;
 select * into v_parent from public.tickets where id = new.reabre_ticket_id;
 if not found then raise exception 'El caso que se reabre no existe'; end if;
 if v_parent.estado <> 'cerrado' then raise exception 'Solo se vincula como reapertura un caso cerrado'; end if;
 if public.ticket_is_planning(v_parent.descripcion) then raise exception 'La planeación no se reabre; vincula un caso de soporte'; end if;
 return new;
end; $$;
revoke all on function public.validate_ticket_reopen_link() from public, anon, authenticated;
create trigger ticket_reopen_link before insert or update of reabre_ticket_id on public.tickets
 for each row execute function public.validate_ticket_reopen_link();

-- Datos estructurados de llamadas y visitas registradas en la bitácora del caso.
alter table public.ticket_bitacora
 add column if not exists actividad_duracion_min integer check (actividad_duracion_min between 1 and 1440),
 add column if not exists actividad_motivo text check (actividad_motivo in ('falla_equipo','resultados_qc','reactivos','operacion','configuracion','mantenimiento','capacitacion','seguimiento','otro')),
 add column if not exists actividad_resultado text check (actividad_resultado in ('resuelto','requiere_visita','requiere_pieza','escalado','en_seguimiento','sin_solucion')),
 add column if not exists codigo_averia text check (char_length(codigo_averia) <= 20),
 add column if not exists codigo_solucion text check (char_length(codigo_solucion) <= 20);

-- Tipo y resultado del servicio que captura el diagnóstico del caso. Los registros históricos
-- conservan su motivo; su tipo se clasifica al consultar (service_history_kind), sin reescribirlos.
alter table public.servicios_historial
 add column if not exists tipo_servicio text check (tipo_servicio in ('preventivo','correctivo','instalacion','visita','capacitacion','recapacitacion','reacondicionamiento','retiro','otro')),
 add column if not exists resultado text check (resultado in ('resuelto','pendiente_piezas','en_observacion','requiere_visita'));

-- 3) Historiales de estado y de responsable ------------------------------------------------
-- Sin historial previo, los estados anteriores a esta migración no se reconstruyen: las pausas
-- configurables solo se descuentan desde que existe el registro.
create table public.ticket_state_history (
 id bigint generated always as identity primary key,
 ticket_id uuid not null references public.tickets(id) on delete cascade,
 estado public.ticket_status not null,
 changed_at timestamptz not null default clock_timestamp(),
 changed_by uuid
);
create index ticket_state_history_ticket_idx on public.ticket_state_history(ticket_id, changed_at);
create table public.ticket_assignment_history (
 id bigint generated always as identity primary key,
 ticket_id uuid not null references public.tickets(id) on delete cascade,
 assigned_to uuid references public.profiles(id),
 assigned_by uuid references public.profiles(id),
 source text,
 assigned_at timestamptz not null default clock_timestamp()
);
create index ticket_assignment_history_ticket_idx on public.ticket_assignment_history(ticket_id, assigned_at);
alter table public.ticket_state_history enable row level security;
alter table public.ticket_assignment_history enable row level security;
create policy "Admins read ticket state history" on public.ticket_state_history for select to authenticated using (public.is_admin());
create policy "Admins read ticket assignment history" on public.ticket_assignment_history for select to authenticated using (public.is_admin());
revoke all on public.ticket_state_history, public.ticket_assignment_history from anon, authenticated;
grant select on public.ticket_state_history, public.ticket_assignment_history to authenticated;

create function public.track_ticket_state() returns trigger
language plpgsql security definer set search_path = public as $$
begin
 if tg_op = 'INSERT' or new.estado is distinct from old.estado then
   insert into public.ticket_state_history(ticket_id, estado, changed_at, changed_by)
   values (new.id, coalesce(new.estado, 'abierto'), case when tg_op = 'INSERT' then coalesce(new.creado_en, clock_timestamp()) else clock_timestamp() end, auth.uid());
 end if;
 return new;
end; $$;
revoke all on function public.track_ticket_state() from public, anon, authenticated;
create trigger ticket_state_history_track after insert or update of estado on public.tickets
 for each row execute function public.track_ticket_state();
insert into public.ticket_state_history(ticket_id, estado, changed_at)
select id, coalesce(estado, 'abierto'), clock_timestamp() from public.tickets;

create function public.track_ticket_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
 if tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to then
   insert into public.ticket_assignment_history(ticket_id, assigned_to, assigned_by, source, assigned_at)
   values (new.ticket_id, new.assigned_to, new.assigned_by, new.source, coalesce(new.assigned_at, clock_timestamp()));
 end if;
 return new;
end; $$;
revoke all on function public.track_ticket_assignment() from public, anon, authenticated;
create trigger ticket_assignment_history_track after insert or update on public.ticket_assignments
 for each row execute function public.track_ticket_assignment();
insert into public.ticket_assignment_history(ticket_id, assigned_to, assigned_by, source, assigned_at)
select ticket_id, assigned_to, assigned_by, source, assigned_at from public.ticket_assignments;

-- 4) Captura auditada -----------------------------------------------------------------------
create function public.set_ticket_priority(p_ticket_id uuid, p_priority text) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tickets%rowtype;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Solo administradores pueden cambiar la prioridad'; end if;
 if p_priority is not null and p_priority not in ('baja','media','alta','critica') then raise exception 'Prioridad no válida'; end if;
 select * into t from public.tickets where id = p_ticket_id for update;
 if not found then raise exception 'Ticket no encontrado'; end if;
 if t.estado = 'cerrado' then raise exception 'No se cambia la prioridad de un caso cerrado'; end if;
 if t.prioridad is not distinct from p_priority then return; end if;
 update public.tickets set prioridad = p_priority where id = t.id;
 insert into public.ticket_bitacora(ticket_id, numero_serie_equipo, tipo, detalle, visible_cliente, creado_por)
 values (t.id, t.numero_serie_equipo, 'nota', 'Prioridad: ' || coalesce(t.prioridad, 'sin definir') || ' → ' || coalesce(p_priority, 'sin definir') || '.', false, auth.uid());
end; $$;
revoke all on function public.set_ticket_priority(uuid, text) from public, anon;
grant execute on function public.set_ticket_priority(uuid, text) to authenticated;

-- Misma operación unificada de 20260924040000, con datos opcionales de llamada o visita.
drop function if exists public.register_ticket_movement(uuid, text, text, text, boolean, text);
create function public.register_ticket_movement(
 p_ticket_id uuid, p_action text, p_detail text,
 p_state text default null, p_visible boolean default false, p_reason text default null,
 p_activity jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare t public.tickets%rowtype; v_duration integer; v_motive text; v_result text; v_failure text; v_solution text;
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Acceso restringido a personal de servicio'; end if;
 if char_length(btrim(coalesce(p_detail,''))) not between 2 and 3900 then raise exception 'Escribe un detalle de 2 a 3900 caracteres'; end if;
 if p_action is null or p_action not in ('avance','diagnostico','llamada','visita','pieza','escalamiento','nota','respuesta','cierre','justificacion','revision_cierre') then
   raise exception 'Selecciona un movimiento válido';
 end if;
 if p_activity is not null and p_activity <> '{}'::jsonb then
   if jsonb_typeof(p_activity) <> 'object' then raise exception 'Datos de actividad inválidos'; end if;
   if p_action not in ('llamada','visita') then raise exception 'Duración, motivo y resultado solo se registran en llamadas y visitas'; end if;
   if nullif(p_activity->>'duracion_min','') is not null then
     if (p_activity->>'duracion_min') !~ '^\d{1,4}$' then raise exception 'La duración debe ser un número entero de minutos'; end if;
     v_duration := (p_activity->>'duracion_min')::integer;
     if v_duration not between 1 and 1440 then raise exception 'La duración debe estar entre 1 y 1440 minutos'; end if;
   end if;
   v_motive := nullif(btrim(p_activity->>'motivo'),'');
   v_result := nullif(btrim(p_activity->>'resultado'),'');
   v_failure := upper(nullif(btrim(p_activity->>'codigo_averia'),''));
   v_solution := upper(nullif(btrim(p_activity->>'codigo_solucion'),''));
   if v_motive is not null and v_motive not in ('falla_equipo','resultados_qc','reactivos','operacion','configuracion','mantenimiento','capacitacion','seguimiento','otro') then
     raise exception 'Motivo de actividad no válido';
   end if;
   if v_result is not null and v_result not in ('resuelto','requiere_visita','requiere_pieza','escalado','en_seguimiento','sin_solucion') then
     raise exception 'Resultado de actividad no válido';
   end if;
   if v_failure is not null and not exists (select 1 from public.catalogo_servicio where catalog_kind = 'averia' and catalog_code = v_failure) then
     raise exception 'El código de avería % no está en el catálogo', v_failure;
   end if;
   if v_solution is not null and not exists (select 1 from public.catalogo_servicio where catalog_kind = 'solucion' and catalog_code = v_solution) then
     raise exception 'El código de solución % no está en el catálogo', v_solution;
   end if;
 end if;
 select * into t from public.tickets where id = p_ticket_id for update;
 if not found then raise exception 'Ticket no encontrado'; end if;
 if not public.can_work_ticket(t.id) then raise exception 'El ticket no está asignado a tu usuario'; end if;
 if p_action = 'cierre' then
   perform public.register_ticket_closure(t.id, p_reason, p_detail);
 elsif p_action = 'justificacion' then
   perform public.register_ticket_service_event(t.id, 'justificacion', p_detail);
 elsif p_action = 'revision_cierre' then
   perform public.review_ticket_closure(t.id, p_detail);
 else
   if t.estado = 'cerrado' then raise exception 'El ticket ya está cerrado'; end if;
   if p_state is not null and p_state not in ('abierto','en_progreso','pendiente_piezas','en_observacion') then
     raise exception 'Estado de seguimiento inválido';
   end if;
   if p_action = 'respuesta' and not exists (
     select 1 from public.ticket_service_events where ticket_id = t.id and kind = 'respuesta'
   ) then
     perform public.register_ticket_service_event(t.id, 'respuesta', p_detail);
   else
     insert into public.ticket_bitacora(ticket_id, numero_serie_equipo, tipo, detalle, estado_resultante, visible_cliente, creado_por,
       actividad_duracion_min, actividad_motivo, actividad_resultado, codigo_averia, codigo_solucion)
     values (t.id, t.numero_serie_equipo,
       case when p_action = 'respuesta' then 'llamada' else p_action end,
       case when p_action = 'respuesta' then 'Seguimiento de respuesta al cliente: ' else '' end || btrim(p_detail),
       case when p_action = 'respuesta' then null else p_state::public.ticket_status end,
       case when p_action in ('respuesta','nota') then false else coalesce(p_visible, false) end, auth.uid(),
       v_duration, v_motive, v_result, v_failure, v_solution);
   end if;
 end if;
end; $$;
revoke all on function public.register_ticket_movement(uuid, text, text, text, boolean, text, jsonb) from public;
grant execute on function public.register_ticket_movement(uuid, text, text, text, boolean, text, jsonb) to authenticated;

-- 5) Clasificaciones y relojes --------------------------------------------------------------
create function public.service_staff_team(p_employee_type text) returns text
language sql immutable set search_path = public as $$
 select case
  when nullif(btrim(coalesce(p_employee_type, '')), '') is null then null
  when public.ticket_routing_key(p_employee_type) like '%quim%' then 'quimica'
  when public.ticket_routing_key(p_employee_type) like '%ingen%' then 'ingenieria'
  else 'otro' end
$$;

-- Equipo que normalmente realiza un tipo de servicio. Solo se usa cuando ningún participante
-- de la actividad se identificó; el registro queda marcado como "equipo asignado por tipo".
create function public.service_kind_team(p_kind text) returns text
language sql immutable as $$
 select case
  when p_kind in ('capacitacion','recapacitacion') then 'quimica'
  when p_kind in ('preventivo','correctivo','instalacion','reacondicionamiento','retiro') then 'ingenieria'
  else 'sin_clasificar' end
$$;

create function public.service_planning_kind(p_service_type text, p_subject text) returns text
language sql immutable as $$
 select case
  when k in ('preventivo','correctivo','capacitacion','recapacitacion','instalacion','ingenieria_soporte') then k
  when s like 'recapacit%' then 'recapacitacion'
  when s like 'capacit%' then 'capacitacion'
  when s like 'prevent%' then 'preventivo'
  when s like 'correct%' then 'correctivo'
  when s like 'instal%' or s like 'preinstal%' then 'instalacion'
  when s like 'ingenieria%' or s like 'soporte%' then 'ingenieria_soporte'
  when s like 'visita%' then 'visita'
  when s like 'reacondic%' then 'reacondicionamiento'
  when s like 'retiro%' then 'retiro'
  else 'otro' end
 from (select lower(btrim(coalesce(p_service_type, ''))) as k,
   lower(btrim(translate(regexp_replace(split_part(coalesce(p_subject, ''), ' - ', 1), '^\s*\[PLAN\]\s*', '', 'i'), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou'))) as s) x
$$;

-- Tipo de un registro del historial de servicio: el capturado o, en históricos, la etiqueta
-- exacta de su motivo. Solo los registros evidentemente de prueba se excluyen de los KPI.
create function public.service_history_kind(p_type text, p_reason text) returns text
language sql immutable as $$
 select case
  when p_type is not null then p_type
  when k in ('EJEMPLO','BLABLABLA','PRUEBA2') or k like 'ESTA ES UNA PRUEBA%' or k like '[FALCON] PRUEBA%' or k = '[SOPORTE INGENIERO] PRUEBA' then 'prueba'
  when k in ('MANTTO CORRECTIVO','MANTENIMIENTO CORRECTIVO') then 'correctivo'
  when k in ('MANTTO PREVENTIVO','MANTENIMIENTO PREVENTIVO') then 'preventivo'
  when k like 'INSTALACI%' or k like 'PREINSTALACI%' then 'instalacion'
  when k = 'VISITA' then 'visita'
  when k = 'REACONDICIONAMIENTO' then 'reacondicionamiento'
  when k = 'RETIRO' then 'retiro'
  when k like 'ACTUALIZACI%' then 'otro'
  else 'sin_clasificar' end
 from (select upper(btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g'))) as k) x
$$;

create function public.service_report_kind(p_type text) returns text
language sql immutable as $$
 select case lower(btrim(coalesce(p_type, '')))
  when 'preventivo' then 'preventivo' when 'correctivo' then 'correctivo' when 'emergencia' then 'correctivo'
  when 'instalacion' then 'instalacion' when 'capacitacion' then 'capacitacion' when 'recapacitacion' then 'recapacitacion'
  when '' then 'sin_clasificar' else 'otro' end
$$;

-- Fecha planeada: ISO de la planeación o, en importaciones antiguas, la etiqueta "13 AL 17 ABRIL"
-- con el año de creación (misma lectura que el cierre administrativo del 09/10/2026).
create function public.service_planning_dates(p_meta jsonb, p_created timestamptz,
 out start_date date, out end_date date, out scheduled_date date)
language plpgsql immutable as $$
declare v_match text[]; v_year integer := extract(year from p_created)::integer; v_month integer; v_prev date;
begin
 start_date := public.try_parse_iso_date(p_meta->>'week_start');
 end_date := public.try_parse_iso_date(p_meta->>'week_end');
 scheduled_date := public.try_parse_iso_date(p_meta->>'scheduled_date');
 if start_date is not null and end_date is not null then return; end if;
 v_match := regexp_match(upper(translate(coalesce(p_meta->>'fecha_tentativa', ''), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')), '(\d{1,2})\s*AL\s*(\d{1,2})\s+([A-Z]+)');
 if v_match is null then return; end if;
 v_month := case v_match[3]
   when 'ENERO' then 1 when 'ENE' then 1 when 'FEBRERO' then 2 when 'FEB' then 2 when 'MARZO' then 3 when 'MAR' then 3
   when 'ABRIL' then 4 when 'ABR' then 4 when 'MAYO' then 5 when 'MAY' then 5 when 'JUNIO' then 6 when 'JUN' then 6
   when 'JULIO' then 7 when 'JUL' then 7 when 'AGOSTO' then 8 when 'AGO' then 8 when 'SEPTIEMBRE' then 9 when 'SETIEMBRE' then 9
   when 'SEP' then 9 when 'OCTUBRE' then 10 when 'OCT' then 10 when 'NOVIEMBRE' then 11 when 'NOV' then 11
   when 'DICIEMBRE' then 12 when 'DIC' then 12 end;
 if v_month is null then return; end if;
 begin
   end_date := coalesce(end_date, make_date(v_year, v_month, v_match[2]::integer));
   if v_match[1]::integer <= v_match[2]::integer then
     start_date := coalesce(start_date, make_date(v_year, v_month, v_match[1]::integer));
   else
     v_prev := (make_date(v_year, v_month, 1) - interval '1 month')::date;
     start_date := coalesce(start_date, make_date(extract(year from v_prev)::integer, extract(month from v_prev)::integer, v_match[1]::integer));
   end if;
 exception when others then
   start_date := null; end_date := null;
 end;
end; $$;

-- Horas de reloj entre dos instantes: corridas, o solo dentro del horario hábil local.
create function public.service_clock_hours(p_start timestamptz, p_end timestamptz, p_clock text, p_tz text,
 p_business_start time, p_business_end time, p_business_days smallint[]) returns numeric
language sql stable as $$
 select case
  when p_start is null or p_end is null or p_end <= p_start then 0::numeric
  when p_clock = 'corridas' then (extract(epoch from p_end - p_start) / 3600)::numeric
  else coalesce((
   select sum(greatest(0, extract(epoch from
     least(p_end, (g.d::date + p_business_end) at time zone p_tz) - greatest(p_start, (g.d::date + p_business_start) at time zone p_tz))))
   from generate_series((p_start at time zone p_tz)::date, (p_end at time zone p_tz)::date, interval '1 day') as g(d)
   where extract(isodow from g.d)::smallint = any(p_business_days)), 0)::numeric / 3600 end
$$;

-- Horas del plazo consumidas: reloj de la regla menos los periodos en estados de pausa.
create function public.service_sla_hours(p_ticket_id uuid, p_start timestamptz, p_end timestamptz, p_policy public.ticket_sla_policies)
returns numeric language plpgsql stable set search_path = public as $$
declare v_total numeric; v_paused numeric := 0; r record;
begin
 if p_policy.id is null or p_end is null or p_end < p_start then return null; end if;
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
end; $$;

-- Canal y región con las mismas reglas de ticketIntake.getFalconTicketSla.
create function public.service_ticket_channel(p_subject text, p_description text, p_client text) returns text
language sql immutable as $$
 select case
  when x ~ '(\[falcon\]|canal: falcon|reporte falcon|no\. de reporte falcon|numero de reporte falcon)' then 'falcon'
  when x ~ '(\[centrum\]|canal: centrum|ticket zendesk|centrum)' then 'centrum'
  when x ~ '(\[genesis\]|canal: genesis|numero de reporte genesis|genesis healthcare| genesis )' then 'genesis'
  when c like '%falcon%' then 'falcon'
  when c like '%centrum%' then 'centrum'
  when c like '%genesis%' or c like '%generis%' then 'genesis'
 end
 from (select lower(translate(coalesce(p_subject, '') || E'\n' || coalesce(p_description, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) as x,
   lower(translate(coalesce(p_client, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) as c) s
$$;

create function public.service_ticket_region(p_description text, p_city text, p_municipality text, p_state text, p_address text) returns text
language sql immutable as $$
 select case when lower(translate(concat_ws(' ', p_city, p_municipality, p_state, p_address,
   (select string_agg(m[2], ' ') from regexp_matches(coalesce(p_description, ''),
     '(?:^|\n)\s*(Localidad|Ciudad|Municipio|Unidad/Laboratorio|Cliente/Instituci[oó]n|Estado|Direcci[oó]n)\s*:\s*([^\n]*)', 'gi') as m)),
   'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) ~ '(cdmx|ciudad de mexico|distrito federal|mexico city|ciudad mexico)' then 'cdmx' else 'foraneo' end
$$;

create function public.service_kpi_bucket(p_date date, p_granularity text) returns date
language sql immutable as $$
 select case when p_date is null then null
  else date_trunc(case p_granularity when 'week' then 'week' when 'quarter' then 'quarter' else 'month' end, p_date::timestamp)::date end
$$;

create function public.service_kpi_ratio(p_num bigint, p_den bigint) returns jsonb
language sql immutable as $$
 select jsonb_build_object('num', coalesce(p_num, 0), 'den', coalesce(p_den, 0),
  'pct', case when coalesce(p_den, 0) = 0 then null else round(100.0 * coalesce(p_num, 0) / p_den, 1) end)
$$;

-- 6) Ventana de análisis --------------------------------------------------------------------
-- El periodo filtra aperturas, cierres y actividades por su fecha local. Los pendientes son una
-- fotografía al corte: fin del periodo o el momento de la consulta si el periodo incluye hoy.
create type public.service_kpi_window as (
 from_date date, to_date date, start_at timestamptz, end_at timestamptz, cut_at timestamptz, cut_date date,
 cut_is_now boolean, today date, tz text, prev_from date, prev_to date, granularity text,
 recurrence_days integer, min_sample integer, capture_since timestamptz
);

create function public.service_kpi_window(p_filters jsonb) returns public.service_kpi_window
language plpgsql stable set search_path = public as $$
declare s public.service_kpi_settings%rowtype; w public.service_kpi_window; v_now timestamptz := now(); v_months integer;
begin
 select * into s from public.service_kpi_settings where id;
 w.tz := coalesce(s.timezone, 'America/Chihuahua');
 w.today := (v_now at time zone w.tz)::date;
 begin
   w.to_date := coalesce(nullif(p_filters->>'to', '')::date, w.today);
   w.from_date := coalesce(nullif(p_filters->>'from', '')::date, date_trunc('month', w.to_date)::date);
 exception when others then
   raise exception 'Fechas del periodo no válidas';
 end;
 if w.from_date > w.to_date then raise exception 'La fecha inicial debe ser anterior o igual a la final'; end if;
 if w.to_date - w.from_date > 1100 then raise exception 'El periodo máximo es de tres años'; end if;
 w.start_at := w.from_date::timestamp at time zone w.tz;
 w.end_at := (w.to_date + 1)::timestamp at time zone w.tz;
 w.cut_is_now := w.end_at > v_now;
 w.cut_at := least(w.end_at, v_now);
 w.cut_date := case when w.cut_is_now then w.today else w.to_date end;
 -- Periodo anterior equivalente: meses completos → mismos meses previos; un mes a la fecha →
 -- los mismos días del mes anterior; cualquier otro rango → el mismo número de días previos.
 if w.from_date = date_trunc('month', w.from_date)::date and w.to_date = (date_trunc('month', w.to_date) + interval '1 month - 1 day')::date then
   v_months := (extract(year from w.to_date)::integer - extract(year from w.from_date)::integer) * 12
     + extract(month from w.to_date)::integer - extract(month from w.from_date)::integer + 1;
   w.prev_from := (w.from_date - make_interval(months => v_months))::date;
   w.prev_to := w.from_date - 1;
 elsif w.from_date = date_trunc('month', w.from_date)::date and date_trunc('month', w.to_date) = date_trunc('month', w.from_date) then
   w.prev_from := (w.from_date - interval '1 month')::date;
   w.prev_to := least((w.to_date - interval '1 month')::date, w.from_date - 1);
 else
   w.prev_to := w.from_date - 1;
   w.prev_from := w.from_date - (w.to_date - w.from_date + 1);
 end if;
 w.granularity := case p_filters->>'granularity' when 'week' then 'week' when 'quarter' then 'quarter' else 'month' end;
 begin
   w.recurrence_days := coalesce(nullif(p_filters->>'recurrence_days', '')::integer, s.recurrence_days, 30);
 exception when others then
   raise exception 'La ventana de reincidencia debe ser un número de días';
 end;
 if w.recurrence_days not between 1 and 365 then raise exception 'La ventana de reincidencia debe estar entre 1 y 365 días'; end if;
 w.min_sample := coalesce(s.min_sample, 5);
 w.capture_since := s.capture_since;
 return w;
end; $$;

create function public.service_kpi_filter(p_filters jsonb, p_key text) returns text
language sql immutable as $$
 select nullif(nullif(btrim(coalesce(p_filters->>p_key, '')), ''), 'todos')
$$;

-- 7) Conjuntos de registros -----------------------------------------------------------------
-- Cada tarjeta, gráfica, tabla y exportación se calcula sobre estas mismas filas.

-- Tickets de soporte: una fila por caso. La planeación se mide como actividad programada.
create function public.service_kpi_ticket_rows(p_filters jsonb default '{}'::jsonb)
returns table (
 ticket_id uuid, folio text, asunto text, service_type text, team text, team_source text,
 priority text, channel text, region text, serial text, serial_key text, platform text, client text,
 responsible_id uuid, responsible_name text, reassignments integer, estado text,
 opened_at timestamptz, first_response_at timestamptz, first_response_hours numeric, has_first_response boolean,
 closed_at timestamptz, closure_reason text, closure_class text, resolution_hours numeric,
 sla_policy text, sla_target_hours numeric, sla_clock text, sla_hours numeric, sla_result text, sla_evaluable boolean, justified boolean,
 reopen_of_id uuid, reopen_of_folio text, reopened boolean, reopen_evaluable boolean,
 visits integer, calls integer, ftf_eligible boolean, ftf_ok boolean,
 opened_in_period boolean, closed_in_period boolean, opened_bucket date, closed_bucket date,
 state_at_cut text, pending_at_cut boolean, overdue_at_cut boolean, age_days numeric, age_bucket text,
 relevant boolean, search_text text)
language sql stable set search_path = public as $$
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
facts as (
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
$$;

-- Registros de ejecución (sin agrupar): historial de servicio, partes SAP, reportes de servicio
-- y llamadas/visitas de la bitácora. Las fechas inválidas (antes de 2000 o futuras) quedan nulas.
create function public.service_kpi_exec_records(p_tz text)
returns table (
 rid text, source text, ticket_id uuid, serial_key text, serial text, act_date date, created_ts timestamptz,
 kind text, people uuid[], unmatched text, reason text, result text, duration_min integer,
 failure_code text, solution_code text, is_visit boolean, is_call boolean)
language sql stable set search_path = public as $$
with prof as (select p.id, public.ticket_person_key(p.nombre_completo) as pkey from public.profiles p where p.rol::text in ('admin','tecnico')),
today as (select (now() at time zone p_tz)::date as d)
select 'hist:' || h.id::text, 'Historial de servicio', h.ticket_id, public.normalize_equipment_serial(h.no_serie), h.no_serie,
 case when h.fecha_servicio between date '2000-01-01' and (select d from today) then h.fecha_servicio end,
 coalesce(h.creado_en, h.fecha_servicio::timestamptz),
 public.service_history_kind(h.tipo_servicio, h.motivo),
 case when h.tecnico_id is null then '{}'::uuid[] else array[h.tecnico_id] end, null::text,
 nullif(btrim(h.motivo), ''), h.resultado, null::integer,
 nullif(upper(btrim(h.cda)), ''), nullif(upper(btrim(h.cds)), ''), true, false
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

-- Planeación: una fila por servicio programado, con participantes identificados por nombre.
create function public.service_kpi_plan_records()
returns table (
 ticket_id uuid, folio text, asunto text, descripcion text, estado text, serial text, serial_key text, meta jsonb,
 kind text, start_date date, end_date date, prog_date date, closure_reason text,
 participant_ids uuid[], unmatched text)
language sql stable set search_path = public as $$
with prof as (select p.id, public.ticket_person_key(p.nombre_completo) as pkey from public.profiles p where p.rol::text in ('admin','tecnico')),
plan as (
 select t.id, t.numero_caso, t.asunto, t.descripcion, t.estado::text as estado, t.user_id, t.numero_serie_equipo,
  public.normalize_equipment_serial(t.numero_serie_equipo) as serial_key, m.meta, d.start_date, d.end_date, d.scheduled_date,
  public.service_planning_kind(m.meta->>'service_type', t.asunto) as kind
 from public.tickets t
 cross join lateral (select public.try_parse_planning_metadata(t.descripcion) as meta) m
 cross join lateral public.service_planning_dates(m.meta, t.creado_en) d
 where public.ticket_is_planning(t.descripcion)
),
names as (
 select pl.id, n.person, pr.id as pid
 from plan pl cross join lateral public.ticket_planning_people(pl.descripcion) as n(person)
 left join prof pr on pr.pkey = public.ticket_person_key(n.person)
),
closure as (
 select e.ticket_id, min(e.closure_reason) filter (where e.kind = 'cierre') as closure_reason
 from public.ticket_service_events e group by e.ticket_id
)
select pl.id, pl.numero_caso, pl.asunto, pl.descripcion, pl.estado, pl.numero_serie_equipo, pl.serial_key, pl.meta,
 pl.kind, pl.start_date, pl.end_date, coalesce(pl.scheduled_date, pl.end_date), c.closure_reason,
 coalesce((select array_agg(distinct x.pid) from (
   select n.pid from names n where n.id = pl.id and n.pid is not null
   -- Importaciones antiguas: si los nombres no coinciden con un perfil, el líder registrado
   -- (user_id) los representa. Sin nombres no se usa: puede ser quien capturó la planeación.
   union all
   select pl.user_id where pl.user_id is not null
     and exists (select 1 from names n where n.id = pl.id)
     and not exists (select 1 from names n where n.id = pl.id and n.pid is not null)
  ) x), '{}'::uuid[]),
 (select string_agg(distinct n.person, ' / ') from names n where n.id = pl.id and n.pid is null)
from plan pl left join closure c on c.ticket_id = pl.id
$$;

-- Actividades: servicios programados, visitas (registros del mismo equipo y día = una visita)
-- y llamadas. Una actividad con varios participantes es una sola fila: el equipo la cuenta una
-- vez y cada participante la ve en su desglose.
create function public.service_kpi_activity_rows(p_filters jsonb default '{}'::jsonb)
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
plan as (select p.* from public.service_kpi_plan_records() p),
plan_eval as (
 select pl.*,
  (select v.vkey from vis v
   where pl.serial_key is not null and v.serial_key = pl.serial_key and pl.prog_date is not null and v.act_date is not null
     and date_trunc('month', v.act_date) = date_trunc('month', pl.prog_date)
     and (pl.kind = any(v.kinds) or pl.kind in ('visita','ingenieria_soporte','otro'))
   order by v.act_date limit 1) as matched_vkey
 from plan pl
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
   when pe.matched_vkey is not null then 'Visita registrada el ' || to_char((select v.act_date from vis v where v.vkey = pe.matched_vkey), 'DD/MM/YYYY')
     || ' (' || (select v.sources from vis v where v.vkey = pe.matched_vkey) || ')'
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
  array(select k from unnest(v.kinds) k where not exists (
    select 1 from plan pl where pl.serial_key is not null and pl.serial_key = v.serial_key and pl.prog_date is not null and v.act_date is not null
      and date_trunc('month', pl.prog_date) = date_trunc('month', v.act_date) and pl.kind = k)),
  false, true, false, v.kinds && array['preventivo','correctivo'],
  null::text, null::text, null::text,
  v.act_date, v.ticket_id, tk.numero_caso, coalesce(vp.ids, '{}'::uuid[]), v.unmatched,
  v.serial, v.serial_key, eqs.modelo, eqs.razon_social, coalesce(tk.prioridad, 'sin_prioridad'),
  v.reason, v.result, v.duration_min, v.failure_codes, v.solution_codes, v.records
 from vis v left join vis_people vp on vp.vkey = v.vkey left join eqs on eqs.serial_key = v.serial_key left join tk on tk.id = v.ticket_id
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
  (select tk.area from tk where tk.id = u.ticket_id) as ticket_area
 from unioned u
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

-- Eventos de avería: un evento por equipo, código y día. La reincidencia es el mismo código en
-- el mismo equipo dentro de la ventana; solo se evalúan eventos cuya ventana ya transcurrió.
create function public.service_kpi_failure_rows(p_filters jsonb default '{}'::jsonb)
returns table (
 failure_id text, serial text, serial_key text, failure_code text, failure_label text, failure_type text,
 solution_codes text[], solution_labels text, activity_date date, bucket date, in_period boolean,
 ticket_id uuid, folio text, participant_ids uuid[], participant_names text, teams text[],
 platform text, client text, priority text, kinds text[], sources text,
 next_date date, days_to_next integer, recurrence_evaluable boolean, recurred boolean, search_text text)
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
cat as (select c.catalog_kind, c.catalog_code, c.catalog_detail, c.catalog_type from public.catalogo_servicio c),
tk as (select t.id, t.numero_caso, t.prioridad, public.ticket_support_area(t.asunto) as area from public.tickets t),
ex as (
 select e.* from w cross join lateral public.service_kpi_exec_records(w.tz) e
 where e.kind <> 'prueba' and e.failure_code is not null and e.serial_key is not null and e.act_date is not null and e.act_date <= w.cut_date
),
ev as (
 select e.serial_key, e.failure_code, e.act_date, max(e.serial) as serial,
  coalesce(array_agg(distinct e.solution_code) filter (where e.solution_code is not null), '{}') as solution_codes,
  array_agg(distinct e.kind) as kinds, string_agg(distinct e.source, ' + ') as sources,
  (array_agg(e.ticket_id order by e.created_ts) filter (where e.ticket_id is not null))[1] as ticket_id
 from ex e group by e.serial_key, e.failure_code, e.act_date
),
ev_people as (
 select e.serial_key, e.failure_code, e.act_date, array_agg(distinct p) as ids
 from ex e cross join lateral unnest(e.people) as p group by e.serial_key, e.failure_code, e.act_date
),
seq as (
 select ev.*, lead(ev.act_date) over (partition by ev.serial_key, ev.failure_code order by ev.act_date) as next_date
 from ev
),
shaped as (
 select s.*, coalesce(ep.ids, '{}'::uuid[]) as participant_ids,
  array(select distinct pr.team from prof pr where pr.id = any(coalesce(ep.ids, '{}'::uuid[])) and pr.team is not null) as people_teams,
  (select string_agg(pr.nombre_completo, ' / ' order by pr.nombre_completo) from prof pr where pr.id = any(coalesce(ep.ids, '{}'::uuid[]))) as participant_names,
  tk.numero_caso, tk.area, coalesce(tk.prioridad, 'sin_prioridad') as priority, eqs.modelo, eqs.razon_social
 from seq s
 left join ev_people ep on ep.serial_key = s.serial_key and ep.failure_code = s.failure_code and ep.act_date = s.act_date
 left join tk on tk.id = s.ticket_id
 left join eqs on eqs.serial_key = s.serial_key
)
select s.serial_key || '|' || s.failure_code || '|' || s.act_date::text, s.serial, s.serial_key, s.failure_code,
 (select c.catalog_detail from cat c where c.catalog_kind = 'averia' and c.catalog_code = s.failure_code limit 1),
 (select c.catalog_type from cat c where c.catalog_kind = 'averia' and c.catalog_code = s.failure_code limit 1),
 s.solution_codes,
 (select string_agg(x || coalesce(' · ' || c.catalog_detail, ''), ' | ' order by x) from unnest(s.solution_codes) x left join cat c on c.catalog_kind = 'solucion' and c.catalog_code = x),
 s.act_date, public.service_kpi_bucket(s.act_date, w.granularity), s.act_date between w.from_date and w.to_date,
 s.ticket_id, s.numero_caso, s.participant_ids, s.participant_names,
 case when cardinality(s.people_teams) > 0 then s.people_teams else array[coalesce(s.area, 'ingenieria')] end,
 s.modelo, s.razon_social, s.priority, s.kinds, s.sources,
 s.next_date, s.next_date - s.act_date,
 s.act_date + w.recurrence_days <= w.cut_date,
 s.act_date + w.recurrence_days <= w.cut_date and s.next_date is not null and s.next_date - s.act_date <= w.recurrence_days,
 lower(concat_ws(' ', s.numero_caso, s.serial, s.failure_code, s.modelo, s.razon_social, s.participant_names, array_to_string(s.solution_codes, ' ')))
from shaped s cross join w cross join f
where (f.team is null or f.team = any(case when cardinality(s.people_teams) > 0 then s.people_teams else array[coalesce(s.area, 'ingenieria')] end))
 and (f.person is null or f.person = any(s.participant_ids))
 and (f.client is null or s.razon_social = f.client)
 and (f.platform is null or s.modelo = f.platform)
 and (f.serial_key is null or s.serial_key = f.serial_key)
 and (f.service_type is null or f.service_type = any(s.kinds))
 and (f.priority is null or f.priority = s.priority)
$$;

-- Piezas utilizadas: refacciones del historial de servicio y materiales tipo refacción de los
-- reportes (incluidos los partes SAP). El costo solo existe cuando el material tiene precio.
create function public.service_kpi_part_rows(p_filters jsonb default '{}'::jsonb)
returns table (
 part_id text, source text, code text, description text, quantity numeric, maintenance_kind text,
 activity_date date, bucket date, in_period boolean, ticket_id uuid, folio text, record_ref text,
 serial text, serial_key text, platform text, client text, priority text,
 participant_ids uuid[], participant_names text, teams text[],
 unit_cost numeric, line_cost numeric, has_cost boolean, search_text text)
language sql stable set search_path = public as $$
with w as (select * from public.service_kpi_window(p_filters)),
f as (
 select public.service_kpi_filter(p_filters, 'team') as team, public.service_kpi_filter(p_filters, 'person')::uuid as person,
  public.service_kpi_filter(p_filters, 'client') as client, public.service_kpi_filter(p_filters, 'platform') as platform,
  public.normalize_equipment_serial(public.service_kpi_filter(p_filters, 'serial')) as serial_key,
  public.service_kpi_filter(p_filters, 'service_type') as service_type, public.service_kpi_filter(p_filters, 'priority') as priority
),
prof as (select p.id, p.nombre_completo, public.ticket_person_key(p.nombre_completo) as pkey, public.service_staff_team(p.employee_type) as team
 from public.profiles p),
eqs as (
 select distinct on (public.normalize_equipment_serial(e.numero_serie)) public.normalize_equipment_serial(e.numero_serie) as serial_key, e.modelo, c.razon_social
 from public.equipos e left join public.clientes c on c.id = e.cliente_id
 where public.normalize_equipment_serial(e.numero_serie) is not null
 order by public.normalize_equipment_serial(e.numero_serie), (e.fecha_fin is null) desc, e.actualizado_en desc nulls last
),
tk as (select t.id, t.numero_caso, t.prioridad from public.tickets t),
lines as (
 select 'hist:' || sr.id::text as part_id, 'Historial de servicio'::text as source, sr.codigo_refaccion as code,
  coalesce(rc.descripcion, rc.nombre) as description, sr.cantidad::numeric as quantity,
  public.service_history_kind(h.tipo_servicio, h.motivo) as kind,
  case when h.fecha_servicio between date '2000-01-01' and w.today then h.fecha_servicio end as activity_date,
  h.ticket_id, 'Servicio ' || coalesce(h.id_legacy::text, left(h.id::text, 8)) as record_ref,
  h.no_serie as serial, public.normalize_equipment_serial(h.no_serie) as serial_key, rc.equipo as catalog_platform,
  case when h.tecnico_id is null then '{}'::uuid[] else array[h.tecnico_id] end as people,
  null::numeric as unit_cost
 from public.servicios_refacciones sr
 join public.servicios_historial h on h.id = sr.servicio_id
 left join public.refacciones_catalogo rc on rc.codigo_refaccion = sr.codigo_refaccion
 cross join w
 union all
 select 'mat:' || m.id::text, case when r.external_source = 'sap_fsm' then 'Parte SAP' else 'Reporte de servicio' end,
  coalesce(nullif(btrim(m.reference_code), ''), nullif(btrim(m.catalog_code), '')),
  coalesce(nullif(btrim(m.product_name), ''), rc.descripcion), m.quantity::numeric,
  public.service_report_kind(r.service_type),
  case when coalesce(r.service_date, (r.created_at at time zone w.tz)::date) between date '2000-01-01' and w.today
   then coalesce(r.service_date, (r.created_at at time zone w.tz)::date) end,
  r.service_ticket_id, coalesce(r.report_reference, r.external_document_number, left(r.id::text, 8)),
  r.equipment_serial, public.normalize_equipment_serial(r.equipment_serial), rc.equipo,
  case when r.engineer_id is not null then array[r.engineer_id]
   else coalesce((select array_agg(p.id) from public.sap_service_reports s join prof p on p.pkey = public.ticket_person_key(s.technician_name)
                  where s.service_report_id = r.id), '{}'::uuid[]) end,
  m.price_mxn
 from public.service_report_materials m
 join public.service_reports r on r.id = m.service_report_id
 left join public.refacciones_catalogo rc on rc.codigo_refaccion = coalesce(nullif(btrim(m.reference_code), ''), nullif(btrim(m.catalog_code), ''))
 cross join w
 where m.material_kind = 'refaccion' and r.status::text <> 'borrador'
),
shaped as (
 select l.*, case when l.kind in ('preventivo','correctivo') then l.kind when l.kind = 'sin_clasificar' then 'sin_clasificar' else 'otro' end as maintenance_kind,
  array(select distinct pr.team from prof pr where pr.id = any(l.people) and pr.team is not null) as people_teams,
  (select string_agg(pr.nombre_completo, ' / ' order by pr.nombre_completo) from prof pr where pr.id = any(l.people)) as participant_names,
  tk.numero_caso, coalesce(tk.prioridad, 'sin_prioridad') as priority,
  coalesce(eqs.modelo, nullif(btrim(l.catalog_platform), '')) as platform, eqs.razon_social as client
 from lines l left join tk on tk.id = l.ticket_id left join eqs on eqs.serial_key = l.serial_key
 where l.kind <> 'prueba'
)
select s.part_id, s.source, s.code, s.description, s.quantity, s.maintenance_kind,
 s.activity_date, public.service_kpi_bucket(s.activity_date, w.granularity), coalesce(s.activity_date between w.from_date and w.to_date, false),
 s.ticket_id, s.numero_caso, s.record_ref, s.serial, s.serial_key, s.platform, s.client, s.priority,
 s.people, s.participant_names,
 case when cardinality(s.people_teams) > 0 then s.people_teams else array['ingenieria'] end,
 s.unit_cost, round(s.unit_cost * s.quantity, 2), s.unit_cost is not null,
 lower(concat_ws(' ', s.code, s.description, s.serial, s.platform, s.client, s.participant_names, s.numero_caso, s.record_ref))
from shaped s cross join w cross join f
where (f.team is null or f.team = any(case when cardinality(s.people_teams) > 0 then s.people_teams else array['ingenieria'] end))
 and (f.person is null or f.person = any(s.people))
 and (f.client is null or s.client = f.client)
 and (f.platform is null or s.platform = f.platform)
 and (f.serial_key is null or s.serial_key = f.serial_key)
 and (f.service_type is null or f.service_type = s.maintenance_kind)
 and (f.priority is null or f.priority = s.priority)
$$;

-- Encuestas respondidas (sin invitaciones de prueba). Solo existen si el cliente contestó.
create function public.service_kpi_survey_rows(p_filters jsonb default '{}'::jsonb)
returns table (
 survey_id uuid, ticket_id uuid, folio text, specialist_id uuid, specialist_name text, team text,
 answered_at timestamptz, answered_date date, bucket date, in_period boolean,
 satisfaction smallint, speed smallint, clarity smallint, resolution text, improvement text, comment text,
 serial text, platform text, client text, priority text, search_text text)
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
  s.satisfaction, s.speed, s.clarity, s.resolution, s.improvement, s.comment,
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
 lower(concat_ws(' ', r.folio, r.specialist_name, r.serial, r.modelo, r.razon_social, r.comment))
from rows_ r cross join w cross join f
where (f.team is null or r.team = f.team)
 and (f.person is null or r.specialist_id = f.person)
 and (f.client is null or r.razon_social = f.client)
 and (f.platform is null or r.modelo = f.platform)
 and (f.serial_key is null or r.serial_key = f.serial_key)
 and (f.service_type is null or r.service_type = f.service_type)
 and (f.priority is null or r.priority = f.priority)
$$;

-- 8) Agregados ------------------------------------------------------------------------------
-- Cada conjunto de registros se calcula una sola vez por periodo (actual y anterior); tarjetas,
-- series, desgloses y calidad de datos se derivan de esas mismas filas.
create function public.service_kpi_summary_data(p_filters jsonb, p_previous jsonb) returns jsonb
language sql stable set search_path = public as $$
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
 'visits_by_result', coalesce((select jsonb_agg(jsonb_build_object('label', q.result, 'n', q.n) order by q.n desc)
   from (select coalesce(a.result, 'sin_dato') as result, count(*) as n from a where a.is_visit group by 1) q), '[]'::jsonb),
 'calls_by_reason', coalesce((select jsonb_agg(jsonb_build_object('label', q.reason, 'n', q.n, 'minutes', q.m) order by q.n desc)
   from (select coalesce(a.reason, 'sin_dato') as reason, count(*) as n, sum(a.duration_min) as m from a where a.is_call group by 1) q), '[]'::jsonb),
 'calls_by_result', coalesce((select jsonb_agg(jsonb_build_object('label', q.result, 'n', q.n) order by q.n desc)
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
   from (select coalesce(a.client, 'Sin cliente identificado') as label, count(*) as n from a where a.is_visit and 'correctivo' = any(a.kinds) group by 1 order by count(*) desc limit 15) q), '[]'::jsonb),
 'corrective_by_serial', coalesce((select jsonb_agg(jsonb_build_object('label', q.label, 'platform', q.platform, 'client', q.client, 'n', q.n) order by q.n desc, q.label)
   from (select coalesce(a.serial, 'Sin serie') as label, max(a.platform) as platform, max(a.client) as client, count(*) as n
    from a where a.is_visit and 'correctivo' = any(a.kinds) group by 1 order by count(*) desc limit 15) q), '[]'::jsonb),
 'parts_by_platform', coalesce((select jsonb_agg(jsonb_build_object('platform', q.platform, 'kind', q.kind, 'lines', q.lines, 'qty', q.qty, 'cost_lines', q.cl, 'cost', q.cost)
    order by q.platform, q.kind)
   from (select coalesce(pt.platform, 'Sin plataforma') as platform, pt.maintenance_kind as kind, count(*) as lines, sum(pt.quantity) as qty,
     count(*) filter (where pt.has_cost) as cl, sum(pt.line_cost) as cost from pt group by 1, 2) q), '[]'::jsonb),
 'parts_top', coalesce((select jsonb_agg(jsonb_build_object('code', q.code, 'description', q.description, 'qty', q.qty, 'preventive', q.pv, 'corrective', q.cr) order by q.qty desc, q.code)
   from (select coalesce(pt.code, 'Sin código') as code, max(pt.description) as description, sum(pt.quantity) as qty,
     sum(pt.quantity) filter (where pt.maintenance_kind = 'preventivo') as pv, sum(pt.quantity) filter (where pt.maintenance_kind = 'correctivo') as cr
    from pt group by 1 order by sum(pt.quantity) desc limit 15) q), '[]'::jsonb)
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
$$;

-- 9) API del centro de control (solo administradores) ----------------------------------------
create function public.get_service_kpi_summary(p_filters jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare w public.service_kpi_window; v_previous jsonb;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Los indicadores del personal son exclusivos para administradores'; end if;
 w := public.service_kpi_window(coalesce(p_filters, '{}'::jsonb));
 v_previous := coalesce(p_filters, '{}'::jsonb) || jsonb_build_object('from', w.prev_from, 'to', w.prev_to);
 return jsonb_build_object(
  'period', jsonb_build_object('from', w.from_date, 'to', w.to_date, 'previous_from', w.prev_from, 'previous_to', w.prev_to,
    'cut_at', w.cut_at, 'cut_is_now', w.cut_is_now, 'timezone', w.tz, 'granularity', w.granularity,
    'recurrence_days', w.recurrence_days, 'min_sample', w.min_sample, 'capture_since', w.capture_since),
  'policies', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'channel', p.channel, 'region', p.region, 'area', p.area,
     'priority', p.priority, 'target_hours', p.target_hours, 'clock', p.clock, 'business_start', p.business_start, 'business_end', p.business_end,
     'business_days', p.business_days, 'timezone', p.timezone, 'pause_states', p.pause_states, 'precedence', p.precedence, 'active', p.active,
     'notes', p.notes) order by p.precedence, p.created_at) from public.ticket_sla_policies p), '[]'::jsonb)
 ) || public.service_kpi_summary_data(p_filters, v_previous);
end; $$;

create function public.get_service_kpi_records(
 p_dataset text, p_filters jsonb default '{}'::jsonb, p_match jsonb default '{}'::jsonb,
 p_search text default null, p_sort text default null, p_desc boolean default true,
 p_offset integer default 0, p_limit integer default 25
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_sort text; v_search text := lower(nullif(btrim(coalesce(p_search, '')), '')); v_match jsonb := coalesce(p_match, '{}'::jsonb);
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Los indicadores del personal son exclusivos para administradores'; end if;
 if p_dataset is null or p_dataset not in ('tickets','activities','failures','parts','surveys') then raise exception 'Conjunto de registros no válido'; end if;
 if jsonb_typeof(v_match) <> 'object' then raise exception 'Criterio de registros no válido'; end if;
 v_sort := coalesce(nullif(p_sort, ''), case p_dataset when 'tickets' then 'opened_at' when 'surveys' then 'answered_at' else 'activity_date' end);
 if v_sort !~ '^[a-z_]{1,40}$' then raise exception 'Orden no válido'; end if;
 -- Solo se ejecuta el conjunto solicitado: los demás quedan descartados por su filtro constante.
 return (
  with src as (
   select to_jsonb(x) as j from public.service_kpi_ticket_rows(p_filters) x where p_dataset = 'tickets'
   union all select to_jsonb(x) from public.service_kpi_activity_rows(p_filters) x where p_dataset = 'activities'
   union all select to_jsonb(x) from public.service_kpi_failure_rows(p_filters) x where p_dataset = 'failures'
   union all select to_jsonb(x) from public.service_kpi_part_rows(p_filters) x where p_dataset = 'parts'
   union all select to_jsonb(x) from public.service_kpi_survey_rows(p_filters) x where p_dataset = 'surveys'
  ), filtered as materialized (
   select src.j from src
   where src.j @> v_match and (v_search is null or strpos(coalesce(src.j->>'search_text', ''), v_search) > 0)
  ), page as (
   select fr.j, row_number() over (order by
     case when p_desc then fr.j->v_sort end desc nulls last,
     case when not p_desc then fr.j->v_sort end asc nulls last,
     fr.j::text) as ord
   from filtered fr
  )
  select jsonb_build_object(
   'total', (select count(*) from filtered),
   'rows', coalesce((select jsonb_agg(p.j - 'search_text' order by p.ord) from (
      select page.j, page.ord from page order by page.ord
      offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 25), 1), 1000)) p), '[]'::jsonb))
 );
end; $$;

create function public.get_service_kpi_options() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Los indicadores del personal son exclusivos para administradores'; end if;
 return (
  with t as (select * from public.service_kpi_ticket_rows('{}'::jsonb)),
  a as (select * from public.service_kpi_activity_rows('{}'::jsonb)),
  pt as (select * from public.service_kpi_part_rows('{}'::jsonb))
  select jsonb_build_object(
   'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(p.nombre_completo, 'Sin nombre'),
      'team', coalesce(public.service_staff_team(p.employee_type), 'sin_clasificar')) order by p.nombre_completo)
     from public.profiles p where p.rol::text in ('admin','tecnico')), '[]'::jsonb),
   'clients', coalesce((select jsonb_agg(x order by x) from (select distinct client as x from t where client is not null
     union select client from a where client is not null union select client from pt where client is not null) q), '[]'::jsonb),
   'platforms', coalesce((select jsonb_agg(x order by x) from (select distinct platform as x from t where platform is not null
     union select platform from a where platform is not null union select platform from pt where platform is not null) q), '[]'::jsonb),
   'serials', coalesce((select jsonb_agg(x order by x) from (select distinct serial as x from t where serial is not null
     union select serial from a where serial is not null) q), '[]'::jsonb),
   'statuses', coalesce((select jsonb_agg(x order by x) from (select distinct estado as x from t) q), '[]'::jsonb)
  )
 );
end; $$;

-- Las funciones internas solo se ejecutan dentro de las API anteriores.
revoke all on function public.service_staff_team(text), public.service_kind_team(text), public.service_planning_kind(text, text),
 public.service_history_kind(text, text), public.service_report_kind(text), public.service_planning_dates(jsonb, timestamptz),
 public.service_clock_hours(timestamptz, timestamptz, text, text, time, time, smallint[]),
 public.service_sla_hours(uuid, timestamptz, timestamptz, public.ticket_sla_policies),
 public.service_ticket_channel(text, text, text), public.service_ticket_region(text, text, text, text, text),
 public.service_kpi_bucket(date, text), public.service_kpi_ratio(bigint, bigint), public.service_kpi_window(jsonb),
 public.service_kpi_filter(jsonb, text), public.service_kpi_ticket_rows(jsonb), public.service_kpi_exec_records(text),
 public.service_kpi_plan_records(), public.service_kpi_activity_rows(jsonb), public.service_kpi_failure_rows(jsonb),
 public.service_kpi_part_rows(jsonb), public.service_kpi_survey_rows(jsonb), public.service_kpi_summary_data(jsonb, jsonb)
 from public, anon, authenticated;
revoke all on function public.get_service_kpi_summary(jsonb), public.get_service_kpi_records(text, jsonb, jsonb, text, text, boolean, integer, integer),
 public.get_service_kpi_options() from public, anon;
grant execute on function public.get_service_kpi_summary(jsonb), public.get_service_kpi_records(text, jsonb, jsonb, text, text, boolean, integer, integer),
 public.get_service_kpi_options() to authenticated;
