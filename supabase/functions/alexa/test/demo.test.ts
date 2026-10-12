// Amazon's certification reviewer (public.alexa_reviewers, migration 20261012060000), against the throwaway DB:
//   deno test -A --no-lock --node-modules-dir=none supabase/functions/alexa/test/demo.test.ts
// The reviewer signs in to Orion but reads no Biosystems row, links Alexa like staff, and hears only demo.ts data;
// its writes are accepted by voice and never reach Orion (no bitácora, no WhatsApp, no drafts).
import { assert, assertEquals, assertMatch, assertNotMatch } from "jsr:@std/assert@1";
import { DB_URL, IDS, seed, TICKETS } from "./seed.ts";
import { buildBplDemoRows as fixtureRows } from "../../../../frontend/tests/fixtures/bplDemoData.mjs";
import { buildBplDemoRows as functionRows } from "../demoBpl.js";

Deno.env.set("ALEXA_NO_SERVE", "1");
Deno.env.set("ALEXA_SKIP_VERIFY", "1");
Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
Deno.env.set("SUPABASE_DB_URL", DB_URL);
Deno.env.delete("ANTHROPIC_API_KEY");
const { handler } = await import("../index.ts");
const { sql } = await import("../db.ts");
const { DEMO_SERIALS } = await import("../demo.ts");

const REVIEWER = { id: "a0000000-0000-4000-8000-0000000000ff", email: "revision.alexa@biosystems.com.mx", device: "amzn1.ask.account.TEST-REVISOR" };
const DEMO_CASE = { falcon: "d1000000-0000-4000-8000-000000000001", glucosa: "d1000000-0000-4000-8000-000000000002" };

