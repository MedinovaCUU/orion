import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { MEDIA_LIMIT_BYTES, mediaExtension, parseWebhook, verifySignature, type InboundEvent } from './core.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;
const env = (name: string) => Deno.env.get(name) || '';
const reply = (status: number, body: string) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
class MediaError extends Error {}

// Customers' files are copied to private storage right away: Meta's media ids expire after 30 days.
async function storeMedia(db: SupabaseClient, messageId: string, conversationId: string, message: InboundEvent) {
  let update: Record<string, string | null>;
  try {
    const token = message.businessPhoneId === env('TICKET_WA_PHONE_NUMBER_ID') ? env('TICKET_WA_ACCESS_TOKEN')
      : message.businessPhoneId === env('WHATSAPP_PHONE_NUMBER_ID') ? env('WHATSAPP_ACCESS_TOKEN') : '';
    const version = env('TICKET_WA_GRAPH_VERSION') || 'v23.0';
    if (!token || !/^v\d+\.\d+$/.test(version)) throw new MediaError('No hay acceso configurado para el número que recibió el archivo.');
    const auth = { Authorization: `Bearer ${token}` };
    const meta = await fetch(`https://graph.facebook.com/${version}/${message.mediaId}`, { headers: auth, signal: AbortSignal.timeout(15000) });
    const info = await meta.json().catch(() => ({}));
    if (!meta.ok || typeof info.url !== 'string') throw new MediaError('Meta no entregó el archivo.');
    if (Number(info.file_size) > MEDIA_LIMIT_BYTES) throw new MediaError('El archivo pesa más de 25 MB; pídelo por otro medio.');
    const file = await fetch(info.url, { headers: auth, signal: AbortSignal.timeout(60000) });
    if (!file.ok) throw new MediaError('Meta no entregó el archivo.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MEDIA_LIMIT_BYTES) throw new MediaError('El archivo pesa más de 25 MB; pídelo por otro medio.');
    const mime = String(info.mime_type || message.mediaMime || 'application/octet-stream').split(';')[0].trim();
    const path = `${conversationId}/${messageId}.${mediaExtension(mime)}`;
    const { error } = await db.storage.from('whatsapp-media').upload(path, bytes, { contentType: mime, upsert: true });
    if (error) throw new MediaError('No se pudo guardar el archivo en Orion.');
    update = { media_path: path, media_mime: mime, media_error: null };
  } catch (cause) {
    update = { media_error: cause instanceof MediaError ? cause.message : 'No se pudo descargar el archivo.' };
  }
  await db.from('whatsapp_inbound_messages').update(update).eq('id', messageId);
}

export async function handleWhatsAppWebhook(request: Request): Promise<Response> {
  if (request.method === 'GET') {
    // Meta's subscription handshake.
    const url = new URL(request.url);
    const verifyToken = env('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
    if (verifyToken && url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === verifyToken) {
      return reply(200, url.searchParams.get('hub.challenge') || '');
    }
    return reply(403, 'Forbidden');
  }
  if (request.method !== 'POST') return reply(405, 'Method not allowed');
  const secrets = env('WHATSAPP_APP_SECRET').split(',').map(secret => secret.trim()).filter(Boolean);
  // Fail closed. Meta keeps retrying for days, so nothing is lost while the secret is configured.
  if (!secrets.length) return reply(503, 'Webhook not configured');
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.byteLength > 1_000_000) return reply(413, 'Payload too large');
  if (!await verifySignature(raw, request.headers.get('x-hub-signature-256'), secrets)) return reply(401, 'Invalid signature');
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder().decode(raw)); } catch { return reply(400, 'Invalid JSON'); }

  const { messages, statuses } = parseWebhook(payload);
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const ticketLine = env('TICKET_WA_PHONE_NUMBER_ID');
  // Only the company's own numbers; Meta's dashboard «Probar» sample uses a fictitious one.
  const lines = new Set([ticketLine, env('WHATSAPP_PHONE_NUMBER_ID')].filter(Boolean));
  const ignored = messages.filter(message => !lines.has(message.businessPhoneId)).length;
  const downloads: Promise<void>[] = [];
  const keepAlive = (task: Promise<void>) => { downloads.push(task); if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(task); };
  for (const message of messages) {
    if (!lines.has(message.businessPhoneId)) continue;
    const { data, error } = await db.rpc('record_whatsapp_inbound', {
      p_business_phone_id: message.businessPhoneId, p_is_ticket_line: message.businessPhoneId === ticketLine,
      p_phone: message.phone, p_name: message.name, p_wa_message_id: message.waMessageId, p_kind: message.kind,
      p_body: message.body, p_extra: message.extra, p_media_id: message.mediaId, p_media_mime: message.mediaMime,
      p_media_filename: message.mediaFilename, p_context_message_id: message.contextMessageId, p_sent_at: message.sentAt,
    });
    // A non-200 makes Meta retry the whole delivery; rows already saved are skipped by their id.
    if (error) { console.error('[whatsapp-webhook] record_whatsapp_inbound', error.code); return reply(500, 'Storage unavailable'); }
    if (message.mediaId && data && !data.duplicate) keepAlive(storeMedia(db, data.id, data.conversation_id, message));
  }
  for (const status of statuses) {
    const { error } = await db.rpc('record_whatsapp_status', { p_wa_message_id: status.waMessageId, p_status: status.status, p_at: status.at, p_error: status.error });
    if (error) { console.error('[whatsapp-webhook] record_whatsapp_status', error.code); return reply(500, 'Storage unavailable'); }
  }
  if (downloads.length && typeof EdgeRuntime === 'undefined') await Promise.allSettled(downloads);
  // Counts only: phone numbers and message text stay out of the function logs.
  console.log(`[whatsapp-webhook] ${messages.length - ignored} mensaje(s), ${statuses.length} estado(s)${ignored ? `, ${ignored} de otro número ignorado(s)` : ''}`);
  return reply(200, 'ok');
}
