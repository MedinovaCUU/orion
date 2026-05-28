BEGIN;

CREATE TABLE IF NOT EXISTS public.pno_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  procedure_kind TEXT NOT NULL CHECK (procedure_kind IN ('ajuste', 'limpieza', 'diagnostico', 'verificacion', 'mantenimiento')),
  equipment_family TEXT NOT NULL DEFAULT '',
  failure_focus TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  objective TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT '',
  estimated_duration TEXT NOT NULL DEFAULT '',
  tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  materials JSONB NOT NULL DEFAULT '[]'::jsonb,
  safety_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  validation_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  reference_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  version TEXT NOT NULL DEFAULT '1.0',
  status TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('borrador', 'activo', 'obsoleto')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pno_documents_code_guard CHECK (NULLIF(trim(code), '') IS NOT NULL),
  CONSTRAINT pno_documents_title_guard CHECK (NULLIF(trim(title), '') IS NOT NULL)
);

ALTER TABLE public.pno_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura autenticada de PNO" ON public.pno_documents;
CREATE POLICY "Lectura autenticada de PNO"
ON public.pno_documents
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Staff crea PNO" ON public.pno_documents;
CREATE POLICY "Staff crea PNO"
ON public.pno_documents
FOR INSERT
TO authenticated
WITH CHECK ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Staff actualiza PNO" ON public.pno_documents;
CREATE POLICY "Staff actualiza PNO"
ON public.pno_documents
FOR UPDATE
TO authenticated
USING ((SELECT public.is_staff()))
WITH CHECK ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Staff elimina PNO" ON public.pno_documents;
CREATE POLICY "Staff elimina PNO"
ON public.pno_documents
FOR DELETE
TO authenticated
USING ((SELECT public.is_staff()));

CREATE INDEX IF NOT EXISTS pno_documents_kind_status_idx
  ON public.pno_documents (procedure_kind, status);

CREATE INDEX IF NOT EXISTS pno_documents_equipment_family_idx
  ON public.pno_documents (equipment_family);

CREATE INDEX IF NOT EXISTS pno_documents_updated_at_idx
  ON public.pno_documents (updated_at DESC);

COMMIT;
