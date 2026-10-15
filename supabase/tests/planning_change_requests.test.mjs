// Run: PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node supabase/tests/planning_change_requests.test.mjs
// Rebuilds the production pieces planning change requests touch (auth.uid(), profiles, is_admin()/is_staff(),
// Supabase's default grants and the Realtime publication) on embedded PostgreSQL, applies 20261015030000
// twice (re-runnable) and checks: the approver seed (exact names, notify, idempotent, never overwrites,
// missing/ambiguous names skipped), is_planning_approver() per user, the server-maintained fields of a
// request (insert forced to pending as the JWT user; requester may only edit payload/summary/target/base
// version and cancel; approvers review with reviewed_by/at stamped; status transitions; immutable fields),
// RLS (requester own rows, approvers all, other staff/clients/anon nothing, no deletes), constraints,
// grants, indexes, the publication and on delete cascade. Synthetic data only.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const uuid = (prefix, n) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SOFIA = uuid('a', 1), RICARDO = uuid('a', 2), OTRA = uuid('a', 3), TECH = uuid('a', 4), CLIENT = uuid('a', 5), TECH2 = uuid('a', 6), GHOST = uuid('a', 9);
const T1 = uuid('b', 1), T2 = uuid('b', 2), AB1 = uuid('c', 1);
const migration = await readFile(new URL('../migrations/20261015030000_planning_change_requests.sql', import.meta.url), 'utf8');

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
insert into profiles values ('${SOFIA}', 'Sofia Ceballos', 'admin'), ('${RICARDO}', 'Ricardo Montañez', 'admin'),
 ('${OTRA}', 'Otra Admin', 'admin'), ('${TECH}', 'Alfredo Acevedo', 'tecnico'), ('${CLIENT}', 'Laboratorio Cliente', 'cliente'),
 ('${TECH2}', 'Diego García García', 'tecnico');
