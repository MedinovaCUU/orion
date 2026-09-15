import { TRACKING_CARRIER_META, TRACKING_STATUS_LABELS, formatTrackingDate, formatTrackingDateTime, type TrackingEntry } from './orionTracking';
import './TrackingMission.css';
import { TrackingAssignment } from './TrackingAssignment';

interface Props {
  entries: TrackingEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (value: string) => void;
}

export function TrackingMission({ entries, selectedId, onSelect, search, onSearch }: Props) {
  const selected = entries.find(entry => entry.id === selectedId) || entries[0];
  const visible = entries.filter(entry => [entry.trackingNumber, entry.destination, entry.recipient, entry.orderReference, entry.carrier, TRACKING_STATUS_LABELS[entry.status]].join(' ').toLowerCase().includes(search.toLowerCase().trim()));
  const events = [...(selected?.timeline || [])].sort((a, b) => (Date.parse(b.timestamp || '') || 0) - (Date.parse(a.timestamp || '') || 0));
  const stage = !selected ? 0 : selected.status === 'entregado' ? 3 : selected.status === 'en_reparto' ? 2 : selected.status === 'en_transito' ? 1 : 0;
  return (
    <div className="mission">
      <div className="mission-stack">
        <label className="mission-search"><span>LOCALIZAR ENVÍO</span><input type="search" placeholder="Guía, destino, estado o destinatario" value={search} onChange={event => onSearch(event.target.value)} /></label>
        <span className="mission-count">{visible.length} de {entries.length} envíos · {entries.filter(entry => entry.fulfillmentState !== 'entregado').length} pendientes{search && <button type="button" onClick={() => onSearch('')}>Limpiar búsqueda</button>}</span>
        <div className="mission-stack-scroll" role="group" aria-label="Seleccionar envío">
          {visible.map((entry, index) => (
            <button key={entry.id} type="button" data-status={entry.status} className={`mission-card ${selected?.id === entry.id ? 'is-selected' : ''}`} aria-pressed={selected?.id === entry.id} aria-label={`${entry.trackingNumber}, ${TRACKING_STATUS_LABELS[entry.status]}`} onClick={() => onSelect(entry.id)}>
              <span className="mission-card-top"><span>{entry.carrier ? TRACKING_CARRIER_META[entry.carrier].label : 'Sin mensajería'} <span className="mission-card-serial">/ {String(index + 1).padStart(2, '0')}</span></span><span className="mission-card-signal">{TRACKING_STATUS_LABELS[entry.status]}</span></span>
              <strong>{entry.trackingNumber}<span className="mission-card-open" aria-hidden="true">↗</span></strong>
              <span className="mission-card-content" aria-hidden={selected?.id !== entry.id}>
                <span className="mission-card-itinerary"><span><small>DESDE</small><b>{entry.origin || 'Origen por confirmar'}</b></span><span aria-hidden="true">→</span><span><small>HACIA</small><b>{entry.destination || 'Destino por confirmar'}</b></span></span>
                <span className="mission-card-recipient"><small>DESTINATARIO / REFERENCIA</small><b>{entry.recipient || 'Destinatario por confirmar'}</b><span>{entry.orderReference || 'Sin referencia de pedido'}</span></span>
                <span className="mission-card-bottom"><span><small>{entry.status === 'entregado' ? 'ÚLTIMO MOVIMIENTO' : 'LLEGADA ESTIMADA'}</small><b>{entry.status === 'entregado' ? entry.lastEventAt ? formatTrackingDateTime(entry.lastEventAt) : 'Entrega confirmada' : entry.estimatedDelivery ? formatTrackingDate(entry.estimatedDelivery) : 'Por confirmar'}</b></span><span className="mission-card-seal" aria-hidden="true">{entry.status === 'entregado' ? '✓' : entry.status === 'incidencia' ? '!' : '↗'}</span></span>
                <span className="mission-card-caption">{entry.lookupError ? 'No se pudo actualizar · revisa el detalle' : entry.lastEventLabel || entry.portalStatusText || 'Esperando información de la mensajería'}</span>
              </span>
            </button>
          ))}
          {!visible.length && <p className="mission-no-results">{entries.length ? 'No hay coincidencias. Prueba con otra guía o destino.' : 'Agrega tu primera guía para iniciar el seguimiento.'}</p>}
        </div>
      </div>
      {selected && <section className="mission-detail" data-status={selected.status} key={selected.id} aria-label={`Progreso de ${selected.trackingNumber}`}>
        <div className="mission-detail-heading"><span>EXPEDIENTE DE ENVÍO</span><span>{selected.carrier ? TRACKING_CARRIER_META[selected.carrier].label : 'Sin mensajería'}</span></div>
        <h4>{selected.trackingNumber}</h4>
        {selected.carrier === 'dhl' && <TrackingAssignment key={selected.id} guide={selected.trackingNumber} />}
        <p className={`mission-status mission-state--${selected.status}`}>{selected.portalStatusText || TRACKING_STATUS_LABELS[selected.status]}</p>
        {selected.lookupError && <p className="mission-warning">No se pudo actualizar: {selected.lookupError}. Se conserva la última información disponible.</p>}
        <div className="mission-route"><div><small>ORIGEN</small><strong>{selected.origin || 'Por confirmar'}</strong></div><span aria-hidden="true">→</span><div><small>DESTINO</small><strong>{selected.destination || 'Por confirmar'}</strong></div></div>
        <ol className="mission-progress" aria-label="Etapas del envío">{['Registrado', 'En tránsito', 'Última milla', 'Entregado'].map((label, index) => <li key={label} className={index <= stage ? 'is-reached' : ''}><span>{String(index + 1).padStart(2, '0')}</span>{label}</li>)}</ol>
        {selected.status === 'incidencia' && <p className="mission-warning">Incidencia: revisa el último movimiento antes de estimar la llegada.</p>}
        <div className="mission-facts"><div><small>{selected.status === 'entregado' ? 'ÚLTIMO EVENTO' : 'LLEGADA ESTIMADA'}</small><strong>{selected.status === 'entregado' ? (selected.lastEventAt ? formatTrackingDateTime(selected.lastEventAt) : 'Entrega confirmada') : selected.estimatedDelivery ? formatTrackingDate(selected.estimatedDelivery) : 'Sin fecha confirmada'}</strong></div><div><small>ÚLTIMA CONSULTA</small><strong>{selected.lastLookupAt ? formatTrackingDateTime(selected.lastLookupAt) : 'Pendiente de consultar'}</strong></div></div>
        <h5>Bitácora de movimientos <span>{events.length}</span></h5>
        <div className="mission-events">{events.map((event, index) => <article key={`${event.timestamp}-${index}`}><span className="mission-event-dot" /><div><strong>{event.label}</strong><p>{event.location || 'Ubicación no informada'}</p><time>{event.timestamp ? formatTrackingDateTime(event.timestamp) : 'Sin fecha informada'}</time></div></article>)}{!events.length && <p>El historial aparecerá cuando la mensajería proporcione movimientos.</p>}</div>
      </section>}
    </div>
  );
}
