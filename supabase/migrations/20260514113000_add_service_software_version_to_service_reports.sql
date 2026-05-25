ALTER TABLE public.service_reports
ADD COLUMN IF NOT EXISTS service_software_version TEXT;

ALTER TABLE public.service_report_version_alerts
ADD COLUMN IF NOT EXISTS service_software_reported_version TEXT;

ALTER TABLE public.service_report_version_alerts
ADD COLUMN IF NOT EXISTS service_software_issue_code TEXT;
