-- ORION · Confiabilidad de reacondicionamientos (fase 1: registro auditable + lectura para el laboratorio).
--
-- Separación de entidades (nunca se infieren entre sí):
--   episodio de reacondicionamiento ≠ equipo; recomendación ≠ autorización ≠ acción ejecutada;
--   falla posterior ≠ relación causal (la relación la documenta un ingeniero con evidencia escrita).
-- Fechas: cada fila distingue la fecha del hecho (…_on) de su registro (created_at) y su modificación (updated_at).
-- Faltantes: NULL = no registrado; los valores «no_definido», «no_inspeccionado», «no_evaluado», «pendiente» y
-- «no_determinada» son estados explícitos, no ausencias. Ningún cálculo convierte un faltante en cero.
-- Integridad histórica: cada inserción, cambio o retiro queda en reliability_audit_log (solo lectura para administradores).
-- Costos: reliability_costs es la única fuente del costo total; los presupuestos del episodio (solicitado/aprobado)
-- solo alimentan «Costo de ahorrar» y nunca se suman al costo total (evita doble contabilización).

create table public.refurbishment_episodes (
  id uuid primary key default gen_random_uuid(),
  serial_key text not null check (serial_key = public.normalize_equipment_serial(serial_key)),
  serial_raw text,
  platform text,
  started_on date not null,
  finished_on date check (finished_on is null or finished_on >= started_on),
  history_service_ids uuid[] not null default '{}',
  scope text not null default 'no_definido' check (scope in ('minimo', 'protocolo', 'integral', 'no_definido')),
  release_result text not null default 'pendiente' check (release_result in ('liberado', 'liberado_con_salvedades', 'no_liberado', 'pendiente')),
  release_notes text,
  budget_requested_mxn numeric(12,2) check (budget_requested_mxn >= 0),
  budget_approved_mxn numeric(12,2) check (budget_approved_mxn >= 0),
  budget_source text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (serial_key, started_on)
);

