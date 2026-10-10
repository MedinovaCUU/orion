/**
 * Lectura compartida de `ba400_bpl_events`: normaliza filas del monitor BPL
 * (blancos, calibraciones, controles y consumos) y construye el resumen por serie
 * que usan Monitoreo y DRI. El payload llega con nombres distintos según la fuente
 * (CSV de consumo, base Ax00, BLResults.res), por eso la lectura es tolerante.
 */

export const BPL_EVENTS_TABLE = 'ba400_bpl_events';

/** Columnas ligeras para el corte global; el payload solo se pide por serie seleccionada. */
export const BPL_OVERVIEW_COLUMNS =
  'occurred_at,detected_at,effective_equipment_serial,event_type,bpl_stage,bpl_status,diagnostic_status,test_name,sample_class,calibration_control_name,calibration_control_lot_number,missing_data_for_acceptance,rule_ids';

export type BplStage = 'instrument_photometry_blank' | 'reagent_blank' | 'calibration' | 'quality_control';
export type BplStatus = 'evidence_observed' | 'accepted' | 'rejected' | 'pending';
export type BplSampleClass = 'BLANK' | 'CALIB' | 'CTRL';
export type BplTone = 'rejected' | 'pending' | 'accepted' | 'observed' | 'none';
export type BplControlLevel = 'level_1' | 'level_2' | 'level_3';

export const BPL_STAGES: BplStage[] = ['instrument_photometry_blank', 'reagent_blank', 'calibration', 'quality_control'];

export const BPL_STAGE_LABELS: Record<BplStage, string> = {
  instrument_photometry_blank: 'Blanco fotométrico',
  reagent_blank: 'Blanco de reactivo',
  calibration: 'Calibración',
  quality_control: 'Control de calidad',
};

export const BPL_STAGE_SHORT_LABELS: Record<BplStage, string> = {
  instrument_photometry_blank: 'BF',
  reagent_blank: 'BL',
  calibration: 'CAL',
  quality_control: 'QC',
};

export const BPL_STATUS_LABELS: Record<BplStatus, string> = {
  evidence_observed: 'Evidencia observada',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  pending: 'Pendiente',
};

export const BPL_TONE_LABELS: Record<BplTone, string> = {
  rejected: 'BPL con rechazo',
  pending: 'BPL pendiente',
  accepted: 'BPL aceptado',
  observed: 'BPL en observación',
  none: 'Sin evidencia BPL',
};

export const BPL_EVENT_TYPE_LABELS: Record<string, string> = {
  bpl_consumption_record: 'Registro de consumo',
  bpl_analytical_result: 'Resultado analítico',
  bpl_quality_control_result: 'Resultado de control',
  bpl_calibration_curve: 'Curva de calibración',
  bpl_photometry_blank: 'Blanco fotométrico',
};

/** Fila tal como la entrega Supabase; `payload` solo viene en la consulta por serie. */
export interface BplEventRow {
  id?: number | string | null;
  occurred_at?: string | null;
  detected_at?: string | null;
  effective_equipment_serial?: string | null;
  event_type?: string | null;
  bpl_stage?: string | null;
  bpl_status?: string | null;
  diagnostic_status?: string | null;
  test_name?: string | null;
  sample_class?: string | null;
  sample_type?: string | null;
  calibration_control_name?: string | null;
  calibration_control_lot_number?: string | null;
  missing_data_for_acceptance?: unknown;
  rule_ids?: unknown;
  payload?: unknown;
}

export interface BplQcDetail {
  resultValue: number | null;
  unit: string | null;
  targetMean: number | null;
  targetSd: number | null;
  minLimit: number | null;
  maxLimit: number | null;
  zScore: number | null;
  withinLimits: boolean | null;
  direction: 'high' | 'low' | null;
  controlLevel: BplControlLevel | null;
  alarms: string[];
  westgardRules: string[];
  westgardAssessment: string | null;
  validationStatus: string | null;
  excluded: boolean | null;
  runNumber: number | null;
}

export interface BplCalibrationPoint {
  point: number | null;
  absorbance: number | null;
  concentration: number | null;
}

export interface BplCalibrationDetail {
  points: BplCalibrationPoint[];
  slope: number | null;
  offset: number | null;
  correlation: number | null;
  curveType: string | null;
  growthType: string | null;
  relativeError: number | null;
  factor: number | null;
  factorLowerLimit: number | null;
  factorUpperLimit: number | null;
  numberOfCalibrators: number | null;
  theoreticalConcentration: number | null;
  unit: string | null;
  alarms: string[];
  accepted: boolean | null;
}

export interface BplBlankDetail {
  absorbance: number | null;
  absorbanceInitial: number | null;
  absorbanceMainFilter: number | null;
  workReagentAbsorbance: number | null;
  absorbanceLimit: number | null;
  kineticBlankLimit: number | null;
  withinLimit: boolean | null;
  filterLabel: string | null;
  readings: Array<{ label: string; value: number }>;
  alarms: string[];
}

export interface BplConsumptionDetail {
  reagentVolume1: number | null;
  reagentVolume2: number | null;
  reagentBarcode1: string | null;
  reagentBarcode2: string | null;
  sampleVolume: number | null;
  rawRecord: string | null;
}

export interface BplAnalyticalDetail {
  absorbance: number | null;
  concentration: number | null;
  unit: string | null;
  validationStatus: string | null;
  accepted: boolean | null;
  calibratorFactor: number | null;
  errors: string[];
  alarms: string[];
}

