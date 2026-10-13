// Run: PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node supabase/tests/advisory_whatsapp_bridge.test.mjs
// Loads the WhatsApp migrations plus 20261013090000 on embedded PostgreSQL and checks the advisory bridge:
// new-advisory notices, mirrored replies (who receives them), stale-screen merge, WhatsApp → thread routing,
// claim enrichment, delivery statuses and access control.
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

// 1) New advisory: each assigned trainer gets a notice; the requester never notifies themself.
const A = (await one(`insert into asesorias_escaladas(ticket_id, solicitante_id, area, consulta_escalada, solicitante_nombre_snapshot, plataforma_snapshot)
  values ($1, $2, 'ingenieria', 'El rotor no centra', 'Alfredo R.', 'BA400') returning id`, [id(90), REQ])).id;
await db.query(`insert into asesorias_escaladas_destinatarios(asesoria_id, destinatario_id) values ($1, $2), ($1, $3), ($1, $4)`, [A, T1, T2, REQ]);
assert.deepEqual((await outbox(A)).map(row => [row.event, row.recipient_id]), [['new_advisory', T1], ['new_advisory', T2]]);

// 2) Requester writes before any trainer answered → every assigned trainer.
await appSave(A, msg('m1', 'requester', REQ, '¿Alguna idea?'));
assert.deepEqual((await outbox(A)).filter(row => row.message_id === 'm1').map(row => row.recipient_id).sort(), [T1, T2]);
// 3) Trainer T1 answers → requester. 4) Requester again → only T1, who answered.
await appSave(A, msg('m2', 'trainer', T1, 'Revisa la jeringa'));
assert.deepEqual((await outbox(A)).filter(row => row.message_id === 'm2').map(row => row.recipient_id), [REQ]);
await appSave(A, msg('m3', 'requester', REQ, 'Ya la revisé'));
assert.deepEqual((await outbox(A)).filter(row => row.message_id === 'm3').map(row => row.recipient_id), [T1]);
// Materialized legacy/initial messages and status updates never notify.
await appSave(A, { id: 'legacy-trainer-response', kind: 'reply', role: 'trainer', actorId: T1, body: 'viejo', createdAt: '2026-01-01T00:00:00.000Z', attachments: [] });
await appSave(A, { id: 's1', kind: 'status_update', role: 'system', actorId: null, body: 'Estado actualizado', createdAt: new Date().toISOString(), attachments: [] });
assert.equal((await outbox(A)).filter(row => ['legacy-trainer-response', 's1'].includes(row.message_id)).length, 0);

// 5) WhatsApp from T1 (auth phone in another format) lands in the thread and goes to the requester.
const waReply = await inbound('526142220003', 'Cambia el sello del rotor');
assert.equal(waReply.route.advisory_id, A); assert.equal(waReply.route.pending, true);
const appended = (await one('select append_advisory_whatsapp_message($1) as r', [waReply.id])).r;
assert.equal((await one('select append_advisory_whatsapp_message($1) as r', [waReply.id])).r, appended, 'append is idempotent');
let t = await thread(A);
const waMessage = t.find(item => item.id === appended);
assert.equal(waMessage.channel, 'whatsapp'); assert.equal(waMessage.role, 'trainer'); assert.equal(waMessage.actorName, 'Héctor Cortés'); assert.equal(waMessage.body, 'Cambia el sello del rotor');
assert.equal(t.filter(item => item.id === appended).length, 1);
assert.deepEqual((await outbox(A)).filter(row => row.message_id === appended).map(row => row.recipient_id), [REQ]);
const advisoryRow = await one('select respuesta_trainer, respondida_por_id, metadata from asesorias_escaladas where id = $1', [A]);
assert.equal(advisoryRow.respondida_por_id, T1); assert.equal(advisoryRow.metadata.serviceDesk.unreadRequester, 1); assert.equal(advisoryRow.metadata.serviceDesk.waitingOn, 'requester');

// 6) A screen loaded before that WhatsApp message saves: the message survives, and stripped fields come back.
const stale = t.filter(item => item.id !== appended).map(({ channel, ...rest }) => rest);
await appSave(A, msg('m4', 'requester', REQ, 'Gracias, ya quedó'), stale);
t = await thread(A);
assert.ok(t.some(item => item.id === appended && item.channel === 'whatsapp'), 'stale save must not erase the WhatsApp message');
assert.ok(t.some(item => item.id === 'm4'));
await db.query(`update asesorias_escaladas set metadata = jsonb_set(metadata, '{thread}', $2::jsonb) where id = $1`, [A, JSON.stringify(t.map(item => item.id === appended ? { ...item, channel: undefined, attachments: [] } : item))]);
assert.equal((await thread(A)).find(item => item.id === appended).channel, 'whatsapp');

