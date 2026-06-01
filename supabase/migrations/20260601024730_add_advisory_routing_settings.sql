CREATE TABLE IF NOT EXISTS public.asesorias_escaladas_enrutamiento (
  area public.asesoria_area PRIMARY KEY,
  weekday_assignee_names TEXT[] NOT NULL DEFAULT '{}',
  weekend_assignee_names TEXT[] NOT NULL DEFAULT '{}',
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.asesorias_escaladas_enrutamiento (area, weekday_assignee_names, weekend_assignee_names)
VALUES
  ('ingenieria', ARRAY['Francisco', 'Hector Cortés'], ARRAY['Diego Navarro']),
  ('quimica', ARRAY['Martha'], ARRAY['Martha'])
ON CONFLICT (area) DO NOTHING;

ALTER TABLE public.asesorias_escaladas_enrutamiento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff lee configuracion de enrutamiento de asesorias" ON public.asesorias_escaladas_enrutamiento;
CREATE POLICY "Staff lee configuracion de enrutamiento de asesorias"
ON public.asesorias_escaladas_enrutamiento
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.rol IN ('admin', 'tecnico')
  )
);