/** Evento normalizado: una fila de la tabla con payload interpretado por etapa. */
export interface BplEvent {
  key: string;
  id: string | null;
  serial: string;
  rawSerial: string;
  eventType: string;
  stage: BplStage | null;
  status: BplStatus;
  diagnosticStatus: string | null;
  testName: string | null;
  testKey: string;
  sampleClass: BplSampleClass | null;
  sampleType: string | null;
  controlOrCalibratorName: string | null;
  lotNumber: string | null;
  missingData: string[];
  ruleIds: string[];
  occurredAt: string | null;
  detectedAt: string | null;
  timestamp: string | null;
  hasPayload: boolean;
  qc: BplQcDetail | null;
  calibration: BplCalibrationDetail | null;
  blank: BplBlankDetail | null;
  consumption: BplConsumptionDetail | null;
  analytical: BplAnalyticalDetail | null;
}

export interface BplStageCounts {
  accepted: number;
  rejected: number;
  pending: number;
  observed: number;
  total: number;
}

/** Estado vigente de una etapa: la última evaluación manda, salvo evidencia nueva sin evaluar. */
export interface BplStageState {
  stage: BplStage;
  latest: BplEvent | null;
  latestEvaluated: BplEvent | null;
  effectiveStatus: BplStatus | null;
  hasUnevaluatedNewer: boolean;
  counts: BplStageCounts;
}

export interface BplTestSnapshot {
  testKey: string;
  testName: string;
  stages: Partial<Record<BplStage, BplStageState>>;
  effectiveStatus: BplStatus | null;
  chainAccepted: boolean;
  lastEventAt: string | null;
  eventCount: number;
  calibratorName: string | null;
  calibratorLot: string | null;
  controlName: string | null;
  controlLot: string | null;
  reagentBarcodes: string[];
  missingData: string[];
  ruleIds: string[];
  /** Transiciones aceptado↔rechazado dentro de la ventana; dos o más sugieren un patrón intermitente. */
  statusFlips: number;
}

export interface BplStageOverview {
  stage: BplStage;
  testsAccepted: number;
  testsRejected: number;
  testsPending: number;
  testsObserved: number;
  lastEvent: BplEvent | null;
  counts: BplStageCounts;
}

export interface BplSerialSummary {
  serial: string;
  events: BplEvent[];
  tests: BplTestSnapshot[];
  stages: Record<BplStage, BplStageOverview>;
  counts: BplStageCounts & { consumption: number };
  tone: BplTone;
  lastEventAt: string | null;
  lastDetectedAt: string | null;
  rejectedTests: string[];
  pendingTests: string[];
  acceptedTests: string[];
  missingData: string[];
  calibrators: Array<{ name: string | null; lot: string | null; lastAt: string | null; tests: string[] }>;
  controls: Array<{ name: string | null; lot: string | null; lastAt: string | null; tests: string[] }>;
  reagentBarcodes: Array<{ barcode: string; tests: string[]; lastAt: string | null }>;
  hasPayload: boolean;
}

const STATUS_RANK: Record<BplStatus, number> = {
  rejected: 4,
  pending: 3,
  evidence_observed: 2,
  accepted: 1,
};

const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

export const normalizeBplSerial = (value?: string | null) => {
  const normalized = (value || '').trim().toUpperCase().replace(/\s+/g, '');
  return normalized || '';
};

export const normalizeBplTestKey = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed.startsWith('{')) return null;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return null;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    if (!normalized || /[a-df-z]/i.test(normalized)) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'si', 'sí', 'accepted', 'ok', 'pass', 'passed'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'rejected', 'ko', 'fail', 'failed'].includes(normalized)) return false;
  }
  return null;
};

const toText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
};

/** Listas que pueden llegar como arreglo, JSON serializado o texto separado por comas. */
export const toStringList = (value: unknown): string[] => {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>;
          const label = toText(record.id ?? record.rule_id ?? record.ruleId ?? record.code ?? record.name ?? record.label ?? record.alarm_id ?? record.alarmId);
          return label ? [label] : [];
        }
        const text = toText(item);
        return text ? [text] : [];
      });
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        return toStringList(JSON.parse(trimmed));
      } catch {
        // Texto plano con corchetes; cae al separador.
      }
    }
    return trimmed
      .replace(/^[[{]|[\]}]$/g, '')
      .split(/[,;|\n]+/)
      .map((item) => item.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const nested = record.items ?? record.rules ?? record.values ?? record.list;
    if (nested !== undefined) return toStringList(nested);
    return Object.entries(record)
      .filter(([, item]) => item === true || item === 1)
      .map(([key]) => key);
  }
  const text = toText(value);
  return text ? [text] : [];
};

/**
 * Busca la primera clave candidata en el registro y en sus objetos anidados
 * (dos niveles), ignorando mayúsculas y guiones bajos: `ResultValue`, `result_value`
 * y `resultValue` son equivalentes.
 */
const pickValue = (record: Record<string, unknown> | null, candidates: string[], depth = 2): unknown => {
  if (!record) return undefined;
  const wanted = candidates.map(normalizeKey);
  const queue: Array<{ node: Record<string, unknown>; level: number }> = [{ node: record, level: 0 }];
  while (queue.length) {
    const { node, level } = queue.shift()!;
    const entries = Object.entries(node);
    for (const target of wanted) {
      const found = entries.find(([key, value]) => normalizeKey(key) === target && value !== null && value !== undefined && value !== '');
      if (found) return found[1];
    }
    if (level < depth) {
      entries.forEach(([, value]) => {
        const nested = toRecord(value);
        if (nested) queue.push({ node: nested, level: level + 1 });
      });
    }
  }
  return undefined;
};

