import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

// Curvas de reacción BPL: parseo del payload, agrupación por sesión/orden, métricas y filtros.
const vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
try {
  const curves = await vite.ssrLoadModule('/src/modules/equipment-monitoring/bplReactionCurves.ts');
  const bpl = await vite.ssrLoadModule('/src/modules/equipment-monitoring/bplEvents.ts');

  const point = (cycle, abs1, abs2, dif) => ({ cycle, abs1, abs2, dif, reading_datetime: `2026-10-09 08:${String(10 + cycle).padStart(2, '0')}:00`, readings: [{ main_counts: 120000 - cycle * 100, ref_counts: 140000, baseline_main_light: 150000, baseline_ref_light: 150500, main_dark: 120, ref_dark: 118 }] });
  const payload = (overrides, points) => ({ reaction_curve: { work_session_id: 'WS-1', order_test_id: '101', execution_id: 'E-1', replicate_number: 1, result_datetime: '2026-10-09 08:45:00', final_absorbance: 0.52, points, ...overrides } });

  const parsed = curves.parseReactionCurvePayload(payload({}, [point(2, 0.2, 0.1, 0.1), point(1, 0.1, 0.05, 0.05), point(3, 0.3, null, null)]));
  assert.equal(parsed.workSessionId, 'WS-1');
  assert.equal(parsed.orderTestId, '101');
  assert.equal(parsed.replicateNumber, 1);
  assert.equal(parsed.finalAbsorbance, 0.52);
  assert.deepEqual(parsed.points.map((item) => item.cycle), [1, 2, 3], 'puntos ordenados por ciclo');
  assert.equal(parsed.points[0].readings[0].mainCounts, 119900);
  assert.equal(parsed.points[2].abs2, null);
  assert.equal(curves.parseReactionCurvePayload({ other: true }), null);
  assert.equal(curves.parseReactionCurvePayload(JSON.stringify(payload({}, [point(1, 0.1, null, null)]))).points.length, 1, 'payload serializado como texto');

  // Fila del índice: claves extraídas por PostgREST como texto, sin payload.
  const indexRow = { id: 7, occurred_at: '2026-10-09 14:00:00', effective_equipment_serial: '834001902', event_type: 'bpl_reaction_curve', test_name: 'GLUCOSE', sample_class: 'CTRL', sample_type: 'SERUM', bpl_stage: 'quality_control', bpl_status: 'evidence_observed', work_session_id: 'WS-1', order_test_id: '101', execution_id: 'E-2', replicate_number: '2', result_datetime: '2026-10-09 08:45:00', final_absorbance: '0.512' };
  const replicate = curves.normalizeReactionReplicate(indexRow);
  assert.equal(replicate.id, '7');
  assert.equal(replicate.replicateNumber, 2);
  assert.equal(replicate.finalAbsorbance, 0.512);
  assert.equal(replicate.points, null, 'sin payload los puntos quedan pendientes');
  assert.equal(replicate.occurredAt, '2026-10-09T14:00:00.000Z', 'occurred_at sin zona se toma como UTC');
  assert.equal(replicate.sampleType, 'SERUM');
  assert.equal(curves.normalizeReactionReplicate({ ...indexRow, event_type: 'bpl_quality_control_result' }), null);
  const fullRow = { ...indexRow, id: 8, replicate_number: null, work_session_id: null, order_test_id: null, payload: payload({ replicate_number: 3 }, [point(1, 0.1, 0.2, -0.1), point(2, 0.2, 0.25, -0.05)]) };
  const fullReplicate = curves.normalizeReactionReplicate(fullRow);
  assert.equal(fullReplicate.replicateNumber, 3, 'cae al payload cuando la columna extraída viene vacía');
  assert.equal(fullReplicate.workSessionId, 'WS-1');
  assert.equal(fullReplicate.points.length, 2);

  const rows = [
    { ...indexRow, id: 1, replicate_number: '1', occurred_at: '2026-10-09T14:00:00+00:00', payload: payload({ replicate_number: 1 }, [point(1, 0.1, 0.05, 0.05), point(2, 0.2, 0.1, 0.1), point(3, 0.3, 0.15, 0.15)]) },
    { ...indexRow, id: 2, replicate_number: '2', occurred_at: '2026-10-09T14:00:05+00:00', payload: payload({ replicate_number: 2, execution_id: 'E-2' }, [point(1, 0.11, null, null), point(2, 0.21, null, null), point(3, 0.31, null, null)]) },
    { ...indexRow, id: 3, test_name: 'ALT-GPT', sample_class: 'CALIB', order_test_id: '102', occurred_at: '2026-10-08T10:00:00+00:00', bpl_status: 'rejected', diagnostic_status: 'calibration_rejected', payload: payload({ order_test_id: '102', replicate_number: 1 }, [point(1, 0.5, null, null), point(2, 0.4, null, null)]) },
    { ...indexRow, id: 4, test_name: 'GLUCOSE', order_test_id: '90', work_session_id: 'WS-0', occurred_at: '2026-10-01T10:00:00+00:00', payload: payload({ work_session_id: 'WS-0', order_test_id: '90' }, [point(1, 0.9, null, null)]) },
  ];
  const replicates = rows.map(curves.normalizeReactionReplicate);
  const groups = curves.groupReactionReplicates(replicates);
  assert.deepEqual(groups.map((group) => group.key), ['WS-1|101', 'WS-1|102', 'WS-0|90'], 'agrupa por sesión y orden, más reciente primero');
  const glucose = groups[0];
  assert.deepEqual(glucose.replicates.map((item) => item.replicateNumber), [1, 2]);
  assert.equal(glucose.pointsLoaded, true);
  assert.equal(glucose.cycleCount, 3);
  assert.equal(glucose.status, 'evidence_observed');
  assert.equal(groups[1].status, 'rejected');
  assert.deepEqual(curves.reactionGroupMetrics(glucose), ['abs1', 'abs2', 'dif']);
  assert.deepEqual(curves.reactionGroupMetrics(groups[1]), ['abs1'], 'abs2/dif nulos no se ofrecen');

  const series = curves.buildReactionSeries(glucose, 'abs2');
  assert.equal(series.length, 1, 'la réplica sin abs2 no se dibuja en esa métrica');
  assert.equal(series[0].replicate.replicateNumber, 1);
  assert.equal(series[0].color, '#2a78d6');
  assert.equal(curves.buildReactionSeries(glucose, 'abs1', new Set([1])).length, 1);
  assert.equal(curves.buildReactionSeries(glucose, 'abs1', new Set([1]))[0].color, '#1baf7a', 'el color sigue a la réplica, no al orden visible');
  const summary = curves.summarizeReactionSeries(curves.buildReactionSeries(glucose, 'abs1'));
  assert.equal(summary.cycleMin, 1);
  assert.equal(summary.cycleMax, 3);
  assert.equal(Number(summary.delta.toFixed(4)), 0.2);
  assert.equal(Number(summary.slope.toFixed(4)), 0.1);
  assert.equal(summary.pointCount, 6);
  assert.equal(curves.summarizeReactionSeries([]), null);

  const latest = curves.latestReactionGroupByTest(groups);
  assert.equal(latest.get('GLUCOSE').key, 'WS-1|101');
  assert.equal(latest.get('ALT-GPT').key, 'WS-1|102');
  assert.equal(curves.filterReactionGroups(groups, { testKey: 'GLUCOSE' }).length, 2);
  assert.equal(curves.filterReactionGroups(groups, { sampleClass: 'CALIB' }).length, 1);
  assert.equal(curves.filterReactionGroups(groups, { from: '2026-10-09' }).length, 1);
  assert.equal(curves.filterReactionGroups(groups, { to: '2026-10-08' }).length, 2);
  assert.equal(curves.filterReactionGroups(groups, { from: '2026-10-02', to: '2026-10-08' }).length, 1);

  // Puntos perezosos: el índice sin payload se completa con los puntos descargados después.
  const pending = curves.normalizeReactionReplicate({ ...indexRow, id: 9 });
  const merged = curves.mergeReplicatePoints([pending], new Map([['9', parsed.points]]));
  assert.equal(merged[0].points.length, 3);
  assert.equal(curves.mergeReplicatePoints([pending], new Map())[0].points, null);
  assert.equal(curves.reactionReplicateColor(7), '#6b7f92', 'más allá de la paleta se usa grafito, nunca se reciclan tonos');

  // Tiempo: columnas en UTC → local; horas del analizador en el payload se muestran tal cual.
  assert.equal(curves.parseBplTimestamp('2026-10-09 14:00:00').toISOString(), '2026-10-09T14:00:00.000Z');
  assert.equal(curves.parseBplTimestamp('2026-10-09T14:00:00-06:00').toISOString(), '2026-10-09T20:00:00.000Z');
  const wallClock = curves.parseBplTimestamp('2026-10-09 08:15:00', { assumeUtc: false });
  assert.equal(wallClock.getHours(), 8);
  assert.equal(wallClock.getMinutes(), 15);
  assert.equal(curves.parseBplTimestamp(''), null);
  assert.match(curves.formatReactionTime('2026-10-09 08:15:00', { assumeUtc: false, withDate: false }), /8:15:00/);

  // Versión de cálculo: solo screen-abs-v2 se grafica; la absorbancia corregida queda como dato técnico.
  const versioned = (id, version, detectedAt, abs1) => ({
    ...indexRow,
    id,
    detected_at: detectedAt,
    calculation_version: version,
    payload: payload({ replicate_number: 2, ...(version ? { calculation_version: version } : {}) }, [{ ...point(1, abs1, null, null), readings: [{ main_counts: 1, ref_counts: 2, baseline_corrected_absorbance: -0.05783 }] }]),
  });
  const legacy = curves.normalizeReactionReplicate(versioned(20, null, '2026-10-09T15:00:00Z', -0.05783));
  assert.equal(legacy.calculationVersion, null);
  assert.equal(curves.isSupportedReactionReplicate(legacy), false);
  const current = curves.normalizeReactionReplicate(versioned(21, 'screen-abs-v2', '2026-10-09T14:00:00Z', 0.2101));
  assert.equal(current.calculationVersion, 'screen-abs-v2');
  assert.equal(current.detectedAt, '2026-10-09T14:00:00.000Z');
  assert.equal(current.points[0].abs1, 0.2101, 'abs1 se grafica tal cual');
  assert.equal(current.points[0].readings[0].baselineCorrectedAbsorbance, -0.05783, 'la corregida se conserva solo para la tabla');
  const republished = curves.normalizeReactionReplicate(versioned(22, 'screen-abs-v2', '2026-10-09T16:30:00Z', 0.2205));
  const prepared = curves.prepareReactionReplicates([versioned(20, null, '2026-10-09T17:00:00Z', -0.05783), versioned(21, 'screen-abs-v2', '2026-10-09T14:00:00Z', 0.2101), versioned(22, 'screen-abs-v2', '2026-10-09T16:30:00Z', 0.2205)]);
  assert.deepEqual(prepared.map((item) => item.id), ['22'], 'descarta la fila sin versión y conserva la republicación más reciente por detected_at');
  assert.equal(prepared[0].points[0].abs1, 0.2205);
  assert.deepEqual(curves.dedupeReactionReplicates([current, republished]).map((item) => item.id), ['22']);
  assert.deepEqual(curves.dedupeReactionReplicates([republished, current]).map((item) => item.id), ['22'], 'el orden de llegada no cambia la elección');
  const distinctExecution = { ...republished, id: '23', executionId: 'E-9' };
  assert.equal(curves.dedupeReactionReplicates([republished, distinctExecution]).length, 2, 'otra ejecución es otra curva');
  assert.equal(curves.groupReactionReplicates([current, republished])[0].replicates.length, 1, 'la agrupación también deduplica');
  assert.equal(curves.BPL_REACTION_INDEX_COLUMNS.includes('calculation_version:payload->reaction_curve->>calculation_version'), true);

  // Fila con la forma real del monitor (2026-10-09): offsets de zona con siete decimales y contexto de ejecución.
  const realRow = {
    id: 1000, monitor_name: 'ba400-tracecomm-834001902', effective_equipment_serial: '834001902', event_category: 'bpl', event_type: 'bpl_reaction_curve',
    bpl_stage: 'reagent_blank', bpl_status: 'evidence_observed', diagnostic_status: 'reaction_curve_observed', rule_ids: ['BPL-REACTION-CURVE-OBSERVED'], missing_data_for_acceptance: [],
    occurred_at: '2026-10-09T20:30:42+00:00', occurred_at_raw: '2026-10-09T14:30:42.0000000-06:00', analyzer_sn: '834001902', test_name: 'ALBUMIN-MAU', sample_class: 'BLANK', sample_type: 'URI',
    line_hash: '8c3967b4', detected_at: '2026-10-10T00:42:46.908+00:00',
    payload: { reaction_curve: {
      source: 'current', kinetics: { r: null, slope: null, linear: null, initial_value: null }, well_used: 25, abs_initial: 0.9453137, execution_id: 3, rerun_number: 1, order_test_id: 100,
      sample_volume: 2, execution_type: 'PREP_STD', abs_main_filter: null, reagent1_volume: 240, reagent2_volume: 60, result_datetime: '2026-10-09T14:30:42.0000000-06:00', work_session_id: '2026100901',
      abs_work_reagent: null, execution_status: 'CLOSED', final_absorbance: 0.000967144966, replicate_number: 3, multipoint_number: 1, calculation_version: 'screen-abs-v2',
      points: [{ dif: null, abs1: 0.36331455963664594, abs2: null, cycle: 3, pause: 0, reaction_complete: true, reading_datetime: '2026-10-09T14:23:03.0000000-06:00',
        readings: [{ ref_dark: 3987, main_dark: 3948, absorbance: 0.36331455963664594, ref_counts: 541902, main_counts: 870342, led_position: 5, screen_absorbance: 0.36331455963664594, baseline_ref_light: 546706, baseline_main_light: 884649, baseline_corrected_absorbance: -0.0032516823645265466 }] }],
    } },
  };
  const real = curves.normalizeReactionReplicate(realRow);
  assert.equal(real.workSessionId, '2026100901');
  assert.equal(real.orderTestId, '100');
  assert.equal(real.executionId, '3');
  assert.equal(real.replicateNumber, 3);
  assert.equal(real.calculationVersion, 'screen-abs-v2');
  assert.equal(real.sampleType, 'URI');
  assert.equal(real.occurredAt, '2026-10-09T20:30:42.000Z');
  assert.equal(real.detectedAt, '2026-10-10T00:42:46.908Z');
  assert.equal(real.points[0].abs1, 0.36331455963664594);
  assert.equal(real.points[0].readings[0].baselineCorrectedAbsorbance, -0.0032516823645265466);
  assert.equal(curves.parseBplTimestamp(real.points[0].readingAt, { assumeUtc: false }).toISOString(), '2026-10-09T20:23:03.000Z', 'offset con siete decimales');
  assert.deepEqual(real.execution, { wellUsed: 25, executionType: 'PREP_STD', executionStatus: 'CLOSED', rerunNumber: 1, sampleVolume: 2, reagent1Volume: 240, reagent2Volume: 60, absInitial: 0.9453137, absMainFilter: null, absWorkReagent: null });
  assert.equal(curves.describeReactionExecution(real.execution), 'Pozo 25 · PREP_STD · CLOSED · R1 240 µL · R2 60 µL · Muestra 2 µL · Abs inicial 0.9453');
  assert.equal(curves.describeReactionExecution(null), '');
  const indexOnly = curves.normalizeReactionReplicate({ ...realRow, payload: undefined, work_session_id: '2026100901', order_test_id: '100', execution_id: '3', replicate_number: '3', calculation_version: 'screen-abs-v2' });
  assert.equal(indexOnly.execution, null, 'sin payload no hay contexto de ejecución');
  const mergedReal = curves.mergeReplicatePoints([indexOnly], new Map([['1000', { points: real.points, execution: real.execution }]]))[0];
  assert.equal(mergedReal.execution.wellUsed, 25, 'el contexto llega con los puntos descargados');
  assert.equal(mergedReal.points.length, 1);

  // Las curvas no alteran el estado BPL de la serie.
  const statusRows = [
    { id: 1, effective_equipment_serial: '834001902', occurred_at: '2026-10-09T10:00:00Z', event_type: 'bpl_quality_control_result', bpl_stage: 'quality_control', bpl_status: 'accepted', test_name: 'GLUCOSE' },
    { id: 2, effective_equipment_serial: '834001902', occurred_at: '2026-10-09T11:00:00Z', event_type: 'bpl_reaction_curve', bpl_stage: 'quality_control', bpl_status: 'evidence_observed', test_name: 'GLUCOSE' },
  ];
  const statusSummary = bpl.buildBplSerialIndex(statusRows).get('834001902');
  assert.equal(statusSummary.events.length, 1);
  assert.equal(statusSummary.tests[0].stages.quality_control.hasUnevaluatedNewer, false, 'la curva no cuenta como evidencia nueva sin evaluar');
  assert.equal(statusSummary.tone, 'accepted');

  console.log(`PASS: curvas de reacción · ${groups.length} reacciones agrupadas, métricas, series, filtros y tiempos.`);
} finally {
  await vite.close();
}
