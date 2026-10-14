// ECharts options for the reliability lab. One job per chart, one value axis per chart (no dual axes), cohort colors
// fixed by entity (validated with the dataviz palette checker: all-pairs CVD ΔE ≥ 9.2), status red only for failures.
import { echarts, INK, MUTED, GRID, axisLabel, axisLine, splitLine, tooltipBase, type ChartOption } from './kpiEcharts';
import { CustomChart, SankeyChart } from 'echarts/charts';
import { GraphicComponent } from 'echarts/components';
import type { KmCurve } from './reliabilityStats';
import { formatDay, kindLabels, type FollowUp } from './reliabilityAnalytics';

echarts.use([CustomChart, SankeyChart, GraphicComponent]);

export const COLORS = {
  reacondicionado: '#2a78d6', primera_instalacion: '#eb6834', reinstalado: '#1baf7a', // categorical slots 1–3
  low: '#4a3aa7', high: '#eda100', // dose groups (own pair: different entities than cohorts)
  critical: '#d03b3b', serious: '#ec835a', warning: '#fab219', good: '#0ca30c', neutral: '#9aa9b2', faint: '#cfd9df',
  seq: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'],
};
export const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const pct = (v: number) => `${(v * 100).toFixed(1)} %`;
const num = (v: number, d = 2) => v.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
const grid = (extra: Record<string, unknown> = {}) => ({ left: 54, right: 22, top: 26, bottom: 46, containLabel: false, ...extra });
const dayTicks = (horizon: number) => [0, 30, 90, 180, 365].filter(t => t <= horizon);

// ── Kaplan–Meier: step curves, log(−log) band, censor ticks; the curve stops at its last observed time ─────
export interface KmSeries { name: string; color: string; curve: KmCurve }
export function kmOption(series: KmSeries[], horizon: number): ChartOption {
  const out: unknown[] = [];
  for (const s of series) {
    if (!s.curve.n) continue;
    const end = Math.min(s.curve.maxT, horizon);
    const steps = s.curve.steps.filter(step => step.t <= end);
    const last = steps[steps.length - 1];
    const line = [...steps.map(step => [step.t, step.s]), [end, last.s]];
    const low = [...steps.map(step => [step.t, step.low]), [end, last.low]];
    const width = [...steps.map(step => [step.t, step.high - step.low]), [end, last.high - last.low]];
    const stack = `band-${s.name}`;
    out.push({ name: `${s.name} · banda`, type: 'line', step: 'end', data: low, stack, symbol: 'none', lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false } });
    out.push({ name: `${s.name} · banda`, type: 'line', step: 'end', data: width, stack, symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { color: s.color, opacity: 0.12 }, silent: true, tooltip: { show: false } });
    out.push({ name: s.name, type: 'line', step: 'end', data: line, symbol: 'none', lineStyle: { width: 2, color: s.color }, itemStyle: { color: s.color }, z: 3 });
    const at = (t: number) => { let v = 1; for (const step of s.curve.steps) { if (step.t <= t) v = step.s; else break; } return v; };
    out.push({ name: s.name, type: 'scatter', data: s.curve.censored.filter(t => t <= end).map(t => [t, at(t)]), symbol: 'path://M0,-6V6', symbolSize: [2, 10],
      itemStyle: { color: s.color }, tooltip: { show: false }, z: 4 });
  }
  return {
    grid: grid(), legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 14, itemHeight: 3, textStyle: { color: INK, fontSize: 11 }, data: series.map(s => s.name) },
    tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: MUTED } },
      formatter: (items: Array<{ seriesName: string; axisValue: number; seriesType: string }>) => {
        const t = Math.round(items[0]?.axisValue ?? 0);
        const rows = series.filter(s => s.curve.n && t <= s.curve.maxT).map(s => {
          let step = s.curve.steps[0]; for (const x of s.curve.steps) { if (x.t <= t) step = x; else break; }
          return `<span style="color:${s.color}">●</span> ${esc(s.name)}: <b>${pct(step.s)}</b> <span style="color:${MUTED}">IC 95 % ${pct(step.low)}–${pct(step.high)}</span>`;
        });
        return `<b>Día ${t}</b> después de la entrega<br/>${rows.join('<br/>') || 'Fuera del seguimiento observado'}`;
      } },
    xAxis: { type: 'value', min: 0, max: horizon, name: 'Días desde la entrega', nameLocation: 'middle', nameGap: 28, nameTextStyle: { color: MUTED, fontSize: 10 },
      axisLabel: { ...axisLabel, customValues: dayTicks(horizon) }, axisTick: { customValues: dayTicks(horizon) }, splitLine: { show: false }, axisLine },
    yAxis: { type: 'value', min: 0, max: 1, axisLabel: { ...axisLabel, formatter: (v: number) => `${Math.round(v * 100)} %` }, splitLine, name: 'Sin correctivo', nameTextStyle: { color: MUTED, fontSize: 10 } },
    series: out,
  };
}

