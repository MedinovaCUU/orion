export const closureReasons = {
  solucionado: 'Solucionado',
  visita_programada: 'Visita programada',
  sin_respuesta: 'Sin respuesta del cliente',
  administrativo: 'Otro cierre administrativo',
} as const;
export type ClosureReason = keyof typeof closureReasons;
export interface TicketServiceEvent {
  id?: string;
  ticket_id: string;
  kind: string;
  detail: string;
  actor_id: string | null;
  occurred_at: string;
  closure_reason?: ClosureReason | null;
  profiles?: { nombre_completo: string | null } | null;
}
export interface ControlTicket {
  id: string; asunto: string; descripcion: string | null; estado: string;
  creado_en: string; numero_caso?: string | null; numero_serie_equipo?: string | null;
}
export type SlaState = 'dentro' | 'por_vencer' | 'vencido' | 'justificado' | 'sin_dato';
export const slaLabels: Record<SlaState, string> = {
  dentro: 'Dentro de 48 h', por_vencer: 'Por vencer', vencido: 'Fuera de plazo',
  justificado: 'Demora justificada', sin_dato: 'Sin fecha verificable',
};
export const hoursBetween = (start: string, end: string) => {
  const value = (Date.parse(end) - Date.parse(start)) / 3600000;
  return Number.isFinite(value) && value >= 0 ? value : null;
};
export const formatDuration = (hours: number | null) => {
  if (hours === null) return 'Sin dato';
  const total = Math.floor(hours * 60);
  const days = Math.floor(total / 1440);
  return `${days ? `${days} d ` : ''}${Math.floor(total % 1440 / 60)} h ${total % 60} min`;
};
export const eventAuthor = (event?: TicketServiceEvent) => event
  ? event.profiles?.nombre_completo || (event.actor_id ? 'Personal sin nombre' : 'Sistema / integración')
  : 'Sin registro';
export function ticketControlFacts(ticket: ControlTicket, events: TicketServiceEvent[], now: number) {
  const response = events.find(event => event.kind === 'respuesta');
  const closure = events.find(event => event.kind === 'cierre');
  const approval = events.find(event => event.kind === 'justificacion');
  const review = events.find(event => event.kind === 'revision_cierre');
  const closed = ticket.estado === 'cerrado';
  const hours = closed && !closure ? null : hoursBetween(ticket.creado_en, closure?.occurred_at || new Date(now).toISOString());
  const responseHours = response ? hoursBetween(ticket.creado_en, response.occurred_at) : null;
  const sla: SlaState = hours === null ? 'sin_dato' : hours > 48 ? approval ? 'justificado' : 'vencido' : !closed && hours >= 40 ? 'por_vencer' : 'dentro';
  const outcome = !closed ? 'En atención' : closure?.closure_reason ? closureReasons[closure.closure_reason] : 'Cierre sin clasificar';
  return { response, closure, approval, review, closed, hours, responseHours, sla, outcome,
    solved: closed && closure?.closure_reason === 'solucionado',
    owner: eventAuthor(closed ? closure : response), ownerId: (closed ? closure : response)?.actor_id || (closed && closure ? 'sistema' : 'sin_registro'),
  };
}
export type ControlFacts = ReturnType<typeof ticketControlFacts>;
export function summarizeControl(rows: ControlFacts[]) {
  const closed = rows.filter(row => row.closed);
  const solved = closed.filter(row => row.solved && row.hours !== null);
  const eligible = solved.filter(row => row.sla !== 'justificado');
  const onTime = eligible.filter(row => row.hours! <= 48).length;
  const responses = rows.flatMap(row => row.responseHours === null ? [] : [row.responseHours]);
  return {
    total: rows.length, closed: closed.length, solved: solved.length,
    reviewPending: closed.filter(row => !row.review).length,
    late: rows.filter(row => row.sla === 'vencido').length,
    justified: rows.filter(row => row.sla === 'justificado').length,
    missing: closed.filter(row => row.hours === null).length,
    compliance: eligible.length ? onTime / eligible.length * 100 : null,
    eligible: eligible.length,
    averageResponse: responses.length ? responses.reduce((sum, hours) => sum + hours, 0) / responses.length : null,
  };
}
