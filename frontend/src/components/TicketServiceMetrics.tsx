import { useState } from 'react';
import { supabase } from '../supabaseClient';
import type { CaseTicketRecord } from './TicketCaseDetail';
import useTicketServiceEvents from './useTicketServiceEvents';
import { closureReasons, eventAuthor, formatDuration, slaLabels, ticketControlFacts, type ClosureReason } from './ticketControlModel';
import useSecondTicker from './useSecondTicker';

const activities = {
  avance: 'Avance técnico', diagnostico: 'Diagnóstico', llamada: 'Llamada / contacto',
  visita: 'Visita', pieza: 'Pieza / refacción', escalamiento: 'Escalamiento', nota: 'Nota interna',
};
const states = { abierto: 'Abierto', en_progreso: 'En progreso', pendiente_piezas: 'Pendiente por piezas', en_observacion: 'En observación' };
export default function TicketServiceMetrics({ ticket, canWrite = false, onChanged }: {
  ticket: CaseTicketRecord; canWrite?: boolean; onChanged?: () => void;
}) {
  const [detail, setDetail] = useState('');
  const [action, setAction] = useState('avance');
  const [nextStatus, setNextStatus] = useState('');
  const [visibleToClient, setVisibleToClient] = useState(false);
  const [reason, setReason] = useState<ClosureReason>('solucionado');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const { events, loaded, canApprove, error: loadError } = useTicketServiceEvents(revision, ticket.id);
  const now = useSecondTicker();
  const facts = ticketControlFacts(ticket, events, now);
  const canJustify = canApprove && facts.sla === 'vencido' && !facts.approval;
  const canReview = canApprove && facts.closed && !facts.review;
  const options = [
    ...(canWrite && !facts.closed ? [
      ...Object.entries(activities).map(([value, label]) => ({ value, label })),
      { value: 'respuesta', label: 'Respuesta al cliente' },
      { value: 'cierre', label: 'Cerrar el caso' },
    ] : []),
    ...(canJustify ? [{ value: 'justificacion', label: 'Aprobar demora con justificación' }] : []),
    ...(canReview ? [{ value: 'revision_cierre', label: 'Revisar cierre' }] : []),
  ];
  const selectedAction = options.some(option => option.value === action) ? action : '';
  const ordinary = selectedAction in activities;
  const hints: Record<string, string> = {
    respuesta: facts.response ? 'Se agregará el contacto a la bitácora. Se conserva la fecha de la primera respuesta.' : 'Se registrará la primera respuesta y su tiempo desde la apertura. El contacto debe haberse realizado; no se enviará un mensaje desde aquí.',
    cierre: reason === 'solucionado' ? 'La solución, la hora de cierre y su duración se registrarán al guardar.' : 'Se registrará un cierre administrativo; no contará como resolución técnica.',
    justificacion: 'Se guardarán tu aprobación y el motivo de la demora, conservando el tiempo real de atención.',
    revision_cierre: 'El cierre quedará revisado por ti. Esto no aprueba ni justifica su demora.',
  };
  const register = async () => {
    if (detail.trim().length < 2 || busy || !selectedAction) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await supabase.rpc('register_ticket_movement', {
        p_ticket_id: ticket.id, p_action: selectedAction, p_detail: detail.trim(),
        p_state: ordinary ? nextStatus || null : null,
        p_visible: ordinary && selectedAction !== 'nota' && visibleToClient,
        p_reason: selectedAction === 'cierre' ? reason : null,
      });
      if (result.error) throw result.error;
      setDetail(''); setNextStatus(''); setRevision(value => value + 1);
      setNotice('Movimiento guardado en la bitácora. Los tiempos y el estado se actualizaron según la operación seleccionada.');
      onChanged?.();
    } catch (cause) { setError((cause as { message?: string }).message || 'Error de conexión'); }
    finally { setBusy(false); }
  };
  return <div className="ticket-case__quick-log tc-movement">
    <strong>Seguimiento del caso</strong>
    {!loaded && !loadError && <p role="status">Cargando trazabilidad…</p>}
    {loaded && <>
      <div className="tc-detail-facts">
        <div><small>Primera respuesta</small><strong>{formatDuration(facts.responseHours)}</strong><span>{facts.response ? new Date(facts.response.occurred_at).toLocaleString('es-MX') : 'Sin registrar'}</span><span>{eventAuthor(facts.response)}</span></div>
        <div><small>Tiempo hasta el cierre</small><strong>{facts.closed ? formatDuration(facts.hours) : 'En atención'}</strong><span>{facts.outcome}</span>{facts.closure && <span>{new Date(facts.closure.occurred_at).toLocaleString('es-MX')}</span>}</div>
        <div><small>Compromiso de 48 horas</small><strong>{slaLabels[facts.sla]}</strong><span>{facts.closed ? facts.review ? 'Revisado por gerencia' : 'Pendiente de revisión' : `${formatDuration(facts.hours)} transcurridas`}</span></div>
      </div>
      {options.length > 0 && <form onSubmit={event => { event.preventDefault(); void register(); }}>
        <div className="ticket-case__quick-grid">
          <label>Movimiento<select className="input-field" aria-label="Movimiento" value={selectedAction} disabled={busy} onChange={event => setAction(event.target.value)}><option value="" disabled>Selecciona el movimiento</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          {ordinary && <label>Estado resultante<select className="input-field" aria-label="Estado resultante" value={nextStatus} disabled={busy} onChange={event => setNextStatus(event.target.value)}><option value="">Conservar estado actual</option>{Object.entries(states).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
          {selectedAction === 'cierre' && <label>Resultado del cierre<select className="input-field" aria-label="Resultado del cierre" value={reason} disabled={busy} onChange={event => setReason(event.target.value as ClosureReason)}>{Object.entries(closureReasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        </div>
        <label>Detalle del movimiento<textarea className="input-field" rows={4} maxLength={3900} required minLength={2} disabled={busy} value={detail} onChange={event => setDetail(event.target.value)} placeholder="Describe lo realizado, la respuesta, la solución o el motivo que respalda este movimiento." /></label>
        <p className="tc-movement-hint">{hints[selectedAction] || 'El detalle y el estado quedarán registrados en la bitácora del caso y del equipo.'}</p>
        <div className="ticket-case__quick-actions">
          {ordinary && selectedAction !== 'nota' ? <label className="tc-visibility"><input type="checkbox" disabled={busy} checked={visibleToClient} onChange={event => setVisibleToClient(event.target.checked)} /> Visible para el cliente</label> : <small>Registro interno con fecha, hora y autor.</small>}
          <button type="submit" className="button-primary" disabled={busy || !selectedAction || detail.trim().length < 2}>{busy ? 'Guardando…' : 'Guardar movimiento'}</button>
        </div>
      </form>}
    </>}
    {(error || loadError) && <p role="alert">{error || loadError}</p>}
    {notice && <p role="status">{notice}</p>}
  </div>;
}
