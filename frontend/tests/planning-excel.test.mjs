// Excel import/export engine of the planning grid: `node tests/planning-excel.test.mjs` (from frontend/).
// Every workbook here is synthetic, built with exceljs inside the test; no real planning data is read.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

// Some planning helpers import siblings without an extension (Vite resolves them); teach node the same.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!/^\.{1,2}\//.test(specifier) || /\.[cm]?[jt]sx?$/.test(specifier)) throw error;
      for (const suffix of ['.ts', '.tsx', '/index.ts']) {
        try {
          return nextResolve(`${specifier}${suffix}`, context);
        } catch {
          // try the next one
        }
      }
      throw error;
    }
  },
});

const { parsePlanningWorkbook, buildPlanningWorkbook, normalizeWeekLabel } = await import('../src/modules/service-planning/grid/planningExcel.ts');
const { buildPlanningSubject } = await import('../src/modules/service-planning/helpers/normalizeService.ts');
const { buildRowKey, createPeopleResolver } = await import('../src/modules/service-planning/helpers/planningPeople.ts');

const toArrayBuffer = (buffer) => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const workbookBytes = async (workbook) => toArrayBuffer(Buffer.from(await workbook.xlsx.writeBuffer()));
const solid = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const byRow = (preview, sheet, sheetRow) => {
  const row = preview.rows.find((entry) => entry.sheet === sheet && entry.sheetRow === sheetRow);
  assert.ok(row, `row ${sheet}:${sheetRow} was read`);
  return row;
};
const hasIssue = (row, text) => row.issues.some((issue) => issue.includes(text));

// Synthetic people and equipment.
const profiles = [
  { id: 'p-zulema', nombre_completo: 'Zulema Ficticia' },
  { id: 'p-osvaldo', nombre_completo: 'Osvaldo Inventado' },
];
const equipments = [
  { numero_serie: '834000001', modelo: 'BA400' },
  { numero_serie: '834000002', modelo: 'BA400' },
  { numero_serie: '834000003', modelo: 'BA200' },
  { numero_serie: '834000004', modelo: 'BA400' },
  { numero_serie: '834000005', modelo: 'A25' },
  { numero_serie: '834000006 ', modelo: 'BA400 ISE' },
];
const people = createPeopleResolver(profiles);

// ---------------------------------------------------------------------------------------------------------
// 1. Official layout: a month tab with week blocks.
const HEADER = ['TIPO DE SERVICIO', 'PLATAFORMA', 'LOCALIDAD', 'NS', 'OBSERVACIONES', 'SERVICIO', 'ACOMPAÑANTE', 'DIAS'];
const official = new ExcelJS.Workbook();
const month = official.addWorksheet('OCTUBRE');
const put = (rowNumber, values, fill) => {
  values.forEach((value, index) => {
    if (value !== null && value !== undefined) month.getCell(rowNumber, index + 1).value = value;
    if (fill) month.getCell(rowNumber, index + 1).fill = solid(fill);
  });
};
const GREEN = 'FF8ED973';
const AMBER = 'FFFFC000';
const VIOLET = 'FFB4A7D6';
put(1, ['PROGRAMACIÓN OCTUBRE']);
put(2, ['28 SEPT AL 2 OCT']);
month.mergeCells('A2:H2');
put(3, HEADER);
put(4, ['PREVENTIVO', 'BA400', 'HOSPITAL NORTE', '834000001', 'COMODATO', 'MARTHA / FRANCISCO', 'PAGADO', 'LUN-MAR'], GREEN);
put(5, ['CORRECTIVO', 'A15', 'CLINICA SUR', 'NA', 'FALLA EN LAMPARA', 'ZULEMA', null, '30 SEP'], AMBER);
put(6, ['PREVENTIVO', 'BA400', 'HOSPITAL NORTE', 834000001, null, 'MARTHA', null, 'MIE'], GREEN);
// row 7 stays empty
put(8, ['05 AL 09 OCTUBRE']);
month.mergeCells('A8:H8');
month.getCell('I8').value = '06 TXT ZULEMA';
put(9, HEADER);
put(10, ['CAPACITACION', 'BA200', 'LAB CENTRAL', '834000002', null, 'OSVALDO\nZULEMA', null, '7 AL 9'], VIOLET);
put(11, [null, 'BA200', 'LAB CENTRAL ANEXO', '999999999', null, 'OSVALDO', null, 'JUE'], VIOLET);
month.mergeCells('A10:A11');
put(12, ['PRUEBAS', 'MINDRAY', 'HOSPITAL ESTE', 'N/A', null, 'OSVALDO', null, 'CANCELADO']);
put(13, ['PREVENTIVO', 'BA200', 'HOSPITAL OESTE', '834000003', null, 'ZULEMA', null, 'LUNES'], GREEN);
put(14, ['INSTALACION', 'BA400', null, '834000004', null, 'OSVALDO', null, 'VIE']);
put(15, ['CORRECTIVO', 'A25', 'HOSPITAL SUR', '834000005', null, 'PENDIENTE', null, 'MAR']);
put(16, [null, 'BA400', 'HOSPITAL NUEVO', '834 000 006', 'INSTALACION DE EQUIPO NUEVO', 'OSVALDO', null, '8']);
const guards = official.addWorksheet('GUARDIAS');
guards.addRow(['DIAS', 'APLICATIVO', 'INGENIERIA']);
guards.addRow(['10 Y 11 OCTUBRE', 'ZULEMA', 'OSVALDO']);