// ── Forest plot: estimate + 95 % interval per row on ONE axis; optional reference line (1 for ratios) ───────
export interface ForestRow { label: string; value: number; low: number; high: number; color: string; detail?: string }
export function forestOption(rows: ForestRow[], options: { axisName: string; reference?: number; log?: boolean; percent?: boolean; max?: number }): ChartOption {
  const fmt = (v: number) => (options.percent ? pct(v) : num(v));
  const labels = rows.map(r => r.label);
  const finite = rows.flatMap(r => [r.low, r.high, r.value]).filter(Number.isFinite);
  const top = options.max ?? (finite.length ? Math.max(...finite) * 1.08 : 1);
  return {
    grid: grid({ left: 190, bottom: 40, top: 12 }),
    tooltip: { ...tooltipBase, trigger: 'item', formatter: (p: { dataIndex: number }) => { const r = rows[p.dataIndex]; return r ? `<b>${esc(r.label)}</b><br/>${fmt(r.value)} · IC 95 % ${fmt(r.low)}–${fmt(r.high)}${r.detail ? `<br/><span style="color:${MUTED}">${esc(r.detail)}</span>` : ''}` : ''; } },
    yAxis: { type: 'category', data: labels, inverse: true, axisLabel: { ...axisLabel, color: INK, width: 180, overflow: 'truncate' }, axisTick: { show: false }, axisLine },
    xAxis: options.log ? { type: 'log', logBase: 2, name: options.axisName, nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: MUTED, fontSize: 10 }, axisLabel: { ...axisLabel, formatter: (v: number) => num(v, v < 1 ? 2 : 1) }, splitLine }
      : { type: 'value', min: 0, max: top, name: options.axisName, nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: MUTED, fontSize: 10 }, axisLabel: { ...axisLabel, formatter: (v: number) => (options.percent ? `${Math.round(v * 100)} %` : num(v, 1)) }, splitLine },
    series: [{
      type: 'custom', data: rows.map((r, i) => [Math.max(r.low, options.log ? 1e-3 : 0), Math.min(r.high, options.log ? 1e3 : top), r.value, i]),
      encode: { x: [0, 1, 2], y: 3 },
      renderItem: (_params: unknown, api: { value: (i: number) => number; coord: (v: number[]) => number[]; size: (v: number[]) => number[] }) => {
        const i = api.value(3); const row = rows[i]; if (!row) return null;
        const [x1, y] = api.coord([api.value(0), i]); const [x2] = api.coord([api.value(1), i]); const [xv] = api.coord([Math.max(api.value(2), options.log ? 1e-3 : 0), i]);
        return { type: 'group', children: [
          { type: 'line', shape: { x1, y1: y, x2, y2: y }, style: { stroke: row.color, lineWidth: 2 } },
          { type: 'line', shape: { x1, y1: y - 5, x2: x1, y2: y + 5 }, style: { stroke: row.color, lineWidth: 2 } },
          { type: 'line', shape: { x1: x2, y1: y - 5, x2, y2: y + 5 }, style: { stroke: row.color, lineWidth: 2 } },
          { type: 'circle', shape: { cx: xv, cy: y, r: 5 }, style: { fill: row.color, stroke: '#fff', lineWidth: 2 } },
        ] };
      },
      markLine: options.reference !== undefined ? { silent: true, symbol: 'none', lineStyle: { color: MUTED, type: 'dashed' }, label: { color: MUTED, fontSize: 10, formatter: options.log ? 'Sin diferencia' : '' }, data: [{ xAxis: options.reference }] } : undefined,
    }],
  };
}

