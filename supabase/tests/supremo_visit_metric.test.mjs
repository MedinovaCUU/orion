// Run: PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node supabase/tests/supremo_visit_metric.test.mjs
// Loads the ticket and KPI migrations plus 20261013020000 on embedded PostgreSQL and checks the
// "Supremo en visitas presenciales" metric: frozen outcome at the visit deadline, previous installs,
// written exemptions (and revocation), equipment history, staff capture from the visit and the switch.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const migration = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const id = (prefix, n) => `${prefix}0000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const P = { admin: id('a', 1), q1: id('a', 2), q2: id('a', 3), e1: id('a', 4), e2: id('a', 5) };
const T = n => id('1', n);
const as = async who => db.exec(`reset role; set test.uid = '${who ? P[who] : ''}'`);
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];


await db.exec(`
create role authenticated; create role anon; create role service_role; create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create type user_role as enum ('admin','tecnico','cliente');
create table profiles(id uuid primary key, rol user_role, nombre_completo text, employee_type text);
create function is_staff() returns boolean language sql as $$ select exists(select 1 from profiles where id = auth.uid() and rol in ('admin','tecnico')) $$;
create function is_admin() returns boolean language sql as $$ select exists(select 1 from profiles where id = auth.uid() and rol = 'admin') $$;
create table user_module_permissions(user_id uuid, modules text[], sub_permissions jsonb, can_receive_tickets boolean default true);
create type ticket_status as enum ('abierto','en_progreso','pendiente_piezas','en_observacion','cerrado');
create table tickets(id uuid primary key default gen_random_uuid(), user_id uuid, asunto text, descripcion text,
 estado ticket_status default 'abierto', creado_en timestamptz default now(), actualizado_en timestamptz, numero_caso text,
 numero_serie_equipo text, nombre_cliente_guest text, telefono_cliente_guest text);
create table ticket_bitacora(id uuid primary key default gen_random_uuid(), ticket_id uuid, numero_serie_equipo text, tipo text, detalle text,
 estado_resultante ticket_status, visible_cliente boolean, creado_por uuid, creado_en timestamptz default now());
create function sync_log() returns trigger language plpgsql as $$ begin update tickets set estado = coalesce(new.estado_resultante, estado) where id = new.ticket_id; return new; end $$;
create trigger sync_log after insert on ticket_bitacora for each row execute function sync_log();
create function normalize_equipment_serial(value text) returns text language sql immutable as $$ select nullif(upper(regexp_replace(coalesce(value, ''), '\\s+', '', 'g')), '') $$;
create table clientes(id serial primary key, razon_social text);
create table equipos(id text primary key, numero_serie text, modelo text, cliente_id integer, estado text, ciudad text, municipio text,
 direccion text, fecha_fin date, actualizado_en timestamptz);
create table servicios_historial(id uuid primary key default gen_random_uuid(), ticket_id uuid, id_legacy integer, no_serie text, cda text, cds text,
 motivo text, tecnico_id uuid, fecha_servicio date default current_date, creado_en timestamptz default now());
create table servicios(ticket_id uuid);
create table refacciones_catalogo(codigo_refaccion text primary key, equipo text, nombre text, descripcion text);
create table servicios_refacciones(id uuid primary key default gen_random_uuid(), servicio_id uuid, codigo_refaccion text, cantidad integer);
create table catalogo_servicio(catalog_kind text, catalog_code text, category_code text, catalog_type text, catalog_detail text);
create type service_report_type as enum ('servicio','remoto');
create type service_report_status as enum ('borrador','registrado','requiere_visita');
create table service_reports(id uuid primary key default gen_random_uuid(), report_type service_report_type, status service_report_status,
 engineer_id uuid, engineer_name text, service_ticket_id uuid, service_type text, subject text, comments text, call_date date, service_date date,
 started_at time, ended_at time, equipment_serial text, diagnostic_code text, solution_code text, external_source text,
 report_reference text, external_document_number text, created_at timestamptz default now());
create table service_report_materials(id uuid primary key default gen_random_uuid(), service_report_id uuid, material_kind text, quantity integer,
 product_name text, reference_code text, catalog_code text, price_mxn numeric(12,2));
create table sap_service_reports(id uuid primary key default gen_random_uuid(), service_report_id uuid, report_number text, service_kind text,
 description text, start_date date, end_date date, equipment_serial text, technician_name text, total_duration_minutes integer default 0,
 first_imported_at timestamptz default now());
create function try_parse_planning_metadata(p_description text) returns jsonb language plpgsql immutable as $$
declare v_marker constant text := '[METADATA_PLANEACION]'; v_position integer;
begin v_position := position(v_marker in coalesce(p_description, '')); if v_position = 0 then return '{}'::jsonb; end if;
 return substring(p_description from v_position + char_length(v_marker))::jsonb;
exception when others then return '{}'::jsonb; end; $$;
create function try_parse_iso_date(p_value text) returns date language plpgsql immutable as $$
begin if coalesce(p_value, '') !~ '^\\d{4}-\\d{2}-\\d{2}$' then return null; end if; return p_value::date; exception when others then return null; end; $$;
grant usage on schema public, auth to authenticated;
grant select on profiles to authenticated;
`);
for (const name of ['20260924010000_ticket_service_metrics.sql', '20260924020000_ticket_closure_control.sql', '20260924030000_ticket_control_admin_and_assignments.sql',
  '20260924040000_ticket_routing_and_access.sql', '20260924041000_ticket_history_access.sql', '20261001010000_ticket_satisfaction.sql',
  '20261001020000_ticket_satisfaction_test_invitations.sql', '20261009010000_ticket_visibility_boundary.sql', '20261011020000_service_staff_kpis.sql',
  '20261011030000_service_staff_kpis_performance.sql', '20261012010000_servicios_historial_detalle_biosisa.sql',
  '20261012020000_kpi_tickets_historicos_biosisa.sql', '20261012030000_kpi_rendimiento_historicos.sql',
  '20261012040000_kpi_tickets_biosisa_evaluados.sql', '20261012050000_ticket_service_links.sql']) {
  await db.exec(await migration(name));
}
// Supremo already registered before the metric existed: it must enter the history as a previous state.
await db.exec(`
insert into clientes(id, razon_social) values (1,'Hospital Norte'),(2,'Clínica Sur');
insert into equipos(id, numero_serie, modelo, cliente_id) values
 ('EQ-A','SER-A','BA400',1),('EQ-B','SER-B','A15',1),('EQ-C','SER-C','BA200',2),('EQ-D','SER-D','BA200',2),
 ('EQ-E','SER-E','BA400',2),('EQ-F','SER-F','A25',1),('EQ-G','SER-G','BA400',1);
alter table equipos add column if not exists supremo_id text, add column if not exists supremo_alias text,
 add column if not exists supremo_enabled boolean not null default false;
update equipos set supremo_id = '958 113 330', supremo_enabled = true where id = 'EQ-A';
update equipos set supremo_id = '12345', supremo_enabled = true where id = 'EQ-D';
update equipos set supremo_id = '909548874', supremo_enabled = false where id = 'EQ-E';
`);
await db.exec(await migration('20261013020000_supremo_visit_metric.sql'));
const initial = (await db.query("select serial_key, valid, source, changed_at::text as at from equipment_supremo_history order by serial_key")).rows;
assert.deepEqual(initial.map(row => [row.serial_key, row.valid, row.source, row.at]),
  [['SER-A', true, 'estado_inicial', '-infinity'], ['SER-D', false, 'estado_inicial', '-infinity'], ['SER-E', false, 'estado_inicial', '-infinity']]);
