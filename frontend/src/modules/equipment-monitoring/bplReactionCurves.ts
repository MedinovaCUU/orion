/**
 * Curvas de reacción del BA400 publicadas en `ba400_bpl_events` con
 * `event_type = 'bpl_reaction_curve'`. Cada fila es una réplica; los puntos
 * (ciclo, abs1, abs2, dif, lecturas crudas) viven en `payload.reaction_curve`.
 * Las curvas no participan del estado BPL (aceptado/rechazado): son evidencia
 * fotométrica para leer la cinética de una reacción.
 */
import { normalizeBplStage, normalizeBplStatus, normalizeBplSerial, normalizeBplTestKey, type BplStage, type BplStatus } from './bplEvents';

export const BPL_REACTION_CURVE_EVENT_TYPE = 'bpl_reaction_curve';

/**
 * Única versión de cálculo válida para graficar. Las filas sin `calculation_version`
 * venían con la fórmula equivocada (absorbancias negativas) y se descartan.
 */
export const BPL_REACTION_CALCULATION_VERSION = 'screen-abs-v2';
export const BPL_REACTION_CALCULATION_VERSION_PATH = 'payload->reaction_curve->>calculation_version';

/** Índice ligero: metadatos de columnas y claves de agrupación extraídas del JSON, sin puntos. */
export const BPL_REACTION_INDEX_COLUMNS = [
  'id',
  'occurred_at',
  'detected_at',
  'effective_equipment_serial',
  'event_type',
  'test_name',
  'sample_class',
  'sample_type',
  'bpl_stage',
  'bpl_status',
  'diagnostic_status',
  'work_session_id:payload->reaction_curve->>work_session_id',
  'order_test_id:payload->reaction_curve->>order_test_id',
  'execution_id:payload->reaction_curve->>execution_id',
  'replicate_number:payload->reaction_curve->>replicate_number',
  'result_datetime:payload->reaction_curve->>result_datetime',
  'final_absorbance:payload->reaction_curve->>final_absorbance',
  'calculation_version:payload->reaction_curve->>calculation_version',
].join(',');

export type ReactionMetric = 'abs1' | 'abs2' | 'dif';

export const REACTION_METRICS: ReactionMetric[] = ['abs1', 'abs2', 'dif'];

export const REACTION_METRIC_LABELS: Record<ReactionMetric, string> = {
  abs1: 'Abs1',
  abs2: 'Abs2',
  dif: 'Dif',
};

/**
 * Paleta categórica por réplica (identidad, orden fijo). Validada con el método
 * de dataviz: banda de luminosidad, croma, separación CVD y piso normal en superficie
 * perla. Aqua y magenta quedan bajo 3:1 de contraste, por eso la tabla de puntos y
 * la leyenda acompañan siempre a la gráfica.
 */
export const REACTION_REPLICATE_PALETTE = ['#2a78d6', '#1baf7a', '#4a3aa7', '#e87ba4'] as const;
export const REACTION_REPLICATE_FALLBACK_COLOR = '#6b7f92';

export const reactionReplicateColor = (index: number) => REACTION_REPLICATE_PALETTE[index] ?? REACTION_REPLICATE_FALLBACK_COLOR;

export interface BplReactionReading {
  mainCounts: number | null;
  refCounts: number | null;
  baselineMainLight: number | null;
  baselineRefLight: number | null;
  mainDark: number | null;
  refDark: number | null;
  /** Solo para análisis técnico en la tabla; nunca sustituye a `abs1` en la gráfica. */
  baselineCorrectedAbsorbance: number | null;
}

export interface BplReactionPoint {
  cycle: number;
  abs1: number | null;
  abs2: number | null;
  dif: number | null;
  readingAt: string | null;
  readings: BplReactionReading[];
}

