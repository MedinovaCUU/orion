import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { getDriSignalCategoryColor } from '../knowledge/ba400SubsystemHierarchy';
import type { DriContrastRow, DriContrastVerdict } from '../types/dri.types';
import type { DriContrastMatrixProps } from './driWorkbench.types';
import '../dri.dock.css';

/**
 * Matriz de contraste diferencial: un renglón compacto por factor compartido con veredicto, barra de
 * balance a dos lados (fallidas a la izquierda en rojo, correctas a la derecha en cian) y los
 * reactivos que lo comparten. Debajo, las pruebas discriminantes con acciones rápidas.
 */

const VERDICT_META: Record<DriContrastVerdict, { label: string; group: string; tone: 'cyan' | 'warn' | 'muted' | 'graphite' }> = {
  implicates: { label: 'Implica', group: 'Implican', tone: 'cyan' },
  ambiguous: { label: 'Parcial', group: 'Contraste parcial', tone: 'warn' },
  untested: { label: 'Sin contraste', group: 'Sin contraste', tone: 'muted' },
  exonerates: { label: 'Pierde peso', group: 'Pierden peso · sin descartar', tone: 'graphite' },
};

const VERDICT_ORDER: DriContrastVerdict[] = ['implicates', 'ambiguous', 'untested', 'exonerates'];

const clampRatio = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const halfStyle = (coverage: number) => ({ '--value': `${Math.round(clampRatio(coverage) * 100)}%` }) as CSSProperties;

const dotStyle = (category: DriContrastRow['category']) => ({ '--dot': getDriSignalCategoryColor(category) }) as CSSProperties;

const sortRows = (verdict: DriContrastVerdict, rows: DriContrastRow[]) =>
  [...rows].sort((left, right) =>
    verdict === 'exonerates'
      ? right.exonerationStrength - left.exonerationStrength || right.suspicionScore - left.suspicionScore
      : right.suspicionScore - left.suspicionScore,
  );