async function seedReviewer() {
  await seed();
  await sql`insert into auth.users (id, email, aud, role, instance_id) values (${REVIEWER.id}, ${REVIEWER.email}, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000') on conflict (id) do nothing`;
  await sql`insert into public.profiles (id, nombre_completo, rol) values (${REVIEWER.id}, 'Revisión Alexa', 'cliente') on conflict (id) do update set rol = 'cliente'`;
  await sql`insert into public.alexa_reviewers (email) values (${REVIEWER.email}) on conflict do nothing`;
  await sql`delete from public.alexa_links where user_id = ${REVIEWER.id}`;
  await sql`insert into public.alexa_links (alexa_user_id, user_id) values (${REVIEWER.device}, ${REVIEWER.id})`;
}
/** Runs a query as a signed-in person, exactly like PostgREST would. */
async function asPerson<T>(id: string, email: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return (await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: id, role: "authenticated", email })}, true), set_config('request.jwt.claim.sub', ${id}, true)`;
    await tx.unsafe("set local role authenticated");
    return await fn(tx);
  })) as T;
}
const count = async (tx: any, table: string) => Number(((await tx.unsafe(`select count(*)::int as n from public.${table}`)) as Array<{ n: number }>)[0]!.n);
/** Rows the reviewer could change in Orion (to prove the demo writes nothing). */
const footprint = async () => {
  const [r] = await sql`select (select count(*) from public.ticket_bitacora)::int as b, (select count(*) from public.ticket_whatsapp_outbox)::int as w,
    (select count(*) from public.ticket_service_events)::int as e, (select count(*) from public.tickets)::int as t, (select count(*) from public.ticket_assignments)::int as a,
    (select count(*) from public.alexa_pending_actions)::int as p, (select count(*) from public.alexa_voice_cases)::int as v`;
  return r;
};

type Attrs = Record<string, unknown>;
async function call(req: Record<string, unknown>, attrs: Attrs = {}) {
  const body = {
    version: "1.0",
    session: { new: false, sessionId: "s1", application: { applicationId: "amzn1.ask.skill.test" }, user: { userId: REVIEWER.device }, attributes: attrs },
    context: { System: { application: { applicationId: "amzn1.ask.skill.test" }, user: { userId: REVIEWER.device }, device: { supportedInterfaces: { "Alexa.Presentation.APL": { runtime: { maxVersion: "2023.2" } } } } } },
    request: { requestId: crypto.randomUUID(), timestamp: new Date().toISOString(), locale: "es-MX", ...req },
  };
  const res = await handler(new Request("http://localhost/alexa", { method: "POST", body: JSON.stringify(body) }));
  assertEquals(res.status, 200);
  const out = JSON.parse(await res.text());
  return { speech: String(out.response?.outputSpeech?.ssml ?? "").replace(/<[^>]+>/g, ""), attrs: (out.sessionAttributes ?? {}) as Attrs, end: Boolean(out.response?.shouldEndSession), card: out.response?.card as Record<string, unknown> | undefined };
}
const intent = (name: string, slots: Record<string, string> = {}) => ({
  type: "IntentRequest",
  intent: { name, confirmationStatus: "NONE", slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, { name: k, value: v }])) },
});
/** Nothing real may ever be spoken to the reviewer. */
const REAL = /Falcon Monterrey|Angeles|Juan Pérez|Ricardo|Laura Gómez|5512345678.*Hospital Angeles/;

Deno.test("database: the reviewer signs in but reads no Orion row (own profile only); staff are untouched", async () => {
  await seedReviewer();
  const seen = await asPerson(REVIEWER.id, REVIEWER.email, async (tx) => ({
    reviewer: ((await tx`select public.is_alexa_reviewer() as r`) as Array<{ r: boolean }>)[0]!.r,
    tickets: await count(tx, "tickets"), equipos: await count(tx, "equipos"), clientes: await count(tx, "clientes"),
    profiles: await count(tx, "profiles"), bitacora: await count(tx, "ticket_bitacora"), monitoreo: await count(tx, "monitoreo_errores_equipos"),
    permisos: await count(tx, "user_module_permissions"),
  }));
  assertEquals(seen, { reviewer: true, tickets: 0, equipos: 0, clientes: 0, profiles: 1, bitacora: 0, monitoreo: 0, permisos: 0 });
  // Writes are refused too (restrictive WITH CHECK).
  const insert = await asPerson(REVIEWER.id, REVIEWER.email, (tx) => tx`insert into public.tickets (user_id, asunto, descripcion) values (${REVIEWER.id}, 'x', 'x')`).then(() => "ok", (e: Error) => e.message);
  assertMatch(String(insert), /row-level security/);
  const staff = await asPerson(IDS.tecnico, "tecnico@orion.test", async (tx) => ({ reviewer: ((await tx`select public.is_alexa_reviewer() as r`) as Array<{ r: boolean }>)[0]!.r, equipos: await count(tx, "equipos") }));
  assertEquals(staff.reviewer, false);
  assert(staff.equipos >= 2);
  // Listing a staff e-mail never turns that person into a reviewer.
  await sql`insert into public.alexa_reviewers (email) values ('otro@orion.test') on conflict do nothing`;
  const other = await asPerson(IDS.otro, "otro@orion.test", async (tx) => ({ reviewer: ((await tx`select public.is_alexa_reviewer() as r`) as Array<{ r: boolean }>)[0]!.r, equipos: await count(tx, "equipos") }));
  await sql`delete from public.alexa_reviewers where email = 'otro@orion.test'`;
  assertEquals(other.reviewer, false);
  assert(other.equipos >= 2);
});

Deno.test("linking: the reviewer may claim a code (a plain client still may not)", async () => {
  await seedReviewer();
  await sql`delete from public.alexa_links where user_id = ${REVIEWER.id}`;
  await sql`insert into public.alexa_link_codes (code, alexa_user_id, expires_at) values ('424242', ${REVIEWER.device}, now() + interval '10 minutes')`;
  const r = await asPerson(REVIEWER.id, REVIEWER.email, (tx) => tx`select public.claim_alexa_code('424242') as s`);
  assertEquals((r as Array<{ s: string }>)[0]!.s, "ok");
  const client = await asPerson(IDS.cliente, "cliente@orion.test", (tx) => tx`select public.claim_alexa_code('000000') as s`).then(() => "ok", (e: Error) => e.message);
  assertMatch(String(client), /ingenieros, químicos y administradores/);
  const launch = await call({ type: "LaunchRequest" });
  assertMatch(launch.speech, /¿Qué revisamos\?/);
});

Deno.test("voice: summary, cases, log, equipment and controls come from the demo story", async () => {
  await seedReviewer();
  const before = await footprint();
  const said: string[] = [];
  const resumen = await call(intent("ResumenIntent"));
  said.push(resumen.speech);
  assertMatch(resumen.speech, /Laboratorio Demo Norte/);
  const mine = await call(intent("MisTicketsIntent"));
  said.push(mine.speech);
  assertMatch(mine.speech, /Hospital Demo Centro/);
  assertMatch(mine.speech, /3 casos|tres casos/);
  const log = await call(intent("CasoBitacoraIntent"), { ticketId: DEMO_CASE.glucosa });
  said.push(log.speech);
  assertMatch(log.speech, /regla uno tres s/);
  const eq = await call(intent("EquipoIntent", { serie: "9999" }));
  said.push(eq.speech);
  assertMatch(eq.speech, /Laboratorio Demo Norte/);
  const qc = await call(intent("ControlesIntent", { serie: "9999" }));
  said.push(qc.speech);
  assertMatch(qc.speech, /[Gg]lucosa/);
  const dia = await call(intent("MiDiaIntent"));
  said.push(dia.speech);
  assertMatch(dia.speech, /preventivo/i);
  const hist = await call(intent("HistorialEquipoIntent", { serie: "9999" }));
  said.push(hist.speech);
  assertMatch(hist.speech, /[Cc]alibración de glucosa/);
  const dx = await call(intent("DiagnosticoIntent", { serie: "9999", pa: "glucosa" }));
  said.push(dx.speech);
  assertMatch(dx.speech, /glucosa/i);
  // Alerts: the permission card in the Alexa app until notifications are allowed.
  const avisos = await call(intent("ActivarAvisosIntent"));
  assertMatch(avisos.speech, /Te dejé una tarjeta en la app de Alexa/);
  assertEquals(avisos.card, { type: "AskForPermissionsConsent", permissions: ["alexa::devices:all:notifications:write"] });
  for (const s of said) assertNotMatch(s, REAL);
  assertEquals(await footprint(), before);
});

Deno.test("voice writes: movement, first response with «confirmo», draft and new case save and send nothing", async () => {
  await seedReviewer();
  const before = await footprint();
  const p = await call(intent("AvanceIntent", { texto: "se revisó la lámpara y está fundida" }), { ticketId: DEMO_CASE.falcon });
  assertMatch(p.speech, /¿Lo guardo\?|sí, no o borrador|«sí»/);
  const ok = await call(intent("AMAZON.YesIntent"), p.attrs);
  assertMatch(ok.speech, /Listo\. Como es una cuenta de demostración, no se guardó ni se envió nada; con una cuenta de Ori[oó]n, quedaría en la bitácora del caso\./);
  const r = await call(intent("RespuestaClienteIntent", { texto: "le confirmé la visita de mañana" }), { ticketId: DEMO_CASE.falcon });
  const r1 = await call(intent("AMAZON.YesIntent"), r.attrs);
  assertMatch(r1.speech, /«confirmo»/);
  const r2 = await call(intent("ConfirmoIntent"), r1.attrs);
  assertMatch(r2.speech, /no se guardó ni se envió nada; con una cuenta de Ori[oó]n, quedaría registrada la primera respuesta, y el cliente recibiría el WhatsApp de confirmación\./);
  const d = await call(intent("NotaInternaIntent", { texto: "llevar lámpara de repuesto" }), { ticketId: DEMO_CASE.glucosa });
  const draft = await call(intent("BorradorIntent"), d.attrs);
  assertMatch(draft.speech, /borrador\. Como es una cuenta de demostración, no se guardó/);
  const pieza = await call(intent("RefaccionIntent", { pieza: "una lámpara halógena" }), { serial: DEMO_SERIALS.cdmx });
  assertMatch(pieza.speech, /no se guarda/);
  assertEquals(await footprint(), before);
});

Deno.test("demoBpl.js is the same generator as the frontend fixture", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  assertEquals(JSON.stringify(functionRows({ serial: "834009999", now })), JSON.stringify(fixtureRows({ serial: "834009999", now })));
});

Deno.test("cleanup", async () => {
  await sql`delete from public.alexa_links where user_id = ${REVIEWER.id}`;
  await sql.end();
  void TICKETS;
});
