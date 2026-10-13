import { dispatchAdvisories } from './handler.ts';
import { MESSAGE_TEMPLATE, NEW_TEMPLATE, TEMPLATE_DEFINITIONS, splitAttachments, staffPhone, templateParam, templatePayload, textBody, type AdvisoryJob } from './core.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
const job = (overrides: Partial<AdvisoryJob>): AdvisoryJob => ({
  id: crypto.randomUUID(), asesoria_id: 'adv-1', event: 'message', message_id: 'm1', recipient_id: 'p1', recipient_name: 'Héctor',
  recipient_phone: '526142220003', window_open: true, opted_out: false, area: 'ingenieria', requester_name: 'Alfredo R.',
  label: '2J204N61 · 834000123', consulta: 'El rotor no centra', author_name: 'Alfredo R.', body: '¿Alguna idea?', attachments: [], ...overrides,
});

Deno.test('advisory messages: phones, template parameters, text bodies and attachments', () => {
  assert(staffPhone('6142220003') === '526142220003' && staffPhone('+52 1 614 222 0003') === '526142220003' && staffPhone('526142220003') === '526142220003');
  assert(staffPhone('52614222000') === null && staffPhone('') === null && staffPhone('12025550184') === '12025550184');
  assert(templateParam('línea 1\nlínea 2\t\tfin', 100) === 'línea 1 línea 2 fin' && templateParam('', 10) === '—' && templateParam('abcdefghij', 5) === 'abcd…');
  for (const definition of TEMPLATE_DEFINITIONS) {
    const body = definition.components[0] as { text: string };
    assert(!/^\{\{/.test(body.text) && !/\}\}$/.test(body.text), `${definition.name} must not start or end with a variable`);
  }
  const files = [
    { kind: 'photo', fileName: 'a.jpg', mimeType: 'image/jpeg', size: 1000, publicUrl: 'https://x/a.jpg' },
    { kind: 'video', fileName: 'v.mp4', mimeType: 'video/mp4', size: 40 * 1024 * 1024, publicUrl: 'https://x/v.mp4' },
    { kind: 'report', fileName: 'r.pdf', mimeType: 'application/pdf', size: 2000, publicUrl: 'https://x/r.pdf' },
    { kind: 'photo', fileName: 'local.jpg', mimeType: 'image/jpeg', size: 10, publicUrl: 'blob:local' },
  ];
  const split = splitAttachments(files);
  assert(split.media.map(item => item.type).join() === 'image,document' && split.links.map(item => item.fileName).join() === 'v.mp4');
  const text = textBody(job({ attachments: files }));
  assert(text.startsWith('*Alfredo R.* · asesoría 2J204N61 · 834000123\n¿Alguna idea?') && text.includes('📎 v.mp4: https://x/v.mp4') && !text.includes('a.jpg'));
  const created = textBody(job({ event: 'new_advisory', consulta: 'x'.repeat(3000) }));
  assert(created.includes('*Nueva asesoría de Alfredo R.* (Ingeniería)') && created.includes('(sigue en Orion: https://medinovacuu.github.io/orion/dashboard?tab=asesoria&advisory=adv-1)'));
  const template = templatePayload(job({ body: 'Revisa\nel sello', attachments: files }), '526142220003');
  assert(template.template.name === MESSAGE_TEMPLATE);
  assert(template.template.components[0].parameters.map(item => item.text).join('|') === 'Alfredo R.|2J204N61 · 834000123|Revisa el sello (+4 archivos en Orion)');
  assert(template.template.components[1].parameters[0].text === 'adv-1');
  assert(templatePayload(job({ event: 'new_advisory' }), '1').template.components[0].parameters.length === 4);
});

