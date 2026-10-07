import { formatDuration, slaLabels } from '../../../components/ticketControlModel';
import type { summarizeEngineerTickets } from '../helpers/engineerTickets';

export default function EngineerTicketSlide({ rows, index }: { rows: ReturnType<typeof summarizeEngineerTickets>['rows']; index: number }) {
  const row=rows[index % rows.length];
  const {ticket,facts,latest}=row;
  return <div className="engineer-wall__agenda">
    <div className="engineer-wall__slide" key={ticket.id}>
      <span className="engineer-wall__label">TICKET {ticket.numero_caso || ticket.id.slice(0,8)} · {row.needsResponse ? 'REQUIERE RESPUESTA' : 'EN SEGUIMIENTO'}</span>
      <strong className="engineer-wall__destination">{ticket.asunto}</strong>
      <div className={`engineer-wall__ticket-sla ${row.attention ? 'needs-attention' : ''}`}>{slaLabels[facts.sla]} · {formatDuration(facts.hours)} abierto</div>
      <div className="engineer-wall__stages" aria-label={facts.response ? 'Asignado, respuesta registrada, cierre pendiente' : 'Asignado, respuesta pendiente, cierre pendiente'}>
        <span className="done">✓ Asignado</span><span className={facts.response ? 'done' : ''}>{facts.response ? '✓' : '○'} Respuesta</span><span>○ Cierre</span>
      </div>
      <dl><div><dt>Estado registrado</dt><dd>{ticket.estado.replaceAll('_',' ')}</dd></div>{ticket.numero_serie_equipo && <div><dt>Serie</dt><dd>{ticket.numero_serie_equipo}</dd></div>}</dl>
      <div className="engineer-wall__observations"><span className="engineer-wall__label">{latest ? 'ÚLTIMO MOVIMIENTO' : 'SIGUIENTE PASO'}</span><p>{latest?.detail || 'Registrar la primera respuesta y dar seguimiento al caso.'}</p>{latest && <small>{new Date(latest.occurred_at).toLocaleString('es-MX',{timeZone:'America/Ciudad_Juarez',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</small>}</div>
    </div>
    <div className="engineer-wall__slide-footer"><span>Ticket {index % rows.length + 1} / {rows.length}</span><span>Avance según movimientos</span></div>
    <div className="engineer-wall__progress" aria-hidden="true"><span key={index}/></div>
  </div>;
}