create table public.refurbishment_component_decisions (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.refurbishment_episodes(id) on delete restrict,
  component_code text,
  component_name text not null check (btrim(component_name) <> ''),
  subsystem text,
  criticality text not null default 'no_definida' check (criticality in ('critica', 'mayor', 'menor', 'no_definida')),
  condition text not null default 'no_inspeccionado' check (condition in ('falla', 'desgaste', 'fuera_de_especificacion', 'sin_anomalia', 'no_inspeccionado')),
  condition_evidence text,
  recommendation text not null default 'sin_recomendacion' check (recommendation in ('sustituir', 'reparar', 'conservar', 'sin_recomendacion')),
  recommended_by uuid,
  recommended_on date,
  estimated_cost_mxn numeric(12,2) check (estimated_cost_mxn >= 0),
  cost_source text,
  authorization_status text not null default 'pendiente' check (authorization_status in ('pendiente', 'aprobada', 'rechazada', 'pospuesta', 'no_aplica')),
  authorization_reason text check (authorization_reason is null or authorization_reason in ('presupuesto', 'sin_existencia', 'no_necesario_tecnicamente', 'decision_comercial', 'otro')),
  authorization_detail text,
  authorized_by uuid,
  authorized_on date,
  action_taken text not null default 'pendiente' check (action_taken in ('sustituido', 'reparado', 'conservado', 'pendiente')),
  action_evidence text,
  residual_risk text not null default 'no_evaluado' check (residual_risk in ('alto', 'medio', 'bajo', 'no_evaluado')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  -- Un rechazo o aplazamiento sin motivo no es auditable.
  check (authorization_status not in ('rechazada', 'pospuesta') or authorization_reason is not null)
);
create index refurbishment_component_decisions_episode_idx on public.refurbishment_component_decisions (episode_id);

create table public.refurbishment_acceptance_tests (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.refurbishment_episodes(id) on delete restrict,
  criterion text not null check (btrim(criterion) <> ''),
  specification text,
  spec_source text,
  result text not null default 'pendiente_definicion' check (result in ('aprobado', 'no_aprobado', 'no_realizado', 'pendiente_definicion')),
  measured_value text,
  tested_on date,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  -- No se inventan tolerancias: aprobar o reprobar exige el criterio y su documento de origen.
  check (result not in ('aprobado', 'no_aprobado') or (nullif(btrim(specification), '') is not null and nullif(btrim(spec_source), '') is not null))
);
create index refurbishment_acceptance_tests_episode_idx on public.refurbishment_acceptance_tests (episode_id);

create table public.reliability_failure_links (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.refurbishment_episodes(id) on delete restrict,
  failure_service_id uuid references public.servicios_historial(id) on delete restrict,
  failure_ticket_id uuid references public.tickets(id) on delete restrict,
  decision_id uuid references public.refurbishment_component_decisions(id) on delete restrict,
  component_code text,
  relation text not null default 'no_determinada' check (relation in ('mismo_componente', 'subsistema_relacionado', 'sin_relacion', 'no_determinada')),
  evidence text,
  assessed_by uuid default auth.uid(),
  assessed_on date not null default current_date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check (failure_service_id is not null or failure_ticket_id is not null),
  -- La proximidad temporal no basta: afirmar o descartar una relación exige evidencia escrita.
  check (relation = 'no_determinada' or nullif(btrim(evidence), '') is not null)
);
create index reliability_failure_links_episode_idx on public.reliability_failure_links (episode_id);

create table public.reliability_costs (
  id uuid primary key default gen_random_uuid(),
  serial_key text not null check (serial_key = public.normalize_equipment_serial(serial_key)),
  episode_id uuid references public.refurbishment_episodes(id) on delete restrict,
  service_id uuid references public.servicios_historial(id) on delete restrict,
  ticket_id uuid references public.tickets(id) on delete restrict,
  phase text not null check (phase in ('reacondicionamiento', 'instalacion', 'correctivo', 'preventivo', 'logistica', 'otro')),
  category text not null check (category in ('refacciones', 'mano_obra', 'traslado', 'viaticos', 'paqueteria', 'equipo_sustituto', 'indisponibilidad', 'penalizacion', 'compensacion', 'otro')),
  amount_mxn numeric(12,2) not null check (amount_mxn > 0),
  nature text not null check (nature in ('comprobado', 'estimado')),
  source_document text,
  occurred_on date not null,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
-- El mismo comprobante no puede sumarse dos veces en la misma categoría.
create unique index reliability_costs_document_once on public.reliability_costs (category, lower(btrim(source_document))) where nullif(btrim(source_document), '') is not null;
create index reliability_costs_serial_idx on public.reliability_costs (serial_key);

create table public.reliability_audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_row jsonb,
  new_row jsonb,
  actor uuid,
  at timestamptz not null default now()
);
create index reliability_audit_log_row_idx on public.reliability_audit_log (table_name, row_id, at);

-- Sello de modificación y bitácora: el autor real de cada cambio, nunca el que diga el cliente.
create function public.reliability_stamp() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid(); new.created_at := now(); new.updated_by := null; new.updated_at := now();
  else
    new.created_by := old.created_by; new.created_at := old.created_at; new.updated_by := auth.uid(); new.updated_at := now();
  end if;
  return new;
end $$;

create function public.reliability_audit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into public.reliability_audit_log (table_name, row_id, action, old_row, new_row, actor) values (tg_table_name, old.id, 'delete', to_jsonb(old), null, auth.uid());
    return old;
  end if;
  insert into public.reliability_audit_log (table_name, row_id, action, old_row, new_row, actor)
  values (tg_table_name, new.id, lower(tg_op), case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new), auth.uid());
  return new;
end $$;

