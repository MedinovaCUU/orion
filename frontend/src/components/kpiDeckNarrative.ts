// Words for the PowerPoint deck of the general summary. Every sentence is computed from the same
// summary and ticket rows the screen shows; nothing is inferred beyond the data. Pure functions:
// tests/kpi-deck-narrative.test.mjs.
import {
  bucketLabel, formatCount, formatDate, formatHours, formatPct, num, ratioOf, type KpiSummary, type SeriesRow,
} from './serviceKpiModel.ts';
import {
  arrivalMatrix, closingHistogram, complianceBy, curveMedian, formatSpan, kaplanMeier, resolvedBy, WEEKDAYS, wilson, type TicketPoint,
} from './kpiAnalytics.ts';

export interface SlideText { kicker: string; headline: string; shows: string[]; howTo: string[]; source: string }

const decimal = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });
const pct = (value: number | null) => formatPct(value === null ? null : Math.round(value * 10) / 10);
const plural = (count: number, one: string, many: string) => `${formatCount(count)} ${count === 1 ? one : many}`;
const share = (part: number, total: number) => (total ? part / total * 100 : null);
const SOURCE_TICKETS = 'Fuente: ORION · tickets de soporte, eventos de servicio y reglas de plazo.';

export const periodLabel = (summary: KpiSummary) => `${formatDate(summary.period.from)} – ${formatDate(summary.period.to)}`;
export const previousLabel = (summary: KpiSummary) => `${formatDate(summary.period.previous_from)} – ${formatDate(summary.period.previous_to)}`;

export function deckFacts(summary: KpiSummary, points: TicketPoint[]) {
  const current = summary.current;
  const cutAt = Date.parse(summary.period.cut_at);
  const minSample = summary.period.min_sample || 5;
  const curve = kaplanMeier(points, cutAt);
  const histogram = closingHistogram(points);
  const late = ratioOf(current.late_rate);
  const sla = ratioOf(current.sla_compliance);
  const interval = wilson(sla.num, sla.den);
  const cells = arrivalMatrix(points, summary.period.timezone || 'America/Chihuahua');
  let peak = { day: 0, hour: 0, n: 0 };
  cells.forEach((row, day) => row.forEach((list, hour) => { if (list.length > peak.n) peak = { day, hour, n: list.length }; }));
  const arrivals = cells.flat().reduce((sum, list) => sum + list.length, 0);
  const weekend = cells.slice(5).flat().reduce((sum, list) => sum + list.length, 0);
  const offHours = cells.flat().filter((_, index) => { const hour = index % 24; return hour < 8 || hour >= 18; }).reduce((sum, list) => sum + list.length, 0);
  const closedHours = points.filter(point => point.closedInPeriod && !point.cancelled && point.hours !== null);
  const closedAll = points.filter(point => point.closedInPeriod && point.hours !== null).length;
  const beyond48 = closedHours.filter(point => point.hours! > 48).length;
  const beyondWeek = closedHours.filter(point => point.hours! > 168).sort((a, b) => b.hours! - a.hours!);
  const groups = complianceBy(points, 'responsable', 40);
  const overall = groups.overall;
  const clear = (direction: 'low' | 'high') => groups.rows.filter(row => row.n >= minSample && overall
    && (direction === 'low' ? row.high < overall.pct : row.low > overall.pct));
  return {
    minSample, curve, histogram, late, sla, interval, peak, arrivals, weekend, offHours, closedHours: closedHours.length, closedAll, beyond48, beyondWeek,
    groups, below: clear('low'), above: clear('high'), small: groups.rows.filter(row => row.n < minSample),
    by24: resolvedBy(curve, 24), by48: resolvedBy(curve, 48), median: curveMedian(curve), openAtCut: curve.n - curve.events,
  };
}
export type DeckFacts = ReturnType<typeof deckFacts>;

const delta = (now: number | null, before: number | null, unit: 'count' | 'pp') => {
  if (now === null || before === null) return '';
  const difference = now - before;
  if (unit === 'pp') return difference === 0 ? ' (igual que el periodo anterior)' : ` (${difference > 0 ? '+' : '−'}${decimal.format(Math.abs(difference))} pp vs. periodo anterior)`;
  if (!before) return '';
  const change = Math.round(difference / before * 100);
  return change === 0 ? ' (igual que el periodo anterior)' : ` (${change > 0 ? '+' : '−'}${Math.abs(change)} % vs. periodo anterior)`;
};

