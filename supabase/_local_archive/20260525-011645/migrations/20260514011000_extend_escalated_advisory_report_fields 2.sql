ALTER TABLE public.asesorias_escaladas
  ADD COLUMN IF NOT EXISTS solicitante_nombre_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS plataforma_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS actividad TEXT,
  ADD COLUMN IF NOT EXISTS averia TEXT,
  ADD COLUMN IF NOT EXISTS detalle_averia TEXT,
  ADD COLUMN IF NOT EXISTS refacciones_utilizadas TEXT,
  ADD COLUMN IF NOT EXISTS bibliografia_consultada TEXT;
