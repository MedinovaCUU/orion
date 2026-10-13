// Run: PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node supabase/tests/public_portal_guards.test.mjs
// Loads the WhatsApp outbox migrations plus 20261013010000 on embedded PostgreSQL and checks the public
// portal barriers: registered serials only, duplicates grouped as notes, limits and the +52 fallback.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const migration = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');

await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
grant usage on schema public to anon, authenticated, service_role;
create function is_admin() returns boolean language sql as $$ select false $$;
create type ticket_status as enum ('abierto','en_progreso','pendiente_piezas','en_observacion','cerrado');
create sequence case_seq;
create table tickets(id uuid primary key default gen_random_uuid(), user_id uuid, asunto text, descripcion text,
 estado ticket_status default 'abierto', creado_en timestamptz default now(), actualizado_en timestamptz default now(),
 numero_caso text default 'OR-' || nextval('case_seq'), numero_serie_equipo text, nombre_cliente_guest text, telefono_cliente_guest text);
create table ticket_bitacora(id uuid primary key default gen_random_uuid(), ticket_id uuid references tickets(id), numero_serie_equipo text,
 tipo text, detalle text check (char_length(btrim(detalle)) between 2 and 4000), estado_resultante ticket_status,
 visible_cliente boolean not null default true, creado_por uuid, creado_en timestamptz default now());
