import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import type * as echarts from 'echarts/core';
import { Loader } from './OrionLoader';
import { fetchAllKpiRecords } from './serviceKpiApi';
import { hidePointPerson } from '../config/presentationPrivacy';
import {
  bucketLabel, chartsFor, formatCount, num, SERIES_COLORS, STATUS_DANGER, type Drill, type KpiSummary, type KpiView,
} from './serviceKpiModel';
import {
  arrivalMatrix, closingHistogram, complianceBy, curveMedian, dimensions, formatSpan, HISTOGRAM_OUTCOMES, HOUR_BINS, kaplanMeier, lateShare,
  FLOOR_HOURS, outcomeColors, outcomeLabels, resolvedBy, TIME_TICKS, toLog, toPoints, WEEKDAYS, wilson, type DimensionKey, type Outcome, type TicketPoint,
} from './kpiAnalytics';
import { axisLabel, axisLine, downloadChart, INK, MUTED, splitLine, tooltipBase, useEChart, type ChartHandlers, type ChartOption } from './kpiEcharts';

type Filters = Record<string, string | number>;
interface Selection { title: string; points: TicketPoint[] }
interface LabProps {
  view: KpiView; summary: KpiSummary; filters: Filters; revision: number;
  onDrill: (drill: Drill) => void; onOpenTicket: (ticket: { id: string; folio: string }) => void;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
// One line that scrolls on narrow screens, so a wrapped legend never covers the axis titles.
const legendBase = { type: 'scroll', top: 0, left: 0, right: 0, pageIconColor: INK, pageIconInactiveColor: '#c5d2d8', pageIconSize: 10, pageTextStyle: { color: MUTED, fontSize: 10 } };
const pct = (value: number | null) => (value === null ? 'Sin dato' : `${round1(value)} %`);
const html = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const dateTime = (value: number) => new Date(value).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const CURVE_COLORS = ['#193b49', '#2a78d6', '#eb6834', '#1baf7a', '#8a5cc8'];
const SCATTER_OUTCOMES: Outcome[] = ['dentro', 'fuera', 'justificado', 'sin_plazo', 'sin_dato', 'administrativo'];
const timeAxis = (maxHours: number) => {
  const max = Math.log10(Math.max(48, maxHours) * 1.2);
  const ticks = TIME_TICKS.map(hours => Math.log10(hours)).filter(value => value <= max);
  return { type: 'value', min: toLog(FLOOR_HOURS), max, splitLine: { ...splitLine, show: true }, axisTick: { customValues: ticks }, axisLine: { ...axisLine, onZero: false },
    axisLabel: { ...axisLabel, customValues: ticks, formatter: (value: number) => formatSpan(10 ** value) } };
};

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (value: T) => void }) {
  return <div className="kpi-lab-seg" role="group" aria-label={label}>
    {options.map(([key, text]) => <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>)}
  </div>;
}

function ChartPanel({ title, note, option, handlers, height = 290, file, wide, controls, footer, label }: {
  title: string; note?: ReactNode; option: ChartOption | null; handlers?: ChartHandlers; height?: number; file: string; wide?: boolean;
  controls?: (chart: RefObject<echarts.ECharts | null>) => ReactNode; footer?: ReactNode; label: string;
}) {
  const { ref, chart } = useEChart(option, handlers);
  return <figure className={`kpi-lab-panel${wide ? ' is-wide' : ''}`}>
    <figcaption>
      <div><strong>{title}</strong>{note && <span>{note}</span>}</div>
      <div className="kpi-lab-tools">{controls?.(chart)}
        <button type="button" className="kpi-lab-png" onClick={() => downloadChart(chart.current, file)} aria-label={`Descargar «${title}» como imagen`} title="Descargar imagen">PNG</button>
      </div>
    </figcaption>
    <div ref={ref} className="kpi-lab-canvas" style={{ height }} role="img" aria-label={label} />
    {footer}
  </figure>;
}

