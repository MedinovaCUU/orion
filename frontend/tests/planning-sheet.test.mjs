import assert from 'node:assert/strict';
import {
  parseGuardsTab,
  parsePlanningTab,
  parseSheetDays,
  parseSheetIndex,
  parseSheetWeekLabel,
} from '../src/modules/service-planning/helpers/planningSheet.ts';

// Synthetic page shaped like Google Drive's read-only view of the planning workbook (no real data).
const page = (rows) => `<html><head><style>.ritz .waffle .s1{background-color:#8ed973;}.ritz .waffle .s2{background-color:#ffffff;}</style></head><body>
<table class="waffle"><thead><tr><th></th><th>A</th><th>B</th></tr></thead><tbody>${rows
  .map((cells, index) => `<tr><th>${index + 1}</th>${cells}</tr>`)
  .join('')}</tbody></table></body></html>`;
const td = (text, extra = '') => `<td class="s1"${extra}>${text}</td>`;
const header = ['TIPO DE SERVICIO', 'PLATAFORMA', 'LOCALIDAD', 'NS', 'OBSERVACIONES', 'SERVICIO', 'ACOMPA&Ntilde;ANTE', 'DIAS'].map((text) => td(text)).join('');

const index = parseSheetIndex(`<title>PROGRAMACION 2026.xlsx - Google Drive</title><script>items.push({name: "GUARDIAS", pageUrl: "x", gid: "11"});items.push({name: "NOVIEMBRE", pageUrl: "y", gid: "22"});</script>`);
assert.deepEqual(index, { title: 'PROGRAMACION 2026.xlsx', year: 2026, tabs: [{ name: 'GUARDIAS', gid: '11' }, { name: 'NOVIEMBRE', gid: '22' }] });

const tab = parsePlanningTab(
  page([
    td('02 AL 06 DE NOVIMEBRE', ' colspan="8"'),
    header,
    td('PREVENTIVO', ' rowspan="2"') + td('A15') + td('H, GRAL IGUALA') + td('834002882') + td('COMODATO', ' rowspan="2"') + td('ALFREDO/VILCHIS', ' rowspan="2"') + td('') + td('4 Y 5') + td('03 AL 05 VAC FCO'),
    td('BA200') + td('HUITZUCO') + td('NA') + td('SE CAMBIA A DIC') + td(''),
    td('PRUEBAS') + td('MINDRAY') + td('COYOACAN') + td('NA') + td('') + td('GARCIA') + td('MARIANA LOZANO') + td('CANCELADO'),
    td('') + td('') + td('') + td('') + td('') + td('') + td('') + td('') + td('06 TXT MARTHA'),
    td('09 AL 13 NOVIEMBRE', ' colspan="8"'),
    td('si s') + header.slice(header.indexOf('</td>') + 5),
    td('RETIRO E INSTALACION') + td('BA400') + td('RETIRO AIMSA') + td('834002674') + td('RETIRO') + td('GUILLERMO') + td('') + td('SAB 14 NOV') + td('POSPUESTO'),
  ]),
  { name: 'NOVIEMBRE', gid: '22' },
  2026,
);

assert.deepEqual(tab.weeks.map((week) => [week.weekLabel, week.weekStart, week.weekEnd]), [
  ['02 AL 06 NOVIEMBRE', '2026-11-02', '2026-11-06'],
  ['09 AL 13 NOVIEMBRE', '2026-11-09', '2026-11-13'],
]);
assert.equal(tab.activities.length, 4);
const [iguala, huitzuco, pruebas, retiro] = tab.activities;
assert.deepEqual(
  [iguala.serviceType, iguala.serial, iguala.engineerTokens, iguala.scheduledDate, iguala.color, iguala.sheetRow],
  ['preventivo', '834002882', ['ALFREDO', 'VILCHIS'], '2026-11-04', '#8ed973', 3],
);
assert.deepEqual([huitzuco.rawType, huitzuco.observations, huitzuco.engineerTokens, huitzuco.serial, huitzuco.status], ['PREVENTIVO', 'COMODATO', ['ALFREDO', 'VILCHIS'], '', 'pospuesto'], 'merged cells carry down');
assert.deepEqual([pruebas.serviceType, pruebas.status, pruebas.companionTokens], ['ingenieria_soporte', 'cancelado', ['MARIANA LOZANO']]);
assert.deepEqual([retiro.serviceType, retiro.scheduledDate, retiro.rowNote, retiro.status], ['instalacion', '2026-11-14', 'POSPUESTO', 'pospuesto'], 'header typo and explicit dates');
assert.deepEqual(tab.notes.map((note) => [note.kind, note.daysLabel, note.personText, note.week.weekLabel]), [
  ['VAC', '03 AL 05', 'FCO', '02 AL 06 NOVIEMBRE'],
  ['TXT', '06', 'MARTHA', '02 AL 06 NOVIEMBRE'],
]);

assert.equal(parseSheetWeekLabel('31 AL 04 SEPTIEMBRE', 2026, 8)?.weekStart, '2026-08-31', 'week starting in the previous month');
assert.equal(parseSheetWeekLabel('29 AL 02 ENERO', 2026, 0)?.weekStart, '2025-12-29', 'week starting in the previous year');
const april = parsePlanningTab(page([td('20 AL 24 ABRIL', ' colspan="8"'), td('27 AL 01 ABRIL', ' colspan="8"')]), { name: 'ABRIL', gid: '1' }, 2026);
assert.deepEqual(april.weeks.map((week) => week.weekLabel), ['20 AL 24 ABRIL', '27 AL 01 MAYO'], 'typo in the month follows the previous week');
const week = parseSheetWeekLabel('12 AL 16 OCTUBRE', 2026, 9);
assert.equal(parseSheetDays('LUNES', week), '2026-10-12');
assert.equal(parseSheetDays('7 AL 9', parseSheetWeekLabel('05 AL 09 OCTUBRE', 2026, 9)), '2026-10-07');
assert.equal(parseSheetDays('CAMBIO', week), null);

const guards = parseGuardsTab(
  page([
    td('') + td('') + td('DIAS') + td('APLICATIVO') + td('INGENIERIA'),
    td('') + td('') + td('28 Y 01 MARZO') + td('OLIVIA') + td('DIEGO'),
    td('') + td('') + td('31 OCT Y 01 NOV') + td('IVONNE') + td('ERICK'),
    td('') + td('') + td('06 Y  07 JUNIO') + td('MARTHA') + td('FRANCISCO'),
  ]),
  2026,
);
assert.deepEqual(guards.map((weekend) => [weekend.weekendStart, weekend.aplicativo, weekend.ingenieria]), [
  ['2026-02-28', 'OLIVIA', 'DIEGO'],
  ['2026-06-06', 'MARTHA', 'FRANCISCO'],
  ['2026-10-31', 'IVONNE', 'ERICK'],
]);

console.log('PASS: the official planning workbook parses weeks, merged rows, notes, days, statuses and guards');
