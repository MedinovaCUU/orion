// End-to-end conversation tests against the throwaway DB (test/setup-db.sh, then this file seeds it).
//   deno test -A --no-lock --node-modules-dir=none supabase/functions/alexa/test/e2e.test.ts
import { assert, assertEquals, assertMatch, assertNotMatch } from "jsr:@std/assert@1";
import { DB_URL, DEVICES, IDS, seed, SERIAL_CDMX, SERIAL_FATAL, TICKETS } from "./seed.ts";

Deno.env.set("ALEXA_NO_SERVE", "1");
Deno.env.set("ALEXA_SKIP_VERIFY", "1");
Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
Deno.env.set("SUPABASE_DB_URL", DB_URL);
Deno.env.delete("ANTHROPIC_API_KEY");
const { handler } = await import("../index.ts");
const { sql } = await import("../db.ts");

type Attrs = Record<string, unknown>;
interface Said { speech: string; attrs: Attrs; end: boolean; directives: Array<Record<string, any>>; raw: any }

let APL_RUNTIME = "2023.2";
function request(device: string, req: Record<string, unknown>, attrs: Attrs = {}, apl = true, isNew = false) {
  return {
    version: "1.0",
    session: { new: isNew, sessionId: "s1", application: { applicationId: "amzn1.ask.skill.test" }, user: { userId: device }, attributes: attrs },
    context: { System: { application: { applicationId: "amzn1.ask.skill.test" }, user: { userId: device }, device: { supportedInterfaces: apl ? { "Alexa.Presentation.APL": { runtime: { maxVersion: APL_RUNTIME } } } : {} } } },
    request: { requestId: crypto.randomUUID(), timestamp: new Date().toISOString(), locale: "es-MX", ...req },
  };
}
async function call(device: string, req: Record<string, unknown>, attrs: Attrs = {}, apl = true, isNew = false): Promise<Said> {
  const res = await handler(new Request("http://localhost/alexa", { method: "POST", body: JSON.stringify(request(device, req, attrs, apl, isNew)) }));
  assertEquals(res.status, 200);
  const raw = await res.text();
  // Alexa rejects responses over 24 KB with "hubo un problema con la respuesta de la skill".
  assert(new TextEncoder().encode(raw).length <= 22_000, `response too big: ${raw.length} bytes`);
  const body = JSON.parse(raw);
  return { speech: String(body.response?.outputSpeech?.ssml ?? ""), attrs: body.sessionAttributes ?? {}, end: Boolean(body.response?.shouldEndSession), directives: body.response?.directives ?? [], raw: body };
}
const intent = (name: string, slots: Record<string, string> = {}) => ({
  type: "IntentRequest",
  intent: { name, confirmationStatus: "NONE", slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, { name: k, value: v }])) },
});
const screen = (s: Said) => s.directives.find((d) => d.type === "Alexa.Presentation.APL.RenderDocument")?.datasources?.s;

await seed();

Deno.test("unlinked device gets a 6-digit code; cliente role is refused", async () => {
  const s = await call(DEVICES.nuevo, { type: "LaunchRequest" });
  const code = s.speech.match(/interpret-as="digits">(\d{6})</)?.[1];
  assert(code, s.speech);
  assertEquals(screen(s)?.layout, "code");
  const [row] = await sql`select alexa_user_id from public.alexa_link_codes where code = ${code!}`;
  assertEquals(row?.alexa_user_id, DEVICES.nuevo);
  const c = await call(DEVICES.cliente, { type: "LaunchRequest" });
  assertMatch(c.speech, /cuenta de <phoneme alphabet="ipa" ph="oˈɾjon">Orión<\/phoneme> es de cliente/);
  assert(c.end);
});

