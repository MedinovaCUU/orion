import { useEffect, useRef, useState } from 'react';
import { bucketLabel, formatCount, num, rateOf, SERIES_COLORS, type ChartSpec, type Drill, type Granularity, type SeriesRow } from './serviceKpiModel';

const niceMax = (value: number) => {
  if (value <= 4) return Math.max(value, 1);
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].map(factor => factor * magnitude).find(candidate => value / candidate <= 4) || magnitude * 10;
  return Math.ceil(value / step) * step;
};

// Grouped columns on a single y-axis. A rate (late %, compliance %) is printed as its own strip
// under the axis instead of a second scale. Every column opens the records behind it.
export default function ServiceKpiChart({ spec, rows, granularity, onDrill }: {
  spec: ChartSpec; rows: SeriesRow[]; granularity: Granularity; onDrill: (drill: Drill) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(280, Math.floor(entries[0].contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const values = rows.map(row => spec.series.map(series => num(row[series.key]) ?? 0));
  const max = niceMax(Math.max(0, ...values.flat()));
  // A rate chart with evaluable records but no events still has a meaningful 0 %.
  const empty = values.flat().every(value => value === 0) && (!spec.rate || rows.every(row => !num(row[spec.rate!.den])));
  const height = 210; const top = 14; const bottom = 30; const left = 38; const right = 8;
  const plotWidth = width - left - right; const plotHeight = height - top - bottom;
  const band = rows.length ? plotWidth / rows.length : plotWidth;
  const barWidth = Math.max(4, Math.min(24, (band * 0.72 - (spec.series.length - 1) * 2) / spec.series.length));
  const groupWidth = barWidth * spec.series.length + (spec.series.length - 1) * 2;
  const labelEvery = Math.max(1, Math.ceil(rows.length / Math.max(1, Math.floor(plotWidth / 64))));
  const y = (value: number) => top + plotHeight - (value / max) * plotHeight;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(step => Math.round(max * step * 100) / 100).filter((tick, index, all) => all.indexOf(tick) === index && Number.isInteger(tick));
  const hovered = hover === null ? null : rows[hover];
  const bar = (x: number, top: number, w: number, h: number) => {
    const r = Math.min(4, w / 2, h);
    return `M${x},${top + h}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${top + h}Z`;
  };
  return <figure className="kpi-chart" aria-label={spec.title}>
    <figcaption><strong>{spec.title}</strong>{spec.series.length > 1 && <span className="kpi-legend">{spec.series.map((series, index) => <span key={series.key}><i style={{ background: series.color || SERIES_COLORS[index] }} />{series.label}</span>)}</span>}</figcaption>
    <div ref={box} className="kpi-chart-box" onMouseLeave={() => setHover(null)}>
      {rows.length === 0 || empty ? <p className="kpi-chart-empty">Sin registros en el periodo con estos filtros.</p> : <svg width={width} height={height} role="img" aria-label={`${spec.title} por ${granularity === 'week' ? 'semana' : granularity === 'quarter' ? 'trimestre' : 'mes'}`}>
        {ticks.map(tick => <g key={tick}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="kpi-grid" /><text x={left - 6} y={y(tick) + 3} textAnchor="end" className="kpi-axis">{formatCount(tick)}</text></g>)}
        {rows.map((row, index) => {
          const x0 = left + index * band + (band - groupWidth) / 2;
          return <g key={row.bucket} onMouseEnter={() => setHover(index)}>
            <rect x={left + index * band} y={top} width={band} height={plotHeight} className={hover === index ? 'kpi-band is-active' : 'kpi-band'} />
            {spec.series.map((series, s) => {
              const value = values[index][s];
              const h = Math.max(value > 0 ? 1.5 : 0, (value / max) * plotHeight);
              const target = series.drill?.(row.bucket);
              return <path key={series.key} d={bar(x0 + s * (barWidth + 2), top + plotHeight - h, barWidth, h)} fill={series.color || SERIES_COLORS[s]}
                tabIndex={target && value > 0 ? 0 : -1} role={target ? 'button' : undefined}
                aria-label={`${series.label}, ${bucketLabel(row.bucket, granularity)}: ${formatCount(value)}`}
                className={target && value > 0 ? 'kpi-bar is-clickable' : 'kpi-bar'}
                onFocus={() => setHover(index)}
                onClick={() => target && value > 0 && onDrill(target)}
                onKeyDown={event => { if (target && value > 0 && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onDrill(target); } }} />;
            })}
            {index % labelEvery === 0 && <text x={left + index * band + band / 2} y={height - 10} textAnchor="middle" className="kpi-axis">{bucketLabel(row.bucket, granularity)}</text>}
          </g>;
        })}
        <line x1={left} x2={width - right} y1={top + plotHeight} y2={top + plotHeight} className="kpi-baseline" />
      </svg>}
      {hovered && !empty && <div className="kpi-tooltip" style={{ left: Math.min(Math.max(8, left + (hover! + 0.5) * band - 90), width - 188) }} role="status">
        <strong>{bucketLabel(hovered.bucket, granularity)}</strong>
        {spec.series.map((series, index) => <span key={series.key}><i style={{ background: series.color || SERIES_COLORS[index] }} />{series.label}<b>{formatCount(hovered[series.key])}</b></span>)}
        {spec.rate && <span>{spec.rate.label}<b>{rateOf(hovered, spec.rate) === null ? 'No aplica' : `${rateOf(hovered, spec.rate)} %`}</b></span>}
        <small>Haz clic en una columna para ver sus registros</small>
      </div>}
    </div>
    {spec.rate && rows.length > 0 && !empty && <div className="kpi-rate-strip" style={{ gridTemplateColumns: `${left}px repeat(${rows.length}, minmax(0, 1fr)) ${right}px` }} aria-label={spec.rate.label}>
      <span title={spec.rate.label}>%</span>
      {rows.map((row, index) => { const rate = rateOf(row, spec.rate!); return <span key={row.bucket} className={index % labelEvery === 0 ? '' : 'is-dense'} title={`${bucketLabel(row.bucket, granularity)}: ${rate === null ? 'No aplica' : `${rate} %`}`}>{rate === null ? '—' : `${Math.round(rate)}`}</span>; })}
      <span />
    </div>}
  </figure>;
}
