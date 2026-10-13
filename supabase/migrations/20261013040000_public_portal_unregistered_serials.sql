-- Equipos reales que todavía no están en Equipos ya no quedan bloqueados en el portal.
-- 1. Lo que no puede ser una serie se sigue rechazando; ahora también ceros al inicio, un solo carácter
--    repetido y secuencias como 123456. Una serie registrada siempre es válida aunque se vea rara (F050).
-- 2. Una serie con formato válido que no está registrada se acepta solo si el cliente confirma que la revisó.
--    El caso queda marcado («Reporte en equipo no registrado …») con una nota para que el personal valide
--    el equipo y lo dé de alta. Los reportes repetidos de esa serie se agrupan en el mismo caso.

create or replace function public.portal_serial_issue(p_key text) returns text
language sql immutable as $$
  select case
    when p_key is null then 'vacio'
    when p_key like '%8435287%' then 'producto'      -- GS1 (01) product code printed on every BioSystems label
    when p_key ~ '^[0-9]{4,5}$' then 'incompleto'    -- only the SN of an older A15 label, without REF 83105
    when char_length(p_key) < 6 or char_length(p_key) > 24 or p_key !~ '[0-9]{3}' then 'formato'
    when p_key ~ '^(.)\1+$' or p_key ~ '^000'
      or p_key ~ '(012345|123456|234567|345678|456789|543210|654321|765432|876543|987654)' then 'formato'
  end
$$;

-- A registered serial is always valid, even when it looks odd (F050, CM250).
create or replace function public.resolve_portal_equipment(p_serial text)
returns table (status text, numero_serie text, modelo text)
language plpgsql stable security definer set search_path = public as $$
declare v_key text := public.portal_serial_key(p_serial); v_issue text := public.portal_serial_issue(v_key);
begin
  if v_key is not null then
    return query
      select 'ok'::text, e.numero_serie, coalesce(nullif(btrim(e.modelo), ''), public.portal_model_family(v_key))
      from public.equipos e
      where public.portal_serial_match_key(e.numero_serie) = public.portal_serial_match_key(v_key)
      order by e.fecha_fin nulls first, e.actualizado_en desc nulls last
      limit 1;
    if found then
      return;
    end if;
  end if;
  if v_issue is not null then
    return query select v_issue, null::text, null::text;
    return;
  end if;
  return query select 'no_encontrado'::text, null::text, public.portal_model_family(v_key);
end; $$;

-- New optional argument: the old five-argument version must go, or PostgREST could not choose between them.
drop function public.submit_public_support_case(text, text, text, text, text);

