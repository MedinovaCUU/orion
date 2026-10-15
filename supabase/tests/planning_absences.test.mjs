// Run: PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node supabase/tests/planning_absences.test.mjs
// Rebuilds the production pieces planning absences touch (auth.uid(), profiles, is_admin()/is_staff(),
// Supabase's default grants and the Realtime publication) on embedded PostgreSQL, applies 20261015020000
// twice (re-runnable) and checks: constraints, server-maintained version/updated_at/created_by/created_at
// (+1 only on a real change, client values ignored), optimistic "where version = n" (1 / 0 rows), the
// sheet upsert on sheet_key, RLS (staff read all; admins write all; technicians write only their own and
// cannot hand an absence to someone else; clients and anon nothing), grants, indexes, the publication and
// on delete set null. Synthetic data only.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const uuid = (prefix, n) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ADMIN = uuid('a', 1), ALFREDO = uuid('a', 2), DIEGO = uuid('a', 3), CLIENT = uuid('a', 4), OTHER = uuid('a', 5), GHOST = uuid('a', 9);
const migration = await readFile(new URL('../migrations/20261015020000_planning_absences.sql', import.meta.url), 'utf8');

await db.exec(String.raw`
set timezone = 'UTC';
create role anon; create role authenticated;
grant usage on schema public to anon, authenticated;
-- Supabase grants every new table and function in public to the API roles; the migration must revoke.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
create schema auth; grant usage on schema auth to anon, authenticated;
-- Production auth.uid() (pg_get_functiondef, 2026-10-14).
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create publication supabase_realtime;
create table profiles(id uuid primary key, nombre_completo text, rol text);
-- Production helper definitions (as in planning_grid.test.mjs, 2026-10-14).
create function is_admin() returns boolean language sql stable security definer set search_path = public as
 $$ select exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.rol = 'admin') $$;
create function is_staff() returns boolean language sql stable security definer set search_path = public as
 $$ select exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.rol in ('admin', 'tecnico')) $$;
alter table profiles enable row level security;
create policy "own profile" on profiles for select to authenticated using (id = (select auth.uid()));
insert into profiles values ('${ADMIN}', 'Dirección de Servicio', 'admin'), ('${ALFREDO}', 'Alfredo Acevedo', 'tecnico'),
 ('${DIEGO}', 'Diego García García', 'tecnico'), ('${CLIENT}', 'Laboratorio Cliente', 'cliente'), ('${OTHER}', 'Técnico Temporal', 'tecnico');
`);

await db.exec(migration);
await db.exec(migration); // re-runnable: if-not-exists, drop-if-exists, create-or-replace, guarded publication

const as = async user => db.exec(user === 'anon' ? `reset role; set request.jwt.claim.sub = ''; set role anon`
  : user ? `reset role; set request.jwt.claim.sub = '${user}'; set role authenticated`
  : `reset role; set request.jwt.claim.sub = ''`);
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const COLS = `id, person_id, person_name, kind, start_date::text as start_date, end_date::text as end_date, note, source, sheet_key,
  version, created_by, created_at::text as created_at, updated_at::text as updated_at`;
const add = async (user, row) => {
  const r = { person_name: 'Alfredo Acevedo', kind: 'TXT', start_date: '2026-10-20', end_date: '2026-10-20', ...row };
  const keys = Object.keys(r);
  await as(user);
  return (await q(`insert into planning_absences (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning ${COLS}`,
    keys.map(k => r[k])))[0];
};
const get = async id => { await as(null); return (await q(`select ${COLS} from planning_absences where id = $1`, [id]))[0]; };
const backdate = async id => { await as(null);
  await db.exec(`set session_replication_role = replica; update planning_absences set updated_at = '2020-01-01 00:00:00+00' where id = '${id}';
                 set session_replication_role = origin`); };
const OLD = '2020-01-01 00:00:00+00';

