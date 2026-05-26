ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_type TEXT;
