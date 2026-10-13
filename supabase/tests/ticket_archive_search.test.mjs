// Run: PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node supabase/tests/ticket_archive_search.test.mjs
// Loads 20261013070000 on embedded PostgreSQL with the production access helpers and checks the
// inbox working set (open + last 30 days, closure events included) and the archive search:
// accent-insensitive words, exact folio first, client and assignee lookup, filters, paging with a
// stable total, regex-safe input and the same per-person boundary as the inbox.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const ADMIN = '00000000-0000-4000-8000-0000000000a1', ALFREDO = '00000000-0000-4000-8000-0000000000b2', DIEGO = '00000000-0000-4000-8000-0000000000c3';
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const plan = (people) => `Cliente/Localidad: ISSSTE\n[METADATA_PLANEACION]${JSON.stringify({ ingeniero_csv: people })}`;

await db.exec(`
create role anon; create role authenticated;
grant usage on schema public to anon, authenticated;
create schema auth; grant usage on schema auth to anon, authenticated;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table profiles(id uuid primary key, nombre_completo text, rol text);
create function is_admin() returns boolean language sql stable security definer set search_path = public as
 $$ select exists(select 1 from public.profiles where id = auth.uid() and rol = 'admin') $$;
create function is_staff() returns boolean language sql stable security definer set search_path = public as
 $$ select exists(select 1 from public.profiles where id = auth.uid() and rol in ('admin','tecnico')) $$;
create type ticket_status as enum ('abierto','en_progreso','pendiente_piezas','en_observacion','cerrado');
create table tickets(id uuid primary key, user_id uuid, asunto text, descripcion text, estado ticket_status default 'abierto',
 creado_en timestamptz, actualizado_en timestamptz, numero_serie_equipo text, nombre_cliente_guest text, telefono_cliente_guest text,
 email_cliente_guest text, numero_caso text, prioridad text, reabre_ticket_id uuid);
create table ticket_assignments(ticket_id uuid, assigned_to uuid);
create table ticket_service_events(ticket_id uuid, kind text, occurred_at timestamptz);
create table clientes(id uuid primary key, razon_social text);
create table equipos(id int primary key, numero_serie text, cliente_id uuid);
create function normalize_equipment_serial(value text) returns text language sql immutable as
 $$ select nullif(upper(regexp_replace(trim(coalesce(value, '')), '\\s+', '', 'g')), '') $$;
create function ticket_is_planning(p_description text) returns boolean language sql immutable as
 $$ select position('[METADATA_PLANEACION]' in coalesce(p_description,'')) > 0 $$;
-- Same shape as 20261009010000: planning names people by ingeniero_csv.
create function ticket_names_person(p_description text, p_name text) returns boolean language sql immutable as
 $$ select p_name is not null and position(lower(p_name) in lower(coalesce(p_description,''))) > 0 $$;
create function can_work_ticket(p_ticket_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (public.is_admin() or (public.is_staff() and exists(
   select 1 from public.tickets t where t.id = p_ticket_id and (t.user_id = auth.uid()
     or exists(select 1 from public.ticket_assignments a where a.ticket_id = t.id and a.assigned_to = auth.uid())
     or (public.ticket_is_planning(t.descripcion) and public.ticket_names_person(t.descripcion,
          (select p.nombre_completo from public.profiles p where p.id = auth.uid())))))))
$$;
create function can_view_ticket(p_ticket_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (public.is_admin() or exists(select 1 from public.tickets t where t.id = p_ticket_id and (
   t.user_id = auth.uid() or (public.is_staff() and (public.ticket_is_planning(t.descripcion)
   or exists(select 1 from public.ticket_assignments a where a.ticket_id = t.id and a.assigned_to = auth.uid()))))))
$$;
alter table tickets enable row level security;
create policy "staff boundary" on tickets for select to authenticated using (public.can_view_ticket(id));
alter table ticket_assignments enable row level security;
create policy "admins or assignee" on ticket_assignments for select to authenticated using (public.is_admin() or assigned_to = auth.uid());
grant select on profiles, tickets, ticket_assignments, clientes, equipos to authenticated;
insert into profiles values ('${ADMIN}', 'Dirección de Servicio', 'admin'), ('${ALFREDO}', 'Alfredo Acevedo', 'tecnico'), ('${DIEGO}', 'Diego García García', 'tecnico');
insert into clientes values ('20000000-0000-4000-8000-000000000001', 'Hospital Ángeles del Pedregal');
insert into equipos values (1, '832000706', '20000000-0000-4000-8000-000000000001');
`);
await db.exec(await readFile(new URL('../migrations/20261013070000_ticket_archive_search.sql', import.meta.url), 'utf8'));

