import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import type { CaseTicketRecord } from './TicketCaseDetail';

type ServiceEvent = { ticket_id: string; kind: string; detail: string; actor_id: string | null; occurred_at: string; profiles: { nombre_completo: string | null } | null };
const elapsedHours = (start: string, end: string) => Math.max(0, (Date.parse(end) - Date.parse(start)) / 3600000);
const duration = (hours: number) => `${hours.toFixed(1)} h`;

export default function TicketServiceMetrics({ ticket, canWrite = false, onChanged, tickets }: {
  ticket?: CaseTicketRecord; canWrite?: boolean; onChanged?: () => void; tickets?: CaseTicketRecord[];
}) {
  const [events, setEvents] = useState<ServiceEvent[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [detail, setDetail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      setLoaded(false);
      try {
        const allEvents: ServiceEvent[] = [];
        for (let offset = 0; ; offset += 1000) {
          let query = supabase.from('ticket_service_events').select('*, profiles(nombre_completo)').order('occurred_at').order('id').range(offset, offset + 999);
          if (ticket) query = query.eq('ticket_id', ticket.id);
          const result = await query;
          if (result.error) throw result.error;
          allEvents.push(...(result.data || []) as ServiceEvent[]);
          if (!active) return;
          if ((result.data?.length || 0) < 1000) break;
        }
        const approval = await supabase.rpc('can_approve_ticket_delay');
        if (!active) return;
        setEvents(allEvents);
        setCanApprove(approval.data === true);
        setError('');
        setLoaded(true);
      } catch (cause) {
        if (active) setError(`No se pudieron cargar las métricas: ${(cause as { message?: string }).message || 'Error de conexión'}`);
      }
    })();
    return () => { active = false; };
  }, [ticket, tickets, revision]);

  const register = async (kind: string) => {
    if (!ticket || detail.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      const result = await supabase.rpc('register_ticket_service_event', { p_ticket_id: ticket.id, p_kind: kind, p_detail: detail.trim() });
      if (result.error) throw result.error;
      setDetail('');
      setRevision(value => value + 1);
      onChanged?.();
    } catch (cause) {
      setError(`No se pudo registrar: ${(cause as { message?: string }).message || 'Error de conexión'}`);
    } finally { setBusy(false); }
  };

  if (!ticket) {
    const rows = new Map<string, { name: string; responses: number[]; closures: number[]; late: number; justified: number }>();
    for (const event of events) {
      const source = tickets?.find(item => item.id === event.ticket_id);
      if (!source || event.kind === 'justificacion') continue;
      const key = event.actor_id || 'automatico';
      const row = rows.get(key) || { name: event.profiles?.nombre_completo || (event.actor_id ? 'Personal sin nombre' : 'Cierre automático'), responses: [], closures: [], late: 0, justified: 0 };
      const hours = elapsedHours(source.creado_en, event.occurred_at);
      if (event.kind === 'respuesta') row.responses.push(hours);
      else {
        row.closures.push(hours);
        if (hours > 48) {
          row.late++;
          if (events.some(item => item.ticket_id === event.ticket_id && item.kind === 'justificacion')) row.justified++;
        }
      }
      rows.set(key, row);
    }
    const average = (values: number[]) => values.length ? duration(values.reduce((a, b) => a + b, 0) / values.length) : 'Sin dato';
    return <details className="ticket-case__quick-log"><summary>Métricas por ingeniero / químico</summary>
      <p>48 horas corridas desde la apertura. Promedios por autor del movimiento, sobre los casos cargados. Las demoras justificadas se excluyen de incumplimientos; el tiempo real se conserva.</p>
      {error && <p role="alert">{error}</p>}
      <div className="ticket-case__sap-table-wrap"><table className="ticket-case__sap-table"><thead><tr><th>Personal</th><th>Respuestas</th><th>Primera respuesta promedio</th><th>Cierres</th><th>Resolución promedio</th><th>Demoras justificadas</th><th>Incumplimientos sin justificar</th></tr></thead>
      <tbody>{[...rows].map(([id, row]) => <tr key={id}><td>{row.name}</td><td>{row.responses.length}</td><td>{average(row.responses)}</td><td>{row.closures.length}</td><td>{average(row.closures)}</td><td>{row.justified}</td><td>{row.late - row.justified}</td></tr>)}</tbody></table></div>
      {loaded && !rows.size && <p>Aún no hay movimientos medidos.</p>}
    </details>;
  }
  const response = events.find(event => event.kind === 'respuesta');
  const closure = events.find(event => event.kind === 'cierre');
  const approval = events.find(event => event.kind === 'justificacion');
  const historical = ticket.estado === 'cerrado' && !closure;
  const hours = elapsedHours(ticket.creado_en, closure?.occurred_at || new Date(now).toISOString());
  return <div className="ticket-case__quick-log">
    <strong>Respuesta y resolución · compromiso de 48 horas</strong>
    <p>Primera respuesta: {response ? `${new Date(response.occurred_at).toLocaleString('es-MX')} · ${duration(elapsedHours(ticket.creado_en, response.occurred_at))}` : 'Sin registrar'}</p>
    <p>Cierre: {closure ? `${new Date(closure.occurred_at).toLocaleString('es-MX')} · ${duration(hours)}` : historical ? 'Histórico sin fecha verificable' : `Abierto · ${duration(hours)} transcurridas`}</p>
    <p>{historical ? 'Sin evaluación de plazo' : hours > 48 ? approval ? 'Demora justificada · excluida de incumplimientos' : 'Plazo excedido · sin justificación aprobada' : `Dentro del plazo · ${duration(48 - hours)} ${closure ? 'de margen al cierre' : 'restantes'}`}</p>
    {events.map(event => <p key={event.kind}><strong>{event.kind === 'respuesta' ? 'Respuesta' : event.kind === 'cierre' ? 'Solución' : 'Justificación aprobada'}</strong> · {event.profiles?.nombre_completo || 'Sistema'} · {new Date(event.occurred_at).toLocaleString('es-MX')}<br />{event.detail}</p>)}
    {loaded && ((canWrite && ticket.estado !== 'cerrado') || (canApprove && hours > 48 && !historical && !approval)) && <>
      <label>Detalle de la respuesta, solución o justificación<textarea className="input-field" rows={3} maxLength={3900} value={detail} onChange={event => setDetail(event.target.value)} /></label>
      <div className="ticket-case__quick-actions">
        {canWrite && ticket.estado !== 'cerrado' && <>
          {!response && <button type="button" className="button-primary" disabled={busy || detail.trim().length < 2} onClick={() => void register('respuesta')}>Registrar primera respuesta</button>}
          <button type="button" className="button-primary" disabled={busy || detail.trim().length < 2} onClick={() => void register('cierre')}>Registrar solución y cerrar</button>
        </>}
        {canApprove && hours > 48 && !historical && !approval && <button type="button" className="button-primary" disabled={busy || detail.trim().length < 2} onClick={() => void register('justificacion')}>Aprobar demora con justificación</button>}
      </div><small>Se registra la hora actual. Registrar respuesta confirma un contacto realizado; todavía no envía mensajes.</small>
    </>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
