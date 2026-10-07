import type { ControlTicket, TicketServiceEvent } from '../../../components/ticketControlModel.ts';
import { ticketControlFacts } from '../../../components/ticketControlModel.ts';

export interface EngineerTicket extends ControlTicket {
  assignedTo: string;
  events: TicketServiceEvent[];
}
export interface EngineerTicketFeed {
  tickets: EngineerTicket[];
  loading: boolean;
  error: string;
  updatedAt: string | null;
}
export function summarizeEngineerTickets(tickets: EngineerTicket[], profileId: string | undefined, now: number) {
  const rows = profileId ? tickets.filter(t => t.assignedTo === profileId && t.estado !== 'cerrado').map(ticket => {
    const events = [...ticket.events].sort((a,b) => a.occurred_at.localeCompare(b.occurred_at));
    const facts = ticketControlFacts(ticket, events, now);
    return { ticket, facts, latest: events.at(-1), needsResponse: !facts.response, attention: !facts.response || facts.sla === 'vencido' || facts.sla === 'por_vencer' };
  }).sort((a,b) => Number(b.facts.sla === 'vencido') - Number(a.facts.sla === 'vencido') || Number(b.needsResponse) - Number(a.needsResponse) || a.ticket.creado_en.localeCompare(b.ticket.creado_en)) : [];
  return { rows, unanswered: rows.filter(r=>r.needsResponse).length, late: rows.filter(r=>r.facts.sla==='vencido').length };
}
