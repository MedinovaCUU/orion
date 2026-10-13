-- Métrica «Supremo en visitas presenciales».
-- Cada visita presencial (la misma definición de «Visitas» del centro de control: registros del mismo
-- equipo y día son una visita) se compara con el registro de Supremo de su número de serie en Orion:
-- * positiva: el equipo ya tenía Supremo registrado al iniciar el día de la visita, o quedó registrado
--   antes de que cerrara el plazo (día de la visita + N días). Registrado = habilitado con un ID de
--   9 dígitos. Si otra persona lo instaló antes, la visita también es positiva.
-- * pendiente: el plazo sigue abierto y aún no hay Supremo válido.
-- * negativa: al cerrar el plazo el equipo no tenía Supremo válido.
-- * anulada: un administrador justificó por escrito que el equipo no lleva Supremo; no suma ni resta.
-- El estado se lee del historial de Supremo del equipo, así una visita no cambia de resultado por
-- movimientos posteriores al plazo. La métrica se apaga en supremo_metric_settings.active sin borrar datos.

-- 1) Registro de Supremo en el equipo (ya existe en producción; aquí solo por idempotencia) -----------
alter table public.equipos
 add column if not exists supremo_id text,
 add column if not exists supremo_alias text,
 add column if not exists supremo_enabled boolean not null default false;

create function public.supremo_id_is_valid(p_id text) returns boolean
language sql immutable as $$
 select coalesce(regexp_replace(p_id, '\s', '', 'g') ~ '^[0-9]{9}$', false)
$$;

-- 2) Parámetros e interruptor ---------------------------------------------------------------------
create table public.supremo_metric_settings (
 id boolean primary key default true check (id),
 active boolean not null default true,
 -- Solo cuentan las visitas desde esta fecha; nunca antes de que exista el historial.
 effective_from date not null default (now() at time zone 'America/Chihuahua')::date,
 grace_days integer not null default 3 check (grace_days between 0 and 30),
 history_since timestamptz not null default clock_timestamp(),
 reason text check (reason is null or char_length(reason) <= 500),
 updated_by uuid references public.profiles(id),
 updated_at timestamptz not null default clock_timestamp()
);
insert into public.supremo_metric_settings(id) values (true);

-- 3) Historial de Supremo por número de serie --------------------------------------------------------
create table public.equipment_supremo_history (
 id bigint generated always as identity primary key,
 serial_key text not null,
 equipment_id text,
 supremo_id text,
 enabled boolean not null,
 valid boolean not null,
 source text not null check (source in ('estado_inicial','cambio','cambio_serie','baja_equipo')),
 changed_by uuid,
 changed_at timestamptz not null default clock_timestamp()
);
create index equipment_supremo_history_serial_idx on public.equipment_supremo_history (serial_key, changed_at desc, id desc);

-- Estado vigente antes de esta migración: se desconoce desde cuándo, así que cuenta como previo a todo.
insert into public.equipment_supremo_history(serial_key, equipment_id, supremo_id, enabled, valid, source, changed_at)
select public.normalize_equipment_serial(e.numero_serie), e.id, nullif(btrim(e.supremo_id), ''), coalesce(e.supremo_enabled, false),
 coalesce(e.supremo_enabled, false) and public.supremo_id_is_valid(e.supremo_id), 'estado_inicial', '-infinity'
from public.equipos e
where public.normalize_equipment_serial(e.numero_serie) is not null
 and (nullif(btrim(e.supremo_id), '') is not null or coalesce(e.supremo_enabled, false));

