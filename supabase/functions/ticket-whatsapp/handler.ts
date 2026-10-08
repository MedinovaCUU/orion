import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildMessage, CONTACT_TEMPLATE, CLOSURE_TEMPLATE, InputError, LANGUAGE, metaErrorMessage, validateInput } from './core.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const columns = 'id,recipient,mode,body,status,provider_message_id,error_code,error_message,ticket_id,created_at';
const env = (name: string) => Deno.env.get(name) || '';

export async function handleTicketWhatsApp(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'Método no permitido.' });
  try {
    const authorization = request.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) return json(401, { error: 'Inicia sesión en Orion.' });
    const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json(401, { error: 'La sesión no es válida. Vuelve a iniciar sesión.' });
    const { data: profile, error: profileError } = await userClient.from('profiles').select('rol').eq('id', user.id).single();
    if (profileError || profile?.rol !== 'admin') return json(403, { error: 'Solo administración puede enviar mensajes manuales.' });
    const rawBody = await request.text();
    if (rawBody.length > 12000) return json(413, { error: 'Solicitud demasiado grande.' });
    let raw: Record<string, unknown>;
    try { raw = JSON.parse(rawBody); } catch { return json(400, { error: 'Solicitud inválida.' }); }
    if (!raw || Array.isArray(raw) || typeof raw !== 'object') return json(400, { error: 'Solicitud inválida.' });
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
    if (raw.action === 'history') {
      const { data, error } = await admin.from('ticket_whatsapp_messages').select(columns).order('created_at', { ascending: false }).limit(40);
      return error ? json(503, { error: 'No se pudo consultar el historial.' }) : json(200, { messages: data });
    }
    const token = env('TICKET_WA_ACCESS_TOKEN');
    const phoneId = env('TICKET_WA_PHONE_NUMBER_ID');
    const wabaId = env('TICKET_WA_WABA_ID');
    if (!token || !/^\d+$/.test(phoneId) || !/^\d+$/.test(wabaId)) return json(503, { error: 'Falta configurar WhatsApp en el servidor.' });
    const version = env('TICKET_WA_GRAPH_VERSION') || 'v23.0';
    if (!/^v\d+\.\d+$/.test(version)) return json(503, { error: 'La versión de la API no está configurada correctamente.' });
    const graph = async (path: string, body?: unknown) => {
      const response = await fetch(`https://graph.facebook.com/${version}/${path}`, {
        method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      return { response, data };
    };
    const template = async (name: string) => {
      const { response, data } = await graph(`${wabaId}/message_templates?name=${name}&fields=name,status,language,category&limit=100`);
      if (!response.ok) throw new Error(metaErrorMessage(data.error?.code));
      return data.data?.find((item: { name: string; language: string }) => item.name === name && item.language === LANGUAGE) || { name, language: LANGUAGE, status: 'MISSING' };
    };
    if (raw.action === 'config') {
      try {
        const [contact, closure, phone] = await Promise.all([template(CONTACT_TEMPLATE), template(CLOSURE_TEMPLATE), graph(`${phoneId}?fields=display_phone_number,verified_name`)]);
        if (!phone.response.ok) return json(502, { error: metaErrorMessage(phone.data.error?.code) });
        return json(200, { sender: phone.data.display_phone_number, name: phone.data.verified_name, templates: { contact, closure } });
      } catch (cause) { return json(502, { error: cause instanceof Error && cause.message.startsWith('El token') ? cause.message : 'No se pudo consultar Meta. Intenta actualizar el estado.' }); }
    }
    if (raw.action !== 'send') return json(400, { error: 'Acción inválida.' });
    const input = validateInput(raw);
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input))))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const replay = async () => {
      const { data: existing, error } = await admin.from('ticket_whatsapp_messages').select(`${columns},actor_id,payload_hash`).eq('id', input.requestId).maybeSingle();
      if (error) throw new Error('audit_unavailable');
      if (!existing) return null;
      if (existing.actor_id !== user.id || existing.payload_hash !== hash) return json(409, { error: 'Ese identificador ya corresponde a otro envío.' });
      const { actor_id: _actor, payload_hash: _hash, ...message } = existing;
      return json(200, { message, replay: true });
    };
    const previous = await replay();
    if (previous) return previous;
    let ticket = null;
    if (input.mode === 'closure') {
      const result = await userClient.from('tickets').select('id,estado,numero_caso,numero_serie_equipo').eq('id', input.ticketId).maybeSingle();
      if (result.error || !result.data) return json(404, { error: 'Ticket no encontrado o sin acceso.' });
      ticket = result.data;
    }
    const chosenTemplate = input.mode === 'text' ? null : await template(input.mode === 'contact' ? CONTACT_TEMPLATE : CLOSURE_TEMPLATE);
    const { body, payload } = buildMessage(input, chosenTemplate?.status, ticket);
    const { error: reserveError } = await admin.from('ticket_whatsapp_messages').insert({ id: input.requestId, actor_id: user.id, ticket_id: input.ticketId, recipient: input.recipient, mode: input.mode, body, payload_hash: hash });
    if (reserveError) {
      if (reserveError.code === '23505') return await replay() || json(409, { error: 'Este envío ya está en proceso.' });
      return json(503, { error: 'No se pudo registrar el envío. No se contactó a Meta.' });
    }
    let update: { status: string; provider_message_id?: string; error_code?: string; error_message?: string };
    try {
      const { response, data } = await graph(`${phoneId}/messages`, payload);
      if (response.ok && data.messages?.[0]?.id) update = { status: 'accepted', provider_message_id: data.messages[0].id };
      else if (response.status >= 500 || (response.ok && !data.messages?.[0]?.id)) update = { status: 'unknown', error_message: 'Meta no confirmó el resultado. Verifica con el destinatario antes de intentar otro envío.' };
      else update = { status: 'failed', error_code: String(data.error?.code || response.status), error_message: metaErrorMessage(data.error?.code) };
    } catch {
      update = { status: 'unknown', error_message: 'Se perdió la confirmación del envío. Verifica con el destinatario antes de intentar otro envío.' };
    }
    const { data: saved, error: saveError } = await admin.from('ticket_whatsapp_messages').update({ ...update, updated_at: new Date().toISOString() }).eq('id', input.requestId).select(columns).single();
    if (saveError) return json(200, { message: { id: input.requestId, recipient: input.recipient, mode: input.mode, body, ticket_id: input.ticketId, created_at: new Date().toISOString(), ...update }, warning: 'El resultado no se guardó en el historial. Conserva esta confirmación y no repitas el envío.' });
    return json(200, { message: saved });
  } catch (cause) {
    if (cause instanceof InputError) return json(400, { error: cause.message });
    // No raw provider payloads or credentials in client errors / function logs.
    return json(503, { error: 'No se pudo completar la solicitud. Consulta el historial antes de intentar un envío nuevo.' });
  }
}
