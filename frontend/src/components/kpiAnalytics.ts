// Per-ticket analytics for "Cumplimiento y tiempos". Everything is derived in the browser from the
// rows of get_service_kpi_records('tickets'), the same rows behind every card, so each point on a
// chart is a real case that opens its file. Pure functions: tests/kpi-analytics.test.mjs.
import { num, priorityLabels, teamLabels, type KpiRecord } from './serviceKpiModel.ts';

export type Outcome = 'dentro' | 'fuera' | 'justificado' | 'administrativo' | 'sin_plazo' | 'abierto' | 'sin_dato';
export const outcomeLabels: Record<Outcome, string> = {
  dentro: 'Dentro del plazo', fuera: 'Fuera del plazo', justificado: 'Fuera, justificado', administrativo: 'Enviado a administrativo',
  sin_plazo: 'Sin plazo definido', abierto: 'Abierto al corte', sin_dato: 'Sin fecha verificable',
};
export const outcomeColors: Record<Outcome, string> = {
  dentro: '#278a77', fuera: '#c3545c', justificado: '#4a64a1', administrativo: '#a3b3bc',
  sin_plazo: '#c3ced4', abierto: '#c68b32', sin_dato: '#d5dde2',
};

export interface TicketPoint {
  id: string; folio: string; subject: string; client: string; platform: string; serial: string;
  team: string; priority: string; channel: string | null; region: string | null;
  responsibleId: string | null; responsible: string;
  openedAt: number; closedAt: number | null; hours: number | null; target: number | null; outcome: Outcome;
  openedInPeriod: boolean; closedInPeriod: boolean; evaluable: boolean; cancelled: boolean;
  closureReason: string | null; hasFirstResponse: boolean;
}

const HOUR = 3600000;
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const time = (value: unknown) => { const parsed = typeof value === 'string' ? Date.parse(value) : NaN; return Number.isFinite(parsed) ? parsed : null; };

export function toPoint(row: KpiRecord): TicketPoint | null {
  const openedAt = time(row.opened_at);
  const id = text(row.ticket_id);
  if (openedAt === null || !id) return null;
  const closedAt = time(row.closed_at);
  const result = text(row.sla_result);
  const cancelled = row.closure_class === 'cancelado' || result === 'no_aplica'; // server class for closures sent to administration
  const outcome: Outcome = cancelled ? 'administrativo'
    : result === 'dentro' ? 'dentro'
      : result === 'fuera' ? (row.justified === true ? 'justificado' : 'fuera')
        : result === 'sin_plazo' ? 'sin_plazo'
          : result === 'no_evaluable' ? 'sin_dato' : 'abierto';
  return {
    id, folio: text(row.folio) || id.slice(0, 8), subject: text(row.asunto) || 'Sin asunto',
    client: text(row.client) || 'Sin cliente identificado', platform: text(row.platform) || 'Sin plataforma', serial: text(row.serial) || '',
    team: text(row.team) || 'sin_clasificar', priority: text(row.priority) || 'sin_prioridad', channel: text(row.channel), region: text(row.region),
    responsibleId: text(row.responsible_id), responsible: text(row.responsible_name) || 'Sin responsable',
    openedAt, closedAt, hours: closedAt !== null && closedAt >= openedAt ? (closedAt - openedAt) / HOUR : null,
    target: num(row.sla_target_hours), outcome,
    openedInPeriod: row.opened_in_period === true, closedInPeriod: row.closed_in_period === true,
    evaluable: row.sla_evaluable === true, cancelled,
    closureReason: text(row.closure_reason), hasFirstResponse: row.has_first_response === true,
  };
}
export const toPoints = (rows: KpiRecord[]) => rows.map(toPoint).filter((point): point is TicketPoint => point !== null);

// Wilson score interval: honest bounds for a rate, wide when the sample is small (1 of 1 is not "100 %").
export function wilson(k: number, n: number, z = 1.96) {
  if (!n) return null;
  const p = k / n; const z2 = z * z;
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const half = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / denominator;
  return { pct: p * 100, low: Math.max(0, center - half) * 100, high: Math.min(1, center + half) * 100 };
}

