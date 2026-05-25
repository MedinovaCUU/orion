ALTER TABLE public.service_reports
  ADD COLUMN IF NOT EXISTS solution_code TEXT,
  ADD COLUMN IF NOT EXISTS solution_label TEXT,
  ADD COLUMN IF NOT EXISTS client_comments TEXT;
