// Run: PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node supabase/tests/planning_grid.test.mjs
// Rebuilds the production ticket schema pieces the planning grid touches (access helpers, tickets RLS,
// closure/state/reopen triggers, Supabase's default grants and the Realtime publication) on embedded
// PostgreSQL, applies 20261015010000 twice (re-runnable) and checks: planning_version (server-side +1,
// no-op and client-supplied values ignored, optimistic "where planning_version = n"), the per-field
// history in planning_changes (every field key, custom:<key>, insert/delete, author, non-planning
// silence), its read boundary, and the RLS of custom columns, user settings and saved views.
// Synthetic data only.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const uuid = (prefix, n) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ADMIN = uuid('a', 1), ALFREDO = uuid('a', 2), DIEGO = uuid('a', 3), CLIENT = uuid('a', 4), OTHER = uuid('a', 5);
const P1 = uuid('b', 1), P2 = uuid('b', 2), P3 = uuid('b', 3), P4 = uuid('b', 4), N1 = uuid('b', 9);
const migration = await readFile(new URL('../migrations/20261015010000_planning_grid.sql', import.meta.url), 'utf8');

// Same layout as serializePlanningDescription() in the frontend.
const describe = ({ localidad, obs, meta }) =>
  [localidad && `Cliente/Localidad: ${localidad}`, obs && `Observaciones: ${obs}`].filter(Boolean).join('\n')
  + `\n\n[METADATA_PLANEACION] ${JSON.stringify(meta)}`;