// ── Life lines: one row per delivered unit, days from delivery; failures in status red ───────────────────────
export function lifelineOption(follow: FollowUp[], horizon: number, selectedId: string | null): ChartOption {
  const rows = [...follow].sort((a, b) => (a.first ?? 1e9) - (b.first ?? 1e9) || b.fu - a.fu);
  const labels = rows.map(f => `${f.unit.platform || '—'} · ${f.unit.serial}`);
  const span = rows.map((f, i) => [i, -Math.min(60, Math.max(0, f.unit.t0 - (f.unit.episode?.start ?? f.unit.t0))), f.fu]);
  const event = (kinds: string[]) => rows.flatMap((f, i) => (f.unit.serialKey ? (kindsOf(f, kinds)) : []).map(e => [e.offset, i, e.ref, e.kind]));
  function kindsOf(f: FollowUp, kinds: string[]) {
    return f.interventions.concat(f.failures).filter((x, k, all) => all.findIndex(y => y.service.id === x.service.id) === k)
      .filter(e => kinds.includes(e.service.kind)).map(e => ({ offset: e.offset, ref: e.service.ref, kind: e.service.kind }));
  }
  const tickets = rows.flatMap((f, i) => f.tickets.map(t => [t, i]));
  return {
    grid: grid({ left: 150, top: 26, bottom: 40, right: 16 }),
    legend: { top: 0, right: 0, textStyle: { color: INK, fontSize: 11 }, data: ['Correctivo', 'Visita', 'Ticket de soporte'] },
    tooltip: { ...tooltipBase, trigger: 'item', formatter: (p: { seriesName: string; data: unknown[] }) => {
      if (p.seriesName === 'Seguimiento') { const r = rows[p.data[0] as number]; return `<b>${esc(labels[p.data[0] as number])}</b><br/>${esc(r.unit.client || 'Destino sin registro')}<br/>Entrega ${formatDay(r.unit.t0)} · ${r.fu} días observados${r.unit.episode ? `<br/>${r.unit.episode.partsQty} piezas en el reacondicionamiento` : ''}`; }
      return `<b>${esc(p.seriesName)}</b> · día ${p.data[0]}<br/>${esc(labels[p.data[1] as number])}${p.data[2] ? `<br/>${esc(p.data[2])}` : ''}`;
    } },
    xAxis: { type: 'value', min: -60, max: horizon, axisLabel: { ...axisLabel, customValues: [-60, ...dayTicks(horizon)] }, axisTick: { customValues: [-60, ...dayTicks(horizon)] },
      splitLine: { show: false }, axisLine, name: 'Días desde la entrega (negativo = reacondicionamiento)', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: MUTED, fontSize: 10 } },
    yAxis: { type: 'category', data: labels, inverse: true, triggerEvent: true, axisLabel: { ...axisLabel, color: INK, fontSize: 10 }, axisTick: { show: false }, axisLine },
    // Up to 60 rows are shown whole (the page scrolls); beyond that a slider, never wheel capture.
    dataZoom: rows.length > 60 ? [{ type: 'slider', yAxisIndex: 0, right: 2, width: 10, start: 0, end: (60 / rows.length) * 100, showDetail: false, brushSelect: false }] : [],
    series: [
      { name: 'Seguimiento', type: 'custom', data: span, encode: { x: [1, 2], y: 0 },
        renderItem: (_p: unknown, api: { value: (i: number) => number; coord: (v: number[]) => number[] }) => {
          const i = api.value(0); const [xa, y] = api.coord([api.value(1), i]); const [x0] = api.coord([0, i]); const [xb] = api.coord([api.value(2), i]);
          const selected = rows[i]?.unit.id === selectedId;
          return { type: 'group', children: [
            { type: 'rect', shape: { x: xa, y: y - 8, width: Math.max(1, xb - xa), height: 16 }, style: { fill: 'rgba(0,0,0,0)' } }, // row-high hit target
            { type: 'rect', shape: { x: xa, y: y - 3, width: Math.max(1, x0 - xa), height: 6, r: 3 }, style: { fill: COLORS.faint } },
            { type: 'rect', shape: { x: x0, y: y - 1.5, width: Math.max(1, xb - x0), height: 3, r: 1.5 }, style: { fill: selected ? INK : '#9fb2bc' } },
            { type: 'path', shape: { pathData: `M${x0},${y - 5}L${x0 + 5},${y}L${x0},${y + 5}L${x0 - 5},${y}Z` }, style: { fill: '#fff', stroke: INK, lineWidth: 1.5 } },
          ] };
        } },
      { name: 'Ticket de soporte', type: 'scatter', data: tickets, symbol: 'triangle', symbolSize: 7, itemStyle: { color: '#7d8f99' }, z: 3 },
      { name: 'Visita', type: 'scatter', data: event(['visita']), symbol: 'circle', symbolSize: 8, itemStyle: { color: COLORS.serious, borderColor: '#fff', borderWidth: 1 }, z: 4 },
      { name: 'Correctivo', type: 'scatter', data: event(['correctivo']), symbol: 'circle', symbolSize: 10, itemStyle: { color: COLORS.critical, borderColor: '#fff', borderWidth: 1.5 }, z: 5 },
    ],
  } as ChartOption;
}