create function public.track_equipment_supremo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_old_key text; v_new_key text; v_old_valid boolean := false; v_new_valid boolean := false; v_changed boolean := false;
begin
 if tg_op in ('UPDATE','DELETE') then
   v_old_key := public.normalize_equipment_serial(old.numero_serie);
   v_old_valid := coalesce(old.supremo_enabled, false) and public.supremo_id_is_valid(old.supremo_id);
 end if;
 if tg_op in ('INSERT','UPDATE') then
   v_new_key := public.normalize_equipment_serial(new.numero_serie);
   v_new_valid := coalesce(new.supremo_enabled, false) and public.supremo_id_is_valid(new.supremo_id);
 end if;
 -- La serie anterior pierde su Supremo cuando el equipo se elimina o cambia de serie.
 if v_old_key is not null and v_old_key is distinct from v_new_key and v_old_valid then
   insert into public.equipment_supremo_history(serial_key, equipment_id, supremo_id, enabled, valid, source, changed_by)
   values (v_old_key, old.id, nullif(btrim(old.supremo_id), ''), coalesce(old.supremo_enabled, false), false,
     case when tg_op = 'DELETE' then 'baja_equipo' else 'cambio_serie' end, auth.uid());
 end if;
 if tg_op = 'INSERT' then
   v_changed := nullif(btrim(new.supremo_id), '') is not null or coalesce(new.supremo_enabled, false);
 elsif tg_op = 'UPDATE' then
   v_changed := new.supremo_id is distinct from old.supremo_id or new.supremo_enabled is distinct from old.supremo_enabled
     or (v_new_key is distinct from v_old_key and v_new_valid);
 end if;
 if v_new_key is not null and v_changed then
   insert into public.equipment_supremo_history(serial_key, equipment_id, supremo_id, enabled, valid, source, changed_by)
   values (v_new_key, new.id, nullif(btrim(new.supremo_id), ''), coalesce(new.supremo_enabled, false), v_new_valid, 'cambio', auth.uid());
 end if;
 return null;
end; $$;
create trigger track_equipment_supremo after insert or update or delete on public.equipos
 for each row execute function public.track_equipment_supremo();

-- 4) Justificaciones (anulan la métrica de un equipo) ----------------------------------------------
-- Una justificación vigente anula todas las visitas del equipo; al revocarla, las visitas hasta el día
-- de la revocación siguen anuladas y las posteriores vuelven a contar.
create table public.supremo_metric_exemptions (
 id uuid primary key default gen_random_uuid(),
 serial_key text not null,
 serial text not null,
 equipment_id text,
 justification text not null check (char_length(btrim(justification)) between 20 and 1000),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp(),
 revoked_at timestamptz,
 revoked_by uuid references public.profiles(id),
 revoke_reason text check (revoke_reason is null or char_length(btrim(revoke_reason)) between 5 and 500),
 check ((revoked_at is null) = (revoked_by is null) and (revoked_at is null) = (revoke_reason is null))
);
create unique index supremo_metric_exemptions_active_idx on public.supremo_metric_exemptions (serial_key) where revoked_at is null;

alter table public.supremo_metric_settings enable row level security;
alter table public.equipment_supremo_history enable row level security;
alter table public.supremo_metric_exemptions enable row level security;
create policy "Admins read supremo metric settings" on public.supremo_metric_settings for select to authenticated using (public.is_admin());
create policy "Admins read supremo history" on public.equipment_supremo_history for select to authenticated using (public.is_admin());
create policy "Admins read supremo exemptions" on public.supremo_metric_exemptions for select to authenticated using (public.is_admin());
-- Las escrituras pasan solo por el disparador y las funciones de abajo.

-- 5) Evaluación por visita ------------------------------------------------------------------------
create function public.supremo_metric_visit_rows(p_filters jsonb default '{}'::jsonb)
returns table (
 visit_id text, visit_date date, deadline date, serial text, serial_key text, platform text, client text, sources text,
 kinds text[], ticket_id uuid, folio text, participant_ids uuid[], participant_names text, unmatched_names text,
 outcome text, reason text, detail text, in_catalog boolean, equipment_id text, supremo_id text,
 exemption_id uuid, exemption_justification text, exemption_by text, exemption_at timestamptz)