export interface BplReactionReplicate {
  id: string;
  serial: string;
  testName: string;
  testKey: string;
  sampleClass: string | null;
  sampleType: string | null;
  stage: BplStage | null;
  status: BplStatus;
  diagnosticStatus: string | null;
  occurredAt: string | null;
  detectedAt: string | null;
  workSessionId: string;
  orderTestId: string;
  executionId: string | null;
  replicateNumber: number;
  resultAt: string | null;
  finalAbsorbance: number | null;
  calculationVersion: string | null;
  /** Contexto de ejecución publicado junto a la curva; solo llega con el payload. */
  execution: BplReactionExecutionMeta | null;
  /** `null` mientras el payload no se ha descargado para esta réplica. */
  points: BplReactionPoint[] | null;
}

export interface BplReactionExecutionMeta {
  wellUsed: number | null;
  executionType: string | null;
  executionStatus: string | null;
  rerunNumber: number | null;
  sampleVolume: number | null;
  reagent1Volume: number | null;
  reagent2Volume: number | null;
  absInitial: number | null;
  absMainFilter: number | null;
  absWorkReagent: number | null;
}

/** Una reacción = sesión de trabajo + orden de prueba; sus réplicas se dibujan como líneas. */
export interface BplReactionGroup {
  key: string;
  workSessionId: string;
  orderTestId: string;
  testName: string;
  testKey: string;
  sampleClass: string | null;
  sampleType: string | null;
  status: BplStatus;
  diagnosticStatus: string | null;
  occurredAt: string | null;
  replicates: BplReactionReplicate[];
  pointsLoaded: boolean;
  cycleCount: number;
}

export interface BplReactionIndexRow {
  id?: number | string | null;
  occurred_at?: string | null;
  detected_at?: string | null;
  effective_equipment_serial?: string | null;
  event_type?: string | null;
  test_name?: string | null;
  sample_class?: string | null;
  sample_type?: string | null;
  bpl_stage?: string | null;
  bpl_status?: string | null;
  diagnostic_status?: string | null;
  work_session_id?: string | number | null;
  order_test_id?: string | number | null;
  execution_id?: string | number | null;
  replicate_number?: string | number | null;
  result_datetime?: string | null;
  final_absorbance?: string | number | null;
  calculation_version?: string | null;
  payload?: unknown;
}

export interface ReactionSeriesPoint {
  cycle: number;
  value: number;
  readingAt: string | null;
}

export interface ReactionSeries {
  replicate: BplReactionReplicate;
  index: number;
  color: string;
  points: ReactionSeriesPoint[];
}

export interface ReactionSeriesSummary {
  cycleMin: number;
  cycleMax: number;
  valueMin: number;
  valueMax: number;
  /** Último valor menos primero de la réplica de referencia. */
  delta: number | null;
  /** Pendiente por ciclo (regresión lineal) de la réplica de referencia. */
  slope: number | null;
  pointCount: number;
}

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
};

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
  return typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
};