function EvolutionPanel({ view, summary, onDrill }: { view: KpiView; summary: KpiSummary; onDrill: (drill: Drill) => void }) {
  const rows = summary.series;
  const granularity = summary.period.granularity;
  const minSample = summary.period.min_sample || 5;
  const specs = chartsFor(view);
  const ticketsSpec = specs.find(spec => spec.id === 'tickets');
  const lateSpec = specs.find(spec => spec.id === 'late');
  const rates = useMemo(() => rows.map(row => {
    const n = num(row.sla_evaluable) ?? 0; const late = num(row.closed_late) ?? 0;
    return { n, late, interval: wilson(late, n) };
  }), [rows]);
  const option = useMemo<ChartOption>(() => {
    const labels = rows.map(row => bucketLabel(row.bucket, granularity));
    const zoom = rows.length > 16;
    return {
      color: [SERIES_COLORS[0], SERIES_COLORS[1], STATUS_DANGER],
      grid: { left: 8, right: 8, top: 44, bottom: zoom ? 44 : 10, containLabel: true },
      legend: { ...legendBase, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: MUTED, fontSize: 11 }, data: ['Abiertos', 'Cerrados', '% fuera del plazo', 'Intervalo 95 %'] },
      tooltip: {
        ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(25,59,73,0.05)' } },
        formatter: (params: Array<{ dataIndex: number }>) => {
          const index = params[0]?.dataIndex ?? 0; const row = rows[index]; const rate = rates[index];
          const line = (color: string, name: string, value: string) => `<div style="display:flex;gap:8px;align-items:center;margin-top:4px"><i style="width:9px;height:9px;border-radius:2px;background:${color}"></i>${name}<b style="margin-left:auto;padding-left:16px">${value}</b></div>`;
          return `<strong>${html(labels[index])}</strong>${line(SERIES_COLORS[0], 'Abiertos', formatCount(row.opened))}${line(SERIES_COLORS[1], 'Cerrados', formatCount(row.closed))}`
            + (rate.interval ? line(STATUS_DANGER, 'Fuera del plazo', `${rate.late} de ${rate.n} · ${pct(rate.interval.pct)}`)
              + `<div style="color:${MUTED};font-size:10px;margin-top:4px">Intervalo 95 %: ${round1(rate.interval.low)}–${round1(rate.interval.high)} %${rate.n < minSample ? ' · muestra pequeña' : ''}</div>`
              : `<div style="color:${MUTED};font-size:10px;margin-top:4px">Sin cierres evaluables en el intervalo</div>`)
            + `<div style="color:${MUTED};font-size:10px;margin-top:6px">Clic en una columna o punto para ver sus registros</div>`;
        },
      },
      xAxis: { type: 'category', data: labels, axisLabel: { ...axisLabel, hideOverlap: true }, axisLine, axisTick: { show: false } },
      yAxis: [
        { type: 'value', name: 'Tickets', nameTextStyle: { color: MUTED, fontSize: 10, align: 'left' }, axisLabel, splitLine, minInterval: 1 },
        { type: 'value', name: '% fuera', min: 0, max: 100, nameTextStyle: { color: MUTED, fontSize: 10, align: 'right' }, axisLabel: { ...axisLabel, formatter: '{value} %' }, splitLine: { show: false } },
      ],
      dataZoom: zoom ? [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 6, borderColor: 'transparent', fillerColor: 'rgba(40,99,122,0.12)', handleSize: 14 }] : [],
      series: [
        { name: 'Abiertos', type: 'bar', data: rows.map(row => num(row.opened) ?? 0), barMaxWidth: 22, itemStyle: { borderRadius: [3, 3, 0, 0] }, cursor: 'pointer' },
        { name: 'Cerrados', type: 'bar', data: rows.map(row => num(row.closed) ?? 0), barMaxWidth: 22, itemStyle: { borderRadius: [3, 3, 0, 0] }, cursor: 'pointer' },
        { name: 'ic-base', type: 'line', yAxisIndex: 1, stack: 'ic', data: rates.map(rate => rate.interval ? round1(rate.interval.low) : null), symbol: 'none', lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false } },
        { name: 'Intervalo 95 %', type: 'line', yAxisIndex: 1, stack: 'ic', data: rates.map(rate => rate.interval ? round1(rate.interval.high - rate.interval.low) : null), symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { color: 'rgba(195,84,92,0.14)' }, itemStyle: { color: 'rgba(195,84,92,0.3)' }, silent: true },
        { name: '% fuera del plazo', type: 'line', yAxisIndex: 1, color: STATUS_DANGER, symbol: 'circle', symbolSize: 8, lineStyle: { width: 2 }, cursor: 'pointer',
          data: rates.map(rate => rate.interval ? { value: round1(rate.interval.pct), itemStyle: rate.n < minSample ? { color: '#fff', borderColor: STATUS_DANGER, borderWidth: 2 } : undefined } : null) },
      ],
    };
  }, [rows, rates, granularity, minSample]);
  const handlers: ChartHandlers = {
    click: event => {
      const row = typeof event.dataIndex === 'number' ? rows[event.dataIndex] : null;
      if (!row) return;
      const target = event.seriesName === 'Abiertos' ? ticketsSpec?.series[0]?.drill?.(row.bucket)
        : event.seriesName === 'Cerrados' ? ticketsSpec?.series[1]?.drill?.(row.bucket)
          : event.seriesName === '% fuera del plazo' ? lateSpec?.series[0]?.drill?.(row.bucket) : null;
      if (target) onDrill(target);
    },
  };
  const totalLate = rates.reduce((sum, rate) => sum + rate.late, 0); const totalN = rates.reduce((sum, rate) => sum + rate.n, 0);
  const overall = wilson(totalLate, totalN);
  return <ChartPanel wide title="Evolución: volumen y cierres fuera del plazo" file="evolucion_cumplimiento" option={rows.length ? option : null} handlers={handlers} height={300}
    label="Tickets abiertos y cerrados por intervalo, con el porcentaje de cierres fuera del plazo y su intervalo de confianza"
    note={overall ? <>Periodo: {totalLate} de {totalN} cierres evaluables fuera del plazo ({pct(overall.pct)}, intervalo 95 % {round1(overall.low)}–{round1(overall.high)} %). Los puntos huecos tienen menos de {minSample} casos.</> : 'Sin cierres evaluables en el periodo.'} />;
}