await db.exec(String.raw`
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
-- Production helper definitions (as in ticket_read_boundary.test.mjs, 2026-10-13/14).
create function is_admin() returns boolean language sql stable security definer set search_path = public as
 $$ select exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.rol = 'admin') $$;
create function is_staff() returns boolean language sql stable security definer set search_path = public as
 $$ select exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.rol in ('admin', 'tecnico')) $$;
create function try_parse_planning_metadata(p_description text) returns jsonb language plpgsql immutable set search_path = public as $$
declare v_marker constant text := '[METADATA_PLANEACION]'; v_position integer;
begin
  v_position := position(v_marker in coalesce(p_description, ''));
  if v_position = 0 then return '{}'::jsonb; end if;
  return substring(p_description from v_position + char_length(v_marker))::jsonb;
exception when others then return '{}'::jsonb;
end; $$;
create function ticket_is_planning(p_description text) returns boolean language sql immutable as
 $$ select position('[METADATA_PLANEACION]' in coalesce(p_description,'')) > 0 $$;
create function ticket_person_key(value text) returns text language sql immutable as
 $$ select nullif(btrim(regexp_replace(lower(translate(replace(coalesce(value,''),'.',' '),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')),'\s+',' ','g')),'') $$;
create function ticket_planning_people(p_description text) returns setof text language sql immutable as $$
 with meta as (select public.try_parse_planning_metadata(p_description) as m)
 select btrim(person) from meta, lateral (
   select regexp_split_to_table(coalesce(m->>'ingeniero_csv',''), '\s*[/,;]\s*|\s+y\s+') as person
   union all
   select regexp_split_to_table(case when jsonb_typeof(m->'companions_csv')='string' then m->>'companions_csv' else '' end, '\s*[/,;]\s*|\s+y\s+')
   union all
   select entry from jsonb_array_elements_text(case when jsonb_typeof(m->'companions_csv')='array' then m->'companions_csv' else '[]'::jsonb end) entry
 ) people where btrim(person) <> '' $$;
create function ticket_names_person(p_description text, p_name text) returns boolean language sql immutable as $$
 select public.ticket_person_key(p_name) is not null and exists (
   select 1 from public.ticket_planning_people(p_description) person
   where public.ticket_person_key(person) = public.ticket_person_key(p_name)) $$;
create type ticket_status as enum ('abierto','en_progreso','cerrado','pendiente_piezas','en_observacion');
create table tickets(id uuid primary key default gen_random_uuid(), user_id uuid, asunto text not null, descripcion text,
 estado ticket_status default 'abierto', creado_en timestamptz default now(), actualizado_en timestamptz default now(),
 numero_serie_equipo text, numero_caso text, prioridad text, reabre_ticket_id uuid references tickets(id));
create table ticket_assignments(ticket_id uuid, assigned_to uuid);
create function my_assigned_ticket_ids() returns setof uuid language sql stable security definer set search_path = public as
 $$ select a.ticket_id from public.ticket_assignments a where a.assigned_to = (select auth.uid()) $$;
create function viewable_ticket_ids() returns setof uuid language sql stable security definer set search_path = public as $$
 select t.id from public.tickets t
 where (select auth.uid()) is not null and (
   (select public.is_admin()) or t.user_id = (select auth.uid())
   or ((select public.is_staff()) and (public.ticket_is_planning(t.descripcion)
       or t.id in (select public.my_assigned_ticket_ids())))) $$;
create function can_work_ticket(p_ticket_id uuid) returns boolean language sql stable security definer set search_path = public as $$
 select auth.uid() is not null and (public.is_admin() or (public.is_staff() and exists(
   select 1 from public.tickets t where t.id = p_ticket_id and (
     t.user_id = auth.uid()
     or exists(select 1 from public.ticket_assignments a where a.ticket_id = t.id and a.assigned_to = auth.uid())
     or (public.ticket_is_planning(t.descripcion) and public.ticket_names_person(t.descripcion,
          (select p.nombre_completo from public.profiles p where p.id = auth.uid()))))))) $$;
-- Existing tickets triggers (20260924010000, 20261011020000) the new ones must coexist with.
create table ticket_service_events(id serial primary key, ticket_id uuid, kind text, detail text, actor_id uuid, unique (ticket_id, kind));
create table ticket_state_history(id bigint generated always as identity primary key, ticket_id uuid, estado ticket_status, changed_at timestamptz default clock_timestamp(), changed_by uuid);
create function capture_ticket_closure() returns trigger language plpgsql security definer set search_path = public as $$
begin
 if old.estado = 'cerrado' and new.estado <> 'cerrado' then
   raise exception 'Crea un nuevo caso vinculado al equipo para conservar las métricas del cierre';
 end if;
 if old.estado <> 'cerrado' and new.estado = 'cerrado' then
   insert into public.ticket_service_events(ticket_id,kind,detail,actor_id)
   values(new.id,'cierre','Cierre registrado por el flujo de servicio',auth.uid()) on conflict do nothing;
 end if;
 if new.creado_en is distinct from old.creado_en then raise exception 'La fecha de apertura es inmutable'; end if;
 return new;
end; $$;
create trigger ticket_capture_closure before update on tickets for each row execute function capture_ticket_closure();
create function validate_ticket_reopen_link() returns trigger language plpgsql security definer set search_path = public as $$
begin
 if new.reabre_ticket_id is null then
   if tg_op = 'UPDATE' and old.reabre_ticket_id is not null then raise exception 'El vínculo de reapertura es inmutable'; end if;
   return new;
 end if;
 return new;
end; $$;
create trigger ticket_reopen_link before insert or update of reabre_ticket_id on tickets for each row execute function validate_ticket_reopen_link();
create function track_ticket_state() returns trigger language plpgsql security definer set search_path = public as $$
begin
 if tg_op = 'INSERT' or new.estado is distinct from old.estado then
   insert into public.ticket_state_history(ticket_id, estado, changed_at, changed_by)
   values (new.id, coalesce(new.estado, 'abierto'), clock_timestamp(), auth.uid());
 end if;
 return new;
end; $$;
create trigger ticket_state_history_track after insert or update of estado on tickets for each row execute function track_ticket_state();
-- Production tickets policies (pg_policies, 2026-10-14; Alexa reviewer boundary left out).
alter table tickets enable row level security;
create policy "own or staff" on tickets for select to authenticated using (((select auth.uid()) = user_id) or (select is_staff()));
create policy "Ticket assignment boundary" on tickets as restrictive for select to authenticated
using ((select auth.uid()) is not null and ((select public.is_admin()) or user_id = (select auth.uid())
  or ((select public.is_staff()) and (public.ticket_is_planning(descripcion) or id in (select public.my_assigned_ticket_ids())))));
create policy "own insert" on tickets for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "admin insert" on tickets for insert to authenticated with check (is_admin());
create policy "staff update" on tickets for update to authenticated using ((select is_staff())) with check ((select is_staff()));
create policy "Ticket update assignment boundary" on tickets as restrictive for update to authenticated using (can_work_ticket(id)) with check (can_work_ticket(id));
create policy "admin delete" on tickets for delete to authenticated using (is_admin());
create policy "Ticket delete admin boundary" on tickets as restrictive for delete to authenticated using (is_admin());
alter table ticket_assignments enable row level security;
create policy "Admins or assignees read ticket assignments" on ticket_assignments for select to authenticated using (is_admin() or assigned_to = auth.uid());
insert into profiles values ('${ADMIN}', 'Dirección de Servicio', 'admin'), ('${ALFREDO}', 'Alfredo Acevedo', 'tecnico'),
 ('${DIEGO}', 'Diego García García', 'tecnico'), ('${CLIENT}', 'Laboratorio Cliente', 'cliente'), ('${OTHER}', 'Técnico Sin Asignar', 'tecnico');
`);