language sql stable set search_path = public as $$
with cfg as (
 select s.effective_from, s.grace_days, coalesce((select k.timezone from public.service_kpi_settings k where k.id), 'America/Chihuahua') as tz
 from public.supremo_metric_settings s where s.id
),
v as materialized (
 select a.*, a.activity_date::timestamp at time zone cfg.tz as start_at,
  (a.activity_date + cfg.grace_days + 1)::timestamp at time zone cfg.tz as cut_at, a.activity_date + cfg.grace_days as deadline, cfg.tz
 from public.service_kpi_activity_rows(p_filters) a cross join cfg
 where a.is_visit and a.in_period and a.activity_date >= cfg.effective_from
),
eq as (
 select public.normalize_equipment_serial(e.numero_serie) as serial_key, e.id
 from public.equipos e where public.normalize_equipment_serial(e.numero_serie) is not null
),
evaluated as (
 select v.*, eq.id as eq_id, at_start.valid as valid_at_start, at_cut.valid as valid_at_cut, at_cut.enabled as enabled_at_cut,
  at_cut.supremo_id as supremo_at_cut, ex.id as ex_id, ex.justification as ex_justification, ex.created_at as ex_at, pr.nombre_completo as ex_by
 from v
 left join eq on eq.serial_key = v.serial_key
 left join lateral (select h.valid from public.equipment_supremo_history h
   where h.serial_key = v.serial_key and h.changed_at <= v.start_at order by h.changed_at desc, h.id desc limit 1) at_start on true
 left join lateral (select h.valid, h.enabled, h.supremo_id from public.equipment_supremo_history h
   where h.serial_key = v.serial_key and h.changed_at <= least(v.cut_at, now()) order by h.changed_at desc, h.id desc limit 1) at_cut on true
 left join lateral (select x.id, x.justification, x.created_at, x.created_by from public.supremo_metric_exemptions x
   where x.serial_key = v.serial_key and (x.revoked_at is null or v.activity_date <= (x.revoked_at at time zone v.tz)::date)
   order by x.created_at desc limit 1) ex on true
 left join public.profiles pr on pr.id = ex.created_by
)
select e.activity_id, e.activity_date, e.deadline, e.serial, e.serial_key, e.platform, e.client, e.source, e.kinds, e.ticket_id, e.folio,
 e.participant_ids, e.participant_names, e.unmatched_names,
 case
  when e.serial_key is null then 'sin_serie'
  when e.ex_id is not null then 'anulada'
  when coalesce(e.valid_at_start, false) or coalesce(e.valid_at_cut, false) then 'positiva'
  when now() < e.cut_at then 'pendiente'
  else 'negativa' end,
 case
  when e.serial_key is null then 'sin_serie'
  when e.ex_id is not null then 'justificada'
  when coalesce(e.valid_at_start, false) then 'ya_registrado'
  when coalesce(e.valid_at_cut, false) then 'registrado_en_plazo'
  when e.eq_id is null then 'fuera_de_catalogo'
  when e.supremo_at_cut is not null and not public.supremo_id_is_valid(e.supremo_at_cut) then 'id_invalido'
  when e.supremo_at_cut is not null and not coalesce(e.enabled_at_cut, false) then 'deshabilitado'
  else 'sin_registro' end,
 case
  when e.serial_key is null then 'La visita no tiene número de serie'
  when e.ex_id is not null then 'Anulada por justificación'
  when coalesce(e.valid_at_start, false) then 'Supremo ya registrado antes de la visita'
  when coalesce(e.valid_at_cut, false) then 'Supremo registrado dentro del plazo'
  when e.eq_id is null then 'El número de serie no está en el catálogo de equipos'
  when e.supremo_at_cut is not null and not public.supremo_id_is_valid(e.supremo_at_cut) then 'ID de Supremo inválido (debe tener 9 dígitos)'
  when e.supremo_at_cut is not null and not coalesce(e.enabled_at_cut, false) then 'Supremo capturado pero deshabilitado'
  else 'Sin Supremo registrado' end,
 e.eq_id is not null, e.eq_id,
 case when coalesce(e.valid_at_cut, false) or coalesce(e.valid_at_start, false) then e.supremo_at_cut end,
 e.ex_id, e.ex_justification, e.ex_by, e.ex_at