// ── Dose–response scatter: each point is one reconditioning; color = parts group, shape = platform ─────────
const SHAPES: Record<string, string> = { A15: 'circle', A15C: 'emptyCircle', A25: 'rect', BA200: 'triangle', BA400: 'diamond' };
export type DoseMetric = 'rate' | 'count' | 'first';
export function doseScatterOption(points: Array<{ episode: { serial: string; platform: string | null; partsQty: number; start: number; caveats: string[] }; follow: FollowUp; ratePerYear: number }>, threshold: number, metric: DoseMetric): ChartOption {
  const usable = points.filter(p => metric !== 'rate' || p.follow.fu >= 90);
  const y = (p: (typeof points)[number]) => metric === 'rate' ? p.ratePerYear : metric === 'count' ? p.follow.failures.length : (p.follow.first ?? null);
  const data = (low: boolean) => usable.filter(p => (p.episode.partsQty < threshold) === low && y(p) !== null).map(p => ({
    value: [p.episode.partsQty + ((hash(p.episode.serial) % 7) - 3) * 0.05, y(p)], symbol: SHAPES[p.episode.platform || ''] || 'pin', p,
  }));
  return {
    grid: grid({ top: 30 }),
    legend: { top: 0, right: 0, textStyle: { color: INK, fontSize: 11 } },
    tooltip: { ...tooltipBase, trigger: 'item', formatter: (item: { data: { p: (typeof points)[number] } }) => { const p = item.data.p; return `<b>${esc(p.episode.platform || '')} · ${esc(p.episode.serial)}</b><br/>Reacondicionado ${formatDay(p.episode.start)} · ${p.episode.partsQty} piezas<br/>${esc(p.follow.unit.client || 'Destino sin registro')}<br/>${p.follow.failures.length} correctivos en ${p.follow.fu} días${p.follow.first !== null ? ` · primero al día ${p.follow.first}` : ''}${p.episode.caveats.length ? `<br/><span style="color:${COLORS.critical}">Salvedades: ${esc(p.episode.caveats.join(', '))}</span>` : ''}`; } },
    xAxis: { type: 'value', min: -0.5, name: 'Piezas sustituidas en el reacondicionamiento', nameLocation: 'middle', nameGap: 28, nameTextStyle: { color: MUTED, fontSize: 10 }, axisLabel, splitLine: { show: false }, axisLine },
    yAxis: { type: 'value', min: 0, name: metric === 'rate' ? 'Correctivos por equipo-año' : metric === 'count' ? 'Correctivos en el seguimiento' : 'Días hasta la primera falla', nameTextStyle: { color: MUTED, fontSize: 10 }, axisLabel, splitLine },
    series: [
      { name: `Menos de ${threshold} piezas`, type: 'scatter', data: data(true), symbolSize: 11, itemStyle: { color: COLORS.low, opacity: 0.85, borderColor: '#fff', borderWidth: 1.5 },
        markLine: { silent: true, symbol: 'none', lineStyle: { color: MUTED, type: 'dashed' }, label: { color: MUTED, fontSize: 10, formatter: `Umbral ${threshold}` }, data: [{ xAxis: threshold - 0.5 }] } },
      { name: `${threshold} piezas o más`, type: 'scatter', data: data(false), symbolSize: 11, itemStyle: { color: COLORS.high, opacity: 0.9, borderColor: '#fff', borderWidth: 1.5 } },
    ],
  };
}
function hash(text: string) { let h = 0; for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

// ── Pareto on a single percentage axis: each component's share of replacements + cumulative share ──────────
export function paretoOption(rows: Array<{ code: string; name: string | null; lines: number; replacedAtRecon: number; inKit: boolean }>): ChartOption {
  const top = rows.slice(0, 15); const total = rows.reduce((s, r) => s + r.lines, 0) || 1; let running = 0;
  const cumulative = top.map(r => { running += r.lines; return running / total; });
  return {
    grid: grid({ bottom: 78, top: 28 }), legend: { top: 0, right: 0, textStyle: { color: INK, fontSize: 11 } },
    tooltip: { ...tooltipBase, trigger: 'axis', formatter: (items: Array<{ dataIndex: number }>) => { const r = top[items[0].dataIndex]; return `<b>${esc(r.code)}</b> ${esc(r.name || '')}<br/>${r.lines} sustituciones (${pct(r.lines / total)})<br/>Cambiada en el reacondicionamiento: ${r.replacedAtRecon} de ${r.lines}${r.inKit ? '<br/>Pertenece al kit observado del modelo' : ''}<br/>Acumulado ${pct(cumulative[items[0].dataIndex])}`; } },
    xAxis: { type: 'category', data: top.map(r => r.code), axisLabel: { ...axisLabel, rotate: 40, color: INK }, axisLine, axisTick: { show: false } },
    yAxis: { type: 'value', min: 0, max: 1, axisLabel: { ...axisLabel, formatter: (v: number) => `${Math.round(v * 100)} %` }, splitLine },
    series: [
      { name: 'Participación', type: 'bar', data: top.map(r => ({ value: r.lines / total, itemStyle: { color: r.inKit ? COLORS.reacondicionado : '#86b6ef', borderRadius: [4, 4, 0, 0] } })), barMaxWidth: 26 },
      { name: 'Acumulado', type: 'line', data: cumulative, symbol: 'circle', symbolSize: 6, lineStyle: { width: 2, color: INK }, itemStyle: { color: INK } },
    ],
  };
}

export function heatOption(heat: { platforms: string[]; codes: string[]; cells: Array<[number, number, number, number]> }, names: Record<string, string>, mode: 'count' | 'rate'): ChartOption {
  const values = heat.cells.map(c => (mode === 'count' ? c[2] : c[3]));
  return {
    grid: grid({ left: 210, bottom: 30, top: 10, right: 70 }),
    tooltip: { ...tooltipBase, formatter: (p: { data: [number, number, number, number] }) => `<b>${esc(heat.codes[p.data[1]])}</b> ${esc(names[heat.codes[p.data[1]]] || '')}<br/>${esc(heat.platforms[p.data[0]])}: ${p.data[2]} sustituciones · ${num(p.data[3], 1)} por 100 equipos-año` },
    xAxis: { type: 'category', data: heat.platforms, axisLabel: { ...axisLabel, color: INK }, splitArea: { show: false }, axisTick: { show: false } },
    yAxis: { type: 'category', data: heat.codes.map(c => `${c}${names[c] ? ` · ${names[c].slice(0, 22)}` : ''}`), inverse: true, axisLabel: { ...axisLabel, color: INK, fontSize: 10 }, axisTick: { show: false } },
    visualMap: { min: 0, max: Math.max(1, ...values), calculable: false, orient: 'vertical', right: 0, top: 'middle', itemHeight: 120, textStyle: { color: MUTED, fontSize: 10 }, inRange: { color: COLORS.seq } },
    series: [{ type: 'heatmap', data: heat.cells.map(c => ({ value: [c[0], c[1], c[2], c[3]] })), encode: { x: 0, y: 1, value: mode === 'count' ? 2 : 3 },
      itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 3 }, label: { show: true, fontSize: 10, color: INK, formatter: (p: { data: { value: number[] } }) => (mode === 'count' ? String(p.data.value[2]) : num(p.data.value[3], 0)) } }],
  };
}

