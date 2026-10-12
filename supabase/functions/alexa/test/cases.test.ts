// Cases (tickets / reportes) by voice, end to end against the throwaway DB (test/setup-db.sh):
//   deno test -A --no-lock --node-modules-dir=none supabase/functions/alexa/test/cases.test.ts
// Writes go through Orion's own RPCs as the linked person and always ask first («sí / no / borrador»);
// first responses and closures message the client, so they also need «confirmo».
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
interface Said { speech: string; attrs: Attrs; end: boolean; directives: Array<Record<string, any>> }
async function call(device: string, req: Record<string, unknown>, attrs: Attrs = {}): Promise<Said> {
  const body = {
    version: "1.0",
    session: { new: false, sessionId: "s1", application: { applicationId: "amzn1.ask.skill.test" }, user: { userId: device }, attributes: attrs },
    context: { System: { application: { applicationId: "amzn1.ask.skill.test" }, user: { userId: device }, device: { supportedInterfaces: { "Alexa.Presentation.APL": { runtime: { maxVersion: "2023.2" } } } } } },
    request: { requestId: crypto.randomUUID(), timestamp: new Date().toISOString(), locale: "es-MX", ...req },
  };
  const res = await handler(new Request("http://localhost/alexa", { method: "POST", body: JSON.stringify(body) }));
  assertEquals(res.status, 200);
  const raw = await res.text();
  assert(new TextEncoder().encode(raw).length <= 22_000, `response too big: ${raw.length} bytes`);
  const out = JSON.parse(raw);
  return { speech: String(out.response?.outputSpeech?.ssml ?? ""), attrs: out.sessionAttributes ?? {}, end: Boolean(out.response?.shouldEndSession), directives: out.response?.directives ?? [] };
}
const intent = (name: string, slots: Record<string, string> = {}) => ({
  type: "IntentRequest",
  intent: { name, confirmationStatus: "NONE", slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, { name: k, value: v }])) },
});
const plain = (s: string) => s.replace(/<[^>]+>/g, "");
const onFalcon: Attrs = { ticketId: TICKETS.falcon };

Deno.test("lists and counts: by place, by state, unassigned, empty filters", async () => {
  await seed();
  const mty = await call(DEVICES.admin, intent("CasosFiltroIntent", { filtro: "monterrey" }));
  assertMatch(plain(mty.speech), /Hay un caso de Monterrey\. El caso de Laboratorio Falcon Monterrey/);
  const count = await call(DEVICES.tecnico, intent("ContarCasosIntent"));
  assertMatch(plain(count.speech), /Tienes 2 casos abiertos; el más urgente es el caso de Laboratorio Falcon Monterrey/);
  const noReply = await call(DEVICES.tecnico, intent("CasosFiltroIntent", { condicion: "sin respuesta" }));
  assertMatch(plain(noReply.speech), /Tienes 2 casos sin primera respuesta al cliente/);
  const unassigned = await call(DEVICES.admin, intent("CasosFiltroIntent", { condicion: "sin asignar" }));
  assertMatch(plain(unassigned.speech), /Hay 2 casos sin asignar/);
  const parts = await call(DEVICES.tecnico, intent("CasosFiltroIntent", { condicion: "pendientes por piezas" }));
  assertMatch(plain(parts.speech), /No tienes casos abiertos pendientes por piezas/);
  // Never other people's cases for a technician.
  const gdl = await call(DEVICES.tecnico, intent("CasosFiltroIntent", { filtro: "guadalajara" }));
  assertMatch(plain(gdl.speech), /No tienes casos abiertos de Guadalajara/);
});

