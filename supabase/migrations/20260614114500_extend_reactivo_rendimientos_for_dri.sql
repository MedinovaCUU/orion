insert into public.reactivo_rendimientos_catalogo (
  codigo,
  modelo_familia,
  descripcion,
  descripcion_normalizada,
  presentacion,
  rendimiento_total,
  rendimiento_util,
  rendimiento_util_seguro,
  source_sheet
)
values
  ('21511', 'BAX00', 'CALCIUM- CRESOLPHTHALEIN BAX00', 'CALCIUM CRESOLPHTHALEIN', '8 x 60 + 8 x 15 mL', null, null, null, 'einfo_enrichment'),
  ('23511', 'BAX00', 'CALCIUM- CRESOLPHTHALEIN BAX00', 'CALCIUM CRESOLPHTHALEIN', '2 x 60 + 2 x 15 mL', null, null, null, 'einfo_enrichment'),
  ('21522', 'BAX00', 'ALPHA-GLUCOSIDASE BAX00', 'ALPHA GLUCOSIDASE', '2x20 + 2x5 mL', null, null, null, 'einfo_enrichment'),
  ('21603', 'BAX00', 'GLUCOSE-6-PHOSPHATE DEHYDROGENASE (G6PDH) BAX00', 'GLUCOSE 6 PHOSPHATE DEHYDROGENASE G6PDH', '1x60mL + 1x15mL', null, null, null, 'einfo_enrichment'),
  ('21656', 'BAX00', 'GLUCOSE HEXOKINASE BAX00', 'GLUCOSE HEXOKINASE', '', null, null, null, 'einfo_enrichment'),
  ('23656', 'BAX00', 'GLUCOSE HEXOKINASE BAX00', 'GLUCOSE HEXOKINASE', '', null, null, null, 'einfo_enrichment'),
  ('21734', 'BAX00', 'CREATININE-ENZYMATIC BAX00', 'CREATININE ENZYMATIC', '2 x 60 + 2 x 20 mL', null, null, null, 'einfo_enrichment'),
  ('21796', 'BAX00', 'ANGIOTENSIN CONVERTING ENZYME (ACE) BAX00', 'ANGIOTENSIN CONVERTING ENZYME', '2 x 60 mL', null, null, null, 'einfo_enrichment'),
  ('22340', 'BAX00', 'CERULOPLASMIN BAX00', 'CERULOPLASMIN', '1 x 50 mL', null, null, null, 'einfo_enrichment'),
  ('23218', 'BAX00', 'HAPTOGLOBIN BAX00', 'HAPTOGLOBIN', '1 x 40 + 1 x 10 mL', null, null, null, 'einfo_enrichment'),
  ('23551', 'BAX00', 'TOTAL BILE ACIDS BAX00', 'TOTAL BILE ACIDS', '1 x 60 + 1 x 20 mL', null, null, null, 'einfo_enrichment'),
  ('23737', 'BAX00', 'HOMOCYSTEINE BAX00', 'HOMOCYSTEINE', '1 x 20 + 1 x 5.4 mL', null, null, null, 'einfo_enrichment')
on conflict (codigo) do update set
  modelo_familia = excluded.modelo_familia,
  descripcion = excluded.descripcion,
  descripcion_normalizada = excluded.descripcion_normalizada,
  presentacion = excluded.presentacion,
  source_sheet = excluded.source_sheet,
  actualizado_en = now();
