DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_report_type') THEN
    CREATE TYPE public.service_report_type AS ENUM ('servicio', 'remoto');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_report_status') THEN
    CREATE TYPE public.service_report_status AS ENUM ('borrador', 'registrado', 'requiere_visita');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.client_service_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INT REFERENCES public.clientes(id) ON DELETE CASCADE,
  equipment_id TEXT REFERENCES public.equipos(id) ON DELETE SET NULL,
  numero_serie TEXT NOT NULL,
  cliente TEXT,
  persona_contacto TEXT,
  unidad_negocio TEXT,
  analizador TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'client_service_units_client_serial_unique'
  ) THEN
    ALTER TABLE public.client_service_units
    ADD CONSTRAINT client_service_units_client_serial_unique UNIQUE (client_id, numero_serie);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.service_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type public.service_report_type NOT NULL DEFAULT 'servicio',
  status public.service_report_status NOT NULL DEFAULT 'borrador',
  engineer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  client_id INT REFERENCES public.clientes(id) ON DELETE SET NULL,
  service_ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  related_travel_request_id UUID REFERENCES public.travel_requests(id) ON DELETE SET NULL,
  equipment_id TEXT REFERENCES public.equipos(id) ON DELETE SET NULL,
  employee_number TEXT,
  engineer_name TEXT,
  service_type TEXT,
  priority TEXT,
  report_reference TEXT,
  service_reference TEXT,
  subject TEXT,
  call_date DATE,
  service_date DATE,
  started_at TIME,
  ended_at TIME,
  client_name TEXT,
  business_unit_name TEXT,
  site_address TEXT,
  site_contact TEXT,
  site_phone TEXT,
  equipment_serial TEXT,
  equipment_name TEXT,
  diagnostic_code TEXT,
  diagnostic_label TEXT,
  comments TEXT,
  solution TEXT,
  software_version TEXT,
  firmware_version TEXT,
  requires_travel_planning BOOLEAN NOT NULL DEFAULT false,
  requires_flight BOOLEAN NOT NULL DEFAULT false,
  requires_car BOOLEAN NOT NULL DEFAULT false,
  trip_type TEXT,
  special_client_code TEXT,
  special_reference_label TEXT,
  special_reference_value TEXT,
  attachment_bucket TEXT,
  attachment_path TEXT,
  attachment_filename TEXT,
  signature_data_url TEXT,
  report_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.client_service_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_service_units_select_authenticated"
ON public.client_service_units
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "client_service_units_manage_staff"
ON public.client_service_units
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.rol IN ('admin', 'tecnico')
  )
);

CREATE POLICY "service_reports_select_owner_or_staff"
ON public.service_reports
FOR SELECT
USING (
  engineer_id = auth.uid()
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.rol IN ('admin', 'tecnico')
  )
);

CREATE POLICY "service_reports_insert_authenticated"
ON public.service_reports
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "service_reports_update_owner_or_staff"
ON public.service_reports
FOR UPDATE
USING (
  engineer_id = auth.uid()
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.rol IN ('admin', 'tecnico')
  )
)
WITH CHECK (
  engineer_id = auth.uid()
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.rol IN ('admin', 'tecnico')
  )
);

CREATE INDEX IF NOT EXISTS idx_service_reports_type_status
  ON public.service_reports(report_type, status);

CREATE INDEX IF NOT EXISTS idx_service_reports_engineer
  ON public.service_reports(engineer_id);

CREATE INDEX IF NOT EXISTS idx_service_reports_ticket
  ON public.service_reports(service_ticket_id);

CREATE INDEX IF NOT EXISTS idx_service_reports_serial
  ON public.service_reports(equipment_serial);

CREATE INDEX IF NOT EXISTS idx_client_service_units_serial
  ON public.client_service_units(numero_serie);