const pickNumber = (record: Record<string, unknown> | null, candidates: string[]) => toFiniteNumber(pickValue(record, candidates));
const pickText = (record: Record<string, unknown> | null, candidates: string[]) => toText(pickValue(record, candidates));
const pickBoolean = (record: Record<string, unknown> | null, candidates: string[]) => toBoolean(pickValue(record, candidates));
const pickList = (record: Record<string, unknown> | null, candidates: string[]) => toStringList(pickValue(record, candidates));
const pickRecord = (record: Record<string, unknown> | null, candidates: string[]) => toRecord(pickValue(record, candidates, 1));

export const normalizeBplStatus = (value?: string | null): BplStatus => {
  const normalized = (value || '').trim().toLowerCase();
  if (['accepted', 'accept', 'ok', 'aceptado', 'pass', 'passed', 'valid'].includes(normalized)) return 'accepted';
  if (['rejected', 'reject', 'ko', 'rechazado', 'fail', 'failed', 'invalid'].includes(normalized)) return 'rejected';
  if (['pending', 'pendiente', 'incomplete'].includes(normalized)) return 'pending';
  return 'evidence_observed';
};

export const normalizeBplStage = (row: Pick<BplEventRow, 'bpl_stage' | 'event_type' | 'sample_class'>): BplStage | null => {
  const stage = (row.bpl_stage || '').trim().toLowerCase();
  if (stage.includes('photometry')) return 'instrument_photometry_blank';
  if (stage === 'reagent_blank' || stage === 'blank') return 'reagent_blank';
  if (stage.startsWith('calib')) return 'calibration';
  if (stage.includes('quality') || stage === 'qc' || stage.includes('control')) return 'quality_control';

  const eventType = (row.event_type || '').trim().toLowerCase();
  if (eventType === 'bpl_photometry_blank') return 'instrument_photometry_blank';
  if (eventType === 'bpl_calibration_curve') return 'calibration';
  if (eventType === 'bpl_quality_control_result') return 'quality_control';

  const sampleClass = (row.sample_class || '').trim().toUpperCase();
  if (sampleClass === 'BLANK') return 'reagent_blank';
  if (sampleClass === 'CALIB') return 'calibration';
  if (sampleClass === 'CTRL') return 'quality_control';
  return null;
};

const normalizeSampleClass = (value?: string | null): BplSampleClass | null => {
  const normalized = (value || '').trim().toUpperCase();
  if (normalized === 'BLANK' || normalized === 'CALIB' || normalized === 'CTRL') return normalized;
  return null;
};

export const inferBplControlLevel = (value?: string | null): BplControlLevel | null => {
  const text = (value || '').trim().toUpperCase();
  if (!text) return null;
  if (/\b(LEVEL|NIVEL|LVL|L|N)?\s*[-_]?\s*(III|3)\b/.test(text) || /\b(LEVEL|NIVEL)[\s_-]*3\b/.test(text)) return 'level_3';
  if (/\b(II|2)\b/.test(text) || /(LEVEL|NIVEL|LVL|L|N)[\s_-]*2/.test(text) || /\b(HIGH|ALTO|PATH|PATOL|ABNORMAL|ANORMAL)\b/.test(text)) return 'level_2';
  if (/\b(I|1)\b/.test(text) || /(LEVEL|NIVEL|LVL|L|N)[\s_-]*1/.test(text) || /\b(LOW|BAJO|NORMAL)\b/.test(text)) return 'level_1';
  return null;
};

const parseQcDetail = (payload: Record<string, unknown> | null, row: BplEventRow): BplQcDetail | null => {
  if (!payload) return null;
  const limits = pickRecord(payload, ['limits', 'control_limits', 'qc_limits', 'control', 'limites']);
  const resultValue = pickNumber(payload, ['result_value', 'resultvalue', 'result', 'value', 'concentration', 'conc_value', 'measured_value', 'obtained_value', 'manual_result_value']);
  const targetMean = pickNumber(limits, ['target_mean', 'target', 'mean', 'media']) ?? pickNumber(payload, ['target_mean', 'target', 'expected_mean', 'mean', 'media', 'target_value']);
  const targetSd = pickNumber(limits, ['target_sd', 'sd', 'standard_deviation', 'desviacion']) ?? pickNumber(payload, ['target_sd', 'sd', 'standard_deviation', 'desviacion_estandar']);
  const minLimit = pickNumber(limits, ['min_concentration', 'min', 'lower', 'lower_limit', 'low', 'minimo']) ?? pickNumber(payload, ['min_concentration', 'min_limit', 'lower_limit', 'limit_min', 'min', 'minimo']);
  const maxLimit = pickNumber(limits, ['max_concentration', 'max', 'upper', 'upper_limit', 'high', 'maximo']) ?? pickNumber(payload, ['max_concentration', 'max_limit', 'upper_limit', 'limit_max', 'max', 'maximo']);
  const westgard = pickValue(payload, ['westgard_assessment', 'westgard', 'westgard_rules', 'westgard_evaluation']);
  const westgardRecord = toRecord(westgard);
  const westgardRules = westgardRecord
    ? pickList(westgardRecord, ['violated_rules', 'failed_rules', 'triggered_rules', 'rules_violated', 'rules', 'rule_ids', 'violations', 'alarms'])
    : toStringList(westgard);
  const westgardAssessment = westgardRecord
    ? pickText(westgardRecord, ['status', 'assessment', 'result', 'summary', 'verdict', 'outcome', 'level'])
    : typeof westgard === 'string' && !westgardRules.length
      ? westgard.trim() || null
      : null;
  const explicitZ = pickNumber(payload, ['z_score', 'zscore', 'z', 'sdi']);
  const zScore =
    explicitZ ?? (resultValue !== null && targetMean !== null && targetSd ? Math.round(((resultValue - targetMean) / targetSd) * 100) / 100 : null);
  const withinLimits =
    resultValue !== null && minLimit !== null && maxLimit !== null ? resultValue >= minLimit && resultValue <= maxLimit : null;
  const direction =
    resultValue !== null && maxLimit !== null && resultValue > maxLimit
      ? 'high'
      : resultValue !== null && minLimit !== null && resultValue < minLimit
        ? 'low'
        : zScore !== null && Math.abs(zScore) >= 2
          ? zScore > 0
            ? 'high'
            : 'low'
          : null;
  return {
    resultValue,
    unit: pickText(payload, ['unit', 'measure_unit', 'units', 'unidad']),
    targetMean,
    targetSd,
    minLimit,
    maxLimit,
    zScore,
    withinLimits,
    direction,
    controlLevel: inferBplControlLevel(pickText(payload, ['control_level', 'level', 'nivel']) || row.calibration_control_name),
    alarms: pickList(payload, ['alarms', 'alarm_list', 'alarm_ids', 'qc_alarms', 'alarmas']),
    westgardRules,
    westgardAssessment,
    validationStatus: pickText(payload, ['validation_status', 'validationstatus', 'evaluation', 'evaluacion', 'qc_status']),
    excluded: pickBoolean(payload, ['excluded', 'excluido']),
    runNumber: pickNumber(payload, ['run_number', 'runnumber', 'runs_group_number']),
  };
};

