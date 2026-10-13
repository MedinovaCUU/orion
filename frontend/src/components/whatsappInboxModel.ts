// Pure helpers for the WhatsApp inbox (tested in tests/whatsapp-inbox-model.test.mjs).
import { REPLY_WINDOW_MS } from '../../../supabase/functions/ticket-whatsapp/core.ts';

export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';
export interface WhatsAppConversation {
  id: string; business_phone_id: string; is_ticket_line: boolean; phone: string; display_name: string | null;
  ticket_id: string | null; numero_caso: string | null; ticket_estado: string | null;
  last_inbound_at: string | null; last_message_at: string | null; last_preview: string | null; last_kind: string | null;
  last_direction: 'in' | 'out' | null; unread: number; opted_out: boolean;
}
export interface WhatsAppThreadMessage {
  id: string; direction: 'in' | 'out'; source: 'customer' | 'manual' | 'auto'; kind: string; body: string | null;
  extra: Record<string, unknown> | null; media_mime: string | null; media_filename: string | null; media_path: string | null;
  media_error: string | null; context_message_id: string | null; provider_message_id: string | null; ticket_id: string | null;
  at: string; status: string | null; delivery_status: DeliveryStatus | null; author: string | null;
  template: string | null; parameters: string[] | null; error_message: string | null;
}
export interface WhatsAppThreadTicket { id: string; numero_caso: string | null; estado: string; asunto: string | null; creado_en: string | null }
export interface WhatsAppThread {
  conversation: Omit<WhatsAppConversation, 'last_preview' | 'last_kind' | 'last_direction' | 'unread'> & { last_read_at: string | null; opted_out_at: string | null };
  messages: WhatsAppThreadMessage[];
  tickets: WhatsAppThreadTicket[];
}
export interface InboundStatus { expected: string; secretConfigured: boolean; apps: Array<{ name: string | null; callback: string | null }> }

export function replyWindow(lastInboundAt: string | null | undefined, now = Date.now()) {
  const at = lastInboundAt ? Date.parse(lastInboundAt) : NaN;
  if (!Number.isFinite(at)) return { open: false, remainingMs: 0, closesAt: null as Date | null };
  const remainingMs = Math.max(0, at + REPLY_WINDOW_MS - now);
  return { open: remainingMs > 0, remainingMs, closesAt: new Date(at + REPLY_WINDOW_MS) };
}