CREATE OR REPLACE FUNCTION public.master_data_is_reliable_version(p_value TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN trim(COALESCE(p_value, '')) = '' THEN false
      WHEN public.master_data_normalize_text(p_value) IN (
        '', 'NA', 'ND', 'NODATA', 'SINVERSION', 'DESCONOCIDO', 'PENDIENTE', 'N/A'
      ) THEN false
      WHEN length(trim(p_value)) < 2 THEN false
      ELSE true
    END;
$$;

CREATE OR REPLACE FUNCTION public.sync_master_data_from_service_report_entry(p_report_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report public.service_reports%ROWTYPE;
  v_equipment_match RECORD;
  v_equipment public.equipos%ROWTYPE;
  v_client public.clientes%ROWTYPE;
  v_target_client_id INT;
  v_candidate_contact TEXT;
  v_candidate_phone TEXT;
  v_candidate_address TEXT;
  v_candidate_city TEXT;
  v_candidate_model TEXT;
  v_candidate_software TEXT;
  v_candidate_firmware TEXT;
  v_applied JSONB := '{}'::jsonb;
  v_ignored JSONB := '{}'::jsonb;
BEGIN
  SELECT *
  INTO v_report
  FROM public.service_reports
  WHERE id = p_report_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'service_report_entry_not_found', 'report_id', p_report_id);
  END IF;

  IF NULLIF(trim(COALESCE(v_report.equipment_serial, '')), '') IS NOT NULL THEN
    SELECT *
    INTO v_equipment_match
    FROM public.master_data_resolve_equipment(v_report.equipment_serial, v_report.client_id, v_report.client_name);
  END IF;

  IF v_equipment_match.equipment_id IS NOT NULL THEN
    SELECT *
    INTO v_equipment
    FROM public.equipos
    WHERE id = v_equipment_match.equipment_id;
  END IF;

  v_target_client_id := COALESCE(v_report.client_id, v_equipment_match.cliente_id);

  IF v_equipment.id IS NOT NULL AND v_equipment.cliente_id IS NULL AND v_report.client_id IS NOT NULL THEN
    UPDATE public.equipos
    SET cliente_id = v_report.client_id
    WHERE id = v_equipment.id
      AND cliente_id IS NULL;

    IF FOUND THEN
      v_applied := v_applied || jsonb_build_object('equipos.cliente_id', v_report.client_id);
      v_target_client_id := v_report.client_id;
      SELECT *
      INTO v_equipment
      FROM public.equipos
      WHERE id = v_equipment.id;
    END IF;
  END IF;

  IF v_target_client_id IS NOT NULL THEN
    SELECT *
    INTO v_client
    FROM public.clientes
    WHERE id = v_target_client_id;
  END IF;

  v_candidate_contact := NULLIF(trim(COALESCE(v_report.site_contact, '')), '');
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

  v_candidate_phone := public.master_data_phone_digits(v_report.site_phone);
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
        jsonb_build_object('incoming', COALESCE(v_report.site_phone, ''), 'reason', 'invalid_phone')
      );
    END IF;
  END IF;

  IF v_equipment.id IS NOT NULL THEN
    v_candidate_address := NULLIF(trim(COALESCE(v_report.site_address, '')), '');
    IF v_candidate_address IS NOT NULL THEN
      IF public.master_data_is_reliable_address(v_candidate_address) THEN
        IF COALESCE(trim(v_equipment.direccion), '') = '' OR NOT public.master_data_is_reliable_address(v_equipment.direccion) THEN
          UPDATE public.equipos
          SET direccion = v_candidate_address
          WHERE id = v_equipment.id;
          v_applied := v_applied || jsonb_build_object('equipos.direccion', v_candidate_address);
        ELSIF public.master_data_normalize_text(v_equipment.direccion) = public.master_data_normalize_text(v_candidate_address) THEN
          NULL;
        ELSIF position(public.master_data_normalize_text(v_equipment.direccion) in public.master_data_normalize_text(v_candidate_address)) > 0
          AND length(v_candidate_address) >= length(COALESCE(v_equipment.direccion, '')) + 8 THEN
          UPDATE public.equipos
          SET direccion = v_candidate_address
          WHERE id = v_equipment.id;
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

    v_candidate_city := NULLIF(trim(COALESCE(v_report.report_payload ->> 'city', v_report.report_payload ->> 'destinationCity', '')), '');

    IF v_candidate_city IS NOT NULL THEN
      IF public.master_data_is_reliable_city(v_candidate_city) THEN
        IF COALESCE(trim(v_equipment.ciudad), '') = '' OR NOT public.master_data_is_reliable_city(v_equipment.ciudad) THEN
          UPDATE public.equipos
          SET ciudad = v_candidate_city
          WHERE id = v_equipment.id;
          v_applied := v_applied || jsonb_build_object('equipos.ciudad', v_candidate_city);
        ELSIF public.master_data_normalize_text(v_equipment.ciudad) = public.master_data_normalize_text(v_candidate_city) THEN
          NULL;
        ELSE
          v_ignored := v_ignored || jsonb_build_object(
            'equipos.ciudad',
            jsonb_build_object('incoming', v_candidate_city, 'reason', 'conflict_with_existing')
          );
        END IF;
      END IF;
    END IF;

    v_candidate_model := NULLIF(trim(COALESCE(v_report.equipment_name, '')), '');
    IF v_candidate_model IS NOT NULL THEN
      IF public.master_data_is_reliable_equipment_name(v_candidate_model) THEN
        IF COALESCE(trim(v_equipment.modelo), '') = '' OR NOT public.master_data_is_reliable_equipment_name(v_equipment.modelo) THEN
          UPDATE public.equipos
          SET modelo = v_candidate_model
          WHERE id = v_equipment.id;
          v_applied := v_applied || jsonb_build_object('equipos.modelo', v_candidate_model);
        ELSIF public.master_data_normalize_text(v_equipment.modelo) = public.master_data_normalize_text(v_candidate_model) THEN
          NULL;
        ELSE
          v_ignored := v_ignored || jsonb_build_object(
            'equipos.modelo',
            jsonb_build_object('incoming', v_candidate_model, 'reason', 'conflict_with_existing')
          );
        END IF;
      END IF;
    END IF;

    v_candidate_software := NULLIF(trim(COALESCE(v_report.software_version, '')), '');
    IF v_candidate_software IS NOT NULL THEN
      IF public.master_data_is_reliable_version(v_candidate_software) THEN
        IF COALESCE(trim(v_equipment.software), '') = '' OR NOT public.master_data_is_reliable_version(v_equipment.software) THEN
          UPDATE public.equipos
          SET software = v_candidate_software
          WHERE id = v_equipment.id;
          v_applied := v_applied || jsonb_build_object('equipos.software', v_candidate_software);
        ELSIF public.master_data_normalize_text(v_equipment.software) = public.master_data_normalize_text(v_candidate_software) THEN
          IF trim(COALESCE(v_equipment.software, '')) <> v_candidate_software THEN
            UPDATE public.equipos
            SET software = v_candidate_software
            WHERE id = v_equipment.id;
            v_applied := v_applied || jsonb_build_object('equipos.software', v_candidate_software);
          END IF;
        ELSE
          v_ignored := v_ignored || jsonb_build_object(
            'equipos.software',
            jsonb_build_object('incoming', v_candidate_software, 'reason', 'conflict_with_existing')
          );
        END IF;
      END IF;
    END IF;

    v_candidate_firmware := NULLIF(trim(COALESCE(v_report.firmware_version, '')), '');
    IF v_candidate_firmware IS NOT NULL THEN
      IF public.master_data_is_reliable_version(v_candidate_firmware) THEN
        IF COALESCE(trim(v_equipment.firmware), '') = '' OR NOT public.master_data_is_reliable_version(v_equipment.firmware) THEN
          UPDATE public.equipos
          SET firmware = v_candidate_firmware
          WHERE id = v_equipment.id;
          v_applied := v_applied || jsonb_build_object('equipos.firmware', v_candidate_firmware);
        ELSIF public.master_data_normalize_text(v_equipment.firmware) = public.master_data_normalize_text(v_candidate_firmware) THEN
          IF trim(COALESCE(v_equipment.firmware, '')) <> v_candidate_firmware THEN
            UPDATE public.equipos
            SET firmware = v_candidate_firmware
            WHERE id = v_equipment.id;
            v_applied := v_applied || jsonb_build_object('equipos.firmware', v_candidate_firmware);
          END IF;
        ELSE
          v_ignored := v_ignored || jsonb_build_object(
            'equipos.firmware',
            jsonb_build_object('incoming', v_candidate_firmware, 'reason', 'conflict_with_existing')
          );
        END IF;
      END IF;
    END IF;
  END IF;

  IF v_target_client_id IS NOT NULL AND NULLIF(trim(COALESCE(v_report.equipment_serial, '')), '') IS NOT NULL THEN
    INSERT INTO public.client_service_units (
      client_id,
      equipment_id,
      numero_serie,
      cliente,
      persona_contacto,
      unidad_negocio,
      analizador,
      updated_at
    )
    VALUES (
      v_target_client_id,
      v_equipment.id,
      v_report.equipment_serial,
      COALESCE(v_report.client_name, v_client.razon_social),
      COALESCE(NULLIF(trim(COALESCE(v_report.site_contact, '')), ''), v_client.persona_contacto),
      NULLIF(trim(COALESCE(v_report.business_unit_name, '')), ''),
      NULLIF(trim(COALESCE(v_report.equipment_name, '')), ''),
      NOW()
    )
    ON CONFLICT (client_id, numero_serie)
    DO UPDATE SET
      equipment_id = COALESCE(EXCLUDED.equipment_id, public.client_service_units.equipment_id),
      cliente = COALESCE(NULLIF(EXCLUDED.cliente, ''), public.client_service_units.cliente),
      persona_contacto = COALESCE(NULLIF(EXCLUDED.persona_contacto, ''), public.client_service_units.persona_contacto),
      unidad_negocio = COALESCE(NULLIF(EXCLUDED.unidad_negocio, ''), public.client_service_units.unidad_negocio),
      analizador = COALESCE(NULLIF(EXCLUDED.analizador, ''), public.client_service_units.analizador),
      updated_at = NOW();

    v_applied := v_applied || jsonb_build_object(
      'client_service_units',
      jsonb_build_object(
        'client_id', v_target_client_id,
        'numero_serie', v_report.equipment_serial
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'source', 'service_reports',
    'report_id', v_report.id,
    'equipment_id', v_equipment.id,
    'client_id', v_target_client_id,
    'applied', v_applied,
    'ignored', v_ignored
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_sync_master_data_from_service_report_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_master_data_from_service_report_entry(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_master_data_from_service_report_entry ON public.service_reports;
CREATE TRIGGER trg_sync_master_data_from_service_report_entry
AFTER INSERT OR UPDATE OF
  client_id,
  client_name,
  equipment_id,
  equipment_serial,
  equipment_name,
  business_unit_name,
  site_address,
  site_contact,
  site_phone,
  software_version,
  firmware_version
ON public.service_reports
FOR EACH ROW
EXECUTE FUNCTION public.tg_sync_master_data_from_service_report_entry();