export function quantile(values: number[], q: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position); const rest = position - base;
  return sorted[base + 1] === undefined ? sorted[base] : sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

// Kaplan–Meier: share of the cohort already closed after t hours. Tickets still open at the cut are
// censored (they count while at risk and are never assumed closed), so open backlogs do not flatter it.
export interface ResolutionCurve { n: number; events: number; steps: Array<[number, number]> }
export function kaplanMeier(points: TicketPoint[], cutAt: number): ResolutionCurve {
  const items = points.filter(point => point.openedInPeriod && !point.cancelled).map(point => {
    const closed = point.closedAt !== null && point.closedAt <= cutAt && point.hours !== null;
    return { t: Math.max(0, closed ? point.hours! : (cutAt - point.openedAt) / HOUR), event: closed };
  }).sort((a, b) => a.t - b.t || Number(b.event) - Number(a.event));
  const steps: Array<[number, number]> = [[0, 0]];
  let atRisk = items.length; let survival = 1; let events = 0;
  for (let i = 0; i < items.length;) {
    const t = items[i].t; let closed = 0; let censored = 0;
    while (i < items.length && items[i].t === t) { if (items[i].event) closed++; else censored++; i++; }
    if (closed) { survival *= 1 - closed / atRisk; events += closed; steps.push([t, (1 - survival) * 100]); }
    atRisk -= closed + censored;
  }
  return { n: items.length, events, steps };
}
export const resolvedBy = (curve: ResolutionCurve, hours: number) => {
  let value = 0;
  for (const [t, pct] of curve.steps) { if (t > hours) break; value = pct; }
  return curve.n ? value : null;
};
export const curveMedian = (curve: ResolutionCurve) => curve.steps.find(([, pct]) => pct >= 50)?.[0] ?? null;

// Closing-time distribution on a log-like scale, anchored at the 24 h and 48 h commitments.
export const HOUR_BINS: Array<[number, number, string]> = [
  [0, 1, '< 1 h'], [1, 4, '1–4 h'], [4, 8, '4–8 h'], [8, 24, '8–24 h'], [24, 48, '24–48 h'], [48, 72, '48–72 h'],
  [72, 168, '3–7 días'], [168, 336, '1–2 semanas'], [336, 720, '2–4 semanas'], [720, 2160, '1–3 meses'], [2160, Infinity, '> 3 meses'],
];
export const HISTOGRAM_OUTCOMES: Outcome[] = ['dentro', 'justificado', 'fuera', 'sin_plazo', 'sin_dato'];
export function closingHistogram(points: TicketPoint[]) {
  const closed = points.filter(point => point.closedInPeriod && !point.cancelled && point.hours !== null);
  const members = HOUR_BINS.map(() => [] as TicketPoint[]);
  for (const point of closed) members[HOUR_BINS.findIndex(([from, to]) => point.hours! >= from && point.hours! < to)].push(point);
  const counts = Object.fromEntries(HISTOGRAM_OUTCOMES.map(outcome => [outcome, members.map(list => list.filter(point => point.outcome === outcome).length)])) as Record<Outcome, number[]>;
  const hours = closed.map(point => point.hours!);
  return { members, counts, total: closed.length, median: quantile(hours, 0.5), p90: quantile(hours, 0.9) };
}

// Arrivals by weekday and hour in the KPI time zone (Monday first).
export const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
export function arrivalMatrix(points: TicketPoint[], timeZone: string) {
  const format = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
  const cells = WEEKDAYS.map(() => Array.from({ length: 24 }, () => [] as TicketPoint[]));
  for (const point of points.filter(item => item.openedInPeriod)) {
    const parts = format.formatToParts(new Date(point.openedAt));
    const day = WEEKDAY_INDEX[parts.find(part => part.type === 'weekday')?.value || ''];
    const hour = Number(parts.find(part => part.type === 'hour')?.value);
    if (day !== undefined && Number.isInteger(hour) && hour >= 0 && hour < 24) cells[day][hour].push(point);
  }
  return cells;
}
export const lateShare = (list: TicketPoint[]) => {
  const evaluated = list.filter(point => point.closedInPeriod && point.evaluable);
  return { n: evaluated.length, late: evaluated.filter(point => point.outcome === 'fuera' || point.outcome === 'justificado').length };
};

