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
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const open = async (user) => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    let data = [];
    if (url.pathname.endsWith('/profiles')) { const id = url.searchParams.get('id')?.replace('eq.', ''); data = id ? profiles.filter((profile) => profile.id === id) : profiles; }
    if (url.pathname.endsWith('/ticket_assignments')) { const who = url.searchParams.get('assigned_to')?.replace('eq.', ''); data = assignments.filter((row) => !who || row.assigned_to === who); }
    if (url.pathname.endsWith('/tickets')) data = tickets; // Every row, as if RLS did not narrow the staff view.
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
  await admin.close();
  assert.deepEqual(errors, []);
  console.log('PASS: technicians only see assigned, own and planning cases naming them; co-responsible sees shared planning; admin sees everything');
} finally { await browser.close(); }