console.log('PASS: migration applies on the KPI migrations and seeds the current Supremo registry as a previous state');

// ── Scenario (January 2026, America/Chihuahua = UTC-6; grace 3 days) ─────────────────────────
await db.exec(`
insert into profiles values
 ('${P.admin}','admin','Dirección de Servicio',null),('${P.q1}','tecnico','Ivonne Jaramillo','Quimico'),
 ('${P.e1}','tecnico','Alfredo Acevedo','Ingeniero'),('${P.e2}','tecnico','Diego Garcia','Ingeniero');
update supremo_metric_settings set effective_from = '2026-01-01', history_since = '2025-12-01T12:00:00Z';
`);
// Changes the equipment through the trigger, then dates the history row as if it happened at `at`.
const supremoAt = async (equipment, values, at, who = 'e1') => {
  await as(who);
  await db.query(`update equipos set supremo_id = $2, supremo_enabled = $3 where id = $1`, [equipment, values.id, values.enabled]);
  await db.exec('reset role');
  await db.query('update equipment_supremo_history set changed_at = $1 where id = (select max(id) from equipment_supremo_history)', [at]);
};
const hist = (n, serial, date, tech, motivo = 'MANTTO CORRECTIVO') => db.query(
  `insert into servicios_historial(id, no_serie, motivo, tecnico_id, fecha_servicio) values ($1,$2,$3,$4,$5)`, [id('3', n), serial, motivo, tech, date]);