Deno.test("detail aspects: what the client reported, contact, empty log; the detail says if the client got a response", async () => {
  await seed();
  const d = await call(DEVICES.tecnico, intent("CasoDescripcionIntent"), onFalcon);
  assertMatch(plain(d.speech), /el reporte dice: «La lámpara no enciende desde el arranque de la mañana\.»/);
  const c = await call(DEVICES.tecnico, intent("CasoContactoIntent"), onFalcon);
  assertMatch(c.speech, /El contacto del caso de Hospital Angeles Del Pedregal.*es Dra\. Laura Gómez, teléfono <say-as interpret-as="telephone">5512345678<\/say-as>/);
  const b = await call(DEVICES.tecnico, intent("CasoBitacoraIntent"), onFalcon);
  assertMatch(plain(b.speech), /todavía no tiene movimientos en la bitácora/);
  const det = await call(DEVICES.tecnico, intent("TicketDetalleIntent"), onFalcon);
  assertMatch(plain(det.speech), /Todavía no tiene primera respuesta al cliente/);
});

Deno.test("movement with a state change: proposal → «sí» → saved in the case log as the technician", async () => {
  await seed();
  const p = await call(DEVICES.tecnico, intent("AvanceIntent", { texto: "cambié la lámpara y pásalo a pendiente por piezas" }), onFalcon);
  assertMatch(plain(p.speech), /Agrego al caso de Hospital Angeles Del Pedregal, terminación 0473 un avance: «Cambié la lámpara\.», y lo paso a pendiente por piezas\. ¿Lo guardo\? Di «sí», «no» o «borrador»\./);
  const [before] = await sql`select count(*)::int as n from public.ticket_bitacora where ticket_id = ${TICKETS.falcon}`;
  assertEquals(before!.n, 0, "nothing is saved before «sí»");
  const ok = await call(DEVICES.tecnico, intent("AMAZON.YesIntent"), p.attrs);
  assertMatch(plain(ok.speech), /Listo, guardé el avance en la bitácora y el caso quedó pendiente por piezas/);
  assertEquals(ok.attrs.pendingWrite, undefined);
  const [row] = await sql`select tipo, detalle, estado_resultante::text as estado, creado_por, visible_cliente from public.ticket_bitacora where ticket_id = ${TICKETS.falcon}`;
  assertEquals(row!.tipo, "avance");
  assertEquals(row!.estado, "pendiente_piezas");
  assertEquals(row!.creado_por, IDS.tecnico);
  assertEquals(row!.visible_cliente, false);
  assertMatch(row!.detalle, /^Cambié la lámpara\. \(registrado por voz con Alexa\)$/);
  const [tk] = await sql`select estado::text as estado from public.tickets where id = ${TICKETS.falcon}`;
  assertEquals(tk!.estado, "pendiente_piezas");
  // The case log now reads back.
  const b = await call(DEVICES.tecnico, intent("CasoBitacoraIntent"), onFalcon);
  assertMatch(plain(b.speech), /Lo más reciente del caso de Hospital Angeles.*Juan: avance, cambié la lámpara\. ¿/);
  // State only.
  const st = await call(DEVICES.tecnico, intent("EstadoCasoIntent", { estado: "en observación" }), onFalcon);
  assertMatch(plain(st.speech), /Paso el caso de Hospital Angeles.*a en observación\. ¿Lo guardo\?/);
  const st2 = await call(DEVICES.tecnico, intent("AMAZON.YesIntent"), st.attrs);
  assertMatch(plain(st2.speech), /quedó en observación/);
});

