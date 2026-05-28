CREATE TABLE IF NOT EXISTS public.service_report_version_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_report_id UUID NOT NULL REFERENCES public.service_reports(id) ON DELETE CASCADE,
  service_report_status public.service_report_status NOT NULL DEFAULT 'borrador',
  engineer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  engineer_name_snapshot TEXT,
  equipment_id TEXT REFERENCES public.equipos(id) ON DELETE SET NULL,
  equipment_serial TEXT NOT NULL,
  software_baseline_version TEXT,
  software_reported_version TEXT,
  software_issue_code TEXT,
  firmware_baseline_version TEXT,
  firmware_reported_version TEXT,
  firmware_issue_code TEXT,
  explanation TEXT NOT NULL,
  admin_notification_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  guard_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'service_report_version_alerts_service_report_id_key'
  ) THEN
    ALTER TABLE public.service_report_version_alerts
    ADD CONSTRAINT service_report_version_alerts_service_report_id_key UNIQUE (service_report_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_report_version_alerts_active
  ON public.service_report_version_alerts(is_active, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_report_version_alerts_engineer
  ON public.service_report_version_alerts(engineer_id);

ALTER TABLE public.service_report_version_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_report_version_alerts_select_owner_or_staff" ON public.service_report_version_alerts;
CREATE POLICY "service_report_version_alerts_select_owner_or_staff"
ON public.service_report_version_alerts
FOR SELECT
USING (
  engineer_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.service_reports
    WHERE service_reports.id = service_report_version_alerts.service_report_id
      AND (service_reports.created_by = auth.uid() OR service_reports.engineer_id = auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.rol IN ('admin', 'tecnico')
  )
);

DROP POLICY IF EXISTS "service_report_version_alerts_insert_authenticated" ON public.service_report_version_alerts;
CREATE POLICY "service_report_version_alerts_insert_authenticated"
ON public.service_report_version_alerts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "service_report_version_alerts_update_owner_or_staff" ON public.service_report_version_alerts;
CREATE POLICY "service_report_version_alerts_update_owner_or_staff"
ON public.service_report_version_alerts
FOR UPDATE
USING (
  engineer_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.service_reports
    WHERE service_reports.id = service_report_version_alerts.service_report_id
      AND (service_reports.created_by = auth.uid() OR service_reports.engineer_id = auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.rol IN ('admin', 'tecnico')
  )
)
WITH CHECK (
  engineer_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.service_reports
    WHERE service_reports.id = service_report_version_alerts.service_report_id
      AND (service_reports.created_by = auth.uid() OR service_reports.engineer_id = auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.rol IN ('admin', 'tecnico')
  )
);