`);

await db.exec(migration);
await db.exec(migration); // re-runnable: if-not-exists, on conflict do nothing, drop-if-exists, create-or-replace, guarded publication

const as = async user => db.exec(user === 'anon' ? `reset role; set request.jwt.claim.sub = ''; set role anon`
  : user ? `reset role; set request.jwt.claim.sub = '${user}'; set role authenticated`
  : `reset role; set request.jwt.claim.sub = ''`);
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const OLD = '2020-01-01 00:00:00+00';
const COLS = `id, kind, ticket_id, absence_id, payload, base_version, summary, target_label, status, requested_by, requested_by_name,
  requested_at::text as requested_at, updated_at::text as updated_at, reviewed_by, reviewed_by_name, reviewed_at::text as reviewed_at,
  review_note, applied_result`;
const file = async (user, row = {}) => {
  const r = { kind: 'update', ticket_id: T1, payload: JSON.stringify({ observaciones: 'Llevar reactivos' }), base_version: 3,
    summary: 'Cambiar observaciones', target_label: 'MANTENIMIENTO - BA400 - HOSPITAL CENTRAL', ...row };
  const keys = Object.keys(r);
  await as(user);
  return (await q(`insert into planning_change_requests (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning ${COLS}`,
    keys.map(k => r[k])))[0];
};
const get = async id => { await as(null); return (await q(`select ${COLS} from planning_change_requests where id = $1`, [id]))[0]; };
const upd = async (user, id, set, params = []) => { await as(user); return q(`update planning_change_requests set ${set} where id = $1 returning ${COLS}`, [id, ...params]); };
const backdate = async id => { await as(null);
  await db.exec(`set session_replication_role = replica; update planning_change_requests set updated_at = '${OLD}' where id = '${id}';
                 set session_replication_role = origin`); };
const visible = async user => { await as(user); return (await q('select id from planning_change_requests order by id')).map(row => row.id); };
const approvers = async () => { await as(null);
  return (await q(`select p.nombre_completo as name, a.notify, a.label from planning_approvers a join profiles p on p.id = a.user_id order by p.nombre_completo`)); };

// --- Approver seed ------------------------------------------------------------------------------------
const SEEDED = [{ name: 'Ricardo Montañez', notify: false, label: 'dueño' }, { name: 'Sofia Ceballos', notify: true, label: 'planeación' }];
assert.deepEqual(await approvers(), SEEDED, 'Sofia (notified) and Ricardo (not notified) seeded once after two runs');
await as(null);
const addedAt = (await q(`select added_at::text from planning_approvers where user_id = $1`, [SOFIA]))[0].added_at;
await q(`update planning_approvers set notify = false, label = 'manual' where user_id = $1`, [SOFIA]);
await db.exec(migration);
assert.deepEqual((await q(`select notify, label, added_at::text from planning_approvers where user_id = $1`, [SOFIA]))[0],
  { notify: false, label: 'manual', added_at: addedAt }, 're-running never overwrites an existing approver');
await q(`update planning_approvers set notify = true, label = 'planeación' where user_id = $1`, [SOFIA]);

// Missing name (exact match only: no accent folding) → skipped without error.
await q(`delete from planning_approvers where user_id = $1`, [RICARDO]);
await q(`update profiles set nombre_completo = 'Ricardo Montanez' where id = $1`, [RICARDO]);
await db.exec(migration);
assert.deepEqual(await approvers(), [SEEDED[1]], 'a name that matches no profile is skipped silently');
await as(null);
await q(`update profiles set nombre_completo = 'Ricardo Montañez' where id = $1`, [RICARDO]);
// Ambiguous name (two profiles) → skipped too.
await q(`delete from planning_approvers where user_id = $1`, [SOFIA]);
await q(`insert into profiles values ($1, 'Sofia Ceballos', 'cliente')`, [GHOST]);
await db.exec(migration);
assert.deepEqual(await approvers(), [SEEDED[0]], 'an ambiguous name (two profiles) is skipped; the other name is seeded');
await as(null);
await q(`delete from profiles where id = $1`, [GHOST]);
await db.exec(migration);
assert.deepEqual(await approvers(), SEEDED, 'once unambiguous, a re-run seeds it');
assert.equal((await q(`select count(*)::int as n from planning_approvers`))[0].n, 2);

// --- is_planning_approver() and the approvers table ----------------------------------------------------
const isApprover = async user => { await as(user); return (await q('select public.is_planning_approver() as ok'))[0].ok; };
assert.deepEqual([await isApprover(SOFIA), await isApprover(RICARDO), await isApprover(OTRA), await isApprover(TECH), await isApprover(CLIENT),
  await isApprover(GHOST), await isApprover(null)], [true, true, false, false, false, false, false], 'is_planning_approver per user');
await as('anon');
await assert.rejects(q('select public.is_planning_approver()'), /permission denied/, 'anon cannot execute is_planning_approver');
const approverRows = async user => { await as(user); return (await q('select user_id from planning_approvers order by user_id')).map(row => row.user_id); };
assert.deepEqual(await approverRows(TECH), [SOFIA, RICARDO].sort(), 'staff read the approvers');
assert.deepEqual(await approverRows(OTRA), [SOFIA, RICARDO].sort());
assert.deepEqual(await approverRows(CLIENT), [], 'clients read no approvers');
await as('anon');
await assert.rejects(q('select * from planning_approvers'), /permission denied/, 'anon has no grant on approvers');
for (const sql of [`insert into planning_approvers (user_id) values ('${OTRA}')`, `update planning_approvers set notify = true`, `delete from planning_approvers`]) {
  await as(SOFIA);
  await assert.rejects(q(sql), /permission denied/, `approvers are managed by SQL only: ${sql.split(' ')[0]}`);
}

// --- Insert: forced pending, requester from the JWT ------------------------------------------------------
const r1 = await file(TECH, { status: 'approved', requested_by: OTRA, requested_at: OLD, updated_at: OLD, reviewed_by: SOFIA,
  reviewed_by_name: 'Sofia Ceballos', reviewed_at: OLD, review_note: 'ok', applied_result: '{"ok":true}' });
assert.equal(r1.status, 'pending', 'insert is always pending');
assert.equal(r1.requested_by, TECH, 'requested_by is the JWT user, not what the client sent');
assert.equal(r1.requested_by_name, 'Alfredo Acevedo', 'requested_by_name falls back to the profile');
assert.ok(r1.requested_at > '2020-01-02' && r1.updated_at > '2020-01-02', 'insert timestamps are server time');
assert.deepEqual([r1.reviewed_by, r1.reviewed_by_name, r1.reviewed_at, r1.review_note, r1.applied_result], [null, null, null, null, null],
  'reviewed_*, review_note and applied_result forced null');
assert.deepEqual([r1.kind, r1.ticket_id, r1.payload, r1.base_version], ['update', T1, { observaciones: 'Llevar reactivos' }, 3]);
assert.equal((await file(TECH, { requested_by_name: 'Alfredo A.' })).requested_by_name, 'Alfredo A.', 'a client-sent requester name is kept');
assert.equal((await file(TECH, { requested_by_name: '   ' })).requested_by_name, 'Alfredo Acevedo', 'a blank one falls back to the profile');
const r2 = await file(TECH, { kind: 'delete', ticket_id: T2, payload: '{}', summary: 'Eliminar visita duplicada' });
const r3 = await file(TECH, { kind: 'insert', ticket_id: null, payload: JSON.stringify({ tipo: 'INSTALACION', semana: '2026-W44' }), base_version: null, summary: 'Nueva instalación' });
const r4 = await file(TECH, { kind: 'absence_update', ticket_id: null, absence_id: AB1, payload: JSON.stringify({ end_date: '2026-10-24' }), base_version: 2, summary: 'Extender vacaciones' });
const rOtra = await file(OTRA, { summary: 'Solicitud de otra administradora' });
const rTech2 = await file(TECH2, { kind: 'absence_insert', ticket_id: null, payload: JSON.stringify({ kind: 'TXT' }), summary: 'TXT del lunes' });
assert.equal(rOtra.requested_by_name, 'Otra Admin');
const sys = await file(null, { requested_by: TECH2, summary: 'Creada por un proceso sin JWT', status: 'rejected' });
assert.deepEqual([sys.requested_by, sys.status, sys.requested_by_name], [TECH2, 'pending', 'Diego García García'],
  'without a JWT (service role / SQL) requested_by keeps what was sent; status still pending');
await assert.rejects(file(null, { summary: 'Sin solicitante' }), /not-null|null value/, 'without a JWT requested_by is required');

// Who may insert: staff as themselves.
await assert.rejects(file(CLIENT), /row-level security/, 'clients cannot file requests');
await assert.rejects(file(GHOST), /row-level security/, 'a JWT without a profile cannot file requests');
await assert.rejects(file('anon'), /permission denied/, 'anon cannot insert');

// --- Requester: own pending requests only -----------------------------------------------------------------
await backdate(r1.id);
let rows = await upd(TECH, r1.id, `payload = payload || $2::jsonb, summary = 'Cambiar observaciones y semana', target_label = 'BA400 HOSPITAL CENTRAL', base_version = 4`,
  [JSON.stringify({ semana: '2026-W45' })]);
assert.equal(rows.length, 1, 'requester edits own pending request');
assert.deepEqual(rows[0].payload, { observaciones: 'Llevar reactivos', semana: '2026-W45' }, 'payload merge');
assert.deepEqual([rows[0].summary, rows[0].target_label, rows[0].base_version, rows[0].status], ['Cambiar observaciones y semana', 'BA400 HOSPITAL CENTRAL', 4, 'pending']);
assert.ok(rows[0].updated_at > '2020-01-02', 'updated_at moves on a real change');
await backdate(r1.id);
rows = await upd(TECH, r1.id, `summary = summary, payload = payload, updated_at = '2030-01-01'`);
assert.equal(rows[0].updated_at, '2020-01-01 00:00:00+00', 'no-op update (and a client updated_at) keeps updated_at');

await backdate(r1.id);
const before = await get(r1.id);
rows = await upd(TECH, r1.id, `reviewed_by = $2, reviewed_by_name = 'Yo', reviewed_at = now(), review_note = 'aprobado por mí', applied_result = '{"ok":true}',
  requested_by = $2, requested_by_name = 'Otro', requested_at = '2021-01-01', kind = 'delete', ticket_id = $3, absence_id = $3, id = $3`, [SOFIA, T2]);
assert.equal(rows.length, 1, 'the update goes through…');
assert.deepEqual(await get(r1.id), before, '…but every protected column is reset (reviewed_*, applied_result, requester, kind, targets, id) and updated_at stays');

for (const status of ['approved', 'rejected', 'failed']) {
  await assert.rejects(upd(TECH, r1.id, `status = '${status}'`), /Solo quien aprueba/, `requester cannot set ${status}`);
}
await assert.rejects(upd(TECH, r1.id, `status = 'approved', payload = '{}'`), err => err.code === '42501', 'raised as insufficient_privilege (42501)');
assert.equal((await get(r1.id)).status, 'pending');

// Other non-approvers neither see nor touch it; the requester does not see theirs.
await as(null);
const techOwn = (await q(`select id from planning_change_requests where requested_by = $1 order by id`, [TECH])).map(row => row.id);
assert.equal(techOwn.length, 6);
assert.ok([r1.id, r2.id, r3.id, r4.id].every(id => techOwn.includes(id)));
assert.deepEqual(await visible(TECH), techOwn, 'requester sees exactly own requests');
for (const user of [OTRA, TECH2]) {
  assert.ok(!(await visible(user)).includes(r1.id), `${user} does not see another person's request`);
  assert.equal((await upd(user, r1.id, `summary = 'secuestrada', status = 'cancelled'`)).length, 0, 'nor update it');
}
assert.deepEqual(await visible(OTRA), [rOtra.id], 'another admin who is not an approver sees only own requests');
assert.deepEqual(await visible(TECH2), [rTech2.id, sys.id].sort(), 'a technician sees own (also those filed for them by the system)');
assert.equal((await get(r1.id)).summary, 'Cambiar observaciones y semana', 'untouched');