export function executiveSummary(summary: KpiSummary, facts: DeckFacts): string[] {
  const { current, previous } = summary;
  const lines = [
    `Se abrieron ${formatCount(current.tickets_opened)} tickets de soporte${delta(num(current.tickets_opened), num(previous.tickets_opened), 'count')} y se cerraron ${formatCount(current.tickets_closed)}; ${formatCount(current.tickets_cancelled)} ${num(current.tickets_cancelled) === 1 ? 'se envió' : 'se enviaron'} a administrativo.`,
  ];
  if (facts.sla.den) {
    lines.push(`${pct(facts.sla.pct)} de los cierres evaluables quedó dentro del plazo comprometido${delta(facts.sla.pct, ratioOf(previous.sla_compliance).pct, 'pp')}: ${formatCount(facts.late.num)} de ${formatCount(facts.late.den)} se cerraron fuera de plazo.`);
  } else lines.push('No hubo cierres con plazo evaluable en el periodo.');
  if (facts.curve.n) lines.push(`${pct(facts.by48)} de los tickets abiertos en el periodo se cerró antes de 48 horas; la mitad, en menos de ${formatSpan(facts.median)}.`);
  const pending = num(current.pending_at_cut) ?? 0;
  lines.push(pending ? `Al corte quedaban ${plural(pending, 'ticket abierto', 'tickets abiertos')}, ${formatCount(current.overdue_at_cut)} de ellos con el plazo vencido.` : 'Al corte no quedaban tickets abiertos.');
  if (facts.peak.n) lines.push(`La mayor carga llega los ${WEEKDAYS[facts.peak.day].toLowerCase()} entre las ${facts.peak.hour}:00 y las ${facts.peak.hour + 1}:00 (${plural(facts.peak.n, 'ticket', 'tickets')} en el periodo).`);
  return lines;
}

export function evolutionText(summary: KpiSummary, facts: DeckFacts): SlideText {
  const rows = summary.series;
  const label = (row: SeriesRow) => bucketLabel(row.bucket, summary.period.granularity);
  const busiest = [...rows].sort((a, b) => (num(b.opened) ?? 0) - (num(a.opened) ?? 0))[0];
  const rated = rows.map(row => ({ row, n: num(row.sla_evaluable) ?? 0, late: num(row.closed_late) ?? 0 })).filter(item => item.n >= facts.minSample);
  const worst = [...rated].sort((a, b) => b.late / b.n - a.late / a.n)[0];
  const best = [...rated].sort((a, b) => a.late / a.n - b.late / b.n)[0];
  const shows = [];
  if (busiest && num(busiest.opened)) shows.push(`El intervalo con más aperturas fue ${label(busiest)}, con ${formatCount(busiest.opened)} tickets.`);
  if (worst && best && worst !== best) shows.push(`El porcentaje fuera de plazo osciló entre ${pct(best.late / best.n * 100)} (${label(best.row)}) y ${pct(worst.late / worst.n * 100)} (${label(worst.row)}).`);
  if (facts.late.den) shows.push(`En todo el periodo: ${formatCount(facts.late.num)} de ${formatCount(facts.late.den)} cierres evaluables fuera de plazo (${pct(facts.late.pct)}).`);
  const thin = rows.filter(row => (num(row.sla_evaluable) ?? 0) > 0 && (num(row.sla_evaluable) ?? 0) < facts.minSample).length;
  if (thin) shows.push(`${plural(thin, 'intervalo tiene', 'intervalos tienen')} menos de ${facts.minSample} cierres evaluables; su porcentaje no es concluyente.`);
  return {
    kicker: 'Cumplimiento y tiempos',
    headline: facts.late.den ? `${pct(facts.late.pct)} de los cierres evaluables quedó fuera del plazo` : 'Volumen de tickets del periodo',
    shows,
    howTo: [
      'Columnas: tickets abiertos y cerrados en cada intervalo (eje izquierdo).',
      'Línea roja: % de cierres fuera del plazo (eje derecho). La banda es su intervalo de confianza del 95 %: más ancha cuando hay pocos casos.',
      'Los puntos huecos tienen menos de cinco cierres evaluables.',
    ],
    source: SOURCE_TICKETS,
  };
}

export function curveText(facts: DeckFacts): SlideText {
  return {
    kicker: 'Cumplimiento y tiempos',
    headline: facts.curve.n ? `${pct(facts.by48)} de los tickets se cierra antes de 48 horas` : 'Sin tickets abiertos en el periodo',
    shows: facts.curve.n ? [
      `A las 24 horas ya estaba cerrado el ${pct(facts.by24)}; a las 48 horas, el ${pct(facts.by48)}.`,
      `La mitad de los tickets se cierra en menos de ${formatSpan(facts.median)}.`,
      facts.openAtCut ? `${plural(facts.openAtCut, 'ticket seguía abierto', 'tickets seguían abiertos')} al corte: cuentan hasta ese momento y nunca se suponen cerrados.` : 'Todos los tickets abiertos en el periodo ya se cerraron.',
    ] : [],
    howTo: [
      'Cada punto de la curva responde: de los tickets abiertos en el periodo, ¿qué porcentaje ya estaba cerrado tras ese tiempo?',
      'Método Kaplan-Meier: los tickets aún abiertos entran al cálculo hasta el corte, así la curva no se ve mejor por ignorarlos.',
      'Las líneas punteadas marcan los compromisos de 24 y 48 horas. El eje de tiempo es logarítmico.',
    ],
    source: SOURCE_TICKETS,
  };
}