const rows = [
  [1, 'BIO-12', 'Falla de lectura BA200', 'cerrado', '2024-03-04T16:00:00Z', { numero_serie_equipo: '832000706', nombre_cliente_guest: 'Laboratorio Norte', telefono_cliente_guest: '(614) 177-2897' }],
  [2, 'BIO-120', 'Control fuera de rango en química', 'cerrado', '2024-05-10T16:00:00Z', { numero_serie_equipo: '83200 0706', descripcion: 'Reporta Q. García la desviación' }],
  [3, 'BIO-1200', 'Cambio de lámpara', 'cerrado', '2025-01-15T16:00:00Z', { numero_serie_equipo: 'A15-999', email_cliente_guest: 'compras@clinicasur.mx' }],
  [4, '0O207T61', 'Ruido en brazo de muestras', 'abierto', '2026-10-07T16:00:00Z', { numero_serie_equipo: '832000706', user_id: ALFREDO }],
  [5, '0O208T62', '[PLAN] PREVENTIVO - A15 - CANCEROLOGIA', 'cerrado', '2026-04-01T16:00:00Z', { descripcion: plan('Diego García García') }],
  [6, '0O209T63', '[PLAN] CAPACITACION - BA400 - ISSSTE', 'cerrado', '2026-04-02T16:00:00Z', { descripcion: plan('Alfredo Acevedo') }],
];
for (const [n, folio, asunto, estado, creado, extra] of rows) {
  await db.query(`insert into tickets(id, numero_caso, asunto, estado, creado_en, actualizado_en, user_id, numero_serie_equipo, nombre_cliente_guest,
    telefono_cliente_guest, email_cliente_guest, descripcion) values ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11)`,
    [id(n), folio, asunto, estado, creado, extra.user_id || null, extra.numero_serie_equipo || null, extra.nombre_cliente_guest || null,
      extra.telefono_cliente_guest || null, extra.email_cliente_guest || null, extra.descripcion || null]);
}
await db.exec(`insert into ticket_assignments values ('${id(1)}', '${ALFREDO}'), ('${id(2)}', '${DIEGO}');
 -- BIO-1200 is old but its closure was registered yesterday; actualizado_en was not touched.
 insert into ticket_service_events values ('${id(3)}', 'cierre', now() - interval '1 day'), ('${id(1)}', 'cierre', '2024-03-05T16:00:00Z');`);

const as = async (user) => { await db.exec('reset role'); await db.exec(`set request.jwt.claim.sub = '${user}'`); await db.exec('set role authenticated'); };
const search = async (args = {}) => {
  const { rows: result } = await db.query('select ticket, total_count from search_ticket_archive($1,$2,$3,$4,$5,$6,$7,$8)',
    [args.query ?? null, args.status ?? 'todos', args.scope ?? 'todos', args.from ?? null, args.to ?? null, args.serial ?? null, args.limit ?? 20, args.offset ?? 0]);
  return { folios: result.map(row => row.ticket.numero_caso), total: Number(result[0]?.total_count ?? 0), tickets: result.map(row => row.ticket) };
};

const inbox = async (since) => (await db.query('select numero_caso from get_ticket_inbox($1) order by creado_en desc, id', [since])).rows.map(row => row.numero_caso);
const since = new Date(Date.parse('2026-10-13T12:00:00Z') - 30 * 86400000).toISOString();