await db.exec(migration);
await db.exec(migration); // re-runnable: guards, drop-if-exists, create-or-replace

const as = async user => db.exec(user === 'anon' ? `reset role; set request.jwt.claim.sub = ''; set role anon`
  : user ? `reset role; set request.jwt.claim.sub = '${user}'; set role authenticated`
  : `reset role; set request.jwt.claim.sub = ''`);
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const version = async ticket => { await as(null); return (await q('select planning_version as v from tickets where id = $1', [ticket]))[0]?.v; };
const changes = async (ticket, since = 0) => { await as(null);
  return q(`select action, field, old_value as old, new_value as new, version, changed_by as by, changed_by_name as name, ticket_subject as subject
            from planning_changes where ticket_id = $1 and id > $2 order by id`, [ticket, since]); };
const lastId = async () => { await as(null); return (await q('select coalesce(max(id), 0)::int as n from planning_changes'))[0].n; };
const fields = rows => rows.map(r => [r.field, r.old, r.new]);

// --- Inserts --------------------------------------------------------------------------------------
const baseMeta = {
  service_type: 'preventivo', ingeniero_csv: 'Alfredo Acevedo', companions_csv: ['Diego García García'],
  fecha_tentativa: '13 al 17 OCTUBRE', scheduled_date: '2026-10-14', scheduled_end_date: '2026-10-15', scheduled_day: 'Martes',
  status_values: ['Programado'], priority_csv: 'Alta', custom_fields: { ruta: 'Norte', km: 120 }, updated_by_name: 'Dirección de Servicio',
};
const p1Desc = describe({ localidad: 'Hospital Central', obs: 'Revisar bomba', meta: baseMeta });
await as(ADMIN);
let rows = await q(`insert into tickets(id, user_id, asunto, descripcion, numero_serie_equipo) values ($1, $2, $3, $4, 'SN-001') returning planning_version`,
  [P1, ADMIN, '[PLAN] PREVENTIVO - BA400 - HOSPITAL CENTRAL', p1Desc]);
assert.equal(rows[0].planning_version, 1, 'new rows start at version 1');
await q(`insert into tickets(id, user_id, asunto, descripcion) values ($1, $2, 'Falla del equipo', 'No enciende')`, [N1, ADMIN]);
await q(`insert into tickets(id, user_id, asunto, descripcion) values ($1, $2, '[PLAN] PREVENTIVO - A25 - CLINICA SUR', $3)`,
  [P2, ADMIN, describe({ localidad: 'Clínica Sur', meta: { service_type: 'preventivo', ingeniero_csv: 'Diego García García', companions_csv: 'Ricardo Vilchis' } })]);