await hist(1, 'SER-A', '2026-01-08', P.e1);                       // already registered → positive
await hist(2, 'SER-B', '2026-01-12', P.e2);                       // registered on the 14th → positive (in time)
await db.exec(`insert into tickets(id, asunto, estado, creado_en, numero_caso, numero_serie_equipo) values ('${T(1)}','[Soporte Ingeniero] Falla','abierto','2026-01-12T16:00:00Z','OR-0001','SER-B');
 insert into ticket_bitacora(ticket_id, numero_serie_equipo, tipo, detalle, visible_cliente, creado_por, creado_en) values
 ('${T(1)}','SER-B','visita','Misma visita del día 12',false,'${P.e2}','2026-01-12T20:00:00Z'),
 ('${T(1)}','SER-B','visita','Segunda visita',false,'${P.e1}','2026-01-13T18:00:00Z');`);
await supremoAt('EQ-B', { id: '832001973', enabled: true }, '2026-01-14T18:00:00Z');
await hist(3, 'SER-C', '2026-01-05', P.e2);                       // never in time → negative
await hist(4, 'SER-C', '2026-01-12', P.e2);                       // registered 1 h after its deadline → negative
await supremoAt('EQ-C', { id: '792529172', enabled: true }, '2026-01-16T07:00:00Z');
await hist(5, 'SER-C', '2026-01-22', P.q1, 'CAPACITACION');       // after someone else installed it → positive
await hist(6, 'SER-D', '2026-01-09', P.e1);                       // invalid ID
await hist(7, 'SER-D', '2026-01-10', P.e1);
await hist(8, 'SER-E', '2026-01-15', P.e2);                       // ID captured but disabled
await hist(9, 'SER-X', '2026-01-16', P.e2);                       // not in the equipment catalog
await hist(10, null, '2026-01-17', P.e1);                         // no serial
await db.exec(`
insert into service_reports(id, report_type, status, engineer_id, service_type, equipment_serial, service_date) values
 ('${id('4', 1)}','servicio','registrado','${P.e1}','preventivo','SER-G','2026-01-20'),
 ('${id('4', 2)}','servicio','borrador','${P.e1}','preventivo','SER-G','2026-01-21'),
 ('${id('4', 3)}','remoto','registrado','${P.e1}','otro','SER-G',null);
update service_reports set call_date = '2026-01-23' where id = '${id('4', 3)}';
insert into servicios_historial(id, no_serie, motivo, tecnico_id, fecha_servicio)
 values ('${id('3', 11)}','SER-F','MANTTO CORRECTIVO','${P.e1}',(now() at time zone 'America/Chihuahua')::date);
`);

