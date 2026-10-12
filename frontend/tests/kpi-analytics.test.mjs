// Per-ticket analytics behind the "Cumplimiento y tiempos" lab: run with `npm run test:kpi:analytics`.
import assert from 'node:assert/strict';
import {
  arrivalMatrix, closingHistogram, complianceBy, curveMedian, describeVisit, formatSpan, kaplanMeier, lateShare, quantile, resolvedBy, toPoint, toPoints,
  toVisitLinks, visitIndicators, wilson,
} from '../src/components/kpiAnalytics.ts';

const H = 3600000;
const base = Date.parse('2026-09-07T15:00:00Z'); // Monday 09:00 in America/Chihuahua (UTC-6)
const row = (i, extra = {}) => ({
  ticket_id: `t${i}`, folio: `OR-${i}`, asunto: 'Caso', client: 'Hospital Norte', platform: 'BA400', serial: `S${i}`, team: 'ingenieria', priority: 'alta',
  channel: null, region: 'foraneo', responsible_id: 'e1', responsible_name: 'Ana', opened_at: new Date(base).toISOString(), closed_at: null,
  sla_target_hours: 48, sla_result: 'en_curso', closure_class: null, justified: false, opened_in_period: true, closed_in_period: false, sla_evaluable: false, ...extra,
});
const closedRow = (i, hours, result, extra = {}) => row(i, {
  closed_at: new Date(base + hours * H).toISOString(), closure_class: 'solucionado', sla_result: result, closed_in_period: true,
  sla_evaluable: result === 'dentro' || result === 'fuera', ...extra,
});

// Parsing: outcome mapping, cancelled cases, invalid rows dropped.
assert.equal(toPoint(closedRow(1, 10, 'dentro')).outcome, 'dentro');
assert.equal(toPoint(closedRow(2, 72, 'fuera', { justified: true })).outcome, 'justificado');
assert.equal(toPoint(closedRow(3, 5, 'no_aplica', { closure_class: 'cancelado' })).cancelled, true);
assert.equal(toPoint(row(4)).outcome, 'abierto');
assert.equal(toPoint(closedRow(5, 30, 'dentro')).hours, 30);
assert.equal(toPoint({ ...row(6), opened_at: 'no es fecha' }), null);
assert.equal(toPoints([row(7), { ticket_id: null }]).length, 1);

// Wilson interval: 1 of 1 is not certainty; large samples narrow around the rate.
const one = wilson(1, 1);
assert.equal(one.pct, 100);
assert.ok(one.low < 25 && one.high === 100, `1 de 1 → ${one.low}–${one.high}`);
const big = wilson(86, 100);
assert.ok(big.low > 77 && big.high < 92);
assert.equal(wilson(0, 0), null);
assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
assert.equal(quantile([], 0.5), null);

// Kaplan–Meier: open tickets are censored at the cut, never counted as closed.
const cut = base + 100 * H;
const cohort = toPoints([closedRow(1, 10, 'dentro'), closedRow(2, 20, 'dentro'), closedRow(3, 60, 'fuera'), row(4), closedRow(5, 1, 'no_aplica', { closure_class: 'cancelado' })]);
const curve = kaplanMeier(cohort, cut);
assert.equal(curve.n, 4, 'cancelled cases leave the cohort');
assert.equal(curve.events, 3);
assert.equal(resolvedBy(curve, 24), 50);
assert.equal(resolvedBy(curve, 48), 50);
assert.equal(resolvedBy(curve, 70), 75);
assert.equal(curveMedian(curve), 20);
const censoredEarly = kaplanMeier(toPoints([closedRow(1, 10, 'dentro'), row(2, { opened_at: new Date(cut - 5 * H).toISOString() }), closedRow(3, 30, 'dentro')]), cut);
assert.equal(resolvedBy(censoredEarly, 12), 50, 'at 10 h one of the two tickets still at risk closes (the censored one left at 5 h)');
assert.equal(resolvedBy(censoredEarly, 40), 100, 'a ticket opened 5 h before the cut leaves the risk set at 5 h');
assert.equal(resolvedBy(kaplanMeier([], cut), 24), null);

// Histogram: bins anchored at 24/48 h, cancelled excluded, members kept for drill-down.
const histogram = closingHistogram(toPoints([closedRow(1, 0.5, 'dentro'), closedRow(2, 30, 'dentro'), closedRow(3, 50, 'fuera'), closedRow(4, 50, 'fuera', { justified: true }), closedRow(5, 3, 'no_aplica', { closure_class: 'cancelado' })]));
assert.equal(histogram.total, 4);
assert.deepEqual(histogram.counts.dentro.slice(0, 6), [1, 0, 0, 0, 1, 0]);
assert.equal(histogram.counts.fuera[5], 1);
assert.equal(histogram.counts.justificado[5], 1);
assert.equal(histogram.members[5].length, 2);
assert.equal(histogram.median, 40);

