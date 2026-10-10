import { useEffect, useMemo, useState, useSyncExternalStore, type SyntheticEvent } from 'react';
import ReactionCurveChart from './ReactionCurveChart';
import { BPL_STATUS_LABELS, bplToneFromStatus, formatBplDiagnosticStatus } from './bplEvents';
import {
  buildReactionSeries,
  describeReactionExecution,
  describeReactionGroup,
  filterReactionGroups,
  formatReactionTime,
  formatReactionValue,
  REACTION_METRIC_LABELS,
  reactionGroupMetrics,
  reactionReplicateColor,
  summarizeReactionSeries,
  EMPTY_REACTION_FILTERS,
  type BplReactionGroup,
  type ReactionExplorerFilters,
  type ReactionMetric,
} from './bplReactionCurves';
import type { BplReactionCurvesState } from './useBplReactionCurves';

const GROUP_STRIP_LIMIT = 40;
const TABLE_ROW_LIMIT = 600;

/** Escalera del módulo: cuerpo gráfica+tabla ≥1180, fila de filtros ≥960, gráfica media ≥561. */
const WIDE_BODY_QUERY = '(min-width: 1180px)';
const FILTERS_ROW_QUERY = '(min-width: 960px)';
const MEDIUM_UP_QUERY = '(min-width: 561px)';

interface MediaStore {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => boolean;
}

const createMediaStore = (query: string): MediaStore => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return { subscribe: () => () => {}, getSnapshot: () => false };
  }
  const list = window.matchMedia(query);
  return {
    subscribe: (onChange) => {
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    getSnapshot: () => list.matches,
  };
};

const getServerSnapshot = () => false;

/** Consulta de medios como store externo: una suscripción por instancia, sin estado ni efectos propios. */
const useMediaQuery = (query: string) => {
  const [store] = useState(() => createMediaStore(query));
  return useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
};

const formatCompactValue = (value: number | null) => (value === null ? '—' : formatReactionValue(value, 4));