export default function ServiceKpiTimeLab({ view, summary, filters, revision, onDrill, onOpenTicket }: LabProps) {
  const root = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  const [state, setState] = useState<{ key: string | null; points: TicketPoint[]; error?: string }>({ key: null, points: [] });
  const [curveBy, setCurveBy] = useState<'todos' | 'equipo' | 'prioridad' | 'canal' | 'region'>('todos');
  const [heatMetric, setHeatMetric] = useState<'llegadas' | 'fuera'>('llegadas');
  const [dimension, setDimension] = useState<DimensionKey>('responsable');
  const [selection, setSelection] = useState<(Selection & { key: string }) | null>(null);
  const filtersKey = JSON.stringify(filters);
  const requestKey = `${filtersKey}|${revision}`;
  const cutAt = Date.parse(summary.period.cut_at);
  const minSample = summary.period.min_sample || 5;
  const timeZone = summary.period.timezone || 'America/Chihuahua';

  // Tickets load only once the lab is on screen (hidden views never intersect).
  useEffect(() => {
    const element = root.current;
    if (!element || seen) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setSeen(true); observer.disconnect(); } }, { rootMargin: '200px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [seen]);
  useEffect(() => {
    if (!seen) return;
    let active = true;
    const key = requestKey;
    fetchAllKpiRecords({ dataset: 'tickets', filters: JSON.parse(key.slice(0, key.lastIndexOf('|'))) as Filters, match: { relevant: true }, search: '', sort: 'opened_at', desc: false })
      .then(result => { if (active) setState({ key, points: toPoints(result.rows).map(hidePointPerson) }); })
      .catch(cause => { if (active) setState(current => ({ key, points: current.points, error: (cause as Error).message })); });
    return () => { active = false; };
  }, [seen, requestKey]);

  // While a new period loads, the previous analysis stays visible (dimmed) instead of flashing empty.
  const loading = !seen || state.key !== requestKey;
  const error = state.key === requestKey ? state.error : undefined;
  const points = state.points;
  const select = (title: string, list: TicketPoint[]) => {
    if (!list.length) return;
    setSelection({ title, points: list, key: requestKey });
    window.setTimeout(() => selectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  };

  // ── Closures map ─────────────────────────────────────────────────────────────────────────
  const scatter = useMemo(() => {
    const closed = points.filter(point => point.closedInPeriod && point.hours !== null);
    const groups = SCATTER_OUTCOMES.map(outcome => ({ outcome, list: closed.filter(point => point.outcome === outcome) })).filter(group => group.list.length);
    const targets = [...new Set(closed.map(point => point.target).filter((value): value is number => value !== null))].sort((a, b) => a - b);
    const option: ChartOption = {
      grid: { left: 8, right: 16, top: 56, bottom: 46, containLabel: true },
      legend: { ...legendBase, icon: 'circle', itemWidth: 9, itemHeight: 9, textStyle: { color: MUTED, fontSize: 11 } },
      tooltip: {
        ...tooltipBase, trigger: 'item',
        formatter: (event: { seriesIndex: number; dataIndex: number }) => {
          const point = groups[event.seriesIndex]?.list[event.dataIndex];
          if (!point) return '';
          return `<strong>${html(point.folio)}</strong> · ${html(outcomeLabels[point.outcome])}<br/>${html(point.client)}<br/><span style="color:${MUTED}">${html(point.responsible)} · ${html(point.platform)}</span>`
            + `<div style="margin-top:6px">Cerrado en <b>${formatSpan(point.hours)}</b>${point.target ? ` · plazo ${point.target} h` : ''}</div>`
            + `<div style="color:${MUTED};font-size:10px">${dateTime(point.closedAt!)}</div><div style="color:${MUTED};font-size:10px;margin-top:4px">Clic para abrir el expediente</div>`;
        },
      },
      xAxis: { type: 'time', axisLabel: { ...axisLabel, hideOverlap: true }, axisLine: { ...axisLine, onZero: false }, splitLine: { show: false } },
      yAxis: { ...timeAxis(Math.max(0, ...closed.map(point => point.hours!))), name: 'Tiempo hasta el cierre', nameTextStyle: { color: MUTED, fontSize: 10, align: 'left' } },
      dataZoom: [{ type: 'inside', xAxisIndex: 0 }, { type: 'slider', xAxisIndex: 0, height: 16, bottom: 6, borderColor: 'transparent', fillerColor: 'rgba(40,99,122,0.12)', handleSize: 14 }],
      brush: { xAxisIndex: 0, yAxisIndex: 0, brushStyle: { color: 'rgba(40,99,122,0.08)', borderColor: '#28637a', borderWidth: 1 }, throttleType: 'debounce', throttleDelay: 200, outOfBrush: { colorAlpha: 0.15 } },
      series: groups.map((group, index) => ({
        name: outcomeLabels[group.outcome], type: 'scatter', symbolSize: group.outcome === 'fuera' ? 8 : 7, cursor: 'pointer',
        itemStyle: { color: outcomeColors[group.outcome], opacity: group.outcome === 'administrativo' ? 0.55 : 0.82, borderColor: '#fff', borderWidth: 0.6 },
        emphasis: { scale: 1.7 },
        data: group.list.map(point => [point.closedAt, toLog(point.hours!)]),
        markLine: index === 0 && targets.length ? {
          silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: '#7b8e98', width: 1 },
          label: { formatter: '{b}', color: MUTED, fontSize: 10, backgroundColor: 'rgba(255,255,255,0.85)', padding: [1, 4], borderRadius: 3 },
          // The lowest commitment labels below its line, the rest above, so 24 h and 48 h never collide.
          data: targets.map((hours, order) => ({ yAxis: toLog(hours), name: `Plazo ${hours} h`, label: { position: order === 0 && targets.length > 1 ? 'insideEndBottom' : 'insideEndTop' } })),
        } : undefined,
      })),
    };
    return { groups, option, count: closed.length };
  }, [points]);
  const scatterHandlers: ChartHandlers = {
    click: event => {
      if (event.componentType !== 'series' || typeof event.seriesIndex !== 'number' || typeof event.dataIndex !== 'number') return;
      const point = scatter.groups[event.seriesIndex]?.list[event.dataIndex];
      if (point) onOpenTicket({ id: point.id, folio: point.folio });
    },
    brushselected: event => {
      const chosen = (event.batch?.[0]?.selected || []).flatMap(item => item.dataIndex.map(index => scatter.groups[item.seriesIndex]?.list[index]).filter(Boolean)) as TicketPoint[];
      if (chosen.length) select(`Área seleccionada en el mapa de cierres`, chosen);
    },
  };

  // ── Resolution curve (Kaplan–Meier) ────────────────────────────────────────────────────────
  const resolution = useMemo(() => {
    const cohort = points.filter(point => point.openedInPeriod && !point.cancelled);
    const total = kaplanMeier(points, cutAt);
    let groups: Array<{ name: string; list: TicketPoint[] }> = [{ name: 'Todos los tickets', list: cohort }];
    if (curveBy !== 'todos') {
      const dimension = dimensions[curveBy];
      const map = new Map<string, { name: string; list: TicketPoint[] }>();
      for (const point of cohort) { const name = dimension.name(point); const group = map.get(name) || { name, list: [] }; group.list.push(point); map.set(name, group); }
      groups = [...map.values()].filter(group => group.list.length >= 3).sort((a, b) => b.list.length - a.list.length).slice(0, 5);
    }
    const curves = groups.map(group => {
      const curve = kaplanMeier(group.list, cutAt);
      const follow = Math.max(0.25, ...group.list.map(point => (point.closedAt !== null && point.closedAt <= cutAt && point.hours !== null ? point.hours : (cutAt - point.openedAt) / 3600000)));
      const data = curve.steps.map(([t, value]) => [toLog(t), round1(value)]);
      data.push([toLog(follow), round1(curve.steps.at(-1)![1])]);
      return { name: `${group.name} (${curve.n})`, curve, data, follow };
    });
    const option: ChartOption = {
      color: CURVE_COLORS,
      grid: { left: 8, right: 16, top: 40, bottom: 34, containLabel: true },
      legend: { ...legendBase, icon: 'roundRect', itemWidth: 12, itemHeight: 3, textStyle: { color: MUTED, fontSize: 11 } },
      tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: '#9fb2bc' } },
        formatter: (params: Array<{ seriesName: string; value: [number, number]; color: string }>) => `<strong>A las ${formatSpan(10 ** (params[0]?.value[0] ?? 0))} de abierto</strong>`
          + params.map(item => `<div style="display:flex;gap:8px;align-items:center;margin-top:4px"><i style="width:9px;height:3px;background:${item.color}"></i>${html(item.seriesName)}<b style="margin-left:auto;padding-left:16px">${item.value[1]} % cerrado</b></div>`).join('') },
      xAxis: { ...timeAxis(Math.max(0, ...curves.map(item => item.follow))), name: 'Tiempo desde la apertura', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: MUTED, fontSize: 10 } },
      yAxis: { type: 'value', min: 0, max: 100, axisLabel: { ...axisLabel, formatter: '{value} %' }, splitLine, axisLine: { show: false, onZero: false }, axisTick: { show: false } },
      series: curves.map((item, index) => ({
        name: item.name, type: 'line', step: 'end', showSymbol: false, data: item.data, lineStyle: { width: index === 0 && curveBy === 'todos' ? 2.5 : 2 },
        areaStyle: curveBy === 'todos' ? { color: 'rgba(25,59,73,0.06)' } : undefined,
        markLine: index === 0 ? { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: '#9fb2bc', width: 1 }, label: { formatter: '{b}', color: MUTED, fontSize: 10 },
          data: [{ xAxis: toLog(24), name: '24 h' }, { xAxis: toLog(48), name: '48 h' }] } : undefined,
      })),
    };
    return { option, total, open: total.n - total.events, cohort: cohort.length };
  }, [points, cutAt, curveBy]);

  // ── Closing-time distribution ─────────────────────────────────────────────────────────────
  const histogram = useMemo(() => {
    const data = closingHistogram(points);
    const outcomes = HISTOGRAM_OUTCOMES.filter(outcome => data.counts[outcome].some(value => value > 0));
    const option: ChartOption = {
      grid: { left: 8, right: 10, top: 40, bottom: 10, containLabel: true },
      legend: { ...legendBase, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: MUTED, fontSize: 11 } },
      tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(25,59,73,0.05)' } } },
      xAxis: { type: 'category', data: HOUR_BINS.map(([, , label]) => label), axisLabel: { ...axisLabel, interval: 0, rotate: 30 }, axisLine, axisTick: { show: false } },
      yAxis: { type: 'value', minInterval: 1, axisLabel, splitLine, name: 'Cierres', nameTextStyle: { color: MUTED, fontSize: 10, align: 'left' } },
      series: outcomes.map((outcome, index) => ({
        name: outcomeLabels[outcome], type: 'bar', stack: 'cierres', data: data.counts[outcome], barMaxWidth: 34, cursor: 'pointer',
        itemStyle: { color: outcomeColors[outcome] },
        markArea: index === 0 ? { silent: true, itemStyle: { color: 'rgba(195,84,92,0.05)' }, label: { color: '#b34851', fontSize: 10, position: 'insideTopRight', distance: 6 },
          data: [[{ name: 'Más de 48 h', xAxis: HOUR_BINS[5][2] }, { xAxis: HOUR_BINS.at(-1)![2] }]] } : undefined,
      })),
    };
    return { data, outcomes, option };
  }, [points]);
  const histogramHandlers: ChartHandlers = {
    click: event => {
      if (typeof event.dataIndex !== 'number' || typeof event.seriesIndex !== 'number') return;
      const outcome = histogram.outcomes[event.seriesIndex];
      select(`Cerrados en ${HOUR_BINS[event.dataIndex][2]} · ${outcomeLabels[outcome]}`, histogram.data.members[event.dataIndex].filter(point => point.outcome === outcome));
    },
  };

  // ── Arrivals heat map ─────────────────────────────────────────────────────────────────────
  const arrivals = useMemo(() => {
    const cells = arrivalMatrix(points, timeZone);
    let peak = { day: 0, hour: 0, n: 0 };
    const data: Array<[number, number, number | '-']> = [];
    cells.forEach((row, day) => row.forEach((list, hour) => {
      if (list.length > peak.n) peak = { day, hour, n: list.length };
      if (heatMetric === 'llegadas') data.push([hour, day, list.length]);
      else { const share = lateShare(list); data.push([hour, day, share.n >= minSample ? round1(share.late / share.n * 100) : '-']); }
    }));
    const max = heatMetric === 'llegadas' ? Math.max(1, ...data.map(item => (typeof item[2] === 'number' ? item[2] : 0))) : 100;
    const option: ChartOption = {
      grid: { left: 8, right: 10, top: 10, bottom: 52, containLabel: true },
      tooltip: { ...tooltipBase, trigger: 'item', formatter: (event: { value: [number, number, number | '-'] }) => {
        const [hour, day] = event.value; const list = cells[day][hour]; const share = lateShare(list);
        return `<strong>${WEEKDAYS[day]} · ${hour}:00–${hour + 1}:00</strong><div style="margin-top:4px">${list.length} tickets abiertos</div>`
          + `<div style="color:${MUTED};font-size:10px">${share.n ? `${share.late} de ${share.n} cierres evaluables fuera del plazo` : 'Sin cierres evaluables'}</div>`;
      } },
      xAxis: { type: 'category', data: Array.from({ length: 24 }, (_, hour) => String(hour)), axisLabel: { ...axisLabel, interval: 1 }, axisLine, axisTick: { show: false }, splitArea: { show: false },
        name: 'Hora de apertura', nameLocation: 'middle', nameGap: 22, nameTextStyle: { color: MUTED, fontSize: 10 } },
      yAxis: { type: 'category', data: WEEKDAYS, inverse: true, axisLabel, axisLine: { show: false }, axisTick: { show: false } },
      visualMap: { min: 0, max, calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 10, itemHeight: 140,
        text: heatMetric === 'llegadas' ? [`${max}`, '0'] : ['100 %', '0 %'], textStyle: { color: MUTED, fontSize: 10 },
        inRange: { color: heatMetric === 'llegadas' ? ['#f3f7f9', '#a9cbd6', '#3d7f95', '#193b49'] : ['#f2f6f4', '#f0c9cc', '#c3545c', '#8e2f37'] } },
      series: [{ type: 'heatmap', data, cursor: 'pointer', itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { borderColor: INK, borderWidth: 1 } } }],
    };
    return { cells, peak, option };
  }, [points, timeZone, heatMetric, minSample]);
  const arrivalHandlers: ChartHandlers = {
    click: event => {
      const value = event.value as [number, number] | undefined;
      if (!value) return;
      select(`Abiertos en ${WEEKDAYS[value[1]]} de ${value[0]}:00 a ${value[0] + 1}:00`, arrivals.cells[value[1]][value[0]]);
    },
  };

  // ── Compliance by dimension ───────────────────────────────────────────────────────────────
  const compliance = useMemo(() => {
    const result = complianceBy(points, dimension);
    const overall = result.overall;
    const tone = (row: (typeof result.rows)[number]) => !overall || row.n < minSample ? 'neutral' : row.high < overall.pct ? 'low' : row.low > overall.pct ? 'high' : 'neutral';
    const option: ChartOption = {
      grid: { left: 8, right: 8, top: 22, bottom: 10, containLabel: true },
      tooltip: { ...tooltipBase, trigger: 'item', formatter: (event: { dataIndex: number }) => {
        const row = result.rows[event.dataIndex]; if (!row) return '';
        return `<strong>${html(row.name)}</strong><div style="margin-top:4px">${pct(row.pct)} dentro del plazo</div><div style="color:${MUTED};font-size:10px">${row.late} fuera de ${row.n} cierres evaluables · intervalo 95 % ${round1(row.low)}–${round1(row.high)} %</div>`
          + (row.n < minSample ? `<div style="color:${MUTED};font-size:10px">Muestra pequeña: no permite comparar</div>` : '') + `<div style="color:${MUTED};font-size:10px;margin-top:4px">Clic para ver los cierres</div>`;
      } },
      xAxis: { type: 'value', min: 0, max: 100, axisLabel: { ...axisLabel, formatter: '{value} %' }, splitLine },
      yAxis: [
        { type: 'category', data: result.rows.map(row => row.name), inverse: true, axisLabel: { ...axisLabel, color: INK, width: 150, overflow: 'truncate' }, axisLine: { show: false }, axisTick: { show: false } },
        { type: 'category', position: 'right', data: result.rows.map(row => `${round1(row.pct)} %  ·  ${row.late} de ${row.n} fuera`), inverse: true,
          axisLabel: { ...axisLabel, width: 120, overflow: 'truncate' }, axisLine: { show: false }, axisTick: { show: false } },
      ],
      series: [
        { type: 'bar', stack: 'ic', data: result.rows.map(row => round1(row.low)), itemStyle: { color: 'transparent' }, barWidth: 10, silent: true, tooltip: { show: false } },
        { type: 'bar', stack: 'ic', name: 'Intervalo 95 %', data: result.rows.map(row => round1(row.high - row.low)), barWidth: 10, cursor: 'pointer',
          itemStyle: { color: 'rgba(25,59,73,0.12)', borderRadius: 5 } },
        { type: 'scatter', name: '% dentro del plazo', cursor: 'pointer',
          data: result.rows.map(row => ({ value: [round1(row.pct), row.name], symbolSize: Math.min(18, 7 + Math.sqrt(row.n) * 1.6),
            itemStyle: row.n < minSample ? { color: '#fff', borderColor: '#8fa2ac', borderWidth: 1.5 }
              : { color: tone(row) === 'low' ? '#c3545c' : tone(row) === 'high' ? '#278a77' : INK } })),
          markLine: overall ? { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: '#7b8e98' }, label: { formatter: `General ${round1(overall.pct)} %`, color: MUTED, fontSize: 10, position: 'start' },
            data: [{ xAxis: round1(overall.pct) }] } : undefined },
      ],
    };
    return { ...result, option, height: Math.max(170, 46 + result.rows.length * 30) };
  }, [points, dimension, minSample]);
  const complianceHandlers: ChartHandlers = {
    click: event => {
      const row = typeof event.dataIndex === 'number' ? compliance.rows[event.dataIndex] : null;
      if (!row) return;
      const dimensionSpec = dimensions[dimension];
      onDrill({ dataset: 'tickets', match: { closed_in_period: true, sla_evaluable: true, [dimensionSpec.field]: row.value }, title: `Cierres evaluables · ${dimensionSpec.label}: ${row.name}`, definition: 'late_rate' });
    },
  };

  const all = resolution.total;
  const insights = points.length ? [
    ['Cerrados antes de 24 h', pct(resolvedBy(all, 24)), `de ${formatCount(all.n)} tickets abiertos en el periodo`],
    ['Cerrados antes de 48 h', pct(resolvedBy(all, 48)), resolution.open ? `${formatCount(resolution.open)} siguen abiertos al corte` : 'Ninguno sigue abierto al corte'],
    ['Mediana de cierre', formatSpan(curveMedian(all)), 'Considera los abiertos (Kaplan-Meier)'],
    ['90 % cierra antes de', formatSpan(histogram.data.p90), `${formatCount(histogram.data.total)} cierres en el periodo`],
    ['Cumplimiento del plazo', compliance.overall ? pct(compliance.overall.pct) : 'Sin dato', compliance.overall ? `Intervalo 95 %: ${round1(compliance.overall.low)}–${round1(compliance.overall.high)} %` : 'Sin cierres evaluables'],
    ['Franja con más llegadas', arrivals.peak.n ? `${WEEKDAYS[arrivals.peak.day]} ${arrivals.peak.hour}:00` : 'Sin dato', arrivals.peak.n ? `${arrivals.peak.n} tickets abiertos en esa hora` : 'Sin aperturas en el periodo'],
  ] : [];

  const sel = selection && selection.key === requestKey ? selection : null;
  const selLate = sel ? lateShare(sel.points) : null;
  const selHours = sel ? sel.points.map(point => point.hours).filter((value): value is number => value !== null) : [];
  const selMedian = selHours.length ? [...selHours].sort((a, b) => a - b)[Math.floor((selHours.length - 1) / 2)] : null;

  return <div ref={root} className="kpi-lab" aria-label="Análisis de cumplimiento y tiempos">
    <EvolutionPanel view={view} summary={summary} onDrill={onDrill} />
    {error && <p role="alert" className="tc-error">No se pudieron cargar los tickets del análisis: {error}</p>}
    {loading && !points.length && <Loader label="Cargando los tickets del periodo para el análisis…" />}
    {!loading && !error && !points.length && <div className="kpi-lab-loading">Sin tickets en el periodo con estos filtros.</div>}
    {points.length > 0 && <>
      {insights.length > 0 && <dl className="kpi-lab-insights">{insights.map(([label, value, detail]) => <div key={label}><dt>{label}</dt><dd>{value}</dd><span>{detail}</span></div>)}</dl>}
      <div className={`kpi-lab-grid${loading ? ' is-refreshing' : ''}`} aria-busy={loading}>
        <ChartPanel title="Mapa de cierres" file="mapa_cierres" option={scatter.option} handlers={scatterHandlers} height={330}
          label="Cada punto es un ticket cerrado: fecha de cierre contra horas hasta el cierre, coloreado por resultado del plazo"
          note={`${formatCount(scatter.count)} cierres · cada punto es un ticket; clic para abrirlo, rueda para acercar.`}
          controls={chart => <>
            <button type="button" className="kpi-lab-tool" onClick={() => chart.current?.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'rect', brushMode: 'single' } })}>Seleccionar área</button>
            <button type="button" className="kpi-lab-tool" onClick={() => { chart.current?.dispatchAction({ type: 'brush', areas: [] }); chart.current?.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: false } }); }}>Quitar</button>
          </>} />
        <ChartPanel title="Curva de cierre" file="curva_cierre" option={resolution.option} height={330}
          label="Porcentaje acumulado de tickets cerrados según el tiempo transcurrido desde su apertura"
          note="% de tickets ya cerrados según el tiempo desde su apertura. Los abiertos cuentan hasta el corte."
          controls={() => <Segmented label="Separar curva por" value={curveBy} onChange={setCurveBy}
            options={[['todos', 'Todos'], ['equipo', 'Equipo'], ['prioridad', 'Prioridad'], ['canal', 'Canal'], ['region', 'Región']]} />} />
        <ChartPanel title="Distribución del tiempo de cierre" file="distribucion_cierre" option={histogram.option} handlers={histogramHandlers} height={300}
          label="Cantidad de cierres por rango de tiempo hasta el cierre, separados por resultado del plazo"
          note={`Mediana ${formatSpan(histogram.data.median)} · percentil 90 ${formatSpan(histogram.data.p90)}. Clic en una barra para listar sus tickets.`} />
        <ChartPanel title="Cuándo llegan los tickets" file="llegadas_semana" option={arrivals.option} handlers={arrivalHandlers} height={300}
          label="Mapa de calor de tickets abiertos por día de la semana y hora del día"
          note={heatMetric === 'llegadas' ? `Aperturas por día y hora (${timeZone}). Clic en una celda para listarlas.` : `% de cierres fuera del plazo según la hora de apertura; vacío con menos de ${minSample} casos.`}
          controls={() => <Segmented label="Medida del mapa" value={heatMetric} onChange={setHeatMetric} options={[['llegadas', 'Llegadas'], ['fuera', '% fuera']]} />} />
        <ChartPanel wide title="Cumplimiento del plazo por grupo" file="cumplimiento_grupo" option={compliance.option} handlers={complianceHandlers} height={compliance.height}
          label="Porcentaje de cierres dentro del plazo por grupo, con intervalo de confianza del 95 % y tamaño de muestra"
          note={<>Punto: % dentro del plazo; barra: intervalo 95 %; a la derecha, cierres fuera del plazo de los evaluables. Rojo o verde solo cuando la diferencia con el general es clara; huecos con menos de {minSample} casos.{compliance.hidden ? ` ${compliance.hidden} grupos más pequeños no se muestran.` : ''}</>}
          controls={() => <Segmented label="Agrupar por" value={dimension} onChange={setDimension}
            options={(Object.keys(dimensions) as DimensionKey[]).map(key => [key, dimensions[key].label])} />} />
      </div>
      {sel && <section ref={selectionRef} className="kpi-lab-selection" aria-label="Tickets seleccionados">
        <header>
          <div><strong>{sel.title}</strong>
            <span>{formatCount(sel.points.length)} tickets · mediana de cierre {formatSpan(selMedian)}{selLate && selLate.n ? ` · ${selLate.late} de ${selLate.n} cierres evaluables fuera del plazo` : ''}</span></div>
          <button type="button" className="tc-text-button" onClick={() => setSelection(null)}>Quitar selección</button>
        </header>
        <div className="tc-table-scroll"><table className="tc-table kpi-mini-table">
          <thead><tr><th>Folio</th><th>Cliente</th><th>Responsable</th><th>Apertura</th><th>Tiempo hasta el cierre</th><th>Plazo</th></tr></thead>
          <tbody>{[...sel.points].sort((a, b) => (b.hours ?? -1) - (a.hours ?? -1)).slice(0, 80).map(point => <tr key={point.id} className="is-clickable" tabIndex={0}
            onClick={() => onOpenTicket({ id: point.id, folio: point.folio })} onKeyDown={event => { if (event.key === 'Enter') onOpenTicket({ id: point.id, folio: point.folio }); }}>
            <td><strong>{point.folio}</strong></td><td>{point.client}</td><td>{point.responsible}</td><td>{dateTime(point.openedAt)}</td>
            <td>{point.hours === null ? 'Abierto' : formatSpan(point.hours)}</td>
            <td><span className="kpi-lab-outcome"><i className="kpi-lab-dot" style={{ background: outcomeColors[point.outcome] }} />{outcomeLabels[point.outcome]}</span></td>
          </tr>)}</tbody>
        </table></div>
        {sel.points.length > 80 && <p className="kpi-note">Se muestran los 80 con mayor tiempo; acota la selección para ver el resto.</p>}
      </section>}
    </>}
  </div>;
}
