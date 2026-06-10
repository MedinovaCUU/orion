-- Migration to sync reagents from DRI catalog\n\nINSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'ADA', 'ADA', 'Lineal', 'Mono', 
    340, NULL, 'Cinética monoreactiva', 
    'Monoreactiva', 'Enzimático/cinético; revisar estabilidad por IFU', 'Medio', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · ADA', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'ACP', 'Acid Phosphatase ACP', 'Lineal', 'Mono', 
    405, NULL, 'Cinética monoreactiva', 
    'Monoreactiva', 'Archivo indica nota de uso/validación; requiere revisión técnica', 'Alto', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · ACP', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'ALT_GPT', 'ALT/GPT', 'Lineal', 'Mono', 
    340, NULL, 'BA: cinética bireactiva; A15/A25: cinética monoreactiva', 
    'Variable por plataforma', 'Reacción decreciente; blanco inicial crítico según IFU', 'Alto', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · ALT_GPT', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'ALB', 'Albumin', 'Lineal', 'Bicro', 
    635, 670, 'Punto final monoreactiva', 
    'Monoreactiva', 'Grupo óptico 635/670', 'Bajo', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 12547_A-15-A-25_ALBUMINA.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'MALB_U', 'Microalbumin urine', 'Lineal', 'Mono', 
    535, NULL, 'Tiempo fijo; configuración cambia por lote', 
    'Variable por lote', 'Cambio lote/configuración; requiere control de versión', 'Alto', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · MALB_U', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'ALP_AMP', 'ALP-AMP', 'Lineal', 'Bicro', 
    405, NULL, 'Cinética bireactiva', 
    'Bireactiva', 'Enzimático/cinético', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 21592_BA-200-400_ALP-AMP.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'ALP_DEA', 'ALP-DEA', 'Lineal', 'Mono', 
    405, NULL, 'Cinética bireactiva', 
    'Bireactiva', 'Comparte filtro con ALP-AMP, diferente esquema reactivo', 'Medio', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · ALP_DEA', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'AMY', 'Alpha-amylase direct', 'Lineal', 'Mono', 
    405, NULL, 'Cinética monoreactiva', 
    'Monoreactiva', 'Enzimático/cinético', 'Medio', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · AMY', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'AGLU', 'Alpha-glucosidase', 'Lineal', 'Mono', 
    505, NULL, 'Cinética bireactiva', 
    'Bireactiva', 'Enzimático/cinético', 'Medio', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · AGLU', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'NH3', 'Ammonia', 'Lineal', 'Mono', 
    340, NULL, 'Diferencial bireactiva', 
    'Bireactiva', 'Grupo 340 nm', 'Medio', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · NH3', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'ACE', 'ACE', 'Lineal', 'Mono', 
    340, NULL, 'Cinética monoreactiva', 
    'Monoreactiva', 'Enzimático/cinético', 'Medio', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · ACE', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'AST_GOT', 'AST/GOT', 'Lineal', 'Mono', 
    340, NULL, 'BA: cinética bireactiva; A15/A25: cinética monoreactiva', 
    'Variable por plataforma', 'Reacción decreciente; blanco inicial crítico según IFU', 'Alto', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · AST_GOT', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'BIL_D', 'Bilirubin Direct DPD', 'Lineal', 'Bicro', 
    535, 670, 'Diferencial bireactiva', 
    'Bireactiva', 'Relacionada con Bilirrubina Total', 'Medio', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · BIL_D', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'BIL_T', 'Bilirubin Total DPD', 'Lineal', 'Bicro', 
    535, 670, 'Diferencial bireactiva', 
    'Bireactiva', 'Relacionada con Bilirrubina Directa', 'Medio', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · BIL_T', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'CRP', 'CRP', 'Lineal', 'Variable', 
    535, 670, 'BA: diferencial bireactiva; A15/A25: punto final monoreactivo', 
    'Variable por plataforma', 'Cambia comportamiento según plataforma', 'Alto', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · CRP', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'CA_ARS', 'Calcium Arsenazo', 'Lineal', 'Mono', 
    635, NULL, 'Punto final monoreactivo', 
    'Monoreactiva', 'Sensible a calidad del agua', 'Alto', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · CA_ARS', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'CA_CPC', 'Calcium Cresolphthalein', 'Lineal', 'Mono', 
    560, NULL, 'Diferencial bireactiva', 
    'Bireactiva', 'Sensible a calidad del agua', 'Alto', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · CA_CPC', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'CER', 'Ceruloplasmin', 'No lineal', 'Bicro', 
    340, 670, 'Diferencial bireactiva', 
    'Bireactiva', 'Calibración no lineal/multipunto', 'Alto', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · CER', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'CHOL', 'Cholesterol', 'Lineal', 'Bicro', 
    505, 670, 'Punto final monoreactivo', 
    'Monoreactiva', 'Grupo 505/670 endpoint', 'Bajo', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · CHOL', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'CK', 'Creatine Kinase CK', 'Lineal', 'Mono', 
    340, NULL, 'Cinética bireactiva', 
    'Bireactiva', 'Enzimático/cinético; grupo 340 nm', 'Alto', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · CK', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'CREA_ENZ', 'Creatinine Enzymatic', 'Lineal', 'Mono', 
    535, NULL, 'Diferencial bireactiva', 
    'Bireactiva', 'Nodo 535 diferencial', 'Medio', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · CREA_ENZ', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'CREA_JAFFE', 'Creatinine Jaffe', 'Lineal', 'Mono', 
    535, NULL, 'Diferencial bireactiva', 
    'Bireactiva', 'Nodo 535 diferencial', 'Medio', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · CREA_JAFFE', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'FRUCT', 'Fructosamine', 'Lineal', 'Mono', 
    535, NULL, 'Tiempo fijo monoreactivo', 
    'Monoreactiva', 'Nota de validación; dependencia con albúmina sérica', 'Alto', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · FRUCT', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'GGT', 'GGT', 'Lineal', 'Bicro', 
    405, NULL, 'Cinética bireactiva', 
    'Bireactiva', 'Enzimático/cinético', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 21520_BA-200-400_GAMMA_GLUTAMIL_TRANSFERASA_GGT.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'GLU', 'Glucose', 'Lineal', 'Bicro', 
    505, 670, 'Punto final monoreactivo', 
    'Monoreactiva', 'Grupo 505/670 endpoint', 'Bajo', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · GLU', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'G6PDH', 'G6PDH', 'Lineal', 'Mono', 
    340, NULL, 'Cinética bireactiva', 
    'Bireactiva', 'Enzimático/cinético; grupo 340 nm', 'Alto', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · G6PDH', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'GLU_HK', 'Glucose-Hexokinase', 'Lineal', 'Mono', 
    340, NULL, 'Diferencial bireactiva', 
    'Bireactiva', 'Grupo 340 nm', 'Medio', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · GLU_HK', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'HAPTO', 'Haptoglobin', 'No lineal', 'Bicro', 
    340, 670, 'Diferencial bireactiva', 
    'Bireactiva', 'Calibración no lineal/multipunto', 'Alto', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · HAPTO', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'HCY', 'Homocysteine', 'No lineal', 'Mono', 
    340, NULL, 'Punto final bireactivo', 
    'Bireactiva', 'Calibración no lineal/multipunto', 'Alto', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · HCY', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'MG', 'Magnesium', 'Lineal', 'Mono', 
    505, NULL, 'Punto final bireactivo', 
    'Bireactiva', 'Sensible a calidad del agua', 'Alto', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · MG', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'OX', 'Oxalate', 'Lineal', 'Mono', 
    600, NULL, 'Diferencial bireactiva', 
    'Bireactiva', 'Muestra crítica: pH/HCl/estabilidad', 'Alto', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · OX', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'PHOS', 'Phosphorous', 'Lineal', 'Mono', 
    340, NULL, 'Diferencial bireactiva', 
    'Bireactiva', 'Sensible a calidad del agua', 'Alto', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · PHOS', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'PROT_U', 'Protein Urine', 'Lineal', 'Bicro', 
    600, 670, 'Punto final monoreactivo', 
    'Monoreactiva', 'Grupo 600/670', 'Medio', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · PROT_U', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'TG', 'Triglycerides', 'Lineal', 'Bicro', 
    505, 670, 'Punto final monoreactivo', 
    'Monoreactiva', 'Grupo 505/670 endpoint', 'Bajo', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · TG', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'TBA', 'Total Bile Acids', 'Lineal', 'Mono', 
    405, NULL, 'Tiempo fijo bireactivo', 
    'Bireactiva', 'Lecturas después de R2', 'Medio', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · TBA', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'UREA_COLOR', 'Urea BUN-Color', 'Lineal', 'Mono', 
    600, NULL, 'Punto final bireactivo', 
    'Bireactiva', 'Preparación working reagent; revisar validación', 'Alto', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · UREA_COLOR', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'UREA_UV', 'Urea BUN-UV', 'Lineal', 'Mono', 
    340, NULL, 'A15/A25: tiempo fijo monoreactivo; BA: tiempo fijo bireactivo', 
    'Variable por plataforma', 'Cambia según plataforma', 'Alto', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · UREA_UV', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'URIC', 'Uric Acid', 'Lineal', 'Bicro', 
    505, 670, 'Punto final monoreactivo', 
    'Monoreactiva', 'Grupo 505/670 endpoint', 'Bajo', 
    'Pendiente IFU/programación', 'pending', 'manual', 'Workbook DRI · DRI_tablas_revision_reactivos_biosystems.xlsx · 01_Reactivos_Base · URIC', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'PROTEINAS_', 'PROTEINAS TOTALES', 'Lineal', 'Bicro', 
    535, 670, 'Punto final monoreactiva', 
    'Monoreactiva', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 12500_A-15-A-25_PROTEINAS_TOTALES.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'CREATININA', 'CREATININA', 'Lineal', 'Bicro', 
    340, NULL, 'Cinética bireactiva', 
    'Bireactiva', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 21790_BA-200-400_CREATININA_KINASA_CK.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'GLUCOSA', 'GLUCOSA', 'Lineal', 'Bicro', 
    505, 670, 'Punto final monoreactiva', 
    'Monoreactiva', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 12503_A-15-A-25_GLUCOSA.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'HIERRO_FER', 'HIERRO FERROCINA', 'Lineal', 'Bicro', 
    560, NULL, 'Diferencial bireactiva', 
    'Bireactiva', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 12509_A-15-A-25_HIERRO_FERROCINA.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'ACIDO_URIC', 'ACIDO URICO', 'Lineal', 'Bicro', 
    505, 670, 'Punto final monoreactiva', 
    'Monoreactiva', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 21521_BA-200-400_ACIDO_URICO.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'TRIGLICERI', 'TRIGLICERIDOS', 'Lineal', 'Bicro', 
    505, 670, 'Punto final monoreactiva', 
    'Monoreactiva', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 21528_BA-200-400_TRIGLICERIDOS.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'ASPARTATO_', 'ASPARTATO AMINOTRANSFERASA AST', 'Lineal', 'Bicro', 
    340, NULL, 'Cinética monoreactiva', 
    'Monoreactiva', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 12531_A-15-A-25_ASPARTATO_AMINOTRANSFERASA_AST.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'ALANINO_AM', 'ALANINO AMINOTRANSFERASA ALT', 'Lineal', 'Bicro', 
    340, NULL, 'Cinética monoreactiva', 
    'Monoreactiva', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 12533_A-15-A-25_ALANINO_AMINOTRANSFERASA_ALT.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'CALCIO_ARS', 'CALCIO ARSENAZO', 'Lineal', 'Bicro', 
    635, NULL, 'Punto final monoreactiva', 
    'Monoreactiva', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 21570_BA-200-400_CALCIO_ARSENAZO.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'LACTATO_DE', 'LACTATO DESHIDROGENASA LDH', 'Lineal', 'Bicro', 
    340, NULL, 'Cinética bireactiva', 
    'Bireactiva', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 21580_BA-200-400_LACTATO_DESHIDROGENASA_LDH.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'MAGNESIO_X', 'MAGNESIO XYLIDIL', 'Lineal', 'Bicro', 
    505, NULL, 'Punto final monoreactiva', 
    'Monoreactiva', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 12797_A-15-A-25_MAGNESIO_XYLIDIL.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'PROTEINA_C', 'PROTEINA C REACTIVA PCR', 'Lineal', 'Bicro', 
    NULL, NULL, 'Punto final', 
    'Variable', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 13921_A-15-A-25_PROTEINA_C_REACTIVA_PCR.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'FACTOR_REU', 'FACTOR REUMATOIDE FR', 'Lineal', 'Mono', 
    NULL, NULL, 'Diferencial', 
    'Variable', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 13922_A-15-A-25_FACTOR_REUMATOIDE_FR.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'ANTI_ESTRE', 'ANTI ESTREPTOLISINA ASO', 'Lineal', 'Bicro', 
    NULL, NULL, 'Punto final', 
    'Variable', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 13923_A-15-A-25_ANTI_ESTREPTOLISINA_ASO.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'BILIRRUBIN', 'BILIRRUBINA DIRECTA BIL-D', 'Lineal', 'Bicro', 
    535, 670, 'Diferencial bireactiva', 
    'Bireactiva', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 21504_BA-200-400_BILIRRUBINA_DIRECTA_BIL-D.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'COLESTEROL', 'COLESTEROL', 'Lineal', 'Bicro', 
    505, 670, 'Punto final monoreactiva', 
    'Monoreactiva', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 21505_BA-200-400_COLESTEROL.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'BILIRRUBIN', 'BILIRRUBINA TOTAL BIL-T', 'Lineal', 'Bicro', 
    535, 670, 'Diferencial bireactiva', 
    'Bireactiva', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 21506_BA-200-400_BILIRRUBINA_TOTAL_BIL-T.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'HIERRO_FER', 'HIERRO FERROZINA', 'Lineal', 'Bicro', 
    560, NULL, 'Diferencial bireactiva', 
    'Bireactiva', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 21509_BA-200-400_HIERRO_FERROZINA.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'PROTEINA_T', 'PROTEINA TOTAL', 'Lineal', 'Bicro', 
    535, NULL, 'Diferencial bireactiva', 
    'Bireactiva', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 21513_BA-200-400_PROTEINA_TOTAL.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'UREA_UV', 'UREA UV', 'Lineal', 'Bicro', 
    340, NULL, 'Tiempo fijo bireactiva', 
    'Bireactiva', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 21516_BA-200-400_UREA_UV.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'FOSFORO', 'FOSFORO', 'Lineal', 'Bicro', 
    340, NULL, 'Diferencial bireactiva', 
    'Bireactiva', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 21518_BA-200-400_FOSFORO.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'ASPARTATO_', 'ASPARTATO AMINOTRANSFERASA TGO AST', 'Lineal', 'Bicro', 
    340, NULL, 'Cinética bireactiva', 
    'Bireactiva', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 21531_BA-200-400_ASPARTATO_AMINOTRANSFERASA_TGO_AST.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'ALANINA_AM', 'ALANINA AMINOTRANSFERASA TGP-ALT', 'Lineal', 'Bicro', 
    340, NULL, 'Cinética bireactiva', 
    'Bireactiva', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 21533_BA-200-400_ALANINA_AMINOTRANSFERASA_TGP-ALT.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'LIPASA', 'LIPASA', 'Lineal', 'Bicro', 
    560, NULL, 'Cinética bireactiva', 
    'Bireactiva', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 21760_BA-200-400_LIPASA.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    'HEMOGLOBIN', 'HEMOGLOBINA A1C DIRECTA', 'Lineal', 'Bicro', 
    670, NULL, 'Tiempo fijo bireactiva', 
    'Bireactiva', 'Añadido desde archivo PDF', 'Medio', 
    'IFU Analizado (Automático)', 'inferred', 'manual', 'IFU: 22147_BA-200-400_HEMOGLOBINA_A1C_DIRECTA.pdf', 
    '{}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    calibration_mode = EXCLUDED.calibration_mode,
    read_mode = EXCLUDED.read_mode,
    primary_wavelength_nm = EXCLUDED.primary_wavelength_nm,
    reference_wavelength_nm = EXCLUDED.reference_wavelength_nm,
    reported_method = EXCLUDED.reported_method,
    reagent_type = EXCLUDED.reagent_type,
    operational_note = EXCLUDED.operational_note,
    preliminary_risk = EXCLUDED.preliminary_risk,
    source_status = EXCLUDED.source_status,
    confidence = EXCLUDED.confidence,
    source_type = EXCLUDED.source_type,
    source_reference = EXCLUDED.source_reference;