await q(`insert into tickets(id, user_id, asunto, descripcion) values ($1, $2, '[PLAN] VISITA - BA200 - LABORATORIO ESTE', $3)`,
  [P3, ADMIN, describe({ localidad: 'Laboratorio Este', meta: { service_type: 'visita', ingeniero_csv: 'Ricardo Vilchis' } })]);
await q(`insert into tickets(id, user_id, asunto, descripcion) values ($1, $2, '[PLAN] CAPACITACION - A15 - LABORATORIO CLIENTE', $3)`,
  [P4, CLIENT, describe({ localidad: 'Laboratorio Cliente', meta: { service_type: 'capacitacion', ingeniero_csv: 'Ricardo Vilchis' } })]);
assert.deepEqual(await changes(P1), [{ action: 'insert', field: null, old: null, new: null, version: 1, by: ADMIN, name: 'Dirección de Servicio',
  subject: '[PLAN] PREVENTIVO - BA400 - HOSPITAL CENTRAL' }], 'one insert row with the JWT author');
assert.deepEqual(await changes(N1), [], 'support cases are not logged');

// --- planning_version ------------------------------------------------------------------------------
await as(ALFREDO); // named in ingeniero_csv → may work the planning row
const updatedAt = (await q('select actualizado_en::text as t from tickets where id = $1', [P1]))[0].t;
let mark = await lastId();
await as(ALFREDO);
rows = await q(`update tickets set prioridad = 'alta' where id = $1 returning planning_version`, [P1]);
assert.equal(rows[0].planning_version, 1, 'columns outside the grid do not bump');
await as(ALFREDO);
rows = await q(`update tickets set asunto = asunto, descripcion = descripcion, estado = estado where id = $1 returning planning_version`, [P1]);
assert.equal(rows[0].planning_version, 1, 'no-op updates do not bump');
await as(ALFREDO);
rows = await q(`update tickets set planning_version = 99 where id = $1 returning planning_version`, [P1]);
assert.equal(rows[0].planning_version, 1, 'a client-supplied version alone is ignored');
assert.deepEqual(await changes(P1, mark), [], 'nothing logged for no-op updates');

await as(ALFREDO);
rows = await q(`update tickets set descripcion = $2, planning_version = 50 where id = $1 returning planning_version`,
  [P1, describe({ localidad: 'Hospital Central', obs: 'Revisar bomba y lámpara', meta: { ...baseMeta, updated_by_name: 'Alfredo Acevedo' } })]);
assert.equal(rows[0].planning_version, 2, 'a real change is old + 1 whatever the client sent');
assert.equal((await q('select actualizado_en::text as t from tickets where id = $1', [P1]))[0].t, updatedAt, 'actualizado_en untouched');
assert.deepEqual(await changes(P1, mark), [{ action: 'update', field: 'observaciones', old: 'Revisar bomba', new: 'Revisar bomba y lámpara', version: 2,
  by: ALFREDO, name: 'Alfredo Acevedo', subject: '[PLAN] PREVENTIVO - BA400 - HOSPITAL CENTRAL' }], 'one row for the one changed field, author from the JWT');

// Optimistic concurrency as the grid does it.
mark = await lastId();
await as(ALFREDO);
rows = await q(`update tickets set numero_serie_equipo = 'SN-002' where id = $1 and planning_version = $2 returning id, planning_version`, [P1, 2]);
assert.deepEqual(rows, [{ id: P1, planning_version: 3 }], 'expected version matches → 1 row with the new version');
await as(ALFREDO);
rows = await q(`update tickets set numero_serie_equipo = 'SN-003' where id = $1 and planning_version = $2 returning id, planning_version`, [P1, 2]);
assert.deepEqual(rows, [], 'stale version → 0 rows');
assert.deepEqual(fields(await changes(P1, mark)), [['numero_serie', 'SN-001', 'SN-002']], 'the stale write left no trace');
await as(OTHER); // staff, reads every planning row, but this one does not name him → no permission, also 0 rows
rows = await q(`update tickets set numero_serie_equipo = 'SN-004' where id = $1 and planning_version = $2 returning id, planning_version`, [P1, 3]);
assert.deepEqual(rows, [], 'no permission → 0 rows too (the client tells both apart by re-reading)');
assert.equal(await version(P1), 3);