from evaluated e
$$;

create function public.supremo_metric_settings_json() returns jsonb
language sql stable security definer set search_path = public as $$
 select jsonb_build_object('active', s.active, 'effective_from', s.effective_from, 'grace_days', s.grace_days,
  'history_since', s.history_since, 'reason', s.reason, 'updated_at', s.updated_at, 'updated_by_name', p.nombre_completo,
  'timezone', coalesce((select k.timezone from public.service_kpi_settings k where k.id), 'America/Chihuahua'))
 from public.supremo_metric_settings s left join public.profiles p on p.id = s.updated_by where s.id
$$;

-- 6) API de administración --------------------------------------------------------------------------
-- Usa los mismos filtros del centro de control (periodo, equipo químico/ingeniería, colaborador,
-- cliente, plataforma, serie, tipo de servicio y prioridad).
create function public.get_supremo_metric(p_filters jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_settings jsonb := public.supremo_metric_settings_json(); v_team text := public.service_kpi_filter(p_filters, 'team');
 v_person uuid; v_result jsonb;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'La métrica de Supremo es exclusiva para administradores'; end if;
 begin v_person := public.service_kpi_filter(p_filters, 'person')::uuid; exception when others then raise exception 'Colaborador no válido'; end;
 if not (v_settings->>'active')::boolean then
   return jsonb_build_object('settings', v_settings);
 end if;
 with r as materialized (select * from public.supremo_metric_visit_rows(coalesce(p_filters, '{}'::jsonb))),
 per as (
  select p.id, p.nombre_completo as name, public.service_staff_team(p.employee_type) as team,
   count(*) filter (where r.outcome = 'positiva') as positive, count(*) filter (where r.outcome = 'negativa') as negative,
   count(*) filter (where r.outcome = 'pendiente') as pending, count(*) filter (where r.outcome = 'anulada') as voided
  from r cross join lateral unnest(r.participant_ids) as pid join public.profiles p on p.id = pid
  where (v_team is null or public.service_staff_team(p.employee_type) = v_team) and (v_person is null or p.id = v_person)
  group by p.id, p.nombre_completo, p.employee_type
 )
 select jsonb_build_object(
  'settings', v_settings,
  'totals', jsonb_build_object(
    'visits', count(*), 'positive', count(*) filter (where outcome = 'positiva'),
    'already', count(*) filter (where reason = 'ya_registrado'), 'installed', count(*) filter (where reason = 'registrado_en_plazo'),
    'negative', count(*) filter (where outcome = 'negativa'), 'pending', count(*) filter (where outcome = 'pendiente'),
    'voided', count(*) filter (where outcome = 'anulada'), 'no_serial', count(*) filter (where outcome = 'sin_serie')),
  'compliance', public.service_kpi_ratio(count(*) filter (where outcome = 'positiva'), count(*) filter (where outcome in ('positiva','negativa'))),
  'people', coalesce((select jsonb_agg(jsonb_build_object('id', per.id, 'name', per.name, 'team', per.team, 'positive', per.positive,
     'negative', per.negative, 'pending', per.pending, 'voided', per.voided,
     'compliance', public.service_kpi_ratio(per.positive, per.positive + per.negative)) order by per.name) from per), '[]'::jsonb),
  'visits', coalesce((select jsonb_agg(to_jsonb(x) - 'rank_' order by x.rank_, x.visit_date desc, x.serial) from (
     select r2.*, array_position(array['negativa','pendiente','sin_serie','anulada','positiva'], r2.outcome) as rank_
     from r r2 order by array_position(array['negativa','pendiente','sin_serie','anulada','positiva'], r2.outcome), r2.visit_date desc, r2.serial limit 500) x), '[]'::jsonb)
 ) into v_result from r;
 return v_result;
end; $$;

create function public.get_supremo_exemptions() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Solo administración consulta las justificaciones de Supremo'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'serial', x.serial, 'serial_key', x.serial_key, 'equipment_id', x.equipment_id,
   'model', e.modelo, 'client', c.razon_social, 'justification', x.justification, 'created_at', x.created_at, 'created_by_name', pc.nombre_completo,
   'revoked_at', x.revoked_at, 'revoked_by_name', pr.nombre_completo, 'revoke_reason', x.revoke_reason) order by x.revoked_at is not null, x.created_at desc)
  from public.supremo_metric_exemptions x
  left join public.equipos e on public.normalize_equipment_serial(e.numero_serie) = x.serial_key
  left join public.clientes c on c.id = e.cliente_id
  left join public.profiles pc on pc.id = x.created_by left join public.profiles pr on pr.id = x.revoked_by), '[]'::jsonb);
