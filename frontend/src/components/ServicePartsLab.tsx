import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Loader } from './OrionLoader';
import PrivateName from './PrivateName';
import { ChartPanel, Segmented } from './KpiLabPanels';
import { fetchPartsLab } from './serviceKpiApi';
import { applyBrandFontToWorkbook } from '../config/brandFonts';
import { formatCount, isoDay } from './serviceKpiModel';
import { axisLabel, axisLine, INK, MUTED, splitLine, tooltipBase, type ChartHandlers, type ChartOption } from './kpiEcharts';
import {
  codeMonthMatrix, filterServices, kindColors, kindLabels, kindOf, KINDS, linesOf, monthLabel, monthOf, monthsBetween, monthlyShare, pareto, partFlows,
  platformMonthTable, sectorColors, sectorLabels, sectorOf, servicesByMonth, totals, usageByKind, type KindKey, type PartService, type PartsLabData, type SectorKey,
} from './partsAnalytics';

type Filters = Record<string, string | number>;
interface Selection { title: string; services: PartService[]; key: string }

const legendBase = { type: 'scroll', top: 0, left: 0, right: 0, pageIconColor: INK, pageIconInactiveColor: '#c5d2d8', pageIconSize: 10, pageTextStyle: { color: MUTED, fontSize: 10 }, textStyle: { color: MUTED, fontSize: 10.5 }, itemWidth: 10, itemHeight: 10 };
const round1 = (value: number) => Math.round(value * 10) / 10;
const pct = (value: number | null) => (value === null ? 'Sin dato' : `${round1(value * 100)} %`);
const decimal = (value: number | null) => (value === null ? 'Sin dato' : value.toLocaleString('es-MX', { maximumFractionDigits: 2 }));
const html = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const day = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
const SEQUENTIAL = ['#eaf2fc', '#9cc2ef', '#2a78d6', '#164a8a'];
const kindLabelOf = (key: string) => kindLabels[key as KindKey] || key;
const nodeName = (id: string) => (id.startsWith('K:') ? kindLabelOf(id.slice(2)) : id.slice(2));

