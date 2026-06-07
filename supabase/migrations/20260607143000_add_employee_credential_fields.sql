ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_number TEXT,
  ADD COLUMN IF NOT EXISTS puesto TEXT,
  ADD COLUMN IF NOT EXISTS credential_photo_path TEXT,
  ADD COLUMN IF NOT EXISTS credential_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
