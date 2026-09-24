// Run: PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node supabase/tests/ticket_service_metrics.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`
create role authenticated; create role anon; create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create table profiles(id uuid primary key, rol text);
create function is_staff() returns boolean language sql as $$ select exists(select 1 from profiles where id=auth.uid() and rol in ('admin','tecnico')) $$;
create function is_admin() returns boolean language sql as $$ select exists(select 1 from profiles where id=auth.uid() and rol='admin') $$;
create table user_module_permissions(user_id uuid, modules text[], sub_permissions jsonb);
create type ticket_status as enum('abierto','cerrado');
create table tickets(id uuid primary key,estado ticket_status default 'abierto',creado_en timestamptz default now(),numero_serie_equipo text);
create table ticket_bitacora(ticket_id uuid,numero_serie_equipo text,tipo text,detalle text,estado_resultante ticket_status,visible_cliente boolean,creado_por uuid);
create function sync_log() returns trigger language plpgsql as $$ begin update tickets set estado=coalesce(new.estado_resultante,estado) where id=new.ticket_id; return new; end $$;
create trigger sync_log after insert on ticket_bitacora for each row execute function sync_log();
insert into profiles values ('00000000-0000-0000-0000-000000000001','tecnico'),('00000000-0000-0000-0000-000000000002','admin'),('00000000-0000-0000-0000-000000000003','cliente');
insert into tickets(id,creado_en) values ('10000000-0000-0000-0000-000000000001',now()-interval '49 hours'),('10000000-0000-0000-0000-000000000002',now());
grant usage on schema public,auth to authenticated; grant select on profiles to authenticated;
`);
await db.exec(await readFile(new URL('../migrations/20260924010000_ticket_service_metrics.sql', import.meta.url), 'utf8'));
const user = async n => db.exec(`set test.uid = '00000000-0000-0000-0000-00000000000${n}'`);
const record = (kind, id=1, detail='Detalle verificable') => db.query('select register_ticket_service_event($1,$2,$3)', [`10000000-0000-0000-0000-00000000000${id}`,kind,detail]);
await user(3);
await assert.rejects(record('respuesta'), /Acceso restringido/);
await user(1);
await record('respuesta');
await assert.rejects(record('respuesta'), /unique/);
await assert.rejects(record('justificacion'), /Solo administración/);
await assert.rejects(record('cierre',1,' '), /Escribe un detalle/);
await record('cierre');
assert.equal((await db.query('select estado from tickets where id=$1',['10000000-0000-0000-0000-000000000001'])).rows[0].estado,'cerrado');
assert.equal((await db.query("select count(*)::int as n from ticket_service_events where kind='cierre'")).rows[0].n,1);
await assert.rejects(record('respuesta'), /ya está cerrado/);
await user(2);
await record('justificacion');
await assert.rejects(record('justificacion',2), /no excedió/);
await db.exec("insert into user_module_permissions values ('00000000-0000-0000-0000-000000000001',array['tickets'],'{\"tickets\":[\"aprobar_demoras\"]}')");
await user(1);
assert.equal((await db.query('select can_approve_ticket_delay() as ok')).rows[0].ok,true);
await db.exec('set role authenticated');
await assert.rejects(db.exec("update ticket_service_events set detail='alterado'"), /permission denied/);
await assert.rejects(db.exec('delete from ticket_service_events'), /permission denied/);
await db.exec('reset role');
await db.exec("update tickets set estado='cerrado' where id='10000000-0000-0000-0000-000000000002'");
assert.equal((await db.query("select count(*)::int as n from ticket_service_events where kind='cierre'")).rows[0].n,2);
await assert.rejects(db.exec("update tickets set creado_en=now()"), /inmutable/);
await db.exec(`
 insert into tickets(id,estado,creado_en) values
 ('10000000-0000-0000-0000-000000000003','cerrado',now()-interval '72 hours'),
 ('10000000-0000-0000-0000-000000000004','cerrado',now()-interval '72 hours'),
 ('10000000-0000-0000-0000-000000000005','abierto',now()-interval '50 hours');
 insert into ticket_service_events(ticket_id,kind,detail,actor_id,occurred_at)
 select id,'cierre','Solución límite',auth.uid(),creado_en+interval '48 hours' from tickets where id='10000000-0000-0000-0000-000000000004';
`);
await assert.rejects(record('justificacion',3), /histórico/);
await assert.rejects(record('justificacion',4), /no excedió/);
await record('justificacion',5);
await record('cierre',5);
assert.equal((await db.query("select count(*)::int as n from ticket_service_events where ticket_id='10000000-0000-0000-0000-000000000005'")).rows[0].n,2);
console.log('PASS: authorization, first response uniqueness, closure, delay approval, delegated manager, immutable events, legacy closure, immutable opening date');
await db.close();
