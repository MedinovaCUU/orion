import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

// Resultado del blanco de reactivo: sale solo del bpl_analytical_result BLANK (payload.database_record)
// de la misma serie, prueba y ejecución; un consumo o una curva sin el dato no significa que falte.
const vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, entries: [] } });
try {
  const bpl = await vite.ssrLoadModule('/src/modules/equipment-monitoring/bplEvents.ts');
  const serial = '834001902';
  const missingBlank = ['blank_result_value', 'blank_acceptance_limit'];
  const row = (overrides) => ({ effective_equipment_serial: serial, detected_at: '2026-10-09T23:00:00Z', bpl_status: 'evidence_observed', missing_data_for_acceptance: [], ...overrides });
  // Pipeteo del blanco (CSV de consumo): no trae resultado y el monitor lo declara faltante.
  const consumption = (id, at, test = 'ALBUMIN-MAU', sampleType = 'URI') =>
    row({ id, occurred_at: at, event_type: 'bpl_consumption_record', bpl_stage: 'reagent_blank', diagnostic_status: 'pending_analytical_acceptance', test_name: test, sample_class: 'BLANK', sample_type: sampleType, missing_data_for_acceptance: missingBlank, payload: { reagent_volume_1: 240, reagent_volume_2: 60, sample_volume: 2, reagent_barcode_1: '32411072700003008705_BC', missing_data_for_acceptance: missingBlank } });
  // Resultado analítico tal como lo publica el monitor 2.3.10 desde Ax00.dbo.vwksResults.
  const blankResult = (id, at, absorbance, { test = 'ALBUMIN-MAU', ws = '2026100901', order = 100, rerun = 1, status = 'CLOSED', limit = 1.5, analyzer = serial, sampleType = 'URI', extra = {} } = {}) =>
    row({
      id, occurred_at: at, event_type: 'bpl_analytical_result', bpl_stage: 'reagent_blank', bpl_status: 'accepted', diagnostic_status: 'blank_accepted', test_name: test, sample_class: 'BLANK', sample_type: sampleType,
      rule_ids: ['BPL-BLANK-001', 'DRI-BLANK-WITHIN-LIMIT'],
      payload: {
        event_type: 'bpl_analytical_result', sample_class: 'BLANK', limit_assessment: 'within_limit', missing_data_for_acceptance: [],
        database_record: { analyzer_id: analyzer, test_name: test, sample_class: 'BLANK', work_session_id: ws, order_test_id: order, rerun_number: rerun, multipoint_number: 1, order_test_status: status, absorbance_value: absorbance, absorbance_initial: 0.94, blank_absorbance_limit: limit, concentration_value: null, validation_status: 'OK', accepted_result: true },
        ...extra,
      },
    });
  // Curva de reacción de una réplica del blanco: su último punto NO es el resultado del blanco.
  const reactionCurve = (id, at, replicate, finalAbsorbance) =>
    row({ id, occurred_at: at, event_type: 'bpl_reaction_curve', bpl_stage: 'reagent_blank', test_name: 'ALBUMIN-MAU', sample_class: 'BLANK', sample_type: 'URI', payload: { reaction_curve: { work_session_id: '2026100901', order_test_id: 100, execution_id: replicate, replicate_number: replicate, final_absorbance: finalAbsorbance, calculation_version: 'screen-abs-v2', points: [{ cycle: 1, abs1: 0.9 }, { cycle: 38, abs1: finalAbsorbance }] } } });

  // Caso real 834001902 · 2026-10-09: seis pipeteos, tres réplicas (media acumulada) y tres curvas.
  const realRows = [
    consumption(988, '2026-10-09T20:10:37Z'), consumption(989, '2026-10-09T20:10:45Z'), consumption(990, '2026-10-09T20:10:54Z'),
    consumption(991, '2026-10-09T20:17:39Z'), consumption(992, '2026-10-09T20:17:48Z'), consumption(993, '2026-10-09T20:17:57Z'),
    blankResult(994, '2026-10-09T20:30:24Z', 0.002014935, { status: 'PENDING' }),
    blankResult(995, '2026-10-09T20:30:33Z', 0.00167426467, { status: 'PENDING' }),
    blankResult(996, '2026-10-09T20:30:42Z', 0.0014385581),
    reactionCurve(997, '2026-10-09T20:30:42Z', 3, 0.000967144966),
    reactionCurve(998, '2026-10-09T20:30:33Z', 2, 0.00133359432),
    reactionCurve(999, '2026-10-09T20:30:24Z', 1, 0.002014935),
  ];
  const events = realRows.map(bpl.normalizeBplEvent).filter(Boolean);
  const result996 = events.find((event) => event.id === '996');
  assert.equal(result996.blank.absorbance, 0.0014385581, 'absorbancia desde payload.database_record.absorbance_value');
  assert.equal(result996.blank.absorbanceLimit, 1.5, 'límite desde payload.database_record.blank_absorbance_limit');
  assert.equal(result996.blank.withinLimit, true);
  assert.equal(result996.analytical.absorbance, 0.0014385581);
  assert.deepEqual(result996.execution, { key: `${serial}|ALBUMIN-MAU|2026100901|100|1`, workSessionId: '2026100901', orderTestId: '100', rerunNumber: 1, multipointNumber: 1, orderTestStatus: 'CLOSED', analyzerId: serial });
  assert.deepEqual(bpl.summarizeBplEventMetrics(result996), ['Abs 0.0014', 'Límite 1.5', 'Validación OK'], 'la absorbancia del blanco no se repite');

  const summary = bpl.buildBplSerialSummary(serial, events);
  const mau = summary.tests.find((test) => test.testKey === 'ALBUMIN-MAU');
  assert.equal(mau.blankResult.state, 'received');
  assert.equal(mau.blankResult.absorbance, 0.0014385581, 'la media final de la ejecución cerrada, no la última curva');
  assert.notEqual(mau.blankResult.absorbance, 0.000967144966);
  assert.equal(mau.blankResult.limit, 1.5);
  assert.equal(mau.blankResult.replicates, 3);
  assert.equal(mau.blankResult.final, true);
  assert.equal(mau.blankResult.result.id, '996');
  assert.equal(bpl.formatBplExecution(mau.blankResult.execution), 'sesión 2026100901 · orden 100');
  assert.deepEqual(mau.missingData, [], 'el consumo sin dato no se reporta como falta');
  assert.deepEqual(summary.missingData, []);
  assert.deepEqual(summary.pendingBlankResults, []);
  assert.equal(summary.events.length, 9, 'las curvas no entran al resumen BPL');
  const consumptions = summary.events.filter((event) => event.eventType === 'bpl_consumption_record');
  assert.equal(consumptions.length, 6);
  consumptions.forEach((event) => {
    assert.equal(event.blankResult.state, 'received', `pipeteo ${event.id} vinculado`);
    assert.equal(event.blankResult.execution.key, `${serial}|ALBUMIN-MAU|2026100901|100|1`);
    assert.deepEqual(event.missingData, []);
  });
  assert.equal(bpl.summarizeBplEventMetrics(consumptions[0])[0], 'Resultado del blanco Abs 0.0014 (límite 1.5)');

  // Mientras la ejecución no cierra, el valor es la media parcial de las réplicas recibidas.
  const partial = bpl.buildBplSerialSummary(serial, realRows.filter((item) => !['995', '996'].includes(String(item.id))).map(bpl.normalizeBplEvent));
  const partialLink = partial.tests.find((test) => test.testKey === 'ALBUMIN-MAU').blankResult;
  assert.equal(partialLink.final, false);
  assert.equal(partialLink.absorbance, 0.002014935);
  assert.match(bpl.describeBplBlankResult(partialLink), /media parcial/);

  // Sin resultado analítico: pendiente de recibir, aunque existan curvas del blanco con absorbancias.
  const onlyEvidence = bpl.buildBplSerialSummary(serial, realRows.filter((item) => item.event_type !== 'bpl_analytical_result').map(bpl.normalizeBplEvent));
  const pending = onlyEvidence.tests.find((test) => test.testKey === 'ALBUMIN-MAU').blankResult;
  assert.equal(pending.state, 'pending');
  assert.equal(pending.absorbance, null, 'nunca se sustituye por el último punto de la curva');
  assert.equal(pending.observedAt, '2026-10-09T20:17:57Z');
  assert.equal(bpl.describeBplBlankResult(pending), 'Resultado del blanco pendiente de recibir');
  assert.deepEqual(onlyEvidence.pendingBlankResults, ['ALBUMIN-MAU']);
  assert.deepEqual(onlyEvidence.missingData, [], 'el aviso ya no muestra blank_result_value');
  assert.equal(bpl.summarizeBplEventMetrics(onlyEvidence.events[0])[0], 'Resultado del blanco pendiente de recibir');

  // Ventana: CREATININE 2026-05-28 — el pipeteo de las 20:12 no tiene resultado; el de las 22:12 sí (11.7 min).
  const creatinine = bpl.buildBplSerialSummary(serial, [
    consumption(524, '2026-05-28T20:12:05Z', 'CREATININE', 'PLM'),
    consumption(595, '2026-05-28T22:12:50Z', 'CREATININE', 'PLM'),
    blankResult(91, '2026-05-28T22:24:32Z', 0.0184124112, { test: 'CREATININE', ws: '2026052801', order: 20, limit: 0.35, sampleType: 'PLM' }),
  ].map(bpl.normalizeBplEvent));
  assert.equal(creatinine.events.find((event) => event.id === '524').blankResult.state, 'pending', 'un resultado 132 min después es otra corrida');
  assert.equal(creatinine.events.find((event) => event.id === '595').blankResult.state, 'received');
  assert.equal(creatinine.tests[0].blankResult.absorbance, 0.0184124112);

  // Un pipeteo nuevo sin resultado vuelve a dejar la prueba pendiente; el resultado anterior no lo cierra.
  const rerun = bpl.buildBplSerialSummary(serial, [...realRows, consumption(1100, '2026-10-10T15:00:00Z')].map(bpl.normalizeBplEvent));
  assert.equal(rerun.tests.find((test) => test.testKey === 'ALBUMIN-MAU').blankResult.state, 'pending');
  assert.equal(rerun.tests.find((test) => test.testKey === 'ALBUMIN-MAU').stages.reagent_blank.effectiveStatus, 'accepted', 'la última evaluación sigue vigente');
  assert.deepEqual(rerun.pendingBlankResults, ['ALBUMIN-MAU']);

  // Otra prueba, otro tipo de muestra u otro analizador no cierran el blanco.
  const unrelated = bpl.buildBplSerialSummary(serial, [
    consumption(1200, '2026-10-09T20:17:57Z'),
    blankResult(1201, '2026-10-09T20:30:00Z', 0.05, { test: 'GLUCOSE', order: 101, limit: 0.15 }),
    blankResult(1202, '2026-10-09T20:30:10Z', 0.0013, { order: 102, sampleType: 'SERUM' }),
    blankResult(1203, '2026-10-09T20:30:20Z', 0.0012, { order: 103, analyzer: '834009999' }),
  ].map(bpl.normalizeBplEvent));
  assert.equal(unrelated.events.find((event) => event.id === '1200').blankResult.state, 'pending');
  assert.equal(unrelated.tests.find((test) => test.testKey === 'GLUCOSE').blankResult.absorbance, 0.05);

  // Una curva de calibración que pide el blanco se vincula con el blanco de su sesión; no es ausencia del resultado.
  const curveAsking = bpl.buildBplSerialSummary(serial, [
    blankResult(1300, '2026-10-09T20:30:42Z', 0.0014385581),
    row({ id: 1301, occurred_at: '2026-10-09T23:00:00Z', event_type: 'bpl_calibration_curve', bpl_stage: 'calibration', bpl_status: 'pending', test_name: 'ALBUMIN-MAU', sample_class: 'CALIB', missing_data_for_acceptance: ['blank_result_value', 'calibration_curve'], payload: { database_record: { work_session_id: '2026100901', order_test_id: 104 }, calibration_curve: { points: [[0.0014, 0], [0.2, 66.9]] } } }),
  ].map(bpl.normalizeBplEvent));
  const curveEvent = curveAsking.events.find((event) => event.id === '1301');
  assert.equal(curveEvent.blankResult.state, 'received');
  assert.equal(curveEvent.blankResult.result.id, '1300');
  assert.deepEqual(curveEvent.missingData, ['calibration_curve'], 'solo se retiran los códigos del blanco');

  // Los puntos de una curva anidada nunca se leen como absorbancia del blanco.
  const curveOnlyPayload = bpl.normalizeBplEvent(row({ id: 1400, occurred_at: '2026-10-09T20:30:42Z', event_type: 'bpl_analytical_result', bpl_stage: 'reagent_blank', test_name: 'ALBUMIN-MAU', sample_class: 'BLANK', payload: { reaction_curve: { final_absorbance: 0.00096, abs: 0.00096, points: [{ abs: 0.00096 }] }, calibration_curve: { abs: 0.2 } } }));
  assert.equal(curveOnlyPayload.blank.absorbance, null);
  assert.equal(curveOnlyPayload.analytical.absorbance, null);

  // Corte global sin payload: el resultado existe aunque su valor llegue con el detalle.
  const overview = bpl.buildBplSerialIndex(realRows.map(({ payload, ...rest }) => rest)).get(serial);
  const overviewLink = overview.tests.find((test) => test.testKey === 'ALBUMIN-MAU').blankResult;
  assert.equal(overviewLink.state, 'received');
  assert.equal(overviewLink.absorbance, null);
  assert.equal(bpl.describeBplBlankResult(overviewLink), 'Resultado del blanco recibido');
  assert.deepEqual(overview.missingData, []);
  assert.deepEqual(overview.pendingBlankResults, []);

  console.log('PASS: blanco de reactivo · resultado por ejecución, consumos y curvas sin falso faltante, pendiente de recibir.');
} finally {
  await vite.close();
}
