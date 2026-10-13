// Isolated WhatsApp inbox with an in-memory API: no Supabase, no Meta, nothing is sent.
import { createRoot } from 'react-dom/client';
import WhatsAppInbox from '../../src/components/WhatsAppInbox';
import type { WhatsAppInboxApi } from '../../src/components/whatsappInboxApi';
import type { InboundStatus, WhatsAppConversation, WhatsAppThread, WhatsAppThreadMessage } from '../../src/components/whatsappInboxModel';
import '../../src/index.css';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
const photo = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="#1d2633"/><rect x="40" y="40" width="400" height="240" rx="14" fill="#2f3d52"/><text x="240" y="150" fill="#ff6972" font-family="sans-serif" font-size="26" text-anchor="middle">ERROR 621</text><text x="240" y="190" fill="#c9d3df" font-family="sans-serif" font-size="16" text-anchor="middle">Too much time to empty Waste Tank</text></svg>')}`;
const base = (overrides: Partial<WhatsAppThreadMessage>): WhatsAppThreadMessage => ({
  id: crypto.randomUUID(), direction: 'in', source: 'customer', kind: 'text', body: null, extra: null, media_mime: null, media_filename: null,
  media_path: null, media_error: null, context_message_id: null, provider_message_id: null, ticket_id: null, at: minutesAgo(1), status: null,
  delivery_status: null, author: null, template: null, parameters: null, error_message: null, ...overrides,
});
const tickets = [
  { id: 't-1', numero_caso: 'OR-2026-0412', estado: 'abierto', asunto: 'Soporte Ingeniero: Reporte en equipo 834000123', creado_en: minutesAgo(600) },
  { id: 't-0', numero_caso: 'OR-2026-0287', estado: 'cerrado', asunto: 'Soporte Químico: Control fuera de rango', creado_en: minutesAgo(30000) },
];
const conversations: WhatsAppConversation[] = [
  { id: 'c-1', business_phone_id: '1', is_ticket_line: true, phone: '526141772897', display_name: 'Laura Quiñones', ticket_id: 't-1', numero_caso: 'OR-2026-0412', ticket_estado: 'abierto', last_inbound_at: minutesAgo(4), last_message_at: minutesAgo(4), last_preview: '¿A qué hora llega el ingeniero?', last_kind: 'text', last_direction: 'in', unread: 2, opted_out: false },
  { id: 'c-2', business_phone_id: '1', is_ticket_line: true, phone: '525512345678', display_name: 'Hospital San José · Lab', ticket_id: null, numero_caso: null, ticket_estado: null, last_inbound_at: minutesAgo(60 * 30), last_message_at: minutesAgo(60 * 30), last_preview: null, last_kind: 'document', last_direction: 'in', unread: 0, opted_out: false },
  { id: 'c-3', business_phone_id: '1', is_ticket_line: true, phone: '528112223344', display_name: null, ticket_id: 't-0', numero_caso: 'OR-2026-0287', ticket_estado: 'cerrado', last_inbound_at: minutesAgo(90), last_message_at: minutesAgo(90), last_preview: 'BAJA', last_kind: 'text', last_direction: 'in', unread: 0, opted_out: true },
  { id: 'c-4', business_phone_id: '2', is_ticket_line: false, phone: '526143334455', display_name: 'Alfredo (asesorías)', ticket_id: null, numero_caso: null, ticket_estado: null, last_inbound_at: minutesAgo(200), last_message_at: minutesAgo(200), last_preview: 'Recibido, reviso el video', last_kind: 'text', last_direction: 'in', unread: 1, opted_out: false },
];
const threads: Record<string, WhatsAppMessages> = {
  'c-1': [
    base({ direction: 'out', source: 'auto', kind: 'received', template: 'orion_ticket_recibido_v1', parameters: ['OR-2026-0412', '834000123'], status: 'accepted', delivery_status: 'read', provider_message_id: 'w-out-1', at: minutesAgo(600) }),
    base({ direction: 'out', source: 'auto', kind: 'received', template: 'orion_ticket_asignado_v1', parameters: ['OR-2026-0412', 'Martha Carbajal'], status: 'accepted', delivery_status: 'delivered', provider_message_id: 'w-out-2', at: minutesAgo(560) }),
    base({ body: 'Gracias. Les mando foto de la pantalla, sigue saliendo el error.', context_message_id: 'w-out-2', at: minutesAgo(30) }),
    base({ kind: 'image', body: 'Así aparece desde la mañana', media_path: 'c-1/photo.jpg', media_mime: 'image/jpeg', at: minutesAgo(29) }),
    base({ direction: 'out', source: 'manual', body: 'Hola Laura, gracias por la foto. Martha va en camino; ¿podrían vaciar el depósito de residuos mientras tanto?', author: 'Ricardo Montañez', status: 'accepted', delivery_status: 'read', at: minutesAgo(20) }),
    base({ kind: 'reaction', body: '👍', context_message_id: 'w-out-1', at: minutesAgo(18) }),
    base({ kind: 'audio', media_error: 'El archivo pesa más de 25 MB; pídelo por otro medio.', at: minutesAgo(6) }),
    base({ body: '¿A qué hora llega el ingeniero?', at: minutesAgo(4) }),
  ],
  'c-2': [
    base({ kind: 'document', media_path: 'c-2/cotizacion.pdf', media_filename: 'Orden de compra 4471.pdf', at: minutesAgo(60 * 30) }),
    base({ kind: 'location', body: 'Hospital San José · Av. Universidad 1200', extra: { latitude: 28.6366, longitude: -106.0763 }, at: minutesAgo(60 * 30 - 1) }),
    base({ kind: 'unsupported', at: minutesAgo(60 * 30 - 2) }),
  ],
  'c-3': [
    base({ direction: 'out', source: 'auto', kind: 'closed', template: 'orion_cierre_ticket_v1', parameters: ['OR-2026-0287', 'A15-8310507965'], status: 'accepted', delivery_status: 'read', at: minutesAgo(200) }),
    base({ body: 'BAJA', at: minutesAgo(90) }),
  ],
  'c-4': [base({ body: 'Recibido, reviso el video', at: minutesAgo(200) })],
};
type WhatsAppMessages = WhatsAppThreadMessage[];
let inbound: InboundStatus = { expected: 'https://demo.supabase.co/functions/v1/whatsapp-webhook', secretConfigured: true, apps: [{ name: 'Orion App', callback: 'https://demo.supabase.co/functions/v1/whatsapp-webhook-viejo' }] };
const listeners = new Set<() => void>();
const wait = (ms = 250) => new Promise(resolve => setTimeout(resolve, ms));

