import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Loader } from './OrionLoader';
import ServiceKpiChart from './ServiceKpiChart';
import ServiceKpiRecords from './ServiceKpiRecords';
import ServiceSlaPolicies from './ServiceSlaPolicies';
import ServiceSupremoMetric from './ServiceSupremoMetric';
// ECharts only loads with the time lab, so the rest of the control center stays light.
const ServiceKpiTimeLab = lazy(() => import('./ServiceKpiTimeLab'));
import { applyBrandFontToWorkbook } from '../config/brandFonts';
import { fetchKpiOptions, fetchKpiSummary, type KpiOptions } from './serviceKpiApi';
import {
  activityMotiveLabels, activityResultLabels, ageBuckets, bucketLabel, chartsFor, defaultFilters, definitions, describeFilters, formatCount, formatDate,
  formatDateTime, formatHours, formatMoney, isoDay, kindLabels, labelOf, num, presetLabels, presetRange, priorityLabels, sectionsFor,
  qualityLabels, serviceTypeLabels, statusLabels, teamLabels, toRpcFilters, viewLabels, type CardSpec, type Drill, type KpiFilters, type KpiSummary,
  type KpiView, type PeriodPreset, type StaffRow,
} from './serviceKpiModel';

type Row = Record<string, unknown>;
const NONE = { client: 'Sin cliente identificado', platform: 'Sin plataforma', serial: 'Sin serie' };
const real = (label: unknown, missing: string) => label === missing ? null : label;
const captureNeeds = [
  'Prioridad del ticket: se captura al abrir el caso y la ajusta administración desde el expediente.',
  'Vínculo de reapertura: se elige el caso cerrado al abrir el nuevo ticket del mismo equipo.',
  'Duración, motivo, resultado, código de avería y solución de llamadas y visitas: se capturan en el seguimiento del caso.',
  'Tipo y resultado del servicio en el diagnóstico del caso (preventivo, correctivo, capacitación…).',
  'Costos de piezas: hoy solo existen en materiales con precio de los reportes; las refacciones del historial no tienen precio.',
  'Encuestas de satisfacción: el indicador aparece cuando los clientes responden.',
];

function HelpButton({ id, open, onToggle }: { id: string; open: boolean; onToggle: () => void }) {
  const definition = definitions[id];
  if (!definition) return null;
  return <span className="kpi-help">
    <button type="button" aria-expanded={open} aria-label={`Cómo se calcula: ${definition.label}`} onClick={event => { event.stopPropagation(); onToggle(); }}>?</button>
    {open && <span role="dialog" aria-label={definition.label} className="kpi-help-pop" onClick={event => event.stopPropagation()}>
      <strong>{definition.label}</strong>
      <span><b>Fórmula</b>{definition.formula}</span><span><b>Fuente</b>{definition.source}</span>
      <span><b>Campo de fecha</b>{definition.dateField}</span><span><b>Denominador</b>{definition.denominator}</span>
      {definition.note && <span><b>Regla</b>{definition.note}</span>}
    </span>}
  </span>;
}

function KpiCard({ spec, summary, help, onHelp, onDrill }: { spec: CardSpec; summary: KpiSummary; help: boolean; onHelp: () => void; onDrill: (drill: Drill) => void }) {
  const value = spec.read(summary.current);
  const delta = spec.compare(summary.current, summary.previous);
  const body = <>
    <small>{spec.label}</small>
    <strong className={`kpi-value is-${value.state}`}>{value.value}</strong>
    {value.detail && <span>{value.detail}</span>}
    {delta && <em className={`kpi-delta is-${delta.tone}`}>{delta.text}</em>}
  </>;
  return <article className={`kpi-card${spec.tone ? ` kpi-card--${spec.tone}` : ''}`}>
    <HelpButton id={spec.definition} open={help} onToggle={onHelp} />
    {spec.drill ? <button type="button" className="kpi-card-body" onClick={() => onDrill(spec.drill!)} aria-label={`${spec.label}: ${value.value}. Ver registros`}>{body}<i aria-hidden="true">Ver registros →</i></button> : <div className="kpi-card-body">{body}</div>}
  </article>;
}

function MiniTable({ title, definition, columns, rows, empty, drill, onDrill, help, onHelp }: {
  title: string; definition?: string; columns: Array<[string, (row: Row) => ReactNode]>; rows: Row[]; empty: string;
  drill?: (row: Row) => Drill | null; onDrill: (drill: Drill) => void; help?: boolean; onHelp?: () => void;
}) {
  return <div className="kpi-mini">
    <h4>{title}{definition && onHelp && <HelpButton id={definition} open={Boolean(help)} onToggle={onHelp} />}</h4>
    {rows.length === 0 ? <p className="kpi-mini-empty">{empty}</p> : <div className="tc-table-scroll"><table className="tc-table kpi-mini-table">
      <thead><tr>{columns.map(([label]) => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => {
        const target = drill?.(row) || null;
        return <tr key={index} className={target ? 'is-clickable' : ''} tabIndex={target ? 0 : undefined}
          onClick={() => target && onDrill(target)} onKeyDown={event => { if (target && event.key === 'Enter') onDrill(target); }}>
          {columns.map(([label, render]) => <td key={label}>{render(row)}</td>)}
        </tr>;
      })}</tbody>
    </table></div>}
  </div>;
}

