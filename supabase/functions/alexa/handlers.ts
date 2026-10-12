// ORION · intent handlers. Deterministic and fast for the everyday questions; Claude (agent.ts) for anything free-form.
import type postgres from "npm:postgres@3.4.9";
import type { Visual, Row as VRow, Tone } from "./apl.ts";
import { anyMore, background, elicit, page, progressive, resolved, slotText, withDeadline, type Ctx, type ProcStep, type Reply, type Slots } from "./alexa.ts";
import * as D from "./data.ts";
import { agentEnabled, runAgent } from "./agent.ts";
import { buildTools } from "./tools.ts";
import * as S from "./store.ts";
import { cap, canonicalTest, cuando, shortClient, duracion, esc, fecha, joinY, localHour, n0, pause, plural, sayCode, sayTest, sayUnit, shortSerial, spoken, spokenModel, todayIso, unaccent } from "./speech.ts";
import { actionSpeech, explainRule, factorSpeech, humanize, hypothesisCause, hypothesisCheck, missingSpeech, reasonSpeech, sayTestsIn, SOURCE_SPOKEN, VOICE_STEPS } from "./voice.ts";

type Tx = postgres.TransactionSql<Record<string, never>>;
export interface Viewer {
  id: string;
  email: string | null;
  name: string;
  role: "admin" | "tecnico" | "cliente";
}
export interface Turn {
  body: any;
  intent: string;
  slots: Slots | undefined;
  ctx: Ctx;
  viewer: Viewer;
  alexaUser: string;
  apl: boolean;
  run: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  started: number;
}

// ── Naming helpers ───────────────────────────────────────────────────────────
export { shortClient };
/** "CIUDAD DE MEXICO" → "Ciudad de Mexico": capitalised words, Spanish particles in lower case. */
export const titleCase = (v: string) =>
  v.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, sp: string, c: string) => sp + c.toUpperCase()).replace(/\s(De|Del|La|Las|Los|Y|E|En)(?=\s)/g, (m) => m.toLowerCase());
const cityOf = (e: { city?: string | null; state?: string | null }) => esc(titleCase(e.city || e.state || ""));
/** "el BA400 terminación 0473 de Falcon, en Monterrey" */
export function equipName(e: D.Equipment | { serial: string; model?: string | null; client?: string | null; city?: string | null; state?: string | null }, withPlace = true) {
  const model = e.model ? spokenModel(e.model) : "equipo";
  let s = `el ${esc(model)} terminación <say-as interpret-as="digits">${shortSerial(e.serial)}</say-as>`;
  if (withPlace && e.client) s += ` de ${shortClient(e.client)}`;
  if (withPlace && (e.city || e.state)) s += `, en ${cityOf(e)}`;
  return s;
}
/** Subject of a sentence: "El B A 400 terminación 9999, en Chihuahua," (closing comma before the verb). */
const equipSubject = (e: Parameters<typeof equipName>[0]) => `${cap(equipName(e))}${e.city || e.state ? "," : ""}`;
export const screenName = (e: { serial: string; model?: string | null }) => `${(e.model ?? "Equipo").replace(/\[DEMO\]/i, "").trim()} ···${shortSerial(e.serial)}`;
export const plainName = (e: { serial: string; model?: string | null; client?: string | null }) => `${screenName(e)}${e.client ? ` · ${shortClient(e.client)}` : ""}`;

export function slaPhrase(t: D.TicketInfo) {
  const h = t.sla.remainingHours;
  return t.sla.severity === "breached" ? `ya venció hace ${duracion(-h)}` : `vence en ${duracion(h)}`;
}
export const slaTone = (t: D.TicketInfo): Tone => (t.sla.severity === "breached" || t.sla.severity === "critical" ? "risk" : t.sla.severity === "warning" ? "warn" : "hud");
/** "el caso de Hospital Angeles, del B A 400 terminación 0473, que vence en 4 horas; es de Falcon" */
export function ticketLine(t: D.TicketInfo) {
  const who = t.client ? `el caso de ${shortClient(t.client)}` : `el caso «${esc(t.subject.slice(0, 60))}»`;
  const eq = t.serial ? `, del ${t.model ? esc(spokenModel(t.model)) : "equipo"} terminación <say-as interpret-as="digits">${shortSerial(t.serial)}</say-as>` : "";
  return `${who}${eq}, que ${slaPhrase(t)}${t.sla.falcon && !/falcon/i.test(t.client ?? "") ? "; es de Falcon" : ""}`;
}
export const STATUS_TICKET: Record<string, string> = { abierto: "abierto", en_progreso: "en proceso", pendiente_piezas: "esperando piezas", en_observacion: "en observación", cerrado: "cerrado" };
export const ticketRow = (t: D.TicketInfo): VRow => ({ text: `${t.client ? shortClient(t.client) : t.subject.slice(0, 50)}${t.serial ? ` · ···${shortSerial(t.serial)}` : ""} · ${t.sla.severity === "breached" ? "vencido" : `${Math.max(0, Math.round(t.sla.remainingHours))} h`}`, tone: slaTone(t), tag: t.sla.falcon ? "FALCON" : t.area === "quimica" ? "QUÍMICA" : "" });
const SERVICE: Record<string, string> = { preventivo: "preventivo", correctivo: "correctivo", capacitacion: "capacitación", recapacitacion: "recapacitación", instalacion: "instalación", ingenieria_soporte: "soporte de ingeniería" };
function planLine(p: D.PlanItem, day?: string) {
  const what = SERVICE[unaccent(p.serviceType).replace(/\s+/g, "_")] ?? esc(p.serviceType);
  const where = p.locality ? ` en ${esc(titleCase(p.locality))}` : "";
  const plat = p.platform ? ` al ${esc(spokenModel(p.platform))}` : "";
  const when = !day && p.start && p.end ? ` del ${fecha(p.start)} al ${fecha(p.end)}` : "";
  return `${what}${plat}${where}${when}`;
}

const STATUS_WORD: Record<string, string> = { fatal: "en alarma fatal", warning: "con advertencia", ok: "operando sin alarmas", sin_dato: "sin estado del monitor" };
const STATUS_TONE: Record<string, Tone> = { fatal: "risk", warning: "warn", ok: "ok", sin_dato: "mute" };
const STATUS_CHIP: Record<string, string> = { fatal: "Fatal", warning: "Advertencia", ok: "Operando", sin_dato: "Sin dato" };

// ── Equipment resolution ─────────────────────────────────────────────────────
export async function findEquipment(t: Turn, query?: string | null): Promise<{ one?: D.Equipment; many?: D.Equipment[] }> {
  const q = query ?? slotText(t.slots, "serie") ?? slotText(t.slots, "equipo") ?? t.ctx.serial;
  if (!q) return {};
  const all = await t.run((tx) => D.activeEquipment(tx));
  const hits = D.matchEquipment(all, q);
  if (hits.length === 1) return { one: hits[0] };
  if (hits.length > 1) return { many: hits };
  // Serial that is monitored but not in the master (or typed fully): accept it as is.
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 6) return { one: { serial: D.normSerial(digits), model: null, client: null, city: null, state: null, country: null, address: null } };
  return {};
}
export function whichEquipment(t: Turn, intent: string, many?: D.Equipment[]): Reply {
  if (many?.length) {
    const opts = many.slice(0, 4).map((e) => equipName(e));
    return elicit(t.ctx, intent, "serie", `Encontré ${many.length}: ${joinY(opts)}. ¿Cuál? Dime la terminación de la serie.`);
  }
  return elicit(t.ctx, intent, "serie", "¿De qué equipo? Dime la terminación de la serie, por ejemplo cero cuatro siete tres.");
}

// ── Opening, help ────────────────────────────────────────────────────────────
// Alexa+ already says "Aquí tienes la skill Orion…" before the skill speaks, so the greeting is one short line and the
// first reply carries no Echo Show screen: nothing that could cut Alexa's own announcement (owner's request, 2026-10-11).
const OPENING = ["Orión en línea. ¿Qué revisamos?", "Orión listo. ¿Qué revisamos?", "Orión en línea. ¿En qué te ayudo?", "Orión activo. ¿Qué revisamos?"];
export function launch(t: Turn): Reply {
  return {
    text: OPENING[Math.floor(Math.random() * OPENING.length)]!,
    reprompt: "¿Qué quieres revisar? Por ejemplo: cómo vamos, o cómo está el cero cuatro siete tres.",
    ctx: t.ctx,
    noScreen: true,
  };
}

export function help(t: Turn): Reply {
  return {
    text: `Puedo decirte cómo va la flota y tu día. Con tus casos: te los leo y los filtro, por ejemplo «casos pendientes por piezas» o «casos de Monterrey»; te digo de qué se tratan, su bitácora y el contacto, y registro avances, llamadas, visitas, cambios de estado, la primera respuesta y el cierre, siempre preguntándote antes de guardar. De un equipo te digo su estado, alarmas, controles, calibraciones y su historial de casos, y si algo falla lo diagnostico con el motor DRI y te guío para verificarlo. También consulto el inserto de los reactivos. Prueba: mis casos, o cómo está el cero cuatro siete tres.`,
    reprompt: "¿Qué revisamos?",
    ctx: t.ctx,
    visual: { layout: "list", kicker: "Ayuda", title: "Lo que puedo hacer", subtitle: "Di la frase tal cual o algo parecido", offset: 0, rest: 0, items: [
      { text: "«Cómo vamos» · «Qué tengo hoy» · «Qué casos están en riesgo»", tone: "hud" },
      { text: "«Cómo está el 0473» · «Pasaron los controles» · «Muéstrame la curva de glucosa»", tone: "hud" },
      { text: "«Diagnostica el 0473: glucosa fuera, colesterol bien» · «Guíame»", tone: "warn" },
      { text: "«Estabilidad a bordo de colesterol» · «Abre un ticket…» · «Pregunta…»", tone: "hud" },
    ] },
  };
}