Deno.test("«borrador» leaves it for Orion web; «no» drops it; moving on drops it too", async () => {
  await seed();
  const p = await call(DEVICES.tecnico, intent("LlamadaIntent", { texto: "el cliente confirma que ya enciende" }), onFalcon);
  assertMatch(plain(p.speech), /una llamada: «El cliente confirma que ya enciende\.»/);
  const d = await call(DEVICES.tecnico, intent("BorradorIntent"), p.attrs);
  assertMatch(plain(d.speech), /lo dejé como borrador\. Puedes revisarlo y aprobarlo en Orión web, en la pestaña Alexa/);
  const drafts = await sql`select kind, payload from public.alexa_pending_actions where user_id = ${IDS.tecnico} and status = 'pendiente'`;
  assertEquals(drafts.length, 1);
  assertEquals(drafts[0]!.kind, "bitacora");
  assertEquals(drafts[0]!.payload.tipo, "llamada");
  assertEquals(drafts[0]!.payload.ticketId, TICKETS.falcon);
  const list = await call(DEVICES.tecnico, intent("MisBorradoresIntent"));
  assertMatch(plain(list.speech), /Tienes un borrador por revisar en Orión web, en la pestaña Alexa: Llamada, Hospital Angeles/);
  const n = await call(DEVICES.tecnico, intent("NotaInternaIntent", { texto: "revisar el voltaje" }), onFalcon);
  assertMatch(plain(n.speech), /una nota interna: «Revisar el voltaje\.»/);
  const no = await call(DEVICES.tecnico, intent("AMAZON.NoIntent"), n.attrs);
  assertMatch(plain(no.speech), /no guardé nada/);
  const away = await call(DEVICES.tecnico, intent("AvanceIntent", { texto: "algo" }), onFalcon);
  const moved = await call(DEVICES.tecnico, intent("ResumenIntent"), away.attrs);
  assertEquals(moved.attrs.pendingWrite, undefined);
  const [{ n: logs }] = await sql`select count(*)::int as n from public.ticket_bitacora where ticket_id = ${TICKETS.falcon}`;
  assertEquals(logs, 0);
});

Deno.test("first response: «sí» then «confirmo» (WhatsApp to the client); a later one is a plain follow-up", async () => {
  await seed();
  const p = await call(DEVICES.tecnico, intent("RespuestaClienteIntent", { texto: "le expliqué que mañana vamos a primera hora" }), onFalcon);
  assertMatch(plain(p.speech), /Registro la primera respuesta al cliente en el caso de Hospital Angeles.*Al registrarla, Orión le envía un WhatsApp al cliente\. ¿La registro\?/);
  const s1 = await call(DEVICES.tecnico, intent("AMAZON.YesIntent"), p.attrs);
  assertMatch(plain(s1.speech), /Último paso\. Al registrarla sale el WhatsApp al cliente\. Para registrar la primera respuesta, di «confirmo»/);
  const again = await call(DEVICES.tecnico, intent("AMAZON.YesIntent"), s1.attrs);
  assertMatch(plain(again.speech), /necesito que digas «confirmo»/);
  const [{ n: none }] = await sql`select count(*)::int as n from public.ticket_service_events where ticket_id = ${TICKETS.falcon}`;
  assertEquals(none, 0, "a plain «sí» never sends it");
  const done = await call(DEVICES.tecnico, intent("ConfirmoIntent"), again.attrs);
  assertMatch(plain(done.speech), /quedó registrada la primera respuesta\. El cliente recibirá el WhatsApp de confirmación/);
  const [ev] = await sql`select kind, actor_id from public.ticket_service_events where ticket_id = ${TICKETS.falcon}`;
  assertEquals(ev!.kind, "respuesta");
  assertEquals(ev!.actor_id, IDS.tecnico);
  const [out] = await sql`select event, status from public.ticket_whatsapp_outbox where ticket_id = ${TICKETS.falcon} and event = 'response'`;
  assertEquals(out?.status, "queued");
  const later = await call(DEVICES.tecnico, intent("RespuestaClienteIntent", { texto: "le confirmé la hora" }), onFalcon);
  assertMatch(plain(later.speech), /ya tiene primera respuesta; lo registro como seguimiento con el cliente/);
  const ok = await call(DEVICES.tecnico, intent("AMAZON.YesIntent"), later.attrs);
  assertMatch(plain(ok.speech), /quedó registrado el seguimiento con el cliente/);
});