await as(ADMIN);
assert.deepEqual(await inbox(since), ['0O207T61', 'BIO-1200'], 'open cases plus anything opened, updated or closed in the window');
assert.deepEqual(await inbox(null), ['0O207T61', '0O209T63', '0O208T62', 'BIO-1200', 'BIO-120', 'BIO-12'], 'null window: the whole history');
assert.deepEqual((await search()).folios, ['0O207T61', '0O209T63', '0O208T62', 'BIO-1200', 'BIO-120', 'BIO-12'], 'newest first without criteria');
assert.deepEqual((await search({ query: 'bio-12' })).folios, ['BIO-12', 'BIO-1200', 'BIO-120'], 'the exact folio leads, then the newest partial matches');
assert.deepEqual((await search({ query: 'garcia' })).folios, ['0O208T62', 'BIO-120'], 'accent-insensitive: description and planning engineer');
assert.deepEqual((await search({ query: 'QUIMICA rango' })).folios, ['BIO-120'], 'every word must match, case and accents ignored');
assert.deepEqual((await search({ query: 'angeles pedregal' })).folios, ['0O207T61', 'BIO-120', 'BIO-12'], 'client registered for the serial, even with spaces in the stored serial');
assert.deepEqual((await search({ query: 'Diego' })).folios, ['0O208T62', 'BIO-120'], 'assignee and planning names');
assert.deepEqual((await search({ query: '6141772897' })).folios, ['BIO-12'], 'phone digits without punctuation');
assert.deepEqual((await search({ query: 'clinicasur.mx' })).folios, ['BIO-1200'], 'guest e-mail');
assert.deepEqual((await search({ query: 'a+(b[' })).folios, [], 'regex characters are literal');
assert.deepEqual((await search({ status: 'abiertos' })).folios, ['0O207T61']);
assert.deepEqual((await search({ status: 'cerrados', scope: 'soporte' })).folios, ['BIO-1200', 'BIO-120', 'BIO-12']);
assert.deepEqual((await search({ scope: 'planeacion' })).folios, ['0O209T63', '0O208T62']);
assert.deepEqual((await search({ from: '2024-05-10', to: '2025-01-15' })).folios, ['BIO-1200', 'BIO-120'], 'inclusive opening days');
assert.deepEqual((await search({ serial: ' 832 000706 ', status: 'cerrados' })).folios, ['BIO-120', 'BIO-12'], 'exact serial for recurrences');
const page2 = await search({ limit: 2, offset: 2 });
assert.deepEqual(page2.folios, ['0O208T62', 'BIO-1200']);
assert.equal(page2.total, 6, 'the total ignores the page');
assert.equal((await search({ limit: 5000 })).folios.length, 6, 'the page size is capped, never an error');
const sample = (await search({ query: 'BIO-12' })).tickets[0];
assert.equal(sample.id, id(1));
assert.equal(sample.estado, 'cerrado');
assert.equal(sample.numero_serie_equipo, '832000706');

// Technicians: only what the inbox shows them, even though RLS lets staff read every planning.
await as(ALFREDO);
assert.deepEqual(await inbox(since), ['0O207T61'], 'a technician\'s working set is personal');
assert.deepEqual(await inbox(null), ['0O207T61', '0O209T63', 'BIO-12'], 'own, assigned and planning naming Alfredo');
assert.deepEqual((await search()).folios, ['0O207T61', '0O209T63', 'BIO-12'], 'own, assigned and planning naming Alfredo');
await assert.rejects(db.query('select * from ticket_personal_scope()'), /permission denied/, 'the scope helper is internal');
assert.deepEqual((await search({ query: 'garcia' })).folios, [], 'another engineer\'s planning never appears');
await as(DIEGO);
assert.deepEqual((await search()).folios, ['0O208T62', 'BIO-120']);

await db.exec('reset role');
await db.exec('set role anon');
await assert.rejects(db.query('select * from search_ticket_archive()'), /permission denied/);
await assert.rejects(db.query('select * from get_ticket_inbox()'), /permission denied/);
await db.exec('reset role');
console.log('PASS: inbox working set and archive search — accents, exact folio first, client/assignee/phone/e-mail lookup, filters, paging and per-person boundary');
