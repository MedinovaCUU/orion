// Charts for the PowerPoint deck: same analytics as the time lab, restyled for slides in the
// BioSystems identity (white, graphite and the corporate red only where something needs attention),
// rendered off screen to high-resolution PNG.
import { echarts, type ChartOption } from './kpiEcharts';
import { BRAND_FONT_FAMILY } from '../config/brandFonts';
import { bucketLabel, num, type ChartSpec, type KpiSummary } from './serviceKpiModel';
import {
  arrivalMatrix, curveMedian, formatSpan, HOUR_BINS, kaplanMeier, resolvedBy, TIME_TICKS, toLog, FLOOR_HOURS, WEEKDAYS, wilson,
  type Outcome, type TicketPoint,
} from './kpiAnalytics';
import type { DeckFacts } from './kpiDeckNarrative';

export const BRAND = {
  red: '#F12535', ink: '#1F2328', graphite: '#3B444D', slate: '#7B8794', grey: '#B9C0C7', light: '#E6E9EC', faint: '#F5F6F7',
};
const OUTCOME_TONES: Partial<Record<Outcome, string>> = {
  dentro: BRAND.graphite, justificado: BRAND.slate, fuera: BRAND.red, administrativo: BRAND.grey, sin_plazo: '#D5DADF', sin_dato: '#D5DADF',
};
const OUTCOME_NAMES: Partial<Record<Outcome, string>> = {
  dentro: 'Dentro del plazo', justificado: 'Fuera, justificado', fuera: 'Fuera del plazo', administrativo: 'Enviado a administrativo', sin_plazo: 'Sin plazo definido', sin_dato: 'Sin fecha verificable',
};

const text = { color: BRAND.slate, fontSize: 13 };
const axisLine = { lineStyle: { color: BRAND.grey } };
const splitLine = { lineStyle: { color: BRAND.light } };
const legend = { top: 0, left: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12, itemGap: 22, textStyle: { color: BRAND.graphite, fontSize: 13 } };
const round1 = (value: number) => Math.round(value * 10) / 10;
const timeAxis = (maxHours: number) => {
  const max = Math.log10(Math.max(48, maxHours) * 1.2);
  const ticks = TIME_TICKS.map(hours => Math.log10(hours)).filter(value => value <= max);
  return { type: 'value', min: toLog(FLOOR_HOURS), max, splitLine, axisLine: { ...axisLine, onZero: false }, axisTick: { customValues: ticks },
    axisLabel: { ...text, customValues: ticks, formatter: (value: number) => formatSpan(10 ** value) } };
};

