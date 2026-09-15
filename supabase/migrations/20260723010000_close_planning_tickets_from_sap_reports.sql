-- Cierra automáticamente una planeación únicamente cuando el parte SAP
-- coincide en serie, tipo de servicio y ventana planeada.

create or replace function public.try_parse_planning_metadata(p_description text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_marker constant text := '[METADATA_PLANEACION]';
  v_position integer;
begin
  v_position := position(v_marker in coalesce(p_description, ''));
  if v_position = 0 then
    return '{}'::jsonb;
  end if;

  return substring(
    p_description
    from v_position + char_length(v_marker)
  )::jsonb;
exception
  when others then
    return '{}'::jsonb;
end;
$$;

create or replace function public.try_parse_iso_date(p_value text)
returns date
language plpgsql
immutable
set search_path = public
as $$
begin
  if coalesce(p_value, '') !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;

  return p_value::date;
exception
  when others then
    return null;
end;
$$;

create or replace function public.close_planning_tickets_for_sap_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_date date := coalesce(new.end_date, new.start_date);
  v_ticket record;
begin
  if v_service_date is null then
    return new;
  end if;

  for v_ticket in
    select
      ticket.id,
      ticket.numero_caso
    from public.tickets as ticket
    cross join lateral (
      select public.try_parse_planning_metadata(ticket.descripcion) as metadata
    ) as planning
    where ticket.estado <> 'cerrado'
      and ticket.asunto ilike '[PLAN]%'
      and public.normalize_equipment_serial(ticket.numero_serie_equipo)
        = public.normalize_equipment_serial(new.equipment_serial)
      and lower(coalesce(planning.metadata->>'service_type', ''))
        = lower(new.service_kind)
      and v_service_date between
        public.try_parse_iso_date(planning.metadata->>'week_start')
        and public.try_parse_iso_date(planning.metadata->>'week_end')
  loop
    update public.tickets
    set
      estado = 'cerrado',
      actualizado_en = greatest(coalesce(actualizado_en, creado_en), new.last_imported_at)
    where id = v_ticket.id
      and estado <> 'cerrado';

    if found then
      insert into public.ticket_bitacora (
        ticket_id,
        numero_serie_equipo,
        tipo,
        detalle,
        estado_resultante,
        visible_cliente,
        creado_por,
        creado_en
      ) values (
        v_ticket.id,
        new.equipment_serial,
        'avance',
        concat(
          'Cierre automático confirmado por SAP FSM. Informe ',
          new.report_number,
          ', folio de actividad ',
          new.activity_folio,
          ', servicio ',
          new.service_kind,
          ' realizado el ',
          to_char(v_service_date, 'DD/MM/YYYY'),
          '.'
        ),
        'cerrado',
        true,
        null,
        new.last_imported_at
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_close_planning_tickets_from_sap
on public.sap_service_reports;

create trigger trg_close_planning_tickets_from_sap
after insert or update of
  service_kind,
  equipment_serial,
  start_date,
  end_date,
  report_number,
  activity_folio,
  last_imported_at
on public.sap_service_reports
for each row
execute function public.close_planning_tickets_for_sap_report();

-- Aplica la misma regla a los reportes que ya habían sido importados.
update public.sap_service_reports
set last_imported_at = last_imported_at;
