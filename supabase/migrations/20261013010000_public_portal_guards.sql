-- Portal público de soporte: barreras antes de crear un caso.
-- 1. La serie debe existir en Equipos. Se guarda la serie registrada, así el WhatsApp (país del equipo),
--    la asignación y el historial encuentran el equipo.
-- 2. Si el equipo ya tiene un caso abierto del mismo tipo de soporte, el reporte se agrega como nota
--    a ese caso en lugar de abrir otro. Un reenvío idéntico no agrega otra nota.
-- 3. Límites por IP (solo su hash), por teléfono y por folio; cada intento queda registrado.
-- 4. La consulta pública exige el teléfono: antes, un teléfono vacío abría cualquier caso sin teléfono.
-- 5. WhatsApp: el portal solo acepta celulares mexicanos de 10 dígitos; si el equipo no tiene país,
--    el mensaje sale con +52 en vez de quedarse sin enviar.

create table public.public_portal_attempts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('serie', 'alta', 'consulta')),
  client_key text,
  phone text,
  reference text,
  outcome text not null,
  detail_hash text,
  ticket_id uuid references public.tickets(id) on delete cascade,
  created_at timestamptz not null default now()
);
comment on table public.public_portal_attempts is
  'Intentos del portal público: validar serie, crear caso y consultar caso. client_key es el md5 de la IP; la IP no se guarda.';
alter table public.public_portal_attempts enable row level security;
revoke all on public.public_portal_attempts from public, anon, authenticated;
grant select on public.public_portal_attempts to authenticated;
grant all on public.public_portal_attempts to service_role;
create policy public_portal_attempts_admin_read on public.public_portal_attempts
  for select to authenticated using (public.is_admin());
create index public_portal_attempts_client on public.public_portal_attempts (client_key, kind, created_at desc) where client_key is not null;
create index public_portal_attempts_phone on public.public_portal_attempts (phone, created_at desc) where phone is not null;
create index public_portal_attempts_reference on public.public_portal_attempts (reference, kind, created_at desc);
create index public_portal_attempts_ticket on public.public_portal_attempts (ticket_id) where ticket_id is not null;
create index public_portal_attempts_created on public.public_portal_attempts (created_at);

-- Hash of the caller's IP from the API gateway headers (Cloudflare first: the client cannot forge it).
create function public.portal_client_key() returns text
language plpgsql stable set search_path = public as $$
declare h json;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  return md5(nullif(btrim(coalesce(h ->> 'cf-connecting-ip', h ->> 'x-real-ip', split_part(h ->> 'x-forwarded-for', ',', 1))), ''));
end; $$;

-- "SN: 83400-1902" → 834001902. Only letters and digits count.
create function public.portal_serial_key(p_value text) returns text
language sql immutable as $$
  select nullif(regexp_replace(
    regexp_replace(upper(btrim(coalesce(p_value, ''))), '^(S/N|N/S|SN|NS|NO\.? ?DE ?SERIE|SERIE)[[:space:]:#.-]*', ''),
    '[^A-Z0-9]', '', 'g'), '')
$$;

-- Why a key cannot be a serial, before looking it up. Null = plausible.
create function public.portal_serial_issue(p_key text) returns text
language sql immutable as $$
  select case
    when p_key is null then 'vacio'
    when p_key like '%8435287%' then 'producto'      -- GS1 (01) product code printed on every BioSystems label
    when p_key ~ '^[0-9]{4,5}$' then 'incompleto'    -- only the SN of an older A15 label, without REF 83105
    when char_length(p_key) < 6 or char_length(p_key) > 24 or p_key !~ '[0-9]{3}' then 'formato'
  end
$$;

create function public.portal_model_family(p_key text) returns text
language sql immutable as $$
  select case
    when p_key like '83400%' then 'BA400'
    when p_key like '83200%' then 'BA200'
    when p_key like '83105%' then 'A15'
    when p_key like '83101%' then 'A25'
    when p_key like '83106%' then 'Y15'
  end
$$;

