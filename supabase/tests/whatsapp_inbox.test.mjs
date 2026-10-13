// Run: PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node supabase/tests/whatsapp_inbox.test.mjs
// Loads the WhatsApp outbox migrations plus 20261013060000 on embedded PostgreSQL and checks the inbox:
// idempotent ingest, ticket linking, delivery statuses, BAJA/ALTA, admin-only access and the thread.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const migration = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const ADMIN = '00000000-0000-4000-8000-0000000000a1', TECH = '00000000-0000-4000-8000-0000000000b2';
const LINE = '111111111111111', OTHER_LINE = '222222222222222', PHONE = '526141772897';

await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
grant usage on schema public to anon, authenticated, service_role;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table profiles(id uuid primary key, nombre_completo text, rol text);
create function is_admin() returns boolean language sql stable security definer set search_path = public as
 $$ select exists(select 1 from public.profiles where id = auth.uid() and rol = 'admin') $$;
create type ticket_status as enum ('abierto','en_progreso','pendiente_piezas','en_observacion','cerrado');
create sequence case_seq;
create table tickets(id uuid primary key default gen_random_uuid(), user_id uuid, asunto text, estado ticket_status default 'abierto',
 creado_en timestamptz default now(), numero_caso text default 'OR-' || nextval('case_seq'), numero_serie_equipo text, telefono_cliente_guest text);
create table ticket_service_events(ticket_id uuid, kind text);
create table ticket_satisfaction(id uuid primary key, ticket_id uuid, is_test boolean, token text);
create table equipos(numero_serie text, pais text);
create function normalize_equipment_serial(value text) returns text language sql immutable as $$ select nullif(upper(replace(trim(value), ' ', '')), '') $$;
insert into equipos values ('SERIE', 'MEXICO');
insert into auth.users values ('${ADMIN}'), ('${TECH}');
insert into profiles values ('${ADMIN}', 'Ana Admin', 'admin'), ('${TECH}', 'Tomás Técnico', 'tecnico');
`);
for (const name of ['20260930010000_ticket_whatsapp_messages.sql', '20261003010000_ticket_whatsapp_automation.sql', '20261003020000_ticket_whatsapp_equipment_country.sql', '20261013060000_whatsapp_inbox.sql']) {
  await db.exec(await migration(name));
}

const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const ticket = async (asunto, phone, creado) => (await one(
  `insert into tickets(asunto, numero_serie_equipo, telefono_cliente_guest, creado_en) values ($1, 'SERIE', $2, $3) returning id, numero_caso`,
  [asunto, phone, creado])).id;
let sequence = 0;
const inbound = async ({ id = `wamid.in${++sequence}`, line = LINE, phone = PHONE, body = 'Hola', kind = 'text', context = null, at = new Date(Date.now() - 60000 + sequence * 1000).toISOString(), media = null } = {}) =>
  (await one(`select record_whatsapp_inbound($1, $2, $3, 'Laura Q', $4, $5, $6, null, $7, $8, null, $9, $10) as r`,
    [line, line === LINE, phone, id, kind, body, media, media ? 'image/jpeg' : null, context, at])).r;
const linkOf = async conversation => (await one('select ticket_id from whatsapp_conversations where id = $1', [conversation])).ticket_id;
const asUser = async (user, fn) => {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${user}'`);
  try { return await fn(); } finally { await db.exec(`reset role; reset request.jwt.claim.sub`); }
};

// Tickets and an automatic notice Meta accepted; the phone is captured in a different format.
const t1 = await ticket('Soporte Ingeniero: falla 1', '614 177 2897', '2026-10-01T10:00:00Z');
await db.exec(`update ticket_whatsapp_outbox set status = 'accepted', provider_message_id = 'wamid.out1' where ticket_id = '${t1}'`);

// Ingest: conversation + phone-linked ticket; Meta retries are absorbed by the message id.
const first = await inbound({ id: 'wamid.in-first', body: 'Sigue marcando error' });
assert.equal(first.duplicate, false); assert.equal(first.ticket_id, t1);
assert.equal((await inbound({ id: 'wamid.in-first', body: 'Sigue marcando error' })).duplicate, true);
assert.equal((await one('select count(*)::int as n from whatsapp_inbound_messages')).n, 1);
const conversation = first.conversation_id;
const conv = await one('select * from whatsapp_conversations where id = $1', [conversation]);
assert.equal(conv.phone_key, '6141772897'); assert.equal(conv.display_name, 'Laura Q'); assert.equal(conv.last_direction, 'in');

// A newer open ticket does not steal an open link; a reply to our notice names its ticket.
const t2 = await ticket('Soporte Químico: falla 2', '+52 1 614 177 2897', '2026-10-05T10:00:00Z');
await inbound({ body: 'Otro dato' }); assert.equal(await linkOf(conversation), t1);
assert.equal((await inbound({ body: 'Respondo a su aviso', context: 'wamid.out1' })).ticket_id, t1);
// Once that ticket closes, the newest open ticket with this phone takes over.
await db.exec(`update tickets set estado = 'cerrado' where id = '${t1}'`);
assert.equal((await inbound({ body: 'Ya cerraron el anterior' })).ticket_id, t2);