// Arrivals in the KPI time zone: Monday 09:00 local, not 15:00 UTC.
const cells = arrivalMatrix(toPoints([row(1), row(2), row(3, { opened_in_period: false })]), 'America/Chihuahua');
assert.equal(cells[0][9].length, 2);
assert.equal(cells.flat().reduce((sum, list) => sum + list.length, 0), 2);
assert.deepEqual(lateShare(toPoints([closedRow(1, 10, 'dentro'), closedRow(2, 72, 'fuera'), row(3)])), { n: 2, late: 1 });

// Compliance by dimension: justified delays are still late; null groups get a readable name and match.
const byTeam = complianceBy(toPoints([
  closedRow(1, 10, 'dentro'), closedRow(2, 72, 'fuera'), closedRow(3, 72, 'fuera', { justified: true }),
  closedRow(4, 10, 'dentro', { team: 'quimica', responsible_id: null, responsible_name: null }), row(5),
]), 'equipo');
assert.equal(byTeam.rows[0].name, 'Ingenieros');
assert.equal(byTeam.rows[0].n, 3);
assert.equal(byTeam.rows[0].late, 2);
assert.equal(Math.round(byTeam.overall.pct), 50);
const byPerson = complianceBy(toPoints([closedRow(1, 10, 'dentro', { responsible_id: null, responsible_name: null })]), 'responsable');
assert.equal(byPerson.rows[0].value, null);
assert.equal(byPerson.rows[0].name, 'Sin responsable');
assert.equal(complianceBy(toPoints([closedRow(1, 10, 'dentro', { channel: 'falcon' })]), 'canal').rows[0].name, 'Falcon');

// Ticket → visit (estimated): conversion over non-cancelled closures, days for tickets opened in the
// period, first-visit fix when no other corrective follows within the recurrence window.
const visitPoints = toPoints([closedRow(1, 30, 'dentro'), closedRow(2, 90, 'fuera'), closedRow(3, 10, 'dentro'), closedRow(4, 5, 'no_aplica', { closure_class: 'cancelado' }),
  row(5, { opened_in_period: false, closed_in_period: true, closed_at: new Date(base + 50 * H).toISOString(), sla_result: 'dentro', sla_evaluable: true })]);
const visitLinks = toVisitLinks([
  { ticket_id: 't1', folio: 'OR-1', servicio_id: 's1', id_legacy: 2210, fecha_servicio: '2026-09-09', dias: 2, confianza: 'segura', tipo: 'correctivo', tecnico: 'Ana', revisitas: 0 },
  { ticket_id: 't2', folio: 'OR-2', servicio_id: 's2', id_legacy: null, fecha_servicio: '2026-09-07', dias: 0, confianza: 'probable', tipo: 'visita', tecnico: null, revisitas: 1 },
  { ticket_id: 't5', folio: 'OR-5', servicio_id: 's5', id_legacy: 9, fecha_servicio: '2026-09-12', dias: 5, confianza: 'registrada', tipo: 'correctivo', tecnico: 'Beto', revisitas: 0 },
  { ticket_id: 'tx', servicio_id: 'sx', dias: 3, confianza: 'inventada' },
]);
assert.equal(visitLinks.length, 3, 'unknown confidence levels are dropped');
const visits = visitIndicators(visitPoints, visitLinks);
assert.equal(visits.closed, 4, 'cancelled closures leave the denominator');
assert.equal(visits.closedWithVisit, 3);
assert.equal(Math.round(visits.conversion.pct), 75);
assert.equal(visits.linked, 2, 'days only count tickets opened in the period');
assert.equal(visits.medianDays, 1);
assert.equal(visits.firstFix, 2);
assert.equal(Math.round(visits.firstFixRate.pct), 67);
assert.deepEqual(visits.confidence, { registrada: 0, segura: 1, probable: 1 });
assert.equal(visits.days[2].segura.length, 1); assert.equal(visits.days[0].probable.length, 1);
assert.equal(describeVisit(visitLinks[0]), 'LEG-2210 · 2026-09-09 · correctivo · Ana · 2 días después');
assert.equal(describeVisit(visitLinks[1]), 'Servicio · 2026-09-07 · visita · Sin ingeniero con perfil · el mismo día');

assert.equal(formatSpan(0.5), '30 min');
assert.equal(formatSpan(30), '30 h');
assert.equal(formatSpan(2568), '107 días');
assert.equal(formatSpan(null), 'Sin dato');
console.log('PASS: parsing, Wilson intervals, Kaplan–Meier with censoring, closing histogram, arrivals by local hour, compliance by group, ticket → visit and formatting');
