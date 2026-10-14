// Run: PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node supabase/tests/reliability_intelligence.test.mjs
// Loads 20261013170000_reliability_intelligence.sql on embedded PostgreSQL over a minimal Orion schema and checks
// permissions (admin vs technician vs anon), the authorization guard, evidence/spec checks, the single-document cost
// rule, author stamping and the immutable audit trail, plus the lab read RPC.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const id = (prefix, n) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const P = { admin: id('a', 1), tech: id('a', 2), client: id('a', 3) };
const as = async who => db.exec(`reset role; set test.uid = '${who ? P[who] : ''}'; set role ${who ? 'authenticated' : 'anon'}`);
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const fails = async (sql, pattern, label) => { await assert.rejects(db.query(sql), error => pattern.test(error.message), label); };

await db.exec(`
create role authenticated; create role anon; create role service_role; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema public, auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
create type user_role as enum ('admin','tecnico','cliente');
create table profiles(id uuid primary key, rol user_role, nombre_completo text);
create function is_admin() returns boolean language sql stable security definer set search_path = public as $$ select exists(select 1 from profiles where id = auth.uid() and rol = 'admin') $$;
create function is_staff() returns boolean language sql stable security definer set search_path = public as $$ select exists(select 1 from profiles where id = auth.uid() and rol in ('admin','tecnico')) $$;
create function normalize_equipment_serial(value text) returns text language sql immutable as $$ select nullif(upper(regexp_replace(coalesce(value, ''), '\\s+', '', 'g')), '') $$;
create function service_history_kind(p_type text, p_reason text) returns text language sql immutable as $$
 select coalesce(p_type, case upper(btrim(coalesce(p_reason,''))) when 'REACONDICIONAMIENTO' then 'reacondicionamiento' when 'MANTTO CORRECTIVO' then 'correctivo' when 'INSTALACION' then 'instalacion' else 'sin_clasificar' end) $$;
create function service_report_kind(p_type text) returns text language sql immutable as $$ select case lower(coalesce(p_type,'')) when 'correctivo' then 'correctivo' when '' then 'sin_clasificar' else 'otro' end $$;
create function ticket_is_planning(p_description text) returns boolean language sql immutable as $$ select position('[METADATA_PLANEACION]' in coalesce(p_description, '')) > 0 $$;
create table clientes(id serial primary key, razon_social text);
create table equipos(id text primary key, numero_serie text, modelo text, cliente_id integer, fecha_inicio date, fecha_fin date, termino_garantia date);
create table tickets(id uuid primary key default gen_random_uuid(), asunto text, descripcion text, estado text default 'abierto', creado_en timestamptz default now(), numero_caso text, numero_serie_equipo text);
create table ticket_service_events(id uuid primary key default gen_random_uuid(), ticket_id uuid, kind text, occurred_at timestamptz);
create table servicios_historial(id uuid primary key default gen_random_uuid(), ticket_id uuid, id_legacy integer, no_serie text, motivo text, tecnico_id uuid, fecha_servicio date,
 tipo_servicio text, origen text, fecha_fin date, duracion_min integer, detalle_averia text, detalle_solucion text, diagnostico text, trabajo_realizado text, datos_origen jsonb);
create table servicios_refacciones(id uuid primary key default gen_random_uuid(), servicio_id uuid, codigo_refaccion text, cantidad integer);
create table refacciones_catalogo(codigo_refaccion text, nombre text, desc_breve text, descripcion text);
create type service_report_type as enum ('servicio','remoto'); create type service_report_status as enum ('borrador','registrado');
create table service_reports(id uuid primary key default gen_random_uuid(), report_type service_report_type, status service_report_status, service_type text, service_date date, created_at timestamptz default now(),
 report_reference text, external_document_number text, equipment_serial text, equipment_name text, client_name text, started_at time, ended_at time, service_ticket_id uuid, diagnostic_label text, comments text, solution text);
create table service_report_materials(id uuid primary key default gen_random_uuid(), service_report_id uuid, material_kind text, quantity integer, reference_code text, catalog_code text);
grant select on all tables in schema public to authenticated;
`);
await db.exec((await readFile(new URL('../migrations/20261013170000_reliability_intelligence.sql', import.meta.url), 'utf8')));

