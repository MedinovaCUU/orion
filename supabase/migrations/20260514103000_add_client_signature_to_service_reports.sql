ALTER TABLE public.service_reports
ADD COLUMN IF NOT EXISTS client_signature_data_url TEXT;