const parseCalibrationPoints = (value: unknown): BplCalibrationPoint[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map<BplCalibrationPoint | null>((item, index) => {
      if (Array.isArray(item)) {
        return { point: index + 1, absorbance: toFiniteNumber(item[0]), concentration: toFiniteNumber(item[1]) };
      }
      const record = toRecord(item);
      if (!record) return null;
      return {
        point: pickNumber(record, ['curve_point', 'point', 'index', 'n']) ?? index + 1,
        absorbance: pickNumber(record, ['abs_value', 'absorbance', 'abs', 'x', 'absorbancia']),
        concentration: pickNumber(record, ['conc_value', 'concentration', 'conc', 'y', 'concentracion']),
      };
    })
    .filter((item): item is BplCalibrationPoint => Boolean(item));
};

const parseCalibrationDetail = (payload: Record<string, unknown> | null): BplCalibrationDetail | null => {
  if (!payload) return null;
  const curve = pickRecord(payload, ['calibration_curve', 'curve', 'curva']) || payload;
  const points = parseCalibrationPoints(pickValue(curve, ['points', 'curve_points', 'puntos']) ?? pickValue(payload, ['points', 'curve_points']));
  const source = (candidates: string[]) => pickNumber(curve, candidates) ?? pickNumber(payload, candidates);
  const text = (candidates: string[]) => pickText(curve, candidates) ?? pickText(payload, candidates);
  return {
    points,
    slope: source(['curve_slope', 'slope', 'pendiente']),
    offset: source(['curve_offset', 'curve_off_set', 'offset', 'intercept', 'ordenada']),
    correlation: source(['curve_correlation', 'correlation', 'correlation_coefficient', 'r', 'r2', 'correlacion']),
    curveType: text(['curve_type', 'curvetype', 'type', 'tipo_curva', 'tipo']),
    growthType: text(['curve_growth_type', 'growth_type', 'growth']),
    relativeError: source(['relative_error_curve', 'relative_error', 'error_relativo', 'curve_error', 'error']),
    factor: source(['calibrator_factor', 'factor']),
    factorLowerLimit: source(['factor_lower_limit', 'factor_min', 'factor_low']),
    factorUpperLimit: source(['factor_upper_limit', 'factor_max', 'factor_high']),
    numberOfCalibrators: source(['number_of_calibrators', 'calibrators', 'n_calibrators']),
    theoreticalConcentration: source(['theoretical_concentration', 'theorical_concentration', 'theoretical']),
    unit: text(['measure_unit', 'unit', 'units', 'unidad']),
    alarms: pickList(payload, ['alarms', 'alarm_list', 'alarmas']),
    accepted: pickBoolean(payload, ['accepted_result_flag', 'accepted', 'aceptada', 'is_accepted']),
  };
};

const parseBlankDetail = (payload: Record<string, unknown> | null, stage: BplStage | null): BplBlankDetail | null => {
  if (!payload) return null;
  const absorbance = pickNumber(payload, ['abs_value', 'absorbance', 'abs', 'blank_absorbance', 'blank_abs', 'result_value', 'result', 'value', 'absorbancia']);
  const absorbanceLimit = pickNumber(payload, ['blank_absorbance_limit', 'absorbance_limit', 'abs_limit', 'limit', 'limite']);
  const readingsSource = pickValue(payload, ['readings', 'filters', 'channels', 'wavelengths', 'lecturas', 'filtros']);
  const readings: Array<{ label: string; value: number }> = [];
  if (Array.isArray(readingsSource)) {
    readingsSource.forEach((item, index) => {
      const record = toRecord(item);
      const value = record ? pickNumber(record, ['value', 'abs', 'absorbance', 'abs_value', 'reading', 'counts']) : toFiniteNumber(item);
      if (value === null) return;
      const label = record ? pickText(record, ['filter', 'wavelength', 'label', 'nm', 'channel', 'name']) || `#${index + 1}` : `#${index + 1}`;
      readings.push({ label, value });
    });
  } else {
    const record = toRecord(readingsSource);
    if (record) {
      Object.entries(record).forEach(([label, item]) => {
        const value = toFiniteNumber(item);
        if (value !== null) readings.push({ label, value });
      });
    }
  }
  if (!readings.length && stage === 'instrument_photometry_blank') {
    // BLResults.res suele traer una lectura por filtro con la longitud de onda como clave.
    Object.entries(payload).forEach(([key, item]) => {
      if (/^(f|filter|nm)?[_\s-]?\d{3}(nm)?$/i.test(key)) {
        const value = toFiniteNumber(item);
        if (value !== null) readings.push({ label: key.replace(/[^0-9]/g, ''), value });
      }
    });
  }
  return {
    absorbance,
    absorbanceInitial: pickNumber(payload, ['abs_initial', 'initial_absorbance', 'absorbance_initial']),
    absorbanceMainFilter: pickNumber(payload, ['abs_main_filter', 'main_filter_absorbance']),
    workReagentAbsorbance: pickNumber(payload, ['abs_work_reagent', 'work_reagent_absorbance', 'reagent_absorbance']),
    absorbanceLimit,
    kineticBlankLimit: pickNumber(payload, ['kinetic_blank_limit', 'kinetic_limit']),
    withinLimit: absorbance !== null && absorbanceLimit !== null ? Math.abs(absorbance) <= Math.abs(absorbanceLimit) : null,
    filterLabel: pickText(payload, ['main_filter', 'filter', 'wavelength', 'primary_wavelength', 'filtro']),
    readings,
    alarms: pickList(payload, ['alarms', 'alarm_list', 'alarmas']),
  };
};