const H = { recon: id('b', 1), corr: id('b', 2), inst: id('b', 3) };
await db.exec(`
insert into profiles values ('${P.admin}','admin','Gerencia'), ('${P.tech}','tecnico','Ingeniero'), ('${P.client}','cliente','Cliente');
insert into clientes(razon_social) values ('Laboratorio A');
insert into equipos values ('EQ1','834000221','BA400',1,'2024-03-01',null,null);
insert into servicios_historial(id, id_legacy, no_serie, motivo, fecha_servicio, origen, trabajo_realizado, datos_origen) values
 ('${H.recon}', 10, '834000221', 'Reacondicionamiento', '2024-02-01', 'biosisa_servicio', 'Proceso incompleto', '{"modelo":"BA400","sector":"Particular"}'),
 ('${H.inst}', 11, '834000221', 'Instalacion', '2024-03-01', 'biosisa_servicio', null, '{"cliente_biosisa":"Laboratorio A"}'),
 ('${H.corr}', 12, '834000221', 'Mantto Correctivo', '2024-03-05', 'biosisa_servicio', 'Se cambia bomba', null),
 (gen_random_uuid(), 13, '834000221', 'Llamada', '2024-03-06', 'biosisa_llamada', null, null);
insert into servicios_refacciones(servicio_id, codigo_refaccion, cantidad) values ('${H.recon}', '5625', 1), ('${H.corr}', 'AC16581', 1);
insert into refacciones_catalogo values ('AC16581', 'Bomba KNF', null, null);
insert into tickets(id, asunto, numero_caso, numero_serie_equipo, creado_en) values ('${id('c', 1)}', 'Falla', 'BIO-1', '834000221', '2024-03-04'), ('${id('c', 2)}', '[PLAN] Preventivo', 'PL-1', '834000221', '2024-03-04');
update tickets set descripcion = 'x [METADATA_PLANEACION]{}' where numero_caso = 'PL-1';
insert into ticket_service_events(ticket_id, kind, occurred_at) values ('${id('c', 1)}', 'cierre', '2024-03-06');
`);

// Lab read: admin only; calls and planning tickets are not part of it; parts and catalog names travel with services.
await as('tech'); await fails('select get_reliability_lab()', /exclusivo para administradores/, 'technician cannot read the lab');
await as(null); await fails('select get_reliability_lab()', /permission denied|exclusivo/, 'anon cannot read the lab');
await as('admin');
const lab = (await one('select get_reliability_lab() as lab')).lab;
assert.equal(lab.services.length, 3, 'calls excluded');
assert.deepEqual(lab.services.find(s => s.kind === 'correctivo').parts, [['AC16581', 1]]);
assert.equal(lab.services.find(s => s.kind === 'reacondicionamiento').sector, 'particular');
assert.equal(lab.tickets.length, 1, 'planning tickets excluded'); assert.ok(lab.tickets[0].closed_at);
assert.equal(lab.catalog.AC16581, 'Bomba KNF'); assert.equal(lab.equipment[0].client, 'Laboratorio A');

// Episode: serial normalized by the server; author stamped from the session, never from the client payload.
await as('tech');
const episode = (await one(`insert into refurbishment_episodes(serial_key, serial_raw, platform, started_on, history_service_ids, created_by) values (' 834 000221 ', '834000221', 'BA400', '2024-02-01', array['${H.recon}']::uuid[], '${P.admin}') returning id, serial_key, created_by`));
assert.equal(episode.serial_key, '834000221'); assert.equal(episode.created_by, P.tech);
await fails(`insert into refurbishment_episodes(serial_key, started_on) values ('834000221', '2024-02-01')`, /duplicate key/, 'one episode per serial and start');

// Decisions: the engineer records condition and recommendation; only an admin authorizes, always with a reason to reject.
const decision = (await one(`insert into refurbishment_component_decisions(episode_id, component_code, component_name, condition, recommendation, estimated_cost_mxn) values ('${episode.id}', 'AC16581', 'Bomba', 'desgaste', 'sustituir', 8000) returning id, recommended_by, authorized_by`));
assert.equal(decision.recommended_by, P.tech); assert.equal(decision.authorized_by, null);
await fails(`update refurbishment_component_decisions set authorization_status = 'aprobada' where id = '${decision.id}'`, /Solo un administrador/, 'technician cannot authorize');
await fails(`insert into refurbishment_component_decisions(episode_id, component_name, authorization_status, authorization_reason) values ('${episode.id}', 'X', 'rechazada', 'presupuesto')`, /Solo un administrador/, 'nor pre-authorize on insert');
await db.exec(`update refurbishment_component_decisions set action_taken = 'conservado' where id = '${decision.id}'`);
await as('admin');
await fails(`update refurbishment_component_decisions set authorization_status = 'rechazada' where id = '${decision.id}'`, /check/, 'a rejection needs its reason');
await db.exec(`update refurbishment_component_decisions set authorization_status = 'rechazada', authorization_reason = 'presupuesto', authorized_by = '${P.tech}' where id = '${decision.id}'`);
const decided = await one(`select authorized_by, authorized_on, recommended_by, action_taken from refurbishment_component_decisions where id = '${decision.id}'`);
assert.equal(decided.authorized_by, P.admin, 'authorizer is the session user'); assert.ok(decided.authorized_on); assert.equal(decided.recommended_by, P.tech, 'recommendation author kept');
assert.equal(decided.action_taken, 'conservado');

// Acceptance tests: no invented tolerances.
await as('tech');
await fails(`insert into refurbishment_acceptance_tests(episode_id, criterion, result) values ('${episode.id}', 'Sistema fotométrico', 'aprobado')`, /check/, 'approval without spec');
await db.exec(`insert into refurbishment_acceptance_tests(episode_id, criterion, result) values ('${episode.id}', 'Sistema fotométrico', 'pendiente_definicion')`);
await db.exec(`insert into refurbishment_acceptance_tests(episode_id, criterion, specification, spec_source, result, measured_value) values ('${episode.id}', 'Repetibilidad', 'CV ≤ 1 %', 'Manual de servicio v3', 'aprobado', '0.6 %')`);