// Requester cancels; then the row is closed to them.
await backdate(r2.id);
rows = await upd(TECH, r2.id, `status = 'cancelled', review_note = 'ya no aplica'`);
assert.deepEqual([rows[0].status, rows[0].reviewed_by, rows[0].reviewed_at, rows[0].review_note], ['cancelled', null, null, null],
  'requester cancels own pending request; no reviewer stamped, review_note not theirs');
assert.ok(rows[0].updated_at > '2020-01-02');
assert.equal((await upd(TECH, r2.id, `status = 'pending'`)).length, 0, 'a cancelled request cannot be reopened by the requester');
assert.equal((await upd(TECH, r2.id, `summary = 'otra'`)).length, 0, 'nor edited');
assert.ok((await visible(TECH)).includes(r2.id), 'but stays visible to the requester');

// --- Approvers -------------------------------------------------------------------------------------------
await as(null);
const everything = (await q('select id from planning_change_requests order by id')).map(row => row.id);
assert.deepEqual(await visible(SOFIA), everything, 'Sofia sees every request');
assert.deepEqual(await visible(RICARDO), everything, 'Ricardo sees every request');

// Approve: reviewer stamped by the server.
rows = await upd(SOFIA, r1.id, `status = 'approved', reviewed_by = $2, reviewed_at = '${OLD}', reviewed_by_name = 'Sofía C.', applied_result = $3::jsonb`,
  [OTRA, JSON.stringify({ ticket_version: 5 })]);
