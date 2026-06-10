import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seedFile = path.join(__dirname, '../frontend/src/modules/dri/driWorkbookSeed.generated.ts');
const seedContent = fs.readFileSync(seedFile, 'utf8');
const jsonString = seedContent.replace('export const DRI_WORKBOOK_SEED = ', '').replace(/as const\s*;\s*$/, '').replace(/;\s*$/, '');
const seed = JSON.parse(jsonString);

const sqlFilePath = path.join(__dirname, '../supabase/migrations/20260610050000_update_dri_catalog.sql');

function escapeSql(str) {
    if (str === null || str === undefined) return 'NULL';
    if (typeof str === 'number') return str;
    return "'" + str.toString().replace(/'/g, "''") + "'";
}

let sql = '-- Migration to sync reagents from DRI catalog\\n\\n';

seed.reagents.forEach(r => {
    sql += `INSERT INTO public.reagents (
    id, name, calibration_mode, read_mode, primary_wavelength_nm, 
    reference_wavelength_nm, reported_method, reagent_type, operational_note, 
    preliminary_risk, source_status, confidence, source_type, source_reference, metadata
) VALUES (
    ${escapeSql(r.id)}, ${escapeSql(r.name)}, ${escapeSql(r.calibrationMode)}, ${escapeSql(r.readMode)}, 
    ${escapeSql(r.primaryWavelengthNm)}, ${escapeSql(r.referenceWavelengthNm)}, ${escapeSql(r.reportedMethod)}, 
    ${escapeSql(r.reagentType)}, ${escapeSql(r.operationalNote)}, ${escapeSql(r.preliminaryRisk)}, 
    ${escapeSql(r.sourceStatus)}, ${escapeSql(r.confidence)}, ${escapeSql(r.sourceType)}, ${escapeSql(r.sourceReference)}, 
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
    source_reference = EXCLUDED.source_reference;\n\n`;
});

fs.writeFileSync(sqlFilePath, sql, 'utf8');
console.log('Migration SQL generated at:', sqlFilePath);