Deno.test("closure: reason → what was done → «sí» → «confirmo»; survey and WhatsApp follow; history and closures count", async () => {
  await seed();
  const ask = await call(DEVICES.tecnico, intent("CerrarCasoIntent"), onFalcon);
  assertEquals(ask.directives[0]?.type, "Dialog.ElicitSlot");
  assertEquals(ask.directives[0]?.slotToElicit, "razon");
  assertMatch(plain(ask.speech), /¿Cómo cierro el caso de Hospital Angeles.*solucionado, visita programada, sin respuesta del cliente, o cierre administrativo\?/);
  const how = await call(DEVICES.tecnico, intent("CerrarCasoIntent", { razon: "solucionado" }), ask.attrs);
  assertMatch(plain(how.speech), /¿Qué se hizo\? Dímelo empezando con «solución»/);
  const what = await call(DEVICES.tecnico, intent("DetalleIntent", { texto: "cambié la lámpara y calibré glucosa" }), how.attrs);
  assertMatch(plain(what.speech), /Cierro el caso de Hospital Angeles.*como solucionado: «Cambié la lámpara y calibré glucosa\.»\. Al cerrarlo, el cliente recibe un WhatsApp con el cierre y la encuesta de satisfacción\. ¿Lo cierro\?/);
  const s1 = await call(DEVICES.tecnico, intent("AMAZON.YesIntent"), what.attrs);
  assertMatch(plain(s1.speech), /Último paso\. Al cerrarlo sale el WhatsApp al cliente\. Para cerrar el caso de Hospital Angeles.*di «confirmo»/);
  const done = await call(DEVICES.tecnico, intent("ConfirmoIntent"), s1.attrs);
  assertMatch(plain(done.speech), /Listo, cerré el caso de Hospital Angeles.*como solucionado\. El cliente recibirá el WhatsApp de cierre y la encuesta de satisfacción/);
  const [tk] = await sql`select estado::text as estado from public.tickets where id = ${TICKETS.falcon}`;
  assertEquals(tk!.estado, "cerrado");
  const [ev] = await sql`select closure_reason, detail from public.ticket_service_events where ticket_id = ${TICKETS.falcon} and kind = 'cierre'`;
  assertEquals(ev!.closure_reason, "solucionado");
  assertMatch(ev!.detail, /^Cambié la lámpara y calibré glucosa\. \(registrado por voz con Alexa\)$/);
  const [sat] = await sql`select count(*)::int as n from public.ticket_satisfaction where ticket_id = ${TICKETS.falcon}`;
  assertEquals(sat!.n, 1);
  const hist = await call(DEVICES.tecnico, intent("HistorialEquipoIntent", { serie: "0473" }));
  assertMatch(plain(hist.speech), /tiene un caso en su historial, ninguno abierto\. .*«Equipo no enciende la lámpara»: cerrado como solucionado/);
  const mine = await call(DEVICES.tecnico, intent("MisCierresIntent"));
  assertMatch(plain(mine.speech), /Esta semana cerraste un caso, solucionado/);
  const admin = await call(DEVICES.admin, intent("MisCierresIntent"));
  assertMatch(plain(admin.speech), /Esta semana no has cerrado casos\. Todo el equipo cerró uno/);
});