const parseConsumptionDetail = (payload: Record<string, unknown> | null): BplConsumptionDetail | null => {
  if (!payload) return null;
  return {
    reagentVolume1: pickNumber(payload, ['reagent_volume_1', 'reagentvolume1', 'vr1', 'r1_volume']),
    reagentVolume2: pickNumber(payload, ['reagent_volume_2', 'reagentvolume2', 'vr2', 'r2_volume']),
    reagentBarcode1: pickText(payload, ['reagent_barcode_1', 'reagentbarcode1', 'barcode_1', 'r1_barcode']),
    reagentBarcode2: pickText(payload, ['reagent_barcode_2', 'reagentbarcode2', 'barcode_2', 'r2_barcode']),
    sampleVolume: pickNumber(payload, ['sample_volume', 'samplevolume', 'vs']),
    rawRecord: pickText(payload, ['raw_record', 'raw', 'raw_line']),
  };
};

const parseAnalyticalDetail = (payload: Record<string, unknown> | null): BplAnalyticalDetail | null => {
  if (!payload) return null;
  const errors = [
    pickText(payload, ['abs_error', 'absorbance_error']),
    pickText(payload, ['conc_error', 'concentration_error']),
    pickText(payload, ['calibration_error']),
  ].filter((item): item is string => Boolean(item));
  return {
    absorbance: pickNumber(payload, ['abs_value', 'absorbance', 'abs']),
    concentration: pickNumber(payload, ['conc_value', 'concentration', 'result_value', 'result', 'value']),
    unit: pickText(payload, ['measure_unit', 'unit', 'units']),
    validationStatus: pickText(payload, ['validation_status', 'validationstatus', 'evaluation', 'status']),
    accepted: pickBoolean(payload, ['accepted_result_flag', 'accepted', 'is_accepted']),
    calibratorFactor: pickNumber(payload, ['calibrator_factor', 'factor']),
    errors,
    alarms: pickList(payload, ['alarms', 'alarm_list', 'alarmas']),
  };
};

const toIsoOrNull = (value?: string | null) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? value : null;
};

/** Convierte una fila cruda en evento tipado; nunca lanza, las partes ilegibles quedan en null. */
export const normalizeBplEvent = (row: BplEventRow): BplEvent | null => {
  const rawSerial = (row.effective_equipment_serial || '').trim();
  const serial = normalizeBplSerial(rawSerial);
  if (!serial) return null;
  const payload = toRecord(row.payload);
  const stage = normalizeBplStage(row);
  const status = normalizeBplStatus(row.bpl_status);
  const eventType = (row.event_type || '').trim() || 'bpl_event';
  const occurredAt = toIsoOrNull(row.occurred_at);
  const detectedAt = toIsoOrNull(row.detected_at);
  const testName = (row.test_name || '').trim() || null;
  const sampleClass = normalizeSampleClass(row.sample_class);
  const lotNumber = (row.calibration_control_lot_number || '').trim() || null;
  const id = row.id === null || row.id === undefined ? null : String(row.id);
  const isQc = stage === 'quality_control' && eventType !== 'bpl_consumption_record';
  const isCalibration = stage === 'calibration' && eventType !== 'bpl_consumption_record';
  const isBlank = (stage === 'reagent_blank' || stage === 'instrument_photometry_blank') && eventType !== 'bpl_consumption_record';
  return {
    key: [serial, eventType, occurredAt || detectedAt || '', normalizeBplTestKey(testName), sampleClass || '', lotNumber || '', id || ''].join('|'),
    id,
    serial,
    rawSerial,
    eventType,
    stage,
    status,
    diagnosticStatus: (row.diagnostic_status || '').trim() || null,
    testName,
    testKey: normalizeBplTestKey(testName) || (stage === 'instrument_photometry_blank' ? 'INSTRUMENTO' : 'SIN PRUEBA'),
    sampleClass,
    sampleType: (row.sample_type || '').trim() || null,
    controlOrCalibratorName: (row.calibration_control_name || '').trim() || null,
    lotNumber,
    missingData: toStringList(row.missing_data_for_acceptance),
    ruleIds: toStringList(row.rule_ids),
    occurredAt,
    detectedAt,
    timestamp: occurredAt || detectedAt,
    hasPayload: Boolean(payload),
    qc: isQc ? parseQcDetail(payload, row) : null,
    calibration: isCalibration ? parseCalibrationDetail(payload) : null,
    blank: isBlank ? parseBlankDetail(payload, stage) : null,
    consumption: eventType === 'bpl_consumption_record' ? parseConsumptionDetail(payload) : null,
    analytical: eventType === 'bpl_analytical_result' ? parseAnalyticalDetail(payload) : null,
  };
};

