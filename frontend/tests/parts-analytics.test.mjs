// Run: node tests/parts-analytics.test.mjs — pure math of the parts lab (no browser, no Supabase).
import assert from 'node:assert/strict';
import {
  codeMonthMatrix, filterServices, kindOf, monthsBetween, monthlyShare, pareto, partFlows, platformMonthTable, servicesByMonth, totals, usageByKind,
} from '../src/components/partsAnalytics.ts';

const svc = (id, day, kind, extra = {}) => ({ id, source: 'Historial de servicio', day, kind, ticket_id: null, folio: null, ref: id, serial: `S-${id}`,
  platform: 'BA400', client: 'Hospital', sector: 'gobierno', sector_inferred: false, people: null, parts: 0, ...extra });
const services = [
  svc('a', '2026-01-10', 'correctivo', { parts: 2 }),
  svc('b', '2026-01-20', 'correctivo', { sector: 'particular', platform: 'A15' }),
  svc('c', '2026-02-03', 'correctivo', { parts: 1, sector: 'particular' }),
  svc('d', '2026-02-05', 'preventivo', { parts: 3, platform: 'A15' }),
  svc('e', '2026-03-09', 'preventivo', { sector: null }),
  svc('f', '2026-03-12', 'sin_clasificar', { sector: 'particular', sector_inferred: true }),
  svc('g', '2026-03-15', 'visita', { parts: 1 }),
];
const lines = [['a', 'LA10429', 1], ['a', 'AC11527', 1], ['c', 'LA10429', 1], ['d', 'LA10429', 2], ['d', '5625', 1], ['g', 'AC11527', 1], ['zz', 'NOPE', 9]];

assert.deepEqual(monthsBetween('2025-11-15', '2026-02-01'), ['2025-11', '2025-12', '2026-01', '2026-02']);
assert.equal(kindOf('sin_clasificar'), 'otro'); assert.equal(kindOf('reacondicionamiento'), 'reacondicionamiento');

const usage = usageByKind(services);
const corrective = usage.find(row => row.kind === 'correctivo');
assert.deepEqual([corrective.services, corrective.withParts, corrective.parts, corrective.perService, corrective.gobierno, corrective.particular], [3, 2, 3, 1.5, 1, 2]);
assert.equal(Math.round(corrective.share * 1000) / 10, 66.7);
assert.deepEqual(usage.map(row => row.kind), ['preventivo', 'correctivo', 'visita', 'otro'], 'fixed order; empty kinds are left out');
assert.equal(usage.find(row => row.kind === 'preventivo').perService, 3, 'parts ÷ services with parts, like the workbook ratio');

const all = totals(services, lines);
assert.deepEqual([all.services, all.withParts, all.parts, all.codes, all.gobierno, all.particular, all.noSector, all.inferred], [7, 4, 7, 3, 3, 3, 1, 1]);
assert.deepEqual(all.top, ['LA10429', 4], 'lines of unknown services are ignored');

const months = monthsBetween('2026-01-01', '2026-03-31');
assert.deepEqual(servicesByMonth(services, months, 'kind').map(row => [row.key, row.values]),
  [['preventivo', [0, 1, 1]], ['correctivo', [2, 1, 0]], ['visita', [0, 0, 1]], ['otro', [0, 0, 1]]]);
assert.deepEqual(servicesByMonth(services, months, 'sector').map(row => [row.key, row.values]),
  [['gobierno', [1, 1, 1]], ['particular', [1, 1, 1]], ['sin_dato', [0, 0, 1]]]);
const share = monthlyShare(services, months).find(row => row.kind === 'preventivo').values;
assert.deepEqual(share.map(value => [value.n, value.withParts, value.share]), [[0, 0, null], [1, 1, 1], [1, 0, 0]], 'no services in a month is "no data", not 0 %');

const rows = pareto(lines, services, 'todos');
assert.deepEqual(rows.map(row => [row.code, row.qty, row.services]), [['LA10429', 4, 3], ['AC11527', 2, 2], ['5625', 1, 1]]);
assert.equal(Math.round(rows[1].cumulative * 1000) / 1000, 0.857);
assert.deepEqual(pareto(lines, services, 'correctivo').map(row => [row.code, row.qty]), [['LA10429', 2], ['AC11527', 1]]);

const heat = codeMonthMatrix(lines, services, months, 2);
assert.deepEqual(heat.codes, ['LA10429', 'AC11527']);
assert.deepEqual(heat.cells.sort(), [[0, 0, 1], [0, 1, 1], [1, 0, 3], [2, 1, 1]].sort());

const flows = partFlows(lines, services, 1);
assert.ok(flows.nodes.includes('C:Otras refacciones'), 'codes past the top fold into «Otras refacciones»');
assert.equal(flows.links.filter(link => link.source.startsWith('K:')).reduce((sum, link) => sum + link.value, 0), 7, 'every part flows once from kind to code');
assert.equal(flows.links.filter(link => link.source.startsWith('P:')).reduce((sum, link) => sum + link.value, 0), 7);

const table = platformMonthTable(services, months, 'correctivo');
assert.deepEqual(table.rows.map(row => [row.platform, row.cells.map(cell => [cell.gobierno, cell.particular]), row.total]),
  [['BA400', [[1, 0], [0, 1], [0, 0]], 2], ['A15', [[0, 1], [0, 0], [0, 0]], 1]]);
assert.deepEqual(table.footer.map(cell => cell.total), [2, 1, 0]); assert.equal(table.total, 3);

assert.equal(filterServices(services, { sector: 'particular', platform: '' }).length, 3);
assert.equal(filterServices(services, { sector: 'todos', platform: 'A15' }).length, 2);
console.log('PASS: usage and ratios by type, totals, months, monthly share with no-data, Pareto, code×month, flows with «Otras», platform×month×sector, filters');
