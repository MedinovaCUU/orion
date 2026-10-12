// Run: PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node supabase/tests/service_staff_kpis.test.mjs
// Loads the real ticket migrations plus 20261011020000 on embedded PostgreSQL. Every scenario uses
// January 2026, so the cut (end of the period) is fixed and the expected numbers are exact.
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
  '20261012040000_kpi_tickets_biosisa_evaluados.sql']) {
  await db.exec(await migration(name));
}
console.log('PASS: migration applies on top of the ticket, routing, satisfaction and visibility migrations');

// ── Scenario ──────────────────────────────────────────────────────────────────────────────
await db.exec(`
insert into profiles values
 ('${P.admin}','admin','Dirección de Servicio',null),
 ('${P.q1}','tecnico','Ivonne Jaramillo','Quimico'),
 ('${P.q2}','tecnico','Martha Carbajal','Químico'),
 ('${P.e1}','tecnico','Alfredo Acevedo','Ingeniero'),
 ('${P.e2}','tecnico','Diego Garcia','Ingeniero');
insert into user_module_permissions(user_id, modules, can_receive_tickets) select id, array['tickets'], true from profiles;
insert into clientes(id, razon_social) values (1,'Hospital Norte'),(2,'Falcon Laboratorios'),(3,'Clínica Sur'),(4,'Laboratorio Delta');
insert into equipos values
 ('EQ-A','SER-A','BA400',1,'Chihuahua','Chihuahua',null,'Av. Norte 1',null,now()),
 ('EQ-B','SER-B','A15',2,'Ciudad de México','Ciudad de México',null,'Reforma 10',null,now()),
 ('EQ-C','SER-C','BA200',3,'Jalisco','Guadalajara',null,'Sur 5',null,now()),
 ('EQ-D','SER-D','BA200',4,'Sonora','Hermosillo',null,'Delta 3',null,now());
insert into catalogo_servicio values ('averia','AL08','AL','Electrónica','Lámpara'),('averia','AL13','AL','Electrónica','Fuente'),
 ('averia','AA00','AA','Aplicativo','Configuración'),('solucion','SL01','SL','Electrónica','Ajuste'),('solucion','SL02','SL','Electrónica','Cambio de lámpara');
insert into refacciones_catalogo values ('REF-1','BA400','Filtro','Filtro de lavado'),('REF-2','BA200','Lámpara','Lámpara halógena'),('REF-3','BA400','Sello','Sello de jeringa');
`);
// Support tickets. Inserted already closed so the closure trigger does not stamp "now": the closure
// event carries the real time, exactly like the service flow.
const ticket = (n, subject, serial, opened, extra = {}) => db.query(
  `insert into tickets(id, asunto, descripcion, estado, creado_en, numero_caso, numero_serie_equipo, prioridad, reabre_ticket_id)
   values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
  [T(n), subject, extra.description || 'Caso de prueba', extra.estado || 'abierto', opened, `OR-${String(n).padStart(4, '0')}`, serial, extra.priority || null, extra.reopens || null]);
const event = (n, kind, at, reason = null, actor = null) => db.query(
  'insert into ticket_service_events(ticket_id, kind, detail, actor_id, occurred_at, closure_reason) values ($1,$2,$3,$4,$5,$6)',
  [T(n), kind, 'Detalle verificable', actor, at, reason]);
await ticket(1, '[Soporte Químico] QC fuera de rango', 'SER-A', '2026-01-05T16:00:00Z', { estado: 'cerrado', priority: 'alta' });
await event(1, 'respuesta', '2026-01-05T17:00:00Z', null, P.q1); await event(1, 'cierre', '2026-01-06T10:00:00Z', 'solucionado', P.q1);
await ticket(2, '[Soporte Ingeniero] Falla de lámpara', 'SER-A', '2026-01-10T16:00:00Z', { estado: 'cerrado' });
await event(2, 'cierre', '2026-01-14T16:00:00Z', 'solucionado', P.e1); await event(2, 'justificacion', '2026-01-14T17:00:00Z', null, P.admin);
await ticket(3, '[Soporte Ingeniero] [FALCON] Error de comunicación', 'SER-B', '2026-01-12T16:00:00Z', { estado: 'cerrado' });
await event(3, 'respuesta', '2026-01-12T18:00:00Z', null, P.e2); await event(3, 'cierre', '2026-01-13T22:00:00Z', 'solucionado', P.e2);
await ticket(4, '[Soporte Químico] Duda de reactivo', 'SER-C', '2026-01-20T16:00:00Z', { estado: 'cerrado' });
await event(4, 'cierre', '2026-01-21T16:00:00Z', 'administrativo', P.admin);
await ticket(5, '[Soporte Ingeniero] Ruido en brazo', 'SER-C', '2026-01-28T16:00:00Z');
await ticket(6, '[Soporte Químico] Calibración', 'SER-C', '2025-12-20T16:00:00Z', { estado: 'cerrado' });
await event(6, 'cierre', '2026-01-03T16:00:00Z', 'solucionado', P.q2);
await ticket(7, '[Soporte Químico] Histórico sin fecha de cierre', 'SER-A', '2026-01-15T16:00:00Z', { estado: 'cerrado' });
await ticket(8, '[Soporte Químico] Caso de febrero', 'SER-A', '2026-02-03T16:00:00Z');
await ticket(9, '[Soporte Químico] QC fuera de rango (reapertura)', 'SER-A', '2026-01-08T16:00:00Z', { estado: 'cerrado', reopens: T(1) });
await event(9, 'cierre', '2026-01-09T10:00:00Z', 'solucionado', P.q1);
await db.exec(`
insert into ticket_assignments(ticket_id, assigned_to, assigned_by) values
 ('${T(1)}','${P.q1}','${P.admin}'),('${T(2)}','${P.e2}','${P.admin}'),('${T(3)}','${P.e2}','${P.admin}'),
 ('${T(6)}','${P.q2}','${P.admin}'),('${T(9)}','${P.q1}','${P.admin}');
update ticket_assignments set assigned_to = '${P.e1}' where ticket_id = '${T(2)}';
`);
// Planning (scheduled activities).
const plan = (n, subject, serial, meta, extra = {}) => db.query(
  `insert into tickets(id, user_id, asunto, descripcion, estado, creado_en, numero_caso, numero_serie_equipo) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
  [T(n), extra.user || null, subject, `Cliente/Localidad: ${extra.client || 'Sitio'}\n\n[METADATA_PLANEACION] ${JSON.stringify(meta)}`, extra.estado || 'abierto',
   extra.created || '2025-12-15T16:00:00Z', `PL-${n}`, serial]);
