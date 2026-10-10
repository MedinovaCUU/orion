import { memo, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import {
  buildReactionSeries,
  formatReactionTime,
  formatReactionValue,
  REACTION_METRIC_LABELS,
  reactionReplicateColor,
  type BplReactionGroup,
  type ReactionMetric,
  type ReactionSeries,
} from './bplReactionCurves';

interface ChartMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const WIDE_MARGIN: ChartMargin = { top: 18, right: 64, bottom: 30, left: 52 };
const COMPACT_MARGIN: ChartMargin = { top: 18, right: 16, bottom: 30, left: 36 };
/** Márgenes según el ancho observado del contenedor: la gráfica estrecha cede el espacio de etiquetas finales. */
const marginFor = (width: number): ChartMargin => (width >= 720 ? WIDE_MARGIN : COMPACT_MARGIN);
/** Ancho de margen derecho necesario para que quepa "R1 0.4350" junto al último punto. */
const END_LABEL_MIN_MARGIN = 60;
const END_LABEL_MIN_GAP = 13;
const AXIS_FORMAT_FINE = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 3 });
const AXIS_FORMAT_COARSE = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

interface Layout {
  width: number;
  height: number;
  margin: ChartMargin;
  plotWidth: number;
  plotHeight: number;
  xScale: (cycle: number) => number;
  yScale: (value: number) => number;
  xTicks: number[];
  yTicks: number[];
  cycles: number[];
}

/** Escalones "bonitos" (1, 2, 2.5, 5, 10 × 10^n) para ejes legibles sin decimales raros. */
const niceStep = (span: number, count: number) => {
  const rough = span / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(rough || 1));
  const normalized = rough / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
};

const buildTicks = (min: number, max: number, count: number) => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max === min) return [min];
  const step = niceStep(max - min, count);
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= max + step * 1e-6; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }
  return ticks;
};