// Every grid field at once, with custom fields added, changed, removed and emptied.
mark = await lastId();
await as(ALFREDO);
rows = await q(`update tickets set asunto = $2, descripcion = $3 where id = $1 and planning_version = 3 returning planning_version`, [P1,
  '[PLAN] CORRECTIVO - A15 - CLINICA NORTE',
  describe({ localidad: 'Clínica  Norte ', meta: { ...baseMeta, service_type: 'correctivo', ingeniero_csv: 'Alfredo Acevedo / Diego García García',
    companions_csv: ['Ricardo Vilchis', '', 'Martha Carbajal'], fecha_tentativa: '20 al 24 OCTUBRE', scheduled_date: '2026-10-21',
    scheduled_end_date: null, scheduled_day: 'Miércoles', status_values: ['Programado', 'Confirmado'], priority_csv: 'Media',
    custom_fields: { ruta: 'Sur', viaticos: true, turno: '', zona: { norte: 1 } }, updated_by_name: 'Alfredo Acevedo' } })]);
assert.equal(rows[0].planning_version, 4);
const big = await changes(P1, mark);
assert.deepEqual(fields(big), [
  ['tipo', 'preventivo', 'correctivo'],
  ['plataforma', 'BA400', 'A15'],
  ['localidad', 'Hospital Central', 'Clínica Norte'],
  ['observaciones', 'Revisar bomba y lámpara', null],
  ['ingeniero', 'Alfredo Acevedo', 'Alfredo Acevedo / Diego García García'],
  ['acompanantes', 'Diego García García', 'Ricardo Vilchis, Martha Carbajal'],
  ['semana', '13 al 17 OCTUBRE', '20 al 24 OCTUBRE'],
  ['fecha_programada', '2026-10-14', '2026-10-21'],
  ['fecha_fin', '2026-10-15', null],
  ['dias', 'Martes', 'Miércoles'],
  ['estados', 'Programado', 'Programado, Confirmado'],
  ['prioridad', 'Alta', 'Media'],
  ['custom:km', '120', null],
  ['custom:ruta', 'Norte', 'Sur'],
  ['custom:viaticos', null, 'true'],
  ['custom:zona', null, '{"norte": 1}'],
], 'one row per changed field, fixed order then custom keys; unchanged numero_serie/estado and empty custom:turno log nothing');
assert.ok(big.every(r => r.version === 4 && r.by === ALFREDO && r.subject === '[PLAN] CORRECTIVO - A15 - CLINICA NORTE'));

// Ticket state through the grid, alongside the closure and state-history triggers.
mark = await lastId();
await as(ALFREDO);
assert.equal((await q(`update tickets set estado = 'en_progreso' where id = $1 returning planning_version`, [P1]))[0].planning_version, 5);
await as(ALFREDO);
assert.equal((await q(`update tickets set estado = 'cerrado' where id = $1 returning planning_version`, [P1]))[0].planning_version, 6);
assert.deepEqual(fields(await changes(P1, mark)), [['estado_ticket', 'abierto', 'en_progreso'], ['estado_ticket', 'en_progreso', 'cerrado']]);
await as(null);
assert.equal((await q(`select count(*)::int as n from ticket_service_events where ticket_id = $1 and kind = 'cierre'`, [P1]))[0].n, 1, 'closure capture still fires');
assert.equal((await q(`select count(*)::int as n from ticket_state_history where ticket_id = $1`, [P1]))[0].n, 3, 'state history still fires');
await as(ALFREDO);
await assert.rejects(q(`update tickets set estado = 'abierto' where id = $1`, [P1]), /nuevo caso vinculado/, 'closed stays closed');
assert.equal(await version(P1), 6, 'a rejected update bumps nothing');