export default function DriContrastMatrix({
  analysis,
  failedReagentIds,
  correctReagentIds,
  reagentLabel,
  reagentName,
  isReagentVisible,
  onSetReagentState,
  readOnly = false,
  selectedSignalId,
  onSelectSignal,
}: DriContrastMatrixProps) {
  const contrast = analysis?.contrast || null;

  // El motor puede repetir un signalId (p. ej. r2:shared desde dos constructores); se conserva la primera fila.
  const uniqueRows = useMemo(() => {
    const seen = new Set<string>();
    return (contrast?.rows || []).filter((row) => (seen.has(row.signalId) ? false : (seen.add(row.signalId), true)));
  }, [contrast]);

  const groups = useMemo(
    () =>
      VERDICT_ORDER.map((verdict) => ({
        verdict,
        meta: VERDICT_META[verdict],
        rows: sortRows(verdict, uniqueRows.filter((row) => row.verdict === verdict)),
      })).filter((group) => group.rows.length),
    [uniqueRows],
  );

  const labelBySignal = useMemo(() => new Map(uniqueRows.map((row) => [row.signalId, row])), [uniqueRows]);

  const discriminatingTests = useMemo(
    () => (contrast?.discriminatingTests || []).filter((test) => isReagentVisible(test.reagentId)).slice(0, 5),
    [contrast, isReagentVisible],
  );

  const counts = useMemo(() => {
    const result: Record<DriContrastVerdict, number> = { implicates: 0, ambiguous: 0, untested: 0, exonerates: 0 };
    uniqueRows.forEach((row) => { result[row.verdict] += 1; });
    return result;
  }, [uniqueRows]);

  return (
    <div className="dri-dock-section dri-contrast">
      <header className="dri-dock__head">
        <div className="dri-dock__title">
          <span className="dri-panel__eyebrow dri-dock__eyebrow">Diagnóstico diferencial</span>
          <h3>Matriz de contraste</h3>
          {contrast ? (
            <p className="dri-dock__meta">
              {uniqueRows.length} factores compartidos · {failedReagentIds.length} fallidas frente a {correctReagentIds.length} correctas
            </p>
          ) : null}
        </div>
      </header>

      {!contrast ? (
        <div className="dri-dock__empty">
          <span className="dri-dock-reticle" aria-hidden="true"><i /></span>
          <p>Marca fallidas y correctas para contrastar los factores compartidos.</p>
        </div>
      ) : (
        <>
          <div className="dri-contrast__summary" aria-label="Resumen de veredictos">
            <span className="dri-dock-chip dri-dock-chip--cyan"><b>{counts.implicates}</b> implican</span>
            <span className="dri-dock-chip dri-dock-chip--warn"><b>{counts.ambiguous}</b> contraste parcial</span>
            <span className="dri-dock-chip"><b>{counts.exonerates}</b> pierden peso</span>
            <span className="dri-dock-chip dri-dock-chip--muted"><b>{counts.untested}</b> sin contraste</span>
          </div>

          <div className="dri-contrast__axis" aria-hidden="true">
            <span className="dri-contrast__axis--failed"><i />Fallidas · {failedReagentIds.length}</span>
            <span className="dri-contrast__axis--correct">Correctas · {correctReagentIds.length}<i /></span>
          </div>

          {groups.length ? (
            <div className="dri-contrast__groups">
              {groups.map((group) => (
                <section key={group.verdict} className="dri-contrast__group" aria-label={group.meta.group}>
                  <span className="dri-dock-block__label">{group.meta.group} · {group.rows.length}</span>
                  <ol className="dri-contrast__rows">
                    {group.rows.map((row) => {
                      const selected = selectedSignalId === row.signalId;
                      const hasChips = row.failedShared.length > 0 || row.correctShared.length > 0;
                      return (
                        <li
                          key={row.signalId}
                          className={`dri-contrast-row${selected ? ' is-selected' : ''}`}
                          data-verdict={row.verdict}
                          data-signal={row.signalId}
                        >
                          <button
                            type="button"
                            className="dri-contrast-row__toggle"
                            aria-pressed={selected}
                            onClick={() => onSelectSignal(selected ? null : row.signalId)}
                          >
                            <span className="dri-contrast-row__top">
                              <i className="dri-contrast-row__dot" style={dotStyle(row.category)} aria-hidden="true" />
                              <span className="dri-contrast-row__label">{row.label}</span>
                              <span className={`dri-contrast-verdict dri-contrast-verdict--${group.meta.tone}`}>{group.meta.label}</span>
                            </span>
                            <span className="dri-contrast-row__balance">
                              <span className="dri-contrast-row__count dri-contrast-row__count--failed" aria-label={`${row.failedShared.length} de ${row.failedTotal} fallidas`}>
                                {row.failedShared.length}/{row.failedTotal}
                              </span>
                              <span className="dri-contrast-balance" aria-hidden="true">
                                <span className="dri-contrast-balance__left"><i style={halfStyle(row.failedCoverage)} /></span>
                                <span className="dri-contrast-balance__right"><i style={halfStyle(row.correctCoverage)} /></span>
                              </span>
                              <span className="dri-contrast-row__count dri-contrast-row__count--correct" aria-label={`${row.correctShared.length} de ${row.correctTotal} correctas`}>
                                {row.correctShared.length}/{row.correctTotal}
                              </span>
                            </span>
                          </button>

                          {hasChips ? (
                            <div className="dri-contrast-row__chips">
                              {row.failedShared.map((reagentId) => (
                                <span key={`failed-${reagentId}`} className="dri-contrast-chip dri-contrast-chip--failed" title={reagentName(reagentId)}>
                                  {reagentLabel(reagentId)}
                                </span>
                              ))}
                              {row.failedShared.length && row.correctShared.length ? <i className="dri-contrast-row__sep" aria-hidden="true" /> : null}
                              {row.correctShared.map((reagentId) => (
                                <span key={`correct-${reagentId}`} className="dri-contrast-chip dri-contrast-chip--correct" title={reagentName(reagentId)}>
                                  {reagentLabel(reagentId)}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          {selected ? <p className="dri-contrast-row__explanation">{row.explanation}</p> : null}
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ))}
            </div>
          ) : (
            <p className="dri-dock-empty-line">Las pruebas del caso no comparten factores contrastables todavía.</p>
          )}

          {discriminatingTests.length ? (
            <section className="dri-dock-tests" aria-label="Pruebas discriminantes">
              <span className="dri-dock-block__label">Pruebas discriminantes</span>
              <p className="dri-dock-tests__hint">Marcar un resultado vuelve a correr el motor en vivo y recalcula el contraste.</p>
              <ol className="dri-dock-tests__list">
                {discriminatingTests.map((test, index) => {
                  const factors = Array.from(new Set(test.signalIds))
                    .map((signalId) => labelBySignal.get(signalId))
                    .filter((row): row is DriContrastRow => Boolean(row));
                  return (
                    <li key={test.reagentId} className="dri-dock-test">
                      <div className="dri-dock-test__head">
                        <span className="dri-dock-test__code">
                          <span className="dri-dock-test__index">{String(index + 1).padStart(2, '0')}</span>
                          {reagentLabel(test.reagentId)}
                        </span>
                        <span className="dri-dock-test__weight">Peso {Math.round(test.weight)}</span>
                      </div>
                      {factors.length ? (
                        <div className="dri-dock-test__factors" aria-label="Factores que discriminaría">
                          {factors.map((row) => (
                            <span key={row.signalId} className="dri-contrast-chip dri-contrast-chip--factor" style={dotStyle(row.category)}>{row.label}</span>
                          ))}
                        </div>
                      ) : null}
                      <p className="dri-dock-test__reason">{test.reason}</p>
                      {!readOnly ? (
                        <div className="dri-dock-test__actions">
                          <button
                            type="button"
                            className="dri-pill-button dri-pill-button--ok"
                            title={`Marcar ${reagentLabel(test.reagentId)} como correcta`}
                            onClick={() => onSetReagentState(test.reagentId, 'correct')}
                          >
                            Salió correcta
                          </button>
                          <button
                            type="button"
                            className="dri-pill-button dri-pill-button--fail"
                            title={`Marcar ${reagentLabel(test.reagentId)} como fallida`}
                            onClick={() => onSetReagentState(test.reagentId, 'failed')}
                          >
                            Falló
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}

          <p className="dri-contrast__legend">Un factor que también comparten las pruebas correctas no discrimina y se exonera.</p>
        </>
      )}
    </div>
  );
}