const TO = (await one("select (now() at time zone 'America/Chihuahua')::date::text as d")).d;
const ALL = { from: '2026-01-01', to: TO };
const metric = async (filters = ALL) => { await as('admin'); return (await one('select get_supremo_metric($1) as m', [filters])).m; };
const bySerial = m => Object.fromEntries(m.visits.map(v => [`${v.serial ?? 'sin serie'}|${v.visit_date}`, [v.outcome, v.reason]]));

// ── Access ─────────────────────────────────────────────────────────────────────────────────
await as('q1');
await assert.rejects(db.query('select get_supremo_metric($1)', [ALL]), /exclusiva para administradores/);
await assert.rejects(db.query("select justify_supremo_exemption('SER-D', 'El laboratorio no permite software remoto')"), /Solo administración/);
await assert.rejects(db.query('select set_supremo_metric_settings(false, current_date, 3, $1)', ['Prohibida por la dirección']), /Solo administración/);
await db.exec('set role authenticated');
await assert.rejects(db.query("select * from supremo_metric_visit_rows('{}')"), /permission denied/);
await assert.rejects(db.query('select * from supremo_metric_exemptions'), /permission denied|row-level security/i);
await assert.rejects(db.query("update equipment_supremo_history set valid = true"), /permission denied/);
console.log('PASS: admin-only metric and settings, internal rows and history not reachable from the client');

// ── Outcomes ────────────────────────────────────────────────────────────────────────────────
let m = await metric();
let visits = bySerial(m);
assert.deepEqual(visits['SER-A|2026-01-08'], ['positiva', 'ya_registrado']);
assert.deepEqual(visits['SER-B|2026-01-12'], ['positiva', 'registrado_en_plazo'], 'history + bitácora on the same day are one visit');
assert.deepEqual(visits['SER-B|2026-01-13'], ['positiva', 'registrado_en_plazo']);
assert.deepEqual(visits['SER-C|2026-01-05'], ['negativa', 'sin_registro']);
assert.deepEqual(visits['SER-C|2026-01-12'], ['negativa', 'sin_registro'], 'a registration after the deadline does not rewrite the visit');
assert.deepEqual(visits['SER-C|2026-01-22'], ['positiva', 'ya_registrado'], 'someone installed it before → positive');
assert.deepEqual(visits['SER-D|2026-01-09'], ['negativa', 'id_invalido']);
assert.deepEqual(visits['SER-E|2026-01-15'], ['negativa', 'deshabilitado']);
assert.deepEqual(visits['SER-X|2026-01-16'], ['negativa', 'fuera_de_catalogo']);
assert.deepEqual(visits['sin serie|2026-01-17'], ['sin_serie', 'sin_serie']);
assert.deepEqual(visits['SER-G|2026-01-20'], ['negativa', 'sin_registro'], 'in-person Orion report counts; draft and remote do not');
assert.equal(Object.keys(visits).filter(key => key.startsWith('SER-G')).length, 1);
assert.deepEqual(visits[`SER-F|${TO}`], ['pendiente', 'sin_registro'], 'deadline still open');
assert.equal(m.visits.find(v => v.serial === 'SER-B').supremo_id, '832001973');
assert.equal(m.visits.find(v => v.serial === 'SER-B' && v.visit_date === '2026-01-12').deadline, '2026-01-15');
assert.deepEqual(m.totals, { visits: 13, positive: 4, already: 2, installed: 2, negative: 7, pending: 1, voided: 0, no_serial: 1 });
assert.deepEqual(m.compliance, { num: 4, den: 11, pct: 36.4 }, 'pending and no-serial visits are outside the denominator');
assert.deepEqual(m.visits.slice(0, 7).map(v => v.outcome), Array(7).fill('negativa'), 'negatives first so they are never cut off');
const people = Object.fromEntries(m.people.map(p => [p.name, [p.positive, p.negative, p.pending, p.voided]]));
assert.deepEqual(people, { 'Alfredo Acevedo': [2, 3, 1, 0], 'Diego Garcia': [1, 4, 0, 0], 'Ivonne Jaramillo': [1, 0, 0, 0] });
console.log('PASS: previous install, registration within/after the deadline, invalid/disabled/uncatalogued, no serial, pending, sources and per person');