create function public.resolve_portal_equipment(p_serial text)
returns table (status text, numero_serie text, modelo text)
language plpgsql stable security definer set search_path = public as $$
declare v_key text := public.portal_serial_key(p_serial); v_issue text := public.portal_serial_issue(v_key);
begin
  if v_issue is not null then
    return query select v_issue, null::text, null::text;
    return;
  end if;
  return query
    select 'ok'::text, e.numero_serie, coalesce(nullif(btrim(e.modelo), ''), public.portal_model_family(v_key))
    from public.equipos e
    where public.portal_serial_key(e.numero_serie) = v_key
    order by e.fecha_fin nulls first, e.actualizado_en desc nulls last
    limit 1;
  if not found then
    return query select 'no_encontrado'::text, null::text, public.portal_model_family(v_key);
  end if;
end; $$;

-- Live check while the customer types the serial. Returns only the model, never the customer.
create function public.check_public_equipment_serial(p_serial text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_client text := public.portal_client_key(); r record;
begin
  if v_client is not null and (select count(*) from public.public_portal_attempts a
      where a.client_key = v_client and a.kind = 'serie' and a.created_at > now() - interval '10 minutes') >= 60 then
    return jsonb_build_object('status', 'limite', 'mensaje', 'Demasiadas consultas seguidas. Espera unos minutos e inténtalo de nuevo.');
  end if;
  select * into r from public.resolve_portal_equipment(p_serial);
  insert into public.public_portal_attempts (kind, client_key, reference, outcome)
  values ('serie', v_client, left(public.portal_serial_key(p_serial), 40), r.status);
  return jsonb_build_object('status', r.status, 'serie', r.numero_serie, 'modelo', r.modelo);
end; $$;

-- Rejections are returned, not raised, so the attempt stays logged and counts toward the limits.
create function public.submit_public_support_case(
  p_support_type text, p_serial text, p_contact_name text, p_phone text, p_description text
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
  if v_equipment.status <> 'ok' then
    insert into public.public_portal_attempts (kind, client_key, phone, reference, outcome)
    values ('alta', v_client, v_phone, left(public.portal_serial_key(p_serial), 40), 'serie_' || v_equipment.status);
    return jsonb_build_object('status', 'serie', 'motivo', v_equipment.status, 'modelo', v_equipment.modelo,
      'mensaje', 'Por favor ingresa el número de serie correcto del equipo.');
  end if;

  -- Two reports for the same equipment at the same moment must not both open a case.
  perform pg_advisory_xact_lock(hashtext('public_portal:' || public.portal_serial_key(v_equipment.numero_serie)));

  select t.* into v_ticket
  from public.tickets t
  where t.estado <> 'cerrado'
    and public.portal_serial_key(t.numero_serie_equipo) = public.portal_serial_key(v_equipment.numero_serie)
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
      values ('alta', v_client, v_phone, v_equipment.numero_serie, 'repetido', v_hash, v_ticket.id);
      return jsonb_build_object('status', 'agrupado', 'repetido', true, 'numero_caso', v_ticket.numero_caso, 'modelo', v_equipment.modelo);
    end if;
    -- Staff-only: it carries another person's phone, and the public timeline belongs to the first reporter.
    insert into public.ticket_bitacora (ticket_id, numero_serie_equipo, tipo, detalle, visible_cliente, creado_por)
    values (v_ticket.id, v_ticket.numero_serie_equipo, 'nota',
      'Reporte adicional desde el portal (Soporte ' || v_type || ') de ' || v_name || ', cel. ' || v_phone || ':' || E'\n' || v_description,
      false, null);
    insert into public.public_portal_attempts (kind, client_key, phone, reference, outcome, detail_hash, ticket_id)
    values ('alta', v_client, v_phone, v_equipment.numero_serie, 'agrupado', v_hash, v_ticket.id);
    return jsonb_build_object('status', 'agrupado', 'repetido', false, 'numero_caso', v_ticket.numero_caso, 'modelo', v_equipment.modelo);
  end if;

  insert into public.tickets (user_id, asunto, descripcion, numero_serie_equipo, nombre_cliente_guest, telefono_cliente_guest, estado)
  values (null, 'Soporte ' || v_type || ': Reporte en equipo ' || v_equipment.numero_serie, v_description,
    v_equipment.numero_serie, v_name, v_phone, 'abierto')
  returning * into v_ticket;
  insert into public.public_portal_attempts (kind, client_key, phone, reference, outcome, detail_hash, ticket_id)
  values ('alta', v_client, v_phone, v_equipment.numero_serie, 'creado', v_hash, v_ticket.id);
  return jsonb_build_object('status', 'creado', 'numero_caso', v_ticket.numero_caso, 'modelo', v_equipment.modelo);
end; $$;

-- Pages loaded before this release still call the old name: same rules, errors raised as before.
create or replace function public.create_public_support_case(
  p_support_type text, p_serial text, p_contact_name text, p_phone text, p_description text
) returns table (numero_caso text)
language plpgsql security definer set search_path = public as $$
declare v_result jsonb := public.submit_public_support_case(p_support_type, p_serial, p_contact_name, p_phone, p_description);
begin
  if v_result ->> 'status' not in ('creado', 'agrupado') then
    raise exception '%', coalesce(v_result ->> 'mensaje', 'No fue posible registrar el caso.');
  end if;
  return query select v_result ->> 'numero_caso';
end; $$;

create or replace function public.track_public_support_case(p_case_number text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_client text := public.portal_client_key();
  v_case text := left(upper(btrim(coalesce(p_case_number, ''))), 20);
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_ticket public.tickets%rowtype;
begin
  if (v_client is not null and (select count(*) from public.public_portal_attempts a where a.client_key = v_client
        and a.kind = 'consulta' and a.outcome = 'no_encontrado' and a.created_at > now() - interval '15 minutes') >= 10)
     or (select count(*) from public.public_portal_attempts a where a.reference = v_case
        and a.kind = 'consulta' and a.outcome = 'no_encontrado' and a.created_at > now() - interval '15 minutes') >= 10 then
    raise exception 'Demasiadas consultas sin coincidencia. Espera 15 minutos e inténtalo de nuevo.';
  end if;

  if v_case <> '' and v_phone ~ '^[0-9]{10}$' then
    select * into v_ticket
    from public.tickets
    where upper(numero_caso) = v_case
      and regexp_replace(coalesce(telefono_cliente_guest, ''), '\D', '', 'g') = v_phone
    limit 1;
  end if;

  if v_ticket.id is null then
    insert into public.public_portal_attempts (kind, client_key, reference, outcome)
    values ('consulta', v_client, v_case, 'no_encontrado');
    return null;
  end if;

  return jsonb_build_object(
    'numero_caso', v_ticket.numero_caso,
    'asunto', v_ticket.asunto,
    'estado', v_ticket.estado,
    'numero_serie_equipo', v_ticket.numero_serie_equipo,
    'creado_en', v_ticket.creado_en,
    'actualizado_en', v_ticket.actualizado_en,
    'bitacora', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tipo', b.tipo,
        'detalle', b.detalle,
        'estado_resultante', b.estado_resultante,
        'creado_en', b.creado_en
      ) order by b.creado_en desc)
      from public.ticket_bitacora b
      where b.ticket_id = v_ticket.id and b.visible_cliente
    ), '[]'::jsonb)
  );