// ── Weibull probability plot: ln t vs ln(−ln S) from Kaplan–Meier, with the fitted straight line ─────────────
export function weibullPlotOption(groups: Array<{ name: string; color: string; curve: KmCurve; beta?: number; eta?: number }>): ChartOption {
  const series: unknown[] = [];
  for (const g of groups) {
    const pts = g.curve.steps.filter(s => s.s > 0 && s.s < 1).map(s => [Math.log(Math.max(s.t, 0.5)), Math.log(-Math.log(s.s))]);
    series.push({ name: g.name, type: 'scatter', data: pts, symbolSize: 8, itemStyle: { color: g.color, borderColor: '#fff', borderWidth: 1 } });
    if (g.beta && g.eta && pts.length) {
      const xs = pts.map(p => p[0]); const a = Math.min(...xs); const b = Math.max(...xs);
      series.push({ name: `${g.name} · ajuste`, type: 'line', data: [[a, g.beta * (a - Math.log(g.eta))], [b, g.beta * (b - Math.log(g.eta))]], symbol: 'none', lineStyle: { color: g.color, width: 2, type: 'dashed' }, tooltip: { show: false } });
    }
  }
  return {
    grid: grid({ top: 30 }), legend: { top: 0, right: 0, textStyle: { color: INK, fontSize: 11 }, data: groups.map(g => g.name) },
    tooltip: { ...tooltipBase, trigger: 'item', formatter: (p: { seriesName: string; data: number[] }) => `${esc(p.seriesName)}<br/>Día ${num(Math.exp(p.data[0]), 0)} · falla acumulada ${pct(1 - Math.exp(-Math.exp(p.data[1])))}` },
    xAxis: { type: 'value', name: 'ln(días)', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: MUTED, fontSize: 10 }, axisLabel, splitLine: { show: false }, axisLine, scale: true },
    yAxis: { type: 'value', name: 'ln(−ln S)', nameTextStyle: { color: MUTED, fontSize: 10 }, axisLabel, splitLine, scale: true },
    series,
  };
}

