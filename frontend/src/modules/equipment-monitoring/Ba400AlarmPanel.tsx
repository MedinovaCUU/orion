import AlarmAntecedents from './AlarmAntecedents';
import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BA400_PART_BY_ID } from '../dri/model3d/ba400Mapping';
import type { Ba400View } from '../dri/model3d/ba400Scene';
import { ba400AlarmAntecedents, alarmKey, alarmTone, resolveBa400Alarm, classifyBa400Alarm, ba400AlarmLocationLabel } from './ba400AlarmMapping';
import type { MonitoringAlarm } from './ba400AlarmMapping';
import AlarmSpatialConnectors from './AlarmSpatialConnectors';
import '../dri/model3d/ba400.css';
import './ba400AlarmPanel.css';

const Ba400Canvas = lazy(() => import('../dri/model3d/Ba400Canvas'));
// Formateador a nivel de módulo: no se reconstruye por tarjeta ni por render.
const DATE_FORMAT = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
const PAGE_SIZE = 6;

export interface AlarmPanelEquipment {
  id: string;
  serial: string;
  clientName: string;
  status: 'fatal' | 'warning' | 'ok';
  city: string | null;
  normalizedState: string | null;
  hasSupabaseSignal: boolean;
  lastErrorAt: string | null;
  currentErrors: MonitoringAlarm[];
  recentErrors?: MonitoringAlarm[];
  alarmHistory?: MonitoringAlarm[];
  errorSource: 'current' | 'history' | 'none';
}

class ModelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="ba400-loading" role="alert">
      <strong>Vista 3D no disponible</strong><p>Las alarmas siguen disponibles en las tarjetas.</p>
      <button type="button" onClick={() => this.setState({ failed: false })}>Reintentar visor</button>
    </div> : this.props.children;
  }
}

function dateLabel(value: string | null | undefined) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Sin fecha reportada';
  return DATE_FORMAT.format(new Date(value));
}

// Símbolos esquemáticos, no fotografías ni confirmaciones de piezas averiadas.
function AssemblyGlyph({ partId }: { partId?: string }) {
  const rotor = /rotor|frio|cuba/.test(partId || '');
  const cover = /tapa/.test(partId || '');
  return <svg className="alarm-spatial__glyph" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
    {!partId ? <><path d="M15 7h25l9 10v40H15Z M40 7v11h9 M23 25h18M23 32h18M23 39h10"/><circle cx="37" cy="47" r="2"/></> : rotor ? <><ellipse cx="32" cy="24" rx="23" ry="14"/><ellipse cx="32" cy="24" rx="15" ry="9"/><ellipse cx="32" cy="43" rx="23" ry="14"/><path d="M9 24v19m46-19v19M17 34v19m30-19v19M32 38v19M9 24l46 19M55 24L9 43"/><ellipse cx="32" cy="24" rx="5" ry="3"/></>
      : cover ? <><path d="m8 24 23-15 25 13-23 16Z M8 24v24l25 9 23-15V22M33 38v19 M13 23l18-10 19 10-17 10Z"/><path d="m15 39 12 5m13-2 10-6"/></>
      : <><path d="M20 8h24v12H20zM26 20h12v25H26zM18 45h28v9H18zM30 54v7m4-7v7M12 14h8m24 0h8M32 8V3"/><circle cx="32" cy="14" r="3"/><path d="M30 24v17m4-17v17M12 28h9m22 0h9M10 35h11m22 0h11"/></>}
  </svg>;
}

