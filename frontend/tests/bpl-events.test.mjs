import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

// Valida la lectura tolerante de ba400_bpl_events, el resumen por serie y su proyección sobre DRI.
const vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
try {
  const bpl = await vite.ssrLoadModule('/src/modules/equipment-monitoring/bplEvents.ts');
  const evidence = await vite.ssrLoadModule('/src/modules/dri/utils/bplEvidence.ts');
  const classifier = await vite.ssrLoadModule('/src/modules/dri/utils/satQcClassifier.ts');
  const engine = await vite.ssrLoadModule('/src/modules/dri/engine/differentialDiagnosisEngine.ts');
  const { getLocalDriCatalog } = await vite.ssrLoadModule('/src/modules/dri/driData.ts');

  const serial = '834001902';
  const at = (day, hour) => `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`;
  const row = (overrides) => ({ effective_equipment_serial: serial, detected_at: at(9, 12), bpl_status: 'evidence_observed', ...overrides });
  const rows = [
    row({ id: 1, occurred_at: at(1, 8), event_type: 'bpl_consumption_record', bpl_stage: 'calibration', test_name: 'GLUCOSE', sample_class: 'CALIB', calibration_control_name: 'CAL BIO', calibration_control_lot_number: 'C-77', payload: { reagent_volume_1: 240, reagent_volume_2: 0, reagent_barcode_1: 'RB-GLU-01', sample_volume: 3, raw_record: 'x' } }),
    row({ id: 2, occurred_at: at(1, 9), event_type: 'bpl_calibration_curve', bpl_stage: 'calibration', bpl_status: 'accepted', diagnostic_status: 'calibration_accepted', test_name: 'GLUCOSE', sample_class: 'CALIB', calibration_control_name: 'CAL BIO', calibration_control_lot_number: 'C-77', payload: { calibration_curve: { points: [{ curve_point: 1, abs_value: 0.01, conc_value: 0 }, { curve_point: 2, abs_value: 0.52, conc_value: 100 }], curve_type: 'LINEAR', slope: 1.02, offset: 0.001, correlation: 0.9995, relative_error: 1.2 } } }),
    row({ id: 3, occurred_at: at(1, 9), event_type: 'bpl_analytical_result', bpl_stage: 'reagent_blank', bpl_status: 'accepted', diagnostic_status: 'blank_accepted', test_name: 'GLUCOSE', sample_class: 'BLANK', payload: { ABSValue: 0.012, BlankAbsorbanceLimit: 0.1, AlarmList: '' } }),
    row({ id: 4, occurred_at: at(2, 9), event_type: 'bpl_quality_control_result', bpl_stage: 'quality_control', bpl_status: 'accepted', diagnostic_status: 'quality_control_accepted', test_name: 'GLUCOSE', sample_class: 'CTRL', calibration_control_name: 'CONTROL LEVEL I', calibration_control_lot_number: 'L-10', payload: { result_value: 101, limits: { min: 80, max: 120, target: 100, sd: 5 } } }),
    row({ id: 5, occurred_at: at(3, 9), event_type: 'bpl_quality_control_result', bpl_stage: 'quality_control', bpl_status: 'rejected', diagnostic_status: 'quality_control_rejected', test_name: 'GLUCOSE', sample_class: 'CTRL', calibration_control_name: 'CONTROL LEVEL I', calibration_control_lot_number: 'L-10', rule_ids: ['qc_out_of_limits'], payload: { ResultValue: '140', unit: 'mg/dL', control_limits: { MinConcentration: 80, MaxConcentration: 120, TargetMean: 100, TargetSD: 5 }, alarms: ['QC_OUT'], westgard_assessment: { status: 'reject', violated_rules: ['1_3s', '2_2s'] } } }),
    row({ id: 6, occurred_at: at(3, 10), event_type: 'bpl_consumption_record', bpl_stage: 'quality_control', test_name: 'GLUCOSE', sample_class: 'CTRL', calibration_control_name: 'CONTROL LEVEL I', calibration_control_lot_number: 'L-10', payload: { reagent_volume_1: 240, reagent_barcode_1: 'RB-GLU-01', sample_volume: 3 } }),
    row({ id: 7, occurred_at: at(2, 11), event_type: 'bpl_quality_control_result', bpl_stage: 'quality_control', bpl_status: 'accepted', test_name: 'ALT-GPT', sample_class: 'CTRL', calibration_control_name: 'CONTROL LEVEL II', calibration_control_lot_number: 'L-11', payload: { result_value: 42, min_concentration: 30, max_concentration: 50, target_mean: 40, target_sd: 3, westgard_rules: [] } }),
    row({ id: 8, occurred_at: at(2, 10), event_type: 'bpl_calibration_curve', bpl_stage: 'calibration', bpl_status: 'accepted', test_name: 'ALT-GPT', sample_class: 'CALIB', payload: { slope: 0.98, correlation: 0.999 } }),
    row({ id: 9, occurred_at: at(2, 10), event_type: 'bpl_analytical_result', bpl_stage: 'reagent_blank', bpl_status: 'accepted', test_name: 'ALT-GPT', sample_class: 'BLANK', payload: { abs: 0.02, limit: 0.3 } }),
    row({ id: 10, occurred_at: at(1, 7), event_type: 'bpl_photometry_blank', bpl_stage: 'instrument_photometry_blank', bpl_status: 'accepted', diagnostic_status: 'photometry_blank_accepted', test_name: null, payload: { '340': 0.001, '405': 0.002, source_file: 'BLResults.res' } }),
    row({ id: 11, occurred_at: at(4, 9), event_type: 'bpl_calibration_curve', bpl_stage: 'calibration', bpl_status: 'rejected', diagnostic_status: 'calibration_rejected', test_name: 'ALBUMIN-MAU', sample_class: 'CALIB', calibration_control_name: 'CAL MAU', calibration_control_lot_number: 'C-90', payload: { calibration_curve: { correlation: 0.95, relative_error: 9.5, points: [[0.1, 0], [0.2, 10], [0.25, 20]] } } }),
    row({ id: 12, occurred_at: at(4, 10), event_type: 'bpl_quality_control_result', bpl_stage: 'quality_control', bpl_status: 'pending', diagnostic_status: 'quality_control_pending', test_name: 'CHOLESTEROL', sample_class: 'CTRL', missing_data_for_acceptance: '["control_lot"]', payload: { result_value: 180 } }),
    { effective_equipment_serial: '', occurred_at: at(4, 10), event_type: 'bpl_analytical_result' },
  ];

  const events = rows.map(bpl.normalizeBplEvent).filter(Boolean);
  assert.equal(events.length, 12, 'filas sin serie se descartan');
  const glucoseQc = events.find((event) => event.id === '5');
  assert.equal(glucoseQc.stage, 'quality_control');
  assert.equal(glucoseQc.status, 'rejected');
  assert.equal(glucoseQc.qc.resultValue, 140);
  assert.equal(glucoseQc.qc.minLimit, 80);
  assert.equal(glucoseQc.qc.maxLimit, 120);
  assert.equal(glucoseQc.qc.targetMean, 100);
  assert.equal(glucoseQc.qc.zScore, 8);
  assert.equal(glucoseQc.qc.withinLimits, false);
  assert.equal(glucoseQc.qc.direction, 'high');
  assert.equal(glucoseQc.qc.controlLevel, 'level_1');
  assert.deepEqual(glucoseQc.qc.westgardRules, ['1_3s', '2_2s']);
  assert.equal(glucoseQc.qc.westgardAssessment, 'reject');
  assert.deepEqual(glucoseQc.qc.alarms, ['QC_OUT']);
  assert.deepEqual(glucoseQc.ruleIds, ['qc_out_of_limits']);
  const altQc = events.find((event) => event.id === '7');
  assert.equal(altQc.qc.controlLevel, 'level_2');
  assert.equal(altQc.qc.zScore, 0.67);
  const glucoseCal = events.find((event) => event.id === '2');
  assert.equal(glucoseCal.calibration.points.length, 2);
  assert.equal(glucoseCal.calibration.correlation, 0.9995);
  assert.equal(glucoseCal.calibration.curveType, 'LINEAR');
  const mauCal = events.find((event) => event.id === '11');
  assert.equal(mauCal.calibration.points.length, 3);
  assert.equal(mauCal.calibration.points[2].concentration, 20);
  const glucoseBlank = events.find((event) => event.id === '3');
  assert.equal(glucoseBlank.blank.absorbance, 0.012);
  assert.equal(glucoseBlank.blank.absorbanceLimit, 0.1);
  assert.equal(glucoseBlank.blank.withinLimit, true);
  const photometry = events.find((event) => event.id === '10');
  assert.equal(photometry.stage, 'instrument_photometry_blank');
  assert.equal(photometry.testKey, 'INSTRUMENTO');
  assert.equal(photometry.blank.readings.length, 2);
  const consumption = events.find((event) => event.id === '1');
  assert.equal(consumption.consumption.reagentBarcode1, 'RB-GLU-01');
  assert.equal(consumption.consumption.reagentVolume1, 240);
  assert.deepEqual(events.find((event) => event.id === '12').missingData, ['control_lot']);
  assert.equal(bpl.formatBplDiagnosticStatus('quality_control_rejected'), 'Control de calidad rechazado');
  assert.equal(bpl.formatBplDiagnosticStatus('blank_accepted'), 'Blanco aceptado');
  assert.equal(bpl.formatBplDiagnosticStatus('calibration_pending'), 'Calibración pendiente');
  assert.match(bpl.summarizeBplEventMetrics(glucoseQc).join(' | '), /Resultado 140 mg\/dL.*Límites 80 a 120.*Z 8.*Westgard 1_3s, 2_2s/);

  const summary = bpl.buildBplSerialSummary(serial, events);
  assert.equal(summary.tone, 'rejected');
  assert.equal(summary.events[0].id, '12', 'ordenado del más reciente al más antiguo');
  assert.deepEqual(summary.rejectedTests, ['ALBUMIN-MAU', 'GLUCOSE']);
  assert.deepEqual(summary.pendingTests, ['CHOLESTEROL']);
  assert.deepEqual(summary.acceptedTests, ['ALT-GPT', 'INSTRUMENTO']);
  const glucose = summary.tests.find((test) => test.testKey === 'GLUCOSE');
  assert.equal(glucose.effectiveStatus, 'rejected');
  assert.equal(glucose.stages.quality_control.effectiveStatus, 'rejected', 'el consumo posterior no borra la evaluación');
  assert.equal(glucose.stages.quality_control.hasUnevaluatedNewer, true);
  assert.equal(glucose.stages.calibration.effectiveStatus, 'accepted');
  assert.equal(glucose.stages.reagent_blank.effectiveStatus, 'accepted');
  assert.equal(glucose.chainAccepted, false);
  assert.equal(glucose.statusFlips, 1);
  assert.equal(glucose.calibratorLot, 'C-77');
  assert.equal(glucose.controlLot, 'L-10');
  assert.deepEqual(glucose.reagentBarcodes, ['RB-GLU-01']);
  const alt = summary.tests.find((test) => test.testKey === 'ALT-GPT');
  assert.equal(alt.chainAccepted, true);
  assert.equal(summary.stages.quality_control.testsRejected, 1);
  assert.equal(summary.stages.quality_control.testsPending, 1);
  assert.equal(summary.stages.calibration.testsRejected, 1);
  assert.equal(summary.stages.instrument_photometry_blank.testsAccepted, 1);
  assert.equal(summary.counts.consumption, 2);
  assert.deepEqual(summary.missingData, ['control_lot']);
  assert.equal(summary.calibrators[0].lot, 'C-90');
  assert.equal(summary.reagentBarcodes[0].barcode, 'RB-GLU-01');
  const index = bpl.buildBplSerialIndex(rows.map(({ payload, ...rest }) => rest));
  assert.equal(index.get(serial).tone, 'rejected');
  assert.equal(index.get(serial).hasPayload, false);
  assert.equal(bpl.buildBplSerialSummary(serial, []).tone, 'none');

  const catalog = getLocalDriCatalog();
  const { getReagentDisplayCode } = await vite.ssrLoadModule('/src/modules/dri/knowledge/reagentIdentity.ts');
  // Se compara el código visible porque el seed local y el contexto documental pueden exponer ids distintos.
  for (const [name, expected] of [['GLUCOSE', 'GLU'], ['ALT-GPT', 'ALT'], ['ALBUMIN-MAU', 'MALB'], ['CALCIUM-ARS', 'CA ARS'], ['TOTAL PROTEIN', 'PROT T'], ['CHOLESTEROL', 'CHOL'], ['UREA-UV', 'UREA UV'], ['BILIRUBIN-D', 'BIL D']]) {
    const reagent = classifier.resolveReagentForTest(catalog, { testName: name });
    assert.equal(reagent ? getReagentDisplayCode(reagent) : null, expected, name);
  }
  assert.equal(classifier.resolveReagentForTest(catalog, { testName: 'PRUEBA INEXISTENTE' }), null);

  const projection = evidence.buildDriBplProjection(summary, catalog);
  assert.deepEqual([...projection.failedReagentIds].sort(), ['GLU', 'MALB_U']);
  assert.deepEqual(projection.correctReagentIds, ['ALT_GPT']);
  assert.equal(projection.suggestedEventType, 'control_high');
  assert.equal(projection.suggestedFailureDirection, 'high');
  assert.equal(projection.controlLot, 'L-10');
  assert.equal(projection.controlLevel, 'level_1');
  assert.equal(projection.calibratorLot, 'C-90');
  assert.equal(projection.reagentLot, 'RB-GLU-01');
  assert.equal(projection.eventDate, '2026-10-04');
  assert.deepEqual(projection.evidence.qcRejectedWithAcceptedChain, ['GLUCOSE']);
  assert.deepEqual(projection.evidence.westgardRules, ['1_3s', '2_2s']);
  assert.deepEqual(projection.evidence.fullyAcceptedTests, ['ALT-GPT']);
  assert.equal(projection.evidence.stages.photometryBlank.effectiveStatus, 'accepted');
  assert.equal(projection.evidence.stages.calibration.rejectedTests[0], 'ALBUMIN-MAU');
  assert.equal(projection.reagentMeasurements.GLU.obtainedValue, '140');
  assert.equal(projection.reagentMeasurements.GLU.source, 'auto_import');
  assert.equal(projection.reagentMeasurements.GLU.qcBand, 'out_of_reject');
  assert.equal(projection.reagentMeasurements.GLU.blankAbsorbance, '0.012');
  assert.equal(projection.signalPatch.normalCurvesObserved, undefined);
  assert.match(projection.observationBlock, /^\[BPL:834001902\] Evidencia del monitor BA400 · 12 eventos/);
  assert.match(projection.observationBlock, /GLUCOSE: QC rechazada/);
  assert.equal(projection.evidenceItem.type, 'report');

  const baseForm = {
    equipmentModel: 'BA200', serialNumber: '', eventDate: '2026-01-01', eventType: 'qc_out_of_range', failureDirection: 'low',
    reagentLot: '', controlLot: 'MANUAL', calibratorLot: '', calibratorName: '', controlLevel: 'both', selectedQcReferenceId: '',
    expectedValue: '', obtainedValue: '', reagentExpiryDate: '', reagentOpenedAt: '', ambientTemperatureC: '', observations: 'Nota previa.\n\n[BPL:OLD] viejo',
    failedReagentIds: ['ADA'], correctReagentIds: ['GLU'], reagentMeasurements: {}, serviceTests: [], evidenceItems: [],
    signals: { intermittentPattern: false, normalCurvesObserved: false, opticalRejectObserved: false, waterSensitivePattern: false },
  };
  const form = evidence.applyBplProjectionToForm(baseForm, projection);
  assert.equal(form.equipmentModel, 'BA400');
  assert.equal(form.serialNumber, serial);
  assert.equal(form.controlLot, 'MANUAL', 'no pisa capturas manuales');
  assert.equal(form.calibratorLot, 'C-90');
  assert.equal(form.eventType, 'control_high');
  assert.deepEqual(form.correctReagentIds, ['ALT_GPT']);
  assert.equal(form.observations.includes('[BPL:OLD]'), false);
  assert.match(form.observations, /^Nota previa\.\n\n\[BPL:834001902\]/);
  assert.equal(form.evidenceItems.length, 1);
  assert.equal(form.bplEvidence.serial, serial);
  const twice = evidence.applyBplProjectionToForm(form, projection);
  assert.equal(twice.evidenceItems.length, 1, 'reaplicar no duplica la evidencia');

  const result = engine.runDifferentialDiagnosisEngine(form, catalog);
  const control = result.hypotheses.find((hypothesis) => hypothesis.matchedRuleIds.includes('ba400_control_preanalytical'));
  assert(control, 'hipótesis de control presente');
  assert(control.evidenceFor.some((line) => line.includes('QC rechazado con blanco y calibración aceptados en GLUCOSE')));
  assert(control.evidenceFor.some((line) => line.includes('Reglas Westgard sistemáticas (2_2s)')));
  const fluidics = result.hypotheses.find((hypothesis) => hypothesis.matchedRuleIds.includes('ba400_fluidics_pipetting'));
  assert(fluidics.evidenceFor.some((line) => line.includes('error aleatorio (1_3s)')));
  const optical = result.hypotheses.find((hypothesis) => hypothesis.matchedRuleIds.includes('ba400_optical_photometry'));
  assert(!optical || optical.evidenceAgainst.some((line) => line.includes('blanco fotométrico instrumental está aceptado')));
  assert(result.evidenceRows.some((row) => row.id === 'bpl:qc' && row.score === 88));
  assert(result.evidenceRows.some((row) => row.id === 'bpl:westgard'));
  assert(result.logs.some((log) => log.step === 'bpl-evidence'));
  assert(!result.missingEvidence.some((item) => item.includes('Evidencia BPL')));

  const withoutBpl = engine.runDifferentialDiagnosisEngine({ ...baseForm, equipmentModel: 'BA400', failedReagentIds: ['ALB', 'TG'], correctReagentIds: ['ADA'] }, catalog);
  assert(withoutBpl.missingEvidence.some((item) => item.includes('Evidencia BPL del monitor')));

  const photometryRejected = bpl.buildBplSerialSummary(serial, events.map((event) => (event.id === '10' ? { ...event, status: 'rejected' } : event)));
  const opticalProjection = evidence.buildDriBplProjection(photometryRejected, catalog);
  assert.equal(opticalProjection.signalPatch.opticalRejectObserved, true);
  const opticalForm = evidence.applyBplProjectionToForm(baseForm, opticalProjection);
  const opticalResult = engine.runDifferentialDiagnosisEngine(opticalForm, catalog);
  const opticalHypothesis = opticalResult.hypotheses.find((hypothesis) => hypothesis.matchedRuleIds.includes('ba400_optical_photometry'));
  assert(opticalHypothesis.evidenceFor.some((line) => line.includes('blanco fotométrico instrumental está rechazado')));

  console.log(`PASS: ${events.length} eventos BPL normalizados, resumen por serie, proyección DRI y contribuciones del motor.`);
} finally {
  await vite.close();
}