create table ticket_service_events(ticket_id uuid, kind text);
create table ticket_satisfaction(id uuid primary key, ticket_id uuid, is_test boolean, token text);
create table equipos(id text primary key, numero_serie text, modelo text, pais text, fecha_fin date, actualizado_en timestamptz);
create function normalize_equipment_serial(value text) returns text language sql immutable as $$ select nullif(upper(regexp_replace(trim(coalesce(value, '')), '\\s+', '', 'g')), '') $$;
create function ticket_routing_key(value text) returns text language sql immutable as $$ select lower(btrim(translate(coalesce(value,''),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'))) $$;
create function ticket_support_area(subject text) returns text language sql immutable as $$
 select case when ticket_routing_key(subject) ~ '^(\\[soporte ingeniero\\]|soporte ingeniero:)' then 'ingenieria'
 when ticket_routing_key(subject) ~ '^(\\[soporte quimico\\]|soporte quimico:)' then 'quimica' end $$;
create function ticket_is_planning(p_description text) returns boolean language sql immutable as $$ select position('[METADATA_PLANEACION]' in coalesce(p_description,'')) > 0 $$;
insert into equipos values
 ('1','834001902','BA400','MEXICO',null,now()),
 ('2','83105C1526','A15','MEXICO',null,now()),
 ('3','8310507965','A15',null,null,now()),
 ('4','832002677',null,null,null,now()),
 ('5','EU-2270780','IMLD','MEXICO',null,now()),
 ('6','F050',null,'MEXICO',null,now());
`);
for (const file of ['20261003010000_ticket_whatsapp_automation.sql', '20261003020000_ticket_whatsapp_equipment_country.sql', '20261013010000_public_portal_guards.sql', '20261013030000_public_portal_a15_cooler_serials.sql', '20261013040000_public_portal_unregistered_serials.sql']) {
  await db.exec(await migration(file));
}
console.log('PASS: migration applies on top of the WhatsApp outbox migrations');

const ip = value => db.exec(`select set_config('request.headers', '${JSON.stringify({ 'cf-connecting-ip': value, 'x-forwarded-for': '9.9.9.9' })}', false)`);
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const check = async serial => (await one('select check_public_equipment_serial($1) r', [serial])).r;
const submit = async (type, serial, name, phone, description, confirm) => confirm === undefined
  ? (await one('select submit_public_support_case($1,$2,$3,$4,$5) r', [type, serial, name, phone, description])).r
  : (await one('select submit_public_support_case($1,$2,$3,$4,$5,$6) r', [type, serial, name, phone, description, confirm])).r;
const count = async sql => Number((await one(`select count(*) n from ${sql}`)).n);
await ip('10.0.0.1');
await db.exec('set role anon');

// 1. Serial check: format, product code, old A15 label, unknown, separators and "SN" prefix.
assert.equal((await check('9')).status, 'formato');
assert.equal((await check('hola mundo')).status, 'formato');
assert.equal((await check('f050')).status, 'ok', 'a registered serial is valid even if it looks odd');
for (const junk of ['000000', '0000004397', '123456', '1234567899999', '5555555', '1111111111']) {
  assert.equal((await check(junk)).status, 'formato', `${junk} is not a serial`);
}
assert.equal((await check('(01)08435287131055')).status, 'producto');
assert.equal((await check('07965')).status, 'incompleto');
assert.deepEqual(await check('834005555'), { status: 'no_encontrado', serie: null, modelo: 'BA400' });
assert.deepEqual(await check('SN: 83400-1902'), { status: 'ok', serie: '834001902', modelo: 'BA400' });
assert.deepEqual(await check('83105 c 1526'), { status: 'ok', serie: '83105C1526', modelo: 'A15' });
assert.deepEqual(await check('eu 2270780'), { status: 'ok', serie: 'EU-2270780', modelo: 'IMLD' });
assert.equal((await check('832002677')).modelo, 'BA200', 'model falls back to the serial family');
// A15 with cooler: 83105C + 4 digits and REF 83105 + SN 0xxxx are the same equipment; the 9-digit series is not.
assert.deepEqual(await check('83105C7965'), { status: 'ok', serie: '8310507965', modelo: 'A15' });
assert.deepEqual(await check('8310501526'), { status: 'ok', serie: '83105C1526', modelo: 'A15' });
assert.equal((await check('831057965')).status, 'no_encontrado');
console.log('PASS: serial check (format, product code, old label, unknown, separators, SN prefix, model family, A15 cooler forms)');

// 2. Unknown serial: rejected, nothing created, attempt logged.
let r = await submit('Ingeniero', '83109986', 'María López', '6141234567', 'El equipo no enciende desde ayer');
assert.equal(r.status, 'serie'); assert.equal(r.motivo, 'no_encontrado');
await db.exec('reset role');
assert.equal(await count('tickets'), 0);
assert.equal(await count("public_portal_attempts where kind='alta' and outcome='serie_no_encontrado'"), 1);
await db.exec('set role anon');
let ticket, outbox;

// 2b. A plausible serial that is not registered: rejected unless the customer confirms it.
assert.equal(r.confirmable, true);
r = await submit('Ingeniero', '83109986', 'María López', '6141234567', 'El equipo no enciende desde ayer', false);
assert.equal(r.status, 'serie'); assert.equal(r.confirmable, true);
r = await submit('Ingeniero', '9', 'María López', '6141234567', 'El equipo no enciende desde ayer', true);
assert.equal(r.status, 'serie'); assert.equal(r.motivo, 'formato'); assert.equal(r.confirmable, false, 'a non-serial cannot be confirmed');
r = await submit('Ingeniero', '123456', 'María López', '6141234567', 'El equipo no enciende desde ayer', true);
assert.equal(r.motivo, 'formato');
r = await submit('Químico', 'sn 8310-151004', 'Rosa Díaz', '6143217654', 'El A25 marca error de cubetas', true);
assert.equal(r.status, 'creado'); assert.equal(r.registrado, false);
const unregistered = r.numero_caso;
await db.exec('reset role');
ticket = await one('select * from tickets where numero_caso=$1', [unregistered]);
assert.equal(ticket.asunto, 'Soporte Químico: Reporte en equipo no registrado 8310151004');
assert.equal(ticket.numero_serie_equipo, '8310151004');
assert.match((await one("select detalle from ticket_bitacora where ticket_id=$1 and tipo='nota' and visible_cliente=false", [ticket.id])).detalle,
  /^Equipo no registrado: el cliente confirmó desde el portal que la serie 8310151004 es correcta/);
outbox = await one('select * from ticket_whatsapp_outbox where ticket_id=$1', [ticket.id]);
assert.equal(outbox.recipient, '+526143217654', 'no equipment country: WhatsApp still goes out with +52');
await db.exec('set role anon');
r = await submit('Químico', '8310151004', 'Luis Mora', '6145556677', 'Seguimos con el error de cubetas', true);
assert.equal(r.status, 'agrupado'); assert.equal(r.numero_caso, unregistered); assert.equal(r.registrado, false);
await db.exec('reset role');
assert.match((await one("select detalle from ticket_bitacora where ticket_id=$1 and detalle like 'Reporte adicional%'", [ticket.id])).detalle, /serie no registrada, confirmada por el cliente/);
await db.exec("update tickets set estado='cerrado'");
await db.exec('set role anon');
console.log('PASS: unregistered serial needs confirmation, is marked for staff, gets WhatsApp and groups repeats; non-serials never pass');

// 3. Field validation.
await ip('10.0.0.10');
for (const [args, field] of [
  [['Otro', '834001902', 'María López', '6141234567', 'El equipo no enciende'], 'tipo'],
  [['Ingeniero', '834001902', '12', '6141234567', 'El equipo no enciende'], 'nombre'],
  [['Ingeniero', '834001902', 'María López', '0000000000', 'El equipo no enciende'], 'telefono'],
  [['Ingeniero', '834001902', 'María López', '5555555555', 'El equipo no enciende'], 'telefono'],
  [['Ingeniero', '834001902', 'María López', '614123456', 'El equipo no enciende'], 'telefono'],
  [['Ingeniero', '834001902', 'María López', '6141234567', 'falla'], 'descripcion'],
  [['Ingeniero', '834001902', 'María López', '6141234567', 'x'.repeat(3001)], 'descripcion'],
]) {
  r = await submit(...args);
  assert.equal(r.status, 'datos'); assert.equal(r.campo, field, `${field} must be rejected`);
}
console.log('PASS: contact name, phone (no leading 0/1, no repeated digit), description length and support type');

// 4. A new case stores the registered serial, the phone digits and queues WhatsApp with the equipment country.
r = await submit('Ingeniero', 'sn 83400 1902', '  María\tLópez ', '614-123-4567', 'Marca error de lámpara al iniciar\u0007');
assert.equal(r.status, 'creado'); assert.equal(r.modelo, 'BA400');
const folio = r.numero_caso;
await db.exec('reset role');
ticket = await one('select * from tickets where numero_caso=$1', [folio]);
assert.equal(ticket.numero_serie_equipo, '834001902');
assert.equal(ticket.asunto, 'Soporte Ingeniero: Reporte en equipo 834001902');
assert.equal(ticket.telefono_cliente_guest, '6141234567');
assert.equal(ticket.nombre_cliente_guest, 'María López');
assert.equal(ticket.descripcion, 'Marca error de lámpara al iniciar');
outbox = await one('select * from ticket_whatsapp_outbox where ticket_id=$1', [ticket.id]);
assert.equal(outbox.status, 'queued'); assert.equal(outbox.recipient, '6141234567'); assert.equal(outbox.equipment_country, 'MEXICO');
await db.exec('set role anon');
console.log('PASS: new case uses the registered serial, clean contact data and queues WhatsApp with the equipment country');

// 5. Same equipment and area from another person: grouped as a staff-only note, no new case, no new WhatsApp.
r = await submit('Ingeniero', '834001902', 'Juan Pérez', '6147654321', 'También vemos que no aspira la muestra');
assert.deepEqual(r, { status: 'agrupado', repetido: false, numero_caso: folio, modelo: 'BA400', registrado: true });
await db.exec('reset role');
assert.equal(await count("tickets where estado <> 'cerrado'"), 1);
const note = await one("select * from ticket_bitacora where ticket_id=$1 and tipo='nota'", [ticket.id]);
assert.equal(note.visible_cliente, false);
assert.match(note.detalle, /Reporte adicional desde el portal \(Soporte Ingeniero\) de Juan Pérez, cel\. 6147654321:\nTambién vemos que no aspira la muestra/);
assert.equal(await count(`ticket_whatsapp_outbox where ticket_id='${ticket.id}'`), 1);
await db.exec('set role anon');

// 6. Double submit (same phone, same text): no second note. The first reporter's resend too.
r = await submit('Ingeniero', '834001902', 'Juan Pérez', '6147654321', 'También  vemos que no aspira la muestra');
assert.equal(r.status, 'agrupado'); assert.equal(r.repetido, true); assert.equal(r.numero_caso, folio);
r = await submit('Ingeniero', '834001902', 'María López', '6141234567', 'Marca error de lámpara al iniciar');
assert.equal(r.repetido, true);
await db.exec('reset role');
assert.equal(await count(`ticket_bitacora where tipo='nota' and ticket_id='${ticket.id}'`), 1);
await db.exec('set role anon');
console.log('PASS: duplicate report grouped as a staff-only note; identical resends add nothing');

// 7. Another area, a closed case and a planning entry do not absorb the report.
r = await submit('Químico', '834001902', 'María López', '6141234567', 'Los controles de glucosa salen altos');
assert.equal(r.status, 'creado'); assert.notEqual(r.numero_caso, folio);
await db.exec('reset role');
await db.exec(`update tickets set estado='cerrado'; insert into tickets(asunto, descripcion, numero_serie_equipo) values
 ('[Soporte Ingeniero] Mantenimiento', 'Visita [METADATA_PLANEACION]{}', '83105C1526')`);
await db.exec('set role anon');
r = await submit('Ingeniero', '834001902', 'María López', '6141234567', 'Volvió a marcar error de lámpara');
assert.equal(r.status, 'creado');
r = await submit('Ingeniero', '83105C1526', 'Ana Ruiz', '6561234567', 'El refrigerador no enfría');
assert.equal(r.status, 'creado');
console.log('PASS: different area, closed case and planning entry open a new case');

// 8. Equipment without a country: WhatsApp goes out as +52 instead of stopping.
await ip('10.0.0.2');
r = await submit('Ingeniero', '8310507965', 'Ana Ruiz', '6561234568', 'La pantalla se queda en negro');
assert.equal(r.status, 'creado');
await db.exec('reset role');
ticket = await one('select * from tickets where numero_caso=$1', [r.numero_caso]);
outbox = await one('select * from ticket_whatsapp_outbox where ticket_id=$1', [ticket.id]);
assert.equal(ticket.telefono_cliente_guest, '6561234568', 'the stored phone stays as typed');
assert.equal(outbox.recipient, '+526561234568'); assert.equal(outbox.status, 'queued'); assert.equal(outbox.equipment_country, null);
await db.exec('set role anon');
r = await submit('Ingeniero', '83105C7965', 'Pedro Sosa', '6562223344', 'Sigue sin encender la pantalla');
assert.equal(r.status, 'agrupado'); assert.equal(r.numero_caso, ticket.numero_caso, 'both A15 forms join the same case');
await db.exec('reset role');
await db.exec(`insert into tickets(id, user_id, asunto, numero_serie_equipo, telefono_cliente_guest) values
 ('20000000-0000-4000-8000-000000000001', gen_random_uuid(), '[Soporte Ingeniero] Interno', '832002677', '6141112233')`);
assert.equal((await one("select recipient from ticket_whatsapp_outbox where ticket_id='20000000-0000-4000-8000-000000000001'")).recipient, '6141112233',
  'internal tickets keep the original rule');
await db.exec('set role anon');
console.log('PASS: portal phones without an equipment country are sent with +52; internal tickets unchanged; A15 forms grouped');

// 9. Limits: 4 accepted reports per phone per hour, 20 attempts per connection per hour.
await ip('10.0.0.3');
const serials = ['834001902', '83105C1526', '8310507965', '832002677', 'EU-2270780'];
await db.exec('reset role'); await db.exec("update tickets set estado='cerrado'"); await db.exec('set role anon');
for (const [i, serial] of serials.slice(0, 4).entries()) assert.equal((await submit('Químico', serial, 'Luis Gómez', '8112223344', `Reporte número ${i} del día`)).status, 'creado');
r = await submit('Químico', serials[4], 'Luis Gómez', '8112223344', 'Quinto reporte del día');
assert.equal(r.status, 'limite');
await ip('10.0.0.4');
for (let i = 0; i < 20; i++) await submit('Ingeniero', `8340${String(i).padStart(5, '0')}`, 'Bot', '6141234567', 'spam spam spam');
r = await submit('Ingeniero', '834001902', 'María López', '6149998877', 'Un reporte legítimo');
assert.equal(r.status, 'limite');
await ip('10.0.0.5');
for (let i = 0; i < 60; i++) await check(`834${String(i).padStart(6, '0')}`);
assert.equal((await check('834001902')).status, 'limite');
console.log('PASS: per-phone, per-connection and serial-lookup limits');

// 10. Tracking needs the phone; failures are limited per connection and per folio.
await ip('10.0.0.6');
await db.exec('reset role');
await db.exec("insert into tickets(numero_caso, asunto, numero_serie_equipo) values ('BIO-1', 'Histórico sin teléfono', '834001902')");
await db.exec('set role anon');
assert.equal((await one("select track_public_support_case('BIO-1', '') r")).r, null, 'an empty phone must not open a case without phone');
assert.equal((await one("select track_public_support_case($1, '614 123 4567') r", [folio])).r.numero_caso, folio);
for (let i = 0; i < 9; i++) assert.equal((await one("select track_public_support_case($1, '6140000000') r", [folio])).r, null);
await ip('10.0.0.7');
assert.equal((await one("select track_public_support_case($1, '6140000000') r", [folio])).r, null);
await assert.rejects(db.query("select track_public_support_case($1, '614 123 4567')", [folio]), /Demasiadas consultas/);
console.log('PASS: tracking requires the phone and is limited per connection and per folio');

// 11. Legacy entry point keeps the rules; anon cannot read attempts or call internals.
await ip('10.0.0.8');
await assert.rejects(db.query("select * from create_public_support_case('Ingeniero','9','María López','6141234567','El equipo no enciende')"), /número de serie correcto/);
assert.match((await one("select * from create_public_support_case('Ingeniero','EU2270780','María López','6143334455','El equipo no enciende')")).numero_caso, /^OR-/);
await assert.rejects(db.query('select * from public_portal_attempts'), /permission denied/);
await assert.rejects(db.query("select * from resolve_portal_equipment('834001902')"), /permission denied/);
await assert.rejects(db.query('select portal_client_key()'), /permission denied/);
await db.exec('reset role');
await db.close();
console.log('PASS: legacy RPC applies the same rules; attempts table and helpers are not exposed to anon');
