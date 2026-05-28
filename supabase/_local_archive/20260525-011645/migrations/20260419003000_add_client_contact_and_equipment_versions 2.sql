ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS persona_contacto TEXT,
  ADD COLUMN IF NOT EXISTS telefono TEXT;

ALTER TABLE public.equipos
  ADD COLUMN IF NOT EXISTS "Software" TEXT,
  ADD COLUMN IF NOT EXISTS "Firmware" TEXT;
