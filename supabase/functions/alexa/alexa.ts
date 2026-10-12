// ORION · Alexa protocol helpers: replies, Echo Show screens, dialog directives, progressive responses, slots.
import { plain, renderDirective, type Visual } from "./apl.ts";
import { INTENT_SLOTS } from "./intentSlots.generated.ts";
import { brandSpeech } from "./speech.ts";

export type Slots = Record<string, { value?: string; resolutions?: { resolutionsPerAuthority?: Array<{ status?: { code: string }; values?: Array<{ value: { id: string; name: string } }> }> }; slotValue?: { type?: string; values?: Array<{ value?: string }> } }>;

/** One step of a guided verification, already in spoken Spanish (voice.ts VOICE_STEPS). */
export interface ProcStep {
  text: string;
  check?: { id: string; question: string; yes: string; no: string; yesSupports: boolean };
}

export interface PendingWrite {
  kind: "movimiento" | "respuesta" | "cierre" | "asignacion" | "justificacion" | "ticket";
  /** detalle/motivo: still collecting; confirm: first «sí»; confirm2: the second «confirmo» (WhatsApp to the client). */
  step: "detalle" | "motivo" | "confirm" | "confirm2";
  ticketId?: string;
  /** Spoken name of the case ("el caso de Demo Centro, terminación 0473") and its plain screen label. */
  label: string;
  screen: string;
  tipo?: string;
  detalle?: string;
  estado?: string;
  motivo?: string;
  persona?: { id: string; name: string; team?: "quimica" | "ingenieria" | null };
  /** Assigning outside the case's area changes its attention profile (subject tag) to this area. */
  areaChange?: { from: "quimica" | "ingenieria"; to: "quimica" | "ingenieria" };
  ticket?: { serial: string | null; area: "quimica" | "ingenieria"; motivo: string; descripcion: string };
  /** The action messages the client (first response / closure) and therefore needs the double confirmation. */
  whatsapp?: boolean;
  phone?: boolean;
}

/** Conversation state carried in session attributes. */
export interface Ctx {
  serial?: string;
  ticketIds?: string[];
  ticketId?: string;
  list?: { kind: string; intro: string; items: string[]; offset: number };
  offer?: { intent: string; slots?: Record<string, string> };
  diag?: {
    caseId?: string;
    serial: string;
    failed: string[];
    correct: string[];
    asked?: "failed" | "correct";
    top?: Array<{ key: string; title: string; score: number }>;
    /** Compact detail of the two leading hypotheses ("por qué", "guíame") so follow-ups need no database round trip. */
    hx?: Array<{ key: string; title: string; for: string[]; against: string[]; steps: ProcStep[]; warning?: string | null }>;
    why?: { exoneration?: string; missing?: string };
  };
  proc?: { caseId?: string; hypKey?: string; title: string; steps: ProcStep[]; i: number; awaiting?: boolean };
  dictation?: { ticketId: string; label: string; lines: string[] };
  /**
   * A write on a case waiting for the person's answer: «sí» saves it, «no» drops it, «borrador» leaves it for Orion web.
   * Closures and first responses message the client by WhatsApp, so they need a second «confirmo».
   */
  pendingWrite?: PendingWrite;
  /** Unassigned cases still to hand out after the current one («¿A quién se lo asigno?», one by one). */
  assignQueue?: string[];
  /** Orion just asked «¿A quién se lo asigno?» about this case (its id): a bare name is the answer, and only then. */
  awaitingPerson?: string;
  history?: Array<{ q: string; a: string }>;
  pendingAnswerId?: string;
  last?: string;
  misses?: number;
}

export interface Reply {
  text: string;
  ctx: Ctx;
  end?: boolean;
  reprompt?: string;
  /** A Simple card, or the Alexa app's permission card (AskForPermissionsConsent) for the given scopes. */
  card?: { title: string; text: string } | { permissions: string[] };
  visual?: Visual;
  directives?: unknown[];
  /** No Echo Show screen for this reply (the opening, so Alexa+'s own announcement is never cut). */
  noScreen?: boolean;
}

