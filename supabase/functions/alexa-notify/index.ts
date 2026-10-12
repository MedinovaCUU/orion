// ORION · Alexa notifier (pg_cron every 5 minutes, x-cron-secret).
// For each linked person, AS that person (RLS): Falcon/general SLA thresholds of their cases, fatal alarms and rejected
// BPL controls on the equipment they work (admins: the whole fleet), cases newly assigned to them by someone else
// (or by Orion's routing) and next-day follow-ups of voice diagnoses
// ("¿se resolvió?"). New items become rows in alexa_alerts (deduplicated); the device then gets a silent Alexa
// notification (MessageAlert, yellow ring) outside the person's quiet hours. "Alexa, abre servicio orion… avisos"
// reads them; "enterado" acknowledges. Critical alerts unacknowledged for 30 minutes are marked escalated for the
// Orion web panel.
import { asUser, svc as sql } from "../alexa/db.ts";
import * as D from "../alexa/data.ts";
import { hypothesisCause } from "../alexa/voice.ts";
import { duracion, sayTest, shortClient, shortSerial, spokenModel } from "../alexa/speech.ts";

const CLIENT_ID = Deno.env.get("ALEXA_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("ALEXA_CLIENT_SECRET") ?? "";
const CRON_SECRET = Deno.env.get("ALEXA_CRON_SECRET") ?? "";
const STAGE = Deno.env.get("ALEXA_STAGE") ?? "development"; // "live" once the skill is published
const TZ = "America/Mexico_City";

type Row = Record<string, any>;
export interface AlertDraft { kind: "alarma" | "control" | "sla" | "seguimiento" | "sistema"; severity: "info" | "warning" | "critical"; dedupe: string; serial?: string | null; ticketId?: string | null; caseId?: string | null; title: string; speech: string }

/** Clean client name as plain text (alerts are escaped when they are read). */
const clientName = (n: string) => shortClient(n).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const eqSpeech = (e: { serial: string; model?: string | null; client?: string | null }) =>
  `el ${e.model ? spokenModel(e.model) : "equipo"} terminación ${shortSerial(e.serial).split("").join(" ")}${e.client ? ` de ${e.client.replace(/\b(S\.?A\.?|DE|C\.?V\.?|S\. DE R\.L\.)\b\.?/gi, "").replace(/\s+/g, " ").trim().toLowerCase()}` : ""}`;
/** Falcon thresholds (falconSlaThresholds.ts): 8 h, 4 h, 1 h, vencido. General 48 h rule: 8 h and vencido. */
function slaBucket(t: D.TicketInfo): string | null {
  const h = t.sla.remainingHours;
  if (h <= 0) return "vencido";
  const marks = t.sla.falcon ? [1, 4, 8] : [8];
  const m = marks.find((x) => h <= x);
  return m ? `${m}h` : null;
}

/** Everything worth telling one person right now (pure reads, as that person). */
export async function alertsFor(user: { id: string; email: string | null; role: string }): Promise<AlertDraft[]> {
  return await asUser({ id: user.id, email: user.email }, async (tx) => {
    const out: AlertDraft[] = [];
    const [mine, plan, equipment] = await Promise.all([D.openTickets(tx, "mine"), D.myPlanning(tx), D.activeEquipment(tx)]);
    const byS = new Map(equipment.map((e) => [e.serial, e]));
    for (const t of mine) {
      const b = slaBucket(t);
      if (!b) continue;
      const e = t.serial ? byS.get(t.serial) : undefined;
      out.push({
        kind: "sla", severity: b === "vencido" || b === "1h" ? "critical" : "warning", dedupe: `sla:${t.id}:${b}`, serial: t.serial, ticketId: t.id,
        title: `${t.sla.falcon ? "SLA Falcon" : "SLA"} · ${t.client ?? t.subject.slice(0, 40)}`,
        speech: `${t.sla.falcon ? "El caso de Falcon" : "El caso"} de ${t.client ? clientName(t.client) : t.subject.slice(0, 60)}${e ? `, del ${eqSpeech({ ...e, client: null }).replace(/^el /, "")}` : ""}, ${b === "vencido" ? `ya venció hace ${duracion(-t.sla.remainingHours)}` : `vence en ${duracion(t.sla.remainingHours)}`}.`,
      });
    }
    // Cases just assigned to the person by someone else or by Orion's automatic routing (last 24 hours).
    const assigned = (await tx`
      select a.ticket_id, a.assigned_at from public.ticket_assignments a
      where a.assigned_to = auth.uid() and a.assigned_at > now() - interval '24 hours' and a.assigned_by is distinct from auth.uid()`.catch(() => [])) as Row[];
    for (const a of assigned) {
      const t = mine.find((x) => x.id === a.ticket_id);
      if (!t) continue;
      const e = t.serial ? byS.get(t.serial) : undefined;
      out.push({
        kind: "sistema", severity: t.sla.severity === "breached" || t.sla.severity === "critical" ? "critical" : "warning", dedupe: `asignacion:${t.id}:${new Date(a.assigned_at).toISOString()}`, serial: t.serial, ticketId: t.id,
        title: `Caso asignado · ${t.client ?? t.subject.slice(0, 40)}`,
        speech: `Te asignaron ${t.sla.falcon ? "un caso de Falcon" : "un caso"}: ${t.client ? clientName(t.client) : t.subject.slice(0, 60)}${e ? `, del ${eqSpeech({ ...e, client: null }).replace(/^el /, "")}` : ""}. El motivo: ${t.subject.slice(0, 100)}; ${t.sla.severity === "breached" ? `ya venció hace ${duracion(-t.sla.remainingHours)}` : `vence en ${duracion(t.sla.remainingHours)}`}.`,
      });
    }
    // Equipment that is "theirs": their open cases + this week's planning; admins watch the whole fleet.
    const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
    const week = plan.filter((p) => (p.start && p.end ? p.start <= today && today <= p.end : p.scheduled === today));
    const relevant = user.role === "admin" ? null : new Set([...mine.map((t) => t.serial), ...week.map((p) => p.serial)].filter((s): s is string => Boolean(s)));
    if (relevant && !relevant.size) return out;
    const states = await D.equipmentStates(tx, relevant ? [...relevant] : undefined);
    for (const s of states.values()) {
      if (s.status !== "fatal" || !s.online) continue;
      const e = byS.get(s.serial) ?? { serial: s.serial, model: null, client: null };
      const a = s.activeErrors[0];
      out.push({
        kind: "alarma", severity: "critical", dedupe: `fatal:${s.serial}:${s.since ?? s.code ?? ""}`, serial: s.serial,
        title: `Alarma fatal · ···${shortSerial(s.serial)}`,
        speech: `${eqSpeech(e).replace(/^el/, "El")} entró en alarma fatal${a?.speech ?? s.speech ? `: ${a?.speech ?? s.speech}` : ""}.`,
      });
    }
    const qc = (await tx`
      select effective_equipment_serial as serial, test_name, max(occurred_at) as at
      from public.ba400_bpl_events
      where bpl_stage = 'quality_control' and bpl_status = 'rejected' and occurred_at > now() - interval '3 hours'
        and (${relevant ? [...relevant] : null}::text[] is null or upper(regexp_replace(effective_equipment_serial, '\\s', '', 'g')) = any(${relevant ? [...relevant] : []}))
      group by 1, 2`.catch(() => [])) as Row[];
    for (const r of qc) {
      const serial = D.normSerial(r.serial);
      const e = byS.get(serial) ?? { serial, model: null, client: null };
      const day = new Date(r.at).toLocaleDateString("en-CA", { timeZone: TZ });
      out.push({ kind: "control", severity: "warning", dedupe: `qc:${serial}:${r.test_name}:${day}`, serial, title: `Control rechazado · ${r.test_name} · ···${shortSerial(serial)}`, speech: `Se rechazó el control de ${sayTest(String(r.test_name))} en ${eqSpeech(e)}.` });
    }
    return out;
  });
}

async function followUps(userId: string): Promise<AlertDraft[]> {
  const rows = (await sql`
    update public.alexa_voice_cases set follow_up_sent_at = now()
    where user_id = ${userId} and outcome is null and follow_up_sent_at is null and follow_up_at <= now()
    returning id, serial, equipment_model, top_hypothesis, hypotheses`) as Row[];
  return rows.map((c) => ({
    kind: "seguimiento" as const, severity: "info" as const, dedupe: `seguimiento:${c.id}`, serial: c.serial, caseId: c.id,
    title: `Seguimiento · ···${shortSerial(c.serial)}`,
    speech: `Ayer diagnosticamos ${eqSpeech({ serial: c.serial, model: c.equipment_model })}${c.hypotheses?.[0]?.key ? `; lo más probable era ${hypothesisCause(c.hypotheses[0].key, String(c.hypotheses[0].title ?? ""))}` : ""}. ¿Se resolvió? Dime «ya quedó» o «no se resolvió».`,
  }));
}

/** Stores new alerts; returns how many were new and how many are open. */
async function store(userId: string, drafts: AlertDraft[]) {
  let fresh = 0;
  let critical = false;
  for (const d of drafts) {
    const rows = await sql`
      insert into public.alexa_alerts (user_id, kind, severity, dedupe_key, serial, ticket_id, case_id, title, speech)
      values (${userId}, ${d.kind}, ${d.severity}, ${d.dedupe}, ${d.serial ?? null}, ${d.ticketId ?? null}, ${d.caseId ?? null}, ${d.title}, ${d.speech})
      on conflict (user_id, dedupe_key) do nothing returning id`;
    if (rows.length) {
      fresh++;
      critical ||= d.severity === "critical";
    }
  }
  await sql`update public.alexa_alerts set escalated_at = now() where user_id = ${userId} and severity = 'critical' and acknowledged_at is null and escalated_at is null and created_at < now() - interval '30 minutes'`;
  const [{ n }] = (await sql`select count(*)::int as n from public.alexa_alerts where user_id = ${userId} and acknowledged_at is null and created_at > now() - interval '3 days'`) as Array<{ n: number }>;
  return { fresh, open: n, critical };
}

let tokenCache: { value: string; until: number } | null = null;
async function lwaToken() {
  if (tokenCache && tokenCache.until > Date.now()) return tokenCache.value;
  const r = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: "alexa::proactive_events" }),
  });
  if (!r.ok) throw new Error(`LWA ${r.status} ${await r.text()}`);
  const j = await r.json();
  tokenCache = { value: j.access_token, until: Date.now() + (Number(j.expires_in ?? 3600) - 120) * 1000 };
  return tokenCache.value;
}
export async function ring(alexaUserId: string, count: number): Promise<boolean> {
  if (!CLIENT_ID || !CLIENT_SECRET) return false;
  const now = new Date();
  const r = await fetch(`https://api.amazonalexa.com/v1/proactiveEvents/stages/${STAGE}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await lwaToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      timestamp: now.toISOString(),
      referenceId: crypto.randomUUID(),
      expiryTime: new Date(now.getTime() + 12 * 3.6e6).toISOString(),
      event: { name: "AMAZON.MessageAlert.Activated", payload: { state: { status: "UNREAD", freshness: "NEW" }, messageGroup: { creator: { name: "Orión" }, count, urgency: "URGENT" } } },
      localizedAttributes: [{ locale: "es-MX" }],
      relevantAudience: { type: "Unicast", payload: { user: alexaUserId } },
    }),
  });
  if (!r.ok) console.error("proactive", r.status, await r.text());
  return r.ok;
}

const localHour = () => Number(new Date().toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hour12: false })) % 24;
const quiet = (h: number, from: number, to: number) => (from > to ? h >= from || h < to : h >= from && h < to);

export async function runNotifier(opts: { send?: typeof ring; hour?: number } = {}) {
  const send = opts.send ?? ring;
  const links = (await sql`
    select l.alexa_user_id, l.user_id, l.quiet_from, l.quiet_to, l.last_notified_at, p.rol::text as rol, u.email
    from public.alexa_links l join public.profiles p on p.id = l.user_id join auth.users u on u.id = l.user_id
    where l.notify and p.rol in ('admin', 'tecnico')`) as Row[];
  const byUser = new Map<string, Row[]>();
  for (const l of links) byUser.set(l.user_id, [...(byUser.get(l.user_id) ?? []), l]);
  const hour = opts.hour ?? localHour();
  const summary = { users: byUser.size, fresh: 0, rung: 0, errors: 0 };
  for (const [userId, devices] of byUser) {
    try {
      const drafts = [...(await alertsFor({ id: userId, email: devices[0]!.email, role: devices[0]!.rol })), ...(await followUps(userId))];
      const s = await store(userId, drafts);
      summary.fresh += s.fresh;
      if (!s.fresh) continue;
      for (const d of devices) {
        const recent = d.last_notified_at && Date.now() - new Date(d.last_notified_at).getTime() < 30 * 60_000;
        if (quiet(hour, d.quiet_from, d.quiet_to) && !s.critical) continue;
        if (recent && !s.critical) continue;
        if (await send(d.alexa_user_id, s.open)) {
          summary.rung++;
          await sql`update public.alexa_links set last_notified_at = now() where alexa_user_id = ${d.alexa_user_id}`;
        }
      }
    } catch (e) {
      summary.errors++;
      console.error("notifier", userId, e);
    }
  }
  return summary;
}

if (Deno.env.get("ALEXA_NO_SERVE") !== "1") {
  Deno.serve(async (req) => {
    if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return new Response("forbidden", { status: 403 });
    return Response.json(await runNotifier());
  });
}
