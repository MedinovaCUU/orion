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