// ── Fleet & personal briefing ────────────────────────────────────────────────
async function briefingVisual(t: Turn): Promise<Visual> {
  const [f, tickets] = await t.run(async (tx) => [await D.fleet(tx), await D.openTickets(tx, t.viewer.role === "admin" ? "all" : "mine")] as const);
  const risk = tickets.filter((x) => x.sla.severity !== "healthy").sort((a, b) => D.slaRank(a) - D.slaRank(b));
  return {
    layout: "briefing",
    kicker: "Centro de servicio",
    title: `${t.viewer.name ? `${t.viewer.name}, ` : ""}así va la flota`,
    subtitle: `${f.online} de ${f.total} equipos reportando en las últimas 24 horas`,
    tiles: [
      { label: "EN LÍNEA", value: String(f.online), hint: `de ${f.total} monitoreados`, tone: "hud", frac: f.total ? f.online / f.total : 0 },
      { label: "ALARMA FATAL", value: String(f.fatal.length), hint: f.fatal[0] ? screenName(f.fatal[0]) : "sin fatales", tone: f.fatal.length ? "risk" : "ok", frac: f.online ? f.fatal.length / f.online : 0 },
      { label: "CONTROLES RECHAZADOS", value: String(f.qcRejected.length), hint: "últimas 24 horas", tone: f.qcRejected.length ? "warn" : "ok", frac: Math.min(1, f.qcRejected.length / 10) },
      { label: "SLA EN RIESGO", value: String(risk.length), hint: `${tickets.length} casos abiertos`, tone: risk.length ? "warn" : "ok", frac: tickets.length ? risk.length / tickets.length : 0 },
    ],
    rows: [
      ...f.fatal.slice(0, 2).map((x): VRow => ({ text: `${plainName(x)} · ${x.description ?? "fatal"}`, tone: "risk", tag: "FATAL" })),
      ...risk.slice(0, 2).map(ticketRow),
      ...f.qcRejected.slice(0, 1).map((q): VRow => ({ text: `Control rechazado · ${q.test} · ···${shortSerial(q.serial)}`, tone: "warn", tag: "BPL" })),
    ].slice(0, 4),
  };
}

export async function resumen(t: Turn): Promise<Reply> {
  const admin = t.viewer.role === "admin";
  const [f, tickets, plan] = await t.run(async (tx) => [await D.fleet(tx), await D.openTickets(tx, admin ? "all" : "mine"), await D.myPlanning(tx)] as const);
  const all = await t.run((tx) => D.activeEquipment(tx));
  const byS = new Map(all.map((e) => [e.serial, e]));
  const parts: string[] = [];
  if (!f.total) parts.push("No tengo equipos en monitoreo.");
  else if (f.online === f.total) parts.push(f.total === 1 ? "El equipo en monitoreo está reportando." : `Los ${f.total} equipos en monitoreo están reportando.`);
  else parts.push(`Tengo ${plural(f.total, "equipo")} en monitoreo; ${f.online === 0 ? "ninguno ha reportado" : f.online === 1 ? "uno reportó" : `${f.online} reportaron`} en las últimas 24 horas.`);
  if (f.fatal.length) {
    const first = f.fatal[0]!;
    const e = { ...first, ...(byS.get(first.serial) ?? {}) };
    const why = first.speech ? `. Alarma principal: ${esc(first.speech)}` : "";
    parts.push(f.fatal.length === 1 ? `${equipSubject(e)} está en alarma fatal${why}.` : `${f.fatal.length} están en alarma fatal; el primero es ${equipName(e)}${why}.`);
  } else if (f.total) parts.push("Ninguno está en alarma fatal.");
  if (f.qcRejected.length) {
    const tests = [...new Set(f.qcRejected.map((q) => sayTest(q.test)))];
    parts.push(f.qcRejected.length === 1 ? `En las últimas 24 horas se rechazó un control de ${esc(tests[0]!)}.` : `En las últimas 24 horas se rechazaron ${f.qcRejected.length} controles: de ${joinY(tests.slice(0, 3).map(esc))}.`);
  }
  const risk = tickets.filter((x) => x.sla.severity !== "healthy").sort((a, b) => D.slaRank(a) - D.slaRank(b));
  const subject = admin ? "Hay" : "Tienes";
  const count = (n: number) => (n === 1 ? (admin ? "un caso de soporte abierto" : "un caso abierto") : `${n} ${admin ? "casos de soporte abiertos" : "casos abiertos"}`);
  if (!tickets.length) parts.push(admin ? "No hay casos de soporte abiertos." : "No tienes casos abiertos.");
  else if (!risk.length) parts.push(`${subject} ${count(tickets.length)}, ${tickets.length === 1 ? "sin riesgo de SLA" : "ninguno en riesgo de SLA"}.`);
  else if (tickets.length === 1) parts.push(`${subject} ${count(1)} y está en riesgo: ${ticketLine(risk[0]!)}.`);
  else parts.push(`${subject} ${count(tickets.length)}; ${risk.length === 1 ? "uno está" : `${risk.length} están`} en riesgo. El más urgente es ${ticketLine(risk[0]!)}.`);
  const today = D.planOn(plan, todayIso());
  if (today.length) parts.push(`Hoy tienes ${today.length === 1 ? "un servicio planeado" : `${today.length} servicios planeados`}.`);
  const ctx: Ctx = { ...t.ctx, ticketIds: risk.map((x) => x.id).slice(0, 10), ticketId: risk.length === 1 ? risk[0]!.id : undefined, offer: f.fatal[0] ? { intent: "EquipoIntent", slots: { serie: f.fatal[0].serial } } : risk[0] ? { intent: "SlaIntent" } : undefined };
  const follow = f.fatal[0] ? " ¿Quieres que revise ese equipo?" : risk.length ? " ¿Te leo los casos en riesgo?" : ` ${anyMore()}`;
  return { text: parts.join(" ") + follow, ctx, visual: t.apl ? await briefingVisual(t).catch(() => undefined) : undefined };
}

// ── My day / planning ────────────────────────────────────────────────────────
export function dayFromSlot(slots: Slots | undefined): { day?: string; week?: { start: string; end: string } } {
  const v = slotText(slots, "cuando");
  if (!v) return { day: todayIso() };
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { day: v };
  const w = v.match(/^(\d{4})-W(\d{2})$/);
  if (w) {
    const jan4 = new Date(Date.UTC(Number(w[1]), 0, 4));
    const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 864e5 + (Number(w[2]) - 1) * 7 * 864e5);
    return { week: { start: monday.toISOString().slice(0, 10), end: new Date(monday.getTime() + 6 * 864e5).toISOString().slice(0, 10) } };
  }
  return { day: todayIso() };
}
export async function miDia(t: Turn): Promise<Reply> {
  const { day, week } = dayFromSlot(t.slots);
  const [plan, tickets] = await t.run(async (tx) => [await D.myPlanning(tx), await D.openTickets(tx, "mine")] as const);
  const items = week ? plan.filter((p) => (p.scheduled ? p.scheduled >= week.start && p.scheduled <= week.end : p.start && p.end ? p.start <= week.end && week.start <= p.end : false)) : D.planOn(plan, day!);
  const label = week ? "esta semana" : day === todayIso() ? "hoy" : cuando(day!, false);
  const parts: string[] = [];
  if (items.length) parts.push(`${label === "hoy" ? "Hoy" : label.charAt(0).toUpperCase() + label.slice(1)} tienes ${items.length === 1 ? "un servicio" : `${items.length} servicios`}: ${joinY(items.slice(0, 3).map((p) => planLine(p, day)))}${items.length > 3 ? `, y ${items.length - 3} más` : ""}.`);
  else parts.push(`No tienes servicios planeados para ${label}.`);
  const risk = tickets.sort((a, b) => D.slaRank(a) - D.slaRank(b));
  if (risk.length === 1) parts.push(`Además tienes un caso abierto: ${ticketLine(risk[0]!)}.`);
  else if (risk.length) parts.push(`Además tienes ${risk.length} casos abiertos; el más urgente es ${ticketLine(risk[0]!)}.`);
  return {
    text: `${parts.join(" ")} ${risk.length ? "¿Te leo tus casos?" : anyMore()}`,
    ctx: { ...t.ctx, ticketIds: risk.map((x) => x.id).slice(0, 10), ticketId: risk.length === 1 ? risk[0]!.id : undefined, offer: risk.length ? { intent: "MisTicketsIntent" } : undefined },
    visual: {
      layout: "list", kicker: "Tu agenda", title: week ? "Tu semana" : `Tu día · ${fecha(day!)}`, subtitle: `${items.length} servicios planeados · ${tickets.length} casos abiertos`, offset: 0, rest: 0,
      items: [
        ...items.slice(0, 3).map((p): VRow => ({ text: `${(SERVICE[unaccent(p.serviceType).replace(/\s+/g, "_")] ?? p.serviceType).toUpperCase()} · ${p.platform} · ${p.locality}`, tone: "hud", tag: "PLAN" })),
        ...risk.slice(0, 2).map(ticketRow),
      ].slice(0, 4),
    },
  };
}

// ── Tickets ──────────────────────────────────────────────────────────────────
export const ORD_SAY = ["El primero", "El segundo", "El tercero", "El cuarto", "El quinto", "El sexto", "El séptimo", "El octavo", "El noveno", "El décimo"];
export const ticketsVisual = (title: string, intro: string) => (chunk: string[], offset: number, rest: number): Visual => ({ layout: "list", kicker: "Casos", title, subtitle: intro.replace(/<[^>]+>/g, ""), items: chunk.map((c) => ({ text: c.replace(/<[^>]+>/g, ""), tone: /vencido/.test(c) ? "risk" : "hud" })), offset, rest });
export async function misTickets(t: Turn, onlyRisk = false): Promise<Reply> {
  // Admins supervise every case («repíteme los reportes» after the briefing means all of them); staff hear their own.
  const scope = t.viewer.role === "admin" ? "all" : "mine";
  const tickets = (await t.run((tx) => D.openTickets(tx, scope))).sort((a, b) => D.slaRank(a) - D.slaRank(b));
  const list = onlyRisk ? tickets.filter((x) => x.sla.severity !== "healthy") : tickets;
  if (!list.length) return { text: onlyRisk ? "Ningún caso está en riesgo de SLA." : "No tienes casos abiertos asignados.", ctx: t.ctx };
  const intro = onlyRisk ? (list.length === 1 ? "Hay un caso en riesgo:" : `Hay ${list.length} casos en riesgo.`) : list.length === 1 ? "Tienes un caso abierto:" : `Tienes ${list.length} casos abiertos.`;
  const items = list.map((x, i) => (list.length === 1 ? `${cap(ticketLine(x))}.` : `${ORD_SAY[i] ?? `El número ${i + 1}`} es ${ticketLine(x)}.`));
  const r = page({ ...t.ctx, ticketIds: list.map((x) => x.id).slice(0, 20), ticketId: list.length === 1 ? list[0]!.id : undefined }, "tickets", intro, items, 0, ticketsVisual(onlyRisk ? "Casos en riesgo" : "Tus casos", intro));
  if (!r.ctx.list) r.text = r.text.replace(/¿[^?]+\?$/, list.length === 1 ? "¿Quieres el detalle?" : "Para el detalle di, por ejemplo, «el primero», o la terminación del equipo.");
  if (!r.ctx.list && list.length === 1) r.ctx = { ...r.ctx, offer: { intent: "TicketDetalleIntent" } };
  return r;
}