const chem = await metric({ ...ALL, team: 'quimica' });
assert.deepEqual([chem.totals.visits, chem.people.map(p => p.name)], [1, ['Ivonne Jaramillo']]);
const diego = await metric({ ...ALL, team: 'ingenieria', person: P.e2 });
assert.deepEqual([diego.totals.visits, diego.people.map(p => p.name)], [5, ['Diego Garcia']]);
const jan = await metric({ from: '2026-01-01', to: '2026-01-10' });
assert.equal(jan.totals.visits, 4, 'period filter');
await db.exec("update supremo_metric_settings set effective_from = '2026-01-12'");
assert.equal((await metric()).totals.visits, 9, 'visits before the effective date do not count');
await db.exec("update supremo_metric_settings set effective_from = '2026-01-01'");
console.log('PASS: same team, person, period filters as the control center and the effective date');

// ── Written exemption, revocation ───────────────────────────────────────────────────────────
await as('admin');
await assert.rejects(db.query("select justify_supremo_exemption('SER-D', 'No aplica')"), /al menos 20 caracteres/);
const exemption = (await one("select justify_supremo_exemption(' ser-d ', 'El hospital prohíbe software de acceso remoto en la red del laboratorio') as id")).id;
await assert.rejects(db.query("select justify_supremo_exemption('SER-D', 'Segunda justificación para el mismo equipo')"), /ya tiene una justificación vigente/);
m = await metric(); visits = bySerial(m);
assert.deepEqual([visits['SER-D|2026-01-09'][0], visits['SER-D|2026-01-10'][0]], ['anulada', 'anulada']);
assert.deepEqual([m.totals.voided, m.totals.negative, m.compliance.den], [2, 5, 9], 'voided visits are neither positive nor negative');
assert.match(m.visits.find(v => v.serial === 'SER-D').exemption_justification, /prohíbe software/);
assert.equal(m.visits.find(v => v.serial === 'SER-D').exemption_by, 'Dirección de Servicio');
await assert.rejects(db.query('select revoke_supremo_exemption($1, $2)', [exemption, '']), /motivo de la revocación/);
await db.query('select revoke_supremo_exemption($1, $2)', [exemption, 'El hospital ya autorizó Supremo']);
await db.exec(`reset role; update supremo_metric_exemptions set revoked_at = '2026-01-09T20:00:00Z' where id = '${exemption}'`);
m = await metric(); visits = bySerial(m);
assert.deepEqual([visits['SER-D|2026-01-09'][0], visits['SER-D|2026-01-10'][0]], ['anulada', 'negativa'], 'revocation keeps earlier visits voided');
await as('admin');
const list = (await one('select get_supremo_exemptions() as l')).l;
assert.deepEqual([list.length, list[0].serial, list[0].model, list[0].revoke_reason], [1, 'ser-d', 'BA200', 'El hospital ya autorizó Supremo']);
await db.query("select justify_supremo_exemption('SER-D', 'Nueva justificación: el cliente retiró la computadora')");
console.log('PASS: written exemption voids the equipment, one active per serial, revocation keeps the past and is listed');

