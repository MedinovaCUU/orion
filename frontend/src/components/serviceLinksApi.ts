import { supabase } from '../supabaseClient';
import type { ServiceTicketLink } from './serviceHistoryRecord';

// Ticket → visit links (migration 20261012050000). Optional context: if the table is missing or a
// request fails, the history renders exactly as before.
export async function fetchServiceTicketLinks(serviceIds: string[]): Promise<Map<string, ServiceTicketLink[]>> {
  const links = new Map<string, ServiceTicketLink[]>();
  for (let start = 0; start < serviceIds.length; start += 100) {
    const { data, error } = await supabase
      .from('ticket_service_links')
      .select('servicio_id, ticket_id, dias, confianza, tickets(numero_caso)')
      .in('servicio_id', serviceIds.slice(start, start + 100));
    if (error || !data) return links;
    for (const row of data as Array<{ servicio_id: string; ticket_id: string; dias: number; confianza: 'segura' | 'probable'; tickets?: { numero_caso?: string | null } | null }>) {
      const list = links.get(row.servicio_id) || [];
      list.push({ ticketId: row.ticket_id, folio: row.tickets?.numero_caso || null, days: row.dias, confidence: row.confianza });
      links.set(row.servicio_id, list);
    }
  }
  return links;
}
