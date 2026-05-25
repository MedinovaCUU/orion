CREATE TABLE IF NOT EXISTS public.service_report_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_report_id UUID NOT NULL REFERENCES public.service_reports(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  material_kind TEXT,
  quantity INT NOT NULL DEFAULT 1,
  product_name TEXT,
  raw_scan TEXT,
  scan_method TEXT,
  scan_format TEXT,
  gtin TEXT,
  reference_code TEXT,
  lot_number TEXT,
  expires_on DATE,
  catalog_code TEXT,
  category_name TEXT,
  presentation TEXT,
  price_mxn NUMERIC(12, 2),
  catalog_matched BOOLEAN NOT NULL DEFAULT false,
  scanned_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'service_report_materials_report_item_unique'
  ) THEN
    ALTER TABLE public.service_report_materials
    ADD CONSTRAINT service_report_materials_report_item_unique UNIQUE (service_report_id, item_id);
  END IF;
END $$;

ALTER TABLE public.service_report_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_report_materials_select_owner_or_staff"
ON public.service_report_materials
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.service_reports
    WHERE service_reports.id = service_report_materials.service_report_id
      AND (
        service_reports.engineer_id = auth.uid()
        OR service_reports.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.rol IN ('admin', 'tecnico')
        )
      )
  )
);

CREATE POLICY "service_report_materials_insert_owner_or_staff"
ON public.service_report_materials
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.service_reports
    WHERE service_reports.id = service_report_materials.service_report_id
      AND (
        service_reports.engineer_id = auth.uid()
        OR service_reports.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.rol IN ('admin', 'tecnico')
        )
      )
  )
);

CREATE POLICY "service_report_materials_update_owner_or_staff"
ON public.service_report_materials
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.service_reports
    WHERE service_reports.id = service_report_materials.service_report_id
      AND (
        service_reports.engineer_id = auth.uid()
        OR service_reports.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.rol IN ('admin', 'tecnico')
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.service_reports
    WHERE service_reports.id = service_report_materials.service_report_id
      AND (
        service_reports.engineer_id = auth.uid()
        OR service_reports.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.rol IN ('admin', 'tecnico')
        )
      )
  )
);

CREATE POLICY "service_report_materials_delete_owner_or_staff"
ON public.service_report_materials
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.service_reports
    WHERE service_reports.id = service_report_materials.service_report_id
      AND (
        service_reports.engineer_id = auth.uid()
        OR service_reports.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.rol IN ('admin', 'tecnico')
        )
      )
  )
);

CREATE INDEX IF NOT EXISTS idx_service_report_materials_report
  ON public.service_report_materials(service_report_id);

CREATE INDEX IF NOT EXISTS idx_service_report_materials_reference
  ON public.service_report_materials(reference_code);

CREATE INDEX IF NOT EXISTS idx_service_report_materials_gtin
  ON public.service_report_materials(gtin);

CREATE INDEX IF NOT EXISTS idx_service_report_materials_expiration
  ON public.service_report_materials(expires_on);
