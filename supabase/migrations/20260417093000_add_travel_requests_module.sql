DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'travel_request_status') THEN
    CREATE TYPE public.travel_request_status AS ENUM (
      'borrador',
      'buscando_vuelo',
      'vuelo_seleccionado',
      'solicitud_enviada',
      'en_revision_administrativa',
      'reservado',
      'rechazado',
      'requiere_cambios',
      'cancelado'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'travel_priority') THEN
    CREATE TYPE public.travel_priority AS ENUM ('baja', 'media', 'alta', 'critica');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'travel_trip_type') THEN
    CREATE TYPE public.travel_trip_type AS ENUM ('redondo', 'solo_ida');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'flight_leg_type') THEN
    CREATE TYPE public.flight_leg_type AS ENUM ('outbound', 'return');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'flight_selection_role') THEN
    CREATE TYPE public.flight_selection_role AS ENUM ('preferred', 'backup', 'recommended');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.travel_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  max_budget_mxn NUMERIC(12,2) NOT NULL DEFAULT 14500.00,
  direct_fare_delta_mxn NUMERIC(12,2) NOT NULL DEFAULT 1800.00,
  min_buffer_before_service_minutes INT NOT NULL DEFAULT 240,
  warning_buffer_before_service_minutes INT NOT NULL DEFAULT 150,
  min_buffer_after_service_minutes INT NOT NULL DEFAULT 120,
  red_eye_cutoff_hour INT NOT NULL DEFAULT 23,
  red_eye_resume_hour INT NOT NULL DEFAULT 5,
  risky_layover_minutes INT NOT NULL DEFAULT 180,
  max_recommended_stops INT NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.travel_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engineer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  client_id INT REFERENCES public.clientes(id) ON DELETE SET NULL,
  service_ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  employee_number TEXT,
  engineer_name TEXT NOT NULL,
  service_type TEXT NOT NULL,
  workflow_status public.travel_request_status NOT NULL DEFAULT 'borrador',
  priority public.travel_priority NOT NULL DEFAULT 'media',
  trip_type public.travel_trip_type NOT NULL DEFAULT 'redondo',
  origin_city TEXT NOT NULL,
  destination_city TEXT NOT NULL,
  origin_airport TEXT NOT NULL,
  destination_airport TEXT NOT NULL,
  desired_departure_date DATE NOT NULL,
  desired_return_date DATE,
  preferred_departure_window TEXT,
  preferred_return_window TEXT,
  service_start_at TIMESTAMPTZ,
  service_end_at TIMESTAMPTZ,
  client_name TEXT,
  site_address TEXT,
  site_contact TEXT,
  site_phone TEXT,
  service_reference TEXT,
  equipment_name TEXT,
  equipment_serial TEXT,
  justification TEXT,
  admin_message TEXT,
  comments TEXT,
  requires_checked_bag BOOLEAN NOT NULL DEFAULT false,
  requires_special_tools BOOLEAN NOT NULL DEFAULT false,
  requires_flight BOOLEAN NOT NULL DEFAULT true,
  requires_car BOOLEAN NOT NULL DEFAULT false,
  risk_level TEXT DEFAULT 'green',
  convenience_score NUMERIC(6,2) DEFAULT 0,
  policy_status TEXT DEFAULT 'draft',
  total_estimated_cost NUMERIC(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'MXN',
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.flight_search_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  travel_request_id UUID NOT NULL REFERENCES public.travel_requests(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  provider_session_id TEXT,
  search_origin_airport TEXT NOT NULL,
  search_destination_airport TEXT NOT NULL,
  search_departure_date DATE NOT NULL,
  search_return_date DATE,
  search_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  results_count INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.flight_offer_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  travel_request_id UUID NOT NULL REFERENCES public.travel_requests(id) ON DELETE CASCADE,
  search_session_id UUID REFERENCES public.flight_search_sessions(id) ON DELETE SET NULL,
  leg_type public.flight_leg_type NOT NULL,
  selection_role public.flight_selection_role NOT NULL,
  offer_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  airline TEXT,
  flight_number TEXT,
  origin_airport TEXT NOT NULL,
  destination_airport TEXT NOT NULL,
  departure_at TIMESTAMPTZ NOT NULL,
  arrival_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL,
  stops INT NOT NULL DEFAULT 0,
  layover_minutes INT NOT NULL DEFAULT 0,
  price_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'MXN',
  cabin TEXT,
  fare_type TEXT,
  deeplink TEXT,
  provider_offer_id TEXT,
  provider_session_id TEXT,
  convenience_score NUMERIC(6,2),
  policy_score NUMERIC(6,2),
  policy_status TEXT,
  risk_level TEXT,
  consulted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.travel_request_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  travel_request_id UUID NOT NULL REFERENCES public.travel_requests(id) ON DELETE CASCADE,
  status public.travel_request_status NOT NULL,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.travel_admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  travel_request_id UUID NOT NULL REFERENCES public.travel_requests(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  note_type TEXT NOT NULL DEFAULT 'general',
  note TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.travel_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_search_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_offer_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_request_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_admin_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "travel_policies_read_authenticated"
ON public.travel_policies
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "travel_policies_manage_admin_tecnico"
ON public.travel_policies
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.rol IN ('admin', 'tecnico')
  )
);

CREATE POLICY "travel_requests_select_owner_or_staff"
ON public.travel_requests
FOR SELECT
USING (
  created_by = auth.uid()
  OR engineer_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.rol IN ('admin', 'tecnico')
  )
);