await plan(21, '[PLAN] PREVENTIVO - BA400 - HOSPITAL NORTE', 'SER-A', { service_type: 'preventivo', week_start: '2026-01-12', week_end: '2026-01-16', ingeniero_csv: 'Alfredo Acevedo' });
await plan(22, '[PLAN] PREVENTIVO - A15 - FALCON', 'SER-B', { service_type: 'preventivo', week_start: '2026-01-19', week_end: '2026-01-23', ingeniero_csv: 'Diego Garcia' });
await plan(23, '[PLAN] PREVENTIVO - BA200 - CLINICA SUR', 'SER-C', { service_type: 'preventivo', week_start: '2026-01-26', week_end: '2026-01-30', ingeniero_csv: 'Diego Garcia' }, { estado: 'cerrado' });
await event(23, 'cierre', '2026-02-02T16:00:00Z', 'administrativo');
await plan(24, '[PLAN] CAPACITACION - BA400 - HOSPITAL NORTE', 'SER-A', { fecha_tentativa: '05 AL 09 ENERO', ingeniero_csv: 'IVONNE  jaramillo' }, { estado: 'cerrado', created: '2026-01-02T16:00:00Z' });
await event(24, 'cierre', '2026-01-09T20:00:00Z', 'solucionado', P.q1);
await plan(25, '[PLAN] RECAPACITACION - A15 - FALCON', 'SER-B', { service_type: 'recapacitacion', week_start: '2026-01-26', week_end: '2026-01-30', ingeniero_csv: 'Martha Carbajal / Persona Externa' });
await plan(26, '[PLAN] CAPACITACION - BA200 - DELTA', 'SER-D', { service_type: 'capacitacion', week_start: '2026-01-05', week_end: '2026-01-09', ingeniero_csv: '' }, { user: P.admin });
// Executed service records, parts, SAP and remote reports, calls and visits.
const hist = (n, serial, date, motivo, tech, extra = {}) => db.query(
  `insert into servicios_historial(id, ticket_id, no_serie, cda, cds, motivo, tecnico_id, fecha_servicio, tipo_servicio) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
  [id('3', n), extra.ticket || null, serial, extra.cda || null, extra.cds || null, motivo, tech, date, extra.tipo || null]);
await hist(1, 'SER-A', '2026-01-14', 'MANTTO PREVENTIVO', P.e1, { cda: 'AL08', cds: 'SL01' });
await hist(2, 'SER-A', '2026-01-14', 'Cambio de fuente', P.e1, { cda: 'AL13', tipo: 'correctivo', ticket: T(2) });
await hist(3, 'SER-C', '2026-01-05', 'MANTTO CORRECTIVO', P.e2, { cda: 'AL08', cds: 'SL02' });
await hist(4, 'SER-C', '2026-01-12', 'MANTTO CORRECTIVO', P.e2, { cda: 'AL08', cds: 'SL02' });
await hist(5, 'SER-D', '2026-01-09', 'MANTTO PREVENTIVO', P.e2);
await hist(6, 'SER-D', '2026-01-10', 'EJEMPLO', P.e2, { cda: 'AL08' });
await hist(7, 'SER-A', '2026-01-22', 'VISITA', P.q1);
await hist(8, 'SER-A', '0023-03-14', 'MANTTO CORRECTIVO', P.e1);
await db.exec(`
insert into servicios_refacciones(servicio_id, codigo_refaccion, cantidad) values ('${id('3', 1)}','REF-1',2),('${id('3', 3)}','REF-2',1),('${id('3', 6)}','REF-2',9);
insert into service_reports(id, report_type, status, service_type, equipment_serial, service_date, external_source, report_reference)
 values ('${id('4', 1)}','servicio','registrado','preventivo','SER-A','2026-01-14','sap_fsm','SAP-100');
insert into sap_service_reports(service_report_id, report_number, service_kind, start_date, end_date, equipment_serial, technician_name, total_duration_minutes)
 values ('${id('4', 1)}','SAP-100','preventivo','2026-01-14','2026-01-14','SER-A','alfredo acevedo',180);
insert into service_report_materials(service_report_id, material_kind, quantity, product_name, reference_code, price_mxn)
 values ('${id('4', 1)}','refaccion',2,'Sello de jeringa','REF-3',100.00),('${id('4', 1)}','reactivo',5,'Reactivo','R-1',50.00);
insert into service_reports(id, report_type, status, engineer_id, service_type, equipment_serial, call_date, started_at, ended_at)
 values ('${id('4', 2)}','remoto','requiere_visita','${P.q2}','otro','SER-B','2026-01-15','10:00','10:25'),
        ('${id('4', 3)}','remoto','borrador','${P.q2}','otro','SER-B','2026-01-16','10:00','10:30');
insert into ticket_bitacora(ticket_id, numero_serie_equipo, tipo, detalle, visible_cliente, creado_por, creado_en, actividad_duracion_min, actividad_motivo, actividad_resultado) values
 ('${T(1)}','SER-A','llamada','Llamada de orientación',false,'${P.q1}','2026-01-05T16:30:00Z',15,'resultados_qc','resuelto'),
 ('${T(6)}','SER-C','llamada','Llamada sobre reactivos',false,'${P.q2}','2026-01-02T18:00:00Z',null,'reactivos','requiere_visita'),
 ('${T(2)}','SER-A','llamada','Llamada de diagnóstico',false,'${P.e1}','2026-01-10T17:00:00Z',20,'falla_equipo',null),
 ('${T(3)}','SER-B','visita','Visita 1',false,'${P.e2}','2026-01-12T20:00:00Z',null,null,null),
 ('${T(3)}','SER-B','visita','Visita 2',false,'${P.e2}','2026-01-13T18:00:00Z',null,null,null);
insert into ticket_satisfaction(ticket_id, specialist_id, specialist_name, area, case_number, answered_at, satisfaction, speed, resolution, improvement)
 values ('${T(1)}','${P.q1}','Ivonne Jaramillo','quimica','OR-0001','2026-01-07T16:00:00Z',5,4,'total','none');
`);
// Reopen links are evaluated only for closures after the capture start; move it before the scenario.
await as('admin');
await assert.rejects(db.exec("update service_kpi_settings set capture_since = '2025-12-01'"), /inmutable/);
await db.exec(`reset role; alter table service_kpi_settings disable trigger validate_service_kpi_settings;
 update service_kpi_settings set capture_since = '2025-12-01T00:00:00Z'; alter table service_kpi_settings enable trigger validate_service_kpi_settings;`);

const JAN = { from: '2026-01-01', to: '2026-01-31', granularity: 'week' };
const summary = async (filters = JAN) => { await as('admin'); return (await one('select get_service_kpi_summary($1) as s', [filters])).s; };
const records = async (dataset, match = {}, filters = JAN, extra = {}) => {
  await as('admin');
  return (await one('select get_service_kpi_records($1,$2,$3,$4,$5,$6,$7,$8) as r',
    [dataset, filters, match, extra.search || null, extra.sort || null, extra.desc ?? true, extra.offset || 0, extra.limit || 1000])).r;
};

// ── Access ────────────────────────────────────────────────────────────────────────────────
await as('q1');
await assert.rejects(db.query('select get_service_kpi_summary($1)', [JAN]), /exclusivos para administradores/);
await assert.rejects(db.query("select get_service_kpi_records('tickets')"), /exclusivos para administradores/);
await db.exec('set role authenticated');
await assert.rejects(db.query("select * from service_kpi_ticket_rows('{}')"), /permission denied/);
assert.equal((await db.query('select * from ticket_sla_policies')).rows.length, 0, 'policies are hidden from non-admins');
await as('q1');
await assert.rejects(db.query("insert into ticket_sla_policies(name, target_hours) values ('Plazo propio', 4)"), /Solo administradores/);
await as('admin');
await assert.rejects(db.query("insert into ticket_sla_policies(name, target_hours, timezone) values ('Zona inválida', 4, 'Mars/Base')"), /Zona horaria no válida/);
console.log('PASS: admin-only API, internal functions not executable, configuration restricted and validated');

// ── Window and periods ────────────────────────────────────────────────────────────────────
const s = await summary();
assert.deepEqual([s.period.from, s.period.to, s.period.previous_from, s.period.previous_to], ['2026-01-01', '2026-01-31', '2025-12-01', '2025-12-31']);
assert.equal(s.period.cut_is_now, false, 'a past period is a fixed snapshot at its end');
const half = await summary({ from: '2026-01-01', to: '2026-01-15' });
assert.deepEqual([half.period.previous_from, half.period.previous_to], ['2025-12-01', '2025-12-15'], 'month-to-date compares with the same days');
const span = await summary({ from: '2026-01-10', to: '2026-01-20' });
assert.deepEqual([span.period.previous_from, span.period.previous_to], ['2025-12-30', '2026-01-09'], 'free range compares with the same number of days');
await assert.rejects(db.query('select get_service_kpi_summary($1)', [{ from: '2026-02-01', to: '2026-01-01' }]), /anterior o igual/);
await assert.rejects(db.query('select get_service_kpi_summary($1)', [{ ...JAN, recurrence_days: 0 }]), /entre 1 y 365/);
console.log('PASS: period, equivalent previous period, fixed cut and parameter validation');

// ── Tickets: SLA, late closures, denominators ─────────────────────────────────────────────
const c = s.current;
assert.equal(c.tickets_opened, 7, 'opened in January: 1,2,3,4,5,7,9 (6 is December, 8 is February)');
assert.equal(c.tickets_closed, 6, 'closed in January with a verifiable time: 1,2,3,4,6,9');
assert.equal(c.tickets_cancelled, 1);
assert.equal(c.sla_evaluable, 5, 'administrative closure is excluded from the denominator');
assert.equal(c.sla_on_time, 2);
assert.equal(c.sla_late, 3, 'T2 (96 h), T3 (Falcon CDMX 24 h, closed at 30 h) and T6 (14 d)');
assert.deepEqual(c.late_rate, { num: 3, den: 5, pct: 60 });
assert.deepEqual(c.sla_compliance, { num: 2, den: 5, pct: 40 });
assert.equal(c.sla_late_justified, 1, 'a justified delay is still a late closure, shown apart');
const t3 = (await records('tickets', { ticket_id: T(3) })).rows[0];
assert.equal(t3.sla_policy, 'Falcon · Ciudad de México');
assert.equal(Number(t3.sla_target_hours), 24);
assert.equal(t3.sla_result, 'fuera');
const t7 = (await records('tickets', { ticket_id: T(7) })).rows[0];
assert.equal(t7.closure_class, 'sin_fecha'); assert.equal(t7.state_at_cut, 'desconocido'); assert.equal(t7.sla_result, 'no_evaluable');
assert.equal(s.quality.tickets_without_closure_date, 1);
assert.equal(c.pending_at_cut, 1); assert.equal(c.overdue_at_cut, 1); assert.equal(c.unknown_at_cut, 1); assert.equal(c.unassigned_pending, 1);
const t5 = (await records('tickets', { ticket_id: T(5) })).rows[0];
assert.equal(t5.age_bucket, '3-7 d'); assert.equal(t5.sla_result, 'vencido'); assert.equal(t5.team, 'ingenieria'); assert.equal(t5.team_source, 'especialidad');
assert.equal(c.first_response_base, 7); assert.equal(c.first_response_n, 3, 'T1 (call at 0.5 h), T2 (call at 1 h), T3 (response at 2 h)');
assert.equal(Number(c.first_response_median), 1); assert.equal(Number(c.first_response_avg), 1.17);
assert.equal(c.resolution_n, 5);
assert.equal(Number(c.resolution_median), 30); assert.equal(Number(c.resolution_p90), 240); assert.equal(Number(c.resolution_avg), 99.6);
assert.deepEqual(c.reopen_rate, { num: 1, den: 5, pct: 20 }, 'T9 reopens T1');
assert.deepEqual(c.ftf_rate, { num: 1, den: 2, pct: 50 }, 'T2 solved in one visit, T3 needed two');
const t2 = (await records('tickets', { ticket_id: T(2) })).rows[0];
assert.equal(t2.reassignments, 1); assert.equal(t2.responsible_id, P.e1);
// December is the previous period: T6 opened, nothing closed.
assert.equal(s.previous.tickets_opened, 1); assert.equal(s.previous.tickets_closed, 0);
assert.equal(s.previous.late_rate.pct, null, 'no evaluable closures → not applicable, never 0 %');
console.log('PASS: opened vs closed in period, SLA by policy, late-closure formula, cancellations, unknown snapshot, first response, resolution percentiles, reopen and first-time fix');

// ── Business hours and pauses from an explicit policy ─────────────────────────────────────
await as('admin');
await db.query(`insert into ticket_sla_policies(name, area, priority, target_hours, clock, business_start, business_end, business_days, pause_states, precedence)
 values ('Química crítica hábil', 'quimica', 'critica', 10, 'habiles', '09:00', '18:00', '{1,2,3,4,5}', '{pendiente_piezas}', 5)`);
await db.exec('reset role');
await ticket(10, '[Soporte Químico] Urgente', 'SER-A', '2026-01-16T23:00:00Z', { estado: 'cerrado', priority: 'critica' }); // viernes 17:00 local
await event(10, 'cierre', '2026-01-20T18:00:00Z', 'solucionado', P.q1); // martes 12:00 local
await db.exec(`insert into ticket_state_history(ticket_id, estado, changed_at) values
 ('${T(10)}','pendiente_piezas','2026-01-19T15:00:00Z'),('${T(10)}','en_progreso','2026-01-19T19:00:00Z'),('${T(10)}','cerrado','2026-01-20T18:00:00Z')`);
let t10 = (await records('tickets', { ticket_id: T(10) })).rows[0];
assert.equal(t10.sla_policy, 'Química crítica hábil');
assert.equal(Number(t10.sla_hours), 9, 'Fri 1 h + Mon 9 h + Tue 3 h − 4 h paused');
assert.equal(t10.sla_result, 'dentro');
await as('admin');
await db.exec("update ticket_sla_policies set pause_states = '{}' where name = 'Química crítica hábil'");
t10 = (await records('tickets', { ticket_id: T(10) })).rows[0];
assert.equal(Number(t10.sla_hours), 13); assert.equal(t10.sla_result, 'fuera', 'without the pause the same case is late');
await db.exec("update ticket_sla_policies set active = false");
assert.equal((await records('tickets', { ticket_id: T(1) })).rows[0].sla_result, 'sin_plazo', 'without an active rule nothing is assumed');
assert.equal((await summary()).current.sla_no_policy, 7);
await db.exec("update ticket_sla_policies set active = true; delete from ticket_sla_policies where name = 'Química crítica hábil'");
await db.exec(`reset role; delete from ticket_service_events where ticket_id = '${T(10)}'; delete from ticket_state_history where ticket_id = '${T(10)}'; delete from tickets where id = '${T(10)}';`);
console.log('PASS: business-hours clock, configurable pauses, policy precedence and "sin plazo" without rules');

// ── Activities: trainings, visits, calls, preventive and corrective ───────────────────────
assert.equal(c.trainings_total, 3); assert.equal(c.trainings, 2); assert.equal(c.retrainings, 1); assert.equal(c.trainings_done, 1);
assert.equal(c.trainings_overdue, 2);
const p24 = (await records('activities', { activity_id: `plan:${T(24)}` })).rows[0];
assert.equal(p24.activity_date, '2026-01-09', 'legacy label "05 AL 09 ENERO" is read with the creation year');
assert.deepEqual(p24.participant_ids, [P.q1]); assert.equal(p24.plan_status, 'realizado');
const p25 = (await records('activities', { activity_id: `plan:${T(25)}` })).rows[0];
assert.equal(p25.unmatched_names, 'Persona Externa'); assert.deepEqual(p25.participant_ids, [P.q2]);
const p26 = (await records('activities', { activity_id: `plan:${T(26)}` })).rows[0];
assert.deepEqual(p26.participant_ids, [], 'the capturing admin is not a participant'); assert.equal(p26.team_inferred, true); assert.deepEqual(p26.teams, ['quimica']);
assert.equal(c.visits, 7, 'same equipment and day is one visit (history + SAP on SER-A 14/01)');
const visitA = (await records('activities', { is_visit: true, serial_key: 'SER-A', activity_date: '2026-01-14' })).rows[0];
assert.equal(visitA.records, 3); assert.deepEqual([...visitA.kinds].sort(), ['correctivo', 'preventivo']); assert.deepEqual(visitA.unplanned_kinds, ['correctivo']);
assert.equal(c.calls, 4, 'three logged calls and one remote report; drafts are excluded');
assert.equal(c.calls_with_duration, 3); assert.equal(Number(c.call_minutes_avg), 20);
assert.deepEqual(c.calls_resolved_rate, { num: 1, den: 3, pct: 33.3 });
assert.equal(c.preventive_programmed, 3); assert.equal(c.preventive_done, 1); assert.equal(c.preventive_overdue, 1); assert.equal(c.preventive_no_evidence, 1);
assert.deepEqual(c.preventive_compliance, { num: 1, den: 3, pct: 33.3 });
assert.equal(c.preventive_off_schedule, 1, 'SER-D preventive had no programming');
assert.equal(c.preventive_executed, 2); assert.equal(c.corrective, 3); assert.equal(c.maintenance_visits, 4);
assert.deepEqual(c.corrective_share, { num: 3, den: 4, pct: 75 });
assert.equal(s.quality.history_test_records, 1); assert.equal(s.quality.history_invalid_date, 1);
console.log('PASS: trainings vs retrainings with plan evidence, participants and unmatched names, visit de-duplication, calls, preventive compliance and off-schedule, corrective share');

// ── Recurrence, effectiveness, parts, satisfaction ────────────────────────────────────────
assert.equal(c.failure_events, 4);
assert.equal(c.recurrence_rate.pct, null, '30-day window has not elapsed for any January event');
const short = await summary({ ...JAN, recurrence_days: 10 });
assert.deepEqual(short.current.recurrence_rate, { num: 1, den: 4, pct: 25 });
const pair = short.breakdowns.failure_solution.find(row => row.failure === 'AL08' && row.solution === 'SL02');
assert.deepEqual([pair.n, pair.evaluable, pair.recurred, Number(pair.effectiveness), pair.small_sample], [2, 2, 1, 50, true]);
assert.equal(c.parts_lines, 3, 'test-record parts and non-part materials are excluded');
assert.equal(Number(c.parts_qty), 5); assert.equal(Number(c.parts_qty_preventive), 4); assert.equal(Number(c.parts_qty_corrective), 1);
assert.equal(c.parts_cost_lines, 1); assert.equal(Number(c.parts_cost_total), 200);
assert.equal(c.surveys, 1); assert.deepEqual(c.csat, { num: 1, den: 1, pct: 100 });
console.log('PASS: recurrence window and evaluability, solution effectiveness with sample size, parts by maintenance type with cost coverage, satisfaction');

// ── Teams, people and filters ─────────────────────────────────────────────────────────────
const chem = (await summary({ ...JAN, team: 'quimica' })).current;
assert.equal(chem.tickets_opened, 4); assert.equal(chem.tickets_closed, 4); assert.deepEqual(chem.late_rate, { num: 1, den: 3, pct: 33.3 });
assert.equal(chem.trainings_total, 3); assert.equal(chem.visits, 1); assert.equal(chem.calls, 3);
const eng = (await summary({ ...JAN, team: 'ingenieria' })).current;
assert.equal(eng.tickets_opened, 3); assert.deepEqual(eng.late_rate, { num: 2, den: 2, pct: 100 }); assert.equal(eng.calls, 1); assert.equal(eng.trainings_total, 0);
const ivonne = await summary({ ...JAN, team: 'quimica', person: P.q1 });
assert.equal(ivonne.current.tickets_opened, 2); assert.equal(ivonne.current.trainings_total, 1); assert.equal(ivonne.current.visits, 1); assert.equal(ivonne.current.calls, 1);
const staffRow = ivonne.breakdowns.staff.find(row => row.id === P.q1);
assert.equal(staffRow.tickets_closed, 2); assert.equal(staffRow.trainings, 1); assert.equal(Number(staffRow.satisfaction_avg), 5);
const general = await summary();
const martha = general.breakdowns.staff.find(row => row.id === P.q2);
assert.equal(martha.tickets_relevant, 1); assert.equal(martha.trainings, 1); assert.equal(martha.calls, 2);
assert.ok(general.breakdowns.staff.some(row => row.id === P.e1 && row.preventive_done === 1));
const byClient = (await summary({ ...JAN, client: 'Clínica Sur' })).current;
assert.equal(byClient.tickets_opened, 2); assert.equal(byClient.corrective, 2);
const byPlatform = (await summary({ ...JAN, platform: 'A15' })).current;
assert.equal(byPlatform.tickets_opened, 1); assert.equal(byPlatform.calls, 1);
const bySerial = (await summary({ ...JAN, serial: ' ser-c ' })).current;
assert.equal(bySerial.failure_events, 2);
assert.equal((await summary({ ...JAN, priority: 'alta' })).current.tickets_opened, 1);
assert.equal((await summary({ ...JAN, status: 'abierto' })).current.tickets_opened, 1);
assert.equal((await summary({ ...JAN, service_type: 'preventivo' })).current.preventive_programmed, 3);
assert.equal((await summary({ ...JAN, service_type: 'soporte_quimica' })).current.tickets_opened, 4);
console.log('PASS: chemist and engineer teams, individual filter, staff breakdown, client, platform, serial, priority, status and service-type filters');

// ── Cards = series = records (same filters) ───────────────────────────────────────────────
const checks = [
  ['tickets_opened', 'tickets', { opened_in_period: true }], ['tickets_closed', 'tickets', { closed_in_period: true }],
  ['sla_evaluable', 'tickets', { sla_evaluable: true }], ['sla_late', 'tickets', { closed_in_period: true, sla_result: 'fuera' }],
  ['pending_at_cut', 'tickets', { pending_at_cut: true }], ['overdue_at_cut', 'tickets', { overdue_at_cut: true }],
  ['trainings_total', 'activities', { in_period: true, counts_training: true }], ['visits', 'activities', { in_period: true, is_visit: true }],
  ['calls', 'activities', { in_period: true, is_call: true }], ['preventive_programmed', 'activities', { in_period: true, is_planned: true, kind: 'preventivo' }],
  ['preventive_off_schedule', 'activities', { in_period: true, preventive_off_schedule: true }],
  ['corrective', 'activities', { in_period: true, is_visit: true, kinds: ['correctivo'] }],
  ['failure_events', 'failures', { in_period: true }], ['parts_lines', 'parts', { in_period: true }], ['surveys', 'surveys', { in_period: true }],
];
for (const filters of [JAN, { ...JAN, team: 'quimica' }, { ...JAN, team: 'ingenieria' }, { ...JAN, person: P.e2 }]) {
  const current = (await summary(filters)).current;
  for (const [key, dataset, match] of checks) {
    assert.equal((await records(dataset, match, filters)).total, current[key], `${key} card = ${dataset} records for ${JSON.stringify(filters)}`);
  }
}
const series = s.series;
assert.equal(series.reduce((sum, row) => sum + row.opened, 0), c.tickets_opened);
assert.equal(series.reduce((sum, row) => sum + row.closed, 0), c.tickets_closed);
assert.equal(series.reduce((sum, row) => sum + row.closed_late, 0), c.sla_late);
assert.equal(series.reduce((sum, row) => sum + row.visits, 0), c.visits);
assert.equal(series[0].bucket, '2025-12-29', 'weekly buckets start on Monday');
const monthly = await summary({ ...JAN, granularity: 'month' });
assert.equal(monthly.series.length, 1); assert.equal(monthly.series[0].preventive_programmed, 3);
console.log('PASS: every card equals its drill-down records under team and person filters; series add up to the cards');

// ── Records API: search, sort, paging ─────────────────────────────────────────────────────
const page1 = await records('tickets', { relevant: true }, JAN, { sort: 'opened_at', desc: false, limit: 3 });
const page2 = await records('tickets', { relevant: true }, JAN, { sort: 'opened_at', desc: false, limit: 3, offset: 3 });
assert.equal(page1.total, 8, "opened, closed or pending in January: 1-7 and 9"); assert.equal(page1.rows.length, 3); assert.equal(page1.rows[0].folio, 'OR-0006');
assert.ok(page1.rows.every((row, i, rows) => i === 0 || rows[i - 1].opened_at <= row.opened_at));
assert.equal(new Set([...page1.rows, ...page2.rows].map(row => row.ticket_id)).size, 6, 'pages never overlap');
assert.equal((await records('tickets', {}, JAN, { search: 'falcon' })).total, 1);
assert.equal(page1.rows[0].search_text, undefined, 'internal search column is not returned');
await assert.rejects(records('tickets', {}, JAN, { sort: 'x; drop table tickets' }), /Orden no válido/);
await assert.rejects(records('nada'), /no válido/);
console.log('PASS: server-side search, ordering and non-overlapping pages');

// ── Capture: activity data, priority, reopen links ────────────────────────────────────────
await db.exec(`reset role; insert into tickets(id, asunto, estado, numero_serie_equipo, user_id) values ('${T(11)}','[Soporte Químico] Seguimiento','abierto','SER-A','${P.q1}')`);
await as('q1');
const move = (action, activity, ticketId = T(11)) => db.query('select register_ticket_movement($1,$2,$3,null,false,null,$4)', [ticketId, action, 'Contacto con laboratorio', activity]);
await move('llamada', { duracion_min: 12, motivo: 'operacion', resultado: 'resuelto', codigo_averia: 'aa00' });
const logged = await one(`select actividad_duracion_min, actividad_motivo, actividad_resultado, codigo_averia from ticket_bitacora where ticket_id = '${T(11)}' and tipo = 'llamada'`);
assert.deepEqual(logged, { actividad_duracion_min: 12, actividad_motivo: 'operacion', actividad_resultado: 'resuelto', codigo_averia: 'AA00' });
await assert.rejects(move('avance', { resultado: 'resuelto' }), /solo se registran en llamadas y visitas/);
await assert.rejects(move('visita', { resultado: 'magia' }), /Resultado de actividad no válido/);
await assert.rejects(move('visita', { duracion_min: 0 }), /entre 1 y 1440/);
await assert.rejects(move('visita', { duracion_min: '12 min' }), /número entero/);
await assert.rejects(move('visita', { codigo_averia: 'ZZ99' }), /no está en el catálogo/);
await db.query(`select register_ticket_movement('${T(11)}', 'avance', 'Movimiento con la firma anterior (Alexa)', 'en_progreso', false, null)`);
assert.equal((await one(`select estado from tickets where id = '${T(11)}'`)).estado, 'en_progreso');
assert.equal((await one(`select count(*)::int as n from ticket_state_history where ticket_id = '${T(11)}'`)).n, 2, 'state changes are recorded for pauses');
await assert.rejects(db.query('select set_ticket_priority($1,$2)', [T(11), 'alta']), /Solo administradores/);
await as('admin');
await db.query('select set_ticket_priority($1,$2)', [T(11), 'alta']);
assert.equal((await one(`select prioridad from tickets where id = '${T(11)}'`)).prioridad, 'alta');
assert.match((await one(`select detalle from ticket_bitacora where ticket_id = '${T(11)}' order by creado_en desc limit 1`)).detalle, /sin definir → alta/);
await assert.rejects(db.query('select set_ticket_priority($1,$2)', [T(11), 'urgente']), /Prioridad no válida/);
await assert.rejects(db.query('select set_ticket_priority($1,$2)', [T(1), 'baja']), /caso cerrado/);
await db.exec('reset role');
await assert.rejects(ticket(12, '[Soporte Químico] Reapertura inválida', 'SER-A', '2026-01-30T16:00:00Z', { reopens: T(5) }), /caso cerrado/);
await assert.rejects(ticket(13, '[Soporte Químico] Reapertura de planeación', 'SER-A', '2026-01-30T16:00:00Z', { reopens: T(23) }), /planeación no se reabre/);
await assert.rejects(db.query(`update tickets set reabre_ticket_id = '${T(2)}' where id = '${T(9)}'`), /inmutable/);
console.log('PASS: structured call/visit capture validated in the movement RPC, legacy 6-argument call, audited priority, reopen link rules');

await db.close();
