// Run: PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node supabase/tests/advisory_whatsapp_exclusion.test.mjs
// Same harness as advisory_whatsapp_bridge.test.mjs, plus 20261013100000: an advisory marked whatsapp_desactivado
// (the owner's test advisory 2J204N61) never sends or receives WhatsApp, while other advisories keep the bridge.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const migration = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ADMIN = id(1), REQ = id(2), T1 = id(3), T2 = id(4), OTHER = id(5);
const LINE = '111111111111111';

await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
grant usage on schema public to anon, authenticated, service_role;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create table auth.users(id uuid primary key, phone text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema vault; create table vault.decrypted_secrets(name text, decrypted_secret text);
create table profiles(id uuid primary key, nombre_completo text, rol text, trainer_ingenieria boolean default false, trainer_quimica boolean default false);
create function is_admin() returns boolean language sql stable security definer set search_path = public as
 $$ select exists(select 1 from public.profiles where id = auth.uid() and rol = 'admin') $$;
create type ticket_status as enum ('abierto','en_progreso','pendiente_piezas','en_observacion','cerrado');
create table tickets(id uuid primary key default gen_random_uuid(), user_id uuid, asunto text, estado ticket_status default 'abierto',
 creado_en timestamptz default now(), numero_caso text, numero_serie_equipo text, telefono_cliente_guest text);
create table ticket_service_events(ticket_id uuid, kind text);
create table ticket_satisfaction(id uuid primary key, ticket_id uuid, is_test boolean, token text);
create table equipos(numero_serie text, pais text);
create function normalize_equipment_serial(value text) returns text language sql immutable as $$ select nullif(upper(replace(trim(value), ' ', '')), '') $$;
create type asesoria_area as enum ('ingenieria', 'quimica');
create type asesoria_estado as enum ('solicitada', 'en_revision', 'asesorada', 'cerrada');
create table asesorias_escaladas(id uuid primary key default gen_random_uuid(), ticket_id uuid references tickets(id), solicitante_id uuid references profiles(id),
 area asesoria_area not null, estado asesoria_estado not null default 'solicitada', consulta_escalada text not null, respuesta_trainer text,
 respondida_por_id uuid references profiles(id), respondida_en timestamptz, creado_en timestamptz not null default now(), actualizado_en timestamptz not null default now(),
 solicitante_nombre_snapshot text, plataforma_snapshot text, metadata jsonb not null default '{}'::jsonb);
create table asesorias_escaladas_destinatarios(id uuid primary key default gen_random_uuid(), asesoria_id uuid not null references asesorias_escaladas(id) on delete cascade,
 destinatario_id uuid not null references profiles(id), leida_en timestamptz, creado_en timestamptz not null default now(), unique (asesoria_id, destinatario_id));
grant select, insert, update on asesorias_escaladas, asesorias_escaladas_destinatarios to authenticated;
insert into profiles(id, nombre_completo, rol, trainer_ingenieria) values ('${ADMIN}', 'Ana Admin', 'admin', false), ('${REQ}', 'Alfredo Ramírez', 'tecnico', false),
 ('${T1}', 'Héctor Cortés', 'tecnico', true), ('${T2}', 'Martha Carbajal', 'tecnico', true), ('${OTHER}', 'Cliente Externo', 'cliente', false);
insert into auth.users values ('${ADMIN}', '526140000001'), ('${REQ}', '5216141110002'), ('${T1}', '526142220003'), ('${T2}', null), ('${OTHER}', '526149990005');
insert into tickets(id, numero_caso, numero_serie_equipo) values ('${id(90)}', '2J204N61', '834000123');
`);
for (const name of ['20260930010000_ticket_whatsapp_messages.sql', '20261003010000_ticket_whatsapp_automation.sql', '20261003020000_ticket_whatsapp_equipment_country.sql', '20261013060000_whatsapp_inbox.sql', '20261013090000_advisory_whatsapp_bridge.sql']) {
  await db.exec(await migration(name));
}

const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const outbox = async advisory => rows(`select event, message_id, recipient_id from advisory_whatsapp_outbox where asesoria_id = $1 order by created_at, recipient_id`, [advisory]);
const thread = async advisory => (await one('select metadata from asesorias_escaladas where id = $1', [advisory])).metadata.thread || [];
const msg = (mid, role, actor, body, extra = {}) => ({ id: mid, kind: 'reply', role, actorId: actor, actorName: role, body, createdAt: new Date().toISOString(), attachments: [], statusSnapshot: 'solicitada', ...extra });
// What the app does: read, append, write the whole thread back.
const appSave = async (advisory, message, base) => {
  const current = base ?? await thread(advisory);
  await db.query(`update asesorias_escaladas set metadata = jsonb_set(metadata, '{thread}', $2::jsonb) where id = $1`, [advisory, JSON.stringify([...current, message])]);
};
let wa = 0;
const inbound = async (phone, body, { context = null, kind = 'text' } = {}) => {
  const r = (await one(`select record_whatsapp_inbound($1, true, $2, null, $3, $4, $5, null, null, null, null, $6, now()) as r`, [LINE, phone, `wamid.in${++wa}`, kind, body, context])).r;
  return { ...r, route: (await one('select route_whatsapp_inbound_to_advisory($1) as r', [r.id])).r };
};


// The production test advisory (2J204N61) exists before the exclusion migration and already has a notice queued.
const TEST = '6140478b-9636-40ac-8a5f-fd34a03943d3';
await db.query(`insert into asesorias_escaladas(id, ticket_id, solicitante_id, area, consulta_escalada) values ($1, $2, $3, 'ingenieria', 'Prueba de rotor')`, [TEST, id(90), REQ]);
await db.query(`insert into asesorias_escaladas_destinatarios(asesoria_id, destinatario_id) values ($1, $2)`, [TEST, T1]);
assert.equal((await outbox(TEST)).length, 1, 'before the exclusion the bridge queued a notice for Héctor');
await db.exec(await migration('20261013100000_advisory_whatsapp_exclusion.sql'));
assert.equal((await one('select whatsapp_desactivado as off from asesorias_escaladas where id = $1', [TEST])).off, true, 'the test advisory is excluded');
assert.equal((await one(`select count(*)::int as n from advisory_whatsapp_outbox where asesoria_id = $1 and status = 'skipped'`, [TEST])).n, 1, 'its queued notice is skipped, never sent');

// A normal advisory keeps the full bridge.
const A = (await one(`insert into asesorias_escaladas(ticket_id, solicitante_id, area, consulta_escalada) values ($1, $2, 'quimica', 'Control fuera de rango') returning id`, [id(90), REQ])).id;
await db.query(`insert into asesorias_escaladas_destinatarios(asesoria_id, destinatario_id) values ($1, $2)`, [A, T2]);
assert.deepEqual((await outbox(A)).map(row => [row.event, row.recipient_id]), [['new_advisory', T2]]);

// Excluded: replies from the app (either side), new recipients and WhatsApp messages never reach the queue.
await appSave(TEST, msg('x1', 'requester', REQ, 'Sigue sin centrar'));
await appSave(TEST, msg('x2', 'trainer', T1, 'Revisa el sello'));
await db.query(`insert into asesorias_escaladas_destinatarios(asesoria_id, destinatario_id) values ($1, $2)`, [TEST, T2]);
assert.equal((await outbox(TEST)).length, 1, 'only the old skipped notice');
assert.equal((await thread(TEST)).length, 2, 'the thread in Orion still works');
// The excluded advisory is the most recent one Héctor belongs to, yet his WhatsApp is not routed into it.
await db.query(`update asesorias_escaladas set actualizado_en = now() + interval '1 hour' where id = $1`, [TEST]);
assert.equal((await inbound('526142220003', 'Sin contexto')).route, null, 'Héctor is not part of any other open advisory');
await db.query(`update advisory_whatsapp_outbox set status = 'accepted', provider_message_id = 'wamid.T1' where asesoria_id = $1`, [TEST]);
assert.equal((await inbound('526142220003', 'Respondo al aviso', { context: 'wamid.T1' })).route, null, 'not even replying to an old notice of it');
// Alfredo is in both; his WhatsApp goes to the normal advisory.
assert.equal((await inbound('5216141110002', '¿Alguna idea?')).route.advisory_id, A);

// Claim hands out only the normal advisory's work; anything queued later for the excluded one is skipped.
await db.query(`insert into advisory_whatsapp_outbox(asesoria_id, event, message_id, recipient_id) values ($1, 'message', 'late', $2)`, [TEST, REQ]);
await db.exec('set role service_role');
const claimed = await rows('select * from claim_advisory_whatsapp()');
await db.exec('reset role');
assert.deepEqual(claimed.map(row => row.asesoria_id), [A]);
assert.equal((await one(`select status from advisory_whatsapp_outbox where message_id = 'late'`)).status, 'skipped');

await db.close();
console.log('PASS: excluded advisory — queued notice skipped, no notices/mirrors/routing/claims for it, the thread still works, other advisories unaffected');