CREATE POLICY "travel_requests_insert_authenticated"
ON public.travel_requests
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "travel_requests_update_owner_or_staff"
ON public.travel_requests
FOR UPDATE
USING (
  created_by = auth.uid()
  OR engineer_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.rol IN ('admin', 'tecnico')
  )
);

CREATE POLICY "flight_sessions_select_related"
ON public.flight_search_sessions
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.travel_requests
    WHERE travel_requests.id = flight_search_sessions.travel_request_id
      AND (
        travel_requests.created_by = auth.uid()
        OR travel_requests.engineer_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.rol IN ('admin', 'tecnico')
        )
      )
  )
);

CREATE POLICY "flight_sessions_insert_authenticated"
ON public.flight_search_sessions
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "flight_snapshots_select_related"
ON public.flight_offer_snapshots
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.travel_requests
    WHERE travel_requests.id = flight_offer_snapshots.travel_request_id
      AND (
        travel_requests.created_by = auth.uid()
        OR travel_requests.engineer_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.rol IN ('admin', 'tecnico')
        )
      )
  )
);

CREATE POLICY "flight_snapshots_insert_authenticated"
ON public.flight_offer_snapshots
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "travel_history_select_related"
ON public.travel_request_status_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.travel_requests
    WHERE travel_requests.id = travel_request_status_history.travel_request_id
      AND (
        travel_requests.created_by = auth.uid()
        OR travel_requests.engineer_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.rol IN ('admin', 'tecnico')
        )
      )
  )
);

CREATE POLICY "travel_history_insert_authenticated"
ON public.travel_request_status_history
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "travel_notes_select_related"
ON public.travel_admin_notes
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.travel_requests
    WHERE travel_requests.id = travel_admin_notes.travel_request_id
      AND (
        travel_requests.created_by = auth.uid()
        OR travel_requests.engineer_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.rol IN ('admin', 'tecnico')
        )
      )
  )
);

CREATE POLICY "travel_notes_insert_authenticated"
ON public.travel_admin_notes
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_travel_requests_status ON public.travel_requests(workflow_status);
CREATE INDEX IF NOT EXISTS idx_travel_requests_engineer ON public.travel_requests(engineer_id);
CREATE INDEX IF NOT EXISTS idx_travel_requests_departure_date ON public.travel_requests(desired_departure_date);
CREATE INDEX IF NOT EXISTS idx_travel_requests_priority ON public.travel_requests(priority);
CREATE INDEX IF NOT EXISTS idx_flight_search_sessions_request ON public.flight_search_sessions(travel_request_id);
CREATE INDEX IF NOT EXISTS idx_flight_offer_snapshots_request ON public.flight_offer_snapshots(travel_request_id);
CREATE INDEX IF NOT EXISTS idx_travel_status_history_request ON public.travel_request_status_history(travel_request_id);
CREATE INDEX IF NOT EXISTS idx_travel_admin_notes_request ON public.travel_admin_notes(travel_request_id);

INSERT INTO public.travel_policies (
  policy_code,
  name,
  description,
  max_budget_mxn,
  direct_fare_delta_mxn,
  min_buffer_before_service_minutes,
  warning_buffer_before_service_minutes,
  min_buffer_after_service_minutes,
  red_eye_cutoff_hour,
  red_eye_resume_hour,
  risky_layover_minutes,
  max_recommended_stops
)
VALUES (
  'default_service_ops',
  'Politica Base Servicio Tecnico',
  'Politica operativa inicial para coordinar vuelos de mantenimientos, correctivos e instalaciones.',
  14500.00,
  1800.00,
  240,
  150,
  120,
  23,
  5,
  180,
  1
)
ON CONFLICT (policy_code) DO NOTHING;