const ANY = ["¿Algo más?", "¿Qué más revisamos?", "¿Te ayudo con algo más?"];
export const anyMore = () => ANY[Math.floor(Math.random() * ANY.length)]!;
const PROMPTS = /\s*(¿Algo más\?|¿Qué más revisamos\?|¿Te ayudo con algo más\?)\s*$/;

/** Spoken text hygiene: data often ends with its own period ("…aplicada." + "."). */
export const tidy = (t: string) => brandSpeech(t).replace(/…/g, "").replace(/\s+([.,;:])/g, "$1").replace(/([.;:])(\s*[.;:])+/g, "$1").replace(/,\./g, ".").replace(/\s{2,}/g, " ").trim();

/** Alexa rejects responses over 24 KB ("hubo un problema con la respuesta de la skill"); stay well under it. */
export const MAX_RESPONSE_BYTES = 22_000;
const bytes = (x: unknown) => new TextEncoder().encode(JSON.stringify(x)).length;

/** Drops the screen first, then the per-session entities, if a response would be too big for Alexa. */
export function fitResponse<T extends { response: { directives?: Array<{ type?: string }> } }>(out: T): T {
  if (bytes(out) <= MAX_RESPONSE_BYTES) return out;
  const without = (type: string) => ({ ...out, response: { ...out.response, directives: (out.response.directives ?? []).filter((d) => d.type !== type) } });
  let fitted = without("Alexa.Presentation.APL.RenderDocument");
  if (bytes(fitted) > MAX_RESPONSE_BYTES) fitted = { ...fitted, response: { ...fitted.response, directives: (fitted.response.directives ?? []).filter((d) => d.type !== "Dialog.UpdateDynamicEntities") } };
  console.warn(`response trimmed to fit Alexa: ${bytes(out)} → ${bytes(fitted)} bytes`);
  return fitted as T;
}

export function build(r: Reply, apl: boolean, fallbackVisual: (text: string) => Visual, aplVersion?: string) {
  r = { ...r, text: tidy(r.text) };
  const ctx = { ...r.ctx, last: r.text };
  const dialog = (r.directives ?? []).some((d) => /^Dialog\.(Elicit|Delegate|Confirm)/.test(String((d as { type?: string }).type)));
  let directives = r.directives ?? [];
  if (apl && !dialog && !r.noScreen && (r.visual || !r.end)) directives = [...directives, renderDirective(r.visual ?? fallbackVisual(plain(r.text).replace(PROMPTS, "")), aplVersion)];
  return fitResponse({
    version: "1.0",
    sessionAttributes: ctx,
    response: {
      outputSpeech: { type: "SSML", ssml: `<speak>${r.text}</speak>` },
      ...(r.end ? {} : { reprompt: { outputSpeech: { type: "SSML", ssml: `<speak>${brandSpeech(r.reprompt ?? "¿Algo más?")}</speak>` } } }),
      ...(r.card ? { card: "permissions" in r.card ? { type: "AskForPermissionsConsent", permissions: r.card.permissions } : { type: "Simple", title: r.card.title, content: r.card.text } } : {}),
      ...(directives.length ? { directives: directives as Array<{ type?: string }> } : {}),
      shouldEndSession: !!r.end,
    },
  });
}

/** Plain SSML reply outside the conversation machinery (linking, errors). */
export function say(text: string, opts: { end?: boolean; reprompt?: string; card?: { title: string; text: string }; directives?: Array<{ type?: string; [key: string]: unknown }> } = {}) {
  const end = opts.end ?? !opts.reprompt;
  text = brandSpeech(text);
  if (opts.reprompt) opts = { ...opts, reprompt: brandSpeech(opts.reprompt) };
  return {
    version: "1.0",
    response: {
      outputSpeech: { type: "SSML", ssml: `<speak>${text}</speak>` },
      ...(opts.reprompt ? { reprompt: { outputSpeech: { type: "SSML", ssml: `<speak>${opts.reprompt}</speak>` } } } : {}),
      ...(opts.card ? { card: { type: "Simple", title: opts.card.title, content: opts.card.text } } : {}),
      ...(opts.directives?.length ? { directives: opts.directives } : {}),
      shouldEndSession: end,
    },
  };
}

