import { createClient } from 'npm:@supabase/supabase-js@2';
import { metaErrorMessage } from '../ticket-whatsapp/core.ts';
import { LANGUAGE, MESSAGE_TEMPLATE, NEW_TEMPLATE, TEMPLATE_DEFINITIONS, staffPhone, templatePayload, textPayloads, type AdvisoryJob } from './core.ts';

const env = (name: string) => Deno.env.get(name) || '';
type Graph = (path: string, body?: unknown) => Promise<{ ok: boolean; status: number; data: Record<string, any> }>;

// Template status per name; submits the advisory templates to Meta the first time they are missing.
async function advisoryTemplates(graph: Graph, waba: string) {
  const statuses: Record<string, string> = {};
  for (const definition of TEMPLATE_DEFINITIONS) {
    const listed = await graph(`${waba}/message_templates?name=${definition.name}&fields=name,status,language&limit=50`);
    if (!listed.ok) throw new Error('templates_unavailable');
    const found = (listed.data.data || []).find((item: { name: string; language: string }) => item.name === definition.name && item.language === LANGUAGE);
    if (found) { statuses[definition.name] = found.status; continue; }
    const created = await graph(`${waba}/message_templates`, definition);
    statuses[definition.name] = created.ok ? String(created.data.status || 'PENDING') : 'MISSING';
    console.log(`[advisory-whatsapp] plantilla ${definition.name}: ${created.ok ? 'enviada a revisión' : `error ${created.data.error?.code || created.status}`}`);
  }
  return statuses;
}

export async function dispatchAdvisories(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = env('TICKET_WA_WORKER_SECRET');
  if (!secret || request.headers.get('x-worker-token') !== secret) return new Response('Unauthorized', { status: 401 });
  const token = env('TICKET_WA_ACCESS_TOKEN'), phone = env('TICKET_WA_PHONE_NUMBER_ID'), waba = env('TICKET_WA_WABA_ID'), version = env('TICKET_WA_GRAPH_VERSION') || 'v23.0';
  if (!token || !/^\d+$/.test(phone) || !/^\d+$/.test(waba) || !/^v\d+\.\d+$/.test(version)) return new Response('Configuration unavailable', { status: 503 });
  const graph: Graph = async (path, body) => {
    const response = await fetch(`https://graph.facebook.com/${version}/${path}`, {
      method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
    });
    return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
  };
  // Without template status nothing is claimed, so no job is left half-processed.
  let templates: Record<string, string>;
  try { templates = await advisoryTemplates(graph, waba); } catch { return new Response('Meta configuration unavailable', { status: 503 }); }

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data: jobs, error } = await db.rpc('claim_advisory_whatsapp');
  if (error) return new Response('Queue unavailable', { status: 503 });
  const results: Array<{ id: string; status: string }> = [];
  for (const job of (jobs || []) as AdvisoryJob[]) {
    const finish = async (status: string, update: Record<string, unknown> = {}) => {
      const retry = status === 'waiting' ? 300000 : 900000;
      const { error: saveError } = await db.from('advisory_whatsapp_outbox').update({
        status, updated_at: new Date().toISOString(), next_attempt_at: new Date(Date.now() + retry).toISOString(), error_message: null, ...update,
      }).eq('id', job.id).eq('status', 'processing');
      results.push({ id: job.id, status: saveError ? 'audit_error' : status });
    };
    const to = staffPhone(job.recipient_phone);
    if (!to) { await finish('needs_phone', { error_message: 'La cuenta de esta persona no tiene un celular válido en Supabase Auth.' }); continue; }
    if (job.opted_out) { await finish('skipped', { error_message: 'Respondió BAJA por WhatsApp.' }); continue; }
    if (job.event === 'message' && !job.body?.trim()) { await finish('skipped', { error_message: 'El mensaje ya no está en la asesoría.' }); continue; }
    // Free text inside the 24 h window; outside it, only an approved template.
    const useText = job.window_open;
    const template = job.event === 'new_advisory' ? NEW_TEMPLATE : MESSAGE_TEMPLATE;
    if (!useText && templates[template] !== 'APPROVED') {
      await finish('waiting', { error_message: 'Plantilla en revisión de Meta; se reintenta cada 5 minutos.' });
      continue;
    }
    const payloads = useText ? textPayloads(job, to) : [templatePayload(job, to)];
    let status = 'unknown', message: string | null = null, provider: string | null = null;
    const extra: string[] = [];
    try {
      const main = await graph(`${phone}/messages`, payloads[0]);
      if (main.ok && main.data.messages?.[0]?.id) { status = 'accepted'; provider = main.data.messages[0].id; }
      else if (!main.ok && main.status < 500) { status = 'failed'; message = metaErrorMessage(main.data.error?.code); }
      else message = 'Meta no confirmó el resultado. No se repetirá automáticamente.';
      // Attachments only after the text was accepted; a failed attachment does not undo the message.
      for (const payload of status === 'accepted' ? payloads.slice(1) : []) {
        const sent = await graph(`${phone}/messages`, payload).catch(() => null);
        if (sent?.ok && sent.data.messages?.[0]?.id) extra.push(sent.data.messages[0].id);
      }
    } catch { message = 'Se perdió la confirmación de Meta. No se repetirá automáticamente.'; }
    await finish(status, { mode: useText ? 'text' : 'template', sent_to: to, provider_message_id: provider, extra_message_ids: extra, error_message: message });
  }
  return Response.json({ results, templates });
}
