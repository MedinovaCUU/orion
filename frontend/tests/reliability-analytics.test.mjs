// Reliability lab domain rules (episodes, delivery, censoring, cohorts, verdicts): `npm run test:reliability:analytics`.
// Hand-built scenario with exact expectations + the fictitious generator (tests/fixtures/syntheticReliability.mjs).
import assert from 'node:assert/strict';
import { analyze, buildModel, caveatsOf, defaultSettings, followUp, ratioVerdict, simulateScenarios, toDay } from '../src/components/reliabilityAnalytics.ts';
import { syntheticLab, withCapturedEpisode } from './fixtures/syntheticReliability.mjs';

let n = 0;
const svc = (serial, day, kind, extra = {}) => ({ id: `hist:${++n}`, history_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, ref: `Servicio ${n}`, day, day_end: extra.day_end ?? day, kind,
  serial_key: serial, serial, model: extra.model ?? 'BA400', client: extra.client ?? 'Laboratorio A', sector: extra.sector ?? 'particular', minutes: extra.minutes ?? 120, ticket_id: null,
  note: extra.note ?? null, parts: extra.parts ?? [] });
const services = [
  svc('S1', '2024-01-01', 'preventivo'), svc('S1', '2024-02-01', 'reacondicionamiento', { parts: [['5625', 1]] }), svc('S1', '2024-02-20', 'reacondicionamiento', { parts: [['AC1', 2]] }),
  svc('S1', '2024-03-01', 'instalacion', { client: 'Laboratorio A' }), svc('S1', '2024-03-05', 'correctivo', { parts: [['AC9', 1]] }), svc('S1', '2024-03-20', 'correctivo'),
  svc('S1', '2024-09-01', 'retiro'), svc('S1', '2024-10-01', 'correctivo'),
  svc('S2', '2024-01-10', 'reacondicionamiento', { note: 'Proceso incompleto, queda a cargo del Ing. X.' }),
  svc('S3', '2025-01-01', 'reacondicionamiento', { model: 'A15' }),
  svc('S4', '2024-05-01', 'instalacion', { model: 'A15' }), svc('S4', '2024-06-01', 'correctivo', { model: 'A15' }),
  svc('S5', '2022-12-01', 'instalacion', { model: 'A15' }),
  svc('S6', '2023-06-01', 'preventivo', { model: 'BA200' }), svc('S6', '2024-01-01', 'instalacion', { model: 'BA200' }),
  svc('S7', '2024-04-01', 'reacondicionamiento'), svc('S7', '2024-04-15', 'instalacion', { client: 'Biosystems' }),
  svc('S8', '2023-05-01', 'reacondicionamiento'), svc('S8', '2023-06-01', 'instalacion'), svc('S8', '2024-01-01', 'reacondicionamiento', { parts: [['5625', 1], ['AC2', 3]] }), svc('S8', '2024-02-01', 'instalacion'),
];
const payload = {
  generated_at: '2026-10-13T12:00:00Z', services, catalog: { AC9: 'Pieza nueve' }, episodes: [], decisions: [], tests: [], links: [], costs: [],
  tickets: [{ id: 't1', folio: 'BIO-1', serial_key: 'S1', opened_at: '2024-03-04T17:00:00Z', closed_at: null, status: 'cerrado', subject: 'Falla' }],
  equipment: [{ serial_key: 'S2', model: 'BA400', client: 'Hospital B', assigned_on: '2024-02-10', ended_on: null, warranty_until: null },
    { serial_key: 'S1', model: 'BA400', client: 'Laboratorio A', assigned_on: '2024-03-02', ended_on: null, warranty_until: null }],
};
const model = buildModel(payload, { cutDay: toDay('2026-10-13') });
const settings = { ...defaultSettings, platforms: null };

