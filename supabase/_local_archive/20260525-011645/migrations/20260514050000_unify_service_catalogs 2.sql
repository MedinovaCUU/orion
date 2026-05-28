CREATE TABLE IF NOT EXISTS public.catalogo_servicio (
  catalog_kind TEXT NOT NULL CHECK (catalog_kind IN ('averia', 'solucion')),
  catalog_code TEXT NOT NULL,
  category_code TEXT NOT NULL,
  catalog_type TEXT NOT NULL,
  catalog_detail TEXT NOT NULL,
  PRIMARY KEY (catalog_kind, catalog_code)
);

ALTER TABLE public.catalogo_servicio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura pública de catálogo de servicio" ON public.catalogo_servicio;
CREATE POLICY "Lectura pública de catálogo de servicio"
ON public.catalogo_servicio
FOR SELECT
USING (true);

DO $$
BEGIN
  IF to_regclass('public.averias_catalogo') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO public.catalogo_servicio (catalog_kind, catalog_code, category_code, catalog_type, catalog_detail)
      SELECT
        'averia',
        cda,
        cta,
        tipo_averia,
        detalle_averia
      FROM public.averias_catalogo
      ON CONFLICT (catalog_kind, catalog_code)
      DO UPDATE SET
        category_code = EXCLUDED.category_code,
        catalog_type = EXCLUDED.catalog_type,
        catalog_detail = EXCLUDED.catalog_detail
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.soluciones_catalogo') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO public.catalogo_servicio (catalog_kind, catalog_code, category_code, catalog_type, catalog_detail)
      SELECT
        'solucion',
        cds,
        cts,
        tipo_solucion,
        detalle_solucion
      FROM public.soluciones_catalogo
      ON CONFLICT (catalog_kind, catalog_code)
      DO UPDATE SET
        category_code = EXCLUDED.category_code,
        catalog_type = EXCLUDED.catalog_type,
        catalog_detail = EXCLUDED.catalog_detail
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'averias_catalogo'
      AND c.relkind = 'v'
  ) THEN
    EXECUTE 'DROP VIEW public.averias_catalogo';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'averias_catalogo'
      AND c.relkind IN ('r', 'p')
  ) THEN
    EXECUTE 'DROP TABLE public.averias_catalogo';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'soluciones_catalogo'
      AND c.relkind = 'v'
  ) THEN
    EXECUTE 'DROP VIEW public.soluciones_catalogo';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'soluciones_catalogo'
      AND c.relkind IN ('r', 'p')
  ) THEN
    EXECUTE 'DROP TABLE public.soluciones_catalogo';
  END IF;
END $$;

CREATE VIEW public.averias_catalogo AS
SELECT
  catalog_code AS cda,
  catalog_type AS tipo_averia,
  catalog_detail AS detalle_averia,
  category_code AS cta
FROM public.catalogo_servicio
WHERE catalog_kind = 'averia';

CREATE VIEW public.soluciones_catalogo AS
SELECT
  catalog_code AS cds,
  catalog_type AS tipo_solucion,
  catalog_detail AS detalle_solucion,
  category_code AS cts
FROM public.catalogo_servicio
WHERE catalog_kind = 'solucion';

GRANT SELECT ON public.catalogo_servicio TO anon, authenticated, service_role;
GRANT SELECT ON public.averias_catalogo TO anon, authenticated, service_role;
GRANT SELECT ON public.soluciones_catalogo TO anon, authenticated, service_role;
