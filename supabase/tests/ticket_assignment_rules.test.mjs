// Run: PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node supabase/tests/ticket_assignment_rules.test.mjs
// Loads the real ticket migrations plus 20261011040000 on embedded PostgreSQL and checks the owner's
// assignment rules on case creation: continuity → region → balanced load, within the case's area.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const migration = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const id = (prefix, n) => `${prefix}0000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const P = {
  admin: id('a', 1), e1: id('a', 2), e2: id('a', 3), e3: id('a', 4), e4: id('a', 5),
  q1: id('a', 6), q2: id('a', 7), q3: id('a', 8), o1: id('a', 9),
};
const name = Object.fromEntries(Object.entries(P).map(([k, v]) => [v, k]));
const T = n => id('1', n);

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
create table travel_requests(id uuid primary key default gen_random_uuid(), engineer_id uuid, workflow_status text,
 desired_departure_date date, desired_return_date date);
create function try_parse_planning_metadata(p_description text) returns jsonb language plpgsql immutable as $$
declare v_marker constant text := '[METADATA_PLANEACION]'; v_position integer;
begin v_position := position(v_marker in coalesce(p_description, '')); if v_position = 0 then return '{}'::jsonb; end if;
 return substring(p_description from v_position + char_length(v_marker))::jsonb;
exception when others then return '{}'::jsonb; end; $$;
create function try_parse_iso_date(p_value text) returns date language plpgsql immutable as $$
begin if coalesce(p_value, '') !~ '^\\d{4}-\\d{2}-\\d{2}$' then return null; end if; return p_value::date; exception when others then return null; end; $$;
grant usage on schema public, auth to authenticated;
grant select on profiles to authenticated;
insert into profiles values
 ('${P.admin}','admin','Dirección de Servicio',null),
 ('${P.e1}','tecnico','Alfredo Acevedo','Ingeniero'),
 ('${P.e2}','tecnico','Benjamin Martinez','Ingeniero'),
 ('${P.e3}','tecnico','Diego García García','Ingeniero'),
 ('${P.e4}','tecnico','Guillermo Martinez','Ingeniero'),
 ('${P.q1}','tecnico','Ivonne Jaramillo','Quimico'),
 ('${P.q2}','tecnico','Luis Ángel Pérez','Químico'),
 ('${P.q3}','tecnico','Olivia Angulo','Quimico'),
 ('${P.o1}','tecnico','Carlos Muniz','Operativo');
insert into user_module_permissions(user_id, modules, can_receive_tickets) select id, array['tickets'], id <> '${P.e4}' from profiles;
insert into clientes(id, razon_social) values (1,'Hospital Norte'),(2,'Falcon Laboratorios');
insert into equipos values
 ('EQ-A','SER-A','BA400',1,'Chihuahua','Chihuahua',null,'Av. Norte 1',null,now()),
 ('EQ-B','SER-B','A15',1,'Ciudad de México','Ciudad de México',null,'Reforma 10',null,now()),
 ('EQ-C','SER-C','BA200',1,'Jalisco','Guadalajara',null,'Sur 5',null,now()),
 ('EQ-F','SER-F','A15',2,'Puebla','Puebla',null,'Centro 2',null,now());
