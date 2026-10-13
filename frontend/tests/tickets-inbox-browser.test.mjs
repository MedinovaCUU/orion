import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const BASE = process.env.TICKETS_INBOX_URL || 'http://127.0.0.1:5200/orion/tests/fixtures/tickets-inbox.html';
const profiles = [
  { id: 'alfredo', nombre_completo: 'Alfredo Acevedo', rol: 'tecnico', recibe_tickets: true },
  { id: 'diego', nombre_completo: 'Diego García García', rol: 'tecnico', recibe_tickets: true },
  { id: 'vilchis', nombre_completo: 'Ricardo Vilchis', rol: 'tecnico', recibe_tickets: true },
  { id: 'admin', nombre_completo: 'Dirección de Servicio', rol: 'admin', recibe_tickets: true },
];
const base = (id, asunto, extra) => ({ id, asunto, estado: 'abierto', creado_en: '2026-10-05T08:00:00Z', numero_caso: id.toUpperCase(), numero_serie_equipo: '832000706', ...extra });
const plan = (id, user_id, asunto, meta) => base(id, asunto, { user_id, descripcion: `Cliente/Localidad: Hospital General\n[METADATA_PLANEACION]${JSON.stringify({ fecha_tentativa: '5 al 9 octubre', requiere_vuelos: false, requiere_auto: true, ...meta })}` });
const tickets = [
  plan('plan-vilchis', 'vilchis', '[PLAN] CAPACITACION - BA200 - ISSSTE APIZACO', { ingeniero_csv: 'Ricardo Vilchis / Diego García García' }),
  plan('plan-alfredo', 'alfredo', '[PLAN] PREVENTIVO - A15 - CANCEROLOGIA ACAPULCO', { ingeniero_csv: 'Alfredo Acevedo' }),
  plan('plan-companion', 'vilchis', '[PLAN] INSTALACION - A15 - ATLACOMULCO', { ingeniero_csv: 'Ricardo Vilchis', companions_csv: ['Alfredo Acevedo'] }),
  base('support-assigned', '[Soporte Ingeniero] Falla de lectura BA200', { user_id: null, descripcion: 'Falla de lectura', nombre_cliente_guest: 'Laboratorio Norte', telefono_cliente_guest: '5551234567' }),
  base('support-unassigned', '[Soporte Químico] Control fuera de rango', { user_id: null, descripcion: 'Control fuera de rango', nombre_cliente_guest: 'Clínica Sur', telefono_cliente_guest: '5559876543' }),
  base('support-own', 'Alta propia desde reporte de servicio', { user_id: 'alfredo', descripcion: 'Reporte capturado por el técnico' }),
];
const titles = Object.fromEntries(tickets.map((ticket) => [ticket.id, ticket.asunto]));
const assignments = [{ ticket_id: 'support-assigned', assigned_to: 'alfredo' }];
// Closed long ago: outside the inbox working set, only reachable through the archive search.
const archive = Array.from({ length: 45 }, (_, index) => base(`bio-${100 + index}`, `Servicio histórico ${100 + index}`, {
  estado: 'cerrado', user_id: null, numero_caso: `BIO-${100 + index}`, creado_en: new Date(Date.UTC(2024, 0, 1 + index, 16)).toISOString(),
  descripcion: index === 7 ? 'Cambio de lámpara en Clínica del Ángel' : 'Mantenimiento', nombre_cliente_guest: 'Hospital Histórico',
}));
// Emulates search_ticket_archive: every word must appear, accents ignored, exact folio first, newest first.
const fold = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const searchArchive = (args) => {
  const words = fold(args.p_query).split(/\s+/).filter(Boolean);
  const rows = [...tickets, ...archive]
    .filter((ticket) => args.p_status === 'cerrados' ? ticket.estado === 'cerrado' : args.p_status === 'abiertos' ? ticket.estado !== 'cerrado' : true)
    .filter((ticket) => words.every((word) => fold([ticket.numero_caso, ticket.asunto, ticket.descripcion, ticket.nombre_cliente_guest, ticket.numero_serie_equipo].join(' ')).includes(word)))
    .sort((a, b) => Number(b.numero_caso === String(args.p_query || '').trim().toUpperCase()) - Number(a.numero_caso === String(args.p_query || '').trim().toUpperCase()) || b.creado_en.localeCompare(a.creado_en));
  return rows.slice(args.p_offset, args.p_offset + args.p_limit).map((ticket) => ({ ticket, total_count: rows.length }));
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const calls = [];
const open = async (user, { migrated = true } = {}) => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const body = route.request().postDataJSON?.() || {};
    let data = [];
    if (url.pathname.includes('/rpc/')) calls.push({ user, fn: url.pathname.split('/').pop(), body });
    if (!migrated && /\/rpc\/(get_ticket_inbox|search_ticket_archive)$/.test(url.pathname)) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function' }) });
      return;
    }
    if (url.pathname.endsWith('/profiles')) { const id = url.searchParams.get('id')?.replace('eq.', ''); data = id ? profiles.filter((profile) => profile.id === id) : profiles; }
    if (url.pathname.endsWith('/ticket_assignments')) { const who = url.searchParams.get('assigned_to')?.replace('eq.', ''); data = assignments.filter((row) => !who || row.assigned_to === who); }
    // Every row, as if the server did not narrow the staff view: the inbox filter must still do it.
    if (url.pathname.endsWith('/rpc/get_ticket_inbox')) data = body.p_since ? tickets : [...tickets, ...archive];
    if (url.pathname.endsWith('/tickets')) data = tickets; // Table read: fallback before the migration.
    if (url.pathname.endsWith('/rpc/search_ticket_archive')) data = searchArchive(body);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto(`${BASE}?user=${user}`);
  await page.getByRole('heading', { name: 'Bandeja de Casos de Soporte' }).waitFor();
  return page;
};
const visible = async (page, id) => (await page.getByText(titles[id], { exact: true }).count()) > 0;
const expectInbox = async (page, expected) => {
  await page.getByText(titles[expected[0]], { exact: true }).waitFor();
  for (const id of Object.keys(titles)) assert.equal(await visible(page, id), expected.includes(id), `${id} visibility`);
};
const note = 'Solo se muestran los casos asignados a ti o en los que apareces como responsable en la planeación.';
try {
  const alfredo = await open('alfredo');
  await expectInbox(alfredo, ['plan-alfredo', 'plan-companion', 'support-assigned', 'support-own']);
  assert.equal(await alfredo.getByText('Ricardo Vilchis / Diego García García', { exact: true }).count(), 0, 'another engineer\'s planning never renders');
  assert.equal(await alfredo.getByText(note, { exact: true }).count(), 1, 'technicians see the scope note');
  await alfredo.screenshot({ path: '/tmp/tickets-inbox-alfredo.png', fullPage: true });
  await alfredo.close();
  const diego = await open('diego');
  await expectInbox(diego, ['plan-vilchis']);
  assert.equal(await diego.getByText('Ricardo Vilchis / Diego García García', { exact: true }).count(), 1, 'co-responsible engineer sees the shared planning');
  await diego.close();
  const admin = await open('admin');
  await expectInbox(admin, Object.keys(titles));
  assert.equal(await admin.getByText(note, { exact: true }).count(), 0, 'administrators keep the full inbox without the note');
  // The inbox asks only for its working set: open cases plus the last 30 days.
  const inboxCall = calls.find((call) => call.user === 'admin' && call.fn === 'get_ticket_inbox');
  assert.ok(inboxCall?.body.p_since, 'the inbox load carries a 30-day window');
  const days = (Date.now() - Date.parse(inboxCall.body.p_since)) / 86_400_000;
  assert.ok(days > 29.9 && days < 30.1, `window of ${days} days`);
  assert.equal(await admin.getByText('Servicio histórico 107', { exact: true }).count(), 0, 'old closures are not downloaded');
  assert.equal(calls.filter((call) => call.fn === 'search_ticket_archive').length, 0, 'the archive stays idle until asked');

  // Search an old folio: exact match first, then open its full record.
  const search = admin.getByRole('searchbox', { name: 'Buscar en el historial de casos' });
  await search.fill('bio-107');
  await admin.getByText('1 caso · página 1 de 1').waitFor();
  const archiveCard = admin.locator('#ticket-archive-bio-107');
  assert.equal(await archiveCard.locator('.tickets-list-card__case-number').innerText(), 'BIO-107');
  await archiveCard.getByRole('button', { name: /Abrir expediente completo/ }).click();
  await archiveCard.getByText('Cambio de lámpara en Clínica del Ángel').waitFor();
  assert.equal(await archiveCard.locator('.ticket-case').count(), 1, 'the full record opens inside the result');
  await admin.locator('.ticket-archive').screenshot({ path: '/tmp/tickets-archive-search.png' });
  // Accent-insensitive words over the description.
  await search.fill('clinica angel');
  await admin.getByText('1 caso · página 1 de 1').waitFor();
  // Browse the whole history page by page.
  await admin.getByRole('button', { name: 'Limpiar búsqueda' }).click();
  await admin.getByRole('button', { name: 'Ver historial completo' }).click();
  await admin.getByText('51 casos · página 1 de 3').waitFor();
  assert.equal(await admin.locator('.ticket-archive__card').count(), 20);
  await admin.getByRole('button', { name: 'Siguiente ›' }).click();
  await admin.getByText('51 casos · página 2 de 3').waitFor();
  const lastSearch = calls.filter((call) => call.fn === 'search_ticket_archive').at(-1).body;
  assert.equal(lastSearch.p_offset, 20, 'page 2 asks the server for the next 20 rows');
  await admin.getByLabel('Estado del caso').selectOption('abiertos');
  await admin.getByText('6 casos · página 1 de 1').waitFor();
  await admin.screenshot({ path: '/tmp/tickets-archive-admin.png', fullPage: true });
  // The control center still analyzes the whole history, downloaded only when it opens.
  assert.equal(calls.some((call) => call.fn === 'get_ticket_inbox' && call.body.p_since === null), false, 'no full download before the control center');
  await admin.getByRole('button', { name: 'Centro de control' }).click();
  for (let i = 0; i < 50 && !calls.some((call) => call.fn === 'get_ticket_inbox' && call.body.p_since === null); i++) await admin.waitForTimeout(100);
  assert.ok(calls.some((call) => call.fn === 'get_ticket_inbox' && call.body.p_since === null), 'opening the control center loads the whole history');
  await admin.close();

  // Before the migration: the inbox falls back to the table read and the archive explains why it is idle.
  const legacy = await open('admin', { migrated: false });
  await expectInbox(legacy, Object.keys(titles));
  await legacy.getByRole('searchbox', { name: 'Buscar en el historial de casos' }).fill('BIO-107');
  await legacy.getByText(/falta aplicar la migración 20261013070000/).waitFor();
  await legacy.close();
  assert.deepEqual(errors, []);
  console.log('PASS: technicians only see assigned, own and planning cases naming them; admin sees everything; the inbox loads a 30-day working set; the archive finds, opens and pages old cases; pre-migration fallback works');
} finally { await browser.close(); }