const existing = [
  { id: 'orion-exact', weekLabel: '05 AL 09 OCTUBRE', subject: buildPlanningSubject('preventivo', 'BA200', 'HOSPITAL OESTE'), serial: '834000003' },
  { id: 'orion-source', weekLabel: 'OTRA SEMANA', subject: 'OTRO ASUNTO', serial: null, sourceRowKey: buildRowKey('05 AL 09 OCTUBRE', buildPlanningSubject('correctivo', 'A25', 'HOSPITAL SUR'), '834000005') },
  { id: 'orion-loose', weekLabel: '28 AL 02 OCTUBRE', subject: buildPlanningSubject('correctivo', 'A15', 'CLINICA SUR'), serial: '834000777' },
];
const importOptions = { fileName: 'PROGRAMACION 2026.xlsx', profiles, equipments, existing };
const preview = await parsePlanningWorkbook(await workbookBytes(official), importOptions);

assert.equal(preview.fileName, 'PROGRAMACION 2026.xlsx');
assert.deepEqual(preview.sheets, ['OCTUBRE']);
assert.deepEqual(preview.rows.map((row) => row.sheetRow), [4, 5, 6, 10, 11, 12, 13, 14, 15, 16], 'title, headers, empty rows and week titles are not activities');
assert.ok(preview.warnings.some((warning) => warning.includes('GUARDIAS')), 'the guards tab is skipped with a warning');
assert.ok(preview.warnings.some((warning) => warning.includes('de disponibilidad')), 'notes beside the weeks are reported, not imported');
assert.ok(!preview.warnings.some((warning) => warning.includes('no indica el año')), 'the year comes from the file name');

// Crossing-month week, crew cell, companion note, registered serial.
const [lead, mate] = people.engineers(['MARTHA', 'FRANCISCO']);
const crew = byRow(preview, 'OCTUBRE', 4);
assert.deepEqual(
  {
    id: crew.id, weekLabel: crew.weekLabel, weekStart: crew.weekStart, weekEnd: crew.weekEnd, monthKey: crew.monthKey, serviceType: crew.serviceType,
    rawType: crew.rawType, platform: crew.platform, locality: crew.locality, serialNumber: crew.serialNumber, serialText: crew.serialText,
    observations: crew.observations, engineer: crew.engineer, companions: crew.companions, daysText: crew.daysText,
    scheduledDate: crew.scheduledDate, scheduledEndDate: crew.scheduledEndDate, sheetStatus: crew.sheetStatus, status: crew.status,
  },
  {
    id: 'OCTUBRE:4', weekLabel: '28 AL 02 OCTUBRE', weekStart: '2026-09-28', weekEnd: '2026-10-02', monthKey: '2026-10', serviceType: 'preventivo',
    rawType: 'PREVENTIVO', platform: 'BA400', locality: 'HOSPITAL NORTE', serialNumber: '834000001', serialText: '834000001',
    observations: 'COMODATO · PAGADO', engineer: lead, companions: [mate], daysText: 'LUN-MAR',
    scheduledDate: '2026-09-28', scheduledEndDate: '2026-09-29', sheetStatus: null, status: 'nuevo',
  },
);
assert.ok(lead && mate && !crew.companions.includes('PAGADO'), 'the first of the crew is responsible, the companion note is not a person');
assert.deepEqual(crew.issues, [`Ingeniero sin perfil en Orion: ${lead}`]);