// Failure links: a causal claim needs written evidence; «no determinada» does not.
await fails(`insert into reliability_failure_links(episode_id, failure_service_id, decision_id, relation) values ('${episode.id}', '${H.corr}', '${decision.id}', 'mismo_componente')`, /check/, 'relation without evidence');
const link = await one(`insert into reliability_failure_links(episode_id, failure_service_id, decision_id, relation, evidence) values ('${episode.id}', '${H.corr}', '${decision.id}', 'mismo_componente', 'Bomba con desgaste reportado') returning assessed_by`);
assert.equal(link.assessed_by, P.tech);
await fails(`insert into reliability_failure_links(episode_id, relation) values ('${episode.id}', 'no_determinada')`, /check/, 'a link needs a failure');

// Costs: one document once per category; positive amounts only.
await db.exec(`insert into reliability_costs(serial_key, episode_id, service_id, phase, category, amount_mxn, nature, source_document, occurred_on) values ('834000221', '${episode.id}', '${H.corr}', 'correctivo', 'viaticos', 7500, 'comprobado', 'FAC-100', '2024-03-05')`);
await fails(`insert into reliability_costs(serial_key, phase, category, amount_mxn, nature, source_document, occurred_on) values ('834000221', 'correctivo', 'viaticos', 7500, 'comprobado', ' fac-100 ', '2024-03-05')`, /duplicate key/, 'same document twice');
await db.exec(`insert into reliability_costs(serial_key, phase, category, amount_mxn, nature, source_document, occurred_on) values ('834000221', 'correctivo', 'refacciones', 9000, 'estimado', 'FAC-100', '2024-03-05')`);
await fails(`insert into reliability_costs(serial_key, phase, category, amount_mxn, nature, occurred_on) values ('834000221', 'correctivo', 'refacciones', 0, 'estimado', '2024-03-05')`, /check/, 'zero amount');

// Deletes: technicians cannot erase evidence; admins can, and the trail keeps the old row. Evidence rows block deleting history.
const before = (await one(`select count(*)::int n from refurbishment_acceptance_tests`)).n;
await db.exec(`delete from refurbishment_acceptance_tests where criterion = 'Sistema fotométrico'`);
assert.equal((await one(`select count(*)::int n from refurbishment_acceptance_tests`)).n, before, 'RLS hides the delete from a technician');
await as('admin');
await db.exec(`delete from refurbishment_acceptance_tests where criterion = 'Sistema fotométrico'`);
assert.equal((await one(`select count(*)::int n from refurbishment_acceptance_tests`)).n, before - 1);
await db.exec('reset role');
await fails(`delete from servicios_historial where id = '${H.corr}'`, /foreign key|violates/, 'history referenced by evidence cannot vanish');

// Audit trail: every write logged with its real author; readable only by admins; never writable by clients.
await as('admin');
const trail = (await db.query(`select table_name, action, actor from reliability_audit_log order by id`)).rows;
assert.ok(trail.length >= 8);
assert.ok(trail.some(r => r.table_name === 'refurbishment_acceptance_tests' && r.action === 'delete' && r.actor === P.admin));
assert.ok(trail.some(r => r.table_name === 'refurbishment_component_decisions' && r.action === 'update' && r.actor === P.tech));
const history = (await one(`select get_reliability_audit(array['${decision.id}']::uuid[]) as h`)).h;
assert.ok(history.length >= 3 && history[0].actor);
await fails(`insert into reliability_audit_log(table_name, row_id, action) values ('x', '${episode.id}', 'insert')`, /permission denied/, 'no manual audit rows');
await fails(`delete from reliability_audit_log`, /permission denied/, 'audit cannot be erased');
await as('tech');
assert.equal((await one(`select count(*)::int n from reliability_audit_log`)).n, 0, 'technicians do not read the trail');
await fails(`select get_reliability_audit(array['${decision.id}']::uuid[])`, /exclusiva para administradores/);
await as('client');
assert.equal((await one(`select count(*)::int n from refurbishment_episodes`)).n, 0, 'clients see nothing');
await fails(`insert into refurbishment_episodes(serial_key, started_on) values ('X1', '2024-01-01')`, /row-level security/, 'clients cannot capture');

// The lab returns the captured rows with names for the UI.
await as('admin');
const full = (await one('select get_reliability_lab() as lab')).lab;
assert.equal(full.episodes.length, 1); assert.equal(full.decisions[0].recommended_by_name, 'Ingeniero'); assert.equal(full.decisions[0].authorized_by_name, 'Gerencia');
assert.equal(full.tests.length, 1); assert.equal(full.links[0].assessed_by_name, 'Ingeniero'); assert.equal(full.costs.length, 2);
console.log('reliability_intelligence: OK');
