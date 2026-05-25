WITH prefix_reference AS (
  SELECT
    catalog_kind,
    left(catalog_code, 2) AS prefix,
    max(NULLIF(category_code, 'ND')) AS inferred_category_code,
    max(NULLIF(catalog_type, 'Sin Tipo')) AS inferred_catalog_type
  FROM public.catalogo_servicio
  WHERE coalesce(trim(category_code), '') <> ''
     OR coalesce(trim(catalog_type), '') <> ''
  GROUP BY catalog_kind, left(catalog_code, 2)
)
UPDATE public.catalogo_servicio AS target
SET
  category_code = COALESCE(
    NULLIF(target.category_code, 'ND'),
    prefix_reference.inferred_category_code,
    target.category_code
  ),
  catalog_type = COALESCE(
    NULLIF(target.catalog_type, 'Sin Tipo'),
    prefix_reference.inferred_catalog_type,
    target.catalog_type
  )
FROM prefix_reference
WHERE prefix_reference.catalog_kind = target.catalog_kind
  AND prefix_reference.prefix = left(target.catalog_code, 2)
  AND (
    target.category_code = 'ND'
    OR target.catalog_type = 'Sin Tipo'
    OR coalesce(trim(target.category_code), '') = ''
    OR coalesce(trim(target.catalog_type), '') = ''
  );
