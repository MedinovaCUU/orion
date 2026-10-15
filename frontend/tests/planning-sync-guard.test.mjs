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
          ? `const db = globalThis.__tickets;
const query = (table) => {
  const state = { filters: [], range: null, op: 'select', payload: null };
  const api = {
    select() { return api; },
    like(column, pattern) { const needle = pattern.replaceAll('%', ''); state.filters.push((row) => String(row[column] || '').includes(needle)); return api; },
    order() { return api; },
    eq(column, value) { state.filters.push((row) => row[column] === value); return api; },
    range(from, to) { state.range = [from, to]; return api; },
    insert(rows) { for (const row of rows) db.push({ id: crypto.randomUUID(), creado_en: new Date().toISOString(), ...row }); return Promise.resolve({ error: null }); },
    update(payload) { state.op = 'update'; state.payload = payload; return api; },
    delete() { state.op = 'delete'; return api; },
    then(resolve) {
      const matches = db.filter((row) => state.filters.every((filter) => filter(row)));
      if (state.op === 'update') matches.forEach((row) => Object.assign(row, state.payload));
      if (state.op === 'delete') matches.forEach((row) => db.splice(db.indexOf(row), 1));
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
    notes: [], guards: [], warnings: [],
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

  console.log('PASS: preview writes nothing, Orion edits are kept (not overwritten, not deleted, not duplicated), untouched rows follow the sheet, sheet version on request.');
} finally {
  await server.close();
}
