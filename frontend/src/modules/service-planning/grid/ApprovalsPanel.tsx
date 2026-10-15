import { useState } from 'react';
import { formatPlanningPersonName } from '../helpers/normalizeService';
import { describeRequest, STATUS_TEXT, type ChangeRequest } from './planningApprovals';
import type { PlanningRecord } from './planningRecord';

// Side panel with the change requests: an approver sees everyone's pending ones (with what changes, from
// what to what) and approves or rejects them; anyone else sees their own and can withdraw them.

const when = (iso: string) => {
  const date = new Date(iso);
  return `${date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' })} ${date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
};

interface ApprovalsPanelProps {
  requests: ChangeRequest[];
  isApprover: boolean;
  approverName: string;
  recordFor: (ticketId: string | null) => PlanningRecord | null;
  onApprove: (request: ChangeRequest, note: string) => Promise<boolean>;
  onReject: (request: ChangeRequest, note: string) => Promise<void>;
  onRetry: (request: ChangeRequest) => Promise<void>;
  onCancel: (request: ChangeRequest) => Promise<void>;
  onShow: (request: ChangeRequest) => void;
  onClose: () => void;
}

export default function ApprovalsPanel({ requests, isApprover, approverName, recordFor, onApprove, onReject, onRetry, onCancel, onShow, onClose }: ApprovalsPanelProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [showDecided, setShowDecided] = useState(false);
  const pending = requests.filter((request) => request.status === 'pending' || request.status === 'failed');
  const decided = requests.filter((request) => request.status !== 'pending' && request.status !== 'failed');

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

  const card = (request: ChangeRequest) => {
    const record = recordFor(request.ticketId);
    const lines = describeRequest(request, record);
    const changedSince = request.kind === 'update' && record && request.baseVersion !== null && record.version !== null && record.version !== request.baseVersion;
    return (
      <li key={request.id} className={`pgrid-approvals__item is-${request.status}`}>
        <header>
          <strong>{formatPlanningPersonName(request.requestedByName) || request.requestedByName}</strong>
          <time dateTime={request.requestedAt}>{when(request.requestedAt)}</time>
          <span className={`pgrid-approvals__status is-${request.status}`}>{STATUS_TEXT[request.status]}</span>
        </header>
        <p className="pgrid-approvals__target">{request.targetLabel}</p>
        <ul className="pgrid-approvals__lines">
          {lines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
        {changedSince ? <p className="pgrid-approvals__warn">La actividad cambió desde que se pidió; se aplicará sobre lo actual.</p> : null}
        {request.status !== 'pending' && request.status !== 'failed' ? (
          <p className="pgrid-approvals__decision">
            {STATUS_TEXT[request.status]}
            {request.reviewedByName ? ` por ${formatPlanningPersonName(request.reviewedByName) || request.reviewedByName}` : ''}
            {request.reviewedAt ? ` · ${when(request.reviewedAt)}` : ''}
            {request.reviewNote ? ` · «${request.reviewNote}»` : ''}
          </p>
        ) : null}
        {request.status === 'failed' && request.reviewNote ? <p className="pgrid-approvals__warn">{request.reviewNote}</p> : null}
        <div className="pgrid-approvals__actions">
          {request.ticketId && record ? (
            <button type="button" className="pgrid-link" onClick={() => onShow(request)}>Ver en la tabla</button>
          ) : null}
          <span />
          {isApprover && request.status === 'pending' ? (
            rejecting === request.id ? (
              <form
                className="pgrid-approvals__reject"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(request.id, () => onReject(request, note.trim())).then(() => {
                    setRejecting(null);
                    setNote('');
                  });
                }}
              >
                <input autoFocus value={note} placeholder="Motivo (opcional)" aria-label="Motivo del rechazo" onChange={(event) => setNote(event.target.value)} />
                <button type="submit" className="pgrid-link is-danger" disabled={busy === request.id}>Rechazar</button>
                <button type="button" className="pgrid-link" onClick={() => setRejecting(null)}>Volver</button>
              </form>
            ) : (
              <>
                <button type="button" className="pgrid-link is-danger" disabled={busy === request.id} onClick={() => setRejecting(request.id)}>Rechazar</button>
                <button type="button" className="pgrid-button" disabled={busy === request.id} onClick={() => void run(request.id, () => onApprove(request, ''))}>
                  {busy === request.id ? 'Aplicando…' : 'Aprobar'}
                </button>
              </>
            )
          ) : null}
          {isApprover && request.status === 'failed' ? (
            <button type="button" className="pgrid-link" disabled={busy === request.id} onClick={() => void run(request.id, () => onRetry(request))}>Volver a pendiente</button>
          ) : null}
          {!isApprover && request.status === 'pending' ? (
            <button type="button" className="pgrid-link" disabled={busy === request.id} onClick={() => void run(request.id, () => onCancel(request))}>Cancelar solicitud</button>
          ) : null}
        </div>
      </li>
    );
  };

  const approvable = pending.filter((request) => request.status === 'pending');

  return (
    <aside className="pgrid-history pgrid-approvals" aria-label="Solicitudes de cambio">
      <header>
        <div>
          <span className="planning-eyebrow">{isApprover ? 'Por aprobar' : 'Mis solicitudes'}</span>
          <h3>{isApprover ? `${approvable.length} ${approvable.length === 1 ? 'solicitud' : 'solicitudes'}` : `Enviadas a ${approverName}`}</h3>
          <small>{isApprover ? 'Al aprobar, el cambio se aplica sobre lo que hay ahora y queda registrado quién lo pidió y quién lo aprobó.' : 'Tus cambios se aplican cuando se aprueban. Aquí ves qué decidieron.'}</small>
        </div>
        <button type="button" className="pgrid-icon" onClick={onClose} aria-label="Cerrar solicitudes">×</button>
      </header>
      {isApprover && approvable.length > 1 ? (
        <button
          type="button"
          className="pgrid-button pgrid-approvals__all"
          disabled={Boolean(busy)}
          onClick={() =>
            void run('all', async () => {
              for (const request of approvable) await onApprove(request, '');
            })
          }
        >
          {busy === 'all' ? 'Aplicando…' : `Aprobar las ${approvable.length}`}
        </button>
      ) : null}
      {pending.length ? <ul className="pgrid-approvals__list">{pending.map(card)}</ul> : <p className="pgrid-history__note">No hay solicitudes pendientes.</p>}
      {decided.length ? (
        <>
          <button type="button" className="pgrid-link pgrid-approvals__toggle" onClick={() => setShowDecided((value) => !value)}>
            {showDecided ? 'Ocultar' : 'Ver'} decididas recientemente ({decided.length})
          </button>
          {showDecided ? <ul className="pgrid-approvals__list">{decided.map(card)}</ul> : null}
        </>
      ) : null}
    </aside>
  );
}