Deno.test("claim_alexa_code links a staff account and blocks brute force", async () => {
  await call(DEVICES.nuevo, { type: "LaunchRequest" });
  const [{ code }] = await sql`select code from public.alexa_link_codes where alexa_user_id = ${DEVICES.nuevo}`;
  const asUser = (uid: string, fn: (tx: any) => Promise<unknown>) =>
    sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true), set_config('request.jwt.claim.sub', ${uid}, true)`;
      await tx.unsafe("set local role authenticated");
      return fn(tx);
    });
  // A cliente cannot link.
  let err = "";
  await asUser(IDS.cliente, (tx) => tx`select public.claim_alexa_code(${code})`).catch((e) => (err = String(e.message)));
  assertMatch(err, /ingenieros, químicos y administradores/);
  const ok = (await asUser(IDS.admin, (tx) => tx`select public.claim_alexa_code(${code}) as r`)) as Array<{ r: string }>;
  assertEquals(ok[0]!.r, "ok");
  const [link] = await sql`select user_id from public.alexa_links where alexa_user_id = ${DEVICES.nuevo}`;
  assertEquals(link?.user_id, IDS.admin);
  const tries: string[] = [];
  for (let i = 0; i < 9; i++) tries.push(((await asUser(IDS.otro, (tx) => tx`select public.claim_alexa_code('000000') as r`)) as Array<{ r: string }>)[0]!.r);
  assertEquals(tries.slice(0, 8), Array(8).fill("invalido"));
  assertEquals(tries[8], "bloqueado");
  await sql`delete from public.alexa_link_failures`;
  await sql`delete from public.alexa_links where alexa_user_id = ${DEVICES.nuevo}`;
});

Deno.test("launch: one short line, no screen and no extra directives (nothing that could cut Alexa+'s announcement)", async () => {
  const s = await call(DEVICES.tecnico, { type: "LaunchRequest" }, {}, true, true);
  assertMatch(s.speech, /^<speak><phoneme alphabet="ipa" ph="oˈɾjon">Orión<\/phoneme> (en línea|listo|activo)\. ¿(Qué revisamos|En qué te ayudo)\?<\/speak>$/);
  assertEquals(s.directives.length, 0);
  assertEquals(s.end, false);
  // "el de Falcon" still resolves from the raw slot text (no dynamic entities: Alexa+ rejects them).
  const e = await call(DEVICES.tecnico, intent("EquipoIntent", { equipo: "falcon monterrey" }));
  assertMatch(e.speech, /terminación <say-as interpret-as="digits">9999</);
  assertEquals(screen(e)?.layout, "equipment");
});

Deno.test("resumen (admin): fleet, fatal equipment, rejected controls, SLA", async () => {
  const s = await call(DEVICES.admin, intent("ResumenIntent"));
  assertMatch(s.speech, /alarma fatal/);
  assertMatch(s.speech, /terminación <say-as interpret-as="digits">9999</);
  assertMatch(s.speech, /se rechazó un control de glucosa/);
  assertMatch(s.speech, /en riesgo/);
  assertEquals((s.attrs.offer as any)?.intent, "EquipoIntent");
});

Deno.test("mi día (técnico): planning where he is a companion + his assigned Falcon case", async () => {
  const s = await call(DEVICES.tecnico, intent("MiDiaIntent"));
  assertMatch(s.speech, /preventivo/);
  assertMatch(s.speech, /casos abiertos|caso abierto/);
  assertMatch(s.speech, /venció hace|vence en/);
});

Deno.test("mis casos respects RLS (no other people's tickets) and Falcon CDMX SLA", async () => {
  const s = await call(DEVICES.tecnico, intent("MisTicketsIntent"));
  assertNotMatch(s.speech, /otra persona/i);
  assertMatch(s.speech, /Hospital Angeles/);
  assertMatch(s.speech, /que vence en (3|4) horas; es de Falcon/);
  // Equipment is named by the last FOUR digits of its serial (834000473 → 0473).
  assertMatch(s.speech, /terminación <say-as interpret-as="digits">0473<\/say-as>/);
  assertMatch(s.speech, /ya venció hace/);
  const ids = s.attrs.ticketIds as string[];
  assert(ids.includes(TICKETS.falcon) && ids.includes(TICKETS.vencido) && !ids.includes(TICKETS.ajeno), JSON.stringify(ids));
  const d = await call(DEVICES.tecnico, intent("TicketDetalleIntent", { ordinal: "1" }), s.attrs);
  assertMatch(d.speech, /El motivo: /);
  assertNotMatch(d.speech, /interpret-as="characters"/);
});

Deno.test("equipo: fatal alarm with catalog location, rejected glucose control, offer to diagnose", async () => {
  const s = await call(DEVICES.tecnico, intent("EquipoIntent", { serie: "9999" }));
  assertMatch(s.speech, /alarma fatal/);
  assertMatch(s.speech, /Alarma principal: error de posición inicial vertical del brazo de reactivo 1/);
  assertMatch(s.speech, /El control de glucosa nivel 1 se rechazó: dio 140 cuando la media es 100, unas 8 desviaciones estándar arriba/);
  assertNotMatch(s.speech, /digits">100<|BR1|Home Error/);
  assertEquals((s.attrs.offer as any)?.intent, "DiagnosticoIntent");
  assertEquals(screen(s)?.layout, "equipment");
  // "Sí" accepts the offer → diagnosis from the equipment's sources.
  const d = await call(DEVICES.tecnico, intent("AMAZON.YesIntent"), s.attrs);
  assertMatch(d.speech, /Revisé las alarmas y los controles del equipo: falla glucosa/);
  assertMatch(d.speech, /Lo más probable, con \d+ por ciento de certeza, es un problema/);
  assertMatch(d.speech, /corre ácido úrico: comparte el filtro de 505 nanómetros con glucosa/);
  assertEquals(screen(d)?.layout, "diagnosis");
});

Deno.test("diagnosis contrast: glucose fails, cholesterol/TG/uric acid fine → 505 nm loses weight but is not ruled out; guided check; outcome", async () => {
  let s = await call(DEVICES.tecnico, intent("DiagnosticoIntent", { serie: SERIAL_CDMX, pa: "glucosa" }));
  assertMatch(s.speech, /puedo afinar el diagnóstico|te guíe/);
  s = await call(DEVICES.tecnico, intent("PruebasBienIntent", { pa: "colesterol", pb: "triglicéridos", pc: "ácido úrico" }), s.attrs);
  assertMatch(s.speech, /El filtro de 505 nanómetros pierde peso, porque colesterol, triglicéridos y ácido úrico también lo usan y salen bien; no lo descarto hasta correr la utilidad Photometry/);
  assertNotMatch(s.speech, /[Dd]escarto el filtro|queda descartado|Casi seguro/);
  const top = (s.attrs.diag as any).top[0];
  assertEquals(top.key, "hyp:control");
  // Contrast is indirect: without a direct check no cause reaches certainty, and the optical one stays listed.
  assert(top.score <= 85, `unconfirmed top must stay ≤ 85, got ${top.score}`);
  assert((s.attrs.diag as any).top.some((h: { key: string }) => h.key === "hyp:optical"), JSON.stringify((s.attrs.diag as any).top));
  const why = await call(DEVICES.tecnico, intent("PorQueIntent"), s.attrs);
  assertMatch(why.speech, /Me inclino por un problema del control, del calibrador o de la preparación de la muestra/);
  assertMatch(why.speech, /por esto: .+\. El filtro de 505 nanómetros pierde peso/);
  assertMatch(why.speech, /Para afinarlo necesitaría/);
  let g = await call(DEVICES.tecnico, intent("GuiaIntent"), s.attrs);
  assertMatch(g.speech, /Paso 1\. Revisa cómo se preparó el control/);
  assertMatch(g.speech, /¿Hubo algún cambio de lote, de frasco o de preparación/);
  assertEquals(screen(g)?.layout, "procedure");
  for (let i = 0; i < 12 && !/terminamos la verificación|último paso|Ese era el último/i.test(g.speech); i++) {
    g = await call(DEVICES.tecnico, intent((g.attrs.proc as any)?.awaiting ? "AMAZON.YesIntent" : "AMAZON.NextIntent"), g.attrs);
  }
  const r = await call(DEVICES.tecnico, intent("ResueltoIntent"), g.attrs);
  assertMatch(r.speech, /resuelto/);
  const [vc] = await sql`select outcome, top_hypothesis, failed_tests, correct_tests from public.alexa_voice_cases where user_id = ${IDS.tecnico} order by created_at desc limit 1`;
  assertEquals(vc?.outcome, "resuelto");
  assertEquals(vc?.top_hypothesis, "hyp:control");
});

Deno.test("controls, calibration, reaction curve chart, alarm history, alarm info", async () => {
  const c = await call(DEVICES.tecnico, intent("ControlesIntent", { serie: SERIAL_FATAL }));
  assertMatch(c.speech, /El control de glucosa nivel 1 se rechazó/);
  const k = await call(DEVICES.tecnico, intent("CalibracionIntent", { serie: SERIAL_FATAL, prueba: "glucosa" }));
  assertMatch(k.speech, /calibración de glucosa fue .* quedó aceptada/);
  const v = await call(DEVICES.tecnico, intent("CurvaIntent", { serie: SERIAL_FATAL, prueba: "glucosa" }));
  assertMatch(v.speech, /curva de reacción de glucosa/);
  const sc = screen(v);
  assertEquals(sc?.layout, "chart");
  assert(String(sc?.p1).startsWith("M "), "chart path");
  const a = await call(DEVICES.tecnico, intent("AlarmasIntent", { serie: SERIAL_FATAL }));
  assertMatch(a.speech, /3 veces/);
  const i = await call(DEVICES.tecnico, intent("AlarmaInfoIntent", { codigo: "301" }), a.attrs);
  assertMatch(i.speech, /significa temperatura fuera de rango en el refrigerador de reactivos/);
  assertMatch(i.speech, /una vez en 30 días/);
});

Deno.test("speech sounds natural: no alarm codes, firmware English, abbreviations or raw Westgard ids", async () => {
  const FORBIDDEN = /\b(QC|IFU|BPL|LIS|valuesheet|BR1|BR2|DR1|DR2|BM1|RR1)\b|Home Error|Collision Detected|Fridge|\[DEMO\]|\d ese\b|_\d?s\b|Se espera:|Mover peso|Sospecha de|Verificación de sospecha/;
  let attrs: Attrs = {};
  const said: string[] = [];
  const say1 = async (name: string, slots: Record<string, string> = {}, device = DEVICES.tecnico) => {
    const r = await call(device, intent(name, slots), attrs);
    attrs = r.attrs;
    said.push(r.speech);
    return r;
  };
  await say1("ResumenIntent", {}, DEVICES.admin);
  attrs = {};
  await say1("EquipoIntent", { serie: "9999" });
  await say1("AMAZON.YesIntent");
  await say1("PruebasBienIntent", { pa: "colesterol", pb: "triglicéridos", pc: "ácido úrico" });
  await say1("PorQueIntent");
  await say1("OtrasHipotesisIntent");
  await say1("GuiaIntent");
  await say1("AMAZON.YesIntent");
  await say1("AMAZON.NoIntent");
  await say1("AMAZON.NextIntent");
  await say1("ControlesIntent", { serie: "9999" });
  await say1("AlarmasIntent", { serie: "9999" });
  await say1("MisTicketsIntent");
  for (const s of said) assertNotMatch(s.replace(/<[^>]+>/g, " "), FORBIDDEN, s);
  // A "no" in the middle of the guide keeps the guide.
  assert(said[8]!.includes("tómate tu tiempo"), said[8]);
  assertMatch(said[9]!, /Paso 3/);
});

Deno.test("«¿cómo vamos con el reporte?» after the briefing: asks which equipment when several, answers the case, repeats the list", async () => {
  const brief = await call(DEVICES.admin, intent("ResumenIntent"));
  assertEquals((brief.attrs.ticketIds as string[]).length, 2);
  // Several cases at risk → ask for the equipment, naming them.
  const ask = await call(DEVICES.admin, intent("TicketDetalleIntent"), brief.attrs);
  assertMatch(ask.speech, /Hay 2 casos: .*terminación .*¿De cuál equipo\? Dime la terminación/);
  assert(ask.directives.some((d) => d.type === "Dialog.ElicitSlot" && d.slotToElicit === "serie"), JSON.stringify(ask.directives));
  // The answer (four digits) picks the Falcon CDMX case.
  const det = await call(DEVICES.admin, intent("TicketDetalleIntent", { serie: "0473" }), ask.attrs);
  assertMatch(det.speech, /Es el caso de Hospital Angeles Del Pedregal, del B A 400 terminación <say-as interpret-as="digits">0473<\/say-as>/);
  assertMatch(det.speech, /su plazo de 24 horas vence en (3|4) horas; es de Falcon/);
  assertMatch(det.speech, /está asignado a Juan Pérez/);
  assertEquals(det.attrs.ticketId, TICKETS.falcon);
  // A bare ending also works through SerieIntent (offer carried in the session).
  const viaSerie = await call(DEVICES.admin, intent("SerieIntent", { serie: "9999" }), ask.attrs);
  assertMatch(viaSerie.speech, /Es el caso de Laboratorio Falcon Monterrey/);
  assertMatch(viaSerie.speech, /ya venció hace/);
  // "Repíteme los reportes".
  const again = await call(DEVICES.admin, intent("MisTicketsIntent"), det.attrs);
  assertMatch(again.speech, /casos? abiertos?/);
  // Only one case mentioned → straight to its detail, no question.
  const one = await call(DEVICES.tecnico, intent("TicketDetalleIntent"), { ticketIds: [TICKETS.vencido] });
  assertMatch(one.speech, /^<speak>Es el caso de Laboratorio Falcon Monterrey/);
  assertMatch(one.speech, /está asignado a ti|Está en proceso/);
});

Deno.test("IFU and lots from einfo.bio facts", async () => {
  const e = await call(DEVICES.tecnico, intent("IfuIntent", { prueba: "glucosa", dato: "estabilidad" }));
  assertMatch(e.speech, /estable a bordo/);
  const l = await call(DEVICES.tecnico, intent("LoteIntent", { prueba: "glucosa" }));
  assertMatch(l.speech, /caduca el|caducado desde/);
});

Deno.test("drafts: a case and a dictated note answered «borrador», and a spare part, wait in Orion web", async () => {
  const eq = await call(DEVICES.tecnico, intent("EquipoIntent", { serie: SERIAL_CDMX }));
  const proposal = await call(DEVICES.tecnico, intent("AbrirTicketIntent", { motivo: "alarma de temperatura del rotor" }), eq.attrs);
  assertMatch(proposal.speech, /Abro un caso de ingeniería.*¿Lo creo\? Di «sí», «no» o «borrador»/);
  const t = await call(DEVICES.tecnico, intent("BorradorIntent"), proposal.attrs);
  assertMatch(t.speech, /dejé el caso como borrador/);
  const p = await call(DEVICES.tecnico, intent("RefaccionIntent", { pieza: "dos lámparas halógenas" }), eq.attrs);
  assertMatch(p.speech, /solicitud de 2/);
  const list = await call(DEVICES.tecnico, intent("MisTicketsIntent"));
  const det = await call(DEVICES.tecnico, intent("TicketDetalleIntent", { ordinal: "1" }), list.attrs);
  let d = await call(DEVICES.tecnico, intent("AMAZON.YesIntent"), det.attrs);
  assertMatch(d.speech, /Dictado para el caso/);
  d = await call(DEVICES.tecnico, intent("AnotaIntent", { texto: "cambié la lámpara y calibré glucosa" }), d.attrs);
  d = await call(DEVICES.tecnico, intent("FinDictadoIntent"), d.attrs);
  assertMatch(d.speech, /Tengo la nota de una línea/);
  d = await call(DEVICES.tecnico, intent("BorradorIntent"), d.attrs);
  assertMatch(d.speech, /lo dejé como borrador/);
  const rows = await sql`select kind, status, payload from public.alexa_pending_actions where user_id = ${IDS.tecnico} order by created_at`;
  assertEquals(rows.map((r) => r.kind), ["ticket", "refaccion", "bitacora"]);
  assert(rows.every((r) => r.status === "pendiente"));
  assertEquals(rows[1]!.payload.cantidad, 2);
  // Nothing real was created yet.
  const [n] = await sql`select count(*)::int as n from public.tickets where asunto ilike '%temperatura del rotor%'`;
  assertEquals(n!.n, 0);
});

Deno.test("alerts: read, acknowledge by voice", async () => {
  const s = await call(DEVICES.tecnico, intent("AvisosIntent"));
  assertMatch(s.speech, /Falcon/);
  const a = await call(DEVICES.tecnico, intent("AcuseIntent"), s.attrs);
  assertMatch(a.speech, /confirmado/);
  const [r] = await sql`select ack_via from public.alexa_alerts where user_id = ${IDS.tecnico}`;
  assertEquals(r?.ack_via, "voz");
});

Deno.test("free-form question without Claude configured explains politely; stop ends", async () => {
  const q = await call(DEVICES.tecnico, intent("PreguntaIntent", { consulta: "qué equipos de Monterrey fallaron" }));
  assertMatch(q.speech, /todavía no están activadas/);
  const s = await call(DEVICES.tecnico, intent("AMAZON.StopIntent"));
  assert(s.end);
});

Deno.test("Orion is pronounced in Spanish everywhere, once, and shown as the brand on screen", async () => {
  const { brandSpeech, BRAND_SSML } = await import("../speech.ts");
  const once = brandSpeech("Orion en línea. Confírmalo en ORION web, servicio orion.");
  assertEquals(once.split(BRAND_SSML).length - 1, 3);
  assertEquals(brandSpeech(once), once);
  const s = await call(DEVICES.nuevo, { type: "LaunchRequest" });
  assert(s.speech.includes(BRAND_SSML), s.speech);
  assertNotMatch(s.speech.replaceAll(BRAND_SSML, ""), /orion/i);
  const p = await call(DEVICES.tecnico, intent("AbrirTicketIntent", { motivo: "prueba de marca" }), { serial: SERIAL_CDMX });
  const a = await call(DEVICES.tecnico, intent("BorradorIntent"), p.attrs);
  assert(a.speech.includes(BRAND_SSML), a.speech);
  assertEquals(screen(a)?.body?.includes("Orion"), true);
  assertEquals(screen(a)?.body?.includes("Orión"), false);
});

Deno.test("APL follows the device runtime (console simulator = 1.3) and only ships the layout in use", async () => {
  APL_RUNTIME = "1.3";
  try {
    const s = await call(DEVICES.admin, intent("ResumenIntent"), {}, true, true);
    const doc = s.directives.find((d) => d.type === "Alexa.Presentation.APL.RenderDocument")?.document;
    assertEquals(doc?.version, "1.3");
    assertEquals(doc?.graphics?.ring?.version, "1.1");
    const inner = JSON.stringify(doc?.mainTemplate);
    assert(!inner.includes("s.layout == 'chart'") && inner.includes("s.layout == 'briefing'"), "only the briefing layout");
    const c = await call(DEVICES.nuevo, { type: "LaunchRequest" }, {}, true, true);
    assertEquals(c.directives.find((d) => d.type === "Alexa.Presentation.APL.RenderDocument")?.document?.version, "1.3");
  } finally {
    APL_RUNTIME = "2023.2";
  }
});

Deno.test("screens are served by the function itself", async () => {
  const r = await handler(new Request("http://localhost/alexa/assets/bg.jpg"));
  assertEquals(r.headers.get("content-type"), "image/jpeg");
  assert((await r.arrayBuffer()).byteLength > 5000);
});

Deno.test({ name: "close db", sanitizeResources: false, sanitizeOps: false, fn: async () => { await sql.end(); } });
