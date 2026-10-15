import { useEffect, useState } from 'react';
import { formatPlanningPersonName } from '../helpers/normalizeService';
import { describeChange } from './historyText';
import type { CustomColumn, PlanningBackend, PlanningChange } from './planningBackend';
import { STATUS_TEXT, type ChangeRequest } from './planningApprovals';
import type { PlanningRecord } from './planningRecord';

const stamp = (iso: string) => {
  const date = new Date(iso);
  return `${date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })} — ${date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
};

export default function HistoryPanel({ backend, record, customColumns, onClose }: { backend: PlanningBackend; record: PlanningRecord; customColumns: CustomColumn[]; onClose: () => void }) {
  const [changes, setChanges] = useState<PlanningChange[] | null>(null);
  const [error, setError] = useState('');
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  useEffect(() => {
    let active = true;
    backend
      .history(record.id)
      .then((rows) => active && setChanges(rows))
      .catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : 'No se pudo leer el historial.'));
    backend
      .requestsForTicket(record.id)
      .then((rows) => active && setRequests(rows))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [backend, record.id, record.version]);

  return (
    <aside className="pgrid-history" aria-label="Historial de la actividad">
      <header>
        <div>
          <span className="planning-eyebrow">Historial</span>
          <h3>{record.values.platform ? `${record.values.platform} · ` : ''}{record.values.locality || 'Actividad'}</h3>
          <small>
            Creada {record.createdBy ? `por ${formatPlanningPersonName(record.createdBy) || record.createdBy} ` : ''}el {stamp(record.createdAt)}
          </small>
        </div>
        <button type="button" className="pgrid-icon" onClick={onClose} aria-label="Cerrar historial">×</button>
      </header>
      {!backend.capabilities.history ? (
        <p className="pgrid-history__note">
          El registro de cambios por campo se activa con la actualización de base de datos de la tabla maestra. Última modificación: {stamp(record.updatedAt)}
          {record.updatedBy ? ` por ${formatPlanningPersonName(record.updatedBy) || record.updatedBy}` : ''}.
        </p>
      ) : error ? (
        <p role="alert" className="pgrid-history__note">{error}</p>
      ) : changes === null ? (
        <p className="pgrid-history__note">Cargando…</p>
      ) : changes.length === 0 ? (
        <p className="pgrid-history__note">Sin cambios registrados desde que se activó el historial.</p>
      ) : (
        <ol>
          {changes.map((change) => (
            <li key={change.id}>
              <time dateTime={change.changedAt}>{stamp(change.changedAt)}</time>
              <span>{describeChange(change, customColumns)}</span>
            </li>
          ))}
        </ol>
      )}
      {requests.length ? (
        <section className="pgrid-history__requests">
          <span className="planning-eyebrow">Solicitudes de cambio</span>
          <ol>
            {requests.map((request) => (
              <li key={request.id}>
                <time dateTime={request.requestedAt}>{stamp(request.requestedAt)}</time>
                <span>
                  {formatPlanningPersonName(request.requestedByName) || request.requestedByName} pidió: {request.summary}
                </span>
                <small>
                  {STATUS_TEXT[request.status]}
                  {request.reviewedByName ? ` por ${formatPlanningPersonName(request.reviewedByName) || request.reviewedByName}` : ''}
                  {request.reviewedAt ? ` el ${stamp(request.reviewedAt)}` : ''}
                  {request.reviewNote ? ` · «${request.reviewNote}»` : ''}
                </small>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </aside>
  );
}
