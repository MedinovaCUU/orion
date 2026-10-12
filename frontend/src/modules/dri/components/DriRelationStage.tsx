import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import DriGraph3D from './DriGraph3D';
import type { DriRelationStageProps, DriShellControls } from './driWorkbench.types';
import type { DriContrastVerdict, DriGraphNode, DriRelationSignal } from '../types/dri.types';
import { DRI_REAGENT_STATE_COLORS, getDriSignalCategoryColor } from '../knowledge/ba400SubsystemHierarchy';
import '../dri.stage.css';

/**
 * Escenario del mapa de relaciones DRI: HUD perla sobre el grafo 3D (título, herramientas,
 * sistemas, leyenda, inspector flotante, señales faltantes y pantalla completa). El grafo
 * permanece montado siempre y se pausa cuando no está a la vista o la pestaña está oculta.
 */

type Tone = 'cyan' | 'graphite' | 'amber' | 'risk';

interface ShellControlField {
  field: keyof DriShellControls;
  label: string;
  min: number;
  max: number;
  step: number;
}

const SHELL_CONTROL_FIELDS: ShellControlField[] = [
  { field: 'systemCoreRadius', label: 'Núcleo', min: 0, max: 2, step: 0.01 },
  { field: 'systemStep', label: 'Separación estratos', min: 0, max: 1.4, step: 0.01 },
  { field: 'factorBaseRadius', label: 'Base factores', min: 3, max: 8, step: 0.02 },
  { field: 'factorStep', label: 'Paso factores', min: 0.75, max: 1.6, step: 0.01 },
  { field: 'reagentRadius', label: 'Radio reactivos', min: 5, max: 15, step: 0.02 },
];

const SIGNAL_CATEGORY_LABELS: Record<DriRelationSignal['category'], string> = {
  wavelength: 'Longitud de onda',
  reaction: 'Reacción',
  technique: 'Técnica',
  trend: 'Tendencia',
  scheme: 'Esquema',
  r2: 'Reactivo 2',
  temperature: 'Temperatura',
  storage: 'Almacenamiento',
  water: 'Agua',
  contamination: 'Contaminación',
  blank: 'Blanco',
  dilution: 'Dilución',
  volume: 'Volumen',
  subsystem: 'Subsistema',
  control: 'Control',
  service: 'Servicio',
};

const VERDICT_META: Record<DriContrastVerdict, { label: string; tone: Tone }> = {
  exonerates: { label: 'Menos probable por contraste', tone: 'graphite' },
  implicates: { label: 'Implicado', tone: 'cyan' },
  ambiguous: { label: 'Contraste parcial', tone: 'amber' },
  untested: { label: 'Sin contraste', tone: 'graphite' },
};

const MAX_REAGENT_CHIPS = 6;

const percent = (value: number) => `${Math.round(Math.max(0, Math.min(1, value)) * 100)} %`;

/* ------------------------------------------------------------------ Iconos */

function IconMultiSelect() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="8" height="8" rx="1.6" />
      <rect x="6" y="6" width="8" height="8" rx="1.6" />
    </svg>
  );
}

function IconClear() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6" />
      <path d="M5.6 5.6 10.4 10.4M10.4 5.6 5.6 10.4" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 2.5 14 5.5 8 8.5 2 5.5Z" />
      <path d="M2 8.4 8 11.4 14 8.4" />
      <path d="M2 11.2 8 14.2 14 11.2" />
    </svg>
  );
}

