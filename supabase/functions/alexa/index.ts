// ORION · Alexa skill endpoint (custom skill "Orion", es-MX, invocation «servicio orion»).
// Every request is signature-verified (verify.ts). Only devices linked to an Orion staff account get answers, and every
// Orion read runs AS that person (db.ts asUser) so Orion's RLS decides what Alexa can say. Dictated tickets, parts and
// Case writes ask «sí / no / borrador» (and «confirmo» when the client gets a WhatsApp); parts are drafts for Orion web.
import { ASSETS } from "./assets.generated.ts";
import { aplDocument, aplVersionFor, datasource, setAssetBase, type Visual } from "./apl.ts";
import { build, fitResponse, page, say, slotText, type Ctx, type Reply, type Slots } from "./alexa.ts";
import { asUser } from "./db.ts";
import * as C from "./cases.ts";
import * as H from "./handlers.ts";
import * as D from "./data.ts";
import * as S from "./store.ts";
import { firstName } from "./speech.ts";
import { VerificationError, verifyAlexaRequest } from "./verify.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SKILL_ID = Deno.env.get("ALEXA_SKILL_ID") ?? "";
// Dialog.UpdateDynamicEntities makes Alexa+ reject the whole reply ("hubo un problema con la respuesta de la skill",
// confirmed in the console simulator on 2026-10-11). Equipment is matched from the raw slot text anyway, so it stays off
// unless explicitly enabled.
const DYNAMIC_ENTITIES = Deno.env.get("ORION_ALEXA_ENTITIES") === "on";
const LOCAL = /127\.0\.0\.1|localhost|kong:8000|host\.docker\.internal/.test(SUPABASE_URL);
// Local tests only: never honoured against the hosted project.
const SKIP_VERIFY = LOCAL && Deno.env.get("ALEXA_SKIP_VERIFY") === "1";
setAssetBase(`${Deno.env.get("ORION_ALEXA_PUBLIC_URL") ?? `${SUPABASE_URL}/functions/v1/alexa`}/assets`);

const SCREEN_TITLE: Record<string, [string, string]> = {
  "AMAZON.HelpIntent": ["Ayuda", "Lo que puedo hacer"], "AMAZON.FallbackIntent": ["Orion", "¿Me lo repites?"], PreguntaIntent: ["Orion responde", "Respuesta"],
  AvisosIntent: ["Avisos", "Avisos"], AcuseIntent: ["Avisos", "Confirmados"], AbrirTicketIntent: ["Caso nuevo", "Caso"], RefaccionIntent: ["Borrador", "Refacción por confirmar"],
  FinDictadoIntent: ["Dictado", "Nota"], BorradorIntent: ["Borrador", "Guardado para revisar"], ConfirmoIntent: ["Caso", "Confirmado"], ResueltoIntent: ["Aprendizaje", "Caso registrado"], NoResueltoIntent: ["Aprendizaje", "Caso registrado"],
  PorQueIntent: ["Diagnóstico", "Por qué"], OtrasHipotesisIntent: ["Diagnóstico", "Otras hipótesis"], VincularIntent: ["Vinculación", "Cuenta vinculada"],
};
const messageVisual = (intent: string) => (text: string): Visual => {
  const [kicker, title] = SCREEN_TITLE[intent] ?? ["Orion", "Orion"];
  return { layout: "message", kicker, title, body: text, hint: "Di «ayuda» para saber todo lo que puedo hacer" };
};
const listVisual = (kind: string, intro: string) => (chunk: string[], offset: number, rest: number): Visual => ({
  layout: "list", kicker: { tickets: "Casos", fatal: "Alarmas", alarms: "Alarmas", alerts: "Avisos" }[kind] ?? "Orion", title: intro.replace(/<[^>]+>/g, "").replace(/:$/, ""), subtitle: "",
  items: chunk.map((c) => ({ text: c.replace(/<[^>]+>/g, ""), tone: /vencid|fatal/i.test(c) ? "risk" : "hud" })), offset, rest,
});

function linkReply(code: string, apl: boolean, aplVersion: string) {
  const digits = code.split("").join(" ");
  return say(
    `Para proteger la información de Biosystems, primero vincula este dispositivo con tu cuenta de Orion. Entra a Orion, sección Alexa, y escribe el código <say-as interpret-as="digits">${code}</say-as>. Te lo repito: <say-as interpret-as="digits">${code}</say-as>. Vence en diez minutos.`,
    {
      card: { title: "Vincular Alexa con Orion", text: `Código: ${digits}\nOrion → Alexa → Vincular. Vence en 10 minutos.\nhttps://medinovacuu.github.io/orion/alexa` },
      directives: apl ? [{ type: "Alexa.Presentation.APL.RenderDocument", token: "orion", ...renderCode(code, aplVersion) }] : [],
    },
  );
}
const renderCode = (code: string, version: string) => ({ document: aplDocument("code", version), datasources: { s: datasource({ layout: "code", kicker: "Vinculación", title: "Vincula este dispositivo", subtitle: "Abre Orion → Alexa y escribe este código. Vence en diez minutos.", digits: code.split(""), hint: "medinovacuu.github.io/orion/alexa" }) } });

/** Client names and cities of the fleet, taught per session so "el de Falcon Monterrey" resolves. */
async function equipmentEntities(t: H.Turn) {
  const all = await t.run((tx) => D.activeEquipment(tx));
  const counts = new Map<string, number>();
  for (const e of all) for (const v of [H.shortClient(e.client), (e.city ?? "").toLowerCase()]) if (v) counts.set(v.toLowerCase(), (counts.get(v.toLowerCase()) ?? 0) + 1);
  const values = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([v], i) => {
    const clean = v.replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
    const syn = clean.split(" ").filter((w) => w.length > 3 && !/^(laboratorio|laboratorios|hospital|clinica|clínica|analisis|análisis|medico|médico|unidad|general|regional|centro|grupo)$/.test(w));
    return { id: `e${i}`, name: { value: clean, synonyms: [...new Set(syn)].filter((w) => w !== clean).slice(0, 2) } };
  });
  return { type: "Dialog.UpdateDynamicEntities", updateBehavior: "REPLACE", types: [{ name: "EQUIPO_REF", values }] };
}

async function route(t: H.Turn): Promise<Reply> {
  const c = t.ctx;
  switch (t.intent) {
    case "LaunchRequest":
    case "AMAZON.NavigateHomeIntent":
      return H.launch(t);
    case "AMAZON.StartOverIntent":
      return H.launch({ ...t, ctx: {} });
    case "AMAZON.HelpIntent":
      return H.help(t);
    case "ResumenIntent":
      return H.resumen(t);
    case "MiDiaIntent":
      return H.miDia(t);
    case "MisTicketsIntent":
      return H.misTickets(t, false);
    case "SlaIntent":
      return H.misTickets(t, true);
    case "TicketDetalleIntent":
      // «el primero» / the equipment answers «¿en cuál caso?» of a pending write.
      if (c.offer && C.WRITE_INTENTS.has(c.offer.intent)) return dispatch(t, c.offer.intent, { ...(c.offer.slots ?? {}), serie: slotText(t.slots, "serie"), equipo: slotText(t.slots, "equipo"), ordinal: slotText(t.slots, "ordinal") });
      return H.ticketDetalle(t);
    case "CasosFiltroIntent":
      return C.casosFiltro(t);
    case "ContarCasosIntent":
      return C.casosFiltro(t, true);
    case "CasoDescripcionIntent":
      return C.casoDescripcion(t);
    case "CasoContactoIntent":
      return C.casoContacto(t);
    case "CasoBitacoraIntent":
      return C.casoBitacora(t);
    case "HistorialEquipoIntent":
      return C.historialEquipo(t);
    case "MisCierresIntent":
      return C.cierres(t);
    case "MisBorradoresIntent":
      return C.borradores(t);
    case "AvanceIntent":
      return C.movimiento(t, "avance");
    case "LlamadaIntent":
      return C.movimiento(t, "llamada");
    case "VisitaIntent":
      return C.movimiento(t, "visita");
    case "DiagnosticoCasoIntent":
      return C.movimiento(t, "diagnostico");
    case "PiezaCasoIntent":
      return C.movimiento(t, "pieza");
    case "EscalamientoIntent":
      return C.movimiento(t, "escalamiento");
    case "NotaInternaIntent":
      return C.movimiento(t, "nota");
    case "EstadoCasoIntent":
      return C.cambiarEstado(t);
    case "RespuestaClienteIntent":
      return C.respuestaCliente(t);
    case "CerrarCasoIntent":
      return C.cerrarCaso(t);
    case "AsignarCasoIntent":
      // The model accepts a bare name («Ricardo Vilchis») as the answer to «¿A quién se lo asigno?». Without that
      // question or a case in the conversation, a name alone (or «asigna el caso a …») cannot say which case is meant.
      if (!c.awaitingPerson && !c.ticketId && !c.ticketIds?.length && !slotText(t.slots, "serie") && !slotText(t.slots, "ordinal"))
        return { text: "No te entendí. Prueba: mis casos, casos sin asignar, o cómo está el cero cuatro siete tres.", reprompt: "¿Qué revisamos?", ctx: c };
      return C.asignarCaso(t);
    case "TomarCasoIntent":
      return C.asignarCaso(t, true);
    case "JustificarDemoraIntent":
      return C.justificarDemora(t);
    case "DetalleIntent":
      if (c.pendingWrite) return C.fillDetail(t, slotText(t.slots, "texto"));
      return c.ticketId ? C.movimiento(t, "avance") : { text: "¿En qué caso? Pide «mis casos» y elige uno.", ctx: c };
    case "BorradorIntent":
      if (c.pendingWrite) return C.answerWrite(t, "borrador");
      return C.borradores(t);
    case "ConfirmoIntent":
      if (c.pendingWrite) return C.answerWrite(t, "confirmo");
      return { text: "No tengo nada pendiente de confirmar. ¿Qué revisamos?", ctx: c };
    case "EquipoIntent":
      return H.equipo(t);
    case "SerieIntent": {
      // A bare serial answers the pending question ("¿para qué equipo?"), otherwise it means "how is it".
      const pending = c.offer;
      if (pending && pending.intent !== "SerieIntent") return dispatch(t, pending.intent, { ...(pending.slots ?? {}), serie: slotText(t.slots, "serie") });
      return H.equipo(t);
    }
    case "AlarmasIntent":
      return H.alarmas(t);
    case "AlarmaInfoIntent":
      return H.alarmaInfo(t);
    case "ControlesIntent":
      return H.controles(t);
    case "CalibracionIntent":
      return H.calibracion(t);
    case "CurvaIntent":
      return H.curva(t);
    case "IfuIntent":
    case "LoteIntent":
      return H.ifu(t);
    case "EstabilidadIntent":
      return H.ifu({ ...t, intent: "IfuIntent", slots: { ...(t.slots ?? {}), dato: { value: "estabilidad" } } });
    case "InterferenciasIntent":
      return H.ifu({ ...t, intent: "IfuIntent", slots: { ...(t.slots ?? {}), dato: { value: "interferencias" } } });
    case "DiagnosticoIntent":
      if (c.diag?.asked === "failed" && slotText(t.slots, "pa")) return H.pruebas(t, "failed");
      if (c.diag?.asked === "correct" && !slotText(t.slots, "serie") && slotText(t.slots, "pa")) return H.pruebas(t, "correct");
      return H.diagnostico(t);
    case "PruebasBienIntent":
      return H.pruebas(t, "correct");
    case "PruebasFueraIntent":
      return H.pruebas(t, "failed");
    case "PorQueIntent":
      return H.porQue(t);
    case "OtrasHipotesisIntent":
      return H.otras(t);
    case "GuiaIntent":
      return H.guia(t);
    case "ResueltoIntent":
      return H.resultadoCaso(t, "resuelto");
    case "NoResueltoIntent":
      return H.resultadoCaso(t, "no_resuelto");
    case "ParcialIntent":
      return H.resultadoCaso(t, "parcial");
    case "ComoSeResolvioIntent":
      if (c.pendingWrite?.step === "detalle") return C.fillDetail(t, slotText(t.slots, "accion"));
      return H.resultadoCaso(t, "resuelto", slotText(t.slots, "accion"));
    case "AvisosIntent":
      return H.avisos(t);
    case "AcuseIntent":
      return H.acuse(t);
    case "ActivarAvisosIntent":
      return H.avisosConfig(t, true);
    case "DesactivarAvisosIntent":
      return H.avisosConfig(t, false);
    case "AbrirTicketIntent":
      return C.abrirTicket(t);
    case "RefaccionIntent":
      return C.refaccion(t);
    case "DictarIntent":
      return C.dictar(t);
    case "AnotaIntent":
      return C.anota(t);
    case "FinDictadoIntent":
      return C.finDictado(t);
    case "PreguntaIntent":
      return H.pregunta(t);
    case "QueEncontrasteIntent":
      return H.queEncontraste(t);
    case "VincularIntent":
      return { text: `Este dispositivo está vinculado con la cuenta de Orion de ${t.viewer.name || "tu usuario"}. Para cambiarlo, desvincúlalo en Orion, sección Alexa.`, ctx: c };
    case "AMAZON.YesIntent": {
      if (c.pendingWrite) return C.answerWrite(t, "si");
      if (c.proc?.awaiting) return H.pasoResultado(t, true);
      if (c.proc) return H.pasoMover(t, 1);
      if (c.list) return page(c, c.list.kind, "", c.list.items, c.list.offset, listVisual(c.list.kind, c.list.intro));
      if (c.offer) return dispatch(t, c.offer.intent, c.offer.slots ?? {});
      if (c.pendingAnswerId) return H.queEncontraste(t);
      if (c.diag?.asked === "correct") return { text: "¿Cuáles salen bien? Dime, por ejemplo: colesterol y urea salen bien.", ctx: c };
      return { text: "¿Qué revisamos?", ctx: c };
    }
    case "AMAZON.NoIntent": {
      if (c.pendingWrite) return C.answerWrite(t, "no");
      if (c.proc?.awaiting) return H.pasoResultado(t, false);
      if (c.proc) return { text: "Está bien, tómate tu tiempo. Cuando termines este paso, di «siguiente»; o pregúntame otra cosa para dejar la guía.", ctx: c };
      if (c.diag?.asked === "correct") return H.pruebas({ ...t, slots: {} }, "correct");
      return { text: "De acuerdo. ¿Algo más?", ctx: { ...c, offer: undefined, list: undefined, assignQueue: undefined } };
    }
    case "AMAZON.NextIntent":
      if (c.proc) return H.pasoMover(t, 1);
      if (c.assignQueue?.length) return C.skipToAssign(t);
      if (c.list) return page(c, c.list.kind, "", c.list.items, c.list.offset, listVisual(c.list.kind, c.list.intro));
      return { text: "No hay nada más en la lista. ¿Qué revisamos?", ctx: c };
    case "AMAZON.PreviousIntent":
      if (c.proc) return H.pasoMover(t, -1);
      return { text: "No hay un paso anterior. ¿Qué revisamos?", ctx: c };
    case "AMAZON.RepeatIntent":
      return { text: c.last ?? "No tengo nada que repetir. ¿Qué revisamos?", ctx: c };
    case "AMAZON.FallbackIntent": {
      if (c.dictation) return { text: "Para anotar, empieza con «anota». Por ejemplo: anota cambié la lámpara. Cuando termines, di «es todo».", ctx: c };
      if (c.pendingWrite?.step === "detalle") return { text: "No te entendí. Empieza con «detalle» o «solución» y lo que se hizo. Por ejemplo: detalle cambié la lámpara.", ctx: c };
      if (c.pendingWrite) return { text: c.pendingWrite.step === "confirm2" ? "Di «confirmo» para continuar, «borrador» para revisarlo en Orion web, o «no»." : "Di «sí» para guardarlo, «no» para descartarlo, o «borrador» para revisarlo en Orion web.", ctx: c };
      const misses = (c.misses ?? 0) + 1;
      const tip = c.ticketIds?.length
        ? "Si quieres el estado de un caso, dime «cómo va el reporte» o la terminación del equipo."
        : misses > 1
          ? "Para tus casos di «mis casos» o, por ejemplo, «casos pendientes por piezas»; para un equipo, dime su terminación."
          : "Prueba: cómo vamos, qué tengo hoy, o cómo está el cero cuatro siete tres.";
      return { text: `No te entendí. ${tip}`, reprompt: "¿Qué revisamos?", ctx: { ...c, misses } };
    }
    default:
      return { text: "Eso todavía no lo sé hacer. Di «ayuda» para escuchar lo que puedo hacer.", ctx: c };
  }
}

/** Re-enters an intent with slots carried by an offer ("¿Lo diagnostico?" → "sí"). */
function dispatch(t: H.Turn, intent: string, slots: Record<string, string | undefined>): Promise<Reply> {
  const s: Slots = {};
  for (const [k, v] of Object.entries(slots)) if (v) s[k] = { value: v };
  return route({ ...t, intent, slots: s, ctx: { ...t.ctx, offer: undefined } });
}

async function handle(body: any) {
  const req = body.request ?? {};
  const type = String(req.type ?? "");
  // Amazon tells us here when a reply was rejected (size, SSML, APL…): keep it in the function logs.
  if (type === "SessionEndedRequest" && req.error) console.warn("alexa session ended with error", req.reason, JSON.stringify(req.error));
  if (type === "SessionEndedRequest" || type.startsWith("AlexaSkillEvent.") || type.startsWith("Alexa.Presentation.APL.") || type === "Messaging.MessageReceived") return { version: "1.0", response: {} };
  const intent = type === "IntentRequest" ? String(req.intent?.name) : type;
  const ctx: Ctx = body.session?.attributes ?? {};
  const aplInterface = body.context?.System?.device?.supportedInterfaces?.["Alexa.Presentation.APL"];
  const apl = Boolean(aplInterface);
  const aplVersion = aplVersionFor(aplInterface?.runtime?.maxVersion);
  if (intent === "AMAZON.StopIntent" || intent === "AMAZON.CancelIntent") return say(ctx.dictation?.lines.length ? "Dictado cancelado. Hasta luego." : "Listo.", { end: true });

  const alexaUser = String(body.session?.user?.userId ?? body.context?.System?.user?.userId ?? "");
  if (!alexaUser) return say("No pude identificar este dispositivo.", { end: true });
  const user = await S.linkedUser(alexaUser);
  if (!user) return fitResponse(linkReply(await S.newLinkCode(alexaUser), apl, aplVersion));
  if (user.role === "cliente") return say("Tu cuenta de Orion es de cliente. Por ahora la voz de Orion es para el equipo de servicio de Biosystems.", { end: true });

  const viewer: H.Viewer = { id: user.id, email: user.email, name: firstName(user.fullName), role: user.role };
  const turn: H.Turn = {
    body,
    intent,
    slots: req.intent?.slots,
    ctx: intent === "AMAZON.FallbackIntent" ? ctx : { ...ctx, misses: 0 },
    viewer,
    alexaUser,
    apl,
    run: (fn) => asUser({ id: viewer.id, email: viewer.email }, fn),
    started: Date.now(),
  };
  const reply = await route(turn);
  // A new question abandons a half-read list (so "sí" answers the latest offer, not an old list).
  if (!["AMAZON.YesIntent", "AMAZON.NextIntent", "AMAZON.RepeatIntent"].includes(intent) && reply.ctx.list === ctx.list) reply.ctx = { ...reply.ctx, list: undefined };
  // Leaving a guided procedure or a dictation by asking something else closes it.
  const KEEPS_GUIDE = ["AMAZON.YesIntent", "AMAZON.NoIntent", "AMAZON.NextIntent", "AMAZON.PreviousIntent", "AMAZON.RepeatIntent", "AMAZON.HelpIntent", "AMAZON.FallbackIntent", "PorQueIntent"];
  if (ctx.proc && reply.ctx.proc === ctx.proc && !KEEPS_GUIDE.includes(intent)) reply.ctx = { ...reply.ctx, proc: undefined };
  // A write waiting for «sí / no / borrador» is dropped when the person moves on to something else.
  const KEEPS_WRITE = ["AMAZON.YesIntent", "AMAZON.NoIntent", "BorradorIntent", "ConfirmoIntent", "AMAZON.RepeatIntent", "AMAZON.HelpIntent", "AMAZON.FallbackIntent"];
  if (ctx.pendingWrite && reply.ctx.pendingWrite === ctx.pendingWrite && !KEEPS_WRITE.includes(intent)) reply.ctx = { ...reply.ctx, pendingWrite: undefined };
  // «¿A quién se lo asigno?» only waits for the very next answer.
  if (ctx.awaitingPerson && reply.ctx.awaitingPerson === ctx.awaitingPerson && !["AsignarCasoIntent", "AMAZON.RepeatIntent", "AMAZON.HelpIntent", "AMAZON.FallbackIntent"].includes(intent)) reply.ctx = { ...reply.ctx, awaitingPerson: undefined, assignQueue: undefined };
  if (DYNAMIC_ENTITIES && (body.session?.new || type === "LaunchRequest")) {
    const ent = await turn.run(() => equipmentEntities(turn)).catch(() => null);
    if (ent) reply.directives = [...(reply.directives ?? []), ent];
  }
  // One line per turn (intent, filled slot names, role, start of the reply) so a misheard request can be traced in
  // the function logs. No slot values: they can carry dictated text.
  const filled = Object.entries((req.intent?.slots ?? {}) as Record<string, { value?: string }>).filter(([, v]) => v?.value).map(([k]) => k);
  console.log(`turn ${intent}${filled.length ? ` [${filled.join(",")}]` : ""} ${user.role} → ${reply.text.replace(/<[^>]+>/g, "").slice(0, 70)}`);
  return build(reply, apl, messageVisual(intent), aplVersion);
}

export async function handler(r: Request): Promise<Response> {
  const url = new URL(r.url);
  const asset = url.pathname.match(/\/assets\/([\w.-]+)$/)?.[1];
  if (r.method === "GET" && asset && ASSETS[asset]) {
    const a = ASSETS[asset]!;
    return new Response(Uint8Array.from(atob(a.b64), (c) => c.charCodeAt(0)), { headers: { "content-type": a.type, "cache-control": "public, max-age=86400" } });
  }
  if (r.method !== "POST") return new Response("Orion · Alexa", { status: 200 });
  const raw = await r.text();
  try {
    if (!SKIP_VERIFY) await verifyAlexaRequest(r.headers, raw);
    const body = JSON.parse(raw);
    const appId = body.session?.application?.applicationId ?? body.context?.System?.application?.applicationId;
    if (SKILL_ID && appId !== SKILL_ID) return new Response("forbidden", { status: 403 });
    return Response.json(await handle(body));
  } catch (e) {
    if (e instanceof VerificationError || e instanceof SyntaxError) {
      console.warn("rejected request:", (e as Error).message);
      return new Response("bad request", { status: 400 });
    }
    console.error(e);
    return Response.json(say("Tuve un problema para consultar Orion. Intenta de nuevo en un momento.", { end: true }));
  }
}

// Tests import `handler` directly (ALEXA_NO_SERVE=1); the Edge Runtime serves it.
if (Deno.env.get("ALEXA_NO_SERVE") !== "1") Deno.serve(handler);
