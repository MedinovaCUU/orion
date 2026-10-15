import assert from 'node:assert/strict';
import { createServer } from 'vite';

// The official-sheet sync in "protected transition" mode (owner, 2026-10-14): activities edited in Orion after
// the last sync are never overwritten or deleted by Sincronizar unless the user picks the sheet's version.
// Synthetic sheet and tickets; the Supabase client is replaced by an in-memory table.

const MOCK = '\0mock-supabase';
const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  plugins: [
    {
      name: 'mock-supabase',
      enforce: 'pre',
      resolveId: (id) => (/supabaseClient(\.ts)?$/.test(id) ? MOCK : null),
      load: (id) =>
        id === MOCK
          ? `const tables = globalThis.__db;
const query = (table) => {
  const rows = tables[table];
  const state = { filters: [], range: null, op: 'select', payload: null, options: null };
  const api = {
    select() { return api; },
    like(column, pattern) { const needle = pattern.replaceAll('%', ''); state.filters.push((row) => String(row[column] || '').includes(needle)); return api; },
    order() { return api; },
    eq(column, value) { state.filters.push((row) => row[column] === value); return api; },
    in(column, values) { state.filters.push((row) => values.includes(row[column])); return api; },
    range(from, to) { state.range = [from, to]; return api; },
    insert(input) { state.op = 'insert'; state.payload = [].concat(input); return api; },
    upsert(input, options) { state.op = 'upsert'; state.payload = [].concat(input); state.options = options || {}; return api; },
    update(payload) { state.op = 'update'; state.payload = payload; return api; },
    delete() { state.op = 'delete'; return api; },
    then(resolve) {
      if (!rows) return resolve({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public." + table + "' in the schema cache" } });
      if (state.op === 'insert') { for (const row of state.payload) rows.push({ id: crypto.randomUUID(), creado_en: new Date().toISOString(), ...row }); return resolve({ data: null, error: null }); }
      if (state.op === 'upsert') {
        const key = state.options.onConflict;
        for (const row of state.payload) {
          const found = rows.find((entry) => entry[key] === row[key]);
          if (found && !state.options.ignoreDuplicates) Object.assign(found, row);
          if (!found) rows.push({ id: crypto.randomUUID(), ...row });
        }
        return resolve({ data: null, error: null });
      }
      const matches = rows.filter((row) => state.filters.every((filter) => filter(row)));
      if (state.op === 'update') matches.forEach((row) => Object.assign(row, state.payload));
      if (state.op === 'delete') matches.forEach((row) => rows.splice(rows.indexOf(row), 1));
      const data = state.range ? matches.slice(state.range[0], state.range[1] + 1) : matches;
      return resolve({ data, error: null });
    },
  };
  return api;
};
export const supabase = { from: query };`
          : null,
    },
  ],
});