/** Which case does the person mean? Ordinal or equipment first, then the case(s) just mentioned, then their open cases. */
export async function resolveTicket(t: Turn): Promise<{ ticket?: D.TicketInfo; many?: D.TicketInfo[]; none?: boolean }> {
  const scope = t.viewer.role === "admin" ? "all" : "mine";
  let poolCache: D.TicketInfo[] | null = null;
  const pool = async () => (poolCache ??= (await t.run((tx) => D.openTickets(tx, scope))).sort((a, b) => D.slaRank(a) - D.slaRank(b)));
  const recent = t.ctx.ticketIds ?? [];
  const ord = Number(resolved(t.slots, "ordinal").id ?? slotText(t.slots, "ordinal") ?? NaN);
  if (Number.isFinite(ord) && recent[ord - 1]) {
    const hit = (await pool()).find((x) => x.id === recent[ord - 1]);
    if (hit) return { ticket: hit };
  }
  const q = slotText(t.slots, "serie") ?? slotText(t.slots, "equipo");
  if (q) {
    const digits = q.replace(/\D/g, "");
    const words = unaccent(q).replace(/[0-9]/g, " ").split(/\s+/).filter((w) => w.length >= 3);
    const all = await pool();
    let hits = all.filter((x) => (digits.length >= 3 ? (x.serial ?? "").replace(/\D/g, "").endsWith(digits) : words.some((w) => unaccent(`${x.client ?? ""} ${x.subject} ${x.city ?? ""}`).includes(w))));
    const mentioned = hits.filter((x) => recent.includes(x.id));
    if (mentioned.length) hits = mentioned;
    if (hits.length === 1) return { ticket: hits[0] };
    if (hits.length > 1) return { many: hits };
    const eq = await findEquipment(t, q);
    if (eq.one) {
      const bySerial = (await t.run((tx) => D.ticketsForSerial(tx, eq.one!.serial))).sort((a, b) => D.slaRank(a) - D.slaRank(b));
      if (bySerial.length === 1) return { ticket: bySerial[0] };
      if (bySerial.length > 1) return { many: bySerial };
    }
    return { none: true };
  }
  if (t.ctx.ticketId) {
    const hit = (await pool()).find((x) => x.id === t.ctx.ticketId);
    if (hit) return { ticket: hit };
  }
  if (recent.length) {
    const all = await pool();
    const listed = recent.map((id) => all.find((x) => x.id === id)).filter((x): x is D.TicketInfo => Boolean(x));
    if (listed.length === 1) return { ticket: listed[0] };
    if (listed.length > 1) return { many: listed };
  }
  const all = await pool();
  if (all.length === 1) return { ticket: all[0] };
  if (all.length > 1) return { many: all };
  return { none: true };
}

export const caseWho = (x: D.TicketInfo) => (x.client ? `el de ${shortClient(x.client)}` : `«${esc(x.subject.slice(0, 50))}»`);
export async function ticketDetalle(t: Turn): Promise<Reply> {
  const r = await resolveTicket(t);
  if (r.none) return { text: slotText(t.slots, "serie") || slotText(t.slots, "equipo") ? "No encuentro un caso abierto de ese equipo entre los que puedes ver." : t.viewer.role === "admin" ? "No hay casos de soporte abiertos." : "No tienes casos abiertos.", ctx: t.ctx };
  if (r.many) {
    const list = r.many.slice(0, 4).map((x) => `${caseWho(x)}${x.serial ? `, terminación <say-as interpret-as="digits">${shortSerial(x.serial)}</say-as>` : ""}`);
    const ctx: Ctx = { ...t.ctx, ticketIds: r.many.map((x) => x.id).slice(0, 10), ticketId: undefined, offer: { intent: "TicketDetalleIntent" } };
    return elicit(ctx, "TicketDetalleIntent", "serie", `Hay ${r.many.length} casos: ${joinY(list)}${r.many.length > 4 ? `, y ${r.many.length - 4} más` : ""}. ¿De cuál equipo? Dime la terminación de la serie.`);
  }
  const ticket = r.ticket!;
  const log = await t.run((tx) => D.ticketLog(tx, ticket.id, 3));
  const last = log[0];
  const eq = ticket.serial ? `, del ${ticket.model ? esc(spokenModel(ticket.model)) : "equipo"} terminación <say-as interpret-as="digits">${shortSerial(ticket.serial)}</say-as>` : "";
  const parts = [
    ticket.client ? `Es el caso de ${shortClient(ticket.client)}${eq}. El motivo: ${esc(ticket.subject.slice(0, 120))}.` : `Es el caso «${esc(ticket.subject.slice(0, 120))}»${eq}.`,
    `Se abrió ${cuando(ticket.createdAt, false)} y su plazo de ${ticket.sla.limitHours} horas ${ticket.sla.severity === "breached" ? `ya venció hace ${duracion(-ticket.sla.remainingHours)}` : `vence en ${duracion(ticket.sla.remainingHours)}`}${ticket.sla.falcon && !/falcon/i.test(ticket.client ?? "") ? "; es de Falcon" : ""}.`,
    `Está ${STATUS_TICKET[ticket.status] ?? esc(ticket.status.replace(/_/g, " "))}${ticket.assignedToMe ? " y está asignado a ti" : ticket.assignee ? ` y está asignado a ${esc(ticket.assignee.split(/\s+/).slice(0, 2).join(" "))}` : t.viewer.role === "admin" ? " y no tiene a nadie asignado" : ""}.`,
    ticket.respondedAt ? `Se le respondió al cliente ${cuando(ticket.respondedAt)}.` : "Todavía no tiene primera respuesta al cliente.",
    last ? `Su último movimiento fue ${cuando(last.at!)}: ${esc(humanize(last.detail.slice(0, 160)))}.` : "Todavía no tiene movimientos en la bitácora.",
  ];
  const others = (t.ctx.ticketIds ?? []).filter((id) => id !== ticket.id).length;
  return {
    text: `${parts.join(" ")} ${others ? "¿Quieres dictar una nota para este caso, o que te diga los demás?" : "¿Quieres dictar una nota para este caso?"} También puedes decir, por ejemplo, «agrega un avance» o «cierra el caso».`,
    reprompt: "¿Quieres dictar una nota para este caso?",
    ctx: { ...t.ctx, ticketId: ticket.id, serial: ticket.serial ?? t.ctx.serial, offer: { intent: "DictarIntent" } },
    visual: { layout: "equipment", kicker: "Caso", label: `CASO ${ticket.folio}`, title: ticket.client ? shortClient(ticket.client) : ticket.subject.slice(0, 40), subtitle: ticket.subject.slice(0, 90), chip: { text: ticket.sla.severity === "breached" ? "Vencido" : `${Math.max(0, Math.round(ticket.sla.remainingHours))} h`, tone: slaTone(ticket) }, facts: [{ k: "ESTADO", v: STATUS_TICKET[ticket.status] ?? ticket.status.replace(/_/g, " ") }, { k: "PLAZO", v: `${ticket.sla.limitHours} h${ticket.sla.falcon ? " · Falcon" : ""}${ticket.sla.cdmx ? " CDMX" : ""}` }, { k: "EQUIPO", v: ticket.serial ? `···${shortSerial(ticket.serial)}` : "—" }, { k: "ASIGNADO", v: ticket.assignedToMe ? "A ti" : ticket.assignee ?? "—" }], rows: log.map((l) => ({ text: `${l.type} · ${l.detail.slice(0, 80)}`, tone: "hud" as Tone })) },
  };
}

/** "el control de glucosa nivel 1 se rechazó: dio 140 cuando la media es 100, unas 8 desviaciones estándar arriba" */
function qcRejectedSentence(x: D.BplTestStatus, when = "") {
  const q = x.qc!;
  const lvl = q.level ? ` ${LEVEL[q.level] ?? ""}` : "";
  let s = `el control de ${esc(sayTest(x.test))}${lvl} se rechazó${when ? ` ${when}` : ""}`;
  if (q.value != null && q.mean != null) {
    s += `: dio ${num(q.value)} cuando la media es ${num(q.mean)}`;
    if (q.z != null && Number.isFinite(q.z)) s += `, unas ${num(Math.abs(q.z), 0)} desviaciones estándar ${q.z >= 0 ? "arriba" : "abajo"}`;
  } else if (q.rules.length) s += ` porque ${explainRule(q.rules[0]!)}`;
  return s;
}