const timestampValue = (event: BplEvent) => (event.timestamp ? new Date(event.timestamp).getTime() : 0);

export const compareBplEventsDesc = (left: BplEvent, right: BplEvent) => {
  const diff = timestampValue(right) - timestampValue(left);
  if (diff !== 0) return diff;
  return (right.detectedAt || '').localeCompare(left.detectedAt || '');
};

const emptyCounts = (): BplStageCounts => ({ accepted: 0, rejected: 0, pending: 0, observed: 0, total: 0 });

const countStatus = (counts: BplStageCounts, status: BplStatus) => {
  counts.total += 1;
  if (status === 'accepted') counts.accepted += 1;
  else if (status === 'rejected') counts.rejected += 1;
  else if (status === 'pending') counts.pending += 1;
  else counts.observed += 1;
};

const isEvaluated = (event: BplEvent) => event.status === 'accepted' || event.status === 'rejected';

/** Los registros de consumo solo documentan que la etapa se ejecutó; no evalúan aceptación. */
const buildStageState = (stage: BplStage, events: BplEvent[]): BplStageState => {
  const sorted = [...events].sort(compareBplEventsDesc);
  const counts = emptyCounts();
  sorted.forEach((event) => countStatus(counts, event.status));
  const latest = sorted[0] || null;
  const latestEvaluated = sorted.find(isEvaluated) || null;
  const effectiveStatus = latest ? (isEvaluated(latest) ? latest.status : latestEvaluated?.status || latest.status) : null;
  return {
    stage,
    latest,
    latestEvaluated,
    effectiveStatus,
    hasUnevaluatedNewer: Boolean(latest && latestEvaluated && latest !== latestEvaluated && !isEvaluated(latest)),
    counts,
  };
};

const worstStatus = (statuses: Array<BplStatus | null | undefined>): BplStatus | null =>
  statuses.reduce<BplStatus | null>((worst, status) => {
    if (!status) return worst;
    if (!worst || STATUS_RANK[status] > STATUS_RANK[worst]) return status;
    return worst;
  }, null);

const unique = (values: Array<string | null | undefined>) => Array.from(new Set(values.filter((value): value is string => Boolean(value))));

const latestByTimestamp = <T extends { lastAt: string | null }>(items: T[]) =>
  [...items].sort((left, right) => (right.lastAt || '').localeCompare(left.lastAt || ''));

export const bplToneFromStatus = (status: BplStatus | null): BplTone => {
  if (status === 'rejected') return 'rejected';
  if (status === 'pending') return 'pending';
  if (status === 'accepted') return 'accepted';
  if (status === 'evidence_observed') return 'observed';
  return 'none';
};

/** Las curvas de reacción son evidencia fotométrica, no estados BPL; se resumen aparte. */
export const isBplReactionCurveEvent = (event: Pick<BplEvent, 'eventType'>) => event.eventType === 'bpl_reaction_curve';