-- Solo un administrador autoriza, rechaza o pospone; el ingeniero registra condición, recomendación y acción.
create function public.refurbishment_decision_guard() returns trigger language plpgsql set search_path = public as $$
declare v_changed boolean;
begin
  v_changed := case when tg_op = 'INSERT' then new.authorization_status <> 'pendiente' or new.authorized_by is not null or new.authorized_on is not null
    else (new.authorization_status, new.authorization_reason, new.authorization_detail, new.authorized_by, new.authorized_on)
      is distinct from (old.authorization_status, old.authorization_reason, old.authorization_detail, old.authorized_by, old.authorized_on) end;
  if v_changed and not public.is_admin() then
    raise exception 'Solo un administrador registra la autorización de una recomendación';
  end if;
  if v_changed then
    if new.authorization_status = 'pendiente' then
      new.authorized_by := null; new.authorized_on := null;
    else
      new.authorized_by := auth.uid(); new.authorized_on := coalesce(new.authorized_on, current_date);
    end if;
  end if;
  if new.recommendation <> 'sin_recomendacion' and (tg_op = 'INSERT' or new.recommendation is distinct from old.recommendation) then
    new.recommended_by := auth.uid(); new.recommended_on := coalesce(new.recommended_on, current_date);
  elsif tg_op = 'UPDATE' then
    new.recommended_by := old.recommended_by;
  else
    new.recommended_by := null;
  end if;
  return new;
end $$;

create function public.reliability_failure_assessor() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' or (new.relation, new.evidence) is distinct from (old.relation, old.evidence) then
    new.assessed_by := auth.uid(); new.assessed_on := coalesce(new.assessed_on, current_date);
  else
    new.assessed_by := old.assessed_by;
  end if;
  return new;
end $$;

-- La serie se normaliza en el servidor (misma regla que el resto de Orion) antes de validar el CHECK.
create function public.reliability_normalize_serial() returns trigger language plpgsql set search_path = public as $$
begin
  new.serial_key := public.normalize_equipment_serial(new.serial_key);
  return new;
end $$;
create trigger refurbishment_episodes_serial before insert or update of serial_key on public.refurbishment_episodes
  for each row execute function public.reliability_normalize_serial();
create trigger reliability_costs_serial before insert or update of serial_key on public.reliability_costs
  for each row execute function public.reliability_normalize_serial();

create trigger refurbishment_decision_guard before insert or update on public.refurbishment_component_decisions
  for each row execute function public.refurbishment_decision_guard();
create trigger reliability_failure_assessor before insert or update on public.reliability_failure_links
  for each row execute function public.reliability_failure_assessor();

do $$
declare t text;
begin
  foreach t in array array['refurbishment_episodes', 'refurbishment_component_decisions', 'refurbishment_acceptance_tests', 'reliability_failure_links', 'reliability_costs'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.reliability_stamp()', t || '_stamp', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.reliability_audit()', t || '_audit', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_staff())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_staff()) with check (public.is_staff())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', t || '_delete', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

alter table public.reliability_audit_log enable row level security;
create policy reliability_audit_log_read on public.reliability_audit_log for select to authenticated using (public.is_admin());
revoke all on public.reliability_audit_log from anon, authenticated;
grant select on public.reliability_audit_log to authenticated;

revoke all on function public.reliability_stamp(), public.reliability_audit(), public.refurbishment_decision_guard(), public.reliability_failure_assessor(),
  public.reliability_normalize_serial() from public, anon, authenticated;