// ── Equipment status ─────────────────────────────────────────────────────────
export async function equipo(t: Turn): Promise<Reply> {
  const eq = await findEquipment(t);
  if (!eq.one) return whichEquipment(t, "EquipoIntent", eq.many);
  const e = eq.one;
  const [states, alarms, bpl, tickets] = await t.run(async (tx) => [await D.equipmentStates(tx, [e.serial]), await D.recentAlarms(tx, e.serial, 1, 50), await D.bplRows(tx, e.serial, 7, 400), await D.ticketsForSerial(tx, e.serial)] as const);
  const st = states.get(e.serial);
  const qc = D.bplStatus(e.serial, bpl);
  const parts: string[] = [];
  if (st) {
    const offline = st.online ? "" : ", aunque no reporta desde hace más de un día";
    parts.push(`${equipSubject(e)} está ${STATUS_WORD[st.status]}${st.status !== "ok" && st.since ? ` desde ${cuando(st.since)}` : ""}${offline}.`);
    const main = st.activeErrors[0]?.speech ?? st.speech;
    if (st.status !== "ok" && main) parts.push(`Alarma principal: ${esc(main)}.`);
  } else parts.push(`${cap(equipName(e))} no tiene estado publicado por el monitor.`);
  if (alarms.length) parts.push(alarms.length === 1 ? "Tuvo una alarma en las últimas 24 horas." : `Tuvo ${alarms.length} alarmas en las últimas 24 horas.`);
  if (qc?.tests.length) {
    const rej = qc.tests.filter((x) => x.qc?.status === "rejected");
    const ok = qc.tests.filter((x) => x.qc?.status === "accepted");
    if (rej.length) {
      parts.push(`${cap(qcRejectedSentence(rej[0]!))}.`);
      if (rej.length > 1) parts.push(`También se rechazaron ${joinY(rej.slice(1, 4).map((x) => esc(sayTest(x.test))))}.`);
      if (ok.length) parts.push(ok.length === 1 ? "El otro control de la semana salió bien." : "Los demás controles de la semana salieron bien.");
    } else if (ok.length) parts.push("Los controles de la semana salieron bien.");
  }
  if (tickets.length) {
    const first = tickets.sort((a, b) => D.slaRank(a) - D.slaRank(b))[0]!;
    parts.push(tickets.length === 1 ? `Tiene un caso abierto que ${slaPhrase(first)}.` : `Tiene ${tickets.length} casos abiertos; el más urgente ${slaPhrase(first)}.`);
  }
  const trouble = st?.status === "fatal" || st?.status === "warning" || qc?.tests.some((x) => x.qc?.status === "rejected");
  const ask = trouble ? " ¿Quieres que lo diagnostique?" : ` ${anyMore()}`;
  return {
    text: parts.join(" ") + ask,
    ctx: { ...t.ctx, serial: e.serial, ticketIds: tickets.map((x) => x.id), offer: trouble ? { intent: "DiagnosticoIntent", slots: { serie: e.serial } } : undefined },
    visual: {
      layout: "equipment", kicker: "Equipo", label: `SERIE ${e.serial}`, title: screenName(e), subtitle: [e.client ? shortClient(e.client) : null, e.city ?? e.state].filter(Boolean).join(" · "),
      chip: { text: STATUS_CHIP[st?.status ?? "sin_dato"]!, tone: STATUS_TONE[st?.status ?? "sin_dato"]! },
      facts: [
        { k: "ÚLTIMO EVENTO", v: st?.lastEventAt ? cuando(st.lastEventAt).replace(/<[^>]+>/g, "") : "—", tone: st?.online ? "hud" : "warn" },
        { k: "ALARMAS 24 H", v: String(alarms.length), tone: alarms.length ? "warn" : "ok" },
        { k: "CONTROLES 7 D", v: qc ? `${qc.tests.filter((x) => x.qc?.status === "accepted").length} ok · ${qc.tests.filter((x) => x.qc?.status === "rejected").length} rech.` : "sin BPL", tone: qc?.tests.some((x) => x.qc?.status === "rejected") ? "risk" : "ok" },
        { k: "CASOS", v: String(tickets.length), tone: tickets.length ? "warn" : "ok" },
      ],
      rows: [
        ...(st?.activeErrors ?? []).slice(0, 2).map((a): VRow => ({ text: `${a.code ?? ""} ${a.description ?? ""}${a.location ? ` · ${a.location}` : ""}`.trim(), tone: st?.status === "fatal" ? "risk" : "warn", tag: "ALARMA" })),
        ...(qc?.tests ?? []).filter((x) => x.qc?.status === "rejected").slice(0, 2).map((x): VRow => ({ text: `${x.test}${x.qc?.rules.length ? ` · ${x.qc.rules.join(", ")}` : ""}`, tone: "risk", tag: "CONTROL" })),
      ].slice(0, 3),
    },
  };
}

// ── Alarms ───────────────────────────────────────────────────────────────────
export async function alarmas(t: Turn): Promise<Reply> {
  const q = slotText(t.slots, "serie") ?? slotText(t.slots, "equipo");
  if (!q && !t.ctx.serial) {
    const f = await t.run((tx) => D.fleet(tx));
    if (!f.fatal.length) return { text: `Ningún equipo en alarma fatal ahora. ${f.warning ? `${plural(f.warning, "equipo")} con advertencia. ` : ""}${anyMore()}`, ctx: t.ctx };
    const all = await t.run((tx) => D.activeEquipment(tx));
    const byS = new Map(all.map((e) => [e.serial, e]));
    const items = f.fatal.map((x) => `${cap(equipName({ ...x, ...(byS.get(x.serial) ?? {}) }))}${x.speech ? `, por ${esc(x.speech)}` : ""}${x.since ? `, desde ${cuando(x.since)}` : ""}.`);
    return page({ ...t.ctx, offer: { intent: "EquipoIntent", slots: { serie: f.fatal[0]!.serial } } }, "fatal", f.fatal.length === 1 ? "Hay un equipo en alarma fatal:" : `Hay ${f.fatal.length} equipos en alarma fatal:`, items, 0, (chunk, offset, rest) => ({ layout: "list", kicker: "Alarmas", title: "Equipos en alarma fatal", subtitle: `${f.fatal.length} en este momento`, items: chunk.map((c) => ({ text: c.replace(/<[^>]+>/g, ""), tone: "risk" })), offset, rest }));
  }
  const eq = await findEquipment(t, q);
  if (!eq.one) return whichEquipment(t, "AlarmasIntent", eq.many);
  const ev = await t.run((tx) => D.recentAlarms(tx, eq.one!.serial, 14, 200));
  if (!ev.length) return { text: `${equipName(eq.one)} no tiene alarmas en los últimos 14 días. ${anyMore()}`, ctx: { ...t.ctx, serial: eq.one.serial } };
  const groups = new Map<string, { a: D.AlarmEvent; n: number }>();
  for (const a of ev) {
    const k = a.code ?? a.description ?? "?";
    const g = groups.get(k);
    if (g) g.n++;
    else groups.set(k, { a, n: 1 });
  }
  const sorted = [...groups.values()].sort((x, y) => y.n - x.n);
  const items = sorted.map(({ a, n }) => `${cap(esc(a.speech))}: ${n === 1 ? "una vez" : `${n} veces`}, la última ${cuando(a.at!)}.`);
  return page({ ...t.ctx, serial: eq.one.serial, offer: { intent: "DiagnosticoIntent", slots: { serie: eq.one.serial } } }, "alarms", `En los últimos 14 días, ${equipName(eq.one, false)} tuvo ${ev.length === 1 ? "una alarma" : `${ev.length} alarmas`}:`, items, 0, (chunk, offset, rest) => ({
    layout: "list", kicker: "Alarmas", title: `${screenName(eq.one!)} · 14 días`, subtitle: `${ev.length} eventos · ${sorted.length} códigos`, items: chunk.map((c) => ({ text: c.replace(/<[^>]+>/g, ""), tone: /fatal/i.test(c) ? "risk" : "warn" })), offset, rest,
  }));
}

export async function alarmaInfo(t: Turn): Promise<Reply> {
  const code = slotText(t.slots, "codigo");
  if (!code) return elicit(t.ctx, "AlarmaInfoIntent", "codigo", "¿Qué código de alarma?");
  const info = await t.run((tx) => D.alarmInfo(tx, code, t.ctx.serial));
  if (!info) return { text: `No tengo el código <say-as interpret-as="digits">${esc(code)}</say-as> en el catálogo de alarmas del BA400.`, ctx: t.ctx };
  const sev = info.severity === "fatal" ? "Es fatal: detiene el trabajo del equipo." : info.severity === "warning" ? "Es una advertencia: el equipo puede seguir trabajando." : "Es informativa.";
  const hist = t.ctx.serial ? (info.timesLast30Days ? ` En este equipo apareció ${info.timesLast30Days === 1 ? "una vez" : `${info.timesLast30Days} veces`} en 30 días, la última ${cuando(info.lastAt!)}.` : " En este equipo no ha aparecido en 30 días.") : "";
  return {
    text: `La alarma <say-as interpret-as="digits">${esc(info.code!)}</say-as> significa ${esc(alarmSpeechOf(info.code!, String(info.description)))}. ${sev}${hist} ${anyMore()}`,
    ctx: t.ctx,
    visual: { layout: "equipment", kicker: "Catálogo de alarmas", label: `ALARMA ${info.code}`, title: String(info.description), subtitle: String(info.location ?? ""), chip: { text: String(info.severity ?? "—"), tone: info.severity === "fatal" ? "risk" : "warn" }, facts: [{ k: "ALCANCE", v: String(info.scope ?? "—") }, { k: "ÚLTIMOS 30 DÍAS", v: t.ctx.serial ? String(info.timesLast30Days) : "—" }], rows: info.note ? [{ text: String(info.note), tone: "hud" }] : [] },
  };
}

const alarmSpeechOf = (code: string, description: string) => D.alarmSpeechFor(code, description);

// ── Controls, calibrations, reaction curves ──────────────────────────────────
const num = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? "sin dato" : Number(x).toLocaleString("es-MX", { maximumFractionDigits: d }));
const LEVEL: Record<string, string> = { level_1: "nivel 1", level_2: "nivel 2", level_3: "nivel 3" };
async function equipmentOrAsk(t: Turn, intent: string) {
  const eq = await findEquipment(t);
  return eq.one ? { e: eq.one } : { reply: whichEquipment(t, intent, eq.many) };
}