// Companions as a string become the same text as an array; without a JWT the author is updated_by_name.
mark = await lastId();
await as(null);
await q(`update tickets set descripcion = $2 where id = $1`, [P2, describe({ localidad: 'Clínica Sur', meta: { service_type: 'preventivo',
  ingeniero_csv: 'Diego García García', companions_csv: ['Ricardo Vilchis'], scheduled_day: 'Jueves', updated_by_name: 'Hoja de planeación' } })]);
assert.deepEqual(await changes(P2, mark), [{ action: 'update', field: 'dias', old: null, new: 'Jueves', version: 2, by: null,
  name: 'Hoja de planeación', subject: '[PLAN] PREVENTIVO - A25 - CLINICA SUR' }], 'string → array companions with the same names log nothing');

// Older layouts carry more lines; localidad/observaciones read only their own line.
mark = await lastId();
const legacy = extra => `Cliente/Localidad: Laboratorio Cliente\r\nObservaciones: Llevar manual\r\nContacto: ${extra}\n\n[METADATA_PLANEACION] `
  + JSON.stringify({ service_type: 'capacitacion', ingeniero_csv: 'Ricardo Vilchis' });
await as(ADMIN);
await q('update tickets set descripcion = $2 where id = $1', [P4, legacy('Recepción')]);
await as(ADMIN);
assert.equal((await q('update tickets set descripcion = $2 where id = $1 returning planning_version', [P4, legacy('Química responsable')]))[0].planning_version, 3);
assert.deepEqual(fields(await changes(P4, mark)), [['observaciones', null, 'Llevar manual']], 'other lines are not fields (and CRLF is tolerated)');

// Support cases: version still guards them, history stays silent.
mark = await lastId();
await as(ADMIN);
assert.equal((await q(`update tickets set descripcion = 'No enciende; ya revisado' where id = $1 returning planning_version`, [N1]))[0].planning_version, 2);
await as(ADMIN);
assert.equal((await q(`update tickets set user_id = $2 where id = $1 returning planning_version`, [N1, DIEGO]))[0].planning_version, 3, 'user_id is versioned too');
assert.equal(await lastId(), mark, 'nothing logged for non-planning tickets');

// A planning row that stops being planning logs its fields going empty (and leaves the shared board).
mark = await lastId();
await as(ADMIN);
await q(`update tickets set asunto = 'Caso de soporte', descripcion = 'Ya no es planeación' where id = $1`, [P3]);
assert.deepEqual(fields(await changes(P3, mark)), [['tipo', 'visita', null], ['plataforma', 'BA200', null], ['localidad', 'Laboratorio Este', null],
  ['ingeniero', 'Ricardo Vilchis', null]]);

// Delete: one row with the last version; the history survives the ticket.
const p2Version = await version(P2);
mark = await lastId();
await as(ADMIN);
await q('delete from tickets where id = $1', [P2]);
assert.deepEqual(await changes(P2, mark), [{ action: 'delete', field: null, old: null, new: null, version: p2Version, by: ADMIN,
  name: 'Dirección de Servicio', subject: '[PLAN] PREVENTIVO - A25 - CLINICA SUR' }]);
await as(null);
assert.equal((await q('select count(*)::int as n from planning_changes where ticket_id = $1', [P2]))[0].n, 3, 'insert + update + delete kept');