end; $$;

-- The portal form only accepts Mexican 10-digit mobiles: without an equipment country, send them as +52.
create or replace function public.ticket_whatsapp_equipment_country() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select e.pais into new.equipment_country
  from public.tickets t join public.equipos e
  on public.normalize_equipment_serial(e.numero_serie) = public.normalize_equipment_serial(t.numero_serie_equipo)
  where t.id = new.ticket_id;
  if new.equipment_country is null and btrim(coalesce(new.recipient, '')) ~ '^[0-9]{10}$'
     and exists(select 1 from public.tickets t where t.id = new.ticket_id and t.user_id is null
       and t.asunto like 'Soporte %: Reporte en equipo %') then
    new.recipient := '+52' || btrim(new.recipient);
  end if;
  return new;
end; $$;

revoke all on function public.portal_client_key() from public, anon, authenticated;
revoke all on function public.portal_serial_key(text) from public, anon, authenticated;
revoke all on function public.portal_serial_issue(text) from public, anon, authenticated;
revoke all on function public.portal_model_family(text) from public, anon, authenticated;
revoke all on function public.resolve_portal_equipment(text) from public, anon, authenticated;
revoke all on function public.check_public_equipment_serial(text) from public;
revoke all on function public.submit_public_support_case(text, text, text, text, text) from public;
grant execute on function public.check_public_equipment_serial(text) to anon, authenticated;
grant execute on function public.submit_public_support_case(text, text, text, text, text) to anon, authenticated;
grant execute on function public.create_public_support_case(text, text, text, text, text) to anon, authenticated;
grant execute on function public.track_public_support_case(text, text) to anon, authenticated;
