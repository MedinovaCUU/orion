import { memo, useCallback, useRef, useState } from 'react';
import AppLinkButton from './AppLinkButton';
import ReactionCurveExplorer from './ReactionCurveExplorer';
import { ReactionSparkline } from './ReactionCurveChart';
import { EMPTY_REACTION_FILTERS, type BplReactionGroup, type ReactionExplorerFilters } from './bplReactionCurves';
import type { BplReactionCurvesState } from './useBplReactionCurves';
import './monitor.tokens.css';
import './bplStatus.css';
import {
  BPL_STAGES,
  BPL_STAGE_LABELS,
  BPL_STAGE_SHORT_LABELS,
  BPL_STATUS_LABELS,
  BPL_TONE_LABELS,
  bplToneFromStatus,
  formatBplDiagnosticStatus,
  formatBplEventTypeLabel,
  summarizeBplEventMetrics,
  type BplEvent,
  type BplSerialSummary,
  type BplStage,
  type BplStatus,
  type BplTestSnapshot,
  type BplTone,
} from './bplEvents';

const TEST_PAGE_SIZE = 12;
const TIMELINE_SIZE = 12;

const STATUS_RANK: Record<BplStatus, number> = { rejected: 4, pending: 3, evidence_observed: 2, accepted: 1 };

// Formateadores a nivel de módulo: la sección se vuelve a dibujar con cada corte y no debe construirlos por tarjeta.
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
const RELATIVE_FORMAT = new Intl.RelativeTimeFormat('es-MX', { numeric: 'auto' });
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Sin dato';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Sin dato';
  return DATE_TIME_FORMAT.format(parsed);
};

const formatRelativeTime = (value?: string | null) => {
  if (!value) return 'Sin dato';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Sin dato';
  const diffMs = parsed.getTime() - Date.now();
  if (Math.abs(diffMs) < HOUR_MS) return RELATIVE_FORMAT.format(Math.round(diffMs / MINUTE_MS), 'minute');
  if (Math.abs(diffMs) < DAY_MS) return RELATIVE_FORMAT.format(Math.round(diffMs / HOUR_MS), 'hour');
  return RELATIVE_FORMAT.format(Math.round(diffMs / DAY_MS), 'day');
};

/** Evento que explica el estado vigente de la prueba: la etapa más grave y su última evaluación. */
const resolveHeadlineEvent = (test: BplTestSnapshot): { stage: BplStage; event: BplEvent } | null => {
  let best: { stage: BplStage; event: BplEvent; rank: number } | null = null;
  BPL_STAGES.forEach((stage) => {
    const state = test.stages[stage];
    const event = state?.latestEvaluated || state?.latest;
    if (!state || !event || !state.effectiveStatus) return;
    const rank = STATUS_RANK[state.effectiveStatus];
    if (!best || rank > best.rank || (rank === best.rank && (event.timestamp || '') > (best.event.timestamp || ''))) {
      best = { stage, event, rank };
    }
  });
  return best;
};

const stageTone = (summary: BplSerialSummary, stage: BplStage): BplTone => {
  const overview = summary.stages[stage];
  if (overview.testsRejected) return 'rejected';
  if (overview.testsPending) return 'pending';
  if (overview.testsAccepted) return 'accepted';
  if (overview.lastEvent) return 'observed';
  return 'none';
};

const stageHeadline = (summary: BplSerialSummary, stage: BplStage) => {
  const overview = summary.stages[stage];
  if (!overview.lastEvent) return 'Sin evidencia';
  if (overview.testsRejected) return `${overview.testsRejected} con rechazo`;
  if (overview.testsPending) return `${overview.testsPending} pendientes`;
  if (overview.testsAccepted) return `${overview.testsAccepted} aceptadas`;
  return 'Solo evidencia observada';
};

interface BplStatusSectionProps {
  serial: string;
  overview: BplSerialSummary | null;
  detail: BplSerialSummary | null;
  loading: boolean;
  error: string | null;
  /** Curvas de reacción de la serie (índice + puntos perezosos); nunca vienen de monitoreo_errores_equipos. */
  reaction: BplReactionCurvesState;
}

/**
 * Estado BPL analítico de una serie: cabecera con píldora y salto a DRI, barra de etapas,
 * matriz por prueba, explorador de curvas y cronología. Memoizada: con props estables un
 * corte del monitor no vuelve a dibujar la sección.
 */