end; $$;

create function public.set_supremo_metric_settings(p_active boolean, p_effective_from date, p_grace_days integer, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.supremo_metric_settings%rowtype; v_reason text := nullif(btrim(coalesce(p_reason, '')), ''); v_tz text;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Solo administración configura la métrica de Supremo'; end if;
 select * into s from public.supremo_metric_settings where id for update;
 v_tz := coalesce((select k.timezone from public.service_kpi_settings k where k.id), 'America/Chihuahua');
 if p_active is null or p_effective_from is null or p_grace_days is null then raise exception 'Faltan parámetros de la métrica'; end if;
 if p_grace_days not between 0 and 30 then raise exception 'El plazo para registrar Supremo debe estar entre 0 y 30 días'; end if;
 if p_effective_from < (s.history_since at time zone v_tz)::date then
   raise exception 'La métrica no puede iniciar antes del %, cuando empezó el historial de Supremo', to_char((s.history_since at time zone v_tz)::date, 'DD/MM/YYYY');
 end if;
 if s.active and not p_active and coalesce(char_length(v_reason), 0) < 10 then
   raise exception 'Escribe el motivo para desactivar la métrica (al menos 10 caracteres)';
 end if;
 if char_length(v_reason) > 500 then raise exception 'El motivo admite hasta 500 caracteres'; end if;
 update public.supremo_metric_settings set active = p_active, effective_from = p_effective_from, grace_days = p_grace_days,
  reason = case when v_reason is not null then v_reason when p_active is distinct from s.active then null else s.reason end,
  updated_by = auth.uid(), updated_at = clock_timestamp()
 where id;
 return public.supremo_metric_settings_json();
end; $$;

create function public.justify_supremo_exemption(p_serial text, p_justification text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_key text := public.normalize_equipment_serial(p_serial); v_text text := btrim(coalesce(p_justification, '')); v_id uuid; v_equipment text;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Solo administración puede justificar un equipo sin Supremo'; end if;
 if v_key is null then raise exception 'Indica el número de serie del equipo'; end if;
 if char_length(v_text) < 20 then raise exception 'Escribe la justificación completa (al menos 20 caracteres)'; end if;
 if char_length(v_text) > 1000 then raise exception 'La justificación admite hasta 1000 caracteres'; end if;
 if exists (select 1 from public.supremo_metric_exemptions where serial_key = v_key and revoked_at is null) then
   raise exception 'El equipo % ya tiene una justificación vigente', v_key;
 end if;
 select e.id into v_equipment from public.equipos e where public.normalize_equipment_serial(e.numero_serie) = v_key limit 1;
 insert into public.supremo_metric_exemptions(serial_key, serial, equipment_id, justification, created_by)
 values (v_key, btrim(p_serial), v_equipment, v_text, auth.uid()) returning id into v_id;
 return v_id;
end; $$;

create function public.revoke_supremo_exemption(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_text text := btrim(coalesce(p_reason, ''));
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Solo administración puede revocar una justificación'; end if;
 if char_length(v_text) < 5 then raise exception 'Escribe el motivo de la revocación'; end if;
 if char_length(v_text) > 500 then raise exception 'El motivo admite hasta 500 caracteres'; end if;
 update public.supremo_metric_exemptions set revoked_at = clock_timestamp(), revoked_by = auth.uid(), revoke_reason = v_text
 where id = p_id and revoked_at is null;
 if not found then raise exception 'La justificación no existe o ya fue revocada'; end if;
end; $$;

-- 7) API del personal en el reporte de servicio --------------------------------------------------
create function public.get_equipment_supremo_status(p_serial text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_key text := public.normalize_equipment_serial(p_serial); e public.equipos%rowtype; v_active boolean;
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Solo el personal consulta el registro de Supremo'; end if;
 select s.active into v_active from public.supremo_metric_settings s where s.id;
 if not coalesce(v_active, false) or v_key is null then return jsonb_build_object('active', coalesce(v_active, false)); end if;
 select * into e from public.equipos x where public.normalize_equipment_serial(x.numero_serie) = v_key limit 1;
 return jsonb_build_object('active', true, 'serial_key', v_key, 'in_catalog', e.id is not null, 'equipment_id', e.id, 'model', e.modelo,
  'registered', coalesce(e.supremo_enabled, false) and public.supremo_id_is_valid(e.supremo_id),
  'supremo_id', nullif(btrim(e.supremo_id), ''), 'enabled', coalesce(e.supremo_enabled, false),
  'exempt', exists (select 1 from public.supremo_metric_exemptions x where x.serial_key = v_key and x.revoked_at is null),
  'grace_days', (select s.grace_days from public.supremo_metric_settings s where s.id));
end; $$;

-- Alta desde la visita: solo si el equipo aún no tiene un Supremo válido. Cambiar un ID existente
-- sigue haciéndose en Equipos.
create function public.register_equipment_supremo(p_serial text, p_supremo_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_key text := public.normalize_equipment_serial(p_serial); v_id text := regexp_replace(coalesce(p_supremo_id, ''), '\D', '', 'g');
 e public.equipos%rowtype;
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Solo el personal registra Supremo en un equipo'; end if;
 if not public.supremo_id_is_valid(v_id) then raise exception 'El ID de Supremo debe tener 9 dígitos'; end if;
 select * into e from public.equipos x where public.normalize_equipment_serial(x.numero_serie) = v_key limit 1 for update;
 if e.id is null then raise exception 'El número de serie % no está en el catálogo de equipos; dalo de alta en Equipos', coalesce(v_key, ''); end if;
 if coalesce(e.supremo_enabled, false) and public.supremo_id_is_valid(e.supremo_id) and regexp_replace(e.supremo_id, '\D', '', 'g') <> v_id then
   raise exception 'El equipo ya tiene Supremo registrado con otro ID; cámbialo desde Equipos';
 end if;
 update public.equipos set supremo_id = v_id, supremo_enabled = true where id = e.id;
 return public.get_equipment_supremo_status(p_serial);
end; $$;

revoke all on function public.supremo_id_is_valid(text), public.track_equipment_supremo(), public.supremo_metric_visit_rows(jsonb),
 public.supremo_metric_settings_json() from public, anon, authenticated;
revoke all on function public.get_supremo_metric(jsonb), public.get_supremo_exemptions(), public.set_supremo_metric_settings(boolean, date, integer, text),
 public.justify_supremo_exemption(text, text), public.revoke_supremo_exemption(uuid, text), public.get_equipment_supremo_status(text),
 public.register_equipment_supremo(text, text) from public, anon;
grant execute on function public.get_supremo_metric(jsonb), public.get_supremo_exemptions(), public.set_supremo_metric_settings(boolean, date, integer, text),
 public.justify_supremo_exemption(text, text), public.revoke_supremo_exemption(uuid, text), public.get_equipment_supremo_status(text),
 public.register_equipment_supremo(text, text) to authenticated;
