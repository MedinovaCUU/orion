import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

// Calibradores y controles: el consumo solo documenta el pipeteo. Su resultado sale de la fila analítica
// (vwksResults para calibradores, tqcResults para controles) de la misma serie, prueba, material, lote y
// ejecución; sin resultado relacionado se muestra «pendiente de recibir», nunca el código crudo.
const vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, entries: [] } });
try {
  const bpl = await vite.ssrLoadModule('/src/modules/equipment-monitoring/bplEvents.ts');
  const serial = '834001902';
  const calibMissing = ['calibration_acceptance_status', 'calibration_curve'];
  const controlMissing = ['control_result_value', 'control_limits', 'westgard_assessment'];
  const row = (overrides) => ({ effective_equipment_serial: serial, detected_at: '2026-10-01T00:00:00Z', bpl_status: 'evidence_observed', missing_data_for_acceptance: [], ...overrides });
  const consumption = (id, at, test, cls, name, lot, sampleType = 'SER') =>
    row({ id, occurred_at: at, event_type: 'bpl_consumption_record', bpl_stage: cls === 'CALIB' ? 'calibration' : 'quality_control', diagnostic_status: 'pending_analytical_acceptance', test_name: test, sample_class: cls, sample_type: sampleType, calibration_control_name: name, calibration_control_lot_number: lot, missing_data_for_acceptance: cls === 'CALIB' ? calibMissing : controlMissing, payload: { reagent_volume_1: 240, sample_volume: 3 } });
  // Resultado de calibrador tal como sale de Ax00.dbo.vwksResults.
  const calibResult = (id, at, detectedAt, { test = 'ALBUMIN-MAU', name = 'CAL MAU 058', lot = '058', ws = '2026092801', order = 97, rerun = 2, status = 'CLOSED', accepted = true, factor = 392.9958, sampleType = 'URI' } = {}) =>
    row({
      id, occurred_at: at, detected_at: detectedAt, event_type: 'bpl_analytical_result', bpl_stage: 'calibration', bpl_status: accepted ? 'accepted' : 'rejected', diagnostic_status: accepted ? 'calibration_accepted' : 'calibration_rejected', test_name: test, sample_class: 'CALIB', sample_type: sampleType, calibration_control_name: name, calibration_control_lot_number: lot,
      payload: { database_record: { analyzer_id: serial, test_name: test, sample_class: 'CALIB', work_session_id: ws, order_test_id: order, rerun_number: rerun, multipoint_number: 1, order_test_status: status, accepted_result: accepted, absorbance_value: 0.171387, calibrator_factor: factor, calibrator_name: name, calibrator_lot_number: lot, validation_status: 'OK' } },
    });
  // Resultado de control tal como sale de Ax00.dbo.tqcResults: sin sesión ni orden, con corrida.
  const qcResult = (id, at, { test = 'GLUCOSE', name = 'CONTROL 2', lot = '0001', run = 4, value = 248.6101, min = 215, max = 291, status = 'pending', missing = [], analyzer = serial } = {}) =>
    row({
      id, occurred_at: at, event_type: 'bpl_quality_control_result', bpl_stage: 'quality_control', bpl_status: status, diagnostic_status: `quality_control_${status}`, test_name: test, sample_class: 'CTRL', sample_type: 'SER', calibration_control_name: name, calibration_control_lot_number: lot, missing_data_for_acceptance: missing,
      payload: { limit_assessment: 'within_control_range', westgard_assessment: 'pending', database_record: { analyzer_id: analyzer, test_name: test, control_name: name, control_lot_number: lot, run_number: run, runs_group_number: 1, result_value: value, measure_unit: 'MGDL', control_min_concentration: min, control_max_concentration: max, validation_status: 'PENDING', closed_result: false } },
    });

  // Calibración ALBUMIN-MAU 2026-09-28 (repetición 2): tres pipeteos, dos réplicas y un rechazo publicado después.
  const calibration = bpl.buildBplSerialSummary(serial, [
    consumption(139, '2026-09-28T22:55:21Z', 'ALBUMIN-MAU', 'CALIB', 'CAL MAU 058', '058', 'URI'),
    consumption(140, '2026-09-28T22:55:30Z', 'ALBUMIN-MAU', 'CALIB', 'CAL MAU 058', '058', 'URI'),
    consumption(141, '2026-09-28T22:55:39Z', 'ALBUMIN-MAU', 'CALIB', 'CAL MAU 058', '058', 'URI'),
    calibResult(144, '2026-09-28T23:08:15Z', '2026-09-28T23:08:18Z', { status: 'PENDING', factor: 392.13028 }),
    calibResult(145, '2026-09-28T23:08:24Z', '2026-09-28T23:08:26Z'),
    calibResult(147, '2026-09-28T23:08:24Z', '2026-09-28T23:41:38Z', { accepted: false }),
  ].map(bpl.normalizeBplEvent));
  const mau = calibration.tests.find((test) => test.testKey === 'ALBUMIN-MAU');
  const calibrationLink = mau.links.find((link) => link.stage === 'calibration');
  assert.equal(calibrationLink.state, 'received');
  assert.equal(calibrationLink.result.id, '147', 'misma hora del analizador: manda la publicación más reciente (rechazo)');
  assert.equal(bpl.describeBplResultLink(calibrationLink), 'Calibración rechazada · factor 392.9958');
  assert.equal(bpl.formatBplExecution(calibrationLink.execution), 'sesión 2026092801 · orden 97 · repetición 2');
  assert.equal(calibrationLink.material, 'CAL MAU 058 · lote 058');
  assert.equal(mau.stages.calibration.effectiveStatus, 'rejected');
  assert.deepEqual(mau.missingData, [], 'el consumo del calibrador no se reporta como «Falta: calibration_curve»');
  assert.deepEqual(calibration.missingData, []);
  assert.deepEqual(calibration.pendingResults.calibration, []);
  calibration.events.filter((event) => event.eventType === 'bpl_consumption_record').forEach((event) => {
    assert.equal(event.links.calibration.result.id, '147', `pipeteo ${event.id} vinculado a la ejecución`);
    assert.deepEqual(event.missingData, []);
  });
  assert.equal(bpl.summarizeBplEventMetrics(calibration.events.find((event) => event.id === '141'))[0], 'Calibración rechazada · factor 392.9958');

  // CHOLESTEROL 2026-05-29: el pipeteo de las 16:34 no tuvo resultado; el de las 17:35 sí (10 min). 71 min es otra corrida.
  const cholesterol = bpl.buildBplSerialSummary(serial, [
    consumption(611, '2026-05-29T16:34:46Z', 'CHOLESTEROL', 'CALIB', 'CAL BOVINO', '0002'),
    consumption(616, '2026-05-29T17:35:46Z', 'CHOLESTEROL', 'CALIB', 'CAL BOVINO', '0002'),
    calibResult(85, '2026-05-29T17:46:10Z', '2026-05-29T17:46:12Z', { test: 'CHOLESTEROL', name: 'CAL BOVINO', lot: '0002', ws: '2026052901', order: 54, rerun: 1, factor: 647.4253, sampleType: 'SER' }),
  ].map(bpl.normalizeBplEvent));
  assert.equal(cholesterol.events.find((event) => event.id === '611').links.calibration.state, 'pending');
  assert.equal(cholesterol.events.find((event) => event.id === '616').links.calibration.state, 'received');
  assert.equal(cholesterol.tests[0].links.find((link) => link.stage === 'calibration').state, 'received', 'cuenta el pipeteo más reciente');

  // Otro lote de calibrador no cierra el pipeteo; ISE sin resultado queda pendiente de recibir.
  const otherLot = bpl.buildBplSerialSummary(serial, [
    consumption(700, '2026-05-29T16:34:46Z', 'PHOSPHORUS', 'CALIB', 'CAL BOVINO', '0002'),
    calibResult(701, '2026-05-29T16:45:00Z', '2026-05-29T16:45:02Z', { test: 'PHOSPHORUS', name: 'CAL BOVINO', lot: '0003', ws: '2026052901', order: 55, rerun: 1, factor: 25.9, sampleType: 'SER' }),
    consumption(702, '2026-05-29T17:03:41Z', 'ISE_PURGE_A', 'CALIB', 'ISE Calibrator', '23021032', null),
  ].map(bpl.normalizeBplEvent));
  assert.equal(otherLot.events.find((event) => event.id === '700').links.calibration.state, 'pending');
  assert.equal(bpl.describeBplResultLink(otherLot.events.find((event) => event.id === '702').links.calibration), 'Resultado de calibración pendiente de recibir');
  assert.deepEqual(otherLot.pendingResults.calibration, ['ISE_PURGE_A']);

  // Controles GLUCOSE 2026-09-21: cada nivel se cierra con su propio resultado (corrida 3 y 4), nunca cruzado.
  const controls = bpl.buildBplSerialSummary(serial, [
    consumption(22, '2026-09-21T22:03:07Z', 'GLUCOSE', 'CTRL', 'CONTROL 1', '0001'),
    consumption(23, '2026-09-21T22:03:34Z', 'GLUCOSE', 'CTRL', 'CONTROL 2', '0001'),
    qcResult(26, '2026-09-21T22:18:01Z', { name: 'CONTROL 1', run: 3, value: 88.28517, min: 70, max: 100 }),
    qcResult(25, '2026-09-21T22:18:25Z'),
  ].map(bpl.normalizeBplEvent));
  const qc25 = controls.events.find((event) => event.id === '25');
  assert.equal(qc25.qc.minLimit, 215, 'límites desde database_record.control_min_concentration');
  assert.equal(qc25.qc.maxLimit, 291);
  assert.equal(qc25.qc.withinLimits, true);
  assert.equal(qc25.execution.key, `${serial}|GLUCOSE|qc|CONTROL 2|1|1|4`);
  assert.equal(controls.events.find((event) => event.id === '22').links.quality_control.result.id, '26');
  assert.equal(controls.events.find((event) => event.id === '23').links.quality_control.result.id, '25');
  const glucoseLinks = controls.tests[0].links.filter((link) => link.stage === 'quality_control');
  assert.deepEqual(glucoseLinks.map((link) => [link.material, link.state]), [['CONTROL 1 · lote 0001', 'received'], ['CONTROL 2 · lote 0001', 'received']]);
  assert.equal(bpl.describeBplResultLink(glucoseLinks[1]), 'Resultado de control 248.61 MGDL (CONTROL 2 · lote 0001)');
  assert.equal(bpl.formatBplExecution(glucoseLinks[1].execution), 'corrida 4');
  assert.deepEqual(controls.missingData, [], 'ningún «Falta: control_result_value»');
  assert.deepEqual(controls.pendingResults.quality_control, []);

  // Solo llegó el nivel 1: el nivel 2 queda pendiente de recibir con su control y lote.
  const oneLevel = bpl.buildBplSerialSummary(serial, [
    consumption(22, '2026-09-21T22:03:07Z', 'GLUCOSE', 'CTRL', 'CONTROL 1', '0001'),
    consumption(23, '2026-09-21T22:03:34Z', 'GLUCOSE', 'CTRL', 'CONTROL 2', '0001'),
    qcResult(26, '2026-09-21T22:18:01Z', { name: 'CONTROL 1', run: 3, value: 88.28517, min: 70, max: 100 }),
  ].map(bpl.normalizeBplEvent));
  assert.equal(oneLevel.events.find((event) => event.id === '23').links.quality_control.state, 'pending');
  assert.deepEqual(oneLevel.pendingResults.quality_control, ['GLUCOSE (CONTROL 2 · lote 0001)']);
  assert.equal(bpl.describeBplResultLink(oneLevel.events.find((event) => event.id === '23').links.quality_control), 'Resultado de control pendiente de recibir (CONTROL 2 · lote 0001)');

  // El lote «0001» del CSV y «1» del resultado son el mismo; otro analizador o una curva de reacción no cuentan.
  const edge = bpl.buildBplSerialSummary(serial, [
    consumption(800, '2026-06-22T19:42:44Z', 'PHOSPHORUS', 'CTRL', 'CONTROL 1', '0001'),
    qcResult(801, '2026-06-22T19:58:00Z', { test: 'PHOSPHORUS', name: 'CONTROL 1', lot: '1', run: 3, value: 3.276, min: 2.5, max: 4 }),
    consumption(802, '2026-06-22T19:43:11Z', 'ALT-GPT', 'CTRL', 'CONTROL 1', '0001'),
    qcResult(803, '2026-06-22T19:55:00Z', { test: 'ALT-GPT', name: 'CONTROL 1', run: 3, value: 40, analyzer: '834009999' }),
    row({ id: 804, occurred_at: '2026-06-22T19:56:00Z', event_type: 'bpl_reaction_curve', bpl_stage: 'quality_control', test_name: 'ALT-GPT', sample_class: 'CTRL', sample_type: 'SER', calibration_control_name: 'CONTROL 1', calibration_control_lot_number: '0001', payload: { reaction_curve: { final_absorbance: 0.4, points: [{ cycle: 38, abs1: 0.4 }] } } }),
  ].map(bpl.normalizeBplEvent));
  assert.equal(edge.events.find((event) => event.id === '800').links.quality_control.result.id, '801');
  assert.equal(edge.events.find((event) => event.id === '802').links.quality_control.state, 'pending');
  assert.deepEqual(edge.pendingResults.quality_control, ['ALT-GPT (CONTROL 1 · lote 0001)']);

  // Lo que falta en la propia fila de resultado sí es una falta real y se conserva.
  const ownGap = bpl.buildBplSerialSummary(serial, [qcResult(900, '2026-10-01T10:00:00Z', { test: 'CHOLESTEROL', name: null, lot: null, run: 1, value: 180, missing: ['control_lot'] })].map(bpl.normalizeBplEvent));
  assert.deepEqual(ownGap.missingData, ['control_lot']);

  // Corte global sin payload: el vínculo se hace por prueba, material, lote y hora.
  const overview = bpl.buildBplSerialIndex([
    consumption(22, '2026-09-21T22:03:07Z', 'GLUCOSE', 'CTRL', 'CONTROL 1', '0001'),
    qcResult(26, '2026-09-21T22:18:01Z', { name: 'CONTROL 1', run: 3 }),
  ].map(({ payload, ...rest }) => rest)).get(serial);
  const overviewLink = overview.tests[0].links.find((link) => link.stage === 'quality_control');
  assert.equal(overviewLink.state, 'received');
  assert.equal(bpl.describeBplResultLink(overviewLink), 'Resultado de control recibido');
  assert.deepEqual(overview.missingData, []);

  console.log('PASS: calibradores y controles · resultado por material, lote y ejecución; pendiente de recibir sin código crudo.');
} finally {
  await vite.close();
}