// ── Equipment history: serial change and deletion ───────────────────────────────────────────
await supremoAt('EQ-G', { id: '834001902', enabled: true }, '2026-01-25T18:00:00Z');
await as('e1'); await db.exec("update equipos set numero_serie = 'SER-H' where id = 'EQ-G'; delete from equipos where id = 'EQ-G';"); await db.exec('reset role');
const moves = (await db.query("select serial_key, valid, source from equipment_supremo_history where equipment_id = 'EQ-G' order by id")).rows;
assert.deepEqual(moves.map(row => [row.serial_key, row.valid, row.source]),
  [['SER-G', true, 'cambio'], ['SER-G', false, 'cambio_serie'], ['SER-H', true, 'cambio'], ['SER-H', false, 'baja_equipo']]);
assert.equal((await one(`select changed_by from equipment_supremo_history where equipment_id = 'EQ-G' and source = 'baja_equipo'`)).changed_by, P.e1);
console.log('PASS: Supremo history follows serial changes and deletions with the acting user');

// ── Capture from the visit (staff) ──────────────────────────────────────────────────────────
await as('e1');
let status = (await one("select get_equipment_supremo_status('ser-f') as s")).s;
assert.deepEqual([status.active, status.in_catalog, status.registered, status.exempt, status.grace_days], [true, true, false, false, 3]);
await assert.rejects(db.query("select register_equipment_supremo('SER-F', '12 34')"), /9 dígitos/);
await assert.rejects(db.query("select register_equipment_supremo('SER-Z', '123456789')"), /no está en el catálogo/);
await assert.rejects(db.query("select register_equipment_supremo('SER-A', '123456789')"), /cámbialo desde Equipos/);
status = (await one("select register_equipment_supremo('SER-F', '831 055 847') as s")).s;
assert.deepEqual([status.registered, status.supremo_id], [true, '831055847']);
assert.equal((await one("select changed_by from equipment_supremo_history where serial_key = 'SER-F' order by id desc limit 1")).changed_by, P.e1);
assert.deepEqual(bySerial(await metric())[`SER-F|${TO}`], ['positiva', 'registrado_en_plazo'], 'the pending visit turns positive');
await db.exec('reset role; set test.uid = \'\'; set role anon');
await assert.rejects(db.query("select get_equipment_supremo_status('SER-F')"), /permission denied/);
console.log('PASS: staff see the equipment status and register a valid Supremo from the visit; clients cannot');

// ── Switch ──────────────────────────────────────────────────────────────────────────────────
await as('admin');
await assert.rejects(db.query("select set_supremo_metric_settings(false, '2026-01-01', 3, 'no')"), /motivo para desactivar/);
await assert.rejects(db.query("select set_supremo_metric_settings(true, '2025-11-30', 3, null)"), /no puede iniciar antes/);
await assert.rejects(db.query("select set_supremo_metric_settings(true, '2026-01-01', 31, null)"), /entre 0 y 30/);
const before = (await metric()).totals;
const off = (await one("select set_supremo_metric_settings(false, '2026-01-01', 3, 'Dirección pidió suspender el indicador') as s")).s;
assert.deepEqual([off.active, off.reason, off.updated_by_name], [false, 'Dirección pidió suspender el indicador', 'Dirección de Servicio']);
const hidden = await metric();
assert.deepEqual(Object.keys(hidden), ['settings'], 'nothing but the switch state is returned while it is off');
await as('e1');
assert.deepEqual((await one("select get_equipment_supremo_status('SER-C') as s")).s, { active: false });
await supremoAt('EQ-C', { id: '792529172', enabled: false }, '2026-02-01T18:00:00Z');
assert.equal((await one("select count(*)::int as n from equipment_supremo_history where serial_key = 'SER-C'")).n, 2, 'history keeps recording while off');
await as('admin');
const on = (await one("select set_supremo_metric_settings(true, '2026-01-01', 3, null) as s")).s;
assert.deepEqual([on.active, on.reason], [true, null]);
assert.deepEqual((await metric()).totals, before, 'reactivating restores the same results');
console.log('PASS: the switch hides the metric everywhere with a written reason, keeps the data and restores it');