export function mcfOption(groups: Array<{ name: string; color: string; points: Array<[number, number]>; band: Array<{ t: number; low: number; high: number }> | null }>, horizon: number): ChartOption {
  const series: unknown[] = [];
  for (const g of groups) {
    series.push({ name: g.name, type: 'line', step: 'end', data: g.points, symbol: 'none', lineStyle: { width: 2, color: g.color }, itemStyle: { color: g.color } });
    if (g.band) series.push({ name: g.name, type: 'custom', data: g.band.map(b => [b.t, b.low, b.high]), encode: { x: 0, y: [1, 2] }, tooltip: { show: false },
      renderItem: (_p: unknown, api: { value: (i: number) => number; coord: (v: number[]) => number[] }) => {
        const [x, y1] = api.coord([api.value(0), api.value(1)]); const [, y2] = api.coord([api.value(0), api.value(2)]);
        return { type: 'group', children: [{ type: 'line', shape: { x1: x, y1, x2: x, y2 }, style: { stroke: g.color, lineWidth: 2, opacity: 0.6 } },
          { type: 'line', shape: { x1: x - 4, y1, x2: x + 4, y2: y1 }, style: { stroke: g.color, lineWidth: 2, opacity: 0.6 } }, { type: 'line', shape: { x1: x - 4, y1: y2, x2: x + 4, y2 }, style: { stroke: g.color, lineWidth: 2, opacity: 0.6 } }] };
      } });
  }
  return {
    grid: grid({ top: 30 }), legend: { top: 0, right: 0, textStyle: { color: INK, fontSize: 11 }, data: groups.map(g => g.name) },
    tooltip: { ...tooltipBase, trigger: 'axis', formatter: (items: Array<{ seriesName: string; data: number[]; color: string; seriesType: string }>) => `<b>Día ${Math.round(items[0]?.data?.[0] ?? 0)}</b><br/>` + items.filter(i => i.seriesType === 'line').map(i => `<span style="color:${i.color}">●</span> ${esc(i.seriesName)}: ${num(i.data[1])} correctivos por equipo`).join('<br/>') },
    xAxis: { type: 'value', min: 0, max: horizon, axisLabel: { ...axisLabel, customValues: dayTicks(horizon) }, axisTick: { customValues: dayTicks(horizon) }, splitLine: { show: false }, axisLine, name: 'Días desde la entrega', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: MUTED, fontSize: 10 } },
    yAxis: { type: 'value', min: 0, name: 'Correctivos acumulados por equipo', nameTextStyle: { color: MUTED, fontSize: 10 }, axisLabel, splitLine },
    series,
  };
}

