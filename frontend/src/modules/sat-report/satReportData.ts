import { supabase } from '../../supabaseClient';
import type { SatPersistResult, SatQcResult, SatReportSummary } from './satReportTypes';

const SAT_BUCKET = 'sat-reports';
const chunk = <T,>(rows: T[], size = 250) => {
  const batches: T[][] = [];
  for (let index = 0; index < rows.length; index += size) batches.push(rows.slice(index, index + size));
  return batches;
};

const safePathSegment = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'sat-report';

const writeBatches = async (table: string, rows: Record<string, unknown>[]) => {
  for (const batch of chunk(rows)) {
    const { error } = await supabase.from(table).insert(batch);
    if (error) throw error;
  }
};

export const persistSatReport = async (
  file: File,
  summary: SatReportSummary,
  onProgress?: (message: string, percent: number) => void,
): Promise<SatPersistResult> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const sourceReference = `SAT ${summary.sha256}`;
  const storagePath = `${summary.equipmentModel}/${summary.serialNumber}/${summary.sha256.slice(0, 16)}-${safePathSegment(file.name)}`;
  const warnings: string[] = [];

  onProgress?.('Registrando importación y trazabilidad', 12);
  const importPayload = {
    file_name: summary.fileName,
    file_size: summary.fileSize,
    file_sha256: summary.sha256,
    storage_path: null,
    equipment_model: summary.equipmentModel,
    serial_number: summary.serialNumber,
    report_generated_at: summary.reportGeneratedAt,
    software_version: summary.softwareVersion,
    encrypted: summary.encrypted,
    processing_status: summary.coverage.hasDatabaseBackup ? 'partial' : 'processed',
    parser_version: summary.schemaVersion,
    findings: summary.findings,
    coverage: summary.coverage,
    normalized_payload: summary,
    created_by: user?.id ?? null,
    updated_at: new Date().toISOString(),
  };
  const importResponse = await supabase
    .from('sat_report_imports')
    .upsert(importPayload, { onConflict: 'file_sha256' })
    .select('id')
    .single();
  if (importResponse.error || !importResponse.data) {
    return {
      importId: null,
      storagePath: null,
      persisted: false,
      warning: `El SAT se procesó localmente, pero no pudo guardarse: ${importResponse.error?.message || 'tabla no disponible'}`,
    };
  }
  const importId = String(importResponse.data.id);

  onProgress?.('Guardando consumos para Monitoreo', 28);
  const consumptionRows = summary.consumption.map((row) => ({
    summary_key: row.summaryKey,
    bucket_month: row.bucketMonth,
    numero_serie: row.serialNumber,
    modelo: row.equipmentModel,
    test_name: row.testName,
    pipetting_count: row.pipettingCount,
    vr1_total_ul: row.vr1TotalUl,
    vr2_total_ul: row.vr2TotalUl,
    sample_volume_total_ul: row.sampleVolumeTotalUl,
    patient_count: row.patientCount,
    blank_count: row.blankCount,
    calib_count: row.calibrationCount,
    ctrl_count: row.controlCount,
    factory_test_count: row.factoryTestCount,
    non_factory_test_count: row.nonFactoryTestCount,
    first_event_at: row.firstEventAt,
    last_event_at: row.lastEventAt,
    source_basename: row.sourceFile,
    monitor_name: 'sat-report-importer',
    machine_name: 'manual-upload',
    updated_at: new Date().toISOString(),
  }));
  for (const batch of chunk(consumptionRows)) {
    const keys = batch.map((row) => row.summary_key);
    const existingResponse = await supabase
      .from('consumo_reactivos_hora')
      .select('summary_key,pipetting_count')
      .in('summary_key', keys);
    if (existingResponse.error) throw existingResponse.error;
    const existingCounts = new Map(
      (existingResponse.data || []).map((row) => [String(row.summary_key), Number(row.pipetting_count || 0)]),
    );
    const nonRegressiveRows = batch.filter(
      (row) => !existingCounts.has(row.summary_key) || row.pipetting_count >= (existingCounts.get(row.summary_key) || 0),
    );
    if (!nonRegressiveRows.length) continue;
    const { error } = await supabase
      .from('consumo_reactivos_hora')
      .upsert(nonRegressiveRows, { onConflict: 'summary_key' });
    if (error) throw error;
  }

  const rotorRows = summary.rotors.map((row) => ({
    summary_key: row.summaryKey,
    bucket_month: row.bucketMonth,
    numero_serie: row.serialNumber,
    modelo: row.equipmentModel,
    rotor_change_count: row.rotorChangeCount,
    first_change_at: row.firstChangeAt,
    last_change_at: row.lastChangeAt,
    change_timestamps: row.changeTimestamps,
    source_basename: row.sourceFile,
    monitor_name: 'sat-report-importer',
    machine_name: 'manual-upload',
    updated_at: new Date().toISOString(),
  }));
  for (const batch of chunk(rotorRows)) {
    const keys = batch.map((row) => row.summary_key);
    const existingResponse = await supabase
      .from('consumo_rotores_mensual')
      .select('summary_key,rotor_change_count')
      .in('summary_key', keys);
    if (existingResponse.error) throw existingResponse.error;
    const existingCounts = new Map(
      (existingResponse.data || []).map((row) => [String(row.summary_key), Number(row.rotor_change_count || 0)]),
    );
    const nonRegressiveRows = batch.filter(
      (row) => !existingCounts.has(row.summary_key) || row.rotor_change_count >= (existingCounts.get(row.summary_key) || 0),
    );
    if (!nonRegressiveRows.length) continue;
    const { error } = await supabase
      .from('consumo_rotores_mensual')
      .upsert(nonRegressiveRows, { onConflict: 'summary_key' });
    if (error) throw error;
  }

  onProgress?.('Indexando lotes y eventos diagnósticos', 48);
  const cleanupResults = await Promise.all([
    supabase.from('sat_report_events').delete().eq('import_id', importId),
    supabase.from('sat_report_lots').delete().eq('import_id', importId),
    supabase.from('qc_events').delete().eq('source_reference', sourceReference),
  ]);
  const cleanupError = cleanupResults.find((result) => result.error)?.error;
  if (cleanupError) throw cleanupError;

  await writeBatches(
    'sat_report_events',
    summary.events.map((event, index) => ({
      import_id: importId,
      event_index: index,
      category: event.category,
      occurred_at: event.occurredAt,
      error_code: event.code,
      message: event.message,
      source_file: event.sourceFile,
      raw_payload: event.raw,
    })),
  );
  await writeBatches(
    'sat_report_lots',
    summary.lots.map((lot) => ({
      import_id: importId,
      lot_kind: lot.kind,
      item_name: lot.name,
      lot_number: lot.lot,
      first_seen_at: lot.firstSeenAt,
      last_seen_at: lot.lastSeenAt,
      source_file: lot.sourceFile,
      tests: lot.tests,
    })),
  );

  const qcEvents = summary.events
    .filter((event) => event.category === 'qc' || event.category === 'calibration')
    .slice(-500)
    .map((event) => ({
      equipment_model: summary.equipmentModel,
      serial_number: summary.serialNumber,
      event_at: event.occurredAt || summary.reportGeneratedAt || new Date().toISOString(),
      event_type: event.category === 'qc' ? 'sat_qc_event' : 'sat_calibration_event',
      event_status: 'observed',
      alarm_code: event.code,
      observations: event.message,
      confidence: 'confirmed',
      source_type: 'ba400_export',
      source_reference: sourceReference,
      raw_payload: { importId, sourceFile: event.sourceFile, raw: event.raw },
      created_by: user?.id ?? null,
    }));
  if (qcEvents.length) await writeBatches('qc_events', qcEvents);

  onProgress?.('Conservando el SAT original cifrado', 72);
  const uploadResult = await supabase.storage.from(SAT_BUCKET).upload(storagePath, file, {
    contentType: 'application/octet-stream',
    upsert: true,
    cacheControl: '3600',
  });
  if (uploadResult.error) {
    warnings.push(`Los datos normalizados quedaron guardados, pero el archivo original no: ${uploadResult.error.message}`);
  } else {
    const { error } = await supabase
      .from('sat_report_imports')
      .update({ storage_path: storagePath, updated_at: new Date().toISOString() })
      .eq('id', importId);
    if (error) warnings.push(`El archivo se almacenó, pero no se pudo enlazar al registro: ${error.message}`);
  }

  onProgress?.('Importación lista para Monitoreo y DRI', 100);
  return {
    importId,
    storagePath: uploadResult.error ? null : storagePath,
    persisted: true,
    warning: warnings.join(' ') || null,
  };
};