export async function controles(t: Turn): Promise<Reply> {
  const r = await equipmentOrAsk(t, "ControlesIntent");
  if (!r.e) return r.reply!;
  const test = slotText(t.slots, "prueba");
  const testCode = test ? canonicalTest(test) : null;
  const [rows, sat] = await t.run(async (tx) => [await D.bplRows(tx, r.e!.serial, 30), await D.satContext(tx, r.e!.serial)] as const);
  const st = D.bplStatus(r.e.serial, rows, testCode);
  const withQc = (st?.tests ?? []).filter((x) => x.qc);
  if (!withQc.length) {
    const satQc = sat.qcRows.filter((q) => !testCode || String(q.test_name).toUpperCase().includes(testCode));
    if (!satQc.length) return { text: `No tengo controles ${test ? `de ${esc(test)} ` : ""}de ${equipName(r.e, false)} en BPL ni en el último SAT.`, ctx: { ...t.ctx, serial: r.e.serial } };
    const out = satQc.filter((q) => q.analyzer_min != null && q.analyzer_max != null && (Number(q.result_value) < Number(q.analyzer_min) || Number(q.result_value) > Number(q.analyzer_max)));
    return { text: `Según el último SAT, ${plural(satQc.length, "control")}${out.length ? `; fuera de límites: ${joinY(out.slice(0, 3).map((q) => esc(sayTest(q.test_name))))}` : ", todos dentro de los límites del analizador"}. ${anyMore()}`, ctx: { ...t.ctx, serial: r.e.serial } };
  }
  const rejected = withQc.filter((x) => x.qc!.status === "rejected");
  const describe = (x: D.BplTestStatus) => {
    const q = x.qc!;
    if (q.status === "rejected") return `${qcRejectedSentence(x, cuando(q.at!))}${x.flips >= 2 ? "; además viene alternando entre aceptado y rechazado" : ""}`;
    const val = q.value != null ? `: dio ${num(q.value)}${q.mean != null ? ` con media de ${num(q.mean)}` : ""}` : "";
    return `el control de ${esc(sayTest(x.test))}${q.level ? ` ${LEVEL[q.level] ?? ""}` : ""} ${q.status === "accepted" ? "salió bien" : "está pendiente de evaluar"} ${cuando(q.at!)}${val}`;
  };
  let text: string;
  if (testCode) text = withQc.slice(0, 2).map((x) => `${cap(describe(x))}.`).join(" ");
  else if (rejected.length) text = `En los últimos 30 días hubo controles de ${plural(withQc.length, "prueba")}. ${rejected.slice(0, 3).map((x) => `${cap(describe(x))}.`).join(" ")} ${withQc.length > rejected.length ? "Los demás salieron bien." : ""}`;
  else text = `Los controles de las ${withQc.length} pruebas de los últimos 30 días salieron bien. El más reciente: ${describe(withQc.sort((a, b) => String(b.qc!.at).localeCompare(String(a.qc!.at)))[0]!)}.`;
  const offer = rejected.length ? { intent: "DiagnosticoIntent", slots: { serie: r.e.serial, pa: rejected[0]!.test } } : undefined;
  return {
    text: `${text}${rejected.length ? " ¿Quieres que lo diagnostique?" : ` ${anyMore()}`}`,
    ctx: { ...t.ctx, serial: r.e.serial, offer },
    visual: { layout: "list", kicker: "Controles · BPL", title: `${screenName(r.e)} · controles`, subtitle: `${withQc.length} pruebas · ${rejected.length} rechazadas`, offset: 0, rest: Math.max(0, withQc.length - 4), items: [...rejected, ...withQc.filter((x) => x.qc!.status !== "rejected")].slice(0, 4).map((x) => ({ text: `${x.test} · ${x.qc!.value != null ? `${num(x.qc!.value)} ${x.qc!.unit ?? ""}` : ""}${x.qc!.rules.length ? ` · ${x.qc!.rules.join(", ")}` : ""}`, tone: x.qc!.status === "rejected" ? "risk" : "ok" })) },
  };
}

export async function calibracion(t: Turn): Promise<Reply> {
  const r = await equipmentOrAsk(t, "CalibracionIntent");
  if (!r.e) return r.reply!;
  const test = slotText(t.slots, "prueba");
  const rows = await t.run((tx) => D.bplRows(tx, r.e!.serial, 120));
  const st = D.bplStatus(r.e.serial, rows, test ? canonicalTest(test) : null);
  const cal = (st?.tests ?? []).filter((x) => x.calibration).sort((a, b) => String(b.calibration!.at).localeCompare(String(a.calibration!.at)));
  if (!cal.length) return { text: `No tengo calibraciones ${test ? `de ${esc(test)} ` : ""}de ${equipName(r.e, false)} en los últimos 120 días.`, ctx: { ...t.ctx, serial: r.e.serial } };
  const c = cal[0]!;
  const k = c.calibration!;
  const extra = [k.factor != null ? `factor ${num(k.factor, 1)}` : null, k.correlation != null ? `correlación ${num(k.correlation, 4)}` : null, k.relativeError != null ? `error relativo ${num(k.relativeError, 1)} por ciento` : null].filter(Boolean);
  const verdict = k.status === "rejected" ? "y se rechazó" : k.status === "accepted" ? "y quedó aceptada" : "y está pendiente de evaluar";
  const text = `La última calibración de ${esc(sayTest(c.test))} fue ${cuando(k.at!)} ${verdict}${extra.length ? `, con ${extra.join(" y ")}` : ""}.${k.calibrator ? ` Se usó el calibrador ${esc(k.calibrator.toLowerCase())}${k.lot ? `, lote ${sayCode(k.lot)}` : ""}.` : ""}${!test && cal.length > 1 ? ` Hay ${cal.length - 1} pruebas más calibradas en ese periodo.` : ""} ${anyMore()}`;
  return {
    text,
    ctx: { ...t.ctx, serial: r.e.serial },
    visual: { layout: "equipment", kicker: "Calibración · BPL", label: `SERIE ${r.e.serial}`, title: c.test, subtitle: screenName(r.e), chip: { text: k.status === "rejected" ? "Rechazada" : k.status === "accepted" ? "Aceptada" : "Sin evaluar", tone: k.status === "rejected" ? "risk" : k.status === "accepted" ? "ok" : "warn" }, facts: [{ k: "FECHA", v: cuando(k.at!).replace(/<[^>]+>/g, "") }, { k: "FACTOR", v: num(k.factor, 1) }, { k: "CORRELACIÓN", v: num(k.correlation, 4) }, { k: "CALIBRADOR", v: [k.calibrator, k.lot].filter(Boolean).join(" · ") || "—" }], rows: [] },
  };
}

export async function curva(t: Turn): Promise<Reply> {
  const r = await equipmentOrAsk(t, "CurvaIntent");
  if (!r.e) return r.reply!;
  const test = slotText(t.slots, "prueba");
  const c = await t.run((tx) => D.reactionCurve(tx, r.e!.serial, test ? canonicalTest(test) : null));
  if (!c || !c.replicates.length) return { text: `No tengo curvas de reacción ${test ? `de ${esc(test)} ` : ""}de ${equipName(r.e, false)} con el cálculo vigente.`, ctx: { ...t.ctx, serial: r.e.serial } };
  const finals = c.replicates.map((x) => x.finalAbsorbance).filter((x): x is number => x != null);
  const spread = finals.length > 1 ? Math.max(...finals) - Math.min(...finals) : null;
  const text = `${t.apl ? "Te muestro" : "Te resumo"} la curva de reacción de ${esc(sayTest(c.test))}${c.sampleClass ? `, ${c.sampleClass === "CTRL" ? "control" : c.sampleClass === "CALIB" ? "calibrador" : "blanco"}` : ""}, ${cuando(c.at!)}: ${c.replicates.length === 1 ? "una réplica" : `${c.replicates.length} réplicas`}${finals.length ? `, absorbancia final ${joinY(finals.map((x) => num(x, 3)))}` : ""}${spread != null ? `; diferencia entre réplicas ${num(spread, 3)}` : ""}. ${anyMore()}`;
  const tones: Tone[] = ["hud", "ok", "warn", "mute"];
  return {
    text,
    ctx: { ...t.ctx, serial: r.e.serial },
    visual: { layout: "chart", kicker: "Curva de reacción", title: `${c.test} · ${screenName(r.e)}`, subtitle: cuando(c.at!).replace(/<[^>]+>/g, ""), xLabel: "CICLO", yLabel: "ABS 1", series: c.replicates.map((x, i) => ({ label: `Réplica ${x.replicate}`, tone: tones[i] ?? "hud", points: x.points })), facts: c.replicates.slice(0, 4).map((x) => ({ k: `RÉPLICA ${x.replicate}`, v: `Abs final ${num(x.finalAbsorbance, 3)}` })) },
  };
}

/** "19 de marzo de 2028" — lot expiries need the year. */
const fechaAnio = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "long", year: "numeric" });

