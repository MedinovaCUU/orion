import { dhlPieceStatus } from '../../../supabase/functions/_shared/dhl-pieces';
import { formatTrackingDateTime, type TrackingEntry } from './orionTracking';
import './TrackingPieces.css';

export function TrackingPieces({ entry }: { entry: TrackingEntry }) {
  const details = entry.shipmentDetails;
  const pieces = details?.pieces || [];
  const delivered = pieces.filter(piece => dhlPieceStatus(piece) === 'Entregado').length;
  return <section className="tracking-pieces" aria-label="Paquetes de la guía">
    <div className="tracking-pieces__heading"><div><small>DESGLOSE DE LA GUÍA</small><h5>Paquetes y piezas</h5></div><strong>{details?.pieceCount ?? '—'} <span>reportados por DHL</span></strong></div>
    <p className="tracking-pieces__summary">{pieces.length} identificados · {delivered} con entrega individual confirmada</p>
    {details?.pieceCount && details.pieceCount > pieces.length ? <p className="tracking-pieces__notice">DHL informa {details.pieceCount} piezas; aún no contamos con todos sus identificadores.</p> : null}
    {entry.status === 'entregado' && pieces.length > delivered && <p className="tracking-pieces__notice">La guía figura entregada. No hay confirmación individual de entrega para todas las piezas; revisa el desglose.</p>}
    <dl className="tracking-pieces__facts">
      {entry.serviceType && <div><dt>Servicio</dt><dd>{entry.serviceType}</dd></div>}
      {details?.weight && <div><dt>Peso total informado</dt><dd>{details.weight}</dd></div>}
      {details?.description && <div><dt>Descripción</dt><dd>{details.description}</dd></div>}
      {entry.deliveryProofName && <div><dt>Recibió / firmó la guía</dt><dd>{entry.deliveryProofName}</dd></div>}
      {details?.references.length ? <div><dt>Referencias DHL</dt><dd>{details.references.join(' · ')}</dd></div> : null}
    </dl>
    {!pieces.length ? <p>No se han recibido identificadores de piezas. Esto no significa que el envío no tenga paquetes.</p> : <p className="tracking-pieces__help">Abre cada pieza para ver sus movimientos. El estado de la guía no se copia a todos los paquetes.</p>}
    {pieces.map(piece => {
      const latest = piece.events[0];
      const status = dhlPieceStatus(piece);
      return <details key={piece.id} className="tracking-piece" data-delivered={status === 'Entregado'}>
        <summary><span><small>{piece.number ? `PIEZA ${piece.number}` : 'IDENTIFICADOR DE PIEZA'}</small><strong>{piece.id}</strong><span>{status}</span></span><span aria-hidden="true">+</span></summary>
        <div className="tracking-piece__body">
          <p>Guía principal: <b>{entry.trackingNumber}</b></p>
          {latest && <p>Último movimiento: {latest.location || 'Ubicación no informada'} · {latest.timestamp ? formatTrackingDateTime(latest.timestamp) : 'Fecha no informada'}</p>}
          {(piece.weight || piece.dimensions) && <p>{piece.weight && `Peso: ${piece.weight}`}{piece.weight && piece.dimensions ? ' · ' : ''}{piece.dimensions && `Dimensiones: ${piece.dimensions}`}</p>}
          <ol className="tracking-piece__events">{piece.events.map((event, index) => <li key={`${event.timestamp}-${index}`}><b>{event.label || event.statusCode}</b><span>{event.location || 'Ubicación no informada'}</span><time>{event.timestamp ? formatTrackingDateTime(event.timestamp) : 'Fecha no informada'}</time>{event.note && <p>{event.note}</p>}</li>)}</ol>
          {!piece.events.length && <p>Identificador recibido, sin eventos asociados a esta pieza todavía.</p>}
        </div>
      </details>;
    })}
  </section>;
}
