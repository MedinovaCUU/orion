import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

// Reglas Westgard de Orion (criterio del dueño, 2026-10-16), sesiones de trabajo del BA400 y calibración vigente.
// Casos sintéticos por regla y casos reales de 834001902 (controles de mayo, junio y septiembre; ALBUMIN-MAU).
const vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, entries: [] } });
try {
  const westgard = await vite.ssrLoadModule('/src/modules/equipment-monitoring/bplWestgard.ts');
  const bpl = await vite.ssrLoadModule('/src/modules/equipment-monitoring/bplEvents.ts');

  // ---------- Reglas sobre puntos ----------
  const LEVELS = { L1: { mean: 100, sd: 10, label: 'Nivel 1' }, L2: { mean: 200, sd: 20, label: 'Nivel 2' } };
  const base = Date.parse('2026-10-16T15:00:00Z');
  const point = (key, material, z, minutes, sessionKey = 'S1', day = '2026-10-16', value) => {
    const level = LEVELS[material];
    return { key, testKey: 'GLUCOSE', materialKey: material, levelLabel: level.label, value: value ?? level.mean + z * level.sd, mean: level.mean, sd: level.sd, z: value === undefined ? z : (value - level.mean) / level.sd, at: base + minutes * 60e3, day, sessionKey };
  };
  const evaluate = (points) => {
    const result = westgard.evaluateBplWestgard(points);
    const verdictOf = (sessionKey) => result.sessions.get(`GLUCOSE|${sessionKey}`);
    return { ...result, verdictOf, rules: (sessionKey) => verdictOf(sessionKey).findings.map((finding) => `${finding.rule}:${finding.severity}`) };
  };

  // 1-2s: alarma que no levanta advertencia ni bloquea.
  let run = evaluate([point('a', 'L1', 2.3, 0), point('b', 'L2', 0.4, 2)]);
  assert.deepEqual(run.rules('S1'), ['1-2s:alarma']);
  assert.equal(run.verdictOf('S1').status, 'accepted');
  assert.equal(run.verdictOf('S1').needsRepeat, false);

  // 1-3s: alarma no definitiva que pide repetir el control.
  run = evaluate([point('a', 'L1', 3.4, 0), point('b', 'L2', 0.2, 2)]);
  assert.deepEqual(run.rules('S1'), ['1-3s:alarma']);
  assert.equal(run.verdictOf('S1').status, 'pending');
  assert.equal(run.verdictOf('S1').needsRepeat, true);
  assert.match(westgard.describeBplQcVerdict(run.verdictOf('S1')), /^Alarma · Nivel 1 \+3\.4 DE \(1-3s\): repetir el control$/);

  // Repetición normal en la misma sesión: la alarma queda registrada pero se cierra.
  run = evaluate([point('a', 'L1', 3.4, 0), point('b', 'L2', 0.2, 2), point('c', 'L1', 0.6, 15)]);
  const repeatedNormal = run.verdictOf('S1').findings.find((finding) => finding.rule === '1-3s');
  assert.equal(repeatedNormal.repeat, 'normal');
  assert.equal(repeatedNormal.severity, 'alarma');
  assert.equal(run.verdictOf('S1').status, 'accepted');
  assert.match(repeatedNormal.text, /la repetición salió normal$/);

  // La repetición vuelve a pasar de 3 DE: rechazo confirmado, y esa repetición no pide otra.
  run = evaluate([point('a', 'L1', 3.4, 0), point('c', 'L1', 3.8, 15)]);
  assert.equal(run.verdictOf('S1').status, 'rejected');
  assert.equal(run.verdictOf('S1').severity, 'rechazo');
  assert.equal(run.verdictOf('S1').needsRepeat, false);
  assert(run.verdictOf('S1').findings.every((finding) => !finding.needsRepeat));

  // Sin repetir en la sesión, la sesión siguiente no cierra la alarma anterior.
  run = evaluate([point('a', 'L1', 3.4, 0, 'S1'), point('c', 'L1', 0.1, 1440, 'S2', '2026-10-17')]);
  assert.equal(run.verdictOf('S1').needsRepeat, true);
  assert.equal(run.verdictOf('S2').status, 'accepted');

  // 2-2s: dos corridas seguidas del mismo nivel más allá de 2 DE del mismo lado → advertencia.
  run = evaluate([point('a', 'L1', 2.3, 0, 'S1'), point('b', 'L1', 2.5, 1440, 'S2', '2026-10-17')]);
  assert(run.rules('S2').includes('2-2s:advertencia'));
  assert.equal(run.verdictOf('S2').status, 'pending');
  assert.equal(run.verdictOf('S2').severity, 'advertencia');

  // 1-2s en los dos niveles del mismo procesado (mismo lado) → advertencia.
  run = evaluate([point('a', 'L1', 2.2, 0), point('b', 'L2', 2.4, 3)]);
  assert(run.rules('S1').includes('1-2s-niveles:advertencia'));
  // En sentidos opuestos sin pasar de 3 DE (R-4s) → advertencia.
  run = evaluate([point('a', 'L1', 2.4, 0), point('b', 'L2', -2.3, 3)]);
  assert(run.rules('S1').includes('R-4s:advertencia'));
  assert.equal(run.verdictOf('S1').findings.find((finding) => finding.rule === 'R-4s').needsRepeat, false);

  // R-4s extremo con viales de nivel intercambiados: alarma normal que pide repetir; la repetición normal la cierra.
  run = evaluate([point('a', 'L1', null, 0, 'S1', '2026-10-16', 200), point('b', 'L2', null, 3, 'S1', '2026-10-16', 100)]);
  const swap = run.verdictOf('S1').findings.find((finding) => finding.rule === 'R-4s');
  assert.equal(swap.severity, 'alarma');
  assert.equal(swap.needsRepeat, true);
  assert.equal(swap.possibleSwap, true);
  assert.match(swap.text, /posible intercambio de viales de nivel/);
  run = evaluate([point('a', 'L1', null, 0, 'S1', '2026-10-16', 200), point('b', 'L2', null, 3, 'S1', '2026-10-16', 100), point('c', 'L1', 0.3, 20), point('d', 'L2', -0.2, 22)]);
  assert.equal(run.verdictOf('S1').findings.find((finding) => finding.rule === 'R-4s').repeat, 'normal');
  // …y si la repetición vuelve a salir en sentidos opuestos, se confirma.
  run = evaluate([point('a', 'L1', null, 0, 'S1', '2026-10-16', 200), point('b', 'L2', null, 3, 'S1', '2026-10-16', 100), point('c', 'L1', 2.5, 20), point('d', 'L2', -2.4, 22)]);
  assert.equal(run.verdictOf('S1').status, 'rejected');

  // 4-1s: alerta ligera, sin advertencia.
  run = evaluate([1.2, 1.4, 1.3, 1.5].map((z, index) => point(`p${index}`, 'L1', z, index * 1440, `S${index}`, `2026-10-${16 + index}`)));
  assert.deepEqual(run.rules('S3'), ['4-1s:alerta_ligera']);
  assert.equal(run.verdictOf('S3').status, 'accepted');

  // Los dos niveles más allá de 1 DE del mismo lado el mismo día: alerta ligera.
  run = evaluate([point('a', 'L1', 1.3, 0), point('b', 'L2', 1.5, 240, 'S2')]);
  assert(run.rules('S2').includes('1s-niveles:alerta_ligera'));

  // 10x: del mismo lado dentro de 1 DE → alerta ligera; más allá de 1 DE → advertencia.
  const tenSessions = (zs, material = 'L1') => zs.map((z, index) => point(`${material}${index}`, material, z, index * 1440, `S${index}`, `2026-11-${String(index + 1).padStart(2, '0')}`));
  run = evaluate(tenSessions([0.3, 0.5, 0.8, 0.2, 0.4, 0.6, 0.7, 0.1, 0.9, 0.5]));
  assert(run.rules('S9').includes('10x:alerta_ligera'));
  run = evaluate(tenSessions([1.2, 1.5, 1.3, 1.1, 1.4, 1.6, 1.2, 1.3, 1.5, 1.2]));
  assert(run.rules('S9').includes('10x:advertencia'));

  // 5x por nivel del mismo lado (los dos niveles) → mismo criterio.
  const fivePerLevel = (z) => [0, 1, 2, 3, 4].flatMap((index) => [point(`a${index}`, 'L1', z, index * 1440, `S${index}`, `2026-11-${index + 1}`), point(`b${index}`, 'L2', z, index * 1440 + 5, `S${index}`, `2026-11-${index + 1}`)]);
  run = evaluate(fivePerLevel(0.5));
  assert(run.rules('S4').includes('5x-niveles:alerta_ligera'));
  run = evaluate(fivePerLevel(-1.4));
  assert(run.rules('S4').includes('5x-niveles:advertencia'));

  // Rango del lote = media ± 3 DE (BA400).
  const target = westgard.qcTargetFromRange(30.4, 45.6);
  assert.equal(target.mean, 38);
  assert.ok(Math.abs(target.sd - 2.5333) < 1e-3);

  // ---------- Casos reales 834001902 ----------
  const serial = '834001902';
  const qcRow = (id, local, { test, control, lot = '0001', run, value, min, max, validation = 'PENDING', alarms = null, status = 'pending', detected = '2026-09-28T18:07:46Z', analyzer = serial }) =>
    ({
      id, effective_equipment_serial: serial, occurred_at: new Date(`${local}-06:00`).toISOString(), occurred_at_raw: `${local}.0000000-06:00`, detected_at: detected,
      event_type: 'bpl_quality_control_result', bpl_stage: 'quality_control', bpl_status: status, diagnostic_status: `quality_control_${status}`, test_name: test, sample_class: 'CTRL', sample_type: 'SER',
      calibration_control_name: control, calibration_control_lot_number: lot, missing_data_for_acceptance: [],
      payload: { westgard_assessment: status, database_record: { analyzer_id: analyzer, test_name: test, control_name: control, control_lot_number: lot, runs_group_number: 1, run_number: run, result_value: value, control_min_concentration: min, control_max_concentration: max, validation_status: validation, alarm_list: alarms, selected_rule_list: 'WESTGARD_1-2s', excluded: false, manual_result: false } },
    });
  const summarize = (rows) => bpl.buildBplSerialSummary(serial, rows.map(bpl.normalizeBplEvent).filter(Boolean));

  // GLUCOSE 2026-09-21: el BA400 dejó los dos controles en PENDING; Orion los evalúa con su valor y rango.
  const glucoseSept = summarize([
    qcRow(26, '2026-09-21T16:17:44', { test: 'GLUCOSE', control: 'CONTROL 1', run: 3, value: 88.28517, min: 75.1, max: 101.7 }),
    qcRow(25, '2026-09-21T16:18:25', { test: 'GLUCOSE', control: 'CONTROL 2', run: 4, value: 248.6101, min: 215, max: 291 }),
  ]);
  const glucose = glucoseSept.tests[0];
  assert.equal(glucose.stages.quality_control.effectiveStatus, 'accepted');
  assert.equal(glucose.qcVerdict.session.label, 'sesión del 21 sep');
  assert.deepEqual(glucose.qcVerdict.levels.map((level) => [level.label, level.z]), [['Nivel 1', -0.03], ['Nivel 2', -0.35]]);
  assert.equal(glucoseSept.events.find((event) => event.id === '25').monitorStatus, 'pending', 'el estado del monitor se conserva aparte');
  assert.equal(glucoseSept.events.find((event) => event.id === '25').westgard.analyzerStatus, 'PENDING');
  assert.equal(glucoseSept.events.find((event) => event.id === '25').qc.targetSource, 'range');

  // ALT-GPT 2026-05-28: el BA400 marcó WARNING por 1-2s y el monitor lo publicó como rechazo; para Orion es alarma.
  const altMay = summarize([
    qcRow(40, '2026-05-28T14:36:10', { test: 'ALT-GPT', control: 'CONTROL 2', run: 1, value: 125.059242, min: 104, max: 150, validation: 'OK', status: 'accepted' }),
    qcRow(41, '2026-05-28T16:06:02', { test: 'ALT-GPT', control: 'CONTROL 1', run: 2, value: 43.24516, min: 30.4, max: 45.6, validation: 'WARNING', alarms: 'WESTGARD_1-2s', status: 'rejected' }),
  ]);
  const alt = altMay.tests[0];
  assert.equal(alt.stages.quality_control.effectiveStatus, 'accepted');
  assert.equal(alt.tone, 'alarm');
  assert.equal(altMay.tone, 'alarm');
  assert.deepEqual(altMay.qcNotices.alarm, ['ALT-GPT (nivel 1, 1-2s)']);
  assert.equal(altMay.events.find((event) => event.id === '41').monitorStatus, 'rejected');
  assert.equal(altMay.events.find((event) => event.id === '41').status, 'accepted');
  assert.deepEqual(altMay.toneTests, ['ALT-GPT']);

  // GLUCOSE 2026-05-28: los dos niveles a −18.7 DE → repetir los controles y advertencia del procesado.
  const glucoseMay = summarize([
    qcRow(30, '2026-05-28T14:34:11', { test: 'GLUCOSE', control: 'CONTROL 1', run: 1, value: 5.55845928, min: 75.1, max: 101.7, validation: 'ERROR', alarms: 'QC_OUT_OF_RANGE,WESTGARD_1-2s', status: 'rejected' }),
    qcRow(31, '2026-05-28T14:36:01', { test: 'GLUCOSE', control: 'CONTROL 2', run: 2, value: 15.5570917, min: 215, max: 291, validation: 'ERROR', alarms: 'QC_OUT_OF_RANGE,WESTGARD_1-2s', status: 'rejected' }),
  ]);
  const glucoseQc = glucoseMay.tests[0].qcVerdict;
  assert.equal(glucoseQc.status, 'pending');
  assert.equal(glucoseQc.severity, 'advertencia');
  assert.equal(glucoseQc.tone, 'warning');
  assert.equal(glucoseQc.verdict.needsRepeat, true);
  assert.deepEqual(glucoseMay.qcNotices.repeat, ['GLUCOSE (nivel 1 y nivel 2, 1-3s)']);
  assert.equal(bpl.isBplQcOutOfControl(glucoseMay.tests[0]), true);
  // …y los controles de septiembre (dentro de rango) son la sesión vigente: la de mayo queda en la historia.
  const glucoseBoth = summarize([...[30, 31].map((id) => qcRow(id, id === 30 ? '2026-05-28T14:34:11' : '2026-05-28T14:36:01', { test: 'GLUCOSE', control: id === 30 ? 'CONTROL 1' : 'CONTROL 2', run: id - 29, value: id === 30 ? 5.55845928 : 15.5570917, min: id === 30 ? 75.1 : 215, max: id === 30 ? 101.7 : 291, validation: 'ERROR', status: 'rejected' })),
    qcRow(26, '2026-09-21T16:17:44', { test: 'GLUCOSE', control: 'CONTROL 1', run: 3, value: 88.28517, min: 75.1, max: 101.7 }),
    qcRow(25, '2026-09-21T16:18:25', { test: 'GLUCOSE', control: 'CONTROL 2', run: 4, value: 248.6101, min: 215, max: 291 })]);
  assert.equal(glucoseBoth.tests[0].stages.quality_control.effectiveStatus, 'accepted');
  assert.equal(glucoseBoth.tone, 'accepted');

  // Un control de otro analizador no entra en la historia de la serie.
  const foreign = summarize([qcRow(50, '2026-06-22T13:55:00', { test: 'ALT-GPT', control: 'CONTROL 1', run: 3, value: 60, min: 30.4, max: 45.6, analyzer: '834009999', status: 'accepted' })]);
  assert.equal(foreign.events[0].westgard, null);
  assert.equal(foreign.events[0].status, 'accepted');

  // ---------- Calibración vigente: ALBUMIN-MAU 2026-09-28 ----------
  const calRow = (id, local, detected, { rerun, status, accepted, factor, abs, ws = '2026092801', order = 97 }) => ({
    id, effective_equipment_serial: serial, occurred_at: new Date(`${local}-06:00`).toISOString(), occurred_at_raw: `${local}.0000000-06:00`, detected_at: new Date(`${detected}-06:00`).toISOString(),
    event_type: 'bpl_analytical_result', bpl_stage: 'calibration', bpl_status: accepted ? 'accepted' : 'rejected', diagnostic_status: accepted ? 'calibration_accepted' : 'calibration_rejected',
    test_name: 'ALBUMIN-MAU', sample_class: 'CALIB', sample_type: 'URI', calibration_control_name: 'CAL MAU 058', calibration_control_lot_number: '058', missing_data_for_acceptance: [],
    payload: { database_record: { analyzer_id: serial, test_name: 'ALBUMIN-MAU', sample_class: 'CALIB', work_session_id: ws, order_test_id: order, rerun_number: rerun, multipoint_number: 1, order_test_status: status, accepted_result: accepted, validation_status: 'OK', calibrator_factor: factor, absorbance_value: abs, theoretical_concentration: 66.9, factor_lower_limit: null, factor_upper_limit: null, calibrator_name: 'CAL MAU 058', calibrator_lot_number: '058' } },
  });
  const mauRows = [
    calRow(1, '2026-09-28T16:39:20', '2026-09-28T16:39:23', { rerun: 1, status: 'CLOSED', accepted: true, factor: 413.925781, abs: 0.162779346 }),
    calRow(2, '2026-09-28T16:39:20', '2026-09-28T17:08:26', { rerun: 1, status: 'CLOSED', accepted: false, factor: 413.925781, abs: 0.162779346 }),
    calRow(3, '2026-09-28T17:08:24', '2026-09-28T17:08:26', { rerun: 2, status: 'CLOSED', accepted: true, factor: 392.9958, abs: 0.171387 }),
    calRow(4, '2026-09-28T17:08:24', '2026-09-28T17:41:38', { rerun: 2, status: 'CLOSED', accepted: false, factor: 392.9958, abs: 0.171387 }),
    // Histórico del BA400 (vhisWSBlankCalibResults) capturado el 9-oct: guarda la calibración de las 16:39 con la sesión en que la archivó.
    calRow(5, '2026-09-28T16:39:20', '2026-10-09T13:28:56', { rerun: 1, status: 'CLOSED', accepted: true, factor: 413.925781, abs: 0.162779346, ws: '2026100901', order: 86 }),
    // Blanco de la sesión del 9-oct (en vivo): esa sesión existe, pero el histórico del 28-sep no le pertenece.
    { id: 6, effective_equipment_serial: serial, occurred_at: '2026-10-09T20:30:42Z', occurred_at_raw: '2026-10-09T14:30:42.0000000-06:00', detected_at: '2026-10-09T20:30:45Z', event_type: 'bpl_analytical_result', bpl_stage: 'reagent_blank', bpl_status: 'accepted', test_name: 'ALBUMIN-MAU', sample_class: 'BLANK', sample_type: 'URI', payload: { database_record: { analyzer_id: serial, work_session_id: '2026100901', order_test_id: 100, rerun_number: 1, order_test_status: 'CLOSED', absorbance_value: 0.0014385581, blank_absorbance_limit: 1.5, validation_status: 'OK', accepted_result: true } } },
  ];
  // Pipeteo de la repetición 2 (16:55): queda vinculado a una ejecución no vigente, no es «evidencia nueva sin evaluar».
  mauRows.push({ id: 8, effective_equipment_serial: serial, occurred_at: '2026-09-28T22:55:39Z', occurred_at_raw: '2026-09-28 16:55:39', detected_at: '2026-09-28T22:55:42Z', event_type: 'bpl_consumption_record', bpl_stage: 'calibration', bpl_status: 'evidence_observed', diagnostic_status: 'pending_analytical_acceptance', test_name: 'ALBUMIN-MAU', sample_class: 'CALIB', sample_type: 'URI', calibration_control_name: 'CAL MAU 058', calibration_control_lot_number: '058', missing_data_for_acceptance: ['calibration_acceptance_status', 'calibration_curve'], payload: { reagent_volume_1: 240, sample_volume: 2 } });
  const mau = summarize(mauRows);
  const mauTest = mau.tests.find((test) => test.testKey === 'ALBUMIN-MAU');
  assert.equal(mauTest.stages.calibration.effectiveStatus, 'accepted', 'una repetición no vigente no es un rechazo');
  assert.equal(mauTest.stages.calibration.latestEvaluated.id, '5');
  assert.equal(mauTest.stages.calibration.note, 'La calibración del 28 sep, 17:08 no quedó vigente; sigue en uso la del 28 sep, 16:39 (factor 413.9258)');
  assert.equal(mauTest.stages.calibration.hasUnevaluatedNewer, false);
  assert.equal(mau.events.find((event) => event.id === '8').links.calibration.result.superseded, true);
  assert.equal(bpl.formatBplDiagnosticStatus('pending_analytical_acceptance'), 'Pipeteo registrado, resultado pendiente');
  assert.equal(bpl.formatBplMissingData('photometry_blank_acceptance_limit'), 'límite de aceptación del blanco fotométrico');
  assert.equal(bpl.formatBplMissingData('control_lot'), 'control_lot');
  assert.equal(mau.tone, 'accepted');
  assert.deepEqual(mau.rejectedTests, []);
  assert(mau.events.filter((event) => ['2', '4'].includes(event.id)).every((event) => event.superseded && event.status === 'evidence_observed'));
  assert.equal(mau.events.find((event) => event.id === '1').superseded, true, 'cuenta la última captura de la ejecución');
  assert.equal(bpl.formatBplDiagnosticStatus('calibration_superseded'), 'Calibración no vigente');
  // Sesiones: el histórico archivado el 9-oct pertenece a la sesión del 28-sep; el blanco del 9-oct, a la suya.
  assert.equal(mau.events.find((event) => event.id === '5').session.key, '2026092801');
  assert.equal(mau.events.find((event) => event.id === '6').session.key, '2026100901');
  // Un factor fuera de sus límites sí es rechazo.
  const outOfLimits = summarize([{ ...calRow(7, '2026-09-28T17:08:24', '2026-09-28T17:08:26', { rerun: 2, status: 'CLOSED', accepted: false, factor: 500, abs: 0.17 }), payload: { database_record: { ...calRow(7, '2026-09-28T17:08:24', '2026-09-28T17:08:26', { rerun: 2, status: 'CLOSED', accepted: false, factor: 500, abs: 0.17 }).payload.database_record, factor_lower_limit: 350, factor_upper_limit: 450 } } }]);
  assert.equal(outOfLimits.tests[0].stages.calibration.effectiveStatus, 'rejected');

  // ---------- Corte global y blanco fotométrico ----------
  // Sin payload, con el registro mínimo del corte global: mismo veredicto que el detalle.
  const lite = (row) => {
    const { payload, ...rest } = row;
    const flat = { ...rest };
    Object.entries(payload?.database_record || {}).forEach(([key, value]) => { if (value !== null && value !== undefined) flat[`db_${key}`] = String(value); });
    return flat;
  };
  const overview = bpl.buildBplSerialIndex([
    qcRow(40, '2026-05-28T14:36:10', { test: 'ALT-GPT', control: 'CONTROL 2', run: 1, value: 125.059242, min: 104, max: 150, validation: 'OK', status: 'accepted' }),
    qcRow(41, '2026-05-28T16:06:02', { test: 'ALT-GPT', control: 'CONTROL 1', run: 2, value: 43.24516, min: 30.4, max: 45.6, validation: 'WARNING', alarms: 'WESTGARD_1-2s', status: 'rejected' }),
    ...mauRows,
  ].map(lite)).get(serial);
  assert.equal(overview.hasPayload, false);
  assert.equal(overview.tests.find((test) => test.testKey === 'ALT-GPT').tone, 'alarm');
  assert.equal(overview.tests.find((test) => test.testKey === 'ALBUMIN-MAU').stages.calibration.effectiveStatus, 'accepted');
  assert.match(bpl.BPL_OVERVIEW_COLUMNS, /db_result_value:payload->database_record->>result_value/);
  assert.match(bpl.BPL_OVERVIEW_COLUMNS, /source_mtime:payload->>source_mtime/);
  assert.match(bpl.BPL_OVERVIEW_COLUMNS, /root_limits:payload->limits/);
  // Filas con el valor del control en la raíz del payload (equipo demo): el corte global también las evalúa.
  const demoOverview = bpl.buildBplSerialIndex([
    { id: 60, effective_equipment_serial: '834009999', occurred_at: '2026-10-10T03:48:35Z', detected_at: '2026-10-10T07:42:35Z', event_type: 'bpl_quality_control_result', bpl_stage: 'quality_control', bpl_status: 'rejected', test_name: 'GLUCOSE', sample_class: 'CTRL', calibration_control_name: 'CONTROL LEVEL I', calibration_control_lot_number: 'L-10', root_result_value: '140', root_unit: 'mg/dL', root_limits: { min: 80, max: 120, target: 100, sd: 5 } },
  ]).get('834009999');
  assert.equal(demoOverview.tests[0].tone, 'alarm');
  assert.equal(demoOverview.tests[0].qcVerdict.verdict.needsRepeat, true);

  // El blanco fotométrico no trae hora del analizador: vale la fecha del archivo BLResults.
  const photometry = bpl.normalizeBplEvent({ id: 9, effective_equipment_serial: serial, occurred_at: null, detected_at: '2026-09-28T18:07:44Z', event_type: 'bpl_photometry_blank', bpl_stage: 'instrument_photometry_blank', bpl_status: 'evidence_observed', payload: { source_mtime: '2026-08-12T17:10:59.190Z', photometry_blank_summary: { row_count: 8 } } });
  assert.equal(photometry.timestamp, '2026-08-12T17:10:59.190Z');
  assert.equal(photometry.localDay, '2026-08-12');

  console.log('PASS: Westgard de Orion (1-2s, 1-3s con repetición, 2-2s, 1-2s y R-4s entre niveles, viales intercambiados, 4-1s, 10x, 5x), sesiones, calibración vigente, corte global y blanco fotométrico.');
} finally {
  await vite.close();
}
