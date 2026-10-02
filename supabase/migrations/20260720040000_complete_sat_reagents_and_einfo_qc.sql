begin;

-- Two analytes observed in SAT 834002824 were present in the commercial catalog
-- but not as first-class DRI reagents.
insert into public.reagents (
  id, name, calibration_mode, read_mode, primary_wavelength_nm, reference_wavelength_nm,
  reported_method, reagent_type, operational_note, preliminary_risk, source_status,
  confidence, source_type, source_reference, reference_code, platforms,
  analytical_family, reaction_kind, reagent_scheme, uses_r1, uses_r2,
  mechanical_subsystems, technical_profile
)
values
  (
    'HDL_TOOS', 'Cholesterol HDL Direct TOOS', 'Lineal', null, null, null,
    'Punto final bireactivo', 'Bireactiva',
    'Controlar blanco, estabilidad a bordo y concordancia de lote de calibrador/control.', 'Medio',
    'IFU EInfo verificada', 'confirmed', 'ifu', 'einfo.bio IFU M21594-02 · código 21594',
    'HDL TOOS', array['BA400','BA200'], 'lípidos', 'endpoint', 'bireactive', true, true,
    array['reagent_arm_r1','reagent_arm_r2','optical_system','fridge'],
    jsonb_build_object(
      'identity', jsonb_build_object(
        'reagentKey', 'HDL_TOOS', 'displayCode', 'HDL TOOS',
        'displayName', 'Colesterol HDL directo TOOS',
        'canonicalNames', jsonb_build_array('HDL DIRECT TOOS','CHOLESTEROL HDL DIRECT TOOS','HDL TOOS')
      ),
      'ifuFacts', jsonb_build_object(
        'productCodes', jsonb_build_array('21594','23594'),
        'storageTemperatureC', jsonb_build_array(2,8),
        'onboardStabilityHours', 2160,
        'detectionLimitValue', 0.90, 'detectionLimitUnit', 'mg/dL',
        'quantificationLimitValue', 2.72, 'quantificationLimitUnit', 'mg/dL',
        'linearityLimitValue', 180, 'linearityLimitUnit', 'mg/dL',
        'sourceReference', 'einfo.bio/0006213/21594/es · IFU M21594-02'
      )
    )
  ),
  (
    'CK_MB', 'Creatine Kinase-MB (CK-MB)', 'Lineal', 'Mono', 340, null,
    'Tiempo fijo bireactivo', 'Bireactiva',
    'La CK total debe ser <=1000 U/L; revisar blanco, calibración y control CK-MB dedicado.', 'Alto',
    'IFU EInfo verificada', 'confirmed', 'ifu', 'einfo.bio IFU M21792-08 · código 21792',
    'CK MB', array['BA400','BA200'], 'enzimas', 'kinetic', 'bireactive', true, true,
    array['reagent_arm_r1','reagent_arm_r2','optical_system','fridge'],
    jsonb_build_object(
      'identity', jsonb_build_object(
        'reagentKey', 'CK_MB', 'displayCode', 'CK MB',
        'displayName', 'Creatina quinasa MB',
        'canonicalNames', jsonb_build_array('CK-MB','CK MB','CREATINE KINASE-MB')
      ),
      'ifuFacts', jsonb_build_object(
        'productCodes', jsonb_build_array('21792','23792'),
        'storageTemperatureC', jsonb_build_array(2,8),
        'onboardStabilityHours', 720,
        'sampleVolumeUl', 12, 'reagentR1VolumeUl', 240, 'reagentR2VolumeUl', 60,
        'linearityLimitValue', 1000, 'linearityLimitUnit', 'U/L',
        'blankAbsorbanceLimit', 0.400,
        'sourceReference', 'einfo.bio/0005655/21792/es · IFU M21792-08'
      )
    )
  ),
  (
    'HGB', 'Hemoglobin A1c Direct (HbA1c-DIR)', 'No lineal', 'Mono', 670, null,
    'Tiempo fijo turbidimétrico bireactivo', 'Bireactiva',
    'Requiere pretratamiento de sangre total, calibración polinómica y controles normal/elevado.', 'Alto',
    'IFU EInfo verificada', 'confirmed', 'ifu', 'einfo.bio IFU M22047-09 · código 22147',
    'HBA1C DIR', array['BA400','BA200'], 'hemoglobina glicada', 'turbidimetric', 'bireactive', true, true,
    array['sample_arm','reagent_arm_r1','reagent_arm_r2','optical_system','fridge'],
    jsonb_build_object(
      'identity', jsonb_build_object(
        'reagentKey', 'HGB', 'displayCode', 'HBA1C',
        'displayName', 'Hemoglobina A1c directa',
        'canonicalNames', jsonb_build_array('HBA1C-DIRECT','HBA1C-DIR','HBA1C DI','HEMOGLOBIN A1C DIRECT')
      ),
      'ifuFacts', jsonb_build_object(
        'productCodes', jsonb_build_array('22047','22147'),
        'storageTemperatureC', jsonb_build_array(2,8),
        'onboardStabilityHours', 720,
        'sampleVolumeUl', 3, 'reagentR1VolumeUl', 190, 'reagentR2VolumeUl', 40,
        'measurementRangeLow', 20, 'measurementRangeHigh', 140, 'measurementRangeUnit', 'mmol/mol',
        'sourceReference', 'einfo.bio/0006265/22147/es · IFU M22047-09'
      )
    )
  )