// Episodes: records ≤ 60 days apart are one job; each later job is its own episode.
assert.equal(model.episodes.length, 6);
const s1 = model.episodes.find(e => e.serialKey === 'S1');
assert.equal(s1.partsQty, 3); assert.deepEqual([...s1.codes].sort(), ['5625', 'AC1']);
assert.equal(s1.start, toDay('2024-02-01')); assert.equal(s1.end, toDay('2024-02-20')); assert.equal(s1.priorKind, 'preventivo');
// Delivery: installation record wins when it is not later than the assignment date; assignment otherwise.
assert.equal(s1.delivery, toDay('2024-03-01')); assert.equal(s1.deliverySource, 'instalacion'); assert.equal(s1.stopReason, 'retiro');
const s2 = model.episodes.find(e => e.serialKey === 'S2');
assert.equal(s2.deliverySource, 'asignacion'); assert.equal(s2.destination, 'Hospital B');
assert.deepEqual(s2.caveats, ['Proceso incompleto', 'Trabajo pendiente o transferido']);
assert.equal(model.episodes.find(e => e.serialKey === 'S3').delivery, null, 'never delivered → no follow-up');
assert.equal(model.episodes.find(e => e.serialKey === 'S7').internal, true);
const s8 = model.episodes.filter(e => e.serialKey === 'S8');
assert.equal(s8.length, 2); assert.equal(s8[0].stopReason, 'nuevo_reacondicionamiento'); assert.equal(s8[0].stop, toDay('2024-01-01')); assert.equal(s8[1].ordinal, 2);

// Cohorts: first installation needs no earlier history and a date inside the structured history; reinstalled otherwise.
const cohortOf = serial => model.units.filter(u => u.serialKey === serial).map(u => u.cohort);
assert.deepEqual(cohortOf('S4'), ['primera_instalacion']); assert.deepEqual(cohortOf('S5'), []); assert.deepEqual(cohortOf('S6'), ['reinstalado']);
assert.deepEqual(cohortOf('S3'), []); assert.deepEqual(cohortOf('S8'), ['reacondicionado', 'reacondicionado']);

// Follow-up: censored at retiro; a corrective after retiro never counts; the ticket day uses America/Chihuahua.
const f1 = followUp(model, model.units.find(u => u.serialKey === 'S1'), settings);
assert.equal(f1.fu, toDay('2024-09-01') - toDay('2024-03-01')); assert.equal(f1.failures.length, 2); assert.equal(f1.first, 4); assert.equal(f1.complete, false);
assert.deepEqual(f1.tickets, [3]);
assert.equal(followUp(model, model.units.find(u => u.serialKey === 'S1'), { ...settings, horizon: 30 }).fu, 30);

const a = analyze(model, settings);
assert.equal(a.recon.units, 4, 'S7 (internal destination) is excluded by default');
assert.equal(analyze(model, { ...settings, includeInternal: true }).recon.units, 5);
assert.equal(a.first.units, 1); assert.equal(a.reinstall.units, 1);
const e30 = a.early.find(w => w.days === 30);
assert.equal(e30.recon.k, 1); assert.equal(e30.recon.n, 4); assert.equal(e30.level, 'insuficiente');
assert.deepEqual([a.repeat.recon.k, a.repeat.recon.n], [1, 2], 'day-4 corrective repeated on day 19; the day-19 one had 30 days observed without repeat');
assert.equal(a.componentTotals.lines, 1); assert.equal(a.componentTotals.notReplaced, 1); assert.equal(a.components[0].code, 'AC9'); assert.equal(a.components[0].name, 'Pieza nueve');
assert.equal(a.comparison.level, 'insuficiente');
assert.equal(a.quality.notDelivered, 1); assert.equal(a.quality.byAssignment, 1);
assert.equal(a.trd.level, 'sin_datos'); assert.equal(a.costs.level, 'sin_datos');
assert.ok(a.findings.every(f => f.question && f.answer && f.level));
const rqiS1 = a.rqi.find(r => r.episode.serialKey === 'S1');
assert.equal(rqiS1.failure90, true); assert.equal(rqiS1.definitive, true); assert.equal(rqiS1.release, 'sin_registro');