`);
for (const file of ['20260924010000_ticket_service_metrics.sql', '20260924020000_ticket_closure_control.sql', '20260924030000_ticket_control_admin_and_assignments.sql',
  '20260924040000_ticket_routing_and_access.sql', '20260924041000_ticket_history_access.sql', '20261001010000_ticket_satisfaction.sql',
  '20261001020000_ticket_satisfaction_test_invitations.sql', '20261009010000_ticket_visibility_boundary.sql', '20261011020000_service_staff_kpis.sql',
  '20261011030000_service_staff_kpis_performance.sql', '20261011040000_ticket_assignment_rules.sql']) {
  await db.exec(await migration(file));
}
console.log('PASS: migration applies on top of the ticket, routing, visibility and KPI migrations');
// Routing configuration is admin-only (validate_ticket_routing_rule): act as the administrator by default.
const asAdmin = () => db.exec(`reset role; set test.uid = '${P.admin}'`);
await asAdmin();

const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const gov = (await rows('select user_id from ticket_government_team order by user_id')).map(r => name[r.user_id]);
assert.deepEqual(gov, ['e2', 'q2'], 'Seed: Benjamín and Ángel only (Angulo is not Ángel; ineligible people never)');
assert.equal((await rows("select ticket_is_government('[Soporte Ingeniero] [FALCON] Falla', null, null) as g"))[0].g, true);
assert.equal((await rows("select ticket_is_government('Soporte Químico: Reporte', 'Canal: Genesis', null) as g"))[0].g, true);
assert.equal((await rows("select ticket_is_government('[Soporte Químico] QC', 'Sin canal', 'Falcon Laboratorios') as g"))[0].g, true);
assert.equal((await rows("select ticket_is_government('[Soporte Químico] QC', 'Laboratorio genesisx', 'Hospital') as g"))[0].g, false);
console.log('PASS: government team seed and government channel reading');

// ── Helpers ───────────────────────────────────────────────────────────────────────────────
let seq = 0;
const reset = () => db.exec(`truncate tickets cascade; truncate travel_requests; truncate ticket_staff_coverage; truncate ticket_equipment_owners;
 update user_module_permissions set can_receive_tickets = user_id <> '${P.e4}';`);
// Background cases are inserted with routing off, then assigned explicitly.
const quiet = async fn => { await db.exec('alter table tickets disable trigger route_new_support_ticket'); try { return await fn(); } finally { await db.exec('alter table tickets enable trigger route_new_support_ticket'); } };
const background = (who, { area = 'Ingeniero', serial = null, closedAt = null, created = '2026-09-01T16:00:00Z', subject = 'Caso previo' } = {}) => quiet(async () => {
  const n = ++seq;
  await db.query('insert into tickets(id, asunto, estado, creado_en, numero_serie_equipo) values ($1,$2,$3,$4,$5)',
    [T(n), `[Soporte ${area}] ${subject}`, closedAt ? 'cerrado' : 'abierto', created, serial]);
  await db.query('insert into ticket_assignments(ticket_id, assigned_to, source) values ($1,$2,$3)', [T(n), P[who], 'manual']);
  if (closedAt) await db.query("insert into ticket_service_events(ticket_id, kind, detail, occurred_at, closure_reason) values ($1,'cierre','Cierre verificable',$2,'solucionado')", [T(n), closedAt]);
  return T(n);
});
const load = async counts => { for (const [who, n] of Object.entries(counts)) for (let i = 0; i < n; i++) await background(who); };
// A new case goes through the real insert trigger, exactly like the intake.
const create = async (subject, { serial = null, description = 'Falla reportada: no enciende', reopens = null } = {}) => {
  const n = ++seq;
  await db.query('insert into tickets(id, asunto, descripcion, numero_serie_equipo, reabre_ticket_id) values ($1,$2,$3,$4,$5)', [T(n), subject, description, serial, reopens]);
  const [a] = await rows('select assigned_to, source from ticket_assignments where ticket_id = $1', [T(n)]);
  const [note] = await rows("select detalle from ticket_bitacora where ticket_id = $1 and detalle like 'Asignación automática%'", [T(n)]);
  return { id: T(n), who: a ? name[a.assigned_to] : null, source: a?.source ?? null, note: note?.detalle ?? '' };
};
const today = (await rows("select to_char((now() at time zone 'America/Chihuahua')::date, 'YYYY-MM-DD') as d"))[0].d;
const plan = (meta, n = ++seq) => db.query("insert into tickets(id, asunto, descripcion) values ($1,'[PLAN] PREVENTIVO - BA400 - SITIO',$2)",
  [T(n), `Cliente/Localidad: Sitio\n\n[METADATA_PLANEACION] ${JSON.stringify(meta)}`]);

// ── 3) Balanced load ─────────────────────────────────────────────────────────────────────
await reset();
await load({ e1: 2, e2: 2, e3: 1 });
let c = await create('[Soporte Ingeniero] Falla de lámpara');
assert.deepEqual([c.who, c.source], ['e3', 'carga'], 'Fewest open cases wins');
assert.match(c.note, /^Asignación automática a Diego García García \(carga equilibrada\): tiene la menor carga, 1 caso abierto\.$/);
// Everyone at 2: whoever closed their last case longest ago (rested longest).
await background('e1', { closedAt: '2026-10-01T16:00:00Z' });
await background('e2', { closedAt: '2026-10-05T16:00:00Z' });
await background('e3', { closedAt: '2026-10-08T16:00:00Z' });
c = await create('[Soporte Ingeniero] Error de comunicación');
assert.equal(c.who, 'e1', 'Tie: earliest last closure');
assert.match(c.note, /en el empate es quien lleva más tiempo sin cerrar un caso/);
assert.notEqual(c.who, 'e4', 'People without "Recibir tickets" never receive');
console.log('PASS: balanced load, tie broken by the earliest last closure');

// Government case: the government team weighs one case less (a little more weight, not mandatory).
await reset();
await load({ e1: 2, e2: 2, e3: 2 });
await background('e1', { closedAt: '2026-10-01T16:00:00Z' });
c = await create('[Soporte Ingeniero] [FALCON] Equipo no enciende');
assert.equal(c.who, 'e2', 'Benjamín wins a government case on equal load');
assert.match(c.note, /caso de gobierno y es del equipo de gobierno/);
await reset();
await load({ e1: 0, e2: 2, e3: 0 });
c = await create('[Soporte Ingeniero] [FALCON] Equipo no enciende');
assert.notEqual(c.who, 'e2', 'Not mandatory: more load still loses');
console.log('PASS: government weight on government cases only');

// ── 1) Continuity ────────────────────────────────────────────────────────────────────────
await reset();
await load({ e1: 2, e2: 0, e3: 0 });
await db.exec(`insert into ticket_equipment_owners(serial, area, assigned_to) values ('SER-A','ingenieria','${P.e1}')`);
c = await create('[Soporte Ingeniero] Falla de brazo', { serial: 'ser-a' });
assert.deepEqual([c.who, c.source], ['e1', 'continuidad'], 'Habitual owner keeps the follow-up even with more load');
assert.match(c.note, /\(continuidad\): es responsable habitual del equipo\./);
// Now e1 has 3 open: busy. Continuity is skipped and the reason is written down.
c = await create('[Soporte Ingeniero] Otra falla', { serial: 'SER-A' });
assert.notEqual(c.who, 'e1');
assert.equal(c.source, 'carga');
assert.match(c.note, /Se omitió a Alfredo Acevedo \(es responsable habitual del equipo\) porque atiende 3 casos abiertos\./);

// Previous case of the same equipment and area; chemistry never goes to engineering.
await reset();
await load({ q1: 0, q2: 1, q3: 2 });
await background('q3', { area: 'Químico', serial: 'SER-C', closedAt: '2026-09-20T16:00:00Z' });
await background('e2', { area: 'Ingeniero', serial: 'SER-C', created: '2026-09-25T16:00:00Z' });
c = await create('[Soporte Químico] Controles fuera de rango', { serial: 'SER-C' });
assert.deepEqual([c.who, c.source], ['q3', 'continuidad'], 'Previous chemistry case of the equipment, not the later engineering one');
assert.match(c.note, /atendió el caso anterior de este equipo/);

// Reopened case: whoever attended it, ahead of the habitual owner.
await reset();
const closed = await background('q2', { area: 'Químico', serial: 'SER-B', closedAt: '2026-10-02T16:00:00Z' });
await db.exec(`insert into ticket_equipment_owners(serial, area, assigned_to) values ('SER-B','quimica','${P.q1}')`);
c = await create('[Soporte Químico] QC fuera de rango otra vez', { serial: 'SER-B', reopens: closed });
assert.deepEqual([c.who, c.source], ['q2', 'continuidad']);
assert.match(c.note, /atendió el caso que se reabre/);
console.log('PASS: continuity (reopened case, habitual owner, previous case) and busy skip with reason');

// Busy today: a planning dated today or a trip; a week-long planning does not count.
await reset();
await db.exec(`insert into ticket_equipment_owners(serial, area, assigned_to) values ('SER-A','quimica','${P.q1}'),('SER-B','quimica','${P.q2}'),('SER-C','quimica','${P.q3}')`);
await quiet(async () => {
  await plan({ scheduled_date: today, ingeniero_csv: 'IVONNE  jaramillo' });
  await plan({ week_start: '2020-01-01', week_end: '2099-12-31', ingeniero_csv: 'Luis Angel Perez' });
});
await db.query("insert into travel_requests(engineer_id, workflow_status, desired_departure_date, desired_return_date) values ($1,'reservado',$2::date - 1,$2::date + 1)", [P.q3, today]);
await db.query("insert into travel_requests(engineer_id, workflow_status, desired_departure_date, desired_return_date) values ($1,'cancelado',$2::date,$2::date)", [P.q2, today]);
c = await create('[Soporte Químico] Duda de reactivo', { serial: 'SER-A' });
assert.notEqual(c.who, 'q1');
assert.match(c.note, /Se omitió a Ivonne Jaramillo \(es responsable habitual del equipo\) porque hoy tiene una visita programada\./);
c = await create('[Soporte Químico] Calibración', { serial: 'SER-B' });
assert.deepEqual([c.who, c.source], ['q2', 'continuidad'], 'A week-long planning and a cancelled trip do not make anyone busy');
c = await create('[Soporte Químico] Lavado', { serial: 'SER-C' });
assert.notEqual(c.who, 'q3');
assert.match(c.note, /porque hoy está de viaje\./);
console.log('PASS: busy today = planning dated today or a trip; week-long planning ignored');

// ── 2) Region ────────────────────────────────────────────────────────────────────────────
await reset();
await load({ e1: 2, e2: 0, e3: 0 });
await db.exec(`insert into ticket_staff_coverage(user_id, territory, area) values ('${P.e1}','Ciudad de Mexico','ingenieria'),('${P.e3}','Sonora','ingenieria')`);
c = await create('[Soporte Ingeniero] Falla', { serial: 'SER-B' });
assert.deepEqual([c.who, c.source], ['e1', 'region'], 'Coverage of the equipment state wins over load');
assert.match(c.note, /\(región\): cubre la región de ciudad de mexico\./);
c = await create('[Soporte Ingeniero] Falla en equipo fuera de flota', { serial: 'NO-EXISTE', description: 'Canal: Directo\nEstado: Sonora\nFalla reportada: ruido' });
assert.deepEqual([c.who, c.source], ['e3', 'region'], 'Without fleet record the intake "Estado:" line gives the region');
c = await create('[Soporte Ingeniero] Falla', { serial: 'SER-C' });
assert.equal(c.source, 'carga', 'No coverage for the state: next rule');
console.log('PASS: region by equipment state or intake state, else balanced load');

// Everyone busy: still assigned (a pending case is invisible to staff), to the least loaded.
await reset();
await load({ q1: 3, q2: 4, q3: 5 });
c = await create('[Soporte Químico] Urgente');
assert.deepEqual([c.who, c.source], ['q1', 'carga']);
assert.match(c.note, /todos están ocupados; tiene la menor carga, aunque atiende 3 casos abiertos/);

// No area, planning, closed: never routed. Admin-only redistribution routes pending cases.
await reset();
assert.equal((await create('Consulta sin especialidad')).who, null);
await quiet(() => plan({ week_start: today, week_end: today, ingeniero_csv: 'Alfredo Acevedo' }));
assert.equal((await rows('select count(*)::int as n from ticket_assignments'))[0].n, 0, 'Planning is never routed');
await db.exec(`update user_module_permissions set can_receive_tickets = false where user_id in ('${P.q1}','${P.q2}','${P.q3}')`);
const pending = await create('[Soporte Químico] Sin químicos habilitados');
assert.equal(pending.who, null, 'Nobody of the area may receive: stays pending');
await db.exec(`update user_module_permissions set can_receive_tickets = true where user_id = '${P.q2}'`);
await db.exec(`set test.uid = '${P.e1}'; set role authenticated;`);
await assert.rejects(db.query('select route_pending_support_tickets()'), /Solo administradores/);
await assert.rejects(db.query(`select * from ticket_assignment_ranking('${pending.id}')`), /permission denied/);
await asAdmin(); await db.exec('set role authenticated');
assert.equal((await rows('select route_pending_support_tickets() as n'))[0].n, 1);
await asAdmin();
assert.equal(name[(await rows('select assigned_to from ticket_assignments where ticket_id = $1', [pending.id]))[0].assigned_to], 'q2');
// A day-long planning (start = end = today) makes the person busy.
await reset();
await quiet(() => plan({ week_start: today, week_end: today, ingeniero_csv: 'Ivonne Jaramillo' }));
await db.exec(`insert into ticket_equipment_owners(serial, area, assigned_to) values ('SER-A','quimica','${P.q1}')`);
assert.notEqual((await create('[Soporte Químico] Revisión', { serial: 'SER-A' })).who, 'q1');
// History keeps the rule that placed each case.
assert.ok((await rows("select count(*)::int as n from ticket_assignment_history where source in ('continuidad','region','carga')"))[0].n > 0);
console.log('PASS: everyone busy, no area, planning, pending redistribution, admin-only access and audit');