function StaffTable({ rows, view, onDrill, help, onHelp }: { rows: StaffRow[]; view: KpiView; onDrill: (drill: Drill) => void; help: boolean; onHelp: () => void }) {
  const [sort, setSort] = useState<{ key: keyof StaffRow; desc: boolean }>({ key: 'name', desc: false });
  const sorted = [...rows].sort((a, b) => {
    const left = a[sort.key]; const right = b[sort.key];
    const order = typeof left === 'number' || typeof right === 'number' ? (num(left) ?? -1) - (num(right) ?? -1) : String(left ?? '').localeCompare(String(right ?? ''), 'es');
    return sort.desc ? -order : order;
  });
  const header = (key: keyof StaffRow, label: string) => <th aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : undefined}>
    <button type="button" className="kpi-sort" onClick={() => setSort({ key, desc: sort.key === key ? !sort.desc : key !== 'name' })}>{label}{sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}</button></th>;
  const cell = (value: number, target: Drill) => value > 0 ? <button type="button" className="kpi-link" onClick={() => onDrill(target)}>{formatCount(value)}</button> : <span className="kpi-zero">0</span>;
  const mix = (values: Record<string, number>, labels: Record<string, string>) => Object.entries(values || {}).sort((a, b) => b[1] - a[1]).map(([key, value]) => `${labels[key] || key}: ${value}`).join(' · ') || 'Sin pendientes';
  return <div className="kpi-mini kpi-staff">
    <h4>Balance de carga por colaborador<HelpButton id="workload" open={help} onToggle={onHelp} /></h4>
    <p className="kpi-note">No es un ranking: ordena por la columna que necesites. Considera tipo de servicio, prioridad y carga asignada antes de comparar personas.</p>
    {rows.length === 0 ? <p className="kpi-mini-empty">Sin colaboradores con este filtro.</p> : <div className="tc-table-scroll"><table className="tc-table kpi-mini-table"><thead><tr>
      {header('name', 'Colaborador')}{view === 'general' && header('team', 'Equipo')}{header('tickets_relevant', 'Tickets asignados')}{header('pending_at_cut', 'Abiertos al corte')}
      {header('overdue_at_cut', 'Vencidos')}{header('tickets_closed', 'Cerrados')}{header('sla_late', 'Fuera de plazo')}<th>Pendientes por prioridad / tipo</th>{header('resolution_median', 'Resolución (mediana)')}
      {view !== 'ingenieria' && header('trainings', 'Capacitaciones')}{header('visits', 'Visitas')}{header('calls', 'Llamadas')}
      {view !== 'quimica' && header('preventive_done', 'Preventivos realizados')}{view !== 'quimica' && header('corrective', 'Correctivos')}{header('satisfaction_avg', 'Satisfacción')}
    </tr></thead><tbody>{sorted.map(person => {
      const tickets = (match: Record<string, unknown>, title: string) => ({ dataset: 'tickets' as const, match: { responsible_id: person.id, ...match }, title: `${title} · ${person.name}`, definition: 'workload' });
      const activities = (match: Record<string, unknown>, title: string) => ({ dataset: 'activities' as const, match: { participant_ids: [person.id], in_period: true, ...match }, title: `${title} · ${person.name}`, definition: 'workload' });
      return <tr key={person.id}>
        <td><strong>{person.name}</strong></td>{view === 'general' && <td>{teamLabels[person.team] || person.team}</td>}
        <td>{cell(person.tickets_relevant, tickets({ relevant: true }, 'Tickets asignados'))}</td>
        <td>{cell(person.pending_at_cut, tickets({ pending_at_cut: true }, 'Abiertos al corte'))}</td>
        <td>{cell(person.overdue_at_cut, tickets({ overdue_at_cut: true }, 'Vencidos al corte'))}</td>
        <td>{cell(person.tickets_closed, tickets({ closed_in_period: true }, 'Cerrados'))}</td>
        <td>{person.sla_evaluable ? <>{cell(person.sla_late, tickets({ closed_in_period: true, sla_result: 'fuera' }, 'Fuera de plazo'))}<small> de {person.sla_evaluable}</small></> : <small>No aplica</small>}</td>
        <td><small>{mix(person.pending_by_priority, priorityLabels)}</small><small>{Object.keys(person.pending_by_type || {}).length ? mix(person.pending_by_type, serviceTypeLabels) : ''}</small></td>
        <td>{person.resolution_median === null ? <small>Sin dato</small> : formatHours(person.resolution_median)}</td>
        {view !== 'ingenieria' && <td>{cell(person.trainings, activities({ counts_training: true }, 'Capacitaciones'))}{person.trainings > 0 && <small>{person.trainings_done} realizadas</small>}</td>}
        <td>{cell(person.visits, activities({ is_visit: true }, 'Visitas'))}</td>
        <td>{cell(person.calls, activities({ is_call: true }, 'Llamadas'))}{num(person.call_minutes) !== null && <small>{formatCount(person.call_minutes)} min</small>}</td>
        {view !== 'quimica' && <td>{cell(person.preventive_done, activities({ is_planned: true, kind: 'preventivo', plan_status: 'realizado' }, 'Preventivos realizados'))}<small>de {person.preventive_programmed} programados</small></td>}
        {view !== 'quimica' && <td>{cell(person.corrective, activities({ is_visit: true, kinds: ['correctivo'] }, 'Correctivos'))}</td>}
        <td>{person.surveys ? `${person.satisfaction_avg} / 5 (${person.surveys})` : <small>Sin encuestas</small>}</td>
      </tr>;
    })}</tbody></table></div>}
  </div>;
}

