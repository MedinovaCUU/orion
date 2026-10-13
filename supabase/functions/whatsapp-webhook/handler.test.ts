import { handleWhatsAppWebhook } from './handler.ts';
import { mediaExtension, parseWebhook, verifySignature, waIdToPhone } from './core.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
const encoder = new TextEncoder();
async function sign(body: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `sha256=${[...new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)))].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
const change = (value: Record<string, unknown>) => ({ object: 'whatsapp_business_account', entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '526140000000', phone_number_id: '123456' }, ...value } }] }] });

Deno.test('payload parsing, phone normalization and signatures', async () => {
  assert(waIdToPhone('5216141772897') === '526141772897'); assert(waIdToPhone('12025550184') === '12025550184'); assert(waIdToPhone('abc') === null);
  const { messages, statuses } = parseWebhook(change({
    contacts: [{ wa_id: '5216141772897', profile: { name: 'Laura Q' } }],
    messages: [
      { from: '5216141772897', id: 'wamid.text', timestamp: '1760000000', type: 'text', text: { body: 'Sigue fallando' }, context: { id: 'wamid.out1' } },
      { from: '5216141772897', id: 'wamid.img', timestamp: '1760000001', type: 'image', image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'Pantalla' } },
      { from: '5216141772897', id: 'wamid.loc', timestamp: '1760000002', type: 'location', location: { latitude: 28.6, longitude: -106.1, name: 'Hospital', address: 'Av. 1' } },
      { from: '5216141772897', id: 'wamid.react', timestamp: '1760000003', type: 'reaction', reaction: { message_id: 'wamid.out1', emoji: '👍' } },
      { from: '5216141772897', id: 'wamid.btn', timestamp: '1760000004', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'yes', title: 'Sí' } } },
      { from: '5216141772897', id: 'wamid.poll', timestamp: '1760000005', type: 'unsupported', errors: [{ code: 131051, title: 'Message type unknown' }] },
      { from: 'not-a-phone', id: 'wamid.bad', type: 'text', text: { body: 'x' } },
    ],
    statuses: [
      { id: 'wamid.out1', status: 'read', timestamp: '1760000010', recipient_id: '5216141772897' },
      { id: 'wamid.out2', status: 'failed', timestamp: '1760000011', errors: [{ code: 131047, title: 'Re-engagement message', error_data: { details: 'More than 24 hours' } }] },
      { id: 'wamid.out3', status: 'deleted' },
    ],
  }));
  assert(messages.length === 6, `parsed ${messages.length}`);
  const [text, image, location, reaction, button, unsupported] = messages;
  assert(text.phone === '526141772897' && text.name === 'Laura Q' && text.body === 'Sigue fallando' && text.contextMessageId === 'wamid.out1' && text.sentAt === new Date(1760000000000).toISOString());
  assert(image.mediaId === 'media-1' && image.body === 'Pantalla' && image.mediaMime === 'image/jpeg');
  assert(location.body === 'Hospital · Av. 1' && (location.extra as { latitude: number }).latitude === 28.6);
  assert(reaction.body === '👍' && reaction.contextMessageId === 'wamid.out1');
  assert(button.body === 'Sí');
  assert(unsupported.kind === 'unsupported' && (unsupported.extra as { errors: string[] }).errors[0] === 'Message type unknown');
  assert(statuses.length === 2 && statuses[1].error === '131047 · Re-engagement message · More than 24 hours');
  assert(parseWebhook({ entry: [{ changes: [{ field: 'account_update', value: {} }] }] }).messages.length === 0);
  assert(parseWebhook(null).messages.length === 0);
  const body = encoder.encode('{"a":1}');
  assert(await verifySignature(body, await sign('{"a":1}', 'second'), ['first', 'second']));
  assert(!await verifySignature(body, await sign('{"a":2}', 'first'), ['first']));
  assert(!await verifySignature(body, null, ['first']));
  assert(mediaExtension('audio/ogg; codecs=opus') === 'ogg' && mediaExtension('application/x-unknown') === 'bin');
});

Deno.test('webhook: handshake, fail-closed signature, idempotent storage, media copy', async () => {
  Deno.env.set('SUPABASE_URL', 'https://test.supabase.co');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service');
  Deno.env.set('WHATSAPP_WEBHOOK_VERIFY_TOKEN', 'verify-test');
  Deno.env.set('TICKET_WA_PHONE_NUMBER_ID', '123456');
  Deno.env.set('TICKET_WA_ACCESS_TOKEN', 'ticket-token');
  Deno.env.delete('WHATSAPP_APP_SECRET');
  const originalFetch = globalThis.fetch;
  const rpc: Array<{ name: string; body: Record<string, unknown> }> = [];
  const uploads: string[] = []; const patches: Record<string, unknown>[] = [];
  const seen = new Set<string>(); let failRpc = false; let mediaAuth = '';
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = (async (source: RequestInfo | URL, options?: RequestInit) => {
    const url = new URL(typeof source === 'string' ? source : source instanceof URL ? source.href : source.url);
    const method = options?.method || 'GET';
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const name = url.pathname.split('/').pop()!; const body = JSON.parse(String(options?.body));
      rpc.push({ name, body });
      if (failRpc) return json({ code: '57014', message: 'timeout' }, 500);
      if (name === 'record_whatsapp_status') return json(1);
      const duplicate = seen.has(body.p_wa_message_id); seen.add(body.p_wa_message_id);
      return json({ id: `row-${body.p_wa_message_id}`, conversation_id: 'conv-1', duplicate });
    }
    if (url.hostname === 'graph.facebook.com') { mediaAuth = new Headers(options?.headers).get('Authorization') || ''; return json({ url: 'https://lookaside.example/file', mime_type: 'image/jpeg', file_size: 3 }); }
    if (url.hostname === 'lookaside.example') return new Response(new Uint8Array([1, 2, 3]));
    if (url.pathname.startsWith('/storage/v1/object/whatsapp-media/')) { uploads.push(url.pathname); return json({ Key: url.pathname }); }
    if (url.pathname === '/rest/v1/whatsapp_inbound_messages' && method === 'PATCH') { patches.push(JSON.parse(String(options?.body))); return json([]); }
    throw new Error(`Unexpected request: ${method} ${url.href}`);
  }) as typeof fetch;
  const post = async (payload: unknown, secret?: string, signature?: string) => {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (signature || secret) headers['X-Hub-Signature-256'] = signature || await sign(body, secret!);
    return handleWhatsAppWebhook(new Request('https://test/functions/v1/whatsapp-webhook', { method: 'POST', headers, body }));
  };
  const payload = change({
    contacts: [{ wa_id: '5216141772897', profile: { name: 'Laura Q' } }],
    messages: [
      { from: '5216141772897', id: 'wamid.text', timestamp: '1760000000', type: 'text', text: { body: 'Hola' } },
      { from: '5216141772897', id: 'wamid.img', timestamp: '1760000001', type: 'image', image: { id: 'media-1', mime_type: 'image/jpeg' } },
    ],
    statuses: [{ id: 'wamid.out1', status: 'delivered', timestamp: '1760000010' }],
  });
  try {
    const ok = await handleWhatsAppWebhook(new Request('https://test/w?hub.mode=subscribe&hub.verify_token=verify-test&hub.challenge=4242'));
    assert(ok.status === 200 && await ok.text() === '4242');
    assert((await handleWhatsAppWebhook(new Request('https://test/w?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1'))).status === 403);
    assert((await post(payload, 'app-secret')).status === 503, 'must fail closed without WHATSAPP_APP_SECRET'); assert(rpc.length === 0);
    Deno.env.set('WHATSAPP_APP_SECRET', 'old-app, app-secret');
    assert((await post(payload)).status === 401); assert((await post(payload, 'wrong')).status === 401); assert(rpc.length === 0);
    assert((await post(payload, 'app-secret')).status === 200);
    const inbound = rpc.filter(call => call.name === 'record_whatsapp_inbound');
    assert(inbound.length === 2 && inbound[0].body.p_phone === '526141772897' && inbound[0].body.p_is_ticket_line === true && inbound[0].body.p_name === 'Laura Q');
    assert(rpc.some(call => call.name === 'record_whatsapp_status' && call.body.p_status === 'delivered'));
    assert(uploads.length === 1 && uploads[0] === '/storage/v1/object/whatsapp-media/conv-1/row-wamid.img.jpg' && mediaAuth === 'Bearer ticket-token');
    assert(patches.length === 1 && patches[0].media_path === 'conv-1/row-wamid.img.jpg');
    // Meta retry: stored once, file not downloaded again.
    assert((await post(payload, 'app-secret')).status === 200); assert(uploads.length === 1);
    // Meta's «Probar» sample: signature checked, fictitious number not stored.
    const before = rpc.length;
    const sample = change({ messages: [{ from: '16315551181', id: 'ABGGFlA5Fpa', timestamp: '1504902988', type: 'text', text: { body: 'this is a text message' } }] });
    (sample.entry[0].changes[0].value.metadata as { phone_number_id: string }).phone_number_id = '123456123';
    assert((await post(sample, 'app-secret')).status === 200); assert(rpc.length === before, 'unknown line must not be stored');
    failRpc = true;
    assert((await post(payload, 'app-secret')).status === 500, 'storage errors must make Meta retry');
  } finally { globalThis.fetch = originalFetch; Deno.env.delete('WHATSAPP_APP_SECRET'); }
});