/** Visor de una reacción: métrica, estadística rápida, gráfica y tabla de puntos contraída. */
function ReactionGroupViewer({ group, ensureGroupPoints }: { group: BplReactionGroup; ensureGroupPoints: (group: BplReactionGroup) => Promise<void> }) {
  const metrics = useMemo(() => reactionGroupMetrics(group), [group]);
  const [requestedMetric, setRequestedMetric] = useState<ReactionMetric>('abs1');
  const [hiddenReplicates, setHiddenReplicates] = useState<ReadonlySet<number>>(() => new Set());
  const [tableOpen, setTableOpen] = useState(false);
  const wideBody = useMediaQuery(WIDE_BODY_QUERY);
  const mediumUp = useMediaQuery(MEDIUM_UP_QUERY);
  const chartHeight = wideBody ? 320 : mediumUp ? 260 : 220;
  const metric: ReactionMetric = metrics.includes(requestedMetric) ? requestedMetric : metrics[0] || 'abs1';

  useEffect(() => {
    if (group.pointsLoaded) return;
    // Descarga diferida un tick: el visor no dispara estado de forma síncrona dentro del efecto.
    const timer = window.setTimeout(() => {
      void ensureGroupPoints(group);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ensureGroupPoints, group]);

  const summary = useMemo(() => summarizeReactionSeries(buildReactionSeries(group, metric, hiddenReplicates)), [group, hiddenReplicates, metric]);
  const tableRows = useMemo(
    () =>
      group.replicates
        .flatMap((replicate, index) =>
          (replicate.points || []).map((point) => ({ replicate, index, point })),
        )
        .sort((left, right) => left.point.cycle - right.point.cycle || left.replicate.replicateNumber - right.replicate.replicateNumber),
    [group],
  );
  const visibleRows = tableRows.slice(0, TABLE_ROW_LIMIT);

  // En pantallas anchas la tabla va siempre expandida; en las estrechas la abre el usuario.
  const handleTableToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (!wideBody) setTableOpen(event.currentTarget.open);
  };

  return (
    <div className="reaction-explorer__viewer" data-testid="reaction-viewer" data-group={group.key}>
      <div className="reaction-explorer__viewer-head">
        <div>
          <strong>{describeReactionGroup(group)}</strong>
          <small>
            Sesión {group.workSessionId} · Orden {group.orderTestId}
            {group.replicates[0]?.executionId ? ` · Ejecución ${group.replicates[0].executionId}` : ''} · {group.replicates.length} réplica(s) ·{' '}
            {formatReactionTime(group.occurredAt)}
            {group.replicates[0]?.resultAt ? ` · resultado ${formatReactionTime(group.replicates[0].resultAt, { assumeUtc: false })}` : ''}
            {group.replicates[0]?.calculationVersion ? ` · cálculo ${group.replicates[0].calculationVersion}` : ''}
          </small>
          {describeReactionExecution(group.replicates[0]?.execution || null) ? (
            <small data-testid="reaction-execution">{describeReactionExecution(group.replicates[0]?.execution || null)}</small>
          ) : null}
        </div>
        <div className="reaction-explorer__viewer-tools">
          {group.status !== 'evidence_observed' ? (
            <span className="equipment-monitor__bpl-pill" data-tone={bplToneFromStatus(group.status)}>
              {group.diagnosticStatus ? formatBplDiagnosticStatus(group.diagnosticStatus) : BPL_STATUS_LABELS[group.status]}
            </span>
          ) : null}
          {metrics.length > 1 ? (
            <div className="reaction-explorer__metrics" role="group" aria-label="Métrica del eje Y">
              {metrics.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`reaction-explorer__metric ${metric === option ? 'is-active' : ''}`}
                  aria-pressed={metric === option}
                  onClick={() => setRequestedMetric(option)}
                >
                  {REACTION_METRIC_LABELS[option]}
                </button>
              ))}
            </div>
          ) : (
            <span className="reaction-explorer__metric is-active is-static">{REACTION_METRIC_LABELS[metric]}</span>
          )}
        </div>
      </div>

      {summary ? (
        <div className="reaction-explorer__stats" aria-label="Lectura rápida de la reacción">
          <div>
            <span>Δ {REACTION_METRIC_LABELS[metric]}</span>
            <strong>{formatCompactValue(summary.delta)}</strong>
          </div>
          <div>
            <span>Pendiente / ciclo</span>
            <strong>{summary.slope === null ? '—' : formatReactionValue(summary.slope, 5)}</strong>
          </div>
          <div>
            <span>Ciclos</span>
            <strong>
              {summary.cycleMin}–{summary.cycleMax}
            </strong>
          </div>
          <div>
            <span>Rango</span>
            <strong>
              {formatReactionValue(summary.valueMin)} a {formatReactionValue(summary.valueMax)}
            </strong>
          </div>
          {group.replicates.some((replicate) => replicate.finalAbsorbance !== null) ? (
            <div>
              <span>Abs final</span>
              <strong>
                {group.replicates
                  .filter((replicate) => replicate.finalAbsorbance !== null)
                  .map((replicate) => `R${replicate.replicateNumber} ${formatReactionValue(replicate.finalAbsorbance)}`)
                  .join(' · ')}
              </strong>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Gráfica en el tercio izquierdo; puntos crudos (ordenados por ciclo y réplica) en los dos tercios restantes. */}
      <div className="reaction-explorer__body">
        <div className="reaction-explorer__chart-pane">
          <ReactionCurveChart
            group={group}
            metric={metric}
            hiddenReplicates={hiddenReplicates}
            height={chartHeight}
            onToggleReplicate={(replicateNumber) =>
              setHiddenReplicates((current) => {
                const next = new Set(current);
                if (next.has(replicateNumber)) next.delete(replicateNumber);
                else next.add(replicateNumber);
                return next;
              })
            }
          />
        </div>
        <details className="reaction-explorer__table-sheet" open={wideBody || tableOpen} onToggle={handleTableToggle}>
          <summary>
            Ver puntos crudos
            <span>{tableRows.length} filas</span>
          </summary>
          <div className="reaction-explorer__table-pane" data-testid="reaction-table">
            <div className="reaction-explorer__table-head">
              <strong>Puntos crudos</strong>
              <span>
                {tableRows.length} filas
                {tableRows.length > TABLE_ROW_LIMIT ? ` · se muestran ${TABLE_ROW_LIMIT}` : ''}
              </span>
            </div>
            <div className="reaction-explorer__table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Réplica/Ciclo</th>
                    <th>Abs1</th>
                    <th>Abs2</th>
                    <th>Dif</th>
                    <th>Lectura</th>
                    <th>Main</th>
                    <th>Ref</th>
                    <th>Base main</th>
                    <th>Base ref</th>
                    <th>Dark main</th>
                    <th>Dark ref</th>
                    <th title="Absorbancia corregida por línea base: dato técnico, no es el Abs1 graficado">Abs corr. base</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(({ replicate, index, point }) => {
                    const reading = point.readings[0];
                    return (
                      <tr key={`${replicate.id}-${point.cycle}`} className={hiddenReplicates.has(replicate.replicateNumber) ? 'is-hidden' : ''}>
                        <td>
                          <i className="reaction-explorer__key" style={{ background: reactionReplicateColor(index) }} aria-hidden="true" />
                          R{replicate.replicateNumber}:{point.cycle}
                        </td>
                        <td className={metric === 'abs1' ? 'is-active' : ''}>{formatCompactValue(point.abs1)}</td>
                        <td className={metric === 'abs2' ? 'is-active' : ''}>{formatCompactValue(point.abs2)}</td>
                        <td className={metric === 'dif' ? 'is-active' : ''}>{formatCompactValue(point.dif)}</td>
                        <td>{point.readingAt ? formatReactionTime(point.readingAt, { assumeUtc: false, withDate: false }) : '—'}</td>
                        <td>{reading ? formatReactionValue(reading.mainCounts, 0) : '—'}</td>
                        <td>{reading ? formatReactionValue(reading.refCounts, 0) : '—'}</td>
                        <td>{reading ? formatReactionValue(reading.baselineMainLight, 0) : '—'}</td>
                        <td>{reading ? formatReactionValue(reading.baselineRefLight, 0) : '—'}</td>
                        <td>{reading ? formatReactionValue(reading.mainDark, 0) : '—'}</td>
                        <td>{reading ? formatReactionValue(reading.refDark, 0) : '—'}</td>
                        <td>
                          {reading ? formatCompactValue(reading.baselineCorrectedAbsorbance) : '—'}
                          {point.readings.length > 1 ? <span className="reaction-explorer__more">+{point.readings.length - 1}</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

export default function ReactionCurveExplorer({
  reaction,
  filters,
  onFiltersChange,
  selectedKey,
  onSelectKey,
}: {
  reaction: BplReactionCurvesState;
  filters: ReactionExplorerFilters;
  onFiltersChange: (next: ReactionExplorerFilters) => void;
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRow = useMediaQuery(FILTERS_ROW_QUERY);
  const testOptions = useMemo(() => {
    const map = new Map<string, string>();
    reaction.groups.forEach((group) => {
      if (!map.has(group.testKey)) map.set(group.testKey, group.testName);
    });
    return Array.from(map.entries()).sort((left, right) => left[1].localeCompare(right[1], 'es-MX'));
  }, [reaction.groups]);
  const classOptions = useMemo(
    () => Array.from(new Set(reaction.groups.map((group) => group.sampleClass).filter((value): value is string => Boolean(value)))).sort(),
    [reaction.groups],
  );
  const filteredGroups = useMemo(
    () =>
      filterReactionGroups(reaction.groups, {
        testKey: filters.testKey || null,
        sampleClass: filters.sampleClass || null,
        from: filters.from || null,
        to: filters.to || null,
      }),
    [filters, reaction.groups],
  );
  // La selección se deriva: si el filtro la saca de la lista, manda la reacción más reciente.
  const activeGroup = filteredGroups.find((group) => group.key === selectedKey) || filteredGroups[0] || null;
  const replicateCount = filteredGroups.reduce((sum, group) => sum + group.replicates.length, 0);
  const hasFilters = Boolean(filters.testKey || filters.sampleClass || filters.from || filters.to);
  const update = (patch: Partial<ReactionExplorerFilters>) => onFiltersChange({ ...filters, ...patch });
  // ≥960 la fila de filtros va siempre abierta y sin resumen; debajo es una hoja plegable (los selects siguen montados).
  const handleFiltersToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (!filtersRow) setFiltersOpen(event.currentTarget.open);
  };

  return (
    <div className="reaction-explorer" data-testid="reaction-explorer" data-state={reaction.loading ? 'loading' : reaction.groups.length ? 'ready' : 'empty'}>
      <div className="reaction-explorer__toolbar">
        <details className="reaction-explorer__filters-sheet" open={filtersRow || filtersOpen} onToggle={handleFiltersToggle}>
          <summary>
            Filtros
            {hasFilters ? <i aria-hidden="true" title="Hay filtros activos" /> : null}
          </summary>
          <div className="reaction-explorer__filters" role="group" aria-label="Filtros de curvas de reacción">
            <label>
              <span>Desde</span>
              <input type="date" className="input-field" value={filters.from} max={filters.to || undefined} onChange={(event) => update({ from: event.target.value })} />
            </label>
            <label>
              <span>Hasta</span>
              <input type="date" className="input-field" value={filters.to} min={filters.from || undefined} onChange={(event) => update({ to: event.target.value })} />
            </label>
            <label>
              <span>Prueba</span>
              <select className="input-field" value={filters.testKey} onChange={(event) => update({ testKey: event.target.value })}>
                <option value="">Todas</option>
                {testOptions.map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Clase</span>
              <select className="input-field" value={filters.sampleClass} onChange={(event) => update({ sampleClass: event.target.value })}>
                <option value="">Todas</option>
                {classOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            {hasFilters ? (
              <button type="button" className="button-primary chip inactive" onClick={() => onFiltersChange(EMPTY_REACTION_FILTERS)}>
                Limpiar
              </button>
            ) : null}
          </div>
        </details>
        <span className="reaction-explorer__count">
          {filteredGroups.length} reacciones · {replicateCount} réplicas
          {reaction.loadingPoints ? ' · leyendo puntos' : ''}
        </span>
      </div>

      {reaction.error ? (
        <p className="equipment-monitor__bpl-error mon-rail" data-tone="pending" role="status">
          {reaction.error}
        </p>
      ) : null}

      {reaction.loading && !reaction.groups.length ? (
        <div className="equipment-monitor__empty-state">Leyendo curvas de reacción de esta serie…</div>
      ) : !reaction.groups.length ? (
        <div className="equipment-monitor__empty-state">
          Esta serie no tiene curvas de reacción recientes en <code>ba400_bpl_events</code>.
        </div>
      ) : !filteredGroups.length ? (
        <div className="equipment-monitor__empty-state">Ningún registro coincide con los filtros. Ajusta la prueba, la clase o las fechas.</div>
      ) : (
        <>
          {/* Reacciones agrupadas por sesión y orden; cada ficha abre su gráfica. */}
          <div className="reaction-explorer__groups" role="list" aria-label="Reacciones registradas">
            {filteredGroups.slice(0, GROUP_STRIP_LIMIT).map((group) => (
              <button
                key={group.key}
                type="button"
                role="listitem"
                className="reaction-explorer__group"
                data-tone={bplToneFromStatus(group.status)}
                aria-pressed={activeGroup?.key === group.key}
                onClick={() => onSelectKey(group.key)}
              >
                <strong>{group.testName}</strong>
                <span>
                  {group.sampleClass || 'Sin clase'}
                  {group.sampleType ? ` · ${group.sampleType}` : ''} · {group.replicates.length} rép.
                </span>
                <small>
                  {formatReactionTime(group.occurredAt)} · sesión {group.workSessionId} · orden {group.orderTestId}
                </small>
              </button>
            ))}
            {filteredGroups.length > GROUP_STRIP_LIMIT ? (
              <span className="reaction-explorer__more-groups">y {filteredGroups.length - GROUP_STRIP_LIMIT} reacciones más; acota con los filtros.</span>
            ) : null}
          </div>
          {activeGroup ? <ReactionGroupViewer key={activeGroup.key} group={activeGroup} ensureGroupPoints={reaction.ensureGroupPoints} /> : null}
        </>
      )}
    </div>
  );
}
