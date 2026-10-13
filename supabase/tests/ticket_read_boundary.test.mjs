// Run: PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node supabase/tests/ticket_read_boundary.test.mjs
// Rebuilds the production ticket access helpers and policies (as of 2026-10-13) on embedded PostgreSQL,
// records what every kind of user can read in each ticket-bound table and which tickets they can
// update, applies 20261013110000 and requires exactly the same rows afterwards.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const uuid = (prefix, n) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ADMIN = uuid('a', 1), ALFREDO = uuid('a', 2), DIEGO = uuid('a', 3), TRAZ = uuid('a', 4), CLIENT = uuid('a', 5), NOPROFILE = uuid('a', 6);
const T = n => uuid('b', n);
const GHOST = uuid('c', 99); // child rows whose ticket no longer exists
const plan = (people, companions) => `Cliente/Localidad: ISSSTE\n[METADATA_PLANEACION]${JSON.stringify({ ingeniero_csv: people, ...(companions ? { companions_csv: companions } : {}) })}`;

await db.exec(`
create role anon; create role authenticated;
grant usage on schema public to anon, authenticated;
create schema auth; grant usage on schema auth to anon, authenticated;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table profiles(id uuid primary key, nombre_completo text, rol text);
-- Production definitions (pg_get_functiondef, 2026-10-13).
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
 $$ select nullif(btrim(regexp_replace(lower(translate(replace(coalesce(value,''),'.',' '),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')),'\\s+',' ','g')),'') $$;
create function ticket_planning_people(p_description text) returns setof text language sql immutable as $$
 with meta as (select public.try_parse_planning_metadata(p_description) as m)
 select btrim(person) from meta, lateral (
   select regexp_split_to_table(coalesce(m->>'ingeniero_csv',''), '\\s*[/,;]\\s*|\\s+y\\s+') as person
   union all
   select regexp_split_to_table(case when jsonb_typeof(m->'companions_csv')='string' then m->>'companions_csv' else '' end, '\\s*[/,;]\\s*|\\s+y\\s+')
   union all
   select entry from jsonb_array_elements_text(case when jsonb_typeof(m->'companions_csv')='array' then m->'companions_csv' else '[]'::jsonb end) entry
 ) people where btrim(person) <> '' $$;
create function ticket_names_person(p_description text, p_name text) returns boolean language sql immutable as $$
 select public.ticket_person_key(p_name) is not null and exists (
   select 1 from public.ticket_planning_people(p_description) person
   where public.ticket_person_key(person) = public.ticket_person_key(p_name)) $$;
create table tickets(id uuid primary key, user_id uuid, asunto text, descripcion text, estado text default 'abierto', prioridad text);
create table ticket_assignments(ticket_id uuid, assigned_to uuid);
create table ticket_bitacora(id serial primary key, ticket_id uuid, visible_cliente boolean, creado_por uuid, detalle text);
create table ticket_service_events(id serial primary key, ticket_id uuid, kind text);
create table servicios_historial(id serial primary key, ticket_id uuid, motivo text);
create table servicios(id serial primary key, ticket_id uuid);
create table ticket_service_links(id serial primary key, ticket_id uuid);
create function can_view_ticket(p_ticket_id uuid) returns boolean language sql stable security definer set search_path = public as $$
 select auth.uid() is not null and (public.is_admin() or exists(
   select 1 from public.tickets t where t.id = p_ticket_id and (
     t.user_id = auth.uid()
     or (public.is_staff() and (public.ticket_is_planning(t.descripcion)
         or exists(select 1 from public.ticket_assignments a where a.ticket_id = t.id and a.assigned_to = auth.uid())))))) $$;
create function can_work_ticket(p_ticket_id uuid) returns boolean language sql stable security definer set search_path = public as $$
 select auth.uid() is not null and (public.is_admin() or (public.is_staff() and exists(
   select 1 from public.tickets t where t.id = p_ticket_id and (
     t.user_id = auth.uid()
     or exists(select 1 from public.ticket_assignments a where a.ticket_id = t.id and a.assigned_to = auth.uid())
     or (public.ticket_is_planning(t.descripcion) and public.ticket_names_person(t.descripcion,
          (select p.nombre_completo from public.profiles p where p.id = auth.uid()))))))) $$;
-- Production policies (pg_policies, 2026-10-13), Alexa reviewer boundary left out (unchanged, orthogonal).
alter table tickets enable row level security;
create policy "own or staff" on tickets for select to authenticated using (((select auth.uid()) = user_id) or (select is_staff()));
create policy "Ticket assignment boundary" on tickets as restrictive for select to authenticated using (can_view_ticket(id));
create policy "staff update" on tickets for update to authenticated using ((select is_staff())) with check ((select is_staff()));
create policy "Ticket update assignment boundary" on tickets as restrictive for update to authenticated using (can_work_ticket(id)) with check (can_work_ticket(id));
alter table ticket_assignments enable row level security;
create policy "Admins or assignees read ticket assignments" on ticket_assignments for select to authenticated using (is_admin() or assigned_to = auth.uid());
alter table ticket_bitacora enable row level security;
create policy "Staff consulta bitacora" on ticket_bitacora for select to authenticated
 using ((select is_staff()) or exists(select 1 from tickets where tickets.id = ticket_bitacora.ticket_id and tickets.user_id = (select auth.uid())));
create policy "Ticket history assignment boundary" on ticket_bitacora as restrictive for select to authenticated
 using ((is_staff() and can_view_ticket(ticket_id)) or (not is_staff() and visible_cliente and exists(select 1 from tickets t where t.id = ticket_bitacora.ticket_id and t.user_id = auth.uid())));
alter table ticket_service_events enable row level security;
create policy "Staff reads service metrics" on ticket_service_events for select to authenticated using (is_staff());
create policy "Ticket metrics assignment boundary" on ticket_service_events as restrictive for select to authenticated using (can_view_ticket(ticket_id));
alter table servicios_historial enable row level security;
create policy "Lectura de servicios historial" on servicios_historial for select using (true);
create policy "Linked service history assignment boundary" on servicios_historial as restrictive for select to authenticated using ((ticket_id is null) or can_view_ticket(ticket_id));
alter table servicios enable row level security;
create policy "Clientes y staff ven servicios" on servicios for select to authenticated
 using ((select is_staff()) or exists(select 1 from tickets where tickets.id = servicios.ticket_id and tickets.user_id = (select auth.uid())));
create policy "Linked services assignment boundary" on servicios as restrictive for select to authenticated using (can_view_ticket(ticket_id));
alter table ticket_service_links enable row level security;
create policy "Ticket service links follow ticket visibility" on ticket_service_links for select to authenticated using (can_view_ticket(ticket_id));
grant select, update on tickets to authenticated;
grant select on profiles, ticket_assignments, ticket_bitacora, ticket_service_events, servicios_historial, servicios, ticket_service_links to authenticated;
`);

