import { createRoot } from 'react-dom/client';
import TicketWhatsAppPanel from '../../src/components/TicketWhatsAppPanel';
import '../../src/index.css';
const originalFetch = window.fetch.bind(window);
const history: Record<string, unknown>[] = [];
window.fetch = async (source, options) => {
  const url = typeof source === 'string' ? source : source instanceof URL ? source.href : source.url;
  if (!url.includes('/functions/v1/ticket-whatsapp')) return originalFetch(source, options);
  const request = JSON.parse(String(options?.body || '{}'));
  let data: unknown;
  if (request.action === 'config') data = { sender: '+52 1 33 1990 4252', name: 'Orion-Biosystems (simulación)', templates: { contact: { name: 'orion_contacto_soporte_v1', status: 'PENDING' }, closure: { name: 'orion_cierre_ticket_v1', status: 'APPROVED' } } };
  else if (request.action === 'history') data = { messages: history };
  else {
    const message = { id: request.requestId, recipient: request.recipient.replace(/\D/g, ''), mode: request.mode, body: request.text || 'Aviso de cierre simulado', status: 'accepted', created_at: new Date().toISOString() };
    history.unshift(message); data = { message };
  }
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
createRoot(document.getElementById('root')!).render(<main style={{ maxWidth: 1200, margin: '2rem auto', padding: '1rem' }}><p>Prueba aislada: no envía mensajes reales.</p><TicketWhatsAppPanel initiallyOpen tickets={[{ id: '10000000-0000-4000-8000-000000000001', numero_caso: 'OR-001', asunto: 'Servicio de prueba cerrado', estado: 'cerrado', numero_serie_equipo: 'BA400-TEST' }, { id: '10000000-0000-4000-8000-000000000002', numero_caso: 'OR-002', asunto: 'Caso abierto no seleccionable', estado: 'abierto' }]} /></main>);