export const loadLatestSatReport = async (): Promise<SatReportSummary | null> => {
  const { data, error } = await supabase
    .from('sat_report_imports')
    .select('normalized_payload')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.normalized_payload) return null;
  return data.normalized_payload as SatReportSummary;
};

const mapQcSnapshotRow = (row: Record<string, unknown>): SatQcResult => ({
  id: row.id ? String(row.id) : null,
  serialNumber: String(row.serial_number || ''),
  equipmentModel: String(row.equipment_model || 'BA400') as SatQcResult['equipmentModel'],
  testKey: String(row.test_key || ''),
  testId: row.test_id === null || row.test_id === undefined ? null : Number(row.test_id),
  testName: String(row.test_name || ''),
  testShortName: row.test_short_name ? String(row.test_short_name) : null,
  reagentId: row.reagent_id ? String(row.reagent_id) : null,
  controlId: row.control_id === null || row.control_id === undefined ? null : Number(row.control_id),
  controlName: row.control_name ? String(row.control_name) : null,
  controlLot: row.control_lot ? String(row.control_lot) : null,
  controlLevel: String(row.control_level || 'unknown') as SatQcResult['controlLevel'],
  resultValue: Number(row.result_value),
  resultAt: String(row.result_at),
  unit: row.unit ? String(row.unit) : null,
  analyzerMin: row.analyzer_min === null || row.analyzer_min === undefined ? null : Number(row.analyzer_min),
  analyzerMax: row.analyzer_max === null || row.analyzer_max === undefined ? null : Number(row.analyzer_max),
  analyzerTarget: row.analyzer_target === null || row.analyzer_target === undefined ? null : Number(row.analyzer_target),
  analyzerSd: row.analyzer_sd === null || row.analyzer_sd === undefined ? null : Number(row.analyzer_sd),
  analyzerValidationStatus: row.analyzer_validation_status ? String(row.analyzer_validation_status) : null,
  sourceType: String(row.source_type || 'sat_report') as SatQcResult['sourceType'],
  sourceImportId: row.source_import_id ? String(row.source_import_id) : null,
});

export const loadLatestEquipmentQc = async (serialNumber: string): Promise<SatQcResult[]> => {
  if (!serialNumber.trim()) return [];
  const { data, error } = await supabase
    .from('equipment_qc_latest')
    .select('*')
    .eq('serial_number', serialNumber.trim())
    .order('result_at', { ascending: false });
  if (error) return [];
  return (data || []).map((row) => mapQcSnapshotRow(row as Record<string, unknown>));
};