await db.exec(`
insert into profiles values ('${ADMIN}', 'Dirección de Servicio', 'admin'), ('${ALFREDO}', 'Alfredo Acevedo', 'tecnico'), ('${DIEGO}', 'Diego García García', 'tecnico'),
 ('${TRAZ}', 'Trazabilidad', 'trazabilidad'), ('${CLIENT}', 'Laboratorio Cliente', 'cliente');
insert into tickets(id, user_id, asunto, descripcion) values
 ('${T(1)}', '${ALFREDO}', 'Propio de Alfredo', 'Falla'),
 ('${T(2)}', null, 'Asignado a Alfredo', 'Falla'),
 ('${T(3)}', null, 'Sin asignar', 'Falla'),
 ('${T(4)}', '${DIEGO}', '[PLAN] nombra a Alfredo', $p$${plan('Diego García García / ALFREDO  ACEVEDO')}$p$),
 ('${T(5)}', '${DIEGO}', '[PLAN] solo Diego', $p$${plan('Diego García García')}$p$),
 ('${T(6)}', '${ADMIN}', '[PLAN] Alfredo acompañante', $p$${plan('Ricardo Vilchis', ['Alfredo Acevedo'])}$p$),
 ('${T(7)}', '${CLIENT}', 'Caso del cliente', 'Mi equipo'),
 ('${T(8)}', '${TRAZ}', 'Caso de trazabilidad', 'Lote'),
 ('${T(9)}', null, 'Asignado a Diego', 'Falla'),
 ('${T(10)}', null, '[PLAN] metadata rota', 'x [METADATA_PLANEACION]{no es json');
insert into ticket_assignments values ('${T(2)}', '${ALFREDO}'), ('${T(9)}', '${DIEGO}'), ('${T(4)}', '${ADMIN}');
`);
const ticketIds = [...Array.from({ length: 10 }, (_, i) => T(i + 1)), GHOST, null];
for (const ticket of ticketIds) {
  const ref = ticket ? `'${ticket}'` : 'null';
  await db.exec(`
   insert into ticket_bitacora(ticket_id, visible_cliente, creado_por, detalle) values (${ref}, true, '${ADMIN}', 'visible'), (${ref}, false, '${ADMIN}', 'interna');
   insert into ticket_service_events(ticket_id, kind) values (${ref}, 'respuesta'), (${ref}, 'cierre');
   insert into servicios_historial(ticket_id, motivo) values (${ref}, 'servicio');
   insert into servicios(ticket_id) values (${ref});
   insert into ticket_service_links(ticket_id) values (${ref});`);
}
await db.exec(`insert into servicios_historial(ticket_id, motivo) select null, 'histórico ' || g from generate_series(1, 3) g`);