// NA serial, explicit day, loose match with an Orion activity that has the serial.
const correctivo = byRow(preview, 'OCTUBRE', 5);
assert.deepEqual(
  [correctivo.serialNumber, correctivo.serialText, correctivo.engineer, correctivo.scheduledDate, correctivo.status, correctivo.duplicateOfId],
  [null, 'NA', 'Zulema Ficticia', '2026-09-30', 'duplicado', 'orion-loose'],
);
assert.ok(hasIssue(correctivo, 'Sin NS') && hasIssue(correctivo, 'Ya existe en Orion'));

// Same activity twice in the file (serial typed as a number the second time).
const repeated = byRow(preview, 'OCTUBRE', 6);
assert.deepEqual([repeated.status, repeated.duplicateOfId, repeated.serialNumber], ['duplicado', undefined, '834000001']);
assert.ok(hasIssue(repeated, 'Duplicado en el archivo (fila 4)'));

// Merged type cell carries down; line break separates people; model contradiction; unknown serial.
const training = byRow(preview, 'OCTUBRE', 10);
assert.deepEqual(
  [training.weekLabel, training.serviceType, training.engineer, training.companions, training.scheduledDate, training.scheduledEndDate, training.status],
  ['05 AL 09 OCTUBRE', 'capacitacion', 'Osvaldo Inventado', ['Zulema Ficticia'], '2026-10-07', '2026-10-09', 'nuevo'],
);
assert.ok(hasIssue(training, 'Plataforma BA200 no coincide con Equipos (BA400)'));
const annex = byRow(preview, 'OCTUBRE', 11);
assert.deepEqual([annex.rawType, annex.serviceType, annex.serialNumber, annex.scheduledDate, annex.scheduledEndDate, annex.status], ['CAPACITACION', 'capacitacion', '999999999', '2026-10-08', null, 'nuevo']);
assert.ok(hasIssue(annex, 'NS no registrado en Equipos'));

// Cancelled in the sheet.
const cancelled = byRow(preview, 'OCTUBRE', 12);
assert.deepEqual([cancelled.serviceType, cancelled.serialNumber, cancelled.sheetStatus, cancelled.status], ['ingenieria_soporte', null, 'cancelado', 'cancelado']);
assert.ok(hasIssue(cancelled, 'Cancelada en la hoja'));

// Already in Orion: by row key and by the key the sync stored.
const exact = byRow(preview, 'OCTUBRE', 13);
assert.deepEqual([exact.status, exact.duplicateOfId, exact.scheduledDate], ['duplicado', 'orion-exact', '2026-10-05']);
assert.ok(exact.issues.includes('Ya existe en Orion'));
const bySource = byRow(preview, 'OCTUBRE', 15);
assert.deepEqual([bySource.status, bySource.duplicateOfId, bySource.engineer, bySource.companions], ['duplicado', 'orion-source', null, []]);
assert.ok(hasIssue(bySource, 'Sin ingeniero asignado'));

// Missing locality cannot be placed.
const noPlace = byRow(preview, 'OCTUBRE', 14);
assert.deepEqual([noPlace.locality, noPlace.status, noPlace.serialNumber], ['', 'invalido', '834000004']);
assert.ok(noPlace.issues.includes('Falta localidad'));

// Empty type is inferred from the observations and said so; serial matched ignoring spaces.
const untyped = byRow(preview, 'OCTUBRE', 16);
assert.deepEqual([untyped.rawType, untyped.serviceType, untyped.serialNumber, untyped.scheduledDate, untyped.status], ['', 'instalacion', '834000006', '2026-10-08', 'nuevo']);
assert.ok(hasIssue(untyped, 'Sin tipo de servicio (se tomó Instalación)'));
assert.ok(!hasIssue(untyped, 'no coincide'), 'BA400 vs BA400 ISE is not a contradiction');

// Without the equipment catalogue serials are not judged.
const noCatalogue = await parsePlanningWorkbook(await workbookBytes(official), { ...importOptions, equipments: [] });
assert.ok(!noCatalogue.rows.some((row) => hasIssue(row, 'NS no registrado')));
assert.ok(noCatalogue.warnings.some((warning) => warning.includes('catálogo de Equipos')));

