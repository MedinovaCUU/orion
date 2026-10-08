import { supabase } from '../supabaseClient';
export type WhatsAppMode = 'contact' | 'text' | 'closure';
export interface WhatsAppMessage {
  id: string; recipient: string; mode: WhatsAppMode; body: string;
  status: 'sending' | 'accepted' | 'failed' | 'unknown';
  provider_message_id?: string; error_message?: string; created_at: string;
}
export interface WhatsAppConfig {
  sender: string; name: string;
  templates: Record<'contact' | 'closure', { name: string; status: string; category?: string }>;
}
export async function ticketWhatsAppRequest<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ticket-whatsapp', { body });
  if (error) {
    if (error.context instanceof Response) {
      const payload = await error.context.clone().json().catch(() => null);
      if (typeof payload?.error === 'string') throw new Error(payload.error);
    }
    throw new Error('No se pudo confirmar la solicitud. Consulta el historial antes de repetir un envío.');
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