/** Interpolación cúbica monótona (Fritsch–Carlson): suaviza sin inventar picos entre ciclos. */
const monotonePath = (points: Array<{ x: number; y: number }>) => {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  const n = points.length;
  const dx: number[] = [];
  const dy: number[] = [];
  const slopes: number[] = [];
  for (let index = 0; index < n - 1; index += 1) {
    dx[index] = points[index + 1].x - points[index].x;
    dy[index] = points[index + 1].y - points[index].y;
    slopes[index] = dx[index] ? dy[index] / dx[index] : 0;
  }
  const tangents: number[] = [slopes[0]];
  for (let index = 1; index < n - 1; index += 1) {
    tangents[index] = slopes[index - 1] * slopes[index] <= 0 ? 0 : (slopes[index - 1] + slopes[index]) / 2;
  }
  tangents[n - 1] = slopes[n - 2];
  for (let index = 0; index < n - 1; index += 1) {
    if (slopes[index] === 0) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }
    const alpha = tangents[index] / slopes[index];
    const beta = tangents[index + 1] / slopes[index];
    const magnitude = alpha * alpha + beta * beta;
    if (magnitude > 9) {
      const scale = 3 / Math.sqrt(magnitude);
      tangents[index] = scale * alpha * slopes[index];
      tangents[index + 1] = scale * beta * slopes[index];
    }
  }
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < n - 1; index += 1) {
    const third = dx[index] / 3;
    const c1x = points[index].x + third;
    const c1y = points[index].y + tangents[index] * third;
    const c2x = points[index + 1].x - third;
    const c2y = points[index + 1].y - tangents[index + 1] * third;
    path += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${points[index + 1].x} ${points[index + 1].y}`;
  }
  return path;
};

/** Ancho real del contenedor; el observador se suscribe una sola vez y filtra cambios < 0.5 px. */
const useElementWidth = <T extends HTMLElement>(fallback: number) => {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    let last = -1;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next && Math.abs(next - last) > 0.5) {
        last = next;
        setWidth(next);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
};

const buildLayout = (series: ReactionSeries[], width: number, height: number): Layout | null => {
  const all = series.flatMap((item) => item.points);
  if (!all.length) return null;
  const margin = marginFor(width);
  const cycles = Array.from(new Set(all.map((point) => point.cycle))).sort((left, right) => left - right);
  const cycleMin = cycles[0];
  const cycleMax = cycles[cycles.length - 1];
  const valueMin = Math.min(...all.map((point) => point.value));
  const valueMax = Math.max(...all.map((point) => point.value));
  const valueSpan = valueMax - valueMin;
  const pad = valueSpan > 0 ? valueSpan * 0.1 : Math.max(Math.abs(valueMax) * 0.05, 0.01);
  const yMin = valueMin - pad;
  const yMax = valueMax + pad;
  const plotWidth = Math.max(80, width - margin.left - margin.right);
  const plotHeight = Math.max(60, height - margin.top - margin.bottom);
  const xSpan = cycleMax - cycleMin || 1;
  const xScale = (cycle: number) => margin.left + ((cycle - cycleMin) / xSpan) * plotWidth;
  const yScale = (value: number) => margin.top + plotHeight - ((value - yMin) / (yMax - yMin || 1)) * plotHeight;
  return {
    width,
    height,
    margin,
    plotWidth,
    plotHeight,
    xScale,
    yScale,
    xTicks: buildTicks(cycleMin, cycleMax, Math.max(3, Math.min(8, Math.floor(plotWidth / 70)))),
    yTicks: buildTicks(yMin, yMax, 4),
    cycles,
  };
};

const formatAxisValue = (value: number) => (Math.abs(value) < 1 ? AXIS_FORMAT_FINE : AXIS_FORMAT_COARSE).format(value);

export interface ReactionCurveChartProps {
  group: BplReactionGroup;
  metric: ReactionMetric;
  hiddenReplicates: ReadonlySet<number>;
  onToggleReplicate?: (replicateNumber: number) => void;
  height?: number;
}

/**
 * Curva de reacción: una línea por réplica, eje X = ciclo, eje Y = métrica elegida.
 * Mira HUD: retícula fina, marcas de eje, esquinas y crosshair con lectura de todas
 * las réplicas en el ciclo señalado. Los valores también viven en la tabla de puntos.
 */
export default function ReactionCurveChart({ group, metric, hiddenReplicates, onToggleReplicate, height = 280 }: ReactionCurveChartProps) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>(720);
  const [hoveredCycle, setHoveredCycle] = useState<number | null>(null);
  const gradientId = useId();
  const series = useMemo(() => buildReactionSeries(group, metric, hiddenReplicates), [group, metric, hiddenReplicates]);
  const layout = useMemo(() => buildLayout(series, width, height), [series, width, height]);
  const allSeries = useMemo(() => buildReactionSeries(group, metric), [group, metric]);

  const nearestCycle = (clientX: number) => {
    if (!layout || !containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    let best = layout.cycles[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    layout.cycles.forEach((cycle) => {
      const distance = Math.abs(layout.xScale(cycle) - x);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = cycle;
      }
    });
    return best;
  };

  const handlePointerMove = (event: PointerEvent<SVGRectElement>) => {
    const cycle = nearestCycle(event.clientX);
    if (cycle !== null && cycle !== hoveredCycle) setHoveredCycle(cycle);
  };

  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!layout) return;
    if (event.key === 'Escape') {
      // Reclama la tecla solo cuando hay una lectura que limpiar; así el explorador 3D no se cierra por accidente.
      if (hoveredCycle !== null) {
        event.preventDefault();
        setHoveredCycle(null);
      }
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const index = hoveredCycle === null ? -1 : layout.cycles.indexOf(hoveredCycle);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? layout.cycles.length - 1
          : event.key === 'ArrowLeft'
            ? Math.max(0, index - 1)
            : Math.min(layout.cycles.length - 1, index + 1);
    setHoveredCycle(layout.cycles[next]);
  };

  // Lecturas del ciclo señalado por réplica (todas las métricas, no solo la dibujada).
  const hoverRows = useMemo(() => {
    if (hoveredCycle === null) return [];
    return group.replicates
      .map((replicate, index) => ({
        replicate,
        index,
        color: reactionReplicateColor(index),
        point: replicate.points?.find((point) => point.cycle === hoveredCycle) || null,
        hidden: hiddenReplicates.has(replicate.replicateNumber),
      }))
      .filter((row) => row.point);
  }, [group.replicates, hiddenReplicates, hoveredCycle]);

  // Etiquetas finales solo cuando el margen derecho las aloja; en compacto la leyenda ya trae el último valor.
  const endLabels = useMemo(() => {
    if (!layout || series.length > 4 || layout.margin.right < END_LABEL_MIN_MARGIN) return [];
    const candidates = series
      .map((item) => {
        const last = item.points[item.points.length - 1];
        return { series: item, x: layout.xScale(last.cycle), y: layout.yScale(last.value), value: last.value };
      })
      .sort((left, right) => left.y - right.y);
    const placed: typeof candidates = [];
    candidates.forEach((candidate) => {
      const previous = placed[placed.length - 1];
      if (!previous || candidate.y - previous.y >= END_LABEL_MIN_GAP) placed.push(candidate);
    });
    return placed;
  }, [layout, series]);

  const hoverX = layout && hoveredCycle !== null ? layout.xScale(hoveredCycle) : null;
  const tooltipOnLeft = layout && hoverX !== null ? hoverX > layout.margin.left + layout.plotWidth * 0.58 : false;
  const hoverReading = hoverRows.find((row) => row.point?.readingAt)?.point?.readingAt || null;
  const margin = layout?.margin || COMPACT_MARGIN;
  const plotRight = layout ? margin.left + layout.plotWidth : 0;
  const plotBottom = layout ? margin.top + layout.plotHeight : 0;

  return (
    <div className="reaction-chart" ref={containerRef} data-testid="reaction-chart" data-metric={metric} data-series={series.length}>
      {layout ? (
        <>
          <svg
            className="reaction-chart__svg"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="img"
            aria-label={`Curva de reacción ${group.testName}, ${REACTION_METRIC_LABELS[metric]} por ciclo, ${series.length} réplicas`}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onBlur={() => setHoveredCycle(null)}
          >
            <defs>
              <linearGradient id={`${gradientId}-wash`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={series[0]?.color || '#2a78d6'} stopOpacity="0.16" />
                <stop offset="100%" stopColor={series[0]?.color || '#2a78d6'} stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Retícula: líneas continuas, un paso fuera de la superficie. */}
            {layout.yTicks.map((tick) => (
              <line key={`y-${tick}`} className="reaction-chart__grid" x1={margin.left} x2={plotRight} y1={layout.yScale(tick)} y2={layout.yScale(tick)} />
            ))}
            {layout.xTicks.map((tick) => (
              <line key={`x-${tick}`} className="reaction-chart__grid" x1={layout.xScale(tick)} x2={layout.xScale(tick)} y1={margin.top} y2={plotBottom} />
            ))}
            <line className="reaction-chart__axis" x1={margin.left} x2={plotRight} y1={plotBottom} y2={plotBottom} />
            <line className="reaction-chart__axis" x1={margin.left} x2={margin.left} y1={margin.top} y2={plotBottom} />

            {/* Marcas de eje y esquinas del instrumento. */}
            {layout.xTicks.map((tick) => (
              <g key={`xt-${tick}`}>
                <line className="reaction-chart__axis" x1={layout.xScale(tick)} x2={layout.xScale(tick)} y1={plotBottom} y2={plotBottom + 5} />
                <text x={layout.xScale(tick)} y={plotBottom + 18} textAnchor="middle" className="reaction-chart__tick">
                  {formatAxisValue(tick)}
                </text>
              </g>
            ))}
            {layout.yTicks.map((tick) => (
              <g key={`yt-${tick}`}>
                <line className="reaction-chart__axis" x1={margin.left - 5} x2={margin.left} y1={layout.yScale(tick)} y2={layout.yScale(tick)} />
                <text x={margin.left - 7} y={layout.yScale(tick) + 3.5} textAnchor="end" className="reaction-chart__tick">
                  {formatAxisValue(tick)}
                </text>
              </g>
            ))}
            {[
              [margin.left - 10, margin.top - 8, 1, 1],
              [plotRight + 10, margin.top - 8, -1, 1],
              [margin.left - 10, plotBottom + 8, 1, -1],
              [plotRight + 10, plotBottom + 8, -1, -1],
            ].map(([x, y, sx, sy]) => (
              <path key={`corner-${x}-${y}`} className="reaction-chart__corner" d={`M ${x} ${y + sy * 10} L ${x} ${y} L ${x + sx * 10} ${y}`} />
            ))}
            <text x={plotRight} y={margin.top - 6} textAnchor="end" className="reaction-chart__axis-title">
              {REACTION_METRIC_LABELS[metric]} · ciclos {formatAxisValue(layout.cycles[0])}–{formatAxisValue(layout.cycles[layout.cycles.length - 1])}
            </text>

            {/* Lavado bajo la réplica de referencia; líneas de 2 px por réplica. */}
            {series[0] ? (
              <path
                d={`${monotonePath(series[0].points.map((point) => ({ x: layout.xScale(point.cycle), y: layout.yScale(point.value) })))} L ${layout.xScale(series[0].points[series[0].points.length - 1].cycle)} ${plotBottom} L ${layout.xScale(series[0].points[0].cycle)} ${plotBottom} Z`}
                fill={`url(#${gradientId}-wash)`}
                stroke="none"
              />
            ) : null}
            {series.map((item) => (
              <path
                key={item.replicate.id}
                className="reaction-chart__line"
                data-replicate={item.replicate.replicateNumber}
                d={monotonePath(item.points.map((point) => ({ x: layout.xScale(point.cycle), y: layout.yScale(point.value) })))}
                fill="none"
                stroke={item.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {series.map((item) => {
              const last = item.points[item.points.length - 1];
              return (
                <circle key={`end-${item.replicate.id}`} cx={layout.xScale(last.cycle)} cy={layout.yScale(last.value)} r="4" fill={item.color} stroke="#fff" strokeWidth="2" />
              );
            })}
            {endLabels.map((label) => (
              <text key={`label-${label.series.replicate.id}`} x={label.x + 9} y={label.y + 3.5} className="reaction-chart__end-label">
                R{label.series.replicate.replicateNumber} {formatReactionValue(label.value, 4)}
              </text>
            ))}

            {/* Crosshair y retículas en el ciclo señalado. */}
            {hoverX !== null ? (
              <g className="reaction-chart__crosshair" pointerEvents="none">
                <line className="reaction-chart__crosshair-line" x1={hoverX} x2={hoverX} y1={margin.top} y2={plotBottom} />
                {hoverRows
                  .filter((row) => !row.hidden && row.point && row.point[metric] !== null)
                  .map((row) => (
                    <g key={`reticle-${row.replicate.id}`}>
                      <circle cx={hoverX} cy={layout.yScale(row.point![metric] as number)} r="9" fill="none" stroke={row.color} strokeWidth="1" opacity="0.55" />
                      <circle cx={hoverX} cy={layout.yScale(row.point![metric] as number)} r="4" fill={row.color} stroke="#fff" strokeWidth="2" />
                    </g>
                  ))}
              </g>
            ) : null}
            <rect
              className="reaction-chart__hit"
              x={margin.left}
              y={margin.top}
              width={layout.plotWidth}
              height={layout.plotHeight}
              fill="transparent"
              onPointerMove={handlePointerMove}
              onPointerDown={handlePointerMove}
              onPointerLeave={() => setHoveredCycle(null)}
            />
          </svg>

          {/* La lectura se ancla al ciclo (--x) y el CSS la mantiene dentro del panel; en móvil es una franja bajo la gráfica. */}
          {hoveredCycle !== null && hoverRows.length ? (
            <div
              className={`reaction-chart__tooltip ${tooltipOnLeft ? 'is-left' : ''}`}
              role="status"
              style={{ '--x': `${hoverX}px` } as CSSProperties}
              data-testid="reaction-tooltip"
            >
              <div className="reaction-chart__tooltip-head">
                <strong>Ciclo {formatAxisValue(hoveredCycle)}</strong>
                <span>{hoverReading ? formatReactionTime(hoverReading, { assumeUtc: false, withDate: false }) : 'sin hora de lectura'}</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Réplica</th>
                    <th>Abs1</th>
                    <th>Abs2</th>
                    <th>Dif</th>
                  </tr>
                </thead>
                <tbody>
                  {hoverRows.map((row) => (
                    <tr key={row.replicate.id} className={row.hidden ? 'is-hidden' : ''}>
                      <td>
                        <i style={{ background: row.color }} aria-hidden="true" />R{row.replicate.replicateNumber}
                      </td>
                      <td className={metric === 'abs1' ? 'is-active' : ''}>{formatReactionValue(row.point?.abs1)}</td>
                      <td className={metric === 'abs2' ? 'is-active' : ''}>{formatReactionValue(row.point?.abs2)}</td>
                      <td className={metric === 'dif' ? 'is-active' : ''}>{formatReactionValue(row.point?.dif)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : (
        <div className="reaction-chart__empty">
          {allSeries.length && hiddenReplicates.size >= allSeries.length
            ? 'Todas las réplicas están ocultas. Vuelve a activarlas en la leyenda.'
            : group.pointsLoaded
              ? `Sin valores de ${REACTION_METRIC_LABELS[metric]} en esta reacción.`
              : 'Leyendo puntos de la reacción…'}
        </div>
      )}

      {allSeries.length >= 2 ? (
        <div className="reaction-chart__legend" role="list" aria-label="Réplicas">
          {allSeries.map((item) => {
            const hidden = hiddenReplicates.has(item.replicate.replicateNumber);
            const last = item.points[item.points.length - 1];
            return (
              <button
                key={item.replicate.id}
                type="button"
                role="listitem"
                className={`reaction-chart__legend-item ${hidden ? 'is-hidden' : ''}`}
                aria-pressed={!hidden}
                onClick={() => onToggleReplicate?.(item.replicate.replicateNumber)}
                title={hidden ? 'Mostrar réplica' : 'Ocultar réplica'}
              >
                <i style={{ background: item.color }} aria-hidden="true" />
                <span>Réplica {item.replicate.replicateNumber}</span>
                <strong>{formatReactionValue(last?.value)}</strong>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const SPARKLINE_WIDTH = 220;
const SPARKLINE_HEIGHT = 48;

export interface ReactionSparklineProps {
  group: BplReactionGroup;
  metric?: ReactionMetric;
  /** Abre el visor; se conserva por compatibilidad. Prefiere `onOpenGroup`, que admite una referencia estable. */
  onOpen?: () => void;
  /** Variante estable del callback: recibe la reacción de la miniatura y no cambia de identidad por tarjeta. */
  onOpenGroup?: (group: BplReactionGroup) => void;
}

/** Miniatura para tarjetas: la última reacción de la prueba, sin ejes, con lavado bajo la réplica 1. */
function ReactionSparklineView({ group, metric = 'abs1', onOpen, onOpenGroup }: ReactionSparklineProps) {
  const series = useMemo(() => buildReactionSeries(group, metric), [group, metric]);
  const gradientId = useId();
  const width = SPARKLINE_WIDTH;
  const height = SPARKLINE_HEIGHT;
  const layout = useMemo(() => {
    const all = series.flatMap((item) => item.points);
    if (!all.length) return null;
    const cycleMin = Math.min(...all.map((point) => point.cycle));
    const cycleMax = Math.max(...all.map((point) => point.cycle));
    const valueMin = Math.min(...all.map((point) => point.value));
    const valueMax = Math.max(...all.map((point) => point.value));
    const span = valueMax - valueMin || Math.max(Math.abs(valueMax) * 0.05, 0.01);
    const xScale = (cycle: number) => 4 + ((cycle - cycleMin) / (cycleMax - cycleMin || 1)) * (width - 12);
    const yScale = (value: number) => 6 + (1 - (value - valueMin) / span) * (height - 12);
    return { xScale, yScale, cycleMin, cycleMax };
  }, [series, width, height]);
  const last = series[0]?.points[series[0].points.length - 1];
  const body = (
    <>
      {layout ? (
        <svg className="reaction-sparkline__svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <defs>
            <linearGradient id={`${gradientId}-spark`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={series[0].color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={series[0].color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={`${monotonePath(series[0].points.map((point) => ({ x: layout.xScale(point.cycle), y: layout.yScale(point.value) })))} L ${layout.xScale(series[0].points[series[0].points.length - 1].cycle)} ${height} L ${layout.xScale(series[0].points[0].cycle)} ${height} Z`}
            fill={`url(#${gradientId}-spark)`}
          />
          {series.map((item) => (
            <path
              key={item.replicate.id}
              d={monotonePath(item.points.map((point) => ({ x: layout.xScale(point.cycle), y: layout.yScale(point.value) })))}
              fill="none"
              stroke={item.color}
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {last ? <circle cx={layout.xScale(last.cycle)} cy={layout.yScale(last.value)} r="2.6" fill={series[0].color} stroke="#fff" strokeWidth="1.2" vectorEffect="non-scaling-stroke" /> : null}
        </svg>
      ) : (
        <div className="reaction-sparkline__pending">{group.pointsLoaded ? 'Sin puntos' : 'Leyendo curva…'}</div>
      )}
      <span className="reaction-sparkline__caption">
        <b>Última curva</b> · {REACTION_METRIC_LABELS[metric]} {last ? formatReactionValue(last.value) : ''} · {group.cycleCount || '…'} ciclos · {group.replicates.length} rép. ·{' '}
        {formatReactionTime(group.occurredAt)}
      </span>
    </>
  );
  if (onOpen || onOpenGroup) {
    return (
      <button
        type="button"
        className="reaction-sparkline reaction-sparkline--button"
        onClick={() => (onOpenGroup ? onOpenGroup(group) : onOpen?.())}
        title="Abrir en el visor de curvas"
        data-testid="reaction-sparkline"
      >
        {body}
      </button>
    );
  }
  return (
    <div className="reaction-sparkline" data-testid="reaction-sparkline">
      {body}
    </div>
  );
}

const ReactionSparklineMemo = memo(ReactionSparklineView);

/** Miniatura memoizada: con `group` estable y `onOpenGroup` estable, un corte del monitor no la vuelve a dibujar. */
export function ReactionSparkline(props: ReactionSparklineProps) {
  return <ReactionSparklineMemo {...props} />;
}