Deno.test("assignment: administrators only; «casos sin asignar» suggests who should take each case", async () => {
  await seed();
  const tech = await call(DEVICES.tecnico, intent("TomarCasoIntent"), onFalcon);
  assertMatch(plain(tech.speech), /Solo administración puede asignar casos/);
  // Most urgent first (the chemistry case past its deadline). Nobody followed it or covers its region, so the
  // balanced-load rule suggests the chemist without open cases.
  const list = await call(DEVICES.admin, intent("CasosFiltroIntent", { condicion: "sin asignar" }));
  assertMatch(plain(list.speech), /Hay 2 casos sin asignar\. Empecemos por el más urgente: el caso de Laboratorio Falcon Monterrey.*terminación 9999.*, de soporte químico\. Te sugiero a Ricardo Vilchis, que no tiene casos abiertos\. ¿Se lo asigno\? Si prefieres a alguien más, dime su nombre; también pueden atenderlo Juan Pérez\./);
  assertEquals(list.directives[0]?.type, "Dialog.ElicitSlot");
  assertEquals(list.directives[0]?.slotToElicit, "persona");
  // A name instead of «sí»: «Ricardo» is two people, and the chemist is meant for a chemistry case.
  const p = await call(DEVICES.admin, intent("AsignarCasoIntent", { persona: "ricardo" }), list.attrs);
  assertMatch(plain(p.speech), /Asigno el caso de Laboratorio Falcon Monterrey, terminación 9999 a Ricardo Vilchis, del área de química\. ¿Lo confirmo\? Di «sí» o «no»\./);
  const draft = await call(DEVICES.admin, intent("BorradorIntent"), p.attrs);
  assertMatch(plain(draft.speech), /Las asignaciones no se guardan como borrador/);
  const ok = await call(DEVICES.admin, intent("AMAZON.YesIntent"), draft.attrs);
  assertMatch(plain(ok.speech), /quedó asignado a Ricardo Vilchis\. El siguiente sin asignar es el caso «Caso de otra persona».*, de soporte de ingeniería\. Te sugiero tomarlo tú, porque no tienes casos abiertos\. ¿Te lo asigno\?/);
  const [a] = await sql`select assigned_to, assigned_by from public.ticket_assignments where ticket_id = ${TICKETS.vencido}`;
  assertEquals(a!.assigned_to, IDS.quimico);
  assertEquals(a!.assigned_by, IDS.admin);
  // A chemist for an engineering case: Orion asks to confirm the change of attention profile.
  const cross = await call(DEVICES.admin, intent("AsignarCasoIntent", { persona: "Ricardo Vilchis" }), ok.attrs);
  assertMatch(plain(cross.speech), /es de soporte de ingeniería, y Ricardo Vilchis es del área de química\. Si se lo asigno, la atención del caso pasa a soporte químico\. ¿Confirmas el cambio de perfil de atención\?/);
  const moved = await call(DEVICES.admin, intent("AMAZON.YesIntent"), cross.attrs);
  assertMatch(plain(moved.speech), /quedó asignado a Ricardo Vilchis y su atención pasó a soporte químico\. Era el último de la lista/);
  const [tk] = await sql`select asunto from public.tickets where id = ${TICKETS.ajeno}`;
  assertEquals(tk!.asunto, "[Soporte Químico] Caso de otra persona");
  const [note] = await sql`select detalle from public.ticket_bitacora where ticket_id = ${TICKETS.ajeno} and tipo = 'nota' and detalle like 'Perfil de atención%'`;
  assertMatch(note!.detalle, /^Perfil de atención: de soporte de ingeniería a soporte químico, al asignarlo a Ricardo Vilchis/);
  // A bare name with no question and no case in the conversation is just not understood.
  const stray = await call(DEVICES.admin, intent("AsignarCasoIntent", { persona: "hola" }));
  assertMatch(plain(stray.speech), /^No te entendí/);
  // «asígname el caso del cero cuatro siete tres»: the administrator (an engineer) takes an engineering case.
  const mine = await call(DEVICES.admin, intent("TomarCasoIntent", { serie: "0473" }));
  assertMatch(plain(mine.speech), /Asigno el caso de Hospital Angeles Del Pedregal, terminación 0473 a Ricardo Montañez, del área de ingeniería\. ¿Lo confirmo\?/);
  const took = await call(DEVICES.admin, intent("AMAZON.YesIntent"), mine.attrs);
  assertMatch(plain(took.speech), /quedó asignado a ti/);
  const [m] = await sql`select assigned_to from public.ticket_assignments where ticket_id = ${TICKETS.falcon}`;
  assertEquals(m!.assigned_to, IDS.admin);
});