// Captured episodes attach to the derived job through a shared history record; otherwise they stand alone.
const capturedPayload = { ...payload, episodes: [
  { id: 'cap-1', serial_key: 'S2', serial_raw: 'S2', platform: 'BA400', started_on: '2024-01-12', finished_on: null, history_service_ids: [], scope: 'minimo', release_result: 'pendiente', release_notes: null, budget_requested_mxn: 12000, budget_approved_mxn: 4000, budget_source: 'x', notes: null, created_at: '', updated_at: '' },
  { id: 'cap-2', serial_key: 'S9', serial_raw: 's9', platform: 'A25', started_on: '2026-10-01', finished_on: null, history_service_ids: [], scope: 'no_definido', release_result: 'pendiente', release_notes: null, budget_requested_mxn: null, budget_approved_mxn: null, budget_source: null, notes: null, created_at: '', updated_at: '' },
] };
const m2 = buildModel(capturedPayload, { cutDay: toDay('2026-10-13') });
assert.equal(m2.episodes.find(e => e.serialKey === 'S2').captured.id, 'cap-1');
assert.equal(m2.episodes.find(e => e.serialKey === 'S9').id, 'cap:cap-2'); assert.equal(m2.episodes.find(e => e.serialKey === 'S9').platform, 'A25');

// Caveat phrases: defects found ("falta de fuerza") are not caveats; missing parts for the job are.
assert.deepEqual(caveatsOf('Se cambia motor por falta de fuerza.'), []);
assert.deepEqual(caveatsOf('Quedan pendientes; faltan las piezas del kit.'), ['Trabajo pendiente o transferido', 'Faltan piezas']);
assert.deepEqual(caveatsOf('No se realizaron pruebas a petición de gerencia.'), ['Pruebas no realizadas', 'Alcance decidido por un tercero']);

// Verdicts: robust check can veto a «sostenida»; small samples are insufficient.
const crude = { ratio: 1.5, low: 1.1, high: 2, p: 0.01, corrected: false };
assert.equal(ratioVerdict(30, 30, 40, crude, crude), 'sostenida');
assert.equal(ratioVerdict(30, 30, 40, crude, crude, { low: 0.9, high: 2.2 }), 'indicio');
assert.equal(ratioVerdict(30, 30, 40, crude, crude, { p: 0.2 }), 'indicio');
assert.equal(ratioVerdict(9, 30, 40, crude, crude), 'insuficiente');
assert.equal(ratioVerdict(30, 30, 40, { ratio: 1.1, low: 0.8, high: 1.5, p: 0.5, corrected: false }, null), 'sin_diferencia');

// Fictitious generator: the known signal (fewer parts → more failures) is recovered; results are deterministic.
const fake = withCapturedEpisode(syntheticLab());
const fm = buildModel(fake, { cutDay: toDay('2026-10-13') });
const fa = analyze(fm, defaultSettings);
assert.ok(fa.dose.low.rate.rate > fa.dose.high.rate.rate, 'fewer parts → higher corrective rate in the synthetic set');
assert.ok(fa.dose.rrMH.ratio > 1);
assert.ok(fa.recon.units > 30 && fa.first.units > 60);
assert.equal(fa.trd.recommended, 2); assert.equal(fa.trd.rejected, 1); assert.ok(fa.costs.total > 0);
assert.deepEqual(analyze(fm, defaultSettings).findings.map(f => f.answer), fa.findings.map(f => f.answer));
const sim = simulateScenarios(fa, { visitCost: 8000, partCost: 2500, partsPerCorrective: 1, extraParts: 3, newUnitPrice: null, years: 1 });
assert.deepEqual(simulateScenarios(fa, { visitCost: 8000, partCost: 2500, partsPerCorrective: 1, extraParts: 3, newUnitPrice: null, years: 1 }).difference, sim.difference);
assert.ok(sim.difference.pBCheaper >= 0 && sim.difference.pBCheaper <= 1);
assert.equal(sim.scenarios.find(s => s.key === 'C').available, false);
assert.equal(sim.scenarios.find(s => s.key === 'D').available, false);
assert.equal(simulateScenarios(fa, { visitCost: 8000, partCost: 2500, partsPerCorrective: 1, extraParts: 3, newUnitPrice: 400000, years: 1 }).scenarios.find(s => s.key === 'D').available, true);

console.log('reliability-analytics: OK');
