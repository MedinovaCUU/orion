DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asesoria_area') THEN
    CREATE TYPE public.asesoria_area AS ENUM ('ingenieria', 'quimica');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asesoria_estado') THEN
    CREATE TYPE public.asesoria_estado AS ENUM ('solicitada', 'en_revision', 'asesorada', 'cerrada');
  END IF;
END
$$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trainer_ingenieria BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trainer_quimica BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.asesorias_escaladas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE,
  solicitante_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  area public.asesoria_area NOT NULL,
  estado public.asesoria_estado NOT NULL DEFAULT 'solicitada',
  pasos_seguidos TEXT,
  ajustes_realizados TEXT,
  acciones_tomadas TEXT,
  consulta_escalada TEXT NOT NULL,
  respuesta_trainer TEXT,
  respondida_por_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  respondida_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.asesorias_escaladas_destinatarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asesoria_id UUID NOT NULL REFERENCES public.asesorias_escaladas(id) ON DELETE CASCADE,
  destinatario_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leida_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (asesoria_id, destinatario_id)
);

CREATE INDEX IF NOT EXISTS asesorias_escaladas_ticket_idx
  ON public.asesorias_escaladas (ticket_id);

CREATE INDEX IF NOT EXISTS asesorias_escaladas_estado_idx
  ON public.asesorias_escaladas (estado, area, creado_en DESC);

CREATE INDEX IF NOT EXISTS asesorias_escaladas_destinatarios_destinatario_idx
  ON public.asesorias_escaladas_destinatarios (destinatario_id, leida_en, creado_en DESC);

ALTER TABLE public.asesorias_escaladas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asesorias_escaladas_destinatarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff gestiona asesorias escaladas" ON public.asesorias_escaladas;
CREATE POLICY "Staff gestiona asesorias escaladas"
ON public.asesorias_escaladas
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.rol IN ('admin', 'tecnico')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.rol IN ('admin', 'tecnico')
  )
);

DROP POLICY IF EXISTS "Staff y destinatarios ven notificaciones de asesoria" ON public.asesorias_escaladas_destinatarios;
CREATE POLICY "Staff y destinatarios ven notificaciones de asesoria"
ON public.asesorias_escaladas_destinatarios
FOR SELECT
USING (
  destinatario_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.rol IN ('admin', 'tecnico')
  )
);

DROP POLICY IF EXISTS "Staff crea y actualiza notificaciones de asesoria" ON public.asesorias_escaladas_destinatarios;
CREATE POLICY "Staff crea y actualiza notificaciones de asesoria"
ON public.asesorias_escaladas_destinatarios
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.rol IN ('admin', 'tecnico')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.rol IN ('admin', 'tecnico')
  )
);
