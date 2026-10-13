import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import TicketCaseDetail, { type CaseTicketRecord } from './TicketCaseDetail';
import { formatCaseNumber } from './ticketCaseUtils';
import type { EquipmentSummary } from './servicesPlanning';
import {
  ARCHIVE_MIN_QUERY,
  EMPTY_ARCHIVE_CRITERIA,
  TICKET_INBOX_DAYS,
  archiveDatesInvalid,
  archiveHasCriteria,
  archivePageCount,
  archiveRpcArgs,
  isMissingRpc,
  unpackArchiveRows,
  type ArchiveCriteria,
  type ArchiveRow,
} from './ticketArchive';

export interface ArchiveTicketDescription {
  clientLabel: string;
  phoneLabel: string;
  equipment: EquipmentSummary | null;
  isPlanning: boolean;
  detailLines: string[];
  statusLabel: string;
}

// Opens one case found elsewhere (e.g. the WhatsApp inbox) that is no longer in the working set.
export interface ArchiveFocus {
  ticketId: string;
  query: string;
  nonce: number;
}

interface TicketArchiveSearchProps<T extends CaseTicketRecord> {
  describe: (ticket: T) => ArchiveTicketDescription;
  personal: boolean;
  canDiagnose: boolean;
  onDiagnose: (ticket: T) => void;
  onChanged: () => void;
  focus: ArchiveFocus | null;
  // Bumped after a change made outside the archive (e.g. a closure) so the visible page reloads.
  refreshKey: number;
}

const dateLabel = (value: string | null | undefined) => (value ? new Date(value).toLocaleDateString('es-MX') : '');

