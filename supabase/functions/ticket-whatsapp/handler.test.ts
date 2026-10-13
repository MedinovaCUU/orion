import { handleTicketWhatsApp } from './handler.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
Deno.test('authorization, idempotency, closed-ticket validation and ambiguous provider response', async () => {
  Deno.env.set('SUPABASE_URL', 'https://test.supabase.co');
  Deno.env.set('SUPABASE_ANON_KEY', 'test-anon');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service');
  Deno.env.set('TICKET_WA_ACCESS_TOKEN', 'secret-test');
  Deno.env.set('TICKET_WA_PHONE_NUMBER_ID', '123456');
  Deno.env.set('TICKET_WA_WABA_ID', '654321');
  const originalFetch = globalThis.fetch;
  const rows = new Map<string, Record<string, unknown>>();
  let role = 'admin'; let validSession = true; let sends = 0; let providerFailure = false;
  let receivedPayload: Record<string, unknown> = {};
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = (async (source: RequestInfo | URL, options?: RequestInit) => {
    const url = new URL(typeof source === 'string' ? source : source instanceof URL ? source.href : source.url);
    const method = options?.method || 'GET';
    const body = options?.body ? JSON.parse(String(options.body)) : {};
    if (url.pathname === '/auth/v1/user') return validSession ? reply({ id: 'actor', aud: 'authenticated' }) : reply({ message: 'Invalid JWT' }, 401);
    if (url.pathname.endsWith('/profiles')) return reply({ rol: role });
    if (url.pathname.endsWith('/tickets')) return reply({ id: '10000000-0000-4000-8000-000000000009', estado: 'abierto', numero_caso: 'OR-1', numero_serie_equipo: 'BA400-1' });
    if (url.pathname.endsWith('/ticket_whatsapp_messages')) {
      const id = url.searchParams.get('id')?.replace('eq.', '') || body.id;
      if (method === 'POST') {
        if (rows.has(id)) return reply({ code: '23505' }, 409);
        rows.set(id, { ...body, status: 'sending', created_at: new Date().toISOString() });
        return new Response(null, { status: 201 });
      }
      if (method === 'PATCH') { rows.set(id, { ...rows.get(id), ...body }); return reply(rows.get(id)); }
      return reply(rows.get(id) || null);
    }
    if (url.pathname.endsWith('/message_templates')) return reply({ data: [{ name: url.searchParams.get('name'), language: 'es_MX', status: 'APPROVED' }] });
    if (url.pathname.endsWith('/messages')) {
      sends++; receivedPayload = body;
      if (providerFailure) throw new Error('network timeout');
      return reply({ messages: [{ id: 'wamid.test' }] });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  }) as typeof fetch;
  const call = (body: Record<string, unknown>, authorization = 'Bearer test-user') => handleTicketWhatsApp(new Request('https://test/endpoint', { method: 'POST', headers: { Authorization: authorization }, body: JSON.stringify(body) }));
  const base = { action: 'send', requestId: '10000000-0000-4000-8000-000000000001', mode: 'text', text: 'Prueba autorizada', recipient: '+52 6141772897', consent: true, recentInbound: true };
  try {
    assert((await call(base, '')).status === 401); assert(sends === 0);
    validSession = false; assert((await call(base)).status === 401); validSession = true;
    role = 'tecnico'; assert((await call(base)).status === 403); role = 'admin'; assert(sends === 0);
    assert((await call({ ...base, mode: 'closure', ticketId: '10000000-0000-4000-8000-000000000009' })).status === 400); assert(sends === 0);
    const results = await Promise.all([call(base), call(base)]);
    assert(results.every(response => response.status === 200)); assert(Number(sends) === 1, 'Concurrent requests sent twice');
    assert(receivedPayload.to === '526141772897');
    const repeated = await (await call(base)).json(); assert(repeated.replay === true); assert(Number(sends) === 1);
    assert((await call({ ...base, recipient: '+12025550184' })).status === 409); assert(Number(sends) === 1);
    providerFailure = true;
    const uncertain = { ...base, requestId: '10000000-0000-4000-8000-000000000002' };
    assert((await (await call(uncertain)).json()).message.status === 'unknown');
    assert((await (await call(uncertain)).json()).replay === true); assert(Number(sends) === 2);
  } finally { globalThis.fetch = originalFetch; }
});

Deno.test('inbox replies: 24 h window checked on the server, ticket line only, BAJA blocks templates, inbound connection', async () => {
  Deno.env.set('SUPABASE_URL', 'https://test.supabase.co');
  Deno.env.set('SUPABASE_ANON_KEY', 'test-anon');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service');
  Deno.env.set('TICKET_WA_ACCESS_TOKEN', 'secret-test');
  Deno.env.set('TICKET_WA_PHONE_NUMBER_ID', '123456');
  Deno.env.set('TICKET_WA_WABA_ID', '654321');
  Deno.env.set('WHATSAPP_WEBHOOK_VERIFY_TOKEN', 'verify-test');
  Deno.env.delete('WHATSAPP_APP_SECRET');
  const originalFetch = globalThis.fetch;
  const rows = new Map<string, Record<string, unknown>>();
  const conversation = { id: '20000000-0000-4000-8000-000000000001', phone: '526141772897', business_phone_id: '123456', ticket_id: '10000000-0000-4000-8000-000000000009', last_inbound_at: new Date(Date.now() - 3600000).toISOString() };
  let conversationPatch = null as Record<string, unknown> | null;
  let optedOut = false; const sent: Record<string, unknown>[] = []; let subscribeBody = null as Record<string, unknown> | null;
  const sends = () => sent.length;
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = (async (source: RequestInfo | URL, options?: RequestInit) => {
    const url = new URL(typeof source === 'string' ? source : source instanceof URL ? source.href : source.url);
    const method = options?.method || 'GET';
    const body = options?.body ? JSON.parse(String(options.body)) : {};
    if (url.pathname === '/auth/v1/user') return reply({ id: 'actor', aud: 'authenticated' });
    if (url.pathname.endsWith('/profiles')) return reply({ rol: 'admin' });
    if (url.pathname.endsWith('/whatsapp_conversations')) {
      if (method === 'PATCH') { conversationPatch = body; return reply([]); }
      return reply(url.searchParams.get('id') === `eq.${conversation.id}` ? conversation : null);
    }
    if (url.pathname.endsWith('/whatsapp_opt_outs')) {
      if (url.searchParams.get('phone_key') !== 'eq.6141772897') throw new Error('opt-out lookup must use the ten-digit key');
      return reply(optedOut ? { opted_out_at: '2026-10-13T00:00:00Z' } : null);
    }
    if (url.pathname.endsWith('/ticket_whatsapp_messages')) {
      const id = url.searchParams.get('id')?.replace('eq.', '') || body.id;
      if (method === 'POST') { if (rows.has(id)) return reply({ code: '23505' }, 409); rows.set(id, { ...body, status: 'sending', created_at: new Date().toISOString() }); return new Response(null, { status: 201 }); }
      if (method === 'PATCH') { rows.set(id, { ...rows.get(id), ...body }); return reply(rows.get(id)); }
      return reply(rows.get(id) || null);
    }
    if (url.pathname.endsWith('/message_templates')) return reply({ data: [{ name: url.searchParams.get('name'), language: 'es_MX', status: 'APPROVED' }] });
    if (url.pathname.endsWith('/subscribed_apps')) {
      if (method === 'POST') { subscribeBody = body; return reply({ success: true }); }
      return reply({ data: [{ whatsapp_business_api_data: { name: 'Orion App' }, override_callback_uri: 'https://elsewhere.example/webhook' }] });
    }
    if (url.pathname.endsWith('/123456')) return reply({ display_phone_number: '+52 614 000 0000', verified_name: 'Orion' });
    if (url.pathname.endsWith('/messages')) { sent.push(body); return reply({ messages: [{ id: `wamid.reply${sent.length}` }] }); }
    throw new Error(`Unexpected request: ${url.pathname}`);
  }) as typeof fetch;
  const call = async (body: Record<string, unknown>) => {
    const response = await handleTicketWhatsApp(new Request('https://test/endpoint', { method: 'POST', headers: { Authorization: 'Bearer test-user' }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  const answer = { action: 'reply', requestId: '30000000-0000-4000-8000-000000000001', conversationId: conversation.id, text: 'Hola Laura, ya vamos para allá.' };
  try {
    const first = await call(answer);
    assert(first.status === 200, JSON.stringify(first.body));
    assert(sends() === 1 && sent[0].to === '526141772897' && (sent[0].text as { body: string }).body === answer.text);
    const saved = rows.get(answer.requestId)!;
    assert(saved.conversation_id === conversation.id && saved.ticket_id === conversation.ticket_id && saved.mode === 'text');
    assert(conversationPatch?.last_direction === 'out' && conversationPatch?.last_read_by === 'actor');
    assert((await call(answer)).body.replay === true); assert(sends() === 1, 'replayed reply was sent twice');
    assert((await call({ ...answer, requestId: '30000000-0000-4000-8000-000000000002', text: '' })).status === 400);
    assert((await call({ ...answer, requestId: '30000000-0000-4000-8000-000000000003', conversationId: '20000000-0000-4000-8000-000000000099' })).status === 404);
    conversation.last_inbound_at = new Date(Date.now() - 25 * 3600000).toISOString();
    const late = await call({ ...answer, requestId: '30000000-0000-4000-8000-000000000004' });
    assert(late.status === 409 && /24 horas/.test(late.body.error)); assert(sends() === 1);
    conversation.last_inbound_at = new Date().toISOString(); conversation.business_phone_id = '999';
    assert((await call({ ...answer, requestId: '30000000-0000-4000-8000-000000000005' })).status === 409); assert(sends() === 1);
    // BAJA: templates refused before reserving or contacting Meta; free text still needs the window.
    optedOut = true;
    const contact = { action: 'send', requestId: '30000000-0000-4000-8000-000000000006', mode: 'contact', recipient: '+52 1 614 177 2897', consent: true };
    const blocked = await call(contact);
    assert(blocked.status === 409 && /BAJA/.test(blocked.body.error)); assert(sends() === 1); assert(!rows.has(contact.requestId));
    optedOut = false;
    assert((await call(contact)).status === 200); assert(sends() === 2);
    // Inbound connection status and the guarded subscribe call.
    const config = await call({ action: 'config' });
    assert(config.body.inbound.expected === 'https://test.supabase.co/functions/v1/whatsapp-webhook');
    assert(config.body.inbound.apps[0].callback === 'https://elsewhere.example/webhook' && config.body.inbound.secretConfigured === false);
    assert((await call({ action: 'connect_inbound' })).status === 503); assert(subscribeBody === null);
    Deno.env.set('WHATSAPP_APP_SECRET', 'app-secret');
    assert((await call({ action: 'connect_inbound' })).status === 200);
    assert(subscribeBody!.override_callback_uri === 'https://test.supabase.co/functions/v1/whatsapp-webhook' && subscribeBody!.verify_token === 'verify-test');
  } finally { globalThis.fetch = originalFetch; Deno.env.delete('WHATSAPP_APP_SECRET'); }
});
