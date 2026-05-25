BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_count_status') THEN
    CREATE TYPE public.inventory_count_status AS ENUM ('borrador', 'registrado');
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS public.inventory_count_number_seq
  START WITH 1
  INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS public.inventory_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_code TEXT NOT NULL DEFAULT 'GDL',
  warehouse_name TEXT NOT NULL DEFAULT 'Guadalajara',
  capture_year INT NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT,
  count_number BIGINT NOT NULL DEFAULT nextval('public.inventory_count_number_seq'),
  count_reference TEXT GENERATED ALWAYS AS (
    'INV-' || warehouse_code || '-' || capture_year::TEXT || '-' || LPAD(count_number::TEXT, 6, '0')
  ) STORED,
  status public.inventory_count_status NOT NULL DEFAULT 'registrado',
  counted_at DATE NOT NULL DEFAULT CURRENT_DATE,
  counted_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  counted_by_name TEXT,
  captured_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  captured_by_name TEXT,
  notes TEXT,
  line_count INT NOT NULL DEFAULT 0,
  total_quantity INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_counts_warehouse_guard CHECK (warehouse_code = 'GDL' AND warehouse_name = 'Guadalajara'),
  CONSTRAINT inventory_counts_line_count_check CHECK (line_count >= 0),
  CONSTRAINT inventory_counts_total_quantity_check CHECK (total_quantity >= 0)
);

CREATE TABLE IF NOT EXISTS public.inventory_count_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_count_id UUID NOT NULL REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
  folio INT NOT NULL,
  sheet_number INT GENERATED ALWAYS AS ((((folio - 1) / 20) + 1)) STORED,
  article_code TEXT NOT NULL,
  article_code_key TEXT GENERATED ALWAYS AS (
    regexp_replace(upper(COALESCE(article_code, '')), '[^A-Z0-9]+', '', 'g')
  ) STORED,
  catalog_code TEXT REFERENCES public.refacciones_catalogo(codigo_refaccion) ON DELETE SET NULL,
  lote TEXT NOT NULL DEFAULT 'N/A',
  quantity INT NOT NULL,
  known_code BOOLEAN NOT NULL DEFAULT false,
  add_to_catalog BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_count_lines_unique_folio UNIQUE (inventory_count_id, folio),
  CONSTRAINT inventory_count_lines_quantity_check CHECK (quantity > 0),
  CONSTRAINT inventory_count_lines_lote_check CHECK (NULLIF(trim(lote), '') IS NOT NULL)
);

ALTER SEQUENCE public.inventory_count_number_seq OWNED BY public.inventory_counts.count_number;

ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff ve conteos de inventario" ON public.inventory_counts;
CREATE POLICY "Staff ve conteos de inventario"
ON public.inventory_counts
FOR SELECT
TO authenticated
USING ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Staff crea conteos de inventario" ON public.inventory_counts;
CREATE POLICY "Staff crea conteos de inventario"
ON public.inventory_counts
FOR INSERT
TO authenticated
WITH CHECK ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Staff actualiza conteos de inventario" ON public.inventory_counts;
CREATE POLICY "Staff actualiza conteos de inventario"
ON public.inventory_counts
FOR UPDATE
TO authenticated
USING ((SELECT public.is_staff()))
WITH CHECK ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Staff elimina conteos de inventario" ON public.inventory_counts;
CREATE POLICY "Staff elimina conteos de inventario"
ON public.inventory_counts
FOR DELETE
TO authenticated
USING ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Staff ve partidas de inventario" ON public.inventory_count_lines;
CREATE POLICY "Staff ve partidas de inventario"
ON public.inventory_count_lines
FOR SELECT
TO authenticated
USING ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Staff crea partidas de inventario" ON public.inventory_count_lines;
CREATE POLICY "Staff crea partidas de inventario"
ON public.inventory_count_lines
FOR INSERT
TO authenticated
WITH CHECK ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Staff actualiza partidas de inventario" ON public.inventory_count_lines;
CREATE POLICY "Staff actualiza partidas de inventario"
ON public.inventory_count_lines
FOR UPDATE
TO authenticated
USING ((SELECT public.is_staff()))
WITH CHECK ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Staff elimina partidas de inventario" ON public.inventory_count_lines;
CREATE POLICY "Staff elimina partidas de inventario"
ON public.inventory_count_lines
FOR DELETE
TO authenticated
USING ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Staff inserta catalogo refacciones" ON public.refacciones_catalogo;
CREATE POLICY "Staff inserta catalogo refacciones"
ON public.refacciones_catalogo
FOR INSERT
TO authenticated
WITH CHECK ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Staff actualiza catalogo refacciones" ON public.refacciones_catalogo;
CREATE POLICY "Staff actualiza catalogo refacciones"
ON public.refacciones_catalogo
FOR UPDATE
TO authenticated
USING ((SELECT public.is_staff()))
WITH CHECK ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Staff elimina catalogo refacciones" ON public.refacciones_catalogo;
CREATE POLICY "Staff elimina catalogo refacciones"
ON public.refacciones_catalogo
FOR DELETE
TO authenticated
USING ((SELECT public.is_staff()));

CREATE INDEX IF NOT EXISTS inventory_counts_capture_year_idx
  ON public.inventory_counts (capture_year DESC, count_number DESC);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_counts_reference_idx
  ON public.inventory_counts (count_reference);

CREATE INDEX IF NOT EXISTS inventory_count_lines_count_id_idx
  ON public.inventory_count_lines (inventory_count_id, folio);

CREATE INDEX IF NOT EXISTS inventory_count_lines_code_key_idx
  ON public.inventory_count_lines (article_code_key);

CREATE INDEX IF NOT EXISTS inventory_count_lines_catalog_code_idx
  ON public.inventory_count_lines (catalog_code);

COMMIT;
