BEGIN;

ALTER TABLE public.refacciones_solicitudes
  ADD COLUMN IF NOT EXISTS engineer_name TEXT,
  ADD COLUMN IF NOT EXISTS employee_number TEXT,
  ADD COLUMN IF NOT EXISTS ticket_reference TEXT,
  ADD COLUMN IF NOT EXISTS equipo_id TEXT REFERENCES public.equipos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS equipo_serie TEXT,
  ADD COLUMN IF NOT EXISTS cliente_id INT REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cliente_nombre TEXT,
  ADD COLUMN IF NOT EXISTS contacto_sitio TEXT,
  ADD COLUMN IF NOT EXISTS telefono_contacto TEXT,
  ADD COLUMN IF NOT EXISTS direccion_sitio TEXT,
  ADD COLUMN IF NOT EXISTS ciudad_destino TEXT,
  ADD COLUMN IF NOT EXISTS estado_destino TEXT,
  ADD COLUMN IF NOT EXISTS prioridad TEXT,
  ADD COLUMN IF NOT EXISTS requerida_para DATE,
  ADD COLUMN IF NOT EXISTS motivo_solicitud TEXT,
  ADD COLUMN IF NOT EXISTS observaciones TEXT,
  ADD COLUMN IF NOT EXISTS destino_entrega TEXT,
  ADD COLUMN IF NOT EXISTS destino_entrega_detalle TEXT,
  ADD COLUMN IF NOT EXISTS lineas_solicitud JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_solicitud JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS email_enviado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

ALTER TABLE public.refacciones_solicitudes
  ALTER COLUMN nombre_pieza DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'refacciones_solicitudes_lineas_array_check'
  ) THEN
    ALTER TABLE public.refacciones_solicitudes
      ADD CONSTRAINT refacciones_solicitudes_lineas_array_check
      CHECK (jsonb_typeof(lineas_solicitud) = 'array');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS refacciones_solicitudes_ticket_reference_idx
  ON public.refacciones_solicitudes (ticket_reference);

CREATE INDEX IF NOT EXISTS refacciones_solicitudes_equipo_serie_idx
  ON public.refacciones_solicitudes (equipo_serie);

COMMIT;