// Delivery statuses only move forward and reach both outbound tables.
assert.equal((await one(`select record_whatsapp_status('wamid.out1', 'delivered', now(), null) as n`)).n, 1);
assert.equal((await one(`select record_whatsapp_status('wamid.out1', 'sent', now(), null) as n`)).n, 0);
assert.equal((await one(`select record_whatsapp_status('wamid.out1', 'read', now(), null) as n`)).n, 1);
assert.equal((await one(`select record_whatsapp_status('wamid.out1', 'bogus', now(), null) as n`)).n, 0);
assert.equal((await one(`select delivery_status from ticket_whatsapp_outbox where provider_message_id = 'wamid.out1'`)).delivery_status, 'read');

// BAJA: opt-out, pending notices skipped, new notices born skipped. ALTA re-enables new ones only.
await db.exec(`update ticket_whatsapp_outbox set status = 'queued', provider_message_id = null where ticket_id = '${t2}'`);
assert.equal((await inbound({ body: '  Baja. ' })).opt, 'out');
assert.equal((await one(`select status from ticket_whatsapp_outbox where ticket_id = '${t2}' and event = 'received'`)).status, 'skipped');
const t3 = await ticket('Soporte Ingeniero: falla 3', '6141772897', '2026-10-06T10:00:00Z');
assert.equal((await one(`select status, error_message from ticket_whatsapp_outbox where ticket_id = '${t3}'`)).status, 'skipped');
assert.equal((await inbound({ body: 'baja por favor' })).opt, null, 'only the bare word opts out');
assert.equal((await inbound({ body: 'ALTA' })).opt, 'in');
assert.equal((await one('select count(*)::int as n from whatsapp_opt_outs')).n, 0);
const t4 = await ticket('Soporte Ingeniero: falla 4', '6141772897', '2026-10-07T10:00:00Z');
assert.equal((await one(`select status from ticket_whatsapp_outbox where ticket_id = '${t4}'`)).status, 'queued');
await inbound({ body: 'STOP' });

// Another Orion number: stored and shown, but never tied to tickets or to the ticket line's history.
const other = await inbound({ line: OTHER_LINE, body: 'Mensaje a asesorías', media: 'media-1', kind: 'image' });
assert.equal(other.ticket_id, null);

// Access: only administrators read; nobody but the service role writes.
await asUser(TECH, async () => {
  assert.equal((await db.query('select * from whatsapp_conversations')).rows.length, 0);
  assert.equal((await db.query('select * from whatsapp_inbound_messages')).rows.length, 0);
  assert.equal((await one('select whatsapp_unread_count() as n')).n, 0);
  await assert.rejects(db.query('select whatsapp_inbox()'), /Solo administración/);
  await assert.rejects(db.query('select whatsapp_thread($1)', [conversation]), /Solo administración/);
  await assert.rejects(db.query('select mark_whatsapp_conversation_read($1)', [conversation]), /Solo administración/);
  await assert.rejects(db.query(`select record_whatsapp_inbound('1', true, '${PHONE}', null, 'x', 'text', 'x', null, null, null, null, null, now())`), /permission denied/);
  await assert.rejects(db.query(`select record_whatsapp_status('wamid.out1', 'read', now(), null)`), /permission denied/);
  await assert.rejects(db.query(`update whatsapp_conversations set ticket_id = null`), /permission denied/);
});

const t2Case = (await one(`select numero_caso from tickets where id = '${t2}'`)).numero_caso;
await asUser(ADMIN, async () => {
  const inbox = (await one('select whatsapp_inbox() as r')).r;
  assert.equal(inbox.length, 2);
  const row = inbox.find(item => item.id === conversation);
  assert.equal(row.is_ticket_line, true); assert.equal(row.opted_out, true); assert.equal(row.unread, 8);
  assert.equal(row.ticket_id, t2); assert.equal(row.numero_caso, t2Case);
  assert.equal((await one('select whatsapp_unread_count() as n')).n, 9);
  const thread = (await one('select whatsapp_thread($1) as r', [conversation])).r;
  assert.equal(thread.conversation.opted_out, true);
  assert.ok(thread.messages.some(item => item.source === 'auto' && item.template === 'orion_ticket_recibido_v1' && item.delivery_status === 'read'));
  assert.equal(thread.messages.filter(item => item.direction === 'in').length, 8);
  assert.deepEqual([...thread.messages].map(item => item.at), [...thread.messages].map(item => item.at).sort(), 'thread is chronological');
  assert.equal(thread.tickets.length, 4);
  const otherThread = (await one('select whatsapp_thread($1) as r', [other.conversation_id])).r;
  assert.equal(otherThread.messages.length, 1); assert.equal(otherThread.messages[0].kind, 'image');
  await db.query('select mark_whatsapp_conversation_read($1)', [conversation]);
  assert.equal((await one('select whatsapp_unread_count() as n')).n, 1);
  await db.query('select link_whatsapp_conversation($1, $2)', [conversation, t1]);
  await assert.rejects(db.query('select link_whatsapp_conversation($1, $2)', [conversation, '00000000-0000-4000-8000-00000000dead']), /Ticket no encontrado/);
});
assert.equal(await linkOf(conversation), t1);
assert.equal((await one('select last_read_by from whatsapp_conversations where id = $1', [conversation])).last_read_by, ADMIN);
// An admin's manual link to a closed ticket yields to the newest open one on the next message.
assert.equal((await inbound({ body: 'Sigo aquí' })).ticket_id, t4);

await db.close();
console.log('PASS: idempotent ingest, phone/context ticket linking, forward-only delivery statuses, BAJA/ALTA, other lines, admin-only access, inbox, thread, read marks and manual links');