Deno.test("assignment suggestions follow the owner's rules: continuity, busy today, region; «sí» takes the suggestion", async () => {
  await seed();
  const ask = () => call(DEVICES.admin, intent("CasosFiltroIntent", { condicion: "sin asignar", filtro: "monterrey" }));
  // 1) Continuity: Juan attended this equipment's previous chemistry case. His week-long planning does not make him busy.
  await sql`insert into public.tickets (id, user_id, asunto, descripcion, numero_serie_equipo, creado_en, estado) values (${TICKETS.previo}, ${IDS.admin}, '[Soporte Químico] Calibración de glucosa', 'Cliente/Institución: Laboratorio Falcon Monterrey', ${SERIAL_FATAL}, now() - interval '20 days', 'cerrado')`;
  await sql`insert into public.ticket_assignments (ticket_id, assigned_to, assigned_by, source) values (${TICKETS.previo}, ${IDS.tecnico}, ${IDS.admin}, 'manual')`;
  let s = await ask();
  assertMatch(plain(s.speech), /Te sugiero a Juan Pérez, que atendió el caso anterior de este equipo\. ¿Se lo asigno\?/);
  // «sí» takes the suggestion directly.
  const yes = await call(DEVICES.admin, intent("AMAZON.YesIntent"), s.attrs);
  assertMatch(plain(yes.speech), /quedó asignado a Juan Pérez/);
  await sql`delete from public.ticket_assignments where ticket_id = ${TICKETS.vencido}`;
  // Busy today: a visit planned exactly today skips him (and Orion says why).
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  await sql`insert into public.tickets (id, user_id, asunto, descripcion, estado) values (${TICKETS.planHoy}, ${IDS.admin}, '[PLAN] CAPACITACION - BA400 - PUEBLA', ${`Cliente/Localidad: Demo\n\n[METADATA_PLANEACION] ${JSON.stringify({ service_type: "capacitacion", ingeniero_csv: "Juan Pérez", companions_csv: [], scheduled_date: today })}`}, 'abierto')`;
  s = await ask();
  assertMatch(plain(s.speech), /Juan Pérez atendió el caso anterior de este equipo, pero hoy tiene una visita programada\. Te sugiero a Ricardo Vilchis, que no tiene casos abiertos\./);
  // 2) Region: whoever covers the equipment's state comes before plain load.
  // Coverage is configured by administrators (a trigger checks it), so the row goes in as the administrator.
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: IDS.admin, role: "authenticated" })}, true), set_config('request.jwt.claim.sub', ${IDS.admin}, true)`;
    await tx`insert into public.ticket_staff_coverage (user_id, territory, area) values (${IDS.quimico}, 'Nuevo León', 'quimica')`;
  });
  s = await ask();
  assertMatch(plain(s.speech), /Te sugiero a Ricardo Vilchis, que cubre la región de Nuevo León\./);
  // «no» leaves the case unassigned.
  const no = await call(DEVICES.admin, intent("AMAZON.NoIntent"), s.attrs);
  assertMatch(plain(no.speech), /no lo asigno/);
  const [{ n }] = await sql`select count(*)::int as n from public.ticket_assignments where ticket_id = ${TICKETS.vencido}`;
  assertEquals(n, 0);
});

Deno.test("government cases (Falcon, Genesis, Centrum, Dicipa) count one case less for the government team", async () => {
  await seed();
  // Luis Angel Pérez (government team, chemistry) has one open case; Ricardo Vilchis has none but closed one yesterday.
  // On a Falcon case Luis Angel counts one case less, so both weigh zero, and the tie goes to whoever has gone longer
  // without closing a case (Luis Angel never has).
  await sql`insert into public.user_module_permissions (user_id, modules, can_receive_tickets) values (${IDS.gobierno}, ${["tickets"]}, true) on conflict (user_id) do update set can_receive_tickets = true, modules = excluded.modules`;
  await sql`insert into public.ticket_government_team (user_id) values (${IDS.gobierno})`;
  await sql`insert into public.ticket_assignments (ticket_id, assigned_to, assigned_by, source) values (${TICKETS.ajeno}, ${IDS.gobierno}, ${IDS.admin}, 'manual')`;
  await sql`insert into public.tickets (id, user_id, asunto, descripcion, creado_en, estado) values (${TICKETS.previo}, ${IDS.admin}, '[Soporte Químico] Calibración de colesterol', 'Cliente/Institución: Otro laboratorio', now() - interval '5 days', 'cerrado')`;
  await sql`insert into public.ticket_assignments (ticket_id, assigned_to, assigned_by, source) values (${TICKETS.previo}, ${IDS.quimico}, ${IDS.admin}, 'manual')`;
  await sql`insert into public.ticket_service_events (ticket_id, kind, detail, actor_id, closure_reason, occurred_at) values (${TICKETS.previo}, 'cierre', 'Calibrado', ${IDS.quimico}, 'solucionado', now() - interval '1 day')`;
  const s = await call(DEVICES.admin, intent("CasosFiltroIntent", { condicion: "sin asignar" }));
  assertMatch(plain(s.speech), /Falcon Monterrey.*Te sugiero a Luis Angel Pérez, que tiene la menor carga, un caso abierto, y en el empate es quien lleva más tiempo sin cerrar un caso, y es del equipo de gobierno\./);
  // The ranking reads everyone's load and trips: only administrators get suggestions.
  let refused = "";
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: IDS.tecnico, role: "authenticated" })}, true), set_config('request.jwt.claim.sub', ${IDS.tecnico}, true)`;
    await tx.unsafe("set local role authenticated");
    await tx`select * from public.get_ticket_assignment_suggestions(${TICKETS.vencido}::uuid)`;
  }).catch((e) => (refused = String(e.message)));
  assertMatch(refused, /Solo administradores pueden ver sugerencias de asignación/);
});