// Compliance by a dimension with its 95 % interval: comparisons only mean something with their sample.
export type DimensionKey = 'responsable' | 'equipo' | 'prioridad' | 'canal' | 'region' | 'plataforma' | 'cliente';
const channelLabels: Record<string, string> = { falcon: 'Falcon', centrum: 'Centrum', genesis: 'Genesis' };
const regionLabels: Record<string, string> = { cdmx: 'Ciudad de México', foraneo: 'Foráneo' };
export const dimensions: Record<DimensionKey, { label: string; field: string; value: (point: TicketPoint) => string | null; name: (point: TicketPoint) => string }> = {
  responsable: { label: 'Responsable', field: 'responsible_id', value: point => point.responsibleId, name: point => point.responsible },
  equipo: { label: 'Equipo', field: 'team', value: point => point.team, name: point => teamLabels[point.team] || point.team },
  prioridad: { label: 'Prioridad', field: 'priority', value: point => point.priority, name: point => priorityLabels[point.priority] || point.priority },
  canal: { label: 'Canal', field: 'channel', value: point => point.channel, name: point => (point.channel ? channelLabels[point.channel] || point.channel : 'Directo / sin canal') },
  region: { label: 'Región', field: 'region', value: point => point.region, name: point => (point.region ? regionLabels[point.region] || point.region : 'Sin región') },
  plataforma: { label: 'Plataforma', field: 'platform', value: point => (point.platform === 'Sin plataforma' ? null : point.platform), name: point => point.platform },
  cliente: { label: 'Cliente', field: 'client', value: point => (point.client === 'Sin cliente identificado' ? null : point.client), name: point => point.client },
};
export interface DimensionRow { value: string | null; name: string; n: number; onTime: number; late: number; pct: number; low: number; high: number }
export function complianceBy(points: TicketPoint[], key: DimensionKey, limit = 12): { rows: DimensionRow[]; overall: ReturnType<typeof wilson>; hidden: number } {
  const dimension = dimensions[key];
  const evaluated = points.filter(point => point.closedInPeriod && point.evaluable);
  const groups = new Map<string, { value: string | null; name: string; list: TicketPoint[] }>();
  for (const point of evaluated) {
    const value = dimension.value(point);
    const id = value ?? '∅';
    const group = groups.get(id) || { value, name: dimension.name(point), list: [] };
    group.list.push(point); groups.set(id, group);
  }
  const rows = [...groups.values()].map(group => {
    const late = group.list.filter(point => point.outcome === 'fuera' || point.outcome === 'justificado').length;
    const interval = wilson(group.list.length - late, group.list.length)!;
    return { value: group.value, name: group.name, n: group.list.length, onTime: group.list.length - late, late, ...interval };
  }).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'es'));
  const late = evaluated.filter(point => point.outcome === 'fuera' || point.outcome === 'justificado').length;
  return { rows: rows.slice(0, limit), overall: wilson(evaluated.length - late, evaluated.length), hidden: Math.max(0, rows.length - limit) };
}

// Time axes run on log10(hours) with ticks people read (1 h, 8 h, 24 h, 48 h, 7 días…) instead of powers of ten.
export const FLOOR_HOURS = 0.25;
export const TIME_TICKS = [0.25, 1, 4, 8, 24, 48, 168, 720, 2160, 8760];
export const toLog = (hours: number) => Math.log10(Math.max(hours, FLOOR_HOURS));

export const formatSpan = (hours: number | null) => {
  if (hours === null || !Number.isFinite(hours)) return 'Sin dato';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours < 10 ? hours.toFixed(1).replace('.0', '') : Math.round(hours)} h`;
  const days = hours / 24;
  return `${days < 10 ? days.toFixed(1).replace('.0', '') : Math.round(days)} días`;
};