function IconFullscreen({ active }: { active: boolean }) {
  return active ? (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

/* --------------------------------------------------------------- Átomos UI */

function Chip({ tone, dot, children, className }: { tone: Tone; dot?: string; children: ReactNode; className?: string }) {
  return (
    <span className={`dri-stage-chip dri-stage-chip--${tone}${className ? ` ${className}` : ''}`}>
      {dot ? <i className="dri-stage-chip__dot" style={{ background: dot }} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

function ReagentChips({ ids, tone, label, reagentLabel }: { ids: string[]; tone: Tone; label: string; reagentLabel: (id: string) => string }) {
  const visible = ids.slice(0, MAX_REAGENT_CHIPS);
  const rest = ids.length - visible.length;
  return (
    <div className="dri-stage-inspector__group">
      <span className="dri-stage-eyebrow dri-stage-eyebrow--muted">{label}</span>
      {ids.length ? (
        <div className="dri-stage-chip-row">
          {visible.map((id) => (
            <Chip key={id} tone={tone} className="dri-stage-chip--code">
              {reagentLabel(id)}
            </Chip>
          ))}
          {rest > 0 ? (
            <Chip tone="graphite" className="dri-stage-chip--code">
              +{rest}
            </Chip>
          ) : null}
        </div>
      ) : (
        <span className="dri-stage-inspector__none">ninguna</span>
      )}
    </div>
  );
}

function BalanceBar({ failed, correct }: { failed: number; correct: number }) {
  const failedWidth = Math.max(0, Math.min(1, failed)) * 100;
  const correctWidth = Math.max(0, Math.min(1, correct)) * 100;
  return (
    <div className="dri-stage-balance" role="img" aria-label={`Cobertura: ${percent(failed)} de fallidas y ${percent(correct)} de correctas`}>
      <span className="dri-stage-balance__value dri-stage-balance__value--failed">{percent(failed)}</span>
      <div className="dri-stage-balance__track" aria-hidden="true">
        <div className="dri-stage-balance__half dri-stage-balance__half--failed">
          <i style={{ width: `${failedWidth}%` }} />
        </div>
        <div className="dri-stage-balance__half dri-stage-balance__half--correct">
          <i style={{ width: `${correctWidth}%` }} />
        </div>
      </div>
      <span className="dri-stage-balance__value dri-stage-balance__value--correct">{percent(correct)}</span>
    </div>
  );
}

/* ------------------------------------------------------------- Componente */

export default function DriRelationStage({
  nodes,
  edges,
  selectedNodeIds,
  onToggleNode,
  onClearSelection,
  focusedSystemKey,
  onFocusSystem,
  systemPills,
  multiSelect,
  onToggleMultiSelect,
  shellControls,
  onShellControlChange,
  onResetShellControls,
  analysis,
  selectedSignal,
  selectedNode,
  counts,
  liveState,
  caseCode,
  isDemo,
  reagentLabel,
  children,
}: DriRelationStageProps) {
  const rootRef = useRef<HTMLElement>(null);
  const layersRef = useRef<HTMLDivElement>(null);
  const layersId = useId();
  const [visible, setVisible] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const [fullscreenEnabled] = useState(() => typeof document !== 'undefined' && Boolean(document.fullscreenEnabled));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    // Doble comprobación: solo se pausa cuando el observador dice que no intersecta Y la geometría confirma
    // que el escenario está fuera de la ventana (algunos visores emulados reportan una primera lectura falsa).
    const outsideViewport = () => {
      const rect = node.getBoundingClientRect();
      return rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth;
    };
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((entry) => entry.isIntersecting) || !outsideViewport()),
      { threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onChange = () => setDocumentVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(rootRef.current) && document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    if (!layersOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (layersRef.current && !layersRef.current.contains(event.target as Node)) setLayersOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLayersOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [layersOpen]);

  const toggleFullscreen = () => {
    const node = rootRef.current;
    if (!node) return;
    if (document.fullscreenElement === node) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    void node.requestFullscreen().catch(() => undefined);
  };

  const contrastRow = useMemo(
    () => (selectedSignal ? analysis?.contrast?.rows.find((row) => row.signalId === selectedSignal.id) || null : null),
    [analysis?.contrast?.rows, selectedSignal],
  );

  const factorNodeIds = useMemo(() => new Set(nodes.filter((node) => node.type === 'factor').map((node) => node.id)), [nodes]);

  const ambientLinks = useMemo(() => {
    if (!selectedNode || selectedNode.type !== 'ambient_factor') return { signals: 0, total: 0 };
    const id = selectedNode.id;
    let signals = 0;
    let total = 0;
    edges.forEach((edge) => {
      const other = edge.sourceId === id ? edge.targetId : edge.targetId === id ? edge.sourceId : null;
      if (!other) return;
      total += 1;
      if (factorNodeIds.has(other)) signals += 1;
    });
    return { signals, total };
  }, [edges, factorNodeIds, selectedNode]);

  const isEmpty = nodes.length === 0;
  const status =
    liveState === 'empty'
      ? { label: 'en espera', tone: 'graphite' as Tone, pulse: false }
      : liveState === 'live'
        ? { label: 'vivo', tone: 'cyan' as Tone, pulse: true }
        : { label: caseCode ? `guardado · ${caseCode}` : 'guardado', tone: 'cyan' as Tone, pulse: false };

  const rootClassName = [
    'dri-stage',
    isEmpty ? 'dri-stage--empty' : '',
    selectedNode ? 'dri-stage--inspecting' : '',
    isFullscreen ? 'dri-stage--fullscreen' : '',
    layersOpen ? 'dri-stage--layers-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const missingEvidence = analysis?.missingEvidence ?? [];
  const missingText = missingEvidence.join(' · ');

  return (
    <section ref={rootRef} className={rootClassName} data-live={liveState} aria-label="Mapa de relaciones DRI">
      <div className="dri-stage-canvas">
        <DriGraph3D
          nodes={nodes}
          edges={edges}
          selectedNodeIds={selectedNodeIds}
          onToggleNode={onToggleNode}
          focusedSystemKey={focusedSystemKey}
          shellControls={shellControls}
          paused={!visible || !documentVisible}
        />
      </div>

      <div className="dri-stage-frame" aria-hidden="true">
        <span className="dri-stage-frame__corner dri-stage-frame__corner--tl" />
        <span className="dri-stage-frame__corner dri-stage-frame__corner--tr" />
        <span className="dri-stage-frame__corner dri-stage-frame__corner--bl" />
        <span className="dri-stage-frame__corner dri-stage-frame__corner--br" />
      </div>

      {isEmpty ? (
        <div className="dri-stage-empty" role="status">
          <svg className="dri-stage-empty__reticle" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
            <circle cx="100" cy="100" r="92" />
            <circle cx="100" cy="100" r="66" strokeDasharray="3 7" />
            <circle cx="100" cy="100" r="38" />
            <path d="M100 2v14M100 184v14M2 100h14M184 100h14" />
            <path d="M100 54v10M100 136v10M54 100h10M136 100h10" />
            <circle cx="100" cy="100" r="3.2" className="dri-stage-empty__core" />
          </svg>
          <p>Marca pruebas fallidas y correctas en el dock para construir el mapa relacional.</p>
        </div>
      ) : null}

      <div className="dri-stage-hud dri-stage-hud--top">
        <div className="dri-stage-hud__row">
          <div className="dri-stage-title">
            <div className="dri-stage-title__row">
              <span className="dri-stage-eyebrow">Mapa de relaciones DRI</span>
              <span className={`dri-stage-status dri-stage-status--${status.tone}`}>
                {status.pulse ? <i className="dri-stage-status__dot" aria-hidden="true" /> : null}
                {status.label}
              </span>
              {isDemo ? <span className="dri-stage-tag">Demo</span> : null}
            </div>
            <strong className="dri-stage-title__counts">
              <span>{counts.failed} fallidas</span>
              <span>{counts.correct} correctas</span>
              <span>{counts.factors} factores</span>
              <span>{counts.systems} sistemas</span>
            </strong>
          </div>

          <div className="dri-stage-toolbar" role="toolbar" aria-label="Herramientas del mapa">
            <button
              type="button"
              className={`dri-stage-tool${multiSelect ? ' is-active' : ''}`}
              aria-pressed={multiSelect}
              aria-label="Selección múltiple"
              title="Selección múltiple"
              onClick={onToggleMultiSelect}
            >
              <IconMultiSelect />
              <span>Selección múltiple</span>
            </button>
            <button
              type="button"
              className="dri-stage-tool"
              aria-label="Limpiar selección"
              title="Limpiar selección"
              onClick={onClearSelection}
              disabled={!selectedNodeIds.length}
            >
              <IconClear />
              <span>Limpiar selección</span>
            </button>
            <div className="dri-stage-layers" ref={layersRef}>
              <button
                type="button"
                className={`dri-stage-tool${layersOpen ? ' is-active' : ''}`}
                aria-expanded={layersOpen}
                aria-controls={layersId}
                aria-label="Capas"
                title="Capas"
                onClick={() => setLayersOpen((current) => !current)}
              >
                <IconLayers />
                <span>Capas</span>
              </button>
              {layersOpen ? (
                <div id={layersId} className="dri-stage-layers__popover" role="group" aria-label="Capas del grafo">
                  <div className="dri-stage-layers__head">
                    <span className="dri-stage-eyebrow">Capas del grafo</span>
                    <button type="button" className="dri-stage-link" onClick={onResetShellControls}>
                      Restablecer
                    </button>
                  </div>
                  {SHELL_CONTROL_FIELDS.map(({ field, label, min, max, step }) => (
                    <label key={field} className="dri-stage-slider">
                      <span className="dri-stage-slider__name">{label}</span>
                      <strong className="dri-stage-slider__value">{shellControls[field].toFixed(2)}</strong>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={shellControls[field]}
                        aria-label={label}
                        onChange={(event) => onShellControlChange(field, Number(event.currentTarget.value))}
                      />
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
            {fullscreenEnabled ? (
              <button
                type="button"
                className={`dri-stage-tool${isFullscreen ? ' is-active' : ''}`}
                aria-pressed={isFullscreen}
                aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                onClick={toggleFullscreen}
              >
                <IconFullscreen active={isFullscreen} />
                <span>Pantalla completa</span>
              </button>
            ) : null}
          </div>
        </div>

        <div className="dri-stage-systems" role="group" aria-label="Sistemas del equipo">
          <button
            type="button"
            className={`dri-stage-system${focusedSystemKey === null ? ' is-active' : ''}`}
            aria-pressed={focusedSystemKey === null}
            onClick={() => onFocusSystem(null)}
          >
            Todos
          </button>
          {systemPills.map((system) => {
            const active = focusedSystemKey === system.key;
            return (
              <button
                key={system.key}
                type="button"
                className={`dri-stage-system${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => onFocusSystem(active ? null : system.key)}
              >
                {system.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="dri-stage-legend" aria-label="Leyenda del mapa">
        <span>
          <i className="dri-stage-legend__dot" style={{ background: DRI_REAGENT_STATE_COLORS.failed }} aria-hidden="true" />
          fallida
        </span>
        <span>
          <i className="dri-stage-legend__dot" style={{ background: DRI_REAGENT_STATE_COLORS.correct }} aria-hidden="true" />
          correcta
        </span>
        <span>
          <i className="dri-stage-legend__ring dri-stage-legend__ring--factor" aria-hidden="true" />
          factor
        </span>
        <span>
          <i className="dri-stage-legend__ring dri-stage-legend__ring--system" aria-hidden="true" />
          sistema
        </span>
      </div>

      {selectedNode ? (
        <aside className="dri-stage-inspector" aria-label="Inspector del nodo">
          <button type="button" className="dri-stage-inspector__close" aria-label="Cerrar inspector" onClick={onClearSelection}>
            <IconClose />
          </button>
          {selectedNode.type === 'factor' && selectedSignal ? (
            <FactorInspector
              signal={selectedSignal}
              node={selectedNode}
              verdict={contrastRow?.verdict ?? null}
              failedShared={contrastRow?.failedShared ?? selectedSignal.relatedReagentIds}
              correctShared={contrastRow?.correctShared ?? selectedSignal.contrastReagentIds}
              failedCoverage={contrastRow?.failedCoverage ?? selectedSignal.failedCoverage}
              correctCoverage={contrastRow?.correctCoverage ?? selectedSignal.correctCoverage}
              explanation={contrastRow?.explanation ?? null}
              reagentLabel={reagentLabel}
              extraSelected={selectedNodeIds.length - 1}
            />
          ) : selectedNode.type === 'failed_reagent' || selectedNode.type === 'correct_reagent' ? (
            <ReagentInspector node={selectedNode} extraSelected={selectedNodeIds.length - 1} />
          ) : (
            <AmbientInspector node={selectedNode} signals={ambientLinks.signals} total={ambientLinks.total} extraSelected={selectedNodeIds.length - 1} />
          )}
        </aside>
      ) : null}

      {missingEvidence.length ? (
        <div className="dri-stage-ribbon" title={`Señales faltantes: ${missingText}`}>
          <span className="dri-stage-ribbon__label">Señales faltantes</span>
          <span className="dri-stage-ribbon__text">{missingText}</span>
        </div>
      ) : null}

      {children}
    </section>
  );
}

/* ------------------------------------------------------------ Inspectores */

function SelectionNote({ extraSelected }: { extraSelected: number }) {
  if (extraSelected <= 0) return null;
  return (
    <span className="dri-stage-inspector__multi">
      +{extraSelected} {extraSelected === 1 ? 'nodo más seleccionado' : 'nodos más seleccionados'}
    </span>
  );
}

function FactorInspector({
  signal,
  node,
  verdict,
  failedShared,
  correctShared,
  failedCoverage,
  correctCoverage,
  explanation,
  reagentLabel,
  extraSelected,
}: {
  signal: DriRelationSignal;
  node: DriGraphNode;
  verdict: DriContrastVerdict | null;
  failedShared: string[];
  correctShared: string[];
  failedCoverage: number;
  correctCoverage: number;
  explanation: string | null;
  reagentLabel: (id: string) => string;
  extraSelected: number;
}) {
  const verdictMeta = verdict ? VERDICT_META[verdict] : VERDICT_META.untested;
  const exonerated = verdict === 'exonerates';
  const evidenceFor = signal.evidenceFor[0] || null;
  const evidenceAgainst = signal.evidenceAgainst[0] || null;
  return (
    <>
      <div className="dri-stage-inspector__head">
        <Chip tone="graphite" dot={getDriSignalCategoryColor(signal.category)}>
          {SIGNAL_CATEGORY_LABELS[signal.category] || signal.category}
        </Chip>
        <SelectionNote extraSelected={extraSelected} />
      </div>
      <strong className={`dri-stage-inspector__title${exonerated ? ' is-exonerated' : ''}`}>{signal.label || node.label}</strong>
      <div className="dri-stage-chip-row">
        <Chip tone={verdictMeta.tone}>{verdictMeta.label}</Chip>
      </div>
      <ReagentChips ids={failedShared} tone="risk" label="Fallidas que lo comparten" reagentLabel={reagentLabel} />
      <ReagentChips ids={correctShared} tone="cyan" label="Correctas que lo comparten" reagentLabel={reagentLabel} />
      <BalanceBar failed={failedCoverage} correct={correctCoverage} />
      {evidenceFor ? (
        <p className="dri-stage-inspector__line dri-stage-inspector__line--for">
          <span className="dri-stage-inspector__key">A favor</span>
          {evidenceFor}
        </p>
      ) : null}
      {evidenceAgainst ? (
        <p className="dri-stage-inspector__line dri-stage-inspector__line--against">
          <span className="dri-stage-inspector__key">En contra</span>
          {evidenceAgainst}
        </p>
      ) : null}
      {explanation ? <p className="dri-stage-inspector__note">{explanation}</p> : null}
    </>
  );
}

function ReagentInspector({ node, extraSelected }: { node: DriGraphNode; extraSelected: number }) {
  const failed = node.type === 'failed_reagent';
  return (
    <>
      <div className="dri-stage-inspector__head">
        <Chip tone="graphite" dot={failed ? DRI_REAGENT_STATE_COLORS.failed : DRI_REAGENT_STATE_COLORS.correct}>
          Reactivo
        </Chip>
        <SelectionNote extraSelected={extraSelected} />
      </div>
      <strong className="dri-stage-inspector__title">{node.label}</strong>
      {node.subtitle ? <span className="dri-stage-inspector__subtitle">{node.subtitle}</span> : null}
      <div className="dri-stage-chip-row">
        <Chip tone={failed ? 'risk' : 'cyan'}>{failed ? 'Prueba fallida' : 'Prueba correcta'}</Chip>
      </div>
    </>
  );
}

function AmbientInspector({ node, signals, total, extraSelected }: { node: DriGraphNode; signals: number; total: number; extraSelected: number }) {
  const summary =
    signals > 0
      ? `${signals} ${signals === 1 ? 'señal principal apunta' : 'señales principales apuntan'} a este sistema`
      : total > 0
        ? `Sin señales directas · ${total} ${total === 1 ? 'vínculo estructural' : 'vínculos estructurales'}`
        : 'Sin señales directas en este caso';
  return (
    <>
      <div className="dri-stage-inspector__head">
        <Chip tone="graphite" className="dri-stage-chip--system">
          <i className="dri-stage-legend__ring dri-stage-legend__ring--system" aria-hidden="true" />
          Sistema
        </Chip>
        <SelectionNote extraSelected={extraSelected} />
      </div>
      <strong className="dri-stage-inspector__title">{node.label}</strong>
      {node.subtitle ? <span className="dri-stage-inspector__subtitle">{node.subtitle}</span> : null}
      <div className="dri-stage-chip-row">
        <Chip tone={signals > 0 ? 'cyan' : 'graphite'}>{summary}</Chip>
      </div>
    </>
  );
}
