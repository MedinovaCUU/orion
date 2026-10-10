// Datos sintéticos BPL para la DEMO: los usan la vista previa local y tools/monitor-visual-demo.mjs.
// Nunca reutilizar la serie de un analizador instalado.

const pseudoRandom = (seed) => {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};

const shapeValue = (shape, cycle, base, amplitude) => {
  if (shape === 'endpoint') return base + amplitude * (1 - Math.exp(-cycle / 7));
  if (shape === 'kinetic_down') return base - amplitude * (cycle / 40);
  if (shape === 'lag') return base + amplitude / (1 + Math.exp(-(cycle - 14) / 3));
  return base + amplitude * (cycle / 40);
};

const curvePoint = (cycle, shape, base, amplitude, seed, withAbs2) => {
  const noise = (pseudoRandom(seed * 100 + cycle) - 0.5) * (shape === 'noisy' ? 0.012 : 0.0025);
  const abs1 = Number((shapeValue(shape, cycle, base, amplitude) + noise).toFixed(4));
  const abs2 = withAbs2 ? Number((base * 0.45 + amplitude * 0.12 * (cycle / 40) + noise * 0.5).toFixed(4)) : null;
  const minutes = 8 * 60 + 10 + cycle * 0.3;
  const readingAt = `2026-10-09 ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.floor(minutes % 60)).padStart(2, '0')}:${String(Math.round((minutes % 1) * 60)).padStart(2, '0')}`;
  return {
    cycle,
    abs1,
    abs2,
    dif: withAbs2 && abs2 !== null ? Number((abs1 - abs2).toFixed(4)) : null,
    reading_datetime: readingAt,
    pause: 0,
    reaction_complete: cycle === 40,
    readings: [{ main_counts: Math.round(118000 - abs1 * 90000), ref_counts: 140250, baseline_main_light: 150000, baseline_ref_light: 150500, main_dark: 120, ref_dark: 118, led_position: 5, absorbance: abs1, screen_absorbance: abs1, baseline_corrected_absorbance: Number((abs1 - 0.18).toFixed(5)) }],
  };
};

/** Zona horaria del analizador (hora de pared con desfase explícito), como en `occurred_at_raw`. */
const toAnalyzerLocal = (date) => {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const pad = (value) => String(Math.abs(value)).padStart(2, '0');
  const local = new Date(date.getTime() + offsetMinutes * 60e3);
  return `${local.toISOString().slice(0, 19)}.0000000${sign}${pad(Math.floor(Math.abs(offsetMinutes) / 60))}:${pad(Math.abs(offsetMinutes) % 60)}`;
};

/**
 * Construye las filas de `ba400_bpl_events` de la DEMO para una serie reservada.
 * `marker` se mezcla en cada payload para poder identificar y limpiar las filas propias.
 */