// --- Constraints ------------------------------------------------------------------------------------
for (const [bad, why] of [
  [{ kind: 'VACACIONES' }, 'unknown kind'],
  [{ kind: 'txt' }, 'kinds are upper case'],
  [{ start_date: '2026-10-21', end_date: '2026-10-20' }, 'end before start'],
  [{ start_date: '2026-01-01', end_date: '2027-01-03' }, 'more than 366 days'],
  [{ person_name: '' }, 'empty name'],
  [{ person_name: '   ' }, 'blank name'],
  [{ person_name: 'x'.repeat(121) }, 'name over 120'],
  [{ source: 'excel' }, 'unknown source'],
]) await assert.rejects(add(ADMIN, bad), /check constraint/, why);
await assert.rejects(add(ADMIN, { person_name: null }), /not-null|null value/, 'name required');
await assert.rejects(add(ADMIN, { kind: null }), /not-null|null value/, 'kind required');
assert.equal((await add(ADMIN, { person_name: 'y'.repeat(120), start_date: '2026-01-01', end_date: '2027-01-02', kind: 'INCAPACIDAD' })).version, 1,
  '366 days and 120 characters are the limits, still accepted');
for (const kind of ['TXT', 'VAC', 'PERMISO', 'INCAPACIDAD', 'CUMPLEANOS', 'OTRO']) assert.equal((await add(ADMIN, { kind })).kind, kind);
await as(null);
await q('delete from planning_absences');

// --- Server-maintained fields -----------------------------------------------------------------------
const a1 = await add(ADMIN, { person_id: ALFREDO, note: 'TXT por guardia', version: 99, created_by: OTHER, created_at: OLD, updated_at: OLD });
assert.equal(a1.version, 1, 'inserts start at version 1 whatever the client sent');
assert.equal(a1.created_by, ADMIN, 'created_by is the JWT user');
assert.equal(a1.source, 'orion', 'source defaults to orion');
assert.equal(a1.sheet_key, null);
assert.ok(a1.created_at > '2020-01-02' && a1.updated_at > '2020-01-02', 'insert timestamps are server time');
const noJwt = await add(null, { person_id: DIEGO, person_name: 'Diego García García', created_by: DIEGO });
assert.equal(noJwt.created_by, DIEGO, 'without a JWT (service role / SQL) created_by keeps what was sent');
assert.equal((await add(null, { person_id: DIEGO, person_name: 'Diego García García' })).created_by, null, 'and defaults to null');
await as(null);
await q('delete from planning_absences where id <> $1', [a1.id]);

await backdate(a1.id);
const bump = async (set, params = []) => { await as(ADMIN); return (await q(`update planning_absences set ${set} where id = $1 returning version`, [a1.id, ...params]))[0].version; };
assert.equal(await bump('note = note, kind = kind, person_id = person_id'), 1, 'no-op update keeps the version');
assert.equal(await bump('version = 50'), 1, 'a client-supplied version alone is ignored');
assert.equal(await bump(`updated_at = '2030-01-01'`), 1, 'a client-supplied updated_at alone is ignored');
assert.equal(await bump(`created_by = $2, created_at = '2021-01-01'`, [DIEGO]), 1, 'created_by/created_at alone change nothing');
let r = await get(a1.id);
assert.deepEqual([r.version, r.created_by, r.created_at, r.updated_at], [1, ADMIN, a1.created_at, OLD], 'all four reset to the stored values');

assert.equal(await bump(`note = 'TXT por guardia del sábado', version = 50, created_by = $2, created_at = '2021-01-01', updated_at = '2020-06-01'`, [DIEGO]), 2,
  'a real change is old + 1 whatever the client sent');
r = await get(a1.id);
assert.deepEqual([r.created_by, r.created_at], [ADMIN, a1.created_at], 'created_by/created_at immutable');
assert.ok(r.updated_at > '2020-06-02', 'updated_at moves to server time on a real change');