try {
  globalThis.__tickets = [];
  globalThis.__absences = [];
  globalThis.__db = { tickets: globalThis.__tickets, planning_absences: globalThis.__absences };
  const { syncServicePlanningFromSheet } = await server.ssrLoadModule('/src/modules/service-planning/helpers/servicePlanningSync.ts');
  const { buildPlanningSubject, serializePlanningDescription } = await server.ssrLoadModule('/src/modules/service-planning/helpers/normalizeService.ts');
  const { buildRowKey } = await server.ssrLoadModule('/src/modules/service-planning/helpers/planningPeople.ts');

  // A future week, so it is inside the range the sync mirrors.
  const iso = (date) => date.toISOString().slice(0, 10);
  const monday = new Date();
  monday.setUTCDate(monday.getUTCDate() + 14 - ((monday.getUTCDay() + 6) % 7));
  const friday = new Date(monday);
  friday.setUTCDate(friday.getUTCDate() + 4);
  const months = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const week = {
    tab: months[friday.getUTCMonth()],
    rawLabel: '',
    weekLabel: `${iso(monday).slice(8)} AL ${iso(friday).slice(8)} ${months[friday.getUTCMonth()]}`,
    weekStart: iso(monday),
    weekEnd: iso(friday),
    monthKey: iso(friday).slice(0, 7),
  };
  const activity = (locality, observations, serial = '') => ({
    tab: week.tab, gid: '1', sheetRow: 10, week, rawType: 'PREVENTIVO', serviceType: 'preventivo', platform: 'BA400', locality,
    serialText: serial, serial, observations, engineerTokens: ['ALFREDO'], companionTokens: [], daysText: '', scheduledDate: null, rowNote: '', color: null, status: null,
  });
  const lastSync = '2026-01-01T00:00:00.000Z';
  const ticket = (id, locality, observations, extraMeta = {}, asuntoLocality = locality) => {
    const asunto = buildPlanningSubject('preventivo', 'BA400', locality);
    const meta = {
      fecha_tentativa: week.weekLabel, week_start: week.weekStart, week_end: week.weekEnd, planning_month_key: week.monthKey,
      service_type: 'preventivo', ingeniero_csv: 'Alfredo Acevedo', companions_csv: [], status_values: [],
      source_row_key: buildRowKey(week.weekLabel, asunto, ''), created_from: 'service_planning_sheet_sync', sheet_synced_at: lastSync, sheet_fingerprint: 'old',
      ...extraMeta,
    };
    return { id, estado: 'abierto', user_id: null, numero_serie_equipo: null, creado_en: lastSync, asunto: buildPlanningSubject('preventivo', 'BA400', asuntoLocality), descripcion: serializePlanningDescription(asuntoLocality, observations, meta) };
  };
  const edited = { orion_edited_at: '2026-06-01T00:00:00.000Z', orion_edited_fields: ['locality'] };
  const reset = () => {
    globalThis.__tickets.splice(0, globalThis.__tickets.length,
      ticket('plain', 'Hospital Uno', 'Antes'),
      // Edited in Orion after the last sync (locality renamed): still recognised by its original sheet row.
      ticket('mine', 'Hospital Dos', 'Mi nota', edited, 'Hospital Dos (torre B)'),
      ticket('gone-edited', 'Hospital Tres', 'Se editó', edited),
      ticket('gone', 'Hospital Cuatro', 'Sin editar'),
    );
  };
  const snapshot = {
    title: 'PROGRAMACION SINTETICA', year: 2026, fetchedAt: new Date().toISOString(), tabs: [], readTabs: [week.tab], weeks: [week],
    activities: [activity('Hospital Uno', 'Cambio en la hoja'), activity('Hospital Dos', 'La hoja cambió esto'), activity('Hospital Cinco', 'Nueva')],
    notes: [
      { tab: week.tab, sheetRow: 20, week, text: `${iso(monday).slice(8)} TXT ALFREDO`, kind: 'TXT', daysLabel: iso(monday).slice(8), personText: 'ALFREDO' },
      { tab: week.tab, sheetRow: 21, week, text: `${iso(monday).slice(8)} AL ${iso(friday).slice(8)} VAC FANTASMA`, kind: 'VAC', daysLabel: `${iso(monday).slice(8)} AL ${iso(friday).slice(8)}`, personText: 'FANTASMA' },
      { tab: week.tab, sheetRow: 22, week, text: 'LLEVAR REFACCIONES', kind: 'NOTA', daysLabel: '', personText: 'LLEVAR REFACCIONES' },
    ],
    guards: [], warnings: [],
  };
  const profiles = [{ id: 'p-a', nombre_completo: 'Alfredo Acevedo', rol: 'tecnico' }];
  const run = (options = {}) => syncServicePlanningFromSheet({ actorName: 'Ricardo Montanez', profiles, snapshot, ...options });
  const byId = (id) => globalThis.__tickets.find((row) => row.id === id);

  // Preview: nothing written.
  reset();
  const before = JSON.stringify(globalThis.__tickets);
  const preview = await run({ dryRun: true });
  assert.equal(JSON.stringify(globalThis.__tickets), before, 'the preview writes nothing');
  assert.deepEqual(preview.inserted.map((change) => change.subject), ['[PLAN] PREVENTIVO - BA400 - Hospital Cinco']);
  assert.deepEqual(preview.updated.map((change) => change.id), ['plain']);
  assert.deepEqual(preview.removed.map((change) => change.id), ['gone']);
  assert.deepEqual(preview.protectedRows.map((change) => change.id).sort(), ['gone-edited', 'mine']);
  assert.match(preview.protectedRows.find((change) => change.id === 'mine').detail, /Se editó en Orion/);

  // Apply: Orion's edits stay, the rest follows the sheet.
  await run();
  assert.match(byId('plain').descripcion, /Cambio en la hoja/);
  assert.match(byId('mine').descripcion, /Mi nota/, 'edited row not overwritten');
  assert.match(byId('mine').asunto, /Hospital Dos \(torre B\)/);
  assert.ok(byId('gone-edited'), 'edited row not deleted although the sheet dropped it');
  assert.equal(byId('gone'), undefined, 'untouched row the sheet dropped is removed');
  assert.equal(globalThis.__tickets.filter((row) => /Hospital Dos/.test(row.asunto)).length, 1, 'no duplicate of the edited row');
  assert.equal(globalThis.__tickets.filter((row) => /Hospital Cinco/.test(row.asunto)).length, 1);

  // The user chooses the sheet's version for one row.
  await run({ useSheetFor: ['mine'] });
  assert.match(byId('mine').descripcion, /La hoja cambió esto/);
  assert.match(byId('mine').asunto, / - Hospital Dos$/);
  const again = await run({ dryRun: true });
  assert.deepEqual(again.protectedRows.map((change) => change.id), ['gone-edited'], 'after taking the sheet version the row follows the sheet again');

  // Absences from the sheet notes: TXT of a known person becomes a dated absence; unknown people are reported.
  globalThis.__absences.splice(0);
  const absencePreview = await run({ dryRun: true });
  assert.equal(globalThis.__absences.length, 0, 'the preview writes no absences');
  assert.deepEqual(absencePreview.absences.added, [`TXT · Alfredo Acevedo · ${iso(monday)}`, `Vacaciones · Fantasma · ${iso(monday)} al ${iso(friday)}`]);
  assert.deepEqual(absencePreview.absences.withoutProfile, [`Vacaciones · Fantasma · ${iso(monday)} al ${iso(friday)}`], 'a name with no profile is kept as written and flagged');
  assert.deepEqual(absencePreview.absences.unrecognised, [], 'a plain note is not an absence');
  await run();
  assert.equal(globalThis.__absences.length, 2);
  const txt = globalThis.__absences.find((row) => row.kind === 'TXT');
  assert.equal(globalThis.__absences.find((row) => row.kind === 'VAC').person_id, null);
  assert.deepEqual([txt.person_name, txt.person_id, txt.kind, txt.start_date, txt.end_date, txt.source], ['Alfredo Acevedo', 'p-a', 'TXT', iso(monday), iso(monday), 'sheet']);
  await run();
  assert.equal(globalThis.__absences.length, 2, 'running again adds nothing');
  // The sheet drops them: removed. One edited in Orion afterwards is kept.
  const withoutNotes = { ...snapshot, notes: [] };
  txt.orion_edited_at = '2099-01-01T00:00:00.000Z';
  let dropped = await syncServicePlanningFromSheet({ actorName: 'Ricardo Montanez', profiles, snapshot: withoutNotes });
  assert.deepEqual(globalThis.__absences.map((row) => row.kind), ['TXT'], 'edited in Orion: kept; the other one removed');
  assert.equal(dropped.absences.protectedRows.length, 1);
  assert.equal(dropped.absences.removed.length, 1);
  txt.orion_edited_at = null;
  dropped = await syncServicePlanningFromSheet({ actorName: 'Ricardo Montanez', profiles, snapshot: withoutNotes });
  assert.equal(globalThis.__absences.length, 0, 'untouched: follows the sheet');
  // Without the absences table (migration not applied) the sync still works and says so.
  delete globalThis.__db.planning_absences;
  const noTable = await run({ dryRun: true });
  assert.equal(noTable.absences.available, false);

  console.log('PASS: preview writes nothing, Orion edits are kept (not overwritten, not deleted, not duplicated), untouched rows follow the sheet, sheet version on request; sheet TXT/VAC notes become dated absences (unknown people reported, Orion edits kept, no table tolerated).');
} finally {
  await server.close();
}