assert.equal(normalizeWeekLabel('28 SEPT AL 2 OCT'), '28 AL 2 OCTUBRE');
assert.equal(normalizeWeekLabel('SEMANA DEL 12 AL 16 DE OCTUBRE'), '12 AL 16 DE OCTUBRE');
assert.equal(normalizeWeekLabel('PREVENTIVO'), 'PREVENTIVO');

// ---------------------------------------------------------------------------------------------------------
// 2. Flat tables: one header row anywhere, a FECHA column, or a SEMANA column.
const flat = new ExcelJS.Workbook();
const list = flat.addWorksheet('Hoja1');
list.getCell('B1').value = 'Servicios programados';
const flatHeader = ['Fecha', 'Tipo de servicio', 'Equipo', 'Cliente', 'Número de serie', 'Ingeniero', 'Acompañantes', 'Notas', 'Fecha fin', 'Estado'];
const flatRows = [
  [new Date(Date.UTC(2026, 9, 14)), 'Preventivo', 'BA400', 'Hospital Norte', '834000001', 'Zulema', 'Osvaldo', 'Llevar kit', new Date(Date.UTC(2026, 9, 15)), 'Programado'],
  ['21/10/2026', 'Correctivo', 'A15', 'Clínica Sur', 'NA', 'Osvaldo', null, null, null, 'Cancelado'],
  [null, 'Instalación', 'BA200', 'Lab Central', '834000003', 'Zulema', null, null, null, null],
  [new Date(Date.UTC(2026, 8, 30)), 'Capacitación', 'BA400', 'Hospital Este', '834000002', 'Osvaldo', null, null, null, null],
  ['pronto', 'Preventivo', 'BA400', 'Hospital Sur', '834000004', 'Osvaldo', null, null, null, null],
];
[flatHeader, ...flatRows].forEach((values, index) => values.forEach((value, col) => {
  if (value !== null) list.getCell(3 + index, 2 + col).value = value;
}));
const byWeek = flat.addWorksheet('Semanas');
byWeek.addRow(['SEMANA', 'SERVICIO', 'PLATAFORMA', 'LOCALIDAD', 'NS', 'RESPONSABLE', 'DIAS']);
byWeek.addRow(['12 AL 16 OCTUBRE', 'PREVENTIVO', 'BA400', 'HOSPITAL NORTE', '834000001', 'OSVALDO', 'MIE']);
byWeek.addRow(['SEMANA', 'SERVICIO', 'PLATAFORMA', 'LOCALIDAD', 'NS', 'RESPONSABLE', 'DIAS']);
byWeek.addRow([null, null, null, null, null, null, null, 'nota suelta al lado']);
byWeek.addRow(['SEMANA 43', 'CORRECTIVO', 'A25', 'HOSPITAL SUR', '834000005', 'ZULEMA', 'LUN']);