// ── Lots & IFU ───────────────────────────────────────────────────────────────
const IFU_TOPICS: Record<string, string> = { estabilidad: "estabilidad", interferencias: "interferencias", linealidad: "linealidad", deteccion: "deteccion", precision: "precision", blanco: "blanco", caducidad: "caducidad" };
export async function ifu(t: Turn): Promise<Reply> {
  const test = slotText(t.slots, "prueba");
  if (!test) return elicit(t.ctx, t.intent, "prueba", "¿De qué prueba?");
  const lotSaid = slotText(t.slots, "lote");
  const topic = resolved(t.slots, "dato").id ?? (t.intent === "LoteIntent" ? "caducidad" : unaccent(slotText(t.slots, "dato") ?? "estabilidad"));
  const f = await t.run((tx) => D.lotFacts(tx, canonicalTest(test), lotSaid ?? null));
  const lot = f.lots[0];
  const name = esc(sayTest(test));
  if (!lot && !f.reagentIfu) return { text: `No tengo el inserto ni lotes documentados de ${name}${lotSaid ? ` con lote <say-as interpret-as="digits">${esc(lotSaid)}</say-as>` : ""}.`, ctx: t.ctx };
  const ifuR = (f.reagentIfu ?? {}) as Record<string, any>;
  let text = "";
  switch (IFU_TOPICS[topic] ?? topic) {
    case "estabilidad": {
      const hrs = lot?.onboardHours ?? ifuR.onboardStabilityHours;
      const days = hrs ? Math.round(hrs / 24) : 0;
      text = hrs ? `Según el inserto, ${name} abierto es estable a bordo ${hrs >= 48 ? `${days} días${days % 30 === 0 && days >= 30 ? `, es decir, ${days === 30 ? "un mes" : `${days / 30} meses`}` : ""}` : `${hrs} horas`}, en el compartimento refrigerado del analizador.` : `El inserto de ${name} no trae la estabilidad a bordo en lo que tengo documentado.`;
      break;
    }
    case "interferencias": {
      const list = (lot?.interferences ?? ifuR.interferenceThresholds ?? []) as Array<Record<string, any>>;
      text = list.length ? `Según el inserto de ${name}: ${joinY(list.slice(0, 4).map((i) => `${esc(String(i.label ?? i.interferent).toLowerCase())} no interfiere por debajo de ${num(i.thresholdValue)} ${sayUnit(i.unit)}`))}.` : `No tengo umbrales de interferencia documentados para ${name}.`;
      break;
    }
    case "linealidad":
      text = lot?.linearity ? `La linealidad de ${name} llega a ${num(lot.linearity.value)} ${sayUnit(lot.linearity.unit)}.` : ifuR.linearityValue ? `La linealidad de ${name} llega a ${num(ifuR.linearityValue)} ${sayUnit(ifuR.linearityUnit)}.` : `No tengo la linealidad de ${name}.`;
      break;
    case "deteccion":
      text = lot?.detectionLimit ? `El límite de detección de ${name} es ${num(lot.detectionLimit.value)} ${sayUnit(lot.detectionLimit.unit)}${lot.quantificationLimit ? ` y el de cuantificación ${num(lot.quantificationLimit.value)} ${sayUnit(lot.quantificationLimit.unit)}` : ""}.` : `No tengo el límite de detección de ${name}.`;
      break;
    case "precision":
      text = lot?.precision ? `Precisión de ${name}: coeficiente de variación de repetibilidad ${num(lot.precision.repeatabilityCv, 1)} por ciento y total ${num(lot.precision.totalCv, 1)} por ciento, a ${num(lot.precision.mean)} ${sayUnit(lot.precision.unit)}.` : `No tengo datos de precisión de ${name}.`;
      break;
    case "blanco":
      text = lot?.blankLimit != null ? `El blanco de reactivo de ${name} en el BA400 debe quedar por debajo de ${num(lot.blankLimit, 3)} de absorbancia${lot.coaBlank != null ? `; en el certificado de este lote salió ${num(lot.coaBlank, 3)}` : ""}.${lot.deterioration ? ` Signo de deterioro: ${esc(lot.deterioration.slice(0, 140))}.` : ""}` : `No tengo el límite de blanco de ${name}.`;
      break;
    default: {
      if (!lot) {
        text = `No tengo lotes documentados de ${name}${lotSaid ? ` con ese número` : ""}.`;
        break;
      }
      const lots = f.lots.slice(0, 3).map((l) => `el lote ${sayCode(l.productLot)}, que ${l.expired ? "caducó el" : "caduca el"} ${fechaAnio(l.expiresAt!)}`);
      text = `${lotSaid ? "" : f.lots.length === 1 ? `De ${name} tengo documentado ` : `De ${name} tengo documentados `}${joinY(lots)}.`;
    }
  }
  return {
    text: `${text} ${anyMore()}`,
    ctx: t.ctx,
    visual: lot ? { layout: "equipment", kicker: "IFU · einfo.bio", label: `${lot.productCode} · LOTE ${lot.productLot}`, title: sayTest(test).toUpperCase(), subtitle: `Componente ${lot.componentLot} · caduca ${fecha(lot.expiresAt!)}`, chip: { text: lot.expired ? "Caducado" : "Vigente", tone: lot.expired ? "risk" : "ok" }, facts: [{ k: "A BORDO", v: lot.onboardHours ? `${Math.round(lot.onboardHours / 24)} días` : "—" }, { k: "LINEALIDAD", v: lot.linearity ? `${lot.linearity.value} ${lot.linearity.unit}` : "—" }, { k: "BLANCO MÁX.", v: lot.blankLimit != null ? String(lot.blankLimit) : "—" }, { k: "FILTRO", v: lot.wavelength ? `${lot.wavelength} nm` : "—" }], rows: [] } : undefined,
  };
}

// ── Differential diagnosis (DRI) ─────────────────────────────────────────────
const testsFromSlots = (slots: Slots | undefined, names = ["pa", "pb", "pc"]) => names.map((n) => slotText(slots, n)).filter((x): x is string => Boolean(x)).map(canonicalTest);

type DiagOut = Awaited<ReturnType<typeof D.diagnose>>;
/** Engine text that names tests in capitals ("GLUCOSE") → spoken Spanish names; abbreviations expanded. */
const speakEngine = (text: string) => humanize(sayTestsIn(text));
const testList = (names: string[]) => joinY(names.map((x) => esc(sayTest(x))));
/** The direct check that confirms or rules out a factor that only lost weight by contrast. */
const DIRECT_CHECK: Array<[RegExp, string]> = [
  [/^wavelength:/i, "la utilidad Photometry y la línea base"],
  [/^r2/i, "la utilidad Motors, valves and pumps"],
  [/^temperature/i, "la utilidad Thermostatting"],
  [/^(blank|water|wash)/i, "una inspección de la estación de lavado"],
];
/**
 * "El filtro de 505 nanómetros pierde peso, porque colesterol, triglicéridos y ácido úrico también lo usan y salen
 * bien; no lo descarto hasta correr la utilidad Photometry y la línea base." Contrast is indirect evidence: a partial
 * failure can hit only some tests, so only a direct check rules a factor out.
 */
function exonerationSentence(ex: { signalId?: string; label: string; correct: string[] }) {
  const who = ex.correct.slice(0, 3);
  const check = DIRECT_CHECK.find(([re]) => re.test(String(ex.signalId ?? "")))?.[1];
  const because = who.length ? `${testList(who)} también ${who.length === 1 ? "lo usa y sale" : "lo usan y salen"} bien` : "las pruebas que salen bien también lo usan";
  return `${cap(factorSpeech(ex.label))} pierde peso, porque ${because}; no lo descarto${check ? ` hasta correr ${check}` : " sin una prueba directa"}.`;
}

/** The hardware factor that lost weight by contrast (filter, R2, temperature, wash): the one worth saying and showing. */
const spokenExoneration = (r: NonNullable<DiagOut["result"]>) => r.exonerations.find((x) => /^(wavelength:(?!ref)|r2|temperature|blank|water|wash)/i.test(String(x.signalId ?? "")));

function diagnosisSpeech(e: D.Equipment, d: DiagOut): string {
  const r = d.result!;
  const used = [...new Set(d.applied.filter((a) => a.failed || a.correct || a.kind === "monitoring").map((a) => SOURCE_SPOKEN[a.kind as string]).filter(Boolean))];
  const parts: string[] = [];
  const failedSaid = `${d.failed.length === 1 ? "falla" : "fallan"} ${testList(d.failed)}`;
  const correctSaid = !d.correct.length ? "" : d.correct.length <= 3 ? `, y ${testList(d.correct)} ${d.correct.length === 1 ? "sale" : "salen"} bien` : `, y otras ${d.correct.length} pruebas salen bien`;
  parts.push(used.length ? `Revisé ${joinY(used)}: ${failedSaid}${correctSaid}.` : `${cap(failedSaid)}${correctSaid}.`);
  const top = r.hypotheses[0];
  const second = r.hypotheses[1];
  if (!top) return `${parts[0]} No encuentro una causa con suficiente evidencia. Dime qué pruebas salen bien o qué alarma tiene, y lo afino.`;
  parts.push(top.score >= 95 ? `Casi seguro es ${hypothesisCause(top.key, top.title)}.` : `Lo más probable, con ${top.score} por ciento de certeza, es ${hypothesisCause(top.key, top.title)}.`);
  const ex = spokenExoneration(r);
  if (ex) parts.push(exonerationSentence(ex));
  const lot = r.lotFindings[0];
  if (lot) parts.push(`Ojo con el lote: ${esc(speakEngine(String(lot.title)).toLowerCase())}.`);
  const close = second && second.score >= top.score - 15;
  if (close) parts.push(`La segunda opción, con ${second.score} por ciento, es ${hypothesisCause(second.key, second.title)}.`);
  const disc = r.discriminating[0];
  if (disc) {
    const factor = disc.factors[0];
    const why = factor ? `: comparte ${factorSpeech(factor)} con ${esc(sayTest(d.failed[0]!))}; si sale bien, eso pierde peso, y si falla, gana peso` : "";
    parts.push(`Para ${close ? "distinguirlas" : "confirmarlo"}, corre ${esc(sayTest(disc.test))}${why}.`);
  } else if (top.checklist[0]) {
    const v = VOICE_STEPS[top.checklist[0].id];
    if (v) parts.push(`Lo primero: ${v.instruction.charAt(0).toLowerCase()}${v.instruction.slice(1)}`);
  }
  return parts.join(" ");
}
function diagnosisVisual(e: D.Equipment, d: DiagOut): Visual {
  const r = d.result!;
  const ex = spokenExoneration(r);
  return {
    layout: "diagnosis", kicker: "Diagnóstico diferencial · DRI", title: `${screenName(e)} · hipótesis`,
    subtitle: `Fallan: ${d.failed.join(", ")}${d.correct.length ? ` · Bien: ${d.correct.slice(0, 5).join(", ")}${d.correct.length > 5 ? "…" : ""}` : ""}`,
    bars: r.hypotheses.slice(0, 4).map((h, i) => ({ label: h.title, detail: [h.subsystem, h.for[0]].filter(Boolean).join(" · "), frac: h.score / 100, tone: (i === 0 ? (h.score >= 70 ? "risk" : "warn") : "hud") as Tone, value: `${h.score}%` })),
    note: ex ? { text: `Menos probable por contraste, sin descartar: ${ex.label} (${ex.correct.slice(0, 3).join(", ")} salen bien)`, tone: "hud" } : r.lotFindings[0] ? { text: `Lote: ${r.lotFindings[0].title}`, tone: "warn" } : undefined,
    hint: "Di «guíame» para verificar paso a paso, o «por qué»",
  };
}