// Renders at 96 px per inch and a 2.5× pixel ratio: crisp when projected, small enough for e-mail.
export async function renderChart(option: ChartOption, widthIn: number, heightIn: number, ratio = 2.5) {
  const width = Math.round(widthIn * 96); const height = Math.round(heightIn * 96);
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:${height}px;pointer-events:none;`;
  document.body.appendChild(host);
  try {
    const chart = echarts.init(host, undefined, { renderer: 'canvas', width, height, devicePixelRatio: ratio });
    chart.setOption({ animation: false, backgroundColor: '#ffffff', textStyle: { fontFamily: `'${BRAND_FONT_FAMILY}', 'Helvetica Neue', Arial, sans-serif` }, ...option });
    const url = chart.getDataURL({ type: 'png', pixelRatio: ratio, backgroundColor: '#ffffff' });
    chart.dispose();
    return url;
  } finally { host.remove(); }
}

export function evolutionChart(summary: KpiSummary, minSample: number): ChartOption {
  const rows = summary.series;
  const labels = rows.map(row => bucketLabel(row.bucket, summary.period.granularity));
  const rates = rows.map(row => { const n = num(row.sla_evaluable) ?? 0; return { n, interval: wilson(num(row.closed_late) ?? 0, n) }; });
  return {
    grid: { left: 4, right: 4, top: 58, bottom: 4, containLabel: true },
    legend: { ...legend, data: ['Abiertos', 'Cerrados', '% fuera del plazo', 'Intervalo 95 %'] },
    xAxis: { type: 'category', data: labels, axisLabel: { ...text, hideOverlap: true }, axisLine, axisTick: { show: false } },
    yAxis: [
      { type: 'value', name: 'Tickets', nameTextStyle: { ...text, align: 'left' }, axisLabel: text, splitLine, minInterval: 1 },
      { type: 'value', name: '% fuera', min: 0, max: 100, nameTextStyle: { ...text, align: 'right' }, axisLabel: { ...text, formatter: '{value} %' }, splitLine: { show: false } },
    ],
    series: [
      { name: 'Abiertos', type: 'bar', data: rows.map(row => num(row.opened) ?? 0), barMaxWidth: 30, itemStyle: { color: BRAND.graphite, borderRadius: [2, 2, 0, 0] } },
      { name: 'Cerrados', type: 'bar', data: rows.map(row => num(row.closed) ?? 0), barMaxWidth: 30, itemStyle: { color: BRAND.grey, borderRadius: [2, 2, 0, 0] } },
      { name: 'ic-base', type: 'line', yAxisIndex: 1, stack: 'ic', symbol: 'none', lineStyle: { opacity: 0 }, data: rates.map(rate => rate.interval ? round1(rate.interval.low) : null) },
      { name: 'Intervalo 95 %', type: 'line', yAxisIndex: 1, stack: 'ic', symbol: 'none', lineStyle: { opacity: 0 }, itemStyle: { color: 'rgba(241,37,53,0.25)' },
        areaStyle: { color: 'rgba(241,37,53,0.12)' }, data: rates.map(rate => rate.interval ? round1(rate.interval.high - rate.interval.low) : null) },
      { name: '% fuera del plazo', type: 'line', yAxisIndex: 1, color: BRAND.red, symbol: 'circle', symbolSize: 9, lineStyle: { width: 2.5 },
        label: { show: true, position: 'top', distance: 8, color: BRAND.red, fontSize: 12, fontWeight: 600, backgroundColor: 'rgba(255,255,255,0.92)', padding: [2, 5], borderRadius: 3,
          formatter: (event: { value: number }) => `${event.value} %` },
        data: rates.map(rate => rate.interval ? { value: round1(rate.interval.pct), itemStyle: rate.n < minSample ? { color: '#fff', borderColor: BRAND.red, borderWidth: 2 } : undefined } : null) },
    ],
  };
}

export function curveChart(points: TicketPoint[], cutAt: number): ChartOption {
  const curve = kaplanMeier(points, cutAt);
  const cohort = points.filter(point => point.openedInPeriod && !point.cancelled);
  const follow = Math.max(FLOOR_HOURS, ...cohort.map(point => (point.closedAt !== null && point.closedAt <= cutAt && point.hours !== null ? point.hours : (cutAt - point.openedAt) / 3600000)));
  const data = curve.steps.map(([t, value]) => [toLog(t), round1(value)]);
  if (curve.steps.length) data.push([toLog(follow), round1(curve.steps.at(-1)![1])]);
  const marks = [24, 48].map(hours => ({ coord: [toLog(hours), round1(resolvedBy(curve, hours) ?? 0)], value: `${round1(resolvedBy(curve, hours) ?? 0)} % a las ${hours} h` }));
  const median = curveMedian(curve);
  return {
    grid: { left: 4, right: 24, top: 24, bottom: 34, containLabel: true },
    xAxis: { ...timeAxis(follow), name: 'Tiempo desde la apertura', nameLocation: 'middle', nameGap: 30, nameTextStyle: text },
    yAxis: { type: 'value', min: 0, max: 100, axisLabel: { ...text, formatter: '{value} %' }, splitLine, axisLine: { show: false, onZero: false }, axisTick: { show: false } },
    series: [{
      type: 'line', step: 'end', showSymbol: false, data, lineStyle: { width: 3, color: BRAND.ink }, areaStyle: { color: 'rgba(59,68,77,0.07)' },
      markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: BRAND.slate, width: 1.2 }, label: { formatter: '{b}', color: BRAND.slate, fontSize: 12 },
        data: [{ xAxis: toLog(24), name: '24 h' }, { xAxis: toLog(48), name: '48 h' }, ...(median ? [{ yAxis: 50, name: '' }] : [])] },
      markPoint: { symbol: 'circle', symbolSize: 11, itemStyle: { color: BRAND.red, borderColor: '#fff', borderWidth: 2 },
        label: { show: true, position: 'left', distance: 8, color: BRAND.red, fontSize: 13, fontWeight: 600, formatter: (event: { value: string }) => event.value }, data: marks },
    }],
  };
}

export function histogramChart(facts: DeckFacts): ChartOption {
  const { histogram } = facts;
  const outcomes = (['dentro', 'justificado', 'fuera', 'sin_plazo', 'sin_dato'] as Outcome[]).filter(outcome => histogram.counts[outcome]?.some(value => value > 0));
  return {
    grid: { left: 4, right: 4, top: 52, bottom: 4, containLabel: true },
    legend,
    xAxis: { type: 'category', data: HOUR_BINS.map(([, , label]) => label), axisLabel: { ...text, interval: 0, rotate: 30 }, axisLine, axisTick: { show: false } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: text, splitLine, name: 'Cierres', nameTextStyle: { ...text, align: 'left' } },
    series: outcomes.map((outcome, index) => ({
      name: OUTCOME_NAMES[outcome], type: 'bar', stack: 'cierres', barMaxWidth: 46, data: histogram.counts[outcome], itemStyle: { color: OUTCOME_TONES[outcome] },
      markArea: index === 0 ? { silent: true, itemStyle: { color: 'rgba(241,37,53,0.045)' }, label: { color: BRAND.red, fontSize: 12, position: 'insideTopRight', distance: 8 },
        data: [[{ name: 'Más de 48 h', xAxis: HOUR_BINS[5][2] }, { xAxis: HOUR_BINS.at(-1)![2] }]] } : undefined,
    })),
  };
}

export function scatterChart(points: TicketPoint[]): ChartOption {
  const closed = points.filter(point => point.closedInPeriod && point.hours !== null);
  const order: Outcome[] = ['administrativo', 'sin_plazo', 'sin_dato', 'dentro', 'justificado', 'fuera'];
  const groups = order.map(outcome => ({ outcome, list: closed.filter(point => point.outcome === outcome) })).filter(group => group.list.length);
  const targets = [...new Set(closed.map(point => point.target).filter((value): value is number => value !== null))].sort((a, b) => a - b);
  return {
    grid: { left: 4, right: 20, top: 66, bottom: 4, containLabel: true },
    legend: { ...legend, icon: 'circle', data: [...groups].reverse().map(group => OUTCOME_NAMES[group.outcome]) },
    xAxis: { type: 'time', axisLabel: { ...text, hideOverlap: true }, axisLine: { ...axisLine, onZero: false }, splitLine: { show: false } },
    yAxis: { ...timeAxis(Math.max(0, ...closed.map(point => point.hours!))), name: 'Tiempo hasta el cierre', nameTextStyle: { ...text, align: 'left' } },
    series: groups.map((group, index) => ({
      name: OUTCOME_NAMES[group.outcome], type: 'scatter', symbolSize: group.outcome === 'fuera' ? 8 : 7,
      itemStyle: { color: OUTCOME_TONES[group.outcome], opacity: group.outcome === 'dentro' ? 0.55 : group.outcome === 'fuera' ? 0.9 : 0.7, borderColor: '#fff', borderWidth: 0.5 },
      data: group.list.map(point => [point.closedAt, toLog(point.hours!)]),
      markLine: index === groups.length - 1 && targets.length ? {
        silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: BRAND.slate, width: 1.2 },
        label: { formatter: '{b}', color: BRAND.slate, fontSize: 12, backgroundColor: 'rgba(255,255,255,0.9)', padding: [1, 4] },
        data: targets.map((hours, position) => ({ yAxis: toLog(hours), name: `Plazo ${hours} h`, label: { position: position === 0 && targets.length > 1 ? 'insideEndBottom' : 'insideEndTop' } })),
      } : undefined,
    })),
  };
}

export function arrivalsChart(points: TicketPoint[], timeZone: string): ChartOption {
  const cells = arrivalMatrix(points, timeZone);
  const data: Array<[number, number, number]> = [];
  cells.forEach((row, day) => row.forEach((list, hour) => data.push([hour, day, list.length])));
  const max = Math.max(1, ...data.map(item => item[2]));
  return {
    grid: { left: 4, right: 4, top: 8, bottom: 62, containLabel: true },
    xAxis: { type: 'category', data: Array.from({ length: 24 }, (_, hour) => `${hour}`), axisLabel: { ...text, interval: 1 }, axisLine, axisTick: { show: false },
      name: 'Hora de apertura', nameLocation: 'middle', nameGap: 28, nameTextStyle: text },
    yAxis: { type: 'category', data: WEEKDAYS, inverse: true, axisLabel: { ...text, color: BRAND.graphite }, axisLine: { show: false }, axisTick: { show: false } },
    visualMap: { min: 0, max, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 12, itemHeight: 180, text: [`${max}`, '0'], textStyle: text,
      inRange: { color: ['#F5F6F7', '#C9CED3', '#7B8794', '#1F2328'] } },
    series: [{ type: 'heatmap', data, itemStyle: { borderColor: '#fff', borderWidth: 2.5, borderRadius: 3 } }],
  };
}

export function groupsChart(facts: DeckFacts): ChartOption {
  const rows = facts.groups.rows.slice(0, 12);
  const overall = facts.groups.overall;
  const tone = (row: (typeof rows)[number]) => !overall || row.n < facts.minSample ? 'neutral' : row.high < overall.pct ? 'low' : row.low > overall.pct ? 'high' : 'neutral';
  return {
    grid: { left: 4, right: 4, top: 30, bottom: 4, containLabel: true },
    xAxis: { type: 'value', min: 0, max: 100, axisLabel: { ...text, formatter: '{value} %' }, splitLine },
    yAxis: [
      { type: 'category', data: rows.map(row => row.name), inverse: true, axisLabel: { ...text, color: BRAND.ink, width: 190, overflow: 'truncate' }, axisLine: { show: false }, axisTick: { show: false } },
      { type: 'category', position: 'right', inverse: true, data: rows.map(row => `${round1(row.pct)} %  ·  ${row.late} de ${row.n} fuera`),
        axisLabel: { ...text, width: 170, overflow: 'truncate' }, axisLine: { show: false }, axisTick: { show: false } },
    ],
    series: [
      { type: 'bar', stack: 'ic', barWidth: 12, itemStyle: { color: 'transparent' }, data: rows.map(row => round1(row.low)) },
      { type: 'bar', stack: 'ic', barWidth: 12, itemStyle: { color: BRAND.light, borderRadius: 6 }, data: rows.map(row => round1(row.high - row.low)) },
      { type: 'scatter', data: rows.map(row => ({ value: [round1(row.pct), row.name], symbolSize: Math.min(20, 8 + Math.sqrt(row.n) * 1.6),
        itemStyle: row.n < facts.minSample ? { color: '#fff', borderColor: BRAND.slate, borderWidth: 1.5 } : { color: tone(row) === 'low' ? BRAND.red : BRAND.ink } })),
        markLine: overall ? { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: BRAND.slate, width: 1.2 },
          label: { formatter: `General ${round1(overall.pct)} %`, color: BRAND.slate, fontSize: 12, position: 'start' }, data: [{ xAxis: round1(overall.pct) }] } : undefined },
    ],
  };
}

// Field activity series (preventive vs corrective, visits and calls) from the summary buckets.
export function seriesChart(summary: KpiSummary, spec: ChartSpec, colors: string[]): ChartOption {
  const rows = summary.series;
  return {
    grid: { left: 4, right: 4, top: 52, bottom: 4, containLabel: true },
    legend,
    xAxis: { type: 'category', data: rows.map(row => bucketLabel(row.bucket, summary.period.granularity)), axisLabel: { ...text, hideOverlap: true }, axisLine, axisTick: { show: false } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: text, splitLine },
    series: spec.series.map((series, index) => ({
      name: series.label, type: 'bar', barMaxWidth: 28, data: rows.map(row => num(row[series.key]) ?? 0), itemStyle: { color: colors[index % colors.length], borderRadius: [2, 2, 0, 0] },
      label: { show: rows.length <= 8, position: 'top', color: BRAND.slate, fontSize: 11, formatter: (event: { value: number }) => (event.value ? `${event.value}` : '') },
    })),
  };
}