export default function ServiceKpiCenter({ view, onOpenTicket }: { view: KpiView; onOpenTicket: (ticket: { id: string; folio: string }) => void }) {
  const [filters, setFilters] = useState<KpiFilters>(() => defaultFilters(view));
  const [typed, setTyped] = useState({ client: '', serial: '', recurrence_days: '' });
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [options, setOptions] = useState<KpiOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [help, setHelp] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deckStatus, setDeckStatus] = useState<string | null>(null);
  const records = useRef<HTMLDivElement>(null);
  const invalid = filters.from > filters.to;
  const rpcFilters = useMemo(() => toRpcFilters(view, filters), [view, filters]);
  useEffect(() => { fetchKpiOptions().then(setOptions).catch(() => setOptions({ people: [], clients: [], platforms: [], serials: [], statuses: [] })); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters(current => current.client === typed.client && current.serial === typed.serial && current.recurrence_days === typed.recurrence_days
      ? current : { ...current, client: typed.client, serial: typed.serial, recurrence_days: typed.recurrence_days }), 400);
    return () => window.clearTimeout(timer);
  }, [typed]);
  useEffect(() => {
    if (invalid) { setLoading(false); return; }
    let active = true;
    setLoading(true); setError('');
    fetchKpiSummary(rpcFilters)
      .then(result => { if (active) setSummary(result); })
      .catch(cause => { if (active) setError((cause as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [rpcFilters, revision, invalid]);
  useEffect(() => {
    if (!help) return;
    const close = () => setHelp(null);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setHelp(null); };
    document.addEventListener('click', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', escape); };
  }, [help]);
  const openDrill = useCallback((target: Drill) => {
    setDrill(target);
    window.setTimeout(() => records.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, []);
  const set = <K extends keyof KpiFilters>(key: K, value: KpiFilters[K]) => setFilters(current => ({ ...current, [key]: value }));
  const setPreset = (preset: PeriodPreset) => setFilters(current => ({ ...current, preset, ...(preset === 'personalizado' ? {} : presetRange(preset)) }));
  const reset = () => { const next = defaultFilters(view); setFilters(next); setTyped({ client: '', serial: '', recurrence_days: '' }); setDrill(null); };
  const people = (options?.people || []).filter(person => view === 'general' || person.team === view);
  const criteria = describeFilters(view, filters, options?.people || []);
  const toggleHelp = (id: string) => setHelp(current => current === id ? null : id);
  const sections = sectionsFor(view);
  const charts = chartsFor(view);
  const breakdowns = (summary?.breakdowns || {}) as Record<string, Row[]>;
  const showSurveys = num(summary?.quality.surveys_answered_total) !== 0;
  const series = summary?.series || [];
  const granularity = summary?.period.granularity || filters.granularity;
  const chart = (id: string) => { const spec = charts.find(item => item.id === id); return spec ? <ServiceKpiChart key={id} spec={spec} rows={series} granularity={granularity} onDrill={openDrill} /> : null; };
  const t = (dataset: Drill['dataset'], match: Record<string, unknown>, title: string, definition?: string): Drill => ({ dataset, match, title, definition });
  const lab = summary && <Suspense key="lab" fallback={<Loader label="Cargando el análisis de tiempos…" />}>
    <ServiceKpiTimeLab view={view} summary={summary} filters={rpcFilters} revision={revision} onDrill={openDrill} onOpenTicket={onOpenTicket} />
  </Suspense>;

  const tables = {
    aging: <MiniTable key="aging" title="Antigüedad de pendientes al corte" definition="pending" help={help === 'aging'} onHelp={() => toggleHelp('aging')}
      columns={[['Antigüedad', row => String(row.bucket)], ['Pendientes', row => formatCount(row.total)], ['Vencidos', row => formatCount(row.overdue)],
        ['Distribución', row => { const max = Math.max(1, ...((breakdowns.aging || []) as Row[]).map(item => num(item.total) || 0)); return <span className="kpi-inline-bar" aria-hidden="true"><i style={{ width: `${(num(row.total) || 0) / max * 100}%` }} /><b style={{ width: `${(num(row.overdue) || 0) / max * 100}%` }} /></span>; }]]}
      rows={((breakdowns.aging || []) as Row[]).filter(row => ageBuckets.includes(String(row.bucket)))} empty="Sin pendientes al corte."
      drill={row => num(row.total) ? t('tickets', { pending_at_cut: true, age_bucket: row.bucket }, `Pendientes con ${row.bucket} de antigüedad`, 'pending') : null} onDrill={openDrill} />,
    resolution: <MiniTable key="resolution" title="Tiempo de resolución por tipo de servicio y prioridad" definition="resolution" help={help === 'resolution_by'} onHelp={() => toggleHelp('resolution_by')}
      columns={[['Tipo de servicio', row => labelOf(serviceTypeLabels, row.service_type)], ['Prioridad', row => labelOf(priorityLabels, row.priority)], ['Casos', row => formatCount(row.n)],
        ['Promedio', row => formatHours(row.avg)], ['Mediana', row => formatHours(row.median)], ['Percentil 90', row => formatHours(row.p90)]]}
      rows={breakdowns.resolution_by || []} empty="Sin cierres solucionados en el periodo."
      drill={row => t('tickets', { closed_in_period: true, closure_class: 'solucionado', service_type: row.service_type, priority: row.priority }, `Resolución · ${labelOf(serviceTypeLabels, row.service_type)} · ${labelOf(priorityLabels, row.priority)}`, 'resolution')} onDrill={openDrill} />,
    effectiveness: <MiniTable key="effectiveness" title="Efectividad de soluciones por código de avería" definition="effectiveness" help={help === 'effectiveness'} onHelp={() => toggleHelp('effectiveness')}
      columns={[['Avería', row => `${row.failure}${row.failure_label ? ` · ${row.failure_label}` : ''}`], ['Solución aplicada', row => row.solution === 'sin_solucion' ? 'Sin solución registrada' : `${row.solution}${row.solution_label ? ` · ${row.solution_label}` : ''}`],
        ['Eventos', row => formatCount(row.n)], ['Evaluables', row => formatCount(row.evaluable)], ['Reincidencias', row => formatCount(row.recurred)],
        ['Efectividad', row => row.effectiveness === null ? 'No aplica' : <>{`${row.effectiveness} %`}{row.small_sample ? <small className="kpi-flag">Muestra pequeña</small> : null}</>]]}
      rows={breakdowns.failure_solution || []} empty="Sin averías con código registrado en el periodo."
      drill={row => t('failures', row.solution === 'sin_solucion' ? { in_period: true, failure_code: row.failure } : { in_period: true, failure_code: row.failure, solution_codes: [row.solution] }, `Averías ${row.failure} · solución ${row.solution === 'sin_solucion' ? 'sin registrar' : row.solution}`, 'effectiveness')} onDrill={openDrill} />,
    failures: <MiniTable key="failures" title="Averías más frecuentes" definition="recurrence_rate" help={help === 'failures_top'} onHelp={() => toggleHelp('failures_top')}
      columns={[['Código', row => String(row.code)], ['Avería', row => String(row.label || 'Sin descripción')], ['Eventos', row => formatCount(row.n)]]}
      rows={breakdowns.failures_top || []} empty="Sin códigos de avería registrados en el periodo."
      drill={row => t('failures', { in_period: true, failure_code: row.code }, `Eventos de avería ${row.code}`, 'recurrence_rate')} onDrill={openDrill} />,
    trainingsByClient: <MiniTable key="tclient" title="Capacitaciones por cliente" columns={[['Cliente', row => String(row.label)], ['Capacitaciones', row => formatCount(row.capacitacion)], ['Recapacitaciones', row => formatCount(row.recapacitacion)], ['Realizadas', row => formatCount(row.done)]]}
      rows={breakdowns.trainings_by_client || []} empty="Sin capacitaciones en el periodo." onDrill={openDrill}
      drill={row => t('activities', { in_period: true, counts_training: true, client: real(row.label, NONE.client) }, `Capacitaciones · ${row.label}`, 'trainings')} />,
    trainingsByPlatform: <MiniTable key="tplatform" title="Capacitaciones por plataforma" columns={[['Plataforma', row => String(row.label)], ['Capacitaciones', row => formatCount(row.capacitacion)], ['Recapacitaciones', row => formatCount(row.recapacitacion)], ['Realizadas', row => formatCount(row.done)]]}
      rows={breakdowns.trainings_by_platform || []} empty="Sin capacitaciones en el periodo." onDrill={openDrill}
      drill={row => t('activities', { in_period: true, counts_training: true, platform: real(row.label, NONE.platform) }, `Capacitaciones · ${row.label}`, 'trainings')} />,
    visitsByKind: <MiniTable key="vkind" title="Visitas por motivo de servicio" columns={[['Tipo de servicio', row => labelOf(kindLabels, row.label)], ['Visitas', row => formatCount(row.n)]]}
      rows={breakdowns.visits_by_kind || []} empty="Sin visitas en el periodo." onDrill={openDrill}
      drill={row => t('activities', { in_period: true, is_visit: true, kind: row.label }, `Visitas · ${labelOf(kindLabels, row.label)}`, 'visits')} />,
    visitsByResult: <MiniTable key="vresult" title="Resultado de las visitas" columns={[['Resultado', row => labelOf(activityResultLabels, row.label)], ['Visitas', row => formatCount(row.n)]]}
      rows={breakdowns.visits_by_result || []} empty="Sin visitas en el periodo." onDrill={openDrill}
      drill={row => t('activities', { in_period: true, is_visit: true, result: row.label === 'sin_dato' ? null : row.label }, `Visitas · ${labelOf(activityResultLabels, row.label)}`, 'visits')} />,
    callsByReason: <MiniTable key="creason" title="Llamadas por motivo" columns={[['Motivo', row => labelOf(activityMotiveLabels, row.label === 'sin_dato' ? null : row.label)], ['Llamadas', row => formatCount(row.n)], ['Minutos', row => row.minutes === null ? 'Sin dato' : formatCount(row.minutes)]]}
      rows={breakdowns.calls_by_reason || []} empty="Sin llamadas en el periodo." onDrill={openDrill}
      drill={row => t('activities', { in_period: true, is_call: true, reason: row.label === 'sin_dato' ? null : row.label }, `Llamadas · ${labelOf(activityMotiveLabels, row.label === 'sin_dato' ? null : row.label)}`, 'calls')} />,
    callsByResult: <MiniTable key="cresult" title="Resultado de las llamadas" columns={[['Resultado', row => labelOf(activityResultLabels, row.label)], ['Llamadas', row => formatCount(row.n)]]}
      rows={breakdowns.calls_by_result || []} empty="Sin llamadas en el periodo." onDrill={openDrill}
      drill={row => t('activities', { in_period: true, is_call: true, result: row.label === 'sin_dato' ? null : row.label }, `Llamadas · ${labelOf(activityResultLabels, row.label)}`, 'calls_resolved_rate')} />,
    correctiveByPlatform: <MiniTable key="cplat" title="Correctivos por plataforma" columns={[['Plataforma', row => String(row.label)], ['Correctivos', row => formatCount(row.n)]]}
      rows={breakdowns.corrective_by_platform || []} empty="Sin correctivos en el periodo." onDrill={openDrill}
      drill={row => t('activities', { in_period: true, is_visit: true, kinds: ['correctivo'], platform: real(row.label, NONE.platform) }, `Correctivos · ${row.label}`, 'corrective')} />,
    correctiveByClient: <MiniTable key="cclient" title="Correctivos por cliente (15 principales)" columns={[['Cliente', row => String(row.label)], ['Correctivos', row => formatCount(row.n)]]}
      rows={breakdowns.corrective_by_client || []} empty="Sin correctivos en el periodo." onDrill={openDrill}
      drill={row => t('activities', { in_period: true, is_visit: true, kinds: ['correctivo'], client: real(row.label, NONE.client) }, `Correctivos · ${row.label}`, 'corrective')} />,
    correctiveBySerial: <MiniTable key="cserial" title="Correctivos por equipo (15 principales)" columns={[['Serie', row => String(row.label)], ['Plataforma', row => String(row.platform || 'Sin plataforma')], ['Cliente', row => String(row.client || 'Sin cliente identificado')], ['Correctivos', row => formatCount(row.n)]]}
      rows={breakdowns.corrective_by_serial || []} empty="Sin correctivos en el periodo." onDrill={openDrill}
      drill={row => t('activities', { in_period: true, is_visit: true, kinds: ['correctivo'], serial: real(row.label, NONE.serial) }, `Correctivos · serie ${row.label}`, 'corrective')} />,
    partsByPlatform: <MiniTable key="pplat" title="Piezas por plataforma y tipo de mantenimiento" definition="parts_cost" help={help === 'parts_by'} onHelp={() => toggleHelp('parts_by')}
      columns={[['Plataforma', row => String(row.platform)], ['Mantenimiento', row => labelOf(kindLabels, row.kind)], ['Líneas', row => formatCount(row.lines)], ['Piezas', row => formatCount(row.qty)],
        ['Costo', row => num(row.cost_lines) ? `${formatMoney(row.cost)} (${row.cost_lines} de ${row.lines} con precio)` : 'Sin costo registrado']]}
      rows={breakdowns.parts_by_platform || []} empty="Sin piezas en el periodo." onDrill={openDrill}
      drill={row => t('parts', { in_period: true, platform: real(row.platform, NONE.platform), maintenance_kind: row.kind }, `Piezas · ${row.platform} · ${labelOf(kindLabels, row.kind)}`, 'parts')} />,
    partsTop: <MiniTable key="ptop" title="Piezas más utilizadas" columns={[['Código', row => String(row.code)], ['Descripción', row => String(row.description || 'Sin descripción')], ['Total', row => formatCount(row.qty)], ['En preventivos', row => formatCount(row.preventive)], ['En correctivos', row => formatCount(row.corrective)]]}
      rows={breakdowns.parts_top || []} empty="Sin piezas en el periodo." onDrill={openDrill}
      drill={row => t('parts', { in_period: true, code: row.code === 'Sin código' ? null : row.code }, `Pieza ${row.code}`, 'parts')} />,
  };
  const extras: Record<string, ReactNode[]> = view === 'quimica' ? {
    capacitaciones: [chart('trainings'), <div key="tt" className="kpi-mini-grid">{tables.trainingsByClient}{tables.trainingsByPlatform}</div>],
    visitas: [chart('field'), <div key="vv" className="kpi-mini-grid">{tables.visitsByKind}{tables.visitsByResult}{tables.callsByReason}{tables.callsByResult}{tables.failures}{tables.effectiveness}</div>],
    tickets: [lab, <div key="ta" className="kpi-mini-grid">{tables.aging}{tables.resolution}</div>],
  } : view === 'ingenieria' ? {
    preventivos: [chart('preventive')],
    correctivos: [chart('maintenance'), <div key="cc" className="kpi-mini-grid">{tables.correctiveByPlatform}{tables.correctiveByClient}{tables.correctiveBySerial}{tables.visitsByResult}{tables.failures}{tables.effectiveness}</div>],
    piezas: [<div key="pp" className="kpi-mini-grid">{tables.partsByPlatform}{tables.partsTop}</div>],
    telefono: [<div key="tl" className="kpi-mini-grid">{tables.callsByReason}{tables.callsByResult}</div>],
    tickets: [lab, <div key="ta" className="kpi-mini-grid">{tables.aging}{tables.resolution}</div>],
  } : {
    tickets: [lab, <div key="ta" className="kpi-mini-grid">{tables.aging}{tables.resolution}</div>],
    calidad: [<div key="ef" className="kpi-mini-grid">{tables.effectiveness}{tables.failures}</div>],
    actividad: [<div key="ac" className="kpi-chart-grid">{chart('maintenance')}{chart('field')}</div>],
  };
  const exportIndicators = async () => {
    if (!summary) return;
    setExporting(true);
    try {
      const { default: ExcelJS } = await import('exceljs');
      const book = new ExcelJS.Workbook(); book.creator = 'ORION · BioSystems'; book.created = new Date();
      const style = (sheet: import('exceljs').Worksheet) => { sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF153C48' } }; };
      const cards = book.addWorksheet('Indicadores', { views: [{ state: 'frozen', ySplit: 1 }] });
      cards.columns = [{ header: 'Sección', key: 's', width: 28 }, { header: 'Indicador', key: 'i', width: 32 }, { header: 'Valor', key: 'v', width: 16 }, { header: 'Detalle', key: 'd', width: 60 },
        { header: 'Periodo anterior', key: 'p', width: 18 }, { header: 'Comparación', key: 'c', width: 40 }, { header: 'Fórmula', key: 'f', width: 70 }, { header: 'Denominador', key: 'n', width: 70 }];
      for (const section of sections) for (const spec of section.cards) {
        if (spec.id === 'csat' && !showSurveys) continue;
        const value = spec.read(summary.current); const before = spec.read(summary.previous); const definition = definitions[spec.definition];
        cards.addRow({ s: section.title, i: spec.label, v: value.value, d: value.detail, p: before.value, c: spec.compare(summary.current, summary.previous)?.text || '', f: definition?.formula, n: definition?.denominator });
      }
      style(cards);
      const evolution = book.addWorksheet('Evolución');
      const keys = Object.keys(series[0] || {}).filter(key => key !== 'bucket');
      evolution.columns = [{ header: 'Intervalo', key: 'bucket', width: 16 }, ...keys.map(key => ({ header: key, key, width: 18 }))];
      for (const row of series) evolution.addRow({ ...row, bucket: bucketLabel(row.bucket, granularity) });
      style(evolution);
      const staff = book.addWorksheet('Colaboradores');
      staff.columns = [['name', 'Colaborador'], ['team', 'Equipo'], ['tickets_relevant', 'Tickets asignados'], ['pending_at_cut', 'Abiertos al corte'], ['overdue_at_cut', 'Vencidos'], ['tickets_closed', 'Cerrados'],
        ['sla_evaluable', 'Cierres evaluables'], ['sla_late', 'Fuera de plazo'], ['resolution_median', 'Resolución mediana (h)'], ['trainings', 'Capacitaciones'], ['trainings_done', 'Capacitaciones realizadas'],
        ['visits', 'Visitas'], ['calls', 'Llamadas'], ['call_minutes', 'Minutos de llamada'], ['preventive_programmed', 'Preventivos programados'], ['preventive_done', 'Preventivos realizados'],
        ['corrective', 'Correctivos'], ['surveys', 'Encuestas'], ['satisfaction_avg', 'Satisfacción promedio']].map(([key, header]) => ({ key, header, width: 18 }));
      for (const person of summary.breakdowns.staff) staff.addRow({ ...person, team: teamLabels[person.team] || person.team });
      style(staff);
      const quality = book.addWorksheet('Calidad de datos');
      quality.addRows([['Concepto', 'Registros'], ...qualityLabels.map(([key, label]) => [label, num(summary.quality[key]) ?? 0])]);
      quality.getColumn(1).width = 110; quality.getColumn(2).width = 14; style(quality);
      const info = book.addWorksheet('Criterios');
      info.addRows([['Generado', new Date().toLocaleString('es-MX')], ...criteria, ['Periodo anterior', `${summary.period.previous_from} a ${summary.period.previous_to}`],
        ['Corte de pendientes', formatDateTime(summary.period.cut_at)], ['Zona horaria', summary.period.timezone]]);
      info.getColumn(1).width = 26; info.getColumn(2).width = 90;
      applyBrandFontToWorkbook(book);
      const buffer = await book.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ORION_indicadores_${view}_${isoDay(new Date())}.xlsx`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (cause) { setError(`No se pudo exportar: ${(cause as Error).message}`); }
    finally { setExporting(false); }
  };

  // The deck code (pptxgenjs + chart rendering) loads only when someone asks for a presentation.
  const exportDeck = async () => {
    if (!summary) return;
    setDeckStatus('Preparando presentación…'); setError('');
    try {
      const { buildServiceDeck } = await import('./kpiDeck');
      await buildServiceDeck({ summary, filters: rpcFilters, criteria, onProgress: setDeckStatus });
    } catch (cause) { setError(`No se pudo generar la presentación: ${(cause as Error).message}`); }
    finally { setDeckStatus(null); }
  };

  const typeOptions = view === 'quimica'
    ? ['soporte_quimica', 'capacitacion', 'recapacitacion', 'visita', 'llamada']
    : view === 'ingenieria' ? ['soporte_ingenieria', 'preventivo', 'correctivo', 'instalacion', 'visita', 'llamada']
      : ['soporte_quimica', 'soporte_ingenieria', 'soporte_sin_especialidad', 'preventivo', 'correctivo', 'capacitacion', 'recapacitacion', 'instalacion', 'visita', 'llamada'];
  const totals = summary ? ['tickets_opened', 'tickets_closed', 'pending_at_cut', 'visits', 'calls', 'trainings_total', 'preventive_programmed', 'parts_lines'].reduce((sum, key) => sum + (num(summary.current[key]) || 0), 0) : 0;
  return <div className="kpi-center" aria-busy={loading}>
    <div className="kpi-filterbar" role="group" aria-label={`Filtros · ${viewLabels[view]}`}>
      <label>Periodo<select value={filters.preset} onChange={event => setPreset(event.target.value as PeriodPreset)}>{Object.entries(presetLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Desde<input type="date" value={filters.from} max={filters.to} onChange={event => setFilters(current => ({ ...current, preset: 'personalizado', from: event.target.value }))} /></label>
      <label>Hasta<input type="date" value={filters.to} min={filters.from} onChange={event => setFilters(current => ({ ...current, preset: 'personalizado', to: event.target.value }))} /></label>
      <label>Agrupar por<select value={filters.granularity} onChange={event => set('granularity', event.target.value as KpiFilters['granularity'])}><option value="week">Semana</option><option value="month">Mes</option><option value="quarter">Trimestre</option></select></label>
      <label>Colaborador<select value={filters.person} onChange={event => set('person', event.target.value)}><option value="">{view === 'quimica' ? 'Todo el equipo químico' : view === 'ingenieria' ? 'Todo el equipo de ingeniería' : 'Todo el personal'}</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}{view === 'general' ? ` · ${teamLabels[person.team] || ''}` : ''}</option>)}</select></label>
      <label>Cliente<input list={`kpi-clients-${view}`} value={typed.client} placeholder="Todos" onChange={event => setTyped(current => ({ ...current, client: event.target.value }))} /><datalist id={`kpi-clients-${view}`}>{(options?.clients || []).map(client => <option key={client} value={client} />)}</datalist></label>
      <label>Plataforma<select value={filters.platform} onChange={event => set('platform', event.target.value)}><option value="">Todas</option>{(options?.platforms || []).map(platform => <option key={platform} value={platform}>{platform}</option>)}</select></label>
      <label>Equipo / serie<input list={`kpi-serials-${view}`} value={typed.serial} placeholder="Todas" onChange={event => setTyped(current => ({ ...current, serial: event.target.value }))} /><datalist id={`kpi-serials-${view}`}>{(options?.serials || []).map(serial => <option key={serial} value={serial} />)}</datalist></label>
      <label>Tipo de servicio<select value={filters.service_type} onChange={event => set('service_type', event.target.value)}><option value="">Todos</option>{typeOptions.map(type => <option key={type} value={type}>{labelOf(serviceTypeLabels, type)}</option>)}</select></label>
      <label>Prioridad<select value={filters.priority} onChange={event => set('priority', event.target.value)}><option value="">Todas</option>{Object.entries(priorityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Estado del ticket<select value={filters.status} onChange={event => set('status', event.target.value)}><option value="">Todos</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Reincidencia (días)<input type="number" min={1} max={365} value={typed.recurrence_days} placeholder={summary ? String(summary.period.recurrence_days) : '30'} onChange={event => setTyped(current => ({ ...current, recurrence_days: event.target.value }))} /></label>
      <div className="kpi-filter-actions">
        <button type="button" className="tc-text-button" onClick={reset}>Limpiar filtros</button>
        <button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)}>Actualizar</button>
        <button type="button" className="kpi-export" disabled={!summary || loading || exporting} onClick={() => void exportIndicators()}>{exporting ? 'Exportando…' : 'Exportar indicadores'}</button>
        {view === 'general' && <button type="button" className="kpi-deck" disabled={!summary || loading || Boolean(deckStatus)} onClick={() => void exportDeck()} aria-live="polite">{deckStatus || 'Presentación PowerPoint'}</button>}
      </div>
    </div>
    {invalid && <p role="alert" className="tc-error">La fecha inicial debe ser anterior o igual a la final.</p>}
    {error && <div role="alert" className="tc-error">{error} <button type="button" className="tc-text-button" onClick={() => setRevision(value => value + 1)}>Reintentar</button></div>}
    {!summary ? <div className="tc-empty">{loading ? 'Calculando indicadores en el servidor…' : 'No hay indicadores para mostrar.'}</div> : <>
      <p className="kpi-context">
        <span>{formatDate(summary.period.from)} – {formatDate(summary.period.to)}</span>
        <span>Comparado con {formatDate(summary.period.previous_from)} – {formatDate(summary.period.previous_to)}</span>
        <span>Pendientes: fotografía al {summary.period.cut_is_now ? 'momento de la consulta' : 'cierre del periodo'} ({formatDateTime(summary.period.cut_at)})</span>
        <span>Zona horaria {summary.period.timezone}</span>
        {loading && <span className="kpi-refreshing">Actualizando…</span>}
      </p>
      {totals === 0 && <div className="kpi-banner"><strong>Sin registros en el periodo con estos filtros.</strong> Los indicadores muestran cero actividad; amplía el periodo o limpia los filtros.</div>}
      {sections.map(section => <section key={section.id} className="kpi-section" aria-labelledby={`kpi-${view}-${section.id}`}>
        <header><h3 id={`kpi-${view}-${section.id}`}>{section.title}</h3><span>{section.subtitle}</span></header>
        <div className="kpi-cards">{section.cards.filter(spec => spec.id !== 'csat' || showSurveys).map(spec =>
          <KpiCard key={spec.id} spec={spec} summary={summary} help={help === `${section.id}:${spec.id}`} onHelp={() => toggleHelp(`${section.id}:${spec.id}`)} onDrill={openDrill} />)}</div>
        {(extras[section.id] || []).map((node, index) => <Fragment key={index}>{node}</Fragment>)}
      </section>)}
      <section className="kpi-section" aria-label="Balance de carga">
        <StaffTable rows={summary.breakdowns.staff} view={view} onDrill={openDrill} help={help === 'workload'} onHelp={() => toggleHelp('workload')} />
      </section>
      <ServiceSupremoMetric view={view} filters={rpcFilters} revision={revision} onOpenTicket={onOpenTicket} />
      <div ref={records} className="kpi-records-anchor">
        {drill && <ServiceKpiRecords key={JSON.stringify(drill)} drill={drill} filters={rpcFilters} criteria={criteria} onClose={() => setDrill(null)} onOpenTicket={onOpenTicket} />}
      </div>
      <details className="kpi-quality">
        <summary>Calidad de datos <span>Registros sin dato suficiente, excluidos o atribuidos por regla</span></summary>
        <ul>{qualityLabels.map(([key, label]) => <li key={key} className={num(summary.quality[key]) ? 'has-issues' : ''}><b>{formatCount(summary.quality[key])}</b>{label}</li>)}
          {!showSurveys && <li className="has-issues"><b>0</b>Encuestas de satisfacción respondidas: el indicador de satisfacción no se muestra hasta que existan respuestas.</li>}</ul>
        <h4>Indicadores que dependen de captura nueva</h4>
        <p>Los campos nuevos se registran desde {formatDateTime(summary.quality.capture_since)}. Antes de esa fecha los registros quedan como “sin dato”; no se reconstruyen.</p>
        <ul>{captureNeeds.map(item => <li key={item}>{item}</li>)}</ul>
      </details>
      <details className="kpi-method">
        <summary>Cómo se calcula cada indicador</summary>
        <ul className="kpi-rules">
          <li><b>Periodo.</b> Aperturas, cierres y actividades se asignan por su fecha local; los pendientes son una fotografía al corte.</li>
          <li><b>Plazos.</b> Cada ticket de soporte usa su regla de plazo vigente (horas corridas u hábiles, zona horaria y pausas). La planeación no tiene plazo de respuesta: se mide como programado contra realizado.</li>
          <li><b>Sin duplicidades.</b> Llamadas, visitas y mantenimientos de un mismo ticket no son tickets nuevos. Registros del mismo equipo y día son una visita. Un caso se atribuye una vez a su responsable vigente; las reasignaciones quedan en su historial.</li>
          <li><b>Reaperturas y envíos a administrativo.</b> Un caso cerrado no se reabre: la reapertura es un caso nuevo vinculado. Los tickets enviados a administrativo (por ejemplo, pendientes de cotización) no son una resolución técnica: salen del plazo y de la resolución técnica y se cuentan aparte.</li>
          <li><b>Varios participantes.</b> Una actividad cuenta una vez para el equipo y una vez para cada participante en su desglose individual.</li>
          <li><b>Cero, sin dato y no aplica.</b> “0” es actividad nula registrada; “Sin dato” indica registros sin el campo necesario; “No aplica” indica que el denominador es cero.</li>
        </ul>
        <dl>{Object.entries(definitions).map(([key, definition]) => <div key={key}><dt>{definition.label}</dt><dd>{definition.formula} <em>Fuente: {definition.source} · Fecha: {definition.dateField} · Denominador: {definition.denominator}</em>{definition.note ? ` ${definition.note}` : ''}</dd></div>)}</dl>
      </details>
      {view === 'general' && <ServiceSlaPolicies policies={summary.policies} onChanged={() => setRevision(value => value + 1)} />}
    </>}
  </div>;
}
