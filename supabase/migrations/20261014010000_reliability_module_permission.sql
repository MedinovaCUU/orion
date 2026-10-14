-- «Confiabilidad» se vuelve un módulo de permisos (casilla en Permisos). Al iniciar solo lo tiene el propietario.
-- La regla vale en el servidor: lectura del laboratorio, bitácora y tablas de registro exigen personal interno con el
-- módulo activado. Autorizar/rechazar recomendaciones sigue siendo exclusivo de administradores (guarda existente).

alter table public.user_module_permissions drop constraint user_module_permissions_valid_modules;
alter table public.user_module_permissions add constraint user_module_permissions_valid_modules check (
  modules <@ array['tickets', 'servicios', 'asesoria', 'trazabilidad', 'refacciones', 'inventario', 'tutoriales', 'pno', 'equipos', 'monitoreo', 'dri', 'permisos', 'confiabilidad']
);

create function public.can_use_reliability_lab() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff() and exists (
    select 1 from public.user_module_permissions p where p.user_id = (select auth.uid()) and 'confiabilidad' = any(p.modules)
  );
$$;
revoke all on function public.can_use_reliability_lab() from public, anon;
grant execute on function public.can_use_reliability_lab() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['refurbishment_episodes', 'refurbishment_component_decisions', 'refurbishment_acceptance_tests', 'reliability_failure_links', 'reliability_costs'] loop
    execute format('alter policy %I on public.%I using (public.can_use_reliability_lab())', t || '_read', t);
    execute format('alter policy %I on public.%I with check (public.can_use_reliability_lab())', t || '_insert', t);
    execute format('alter policy %I on public.%I using (public.can_use_reliability_lab()) with check (public.can_use_reliability_lab())', t || '_update', t);
    execute format('alter policy %I on public.%I using (public.can_use_reliability_lab() and public.is_admin())', t || '_delete', t);
  end loop;
end $$;
alter policy reliability_audit_log_read on public.reliability_audit_log using (public.can_use_reliability_lab());

-- Mismos cuerpos que en 20261013170000; solo cambia la verificación de acceso.
create or replace function public.get_reliability_lab() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.can_use_reliability_lab() then raise exception 'Confiabilidad no está activado para tu usuario; se activa en Permisos'; end if;
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

create or replace function public.get_reliability_audit(p_row_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.can_use_reliability_lab() then raise exception 'Confiabilidad no está activado para tu usuario; se activa en Permisos'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('table', l.table_name, 'row_id', l.row_id, 'action', l.action, 'at', l.at,
      'actor', p.nombre_completo, 'old', l.old_row, 'new', l.new_row) order by l.at desc, l.id desc)
    from public.reliability_audit_log l left join public.profiles p on p.id = l.actor
    where l.row_id = any(coalesce(p_row_ids, '{}'::uuid[]))), '[]'::jsonb);
end $$;

-- Al iniciar, solo el propietario (rmontanez@biosystems.com.mx) tiene el módulo.
update public.user_module_permissions
set modules = array_append(modules, 'confiabilidad'), updated_at = now()
where user_id = '2a87dde5-76ef-4365-8690-870efc7d9d82' and not ('confiabilidad' = any(modules));
