CREATE OR REPLACE FUNCTION public.master_data_normalize_text(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(upper(trim(COALESCE(p_value, ''))), '[^A-Z0-9]+', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.master_data_phone_digits(p_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits TEXT;
BEGIN
  digits := regexp_replace(COALESCE(p_value, ''), '\D+', '', 'g');
  IF digits = '' THEN
    RETURN NULL;
  END IF;

  IF length(digits) >= 12 AND left(digits, 2) = '52' THEN
    digits := right(digits, 10);
  END IF;

  IF length(digits) < 10 THEN
    RETURN NULL;
  END IF;

  RETURN digits;
END;
$$;

CREATE OR REPLACE FUNCTION public.master_data_word_count(p_value TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_length(regexp_split_to_array(trim(regexp_replace(COALESCE(p_value, ''), '\s+', ' ', 'g')), '\s+'), 1), 0);
$$;

CREATE OR REPLACE FUNCTION public.master_data_overlap_score(p_left TEXT, p_right TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  WITH left_tokens AS (
    SELECT DISTINCT token
    FROM regexp_split_to_table(regexp_replace(upper(COALESCE(p_left, '')), '[^A-Z0-9 ]+', ' ', 'g'), '\s+') AS token
    WHERE token <> ''
  ),
  right_tokens AS (
    SELECT DISTINCT token
    FROM regexp_split_to_table(regexp_replace(upper(COALESCE(p_right, '')), '[^A-Z0-9 ]+', ' ', 'g'), '\s+') AS token
    WHERE token <> ''
  )
  SELECT COUNT(*)
  FROM left_tokens
  INNER JOIN right_tokens USING (token);
$$;

CREATE OR REPLACE FUNCTION public.master_data_is_reliable_contact(p_value TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN trim(COALESCE(p_value, '')) = '' THEN false
      WHEN public.master_data_normalize_text(p_value) IN (
        '', 'NA', 'ND', 'NONE', 'NOAPLICA', 'SINCONTACTO', 'SINNOMBRE', 'CLIENTE', 'PRUEBA', 'TEST',
        'MEDINOVA', 'BIOSYSTEMS', 'ORION', 'Q', 'QFB', 'ING', 'LIC', 'CONTACTO'
      ) THEN false
      WHEN p_value !~ '[[:alpha:]]' THEN false
      WHEN public.master_data_word_count(p_value) < 2 THEN false
      WHEN length(trim(p_value)) < 5 THEN false
      ELSE true
    END;
$$;

CREATE OR REPLACE FUNCTION public.master_data_is_reliable_phone(p_value TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN public.master_data_phone_digits(p_value) IS NULL THEN false
      WHEN public.master_data_phone_digits(p_value) ~ '^(\d)\1+$' THEN false
      WHEN public.master_data_phone_digits(p_value) IN ('0123456789', '1234567890') THEN false
      ELSE true
    END;
$$;

CREATE OR REPLACE FUNCTION public.master_data_is_reliable_city(p_value TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN trim(COALESCE(p_value, '')) = '' THEN false
      WHEN public.master_data_normalize_text(p_value) IN ('', 'NA', 'ND', 'NODATA', 'MEXICO', 'CIUDAD', 'DESTINO') THEN false
      WHEN p_value !~ '[[:alpha:]]' THEN false
      WHEN length(trim(p_value)) < 3 THEN false
      ELSE true
    END;
$$;

CREATE OR REPLACE FUNCTION public.master_data_is_reliable_address(p_value TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN trim(COALESCE(p_value, '')) = '' THEN false
      WHEN public.master_data_normalize_text(p_value) IN ('', 'NA', 'ND', 'NODATA', 'MEXICO', 'CDMX', 'CIUDADDEMEXICO', 'DIRECCION') THEN false
      WHEN p_value !~ '[[:alpha:]]' THEN false
      WHEN public.master_data_word_count(p_value) < 3 THEN false
      WHEN length(trim(p_value)) < 12 THEN false
      ELSE true
    END;
$$;

CREATE OR REPLACE FUNCTION public.master_data_is_reliable_equipment_name(p_value TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN trim(COALESCE(p_value, '')) = '' THEN false
      WHEN public.master_data_normalize_text(p_value) IN (
        '', 'NA', 'ND', 'SN', 'MODELO', 'EQUIPO', 'INSTRUMENTO', 'NOAPLICA', 'SINMODELO'
      ) THEN false
      WHEN p_value !~ '[[:alpha:]]' THEN false
      WHEN length(trim(p_value)) < 3 THEN false
      ELSE true
    END;
$$;

CREATE OR REPLACE FUNCTION public.master_data_extract_ticket_client_hint(p_description TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  client_hint TEXT;
BEGIN
  SELECT NULLIF(trim((regexp_match(COALESCE(p_description, ''), '(?mi)^Cliente/Localidad:\s*(.+)$'))[1]), '')
  INTO client_hint;

  IF client_hint IS NOT NULL THEN
    RETURN client_hint;
  END IF;

  SELECT NULLIF(trim((regexp_match(COALESCE(p_description, ''), '(?mi)^Cliente:\s*(.+)$'))[1]), '')
  INTO client_hint;

  RETURN client_hint;
END;
$$;

CREATE OR REPLACE FUNCTION public.master_data_resolve_equipment(
  p_serial TEXT,
  p_client_id INT DEFAULT NULL,
  p_client_hint TEXT DEFAULT NULL
)
RETURNS TABLE (
  equipment_id TEXT,
  numero_serie TEXT,
  cliente_id INT,
  cliente_nombre TEXT,
  modelo TEXT,
  ciudad TEXT,
  direccion TEXT
)
LANGUAGE sql
STABLE
AS $$
  WITH ranked AS (
    SELECT
      e.id AS equipment_id,
      e.numero_serie,
      e.cliente_id,
      c.razon_social AS cliente_nombre,
      e.modelo,
      e.ciudad,
      e.direccion,
      ROW_NUMBER() OVER (
        PARTITION BY e.numero_serie
        ORDER BY
          CASE WHEN p_client_id IS NOT NULL AND e.cliente_id = p_client_id THEN 0 ELSE 1 END,
          public.master_data_overlap_score(COALESCE(p_client_hint, ''), COALESCE(c.razon_social, '')) DESC,
          CASE WHEN e.fecha_fin IS NULL THEN 0 ELSE 1 END,
          e.fecha_fin DESC NULLS LAST,
          e.fecha_inicio DESC NULLS LAST,
          e.actualizado_en DESC NULLS LAST,
          e.creado_en DESC NULLS LAST,
          e.id DESC
      ) AS rn
    FROM public.equipos AS e
    LEFT JOIN public.clientes AS c ON c.id = e.cliente_id
    WHERE e.numero_serie = p_serial
  )
  SELECT equipment_id, numero_serie, cliente_id, cliente_nombre, modelo, ciudad, direccion
  FROM ranked
  WHERE rn = 1;
$$;

CREATE OR REPLACE FUNCTION public.sync_master_data_from_travel_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.travel_requests%ROWTYPE;
  v_equipment RECORD;
  v_client public.clientes%ROWTYPE;
  v_target_client_id INT;
  v_candidate_contact TEXT;
  v_candidate_phone TEXT;
  v_candidate_address TEXT;
  v_candidate_city TEXT;
  v_candidate_model TEXT;
  v_applied JSONB := '{}'::jsonb;
  v_ignored JSONB := '{}'::jsonb;
BEGIN
  SELECT *
  INTO v_request
  FROM public.travel_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'travel_request_not_found', 'request_id', p_request_id);
  END IF;

  IF NULLIF(trim(COALESCE(v_request.equipment_serial, '')), '') IS NOT NULL THEN
    SELECT *
    INTO v_equipment
    FROM public.master_data_resolve_equipment(v_request.equipment_serial, v_request.client_id, v_request.client_name);
  END IF;

  v_target_client_id := COALESCE(v_request.client_id, v_equipment.cliente_id);

  IF v_equipment.equipment_id IS NOT NULL AND v_equipment.cliente_id IS NULL AND v_request.client_id IS NOT NULL THEN
    UPDATE public.equipos
    SET cliente_id = v_request.client_id
    WHERE id = v_equipment.equipment_id
      AND cliente_id IS NULL;

    IF FOUND THEN
      v_applied := v_applied || jsonb_build_object('equipos.cliente_id', v_request.client_id);
      v_target_client_id := v_request.client_id;
    END IF;
  END IF;

  IF v_target_client_id IS NOT NULL THEN
    SELECT *
    INTO v_client
    FROM public.clientes
    WHERE id = v_target_client_id;
  END IF;

  v_candidate_contact := NULLIF(trim(COALESCE(v_request.site_contact, '')), '');
  IF v_target_client_id IS NOT NULL AND v_candidate_contact IS NOT NULL THEN
    IF public.master_data_is_reliable_contact(v_candidate_contact) THEN
      IF COALESCE(trim(v_client.persona_contacto), '') = '' OR NOT public.master_data_is_reliable_contact(v_client.persona_contacto) THEN
        UPDATE public.clientes
        SET persona_contacto = v_candidate_contact
        WHERE id = v_target_client_id;
        v_applied := v_applied || jsonb_build_object('clientes.persona_contacto', v_candidate_contact);
      ELSIF public.master_data_normalize_text(v_client.persona_contacto) = public.master_data_normalize_text(v_candidate_contact) THEN
        IF trim(COALESCE(v_client.persona_contacto, '')) <> v_candidate_contact THEN
          UPDATE public.clientes
          SET persona_contacto = v_candidate_contact
          WHERE id = v_target_client_id;
          v_applied := v_applied || jsonb_build_object('clientes.persona_contacto', v_candidate_contact);
        END IF;
      ELSE
        v_ignored := v_ignored || jsonb_build_object(
          'clientes.persona_contacto',
          jsonb_build_object('incoming', v_candidate_contact, 'reason', 'conflict_with_existing')
        );
      END IF;
    ELSE
      v_ignored := v_ignored || jsonb_build_object(
        'clientes.persona_contacto',
        jsonb_build_object('incoming', v_candidate_contact, 'reason', 'invalid_contact')
      );
    END IF;
  END IF;

  v_candidate_phone := public.master_data_phone_digits(v_request.site_phone);
  IF v_target_client_id IS NOT NULL AND v_candidate_phone IS NOT NULL THEN
    IF public.master_data_is_reliable_phone(v_candidate_phone) THEN
      IF public.master_data_phone_digits(v_client.telefono) IS NULL OR NOT public.master_data_is_reliable_phone(v_client.telefono) THEN
        UPDATE public.clientes
        SET telefono = v_candidate_phone
        WHERE id = v_target_client_id;
        v_applied := v_applied || jsonb_build_object('clientes.telefono', v_candidate_phone);
      ELSIF public.master_data_phone_digits(v_client.telefono) = v_candidate_phone THEN
        IF COALESCE(v_client.telefono, '') <> v_candidate_phone THEN
          UPDATE public.clientes
          SET telefono = v_candidate_phone
          WHERE id = v_target_client_id;
          v_applied := v_applied || jsonb_build_object('clientes.telefono', v_candidate_phone);
        END IF;
      ELSE
        v_ignored := v_ignored || jsonb_build_object(
          'clientes.telefono',
          jsonb_build_object('incoming', v_candidate_phone, 'reason', 'conflict_with_existing')
        );
      END IF;
    ELSE
      v_ignored := v_ignored || jsonb_build_object(
        'clientes.telefono',
        jsonb_build_object('incoming', COALESCE(v_request.site_phone, ''), 'reason', 'invalid_phone')
      );
    END IF;
  END IF;

  IF v_equipment.equipment_id IS NOT NULL THEN
    v_candidate_address := NULLIF(trim(COALESCE(v_request.site_address, '')), '');
    IF v_candidate_address IS NOT NULL THEN
      IF public.master_data_is_reliable_address(v_candidate_address) THEN
        IF COALESCE(trim(v_equipment.direccion), '') = '' OR NOT public.master_data_is_reliable_address(v_equipment.direccion) THEN
          UPDATE public.equipos
          SET direccion = v_candidate_address
          WHERE id = v_equipment.equipment_id;
          v_applied := v_applied || jsonb_build_object('equipos.direccion', v_candidate_address);
        ELSIF public.master_data_normalize_text(v_equipment.direccion) = public.master_data_normalize_text(v_candidate_address) THEN
          NULL;
        ELSIF position(public.master_data_normalize_text(v_equipment.direccion) in public.master_data_normalize_text(v_candidate_address)) > 0
          AND length(v_candidate_address) >= length(COALESCE(v_equipment.direccion, '')) + 8 THEN
          UPDATE public.equipos
          SET direccion = v_candidate_address
          WHERE id = v_equipment.equipment_id;
          v_applied := v_applied || jsonb_build_object('equipos.direccion', v_candidate_address);
        ELSE
          v_ignored := v_ignored || jsonb_build_object(
            'equipos.direccion',
            jsonb_build_object('incoming', v_candidate_address, 'reason', 'conflict_with_existing')
          );
        END IF;
      ELSE
        v_ignored := v_ignored || jsonb_build_object(
          'equipos.direccion',
          jsonb_build_object('incoming', v_candidate_address, 'reason', 'invalid_address')
        );
      END IF;
    END IF;

    v_candidate_city := NULLIF(trim(COALESCE(v_request.destination_city, '')), '');
    IF v_candidate_city IS NOT NULL THEN
      IF public.master_data_is_reliable_city(v_candidate_city) THEN
        IF COALESCE(trim(v_equipment.ciudad), '') = '' OR NOT public.master_data_is_reliable_city(v_equipment.ciudad) THEN
          UPDATE public.equipos
          SET ciudad = v_candidate_city
          WHERE id = v_equipment.equipment_id;
          v_applied := v_applied || jsonb_build_object('equipos.ciudad', v_candidate_city);
        ELSIF public.master_data_normalize_text(v_equipment.ciudad) = public.master_data_normalize_text(v_candidate_city) THEN
          NULL;
        ELSE
          v_ignored := v_ignored || jsonb_build_object(
            'equipos.ciudad',
            jsonb_build_object('incoming', v_candidate_city, 'reason', 'conflict_with_existing')
          );
        END IF;
      ELSE
        v_ignored := v_ignored || jsonb_build_object(
          'equipos.ciudad',
          jsonb_build_object('incoming', v_candidate_city, 'reason', 'invalid_city')
        );
      END IF;
    END IF;

    v_candidate_model := NULLIF(trim(COALESCE(v_request.equipment_name, '')), '');
    IF v_candidate_model IS NOT NULL THEN
      IF public.master_data_is_reliable_equipment_name(v_candidate_model) THEN
        IF COALESCE(trim(v_equipment.modelo), '') = '' OR NOT public.master_data_is_reliable_equipment_name(v_equipment.modelo) THEN
          UPDATE public.equipos
          SET modelo = v_candidate_model
          WHERE id = v_equipment.equipment_id;
          v_applied := v_applied || jsonb_build_object('equipos.modelo', v_candidate_model);
        ELSIF public.master_data_normalize_text(v_equipment.modelo) = public.master_data_normalize_text(v_candidate_model) THEN
          NULL;
        ELSE
          v_ignored := v_ignored || jsonb_build_object(
            'equipos.modelo',
            jsonb_build_object('incoming', v_candidate_model, 'reason', 'conflict_with_existing')
          );
        END IF;
      ELSE
        v_ignored := v_ignored || jsonb_build_object(
          'equipos.modelo',
          jsonb_build_object('incoming', v_candidate_model, 'reason', 'invalid_model')
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'source', 'travel_request',
    'request_id', v_request.id,
    'equipment_id', v_equipment.equipment_id,
    'client_id', v_target_client_id,
    'applied', v_applied,
    'ignored', v_ignored
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_master_data_from_service_report(p_service_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service public.servicios_historial%ROWTYPE;
  v_ticket public.tickets%ROWTYPE;
  v_equipment RECORD;
  v_client public.clientes%ROWTYPE;
  v_serial TEXT;
  v_client_hint TEXT;
  v_target_client_id INT;
  v_candidate_contact TEXT;
  v_candidate_phone TEXT;
  v_applied JSONB := '{}'::jsonb;
  v_ignored JSONB := '{}'::jsonb;
BEGIN
  SELECT *
  INTO v_service
  FROM public.servicios_historial
  WHERE id = p_service_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'service_report_not_found', 'service_id', p_service_id);
  END IF;

  IF v_service.ticket_id IS NOT NULL THEN
    SELECT *
    INTO v_ticket
    FROM public.tickets
    WHERE id = v_service.ticket_id;
  END IF;

  v_serial := NULLIF(trim(COALESCE(v_service.no_serie, v_ticket.numero_serie_equipo, '')), '');
  v_client_hint := public.master_data_extract_ticket_client_hint(v_ticket.descripcion);

  IF v_serial IS NOT NULL THEN
    SELECT *
    INTO v_equipment
    FROM public.master_data_resolve_equipment(v_serial, NULL, v_client_hint);
  END IF;

  v_target_client_id := v_equipment.cliente_id;
  IF v_target_client_id IS NOT NULL THEN
    SELECT *
    INTO v_client
    FROM public.clientes
    WHERE id = v_target_client_id;
  END IF;

  v_candidate_contact := NULLIF(trim(COALESCE(v_ticket.nombre_cliente_guest, '')), '');
  IF v_target_client_id IS NOT NULL AND v_candidate_contact IS NOT NULL THEN
    IF public.master_data_is_reliable_contact(v_candidate_contact) THEN
      IF COALESCE(trim(v_client.persona_contacto), '') = '' OR NOT public.master_data_is_reliable_contact(v_client.persona_contacto) THEN
        UPDATE public.clientes
        SET persona_contacto = v_candidate_contact
        WHERE id = v_target_client_id;
        v_applied := v_applied || jsonb_build_object('clientes.persona_contacto', v_candidate_contact);
      ELSIF public.master_data_normalize_text(v_client.persona_contacto) = public.master_data_normalize_text(v_candidate_contact) THEN
        IF trim(COALESCE(v_client.persona_contacto, '')) <> v_candidate_contact THEN
          UPDATE public.clientes
          SET persona_contacto = v_candidate_contact
          WHERE id = v_target_client_id;
          v_applied := v_applied || jsonb_build_object('clientes.persona_contacto', v_candidate_contact);
        END IF;
      ELSE
        v_ignored := v_ignored || jsonb_build_object(
          'clientes.persona_contacto',
          jsonb_build_object('incoming', v_candidate_contact, 'reason', 'conflict_with_existing')
        );
      END IF;
    ELSE
      v_ignored := v_ignored || jsonb_build_object(
        'clientes.persona_contacto',
        jsonb_build_object('incoming', v_candidate_contact, 'reason', 'invalid_contact')
      );
    END IF;
  END IF;

  v_candidate_phone := public.master_data_phone_digits(v_ticket.telefono_cliente_guest);
  IF v_target_client_id IS NOT NULL AND v_candidate_phone IS NOT NULL THEN
    IF public.master_data_is_reliable_phone(v_candidate_phone) THEN
      IF public.master_data_phone_digits(v_client.telefono) IS NULL OR NOT public.master_data_is_reliable_phone(v_client.telefono) THEN
        UPDATE public.clientes
        SET telefono = v_candidate_phone
        WHERE id = v_target_client_id;
        v_applied := v_applied || jsonb_build_object('clientes.telefono', v_candidate_phone);
      ELSIF public.master_data_phone_digits(v_client.telefono) = v_candidate_phone THEN
        IF COALESCE(v_client.telefono, '') <> v_candidate_phone THEN
          UPDATE public.clientes
          SET telefono = v_candidate_phone
          WHERE id = v_target_client_id;
          v_applied := v_applied || jsonb_build_object('clientes.telefono', v_candidate_phone);
        END IF;
      ELSE
        v_ignored := v_ignored || jsonb_build_object(
          'clientes.telefono',
          jsonb_build_object('incoming', v_candidate_phone, 'reason', 'conflict_with_existing')
        );
      END IF;
    ELSE
      v_ignored := v_ignored || jsonb_build_object(
        'clientes.telefono',
        jsonb_build_object('incoming', COALESCE(v_ticket.telefono_cliente_guest, ''), 'reason', 'invalid_phone')
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'source', 'service_report',
    'service_id', v_service.id,
    'equipment_id', v_equipment.equipment_id,
    'client_id', v_target_client_id,
    'applied', v_applied,
    'ignored', v_ignored
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_sync_master_data_from_travel_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_master_data_from_travel_request(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_sync_master_data_from_service_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_master_data_from_service_report(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_master_data_from_travel_request ON public.travel_requests;
CREATE TRIGGER trg_sync_master_data_from_travel_request
AFTER INSERT OR UPDATE OF
  client_id,
  client_name,
  equipment_serial,
  equipment_name,
  destination_city,
  site_address,
  site_contact,
  site_phone
ON public.travel_requests
FOR EACH ROW
EXECUTE FUNCTION public.tg_sync_master_data_from_travel_request();

DROP TRIGGER IF EXISTS trg_sync_master_data_from_service_report ON public.servicios_historial;
CREATE TRIGGER trg_sync_master_data_from_service_report
AFTER INSERT OR UPDATE OF
  ticket_id,
  no_serie
ON public.servicios_historial
FOR EACH ROW
EXECUTE FUNCTION public.tg_sync_master_data_from_service_report();