// --- planning_changes read boundary ----------------------------------------------------------------
const visible = async user => { await as(user); return (await q('select distinct ticket_id::text as t from planning_changes order by 1')).map(r => r.t); };
assert.deepEqual(await visible(ADMIN), [P1, P2, P3, P4].sort(), 'admins read everything, deleted tickets included');
assert.deepEqual(await visible(ALFREDO), [P1, P4].sort(), 'technicians: viewable tickets only (shared planning board)');
assert.deepEqual(await visible(DIEGO), [P1, P4].sort());
assert.deepEqual(await visible(CLIENT), [P4], 'non-staff: their own ticket only');
await as(null);
await q('insert into ticket_assignments values ($1, $2)', [P3, DIEGO]);
assert.deepEqual(await visible(DIEGO), [P1, P3, P4].sort(), 'an assignment opens that ticket\'s history');
await as('anon');
await assert.rejects(q('select * from planning_changes'), /permission denied/, 'anon reads nothing');
for (const user of [ADMIN, ALFREDO]) {
  await as(user);
  await assert.rejects(q(`insert into planning_changes(ticket_id, action) values ($1, 'update')`, [P1]), /permission denied/, 'no direct inserts');
  await as(user);
  await assert.rejects(q(`update planning_changes set new_value = 'x'`), /permission denied/, 'no direct updates');
  await as(user);
  await assert.rejects(q('delete from planning_changes'), /permission denied/, 'no direct deletes');
}
await as(ALFREDO);
await assert.rejects(q(`select planning_grid_values('a', 'b', 'c', 'd')`), /permission denied/, 'internal helpers are not exposed');
await as(null);
assert.deepEqual((await q(`select count(*)::int as n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'planning_changes'`))[0].n, 1,
  'published once to Realtime');
const triggers = (await q(`select tgname from pg_trigger where tgrelid = 'tickets'::regclass and not tgisinternal order by tgname`)).map(r => r.tgname);
assert.deepEqual(triggers, ['ticket_capture_closure', 'ticket_reopen_link', 'ticket_state_history_track', 'tickets_planning_changes_log', 'tickets_planning_version']);

// --- Custom columns ---------------------------------------------------------------------------------
await as(ADMIN);
rows = await q(`insert into planning_custom_columns(key, label, data_type, options, updated_at) values ('ruta', 'Ruta', 'select', '["Norte","Sur"]', '2020-01-01') returning id, created_by`);
assert.equal(rows[0].created_by, ADMIN);
const columnId = rows[0].id;
for (const bad of [`('Ruta', 'Ruta', 'text')`, `('r', 'R', 'text')`, `('km', '   ', 'number')`, `('monto', 'Monto', 'money')`]) {
  await as(ADMIN);
  await assert.rejects(q(`insert into planning_custom_columns(key, label, data_type) values ${bad}`), /check constraint/, bad);
}
await as(ADMIN);
await assert.rejects(q(`insert into planning_custom_columns(key, label, data_type) values ('ruta', 'Otra', 'text')`), /unique|duplicate/);
await as(ADMIN);
rows = await q(`update planning_custom_columns set label = 'Ruta asignada', width = 160, position = 3 where id = $1 returning updated_at > '2020-01-02' as touched, created_by`, [columnId]);
assert.deepEqual(rows, [{ touched: true, created_by: ADMIN }], 'admins edit; updated_at maintained');
await as(ADMIN);
await assert.rejects(q(`update planning_custom_columns set key = 'ruta2' where id = $1`, [columnId]), /clave de una columna no cambia/);
await as(ADMIN);
await assert.rejects(q('delete from planning_custom_columns'), /permission denied/, 'columns are archived, not deleted');
await as(ADMIN);
assert.equal((await q(`update planning_custom_columns set archived_at = now() where id = $1 returning id`, [columnId])).length, 1, 'archive');
await as(ALFREDO);
assert.equal((await q('select * from planning_custom_columns')).length, 1, 'staff read definitions');
await as(ALFREDO);
await assert.rejects(q(`insert into planning_custom_columns(key, label, data_type) values ('turno', 'Turno', 'text')`), /row-level security/, 'technicians cannot add');
await as(ALFREDO);
assert.equal((await q(`update planning_custom_columns set label = 'x' returning id`)).length, 0, 'technicians cannot edit');
await as(CLIENT);
assert.equal((await q('select * from planning_custom_columns')).length, 0, 'non-staff read nothing');
await as('anon');
await assert.rejects(q('select * from planning_custom_columns'), /permission denied/);