Deno.test("several cases: «¿en cuál?» → the equipment ending answers it and the write continues", async () => {
  await seed();
  const q = await call(DEVICES.tecnico, intent("AvanceIntent", { texto: "revisé la fuente" }));
  assertMatch(plain(q.speech), /¿En cuál caso\? Hay 2/);
  const p = await call(DEVICES.tecnico, intent("SerieIntent", { serie: "0473" }), q.attrs);
  assertMatch(plain(p.speech), /Agrego al caso de Hospital Angeles.*un avance: «Revisé la fuente\.»/);
});

Deno.test("new case by voice and dictation, both confirmed", async () => {
  await seed();
  const p = await call(DEVICES.tecnico, intent("AbrirTicketIntent", { motivo: "alarma de temperatura del rotor" }), { serial: SERIAL_CDMX });
  assertMatch(plain(p.speech), /Abro un caso de ingeniería para el B A 400 terminación 0473 de Hospital Angeles.*«Alarma de temperatura del rotor»\. ¿Lo creo\? Di «sí», «no» o «borrador»\./);
  const ok = await call(DEVICES.tecnico, intent("AMAZON.YesIntent"), p.attrs);
  assertMatch(plain(ok.speech), /Listo, abrí el caso con el número/);
  const [tk] = await sql`select asunto, numero_serie_equipo, user_id from public.tickets where id = ${String(ok.attrs.ticketId)}`;
  assertEquals(tk!.asunto, "[Soporte Ingeniero] Alarma de temperatura del rotor");
  assertEquals(tk!.user_id, IDS.tecnico);
  let s = await call(DEVICES.tecnico, intent("DictarIntent"), { ticketId: TICKETS.vencido });
  s = await call(DEVICES.tecnico, intent("AnotaIntent", { texto: "revisé la lámpara" }), s.attrs);
  s = await call(DEVICES.tecnico, intent("AnotaIntent", { texto: "calibré glucosa" }), s.attrs);
  s = await call(DEVICES.tecnico, intent("FinDictadoIntent"), s.attrs);
  assertMatch(plain(s.speech), /Tengo la nota de 2 líneas\. Agrego al caso de Laboratorio Falcon Monterrey.*«Revisé la lámpara\. Calibré glucosa\.»/);
  s = await call(DEVICES.tecnico, intent("AMAZON.YesIntent"), s.attrs);
  assertMatch(plain(s.speech), /guardé el avance en la bitácora/);
  const [row] = await sql`select detalle from public.ticket_bitacora where ticket_id = ${TICKETS.vencido}`;
  assertMatch(row!.detalle, /^Revisé la lámpara\. Calibré glucosa\. \(registrado por voz con Alexa\)$/);
});

Deno.test("help talks about cases and never promotes «pregunta»", async () => {
  const h = await call(DEVICES.tecnico, intent("AMAZON.HelpIntent"));
  assertMatch(plain(h.speech), /casos pendientes por piezas/);
  assertNotMatch(h.speech, /«pregunta»/);
});

Deno.test({ name: "close db", sanitizeResources: false, sanitizeOps: false, fn: async () => { await sql.end(); } });