/** Ask for one slot of an intent (keeps the slots already filled). */
export function elicit(ctx: Ctx, intent: string, slot: string, text: string, slots: Record<string, string | undefined> = {}): Reply {
  // Every slot of the intent goes back (empty ones too): Alexa+ rejects an updatedIntent that lacks them.
  const all: Record<string, { name: string; value?: string; confirmationStatus: string }> = {};
  for (const k of INTENT_SLOTS[intent] ?? []) all[k] = { name: k, confirmationStatus: "NONE" };
  for (const [k, v] of Object.entries(slots)) if (v) all[k] = { name: k, value: v, confirmationStatus: "NONE" };
  return { text, reprompt: text, ctx, directives: [{ type: "Dialog.ElicitSlot", slotToElicit: slot, updatedIntent: { name: intent, confirmationStatus: "NONE", slots: all } }] };
}

/** Entity resolution first (custom types, dynamic entities), raw value as fallback. */
export function resolved(slots: Slots | undefined, name: string): { id?: string; value?: string; name?: string } {
  const s = slots?.[name];
  if (!s?.value) return {};
  for (const a of s.resolutions?.resolutionsPerAuthority ?? []) {
    if (a.status?.code === "ER_SUCCESS_MATCH" && a.values?.[0]) return { id: a.values[0].value.id, value: s.value, name: a.values[0].value.name };
  }
  return { value: s.value };
}
export const slotText = (slots: Slots | undefined, name: string) => {
  const r = resolved(slots, name);
  return r.name ?? r.value;
};

/** "Déjame revisar el equipo…" while a slow answer is being prepared (progressive response API). */
export async function progressive(body: any, speech: string) {
  const sys = body?.context?.System;
  const requestId = body?.request?.requestId;
  if (!sys?.apiEndpoint || !sys?.apiAccessToken || !requestId) return;
  try {
    await fetch(`${sys.apiEndpoint}/v1/directives`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sys.apiAccessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ header: { requestId }, directive: { type: "VoicePlayer.Speak", speech: `<speak>${speech}</speak>` } }),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    /* best effort: the real answer still comes */
  }
}

/** Resolves with the value, or with `late` once `ms` pass (the original promise keeps running). */
export async function withDeadline<T>(p: Promise<T>, ms: number): Promise<{ done: true; value: T } | { done: false; promise: Promise<T> }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<{ done: false; promise: Promise<T> }>((r) => (timer = setTimeout(() => r({ done: false, promise: p }), ms)));
  const res = await Promise.race([p.then((value) => ({ done: true as const, value })), late]);
  clearTimeout(timer);
  return res;
}

/** Keep the isolate alive for work that finishes after the reply (Supabase Edge Runtime). */
export function background(p: Promise<unknown>) {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
  else p.catch((e) => console.error("background", e));
}

/** Read long lists three at a time; "sí"/"siguiente" continues. */
export function page(ctx: Ctx, kind: string, intro: string, items: string[], offset: number, visual: (chunk: string[], offset: number, rest: number) => Visual): Reply {
  const chunk = items.slice(offset, offset + 3);
  const rest = items.length - offset - chunk.length;
  const body = chunk.join(' <break time="300ms"/> ');
  if (rest > 0) return { text: `${intro ? `${intro} ` : ""}${body} <break time="300ms"/> Quedan ${rest}. ¿Sigo?`, reprompt: "¿Quieres que siga?", ctx: { ...ctx, list: { kind, intro, items, offset: offset + 3 }, offer: undefined }, visual: visual(chunk, offset, rest) };
  return { text: `${intro ? `${intro} ` : ""}${body} <break time="300ms"/> ${anyMore()}`, ctx: { ...ctx, list: undefined }, visual: visual(chunk, offset, 0) };
}
