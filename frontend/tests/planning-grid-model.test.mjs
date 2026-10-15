import assert from 'node:assert/strict';
import { createServer } from 'vite';

// Pure pieces of the master table: clipboard tables, dates people type, weeks, schedule overlaps and the
// field-precise ticket patch (keys the grid does not edit must survive).
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { parseClipboardTable, toClipboardTable } = await server.ssrLoadModule('/src/modules/service-planning/grid/clipboard.ts');
  const weeks = await server.ssrLoadModule('/src/modules/service-planning/grid/planningWeeks.ts');
  const { daysFromText, findScheduleConflicts } = await server.ssrLoadModule('/src/modules/service-planning/grid/scheduleConflicts.ts');
  const record = await server.ssrLoadModule('/src/modules/service-planning/grid/planningRecord.ts');

  // Clipboard: Excel quotes cells with tabs, line breaks or quotes; trailing line break is dropped.
  const table = parseClipboardTable('A\t"B\tb"\r\n"línea 1\nlínea 2"\t"dice ""hola"""\r\n');
  assert.deepEqual(table, [['A', 'B\tb'], ['línea 1\nlínea 2', 'dice "hola"']]);
  assert.deepEqual(parseClipboardTable(toClipboardTable(table)), table);

  // Dates as people write them.
  assert.equal(weeks.parseLooseDate('15/10/2026'), '2026-10-15');
  assert.equal(weeks.parseLooseDate('15-10-26'), '2026-10-15');
  assert.equal(weeks.parseLooseDate('15 oct', '2026-01-01'), '2026-10-15');
  assert.equal(weeks.parseLooseDate('15 de octubre de 2027'), '2027-10-15');
  assert.equal(weeks.parseLooseDate('46310'), '2026-10-15', 'Excel serial date');
  assert.equal(weeks.parseLooseDate('31/02/2026'), null);

  // Weeks: Monday to Friday, labelled by the month where they end; crossing weeks belong to that month.
  assert.deepEqual(weeks.weekOfDate('2026-10-14'), { start: '2026-10-12', end: '2026-10-16', label: '12 AL 16 OCTUBRE', monthKey: '2026-10' });
  assert.deepEqual(weeks.weeksOfMonth('2026-10').map((week) => week.label), ['28 AL 02 OCTUBRE', '05 AL 09 OCTUBRE', '12 AL 16 OCTUBRE', '19 AL 23 OCTUBRE', '26 AL 30 OCTUBRE']);
  assert.equal(weeks.weeksOfMonth('2026-09').at(-1).label, '21 AL 25 SEPTIEMBRE', 'the crossing week is not repeated in September');
  assert.equal(weeks.weeksOfMonth('2027-01')[0].label, '28 AL 01 ENERO', 'works across years');
  assert.equal(weeks.weekOfDate('2026-10-17').start, '2026-10-12', 'Saturday stays with its week');

  // Day text inside a week.
  assert.deepEqual(daysFromText('LUN-MAR', '2026-10-12'), ['2026-10-12', '2026-10-13']);
  assert.deepEqual(daysFromText('mie, vie', '2026-10-12'), ['2026-10-14', '2026-10-16']);
  assert.deepEqual(daysFromText('13 al 15', '2026-10-12'), ['2026-10-13', '2026-10-14', '2026-10-15']);
  assert.deepEqual(daysFromText('por confirmar', '2026-10-12'), []);

  // Overlaps: same person, same day, different place; same place or undated activities are not flagged.
  const ctx = { profiles: [], actorName: 'Prueba', now: '2026-10-10T00:00:00.000Z' };
  let n = 0;
  const make = (values, date) => {
    n += 1;
    const payload = record.buildInsertPayload({ ...record.emptyValues(), ...values }, weeks.weekOfDate(date), ctx);
    return record.toPlanningRecord({ id: `r${n}`, creado_en: '2026-10-01T00:00:00Z', numero_caso: null, planning_version: 1, ...payload }, []);
  };
  const items = [
    make({ locality: 'Hospital A', engineer: 'Ana', scheduledDate: '2026-10-13' }, '2026-10-13'),
    make({ locality: 'Hospital B', engineer: 'Ana', days: 'MAR' }, '2026-10-13'),
    make({ locality: 'Hospital A', engineer: 'Ana', scheduledDate: '2026-10-13' }, '2026-10-13'),
    make({ locality: 'Hospital C', engineer: 'Ana' }, '2026-10-13'),
    make({ locality: 'Hospital D', engineer: 'Luis', companions: ['Ana'], scheduledDate: '2026-10-13' }, '2026-10-13'),
  ].map((entry) => ({ record: entry, values: entry.values }));
  const conflicts = findScheduleConflicts(items);
  assert.deepEqual([...conflicts.keys()].sort(), ['r1', 'r2', 'r3', 'r5']);
  assert.ok(!conflicts.get('r1').some((entry) => entry.otherId === 'r3'), 'same hospital is compatible');
  assert.equal(conflicts.size, 4);
  assert.equal(findScheduleConflicts(items, { enabled: true, includeCompanions: false, sameLocalityIsConflict: false }).has('r5'), false);
  assert.equal(findScheduleConflicts(items, { enabled: false, includeCompanions: true, sameLocalityIsConflict: true }).size, 0);

  // Patches touch only what changed and keep everything else in the ticket metadata.
  const base = make({ locality: 'Hospital A', platform: 'BA400', engineer: 'Ana', observations: 'Nota' }, '2026-10-13');
  const meta = { ...base.meta, travel_request_id: 'viaje-1', custom_fields: { contrato: 'C-9' }, source_row_key: 'k' };
  const row = { ...base.row, descripcion: base.row.descripcion.replace(/\[METADATA_PLANEACION\].*$/s, `[METADATA_PLANEACION] ${JSON.stringify(meta)}`) };
  const rec = record.toPlanningRecord(row, []);
  assert.equal(rec.values.custom.contrato, 'C-9');
  const payload = record.buildUpdatePayload(rec, { scheduledDate: '2026-10-21' }, ctx);
  const saved = JSON.parse(payload.descripcion.split('[METADATA_PLANEACION]')[1]);
  assert.equal(saved.travel_request_id, 'viaje-1');
  assert.deepEqual(saved.custom_fields, { contrato: 'C-9' });
  assert.equal(saved.week_start, '2026-10-19', 'a date in another week moves the activity there');
  assert.deepEqual(saved.orion_edited_fields, ['created', 'scheduledDate', 'week']);
  assert.equal(payload.asunto, undefined, 'subject untouched when type/platform/locality did not change');
  assert.match(payload.descripcion, /^Cliente\/Localidad: Hospital A\nObservaciones: Nota/);
  const moved = record.movePatch({ ...rec, values: { ...rec.values, scheduledDate: '2026-10-14' } }, weeks.weekFromMonday('2026-11-02'));
  assert.equal(moved.scheduledDate, '2026-11-04', 'Wednesday stays Wednesday');

  // Absences: sheet notes become dated absences inside their week; someone away with a service is flagged.
  const { sheetNoteToAbsences, describeAbsenceDates } = await server.ssrLoadModule('/src/modules/service-planning/grid/planningAbsences.ts');
  const sheetWeek = { tab: 'OCTUBRE', rawLabel: '28 AL 02 OCTUBRE', weekLabel: '28 AL 02 OCTUBRE', weekStart: '2026-09-28', weekEnd: '2026-10-02', monthKey: '2026-10' };
  const people = [{ id: 'm', nombre_completo: 'Ana Ruiz', rol: 'tecnico' }, { id: 'l', nombre_completo: 'Luis Mora', rol: 'tecnico' }];
  const note = (text, daysLabel, personText) => ({ tab: 'OCTUBRE', sheetRow: 9, week: sheetWeek, text, kind: 'TXT', daysLabel, personText });
  const across = sheetNoteToAbsences(note('30 AL 01 VAC ANA', '30 AL 01', 'ANA'), people);
  assert.deepEqual(across.map((entry) => [entry.personName, entry.personId, entry.kind, entry.startDate, entry.endDate]), [['Ana Ruiz', 'm', 'VAC', '2026-09-30', '2026-10-01']], 'a range across months');
  const split = sheetNoteToAbsences(note('28 Y 02 TXT ANA / LUIS', '28 Y 02', 'ANA / LUIS'), people);
  assert.deepEqual(split.map((entry) => [entry.personName, entry.startDate, entry.endDate]), [
    ['Ana Ruiz', '2026-09-28', '2026-09-28'], ['Ana Ruiz', '2026-10-02', '2026-10-02'], ['Luis Mora', '2026-09-28', '2026-09-28'], ['Luis Mora', '2026-10-02', '2026-10-02'],
  ], 'separate days and several people');
  assert.equal(new Set(split.map((entry) => entry.sheetKey)).size, 4, 'stable distinct keys');
  assert.deepEqual(sheetNoteToAbsences(note('TXT LUIS', '', 'LUIS'), people).map((entry) => [entry.startDate, entry.endDate]), [['2026-09-28', '2026-10-02']], 'no days: the work week');
  assert.deepEqual(sheetNoteToAbsences(note('LLEVAR REFACCIONES', '', 'LLEVAR REFACCIONES'), people), [], 'not an absence');
  assert.equal(describeAbsenceDates({ startDate: '2026-10-14', endDate: '2026-10-16' }), 'mié 14 a vie 16');
  const away = [{ id: 'a1', personName: 'Ana', kind: 'TXT', startDate: '2026-10-13', endDate: '2026-10-13' }];
  const withAway = findScheduleConflicts(items, undefined, away);
  assert.ok(withAway.get('r1').some((entry) => entry.kind === 'absence' && entry.otherLabel === 'TXT'), 'Ana has TXT the day of her service');
  assert.ok(withAway.get('r5').some((entry) => entry.kind === 'absence'), 'also as companion');
  assert.ok(!withAway.has('r4') || !withAway.get('r4').some((entry) => entry.kind === 'absence'), 'activity without a day is not flagged');

  console.log('PASS: clipboard round trip, typed dates, weeks across months and years, day text, overlaps with rules, field-precise patches, sheet notes to absences, absence warnings.');
} finally {
  await server.close();
}
