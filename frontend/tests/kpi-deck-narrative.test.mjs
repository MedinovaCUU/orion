// Words of the PowerPoint deck: every sentence comes from the summary and the ticket rows.
// Run with `npm run test:kpi:deck`.
import assert from 'node:assert/strict';
import { toPoints, toVisitLinks, visitIndicators } from '../src/components/kpiAnalytics.ts';
import {
  arrivalsText, curveText, deckFacts, distributionText, evolutionText, executiveSummary, groupsText, periodLabel, scatterText, visitText,
} from '../src/components/kpiDeckNarrative.ts';

const H = 3600000;
const base = Date.parse('2026-09-07T15:00:00Z'); // lunes 09:00 en America/Chihuahua
const row = (i, hours, result, extra = {}) => ({
  ticket_id: `t${i}`, folio: `OR-${i}`, asunto: 'Caso', client: 'Hospital Norte', platform: 'BA400', team: 'ingenieria', priority: 'media',
  responsible_id: i % 2 ? 'a' : 'b', responsible_name: i % 2 ? 'Ana' : 'Beto', opened_at: new Date(base + i * 60000).toISOString(),
  closed_at: hours === null ? null : new Date(base + i * 60000 + hours * H).toISOString(), closure_class: hours === null ? null : 'solucionado',
  sla_target_hours: 48, sla_result: result, justified: false, opened_in_period: true, closed_in_period: hours !== null, sla_evaluable: result === 'dentro' || result === 'fuera', ...extra,
});
const rows = [
  ...Array.from({ length: 12 }, (_, i) => row(i, 6 + i, 'dentro')),
  ...Array.from({ length: 4 }, (_, i) => row(20 + i, 60 + i * 50, 'fuera')),
  row(30, 300, 'no_aplica', { closure_class: 'cancelado' }),
  row(31, null, 'en_curso'),
];
const summary = {
  period: { from: '2026-09-01', to: '2026-09-30', previous_from: '2026-08-01', previous_to: '2026-08-31', cut_at: new Date(base + 30 * 24 * H).toISOString(),
    cut_is_now: false, timezone: 'America/Chihuahua', granularity: 'week', recurrence_days: 30, min_sample: 5, capture_since: '2026-10-12T00:00:00Z' },
  current: { tickets_opened: 18, tickets_closed: 17, tickets_cancelled: 1, late_rate: { num: 4, den: 16, pct: 25 }, sla_compliance: { num: 12, den: 16, pct: 75 },
    pending_at_cut: 1, overdue_at_cut: 0 },
  previous: { tickets_opened: 15, sla_compliance: { num: 10, den: 15, pct: 66.7 } },
  series: [
    { bucket: '2026-08-31', opened: 18, closed: 10, closed_late: 1, sla_evaluable: 9 },
    { bucket: '2026-09-07', opened: 0, closed: 7, closed_late: 3, sla_evaluable: 7 },
    { bucket: '2026-09-14', opened: 0, closed: 0, closed_late: 0, sla_evaluable: 2 },
  ],
  breakdowns: { staff: [] }, quality: {}, policies: [],
};
const points = toPoints(rows);
const facts = deckFacts(summary, points);

assert.equal(facts.closedHours, 16, 'cases sent to administration leave the timing analysis');
assert.equal(facts.closedAll, 17, 'but they are still points on the closures map');
assert.equal(facts.beyond48, 4);
assert.equal(facts.openAtCut, 1);
assert.equal(facts.peak.day, 0); assert.equal(facts.peak.hour, 9);
assert.ok(periodLabel(summary).includes('2026'));

const brief = executiveSummary(summary, facts);
assert.match(brief[0], /Se abrieron 18 tickets de soporte \(\+20 % vs\. periodo anterior\) y se cerraron 17; 1 se envió a administrativo\./);
assert.match(brief[1], /^75 % de los cierres evaluables quedó dentro del plazo comprometido \(\+8\.3 pp vs\. periodo anterior\): 4 de 16/);
assert.match(brief.at(-1), /lun entre las 9:00 y las 10:00/);

const evolution = evolutionText(summary, facts);
assert.equal(evolution.headline, '25 % de los cierres evaluables quedó fuera del plazo');
assert.ok(evolution.shows.some(line => line.includes('menos de 5 cierres evaluables')), 'thin intervals are flagged as not conclusive');
assert.equal(curveText(facts).headline.endsWith('se cierra antes de 48 horas'), true);
assert.match(distributionText(facts).shows[1], /tardó más de 48 horas \(4 cierres\)/);
assert.match(scatterText(facts).headline, /17 cierres/);
assert.match(arrivalsText(summary, facts).headline, /lun a las 9:00/);
const groups = groupsText(facts);
assert.ok(groups.shows.some(line => line.startsWith('Cumplimiento general: 75 %')));
assert.ok(groups.howTo.some(line => line.includes('No es un ranking')));
for (const text of [evolution, curveText(facts), distributionText(facts), scatterText(facts), arrivalsText(summary, facts), groups]) {
  assert.ok(text.headline && text.howTo.length && text.source.startsWith('Fuente: ORION'), text.headline);
}

const visitSlide = visitText(visitIndicators(points, toVisitLinks([
  { ticket_id: 't0', folio: 'OR-0', servicio_id: 's0', dias: 1, confianza: 'segura', tipo: 'correctivo', revisitas: 0 },
  { ticket_id: 't20', folio: 'OR-20', servicio_id: 's20', dias: 3, confianza: 'probable', tipo: 'visita', revisitas: 2 },
])), 30);
assert.match(visitSlide.headline, /^12\.5 % de los tickets terminó en visita, en una mediana de 2 días$/);
assert.ok(visitSlide.shows.some(line => line.includes('50 % se resolvió en esa primera visita')));
assert.ok(visitSlide.howTo[0].startsWith('Estimado:'));
assert.equal(visitText(visitIndicators(points, []), 30).headline, 'Sin tickets con visita ligada en el periodo');

// No data: every slide still says something true instead of dividing by zero.
const empty = deckFacts({ ...summary, current: { tickets_opened: 0, tickets_closed: 0, tickets_cancelled: 0, pending_at_cut: 0 }, series: [] }, []);
assert.equal(curveText(empty).headline, 'Sin tickets abiertos en el periodo');
assert.equal(distributionText(empty).headline, 'Sin cierres en el periodo');
assert.match(executiveSummary({ ...summary, current: { tickets_opened: 0, tickets_closed: 0, tickets_cancelled: 0, pending_at_cut: 0 } }, empty).join(' '), /No hubo cierres con plazo evaluable/);
console.log('PASS: deck facts, executive summary, per-slide headlines, small-sample warnings and empty periods');
