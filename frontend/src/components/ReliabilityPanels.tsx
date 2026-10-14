import { useState, type ReactNode } from 'react';
import { downloadChart, useEChart, type ChartHandlers, type ChartOption } from './kpiEcharts';
import { levelHelp, levelLabels, type Level } from './reliabilityAnalytics';

const LEVEL_ICON: Record<Level, string> = { sostenida: '◆', indicio: '◇', sin_diferencia: '○', insuficiente: '∅', sin_datos: '⋯' };
export function LevelBadge({ level, adverse }: { level: Level; adverse?: boolean }) {
  return <span className={`rel-level rel-level--${level}${level === 'sostenida' ? (adverse ? ' is-adverse' : ' is-favorable') : ''}`} title={levelHelp[level]}>
    <span aria-hidden="true">{LEVEL_ICON[level]}</span>{levelLabels[level]}
  </span>;
}

export type DataQuality = 'confirmado' | 'parcial' | 'estimado' | 'sin_datos';
const qualityLabels: Record<DataQuality, string> = { confirmado: 'Dato registrado', parcial: 'Dato parcial', estimado: 'Supuesto explícito', sin_datos: 'Sin datos' };
export interface MethodSheet { formula: string; unit: string; denominator: string; period: string; missing: string }
export function KpiCard({ label, value, sub, compare, n, quality, method, tone }: {
  label: string; value: ReactNode; sub?: ReactNode; compare?: ReactNode; n?: ReactNode; quality: DataQuality; method: MethodSheet; tone?: 'neutral' | 'risk';
}) {
  const [open, setOpen] = useState(false);
  return <article className={`rel-kpi${quality === 'sin_datos' ? ' is-empty' : ''}${tone === 'risk' ? ' is-risk' : ''}`}>
    <header><span>{label}</span><button type="button" aria-expanded={open} onClick={() => setOpen(!open)} title="Ficha metodológica">{open ? 'Cerrar' : 'Ficha'}</button></header>
    <strong>{value}</strong>
    {sub && <small>{sub}</small>}
    {compare && <p className="rel-kpi-compare">{compare}</p>}
    <footer><span className={`rel-quality rel-quality--${quality}`}>{qualityLabels[quality]}</span>{n && <span>{n}</span>}</footer>
    {open && <dl className="rel-sheet"><dt>Fórmula</dt><dd>{method.formula}</dd><dt>Unidad</dt><dd>{method.unit}</dd><dt>Denominador</dt><dd>{method.denominator}</dd>
      <dt>Periodo</dt><dd>{method.period}</dd><dt>Faltantes</dt><dd>{method.missing}</dd></dl>}
  </article>;
}

export function Panel({ title, note, option, handlers, height = 300, file, wide, tools, children, label }: {
  title: string; note?: ReactNode; option: ChartOption | null; handlers?: ChartHandlers; height?: number; file: string; wide?: boolean; tools?: ReactNode; children?: ReactNode; label: string;
}) {
  const { ref, chart } = useEChart(option, handlers);
  return <figure className={`rel-panel${wide ? ' is-wide' : ''}`}>
    <figcaption><div><strong>{title}</strong>{note && <span>{note}</span>}</div>
      <div className="rel-panel-tools">{tools}<button type="button" className="rel-png" onClick={() => downloadChart(chart.current, file)} aria-label={`Descargar «${title}» como imagen`}>PNG</button></div>
    </figcaption>
    <div ref={ref} className="rel-canvas" style={{ height: option ? height : 0 }} role="img" aria-label={label} />
    {children}
  </figure>;
}

export function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (value: T) => void }) {
  return <div className="rel-seg" role="group" aria-label={label}>
    {options.map(([key, text]) => <button key={String(key)} type="button" aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>)}
  </div>;
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="rel-empty"><strong>{title}</strong><p>{children}</p>{action}</div>;
}

export function StatLine({ items }: { items: Array<[string, ReactNode]> }) {
  return <dl className="rel-statline">{items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}