// Every other column counts as a real change (one bump each).
let expected = 2;
for (const [set, params] of [
  [`person_name = 'Alfredo Acevedo M.'`, []], [`kind = 'VAC'`, []], [`start_date = '2026-10-19'`, []], [`end_date = '2026-10-21'`, []],
  [`note = null`, []], [`source = 'sheet'`, []], [`sheet_key = 'hoja:manual'`, []], [`sheet_synced_at = now()`, []],
  [`orion_edited_at = now()`, []], [`created_by_name = 'Dirección de Servicio'`, []], [`updated_by_name = 'Dirección de Servicio'`, []],
  [`person_id = $2`, [DIEGO]], [`person_id = $2`, [ALFREDO]], [`source = 'orion', sheet_key = null`, []],
]) assert.equal(await bump(set, params), ++expected, set);

// Optimistic concurrency as the client does it.
await backdate(a1.id);
await as(ADMIN);
let rows = await q(`update planning_absences set end_date = '2026-10-22', updated_by_name = 'Dirección de Servicio' where id = $1 and version = $2 returning *`, [a1.id, expected]);
assert.equal(rows.length, 1, 'expected version matches → 1 row');
assert.equal(rows[0].version, expected + 1, 'returning * carries the new version');
assert.ok(rows[0].updated_at > new Date('2020-01-02'), 'and the new updated_at');
await as(ADMIN);
rows = await q(`update planning_absences set end_date = '2026-10-30' where id = $1 and version = $2 returning *`, [a1.id, expected]);
assert.deepEqual(rows, [], 'stale version → 0 rows');
r = await get(a1.id);
assert.deepEqual([r.end_date, r.version], ['2026-10-22', expected + 1], 'the stale write changed nothing');

// --- RLS ----------------------------------------------------------------------------------------------
await as(null);
await q('delete from planning_absences');
const ALF = (await add(ADMIN, { person_id: ALFREDO, kind: 'TXT' })).id;
const DIE = (await add(ADMIN, { person_id: DIEGO, person_name: 'Diego García García', kind: 'VAC', start_date: '2026-10-20', end_date: '2026-10-24' })).id;
const NOBODY = (await add(ADMIN, { person_id: null, person_name: 'Ricardo Vilchis', kind: 'PERMISO' })).id;
const TEMP = (await add(ADMIN, { person_id: OTHER, person_name: 'Técnico Temporal', kind: 'CUMPLEANOS' })).id;
const visible = async user => { await as(user); return (await q('select id from planning_absences order by id')).map(row => row.id); };
const all = [ALF, DIE, NOBODY, TEMP].sort();
assert.deepEqual(await visible(ADMIN), all, 'admins read everything');
assert.deepEqual(await visible(ALFREDO), all, 'technicians read the whole team (planning needs everyone\'s availability)');
assert.deepEqual(await visible(DIEGO), all);
assert.deepEqual(await visible(CLIENT), [], 'clients read nothing');
assert.deepEqual(await visible(GHOST), [], 'a JWT without a profile reads nothing');
await as('anon');
await assert.rejects(q('select * from planning_absences'), /permission denied/, 'anon has no grant');

