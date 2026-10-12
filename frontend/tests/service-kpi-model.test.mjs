import assert from 'node:assert/strict';
import {
  chartsFor, countCard, csvEscape, defaultFilters, definitions, hoursCard, presetRange, rateOf, ratioCard, recordColumns, sectionsFor, toCsv, toRpcFilters,
} from '../src/components/serviceKpiModel.ts';

// Zero activity, missing data and not-applicable denominators are three different readings.
const ratio = ratioCard('late', 'Cierres fuera del plazo', 'late_rate', 'late_rate', { better: 'down', numLabel: 'fuera', denLabel: 'cierres evaluables' });
assert.deepEqual(ratio.read({ late_rate: { num: 0, den: 0, pct: null } }), { value: 'No aplica', detail: 'Sin cierres evaluables en el periodo', state: 'na' });
assert.equal(ratio.read({ late_rate: { num: 3, den: 5, pct: 60 } }).value, '60 %');
assert.deepEqual(ratio.read({ late_rate: { num: 0, den: 4, pct: 0 } }), { value: '0 %', detail: '0 fuera de 4 cierres evaluables', state: 'zero' }, 'a real 0 % is not "no aplica"');
assert.deepEqual(ratio.compare({ late_rate: { num: 3, den: 5, pct: 60 } }, { late_rate: { num: 1, den: 4, pct: 25 } }), { text: '+35 pp vs. periodo anterior', tone: 'bad' });
assert.equal(ratio.compare({ late_rate: { num: 3, den: 5, pct: 60 } }, { late_rate: { num: 0, den: 0, pct: null } }).text, 'Sin base comparable en el periodo anterior');
const count = countCard('opened', 'Tickets abiertos', 'tickets_opened', 'tickets_opened');
assert.deepEqual(count.read({ tickets_opened: 0 }), { value: '0', detail: 'Sin actividad registrada en el periodo', state: 'zero' });
assert.equal(count.compare({ tickets_opened: 12 }, { tickets_opened: 8 }).text, '+4 (+50 %) vs. periodo anterior');
assert.equal(count.compare({ tickets_opened: 3 }, { tickets_opened: 0 }).text, '+3 vs. periodo anterior');
const hours = hoursCard('fr', 'Primera respuesta', 'first_response', { main: 'm', avg: 'a', n: 'n', base: 'b', baseLabel: 'tickets abiertos' });
assert.equal(hours.read({ m: null, n: 0, b: 0 }).state, 'na');
assert.deepEqual(hours.read({ m: null, n: 0, b: 7 }), { value: 'Sin dato', detail: '0 de 7 tickets abiertos con registro', state: 'missing' });
assert.equal(hours.read({ m: 0.5, a: 1.2, n: 3, b: 7 }).value, '30 min');
assert.equal(hours.read({ m: 30, a: 99.6, n: 5, b: 5 }).value, '30 h');
assert.equal(hours.read({ m: 96, n: 1, b: 1 }).value, '4 d');
assert.equal(hours.compare({ m: 10 }, { m: 12 }).tone, 'good', 'shorter times are better');
console.log('PASS: card readings separate zero, missing data and not applicable; deltas use points for rates');

// Every card and chart explains itself and drills into a records dataset.
for (const view of ['general', 'quimica', 'ingenieria']) {
  for (const section of sectionsFor(view)) for (const card of section.cards) {
    assert.ok(definitions[card.definition], `${view}/${card.id} has a definition`);
    assert.ok(card.drill, `${view}/${card.id} opens its records`);
  }
  for (const chart of chartsFor(view)) {
    assert.ok(definitions[chart.definition]);
    for (const series of chart.series) assert.ok(series.drill('2026-01-05').match, `${chart.id}/${series.key} drills`);
  }
}
for (const definition of Object.values(definitions)) for (const key of ['formula', 'source', 'dateField', 'denominator']) assert.ok(definition[key].length > 10, `${definition.label}.${key}`);
assert.equal(rateOf({ bucket: 'x', closed_late: 1, sla_evaluable: 3 }, { num: 'closed_late', den: 'sla_evaluable', label: '' }), 33.3);
assert.equal(rateOf({ bucket: 'x', closed_late: 0, sla_evaluable: 0 }, { num: 'closed_late', den: 'sla_evaluable', label: '' }), null);
console.log('PASS: definitions (formula, source, date field, denominator) and drill-downs for every card and chart');

// Periods and filters sent to the server.
const today = new Date(2026, 9, 11);
assert.deepEqual(presetRange('mes', today), { from: '2026-10-01', to: '2026-10-11' });
assert.deepEqual(presetRange('mes_anterior', today), { from: '2026-09-01', to: '2026-09-30' });
assert.deepEqual(presetRange('12_semanas', today), { from: '2026-07-20', to: '2026-10-11' });
assert.deepEqual(presetRange('12_meses', today), { from: '2025-11-01', to: '2026-10-11' });
assert.deepEqual(presetRange('trimestre', today), { from: '2026-10-01', to: '2026-10-11' });
assert.equal(defaultFilters('quimica', today).granularity, 'week', 'chemists evolve weekly');
assert.equal(defaultFilters('ingenieria', today).granularity, 'month', 'engineers evolve monthly');
const filters = { ...defaultFilters('quimica', today), person: 'abc', client: ' Clínica Sur ', recurrence_days: '15' };
assert.deepEqual(toRpcFilters('quimica', filters), { from: '2026-07-20', to: '2026-10-11', granularity: 'week', team: 'quimica', person: 'abc', client: 'Clínica Sur', recurrence_days: 15 });
assert.equal(toRpcFilters('general', filters).team, undefined, 'the general view is not limited to a team');
console.log('PASS: period presets, default weekly/monthly evolution and server filters');

// Exports: same columns as the table, spreadsheet-safe text.
assert.equal(csvEscape('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"', 'formula injection is neutralised');
assert.equal(csvEscape('Clínica, Sur'), '"Clínica, Sur"');
assert.equal(csvEscape(null), '');
const ticketRow = { folio: 'OR-0001', opened_at: '2026-01-05T16:00:00Z', closed_at: null, estado: 'abierto', closure_class: null, responsible_name: null, team: 'quimica', service_type: 'soporte_quimica', priority: 'sin_prioridad', client: null, platform: 'BA400', serial: 'SER-A', first_response_hours: null, resolution_hours: null, sla_policy: 'Soporte general', sla_target_hours: 48, sla_clock: 'corridas', sla_hours: 12.5, sla_result: 'en_curso', justified: false, age_days: 2.4, reopened: false, reopen_of_folio: null, visits: 0, calls: 1 };
const csv = toCsv(recordColumns.tickets, [ticketRow]);
assert.ok(csv.startsWith('﻿Folio,Apertura,'));
const cells = csv.trim().split('\r\n')[1];
assert.match(cells, /^OR-0001,/);
assert.match(cells, /Sin responsable asignado/); assert.match(cells, /Sin cliente identificado/); assert.match(cells, /Sin prioridad registrada/);
assert.match(cells, /Soporte general · 48 h corridas/); assert.match(cells, /En curso/); assert.match(cells, /2 d/);
for (const [dataset, columns] of Object.entries(recordColumns)) for (const column of columns) assert.equal(typeof column.text({}), 'string', `${dataset}.${column.key} renders empty rows`);
console.log('PASS: CSV export mirrors the table columns, marks missing data explicitly and neutralises spreadsheet formulas');