const BplStatusSection = memo(function BplStatusSection({ serial, overview, detail, loading, error, reaction }: BplStatusSectionProps) {
  const [showAllTests, setShowAllTests] = useState(false);
  const [reactionFilters, setReactionFilters] = useState<ReactionExplorerFilters>(EMPTY_REACTION_FILTERS);
  const [reactionSelectedKey, setReactionSelectedKey] = useState<string | null>(null);
  const explorerRef = useRef<HTMLDivElement | null>(null);
  const hasReactionCurves = reaction.groups.length > 0 || reaction.loading;

  /** Abre la reacción de una tarjeta en el visor, acotando los filtros a esa prueba. Estable para las miniaturas memoizadas. */
  const openReactionGroup = useCallback((group: BplReactionGroup) => {
    setReactionFilters({ ...EMPTY_REACTION_FILTERS, testKey: group.testKey });
    setReactionSelectedKey(group.key);
    explorerRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);
  // El detalle trae payload (resultados, curvas, lotes de reactivo); el corte global solo estados.
  const summary = detail || overview;
  const tone: BplTone = summary?.tone || 'none';
  const visibleTests = summary ? (showAllTests ? summary.tests : summary.tests.slice(0, TEST_PAGE_SIZE)) : [];
  const hiddenTests = summary ? Math.max(summary.tests.length - visibleTests.length, 0) : 0;
  const driTarget = `/dashboard?tab=dri&serial=${encodeURIComponent(serial)}&bpl=apply`;

  return (
    <div className="equipment-monitor__focus-section equipment-monitor__focus-section--bpl" data-testid="bpl-section" data-tone={tone}>
      <div className="equipment-monitor__section-head">
        <div className="equipment-monitor__bpl-head">
          <h4>Estado BPL analítico</h4>
          <span className="equipment-monitor__bpl-pill" data-tone={tone}>{BPL_TONE_LABELS[tone]}</span>
        </div>
        <AppLinkButton
          to={driTarget}
          className="button-primary chip"
          title="Abre DRI con blancos, calibraciones y controles de esta serie ya cargados como evidencia"
        >
          Diagnosticar en DRI
        </AppLinkButton>
      </div>

      {!summary ? (
        <div className="equipment-monitor__empty-state">
          {loading
            ? 'Leyendo blancos, calibraciones y controles de esta serie…'
            : error || <>Esta serie todavía no reporta evidencia BPL en <code>ba400_bpl_events</code>.</>}
        </div>
      ) : (
        <>
          {/* Lecturas de la serie: cada una en su propio span para que solo se parta en los separadores. */}
          <p className="equipment-monitor__focus-location equipment-monitor__bpl-meta">
            <span>{summary.events.length} eventos</span> · <span>{summary.tests.length} pruebas</span> · <span>último evento {formatDateTime(summary.lastEventAt)}</span> ·{' '}
            <span>captura del monitor {formatRelativeTime(summary.lastDetectedAt || summary.lastEventAt)}</span>
            {reaction.groups.length ? (
              <>
                {' '}· <span>{reaction.groups.length} curvas de reacción</span>
              </>
            ) : null}
            {loading && !detail ? (
              <>
                {' '}· <span>cargando detalle</span>
              </>
            ) : null}
          </p>
          {error ? (
            <p className="equipment-monitor__bpl-error mon-rail" data-tone="pending" role="status">
              {error}
            </p>
          ) : null}

          {/* Barra segmentada por etapa BPL: cuántas pruebas quedaron aceptadas, rechazadas o pendientes. */}
          <div className="equipment-monitor__bpl-stages" role="list" aria-label="Etapas BPL">
            {BPL_STAGES.map((stage) => {
              const stageOverview = summary.stages[stage];
              const stageToneValue = stageTone(summary, stage);
              return (
                <article key={stage} role="listitem" className="equipment-monitor__bpl-stage" data-tone={stageToneValue}>
                  <span className="equipment-monitor__bpl-stage-label">{BPL_STAGE_LABELS[stage]}</span>
                  <strong>{stageHeadline(summary, stage)}</strong>
                  <div className="equipment-monitor__bpl-stage-counts" aria-label={`Pruebas por estado en ${BPL_STAGE_LABELS[stage]}`}>
                    <span data-tone="accepted" data-empty={stageOverview.testsAccepted ? undefined : ''}>{stageOverview.testsAccepted} ok</span>
                    <span data-tone="rejected" data-empty={stageOverview.testsRejected ? undefined : ''}>{stageOverview.testsRejected} rech.</span>
                    <span data-tone="pending" data-empty={stageOverview.testsPending ? undefined : ''}>{stageOverview.testsPending} pend.</span>
                  </div>
                  <small>{stageOverview.lastEvent ? formatRelativeTime(stageOverview.lastEvent.timestamp) : 'Sin eventos en la ventana'}</small>
                </article>
              );
            })}
          </div>

          {summary.missingData.length ? (
            <p className="equipment-monitor__focus-location equipment-monitor__bpl-pending" data-tone="pending">
              Falta para cerrar aceptación: {summary.missingData.slice(0, 6).join(', ')}
              {summary.missingData.length > 6 ? ` y ${summary.missingData.length - 6} más` : ''}.
            </p>
          ) : null}

          {/* Matriz por prueba: etapas con su estado vigente, métricas del payload y lotes en uso. */}
          <div className="equipment-monitor__bpl-tests">
            {visibleTests.map((test) => {
              const headline = resolveHeadlineEvent(test);
              const latestCurve = reaction.latestByTest.get(test.testKey) || null;
              const metrics = headline ? summarizeBplEventMetrics(headline.event).slice(0, 4) : [];
              const lots = [
                test.calibratorName || test.calibratorLot ? `Calibrador ${[test.calibratorName, test.calibratorLot].filter(Boolean).join(' · ')}` : null,
                test.controlName || test.controlLot ? `Control ${[test.controlName, test.controlLot].filter(Boolean).join(' · ')}` : null,
                test.reagentBarcodes.length ? `Reactivo ${test.reagentBarcodes.slice(0, 2).join(' / ')}` : null,
              ].filter(Boolean);
              return (
                <article key={test.testKey} className="equipment-monitor__bpl-test" data-tone={bplToneFromStatus(test.effectiveStatus)}>
                  <div className="equipment-monitor__event-head">
                    <strong>{test.testName}</strong>
                    <span>{formatRelativeTime(test.lastEventAt)}</span>
                  </div>
                  <div className="equipment-monitor__bpl-dots">
                    {BPL_STAGES.filter((stage) => test.stages[stage]).map((stage) => {
                      const state = test.stages[stage]!;
                      const status = state.effectiveStatus || 'evidence_observed';
                      return (
                        <span
                          key={stage}
                          className="equipment-monitor__bpl-dot"
                          data-tone={bplToneFromStatus(status)}
                          title={`${BPL_STAGE_LABELS[stage]}: ${BPL_STATUS_LABELS[status]}${state.hasUnevaluatedNewer ? ' · hay evidencia nueva sin evaluar' : ''}`}
                        >
                          {BPL_STAGE_SHORT_LABELS[stage]}
                          {state.hasUnevaluatedNewer ? <i aria-hidden="true" /> : null}
                        </span>
                      );
                    })}
                    {test.chainAccepted ? <span className="equipment-monitor__bpl-chain">Cadena aceptada</span> : null}
                  </div>
                  <p>
                    {headline
                      ? `${BPL_STAGE_LABELS[headline.stage]} · ${headline.event.diagnosticStatus ? formatBplDiagnosticStatus(headline.event.diagnosticStatus) : BPL_STATUS_LABELS[headline.event.status]}`
                      : 'Sin evaluación registrada'}
                    {metrics.length ? ` · ${metrics.join(' · ')}` : ''}
                  </p>
                  {lots.length ? <small>{lots.join(' · ')}</small> : null}
                  {test.missingData.length ? <small className="equipment-monitor__bpl-missing">Falta: {test.missingData.slice(0, 4).join(', ')}</small> : null}
                  {test.ruleIds.length ? <small>Reglas {test.ruleIds.slice(0, 4).join(', ')}</small> : null}
                  {latestCurve ? <ReactionSparkline group={latestCurve} onOpenGroup={openReactionGroup} /> : null}
                </article>
              );
            })}
          </div>
          {hiddenTests > 0 || showAllTests ? (
            <button type="button" className="button-primary chip inactive" onClick={() => setShowAllTests((current) => !current)}>
              {showAllTests ? 'Mostrar menos pruebas' : `Mostrar ${hiddenTests} pruebas más`}
            </button>
          ) : null}

          {/* Curvas de reacción: cinética por réplica de la última reacción o de cualquiera filtrada. */}
          {hasReactionCurves ? (
            <div className="reaction-explorer__shell" ref={explorerRef} data-testid="reaction-shell">
              <div className="equipment-monitor__section-head">
                <div className="equipment-monitor__bpl-head">
                  <h4>Curvas de reacción</h4>
                </div>
              </div>
              <ReactionCurveExplorer
                reaction={reaction}
                filters={reactionFilters}
                onFiltersChange={setReactionFilters}
                selectedKey={reactionSelectedKey}
                onSelectKey={setReactionSelectedKey}
              />
            </div>
          ) : null}

          {/* Cronología compacta: útil para ver el orden blanco → calibración → control de la sesión. */}
          <details className="equipment-monitor__bpl-timeline">
            <summary>Últimos {Math.min(TIMELINE_SIZE, summary.events.length)} eventos</summary>
            <ul>
              {summary.events.slice(0, TIMELINE_SIZE).map((event) => (
                <li key={event.key} data-tone={bplToneFromStatus(event.status)}>
                  <span className="equipment-monitor__bpl-dot" data-tone={bplToneFromStatus(event.status)}>
                    {event.stage ? BPL_STAGE_SHORT_LABELS[event.stage] : '·'}
                  </span>
                  <div>
                    <strong>
                      {event.testName || 'Instrumento'} · {formatBplEventTypeLabel(event.eventType)}
                    </strong>
                    <small>
                      {formatBplDiagnosticStatus(event.diagnosticStatus) !== 'Sin diagnóstico'
                        ? formatBplDiagnosticStatus(event.diagnosticStatus)
                        : BPL_STATUS_LABELS[event.status]}
                      {event.lotNumber ? ` · lote ${event.lotNumber}` : ''}
                      {summarizeBplEventMetrics(event).length ? ` · ${summarizeBplEventMetrics(event).slice(0, 2).join(' · ')}` : ''}
                    </small>
                  </div>
                  <time dateTime={event.timestamp || undefined}>{formatDateTime(event.timestamp)}</time>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
});

export default BplStatusSection;