assert.equal(rows[0].status, 'approved');
assert.equal(rows[0].reviewed_by, SOFIA, 'reviewed_by = the approving JWT user, whatever was sent');
assert.ok(rows[0].reviewed_at > '2020-01-02', 'reviewed_at = server time');
assert.equal(rows[0].reviewed_by_name, 'Sofía C.', 'a client-sent reviewer name is kept');
assert.deepEqual(rows[0].applied_result, { ticket_version: 5 }, 'approver records the applied result');
assert.deepEqual([rows[0].requested_by, rows[0].kind, rows[0].summary], [TECH, 'update', 'Cambiar observaciones y semana']);
const approvedAt = rows[0].reviewed_at;
rows = await upd(RICARDO, r1.id, `applied_result = '{"ticket_version": 6}', reviewed_by = $2, reviewed_at = now(), reviewed_by_name = 'Ricardo'`, [RICARDO]);
assert.deepEqual([rows[0].status, rows[0].reviewed_by, rows[0].reviewed_at, rows[0].reviewed_by_name, rows[0].applied_result],
  ['approved', SOFIA, approvedAt, 'Sofía C.', { ticket_version: 6 }], 'an approved request can be annotated, but its reviewer stays');
assert.equal((await upd(TECH, r1.id, `summary = 'tarde'`)).length, 0, 'the requester can no longer edit an approved request');

// Reject with a note (reviewer name from the profile when none is sent).
rows = await upd(RICARDO, r4.id, `status = 'rejected', review_note = 'Las vacaciones ya están autorizadas por RH'`);
assert.deepEqual([rows[0].status, rows[0].reviewed_by, rows[0].reviewed_by_name, rows[0].review_note],
  ['rejected', RICARDO, 'Ricardo Montañez', 'Las vacaciones ya están autorizadas por RH'], 'Ricardo rejects with a note');