export const buildBplSerialSummary = (serial: string, events: BplEvent[]): BplSerialSummary => {
  const sorted = events.filter((event) => !isBplReactionCurveEvent(event)).sort(compareBplEventsDesc);
  const byTest = new Map<string, BplEvent[]>();
  sorted.forEach((event) => {
    const bucket = byTest.get(event.testKey) || [];
    bucket.push(event);
    byTest.set(event.testKey, bucket);
  });

  const tests: BplTestSnapshot[] = Array.from(byTest.entries()).map(([testKey, testEvents]) => {
    const stages: Partial<Record<BplStage, BplStageState>> = {};
    BPL_STAGES.forEach((stage) => {
      const stageEvents = testEvents.filter((event) => event.stage === stage);
      if (stageEvents.length) stages[stage] = buildStageState(stage, stageEvents);
    });
    const stageStatuses = BPL_STAGES.map((stage) => stages[stage]?.effectiveStatus);
    const chainStages: BplStage[] = ['reagent_blank', 'calibration', 'quality_control'];
    const chainAccepted =
      chainStages.some((stage) => stages[stage]) &&
      chainStages.every((stage) => !stages[stage] || stages[stage]?.effectiveStatus === 'accepted');
    const evaluated = [...testEvents].filter(isEvaluated).sort((left, right) => compareBplEventsDesc(right, left));
    let statusFlips = 0;
    evaluated.forEach((event, index) => {
      if (index > 0 && evaluated[index - 1].status !== event.status) statusFlips += 1;
    });
    const latestCalibration = testEvents.find((event) => event.stage === 'calibration' && (event.controlOrCalibratorName || event.lotNumber));
    const latestControl = testEvents.find((event) => event.stage === 'quality_control' && (event.controlOrCalibratorName || event.lotNumber));
    return {
      testKey,
      testName: testEvents.find((event) => event.testName)?.testName || testKey,
      stages,
      effectiveStatus: worstStatus(stageStatuses),
      chainAccepted,
      lastEventAt: testEvents[0]?.timestamp || null,
      eventCount: testEvents.length,
      calibratorName: latestCalibration?.controlOrCalibratorName || null,
      calibratorLot: latestCalibration?.lotNumber || null,
      controlName: latestControl?.controlOrCalibratorName || null,
      controlLot: latestControl?.lotNumber || null,
      reagentBarcodes: unique(testEvents.flatMap((event) => [event.consumption?.reagentBarcode1, event.consumption?.reagentBarcode2])),
      missingData: unique(testEvents.flatMap((event) => event.missingData)),
      ruleIds: unique(testEvents.flatMap((event) => event.ruleIds)),
      statusFlips,
    };
  });

  tests.sort((left, right) => {
    const rankDiff = (right.effectiveStatus ? STATUS_RANK[right.effectiveStatus] : 0) - (left.effectiveStatus ? STATUS_RANK[left.effectiveStatus] : 0);
    if (rankDiff !== 0) return rankDiff;
    const timeDiff = (right.lastEventAt || '').localeCompare(left.lastEventAt || '');
    if (timeDiff !== 0) return timeDiff;
    return left.testName.localeCompare(right.testName, 'es-MX');
  });

  const stages = BPL_STAGES.reduce<Record<BplStage, BplStageOverview>>((accumulator, stage) => {
    const counts = emptyCounts();
    sorted.filter((event) => event.stage === stage).forEach((event) => countStatus(counts, event.status));
    const statuses = tests.map((test) => test.stages[stage]?.effectiveStatus).filter(Boolean) as BplStatus[];
    accumulator[stage] = {
      stage,
      testsAccepted: statuses.filter((status) => status === 'accepted').length,
      testsRejected: statuses.filter((status) => status === 'rejected').length,
      testsPending: statuses.filter((status) => status === 'pending').length,
      testsObserved: statuses.filter((status) => status === 'evidence_observed').length,
      lastEvent: sorted.find((event) => event.stage === stage) || null,
      counts,
    };
    return accumulator;
  }, {} as Record<BplStage, BplStageOverview>);

  const counts = { ...emptyCounts(), consumption: 0 };
  sorted.forEach((event) => {
    countStatus(counts, event.status);
    if (event.eventType === 'bpl_consumption_record') counts.consumption += 1;
  });

  const groupLots = (stage: BplStage) => {
    const map = new Map<string, { name: string | null; lot: string | null; lastAt: string | null; tests: string[] }>();
    sorted
      .filter((event) => event.stage === stage && (event.controlOrCalibratorName || event.lotNumber))
      .forEach((event) => {
        const key = `${event.controlOrCalibratorName || ''}|${event.lotNumber || ''}`;
        const current = map.get(key) || { name: event.controlOrCalibratorName, lot: event.lotNumber, lastAt: null, tests: [] };
        if (!current.lastAt || (event.timestamp || '') > current.lastAt) current.lastAt = event.timestamp;
        if (event.testName && !current.tests.includes(event.testName)) current.tests.push(event.testName);
        map.set(key, current);
      });
    return latestByTimestamp(Array.from(map.values()));
  };

  const barcodeMap = new Map<string, { barcode: string; tests: string[]; lastAt: string | null }>();
  sorted.forEach((event) => {
    [event.consumption?.reagentBarcode1, event.consumption?.reagentBarcode2].forEach((barcode) => {
      if (!barcode) return;
      const current = barcodeMap.get(barcode) || { barcode, tests: [], lastAt: null };
      if (!current.lastAt || (event.timestamp || '') > current.lastAt) current.lastAt = event.timestamp;
      if (event.testName && !current.tests.includes(event.testName)) current.tests.push(event.testName);
      barcodeMap.set(barcode, current);
    });
  });

  const rejectedTests = tests.filter((test) => test.effectiveStatus === 'rejected').map((test) => test.testName);
  const pendingTests = tests.filter((test) => test.effectiveStatus === 'pending').map((test) => test.testName);
  const acceptedTests = tests.filter((test) => test.effectiveStatus === 'accepted').map((test) => test.testName);
  const tone = bplToneFromStatus(worstStatus(tests.map((test) => test.effectiveStatus)));

  return {
    serial,
    events: sorted,
    tests,
    stages,
    counts,
    tone: sorted.length ? tone : 'none',
    lastEventAt: sorted[0]?.timestamp || null,
    lastDetectedAt: sorted.reduce<string | null>((latest, event) => (event.detectedAt && (!latest || event.detectedAt > latest) ? event.detectedAt : latest), null),
    rejectedTests,
    pendingTests,
    acceptedTests,
    missingData: unique(sorted.flatMap((event) => event.missingData)),
    calibrators: groupLots('calibration'),
    controls: groupLots('quality_control'),
    reagentBarcodes: latestByTimestamp(Array.from(barcodeMap.values())),
    hasPayload: sorted.some((event) => event.hasPayload),
  };
};

/** Agrupa filas crudas por serie normalizada; filas sin serie se descartan. */
export const buildBplSerialIndex = (rows: BplEventRow[]) => {
  const grouped = new Map<string, BplEvent[]>();
  rows.forEach((row) => {
    const event = normalizeBplEvent(row);
    if (!event || isBplReactionCurveEvent(event)) return;
    const bucket = grouped.get(event.serial) || [];
    bucket.push(event);
    grouped.set(event.serial, bucket);
  });
  const index = new Map<string, BplSerialSummary>();
  grouped.forEach((events, serial) => index.set(serial, buildBplSerialSummary(serial, events)));
  return index;
};

const DIAGNOSTIC_PREFIX_LABELS: Array<[RegExp, string]> = [
  [/^photometry(_blank)?/, 'Blanco fotométrico'],
  [/^instrument(_photometry)?(_blank)?/, 'Blanco fotométrico'],
  [/^reagent_blank|^blank/, 'Blanco'],
  [/^calibration|^calib/, 'Calibración'],
  [/^quality_control|^qc|^control/, 'Control de calidad'],
  [/^consumption/, 'Consumo'],
];