async function runDiagnosis(t: Turn, e: D.Equipment, failed: string[], correct: string[]): Promise<Reply> {
  await progressive(t.body, `Reviso las alarmas y los controles ${equipName(e, false).replace(/^el /, "del ")}.`);
  const job = t.run((tx) => D.diagnose(tx, { serial: e.serial, failedTests: failed, correctTests: correct }, e));
  const res = await withDeadline(job, Math.max(1500, 6800 - (Date.now() - t.started)));
  if (!res.done) {
    const id = await S.startAnswer(t.alexaUser, t.viewer.id, `Diagnóstico de ${e.serial}`);
    background(res.promise.then(async (d) => S.finishAnswer(id, d.ready ? diagnosisSpeech(e, d) : "No encontré pruebas fuera de control en las fuentes; dime cuáles fallan.")).catch((err) => S.failAnswer(id, String(err))));
    return { text: "Sigo cruzando las fuentes del equipo. Pregúntame «qué encontraste» en unos segundos.", reprompt: "¿Quieres oír lo que encontré?", ctx: { ...t.ctx, serial: e.serial, pendingAnswerId: id, offer: { intent: "QueEncontrasteIntent" } } };
  }
  const d = res.value;
  const diag = { serial: e.serial, failed: d.failed, correct: d.correct };
  if (!d.ready) {
    const fromSources = d.applied.length > 0;
    return elicit({ ...t.ctx, serial: e.serial, diag: { ...diag, asked: "failed" } }, "DiagnosticoIntent", "pa", `${fromSources ? "En los controles del equipo no veo pruebas rechazadas." : ""} ¿Qué pruebas te están saliendo fuera de control?`.trim(), { serie: e.serial });
  }
  const r = d.result!;
  const caseId = await S.saveVoiceCase(t.viewer.id, { serial: e.serial, model: e.model, failed: d.failed, correct: d.correct, sources: d.applied, result: r, existingId: t.ctx.diag?.serial === e.serial ? t.ctx.diag.caseId : undefined }).catch(() => undefined);
  const askCorrect = !d.correct.length && !t.ctx.diag?.asked;
  const text = `${diagnosisSpeech(e, d)} ${askCorrect ? "Si me dices qué pruebas salen bien, puedo afinar el diagnóstico." : "¿Quieres que te guíe para verificarlo?"}`;
  const top = r.hypotheses.slice(0, 4).map((h) => ({ key: h.key, title: h.title, score: h.score }));
  const cut = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const hx = r.hypotheses.slice(0, 2).map((h) => ({ key: h.key, title: h.title, for: h.for.slice(0, 3).map((x) => cut(x, 260)), against: h.against.slice(0, 2).map((x) => cut(x, 260)), steps: hypothesisSteps(h), warning: null }));
  const exSpoken = spokenExoneration(r);
  const why = { exoneration: exSpoken ? exonerationSentence(exSpoken) : undefined, missing: r.missing[0] ? missingSpeech(r.missing[0]) : undefined };
  return {
    text,
    reprompt: askCorrect ? "¿Qué pruebas salen bien?" : "¿Quieres que te guíe para verificarlo?",
    ctx: { ...t.ctx, serial: e.serial, diag: { ...diag, caseId, top, hx, why, asked: askCorrect ? "correct" : undefined }, offer: askCorrect ? undefined : { intent: "GuiaIntent" }, proc: undefined },
    visual: diagnosisVisual(e, d),
    card: { title: `Orion · DRI ${e.serial}`, text: r.hypotheses.slice(0, 4).map((h) => `${h.score}% ${h.title}`).join("\n") },
  };
}

export async function diagnostico(t: Turn): Promise<Reply> {
  const eq = await findEquipment(t);
  if (!eq.one) return whichEquipment(t, "DiagnosticoIntent", eq.many);
  const said = testsFromSlots(t.slots);
  const same = t.ctx.diag?.serial === eq.one.serial;
  const failed = [...new Set([...(same ? t.ctx.diag!.failed : []), ...said])];
  const correct = (same ? t.ctx.diag!.correct : []).filter((c) => !failed.includes(c));
  return runDiagnosis(t, eq.one, failed, correct);
}

/** "Glucosa y urea salen bien" / "también falla creatinina": refine the case in this session. */
export async function pruebas(t: Turn, side: "correct" | "failed"): Promise<Reply> {
  const said = testsFromSlots(t.slots);
  if (!t.ctx.diag) {
    if (side === "failed") return diagnostico(t);
    return { text: "Primero dime qué equipo diagnostico y qué pruebas fallan. Por ejemplo: diagnostica el cero cuatro siete tres, glucosa fuera.", ctx: t.ctx };
  }
  if (!said.length && side === "correct" && t.ctx.diag.asked === "correct") return { text: "De acuerdo, sigo sin pruebas de comparación. ¿Quieres que te guíe para verificarlo?", ctx: { ...t.ctx, diag: { ...t.ctx.diag, asked: undefined }, offer: { intent: "GuiaIntent" } } };
  const d = t.ctx.diag;
  const failed = side === "failed" ? [...new Set([...d.failed, ...said])] : d.failed.filter((x) => !said.includes(x));
  const correct = side === "correct" ? [...new Set([...d.correct, ...said])] : d.correct.filter((x) => !said.includes(x));
  const all = await t.run((tx) => D.activeEquipment(tx));
  const e = all.find((x) => x.serial === d.serial) ?? { serial: d.serial, model: null, client: null, city: null, state: null, country: null, address: null };
  return runDiagnosis({ ...t, ctx: { ...t.ctx, diag: { ...d, asked: "correct" } } }, e, failed, correct);
}

export function porQue(t: Turn): Reply {
  const d = t.ctx.diag;
  const h = d?.hx?.[0];
  if (!d || !h) return { text: "Todavía no tengo un diagnóstico en esta conversación. Pídeme que diagnostique un equipo.", ctx: t.ctx };
  const clean = (x: string) => esc(reasonSpeech(x.replace(/…$/, "")));
  const reasons = h.for.slice(0, 2).map(clean);
  const parts = [`Me inclino por ${hypothesisCause(h.key, h.title)} por esto: ${joinY(reasons) || "es la causa que más evidencia reúne"}.`];
  if (h.against[0]) parts.push(`Lo que pesa en contra: ${clean(h.against[0])}.`);
  if (d.why?.exoneration) parts.push(d.why.exoneration);
  if (d.why?.missing) parts.push(`Para afinarlo necesitaría ${esc(d.why.missing)}.`);
  parts.push("¿Quieres que te guíe para verificarlo?");
  return { text: parts.join(" "), ctx: { ...t.ctx, offer: { intent: "GuiaIntent" } } };
}

export async function otras(t: Turn): Promise<Reply> {
  const top = t.ctx.diag?.top;
  if (!top?.length) return { text: "No tengo un diagnóstico abierto. Pídeme que diagnostique un equipo.", ctx: t.ctx };
  const rest = top.slice(1);
  if (!rest.length) return { text: `Solo hay una causa con evidencia: ${hypothesisCause(top[0]!.key, top[0]!.title)}.`, ctx: t.ctx };
  return { text: `Además de ${hypothesisCause(top[0]!.key, top[0]!.title)}, podría ser ${joinY(rest.map((h) => `${hypothesisCause(h.key, h.title)}, con ${h.score} por ciento`))}. Si quieres revisar una, di por ejemplo «guíame en la segunda».`, ctx: t.ctx };
}

// ── Guided verification (checklist + actions of the chosen hypothesis) ──────
/** Checklist (with its yes/no question) + confirmatory and corrective actions, all in spoken Spanish. */
function hypothesisSteps(h: D.HypothesisSummary): ProcStep[] {
  const steps: ProcStep[] = h.checklist.map((c) => {
    const v = VOICE_STEPS[c.id];
    if (v) return { text: v.instruction, check: { id: c.id, question: v.question, yes: v.yes, no: v.no, yesSupports: v.yesSupports } };
    return { text: `${speakEngine(c.title)}.`, check: { id: c.id, question: `¿${speakEngine(c.expected).replace(/\.$/, "")}?`, yes: speakEngine(c.onPass), no: speakEngine(c.onFail), yesSupports: false } };
  });
  const seen = new Set(steps.map((s) => s.text));
  for (const a of h.actions) {
    const text = actionSpeech(a);
    if (!seen.has(text)) steps.push({ text });
  }
  for (const a of h.corrective) steps.push({ text: `Si se confirma: ${actionSpeech(a).charAt(0).toLowerCase()}${actionSpeech(a).slice(1)}` });
  return steps.slice(0, 8);
}