// Parts lab: how parts are used by service type, month, sector and platform. Loads its own service rows
// once the section is on screen and aggregates them in the browser, so every control answers instantly.
export default function ServicePartsLab({ filters, revision, onOpenTicket }: {
  filters: Filters; revision: number; onOpenTicket: (ticket: { id: string; folio: string }) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  const [state, setState] = useState<{ key: string; data: PartsLabData | null; error?: string }>({ key: '', data: null });
  const [sector, setSector] = useState<SectorKey | 'todos'>('todos');
  const [platform, setPlatform] = useState('');
  const [monthBy, setMonthBy] = useState<'kind' | 'sector'>('kind');
  const [shareMode, setShareMode] = useState<'share' | 'count'>('share');
  const [paretoKind, setParetoKind] = useState<KindKey | 'todos'>('todos');
  const [matrixKind, setMatrixKind] = useState<KindKey | 'todos'>('preventivo');
  const [matrixView, setMatrixView] = useState<'mapa' | 'tabla'>('mapa');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [exporting, setExporting] = useState(false);
  const requestKey = `${JSON.stringify(filters)}|${revision}`;

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
    fetchPartsLab(JSON.parse(key.slice(0, key.lastIndexOf('|'))) as Filters)
      .then(data => { if (active) setState({ key, data }); })
      .catch(cause => { if (active) setState(current => ({ key, data: current.data, error: (cause as Error).message })); });
    return () => { active = false; };
  }, [seen, requestKey]);

  const loading = !seen || state.key !== requestKey;
  const error = state.key === requestKey ? state.error : undefined;
  const data = state.data;
  const months = useMemo(() => (data ? monthsBetween(data.period.from, data.period.to) : []), [data]);
  const multiYear = months.length > 0 && months[0].slice(0, 4) !== months[months.length - 1].slice(0, 4);
  const monthNames = months.map(month => monthLabel(month, multiYear));
  const platforms = useMemo(() => [...new Set((data?.services || []).map(service => service.platform).filter((value): value is string => Boolean(value)))].sort(), [data]);
  const scoped = useMemo(() => (data ? filterServices(data.services, { sector, platform }) : []), [data, sector, platform]);
  const lines = useMemo(() => data?.lines || [], [data]);
  const codeName = (code: string) => data?.codes[code] || '';
  const summary = useMemo(() => totals(scoped, lines), [scoped, lines]);
  const select = (title: string, list: PartService[]) => {
    if (!list.length) return;
    setSelection({ title, services: list, key: requestKey });
    window.setTimeout(() => selectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  };

  // ── Services per month (by type or sector) ───────────────────────────────────────────────
  const monthly = useMemo(() => {
    const series = servicesByMonth(scoped, months, monthBy);
    const totalsByMonth = months.map((_, i) => series.reduce((sum, item) => sum + item.values[i], 0));
    const label = (key: string) => (monthBy === 'kind' ? kindLabelOf(key) : sectorLabels[key as SectorKey]);
    const color = (key: string) => (monthBy === 'kind' ? kindColors[key as KindKey] : sectorColors[key as SectorKey]);
    const option: ChartOption = {
      legend: { ...legendBase, data: series.map(item => label(item.key)) },
      tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(25,59,73,0.06)' } } },
      grid: { left: 40, right: 12, top: 34, bottom: 26 },
      xAxis: { type: 'category', data: monthNames, axisLabel, axisLine, axisTick: { show: false } },
      yAxis: { type: 'value', minInterval: 1, axisLabel, splitLine },
      series: [
        ...series.map(item => ({ type: 'bar', name: label(item.key), stack: 'servicios', data: item.values, barMaxWidth: 38, cursor: 'pointer',
          itemStyle: { color: color(item.key), borderColor: '#fff', borderWidth: 1 }, emphasis: { focus: 'series' } })),
        { type: 'bar', stack: 'servicios', silent: true, data: months.map(() => 0), tooltip: { show: false },
          label: { show: true, position: 'top', color: MUTED, fontSize: 10, formatter: (params: { dataIndex: number }) => (totalsByMonth[params.dataIndex] ? String(totalsByMonth[params.dataIndex]) : '') } },
      ],
    };
    return { option, series, label };
  }, [scoped, months, monthNames, monthBy]);
  const monthlyHandlers: ChartHandlers = {
    click: event => {
      const item = monthly.series[event.seriesIndex ?? -1];
      const month = months[event.dataIndex ?? -1];
      if (!item || !month) return;
      select(`${monthly.label(item.key)} · ${monthNames[event.dataIndex!]}`, scoped.filter(service => monthOf(service.day) === month && (monthBy === 'kind' ? kindOf(service.kind) === item.key : sectorOf(service) === item.key)));
    },
  };

  // ── Share of services that used parts, by type ──────────────────────────────────────────
  const usage = useMemo(() => {
    const rows = usageByKind(scoped);
    const option: ChartOption = {
      tooltip: { ...tooltipBase, trigger: 'item', formatter: (params: { dataIndex: number }) => {
        const row = rows[params.dataIndex];
        return `<strong>${kindLabels[row.kind]}</strong><br/>${pct(row.share)} con refacciones · ${row.withParts} de ${row.services} servicios<br/>${formatCount(row.parts)} piezas · ${decimal(row.perService)} por servicio con refacción`;
      } },
      grid: { left: 120, right: 150, top: 8, bottom: 22 },
      xAxis: { type: 'value', max: 100, axisLabel: { ...axisLabel, formatter: '{value} %' }, splitLine },
      yAxis: { type: 'category', inverse: true, data: rows.map(row => kindLabels[row.kind]), axisLabel: { ...axisLabel, color: INK }, axisLine: { show: false }, axisTick: { show: false } },
      series: [{ type: 'bar', barMaxWidth: 18, cursor: 'pointer',
        data: rows.map(row => ({ value: row.share === null ? 0 : round1(row.share * 100), itemStyle: { color: kindColors[row.kind], borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: 'right', color: INK, fontSize: 10.5, formatter: (params: { dataIndex: number }) => { const row = rows[params.dataIndex]; return `${pct(row.share)}  ·  ${row.withParts} de ${row.services}`; } } }],
    };
    return { rows, option, height: Math.max(170, 40 + rows.length * 34) };
  }, [scoped]);
  const usageHandlers: ChartHandlers = {
    click: event => {
      const row = usage.rows[event.dataIndex ?? -1];
      if (row) select(`${kindLabels[row.kind]} con refacciones`, scoped.filter(service => kindOf(service.kind) === row.kind && service.parts > 0));
    },
  };

  // ── Monthly share with parts per type ────────────────────────────────────────────────────
  const trend = useMemo(() => {
    // Types with few services zig-zag between 0 and 100 %: only types with 10+ services, and in % mode only months with 3+.
    const rows = monthlyShare(scoped, months).filter(row => row.values.reduce((sum, value) => sum + value.n, 0) >= 10);
    const option: ChartOption = {
      legend: { ...legendBase, data: rows.map(row => kindLabels[row.kind]) },
      tooltip: { ...tooltipBase, trigger: 'axis', formatter: (params: Array<{ seriesIndex: number; dataIndex: number; marker: string }>) => {
        const month = monthNames[params[0]?.dataIndex ?? 0];
        return `<strong>${month}</strong><br/>${params.map(param => { const value = rows[param.seriesIndex].values[param.dataIndex];
          return `${param.marker}${kindLabels[rows[param.seriesIndex].kind]}: ${value.withParts} de ${value.n}${value.n ? ` (${pct(value.share)})` : ''}`; }).join('<br/>')}`;
      } },
      grid: { left: 44, right: 14, top: 34, bottom: 26 },
      xAxis: { type: 'category', data: monthNames, boundaryGap: false, axisLabel, axisLine },
      yAxis: shareMode === 'share' ? { type: 'value', max: 100, axisLabel: { ...axisLabel, formatter: '{value} %' }, splitLine } : { type: 'value', minInterval: 1, axisLabel, splitLine },
      series: rows.map(row => ({ type: 'line', name: kindLabels[row.kind], smooth: false, symbol: 'circle', symbolSize: 8, connectNulls: false, cursor: 'pointer',
        lineStyle: { width: 2, color: kindColors[row.kind] }, itemStyle: { color: kindColors[row.kind], borderColor: '#fff', borderWidth: 1.5 },
        data: row.values.map(value => (shareMode === 'share' ? (value.share === null || value.n < 3 ? null : round1(value.share * 100)) : value.withParts)) })),
    };
    return { rows, option };
  }, [scoped, months, monthNames, shareMode]);
  const trendHandlers: ChartHandlers = {
    click: event => {
      const row = trend.rows[event.seriesIndex ?? -1]; const month = months[event.dataIndex ?? -1];
      if (row && month) select(`${kindLabels[row.kind]} con refacciones · ${monthNames[event.dataIndex!]}`, scoped.filter(service => kindOf(service.kind) === row.kind && monthOf(service.day) === month && service.parts > 0));
    },
  };

  // ── Pareto of part codes ─────────────────────────────────────────────────────────────────
  const paretoView = useMemo(() => {
    const rows = pareto(lines, scoped, paretoKind);
    const cut = rows.findIndex(row => row.cumulative >= 0.8);
    const visible = Math.min(rows.length, 30);
    const option: ChartOption = {
      tooltip: { ...tooltipBase, trigger: 'item', formatter: (params: { dataIndex: number }) => {
        const row = rows[params.dataIndex];
        const name = codeName(row.code);
        return `<strong>${html(row.code)}</strong>${name ? `<br/><span style="color:${MUTED}">${html(name)}</span>` : ''}<br/>${formatCount(row.qty)} piezas en ${row.services} servicios<br/>${pct(row.share)} del total · acumulado ${pct(row.cumulative)}`;
      } },
      grid: { left: 40, right: 12, top: 14, bottom: rows.length > visible ? 86 : 64 },
      xAxis: { type: 'category', data: rows.map(row => row.code), axisLabel: { ...axisLabel, rotate: 50, interval: 0 }, axisLine, axisTick: { show: false } },
      yAxis: { type: 'value', minInterval: 1, axisLabel, splitLine },
      dataZoom: rows.length > visible ? [{ type: 'slider', startValue: 0, endValue: visible - 1, height: 14, bottom: 6, borderColor: '#dbe5eb', fillerColor: 'rgba(42,120,214,0.12)', handleSize: 12, showDetail: false }] : undefined,
      series: [{ type: 'bar', name: 'Piezas', barMaxWidth: 26, cursor: 'pointer',
        data: rows.map((row, index) => ({ value: row.qty, itemStyle: { color: index <= cut ? INK : '#9fb3bd', borderRadius: [4, 4, 0, 0] } })),
        markArea: cut >= 0 ? { silent: true, itemStyle: { color: 'rgba(25,59,73,0.05)' }, label: { show: true, position: 'insideTopRight', color: MUTED, fontSize: 10, formatter: `${cut + 1} ${cut === 0 ? 'código' : 'códigos'} = 80 % de las piezas` },
          data: [[{ xAxis: rows[0].code }, { xAxis: rows[cut].code }]] } : undefined }],
    };
    return { rows, option, cut };
  }, [lines, scoped, paretoKind, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const paretoHandlers: ChartHandlers = {
    click: event => {
      const row = paretoView.rows[event.dataIndex ?? -1];
      if (!row) return;
      const ids = new Set(linesOf(lines, scoped).filter(line => line.code === row.code).map(line => line.service.id));
      select(`Refacción ${row.code}${codeName(row.code) ? ` · ${codeName(row.code)}` : ''}`, scoped.filter(service => ids.has(service.id) && (paretoKind === 'todos' || kindOf(service.kind) === paretoKind)));
    },
  };

  // ── Flows: platform → service type → part ────────────────────────────────────────────────
  const flows = useMemo(() => {
    const result = partFlows(lines, scoped, 12);
    const color = (id: string) => (id.startsWith('K:') ? kindColors[id.slice(2) as KindKey] : id.startsWith('P:') ? INK : '#9fb3bd');
    const option: ChartOption = {
      tooltip: { ...tooltipBase, trigger: 'item', formatter: (params: { dataType?: string; data: { source?: string; target?: string; value?: number; name?: string }; value?: number }) =>
        params.dataType === 'edge' ? `${html(nodeName(params.data.source!))} → ${html(nodeName(params.data.target!))}<br/><strong>${formatCount(params.data.value)}</strong> piezas`
          : `<strong>${html(nodeName(params.data.name!))}</strong>${params.data.name?.startsWith('C:') && codeName(params.data.name.slice(2)) ? `<br/><span style="color:${MUTED}">${html(codeName(params.data.name.slice(2)))}</span>` : ''}<br/>${formatCount(params.value)} piezas` },
      series: [{ type: 'sankey', left: 8, right: 150, top: 10, bottom: 10, nodeGap: 9, nodeWidth: 12, draggable: false, layoutIterations: 64, emphasis: { focus: 'adjacency' },
        data: result.nodes.map(id => ({ name: id, itemStyle: { color: color(id), borderColor: color(id) } })),
        links: result.links, lineStyle: { color: 'source', opacity: 0.28, curveness: 0.5 },
        label: { color: INK, fontSize: 10.5, formatter: (params: { name: string }) => nodeName(params.name) } }],
    };
    return { option, empty: !result.links.length, height: Math.max(320, Math.min(620, result.nodes.length * 22)) };
  }, [lines, scoped, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const flowHandlers: ChartHandlers = {
    click: event => {
      const name = (event.data as { name?: string } | undefined)?.name;
      if (!name || event.componentType !== 'series' || (event as { dataType?: string }).dataType === 'edge') return;
      if (name.startsWith('P:')) { setPlatform(platform === name.slice(2) ? '' : name.slice(2)); return; }
      if (name.startsWith('K:')) { select(`${kindLabelOf(name.slice(2))} con refacciones`, scoped.filter(service => kindOf(service.kind) === name.slice(2) && service.parts > 0)); return; }
      if (name.startsWith('C:') && name !== 'C:Otras refacciones') {
        const ids = new Set(linesOf(lines, scoped).filter(line => line.code === name.slice(2)).map(line => line.service.id));
        select(`Refacción ${name.slice(2)}`, scoped.filter(service => ids.has(service.id)));
      }
    },
  };

  // ── Code × month heatmap ─────────────────────────────────────────────────────────────────
  const heat = useMemo(() => {
    const matrix = codeMonthMatrix(lines, scoped, months, 15);
    const max = Math.max(1, ...matrix.cells.map(cell => cell[2]));
    const option: ChartOption = {
      tooltip: { ...tooltipBase, trigger: 'item', formatter: (params: { value: [number, number, number] }) => {
        const [x, y, value] = params.value; const code = matrix.codes[y];
        return `<strong>${html(code)}</strong> · ${monthNames[x]}${codeName(code) ? `<br/><span style="color:${MUTED}">${html(codeName(code))}</span>` : ''}<br/>${formatCount(value)} piezas`;
      } },
      grid: { left: 74, right: 12, top: 8, bottom: 58 },
      xAxis: { type: 'category', data: monthNames, splitArea: { show: false }, axisLabel, axisLine: { show: false }, axisTick: { show: false } },
      yAxis: { type: 'category', data: matrix.codes, inverse: true, axisLabel: { ...axisLabel, color: INK }, axisLine: { show: false }, axisTick: { show: false } },
      visualMap: { min: 0, max, calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 10, itemHeight: 120, text: [String(max), '0'], textStyle: { color: MUTED, fontSize: 10 }, inRange: { color: SEQUENTIAL } },
      series: [{ type: 'heatmap', data: matrix.cells.map(cell => ({ value: cell, label: { color: cell[2] > max * 0.55 ? '#fff' : INK } })), cursor: 'pointer', itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 3 },
        label: { show: matrix.cells.length <= 160, fontSize: 9.5, formatter: (params: { value: [number, number, number] }) => String(params.value[2]) },
        emphasis: { itemStyle: { borderColor: INK, borderWidth: 1 } } }],
    };
    return { matrix, option, height: Math.max(220, 80 + matrix.codes.length * 22) };
  }, [lines, scoped, months, monthNames, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const heatHandlers: ChartHandlers = {
    click: event => {
      const value = event.value as [number, number, number] | undefined;
      if (!value) return;
      const code = heat.matrix.codes[value[1]]; const month = months[value[0]];
      const ids = new Set(linesOf(lines, scoped).filter(line => line.code === code && monthOf(line.service.day) === month).map(line => line.service.id));
      select(`Refacción ${code} · ${monthNames[value[0]]}`, scoped.filter(service => ids.has(service.id)));
    },
  };

  // ── Treemap: platform → part ─────────────────────────────────────────────────────────────
  const tree = useMemo(() => {
    const byPlatform = new Map<string, Map<string, number>>();
    for (const line of linesOf(lines, scoped)) {
      const key = line.service.platform || 'Sin plataforma';
      if (!byPlatform.has(key)) byPlatform.set(key, new Map());
      const codes = byPlatform.get(key)!; codes.set(line.code, (codes.get(line.code) || 0) + line.qty);
    }
    const nodes = [...byPlatform.entries()].map(([name, codes]) => ({ name, value: [...codes.values()].reduce((sum, value) => sum + value, 0),
      children: [...codes.entries()].sort((a, b) => b[1] - a[1]).map(([code, value]) => ({ name: code, value })) })).sort((a, b) => b.value - a.value);
    const option: ChartOption = {
      tooltip: { ...tooltipBase, trigger: 'item', formatter: (params: { treePathInfo: Array<{ name: string }>; value: number }) => {
        const path = params.treePathInfo.slice(1).map(item => item.name);
        const code = path.length > 1 ? path[1] : '';
        return `<strong>${html(path.join(' · '))}</strong>${code && codeName(code) ? `<br/><span style="color:${MUTED}">${html(codeName(code))}</span>` : ''}<br/>${formatCount(params.value)} piezas`;
      } },
      series: [{ type: 'treemap', top: 6, left: 4, right: 4, bottom: 4, roam: false, nodeClick: false, breadcrumb: { show: false }, data: nodes, cursor: 'pointer',
        upperLabel: { show: true, height: 20, color: '#fff', fontSize: 11, fontWeight: 600 },
        label: { color: INK, fontSize: 10.5, formatter: (params: { name: string; value: number }) => `${params.name}\n${params.value}` },
        levels: [
          { itemStyle: { borderColor: '#fff', borderWidth: 0, gapWidth: 3 } },
          { itemStyle: { borderColor: INK, borderWidth: 3, gapWidth: 2 }, upperLabel: { show: true } },
          { color: SEQUENTIAL.slice(0, 3), colorMappingBy: 'value', itemStyle: { borderColor: '#fff', borderWidth: 1, gapWidth: 1 } },
        ] }],
    };
    return { option, empty: !nodes.length };
  }, [lines, scoped, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const treeHandlers: ChartHandlers = {
    click: event => {
      const path = ((event as { treePathInfo?: Array<{ name: string }> }).treePathInfo || []).slice(1).map(item => item.name);
      if (path.length === 1) { setPlatform(platform === path[0] ? '' : path[0]); return; }
      if (path.length === 2) {
        const ids = new Set(linesOf(lines, scoped).filter(line => line.code === path[1] && (line.service.platform || 'Sin plataforma') === path[0]).map(line => line.service.id));
        select(`Refacción ${path[1]} · ${path[0]}`, scoped.filter(service => ids.has(service.id)));
      }
    },
  };

  // ── Platform × month (the workbook's Preventivos / Correctivos sheets) ──────────────────────
  const matrix = useMemo(() => {
    const table = platformMonthTable(scoped, months, matrixKind);
    const cells = table.rows.flatMap((row, y) => row.cells.map((cell, x) => [x, y, cell.total] as [number, number, number]).filter(cell => cell[2] > 0));
    const max = Math.max(1, ...cells.map(cell => cell[2]));
    const option: ChartOption = {
      tooltip: { ...tooltipBase, trigger: 'item', formatter: (params: { value: [number, number, number] }) => {
        const [x, y] = params.value; const cell = table.rows[y].cells[x];
        return `<strong>${html(table.rows[y].platform)}</strong> · ${monthNames[x]}<br/>${cell.total} servicios · Gobierno ${cell.gobierno} · Particular ${cell.particular}`;
      } },
      grid: { left: 92, right: 12, top: 8, bottom: 58 },
      xAxis: { type: 'category', data: monthNames, axisLabel, axisLine: { show: false }, axisTick: { show: false } },
      yAxis: { type: 'category', data: table.rows.map(row => `${row.platform} (${row.total})`), inverse: true, axisLabel: { ...axisLabel, color: INK }, axisLine: { show: false }, axisTick: { show: false } },
      visualMap: { min: 0, max, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 10, itemHeight: 120, text: [String(max), '0'], textStyle: { color: MUTED, fontSize: 10 }, inRange: { color: SEQUENTIAL } },
      series: [{ type: 'heatmap', data: cells.map(cell => ({ value: cell, label: { color: cell[2] > max * 0.55 ? '#fff' : INK } })), cursor: 'pointer', itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 3 },
        label: { show: true, fontSize: 9.5, formatter: (params: { value: [number, number, number] }) => String(params.value[2]) } }],
    };
    return { table, option, height: Math.max(200, 80 + table.rows.length * 24) };
  }, [scoped, months, monthNames, matrixKind]);
  const matrixHandlers: ChartHandlers = {
    click: event => {
      const value = event.value as [number, number, number] | undefined;
      if (!value) return;
      const row = matrix.table.rows[value[1]]; const month = months[value[0]];
      select(`${matrixKind === 'todos' ? 'Servicios' : kindLabels[matrixKind]} · ${row.platform} · ${monthNames[value[0]]}`,
        scoped.filter(service => (service.platform || 'Sin plataforma') === row.platform && monthOf(service.day) === month && (matrixKind === 'todos' || kindOf(service.kind) === matrixKind)));
    },
  };

  // ── Excel with the same sheets as the parts control workbook ─────────────────────────────
  const exportWorkbook = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const { default: ExcelJS } = await import('exceljs');
      const book = new ExcelJS.Workbook(); book.creator = 'ORION · BioSystems'; book.created = new Date();
      const head = (sheet: import('exceljs').Worksheet, rows = 1) => { for (let r = 1; r <= rows; r++) { sheet.getRow(r).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF153C48' } }; } };
      const all = filterServices(data.services, { sector: 'todos', platform });
      for (const kind of ['preventivo', 'correctivo'] as KindKey[]) {
        const table = platformMonthTable(all, months, kind);
        const sheet = book.addWorksheet(kind === 'preventivo' ? 'Preventivos' : 'Correctivos', { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] });
        sheet.addRow(['Plataforma', ...monthNames.flatMap(name => [name, '']), 'Total']);
        sheet.addRow(['', ...months.flatMap(() => ['Gobierno', 'Particular']), '']);
        months.forEach((_, i) => sheet.mergeCells(1, 2 + i * 2, 1, 3 + i * 2));
        for (const row of table.rows) sheet.addRow([row.platform, ...row.cells.flatMap(cell => [cell.gobierno, cell.particular]), row.total]);
        sheet.addRow(['TOTAL', ...table.footer.flatMap(cell => [cell.gobierno, cell.particular]), table.total]).font = { bold: true };
        sheet.getColumn(1).width = 18; head(sheet, 2);
      }
      const sectorSheet = book.addWorksheet('Tot. Sector', { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] });
      const kinds = KINDS.filter(kind => all.some(service => kindOf(service.kind) === kind));
      sectorSheet.addRow(['Mes', ...kinds.flatMap(kind => [kindLabels[kind], ''])]);
      sectorSheet.addRow(['', ...kinds.flatMap(() => ['Gobierno', 'Particular'])]);
      kinds.forEach((_, i) => sectorSheet.mergeCells(1, 2 + i * 2, 1, 3 + i * 2));
      for (const [i, month] of months.entries()) {
        const inMonth = all.filter(service => monthOf(service.day) === month);
        sectorSheet.addRow([monthNames[i], ...kinds.flatMap(kind => ['gobierno', 'particular'].map(sectorKey => inMonth.filter(service => kindOf(service.kind) === kind && service.sector === sectorKey).length))]);
      }
      sectorSheet.addRow(['Total', ...kinds.flatMap(kind => ['gobierno', 'particular'].map(sectorKey => all.filter(service => kindOf(service.kind) === kind && service.sector === sectorKey).length))]).font = { bold: true };
      head(sectorSheet, 2);
      const usageSheet = book.addWorksheet('Uso de refacciones');
      usageSheet.columns = [{ header: 'Tipo de servicio', key: 'k', width: 22 }, { header: 'Servicios', key: 's', width: 12 }, { header: 'Con refacciones', key: 'w', width: 16 },
        { header: '% con refacciones', key: 'p', width: 18 }, { header: 'Piezas', key: 'q', width: 10 }, { header: 'Piezas por servicio con refacción', key: 'r', width: 30 }];
      for (const row of usageByKind(all)) usageSheet.addRow({ k: kindLabels[row.kind], s: row.services, w: row.withParts, p: row.share === null ? null : round1(row.share * 100), q: row.parts, r: row.perService === null ? null : Math.round(row.perService * 100) / 100 });
      head(usageSheet);
      for (const kind of ['correctivo', 'preventivo', 'visita'] as KindKey[]) {
        const rows = pareto(lines, all, kind);
        const sheet = book.addWorksheet(`Pzas. ${kind === 'correctivo' ? 'Correctivos' : kind === 'preventivo' ? 'Preventivos' : 'Visitas'}`);
        sheet.columns = [{ header: 'Código', key: 'c', width: 14 }, { header: 'Descripción', key: 'd', width: 48 }, { header: 'Cantidad', key: 'q', width: 10 }, { header: 'Servicios', key: 's', width: 10 }];
        for (const row of rows) sheet.addRow({ c: row.code, d: codeName(row.code), q: row.qty, s: row.services });
        const usageRow = usageByKind(all).find(row => row.kind === kind);
        sheet.addRow({ c: 'Total', q: rows.reduce((sum, row) => sum + row.qty, 0) }).font = { bold: true };
        sheet.addRow({ c: 'Ratio', d: 'Piezas por servicio con refacción', q: usageRow?.perService === null || usageRow?.perService === undefined ? null : Math.round(usageRow.perService * 1000) / 1000 });
        head(sheet);
      }
      const listSheet = book.addWorksheet('Servicios', { views: [{ state: 'frozen', ySplit: 1 }] });
      listSheet.columns = [['day', 'Fecha', 12], ['ref', 'Servicio', 16], ['folio', 'Ticket', 12], ['kind', 'Tipo', 18], ['platform', 'Plataforma', 14], ['client', 'Cliente', 40], ['sector', 'Sector', 12],
        ['sector_inferred', 'Sector inferido', 14], ['parts', 'Piezas', 9], ['codes', 'Refacciones', 50], ['source', 'Fuente', 22]].map(([key, header, width]) => ({ key: key as string, header: header as string, width: width as number }));
      const codesOf = new Map<string, string[]>();
      for (const [serviceId, code, qty] of lines) { if (!codesOf.has(serviceId)) codesOf.set(serviceId, []); codesOf.get(serviceId)!.push(`${code} × ${qty}`); }
      for (const service of all) listSheet.addRow({ ...service, kind: kindLabelOf(kindOf(service.kind)), sector: service.sector ? sectorLabels[service.sector] : 'Sin sector', sector_inferred: service.sector_inferred ? 'Sí' : 'No', codes: (codesOf.get(service.id) || []).join(', ') });
      head(listSheet);
      const info = book.addWorksheet('Criterios');
      info.addRows([['Generado', new Date().toLocaleString('es-MX')], ['Periodo', `${data.period.from} a ${data.period.to}`], ['Plataforma', platform || 'Todas'],
        ['Servicio', 'Cada registro de servicio de campo (historial y reportes de servicio); no se fusionan registros del mismo día. Sin capacitaciones ni servicios telefónicos.'],
        ['Con refacciones', 'Servicios con al menos una refacción registrada en su reporte.'], ['Ratio', 'Piezas ÷ servicios con refacciones del mismo tipo.'],
        ['Sector', 'El del registro de origen; si no lo trae, el último conocido de la misma serie (marcado como inferido).']]);
      info.getColumn(1).width = 18; info.getColumn(2).width = 110;
      applyBrandFontToWorkbook(book);
      const buffer = await book.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ORION_refacciones_${isoDay(new Date())}.xlsx`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } finally { setExporting(false); }
  };

  const sel = selection && selection.key === requestKey ? selection : null;
  const codesBySvc = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const [serviceId, code, qty] of lines) { if (!map.has(serviceId)) map.set(serviceId, []); map.get(serviceId)!.push(`${code} × ${qty}`); }
    return map;
  }, [lines]);
  const insights: Array<[string, string, string]> = data ? [
    ['Servicios de campo', formatCount(summary.services), `Gobierno ${formatCount(summary.gobierno)} · Particular ${formatCount(summary.particular)}${summary.noSector ? ` · ${summary.noSector} sin sector` : ''}`],
    ['Con refacciones', pct(summary.share), `${formatCount(summary.withParts)} de ${formatCount(summary.services)} servicios`],
    ['Piezas utilizadas', formatCount(summary.parts), `${formatCount(summary.codes)} códigos distintos`],
    ['Piezas por servicio con refacción', decimal(summary.perService), 'Promedio en los servicios que usaron piezas'],
    ['Refacción más usada', summary.top ? summary.top[0] : 'Sin dato', summary.top ? `${formatCount(summary.top[1])} piezas${codeName(summary.top[0]) ? ` · ${codeName(summary.top[0])}` : ''}` : 'Sin piezas en el periodo'],
    ['Concentración', pct(summary.top5Share), 'De las piezas en los 5 códigos más usados'],
  ] : [];

  return <div ref={root} className="kpi-lab kpi-parts" aria-label="Análisis de refacciones">
    <div className="kpi-parts-bar" role="group" aria-label="Filtros del análisis de refacciones">
      <Segmented label="Sector" value={sector} onChange={setSector} options={[['todos', 'Ambos sectores'], ['gobierno', 'Gobierno'], ['particular', 'Particular']]} />
      <label className="kpi-parts-platform">Plataforma
        <select value={platform} onChange={event => setPlatform(event.target.value)}><option value="">Todas</option>{platforms.map(name => <option key={name} value={name}>{name}</option>)}</select>
      </label>
      {(sector !== 'todos' || platform) && <button type="button" className="tc-text-button" onClick={() => { setSector('todos'); setPlatform(''); }}>Quitar filtros</button>}
      <button type="button" className="kpi-export" disabled={!data || exporting} onClick={() => void exportWorkbook()}>{exporting ? 'Exportando…' : 'Exportar a Excel'}</button>
    </div>
    {error && <p role="alert" className="tc-error">No se pudo cargar el análisis de refacciones: {error}</p>}
    {loading && !data && <Loader label="Cargando servicios y refacciones del periodo…" />}
    {data && !scoped.length && <div className="kpi-lab-loading">Sin servicios de campo en el periodo con estos filtros.</div>}
    {data && scoped.length > 0 && <>
      <dl className="kpi-lab-insights">{insights.map(([label, value, detail]) => <div key={label}><dt>{label}</dt><dd>{value}</dd><span>{detail}</span></div>)}</dl>
      <div className={`kpi-lab-grid${loading ? ' is-refreshing' : ''}`} aria-busy={loading}>
        <ChartPanel wide title="Servicios de campo por mes" file="servicios_por_mes" option={monthly.option} handlers={monthlyHandlers} height={300}
          label="Servicios de campo por mes, apilados por tipo de servicio o por sector"
          note="Cada registro de servicio cuenta una vez. Clic en un segmento para listar sus servicios."
          controls={() => <Segmented label="Separar por" value={monthBy} onChange={setMonthBy} options={[['kind', 'Tipo de servicio'], ['sector', 'Sector']]} />} />
        <ChartPanel title="Servicios con refacciones por tipo" file="uso_refacciones_tipo" option={usage.option} handlers={usageHandlers} height={usage.height}
          label="Porcentaje de servicios de cada tipo que usaron al menos una refacción"
          note="% de servicios del tipo que registraron al menos una refacción. Clic para listarlos."
          footer={<div className="tc-table-scroll"><table className="tc-table kpi-mini-table kpi-parts-usage">
            <thead><tr><th>Tipo</th><th>Servicios</th><th>Con refacción</th><th>Piezas</th><th title="Piezas por servicio con refacción">Pzas./serv.</th></tr></thead>
            <tbody>{usage.rows.map(row => <tr key={row.kind}>
              <td><span className="kpi-lab-outcome"><i className="kpi-lab-dot" style={{ background: kindColors[row.kind] }} />{kindLabels[row.kind]}</span></td>
              <td>{formatCount(row.services)}<small>{row.gobierno} G · {row.particular} P</small></td>
              <td>{formatCount(row.withParts)}<small>{pct(row.share)}</small></td>
              <td>{formatCount(row.parts)}</td><td>{decimal(row.perService)}</td>
            </tr>)}</tbody></table></div>} />
        <ChartPanel title="Uso de refacciones por mes" file="uso_refacciones_mes" option={trend.rows.length ? trend.option : null} handlers={trendHandlers} height={trend.rows.length ? 300 : 0}
          footer={trend.rows.length ? undefined : <p className="kpi-mini-empty">Ningún tipo de servicio tiene 10 servicios o más con estos filtros.</p>}
          label="Servicios con refacciones por mes y tipo de servicio, como porcentaje del tipo o como número"
          note={shareMode === 'share' ? '% de los servicios del tipo en ese mes que usaron refacciones. Tipos con 10 servicios o más; sin punto si el mes tuvo menos de 3.' : 'Número de servicios del tipo con refacciones en el mes (tipos con 10 servicios o más).'}
          controls={() => <Segmented label="Medida" value={shareMode} onChange={setShareMode} options={[['share', '% del tipo'], ['count', 'Servicios']]} />} />
        <ChartPanel wide title="Pareto de refacciones" file="pareto_refacciones" option={paretoView.option} handlers={paretoHandlers} height={330}
          label="Piezas utilizadas por código de refacción, de mayor a menor, con la zona que concentra el 80 % de las piezas"
          note={paretoView.rows.length ? `${formatCount(paretoView.rows.length)} ${paretoView.rows.length === 1 ? 'código' : 'códigos'} · en tinta, los que suman el 80 % de las piezas. Clic en una barra para ver los servicios que la usaron.` : 'Sin refacciones con este filtro.'}
          controls={() => <Segmented label="Tipo de servicio" value={paretoKind} onChange={setParetoKind}
            options={[['todos', 'Todos'], ['preventivo', 'Preventivo'], ['correctivo', 'Correctivo'], ['visita', 'Visita'], ['reacondicionamiento', 'Reacond.']]} />} />
        <ChartPanel wide title="Flujo de refacciones" file="flujo_refacciones" option={flows.empty ? null : flows.option} handlers={flowHandlers} height={flows.height}
          label="Diagrama de flujo de piezas: plataforma, tipo de servicio y refacción"
          note="Piezas de cada plataforma hacia el tipo de servicio y la refacción (12 más usadas; el resto en «Otras»). Clic en una plataforma para filtrar; en una refacción para ver sus servicios." />
        <ChartPanel title="Consumo por refacción y mes" file="consumo_refaccion_mes" option={heat.option} handlers={heatHandlers} height={heat.height}
          label="Mapa de calor de piezas por mes para las 15 refacciones más usadas"
          note="Las 15 refacciones más usadas. Clic en una celda para ver sus servicios." />
        <ChartPanel title="Plataformas y refacciones" file="plataformas_refacciones" option={tree.empty ? null : tree.option} handlers={treeHandlers} height={heat.height}
          label="Mapa de árbol de piezas por plataforma y código de refacción"
          note="Área proporcional a las piezas. Clic en una plataforma para filtrar todo el análisis." />
        <ChartPanel wide title="Servicios por plataforma y mes" file="plataforma_mes" option={matrixView === 'mapa' ? matrix.option : null} handlers={matrixHandlers} height={matrixView === 'mapa' ? matrix.height : 0}
          label="Servicios por plataforma y mes del tipo elegido"
          note="Como las hojas de Preventivos y Correctivos. En la tabla, cada mes se separa en Gobierno y Particular."
          controls={() => <>
            <Segmented label="Tipo de servicio" value={matrixKind} onChange={setMatrixKind} options={[['preventivo', 'Preventivo'], ['correctivo', 'Correctivo'], ['visita', 'Visita'], ['todos', 'Todos']]} />
            <Segmented label="Vista" value={matrixView} onChange={setMatrixView} options={[['mapa', 'Mapa'], ['tabla', 'Tabla']]} />
          </>}
          footer={matrixView === 'tabla' ? <div className="tc-table-scroll"><table className="tc-table kpi-mini-table kpi-parts-matrix">
            <thead><tr><th rowSpan={2}>Plataforma</th>{monthNames.map(name => <th key={name} colSpan={2}>{name}</th>)}<th rowSpan={2}>Total</th></tr>
              <tr>{months.map(month => <Fragment key={month}><th>Gob.</th><th>Part.</th></Fragment>)}</tr></thead>
            <tbody>{matrix.table.rows.map(row => <tr key={row.platform}><td><strong>{row.platform}</strong></td>{row.cells.map((cell, i) => <Fragment key={i}><td>{cell.gobierno || <span className="kpi-zero">0</span>}</td><td>{cell.particular || <span className="kpi-zero">0</span>}</td></Fragment>)}<td><strong>{row.total}</strong></td></tr>)}</tbody>
            <tfoot><tr><td><strong>Total</strong></td>{matrix.table.footer.map((cell, i) => <Fragment key={i}><td><strong>{cell.gobierno}</strong></td><td><strong>{cell.particular}</strong></td></Fragment>)}<td><strong>{matrix.table.total}</strong></td></tr></tfoot>
          </table></div> : undefined} />
      </div>
      {sel && <section ref={selectionRef} className="kpi-lab-selection" aria-label="Servicios seleccionados">
        <header>
          <div><strong>{sel.title}</strong>
            <span>{formatCount(sel.services.length)} servicios · {formatCount(sel.services.reduce((sum, service) => sum + service.parts, 0))} piezas registradas en esos servicios</span></div>
          <button type="button" className="tc-text-button" onClick={() => setSelection(null)}>Quitar selección</button>
        </header>
        <div className="tc-table-scroll"><table className="tc-table kpi-mini-table">
          <thead><tr><th>Fecha</th><th>Servicio</th><th>Tipo</th><th>Plataforma</th><th>Cliente</th><th>Sector</th><th>Técnico</th><th>Refacciones</th></tr></thead>
          <tbody>{[...sel.services].sort((a, b) => b.day.localeCompare(a.day)).slice(0, 100).map(service => {
            const open = service.ticket_id && service.folio ? () => onOpenTicket({ id: service.ticket_id!, folio: service.folio! }) : null;
            return <tr key={service.id} className={open ? 'is-clickable' : ''} tabIndex={open ? 0 : undefined} onClick={() => open?.()} onKeyDown={event => { if (open && event.key === 'Enter') open(); }}>
              <td>{day(service.day)}</td><td><strong>{service.folio || service.ref}</strong><small>{service.source}</small></td>
              <td><span className="kpi-lab-outcome"><i className="kpi-lab-dot" style={{ background: kindColors[kindOf(service.kind)] }} />{kindLabelOf(kindOf(service.kind))}</span></td>
              <td>{service.platform || 'Sin plataforma'}<small>{service.serial || ''}</small></td><td>{service.client || 'Sin cliente identificado'}</td>
              <td>{service.sector ? sectorLabels[service.sector] : 'Sin sector'}{service.sector_inferred && <small>Inferido de la serie</small>}</td>
              <td>{service.people ? <PrivateName>{service.people}</PrivateName> : <small>Sin técnico</small>}</td>
              <td>{(codesBySvc.get(service.id) || []).join(', ') || <small>Sin refacciones</small>}</td>
            </tr>;
          })}</tbody>
        </table></div>
        {sel.services.length > 100 && <p className="kpi-note">Se muestran los 100 más recientes; exporta a Excel para ver todos.</p>}
      </section>}
      <details className="kpi-parts-method">
        <summary>Cómo se calcula</summary>
        <ul>
          <li><b>Servicio.</b> Cada registro de servicio de campo: historial (importado de Biosisa o capturado en Orion) y reportes de servicio. No se fusionan registros del mismo día; no incluye capacitaciones ni servicios telefónicos.</li>
          <li><b>Con refacciones.</b> Servicios con al menos una refacción registrada en su reporte. <b>Piezas por servicio con refacción</b> = piezas ÷ servicios con refacciones del mismo tipo.</li>
          <li><b>Sector.</b> El del registro de origen; si no lo trae, el último conocido de la misma serie{summary.inferred ? ` (${summary.inferred} servicios con sector inferido en esta vista)` : ''}.</li>
          <li><b>Plataforma.</b> El modelo del registro o del equipo, normalizado (por ejemplo «BA400 con Módulo ISE» cuenta como BA400).</li>
          <li><b>Periodo y filtros.</b> Los del tablero (periodo, colaborador, cliente, plataforma, serie, tipo de servicio); sector y plataforma de esta sección se aplican sobre ellos.</li>
        </ul>
      </details>
    </>}
  </div>;
}