// 7) Reply context beats recency: a reply to advisory B's notice goes to B even though A was updated later.
const B = (await one(`insert into asesorias_escaladas(solicitante_id, area, consulta_escalada) values ($1, 'quimica', 'Control fuera de rango') returning id`, [REQ])).id;
await db.query(`insert into asesorias_escaladas_destinatarios(asesoria_id, destinatario_id) values ($1, $2)`, [B, T1]);
await db.query(`update advisory_whatsapp_outbox set status = 'accepted', provider_message_id = 'wamid.B1', extra_message_ids = '{wamid.B1img}' where asesoria_id = $1`, [B]);
await db.query(`update asesorias_escaladas set actualizado_en = now() + interval '1 hour' where id = $1`, [A]);
assert.equal((await inbound('526142220003', 'Sobre la química', { context: 'wamid.B1' })).route.advisory_id, B);
assert.equal((await inbound('526142220003', 'Sin contexto')).route.advisory_id, A, 'without context: most recently active open advisory');
// Customers and reactions are never routed to advisories.
assert.equal((await inbound('526149990005', 'Hola, soy cliente')).route, null);
assert.equal((await inbound('526142220003', '👍', { kind: 'reaction' })).route, null);

// 8) Delivery statuses reach the advisory notices; attachment failures are recorded too.
assert.equal((await one(`select record_whatsapp_status('wamid.B1', 'read', now(), null) as n`)).n, 1);
assert.equal((await one(`select record_whatsapp_status('wamid.B1img', 'failed', now(), '131053 · Media upload error') as n`)).n, 1);
const delivered = await one(`select delivery_status, delivery_error from advisory_whatsapp_outbox where provider_message_id = 'wamid.B1'`);
assert.equal(delivered.delivery_status, 'read'); assert.match(delivered.delivery_error, /131053/);

// 9) Claim: phone, 24 h window (T1 wrote recently), names, label and the message body.
await db.exec('set role service_role');
const claimed = await rows('select * from claim_advisory_whatsapp()');
await db.exec('reset role');
assert.equal(claimed.length, 8, 'every queued notice (A: 2 new + 6 mirrored)');
await db.exec('set role service_role');
assert.equal((await rows('select * from claim_advisory_whatsapp()')).length, 0, 'claimed rows are not handed out twice');
await db.exec('reset role');
const toT1 = claimed.find(row => row.recipient_id === T1 && row.event === 'new_advisory');
assert.equal(toT1.recipient_phone, '526142220003'); assert.equal(toT1.window_open, true); assert.equal(toT1.label, '2J204N61 · 834000123');
assert.equal(toT1.requester_name, 'Alfredo R.'); assert.equal(toT1.consulta, 'El rotor no centra'); assert.equal(toT1.area, 'ingenieria');
const toT2 = claimed.find(row => row.recipient_id === T2);
assert.equal(toT2.recipient_phone, null); assert.equal(toT2.window_open, false);
const relay = claimed.find(row => row.message_id === 'm1');
if (relay) assert.equal(relay.body, '¿Alguna idea?');

// 10) Access: nobody but the service role reads the queue, claims, routes or appends.
await db.exec(`set role authenticated; set request.jwt.claim.sub = '${REQ}'`);
assert.equal((await rows('select * from advisory_whatsapp_outbox')).length, 0);
await assert.rejects(db.query('select * from claim_advisory_whatsapp()'), /permission denied/);
await assert.rejects(db.query('select route_whatsapp_inbound_to_advisory($1)', [waReply.id]), /permission denied/);
await assert.rejects(db.query('select append_advisory_whatsapp_message($1)', [waReply.id]), /permission denied/);
// The app's own save still works for staff and still queues the mirror.
await appSave(A, msg('m5', 'requester', REQ, 'Desde la app'));
await db.exec(`reset role; reset request.jwt.claim.sub`);
assert.deepEqual((await outbox(A)).filter(row => row.message_id === 'm5').map(row => row.recipient_id), [T1]);

// 11) Inbox: staff messages routed to an advisory are not unread customer messages; notices show in the thread.
await db.exec(`set role authenticated; set request.jwt.claim.sub = '${ADMIN}'`);
const inbox = (await one('select whatsapp_inbox() as r')).r;
const staffConversation = inbox.find(item => item.phone === '526142220003');
assert.equal(staffConversation.is_staff, true);
assert.equal(staffConversation.unread, 1, 'only the reaction (not routed) counts');
assert.equal((await one('select whatsapp_unread_count() as n')).n, 2, 'reaction + customer');
await db.exec(`reset role; reset request.jwt.claim.sub`);
await db.query(`update advisory_whatsapp_outbox set status = 'accepted', sent_to = '526142220003', provider_message_id = 'wamid.A-new' where asesoria_id = $1 and recipient_id = $2 and event = 'new_advisory'`, [A, T1]);
await db.exec(`set role authenticated; set request.jwt.claim.sub = '${ADMIN}'`);
const staffThread = (await one('select whatsapp_thread($1) as r', [staffConversation.id])).r;
await db.exec(`reset role; reset request.jwt.claim.sub`);
assert.ok(staffThread.messages.some(item => item.source === 'advisory' && item.kind === 'new_advisory' && item.body === 'El rotor no centra'));
assert.ok(staffThread.messages.some(item => item.direction === 'in' && item.advisory_id === A));

await db.close();
console.log('PASS: new-advisory notices, mirror recipients (all trainers until one answers), legacy/system skipped, WhatsApp → thread (idempotent, role, service desk), stale-screen merge, context routing, customers not routed, delivery statuses, claim enrichment, access control, inbox unread and notices');