export async function guia(t: Turn): Promise<Reply> {
  const d = t.ctx.diag;
  if (!d) return { text: "Para guiarte necesito un diagnóstico. Dime: diagnostica el cero cuatro siete tres, y qué prueba falla.", ctx: t.ctx };
  const ord = Math.max(1, Number(resolved(t.slots, "ordinal").id ?? slotText(t.slots, "ordinal") ?? 1) || 1);
  let h: { key: string; title: string; steps: ProcStep[]; warning?: string | null } | undefined = d.hx?.[ord - 1];
  if (!h) {
    const all = await t.run((tx) => D.activeEquipment(tx));
    const e = all.find((x) => x.serial === d.serial) ?? null;
    const out = await t.run((tx) => D.diagnose(tx, { serial: d.serial, failedTests: d.failed, correctTests: d.correct }, e));
    const full = out.result?.hypotheses[Math.min(ord, out.result.hypotheses.length) - 1];
    if (full) h = { key: full.key, title: full.title, steps: hypothesisSteps(full), warning: full.warning };
  }
  if (!h) return { text: "No tengo pasos para esa hipótesis.", ctx: t.ctx };
  if (!h.steps.length) return { text: `Para ${hypothesisCause(h.key, h.title)} no tengo pasos de verificación en la base del DRI.`, ctx: t.ctx };
  const proc = { caseId: d.caseId, hypKey: h.key, title: h.title, steps: h.steps, i: 0 };
  const intro = `Vamos a verificar ${hypothesisCheck(h.key, h.title)}. Son ${h.steps.length} pasos; cuando te pregunte algo, contéstame sí o no. `;
  return stepReply({ ...t, ctx: { ...t.ctx, proc } }, intro);
}
function stepReply(t: Turn, intro = ""): Reply {
  const p = t.ctx.proc!;
  const s = p.steps[p.i]!;
  const last = p.i === p.steps.length - 1;
  const q = s.check ? ` ${s.check.question}` : last ? " Es el último paso; cuando termines, dime si se resolvió la falla." : " Cuando lo tengas, di «siguiente».";
  return {
    text: `${intro}Paso ${p.i + 1}. ${esc(s.text)}${q}`,
    reprompt: s.check ? `${s.check.question} Contéstame sí o no.` : "Di «siguiente», «repite» o «anterior».",
    ctx: { ...t.ctx, proc: { ...p, awaiting: Boolean(s.check) }, offer: undefined },
    visual: { layout: "procedure", kicker: "Verificación guiada", title: hypothesisCheck(p.hypKey ?? "", p.title).replace(/^si es /, "¿Es "), step: p.i + 1, total: p.steps.length, body: s.text, caution: s.check?.question, hint: s.check ? "Responde «sí» o «no»" : "«Siguiente» · «Repite» · «Anterior»" },
  };
}
export async function pasoResultado(t: Turn, ok: boolean): Promise<Reply> {
  const p = t.ctx.proc!;
  const s = p.steps[p.i]!;
  const c = s.check!;
  const verdict = ok ? c.yes : c.no;
  const supports = c.yesSupports ? ok : !ok;
  if (p.caseId) await S.recordCheck(p.caseId, { hypothesis: p.hypKey, step: c.id, question: c.question, answer: ok ? "sí" : "no", supportsHypothesis: supports }).catch(() => undefined);
  const next = p.i + 1;
  if (next >= p.steps.length) return { text: `${esc(verdict)} Con eso terminamos la verificación. ¿Se resolvió la falla?`, reprompt: "¿Se resolvió la falla?", ctx: { ...t.ctx, proc: undefined } };
  return stepReply({ ...t, ctx: { ...t.ctx, proc: { ...p, i: next, awaiting: false } } }, `${esc(verdict)} `);
}
export function pasoMover(t: Turn, delta: number): Reply {
  const p = t.ctx.proc!;
  const i = Math.max(0, Math.min(p.steps.length - 1, p.i + delta));
  if (delta > 0 && p.i === p.steps.length - 1) return { text: "Ese era el último paso. ¿Se resolvió la falla?", ctx: { ...t.ctx, proc: undefined } };
  if (p.steps[p.i]?.check && p.awaiting && delta > 0) return { text: `Antes de seguir: ${p.steps[p.i]!.check!.question} Contéstame sí o no.`, ctx: t.ctx };
  return stepReply({ ...t, ctx: { ...t.ctx, proc: { ...p, i } } });
}

// ── Case outcome (learning loop) ─────────────────────────────────────────────
export async function resultadoCaso(t: Turn, outcome: "resuelto" | "no_resuelto" | "parcial", note?: string): Promise<Reply> {
  const caseRow = t.ctx.diag?.caseId ? { id: t.ctx.diag.caseId } : await S.latestOpenCase(t.viewer.id);
  if (!caseRow) return { text: "No tengo un diagnóstico de voz pendiente de resultado. ¿Qué más revisamos?", ctx: t.ctx };
  await S.setOutcome(caseRow.id, outcome, note ?? null, t.ctx.proc?.hypKey ?? t.ctx.diag?.top?.[0]?.key ?? null);
  const text = outcome === "resuelto"
    ? `Excelente, lo registro como resuelto${note ? `: ${esc(note)}` : ""}. Con esto el DRI aprende para el siguiente caso. ¿Quieres dictar una nota para el caso?`
    : outcome === "parcial"
      ? "Lo registro como resuelto en parte. Si quieres revisar la segunda opción, di «guíame en la segunda»."
      : "Lo registro como no resuelto. Revisemos la segunda opción: di «guíame en la segunda», o cuéntame qué más observas.";
  return { text, ctx: { ...t.ctx, offer: outcome === "resuelto" ? { intent: "DictarIntent" } : undefined } };
}

// ── Alerts ───────────────────────────────────────────────────────────────────
export async function avisos(t: Turn): Promise<Reply> {
  const list = await S.openAlerts(t.viewer.id);
  if (!list.length) return { text: `No tienes avisos pendientes. ${anyMore()}`, ctx: t.ctx };
  const items = list.map((a) => esc(a.speech));
  const r = page({ ...t.ctx, offer: undefined }, "alerts", list.length === 1 ? "Tienes un aviso:" : `Tienes ${list.length} avisos:`, items, 0, (chunk, offset, rest) => ({ layout: "list", kicker: "Avisos", title: "Avisos de Orion", subtitle: "Di «enterado» para confirmar que los atiendes", items: chunk.map((c, i) => ({ text: c, tone: list[offset + i]?.severity === "critical" ? "risk" : "warn" })), offset, rest }));
  if (!r.ctx.list) r.text = r.text.replace(/¿[^?]+\?$/, list.length === 1 ? "Di «enterado» para confirmarlo." : "Di «enterado» para confirmarlos.");
  return { ...r, ctx: { ...r.ctx, offer: { intent: "AcuseIntent" } } };
}
export async function acuse(t: Turn): Promise<Reply> {
  const n = await S.ackAll(t.viewer.id);
  return { text: n ? `Listo, ${n === 1 ? "aviso confirmado" : `${n} avisos confirmados`}. ${anyMore()}` : "No había avisos por confirmar.", ctx: { ...t.ctx, offer: undefined } };
}
export async function avisosConfig(t: Turn, on: boolean): Promise<Reply> {
  await S.setNotify(t.alexaUser, on);
  return { text: on ? "Avisos activados: te aviso en silencio de alarmas fatales, controles rechazados y casos por vencer, fuera de tu horario de descanso. Recuerda permitir las notificaciones de Orion en la app de Alexa." : "Avisos desactivados para este dispositivo.", ctx: t.ctx };
}

// ── Free-form questions (Claude + Orion tools) ───────────────────────────────
export async function pregunta(t: Turn, question?: string): Promise<Reply> {
  const q = question ?? slotText(t.slots, "consulta");
  if (!q) return { text: "¿Qué quieres saber? Empieza con «pregunta» y lo que necesitas.", ctx: t.ctx };
  if (!agentEnabled()) return { text: "Las preguntas abiertas todavía no están activadas en Orion. Puedo responderte cómo vamos, tu agenda, el estado de un equipo o diagnosticar una falla.", ctx: t.ctx };
  await progressive(t.body, "Déjame revisarlo.");
  const context = `Usuario: ${t.viewer.name || "sin nombre"} (${t.viewer.role === "admin" ? "administrador" : "equipo de servicio"}). Fecha y hora en México: ${new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "full", timeStyle: "short" })}.${t.ctx.serial ? ` Equipo en conversación: serie ${t.ctx.serial}.` : ""}${t.ctx.diag?.top?.length ? ` Diagnóstico en curso (${t.ctx.diag.serial}): fallan ${t.ctx.diag.failed.join(", ")}; bien ${t.ctx.diag.correct.join(", ") || "ninguna dicha"}; hipótesis ${t.ctx.diag.top.map((h) => `${h.title} ${h.score}%`).join("; ")}.` : ""}`;
  const job = runAgent({ question: q, context, tools: buildTools(t), history: t.ctx.history });
  const res = await withDeadline(job, Math.max(1500, 7000 - (Date.now() - t.started)));
  if (!res.done) {
    const id = await S.startAnswer(t.alexaUser, t.viewer.id, q);
    background(res.promise.then((r) => S.finishAnswer(id, r.text)).catch((e) => S.failAnswer(id, String(e))));
    return { text: "Lo sigo analizando. Pregúntame «qué encontraste» en unos segundos.", reprompt: "¿Quieres oír lo que encontré?", ctx: { ...t.ctx, pendingAnswerId: id, offer: { intent: "QueEncontrasteIntent" } } };
  }
  const a = res.value.text || "No encontré una respuesta clara.";
  const history = [...(t.ctx.history ?? []), { q: q.slice(0, 300), a: a.slice(0, 400) }].slice(-4);
  return { text: esc(a), reprompt: "¿Algo más?", ctx: { ...t.ctx, history }, visual: { layout: "message", kicker: "Orion responde", title: q.length > 60 ? `${q.slice(0, 57)}…` : q, body: a } };
}

export async function queEncontraste(t: Turn): Promise<Reply> {
  const a = await S.takeAnswer(t.alexaUser, t.ctx.pendingAnswerId);
  if (!a) return { text: "No tengo nada pendiente. ¿Qué revisamos?", ctx: { ...t.ctx, pendingAnswerId: undefined } };
  if (a.status === "pending") return { text: "Todavía estoy en eso. Dame unos segundos más y vuelve a preguntarme.", reprompt: "¿Quieres oír lo que encontré?", ctx: { ...t.ctx, offer: { intent: "QueEncontrasteIntent" } } };
  if (a.status === "error") return { text: "No pude terminar el análisis. Intenta preguntarlo de nuevo.", ctx: { ...t.ctx, pendingAnswerId: undefined } };
  const history = [...(t.ctx.history ?? []), { q: a.question.slice(0, 300), a: String(a.answer).slice(0, 400) }].slice(-4);
  return { text: esc(String(a.answer)), ctx: { ...t.ctx, pendingAnswerId: undefined, history }, visual: { layout: "message", kicker: "Orion responde", title: a.question.length > 60 ? `${a.question.slice(0, 57)}…` : a.question, body: String(a.answer) } };
}

export const greetingHour = () => localHour();
export { n0, pause };