const DIAGNOSTIC_SUFFIX_LABELS: Array<[RegExp, string]> = [
  [/accepted$/, 'aceptado'],
  [/rejected$/, 'rechazado'],
  [/pending$/, 'pendiente'],
  [/evidence_observed$|observed$/, 'con evidencia observada'],
  [/missing(_data)?$/, 'con datos faltantes'],
  [/out_of_range$|out_of_limits$/, 'fuera de límites'],
  [/warning$/, 'con advertencia'],
];

/** Traduce `diagnostic_status` (por ejemplo `calibration_rejected`) a una frase operativa. */
export const formatBplDiagnosticStatus = (value?: string | null) => {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return 'Sin diagnóstico';
  const prefix = DIAGNOSTIC_PREFIX_LABELS.find(([pattern]) => pattern.test(normalized))?.[1];
  const suffix = DIAGNOSTIC_SUFFIX_LABELS.find(([pattern]) => pattern.test(normalized))?.[1];
  if (prefix && suffix) return `${prefix} ${suffix}`;
  return normalized.replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());
};

export const formatBplEventTypeLabel = (eventType: string) =>
  BPL_EVENT_TYPE_LABELS[eventType] || eventType.replace(/^bpl_/, '').replace(/_/g, ' ');

export const formatBplNumber = (value: number | null | undefined, decimals = 2) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/D';
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: decimals }).format(value);
};

/** Resumen corto de la evidencia de un evento para tarjetas y bitácoras. */
export const summarizeBplEventMetrics = (event: BplEvent): string[] => {
  const parts: string[] = [];
  if (event.qc) {
    if (event.qc.resultValue !== null) parts.push(`Resultado ${formatBplNumber(event.qc.resultValue, 3)}${event.qc.unit ? ` ${event.qc.unit}` : ''}`);
    if (event.qc.minLimit !== null && event.qc.maxLimit !== null) parts.push(`Límites ${formatBplNumber(event.qc.minLimit, 3)} a ${formatBplNumber(event.qc.maxLimit, 3)}`);
    else if (event.qc.targetMean !== null) parts.push(`Media ${formatBplNumber(event.qc.targetMean, 3)}${event.qc.targetSd !== null ? ` ± ${formatBplNumber(event.qc.targetSd, 3)}` : ''}`);
    if (event.qc.zScore !== null) parts.push(`Z ${formatBplNumber(event.qc.zScore, 2)}`);
    if (event.qc.westgardRules.length) parts.push(`Westgard ${event.qc.westgardRules.join(', ')}`);
    else if (event.qc.westgardAssessment) parts.push(`Westgard ${event.qc.westgardAssessment}`);
    if (event.qc.alarms.length) parts.push(`Alarmas ${event.qc.alarms.join(', ')}`);
  }
  if (event.calibration) {
    if (event.calibration.correlation !== null) parts.push(`r ${formatBplNumber(event.calibration.correlation, 4)}`);
    if (event.calibration.slope !== null) parts.push(`Pendiente ${formatBplNumber(event.calibration.slope, 4)}`);
    if (event.calibration.offset !== null) parts.push(`Offset ${formatBplNumber(event.calibration.offset, 4)}`);
    if (event.calibration.relativeError !== null) parts.push(`Error relativo ${formatBplNumber(event.calibration.relativeError, 2)}`);
    if (event.calibration.curveType) parts.push(`Curva ${event.calibration.curveType}`);
    if (event.calibration.points.length) parts.push(`${event.calibration.points.length} puntos`);
    if (event.calibration.factor !== null) parts.push(`Factor ${formatBplNumber(event.calibration.factor, 4)}`);
    if (event.calibration.alarms.length) parts.push(`Alarmas ${event.calibration.alarms.join(', ')}`);
  }
  if (event.blank) {
    if (event.blank.absorbance !== null) parts.push(`Abs ${formatBplNumber(event.blank.absorbance, 4)}`);
    if (event.blank.absorbanceLimit !== null) parts.push(`Límite ${formatBplNumber(event.blank.absorbanceLimit, 4)}`);
    if (event.blank.workReagentAbsorbance !== null) parts.push(`Reactivo de trabajo ${formatBplNumber(event.blank.workReagentAbsorbance, 4)}`);
    if (event.blank.readings.length) parts.push(`${event.blank.readings.length} filtros leídos`);
    if (event.blank.alarms.length) parts.push(`Alarmas ${event.blank.alarms.join(', ')}`);
  }
  if (event.consumption) {
    const volumes = [
      event.consumption.reagentVolume1 !== null ? `R1 ${formatBplNumber(event.consumption.reagentVolume1, 1)} µL` : null,
      event.consumption.reagentVolume2 !== null ? `R2 ${formatBplNumber(event.consumption.reagentVolume2, 1)} µL` : null,
      event.consumption.sampleVolume !== null ? `Muestra ${formatBplNumber(event.consumption.sampleVolume, 1)} µL` : null,
    ].filter(Boolean);
    if (volumes.length) parts.push(volumes.join(' · '));
    const barcodes = [event.consumption.reagentBarcode1, event.consumption.reagentBarcode2].filter(Boolean);
    if (barcodes.length) parts.push(`Reactivo ${barcodes.join(' / ')}`);
  }
  if (event.analytical) {
    if (event.analytical.concentration !== null) parts.push(`Conc ${formatBplNumber(event.analytical.concentration, 3)}${event.analytical.unit ? ` ${event.analytical.unit}` : ''}`);
    if (event.analytical.absorbance !== null) parts.push(`Abs ${formatBplNumber(event.analytical.absorbance, 4)}`);
    if (event.analytical.validationStatus) parts.push(`Validación ${event.analytical.validationStatus}`);
    if (event.analytical.errors.length) parts.push(`Errores ${event.analytical.errors.join(', ')}`);
  }
  return parts;
};