const viewers = { admin: ADMIN, alfredo: ALFREDO, diego: DIEGO, trazabilidad: TRAZ, cliente: CLIENT, sinPerfil: NOPROFILE, anonimo: null };
const tables = { tickets: 'id::text', ticket_bitacora: 'id::text', ticket_service_events: 'id::text', servicios_historial: 'id::text', servicios: 'id::text', ticket_service_links: 'id::text' };
const snapshot = async () => {
  const result = {};
  for (const [name, user] of Object.entries(viewers)) {
    await db.exec(`reset role; set request.jwt.claim.sub = '${user || ''}'; set role authenticated`);
    result[name] = {};
    for (const [table, key] of Object.entries(tables)) {
      result[name][table] = (await db.query(`select ${key} as k from ${table} order by 1`)).rows.map(row => row.k);
    }
    // Which tickets this person may update (the write boundary must not change).
    await db.exec('begin');
    result[name].updatable = (await db.query(`update tickets set prioridad = coalesce(prioridad, 'media') returning id::text as k`)).rows.map(row => row.k).sort();
    await db.exec('rollback');
  }
  await db.exec('reset role; reset request.jwt.claim.sub');
  return result;
};

const before = await snapshot();
// Sanity: the fixture exercises every branch of the rule.
assert.deepEqual(before.alfredo.tickets.sort(), [T(1), T(2), T(4), T(5), T(6), T(10)].sort(), 'technicians read own, assigned and every planning');
assert.deepEqual(before.alfredo.updatable, [T(1), T(2), T(4), T(6)].sort(), 'but only work their own, assigned and planning naming them');
assert.deepEqual(before.cliente.tickets, [T(7)]);
assert.equal(before.cliente.ticket_bitacora.length, 1, 'clients read only the visible log of their own case');
assert.equal(before.admin.ticket_bitacora.length, ticketIds.length * 2, 'admins read every log row, orphaned ones included');
assert.deepEqual(before.trazabilidad.tickets, [T(8)], 'non-staff roles read only their own');
assert.equal(before.anonimo.tickets.length, 0);
assert.equal(before.sinPerfil.servicios_historial.length, 4, 'unlinked service history stays readable');

await db.exec(await readFile(new URL('../migrations/20261013110000_ticket_read_boundary_set_based.sql', import.meta.url), 'utf8'));
const after = await snapshot();
for (const name of Object.keys(viewers)) {
  for (const table of [...Object.keys(tables), 'updatable']) {
    assert.deepEqual(after[name][table], before[name][table], `${name} · ${table}`);
  }
}

// The read boundary no longer calls can_view_ticket() per row.
const policies = (await db.query(`select string_agg(coalesce(qual, ''), ' ') as q from pg_policies where cmd = 'SELECT' and tablename = any($1)`, [Object.keys(tables)])).rows[0].q;
assert.doesNotMatch(policies, /can_view_ticket/);
await db.exec(`set role anon`);
await assert.rejects(db.query('select * from viewable_ticket_ids()'), /permission denied/);
await db.exec('reset role');
await db.close();
console.log('PASS: set-based read boundary — identical rows for admin, technicians, co-responsible, trazabilidad, client, profile-less and anonymous sessions across tickets, bitácora, service events, service history, services and links; updates unchanged');