// --- Per-user settings ------------------------------------------------------------------------------
await as(ALFREDO);
rows = await q(`insert into planning_user_settings(grid) values ('{"density":"compact"}') returning user_id`);
assert.equal(rows[0].user_id, ALFREDO, 'user_id defaults to the JWT user');
await as(ALFREDO);
await q(`insert into planning_user_settings(grid) values ('{"density":"comfortable"}') on conflict (user_id) do update set grid = excluded.grid`);
await as(ALFREDO);
assert.deepEqual((await q('select grid from planning_user_settings')).map(r => r.grid), [{ density: 'comfortable' }], 'upsert own');
await as(DIEGO);
assert.equal((await q('select * from planning_user_settings')).length, 0, 'others\' settings are invisible');
await as(DIEGO);
await assert.rejects(q(`insert into planning_user_settings(user_id, grid) values ($1, '{}')`, [ALFREDO]), /row-level security/);
await as(DIEGO);
assert.equal((await q(`update planning_user_settings set grid = '{}' where user_id = $1 returning user_id`, [ALFREDO])).length, 0);
await as(DIEGO);
await q(`insert into planning_user_settings(grid) values ('{}')`);
await as(DIEGO);
await assert.rejects(q(`update planning_user_settings set user_id = $1`, [ALFREDO]), /row-level security/, 'cannot hand a row to someone else');
await as(DIEGO);
await assert.rejects(q('delete from planning_user_settings'), /permission denied/);
await as('anon');
await assert.rejects(q('select * from planning_user_settings'), /permission denied/);

// --- Saved views ------------------------------------------------------------------------------------
await as(ALFREDO);
const viewId = (await q(`insert into planning_saved_views(name, config) values ('Mi semana', '{"filters":{"semana":"20 al 24 OCTUBRE"}}') returning id, user_id`))[0];
assert.equal(viewId.user_id, ALFREDO);
await as(DIEGO);
await q(`insert into planning_saved_views(name) values ('Mi semana')`); // same name, another person
await as(ALFREDO);
await assert.rejects(q(`insert into planning_saved_views(name) values ('Mi semana')`), /unique|duplicate/, 'names are unique per person');
await as(ALFREDO);
await assert.rejects(q(`insert into planning_saved_views(name) values ('  ')`), /check constraint/);
await as(DIEGO);
assert.deepEqual((await q('select user_id::text as u from planning_saved_views')).map(r => r.u), [DIEGO], 'own views only');
await as(DIEGO);
assert.equal((await q(`update planning_saved_views set name = 'robada' where id = $1 returning id`, [viewId.id])).length, 0);
await as(DIEGO);
assert.equal((await q(`delete from planning_saved_views where id = $1 returning id`, [viewId.id])).length, 0);
await as(DIEGO);
await assert.rejects(q(`insert into planning_saved_views(user_id, name) values ($1, 'Intrusa')`, [ALFREDO]), /row-level security/);
await as(ALFREDO);
rows = await q(`update planning_saved_views set config = '{}' where id = $1 returning updated_at > created_at as touched`, [viewId.id]);
assert.deepEqual(rows, [{ touched: true }]);
await as(ALFREDO);
await assert.rejects(q(`update planning_saved_views set user_id = $2 where id = $1`, [viewId.id, DIEGO]), /row-level security/);
await as(ALFREDO);
assert.equal((await q(`delete from planning_saved_views where id = $1 returning id`, [viewId.id])).length, 1, 'delete own');
await as('anon');
await assert.rejects(q('select * from planning_saved_views'), /permission denied/);

await as(null);
await db.close();
console.log('PASS: planning grid — planning_version (+1 per real change, no-ops and client values ignored, optimistic 1/0 rows), per-field history '
  + '(all 14 keys + custom:<key>, insert/delete, JWT or updated_by_name author, support cases silent), read boundary (admin incl. deleted, '
  + 'technicians/clients by visibility, anon none, no direct writes), Realtime publication, coexisting triggers, custom columns, settings and saved views per user');