const flatPreview = await parsePlanningWorkbook(await workbookBytes(flat), { fileName: 'servicios.xlsx', year: 2026, profiles, equipments, existing: [] });
assert.deepEqual(flatPreview.sheets, ['Hoja1', 'Semanas']);
assert.deepEqual(flatPreview.rows.map((row) => row.id), ['Hoja1:4', 'Hoja1:5', 'Hoja1:6', 'Hoja1:7', 'Hoja1:8', 'Semanas:2', 'Semanas:5']);
const dated = byRow(flatPreview, 'Hoja1', 4);
assert.deepEqual(
  [dated.weekLabel, dated.weekStart, dated.weekEnd, dated.monthKey, dated.serviceType, dated.platform, dated.locality, dated.serialNumber, dated.observations, dated.engineer, dated.companions, dated.scheduledDate, dated.scheduledEndDate, dated.status],
  ['12 AL 16 OCTUBRE', '2026-10-12', '2026-10-16', '2026-10', 'preventivo', 'BA400', 'Hospital Norte', '834000001', 'Llevar kit', 'Zulema Ficticia', ['Osvaldo Inventado'], '2026-10-14', '2026-10-15', 'nuevo'],
);
assert.deepEqual(dated.issues, []);
const textDate = byRow(flatPreview, 'Hoja1', 5);
assert.deepEqual([textDate.weekLabel, textDate.scheduledDate, textDate.sheetStatus, textDate.status, textDate.locality], ['19 AL 23 OCTUBRE', '2026-10-21', 'cancelado', 'cancelado', 'Clínica Sur']);
const undated = byRow(flatPreview, 'Hoja1', 6);
assert.deepEqual([undated.weekLabel, undated.weekStart, undated.monthKey, undated.scheduledDate, undated.status], ['', null, null, null, 'invalido']);
assert.ok(undated.issues.includes('Semana no reconocida'));
const crossing = byRow(flatPreview, 'Hoja1', 7);
assert.deepEqual([crossing.weekLabel, crossing.weekStart, crossing.weekEnd, crossing.monthKey], ['28 AL 02 OCTUBRE', '2026-09-28', '2026-10-02', '2026-10']);
const badDate = byRow(flatPreview, 'Hoja1', 8);
assert.equal(badDate.status, 'invalido');
assert.ok(hasIssue(badDate, 'Fecha no reconocida: «pronto»'));
const weekColumn = byRow(flatPreview, 'Semanas', 2);
assert.deepEqual([weekColumn.serviceType, weekColumn.engineer, weekColumn.scheduledDate, weekColumn.status], ['preventivo', 'Osvaldo Inventado', '2026-10-14', 'duplicado']);
assert.ok(hasIssue(weekColumn, 'Duplicado en el archivo (Hoja1, fila 4)'), 'duplicates across tabs name the tab');
const isoWeek = byRow(flatPreview, 'Semanas', 5);
assert.deepEqual([isoWeek.weekLabel, isoWeek.serviceType, isoWeek.engineer, isoWeek.scheduledDate], ['19 AL 23 OCTUBRE', 'correctivo', 'Zulema Ficticia', '2026-10-19']);

// CSV (read through SheetJS): accents survive and dates are day/month.
const csv = '﻿Semana,Tipo,Plataforma,Localidad,N/S,Ingeniero,Acompañantes,Días,Fecha programada\n12 AL 16 OCTUBRE 2026,Recapacitación,BA400,Clínica Ñandú,834000001,Osvaldo,,MAR,13/10/2026\n';
const csvPreview = await parsePlanningWorkbook(toArrayBuffer(Buffer.from(csv, 'utf8')), { fileName: 'semana.csv', profiles, equipments, existing: [] });
assert.equal(csvPreview.rows.length, 1);
assert.deepEqual(
  [csvPreview.rows[0].weekLabel, csvPreview.rows[0].serviceType, csvPreview.rows[0].locality, csvPreview.rows[0].scheduledDate, csvPreview.rows[0].status],
  ['12 AL 16 OCTUBRE', 'recapacitacion', 'Clínica Ñandú', '2026-10-13', 'nuevo'],
);
assert.ok(csvPreview.warnings.some((warning) => warning.includes('no indica el año')));
const junk = await parsePlanningWorkbook(new Uint8Array([0, 1, 2, 3, 255, 254]).buffer, { fileName: 'x.bin', profiles, equipments, existing: [] }).catch((error) => error);
assert.ok(junk instanceof Error ? /No se pudo leer/.test(junk.message) : junk.rows.length === 0, 'junk is never read as activities');

// ---------------------------------------------------------------------------------------------------------
// 3. Export, and export → import round trip.
const statusLabel = (row) => (row.sheetStatus === 'cancelado' ? 'Cancelado' : row.sheetStatus === 'pospuesto' ? 'Pospuesto' : 'Programado');
const exportRows = preview.rows.map((row) => ({
  weekLabel: row.weekLabel,
  weekStart: row.weekStart,
  serviceType: row.serviceType,
  platform: row.platform,
  locality: row.locality,
  serialNumber: row.serialNumber,
  observations: row.observations,
  engineer: row.engineer || '',
  companions: row.companions,
  daysText: row.daysText,
  scheduledDate: row.scheduledDate,
  scheduledEndDate: row.scheduledEndDate,
  status: statusLabel(row),
  custom: { prioridad: row.serviceType === 'correctivo' ? 'Alta' : 'Media' },
}));
const customColumns = [{ key: 'prioridad', label: 'Prioridad' }];
const fields = (row) => [
  row.weekLabel, row.weekStart, row.weekEnd, row.monthKey, row.serviceType, row.platform, row.locality, row.serialNumber, row.observations,
  row.engineer, row.companions, row.daysText, row.scheduledDate, row.scheduledEndDate, row.sheetStatus, row.status, row.duplicateOfId,
];