const pick = (record: Record<string, unknown> | null, keys: string[]): unknown => {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

const TIMEZONE_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Supabase entrega `occurred_at` en UTC; una cadena sin zona se interpreta como UTC
 * salvo que `assumeUtc` sea falso (horas del analizador dentro del payload, que son
 * hora de pared local y se muestran tal cual).
 */
export const parseBplTimestamp = (value: unknown, { assumeUtc = true }: { assumeUtc?: boolean } = {}): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const isoLike = trimmed.replace(' ', 'T');
  const hasZone = TIMEZONE_PATTERN.test(isoLike);
  const candidate = hasZone || !assumeUtc ? isoLike : `${isoLike}Z`;
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatReactionTime = (value: unknown, { assumeUtc = true, withDate = true }: { assumeUtc?: boolean; withDate?: boolean } = {}) => {
  const date = parseBplTimestamp(value, { assumeUtc });
  if (!date) return 'Sin dato';
  return new Intl.DateTimeFormat('es-MX', withDate ? { dateStyle: 'medium', timeStyle: 'medium' } : { timeStyle: 'medium' }).format(date);
};

const parseReading = (value: unknown): BplReactionReading | null => {
  const record = toRecord(value);
  if (!record) return null;
  return {
    mainCounts: toNumber(pick(record, ['main_counts', 'mainCounts', 'main'])),
    refCounts: toNumber(pick(record, ['ref_counts', 'refCounts', 'ref'])),
    baselineMainLight: toNumber(pick(record, ['baseline_main_light', 'baselineMainLight'])),
    baselineRefLight: toNumber(pick(record, ['baseline_ref_light', 'baselineRefLight'])),
    mainDark: toNumber(pick(record, ['main_dark', 'mainDark'])),
    refDark: toNumber(pick(record, ['ref_dark', 'refDark'])),
    baselineCorrectedAbsorbance: toNumber(pick(record, ['baseline_corrected_absorbance', 'baselineCorrectedAbsorbance'])),
  };
};

const parsePoint = (value: unknown, index: number): BplReactionPoint | null => {
  const record = toRecord(value);
  if (!record) return null;
  const cycle = toNumber(pick(record, ['cycle', 'ciclo', 'n'])) ?? index + 1;
  const readingsSource = pick(record, ['readings', 'lecturas']);
  const readings = Array.isArray(readingsSource)
    ? readingsSource.map(parseReading).filter((reading): reading is BplReactionReading => Boolean(reading))
    : [];
  return {
    cycle,
    abs1: toNumber(pick(record, ['abs1', 'abs_1', 'absorbance1'])),
    abs2: toNumber(pick(record, ['abs2', 'abs_2', 'absorbance2'])),
    dif: toNumber(pick(record, ['dif', 'diff', 'difference'])),
    readingAt: toText(pick(record, ['reading_datetime', 'readingDatetime', 'reading_at'])),
    readings,
  };
};

export interface ParsedReactionCurvePayload {
  workSessionId: string | null;
  orderTestId: string | null;
  executionId: string | null;
  replicateNumber: number | null;
  resultAt: string | null;
  finalAbsorbance: number | null;
  calculationVersion: string | null;
  execution: BplReactionExecutionMeta;
  points: BplReactionPoint[];
}

export const parseReactionCurvePayload = (payload: unknown): ParsedReactionCurvePayload | null => {
  const root = toRecord(payload);
  if (!root) return null;
  const curve = toRecord(pick(root, ['reaction_curve', 'reactionCurve', 'curve'])) || (Array.isArray(root.points) ? root : null);
  if (!curve) return null;
  const pointsSource = pick(curve, ['points', 'puntos']);
  const points = Array.isArray(pointsSource)
    ? pointsSource
        .map(parsePoint)
        .filter((point): point is BplReactionPoint => Boolean(point))
        .sort((left, right) => left.cycle - right.cycle)
    : [];
  return {
    workSessionId: toText(pick(curve, ['work_session_id', 'workSessionId'])),
    orderTestId: toText(pick(curve, ['order_test_id', 'orderTestId'])),
    executionId: toText(pick(curve, ['execution_id', 'executionId'])),
    replicateNumber: toNumber(pick(curve, ['replicate_number', 'replicateNumber', 'replicate'])),
    resultAt: toText(pick(curve, ['result_datetime', 'resultDatetime', 'result_at'])),
    finalAbsorbance: toNumber(pick(curve, ['final_absorbance', 'finalAbsorbance'])),
    calculationVersion: toText(pick(curve, ['calculation_version', 'calculationVersion'])),
    execution: {
      wellUsed: toNumber(pick(curve, ['well_used', 'wellUsed', 'well'])),
      executionType: toText(pick(curve, ['execution_type', 'executionType'])),
      executionStatus: toText(pick(curve, ['execution_status', 'executionStatus'])),
      rerunNumber: toNumber(pick(curve, ['rerun_number', 'rerunNumber'])),
      sampleVolume: toNumber(pick(curve, ['sample_volume', 'sampleVolume'])),
      reagent1Volume: toNumber(pick(curve, ['reagent1_volume', 'reagent_1_volume', 'reagent1Volume'])),
      reagent2Volume: toNumber(pick(curve, ['reagent2_volume', 'reagent_2_volume', 'reagent2Volume'])),
      absInitial: toNumber(pick(curve, ['abs_initial', 'absInitial'])),
      absMainFilter: toNumber(pick(curve, ['abs_main_filter', 'absMainFilter'])),
      absWorkReagent: toNumber(pick(curve, ['abs_work_reagent', 'absWorkReagent'])),
    },
    points,
  };
};

export const reactionGroupKey = (workSessionId: string, orderTestId: string) => `${workSessionId}|${orderTestId}`;

/** Convierte una fila del índice (o completa, con payload) en una réplica tipada. */
export const normalizeReactionReplicate = (row: BplReactionIndexRow): BplReactionReplicate | null => {
  if ((row.event_type || BPL_REACTION_CURVE_EVENT_TYPE) !== BPL_REACTION_CURVE_EVENT_TYPE) return null;
  const serial = normalizeBplSerial(row.effective_equipment_serial);
  const parsed = row.payload !== undefined ? parseReactionCurvePayload(row.payload) : null;
  const workSessionId = toText(row.work_session_id) ?? parsed?.workSessionId ?? null;
  const orderTestId = toText(row.order_test_id) ?? parsed?.orderTestId ?? null;
  const id = row.id === null || row.id === undefined ? null : String(row.id);
  if (!id || !serial) return null;
  const testName = (row.test_name || '').trim() || 'Sin prueba';
  return {
    id,
    serial,
    testName,
    testKey: normalizeBplTestKey(testName) || 'SIN PRUEBA',
    sampleClass: (row.sample_class || '').trim().toUpperCase() || null,
    sampleType: (row.sample_type || '').trim() || null,
    stage: normalizeBplStage({ bpl_stage: row.bpl_stage, event_type: row.event_type, sample_class: row.sample_class }),
    status: normalizeBplStatus(row.bpl_status),
    diagnosticStatus: (row.diagnostic_status || '').trim() || null,
    occurredAt: parseBplTimestamp(row.occurred_at)?.toISOString() || null,
    detectedAt: parseBplTimestamp(row.detected_at)?.toISOString() || null,
    // Sin claves de sesión/orden la réplica se agrupa consigo misma para no perderla.
    workSessionId: workSessionId || `sin-sesion:${id}`,
    orderTestId: orderTestId || `sin-orden:${id}`,
    executionId: toText(row.execution_id) ?? parsed?.executionId ?? null,
    replicateNumber: toNumber(row.replicate_number) ?? parsed?.replicateNumber ?? 1,
    resultAt: toText(row.result_datetime) ?? parsed?.resultAt ?? null,
    finalAbsorbance: toNumber(row.final_absorbance) ?? parsed?.finalAbsorbance ?? null,
    calculationVersion: toText(row.calculation_version) ?? parsed?.calculationVersion ?? null,
    execution: parsed ? parsed.execution : null,
    points: parsed ? parsed.points : null,
  };
};

/** Solo se grafican réplicas calculadas con la versión vigente; las antiguas se descartan. */
export const isSupportedReactionReplicate = (replicate: Pick<BplReactionReplicate, 'calculationVersion'>) =>
  replicate.calculationVersion === BPL_REACTION_CALCULATION_VERSION;

const replicateIdentityKey = (replicate: BplReactionReplicate) =>
  [replicate.workSessionId, replicate.orderTestId, replicate.executionId || '', replicate.replicateNumber].join('|');

const replicateRecency = (replicate: BplReactionReplicate) => replicate.detectedAt || replicate.occurredAt || '';

/**
 * Si el monitor volvió a publicar la misma réplica (misma sesión, orden, ejecución y
 * número), se conserva la fila con `detected_at` más reciente; a igual fecha, el id mayor.
 */
export const dedupeReactionReplicates = (replicates: BplReactionReplicate[]) => {
  const byIdentity = new Map<string, BplReactionReplicate>();
  replicates.forEach((replicate) => {
    const key = replicateIdentityKey(replicate);
    const current = byIdentity.get(key);
    if (!current) {
      byIdentity.set(key, replicate);
      return;
    }
    const recencyDiff = replicateRecency(replicate).localeCompare(replicateRecency(current));
    if (recencyDiff > 0 || (recencyDiff === 0 && replicate.id.localeCompare(current.id, undefined, { numeric: true }) > 0)) {
      byIdentity.set(key, replicate);
    }
  });
  return Array.from(byIdentity.values());
};

/** Normaliza, filtra por versión de cálculo y deduplica filas crudas del índice o del detalle. */
export const prepareReactionReplicates = (rows: BplReactionIndexRow[]) =>
  dedupeReactionReplicates(
    rows
      .map(normalizeReactionReplicate)
      .filter((replicate): replicate is BplReactionReplicate => Boolean(replicate) && isSupportedReactionReplicate(replicate as BplReactionReplicate)),
  );

const STATUS_RANK: Record<BplStatus, number> = { rejected: 4, pending: 3, evidence_observed: 2, accepted: 1 };

export const groupReactionReplicates = (replicates: BplReactionReplicate[]): BplReactionGroup[] => {
  const groups = new Map<string, BplReactionReplicate[]>();
  dedupeReactionReplicates(replicates).forEach((replicate) => {
    const key = reactionGroupKey(replicate.workSessionId, replicate.orderTestId);
    const bucket = groups.get(key) || [];
    bucket.push(replicate);
    groups.set(key, bucket);
  });
  return Array.from(groups.entries())
    .map<BplReactionGroup>(([key, bucket]) => {
      const sorted = [...bucket].sort((left, right) => left.replicateNumber - right.replicateNumber || left.id.localeCompare(right.id));
      const status = sorted.reduce<BplStatus>((worst, replicate) => (STATUS_RANK[replicate.status] > STATUS_RANK[worst] ? replicate.status : worst), 'accepted');
      const occurredAt = sorted.reduce<string | null>((latest, replicate) => (replicate.occurredAt && (!latest || replicate.occurredAt > latest) ? replicate.occurredAt : latest), null);
      return {
        key,
        workSessionId: sorted[0].workSessionId,
        orderTestId: sorted[0].orderTestId,
        testName: sorted[0].testName,
        testKey: sorted[0].testKey,
        sampleClass: sorted.find((replicate) => replicate.sampleClass)?.sampleClass || null,
        sampleType: sorted.find((replicate) => replicate.sampleType)?.sampleType || null,
        status: sorted.some((replicate) => replicate.status !== 'evidence_observed') ? status : 'evidence_observed',
        diagnosticStatus: sorted.find((replicate) => replicate.diagnosticStatus)?.diagnosticStatus || null,
        occurredAt,
        replicates: sorted,
        pointsLoaded: sorted.every((replicate) => replicate.points !== null),
        cycleCount: sorted.reduce((max, replicate) => Math.max(max, replicate.points?.length || 0), 0),
      };
    })
    .sort((left, right) => (right.occurredAt || '').localeCompare(left.occurredAt || '') || left.key.localeCompare(right.key));
};

export interface BplReactionLoadedPayload {
  points: BplReactionPoint[];
  execution: BplReactionExecutionMeta | null;
}

export const mergeReplicatePoints = (replicates: BplReactionReplicate[], pointsById: ReadonlyMap<string, BplReactionPoint[] | BplReactionLoadedPayload>) =>
  replicates.map((replicate) => {
    const loaded = pointsById.get(replicate.id);
    if (!loaded || replicate.points !== null) return replicate;
    return Array.isArray(loaded)
      ? { ...replicate, points: loaded }
      : { ...replicate, points: loaded.points, execution: loaded.execution ?? replicate.execution };
  });

/** Resumen de ejecución para la cabecera del visor: pozo, tipo, estado y volúmenes. */
export const describeReactionExecution = (execution: BplReactionExecutionMeta | null) => {
  if (!execution) return '';
  return [
    execution.wellUsed !== null ? `Pozo ${execution.wellUsed}` : null,
    execution.executionType,
    execution.executionStatus,
    execution.reagent1Volume !== null ? `R1 ${execution.reagent1Volume} µL` : null,
    execution.reagent2Volume !== null && execution.reagent2Volume > 0 ? `R2 ${execution.reagent2Volume} µL` : null,
    execution.sampleVolume !== null ? `Muestra ${execution.sampleVolume} µL` : null,
    execution.absInitial !== null ? `Abs inicial ${formatReactionValue(execution.absInitial)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
};

/** Métricas con al menos un valor numérico en la reacción; `abs2` y `dif` nulos no se ofrecen. */
export const reactionGroupMetrics = (group: BplReactionGroup): ReactionMetric[] =>
  REACTION_METRICS.filter((metric) => group.replicates.some((replicate) => replicate.points?.some((point) => point[metric] !== null)));

export const buildReactionSeries = (group: BplReactionGroup, metric: ReactionMetric, hiddenReplicates?: ReadonlySet<number>): ReactionSeries[] =>
  group.replicates
    .map((replicate, index) => ({
      replicate,
      index,
      color: reactionReplicateColor(index),
      points: (replicate.points || [])
        .filter((point) => point[metric] !== null)
        .map<ReactionSeriesPoint>((point) => ({ cycle: point.cycle, value: point[metric] as number, readingAt: point.readingAt })),
    }))
    .filter((series) => series.points.length > 0 && !hiddenReplicates?.has(series.replicate.replicateNumber));

export const summarizeReactionSeries = (series: ReactionSeries[]): ReactionSeriesSummary | null => {
  const all = series.flatMap((item) => item.points);
  if (!all.length) return null;
  const reference = series[0].points;
  const first = reference[0];
  const last = reference[reference.length - 1];
  let slope: number | null = null;
  if (reference.length >= 2) {
    const n = reference.length;
    const meanX = reference.reduce((sum, point) => sum + point.cycle, 0) / n;
    const meanY = reference.reduce((sum, point) => sum + point.value, 0) / n;
    const numerator = reference.reduce((sum, point) => sum + (point.cycle - meanX) * (point.value - meanY), 0);
    const denominator = reference.reduce((sum, point) => sum + (point.cycle - meanX) ** 2, 0);
    slope = denominator ? numerator / denominator : null;
  }
  return {
    cycleMin: Math.min(...all.map((point) => point.cycle)),
    cycleMax: Math.max(...all.map((point) => point.cycle)),
    valueMin: Math.min(...all.map((point) => point.value)),
    valueMax: Math.max(...all.map((point) => point.value)),
    delta: first && last ? last.value - first.value : null,
    slope,
    pointCount: all.length,
  };
};

export const latestReactionGroupByTest = (groups: BplReactionGroup[]) => {
  const byTest = new Map<string, BplReactionGroup>();
  groups.forEach((group) => {
    const current = byTest.get(group.testKey);
    if (!current || (group.occurredAt || '') > (current.occurredAt || '')) byTest.set(group.testKey, group);
  });
  return byTest;
};

export interface ReactionGroupFilters {
  testKey?: string | null;
  sampleClass?: string | null;
  from?: string | null;
  to?: string | null;
}

/** `from`/`to` son fechas locales YYYY-MM-DD; el día final se incluye completo. */
export const filterReactionGroups = (groups: BplReactionGroup[], filters: ReactionGroupFilters) => {
  const fromTime = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : null;
  const toTime = filters.to ? new Date(`${filters.to}T23:59:59.999`).getTime() : null;
  return groups.filter((group) => {
    if (filters.testKey && group.testKey !== filters.testKey) return false;
    if (filters.sampleClass && (group.sampleClass || '') !== filters.sampleClass) return false;
    const time = group.occurredAt ? new Date(group.occurredAt).getTime() : null;
    if (fromTime !== null && (time === null || time < fromTime)) return false;
    if (toTime !== null && (time === null || time > toTime)) return false;
    return true;
  });
};

export const formatReactionValue = (value: number | null | undefined, decimals = 4) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('es-MX', { minimumFractionDigits: Math.min(decimals, 3), maximumFractionDigits: decimals }).format(value);
};

export const describeReactionGroup = (group: BplReactionGroup) =>
  [group.testName, group.sampleClass, group.sampleType].filter(Boolean).join(' · ');

/** Filtros del visor de curvas; fuera del componente para que Fast Refresh conserve su estado. */
export interface ReactionExplorerFilters {
  testKey: string;
  sampleClass: string;
  from: string;
  to: string;
}

export const EMPTY_REACTION_FILTERS: ReactionExplorerFilters = { testKey: '', sampleClass: '', from: '', to: '' };
