import { useId, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import DriChecklist from './DriChecklist';
import { CONTRAST_AGAINST_PREFIX } from '../engine/contrastAnalysis';
import { DRI_SUBSYSTEM_LABELS } from '../knowledge/mechanicalSubsystems';
import { DRI_FINDING_STATUS } from '../model3d/ba400Mapping';
import type { DriHypothesisResult, DriSeverity } from '../types/dri.types';
import type { DriHypothesisDockProps } from './driWorkbench.types';
import '../dri.dock.css';

/**
 * Ranking vivo de hipótesis: una tarjeta por hipótesis (ya ordenadas por el motor) con medidor de
 * probabilidad, confianza, severidad, subsistema, delta frente a la lectura anterior y detalle
 * expandible. Debajo, la siguiente prueba discriminante y las señales faltantes del caso.
 */

const SEVERITY_META: Record<DriSeverity, { label: string; tone: 'risk' | 'warn' | 'graphite' }> = {
  critical: { label: 'Crítica', tone: 'risk' },
  high: { label: 'Alta', tone: 'warn' },
  medium: { label: 'Media', tone: 'graphite' },
  low: { label: 'Baja', tone: 'graphite' },
};

const NON_MECHANICAL_LABELS: Record<string, string> = {
  operational: 'Operativo',
  preanalytical: 'Preanalítico',
  software: 'Software',
  unknown: 'Sin asignar',
};

const CONTRAST_PREFIX = CONTRAST_AGAINST_PREFIX;

const subsystemLabel = (subsystem: DriHypothesisResult['suspectedSubsystem']): string =>
  (DRI_SUBSYSTEM_LABELS as Record<string, string>)[subsystem] || NON_MECHANICAL_LABELS[subsystem] || NON_MECHANICAL_LABELS.unknown;

/** El chip muestra el nombre corto; la aclaración entre paréntesis queda en el title. */
const shortSubsystemLabel = (label: string) => label.split(' (')[0].trim();

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));

const meterStyle = (value: number) => ({ '--value': `${clampScore(value)}%` }) as CSSProperties;

const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-');