export function sankeyOption(links: Array<{ source: string; target: string; value: number }>): ChartOption {
  const nodes = [...new Set(links.flatMap(l => [l.source, l.target]))].map(name => ({ name, itemStyle: { color: /Falla|Rechaz|Pospuest/.test(name) ? COLORS.critical : /Sin falla|Aprobad|Sustituid/.test(name) ? COLORS.reacondicionado : COLORS.neutral } }));
  return {
    tooltip: { ...tooltipBase, trigger: 'item', formatter: (p: { data: { source?: string; target?: string; value?: number; name?: string } }) => p.data.source ? `${esc(p.data.source)} → ${esc(p.data.target)}: <b>${p.data.value}</b> componentes` : esc(p.data.name) },
    // Column order carries the stage (condition → recommendation → authorization → action → outcome); labels keep only the value.
    series: [{ type: 'sankey', left: 8, right: 190, top: 22, bottom: 10, nodeGap: 14, nodeWidth: 10, data: nodes, links, emphasis: { focus: 'adjacency' },
      lineStyle: { color: 'gradient', opacity: 0.3, curveness: 0.5 },
      label: { color: INK, fontSize: 10, position: 'right', width: 120, overflow: 'break', backgroundColor: 'rgba(255,255,255,.85)', padding: [1, 3], borderRadius: 3,
        formatter: (p: { name: string }) => p.name.includes(': ') ? p.name.split(': ')[1] : p.name } }],
    graphic: ['Condición', 'Recomendación', 'Autorización', 'Acción', 'Resultado'].map((text, i) => ({ type: 'text', left: `${2 + i * 19}%`, top: 2, style: { text, fill: MUTED, fontSize: 10, fontWeight: 600 } })),
  };
}