assert.ok(rows[0].reviewed_at);

// Failed → retry (pending) → approved; insert requests get the created ticket.
rows = await upd(SOFIA, r3.id, `status = 'failed', applied_result = '{"error": "conflicto de versión"}'`);
assert.deepEqual([rows[0].status, rows[0].reviewed_by, rows[0].applied_result], ['failed', SOFIA, { error: 'conflicto de versión' }], 'marked failed');
const failedAt = rows[0].reviewed_at;
rows = await upd(SOFIA, r3.id, `status = 'pending', reviewed_by = null, reviewed_at = null`);
assert.deepEqual([rows[0].status, rows[0].reviewed_by, rows[0].reviewed_at], ['pending', SOFIA, failedAt], 'failed → pending to retry; last reviewer kept');
assert.equal((await upd(TECH, r3.id, `summary = 'Nueva instalación (corrigiendo)'`)).length, 1, 'the requester may edit it again while pending');
rows = await upd(SOFIA, r3.id, `status = 'approved', ticket_id = $2, applied_result = $3::jsonb`, [T2, JSON.stringify({ created: T2 })]);
assert.deepEqual([rows[0].status, rows[0].ticket_id, rows[0].reviewed_by_name], ['approved', T2, 'Sofia Ceballos'], 'approved on retry; ticket_id set by the approver');
assert.ok(rows[0].reviewed_at > failedAt, 'a new review time');

// Approver cancels a pending request.
rows = await upd(SOFIA, rTech2.id, `status = 'cancelled'`);
assert.deepEqual([rows[0].status, rows[0].reviewed_by], ['cancelled', SOFIA], 'approver cancels; reviewer stamped');

// Status transitions outside the contract raise.
for (const [id, from, to] of [[r1.id, 'approved', 'pending'], [r1.id, 'approved', 'rejected'], [r1.id, 'approved', 'failed'], [r4.id, 'rejected', 'approved'],
  [r4.id, 'rejected', 'pending'], [r2.id, 'cancelled', 'pending'], [rTech2.id, 'cancelled', 'approved'], [rOtra.id, 'pending', 'bogus']]) {
  await assert.rejects(upd(SOFIA, id, `status = '${to}'`), err => err.code === '23514' && /no permitido/.test(err.message), `${from} → ${to} rejected`);
}
await assert.rejects(upd(null, r1.id, `status = 'pending'`), /no permitido/, 'the transition rules hold without a JWT too');

// requested_by / requested_at / kind (and id) are immutable for approvers too.
const r1now = await get(r1.id);
rows = await upd(SOFIA, r1.id, `requested_by = $2, requested_by_name = 'Sofia', requested_at = '${OLD}', kind = 'insert', id = $3`, [SOFIA, T1]);
assert.deepEqual(rows[0], r1now, 'approver cannot rewrite requester, request time, kind or id (and nothing changed → updated_at kept)');
rows = await upd(null, r1.id, `requested_by = $2, kind = 'delete'`, [OTRA]);
assert.deepEqual([rows[0].requested_by, rows[0].kind], [TECH, 'update'], 'nor can a JWT-less writer');

// Without a JWT the system reviews like an approver; reviewed_by keeps what it sent.
rows = await upd(null, sys.id, `status = 'rejected', reviewed_by = $2`, [RICARDO]);
assert.deepEqual([rows[0].status, rows[0].reviewed_by, rows[0].reviewed_by_name], ['rejected', RICARDO, 'Ricardo Montañez']);

// --- Clients, anon, deletes --------------------------------------------------------------------------------
assert.deepEqual(await visible(CLIENT), [], 'clients see nothing');
assert.deepEqual(await visible(GHOST), [], 'a JWT without a profile sees nothing');
await as(CLIENT);
assert.equal((await q(`update planning_change_requests set summary = 'x' returning id`)).length, 0, 'clients update nothing');
await as('anon');
await assert.rejects(q('select * from planning_change_requests'), /permission denied/, 'anon has no grant');
await as('anon');
await assert.rejects(q(`update planning_change_requests set summary = 'x'`), /permission denied/);
for (const user of [SOFIA, TECH]) {
  await as(user);
  await assert.rejects(q(`delete from planning_change_requests where id = $1`, [r1.id]), /permission denied/, 'no one deletes requests');
}

