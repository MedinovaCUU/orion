import { supabase } from '../supabaseClient';
import { ticketWhatsAppRequest } from './ticketWhatsAppApi';
import type { InboundStatus, WhatsAppConversation, WhatsAppThread } from './whatsappInboxModel';

export interface ReplyResult { message: { id: string; status: string; error_message?: string }; warning?: string; replay?: boolean }
export interface WhatsAppInboxApi {
  listConversations(): Promise<WhatsAppConversation[]>;
  loadThread(conversationId: string): Promise<WhatsAppThread>;
  markRead(conversationId: string): Promise<void>;
  linkTicket(conversationId: string, ticketId: string | null): Promise<void>;
  reply(conversationId: string, text: string, requestId: string): Promise<ReplyResult>;
  mediaUrls(paths: string[]): Promise<Record<string, string>>;
  unreadCount(): Promise<number>;
  inboundStatus(): Promise<InboundStatus | null>;
  connectInbound(): Promise<void>;
  /** Calls back on any inbox change; returns the unsubscribe function. */
  subscribe(onChange: () => void): () => void;
}

const fail = (error: { message?: string } | null, fallback: string) => {
  if (error) throw new Error(error.message && /Solo administración|no encontrad/i.test(error.message) ? error.message : fallback);
};
let channelSequence = 0;

export const whatsappInboxApi: WhatsAppInboxApi = {
  async listConversations() {
    const { data, error } = await supabase.rpc('whatsapp_inbox', { p_limit: 300 });
    fail(error, 'No se pudo cargar la bandeja de WhatsApp.');
    return (data || []) as WhatsAppConversation[];
  },
  async loadThread(conversationId) {
    const { data, error } = await supabase.rpc('whatsapp_thread', { p_conversation: conversationId });
    fail(error, 'No se pudo cargar la conversación.');
    return data as WhatsAppThread;
  },
  async markRead(conversationId) {
    const { error } = await supabase.rpc('mark_whatsapp_conversation_read', { p_conversation: conversationId });
    fail(error, 'No se pudo marcar como leída.');
  },
  async linkTicket(conversationId, ticketId) {
    const { error } = await supabase.rpc('link_whatsapp_conversation', { p_conversation: conversationId, p_ticket: ticketId });
    fail(error, 'No se pudo ligar el ticket.');
  },
  reply: (conversationId, text, requestId) => ticketWhatsAppRequest<ReplyResult>({ action: 'reply', conversationId, text, requestId }),
  async mediaUrls(paths) {
    if (!paths.length) return {};
    const { data, error } = await supabase.storage.from('whatsapp-media').createSignedUrls(paths, 3600);
    if (error) return {};
    return Object.fromEntries((data || []).filter(item => item.signedUrl && item.path).map(item => [item.path as string, item.signedUrl]));
  },
  async unreadCount() {
    const { data, error } = await supabase.rpc('whatsapp_unread_count');
    return error ? 0 : Number(data) || 0;
  },
  async inboundStatus() {
    const config = await ticketWhatsAppRequest<{ inbound: InboundStatus | null }>({ action: 'config' });
    return config.inbound ?? null;
  },
  async connectInbound() {
    await ticketWhatsAppRequest({ action: 'connect_inbound' });
  },
  subscribe(onChange) {
    const channel = supabase.channel(`whatsapp-inbox-${++channelSequence}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations' }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_inbound_messages' }, () => onChange())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  },
};