export default function TicketArchiveSearch<T extends CaseTicketRecord>({ describe, personal, canDiagnose, onDiagnose, onChanged, focus, refreshKey: externalRefreshKey }: TicketArchiveSearchProps<T>) {
  const [criteria, setCriteria] = useState<ArchiveCriteria>(EMPTY_ARCHIVE_CRITERIA);
  const [browseAll, setBrowseAll] = useState(false);
  const [page, setPage] = useState(1);
  const [answer, setAnswer] = useState<{ key: string; tickets: T[]; total: number; error: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [seenFocus, setSeenFocus] = useState<ArchiveFocus | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const active = browseAll || archiveHasCriteria(criteria);
  const invalidDates = archiveDatesInvalid(criteria);
  // One key per question asked; the answer for an older key stays on screen (dimmed) until the new one lands.
  const requestKey = active && !invalidDates ? JSON.stringify([archiveRpcArgs(criteria, page), refreshKey, externalRefreshKey]) : '';
  const current = answer?.key === requestKey ? answer : null;
  const loading = Boolean(requestKey) && !current;
  const shown = current || (requestKey && !answer?.error ? answer : null);
  const results = shown?.tickets || [];
  const total = shown?.total || 0;
  const error = current?.error || '';
  const pages = archivePageCount(total);

  // A case opened from elsewhere replaces the search with its folio and expands it.
  if (focus && focus !== seenFocus) {
    setSeenFocus(focus);
    setCriteria({ ...EMPTY_ARCHIVE_CRITERIA, query: focus.query });
    setBrowseAll(false);
    setPage(1);
    setExpandedId(focus.ticketId);
  }
  useEffect(() => {
    if (focus) window.setTimeout(() => sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, [focus]);

  useEffect(() => {
    if (!requestKey) return;
    let cancelled = false;
    // Typing waits for a pause; an answer that arrives after a newer question is dropped.
    const timer = window.setTimeout(async () => {
      const [args] = JSON.parse(requestKey) as [ReturnType<typeof archiveRpcArgs>];
      const { data, error: rpcError } = await supabase.rpc('search_ticket_archive', args);
      if (cancelled) return;
      if (rpcError) {
        setAnswer({ key: requestKey, tickets: [], total: 0, error: isMissingRpc(rpcError)
          ? 'El buscador del historial aún no está activo en la base de datos (falta aplicar la migración 20261013070000).'
          : `No se pudo consultar el historial: ${rpcError.message}` });
        return;
      }
      setAnswer({ key: requestKey, ...unpackArchiveRows(data as ArchiveRow<T>[]), error: '' });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [requestKey]);

  const update = (patch: Partial<ArchiveCriteria>) => { setCriteria((current) => ({ ...current, ...patch })); setPage(1); };
  const clear = () => { setCriteria(EMPTY_ARCHIVE_CRITERIA); setBrowseAll(false); setPage(1); setExpandedId(null); };
  const changed = () => { setRefreshKey((key) => key + 1); onChanged(); };
  const goTo = (next: number) => { setPage(next); setExpandedId(null); sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const shortQuery = criteria.query.trim().length > 0 && criteria.query.trim().length < ARCHIVE_MIN_QUERY;

  return (
    <section ref={sectionRef} className="card ticket-archive" aria-labelledby="ticket-archive-title">
      <div className="ticket-archive__head">
        <div>
          <h3 id="ticket-archive-title">Historial de casos</h3>
          <p>
            Busca cualquier caso anterior por folio, serie, cliente, asunto, teléfono o responsable. Se consulta por páginas, sin descargar todo el historial.
            {personal ? ' Solo aparecen los casos ligados a ti.' : ''}
          </p>
        </div>
        {active
          ? <button type="button" className="button-primary inactive ticket-archive__action" onClick={clear}>Limpiar búsqueda</button>
          : <button type="button" className="button-primary inactive ticket-archive__action" onClick={() => { setBrowseAll(true); setPage(1); }}>Ver historial completo</button>}
      </div>
      <div className="ticket-archive__filters" role="search">
        <label className="ticket-archive__query">
          <span>Buscar</span>
          <input type="search" className="input-field" value={criteria.query} placeholder="Folio (BIO-2471), serie, cliente, asunto, teléfono…" aria-label="Buscar en el historial de casos" onChange={(event) => update({ query: event.target.value })} />
        </label>
        <label>
          <span>Estado</span>
          <select className="input-field" aria-label="Estado del caso" value={criteria.status} onChange={(event) => update({ status: event.target.value as ArchiveCriteria['status'] })}>
            <option value="todos">Todos</option><option value="abiertos">Abiertos</option><option value="cerrados">Cerrados</option>
          </select>
        </label>
        <label>
          <span>Tipo</span>
          <select className="input-field" aria-label="Tipo de caso" value={criteria.scope} onChange={(event) => update({ scope: event.target.value as ArchiveCriteria['scope'] })}>
            <option value="todos">Todos</option><option value="soporte">Soporte</option><option value="planeacion">Planeación</option>
          </select>
        </label>
        <label>
          <span>Apertura desde</span>
          <input type="date" className="input-field" aria-label="Apertura desde" value={criteria.from} onChange={(event) => update({ from: event.target.value })} />
        </label>
        <label>
          <span>Hasta</span>
          <input type="date" className="input-field" aria-label="Apertura hasta" value={criteria.to} onChange={(event) => update({ to: event.target.value })} />
        </label>
      </div>

      {shortQuery && !active && <p className="ticket-archive__hint">Escribe al menos {ARCHIVE_MIN_QUERY} caracteres.</p>}
      {!active && !shortQuery && <p className="ticket-archive__hint">La bandeja de abajo muestra los casos abiertos y los movidos en los últimos {TICKET_INBOX_DAYS} días. Todo lo anterior está aquí.</p>}
      {invalidDates && <p className="tc-error" role="alert">La fecha inicial no puede ser posterior a la final.</p>}
      {error && <p className="tc-error" role="alert">{error}</p>}

      {active && !invalidDates && !error && (
        <>
          <p className="ticket-archive__count" role="status" aria-live="polite">
            {loading ? 'Buscando en el historial…' : total === 0 ? 'Sin casos que coincidan.' : `${total.toLocaleString('es-MX')} ${total === 1 ? 'caso' : 'casos'} · página ${Math.min(page, pages)} de ${pages}`}
          </p>
          <ul className={`tickets-list ticket-archive__results${loading ? ' is-loading' : ''}`}>
            {results.map((ticket) => {
              const info = describe(ticket);
              const expanded = expandedId === ticket.id;
              const open = ticket.estado !== 'cerrado';
              return (
                <li key={ticket.id} id={`ticket-archive-${ticket.id}`} className={`tickets-list-card ticket-archive__card${info.isPlanning ? ' tickets-list-card--planning' : ''}`}>
                  <div className="tickets-list-card__header">
                    <div className="tickets-list-card__copy">
                      <div className="tickets-list-card__case-line">
                        <span className="tickets-list-card__case-number">{formatCaseNumber(ticket)}</span>
                        <span>Abierto {dateLabel(ticket.creado_en)}</span>
                        {ticket.actualizado_en && dateLabel(ticket.actualizado_en) !== dateLabel(ticket.creado_en) && <span>Actualizado {dateLabel(ticket.actualizado_en)}</span>}
                      </div>
                      <strong className="tickets-list-card__title">{ticket.asunto}</strong>
                      <div className="tickets-list-card__chips">
                        {ticket.numero_serie_equipo && <span className="button-primary inactive chip tickets-list-card__chip">Serie {ticket.numero_serie_equipo}</span>}
                        <span className="button-primary inactive chip tickets-list-card__chip">{info.clientLabel}</span>
                        <span className="button-primary inactive chip tickets-list-card__chip">Tel. {info.phoneLabel}</span>
                        {info.isPlanning && <span className="button-primary inactive chip tickets-list-card__chip tickets-list-card__chip--planning">Planeación</span>}
                      </div>
                    </div>
                    <span className={`tickets-list-card__status tickets-list-card__status--${ticket.estado}`}>{info.statusLabel}</span>
                  </div>
                  <button type="button" className="tickets-list-card__case-toggle" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : ticket.id)}>
                    <span>
                      <strong>{expanded ? 'Cerrar expediente' : 'Abrir expediente completo'}</strong>
                      <small>Descripción, bitácora, cierre e historial global del equipo</small>
                    </span>
                    <span aria-hidden="true">{expanded ? '−' : '+'}</span>
                  </button>
                  {expanded && (
                    <>
                      {info.detailLines.length > 0 && (
                        <div className="tickets-list-card__note">
                          <div className="tickets-list-card__note-label">Descripción reportada</div>
                          <div className="tickets-list-card__note-lines">{info.detailLines.map((line, index) => <p key={`${ticket.id}-line-${index}`}>{line}</p>)}</div>
                        </div>
                      )}
                      <TicketCaseDetail ticket={ticket} equipment={info.equipment} canWrite={canDiagnose && open} onChanged={changed} />
                      {canDiagnose && open && (
                        <div className="tickets-list-card__footer">
                          <button type="button" className="button-primary" style={{ width: '100%' }} onClick={() => onDiagnose(ticket)}>Diagnosticar y Cerrar Ticket</button>
                        </div>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {pages > 1 && (
            <nav className="ticket-archive__pager" aria-label="Páginas del historial">
              <button type="button" className="button-primary inactive" disabled={page <= 1 || loading} onClick={() => goTo(page - 1)}>‹ Anterior</button>
              <span>Página {Math.min(page, pages)} de {pages}</span>
              <button type="button" className="button-primary inactive" disabled={page >= pages || loading} onClick={() => goTo(page + 1)}>Siguiente ›</button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