export function buildBplDemoRows({ serial, now = new Date(), marker = {} }) {
  const hoursAgo = (hours) => new Date(now.getTime() - hours * 3600e3).toISOString();
  const detectedAt = hoursAgo(0.1);
  // Mismas columnas que publica el monitor real; `source_file` y `line_number` van nulos como en la base Ax00.
  const row = (overrides) => ({
    effective_equipment_serial: serial,
    analyzer_sn: serial,
    event_category: 'bpl',
    rule_version: 'demo',
    rule_ids: [],
    missing_data_for_acceptance: [],
    source_file: null,
    source_basename: 'DEMO/ORION_VISUAL',
    line_number: null,
    detected_at: detectedAt,
    bpl_status: 'evidence_observed',
    diagnostic_status: 'evidence_observed',
    test_name: null,
    sample_class: null,
    sample_type: null,
    calibration_control_name: null,
    calibration_control_lot_number: null,
    ...overrides,
    occurred_at_raw: toAnalyzerLocal(new Date(overrides.occurred_at)),
    payload: { ...(overrides.payload || {}), ...marker },
  });

  const statusRows = [
    row({ occurred_at: hoursAgo(3), event_type: 'bpl_quality_control_result', bpl_stage: 'quality_control', bpl_status: 'rejected', diagnostic_status: 'quality_control_rejected', test_name: 'GLUCOSE', sample_class: 'CTRL', sample_type: 'SERUM', calibration_control_name: 'CONTROL LEVEL I', calibration_control_lot_number: 'L-10', rule_ids: ['BPL-QC-OBSERVED', 'DRI-QC-OUTSIDE-LIMIT'], payload: { result_value: 140, unit: 'mg/dL', limits: { min: 80, max: 120, target: 100, sd: 5 }, westgard_assessment: { status: 'reject', violated_rules: ['1_3s'] } } }),
    row({ occurred_at: hoursAgo(5), event_type: 'bpl_calibration_curve', bpl_stage: 'calibration', bpl_status: 'accepted', diagnostic_status: 'calibration_accepted', test_name: 'GLUCOSE', sample_class: 'CALIB', sample_type: 'SERUM', calibration_control_name: 'CAL BIO', calibration_control_lot_number: 'C-77', payload: { calibration_curve: { slope: 1.02, offset: 0.001, correlation: 0.9995, curve_type: 'LINEAR', relative_error: 1.2, points: [{ curve_point: 1, abs_value: 0.01, conc_value: 0 }, { curve_point: 2, abs_value: 0.5, conc_value: 100 }] } } }),
    row({ occurred_at: hoursAgo(6), event_type: 'bpl_analytical_result', bpl_stage: 'reagent_blank', bpl_status: 'accepted', diagnostic_status: 'blank_accepted', test_name: 'GLUCOSE', sample_class: 'BLANK', sample_type: 'SERUM', payload: { ABSValue: 0.012, BlankAbsorbanceLimit: 0.1 } }),
    row({ occurred_at: hoursAgo(6.2), event_type: 'bpl_consumption_record', bpl_stage: 'reagent_blank', diagnostic_status: 'blank_evidence_observed', rule_ids: ['BPL-BLANK-OBSERVED'], test_name: 'GLUCOSE', sample_class: 'BLANK', sample_type: 'SERUM', payload: { reagent_volume_1: 240, reagent_volume_2: 0, reagent_barcode_1: 'RB-GLU-DEMO-01', sample_volume: 3, raw_record: '[DEMO] GLUCOSE;BLANK' } }),
    row({ occurred_at: hoursAgo(7), event_type: 'bpl_photometry_blank', bpl_stage: 'instrument_photometry_blank', bpl_status: 'accepted', diagnostic_status: 'photometry_blank_accepted', test_name: '', payload: { '340': 0.001, '405': 0.002, '505': 0.0015, source_file: 'BLResults.res' } }),
    row({ occurred_at: hoursAgo(2), event_type: 'bpl_quality_control_result', bpl_stage: 'quality_control', bpl_status: 'pending', diagnostic_status: 'quality_control_pending', test_name: 'CHOLESTEROL', sample_class: 'CTRL', sample_type: 'SERUM', missing_data_for_acceptance: ['control_lot'], payload: { result_value: 180 } }),
    row({ occurred_at: hoursAgo(4), event_type: 'bpl_quality_control_result', bpl_stage: 'quality_control', bpl_status: 'accepted', diagnostic_status: 'quality_control_accepted', test_name: 'ALT-GPT', sample_class: 'CTRL', sample_type: 'SERUM', calibration_control_name: 'CONTROL LEVEL II', calibration_control_lot_number: 'L-11', payload: { result_value: 42, min_concentration: 30, max_concentration: 50, target_mean: 40, target_sd: 3 } }),
    row({ occurred_at: hoursAgo(4.5), event_type: 'bpl_calibration_curve', bpl_stage: 'calibration', bpl_status: 'accepted', diagnostic_status: 'calibration_accepted', test_name: 'ALT-GPT', sample_class: 'CALIB', sample_type: 'SERUM', calibration_control_name: 'CAL BIO', calibration_control_lot_number: 'C-77', payload: { slope: 0.98, correlation: 0.999 } }),
    row({ occurred_at: hoursAgo(4.6), event_type: 'bpl_analytical_result', bpl_stage: 'reagent_blank', bpl_status: 'accepted', diagnostic_status: 'blank_accepted', test_name: 'ALT-GPT', sample_class: 'BLANK', sample_type: 'SERUM', payload: { abs: 0.02, limit: 0.3 } }),
    row({ occurred_at: hoursAgo(8), event_type: 'bpl_analytical_result', bpl_stage: 'reagent_blank', bpl_status: 'accepted', diagnostic_status: 'blank_accepted', test_name: 'UREA-UV', sample_class: 'BLANK', sample_type: 'SERUM', payload: { abs: 0.9, limit: 1.5 } }),
  ];

  // Curvas con la misma forma que `payload.reaction_curve` del monitor (sesión, orden y ejecución numéricas).
  const curveRow = (seed, test, cls, ws, order, execution, replicate, hours, shape, base, amplitude, withAbs2) => {
    const occurredAt = hoursAgo(hours);
    const finalAbsorbance = Number(shapeValue(shape, 40, base, amplitude).toFixed(4));
    return row({
      occurred_at: occurredAt,
      event_type: 'bpl_reaction_curve',
      test_name: test,
      sample_class: cls,
      sample_type: 'SERUM',
      bpl_stage: cls === 'CTRL' ? 'quality_control' : cls === 'CALIB' ? 'calibration' : 'reagent_blank',
      bpl_status: 'evidence_observed',
      diagnostic_status: 'reaction_curve_observed',
      rule_ids: ['BPL-REACTION-CURVE-OBSERVED'],
      payload: {
        reaction_curve: {
          source: 'current',
          work_session_id: ws,
          order_test_id: order,
          execution_id: execution,
          replicate_number: replicate,
          rerun_number: 1,
          multipoint_number: 1,
          execution_type: cls === 'BLANK' ? 'PREP_STD' : cls === 'CALIB' ? 'CALIB' : 'CTRL',
          execution_status: 'CLOSED',
          well_used: 20 + seed % 60,
          sample_volume: 2,
          reagent1_volume: 240,
          reagent2_volume: withAbs2 ? 60 : 0,
          abs_initial: Number(shapeValue(shape, 1, base, amplitude).toFixed(4)),
          abs_main_filter: null,
          abs_work_reagent: null,
          result_datetime: toAnalyzerLocal(new Date(occurredAt)),
          calculation_version: 'screen-abs-v2',
          absorbance_calculation: 'log10(2000000 / (main_counts - main_dark))',
          baseline_corrected_absorbance_calculation: 'log10((main_signal / ref_signal) / (baseline_main_signal / baseline_ref_signal))',
          kinetics: { r: null, slope: null, linear: null, initial_value: null },
          baselines: [{ baseline_id: 2, baseline_type: 'DYNAMIC', led_position: 5, main_dark: 120, ref_dark: 118, baseline_main_light: 150000, baseline_ref_light: 150500, baseline_abs_by_well: 0.0014 }],
          final_absorbance: finalAbsorbance,
          points: Array.from({ length: 40 }, (_, index) => curvePoint(index + 1, shape, base, amplitude, seed, withAbs2)),
        },
      },
    });
  };

  const curveRows = [
    curveRow(101, 'GLUCOSE', 'CTRL', '2026100901', 501, 11, 1, 3, 'endpoint', 0.12, 0.42, true),
    curveRow(102, 'GLUCOSE', 'CTRL', '2026100901', 501, 12, 2, 3, 'endpoint', 0.121, 0.405, true),
    curveRow(103, 'GLUCOSE', 'CTRL', '2026100901', 501, 13, 3, 3, 'endpoint', 0.118, 0.43, true),
    curveRow(104, 'ALT-GPT', 'CALIB', '2026100901', 502, 14, 1, 4.5, 'kinetic_down', 0.92, 0.3, false),
    curveRow(105, 'ALT-GPT', 'CALIB', '2026100901', 502, 15, 2, 4.5, 'kinetic_down', 0.915, 0.31, false),
    curveRow(106, 'GLUCOSE', 'CALIB', '2026100901', 498, 16, 1, 5, 'endpoint', 0.1, 0.5, true),
    curveRow(107, 'GLUCOSE', 'CALIB', '2026100901', 498, 17, 2, 5, 'endpoint', 0.102, 0.49, true),
    curveRow(108, 'CHOLESTEROL', 'CTRL', '2026100901', 510, 18, 1, 2, 'noisy', 0.3, 0.2, true),
    curveRow(109, 'CHOLESTEROL', 'CTRL', '2026100901', 510, 19, 2, 2, 'noisy', 0.31, 0.19, true),
    curveRow(110, 'UREA-UV', 'BLANK', '2026100901', 480, 20, 1, 8, 'lag', 0.88, 0.25, true),
    curveRow(111, 'GLUCOSE', 'CTRL', '2026100801', 420, 21, 1, 30, 'endpoint', 0.11, 0.41, true),
    curveRow(112, 'GLUCOSE', 'CTRL', '2026100801', 420, 22, 2, 30, 'endpoint', 0.112, 0.4, true),
  ];

  return { statusRows, curveRows };
}