/** Pantalla de solo lectura. Reutiliza el GLB, la caché y el motor 3D de DRI sin generar diagnósticos. */
export default function Ba400AlarmPanel({ equipment, refreshedAt, showCodes, onClose }: {
  equipment: AlarmPanelEquipment;
  refreshedAt: string | null;
  showCodes: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [ready, setReady] = useState(false);
  const [rotationPaused, setRotationPaused] = useState(false);
  const [selection, setSelection] = useState<{ key: string | null; partId: string | null }>({ key: null, partId: null });
  const [coversHidden, setCoversHidden] = useState(false);
  const [isolated, setIsolated] = useState(false);
  // `explosionInput` sigue al deslizador en el mismo evento; `explosion` llega al motor como máximo una vez por frame.
  const [explosionInput, setExplosionInput] = useState(0);
  const [explosion, setExplosion] = useState(0);
  const [focus, setFocus] = useState(0);
  const [mode, setMode] = useState<'spatial' | 'events'>('spatial');
  const [page, setPage] = useState(0);
  const explosionFrame = useRef(0);
  const pendingExplosion = useRef(0);
  // Derivados memorizados: el corte del monitor conserva identidad cuando nada cambia, así el visor 3D no rehace la vista.
  const alarms = useMemo(() => equipment.currentErrors.filter(alarm => alarm.tipo_mensaje?.toLowerCase() !== 'ok'), [equipment.currentErrors]);
  const alarmHistory = useMemo(() => [...(equipment.alarmHistory || equipment.recentErrors || []), ...equipment.currentErrors], [equipment.alarmHistory, equipment.recentErrors, equipment.currentErrors]);
  const selected = alarms.find(alarm => alarmKey(alarm) === selection.key) || null;
  // Si una alarma desaparece al refrescar, retira su selección y sus marcas, sin conservar un fallo obsoleto.
  const primaryId = selection.key && !selected ? null : selection.partId;
  const selectedLocation = selected ? resolveBa400Alarm(selected) : null;
  const part = primaryId ? BA400_PART_BY_ID.get(primaryId) : null;
  const mapped = alarms.filter(alarm => resolveBa400Alarm(alarm));
  const pageCount = Math.max(1, Math.ceil(alarms.length / PAGE_SIZE));
  const effectivePage = Math.min(page, pageCount - 1);
  const visibleAlarms = mode === 'events' ? alarms : alarms.slice(effectivePage * PAGE_SIZE, effectivePage * PAGE_SIZE + PAGE_SIZE);
  const isDemo = alarms.some(alarm => alarm.descripcion_error?.startsWith('[DEMO]'));
  const location = [equipment.city, equipment.normalizedState].filter(Boolean).join(', ') || 'Ubicación no registrada';
  const alarmLabel = useCallback((alarm: MonitoringAlarm, index: number) => showCodes && alarm.codigo_error
    ? `E${String(alarm.codigo_error).replace(/^E:?/i, '')}` : `AL-${String(index + 1).padStart(2, '0')}`, [showCodes]);
  const markers = useMemo(() => {
    const map = new Map<string, NonNullable<Ba400View['alarmMarkers']>[number]>();
    alarms.forEach((alarm, index) => {
      for (const [sourceIndex, source] of [alarm, ...ba400AlarmAntecedents(alarm, alarmHistory)].entries()) {
        const location = resolveBa400Alarm(source);
        if (!location) continue;
        for (const partId of location.partIds) {
          const existing = map.get(partId);
          const tone = alarmTone(source);
          const label = sourceIndex ? `${alarmLabel(alarm, index)} · Antecedente` : alarmLabel(alarm, index);
          map.set(partId, {
            partId,
            label: existing ? `${existing.label} / ${label}` : label,
            tone: existing?.tone === 'fatal' || tone === 'fatal' ? 'fatal' : existing?.tone === 'warning' || tone === 'warning' ? 'warning' : 'unknown',
          });
        }
      }
    });
    return map;
  }, [alarmHistory, alarmLabel, alarms]);
  const isolatedView = !!primaryId && isolated;
  // En modo Eventos el holograma queda inerte: sin auto-giro no hay frames sucios ni render. Nunca se apaga por inactividad.
  const view = useMemo<Ba400View>(() => ({
    associatedIds: [...markers.keys()], primaryId, confirmed: false, discarded: false,
    coversHidden, isolated: isolatedView, explosion,
    focusToken: `${primaryId}:${focus}`, alarmMarkers: [...markers.values()], holographic: true,
    autoRotate: !rotationPaused && mode === 'spatial',
  }), [coversHidden, explosion, focus, isolatedView, markers, mode, primaryId, rotationPaused]);

  // Solo se desplaza si el explorador quedó fuera de la zona visible; el foco va al cierre sin mover la página.
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    if (panel) {
      const rect = panel.getBoundingClientRect();
      if (rect.top < 0 || rect.top > window.innerHeight * 0.6) panel.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  // Escape se escucha en el documento: cierra aunque el foco esté fuera del panel, pero cede ante la pantalla completa nativa.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.fullscreenElement) return;
      // Otra capa abierta (diálogo SAT, menús, cuadros de búsqueda con texto) se queda con su Escape.
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      if (target instanceof HTMLInputElement && /^(text|search|url|tel|email|password|number)$/.test(target.type) && target.value) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => () => { if (explosionFrame.current) cancelAnimationFrame(explosionFrame.current); }, []);

  const changeExplosion = useCallback((value: number) => {
    setExplosionInput(value);
    pendingExplosion.current = value;
    if (explosionFrame.current) return;
    explosionFrame.current = requestAnimationFrame(() => { explosionFrame.current = 0; setExplosion(pendingExplosion.current); });
  }, []);
  const resetView = useCallback(() => {
    if (explosionFrame.current) { cancelAnimationFrame(explosionFrame.current); explosionFrame.current = 0; }
    setSelection({ key: null, partId: null }); setIsolated(false);
    setExplosionInput(0); setExplosion(0); setFocus(value => value + 1);
  }, []);
  const chooseAlarm = useCallback((alarm: MonitoringAlarm) => {
    setMode('spatial'); setPage(Math.floor(alarms.indexOf(alarm) / PAGE_SIZE));
    setSelection({ key: alarmKey(alarm), partId: resolveBa400Alarm(alarm)?.partId || null });
    setIsolated(false); setFocus(value => value + 1);
  }, [alarms]);
  const pickPart = useCallback((partId: string) => {
    const alarm = alarms.find(item => resolveBa400Alarm(item)?.partIds.includes(partId))
      || alarms.find(item => ba400AlarmAntecedents(item, alarmHistory).some(row => resolveBa400Alarm(row)?.partIds.includes(partId)));
    setSelection({ key: alarm ? alarmKey(alarm) : null, partId });
    setIsolated(false); setFocus(value => value + 1);
  }, [alarmHistory, alarms]);

  // Panel no modal en sitio: el escenario conserva la interacción y el teclado no queda atrapado.
  return <section ref={panelRef} className="alarm-spatial" aria-labelledby="alarm-spatial-title">
    <header className="alarm-spatial__header">
      <div className="alarm-spatial__title">
        <span className="alarm-spatial__eyebrow">ORION / MONITOREO</span>
        <h2 id="alarm-spatial-title">BA400 <span>/ {equipment.serial}</span></h2>
        <p>{equipment.clientName} <span>· {location}</span></p>
      </div>
      <div className="alarm-spatial__header-actions">
        <span className="alarm-spatial__signal mon-chip" data-recent={equipment.hasSupabaseSignal} data-tone={equipment.hasSupabaseSignal ? 'ok' : 'muted'}>
          {equipment.hasSupabaseSignal ? 'Señal reciente' : 'Sin señal reciente'}
        </span>
        <button ref={closeRef} type="button" className="alarm-spatial__close" onClick={onClose} aria-label="Cerrar vista 3D de alarmas">Cerrar <span aria-hidden="true">×</span></button>
      </div>
    </header>

    {isDemo ? <p className="alarm-spatial__notice mon-rail" data-tone="warning">DEMO · Eventos simulados para validar la visualización. No representan una avería real.</p> : null}
    {equipment.errorSource !== 'current' ? <p className="alarm-spatial__notice mon-rail" data-tone="warning" role="status">{equipment.errorSource === 'history'
      ? 'Respaldo del historial: estos son los últimos eventos conocidos, no una confirmación de alarmas activas.'
      : 'No hay estado de errores disponible para este equipo.'}</p> : null}
    {!equipment.hasSupabaseSignal ? <p className="alarm-spatial__notice mon-rail" data-tone="warning">Sin señal reciente: la información conservada puede no reflejar el estado actual del analizador.</p> : null}

    <div className="alarm-spatial__toolbar">
      <nav className="alarm-spatial__tabs" aria-label="Vistas del equipo">
        <button type="button" aria-pressed={mode === 'spatial'} onClick={() => setMode('spatial')}>Vista general</button>
        <button type="button" aria-pressed={mode === 'events'} onClick={() => setMode('events')}>Eventos <span data-tone={equipment.status}>{alarms.length}</span></button>
      </nav>
      <div className="alarm-spatial__controls" role="group" aria-label="Controles del holograma">
        <button type="button" disabled={!ready} onClick={resetView}>Restablecer vista</button>
        <button type="button" className="alarm-spatial__rotation-toggle" disabled={!ready}
          aria-label={rotationPaused ? 'Reanudar giro' : 'Pausar giro'} title={rotationPaused ? 'Reanudar giro' : 'Pausar giro'}
          aria-pressed={rotationPaused} onClick={() => setRotationPaused(value => !value)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            {rotationPaused ? <path d="M4 2.5v11L13 8Z" /> : <><rect x="3" y="3" width="3" height="10" rx="1" /><rect x="10" y="3" width="3" height="10" rx="1" /></>}
          </svg>
        </button>
        <button type="button" disabled={!ready || !primaryId} aria-pressed={isolated} onClick={() => { setIsolated(value => !value); setFocus(value => value + 1); }}>{isolated ? 'Ver contexto' : 'Aislar conjunto'}</button>
        <button type="button" disabled={!ready || isolated} aria-pressed={coversHidden} onClick={() => setCoversHidden(value => !value)}>{coversHidden ? 'Mostrar cubiertas' : 'Ocultar cubiertas'}</button>
        <label className="alarm-spatial__explosion"><span className="alarm-spatial__explosion-label">Despiece</span>
          <input aria-label="Despiece visual del monitor" type="range" min="0" max="1" step="0.01" value={explosionInput} disabled={!ready} onChange={event => changeExplosion(Number(event.target.value))} />
          <output>{Math.round(explosionInput * 100)}%</output>
        </label>
      </div>
      {mode === 'spatial' && pageCount > 1 ? <div className="alarm-spatial__pagination">
        <button type="button" disabled={!effectivePage} onClick={() => setPage(effectivePage - 1)}>Anterior</button>
        <span>{effectivePage + 1} / {pageCount}</span>
        <button type="button" disabled={effectivePage + 1 === pageCount} onClick={() => setPage(effectivePage + 1)}>Siguiente</button>
      </div> : null}
    </div>

    <div className="alarm-spatial__stage" data-mode={mode}>
      <div className="alarm-spatial__viewport mon-brackets">
        <span className="alarm-spatial__floor" aria-hidden="true" />
        <div className="alarm-spatial__hud"><span>BA400 / {ready ? 'HOLOGRAMA ACTIVO' : 'PREPARANDO MODELO'}</span><span>REFERENCIAS DE CONJUNTO</span></div>
        <ModelBoundary><Suspense fallback={<div className="ba400-loading" role="status">Iniciando visualización 3D…</div>}>
          <Ba400Canvas view={view} onPick={pickPart} onReady={setReady} />
        </Suspense></ModelBoundary>
        <div className="alarm-spatial__stage-caption"><span>{primaryId ? 'CONJUNTO SELECCIONADO' : 'VISTA GENERAL'} / {coversHidden ? 'INTERIOR VISIBLE' : 'CON CUBIERTAS'}</span><span>Arrastra para girar · Rueda para acercar</span></div>
        {!alarms.length ? <div className="alarm-spatial__empty mon-reticle" role="status">
          <strong>{equipment.errorSource === 'current' && equipment.status === 'ok' ? 'Sin alarmas activas reportadas' : 'Sin detalles de alarma disponibles'}</strong>
          <p>El modelo sigue disponible para exploración.</p>
        </div> : null}
        <span className="mon-brackets__i" aria-hidden="true" />
      </div>
      <AlarmSpatialConnectors signature={`${ready}:${mode}:${effectivePage}:${visibleAlarms.map(alarmKey).join(';')}`} />
      <aside className="alarm-spatial__events" aria-label="Alarmas reportadas">
        {visibleAlarms.map((alarm, index) => {
          const location = resolveBa400Alarm(alarm);
          const tone = alarmTone(alarm);
          const globalIndex = mode === 'events' ? index : effectivePage * PAGE_SIZE + index;
          return <button type="button" key={`${alarmKey(alarm)}:${globalIndex}`} className="alarm-spatial__event" data-tone={tone}
            data-part={location?.partId} data-parts={location?.partIds.join(' ')} data-index={globalIndex}
            data-slot={mode === 'spatial' ? index : undefined} data-side={index % 2 ? 'right' : 'left'}
            aria-pressed={selected === alarm} onClick={() => chooseAlarm(alarm)}>
            <svg className="alarm-spatial__card-frame" viewBox="0 0 300 180" preserveAspectRatio="none" aria-hidden="true"><path d="M14 1H286L299 14V166L286 179H14L1 166V14Z"/><path d="M17 6H283L294 17V163L283 174H17L6 163V17Z"/><path d="M22 1H65M299 25V53M1 127V155M235 179H278"/></svg>
            <span className="alarm-spatial__event-top"><b>{location?.label || classifyBa400Alarm(alarm)?.target || 'Evento del analizador'}</b><span aria-hidden="true">△</span></span>
            <span className="alarm-spatial__event-content"><AssemblyGlyph partId={location?.partId}/><span>
              <span className="alarm-spatial__event-severity">{tone === 'unknown' ? 'SIN CLASIFICAR' : tone.toUpperCase()}</span>
              <strong>{alarm.descripcion_error || 'Descripción no disponible'}</strong>
            </span></span>
            <span className="alarm-spatial__event-section">{location ? 'CONJUNTO' : 'UBICACIÓN'} <span>{ba400AlarmLocationLabel(alarm)}</span></span>
            <AlarmAntecedents alarm={alarm} history={alarmHistory} compact />
            <span className="alarm-spatial__event-code">{alarmLabel(alarm, globalIndex)} <time>{dateLabel(alarm.detected_at || alarm.created_at)}</time></span>
          </button>;
        })}
        {mode === 'spatial' && visibleAlarms.length <= 4 ? <>
          <div className="alarm-spatial__context-card" data-slot="4">
            <span className="alarm-spatial__context-eyebrow">Adquisición de datos</span>
            <strong>{equipment.hasSupabaseSignal ? 'Señal reciente' : 'Sin señal reciente'}</strong>
            <p>Fuente <b>{equipment.errorSource === 'current' ? 'Estado actual' : equipment.errorSource === 'history' ? 'Historial' : 'No disponible'}</b></p>
            <p>Origen <b>Monitor ORION</b></p>
          </div>
          <div className="alarm-spatial__context-card" data-slot="5">
            <span className="alarm-spatial__context-eyebrow">Referencia espacial</span>
            <strong>{mapped.length} / {alarms.length} localizadas</strong>
            <p>Modelo <b>BA400 / DRI</b></p><p>Alcance <b>Conjunto orientativo</b></p>
          </div>
        </> : null}
      </aside>
    </div>

    <div className="alarm-spatial__metrics">
      <div className="mon-readout"><span>Estado reportado</span><strong data-tone={equipment.status}>{equipment.status === 'fatal' ? 'FATAL' : equipment.status === 'warning' ? 'WARNING' : 'OK'}</strong></div>
      <div className="mon-readout"><span>Alarmas en este corte</span><strong>{String(alarms.length).padStart(2, '0')} <small>/ {mapped.length} con referencia 3D</small></strong></div>
      <div className="mon-readout"><span>Último evento</span><strong className="alarm-spatial__date">{dateLabel(equipment.lastErrorAt)}</strong></div>
    </div>

    <div className="alarm-spatial__inspector" aria-live="polite">
      <span className="alarm-spatial__eyebrow">{selected ? 'ALARMA SELECCIONADA' : part ? 'EXPLORACIÓN DEL MODELO' : 'LECTURA'}</span>
      <h3>{selectedLocation?.label || part?.name || (selected ? ba400AlarmLocationLabel(selected) : 'Del evento a su ubicación')}</h3>
      <p>{selected?.descripcion_error || (part ? 'Seleccionar una pieza no genera ni confirma una alarma.' : 'Selecciona una tarjeta o un marcador para enfocar el conjunto relacionado con el evento.')}</p>
      {selected ? <AlarmAntecedents alarm={selected} history={alarmHistory} /> : null}
      {part ? <small>{part.name} · {part.serviceCode || part.id}</small> : null}
      <p className="alarm-spatial__caution">{selected ? `${classifyBa400Alarm(selected)?.note || 'Código sin correspondencia catalogada.'} ` : ''}La ubicación es una referencia del conjunto, no confirma qué pieza está averiada.</p>
    </div>

    <footer className="alarm-spatial__footer"><span>Solo lectura · No ejecuta maniobras ni modifica el analizador</span><span>Datos consultados: {dateLabel(refreshedAt)}</span></footer>
  </section>;
}