on conflict (id) do update set
  name = excluded.name,
  calibration_mode = excluded.calibration_mode,
  read_mode = excluded.read_mode,
  primary_wavelength_nm = excluded.primary_wavelength_nm,
  reference_wavelength_nm = excluded.reference_wavelength_nm,
  reported_method = excluded.reported_method,
  reagent_type = excluded.reagent_type,
  operational_note = excluded.operational_note,
  preliminary_risk = excluded.preliminary_risk,
  source_status = excluded.source_status,
  confidence = excluded.confidence,
  source_type = excluded.source_type,
  source_reference = excluded.source_reference,
  reference_code = excluded.reference_code,
  platforms = excluded.platforms,
  analytical_family = excluded.analytical_family,
  reaction_kind = excluded.reaction_kind,
  reagent_scheme = excluded.reagent_scheme,
  uses_r1 = excluded.uses_r1,
  uses_r2 = excluded.uses_r2,
  mechanical_subsystems = excluded.mechanical_subsystems,
  technical_profile = coalesce(public.reagents.technical_profile, '{}'::jsonb) || excluded.technical_profile,
  updated_at = timezone('utc', now());

-- Make the existing HbA1c entry explicit without breaking cases that already use HGB.
update public.reagents
set name = 'Hemoglobin A1c Direct (HbA1c-DIR)',
    reference_code = 'HBA1C DIR',
    platforms = array['BA400','BA200'],
    analytical_family = 'hemoglobina glicada',
    reaction_kind = 'turbidimetric',
    reagent_scheme = 'bireactive',
    uses_r1 = true,
    uses_r2 = true,
    primary_wavelength_nm = 670,
    source_status = 'IFU EInfo verificada',
    confidence = 'confirmed',
    source_type = 'ifu',
    source_reference = 'einfo.bio/0006265/22147/es · IFU M22047-09',
    technical_profile = coalesce(technical_profile, '{}'::jsonb) || jsonb_build_object(
      'identity', jsonb_build_object(
        'reagentKey', 'HGB', 'displayCode', 'HBA1C', 'displayName', 'Hemoglobina A1c directa',
        'canonicalNames', jsonb_build_array('HBA1C-DIRECT','HBA1C-DIR','HBA1C DI','HEMOGLOBIN A1C DIRECT')
      ),
      'ifuFacts', jsonb_build_object(
        'productCodes', jsonb_build_array('22047','22147'),
        'storageTemperatureC', jsonb_build_array(2,8),
        'onboardStabilityHours', 720,
        'sampleVolumeUl', 3, 'reagentR1VolumeUl', 190, 'reagentR2VolumeUl', 40,
        'measurementRangeLow', 20, 'measurementRangeHigh', 140, 'measurementRangeUnit', 'mmol/mol',
        'sourceReference', 'einfo.bio/0006265/22147/es · IFU M22047-09'
      )
    ),
    updated_at = timezone('utc', now())
where id = 'HGB';

