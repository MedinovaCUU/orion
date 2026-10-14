-- Biosisa's generic solution codes, used for any fault type (they appear in the
-- «Código Solución» column of the service workbook): PO00 Limpieza, PO01 Revisión.
-- They were missing from the catalog, so they could not be chosen when closing a ticket.
INSERT INTO public.catalogo_servicio (catalog_kind, catalog_code, category_code, catalog_type, catalog_detail)
VALUES
  ('solucion', 'PO00', 'PO', 'General', 'Limpieza'),
  ('solucion', 'PO01', 'PO', 'General', 'Revisión')
ON CONFLICT (catalog_kind, catalog_code) DO UPDATE
SET category_code = EXCLUDED.category_code,
    catalog_type = EXCLUDED.catalog_type,
    catalog_detail = EXCLUDED.catalog_detail;