export function waterfallOption(steps: Array<{ label: string; value: number; nature: 'comprobado' | 'estimado' | 'mixto' }>): ChartOption {
  let base = 0; const invisible: number[] = []; const visible: Array<{ value: number; itemStyle: Record<string, unknown> }> = [];
  for (const s of steps) { invisible.push(base); visible.push({ value: s.value, itemStyle: { color: s.nature === 'estimado' ? '#86b6ef' : COLORS.reacondicionado, borderRadius: [4, 4, 0, 0], decal: s.nature === 'estimado' ? { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [2, 4], rotation: Math.PI / 4, color: '#ffffff88' } : undefined } }); base += s.value; }
  return {
    grid: grid({ bottom: 64 }), tooltip: { ...tooltipBase, trigger: 'axis', formatter: (items: Array<{ dataIndex: number; seriesIndex: number }>) => { const s = steps[items[0].dataIndex]; return `<b>${esc(s.label)}</b><br/>$${num(s.value, 0)} (${s.nature})`; } },
    xAxis: { type: 'category', data: [...steps.map(s => s.label.charAt(0).toUpperCase() + s.label.slice(1)), 'Costo acumulado'], axisLabel: { ...axisLabel, color: INK, rotate: 25 }, axisTick: { show: false }, axisLine },
    yAxis: { type: 'value', min: 0, axisLabel: { ...axisLabel, formatter: (v: number) => `$${num(v / 1000, 0)} k` }, splitLine },
    series: [
      { type: 'bar', stack: 'w', data: [...invisible, 0], itemStyle: { color: 'transparent' }, tooltip: { show: false }, silent: true },
      { type: 'bar', stack: 'w', data: [...visible, { value: base, itemStyle: { color: INK, borderRadius: [4, 4, 0, 0] } }], barMaxWidth: 34, label: { show: true, position: 'top', color: INK, fontSize: 10, formatter: (p: { value: number }) => `$${num(p.value / 1000, 1)} k` } },
    ],
  };
}

export function histogramOption(samples: number[], label: string): ChartOption {
  if (!samples.length) return {};
  const sorted = [...samples].sort((a, b) => a - b); const lo = sorted[Math.floor(sorted.length * 0.005)]; const hi = sorted[Math.floor(sorted.length * 0.995)];
  const bins = 36; const width = (hi - lo) / bins || 1; const counts = new Array(bins).fill(0);
  for (const v of samples) if (v >= lo && v <= hi) counts[Math.min(bins - 1, Math.floor((v - lo) / width))]++;
  const data = counts.map((c, i) => { const mid = lo + (i + 0.5) * width; return { value: [mid, c / samples.length], itemStyle: { color: mid > 0 ? COLORS.reacondicionado : COLORS.neutral } }; });
  return {
    grid: grid({ top: 16 }), tooltip: { ...tooltipBase, trigger: 'item', formatter: (p: { data: { value: number[] } }) => `${label} ≈ $${num(p.data.value[0], 0)}<br/>${pct(p.data.value[1])} de las simulaciones` },
    xAxis: { type: 'value', scale: true, name: label, nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: MUTED, fontSize: 10 }, axisLabel: { ...axisLabel, formatter: (v: number) => `$${num(v / 1000, 0)} k` }, splitLine: { show: false }, axisLine },
    yAxis: { type: 'value', axisLabel: { ...axisLabel, formatter: (v: number) => `${(v * 100).toFixed(0)} %` }, splitLine },
    series: [{ type: 'bar', data, barWidth: '96%', markLine: { silent: true, symbol: 'none', lineStyle: { color: INK, type: 'dashed' }, label: { color: INK, fontSize: 10, formatter: 'Empate' }, data: [{ xAxis: 0 }] } }],
  };
}

export const kindName = (kind: string) => kindLabels[kind] || kind;
export { GRID };