const pad = (index: number) => String(index + 1).padStart(2, '0');

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 6 8 10.5 12.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function DriHypothesisDock({
  analysis,
  previousAnalysis,
  selectedHypothesisKey,
  onSelectHypothesis,
  onLocateInExplorer,
  explorerAvailable,
  liveState,
  caseCode,
  saving,
  canSave,
  isDemo,
  onSave,
  reagentLabel,
  isReagentVisible,
  onSetReagentState,
  readOnly = false,
}: DriHypothesisDockProps) {
  const baseId = useId();
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});

  const previousByKey = useMemo(
    () => new Map((previousAnalysis?.hypotheses || []).map((hypothesis) => [hypothesis.key, hypothesis.probabilityScore])),
    [previousAnalysis],
  );

  const discriminatingTests = useMemo(
    () => (analysis?.contrast?.discriminatingTests || []).filter((test) => isReagentVisible(test.reagentId)).slice(0, 5),
    [analysis, isReagentVisible],
  );

  const toggleOpen = (key: string) => setOpenKeys((current) => ({ ...current, [key]: !current[key] }));
  const selectHypothesis = (key: string) => {
    onSelectHypothesis(key);
    setOpenKeys((current) => (current[key] ? current : { ...current, [key]: true }));
  };

  const saved = liveState === 'saved';
  const eyebrow = saved ? (caseCode ? `Diagnóstico guardado · ${caseCode}` : 'Diagnóstico guardado') : 'Lectura viva del caso';
  const hypotheses = analysis?.hypotheses || [];

  return (
    <div className="dri-dock-section dri-dock">
      <header className="dri-dock__head">
        <div className="dri-dock__title">
          <span className="dri-panel__eyebrow dri-dock__eyebrow">
            <i className={`dri-dock__pulse${saved ? ' dri-dock__pulse--saved' : ''}`} aria-hidden="true" />
            {eyebrow}
          </span>
          <h3>Ranking diagnóstico</h3>
          {analysis ? (
            <p className="dri-dock__meta">
              {hypotheses.length} hipótesis · {analysis.platform}
              {previousAnalysis && previousAnalysis.runId !== analysis.runId ? ' · deltas frente a la lectura anterior' : ''}
            </p>
          ) : null}
        </div>
        {!readOnly ? (
          <button type="button" className="button-primary dri-dock__save" disabled={!canSave || saving} onClick={onSave}>
            {saving ? 'Guardando…' : 'Guardar diagnóstico'}
          </button>
        ) : null}
      </header>

      {isDemo ? <p className="dri-dock__notice">Demostración local: el diagnóstico no se guarda en producción.</p> : null}

      {!analysis ? (
        <div className="dri-dock__empty">
          <span className="dri-dock-reticle" aria-hidden="true"><i /></span>
          <p>Marca al menos una prueba fallida para ver hipótesis en vivo.</p>
        </div>
      ) : (
        <>
          <ol className="dri-dock__list" aria-label="Hipótesis ordenadas por probabilidad">
            {hypotheses.map((hypothesis, index) => {
              const selected = selectedHypothesisKey === hypothesis.key;
              const open = Boolean(openKeys[hypothesis.key]);
              const probability = clampScore(hypothesis.probabilityScore);
              const confidence = clampScore(hypothesis.confidenceScore);
              const previous = previousByKey.get(hypothesis.key);
              const delta = previous === undefined ? 0 : Math.round(hypothesis.probabilityScore - previous);
              const severity = SEVERITY_META[hypothesis.severity] || SEVERITY_META.low;
              const contrastAgainst = hypothesis.evidenceAgainst.some((line) => line.startsWith(CONTRAST_PREFIX));
              const bodyId = `${baseId}-${safeId(hypothesis.key)}`;

              return (
                <li
                  key={hypothesis.key}
                  className={`dri-dock-card${selected ? ' is-selected' : ''}${open ? ' is-open' : ''}`}
                  data-severity={hypothesis.severity}
                  data-hypothesis={hypothesis.key}
                >
                  <div className="dri-dock-card__head">
                    <button type="button" className="dri-dock-card__select" aria-current={selected ? 'true' : undefined} onClick={() => selectHypothesis(hypothesis.key)}>
                      <span className="dri-dock-card__rank">{pad(index)}</span>
                      <span className="dri-dock-card__title">
                        <strong>{hypothesis.title}</strong>
                        <span className="dri-dock-card__status">{DRI_FINDING_STATUS[hypothesis.status]}</span>
                      </span>
                      <span className="dri-dock-card__score">
                        <b>{probability}</b>
                        <small>prob.</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="dri-dock-card__toggle"
                      aria-expanded={open}
                      aria-controls={bodyId}
                      aria-label={`${open ? 'Ocultar' : 'Ver'} detalle de ${hypothesis.title}`}
                      onClick={() => toggleOpen(hypothesis.key)}
                    >
                      <Chevron />
                    </button>
                  </div>

                  <div className={`dri-dock-meter${hypothesis.severity === 'critical' ? ' dri-dock-meter--risk' : ''}`}>
                    <div
                      className="dri-dock-meter__track"
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={probability}
                      aria-label={`Probabilidad ${probability} de 100`}
                    >
                      <span className="dri-dock-meter__fill" style={meterStyle(probability)} />
                    </div>
                    <div className="dri-dock-meter__row">
                      <span className="dri-dock-meter__label">Probabilidad {hypothesis.probabilityLabel.toLowerCase()}</span>
                      <span className="dri-dock-conf" title="Confianza del motor en la lectura">
                        <span>Confianza</span>
                        <span className="dri-dock-conf__track" aria-hidden="true"><i style={meterStyle(confidence)} /></span>
                        <b>{confidence}</b>
                      </span>
                    </div>
                  </div>

                  <div className="dri-dock-card__chips">
                    <span className={`dri-dock-chip dri-dock-chip--${severity.tone}`}>{severity.label}</span>
                    <span className="dri-dock-chip dri-dock-chip--soft" title={subsystemLabel(hypothesis.suspectedSubsystem)}>
                      {shortSubsystemLabel(subsystemLabel(hypothesis.suspectedSubsystem))}
                    </span>
                    {delta ? (
                      <span
                        className={`dri-dock-delta dri-dock-delta--${delta > 0 ? 'up' : 'down'}`}
                        title="Cambio de probabilidad frente a la lectura anterior"
                      >
                        {delta > 0 ? '▲ +' : '▼ −'}{Math.abs(delta)}
                      </span>
                    ) : null}
                    {contrastAgainst ? <span className="dri-dock-chip dri-dock-chip--muted">Menos probable por contraste</span> : null}
                  </div>

                  {open ? (
                    <div id={bodyId} className="dri-dock-card__body">
                      {hypothesis.explanation ? <p className="dri-dock-card__lead">{hypothesis.explanation}</p> : null}

                      <div className="dri-dock-block">
                        <span className="dri-dock-block__label">A favor</span>
                        {hypothesis.evidenceFor.length ? (
                          <ul className="dri-dock-list">
                            {hypothesis.evidenceFor.map((line, lineIndex) => <li key={`${lineIndex}-${line}`}>{line}</li>)}
                          </ul>
                        ) : (
                          <p className="dri-dock-empty-line">Sin evidencia a favor registrada.</p>
                        )}
                      </div>

                      <div className="dri-dock-block">
                        <span className="dri-dock-block__label">En contra</span>
                        {hypothesis.evidenceAgainst.length ? (
                          <ul className="dri-dock-list dri-dock-list--against">
                            {hypothesis.evidenceAgainst.map((line, lineIndex) => (
                              <li key={`${lineIndex}-${line}`} data-contrast={line.startsWith(CONTRAST_PREFIX) ? 'true' : undefined}>{line}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="dri-dock-empty-line">Sin evidencia en contra.</p>
                        )}
                      </div>

                      <div className="dri-dock-next">
                        <span>Siguiente prueba</span>
                        <strong>{hypothesis.recommendedNextTest || 'Sin prueba sugerida.'}</strong>
                      </div>

                      {hypothesis.warningText ? <div className="dri-dock-warning" role="note">{hypothesis.warningText}</div> : null}

                      {hypothesis.missingEvidence.length ? (
                        <div className="dri-dock-block">
                          <span className="dri-dock-block__label">Falta evidencia</span>
                          <div className="dri-dock-missing__chips">
                            {hypothesis.missingEvidence.map((item) => <span key={item} className="dri-dock-chip dri-dock-chip--missing">{item}</span>)}
                          </div>
                        </div>
                      ) : null}

                      {hypothesis.checklist.length ? (
                        <div className="dri-dock-block">
                          <span className="dri-dock-block__label">Lista de verificación</span>
                          <DriChecklist steps={hypothesis.checklist} />
                        </div>
                      ) : null}

                      {explorerAvailable ? (
                        <div className="dri-dock-card__actions">
                          <button type="button" className="dri-pill-button dri-pill-button--locate" onClick={() => onLocateInExplorer(hypothesis)}>
                            Localizar en el equipo 3D
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>

          {discriminatingTests.length ? (
            <section className="dri-dock-tests" aria-labelledby={`${baseId}-tests`}>
              <span id={`${baseId}-tests`} className="dri-dock-block__label">Siguiente prueba discriminante</span>
              <p className="dri-dock-tests__hint">Marcar un resultado vuelve a correr el motor en vivo y reordena el ranking.</p>
              <ol className="dri-dock-tests__list">
                {discriminatingTests.map((test, index) => (
                  <li key={test.reagentId} className="dri-dock-test">
                    <div className="dri-dock-test__head">
                      <span className="dri-dock-test__code">
                        <span className="dri-dock-test__index">{pad(index)}</span>
                        {reagentLabel(test.reagentId)}
                      </span>
                      <span className="dri-dock-test__weight">Peso {Math.round(test.weight)}</span>
                    </div>
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
                ))}
              </ol>
            </section>
          ) : null}

          {analysis.missingEvidence.length ? (
            <section className="dri-dock-block" aria-labelledby={`${baseId}-missing`}>
              <span id={`${baseId}-missing`} className="dri-dock-block__label">Señales faltantes</span>
              <div className="dri-dock-missing__chips">
                {analysis.missingEvidence.map((item) => <span key={item} className="dri-dock-chip dri-dock-chip--missing">{item}</span>)}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