for (const groupByWeek of [true, false]) {
  const bytes = await buildPlanningWorkbook(exportRows, { title: 'Planeación: octubre/2026', groupByWeek, customColumns });
  assert.ok(bytes instanceof ArrayBuffer && bytes.byteLength > 0);

  // The file itself: sheet name, frozen header, header labels, fills, real dates, week rows, widths.
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  assert.equal(book.worksheets.length, 1);
  const sheet = book.worksheets[0];
  assert.equal(sheet.name, 'Planeación octubre 2026');
  assert.equal(sheet.views[0].state, 'frozen');
  assert.equal(sheet.views[0].ySplit, 1);
  const headerLabels = sheet.getRow(1).values.slice(1);
  const expectedHeader = ['Tipo', 'Plataforma', 'Localidad', 'N/S', 'Observaciones', 'Ingeniero', 'Acompañantes', 'Días', 'Fecha programada', 'Fecha fin', 'Estado', 'Prioridad'];
  assert.deepEqual(headerLabels, groupByWeek ? expectedHeader : ['Semana', ...expectedHeader]);
  assert.equal(sheet.getRow(1).getCell(1).font.bold, true);
  const offset = groupByWeek ? 0 : 1;
  if (groupByWeek) {
    const weekRow = sheet.getRow(2);
    assert.equal(weekRow.getCell(1).value, '28 AL 02 OCTUBRE 2026');
    assert.equal(weekRow.getCell(1).font.bold, true);
    assert.ok(weekRow.getCell(2).isMerged, 'week title spans the table');
  }
  const firstActivity = sheet.getRow(groupByWeek ? 3 : 2);
  assert.equal(firstActivity.getCell(1 + offset).value, 'Preventivo');
  assert.equal(firstActivity.getCell(1 + offset).fill.fgColor.argb, 'FFEAF6EC', 'preventivo rows are light green');
  const scheduledCell = firstActivity.getCell(9 + offset);
  assert.ok(scheduledCell.value instanceof Date, 'dates are real Excel dates');
  assert.equal(scheduledCell.value.toISOString().slice(0, 10), '2026-09-28');
  assert.equal(scheduledCell.numFmt, 'dd/mm/yyyy');
  assert.equal(firstActivity.getCell(12 + offset).value, 'Media');
  const correctiveRow = sheet.getRow(groupByWeek ? 4 : 3);
  assert.equal(correctiveRow.getCell(1 + offset).fill.fgColor.argb, 'FFFFF4DF', 'correctivo rows are light amber');
  for (let col = 1; col <= expectedHeader.length + offset; col += 1) assert.ok(sheet.getColumn(col).width >= 8, `column ${col} has a width`);

  const back = await parsePlanningWorkbook(bytes, { fileName: 'export.xlsx', profiles, equipments, existing });
  assert.equal(back.rows.length, preview.rows.length, `round trip keeps every row (groupByWeek=${groupByWeek})`);
  back.rows.forEach((row, index) => {
    assert.deepEqual(fields(row), fields(preview.rows[index]), `round trip row ${preview.rows[index].id} (groupByWeek=${groupByWeek})`);
  });
}

// A row without a week is exported under its own title and comes back as not placeable, never in the week above.
const lonely = { ...exportRows[0], weekLabel: '', weekStart: '', scheduledDate: null, scheduledEndDate: null, locality: 'SIN SEMANA SA' };
const lonelyBack = await parsePlanningWorkbook(await buildPlanningWorkbook([exportRows[0], lonely], { title: 'x', groupByWeek: true, customColumns: [] }), { fileName: 'x 2026.xlsx', profiles, equipments, existing: [] });
assert.deepEqual(lonelyBack.rows.map((row) => [row.locality, row.weekLabel, row.status]), [['HOSPITAL NORTE', '28 AL 02 OCTUBRE', 'nuevo'], ['SIN SEMANA SA', '', 'invalido']]);

// ---------------------------------------------------------------------------------------------------------
// 4. The HTML path of the shared parser still behaves the same.
execFileSync(process.execPath, [fileURLToPath(new URL('./planning-sheet.test.mjs', import.meta.url))], { stdio: 'inherit' });

console.log('PASS: planning Excel import (official layout, flat tables, CSV), issues, duplicates, export and round trip');