Deno.test('advisory worker: token, template provisioning, 24 h window, waiting, phones, BAJA', async () => {
  Deno.env.set('SUPABASE_URL', 'https://test.supabase.co');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service');
  Deno.env.set('TICKET_WA_ACCESS_TOKEN', 'ticket-token');
  Deno.env.set('TICKET_WA_PHONE_NUMBER_ID', '123456');
  Deno.env.set('TICKET_WA_WABA_ID', '654321');
  Deno.env.set('TICKET_WA_WORKER_SECRET', 'worker');
  const originalFetch = globalThis.fetch;
  let templateStatus: string | null = null;
  const created: string[] = [], sent: Record<string, any>[] = [];
  const updates = new Map<string, Record<string, unknown>>();
  let jobs: AdvisoryJob[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = (async (source: RequestInfo | URL, options?: RequestInit) => {
    const url = new URL(typeof source === 'string' ? source : source instanceof URL ? source.href : source.url);
    const body = options?.body ? JSON.parse(String(options.body)) : null;
    if (url.hostname === 'graph.facebook.com') {
      if (url.pathname.endsWith('/654321/message_templates')) {
        if (options?.method === 'POST') { created.push(body.name); return json({ id: '1', status: 'PENDING', category: 'UTILITY' }); }
        return json({ data: templateStatus ? [{ name: url.searchParams.get('name'), language: 'es_MX', status: templateStatus }] : [] });
      }
      if (url.pathname.endsWith('/123456/messages')) { sent.push(body); return json({ messages: [{ id: `wamid.${sent.length}` }] }); }
    }
    if (url.pathname === '/rest/v1/rpc/claim_advisory_whatsapp') { const claimed = jobs; jobs = []; return json(claimed); }
    if (url.pathname === '/rest/v1/advisory_whatsapp_outbox') { updates.set(url.searchParams.get('id')!.replace('eq.', ''), body); return json([]); }
    throw new Error(`Unexpected request: ${url.href}`);
  }) as typeof fetch;
  const run = (token = 'worker') => dispatchAdvisories(new Request('https://test/advisory-whatsapp-dispatch', { method: 'POST', headers: { 'x-worker-token': token } }));
  try {
    assert((await run('nope')).status === 401); assert(Number(sent.length) === 0);
    // First run: both templates submitted to Meta; closed windows wait, open windows go as text (+ photo).
    const open = job({ attachments: [{ kind: 'photo', fileName: 'a.jpg', mimeType: 'image/jpeg', size: 10, publicUrl: 'https://x/a.jpg' }] });
    const closed = job({ event: 'new_advisory', window_open: false });
    const noPhone = job({ recipient_phone: null });
    const optedOut = job({ opted_out: true });
    const gone = job({ body: null });
    jobs = [open, closed, noPhone, optedOut, gone];
    assert((await run()).status === 200);
    assert(created.join() === `${NEW_TEMPLATE},${MESSAGE_TEMPLATE}`, `created ${created.join()}`);
    assert(sent.length === 2 && sent[0].type === 'text' && sent[0].to === '526142220003' && sent[1].type === 'image' && sent[1].image.link === 'https://x/a.jpg');
    const openUpdate = updates.get(open.id)!;
    assert(openUpdate.status === 'accepted' && openUpdate.mode === 'text' && openUpdate.provider_message_id === 'wamid.1' && (openUpdate.extra_message_ids as string[])[0] === 'wamid.2');
    assert(updates.get(closed.id)!.status === 'waiting');
    assert(updates.get(noPhone.id)!.status === 'needs_phone' && updates.get(optedOut.id)!.status === 'skipped' && updates.get(gone.id)!.status === 'skipped');
    // Once Meta approves: templates are not submitted again and the waiting notice goes as a template.
    templateStatus = 'APPROVED'; created.length = 0; sent.length = 0;
    jobs = [{ ...closed }];
    assert((await run()).status === 200);
    assert(created.length === 0 && sent.length === 1 && sent[0].type === 'template' && sent[0].template.name === NEW_TEMPLATE);
    assert(updates.get(closed.id)!.status === 'accepted' && updates.get(closed.id)!.mode === 'template');
  } finally { globalThis.fetch = originalFetch; }
});