insert into public.reactivo_test_aliases (alias_normalizado, modelo_familia, descripcion_normalizada, notas)
values
  ('HDL TOOS', 'BAX00', 'HDL DIRECT TOOS', 'SAT BA400: HDL TOOS / HDL DIRECT TOOS.'),
  ('HDL DIRECT TOOS', 'BAX00', 'HDL DIRECT TOOS', 'Nombre de catálogo BioSystems.'),
  ('CK MB', 'BAX00', 'CK MB', 'SAT BA400: CK-MB.'),
  ('CK-MB', 'BAX00', 'CK MB', 'Nombre IFU BioSystems.'),
  ('HBA1C DI', 'BAX00', 'HBA1C DIRECT', 'Nombre corto observado en SAT.'),
  ('HBA1C DIR', 'BAX00', 'HBA1C DIRECT', 'Nombre IFU BioSystems.'),
  ('LIP DGGR', 'BAX00', 'LIPASE DGGR', 'Nombre corto observado en SAT.'),
  ('T PROT B', 'BAX00', 'PROTEIN TOTAL BIREAGENT', 'Nombre corto observado en SAT.'),
  ('DBIL DPD', 'BAX00', 'BILI DIRECT DPD', 'Nombre corto observado en SAT.'),
  ('TBIL DPD', 'BAX00', 'BILI TOTAL DPD', 'Nombre corto observado en SAT.'),
  ('CA AZO', 'BAX00', 'CALCIUM ARSENAZO', 'Nombre corto observado en SAT.'),
  ('AMY DIR', 'BAX00', 'ALPHA AMYLASE DIRECT', 'Nombre corto observado en SAT.')
on conflict (alias_normalizado, modelo_familia) do update set
  descripcion_normalizada = excluded.descripcion_normalizada,
  notas = excluded.notas,
  actualizado_en = now();

-- Current official values available from EInfo. sd1Low/sd1High and 2SD are
-- calculated from the stated target and 1S; reject limits are copied verbatim.
with qc_source (
  reagent_id, product_code, lot, control_level, analyte_name, method_name, unit,
  target_value, sd1, reject_low, reject_high, traceability, source_reference
) as (
  values
    ('GGT','18009','0004','level_1','GAMMA-GT','IFCC','U/L',42.3,2.5,34.7,49.9,'C-RSE/IFCC','einfo.bio Value Sheet 18009 lote 0004'),
    ('GGT','18010','0003','level_2','GAMMA-GT','IFCC','U/L',189.0,11.0,155.0,223.0,'C-RSE/IFCC','einfo.bio Value Sheet 18010 lote 0003'),
    ('LDH','18009','0004','level_1','LDH','Piruvato','U/L',427.0,26.0,350.0,504.0,'BMC','einfo.bio Value Sheet 18009 lote 0004'),
    ('LDH','18010','0003','level_2','LDH','Piruvato','U/L',846.0,51.0,694.0,998.0,'BMC','einfo.bio Value Sheet 18010 lote 0003'),
    ('LIPASA','18009','0004','level_1','LIPASA','DGGR','U/L',55.0,5.5,38.5,71.5,'BMC','einfo.bio Value Sheet 18009 lote 0004'),
    ('LIPASA','18010','0003','level_2','LIPASA','DGGR','U/L',101.0,8.0,76.0,126.0,'BMC','einfo.bio Value Sheet 18010 lote 0003'),
    ('PROT_T','18009','0004','level_1','PROTEINA TOTAL','Biuret','g/dL',5.12,0.20,4.51,5.73,'SRM 927 (NIST)','einfo.bio Value Sheet 18009 lote 0004'),
    ('PROT_T','18010','0003','level_2','PROTEINA TOTAL','Biuret','g/dL',8.24,0.33,7.25,9.23,'SRM 927 (NIST)','einfo.bio Value Sheet 18010 lote 0003'),
    ('TG','18009','0004','level_1','TRIGLICERIDOS','Glicerol fosfato oxidasa/peroxidasa','mg/dL',40.3,2.0,34.3,46.3,'SRM 909 (NIST)','einfo.bio Value Sheet 18009 lote 0004'),
    ('TG','18010','0003','level_2','TRIGLICERIDOS','Glicerol fosfato oxidasa/peroxidasa','mg/dL',221.0,11.0,188.0,254.0,'SRM 909 (NIST)','einfo.bio Value Sheet 18010 lote 0003'),
    ('TG','18040','0003','level_1','TRIGLICERIDOS','Glicerol fosfato oxidasa/peroxidasa','mg/dL',147.0,7.0,125.0,169.0,'SRM 909 (NIST)','einfo.bio Value Sheet 18040 lote 0003'),
    ('TG','18041','0003','level_2','TRIGLICERIDOS','Glicerol fosfato oxidasa/peroxidasa','mg/dL',172.0,9.0,146.0,198.0,'SRM 909 (NIST)','einfo.bio Value Sheet 18041 lote 0003'),
    ('HDL_TOOS','18040','0003','level_1','COLESTEROL HDL','Directo TOOS','mg/dL',46.4,3.9,34.8,58.0,'CDC Reference Method, BMC','einfo.bio Value Sheet 18040 lote 0003'),
    ('HDL_TOOS','18041','0003','level_2','COLESTEROL HDL','Directo TOOS','mg/dL',20.4,1.7,15.3,25.5,'CDC Reference Method, BMC','einfo.bio Value Sheet 18041 lote 0003'),
    ('CK_MB','18024','0005985','level_1','CK-MB','Inmunoinhibición','U/L',41.5,3.4667,31.1,51.9,'ERM-AD455/IFCC','einfo.bio CoA 18024 lote 0005985'),
    ('HGB','18001','0006183','level_1','HEMOGLOBINA A1C','Directo','mmol/mol',38.0,2.6667,30.0,46.0,'IFCC','einfo.bio CoA 18001 lote 0006183'),
    ('HGB','18002','0006182','level_2','HEMOGLOBINA A1C','Directo','mmol/mol',84.0,5.6667,67.0,101.0,'IFCC','einfo.bio CoA 18002 lote 0006182')
), qc_json as (
  select reagent_id, jsonb_agg(
    jsonb_build_object(
      'id', reagent_id || '::' || product_code || '::' || lot || '::' || control_level || '::' || unit || '::' || method_name,
      'productCode', product_code, 'lot', lot, 'controlLevel', control_level,
      'analyteName', analyte_name, 'methodName', method_name, 'unit', unit,
      'targetValue', target_value, 'sd1', sd1,
      'sd1Low', round((target_value - sd1)::numeric, 4),
      'sd1High', round((target_value + sd1)::numeric, 4),
      'sd2Low', round((target_value - 2 * sd1)::numeric, 4),
      'sd2High', round((target_value + 2 * sd1)::numeric, 4),
      'rejectLow', reject_low, 'rejectHigh', reject_high,
      'traceability', traceability, 'matchConfidence', 'validated',
      'sourceStatus', 'validated', 'sourceType', 'manual', 'sourceReference', source_reference
    ) order by control_level, product_code
  ) as refs
  from qc_source
  group by reagent_id
)
update public.reagents r
set technical_profile = coalesce(r.technical_profile, '{}'::jsonb) || jsonb_build_object(
      'qc_reference', jsonb_build_object(
        'sourceStatus', 'validated', 'sourceType', 'manual',
        'sourceReference', 'einfo.bio synchronization 2026-07-20',
        'references', q.refs
      )
    ),
    updated_at = timezone('utc', now())