export function distributionText(facts: DeckFacts): SlideText {
  const { histogram } = facts;
  const beyond = share(facts.beyond48, facts.closedHours);
  return {
    kicker: 'Cumplimiento y tiempos',
    headline: histogram.total ? `La mitad de los cierres ocurre en menos de ${formatSpan(histogram.median)}` : 'Sin cierres en el periodo',
    shows: histogram.total ? [
      `${formatCount(histogram.total)} cierres en el periodo; mediana ${formatSpan(histogram.median)} y percentil 90 de ${formatSpan(histogram.p90)}.`,
      `${pct(beyond)} tardó más de 48 horas (${formatCount(facts.beyond48)} cierres).`,
      facts.beyondWeek.length ? `${plural(facts.beyondWeek.length, 'cierre tardó', 'cierres tardaron')} más de una semana.` : 'Ningún cierre tardó más de una semana.',
    ] : [],
    howTo: [
      'Cada columna agrupa los cierres según el tiempo que tardaron, de menos de una hora a más de tres meses.',
      'El color indica el resultado frente al plazo: dentro, fuera justificado o fuera del plazo.',
      'La zona sombreada reúne los cierres de más de 48 horas.',
    ],
    source: SOURCE_TICKETS,
  };
}

export function scatterText(facts: DeckFacts): SlideText {
  const longest = facts.beyondWeek.slice(0, 3).map(point => `${point.folio} (${formatSpan(point.hours)})`);
  return {
    kicker: 'Cumplimiento y tiempos',
    headline: facts.closedAll ? `Cada punto es uno de los ${formatCount(facts.closedAll)} cierres del periodo` : 'Sin cierres en el periodo',
    shows: facts.closedAll ? [
      `${formatCount(facts.beyond48)} cierres quedaron por encima de las 48 horas.`,
      longest.length ? `Los más largos: ${longest.join(', ')}.` : 'Ningún cierre superó una semana.',
      'Los puntos aislados muy por encima de la línea son los primeros casos a revisar.',
    ] : [],
    howTo: [
      'Eje horizontal: fecha de cierre. Eje vertical: tiempo hasta el cierre, en escala logarítmica.',
      'Las líneas punteadas son los plazos comprometidos (24 h Falcon Ciudad de México, 48 h general).',
      'En gris, los tickets enviados a administrativo, que no cuentan para el plazo.',
    ],
    source: SOURCE_TICKETS,
  };
}

export function arrivalsText(summary: KpiSummary, facts: DeckFacts): SlideText {
  const { peak } = facts;
  return {
    kicker: 'Cumplimiento y tiempos',
    headline: peak.n ? `La mayor carga llega los ${WEEKDAYS[peak.day].toLowerCase()} a las ${peak.hour}:00` : 'Sin aperturas en el periodo',
    shows: facts.arrivals ? [
      `${formatCount(facts.arrivals)} tickets abiertos en el periodo; la franja más cargada reunió ${formatCount(peak.n)}.`,
      `${pct(share(facts.weekend, facts.arrivals))} llegó en fin de semana y ${pct(share(facts.offHours, facts.arrivals))} fuera del horario de 8:00 a 18:00.`,
      'Con horas corridas, un ticket que llega en viernes por la tarde consume su plazo durante el fin de semana.',
    ] : [],
    howTo: [
      'Cada celda es una hora de un día de la semana; mientras más oscura, más tickets se abrieron en esa franja.',
      `Horario de ${summary.period.timezone || 'America/Chihuahua'}.`,
    ],
    source: SOURCE_TICKETS,
  };
}

export function groupsText(facts: DeckFacts): SlideText {
  const names = (rows: DeckFacts['below']) => rows.map(row => `${row.name} (${pct(row.pct)}, ${formatCount(row.n)} cierres)`).join('; ');
  const shows = [];
  if (facts.groups.overall) shows.push(`Cumplimiento general: ${pct(facts.groups.overall.pct)} (intervalo 95 %: ${decimal.format(facts.groups.overall.low)}–${decimal.format(facts.groups.overall.high)} %).`);
  if (facts.below.length) shows.push(`Claramente por debajo del general: ${names(facts.below)}.`);
  if (facts.above.length) shows.push(`Claramente por encima: ${names(facts.above)}.`);
  if (!facts.below.length && !facts.above.length && facts.groups.rows.length) shows.push('Nadie se aparta claramente del general: las diferencias caben dentro del margen de error.');
  if (facts.small.length) shows.push(`${plural(facts.small.length, 'responsable tiene', 'responsables tienen')} menos de ${facts.minSample} cierres evaluables; su porcentaje no permite comparar.`);
  return {
    kicker: 'Cumplimiento y tiempos',
    headline: facts.below.length || facts.above.length ? 'Cumplimiento del plazo por responsable, con su margen de error' : 'Cumplimiento del plazo por responsable: sin diferencias claras',
    shows,
    howTo: [
      'El punto es el % de cierres dentro del plazo; la barra gris, su intervalo de confianza del 95 %.',
      'Solo se marca en rojo a quien queda claramente por debajo del general (toda su barra a la izquierda de la línea).',
      'No es un ranking: considera tipo de servicio, prioridad y carga antes de comparar personas.',
    ],
    source: `${SOURCE_TICKETS} Responsable: asignación vigente del caso.`,
  };
}

export const hoursOrMissing = (value: unknown) => (num(value) === null ? 'Sin dato' : formatHours(value));