-- Lectura del laboratorio: hechos sin interpretar (servicios de campo con sus piezas, tickets de soporte, equipos y
-- registros capturados). Episodios, cohortes, exposición y estadística se derivan en el navegador
-- (frontend/src/components/reliabilityAnalytics.ts) para que cada punto de una gráfica sea un registro real.
create function public.get_reliability_lab() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'El laboratorio de confiabilidad es exclusivo para administradores'; end if;
  return (
    with hist as (
      select h.id, h.id_legacy, h.fecha_servicio, h.fecha_fin, h.duracion_min, h.ticket_id, h.no_serie, h.datos_origen,
        h.diagnostico, h.trabajo_realizado, h.detalle_averia, h.detalle_solucion,
        public.service_history_kind(h.tipo_servicio, h.motivo) as kind
      from public.servicios_historial h
      where h.origen is distinct from 'biosisa_llamada' and h.origen is distinct from 'biosisa_capacitacion'
        and h.fecha_servicio >= date '2000-01-01'
    ),
    field as (
      select 'hist:' || h.id::text as id, h.id as history_id, coalesce('Servicio ' || h.id_legacy::text, 'Servicio ' || left(h.id::text, 8)) as ref,
        h.fecha_servicio as day, h.fecha_fin as day_end, h.kind, public.normalize_equipment_serial(h.no_serie) as serial_key, h.no_serie as serial,
        nullif(btrim(h.datos_origen->>'modelo'), '') as model, nullif(btrim(h.datos_origen->>'cliente_biosisa'), '') as client,
        lower(nullif(btrim(h.datos_origen->>'sector'), '')) as sector, h.duracion_min as minutes, h.ticket_id,
        case when h.kind in ('reacondicionamiento', 'correctivo', 'visita', 'instalacion', 'retiro') then
          left(concat_ws(' · ', nullif(btrim(h.diagnostico), ''), nullif(btrim(h.detalle_averia), ''), nullif(btrim(h.trabajo_realizado), ''), nullif(btrim(h.detalle_solucion), '')), 900) end as note
      from hist h where h.kind not in ('prueba', 'capacitacion', 'recapacitacion')
      union all
      select 'rep:' || r.id::text, null::uuid, coalesce(r.report_reference, r.external_document_number, left(r.id::text, 8)),
        coalesce(r.service_date, (r.created_at at time zone 'America/Chihuahua')::date), null::date, public.service_report_kind(r.service_type),
        public.normalize_equipment_serial(r.equipment_serial), r.equipment_serial, nullif(btrim(r.equipment_name), ''), nullif(btrim(r.client_name), ''),
        null::text, case when r.started_at is not null and r.ended_at is not null and r.ended_at > r.started_at
          then (extract(epoch from (r.ended_at - r.started_at)) / 60)::integer end, r.service_ticket_id,
        left(concat_ws(' · ', nullif(btrim(r.diagnostic_label), ''), nullif(btrim(r.comments), ''), nullif(btrim(r.solution), '')), 900)
      from public.service_reports r
      where r.report_type::text = 'servicio' and r.status::text <> 'borrador'
    ),
    lines as (
      select 'hist:' || sr.servicio_id::text as service_id, nullif(btrim(sr.codigo_refaccion), '') as code, sr.cantidad::numeric as qty
      from public.servicios_refacciones sr
      union all
      select 'rep:' || m.service_report_id::text, coalesce(nullif(btrim(m.reference_code), ''), nullif(btrim(m.catalog_code), '')), m.quantity::numeric
      from public.service_report_materials m where m.material_kind = 'refaccion'
    ),
    used as (
      select l.service_id, coalesce(l.code, 'Sin código') as code, sum(coalesce(l.qty, 0)) as qty
      from lines l group by l.service_id, coalesce(l.code, 'Sin código')
    ),
    support as (
      select t.id, t.numero_caso, public.normalize_equipment_serial(t.numero_serie_equipo) as serial_key, t.creado_en, t.estado::text as estado, left(t.asunto, 160) as asunto,
        (select max(e.occurred_at) from public.ticket_service_events e where e.ticket_id = t.id and e.kind = 'cierre') as closed_at
      from public.tickets t
      where not public.ticket_is_planning(t.descripcion) and public.normalize_equipment_serial(t.numero_serie_equipo) is not null
    ),
    names as (select p.id, p.nombre_completo from public.profiles p)
    select jsonb_build_object(
      'generated_at', now(),
      'services', coalesce((select jsonb_agg(jsonb_build_object(
          'id', f.id, 'history_id', f.history_id, 'ref', f.ref, 'day', f.day, 'day_end', f.day_end, 'kind', f.kind, 'serial_key', f.serial_key, 'serial', f.serial,
          'model', f.model, 'client', f.client, 'sector', f.sector, 'minutes', f.minutes, 'ticket_id', f.ticket_id, 'note', f.note,
          'parts', coalesce((select jsonb_agg(jsonb_build_array(u.code, u.qty) order by u.code) from used u where u.service_id = f.id), '[]'::jsonb))
        order by f.day, f.id) from field f where f.serial_key is not null and f.day is not null), '[]'::jsonb),
      'tickets', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'folio', s.numero_caso, 'serial_key', s.serial_key, 'opened_at', s.creado_en,
          'closed_at', s.closed_at, 'status', s.estado, 'subject', s.asunto) order by s.creado_en) from support s), '[]'::jsonb),
      'equipment', coalesce((select jsonb_agg(jsonb_build_object('serial_key', public.normalize_equipment_serial(e.numero_serie), 'model', e.modelo,
          'client', c.razon_social, 'assigned_on', e.fecha_inicio, 'ended_on', e.fecha_fin, 'warranty_until', e.termino_garantia))
        from public.equipos e left join public.clientes c on c.id = e.cliente_id where public.normalize_equipment_serial(e.numero_serie) is not null), '[]'::jsonb),
      'catalog', coalesce((select jsonb_object_agg(c.code, c.label) from (
          select u.code, coalesce(max(nullif(btrim(rc.nombre), '')), max(nullif(btrim(rc.desc_breve), '')), max(left(rc.descripcion, 80))) as label
          from (select distinct code from used) u left join public.refacciones_catalogo rc on rc.codigo_refaccion = u.code group by u.code) c
        where c.label is not null), '{}'::jsonb),
      'episodes', coalesce((select jsonb_agg(to_jsonb(x) || jsonb_build_object('created_by_name', n.nombre_completo) order by x.started_on)
        from public.refurbishment_episodes x left join names n on n.id = x.created_by), '[]'::jsonb),
      'decisions', coalesce((select jsonb_agg(to_jsonb(x) || jsonb_build_object('recommended_by_name', r.nombre_completo, 'authorized_by_name', a.nombre_completo) order by x.created_at)
        from public.refurbishment_component_decisions x left join names r on r.id = x.recommended_by left join names a on a.id = x.authorized_by), '[]'::jsonb),
      'tests', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.refurbishment_acceptance_tests x), '[]'::jsonb),
      'links', coalesce((select jsonb_agg(to_jsonb(x) || jsonb_build_object('assessed_by_name', n.nombre_completo) order by x.created_at)
        from public.reliability_failure_links x left join names n on n.id = x.assessed_by), '[]'::jsonb),
      'costs', coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_on) from public.reliability_costs x), '[]'::jsonb)
    )
  );
end $$;

revoke all on function public.get_reliability_lab() from public, anon;
grant execute on function public.get_reliability_lab() to authenticated;

-- Historial de cambios de un registro (bitácora inmutable) para la ficha del episodio.
create function public.get_reliability_audit(p_row_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'La bitácora de confiabilidad es exclusiva para administradores'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('table', l.table_name, 'row_id', l.row_id, 'action', l.action, 'at', l.at,
      'actor', p.nombre_completo, 'old', l.old_row, 'new', l.new_row) order by l.at desc, l.id desc)
    from public.reliability_audit_log l left join public.profiles p on p.id = l.actor
    where l.row_id = any(coalesce(p_row_ids, '{}'::uuid[]))), '[]'::jsonb);
end $$;

revoke all on function public.get_reliability_audit(uuid[]) from public, anon;
grant execute on function public.get_reliability_audit(uuid[]) to authenticated;