export function formatRemaining(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'menos de 1 min';
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

export function formatPhone(digits: string): string {
  if (/^52\d{10}$/.test(digits)) return `+52 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  if (/^1\d{10}$/.test(digits)) return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  return `+${digits}`;
}

export function initials(name: string | null, phone: string): string {
  const letters = (name || '').normalize('NFC').split(/\s+/).map(word => word.match(/\p{L}/u)?.[0]).filter(Boolean) as string[];
  if (!letters.length) return phone.slice(-2);
  return (letters[0] + (letters.length > 1 ? letters[letters.length - 1] : '')).toUpperCase();
}

const KIND_LABELS: Record<string, string> = {
  image: 'Foto', audio: 'Audio', video: 'Video', document: 'Documento', sticker: 'Sticker', location: 'Ubicación',
  contacts: 'Contacto', reaction: 'Reacción', button: 'Respuesta rápida', interactive: 'Respuesta rápida', order: 'Pedido',
  system: 'Aviso de WhatsApp', unsupported: 'Mensaje no compatible', contact: 'Invitación a conversar', closure: 'Aviso de cierre',
};
export const kindLabel = (kind: string | null | undefined) => (kind && KIND_LABELS[kind]) || 'Mensaje';

export function conversationPreview(conversation: Pick<WhatsAppConversation, 'last_preview' | 'last_kind' | 'last_direction'>): string {
  const text = conversation.last_preview?.trim()
    || (conversation.last_kind && conversation.last_kind !== 'text' ? kindLabel(conversation.last_kind) : '');
  return `${conversation.last_direction === 'out' ? 'Tú: ' : ''}${text || 'Sin texto'}`;
}

const NOTICES: Record<string, { title: string; detail: (p: string[]) => string }> = {
  orion_ticket_recibido_v1: { title: 'Ticket recibido', detail: p => `Caso ${p[0] || '—'} · equipo ${p[1] || '—'}` },
  orion_ticket_asignado_v1: { title: 'Ticket asignado', detail: p => `Caso ${p[0] || '—'} · responsable ${p[1] || '—'}` },
  orion_primera_respuesta_v1: { title: 'Primera atención', detail: p => `Caso ${p[0] || '—'}` },
  orion_cierre_ticket_v1: { title: 'Ticket cerrado', detail: p => `Caso ${p[0] || '—'} · equipo ${p[1] || '—'}` },
  orion_encuesta_servicio_v1: { title: 'Encuesta de servicio', detail: p => `Caso ${p[0] || '—'}` },
  orion_contacto_soporte_v1: { title: 'Invitación a conversar', detail: () => 'Plantilla de contacto' },
};
export function automaticNotice(template: string | null, parameters: string[] | null) {
  const notice = template ? NOTICES[template] : undefined;
  return notice ? { title: notice.title, detail: notice.detail(parameters || []) } : { title: 'Aviso automático', detail: template || '' };
}

export function deliveryLabel(message: Pick<WhatsAppThreadMessage, 'status' | 'delivery_status'>): { label: string; tone: 'ok' | 'muted' | 'warn' | 'error' } {
  if (message.status === 'failed' || message.delivery_status === 'failed') return { label: 'No se entregó', tone: 'error' };
  if (message.delivery_status === 'read') return { label: 'Leído', tone: 'ok' };
  if (message.delivery_status === 'delivered') return { label: 'Entregado', tone: 'ok' };
  if (message.delivery_status === 'sent') return { label: 'Enviado', tone: 'muted' };
  if (message.status === 'unknown' || message.status === 'sending') return { label: 'Sin confirmación · no repetir', tone: 'warn' };
  return { label: 'Aceptado por Meta', tone: 'muted' };
}

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
export function dayLabel(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(now)) return 'Hoy';
  if (dayKey(date) === dayKey(yesterday)) return 'Ayer';
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
}
export const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
export function listTimeLabel(iso: string | null, now = new Date()): string {
  if (!iso) return '';
  const label = dayLabel(iso, now);
  return label === 'Hoy' ? timeLabel(iso) : label === 'Ayer' ? 'Ayer' : new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });
}

/** Messages grouped by calendar day, keeping order. */
export function groupByDay<T extends { at: string }>(messages: T[], now = new Date()): Array<{ day: string; items: T[] }> {
  const groups: Array<{ day: string; items: T[] }> = [];
  for (const message of messages) {
    const day = dayLabel(message.at, now);
    if (groups[groups.length - 1]?.day === day) groups[groups.length - 1].items.push(message);
    else groups.push({ day, items: [message] });
  }
  return groups;
}

export function mapsUrl(extra: Record<string, unknown> | null): string | null {
  const latitude = Number(extra?.latitude), longitude = Number(extra?.longitude);
  return extra && Number.isFinite(latitude) && Number.isFinite(longitude) && extra.latitude !== null ? `https://www.google.com/maps?q=${latitude},${longitude}` : null;
}

export function matchesSearch(conversation: WhatsAppConversation, query: string): boolean {
  const needle = query.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!needle) return true;
  const digits = needle.replace(/\D/g, '');
  const text = [conversation.display_name, conversation.numero_caso, conversation.last_preview].filter(Boolean).join(' ')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return text.includes(needle) || (digits.length >= 3 && conversation.phone.includes(digits));
}

export type InboundState = 'connected' | 'app-default' | 'elsewhere' | 'unsubscribed' | 'unknown';
export function inboundState(status: InboundStatus | null | undefined): InboundState {
  if (!status) return 'unknown';
  if (!status.apps.length) return 'unsubscribed';
  if (status.apps.some(app => app.callback === status.expected)) return 'connected';
  return status.apps.some(app => app.callback) ? 'elsewhere' : 'app-default';
}

export const ticketStateLabels: Record<string, string> = {
  abierto: 'Abierto', en_progreso: 'En progreso', pendiente_piezas: 'Pendiente por piezas', en_observacion: 'En observación', cerrado: 'Cerrado',
};
