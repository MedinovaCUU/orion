import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BA400_PART_BY_ID } from '../dri/model3d/ba400Mapping';
import type { Ba400View } from '../dri/model3d/ba400Scene';
import { alarmKey, alarmTone, resolveBa400Alarm } from './ba400AlarmMapping';
import type { MonitoringAlarm } from './ba400AlarmMapping';
import AlarmSpatialConnectors from './AlarmSpatialConnectors';
import '../dri/model3d/ba400.css';
import './ba400AlarmPanel.css';

const Ba400Canvas = lazy(() => import('../dri/model3d/Ba400Canvas'));

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
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
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
  const [explosion, setExplosion] = useState(0);
  const [focus, setFocus] = useState(0);
  const [mode, setMode] = useState<'spatial' | 'events'>('spatial');
  const [page, setPage] = useState(0);
  const alarms = equipment.currentErrors.filter(alarm => alarm.tipo_mensaje?.toLowerCase() !== 'ok');
  const selected = alarms.find(alarm => alarmKey(alarm) === selection.key) || null;
  // Si una alarma desaparece al refrescar, retira su selección y sus marcas, sin conservar un fallo obsoleto.
  const primaryId = selection.key && !selected ? null : selection.partId;
  const selectedLocation = selected ? resolveBa400Alarm(selected) : null;
  const part = primaryId ? BA400_PART_BY_ID.get(primaryId) : null;
  const mapped = alarms.filter(alarm => resolveBa400Alarm(alarm));
  const pageCount = Math.max(1, Math.ceil(alarms.length / 6));
  const effectivePage = Math.min(page, pageCount - 1);
  const visibleAlarms = mode === 'events' ? alarms : alarms.slice(effectivePage * 6, effectivePage * 6 + 6);
  const alarmLabel = (alarm: MonitoringAlarm, index: number) => showCodes && alarm.codigo_error
    ? `E${String(alarm.codigo_error).replace(/^E:?/i, '')}` : `AL-${String(index + 1).padStart(2, '0')}`;
  const markers = new Map<string, NonNullable<Ba400View['alarmMarkers']>[number]>();
  alarms.forEach((alarm, index) => {
    const location = resolveBa400Alarm(alarm);
    if (!location) return;
    const existing = markers.get(location.partId);
    const tone = alarmTone(alarm);
    markers.set(location.partId, {
      partId: location.partId,
      label: existing ? `${existing.label} / ${alarmLabel(alarm, index)}` : alarmLabel(alarm, index),
      tone: existing?.tone === 'fatal' || tone === 'fatal' ? 'fatal' : existing?.tone === 'warning' || tone === 'warning' ? 'warning' : 'unknown',
    });
  });
  const view: Ba400View = {
    associatedIds: [...markers.keys()], primaryId, confirmed: false, discarded: false,
    coversHidden, isolated: !!primaryId && isolated, explosion,
    focusToken: `${primaryId}:${focus}`, alarmMarkers: [...markers.values()], holographic: true, autoRotate: !rotationPaused,
  };

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  const chooseAlarm = (alarm: MonitoringAlarm) => {
    setMode('spatial'); setPage(Math.floor(alarms.indexOf(alarm) / 6));
    setSelection({ key: alarmKey(alarm), partId: resolveBa400Alarm(alarm)?.partId || null });
    setIsolated(false); setFocus(value => value + 1);
  };
  const pickPart = (partId: string) => {
    const alarm = alarms.find(item => resolveBa400Alarm(item)?.partId === partId);
    setSelection({ key: alarm ? alarmKey(alarm) : null, partId });
    setIsolated(false); setFocus(value => value + 1);
  };

  // Panel no modal: el mapa conserva la interacción y el teclado no queda atrapado.
  return <section ref={panelRef} className="alarm-spatial" aria-labelledby="alarm-spatial-title"
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <div className="alarm-spatial__shell">
      <header className="alarm-spatial__header">
        <div><span className="alarm-spatial__eyebrow">ORION / MONITOREO </span>
          <h2 id="alarm-spatial-title">BA400 <span>/ {equipment.serial}</span></h2>
          <p>{equipment.clientName} <span>· {[equipment.city, equipment.normalizedState].filter(Boolean).join(', ') || 'Ubicación no registrada'}</span></p>
        </div>
        <div className="alarm-spatial__header-actions">

          <span className="alarm-spatial__signal" data-recent={equipment.hasSupabaseSignal}>{equipment.hasSupabaseSignal ? 'Señal reciente' : 'Sin señal reciente'}</span>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar vista 3D de alarmas">Cerrar <span aria-hidden="true">×</span></button>
        </div>
      </header>
      {alarms.some(alarm => alarm.descripcion_error?.startsWith('[DEMO]')) ? <p className="alarm-spatial__notice">DEMO · Eventos simulados para validar la visualización. No representan una avería real.</p> : null}

      <nav className="alarm-spatial__tabs" aria-label="Vistas del equipo">
        <button type="button" aria-pressed={mode === 'spatial'} onClick={() => setMode('spatial')}>Vista general</button>
        <button type="button" aria-pressed={mode === 'events'} onClick={() => setMode('events')}>Eventos <span>{alarms.length}</span></button>
        <span>BA400 / REFERENCIAS DE CONJUNTO</span>
      </nav>
      <div className="alarm-spatial__metrics">
        <div><span>ESTADO REPORTADO</span><strong data-tone={equipment.status}>{equipment.status === 'fatal' ? 'FATAL' : equipment.status === 'warning' ? 'WARNING' : 'OK'}</strong></div>
        <div><span>ALARMAS EN ESTE CORTE</span><strong>{String(alarms.length).padStart(2, '0')} <small>/ {mapped.length} con referencia 3D</small></strong></div>
        <div><span>ÚLTIMO EVENTO</span><strong className="alarm-spatial__date">{dateLabel(equipment.lastErrorAt)}</strong></div>
      </div>
      {equipment.errorSource !== 'current' ? <p className="alarm-spatial__notice" role="status">{equipment.errorSource === 'history'
        ? 'Respaldo del historial: estos son los últimos eventos conocidos, no una confirmación de alarmas activas.'
        : 'No hay estado de errores disponible para este equipo.'}</p> : null}
      {!equipment.hasSupabaseSignal ? <p className="alarm-spatial__notice">Sin señal reciente: la información conservada puede no reflejar el estado actual del analizador.</p> : null}

      <div className="alarm-spatial__body">
        <section className="alarm-spatial__visual" aria-label="Modelo holográfico BA400">
          <div className="alarm-spatial__stage" data-mode={mode}>
            <div className="alarm-spatial__hud"><span>BA400 / {ready ? 'HOLOGRAMA ACTIVO' : 'PREPARANDO MODELO'}</span><span>REFERENCIAS DE CONJUNTO</span></div>
            <ModelBoundary><Suspense fallback={<div className="ba400-loading" role="status">Iniciando visualización 3D…</div>}>
              <Ba400Canvas view={view} onPick={pickPart} onReady={setReady} />
            </Suspense></ModelBoundary>
            <AlarmSpatialConnectors signature={`${ready}:${mode}:${effectivePage}:${visibleAlarms.map(alarmKey).join(';')}`} />
            <div className="alarm-spatial__stage-caption"><span>{primaryId ? 'CONJUNTO SELECCIONADO' : 'VISTA GENERAL'} / {coversHidden ? 'INTERIOR VISIBLE' : 'CON CUBIERTAS'}</span><span>Arrastra para girar · Rueda para acercar</span></div>
          <div className="alarm-spatial__controls" aria-label="Controles del holograma">
            <button type="button" disabled={!ready} onClick={() => { setSelection({ key: null, partId: null }); setIsolated(false); setExplosion(0); setFocus(value => value + 1); }}>Restablecer vista</button>
          <button type="button" className="alarm-spatial__rotation-toggle" disabled={!ready}
            aria-label={rotationPaused ? 'Reanudar giro' : 'Pausar giro'} title={rotationPaused ? 'Reanudar giro' : 'Pausar giro'}
            onClick={() => setRotationPaused(value => !value)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              {rotationPaused ? <path d="M4 2.5v11L13 8Z" /> : <><rect x="3" y="3" width="3" height="10" rx="1" /><rect x="10" y="3" width="3" height="10" rx="1" /></>}
            </svg>
          </button>
            <button type="button" disabled={!ready || !primaryId} aria-pressed={isolated} onClick={() => { setIsolated(value => !value); setFocus(value => value + 1); }}>{isolated ? 'Ver contexto' : 'Aislar conjunto'}</button>
            <button type="button" disabled={!ready || isolated} aria-pressed={coversHidden} onClick={() => setCoversHidden(value => !value)}>{coversHidden ? 'Mostrar cubiertas' : 'Ocultar cubiertas'}</button>
            <label>Despiece <input aria-label="Despiece visual del monitor" type="range" min="0" max="1" step="0.01" value={explosion} disabled={!ready} onChange={event => setExplosion(Number(event.target.value))} /><output>{Math.round(explosion * 100)}%</output></label>
          </div>
          <aside className="alarm-spatial__events" aria-label="Alarmas reportadas">
          <div className="alarm-spatial__event-list">
            {visibleAlarms.map((alarm, index) => {
              const location = resolveBa400Alarm(alarm);
              const tone = alarmTone(alarm);
              const globalIndex = mode === 'events' ? index : effectivePage * 6 + index;
              return <button type="button" key={`${alarmKey(alarm)}:${globalIndex}`} className="alarm-spatial__event" data-tone={tone}
                data-part={location?.partId} data-index={globalIndex} data-side={index % 2 ? 'right' : 'left'}
                style={{ gridColumn: index % 2 ? 3 : 1, gridRow: Math.floor(index / 2) + 1 }}
                aria-pressed={selected === alarm} onClick={() => chooseAlarm(alarm)}>
                <svg className="alarm-spatial__card-frame" viewBox="0 0 300 180" preserveAspectRatio="none" aria-hidden="true"><path d="M14 1H286L299 14V166L286 179H14L1 166V14Z"/><path d="M17 6H283L294 17V163L283 174H17L6 163V17Z"/><path d="M22 1H65M299 25V53M1 127V155M235 179H278"/></svg>
                <span className="alarm-spatial__event-top"><b>{location?.label || 'Evento del analizador'}</b><span aria-hidden="true">△</span></span>
                <span className="alarm-spatial__event-content"><AssemblyGlyph partId={location?.partId}/><span>
                  <span className="alarm-spatial__event-severity">{tone === 'unknown' ? 'SIN CLASIFICAR' : tone.toUpperCase()}</span>
                  <strong>{alarm.descripcion_error || 'Descripción no disponible'}</strong>
                </span></span>
                <span className="alarm-spatial__event-section">{location ? 'CONJUNTO' : 'UBICACIÓN'} <span>{location ? alarm.seccion_error || location.label : 'Sin ubicación 3D definida'}</span></span>
                <span className="alarm-spatial__event-code">{alarmLabel(alarm, globalIndex)} <time>{dateLabel(alarm.detected_at || alarm.created_at)}</time></span>
              </button>;
            })}
            {mode === 'spatial' && visibleAlarms.length <= 4 ? <>
              <div className="alarm-spatial__context-card" style={{ gridColumn: 1, gridRow: 3 }}>
                <span>ADQUISICIÓN DE DATOS</span><strong>{equipment.hasSupabaseSignal ? 'SEÑAL RECIENTE' : 'SIN SEÑAL RECIENTE'}</strong>
                <p>Fuente <b>{equipment.errorSource === 'current' ? 'Estado actual' : equipment.errorSource === 'history' ? 'Historial' : 'No disponible'}</b></p>
                <p>Origen <b>Monitor ORION</b></p>
              </div>
              <div className="alarm-spatial__context-card" style={{ gridColumn: 3, gridRow: 3 }}>
                <span>REFERENCIA ESPACIAL</span><strong>{mapped.length} / {alarms.length} LOCALIZADAS</strong>
                <p>Modelo <b>BA400 / DRI</b></p><p>Alcance <b>Conjunto orientativo</b></p>
              </div>
            </> : null}
          </div>
          {!alarms.length ? <div className="alarm-spatial__empty" role="status"><strong>{equipment.errorSource === 'current' && equipment.status === 'ok' ? 'Sin alarmas activas reportadas' : 'Sin detalles de alarma disponibles'}</strong><p>El modelo sigue disponible para exploración.</p></div> : null}
          </aside>
          {mode === 'spatial' && pageCount > 1 ? <div className="alarm-spatial__pagination"><button type="button" disabled={!effectivePage} onClick={() => setPage(effectivePage - 1)}>Anterior</button><span>{effectivePage + 1} / {pageCount}</span><button type="button" disabled={effectivePage + 1 === pageCount} onClick={() => setPage(effectivePage + 1)}>Siguiente</button></div> : null}
          </div>
          <div className="alarm-spatial__inspector" aria-live="polite">
            <span className="alarm-spatial__eyebrow">{selected ? 'ALARMA SELECCIONADA' : part ? 'EXPLORACIÓN DEL MODELO' : 'LECTURA'}</span>
            <h3>{selectedLocation?.label || part?.name || (selected ? 'Sin ubicación 3D definida' : 'Del evento a su ubicación')}</h3>
            <p>{selected?.descripcion_error || (part ? 'Seleccionar una pieza no genera ni confirma una alarma.' : 'Selecciona una tarjeta o un marcador para enfocar el conjunto relacionado con el evento.')}</p>
            {part ? <small>{part.name} · {part.serviceCode || part.id}</small> : null}
            <p className="alarm-spatial__caution">{selected && !selectedLocation ? 'Este código se conserva en la lista, sin asignarle una pieza arbitraria. ' : ''}La ubicación es una referencia del conjunto, no confirma qué pieza está averiada.</p>
          </div>
        </section>

      </div>
      <footer className="alarm-spatial__footer"><span>SOLO LECTURA · No ejecuta maniobras ni modifica el analizador</span><span>Datos consultados: {dateLabel(refreshedAt)}</span></footer>
    </div>
  </section>;
}