// Technician: own rows only.
const own = await add(ALFREDO, { person_id: ALFREDO, kind: 'VAC', start_date: '2026-12-21', end_date: '2026-12-31', created_by: ADMIN });
assert.equal(own.created_by, ALFREDO, 'technician inserts own; created_by is the JWT user');
await assert.rejects(add(ALFREDO, { person_id: DIEGO, person_name: 'Diego García García' }), /row-level security/, 'cannot create an absence for someone else');
await assert.rejects(add(ALFREDO, { person_id: null, person_name: 'Ricardo Vilchis' }), /row-level security/, 'cannot create an absence without a person');
await as(ALFREDO);
rows = await q(`update planning_absences set note = 'Vacaciones de fin de año', orion_edited_at = now() where id = $1 and version = 1 returning version`, [own.id]);
assert.deepEqual(rows, [{ version: 2 }], 'technician updates own with the version check');
await as(ALFREDO);
assert.equal((await q(`update planning_absences set note = 'mío' where id = $1 returning id`, [ALF])).length, 1, 'also own rows an admin created');
await as(ALFREDO);
await assert.rejects(q(`update planning_absences set person_id = $2 where id = $1`, [own.id, DIEGO]), /row-level security/, 'cannot hand own absence to someone else');
await as(ALFREDO);
await assert.rejects(q(`update planning_absences set person_id = null where id = $1`, [own.id]), /row-level security/, 'nor detach it from himself');
for (const id of [DIE, NOBODY, TEMP]) {
  await as(ALFREDO);
  assert.equal((await q(`update planning_absences set note = 'x', person_id = $2 where id = $1 returning id`, [id, ALFREDO])).length, 0, 'cannot update others\' (nor take them)');
  await as(ALFREDO);
  assert.equal((await q(`delete from planning_absences where id = $1 returning id`, [id])).length, 0, 'cannot delete others\'');
}
assert.deepEqual([(await get(DIE)).version, (await get(DIE)).note, (await get(NOBODY)).version, (await get(TEMP)).version], [1, null, 1, 1], 'others untouched');
await as(ALFREDO);
assert.equal((await q(`delete from planning_absences where id = $1 returning id`, [own.id])).length, 1, 'technician deletes own');

// Client and anon: no writes.
await assert.rejects(add(CLIENT, { person_id: CLIENT, person_name: 'Laboratorio Cliente' }), /row-level security/, 'clients cannot insert, not even for themselves');
await as(CLIENT);
assert.equal((await q(`update planning_absences set note = 'x' returning id`)).length, 0, 'clients update nothing');
await as(CLIENT);
assert.equal((await q(`delete from planning_absences returning id`)).length, 0, 'clients delete nothing');
await assert.rejects(add(GHOST, { person_id: GHOST }), /row-level security|foreign key/, 'a JWT without a profile cannot insert');
await assert.rejects(add('anon', {}), /permission denied/, 'anon cannot insert');
await as('anon');
await assert.rejects(q(`update planning_absences set note = 'x'`), /permission denied/);
await as('anon');
await assert.rejects(q('delete from planning_absences'), /permission denied/);

// Admin: everything, including reassigning and rows without a person.
await as(ADMIN);
assert.equal((await q(`update planning_absences set person_id = $2, person_name = 'Alfredo Acevedo' where id = $1 and version = 1 returning version`, [NOBODY, ALFREDO]))[0].version, 2,
  'admins reassign');
await as(ADMIN);
assert.equal((await q(`delete from planning_absences where id = $1 returning id`, [DIE])).length, 1, 'admins delete anyone\'s');
assert.deepEqual(await visible(ALFREDO), [ALF, NOBODY, TEMP].sort());

// --- Sheet upsert on sheet_key (as PostgREST's merge-duplicates writes it) ----------------------------
const upsert = async (user, row) => {
  const r = { person_id: DIEGO, person_name: 'Diego García García', kind: 'TXT', start_date: '2026-11-03', end_date: '2026-11-03', note: 'TXT (hoja)',
    source: 'sheet', sheet_key: 'hoja:2026-11:diego:txt', sheet_synced_at: '2026-10-14 08:00:00+00', updated_by_name: 'Hoja de planeación', ...row };
  const keys = Object.keys(r);
  await as(user);
  return q(`insert into planning_absences (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')})
            on conflict (sheet_key) do update set ${keys.map(k => `${k} = excluded.${k}`).join(', ')}
            returning id, version, source, sheet_key, end_date::text as end_date, (xmax = 0) as inserted`, keys.map(k => r[k]));
};
const [first] = await upsert(ADMIN, {});
assert.deepEqual([first.version, first.source, first.inserted], [1, 'sheet', true], 'first sync inserts');
let [again] = await upsert(ADMIN, {});
assert.deepEqual([again.id, again.version, again.inserted], [first.id, 1, false], 'identical sync → same row, no bump');
[again] = await upsert(ADMIN, { end_date: '2026-11-04', sheet_synced_at: '2026-10-15 08:00:00+00' });
assert.deepEqual([again.id, again.version, again.end_date], [first.id, 2, '2026-11-04'], 'changed sync → same row, +1');
await as(null);
assert.equal((await q(`select count(*)::int as n from planning_absences where sheet_key = 'hoja:2026-11:diego:txt'`))[0].n, 1, 'one row per sheet_key');
assert.ok((await q(`select count(*)::int as n from planning_absences where sheet_key is null`))[0].n >= 2, 'Orion rows share a null sheet_key');
await assert.rejects(upsert(ALFREDO, { person_id: ALFREDO, person_name: 'Alfredo Acevedo' }), /row-level security/,
  'a technician cannot take over someone else\'s sheet row through the upsert');
