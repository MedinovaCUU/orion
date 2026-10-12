import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Loader } from './OrionLoader';
import { activityMotiveLabels, activityResultLabels } from './serviceKpiModel';
import type { CaseTicketRecord } from './TicketCaseDetail';
import useTicketServiceEvents from './useTicketServiceEvents';
import { closureReasons, eventAuthor, formatDuration, slaLabels, ticketControlFacts, type ClosureReason } from './ticketControlModel';
import useSecondTicker from './useSecondTicker';

const activities = {
  avance: 'Avance técnico', diagnostico: 'Diagnóstico', llamada: 'Llamada / contacto',
  visita: 'Visita', pieza: 'Pieza / refacción', escalamiento: 'Escalamiento', nota: 'Nota interna',
};
const states = { abierto: 'Abierto', en_progreso: 'En progreso', pendiente_piezas: 'Pendiente por piezas', en_observacion: 'En observación' };
// Calls and visits carry structured data for the staff indicators; every field stays optional.
const activityResults = ['resuelto', 'requiere_visita', 'requiere_pieza', 'escalado', 'en_seguimiento', 'sin_solucion'];
const emptyActivity = { duracion_min: '', motivo: '', resultado: '', codigo_averia: '', codigo_solucion: '' };
type CatalogEntry = { catalog_kind: string; catalog_code: string; catalog_detail: string | null };
let catalogCache: Promise<CatalogEntry[]> | null = null;
const loadCatalog = () => catalogCache ||= Promise.resolve(supabase.from('catalogo_servicio').select('catalog_kind,catalog_code,catalog_detail').in('catalog_kind', ['averia', 'solucion']).order('catalog_code'))
  .then(result => { if (result.error) { catalogCache = null; throw result.error; } return (result.data || []) as CatalogEntry[]; });
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
  const [activity, setActivity] = useState(emptyActivity);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
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
  const capturesActivity = selectedAction === 'llamada' || selectedAction === 'visita';
  useEffect(() => { if (capturesActivity && !catalog.length) loadCatalog().then(setCatalog).catch(() => setCatalog([])); }, [capturesActivity, catalog.length]);
  const activityPayload = () => {
    if (!capturesActivity) return null;
    const code = (value: string) => value.split(' - ')[0].trim().toUpperCase();
    const payload = { duracion_min: activity.duracion_min.trim(), motivo: activity.motivo, resultado: activity.resultado, codigo_averia: code(activity.codigo_averia), codigo_solucion: code(activity.codigo_solucion) };
    return Object.values(payload).some(Boolean) ? payload : null;
  };
  const hints: Record<string, string> = {
    respuesta: facts.response ? 'Se agregará el contacto a la bitácora. Se conserva la fecha de la primera respuesta.' : 'Se registrará la primera respuesta y su tiempo desde la apertura. El contacto debe haberse realizado. Se encolará su notificación de WhatsApp si el ticket tiene teléfono.',
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
        p_activity: activityPayload(),
      });
      if (result.error) throw result.error;
      setDetail(''); setNextStatus(''); setActivity(emptyActivity); setRevision(value => value + 1);
      setNotice('Movimiento guardado en la bitácora. Los tiempos y el estado se actualizaron según la operación seleccionada.');
      onChanged?.();
    } catch (cause) { setError((cause as { message?: string }).message || 'Error de conexión'); }
    finally { setBusy(false); }
  };
  return <div className="ticket-case__quick-log tc-movement">
    <strong>Seguimiento del caso</strong>
    {!loaded && !loadError && <Loader size="sm" label="Cargando trazabilidad…" />}
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
        {capturesActivity && <fieldset className="tc-activity-fields">
          <legend>Datos de la {selectedAction === 'llamada' ? 'llamada' : 'visita'} para indicadores (opcionales)</legend>
          <label>Duración (minutos)<input className="input-field" type="number" min={1} max={1440} step={1} disabled={busy} value={activity.duracion_min} onChange={event => setActivity({ ...activity, duracion_min: event.target.value })} /></label>
          <label>Motivo<select className="input-field" aria-label="Motivo de la actividad" disabled={busy} value={activity.motivo} onChange={event => setActivity({ ...activity, motivo: event.target.value })}><option value="">Sin especificar</option>{Object.entries(activityMotiveLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Resultado<select className="input-field" aria-label="Resultado de la actividad" disabled={busy} value={activity.resultado} onChange={event => setActivity({ ...activity, resultado: event.target.value })}><option value="">Sin especificar</option>{activityResults.map(value => <option key={value} value={value}>{activityResultLabels[value]}</option>)}</select></label>
          <label>Código de avería<input className="input-field" list={`tc-averias-${ticket.id}`} disabled={busy} value={activity.codigo_averia} placeholder="Ej. AL08" onChange={event => setActivity({ ...activity, codigo_averia: event.target.value })} /></label>
          <label>Solución aplicada<input className="input-field" list={`tc-soluciones-${ticket.id}`} disabled={busy} value={activity.codigo_solucion} placeholder="Código del catálogo" onChange={event => setActivity({ ...activity, codigo_solucion: event.target.value })} /></label>
          <datalist id={`tc-averias-${ticket.id}`}>{catalog.filter(item => item.catalog_kind === 'averia').map(item => <option key={item.catalog_code} value={`${item.catalog_code} - ${item.catalog_detail || ''}`} />)}</datalist>
          <datalist id={`tc-soluciones-${ticket.id}`}>{catalog.filter(item => item.catalog_kind === 'solucion').map(item => <option key={item.catalog_code} value={`${item.catalog_code} - ${item.catalog_detail || ''}`} />)}</datalist>
        </fieldset>}
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