// --- Constraints --------------------------------------------------------------------------------------------
for (const [bad, why] of [
  [{ kind: 'edit' }, 'unknown kind'], [{ kind: 'UPDATE' }, 'kinds are lower case'],
  [{ summary: '' }, 'empty summary'], [{ summary: '   ' }, 'blank summary'], [{ summary: 'x'.repeat(2001) }, 'summary over 2000'],
]) await assert.rejects(file(TECH, bad), /check constraint/, why);
assert.equal((await file(TECH, { summary: 'y'.repeat(2000) })).summary.length, 2000, '2000 characters is the limit, still accepted');
for (const col of ['kind', 'summary', 'payload']) await assert.rejects(file(TECH, { [col]: null }), /not-null|null value/, `${col} required`);
await as(null);
await db.exec(`set session_replication_role = replica`);
await assert.rejects(q(`update planning_change_requests set status = 'bogus' where id = $1`, [r1.id]), /check constraint/, 'status check (trigger bypassed)');
await assert.rejects(q(`update planning_change_requests set status = null where id = $1`, [r1.id]), /not-null|null value/, 'status required');
await db.exec(`set session_replication_role = origin`);

// --- Catalog --------------------------------------------------------------------------------------------------
await as(null);
assert.deepEqual((await q(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename like 'planning_%' order by 1`)).map(row => row.tablename),
  ['planning_change_requests'], 'requests published once to Realtime');
assert.deepEqual((await q(`select tgname from pg_trigger where tgrelid = 'planning_change_requests'::regclass and not tgisinternal`)).map(row => row.tgname),
  ['planning_change_requests_guard']);
assert.deepEqual((await q(`select tablename || '.' || policyname || ':' || cmd as p from pg_policies where tablename like 'planning_%' order by 1`)).map(row => row.p),
  ['planning_approvers.planning_approvers_read:SELECT', 'planning_change_requests.planning_change_requests_insert:INSERT',
   'planning_change_requests.planning_change_requests_read:SELECT', 'planning_change_requests.planning_change_requests_update:UPDATE']);
const indexes = (await q(`select indexdef from pg_indexes where tablename = 'planning_change_requests'`)).map(row => row.indexdef.replace(/^.* USING btree /, ''));
assert.deepEqual(indexes.sort(), ['(id)', '(requested_by, status)', '(status, requested_at DESC)', '(ticket_id)'], 'indexes');
const privileges = async table => (await q(`select role, privilege, has_table_privilege(role, $1, privilege) as ok
  from unnest(array['anon', 'authenticated', 'public']) role, unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) privilege`, [table]))
  .filter(row => row.ok).map(row => `${row.role}:${row.privilege}`);
assert.deepEqual(await privileges('public.planning_change_requests'), ['authenticated:select', 'authenticated:insert', 'authenticated:update'], 'request grants');
assert.deepEqual(await privileges('public.planning_approvers'), ['authenticated:select'], 'approver grants');
const execute = async (role, fn) => (await q(`select has_function_privilege($1, $2, 'execute') as ok`, [role, fn]))[0].ok;
assert.deepEqual([await execute('authenticated', 'public.is_planning_approver()'), await execute('anon', 'public.is_planning_approver()'),
  await execute('public', 'public.is_planning_approver()')], [true, false, false], 'is_planning_approver: authenticated only');
assert.deepEqual([await execute('authenticated', 'public.planning_change_requests_guard()'), await execute('anon', 'public.planning_change_requests_guard()')],
  [false, false], 'trigger function not executable by API roles');

// --- on delete cascade ------------------------------------------------------------------------------------------
await q('delete from profiles where id = $1', [RICARDO]);
assert.deepEqual(await approvers(), [SEEDED[1]], 'a deleted profile leaves the approvers');
assert.equal((await get(r4.id)).reviewed_by, RICARDO, 'requests keep the reviewer id (no FK)');

await as(null);
await db.close();
console.log('PASS: planning change requests — approver seed (exact unique names, Sofia notify / Ricardo silent, idempotent, never overwrites, '
  + 'missing/ambiguous skipped), is_planning_approver per user, insert forced pending as the JWT user, requester edits payload/summary/target/base '
  + 'version and cancels only (status raise 42501, protected columns reset), approvers see all and approve/reject/fail/retry with reviewer stamped, '
  + 'transition rules (23514), immutable requester/kind/requested_at, RLS (others/clients/anon nothing, no deletes), constraints, grants, indexes, '
  + 'Realtime publication, on delete cascade');
