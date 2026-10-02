import modelInfo from './ba400Model.generated.json';
import { Component, lazy, Suspense, useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { DriEngineResult, DriEquipmentModel, DriHypothesisResult } from '../types/dri.types';
import { BA400_PARTS, BA400_PART_BY_ID, DRI_FINDING_STATUS, resolveBa400Finding } from './ba400Mapping';
import type { Ba400View } from './ba400Scene';
import './ba400.css';

const Ba400Canvas = lazy(() => import('./Ba400Canvas'));
class ViewerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="ba400-loading" role="alert"><strong>No se pudo iniciar el visor</strong><p>El diagnóstico se conserva. Recarga la página para recuperar el módulo gráfico.</p><button type="button" onClick={() => window.location.reload()}>Recargar página</button></div> : this.props.children; }
}
function Glyph({ kind }: { kind: 'cube' | 'locate' | 'isolate' | 'layers' | 'reset' }) {
  const paths = {
    cube: <><path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z" /><path d="m3 8 9 5 9-5M12 13v8M7 5.8l9 5" /></>,
    locate: <><circle cx="12" cy="12" r="6" /><path d="M12 2v5m0 10v5M2 12h5m10 0h5" /></>,
    isolate: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /><rect x="8" y="8" width="8" height="8" rx="1" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" /></>,
    reset: <><path d="M4 10a8 8 0 1 1 1 7M4 3v7h7" /></>,
  };
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

export default function Ba400DiagnosticViewer(props: {
  equipment: DriEquipmentModel; serialNumber: string; analysis: DriEngineResult | null;
  selectedFinding: DriHypothesisResult | null; selectionVersion: number;
  onSelectFinding: (key: string) => void; onEquipmentChange?: (model: DriEquipmentModel) => void;
  fixtureLabel?: string | null;
}) {
  // Reset interaction state with the diagnostic run/equipment, not the downloaded model cache.
  return <ViewerSession key={`${modelInfo.sha256}:${props.equipment}:${props.serialNumber}:${props.analysis?.runId || 'empty'}`} {...props} />;
}
function ViewerSession({ equipment, serialNumber, analysis, selectedFinding, selectionVersion, onSelectFinding, onEquipmentChange, fixtureLabel }: Parameters<typeof Ba400DiagnosticViewer>[0]) {
  const [activated, setActivated] = useState(false);
  const [ready, setReady] = useState(false);
  const [interaction, setInteraction] = useState({ selection: '', partId: null as string | null, explosion: 0, isolated: false, coversHidden: false, reset: false, focus: 0 });
  const [query, setQuery] = useState('');
  const selection = `${selectedFinding?.key || ''}:${selectionVersion}`;
  const association = useMemo(() => resolveBa400Finding(equipment, selectedFinding), [equipment, selectedFinding]);
  const associatedIds = association.associations.map(a => a.partId);
  const isCurrent = interaction.selection === selection;
  const overview = !!fixtureLabel && selectionVersion === 0 && interaction.focus === 0;
  const primaryId = overview ? null : isCurrent ? interaction.partId : associatedIds[0] || null;
  const reset = isCurrent && interaction.reset;
  const explosion = isCurrent ? interaction.explosion : 0;
  const isolated = isCurrent && interaction.isolated;
  const coversHidden = isCurrent ? interaction.coversHidden : !!primaryId;
  const focusedPart = primaryId ? BA400_PART_BY_ID.get(primaryId) : null;
  const partIndex = associatedIds.indexOf(primaryId || '');
  const findings = analysis?.platform === equipment ? analysis.hypotheses : [];
  const reverseFindings = primaryId ? findings.filter(finding => resolveBa400Finding(equipment, finding).associations.some(a => a.partId === primaryId)) : [];
  const currentAssociation = association.associations.find(a => a.partId === primaryId);
  const visibleParts = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return BA400_PARTS.filter(p => !term || `${p.name} ${p.serviceCode} ${p.id}`.toLocaleLowerCase().includes(term));
  }, [query]);
  const update = (patch: Partial<typeof interaction>) => {
    setInteraction(current => ({ selection, partId: primaryId, explosion, isolated, coversHidden, reset, focus: current.focus, ...patch }));
  };
  const markReady = useCallback((value: boolean) => { setReady(value); if (value) setActivated(true); }, []);
  const pick = useCallback((id: string) => {
    setInteraction(current => ({ selection, partId: id, explosion: current.selection === selection ? current.explosion : 0, isolated: false, coversHidden: true, reset: false, focus: current.focus + 1 }));
  }, [selection]);
  // Finding selection requests the model; mere page navigation does not download it.
  const shouldLoad = equipment === 'BA400' && (activated || associatedIds.length > 0);
  const view: Ba400View = {
    associatedIds: reset || overview ? [] : associatedIds, primaryId, confirmed: selectedFinding?.status === 'confirmed',
    discarded: selectedFinding?.status === 'discarded', explosion, isolated, coversHidden,
    focusToken: `${selection}:${primaryId}:${isolated}:${interaction.focus}`,
  };
  const chooseFinding = (key: string) => { onSelectFinding(key); setActivated(true); };
  return <section className="ba400-workspace" aria-label="Localización 3D de hallazgos DRI" id="dri-equipment-3d">
    <header className="ba400-header">
      <div className="ba400-title"><span className="ba400-brand-mark"><Glyph kind="cube" /></span><div><span className="ba400-eyebrow">ORION / DRI · EXPLORACIÓN ESPACIAL</span><h3>Del hallazgo al componente<span>.</span></h3></div></div>
      <div className="ba400-equipment">
        {onEquipmentChange ? <label>Equipo<select aria-label="Equipo del visor DRI" value={equipment} onChange={e => onEquipmentChange(e.target.value as DriEquipmentModel)}><option>BA400</option><option>BA200</option><option>A15</option></select></label> : <strong>{equipment}</strong>}
        <span>{serialNumber || 'Sin número de serie'}</span>
      </div>
    </header>
    {fixtureLabel ? <div className="ba400-fixture-banner">PRUEBA LOCAL · {fixtureLabel} · No se guarda en producción</div> : null}
    <div className="ba400-body">
      <aside className="ba400-findings">
        <div className="ba400-section-head"><span>HALLAZGOS DRI</span><span>{String(findings.length).padStart(2, '0')}</span></div>
        <p className="ba400-instruction">Selecciona un hallazgo para explorar su ubicación.</p>
        <div className="ba400-finding-list">
          {findings.map((finding, index) => {
            const resolved = resolveBa400Finding(equipment, finding);
            return <button type="button" key={finding.key} className={`ba400-finding ${!overview && finding.key === selectedFinding?.key ? 'is-selected' : ''}`} aria-pressed={!overview && finding.key === selectedFinding?.key} onClick={() => chooseFinding(finding.key)}>
              <span className="ba400-finding-number">{String(index + 1).padStart(2, '0')}</span>
              <span className="ba400-finding-copy"><strong>{finding.title}</strong><small className={`ba400-status ba400-status--${finding.status}`}>{DRI_FINDING_STATUS[finding.status]}</small><span>{resolved.associations.length ? `${resolved.associations.length} ${resolved.associations.length === 1 ? 'ubicación asociada' : 'ubicaciones asociadas'}` : 'Sin componente 3D asociado'}</span></span>
              <span className="ba400-selection-mark" aria-hidden="true">{!overview && finding.key === selectedFinding?.key ? '◉' : '↗'}</span>
            </button>;
          })}
          {!findings.length ? <div className="ba400-empty-findings"><Glyph kind="locate" /><strong>Esperando un diagnóstico</strong><p>Genera el análisis del caso. También puedes explorar el equipo sin crear hallazgos.</p></div> : null}
        </div>
        <div className="ba400-integrity"><span aria-hidden="true">◇</span> La localización no confirma una avería.</div>
      </aside>
      <div className="ba400-visual-column">
        <div className="ba400-stage" data-testid="ba400-stage">
          <div className="ba400-stage-hud"><span><i />{equipment} <b>/</b> {ready ? 'MODELO ACTIVO' : 'VISTA ESPACIAL'}</span><span>{equipment === 'BA400' ? `${modelInfo.partCount} COMPONENTES` : 'SIN MODELO ASOCIADO'}</span></div>
          {shouldLoad ? <ViewerBoundary><Suspense fallback={<div className="ba400-loading" role="status">Iniciando visor…</div>}><Ba400Canvas view={view} onPick={pick} onReady={markReady} /></Suspense></ViewerBoundary> : <div className="ba400-idle">
            <span className="ba400-idle-symbol"><Glyph kind="cube" /></span>
            <span className="ba400-eyebrow">{equipment === 'BA400' ? 'ANATOMÍA DEL EQUIPO' : 'MODELO NO DISPONIBLE'}</span>
            <strong>{equipment}</strong>
            <p>{equipment === 'BA400' ? 'Explora cada componente. Conecta la evidencia con su ubicación en el equipo.' : 'Los resultados de DRI se conservan. Este modelo 3D solo corresponde al BA400.'}</p>
            {equipment === 'BA400' ? <button type="button" className="ba400-primary" onClick={() => setActivated(true)}><Glyph kind="cube" /> Explorar equipo 3D</button> : null}
            {equipment === 'BA400' ? <small>Modelo completo · {(modelInfo.bytes / 1048576).toFixed(1)} MiB · Carga bajo demanda</small> : null}
          </div>}
          <div className="ba400-stage-footer"><span>{isolated ? 'COMPONENTE AISLADO' : coversHidden ? 'TAPAS OCULTAS · CONTEXTO VISIBLE' : 'EQUIPO COMPLETO'}</span><span>Girar: arrastrar · Zoom: rueda</span></div>
          {ready && focusedPart ? <div className="ba400-part-tag"><span>⊙ SELECCIONADO {partIndex >= 0 ? `· ${partIndex + 1}/${associatedIds.length}` : '· EXPLORACIÓN'}</span><strong>{focusedPart.name}</strong><code>{focusedPart.serviceCode || 'Sin código de servicio en catálogo'}</code></div> : null}
        </div>
        <div className="ba400-toolbar" aria-label="Controles del visor">
          <button type="button" disabled={!ready || !primaryId} onClick={() => update({ isolated: false, coversHidden: true, reset: false, focus: interaction.focus + 1 })}><Glyph kind="locate" />Ver ubicación en el equipo</button>
          <button type="button" disabled={!ready || !primaryId} aria-pressed={isolated} onClick={() => update({ isolated: !isolated, focus: interaction.focus + 1 })}><Glyph kind="isolate" />{isolated ? 'Salir del aislamiento' : 'Aislar componente'}</button>
          <button type="button" disabled={!ready || isolated} aria-pressed={coversHidden} onClick={() => update({ coversHidden: !coversHidden })}><Glyph kind="layers" />{coversHidden ? 'Mostrar tapas' : 'Ocultar tapas'}</button>
          <button type="button" disabled={!ready} onClick={() => update({ partId: null, explosion: 0, isolated: false, coversHidden: false, reset: true, focus: interaction.focus + 1 })}><Glyph kind="reset" />Restablecer equipo</button>
        </div>
        <div className="ba400-explosion"><label htmlFor="ba400-explosion">Despiece visual <output>{Math.round(explosion * 100)} %</output></label><input id="ba400-explosion" type="range" min="0" max="1" step="0.01" value={explosion} disabled={!ready} onChange={e => update({ explosion: Number(e.target.value) })} /><span>Montado</span><span>Expandido</span><small>La explosión es una ayuda visual, no una secuencia de desmontaje físico.</small></div>
      </div>
      <aside className="ba400-inspector">
        <div className="ba400-section-head"><span>INSPECTOR DE COMPONENTES</span><Glyph kind="locate" /></div>
        {focusedPart ? <>
          <div className="ba400-inspector-title"><span className="ba400-eyebrow">⊙ PIEZA SELECCIONADA</span><h4>{focusedPart.name}</h4><code>{focusedPart.serviceCode || 'Sin código de servicio'}</code></div>
          <dl className="ba400-part-meta"><div><dt>Identificador</dt><dd>{focusedPart.id}</dd></div><div><dt>Conjunto</dt><dd>{focusedPart.collection}</dd></div></dl>
          {associatedIds.length > 1 ? <div className="ba400-part-navigation"><button type="button" aria-label="Componente anterior" onClick={() => pick(associatedIds[(partIndex - 1 + associatedIds.length) % associatedIds.length])}>←</button><span>{partIndex >= 0 ? `${partIndex + 1} de ${associatedIds.length}` : `${associatedIds.length} asociados`}</span><button type="button" aria-label="Componente siguiente" onClick={() => pick(associatedIds[(partIndex + 1) % associatedIds.length])}>→</button></div> : null}
          <div className="ba400-related"><span className="ba400-eyebrow">HALLAZGOS ASOCIADOS</span>{reverseFindings.length ? reverseFindings.map(f => <div key={f.key}><button type="button" onClick={() => chooseFinding(f.key)}>{f.title} ↗</button><span className={`ba400-status ba400-status--${f.status}`}>{DRI_FINDING_STATUS[f.status]}</span><p>{f.explanation}</p></div>) : <p>Sin hallazgos DRI asociados. Seleccionar esta pieza no genera un diagnóstico.</p>}</div>
          {currentAssociation ? <p className="ba400-association-note"><strong>{currentAssociation.basis === 'service_code' ? 'Correspondencia por código' : 'Referencia del conjunto'}</strong>{currentAssociation.scope}</p> : null}
        </> : <div className="ba400-inspector-empty"><Glyph kind="cube" /><strong>{selectedFinding && !associatedIds.length ? 'Sin componente 3D asociado' : reset ? 'Equipo restablecido' : 'Selecciona una pieza'}</strong><p>{selectedFinding && !associatedIds.length ? selectedFinding.explanation : 'Haz clic en el modelo o elige una pieza del catálogo para ver su identificación y evidencia.'}</p></div>}
        {selectedFinding && association.pending.length ? <details className="ba400-pending"><summary>Identificaciones pendientes ({association.pending.length})</summary><p>DRI no entrega un código de servicio inequívoco para: {association.pending.join(', ')}. Las referencias del conjunto no identifican una refacción averiada.</p></details> : null}
        {equipment === 'BA400' ? <details className="ba400-catalog"><summary>Explorar catálogo · {BA400_PARTS.length} piezas</summary><label>Buscar pieza<input type="search" placeholder="Nombre, código o part_id" value={query} onChange={e => setQuery(e.target.value)} /></label><div className="ba400-catalog-results">{visibleParts.map(part => <button type="button" key={part.id} aria-pressed={part.id === primaryId} onClick={() => { setActivated(true); pick(part.id); }}><strong>{part.name}</strong><span>{part.serviceCode || part.id}</span></button>)}{!visibleParts.length ? <p>No hay coincidencias en el catálogo.</p> : null}</div></details> : null}
        <div className="ba400-legend"><span><i className="is-active" />⊙ Seleccionado</span><span><i className="is-suspect" />◇ Sospecha / conjunto asociado</span><span><i className="is-confirmed" />✓ Hallazgo confirmado por DRI</span></div>
      </aside>
    </div>
  </section>;
}