from qc_json q
where r.id = q.reagent_id;

-- Graph connections for the newly materialized DRI nodes.
insert into public.reagent_factor_links (
  reagent_id, factor_id, relation_type, weight, confidence, source_type,
  source_reference, source_label, note
)
values
  ('CK_MB','WL_340','usa_filtro_principal',1,'confirmed','ifu','einfo.bio IFU M21792-08','IFU CK-MB','Filtro principal 340 nm.'),
  ('CK_MB','RXTYPE_BIREACTIVA','tipo_reaccion',0.9,'confirmed','ifu','einfo.bio IFU M21792-08','IFU CK-MB','Prueba bireactiva.'),
  ('HGB','WL_670','usa_filtro_principal',1,'confirmed','ifu','einfo.bio IFU M22047-09','IFU HbA1c','Filtro principal 670 nm.'),
  ('HGB','RXTYPE_BIREACTIVA','tipo_reaccion',0.9,'confirmed','ifu','einfo.bio IFU M22047-09','IFU HbA1c','Prueba bireactiva turbidimétrica.'),
  ('HDL_TOOS','RXTYPE_BIREACTIVA','tipo_reaccion',0.9,'confirmed','ifu','einfo.bio IFU M21594-02','IFU HDL TOOS','Prueba bireactiva de punto final.')
on conflict (reagent_id, factor_id, relation_type) do update set
  weight = excluded.weight,
  confidence = excluded.confidence,
  source_type = excluded.source_type,
  source_reference = excluded.source_reference,
  source_label = excluded.source_label,
  note = excluded.note,
  updated_at = timezone('utc', now());

commit;