create function public.submit_public_support_case(
  p_support_type text, p_serial text, p_contact_name text, p_phone text, p_description text,
  p_confirm_unregistered boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_client text := public.portal_client_key();
  v_type text := btrim(coalesce(p_support_type, ''));
  v_name text := btrim(regexp_replace(coalesce(p_contact_name, ''), '[[:cntrl:][:space:]]+', ' ', 'g'));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_description text := btrim(regexp_replace(coalesce(p_description, ''), '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'));
  v_hash text := md5(lower(regexp_replace(v_description, '\s+', ' ', 'g')));
  v_field text;
  v_equipment record;
  v_serial text;
  v_registered boolean;
  v_ticket public.tickets%rowtype;
begin
  delete from public.public_portal_attempts where created_at < now() - interval '90 days' and ticket_id is null;

  if v_client is not null and (select count(*) from public.public_portal_attempts a
      where a.client_key = v_client and a.kind = 'alta' and a.created_at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('status', 'limite', 'mensaje', 'Recibimos demasiados envíos desde esta conexión. Espera una hora o llámanos.');
  end if;
  if v_phone ~ '^[0-9]{10}$' and (
      (select count(*) from public.public_portal_attempts a where a.phone = v_phone and a.kind = 'alta'
        and a.outcome in ('creado', 'agrupado') and a.created_at > now() - interval '1 hour') >= 4
      or (select count(*) from public.public_portal_attempts a where a.phone = v_phone and a.kind = 'alta'
        and a.outcome in ('creado', 'agrupado') and a.created_at > now() - interval '1 day') >= 10) then
    return jsonb_build_object('status', 'limite', 'mensaje', 'Este celular ya registró varios reportes recientes. Si necesitas agregar algo, consulta tu caso o espera un momento.');
  end if;

  v_field := case
    when v_type not in ('Ingeniero', 'Químico') then 'tipo'
    when char_length(v_name) not between 3 and 120 or v_name !~ '[A-Za-zÁÉÍÓÚÜÑáéíóúüñ].*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]' then 'nombre'
    when v_phone !~ '^[2-9][0-9]{9}$' or v_phone ~ '^([0-9])\1{9}$' or v_phone in ('2345678901', '9876543210') then 'telefono'
    when char_length(v_description) not between 10 and 3000 then 'descripcion'
  end;
  if v_field is not null then
    insert into public.public_portal_attempts (kind, client_key, phone, reference, outcome)
    values ('alta', v_client, nullif(left(v_phone, 10), ''), left(public.portal_serial_key(p_serial), 40), 'datos_' || v_field);
    return jsonb_build_object('status', 'datos', 'campo', v_field, 'mensaje', case v_field
      when 'tipo' then 'Selecciona el tipo de soporte que requieres.'
      when 'nombre' then 'Escribe el nombre real de la persona de contacto.'
      when 'telefono' then 'Escribe un celular válido de 10 dígitos.'
      else 'Describe el problema en al menos 10 caracteres (máximo 3000).' end);
  end if;

  select * into v_equipment from public.resolve_portal_equipment(p_serial);
  if v_equipment.status = 'ok' then
    v_serial := v_equipment.numero_serie;
    v_registered := true;
  elsif v_equipment.status = 'no_encontrado' and coalesce(p_confirm_unregistered, false) then
    -- Real equipment missing from Equipos: the customer confirmed the serial after seeing the warning.
    v_serial := public.portal_serial_key(p_serial);
    v_registered := false;
  else
    insert into public.public_portal_attempts (kind, client_key, phone, reference, outcome)
    values ('alta', v_client, v_phone, left(public.portal_serial_key(p_serial), 40), 'serie_' || v_equipment.status);
    return jsonb_build_object('status', 'serie', 'motivo', v_equipment.status, 'modelo', v_equipment.modelo,
      'confirmable', v_equipment.status = 'no_encontrado',
      'mensaje', 'Por favor ingresa el número de serie correcto del equipo.');
  end if;

  -- Two reports for the same equipment at the same moment must not both open a case.
  perform pg_advisory_xact_lock(hashtext('public_portal:' || public.portal_serial_match_key(v_serial)));

  select t.* into v_ticket
  from public.tickets t
  where t.estado <> 'cerrado'
    and public.portal_serial_match_key(t.numero_serie_equipo) = public.portal_serial_match_key(v_serial)
    and not public.ticket_is_planning(t.descripcion)
    and coalesce(t.asunto, '') not like '[PLAN]%'
    and public.ticket_support_area(t.asunto) = case v_type when 'Ingeniero' then 'ingenieria' else 'quimica' end
  order by t.actualizado_en desc nulls last, t.creado_en desc
  limit 1
  for update;

  if found then
    if exists(select 1 from public.public_portal_attempts a
        where a.kind = 'alta' and a.ticket_id = v_ticket.id and a.phone = v_phone and a.detail_hash = v_hash
          and a.outcome in ('creado', 'agrupado', 'repetido') and a.created_at > now() - interval '1 day') then
      insert into public.public_portal_attempts (kind, client_key, phone, reference, outcome, detail_hash, ticket_id)
      values ('alta', v_client, v_phone, v_serial, 'repetido', v_hash, v_ticket.id);
      return jsonb_build_object('status', 'agrupado', 'repetido', true, 'numero_caso', v_ticket.numero_caso, 'modelo', v_equipment.modelo, 'registrado', v_registered);
    end if;
    -- Staff-only: it carries another person's phone, and the public timeline belongs to the first reporter.
    insert into public.ticket_bitacora (ticket_id, numero_serie_equipo, tipo, detalle, visible_cliente, creado_por)
    values (v_ticket.id, v_ticket.numero_serie_equipo, 'nota',
      'Reporte adicional desde el portal (Soporte ' || v_type || ') de ' || v_name || ', cel. ' || v_phone
        || case when v_registered then '' else ' (serie no registrada, confirmada por el cliente)' end || ':' || E'\n' || v_description,
      false, null);
    insert into public.public_portal_attempts (kind, client_key, phone, reference, outcome, detail_hash, ticket_id)
    values ('alta', v_client, v_phone, v_serial, 'agrupado', v_hash, v_ticket.id);
    return jsonb_build_object('status', 'agrupado', 'repetido', false, 'numero_caso', v_ticket.numero_caso, 'modelo', v_equipment.modelo, 'registrado', v_registered);
  end if;

  insert into public.tickets (user_id, asunto, descripcion, numero_serie_equipo, nombre_cliente_guest, telefono_cliente_guest, estado)
  values (null, 'Soporte ' || v_type || ': Reporte en equipo ' || case when v_registered then '' else 'no registrado ' end || v_serial,
    v_description, v_serial, v_name, v_phone, 'abierto')
  returning * into v_ticket;
  if not v_registered then
    insert into public.ticket_bitacora (ticket_id, numero_serie_equipo, tipo, detalle, visible_cliente, creado_por)
    values (v_ticket.id, v_serial, 'nota',
      'Equipo no registrado: el cliente confirmó desde el portal que la serie ' || v_serial
        || ' es correcta, pero no está en Equipos. Valida el equipo y dalo de alta.',
      false, null);
  end if;
  insert into public.public_portal_attempts (kind, client_key, phone, reference, outcome, detail_hash, ticket_id)
  values ('alta', v_client, v_phone, v_serial, 'creado', v_hash, v_ticket.id);
  return jsonb_build_object('status', 'creado', 'numero_caso', v_ticket.numero_caso, 'modelo', v_equipment.modelo, 'registrado', v_registered);
end; $$;

revoke all on function public.submit_public_support_case(text, text, text, text, text, boolean) from public;
grant execute on function public.submit_public_support_case(text, text, text, text, text, boolean) to anon, authenticated;
