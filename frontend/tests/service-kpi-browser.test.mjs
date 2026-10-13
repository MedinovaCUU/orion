// Isolated UI test of the staff KPIs in the control center. Start Vite in frontend on port 5200
// (or set SERVICE_KPI_URL) and run: node tests/service-kpi-browser.test.mjs
// Every request is intercepted: no session, ticket or production data is used. The mock answers
// summaries and records from the same rows with the same matching rule as the SQL API (jsonb @>),
// so a card and the records it opens must agree.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
const output = new URL('../../outputs/service-kpi-verification/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const shot = name => fileURLToPath(new URL(name, output));

const people = [
  { id: 'q1', name: 'Ivonne Jaramillo', team: 'quimica' }, { id: 'q2', name: 'Martha Carbajal', team: 'quimica' },
  { id: 'e1', name: 'Alfredo Acevedo', team: 'ingenieria' }, { id: 'e2', name: 'Diego Garcia', team: 'ingenieria' },
];
const weeks = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'];
const clients = ['Hospital Norte', 'Clínica Sur', 'Laboratorio Delta'];
const tickets = Array.from({ length: 30 }, (_, i) => {
  const team = i % 2 ? 'quimica' : 'ingenieria';
  const closed = i < 20; const cancelled = closed && i % 5 === 0;
  return {
    ticket_id: `case-${i + 1}`, folio: `OR-${String(i + 1).padStart(4, '0')}`, asunto: 'Caso de prueba', team, service_type: `soporte_${team}`,
    priority: ['alta', 'media', 'sin_prioridad'][i % 3], client: clients[i % 3], platform: ['BA400', 'A15', 'BA200'][i % 3], serial: `SER-${i + 1}`,
    responsible_id: team === 'quimica' ? (i % 4 === 1 ? 'q1' : 'q2') : (i % 4 === 0 ? 'e1' : 'e2'), responsible_name: null, estado: closed ? 'cerrado' : 'abierto',
    opened_at: `${weeks[i % 5]}T15:00:00Z`, opened_bucket: weeks[i % 5], closed_at: closed ? `${weeks[(i + 1) % 5]}T18:00:00Z` : null, closed_bucket: closed ? weeks[(i + 1) % 5] : null,
    closure_class: closed ? (cancelled ? 'cancelado' : 'solucionado') : null, sla_policy: 'Soporte general', sla_target_hours: 48, sla_clock: 'corridas', sla_hours: 20 + i,
    sla_result: !closed ? (i > 26 ? 'vencido' : 'en_curso') : cancelled ? 'no_aplica' : i % 4 === 0 ? 'fuera' : 'dentro', justified: false,
    opened_in_period: i < 26, closed_in_period: closed, sla_evaluable: closed && !cancelled, pending_at_cut: !closed, overdue_at_cut: !closed && i > 26,
    age_days: closed ? null : i - 18, age_bucket: closed ? null : i > 26 ? '7-15 d' : '3-7 d', relevant: true, first_response_hours: i % 3 ? 2 : null,
    resolution_hours: closed && !cancelled ? 10 + i : null, visits: i % 3, calls: 1, reopened: false, reopen_of_folio: null,
    search_text: `or-${String(i + 1).padStart(4, '0')} ser-${i + 1} ${clients[i % 3].toLowerCase()}`,
  };
});
tickets.forEach(row => { row.responsible_name = people.find(person => person.id === row.responsible_id).name; });
const activities = Array.from({ length: 40 }, (_, i) => {
  const kind = ['capacitacion', 'recapacitacion', 'preventivo', 'correctivo', 'llamada'][i % 5];
  const team = ['capacitacion', 'recapacitacion'].includes(kind) || (kind === 'llamada' && i % 2) ? 'quimica' : 'ingenieria';
  const owner = team === 'quimica' ? (i % 3 ? 'q1' : 'q2') : (i % 3 ? 'e1' : 'e2');
  const planned = kind !== 'llamada' && kind !== 'correctivo';
  return {
    activity_id: `act-${i + 1}`, category: kind === 'llamada' ? 'llamada' : planned ? 'programada' : 'visita', source: planned ? 'Planeación' : 'Historial de servicio',
    kind, kinds: [kind], is_planned: planned, is_visit: kind === 'correctivo', is_call: kind === 'llamada', is_maintenance_visit: kind === 'correctivo',
    training_kind: ['capacitacion', 'recapacitacion'].includes(kind) ? kind : null, counts_training: ['capacitacion', 'recapacitacion'].includes(kind),
    preventive_off_schedule: false, plan_status: planned ? (i % 4 ? 'realizado' : 'pendiente') : null, evidence: planned && i % 4 ? 'Cierre registrado como solucionado' : null,
    done: planned ? Boolean(i % 4) : true, activity_date: weeks[i % 5], bucket: weeks[i % 5], in_period: true, ticket_id: i % 2 ? `case-${i % 30 + 1}` : null,
    folio: i % 2 ? `OR-${String(i % 30 + 1).padStart(4, '0')}` : null, participant_ids: [owner], participant_names: people.find(person => person.id === owner).name,
    unmatched_names: null, teams: [team], team_inferred: false, serial: `SER-${i}`, platform: 'BA400', client: clients[i % 3], priority: 'sin_prioridad',
    reason: kind === 'llamada' ? 'operacion' : null, result: kind === 'llamada' ? (i % 3 ? 'resuelto' : 'requiere_visita') : null, has_result: kind === 'llamada',
    duration_min: kind === 'llamada' ? 15 : null, has_duration: kind === 'llamada', failure_codes: [], failure_labels: null, solution_codes: [], solution_labels: null, records: 1,
    search_text: `act-${i + 1} ${kind}`,
  };
});
const contains = (row, match) => Object.entries(match).every(([key, value]) => Array.isArray(value) ? Array.isArray(row[key]) && value.every(item => row[key].includes(item)) : row[key] === value);
const scoped = (rows, filters, dataset) => rows.filter(row => (!filters.team || (dataset === 'tickets' ? row.team === filters.team : row.teams.includes(filters.team)))
  && (!filters.person || (dataset === 'tickets' ? row.responsible_id === filters.person : row.participant_ids.includes(filters.person)))
  && (!filters.client || row.client === filters.client));
const ratio = (num, den) => ({ num, den, pct: den ? Math.round(num / den * 1000) / 10 : null });
const metrics = filters => {
  const t = scoped(tickets, filters, 'tickets'); const a = scoped(activities, filters, 'activities');
  const c = (rows, match) => rows.filter(row => contains(row, match)).length;
  const evaluable = c(t, { sla_evaluable: true });
  return {
    tickets_opened: c(t, { opened_in_period: true }), tickets_closed: c(t, { closed_in_period: true }), tickets_cancelled: c(t, { closure_class: 'cancelado' }),
    sla_evaluable: evaluable, sla_late: c(t, { closed_in_period: true, sla_result: 'fuera' }), sla_late_justified: 0, sla_no_policy: 0,
    late_rate: ratio(c(t, { closed_in_period: true, sla_result: 'fuera' }), evaluable), sla_compliance: ratio(c(t, { closed_in_period: true, sla_result: 'dentro' }), evaluable),
    first_response_base: c(t, { opened_in_period: true }), first_response_n: t.filter(row => row.opened_in_period && row.first_response_hours !== null).length,
    first_response_median: t.length ? 2 : null, first_response_avg: t.length ? 2 : null, resolution_n: c(t, { closed_in_period: true, closure_class: 'solucionado' }),
    resolution_median: t.length ? 21 : null, resolution_avg: t.length ? 22 : null, resolution_p90: t.length ? 34 : null,
    pending_at_cut: c(t, { pending_at_cut: true }), overdue_at_cut: c(t, { overdue_at_cut: true }), unknown_at_cut: 0, unassigned_pending: 0,
    reopen_rate: ratio(0, 0), ftf_rate: ratio(0, 0), recurrence_rate: ratio(0, 0), csat: ratio(0, 0), surveys: 0,
    trainings_total: c(a, { in_period: true, counts_training: true }), trainings: c(a, { in_period: true, training_kind: 'capacitacion' }),
    retrainings: c(a, { in_period: true, training_kind: 'recapacitacion' }), trainings_done: c(a, { in_period: true, counts_training: true, done: true }),
    trainings_pending: c(a, { counts_training: true, plan_status: 'pendiente' }), trainings_overdue: 0,
    visits: c(a, { in_period: true, is_visit: true }), visits_with_failure: 0, calls: c(a, { in_period: true, is_call: true }),
    calls_with_duration: c(a, { in_period: true, is_call: true, has_duration: true }), call_minutes_avg: c(a, { is_call: true }) ? 15 : null,
    calls_resolved_rate: ratio(c(a, { in_period: true, is_call: true, result: 'resuelto' }), c(a, { in_period: true, is_call: true, has_result: true })),
    preventive_programmed: c(a, { in_period: true, is_planned: true, kind: 'preventivo' }), preventive_pending: c(a, { is_planned: true, kind: 'preventivo', plan_status: 'pendiente' }),
    preventive_overdue: 0, preventive_no_evidence: 0, preventive_off_schedule: 0,
    preventive_compliance: ratio(c(a, { in_period: true, is_planned: true, kind: 'preventivo', plan_status: 'realizado' }), c(a, { in_period: true, is_planned: true, kind: 'preventivo' })),
    corrective: c(a, { in_period: true, is_visit: true, kinds: ['correctivo'] }), maintenance_visits: c(a, { in_period: true, is_maintenance_visit: true }),
    corrective_share: ratio(c(a, { in_period: true, is_visit: true, kinds: ['correctivo'] }), c(a, { in_period: true, is_maintenance_visit: true })),
    parts_lines: 0, parts_qty: 0, parts_qty_preventive: 0, parts_qty_corrective: 0, parts_cost_lines: 0, parts_cost_total: null, failure_events: 0,
  };
};
const summaryFor = filters => {
  const t = scoped(tickets, filters, 'tickets'); const a = scoped(activities, filters, 'activities');
  const current = metrics(filters);
  const previous = Object.fromEntries(Object.entries(current).map(([key, value]) => [key, typeof value === 'number' ? Math.max(0, value - 2) : value && typeof value === 'object' ? ratio(Math.max(0, value.num - 1), value.den) : value]));
  return {
    period: { from: filters.from, to: filters.to, previous_from: '2026-06-01', previous_to: '2026-07-31', cut_at: '2026-10-11T18:00:00Z', cut_is_now: true, timezone: 'America/Chihuahua', granularity: filters.granularity, recurrence_days: 30, min_sample: 5, capture_since: '2026-10-11T17:00:00Z' },
    current, previous,
    series: weeks.map(bucket => ({ bucket, opened: t.filter(row => row.opened_in_period && row.opened_bucket === bucket).length, closed: t.filter(row => row.closed_in_period && row.closed_bucket === bucket).length,
      sla_evaluable: t.filter(row => row.sla_evaluable && row.closed_bucket === bucket).length, closed_late: t.filter(row => row.sla_result === 'fuera' && row.closed_bucket === bucket).length,
      trainings: a.filter(row => row.training_kind === 'capacitacion' && row.bucket === bucket).length, retrainings: a.filter(row => row.training_kind === 'recapacitacion' && row.bucket === bucket).length,
      visits: a.filter(row => row.is_visit && row.bucket === bucket).length, calls: a.filter(row => row.is_call && row.bucket === bucket).length,
      preventive_programmed: a.filter(row => row.is_planned && row.kind === 'preventivo' && row.bucket === bucket).length,
      preventive_done: a.filter(row => row.is_planned && row.kind === 'preventivo' && row.plan_status === 'realizado' && row.bucket === bucket).length,
      preventive_off_schedule: 0, preventive_executed: 0, corrective: a.filter(row => row.kinds.includes('correctivo') && row.bucket === bucket).length,
      maintenance_visits: a.filter(row => row.is_maintenance_visit && row.bucket === bucket).length, failure_events: 0 })),
    breakdowns: {
      staff: people.filter(person => (!filters.team || person.team === filters.team) && (!filters.person || person.id === filters.person)).map(person => ({ ...person,
        tickets_relevant: t.filter(row => row.responsible_id === person.id).length, tickets_opened: 0, tickets_closed: t.filter(row => row.responsible_id === person.id && row.closed_in_period).length,
        sla_evaluable: t.filter(row => row.responsible_id === person.id && row.sla_evaluable).length, sla_late: t.filter(row => row.responsible_id === person.id && row.sla_result === 'fuera').length,
        pending_at_cut: t.filter(row => row.responsible_id === person.id && row.pending_at_cut).length, overdue_at_cut: 0, pending_by_priority: { alta: 1 }, pending_by_type: {},
        resolution_median: 12, trainings: a.filter(row => row.participant_ids.includes(person.id) && row.counts_training).length, trainings_done: 0,
        visits: a.filter(row => row.participant_ids.includes(person.id) && row.is_visit).length, calls: a.filter(row => row.participant_ids.includes(person.id) && row.is_call).length,
        call_minutes: 30, preventive_programmed: 0, preventive_done: 0, corrective: 0, surveys: 0, satisfaction_avg: null })),
      aging: ['0-1 d', '1-3 d', '3-7 d', '7-15 d', '15-30 d', '30+ d'].map(bucket => ({ bucket, total: t.filter(row => row.pending_at_cut && row.age_bucket === bucket).length, overdue: t.filter(row => row.overdue_at_cut && row.age_bucket === bucket).length })),
      resolution_by: [], trainings_by_client: [], trainings_by_platform: [], visits_by_kind: [], visits_by_result: [], calls_by_reason: [], calls_by_result: [], failures_top: [], failure_solution: [],
      corrective_by_platform: [], corrective_by_client: [], corrective_by_serial: [], parts_by_platform: [], parts_top: [],
    },
    quality: { capture_since: '2026-10-11T17:00:00Z', tickets_without_closure_date: 1, tickets_without_priority: 10, surveys_answered_total: 0 },
    policies: [{ id: 'p1', name: 'Soporte general', channel: null, region: null, area: null, priority: null, target_hours: 48, clock: 'corridas', business_start: '09:00:00', business_end: '18:00:00', business_days: [1, 2, 3, 4, 5], timezone: 'America/Chihuahua', pause_states: [], precedence: 100, active: true, notes: 'Regla vigente' }],
  };
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
const page = await context.newPage();
const errors = []; page.on('pageerror', error => errors.push(error.message));
const summaryRequests = []; const recordRequests = []; const labRequests = []; const movements = []; const priorities = []; const supremoRequests = [];
// Supremo on in-person visits: a fixed evaluation (the server rules are covered by supabase/tests/supremo_visit_metric.test.mjs).
const supremoVisit = (n, outcome, reason, detail) => ({ visit_id: `visita:${n}`, visit_date: `2026-10-0${n}`, deadline: `2026-10-0${n + 3}`, serial: `SER-${n}`, serial_key: `SER-${n}`,
  platform: 'BA400', client: 'Hospital Norte', sources: 'Reporte de servicio', kinds: ['correctivo'], ticket_id: null, folio: null, participant_ids: ['p'], participant_names: 'Persona de prueba',
  unmatched_names: null, outcome, reason, detail, in_catalog: true, equipment_id: `EQ-${n}`, supremo_id: outcome === 'positiva' ? '958113330' : null,
  exemption_id: null, exemption_justification: null, exemption_by: null, exemption_at: null });
const supremoFor = filters => ({
  settings: { active: true, effective_from: '2026-10-01', grace_days: 3, history_since: '2026-10-01T18:00:00Z', reason: null, updated_at: '2026-10-01T18:00:00Z', updated_by_name: null, timezone: 'America/Chihuahua' },
  totals: { visits: 3, positive: 1, already: 1, installed: 0, negative: 1, pending: 1, voided: 0, no_serial: 0 }, compliance: { num: 1, den: 2, pct: 50 },
  people: [{ id: 'p', name: 'Persona de prueba', team: filters.team || 'ingenieria', positive: 1, negative: 1, pending: 1, voided: 0, compliance: { num: 1, den: 2, pct: 50 } }],
  visits: [supremoVisit(1, 'negativa', 'sin_registro', 'Sin Supremo registrado'), supremoVisit(2, 'pendiente', 'sin_registro', 'Sin Supremo registrado'),
    supremoVisit(3, 'positiva', 'ya_registrado', 'Supremo ya registrado antes de la visita')],
});
let failSummary = false; let allowControl = true;
await context.route('**/rest/v1/**', async route => {
  const url = new URL(route.request().url());
  const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
  let data = [];
  if (url.pathname.endsWith('/rpc/is_admin')) data = allowControl;
  if (url.pathname.endsWith('/rpc/can_approve_ticket_delay')) data = true;
  if (url.pathname.endsWith('/rpc/get_service_kpi_options')) data = { people, clients, platforms: ['A15', 'BA200', 'BA400'], serials: ['SER-1', 'SER-2'], statuses: ['abierto', 'cerrado'] };
  if (url.pathname.endsWith('/rpc/get_service_kpi_summary')) {
    summaryRequests.push(body.p_filters);
    if (failSummary) { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Servicio temporalmente no disponible' }) }); return; }
    data = summaryFor(body.p_filters);
  }
  if (url.pathname.endsWith('/rpc/get_service_kpi_records')) {
    // The time lab loads every relevant ticket once; drill-down requests are logged apart.
    (JSON.stringify(body.p_match) === '{"relevant":true}' ? labRequests : recordRequests).push(body);
    const source = scoped(body.p_dataset === 'tickets' ? tickets : activities, body.p_filters, body.p_dataset);
    let rows = source.filter(row => contains(row, body.p_match || {}) && (!body.p_search || row.search_text.includes(String(body.p_search).toLowerCase())));
    rows = rows.sort((left, right) => String(left[body.p_sort] ?? '').localeCompare(String(right[body.p_sort] ?? '')) * (body.p_desc ? -1 : 1));
    data = { total: rows.length, rows: rows.slice(body.p_offset, body.p_offset + body.p_limit).map(({ search_text, ...row }) => row) };
  }
  if (url.pathname.endsWith('/rpc/get_supremo_metric')) { supremoRequests.push(body.p_filters); data = supremoFor(body.p_filters); }
  if (url.pathname.endsWith('/rpc/register_ticket_movement')) { movements.push(body); data = null; }
  if (url.pathname.endsWith('/rpc/set_ticket_priority')) { priorities.push(body); data = null; }
  if (url.pathname.endsWith('/catalogo_servicio')) data = [{ catalog_kind: 'averia', catalog_code: 'AL08', catalog_detail: 'Lámpara' }, { catalog_kind: 'solucion', catalog_code: 'SL02', catalog_detail: 'Cambio de lámpara' }];
  if (url.pathname.endsWith('/service_kpi_settings')) data = { timezone: 'America/Chihuahua', recurrence_days: 30, min_sample: 5, capture_since: '2026-10-11T17:00:00Z' };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
});
const card = label => page.locator('.kpi-center:visible .kpi-card').filter({ has: page.locator('small', { hasText: new RegExp(`^${label}$`) }) }).first();
const cardValue = async label => (await card(label).locator('.kpi-value').innerText()).trim();
const visible = page.locator('.kpi-center:visible');
try {
  await page.goto(process.env.SERVICE_KPI_URL || 'http://127.0.0.1:5200/orion/tests/fixtures/service-kpi.html');
  await page.getByText('20 casos encontrados', { exact: false }).waitFor({ timeout: 30000 });
  assert.equal(await page.getByRole('button', { name: /Control de casos/ }).getAttribute('aria-pressed'), 'true', 'case control stays the default section');

  // General summary: card → records with the same count, paging, sorting and search.
  await page.getByRole('button', { name: /Resumen general/ }).click();
  await card('Tickets abiertos').waitFor();
  assert.equal(summaryRequests.at(-1).team, undefined);
  const opened = metrics({}).tickets_opened;
  assert.equal(await cardValue('Tickets abiertos'), String(opened));
  assert.equal(await cardValue('Cierres fuera del plazo'), `${metrics({}).late_rate.pct} %`);
  assert.equal(await page.locator('.kpi-card small', { hasText: 'Satisfacción del cliente' }).count(), 0, 'satisfaction is hidden until a survey is answered');
  // Time lab (ECharts): loads the period's tickets once and draws every analysis from them.
  await page.locator('.kpi-lab-insights').waitFor();
  assert.deepEqual(labRequests.at(-1).p_match, { relevant: true });
  assert.equal(labRequests.at(-1).p_dataset, 'tickets');
  const insights = await page.locator('.kpi-lab-insights').innerText();
  for (const label of ['Cerrados antes de 24 h', 'Cerrados antes de 48 h', 'Mediana de cierre', 'Cumplimiento del plazo']) assert.ok(insights.includes(label), label);
  for (const title of ['Evolución: volumen y cierres fuera del plazo', 'Mapa de cierres', 'Curva de cierre', 'Distribución del tiempo de cierre', 'Cuándo llegan los tickets', 'Cumplimiento del plazo por grupo'])
    await page.locator('.kpi-lab-panel figcaption strong', { hasText: title }).first().waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.kpi-lab-canvas')].filter(el => el.querySelector('canvas')).length >= 6);
  await page.locator('.kpi-lab-panel', { hasText: 'Cumplimiento del plazo por grupo' }).getByRole('button', { name: 'Equipo', exact: true }).click();
  assert.equal(await page.locator('.kpi-lab-panel', { hasText: 'Cumplimiento del plazo por grupo' }).getByRole('button', { name: 'Equipo', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.locator('.kpi-lab').screenshot({ path: shot('time-lab.png') });
  // Supremo on in-person visits: same filters as the summary, cards filter the visits table.
  const supremo = page.locator('.kpi-supremo:visible');
  await supremo.locator('.kpi-card small', { hasText: /^Cumplimiento$/ }).waitFor();
  assert.deepEqual(supremoRequests.at(-1), summaryRequests.at(-1), 'the Supremo metric uses the dashboard filters');
  assert.equal((await supremo.locator('.kpi-card', { hasText: 'Cumplimiento' }).locator('.kpi-value').innerText()).trim(), '50 %');
  await supremo.locator('.kpi-card', { hasText: 'Negativas' }).locator('.kpi-card-body').click();
  assert.equal(await supremo.locator('.kpi-supremo-visits tbody tr').count(), 1);
  await supremo.getByRole('group', { name: 'Filtrar por resultado' }).getByRole('button', { name: 'Todas' }).click();
  assert.equal(await supremo.locator('.kpi-supremo-visits tbody tr').count(), 3);
  assert.equal(await supremo.locator('.kpi-supremo-visits').getByRole('button', { name: 'Justificar' }).count(), 2, 'negative and pending visits can be justified');
  // PowerPoint deck of the general summary, built in the browser from the same summary and tickets.
  const deckDownload = page.waitForEvent('download', { timeout: 60000 });
  await visible.getByRole('button', { name: 'Presentación PowerPoint' }).click();
  const deckPath = shot('resumen-general.pptx'); await (await deckDownload).saveAs(deckPath);
  const deck = await JSZip.loadAsync(await fs.readFile(deckPath));
  const slideFiles = Object.keys(deck.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  assert.ok(slideFiles.length >= 14, `${slideFiles.length} diapositivas`);
  const deckText = (await Promise.all(slideFiles.map(name => deck.file(name).async('string')))).join(' ');
  for (const phrase of ['Indicadores de servicio', 'RESUMEN EJECUTIVO', 'LO QUE MUESTRA', 'CÓMO LEERLA', 'Balance de carga por colaborador', 'Cómo se calculan los indicadores', 'human - centred biotech'])
    assert.ok(deckText.includes(phrase), `la presentación incluye «${phrase}»`);
  assert.ok(Object.keys(deck.files).filter(name => name.startsWith('ppt/media/')).length >= 8, 'charts and wordmarks are embedded images');
  assert.ok(Object.keys(deck.files).some(name => /^ppt\/notesSlides\//.test(name)), 'chart slides carry speaker notes');
  await visible.getByRole('button', { name: 'Presentación PowerPoint' }).waitFor();
  assert.equal(await visible.getByRole('button', { name: 'Presentación PowerPoint' }).isEnabled(), true);
  await page.screenshot({ path: shot('general-desktop.png'), fullPage: true });
  await card('Tickets abiertos').locator('.kpi-card-body').click();
  await page.getByText(`${opened} registros con los filtros actuales`).waitFor();
  assert.deepEqual(recordRequests.at(-1).p_match, { opened_in_period: true });
  assert.equal(await page.locator('.kpi-records tbody tr').count(), 25);
  await page.locator('.kpi-records').getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.waitForFunction(count => document.querySelectorAll('.kpi-records tbody tr').length === count, opened - 25);
  await page.locator('.kpi-records').getByRole('button', { name: /^Folio/ }).click();
  await page.waitForFunction(() => document.querySelector('.kpi-records tbody tr td')?.textContent === 'OR-0026');
  assert.equal(recordRequests.at(-1).p_sort, 'folio'); assert.equal(recordRequests.at(-1).p_offset, 0, 'sorting returns to the first page');
  await page.locator('.kpi-records').getByRole('button', { name: /^Folio/ }).click();
  await page.waitForFunction(() => document.querySelector('.kpi-records tbody tr td')?.textContent === 'OR-0001');
  const headers = await page.locator('.kpi-records thead th').allTextContents();
  const csvDownload = page.waitForEvent('download');
  await page.locator('.kpi-records').getByRole('button', { name: 'Exportar CSV' }).click();
  const csvPath = shot('tickets.csv'); await (await csvDownload).saveAs(csvPath);
  const csvLines = (await fs.readFile(csvPath, 'utf8')).replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(csvLines.length, opened + 1, 'CSV holds every filtered record, not only the page');
  assert.equal(csvLines[0].split(',')[0], headers[0].replace(/ [↑↓]$/, ''));
  const xlsxDownload = page.waitForEvent('download');
  await page.locator('.kpi-records').getByRole('button', { name: 'Exportar Excel' }).click();
  const xlsxPath = shot('tickets.xlsx'); await (await xlsxDownload).saveAs(xlsxPath);
  const book = new ExcelJS.Workbook(); await book.xlsx.readFile(xlsxPath);
  assert.equal(book.getWorksheet('Registros').rowCount, opened + 1);
  assert.ok(book.getWorksheet('Criterios').getColumn(1).values.includes('Fórmula'), 'export documents the formula');
  await page.locator('.kpi-records').getByLabel('Buscar en estos registros').fill('or-0003');
  await page.getByText('1 registros con los filtros actuales').waitFor();
  // From a record to its ticket in the case control.
  await page.locator('.kpi-records').getByRole('button', { name: 'Abrir ticket' }).click();
  await page.getByRole('button', { name: 'Cerrar vista', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Control de casos/ }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByLabel('Buscar en el expediente').inputValue(), 'OR-0003');
  console.log('PASS: general summary, card → records with equal totals, paging, server sort, search, CSV/Excel with every row, record → ticket, Supremo metric');

  // Capture: an open case records a call with duration, motive, result and catalog codes, and its priority.
  await page.getByLabel('Buscar en el expediente').fill('OR-0025');
  await page.getByRole('button', { name: 'Ver expediente', exact: true }).click();
  await page.getByLabel('Movimiento', { exact: true }).selectOption('llamada');
  await page.getByLabel('Duración (minutos)').fill('18');
  await page.getByLabel('Motivo de la actividad').selectOption('resultados_qc');
  await page.getByLabel('Resultado de la actividad').selectOption('resuelto');
  await page.getByLabel('Código de avería').fill('AL08 - Lámpara');
  await page.getByLabel('Detalle del movimiento').fill('Se orientó al laboratorio por teléfono y se corrigió la calibración.');
  await page.getByRole('button', { name: 'Guardar movimiento', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('textarea')?.value === '');
  assert.deepEqual(movements.at(-1).p_activity, { duracion_min: '18', motivo: 'resultados_qc', resultado: 'resuelto', codigo_averia: 'AL08', codigo_solucion: '' });
  assert.equal(movements.at(-1).p_action, 'llamada');
  await page.getByLabel('Movimiento', { exact: true }).selectOption('avance');
  assert.equal(await page.getByLabel('Duración (minutos)').count(), 0, 'activity data is only offered for calls and visits');
  await page.getByLabel('Prioridad del caso').selectOption('alta');
  await Promise.all([page.waitForResponse(response => response.url().includes('set_ticket_priority')), page.getByRole('button', { name: 'Guardar prioridad', exact: true }).click()]);
  assert.deepEqual(priorities.at(-1), { p_ticket_id: 'case-25', p_priority: 'alta' });
  await page.screenshot({ path: shot('captura-llamada.png'), fullPage: false });
  console.log('PASS: structured call capture and audited priority from the case file');

  // Chemists: weekly default, person filter, help, chart drill-down, empty and error states.
  await page.getByRole('button', { name: /Químicos/ }).click();
  await card('Capacitaciones').waitFor();
  const chemistRequest = summaryRequests.at(-1);
  assert.equal(chemistRequest.team, 'quimica'); assert.equal(chemistRequest.granularity, 'week');
  assert.equal(await cardValue('Capacitaciones'), String(metrics({ team: 'quimica' }).trainings));
  assert.equal(await cardValue('Resuelto sin visita'), `${metrics({ team: 'quimica' }).calls_resolved_rate.pct} %`);
  await visible.getByLabel('Colaborador').selectOption('q1');
  await page.waitForResponse(response => response.url().includes('get_service_kpi_summary'));
  assert.equal(summaryRequests.at(-1).person, 'q1');
  await card('Capacitaciones').waitFor();
  await page.waitForFunction(value => [...document.querySelectorAll('.kpi-center:not([hidden]) .kpi-card')].some(el => el.querySelector('small')?.textContent === 'Capacitaciones' && el.querySelector('.kpi-value')?.textContent === value), String(metrics({ team: 'quimica', person: 'q1' }).trainings));
  await visible.getByRole('button', { name: 'Cómo se calcula: Capacitaciones y recapacitaciones' }).first().click();
  const help = visible.getByRole('dialog', { name: 'Capacitaciones y recapacitaciones' });
  await help.waitFor(); assert.match(await help.innerText(), /fórmula[\s\S]*denominador/i);
  await page.keyboard.press('Escape'); await help.waitFor({ state: 'detached' });
  await visible.locator('.kpi-chart', { hasText: 'Capacitaciones y recapacitaciones' }).locator('path.is-clickable').first().click();
  await page.getByRole('heading', { name: 'Capacitaciones en el intervalo' }).waitFor();
  assert.ok(weeks.includes(recordRequests.at(-1).p_match.bucket), 'a column opens the records of its interval');
  await page.screenshot({ path: shot('quimicos-desktop.png'), fullPage: true });
  await visible.getByLabel('Cliente').fill('Cliente inexistente');
  await visible.locator('.kpi-banner', { hasText: 'Sin registros en el periodo con estos filtros.' }).waitFor();
  assert.equal(await cardValue('Resuelto sin visita'), 'No aplica', 'an empty denominator is not 0 %');
  assert.equal(await cardValue('Capacitaciones'), '0', 'no activity is a real zero');
  failSummary = true;
  await visible.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await visible.getByRole('alert').filter({ hasText: 'Servicio temporalmente no disponible' }).waitFor();
  failSummary = false;
  await visible.getByRole('button', { name: 'Reintentar' }).click();
  await visible.getByRole('alert').filter({ hasText: 'Servicio temporalmente no disponible' }).waitFor({ state: 'detached' });
  await visible.getByRole('button', { name: 'Limpiar filtros' }).click();
  await page.waitForFunction(() => !document.querySelector('.kpi-center:not([hidden]) .kpi-banner'));
  console.log('PASS: chemists weekly view, person filter, contextual help, chart drill-down, zero vs not applicable, error and retry');

  // Engineers: monthly default and preventive compliance.
  await page.getByRole('button', { name: /Ingenieros/ }).click();
  await card('Cumplimiento de preventivos').waitFor();
  assert.equal(summaryRequests.at(-1).team, 'ingenieria'); assert.equal(summaryRequests.at(-1).granularity, 'month');
  const compliance = metrics({ team: 'ingenieria' }).preventive_compliance;
  assert.equal(await cardValue('Cumplimiento de preventivos'), `${compliance.pct} %`);
  await card('Cumplimiento de preventivos').locator('.kpi-card-body').click();
  await page.getByText(`${compliance.num} registros con los filtros actuales`).waitFor();
  await page.screenshot({ path: shot('ingenieros-desktop.png'), fullPage: true });
  console.log('PASS: engineers monthly view and preventive compliance drill-down');

  // Responsive layout without page-level horizontal overflow.
  for (const [width, name] of [[820, 'tablet'], [390, 'mobile']]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: /Químicos/ }).click();
    await card('Capacitaciones').waitFor();
    await page.waitForTimeout(150);
    const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(layout.scroll <= layout.width, `${name}: no horizontal page overflow (${layout.scroll} > ${layout.width})`);
    await page.screenshot({ path: shot(`quimicos-${name}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1500, height: 1100 });
  console.log('PASS: tablet and mobile layouts keep the page within the viewport');

  for (const team of ['quimica', 'ingenieria']) assert.ok(supremoRequests.some(filters => filters.team === team), `the ${team} view asks the Supremo metric for its own team`);
  allowControl = false;
  const before = summaryRequests.length; const supremoBefore = supremoRequests.length;
  await page.reload();
  await page.getByText('El centro de control es exclusivo para administradores.', { exact: true }).waitFor();
  assert.equal(summaryRequests.length, before, 'non-administrators never request staff indicators');
  assert.equal(supremoRequests.length, supremoBefore, 'non-administrators never request the Supremo metric');
  assert.deepEqual(errors, []);
  console.log('PASS: administrators only, no page errors');
} catch (error) {
  await page.screenshot({ path: shot('failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }
