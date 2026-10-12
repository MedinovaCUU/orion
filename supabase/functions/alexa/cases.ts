// ORION · cases (tickets / reportes) by voice — what field staff use most today.
// Reads: filtered lists and counts, what the client reported, contact, case log, an equipment's case history and
// closures. Writes go through the same RPCs as Orion web, AS the person (RLS and the RPC checks decide), and always ask
// first: «sí» saves, «no» drops it, «borrador» leaves it in Orion web → pestaña Alexa (owner's rule, 2026-10-11).
// A first response and a closure message the client by WhatsApp, so they need a second, explicit «confirmo».
import { anyMore, elicit, page, resolved, slotText, withDeadline, type Ctx, type PendingWrite, type Reply } from "./alexa.ts";
import type { Row as VRow, Tone, Visual } from "./apl.ts";
import { agentEnabled, runAgent } from "./agent.ts";
import { CASE_FILTERS, CASE_STATES, CLOSURE_REASONS, matchVocab } from "./caseVocab.ts";
import * as D from "./data.ts";
import * as H from "./handlers.ts";
import * as S from "./store.ts";
import { cap, cuando, esc, joinY, shortSerial, todayIso, unaccent } from "./speech.ts";
import { humanize } from "./voice.ts";

type Turn = H.Turn;

// ── Words ────────────────────────────────────────────────────────────────────
const MOVE_SPOKEN: Record<string, string> = {
  avance: "un avance", diagnostico: "un diagnóstico", llamada: "una llamada", visita: "una visita",
  pieza: "un registro de pieza o refacción", escalamiento: "un escalamiento", nota: "una nota interna",
};
const MOVE_SAVED: Record<string, string> = {
  avance: "el avance", diagnostico: "el diagnóstico", llamada: "la llamada", visita: "la visita", pieza: "el registro de la pieza",
  escalamiento: "el escalamiento", nota: "la nota interna",
};
const LOG_TYPE: Record<string, string> = {
  avance: "avance", diagnostico: "diagnóstico", llamada: "llamada", visita: "visita", pieza: "pieza", escalamiento: "escalamiento",
  nota: "nota", respuesta: "respuesta al cliente", cierre: "cierre",
};
const STATE_SPOKEN: Record<string, string> = { en_progreso: "en proceso", pendiente_piezas: "pendiente por piezas", en_observacion: "en observación", abierto: "abierto" };
const REASON_SPOKEN: Record<string, string> = { solucionado: "solucionado", visita_programada: "visita programada", sin_respuesta: "sin respuesta del cliente", administrativo: "cierre administrativo" };
const FILTER_SPOKEN: Record<string, string> = {
  abiertos: "abiertos", en_progreso: "en proceso", pendiente_piezas: "pendientes por piezas", en_observacion: "en observación",
  sin_respuesta: "sin primera respuesta al cliente", sin_asignar: "sin asignar", vencidos: "vencidos", por_vencer: "por vencer",
  nuevos: "nuevos de hoy", cerrados: "cerrados", falcon: "de Falcon", quimica: "de química", ingenieria: "de ingeniería",
};
/** Same filters for a single case («un caso vencido»). */
const FILTER_ONE: Record<string, string> = { ...FILTER_SPOKEN, abiertos: "abierto", pendiente_piezas: "pendiente por piezas", vencidos: "vencido", nuevos: "nuevo de hoy", cerrados: "cerrado" };
const ANSWER_HINT = "Di «sí», «no» o «borrador».";
const VIA_VOICE = " (registrado por voz con Alexa)";

/** "el caso de Demo Centro, terminación 0473" */
export function caseLabel(tk: D.TicketInfo) {
  const who = tk.client ? `el caso de ${H.shortClient(tk.client)}` : `el caso «${esc(tk.subject.slice(0, 50))}»`;
  return `${who}${tk.serial ? `, terminación <say-as interpret-as="digits">${shortSerial(tk.serial)}</say-as>` : ""}`;
}
/** Spanish contractions: "a el caso" → "al caso", "de el caso" → "del caso". */
const al = (label: string) => label.replace(/^el /, "al ").replace(/^(?!al )/, "a ");
const del = (label: string) => label.replace(/^el /, "del ").replace(/^(?!del )/, "de ");
const caseScreen = (tk: D.TicketInfo) => `${tk.client ? H.shortClient(tk.client) : tk.subject.slice(0, 40)}${tk.serial ? ` ···${shortSerial(tk.serial)}` : ""}`;
const sentence = (s: string) => {
  const t = s.trim().replace(/\s+/g, " ");
  return t ? `${t.charAt(0).toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? "" : "."}` : t;
};
const slotKey = (t: Turn, name: string, table: Record<string, string[]>) => {
  const r = resolved(t.slots, name);
  return (r.id && table[r.id] ? r.id : undefined) ?? matchVocab(table, r.value ?? slotText(t.slots, name));
};
/** Mexico City has no daylight saving time since 2022. */
const localMidnight = (day: string) => `${day}T00:00:00-06:00`;
const mondayOf = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);
};

// ── Which case? ──────────────────────────────────────────────────────────────
/** The case a write refers to; if several fit, asks for the equipment ending and comes back to `intent` with `slots`. */
async function targetCase(t: Turn, intent: string, slots: Record<string, string | undefined> = {}): Promise<{ tk?: D.TicketInfo; reply?: Reply }> {
  const r = await H.resolveTicket(t);
  if (r.ticket) return { tk: r.ticket };
  if (r.many) {
    const list = r.many.slice(0, 4).map((x) => `${H.caseWho(x)}${x.serial ? `, terminación <say-as interpret-as="digits">${shortSerial(x.serial)}</say-as>` : ""}`);
    const ctx: Ctx = { ...t.ctx, ticketIds: r.many.map((x) => x.id).slice(0, 10), ticketId: undefined, offer: { intent, slots: Object.fromEntries(Object.entries(slots).filter(([, v]) => v)) as Record<string, string> } };
    return { reply: { text: `¿En cuál caso? Hay ${r.many.length}: ${joinY(list)}${r.many.length > 4 ? `, y ${r.many.length - 4} más` : ""}. Dime la terminación de la serie, o «el primero».`, reprompt: "¿En cuál caso? Dime la terminación de la serie.", ctx } };
  }
  return { reply: { text: "No encuentro un caso abierto tuyo para eso. Pide «mis casos» y elige uno.", ctx: t.ctx } };
}

// ── Lists, counts and detail aspects ─────────────────────────────────────────
function applyFilters(list: D.TicketInfo[], keys: string[], text: string | undefined, admin: boolean): D.TicketInfo[] {
  const today = todayIso();
  let out = list;
  for (const k of keys) {
    if (["en_progreso", "pendiente_piezas", "en_observacion"].includes(k)) out = out.filter((x) => x.status === k);
    else if (k === "sin_respuesta") out = out.filter((x) => !x.respondedAt);
    else if (k === "sin_asignar") out = out.filter((x) => !x.assignee && !x.assignedToMe);
    else if (k === "vencidos") out = out.filter((x) => x.sla.severity === "breached");
    else if (k === "por_vencer") out = out.filter((x) => x.sla.severity === "warning" || x.sla.severity === "critical");
    else if (k === "nuevos") out = out.filter((x) => new Date(x.createdAt).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }) === today);
    else if (k === "falcon") out = out.filter((x) => x.sla.falcon);
    else if (k === "quimica" || k === "ingenieria") out = out.filter((x) => x.area === k);
  }
  if (text) {
    const words = unaccent(text).split(/\s+/).filter((w) => w.length >= 3 && !/^(los|las|del|de|el|la|casos|caso|reportes|reporte|tickets|ticket)$/.test(w));
    const digits = text.replace(/\D/g, "");
    if (digits.length >= 3) out = out.filter((x) => (x.serial ?? "").endsWith(digits));
    else if (words.length) {
      const hay = (x: D.TicketInfo) => unaccent(`${x.client ?? ""} ${x.city ?? ""} ${x.subject} ${admin ? x.assignee ?? "" : ""}`);
      out = out.filter((x) => words.every((w) => hay(x).includes(w)));
    }
  }
  return out;
}

/** «casos pendientes por piezas», «reportes de Monterrey», «cuántos casos vencidos hay», «casos de Juan». */
export async function casosFiltro(t: Turn, count = false): Promise<Reply> {
  const admin = t.viewer.role === "admin";
  const rawA = slotText(t.slots, "condicion");
  const rawB = slotText(t.slots, "filtro");
  const keys = [matchVocab(CASE_FILTERS, rawA), matchVocab(CASE_FILTERS, rawB)].filter((k): k is string => Boolean(k));
  const text = [rawA, rawB].filter((v) => v && !matchVocab(CASE_FILTERS, v)).map((v) => H.titleCase(v!)).join(" ") || undefined;
  if (keys.includes("cerrados")) return cierres(t, "semana");
  const scope = admin ? "all" : "mine";
  const all = (await t.run((tx) => D.openTickets(tx, scope))).sort((a, b) => D.slaRank(a) - D.slaRank(b));
  const list = applyFilters(all, keys.filter((k) => k !== "abiertos"), text, admin);
  const n = list.length;
  const words = (one: boolean) => [...keys.filter((k) => k !== "abiertos").map((k) => (one ? FILTER_ONE : FILTER_SPOKEN)[k]), text ? `de ${esc(text)}` : ""].filter(Boolean).join(" ");
  const what = words(n === 1);
  const whose = admin ? "Hay" : "Tienes";
  if (!n) return { text: `${admin ? "No hay" : "No tienes"} casos abiertos${words(false) ? ` ${words(false)}` : ""}. ${anyMore()}`, ctx: t.ctx };
  const intro = `${whose} ${n === 1 ? "un caso" : `${n} casos`}${what ? ` ${what}` : n === 1 ? " abierto" : " abiertos"}${count && n > 1 ? `; el más urgente es ${H.ticketLine(list[0]!)}` : ""}.`;
  const ctxBase: Ctx = { ...t.ctx, ticketIds: list.map((x) => x.id).slice(0, 20), ticketId: n === 1 ? list[0]!.id : undefined };
  // An administrator asking for unassigned cases wants to hand them out: Orion goes through them, most urgent first,
  // asking «¿A quién se lo asigno?» and the answer is just a name (owner's request, 2026-10-11). A short
  // «asígnamelo» may be answered by Alexa+ itself; the name answers Orion's own question.
  if (admin && keys.includes("sin_asignar")) {
    const first = list[0]!;
    const lead = n === 1 ? `${intro.replace(/\.$/, "")}: ${H.ticketLine(first)}${areaOf(first)}.` : `${intro} Empecemos por el más urgente: ${H.ticketLine(first)}${areaOf(first)}.`;
    const ask = await suggestFor(t, first);
    const r = elicit({ ...ctxBase, ticketId: first.id, assignQueue: list.slice(1).map((x) => x.id), offer: undefined, awaitingPerson: first.id, pendingWrite: ask.pw }, "AsignarCasoIntent", "persona", `${lead} ${ask.text}`);
    return { ...r, reprompt: ask.pw ? "¿Se lo asigno? Di «sí», o dime el nombre de alguien más." : "¿A quién se lo asigno? Dime su nombre.", visual: listVisual(list, "Casos sin asignar", intro) };
  }
  if (count) {
    return {
      text: `${n === 1 ? `${intro.replace(/\.$/, "")}: ${H.ticketLine(list[0]!)}.` : intro} ${n === 1 ? "¿Quieres el detalle?" : "¿Te los leo?"}`,
      ctx: { ...ctxBase, offer: { intent: n === 1 ? "TicketDetalleIntent" : "CasosFiltroIntent", slots: Object.fromEntries([["condicion", rawA], ["filtro", rawB]].filter(([, v]) => v)) as Record<string, string> } },
      visual: listVisual(list, "Casos", intro),
    };
  }
  const items = list.map((x, i) => (n === 1 ? `${cap(H.ticketLine(x))}.` : `${H.ORD_SAY[i] ?? `El número ${i + 1}`} es ${H.ticketLine(x)}.`));
  const r = page(ctxBase, "tickets", intro, items, 0, H.ticketsVisual(cap(what || "abiertos"), intro));
  if (!r.ctx.list) r.text = r.text.replace(/¿[^?]+\?$/, n === 1 ? "¿Quieres el detalle?" : "Para el detalle di, por ejemplo, «el primero», o la terminación del equipo.");
  if (!r.ctx.list && n === 1) r.ctx = { ...r.ctx, offer: { intent: "TicketDetalleIntent" } };
  return r;
}
const AREA_CASE: Record<string, string> = { quimica: "soporte químico", ingenieria: "soporte de ingeniería" };
const AREA_PERSON: Record<string, string> = { quimica: "química", ingenieria: "ingeniería" };
/**
 * «Te sugiero a Ivonne Jaramillo, que atendió el caso anterior de este equipo. ¿Se lo asigno?» — the owner's assignment
 * rules rank the people (D.assignmentCandidates); «sí» takes the suggestion, a name picks someone else.
 */
async function suggestFor(t: Turn, tk: D.TicketInfo): Promise<{ text: string; pw?: PendingWrite }> {
  const { ranked, skipped } = await t.run((tx) => D.assignmentCandidates(tx, tk)).catch(() => ({ ranked: [] as D.AssignCandidate[], skipped: null }));
  const top = ranked[0];
  if (!top) return { text: "¿A quién se lo asigno?" };
  const others = ranked.slice(1, 3).map((p) => esc(p.name));
  const also = others.length ? `; también pueden atenderlo ${others.length === 1 ? others[0] : `${others[0]} o ${others[1]}`}` : "";
  const me = top.id === t.viewer.id;
  // The reasons are written about a third person; to the administrator themselves they are said in second person.
  const toYou = (r: string) => r.replace(/^ya había atendido/, "ya habías atendido").replace(/^es /, "eres ").replace(/^atendió/, "atendiste").replace(/^cubre/, "cubres").replace(/^no tiene/, "no tienes").replace(/^tiene/, "tienes").replace(/ y es del equipo/, " y eres del equipo").replace(/, y es quien lleva/, ", y eres quien lleva");
  const text = `${skipped ? `${cap(esc(skipped))}. ` : ""}Te sugiero ${me ? `tomarlo tú, porque ${toYou(top.reason)}` : `a ${esc(top.name)}, que ${top.reason}`}. ¿${me ? "Te lo asigno" : "Se lo asigno"}? Si prefieres a alguien más, dime su nombre${also}.`;
  return { text, pw: { kind: "asignacion", step: "confirm", ticketId: tk.id, label: caseLabel(tk), screen: caseScreen(tk), persona: { id: top.id, name: top.name, team: top.team } } };
}
/** ", de soporte químico" when the case's area is known. */
const areaOf = (tk: D.TicketInfo) => (tk.area ? `, de ${AREA_CASE[tk.area]}` : "");
const listVisual = (list: D.TicketInfo[], title: string, intro: string): Visual => ({
  layout: "list", kicker: "Casos", title, subtitle: intro.replace(/<[^>]+>/g, ""), offset: 0, rest: Math.max(0, list.length - 4),
  items: list.slice(0, 4).map((x) => { const r = H.ticketRow(x); return { text: r.text, tone: r.tone as Tone }; }),
});

async function oneCase(t: Turn, intent: string): Promise<{ tk?: D.TicketInfo; reply?: Reply }> {
  const r = await H.resolveTicket(t);
  if (r.ticket) return { tk: r.ticket };
  if (r.many) {
    const list = r.many.slice(0, 4).map((x) => `${H.caseWho(x)}${x.serial ? `, terminación <say-as interpret-as="digits">${shortSerial(x.serial)}</say-as>` : ""}`);
    const ctx: Ctx = { ...t.ctx, ticketIds: r.many.map((x) => x.id).slice(0, 10), ticketId: undefined };
    return { reply: elicit(ctx, intent, "serie", `Hay ${r.many.length} casos: ${joinY(list)}. ¿De cuál equipo? Dime la terminación de la serie.`) };
  }
  return { reply: { text: "No encuentro ese caso entre los que puedes ver.", ctx: t.ctx } };
}

/** «de qué se trata el caso»: what the client reported and who reported it. */
export async function casoDescripcion(t: Turn): Promise<Reply> {
  const { tk, reply } = await oneCase(t, "CasoDescripcionIntent");
  if (!tk) return reply!;
  const said = tk.description || tk.subject;
  const who = tk.contact.name ? ` Lo reportó ${esc(tk.contact.name)}.` : "";
  return {
    text: `En ${caseLabel(tk)}, el reporte dice: «${esc(humanize(said.slice(0, 400)))}».${who} ${anyMore()}`,
    ctx: { ...t.ctx, ticketId: tk.id, serial: tk.serial ?? t.ctx.serial },
    visual: { layout: "message", kicker: `Caso ${tk.folio ?? ""}`.trim(), title: caseScreen(tk), body: said.slice(0, 600) },
  };
}

/** «quién reportó», «teléfono del cliente»: contact registered in the case. */
export async function casoContacto(t: Turn): Promise<Reply> {
  const { tk, reply } = await oneCase(t, "CasoContactoIntent");
  if (!tk) return reply!;
  const c = tk.contact;
  if (!c.name && !c.phone && !c.email) return { text: `${cap(caseLabel(tk))} no tiene datos de contacto registrados. ${anyMore()}`, ctx: { ...t.ctx, ticketId: tk.id } };
  const phone = c.phone?.replace(/[^\d+]/g, "");
  const parts = [
    c.name ? `El contacto ${del(caseLabel(tk))} es ${esc(c.name)}` : `En ${caseLabel(tk)}`,
    phone ? `, teléfono <say-as interpret-as="telephone">${phone}</say-as>` : "",
    c.email ? `${phone ? ", y" : ","} correo ${esc(c.email)}` : "",
  ];
  return {
    text: `${parts.join("")}. ${anyMore()}`,
    ctx: { ...t.ctx, ticketId: tk.id },
    visual: { layout: "equipment", kicker: "Contacto del caso", label: `CASO ${tk.folio ?? ""}`, title: c.name ?? caseScreen(tk), subtitle: caseScreen(tk), chip: { text: tk.respondedAt ? "Respondido" : "Sin respuesta", tone: tk.respondedAt ? "ok" : "warn" }, facts: [{ k: "TELÉFONO", v: c.phone ?? "—" }, { k: "CORREO", v: c.email ?? "—" }, { k: "ESTADO", v: H.STATUS_TICKET[tk.status] ?? tk.status }, { k: "PLAZO", v: `${tk.sla.limitHours} h` }], rows: [] },
  };
}

/** «léeme la bitácora»: the latest movements of the case. */
export async function casoBitacora(t: Turn): Promise<Reply> {
  const { tk, reply } = await oneCase(t, "CasoBitacoraIntent");
  if (!tk) return reply!;
  const log = await t.run((tx) => D.ticketLog(tx, tk.id, 5));
  if (!log.length) return { text: `${cap(caseLabel(tk))} todavía no tiene movimientos en la bitácora. ¿Quieres agregar un avance?`, ctx: { ...t.ctx, ticketId: tk.id, offer: { intent: "DictarIntent" } } };
  const said = (d: string) => {
    const t = humanize(d.replace(VIA_VOICE.trim(), "").replace(/\s+/g, " ").trim().slice(0, 160)).replace(/\.$/, "");
    return t.charAt(0).toLowerCase() + t.slice(1);
  };
  const lines = log.map((l) => `${cuando(l.at!)}${l.by ? `, ${esc(l.by.split(/\s+/)[0]!)}` : ""}: ${LOG_TYPE[l.type] ?? esc(l.type)}, ${esc(said(l.detail))}`);
  return {
    text: `Lo más reciente ${del(caseLabel(tk))}: ${lines.join(' <break time="300ms"/> ')}. ${anyMore()}`,
    ctx: { ...t.ctx, ticketId: tk.id },
    visual: { layout: "list", kicker: "Bitácora", title: caseScreen(tk), subtitle: `${log.length} movimientos recientes`, offset: 0, rest: 0, items: log.slice(0, 4).map((l): VRow => ({ text: `${(LOG_TYPE[l.type] ?? l.type).toUpperCase()} · ${l.detail.slice(0, 90)}`, tone: "hud" })) },
  };
}

/** «historial del cero cuatro siete tres»: every case of the equipment, closed ones included. */
export async function historialEquipo(t: Turn): Promise<Reply> {
  const eq = await H.findEquipment(t);
  if (!eq.one) return H.whichEquipment(t, "HistorialEquipoIntent", eq.many);
  const e = eq.one;
  // The digits the person said also find cases typed with a short or differently formatted serial.
  const said = (slotText(t.slots, "serie") ?? "").replace(/\D/g, "");
  const list = await t.run(async (tx) => {
    const exact = await D.serialHistory(tx, e.serial, 8);
    return exact.length ? exact : await D.serialHistory(tx, e.serial, 8, said.length >= 4 ? said : shortSerial(e.serial));
  });
  if (!list.length) return { text: `${cap(H.equipName(e))} no tiene casos registrados que puedas ver. ${anyMore()}`, ctx: { ...t.ctx, serial: e.serial } };
  const open = list.filter((x) => x.status !== "cerrado");
  const line = (x: D.TicketInfo) => `${cuando(x.createdAt, false)}, «${esc(x.subject.slice(0, 70))}»: ${x.status === "cerrado" ? `cerrado${x.closureReason ? ` como ${REASON_SPOKEN[x.closureReason] ?? x.closureReason}` : ""}` : H.STATUS_TICKET[x.status] ?? x.status}`;
  const intro = `${cap(H.equipName(e))} tiene ${list.length === 1 ? "un caso" : `${list.length} casos`} en su historial${open.length ? `, ${open.length === 1 ? "uno abierto" : `${open.length} abiertos`}` : ", ninguno abierto"}.`;
  return {
    text: `${intro} ${list.slice(0, 3).map((x) => cap(line(x))).join('. <break time="300ms"/> ')}. ${anyMore()}`,
    ctx: { ...t.ctx, serial: e.serial, ticketIds: open.map((x) => x.id).slice(0, 10), ticketId: open.length === 1 ? open[0]!.id : undefined },
    visual: { layout: "list", kicker: "Historial de casos", title: H.screenName(e), subtitle: intro.replace(/<[^>]+>/g, ""), offset: 0, rest: Math.max(0, list.length - 4), items: list.slice(0, 4).map((x): VRow => ({ text: `${x.createdAt.slice(0, 10)} · ${x.subject.slice(0, 60)} · ${x.status === "cerrado" ? "cerrado" : H.STATUS_TICKET[x.status] ?? x.status}`, tone: x.status === "cerrado" ? "mute" : "hud" })) },
  };
}

/** «cuántos casos cerré esta semana / hoy»; administrators also hear the team's total. */
export async function cierres(t: Turn, fixed?: "hoy" | "semana"): Promise<Reply> {
  const { day, week } = fixed ? (fixed === "hoy" ? { day: todayIso(), week: undefined } : { day: undefined, week: { start: mondayOf(todayIso()), end: todayIso() } }) : H.dayFromSlot(t.slots);
  const isWeek = Boolean(week) || (!fixed && !slotText(t.slots, "cuando"));
  const since = localMidnight(isWeek ? week?.start ?? mondayOf(todayIso()) : day!);
  const label = isWeek ? "esta semana" : day === todayIso() ? "hoy" : cuando(day!, false);
  const admin = t.viewer.role === "admin";
  const [mine, team] = await t.run(async (tx) => [await D.closedStats(tx, since, "mine"), admin ? await D.closedStats(tx, since, "all") : null] as const);
  const parts = [mine.n ? `${cap(label)} cerraste ${mine.n === 1 ? "un caso" : `${mine.n} casos`}${mine.n > 1 && mine.solved ? `, ${mine.solved === mine.n ? "todos solucionados" : `${mine.solved} solucionados`}` : mine.n === 1 && mine.reason ? `, ${REASON_SPOKEN[mine.reason] ?? ""}` : ""}.` : `${cap(label)} no has cerrado casos.`];
  if (team) parts.push(team.n ? `Todo el equipo cerró ${team.n === 1 ? "uno" : team.n}.` : "Nadie del equipo ha cerrado casos.");
  return { text: `${parts.join(" ")} ${anyMore()}`, ctx: t.ctx };
}

/** «qué borradores tengo»: drafts waiting in Orion web. */
export async function borradores(t: Turn): Promise<Reply> {
  const list = await S.pendingActions(t.viewer.id);
  if (!list.length) return { text: `No tienes borradores pendientes. ${anyMore()}`, ctx: t.ctx };
  // "2 × lámparas halógenas · BA400 ···0473 · Demo Centro" → "2 lámparas halógenas, BA400 terminación 0473, Demo Centro"
  const items = list.slice(0, 3).map((a) => esc(a.summary.replace(/\s*·{2,}\s*/g, " terminación ").replace(/\s*·\s*/g, ", ").replace(/\s*×\s*/g, " ")));
  return {
    text: `Tienes ${list.length === 1 ? "un borrador" : `${list.length} borradores`} por revisar en Orion web, en la pestaña Alexa: ${joinY(items)}${list.length > 3 ? `, y ${list.length - 3} más` : ""}. ${anyMore()}`,
    ctx: t.ctx,
    visual: { layout: "list", kicker: "Borradores", title: "Por aprobar en Orion web", subtitle: "Pestaña Alexa", offset: 0, rest: Math.max(0, list.length - 4), items: list.slice(0, 4).map((a): VRow => ({ text: a.summary, tone: "warn" })) },
  };
}

// ── Writes: propose → «sí / no / borrador» (→ «confirmo» when the client gets a WhatsApp) ──
function proposal(pw: PendingWrite): string {
  if (pw.step === "confirm2") {
    const sends = pw.phone ? `${pw.kind === "cierre" ? "Al cerrarlo" : "Al registrarla"} sale el WhatsApp al cliente. ` : "";
    return `Último paso. ${sends}Para ${pw.kind === "cierre" ? `cerrar ${pw.label}` : "registrar la primera respuesta"}, di «confirmo». Si prefieres, di «borrador» o «no».`;
  }
  const said = pw.detalle ? `«${esc(pw.detalle)}»` : "";
  switch (pw.kind) {
    case "movimiento":
      if (pw.tipo === "avance" && !pw.detalle && pw.estado) return `Paso ${pw.label} a ${STATE_SPOKEN[pw.estado]}. ¿Lo guardo? ${ANSWER_HINT}`;
      return `Agrego ${al(pw.label)} ${MOVE_SPOKEN[pw.tipo!] ?? "un movimiento"}: ${said}${pw.estado ? `, y lo paso a ${STATE_SPOKEN[pw.estado]}` : ""}. ¿Lo guardo? ${ANSWER_HINT}`;
    case "respuesta":
      return pw.whatsapp
        ? `Registro la primera respuesta al cliente en ${pw.label}: ${said}. ${pw.phone ? "Al registrarla, Orion le envía un WhatsApp al cliente." : "El caso no tiene teléfono del cliente, así que no saldrá WhatsApp."} ¿La registro? ${ANSWER_HINT}`
        : `${cap(pw.label)} ya tiene primera respuesta; lo registro como seguimiento con el cliente: ${said}. ¿Lo guardo? ${ANSWER_HINT}`;
    case "cierre":
      return `Cierro ${pw.label} como ${REASON_SPOKEN[pw.motivo!]}: ${said}. ${pw.phone ? "Al cerrarlo, el cliente recibe un WhatsApp con el cierre y la encuesta de satisfacción." : "El caso no tiene teléfono del cliente, así que no saldrá WhatsApp ni encuesta."} ¿Lo cierro? ${ANSWER_HINT}`;
    case "asignacion":
      return `Asigno ${pw.label} a ${esc(pw.persona!.name)}${pw.persona!.team ? `, del área de ${AREA_PERSON[pw.persona!.team]}` : ""}. ¿Lo confirmo? Di «sí» o «no».`;
    case "justificacion":
      return `Apruebo la demora ${del(pw.label)} con esta justificación: ${said}. ¿La guardo? ${ANSWER_HINT}`;
    case "ticket":
      return `Abro un caso de ${pw.ticket!.area === "quimica" ? "química" : "ingeniería"} para ${pw.label}: «${esc(pw.ticket!.motivo)}». ¿Lo creo? ${ANSWER_HINT}`;
  }
}
const KICKER: Record<PendingWrite["kind"], string> = { movimiento: "Bitácora", respuesta: "Respuesta al cliente", cierre: "Cierre del caso", asignacion: "Asignación", justificacion: "Demora", ticket: "Caso nuevo" };
function propose(t: Turn, pw: PendingWrite, ctx: Ctx = t.ctx): Reply {
  const text = proposal(pw);
  const hint = pw.step === "confirm2" ? "Di «confirmo» para continuar" : pw.kind === "asignacion" ? "Di «sí» o «no»" : "Di «sí», «no» o «borrador»";
  return {
    text,
    reprompt: pw.step === "confirm2" ? "Di «confirmo», «borrador» o «no»." : pw.kind === "asignacion" ? "¿Lo asigno? Di sí o no." : ANSWER_HINT,
    ctx: { ...ctx, pendingWrite: pw, offer: undefined, list: undefined },
    visual: { layout: "message", kicker: `${KICKER[pw.kind]} · por confirmar`, title: pw.screen, body: pw.step === "confirm2" ? text.replace(/<[^>]+>/g, "") : text.replace(/<[^>]+>/g, "").replace(/\s*¿[^?]*\?\s*(Di [^.]*\.)?\s*$/, "").trim(), hint },
  };
}

/** Asks for the missing text of a write ("¿Qué le respondiste?"); the answer comes as «detalle …» / «solución …» / «anota …». */
function askDetail(t: Turn, pw: PendingWrite): Reply {
  const q =
    pw.kind === "cierre" ? "¿Qué se hizo? Dímelo empezando con «solución». Por ejemplo: solución cambié la lámpara y calibré glucosa."
      : pw.kind === "respuesta" ? "¿Qué le dijiste al cliente? Empieza con «detalle». Por ejemplo: detalle le expliqué que mañana vamos."
        : pw.kind === "justificacion" ? "¿Cuál es la justificación? Empieza con «detalle». Por ejemplo: detalle esperamos la refacción de España."
          : `¿Qué registro? Empieza con «detalle». Por ejemplo: detalle cambié la lámpara.`;
  return { text: q, reprompt: q, ctx: { ...t.ctx, pendingWrite: { ...pw, step: "detalle" }, offer: undefined }, visual: { layout: "message", kicker: KICKER[pw.kind], title: pw.screen, body: q.replace(/«|»/g, ""), hint: "Empieza con «detalle» o «solución»" } };
}

/** Text that came from a movement intent: «… y pásalo a pendiente por piezas» sets the state too. */
const STATE_TAIL = /[,;.]?\s*(?:y\s+)?(?:p[aá]s(?:a|alo|ar)|ponlo|pon(?:er)?\s+el\s+caso|d[eé]jalo|m[aá]rcalo(?:\s+como)?|c[aá]mbialo|cambia(?:r)?\s+el\s+estado)\s+(?:a|en|como)?\s*([\p{L} ]+?)\s*$/iu;
function splitState(text: string): { detail: string; state?: string } {
  const m = text.match(STATE_TAIL);
  const state = m ? matchVocab(CASE_STATES, m[1]) : undefined;
  return state ? { detail: text.slice(0, m!.index).trim(), state } : { detail: text.trim() };
}

/** «agrega un avance …», «registra una llamada …», «anota …» with a case in context. */
export async function movimiento(t: Turn, tipo: string, rawText?: string | null): Promise<Reply> {
  // Alexa sometimes hands the carrier words over with the text («un avance cambié la lámpara»).
  const text = (rawText ?? slotText(t.slots, "texto"))?.replace(/^(?:(?:un|una|el|la)\s+)?(?:avance|nota(?:\s+interna)?|llamada|visita|diagn[oó]stico|escalamiento)\s*[:,]?\s+/i, "").trim() || null;
  const { tk, reply } = await targetCase(t, INTENT_OF[tipo] ?? "AvanceIntent", { texto: text ?? undefined });
  if (!tk) return reply!;
  const base: PendingWrite = { kind: "movimiento", step: "confirm", ticketId: tk.id, label: caseLabel(tk), screen: caseScreen(tk), tipo };
  if (tk.status === "cerrado") return { text: `${cap(caseLabel(tk))} ya está cerrado.`, ctx: t.ctx };
  if (!text) return askDetail({ ...t, ctx: { ...t.ctx, ticketId: tk.id } }, base);
  const { detail, state } = splitState(text);
  return propose(t, { ...base, detalle: sentence(detail), estado: state }, { ...t.ctx, ticketId: tk.id, serial: tk.serial ?? t.ctx.serial });
}
const INTENT_OF: Record<string, string> = { avance: "AvanceIntent", llamada: "LlamadaIntent", visita: "VisitaIntent", diagnostico: "DiagnosticoCasoIntent", pieza: "PiezaCasoIntent", escalamiento: "EscalamientoIntent", nota: "NotaInternaIntent" };

/** «pasa el caso a pendiente por piezas». */
export async function cambiarEstado(t: Turn): Promise<Reply> {
  const estado = slotKey(t, "estado", CASE_STATES);
  if (!estado) return { text: "¿A qué estado lo paso? Puede ser en proceso, pendiente por piezas o en observación.", ctx: t.ctx };
  const { tk, reply } = await targetCase(t, "EstadoCasoIntent", { estado: slotText(t.slots, "estado") ?? undefined });
  if (!tk) return reply!;
  if (tk.status === estado) return { text: `${cap(caseLabel(tk))} ya está ${STATE_SPOKEN[estado]}. ${anyMore()}`, ctx: { ...t.ctx, ticketId: tk.id } };
  return propose(t, { kind: "movimiento", step: "confirm", ticketId: tk.id, label: caseLabel(tk), screen: caseScreen(tk), tipo: "avance", estado }, { ...t.ctx, ticketId: tk.id });
}

/** «registra la respuesta al cliente …»: the first one starts the client's WhatsApp, so it needs «confirmo». */
export async function respuestaCliente(t: Turn): Promise<Reply> {
  const text = slotText(t.slots, "texto");
  const { tk, reply } = await targetCase(t, "RespuestaClienteIntent", { texto: text ?? undefined });
  if (!tk) return reply!;
  const first = !tk.respondedAt;
  const pw: PendingWrite = { kind: "respuesta", step: "confirm", ticketId: tk.id, label: caseLabel(tk), screen: caseScreen(tk), tipo: "respuesta", whatsapp: first, phone: Boolean(tk.contact.phone) };
  if (!text) return askDetail({ ...t, ctx: { ...t.ctx, ticketId: tk.id } }, pw);
  return propose(t, { ...pw, detalle: sentence(text) }, { ...t.ctx, ticketId: tk.id });
}

/** «cierra el caso (como solucionado)»: reason → what was done → «sí» → «confirmo». */
export async function cerrarCaso(t: Turn): Promise<Reply> {
  const prior = t.ctx.pendingWrite?.kind === "cierre" ? t.ctx.pendingWrite : undefined;
  const motivo = slotKey(t, "razon", CLOSURE_REASONS) ?? prior?.motivo;
  let tk: D.TicketInfo | undefined;
  if (prior?.ticketId) tk = (await t.run((tx) => D.ticketById(tx, prior.ticketId!))) ?? undefined;
  if (!tk) {
    const r = await targetCase(t, "CerrarCasoIntent", { razon: slotText(t.slots, "razon") ?? undefined });
    if (!r.tk) return r.reply!;
    tk = r.tk;
  }
  if (tk.status === "cerrado") return { text: `${cap(caseLabel(tk))} ya está cerrado.`, ctx: { ...t.ctx, pendingWrite: undefined } };
  const pw: PendingWrite = { kind: "cierre", step: "motivo", ticketId: tk.id, label: caseLabel(tk), screen: caseScreen(tk), tipo: "cierre", motivo, detalle: prior?.detalle, whatsapp: true, phone: Boolean(tk.contact.phone) };
  const ctx: Ctx = { ...t.ctx, ticketId: tk.id, pendingWrite: pw, offer: undefined };
  if (!motivo) return elicit(ctx, "CerrarCasoIntent", "razon", `¿Cómo cierro ${caseLabel(tk)}: solucionado, visita programada, sin respuesta del cliente, o cierre administrativo?`);
  if (!pw.detalle) return askDetail({ ...t, ctx }, pw);
  return propose(t, { ...pw, step: "confirm" }, ctx);
}

/** «asígnale el caso a Juan» / «asígnamelo» (administración). */
export async function asignarCaso(t: Turn, toMe = false): Promise<Reply> {
  if (t.viewer.role !== "admin") return { text: "Solo administración puede asignar casos. Pídele a un administrador que te lo asigne.", ctx: t.ctx };
  const raw = toMe ? null : slotText(t.slots, "persona");
  const self = toMe || /^(a\s+)?(m[ií]|yo|m[ií] mismo|conmigo)$/i.test(raw?.trim() ?? "");
  if (!self && !raw) return elicit({ ...t.ctx, awaitingPerson: t.ctx.ticketId ?? "?" }, "AsignarCasoIntent", "persona", "¿A quién se lo asigno?");
  const { tk, reply } = await targetCase(t, toMe ? "TomarCasoIntent" : "AsignarCasoIntent", { persona: raw ?? undefined });
  if (!tk) return reply!;
  if (tk.status === "cerrado") return { text: "No se puede reasignar un caso cerrado.", ctx: t.ctx };
  const people = await t.run((tx) => D.caseReceivers(tx));
  let person: { id: string; name: string; team: "quimica" | "ingenieria" | null } | undefined;
  if (self) person = people.find((p) => p.id === t.viewer.id) ?? { id: t.viewer.id, name: t.viewer.name || "ti", team: null };
  else {
    const words = unaccent(raw!).replace(/^a\s+/, "").split(/\s+/).filter((w) => w.length >= 3);
    let hits = people.filter((p) => words.every((w) => unaccent(p.name).split(/\s+/).some((n) => n.startsWith(w))));
    // Two people with the same first name: the one of the case's area is meant (the confirmation says the full name).
    if (hits.length > 1 && tk.area) {
      const sameArea = hits.filter((p) => p.team === tk.area);
      if (sameArea.length === 1) hits = sameArea;
    }
    if (hits.length > 1) return elicit({ ...t.ctx, ticketId: tk.id, awaitingPerson: tk.id }, "AsignarCasoIntent", "persona", `Hay ${hits.length} personas: ${joinY(hits.slice(0, 4).map((p) => `${esc(p.name)}${p.team ? `, de ${AREA_PERSON[p.team]}` : ""}`))}. ¿A cuál?`);
    person = hits[0];
    if (!person) {
      // Only after «¿A quién se lo asigno?» is an unknown name worth asking again; otherwise it was not a name at all.
      if (!t.ctx.awaitingPerson) return { text: "No te entendí. Prueba: mis casos, casos sin asignar, o cómo está el cero cuatro siete tres.", reprompt: "¿Qué revisamos?", ctx: t.ctx };
      return elicit({ ...t.ctx, ticketId: tk.id, awaitingPerson: tk.id }, "AsignarCasoIntent", "persona", `No encuentro a ${esc(raw!)} entre quienes reciben casos en Orion. Dime su nombre y apellido.`);
    }
  }
  const pw: PendingWrite = { kind: "asignacion", step: "confirm", ticketId: tk.id, label: caseLabel(tk), screen: caseScreen(tk), persona: person };
  const ctx: Ctx = { ...t.ctx, ticketId: tk.id, awaitingPerson: undefined };
  // Engineering cases go to engineers and chemistry cases to chemists; outside the area, the attention profile changes.
  if (tk.area && person.team && person.team !== tk.area) {
    const change: PendingWrite = { ...pw, areaChange: { from: tk.area, to: person.team } };
    const text = `Un momento: ${caseLabel(tk)} es de ${AREA_CASE[tk.area]}, y ${person.id === t.viewer.id ? "tú eres" : `${esc(person.name)} es`} del área de ${AREA_PERSON[person.team]}. Si ${person.id === t.viewer.id ? "lo tomas" : "se lo asigno"}, la atención del caso pasa a ${AREA_CASE[person.team]}. ¿Confirmas el cambio de perfil de atención?`;
    return { text, reprompt: "¿Confirmas el cambio de perfil de atención? Di sí o no.", ctx: { ...ctx, pendingWrite: change, offer: undefined, list: undefined }, visual: { layout: "message", kicker: "Asignación · cambio de área", title: pw.screen, body: text, hint: "Di «sí» o «no»" } };
  }
  return propose(t, pw, ctx);
}

/** The next unassigned case of the queue, or nothing left. */
async function nextToAssign(t: Turn, ctx: Ctx, done: string): Promise<Reply> {
  const queue = [...(ctx.assignQueue ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    const tk = await t.run((tx) => D.ticketById(tx, id));
    if (!tk || tk.status === "cerrado" || tk.assignee || tk.assignedToMe) continue;
    const ask = await suggestFor(t, tk);
    const r = elicit({ ...ctx, ticketId: tk.id, assignQueue: queue, awaitingPerson: tk.id, pendingWrite: ask.pw }, "AsignarCasoIntent", "persona", `${done} El siguiente sin asignar es ${H.ticketLine(tk)}${areaOf(tk)}. ${ask.text}`);
    return { ...r, reprompt: ask.pw ? "¿Se lo asigno? Di «sí», un nombre, o «no» para dejarlo." : "¿A quién se lo asigno? Dime su nombre, o di «ya no»." };
  }
  // A round of «casos sin asignar» (assignQueue present, even empty) ends by saying so.
  return { text: `${done} ${ctx.assignQueue ? "Era el último de la lista. " : ""}${anyMore()}`, ctx: { ...ctx, assignQueue: undefined, awaitingPerson: undefined, pendingWrite: undefined } };
}
/** «siguiente» while handing out unassigned cases skips the current one. */
export function skipToAssign(t: Turn): Promise<Reply> {
  return nextToAssign(t, { ...t.ctx, pendingWrite: undefined }, "Lo dejo sin asignar por ahora.");
}

/** «aprueba la demora …» (administración o gerencia autorizada; casos de más de 48 horas). */
export async function justificarDemora(t: Turn): Promise<Reply> {
  const ok = await t.run((tx) => D.canApproveDelay(tx));
  if (!ok) return { text: "Solo administración o gerencia autorizada puede aprobar demoras.", ctx: t.ctx };
  const text = slotText(t.slots, "texto");
  const { tk, reply } = await targetCase(t, "JustificarDemoraIntent", { texto: text ?? undefined });
  if (!tk) return reply!;
  const elapsed = (Date.now() - new Date(tk.createdAt).getTime()) / 3.6e6;
  if (elapsed <= 48) return { text: `${cap(caseLabel(tk))} todavía no pasa de 48 horas; no hay demora que aprobar.`, ctx: t.ctx };
  const pw: PendingWrite = { kind: "justificacion", step: "confirm", ticketId: tk.id, label: caseLabel(tk), screen: caseScreen(tk), tipo: "justificacion" };
  if (!text) return askDetail({ ...t, ctx: { ...t.ctx, ticketId: tk.id } }, pw);
  return propose(t, { ...pw, detalle: sentence(text) }, { ...t.ctx, ticketId: tk.id });
}

/** «abre un ticket por …»: a new case, created as the person (Orion routes it like the web form does). */
const QUIMICA = /\b(control|calibra|reactivo|lote|resultado|blanco|curva|qc)\w*/i;
export async function abrirTicket(t: Turn): Promise<Reply> {
  const motivo = slotText(t.slots, "motivo");
  if (!motivo) return { text: "¿Cuál es el motivo? Dime, por ejemplo: abre un ticket, alarma de temperatura del rotor.", ctx: t.ctx, reprompt: "¿Cuál es el motivo del ticket?" };
  const serial = slotText(t.slots, "serie") ? (await H.findEquipment(t)).one?.serial : t.ctx.serial;
  if (!serial) return { text: "¿Para qué equipo? Dime la terminación de la serie.", ctx: { ...t.ctx, offer: { intent: "AbrirTicketIntent", slots: { motivo } } }, reprompt: "¿Qué equipo?" };
  const area = QUIMICA.test(motivo) ? "quimica" : "ingenieria";
  const all = await t.run((tx) => D.activeEquipment(tx));
  const e = all.find((x) => x.serial === serial);
  const diagLine = t.ctx.diag?.serial === serial && t.ctx.diag.top?.[0] ? `\nDiagnóstico de voz (DRI): ${t.ctx.diag.top.map((h) => `${h.score}% ${h.title}`).join("; ")}` : "";
  const descripcion = `${sentence(motivo)}\nCanal: Alexa (dictado por voz)${e?.client ? `\nCliente/Institución: ${e.client}` : ""}${e?.city ? `\nLocalidad: ${e.city}` : ""}${diagLine}`;
  const label = e ? H.equipName(e) : `el equipo terminación <say-as interpret-as="digits">${shortSerial(serial)}</say-as>`;
  return propose(t, { kind: "ticket", step: "confirm", label, screen: e ? H.plainName(e) : `···${shortSerial(serial)}`, ticket: { serial, area, motivo: sentence(motivo).replace(/\.$/, ""), descripcion } }, { ...t.ctx, serial });
}

/** Fills the text a write was waiting for («detalle …», «solución …», «anota …»). */
export function fillDetail(t: Turn, text: string | null | undefined): Reply {
  const pw = t.ctx.pendingWrite!;
  if (!text) return askDetail(t, pw);
  const { detail, state } = pw.kind === "movimiento" ? splitState(text) : { detail: text, state: undefined };
  const next: PendingWrite = { ...pw, detalle: sentence(detail), estado: state ?? pw.estado, step: pw.kind === "cierre" && !pw.motivo ? "motivo" : "confirm" };
  if (next.step === "motivo") return elicit({ ...t.ctx, pendingWrite: next }, "CerrarCasoIntent", "razon", "¿Cómo lo cierro: solucionado, visita programada, sin respuesta del cliente, o cierre administrativo?");
  return propose(t, next);
}

/** «sí» / «no» / «borrador» / «confirmo» to the pending write. */
export async function answerWrite(t: Turn, answer: "si" | "no" | "borrador" | "confirmo"): Promise<Reply> {
  const pw = t.ctx.pendingWrite!;
  const cleared: Ctx = { ...t.ctx, pendingWrite: undefined };
  if (answer === "no" && pw.kind === "asignacion" && t.ctx.assignQueue) return nextToAssign(t, cleared, "Está bien, no lo asigno.");
  if (answer === "no") return { text: `Está bien, no guardé nada. ${anyMore()}`, ctx: cleared };
  if (pw.step === "detalle") return askDetail(t, pw);
  if (pw.step === "motivo") return elicit(t.ctx, "CerrarCasoIntent", "razon", "Primero dime cómo lo cierro: solucionado, visita programada, sin respuesta del cliente, o cierre administrativo.");
  if (answer === "borrador") return saveDraft(t, pw, cleared);
  if (pw.whatsapp && pw.step === "confirm") return propose(t, { ...pw, step: "confirm2" });
  if (pw.kind === "asignacion" && !pw.areaChange && t.ctx.awaitingPerson && pw.persona) {
    // The suggestion was the question itself; outside the case's area it still needs the profile-change confirmation.
    const tk = await t.run((tx) => D.ticketById(tx, pw.ticketId!));
    if (tk?.area && pw.persona.team && pw.persona.team !== tk.area) return asignarCaso({ ...t, slots: { persona: { value: pw.persona.name } } });
  }
  if (pw.whatsapp && pw.step === "confirm2" && answer !== "confirmo") return { text: "Para enviarlo necesito que digas «confirmo». O di «borrador» o «no».", reprompt: "Di «confirmo», «borrador» o «no».", ctx: t.ctx };
  return execute(t, pw, cleared);
}

/** Drafts wait in Orion web's Alexa tab; the reviewer's demo account keeps nothing. */
const saveAction = (t: Turn, kind: "ticket" | "refaccion" | "bitacora", summary: string, payload: Record<string, unknown>) =>
  t.viewer.demo ? Promise.resolve(null) : S.createAction(t.viewer.id, kind, summary, payload);
const DEMO_NOT_SAVED = "En esta cuenta de demostración no se guarda.";
/** What a confirmed write would have done, for the reviewer's demo account (nothing is saved or sent). */
function demoDone(pw: PendingWrite): string {
  const would =
    pw.kind === "cierre" ? `el caso quedaría cerrado como ${REASON_SPOKEN[pw.motivo!]}${pw.phone ? ", y el cliente recibiría el WhatsApp de cierre y la encuesta de satisfacción" : ""}`
      : pw.kind === "respuesta" && pw.whatsapp ? `quedaría registrada la primera respuesta${pw.phone ? ", y el cliente recibiría el WhatsApp de confirmación" : ""}`
        : pw.kind === "justificacion" ? "quedaría aprobada la demora con tu justificación"
          : `quedaría en la bitácora del caso${pw.estado ? `, y el caso pasaría a ${STATE_SPOKEN[pw.estado]}` : ""}`;
  return `Listo. Como es una cuenta de demostración, no se guardó ni se envió nada; con una cuenta de Orion, ${would}.`;
}

async function saveDraft(t: Turn, pw: PendingWrite, ctx: Ctx): Promise<Reply> {
  const where = t.viewer.demo ? "Como es una cuenta de demostración, no se guardó; con una cuenta de Orion lo revisarías en la pestaña Alexa." : "Puedes revisarlo y aprobarlo en Orion web, en la pestaña Alexa.";
  if (pw.kind === "asignacion") return { text: "Las asignaciones no se guardan como borrador. Di «sí» para asignarlo o «no» para dejarlo.", ctx: t.ctx };
  if (pw.kind === "ticket") {
    const tkt = pw.ticket!;
    await saveAction(t, "ticket", `Ticket ${tkt.area === "quimica" ? "químico" : "de ingeniería"} · ${pw.screen} · ${tkt.motivo}`, { serial: tkt.serial, area: tkt.area, motivo: tkt.motivo, descripcion: tkt.descripcion });
    return { text: `Listo, dejé el caso como borrador. ${where} ${anyMore()}`, ctx };
  }
  const what = pw.kind === "cierre" ? `Cierre (${REASON_SPOKEN[pw.motivo!]})` : pw.kind === "respuesta" ? "Respuesta al cliente" : pw.kind === "justificacion" ? "Demora aprobada" : `${cap(LOG_TYPE[pw.tipo!] ?? "movimiento")}${pw.estado ? ` → ${STATE_SPOKEN[pw.estado]}` : ""}`;
  await saveAction(t, "bitacora", `${what} · ${pw.screen}`, {
    ticketId: pw.ticketId, tipo: pw.tipo ?? "avance", detalle: `${pw.detalle ?? `Cambio de estado a ${STATE_SPOKEN[pw.estado ?? ""] ?? pw.estado}.`}${VIA_VOICE}`, estado: pw.estado ?? null, motivo: pw.motivo ?? null,
  });
  return { text: `Listo, lo dejé como borrador. ${where} ${anyMore()}`, ctx };
}

/** Orion's own messages ("El ticket no está asignado a tu usuario") are already Spanish; keep them short. */
const friendly = (e: unknown) => {
  const m = String((e as { message?: string })?.message ?? e).replace(/^.*?ERROR:\s*/i, "").split("\n")[0]!.trim();
  if (/no está asignado a tu usuario/i.test(m)) return "ese caso no está asignado a ti";
  if (/ya está cerrado/i.test(m)) return "el caso ya está cerrado";
  if (/recepción de tickets/i.test(m)) return "esa persona no tiene habilitada la recepción de casos";
  return m.length > 160 ? `${m.slice(0, 157)}…` : m;
};

async function execute(t: Turn, pw: PendingWrite, ctx: Ctx): Promise<Reply> {
  try {
    if (pw.kind === "ticket") {
      const tkt = pw.ticket!;
      const out = await t.run((tx) => D.createTicket(tx, t.viewer.id, { subject: `[Soporte ${tkt.area === "quimica" ? "Químico" : "Ingeniero"}] ${tkt.motivo}`, description: tkt.descripcion, serial: tkt.serial }));
      const folio = out.folio ? ` con el número <say-as interpret-as="characters">${esc(out.folio)}</say-as>` : "";
      const to = out.receiver ? ` Quedó asignado a ${esc(out.receiver.split(/\s+/).slice(0, 2).join(" "))}.` : "";
      return { text: `Listo, abrí el caso${folio}.${to}${t.viewer.demo ? ` ${DEMO_NOT_SAVED}` : ""} ¿Quieres agregarle un avance?`, ctx: { ...ctx, ticketId: out.id, ticketIds: [out.id], offer: { intent: "DictarIntent" } }, visual: { layout: "message", kicker: "Caso nuevo", title: out.folio ? `Caso ${out.folio}` : "Caso creado", body: `${pw.screen} · ${tkt.motivo}${out.receiver ? `\nAsignado a ${out.receiver}` : ""}` } };
    }
    if (pw.kind === "asignacion") {
      const who = pw.persona!.id === t.viewer.id ? "ti" : esc(pw.persona!.name);
      await t.run(async (tx) => {
        if (pw.areaChange) {
          const { from, to } = pw.areaChange;
          await D.changeTicketArea(tx, pw.ticketId!, to, `Perfil de atención: de ${AREA_CASE[from]} a ${AREA_CASE[to]}, al asignarlo a ${pw.persona!.name}${VIA_VOICE}.`);
        }
        await D.assignTicket(tx, pw.ticketId!, pw.persona!.id);
      });
      const done = `Listo, ${pw.label} quedó asignado a ${who}${pw.areaChange ? ` y su atención pasó a ${AREA_CASE[pw.areaChange.to]}` : ""}.${t.viewer.demo ? ` ${DEMO_NOT_SAVED}` : ""}`;
      return ctx.assignQueue ? nextToAssign(t, ctx, done) : { text: `${done} ${anyMore()}`, ctx };
    }
    const detail = pw.detalle ? `${pw.detalle}${VIA_VOICE}` : `Cambio de estado a ${STATE_SPOKEN[pw.estado ?? ""] ?? pw.estado}${VIA_VOICE}.`;
    await t.run((tx) => D.registerMovement(tx, { ticketId: pw.ticketId!, action: pw.tipo ?? "avance", detail, state: pw.kind === "movimiento" ? pw.estado ?? null : null, reason: pw.kind === "cierre" ? pw.motivo! : null }));
    const done =
      pw.kind === "cierre" ? `Listo, cerré ${pw.label} como ${REASON_SPOKEN[pw.motivo!]}.${pw.phone ? " El cliente recibirá el WhatsApp de cierre y la encuesta de satisfacción." : ""}`
        : pw.kind === "respuesta" ? (pw.whatsapp ? `Listo, quedó registrada la primera respuesta.${pw.phone ? " El cliente recibirá el WhatsApp de confirmación." : ""}` : "Listo, quedó registrado el seguimiento con el cliente.")
          : pw.kind === "justificacion" ? "Listo, quedó aprobada la demora con tu justificación."
            : !pw.detalle && pw.estado ? `Listo, ${pw.label} quedó ${STATE_SPOKEN[pw.estado]}.`
              : `Listo, guardé ${MOVE_SAVED[pw.tipo!] ?? "el movimiento"} en la bitácora${pw.estado ? ` y el caso quedó ${STATE_SPOKEN[pw.estado]}` : ""}.`;
    // The reviewer's demo saves and sends nothing: say what Orion would do instead of claiming it was done.
    const said = t.viewer.demo ? demoDone(pw) : done;
    return { text: `${said} ${anyMore()}`, ctx: { ...ctx, ticketId: pw.ticketId } };
  } catch (e) {
    console.warn("case write failed", pw.kind, friendly(e));
    return { text: `No pude guardarlo: ${esc(friendly(e))}. Si quieres, di «borrador» para dejarlo en Orion web.`, ctx: { ...ctx, pendingWrite: { ...pw, step: "confirm", whatsapp: false } } };
  }
}

// ── Spare parts: still a draft for the Refacciones module (it is e-mailed from there) ──
const QTY: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
export async function refaccion(t: Turn): Promise<Reply> {
  const pieza = slotText(t.slots, "pieza");
  if (!pieza) return { text: "¿Qué pieza necesitas? Dime, por ejemplo: pide una lámpara halógena.", ctx: t.ctx, reprompt: "¿Qué pieza?" };
  const m = unaccent(pieza).match(/^(\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(.*)$/);
  const qty = m ? Number(m[1]) || QTY[m[1]!] || 1 : 1;
  const name = m ? pieza.split(/\s+/).slice(1).join(" ") : pieza;
  const all = t.ctx.serial ? await t.run((tx) => D.activeEquipment(tx)) : [];
  const e = all.find((x) => x.serial === t.ctx.serial);
  await saveAction(t, "refaccion", `${qty} × ${name}${e ? ` · ${H.plainName(e)}` : ""}`, { pieza: name, cantidad: qty, serial: t.ctx.serial ?? null, modelo: e?.model ?? null, cliente: e?.client ?? null, ticketId: t.ctx.ticketId ?? null });
  return { text: `Dejé como borrador la solicitud de ${qty === 1 ? "una pieza:" : `${qty}`} ${esc(name)}${e ? `, para ${H.equipName(e, false)}` : ""}. ${t.viewer.demo ? DEMO_NOT_SAVED : "Confírmala en Orion, en la sección Alexa."} ${anyMore()}`, ctx: t.ctx };
}

// ── Dictation (several «anota …» lines → one movement) ───────────────────────
export async function dictar(t: Turn): Promise<Reply> {
  const ticketId = t.ctx.ticketId ?? (t.ctx.ticketIds?.length === 1 ? t.ctx.ticketIds[0] : undefined);
  if (!ticketId) {
    if (t.ctx.serial) {
      const tickets = await t.run((tx) => D.ticketsForSerial(tx, t.ctx.serial!));
      if (tickets.length === 1) return startDictation(t, tickets[0]!);
    }
    return { text: "¿En qué caso dicto la nota? Pide tus casos y di, por ejemplo, «el primero», o dime el equipo.", ctx: { ...t.ctx, offer: { intent: "DictarIntent" } } };
  }
  const tk = await t.run((tx) => D.ticketById(tx, ticketId));
  if (!tk || tk.status === "cerrado") return { text: "No encuentro ese caso abierto.", ctx: t.ctx };
  return startDictation(t, tk);
}
function startDictation(t: Turn, tk: D.TicketInfo): Reply {
  const label = caseScreen(tk);
  return {
    text: `Dictado para ${caseLabel(tk)}. Di «anota» y lo que hiciste; puedes hacerlo varias veces. Cuando termines, di «es todo».`,
    reprompt: "Di «anota» y el texto, o «es todo».",
    ctx: { ...t.ctx, ticketId: tk.id, dictation: { ticketId: tk.id, label, lines: [] }, offer: undefined },
    visual: { layout: "message", kicker: "Dictado", title: label, body: "Di «anota…» con lo que hiciste. «Es todo» para terminar." },
  };
}
export async function anota(t: Turn): Promise<Reply> {
  const txt = slotText(t.slots, "texto");
  if (t.ctx.pendingWrite?.step === "detalle") return fillDetail(t, txt);
  // Outside a dictation, «anota …» with a case in context is a quick progress entry.
  if (!t.ctx.dictation && txt && /^interna\b/i.test(txt)) return movimiento(t, "nota", txt.replace(/^interna\s*/i, ""));
  if (!t.ctx.dictation) return t.ctx.ticketId ? movimiento(t, "avance", txt) : { text: "Primero dime en qué caso: pide «mis casos» y elige uno, o di «dicta una nota».", ctx: t.ctx };
  if (!txt) return { text: "No alcancé a oír. Di «anota» y el texto.", ctx: t.ctx };
  const lines = [...t.ctx.dictation.lines, txt].slice(-12);
  return { text: "Anotado. ¿Algo más? Di «anota» otra vez, o «es todo».", reprompt: "¿Algo más, o es todo?", ctx: { ...t.ctx, dictation: { ...t.ctx.dictation, lines } }, visual: { layout: "list", kicker: "Dictado", title: t.ctx.dictation.label, subtitle: `${lines.length} notas`, items: lines.slice(-4).map((l) => ({ text: l, tone: "hud" as Tone })), offset: 0, rest: 0 } };
}
export async function finDictado(t: Turn): Promise<Reply> {
  const d = t.ctx.dictation;
  if (!d) return { text: "No hay un dictado abierto.", ctx: t.ctx };
  if (!d.lines.length) return { text: "No anotaste nada; cancelo el dictado.", ctx: { ...t.ctx, dictation: undefined } };
  let detail = d.lines.map((l) => sentence(l)).join(" ");
  if (agentEnabled()) {
    const res = await withDeadline(
      runAgent({ question: `Convierte estas notas dictadas por un ingeniero en una entrada breve de bitácora de servicio (máximo 6 líneas, sin inventar nada). Responde solo el texto. Notas: ${d.lines.join(" | ")}`, context: "Redacción de bitácora (texto escrito, no hablado).", tools: [] }),
      Math.max(1200, 6500 - (Date.now() - t.started)),
    ).catch(() => null);
    if (res?.done && res.value.text) detail = res.value.text;
  }
  const tk = await t.run((tx) => D.ticketById(tx, d.ticketId));
  const pw: PendingWrite = { kind: "movimiento", step: "confirm", ticketId: d.ticketId, label: tk ? caseLabel(tk) : "el caso", screen: d.label, tipo: "avance", detalle: detail };
  const lines = d.lines.length === 1 ? "una línea" : `${d.lines.length} líneas`;
  const r = propose(t, pw, { ...t.ctx, dictation: undefined });
  return { ...r, text: `Tengo la nota de ${lines}. ${r.text}` };
}

export const WRITE_INTENTS = new Set(["AvanceIntent", "LlamadaIntent", "VisitaIntent", "DiagnosticoCasoIntent", "PiezaCasoIntent", "EscalamientoIntent", "NotaInternaIntent", "EstadoCasoIntent", "RespuestaClienteIntent", "CerrarCasoIntent", "AsignarCasoIntent", "TomarCasoIntent", "JustificarDemoraIntent"]);
