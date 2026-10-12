import { DRI_EQUIPMENT_OPTIONS, type DriEquipmentModel } from '../types/dri.types';
import type { DriLiveState } from './driWorkbench.types';

interface DriCommandStripProps {
  equipmentModel: DriEquipmentModel;
  onEquipmentChange: (model: DriEquipmentModel) => void;
  serial: string;
  onSerialChange: (serial: string) => void;
  canCapture: boolean;
  catalogSource: string;
  visibleReagents: number;
  liveState: DriLiveState;
  hypothesisCount: number;
  caseCode: string | null;
  appliedSources: string[];
  bplEventCount: number | null;
  showDemo: boolean;
  onLoadDemo: () => void;
  onLoadFullDemo: () => void;
  onReset: () => void;
  onGenerate: () => void;
  canGenerate: boolean;
  saving: boolean;
  onSearchSources: () => void;
  sourcesBusy: boolean;
}

/** Franja de mando: identidad del módulo, equipo/serie, estado vivo y acciones principales. */
export default function DriCommandStrip({
  equipmentModel,
  onEquipmentChange,
  serial,
  onSerialChange,
  canCapture,
  catalogSource,
  visibleReagents,
  liveState,
  hypothesisCount,
  caseCode,
  appliedSources,
  bplEventCount,
  showDemo,
  onLoadDemo,
  onLoadFullDemo,
  onReset,
  onGenerate,
  canGenerate,
  saving,
  onSearchSources,
  sourcesBusy,
}: DriCommandStripProps) {
  return (
    <header className="dri-command card" data-live={liveState}>
      <div className="dri-command__identity">
        <span className="dri-hero__eyebrow">DRI · Diagnóstico por Relaciones Inteligentes</span>
        <h2>Inteligencia diagnóstica. Precisión espacial.</h2>
        <div className="dri-command__chips">
          <span className="dri-badge dri-badge--teal">{catalogSource}</span>
          <span className="dri-badge dri-badge--neutral">{visibleReagents} reactivos visibles</span>
          <span className={`dri-badge ${liveState === 'empty' ? 'dri-badge--neutral' : liveState === 'saved' ? 'dri-badge--teal' : 'dri-badge--amber'}`}>
            {liveState === 'empty' ? 'Motor en espera' : liveState === 'saved' ? `Guardado · ${caseCode || 'caso'}` : `Vivo · ${hypothesisCount} hipótesis`}
          </span>
          {appliedSources.map((label) => (
            <span key={label} className="dri-badge dri-badge--teal">{label}</span>
          ))}
          {bplEventCount !== null ? <span className="dri-badge dri-badge--teal">Evidencia BPL · {bplEventCount} eventos</span> : null}
        </div>
      </div>

      <div className="dri-command__case">
        <div className="dri-command__platforms" role="radiogroup" aria-label="Equipo del caso">
          {DRI_EQUIPMENT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={equipmentModel === option.value}
              className={`dri-platform-pill ${equipmentModel === option.value ? 'is-active' : ''}`}
              disabled={!canCapture}
              onClick={() => onEquipmentChange(option.value)}
            >
              <strong>{option.label}</strong>
              <span>{option.supportStatus === 'specializing' ? 'en especialización' : 'listo'}</span>
            </button>
          ))}
        </div>
        <label className="dri-command__serial">
          <span>Serie</span>
          <input className="input-field" value={serial} onChange={(event) => onSerialChange(event.target.value)} placeholder="8340…" disabled={!canCapture} />
          <button type="button" className="dri-pill-button" onClick={onSearchSources} disabled={!serial.trim() || sourcesBusy} title="Busca SAT, BPL y Monitoreo de esta serie">
            {sourcesBusy ? 'Buscando…' : 'Buscar fuentes'}
          </button>
        </label>
      </div>

      <div className="dri-command__actions">
        {showDemo ? (
          <>
            <button type="button" className="dri-pill-button" onClick={onLoadDemo}>Demo BA400</button>
            <button type="button" className="dri-pill-button" onClick={onLoadFullDemo}>Demo total</button>
          </>
        ) : null}
        {canCapture ? <button type="button" className="dri-ghost-button" onClick={onReset}>Reiniciar</button> : null}
        {canCapture ? (
          <button type="button" className="button-primary dri-command__generate" disabled={!canGenerate || saving} onClick={onGenerate}>
            {saving ? 'Generando diagnóstico...' : 'Generar diagnóstico diferencial'}
          </button>
        ) : null}
      </div>
    </header>
  );
}
