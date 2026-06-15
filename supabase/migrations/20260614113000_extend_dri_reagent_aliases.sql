insert into public.reactivo_test_aliases (
  alias_normalizado,
  modelo_familia,
  descripcion_normalizada,
  notas
)
values
  ('ACE', 'ALL', 'ANGIOTENSIN CONVERTING ENZYME', 'Abreviatura canónica usada por DRI para enzima convertidora de angiotensina.'),
  ('AGLU', 'ALL', 'ALPHA GLUCOSIDASE', 'Abreviatura canónica usada por DRI para alfa-glucosidasa.'),
  ('ALP AMP', 'ALL', 'ALP AMP', 'Abreviatura canónica usada por DRI para fosfatasa alcalina AMP.'),
  ('ALP DEA', 'ALL', 'ALP DEA', 'Abreviatura canónica usada por DRI para fosfatasa alcalina DEA.'),
  ('CA CPC', 'ALL', 'CALCIUM CRESOLPHTHALEIN', 'Abreviatura canónica usada por DRI para calcio CPC.'),
  ('CER', 'ALL', 'CERULOPLASMIN', 'Abreviatura canónica usada por DRI para ceruloplasmina.'),
  ('CHOL', 'ALL', 'CHOLESTEROL', 'Abreviatura canónica usada por DRI para colesterol.'),
  ('COLESTEROL', 'ALL', 'CHOLESTEROL', 'Alias en español usado por DRI para colesterol.'),
  ('GLU', 'ALL', 'GLUCOSE', 'Abreviatura canónica usada por DRI para glucosa GOD/POD.'),
  ('GLU HK', 'ALL', 'GLUCOSE HEXOKINASE', 'Abreviatura canónica usada por DRI para glucosa hexokinasa.'),
  ('GLUCOSA', 'ALL', 'GLUCOSE', 'Alias en español usado por DRI para glucosa.'),
  ('GLUCOSA HEXOKINASA', 'ALL', 'GLUCOSE HEXOKINASE', 'Alias en español usado por DRI para glucosa hexokinasa.'),
  ('HAPTO', 'ALL', 'HAPTOGLOBIN', 'Abreviatura canónica usada por DRI para haptoglobina.'),
  ('HCY', 'ALL', 'HOMOCYSTEINE', 'Abreviatura canónica usada por DRI para homocisteína.'),
  ('HEMOGLOBINA', 'ALL', 'HEMOGLOBIN', 'Alias en español preparado para futuras pruebas HGB/HbA1c.'),
  ('HGB', 'ALL', 'HEMOGLOBIN', 'Abreviatura canónica preparada para futuras pruebas HGB/HbA1c.'),
  ('LACTATE DEHYDROGENASE', 'ALL', 'LDH', 'Nombre largo usado por DRI para lactato deshidrogenasa.'),
  ('LACTATO DESHIDROGENASA', 'ALL', 'LDH', 'Alias en español usado por DRI para lactato deshidrogenasa.'),
  ('LDH', 'ALL', 'LDH', 'Abreviatura canónica usada por DRI para lactato deshidrogenasa.'),
  ('LDH IFCC', 'ALL', 'LDH IFCC', 'Abreviatura canónica usada por DRI para LDH IFCC.'),
  ('TBA', 'ALL', 'TOTAL BILE ACIDS', 'Abreviatura canónica usada por DRI para ácidos biliares totales.')
on conflict (alias_normalizado, modelo_familia) do update set
  descripcion_normalizada = excluded.descripcion_normalizada,
  notas = excluded.notas,
  actualizado_en = now();