await assert.rejects(upsert(ALFREDO, { sheet_key: 'hoja:2026-11:diego:vac' }), /row-level security/, 'nor upsert a sheet row for someone else');
assert.equal((await upsert(ALFREDO, { person_id: ALFREDO, person_name: 'Alfredo Acevedo', sheet_key: 'hoja:2026-11:alfredo:txt' }))[0].inserted, true,
  'own sheet rows upsert under the same rule');
await as(null);
await assert.rejects(q(`insert into planning_absences (person_name, kind, start_date, end_date, sheet_key) values ('X', 'OTRO', '2026-11-01', '2026-11-01', 'hoja:2026-11:diego:txt')`),
  /unique|duplicate/, 'sheet_key is unique');

// --- Catalog ------------------------------------------------------------------------------------------
await as(null);
assert.equal((await q(`select count(*)::int as n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'planning_absences'`))[0].n, 1,
  'published once to Realtime');
assert.deepEqual((await q(`select tgname from pg_trigger where tgrelid = 'planning_absences'::regclass and not tgisinternal`)).map(row => row.tgname),
  ['planning_absences_versioning']);
assert.deepEqual((await q(`select policyname, cmd from pg_policies where tablename = 'planning_absences' order by policyname`)).map(row => `${row.policyname}:${row.cmd}`),
  ['planning_absences_delete:DELETE', 'planning_absences_insert:INSERT', 'planning_absences_read:SELECT', 'planning_absences_update:UPDATE']);
const indexes = (await q(`select indexdef from pg_indexes where tablename = 'planning_absences'`)).map(row => row.indexdef.replace(/^.* USING btree /, ''));
for (const def of ['(start_date, end_date)', '(person_id)', '(sheet_key)', '(id)']) assert.ok(indexes.includes(def), `index ${def}`);
const privileges = (await q(`select role, privilege, has_table_privilege(role, 'public.planning_absences', privilege) as ok
  from unnest(array['anon', 'authenticated', 'public']) role, unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) privilege`))
  .filter(row => row.ok).map(row => `${row.role}:${row.privilege}`);
assert.deepEqual(privileges, ['authenticated:select', 'authenticated:insert', 'authenticated:update', 'authenticated:delete'], 'grants');
assert.equal((await q(`select has_function_privilege('authenticated', 'public.planning_absences_versioning()', 'execute') as ok`))[0].ok, false,
  'trigger function not executable by API roles');

// --- on delete set null -------------------------------------------------------------------------------
const tempVersion = (await get(TEMP)).version;
await as(null);
await q('delete from profiles where id = $1', [OTHER]);
r = await get(TEMP);
assert.deepEqual([r.person_id, r.person_name, r.version], [null, 'Técnico Temporal', tempVersion + 1], 'a deleted profile leaves the absence with its name');
await as(ADMIN);
assert.ok((await visible(ADMIN)).includes(TEMP), 'still visible to admins');

await as(null);
await db.close();
console.log('PASS: planning absences — constraints (kind, range ≤ 366 days, name 1–120, source), server-maintained version '
  + '(1 on insert, +1 per real change of any column, client version/updated_at/created_by/created_at ignored), optimistic 1/0 rows, '
  + 'RLS (staff read all; admin writes all; technician only own, no reassigning; client/ghost/anon nothing), sheet upsert on sheet_key, '
  + 'grants, indexes, Realtime publication, on delete set null');