const api: WhatsAppInboxApi = {
  async listConversations() { await wait(); return conversations.map(item => ({ ...item })).sort((a, b) => String(b.last_message_at).localeCompare(String(a.last_message_at))); },
  async loadThread(id) {
    await wait();
    const conversation = conversations.find(item => item.id === id)!;
    return { conversation: { ...conversation, last_read_at: null, opted_out_at: conversation.opted_out ? minutesAgo(90) : null }, messages: threads[id] || [], tickets: conversation.is_ticket_line ? tickets : [] } as WhatsAppThread;
  },
  async markRead(id) { const conversation = conversations.find(item => item.id === id); if (conversation) conversation.unread = 0; },
  async linkTicket(id, ticketId) { const conversation = conversations.find(item => item.id === id)!; const ticket = tickets.find(item => item.id === ticketId); Object.assign(conversation, { ticket_id: ticket?.id || null, numero_caso: ticket?.numero_caso || null, ticket_estado: ticket?.estado || null }); },
  async reply(id, text) {
    await wait(600);
    if (/falla/i.test(text)) throw new Error('No se pudo completar la solicitud. Consulta el historial antes de intentar un envío nuevo.');
    threads[id] = [...(threads[id] || []), base({ direction: 'out', source: 'manual', body: text, author: 'Ricardo Montañez', status: 'accepted', at: new Date().toISOString() })];
    Object.assign(conversations.find(item => item.id === id)!, { last_message_at: new Date().toISOString(), last_preview: text, last_kind: 'text', last_direction: 'out' });
    return { message: { id: crypto.randomUUID(), status: 'accepted' } };
  },
  async mediaUrls(paths) { return Object.fromEntries(paths.filter(path => path.endsWith('.jpg') || path.endsWith('.pdf')).map(path => [path, path.endsWith('.jpg') ? photo : 'data:application/pdf,'])); },
  async unreadCount() { return conversations.reduce((sum, item) => sum + item.unread, 0); },
  async inboundStatus() { await wait(); return inbound; },
  async connectInbound() { await wait(500); inbound = { ...inbound, apps: [{ name: 'Orion App', callback: inbound.expected }] }; },
  subscribe(onChange) { listeners.add(onChange); return () => listeners.delete(onChange); },
};
// Simulates a customer writing while the inbox is open.
(window as unknown as { simulateInbound: (text: string) => void }).simulateInbound = text => {
  threads['c-1'] = [...threads['c-1'], base({ body: text, at: new Date().toISOString() })];
  Object.assign(conversations[0], { last_inbound_at: new Date().toISOString(), last_message_at: new Date().toISOString(), last_preview: text, last_direction: 'in', unread: conversations[0].unread + 1 });
  listeners.forEach(listener => listener());
};

createRoot(document.getElementById('root')!).render(
  <main style={{ maxWidth: 1240, margin: '1.5rem auto', padding: '0 16px' }}>
    <p style={{ color: 'var(--text-secondary)', fontSize: '.85rem' }}>Prueba aislada: datos simulados, no envía mensajes reales. Escribe «falla» para simular un error de envío.</p>
    <WhatsAppInbox api={api} onOpenTicket={id => window.alert(`Abrir ticket ${id}`)} />
  </main>,
);
