// ORION · what Alexa knows. Every function here receives a transaction that already runs AS the linked user
// (db.ts asUser), so the answers are exactly what that person may see in Orion web. The same functions back the
// fixed intents and Claude's tools.
import type postgres from "npm:postgres@3.4.9";
import * as E from "./engine.bundle.js";
import { unaccent } from "./speech.ts";
import { alarmSpeech } from "./voice.ts";
import * as Demo from "./demo.ts";

type Tx = postgres.TransactionSql<Record<string, never>>;
type Row = Record<string, any>;

const MS_H = 3.6e6;
export const normSerial = (s: string | null | undefined) => String(s ?? "").replace(/\s+/g, "").toUpperCase();
const serialCandidates = (s: string) => [...new Set([s.trim(), normSerial(s), normSerial(s).toLowerCase()].filter(Boolean))];
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
/** postgres.js returns Date objects; the shared Orion builders expect ISO strings like PostgREST gives them. */
const isoRow = (r: Row): Row => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]));

// ── Equipment ────────────────────────────────────────────────────────────────
export interface Equipment {
  serial: string;
  model: string | null;
  client: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
}

export async function activeEquipment(tx: Tx): Promise<Equipment[]> {
  const rows = Demo.isDemoTx(tx) ? Demo.demoEquipmentRows() : await tx`
    select e.numero_serie, e.modelo, c.razon_social, coalesce(nullif(e.ciudad, ''), e.municipio) as ciudad, e.estado, e.pais, e.direccion
    from public.equipos e left join public.clientes c on c.id = e.cliente_id
    where e.fecha_fin is null and e.numero_serie is not null and btrim(e.numero_serie) <> ''`;
  return rows.map((r: Row) => ({ serial: normSerial(r.numero_serie), model: r.modelo, client: r.razon_social?.trim() || null, city: r.ciudad || null, state: r.estado || null, country: r.pais || null, address: r.direccion || null }));
}

/**
 * "0473", "473", "834000473", "el de Falcon Monterrey", "laboratorio Ruiz": serial suffix first, then client/city words.
 * Returns the best matches (several when it is ambiguous, so the caller can ask).
 */
export function matchEquipment(all: Equipment[], query: string): Equipment[] {
  const q = unaccent(query).replace(/\b(el|la|los|las|del|de|equipo|analizador|serie|numero|terminacion|termina en)\b/g, " ").replace(/\s+/g, " ").trim();
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3) {
    const exact = all.filter((e) => e.serial.replace(/\D/g, "") === digits);
    if (exact.length) return exact;
    const suffix = all.filter((e) => e.serial.replace(/\D/g, "").endsWith(digits));
    if (suffix.length) return suffix;
  }
  const words = q.replace(/[0-9]/g, " ").split(" ").filter((w) => w.length >= 3);
  if (!words.length) return [];
  const scored = all
    .map((e) => {
      const hay = unaccent(`${e.client ?? ""} ${e.city ?? ""} ${e.state ?? ""} ${e.model ?? ""}`);
      const hits = words.filter((w) => hay.includes(w)).length;
      return { e, hits };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  if (!scored.length) return [];
  const best = scored[0]!.hits;
  return scored.filter((x) => x.hits === best).map((x) => x.e).slice(0, 8);
}

// ── Monitor state & alarms ───────────────────────────────────────────────────
/** Spoken meaning of an alarm code (catalog description as fallback). */
export const alarmSpeechFor = (code: string, description?: string | null) => {
  const norm = (E.normalizeBa400AlarmCode(code) as string | null) ?? code;
  const cat = (E.BA400_ALARM_CATALOG as Record<string, Row>)[norm];
  return alarmSpeech(norm, description ?? cat?.description ?? null);
};
export interface ActiveError { code: string | null; description: string | null; section: string | null; location: string | null; severity: string | null; /** Plain Spanish, no code ("colisión en el brazo de reactivo 1"). */ speech: string }
export interface EquipmentState {
  serial: string;
  status: "ok" | "warning" | "fatal" | "sin_dato";
  code: string | null;
  description: string | null;
  speech: string | null;
  since: string | null;
  lastEventAt: string | null;
  online: boolean;
  activeErrors: ActiveError[];
}

const describeAlarm = (code: string | null, description: string | null, section: string | null): ActiveError => {
  const cat = code ? (E.classifyBa400Alarm({ codigo_error: code, descripcion_error: description, seccion_error: section } as any) as Row | null) : null;
  return {
    code,
    description: description || cat?.description || null,
    section,
    location: cat ? (E.ba400AlarmLocationLabel({ codigo_error: code, descripcion_error: description, seccion_error: section } as any) as string) || cat.target || null : null,
    severity: cat?.severity ?? null,
    speech: alarmSpeech(code, description || cat?.description || null),
  };
};

export async function equipmentStates(tx: Tx, serials?: string[]): Promise<Map<string, EquipmentState>> {
  const filter = serials?.length ? serials.map(normSerial) : null;
  const rows = Demo.isDemoTx(tx)
    ? Demo.demoStateRows(filter)
    : filter
    ? await tx`select s.*, i.updated_at as insumos_at from public.estado_errores_equipo_actual s
        left join public.estado_insumos_equipo_actual i on upper(regexp_replace(i.numero_serie, '\\s', '', 'g')) = upper(regexp_replace(s.numero_serie, '\\s', '', 'g'))
        where upper(regexp_replace(s.numero_serie, '\\s', '', 'g')) = any(${filter})`
    : await tx`select s.*, i.updated_at as insumos_at from public.estado_errores_equipo_actual s
        left join public.estado_insumos_equipo_actual i on upper(regexp_replace(i.numero_serie, '\\s', '', 'g')) = upper(regexp_replace(s.numero_serie, '\\s', '', 'g'))`;
  const out = new Map<string, EquipmentState>();
  const now = Date.now();
  for (const r of rows as Row[]) {
    const last = Math.max(new Date(r.last_event_at ?? 0).getTime(), new Date(r.insumos_at ?? 0).getTime());
    const errors = Array.isArray(r.errores_activos) ? r.errores_activos : [];
    out.set(normSerial(r.numero_serie), {
      serial: normSerial(r.numero_serie),
      status: (["ok", "warning", "fatal"].includes(r.estado_actual) ? r.estado_actual : "sin_dato") as EquipmentState["status"],
      code: r.error_principal_codigo ?? r.codigo_estado ?? null,
      description: r.error_principal_descripcion ?? r.descripcion_estado ?? null,
      speech: r.estado_actual === "ok" ? null : alarmSpeech(r.error_principal_codigo ?? r.codigo_estado ?? null, r.error_principal_descripcion ?? r.descripcion_estado ?? null),
      since: iso(r.activo_desde),
      lastEventAt: iso(r.last_event_at),
      online: last > 0 && now - last < 24 * MS_H,
      activeErrors: errors.slice(0, 8).map((x: Row) => describeAlarm(x.codigo_error ?? x.code ?? null, x.descripcion_error ?? x.description ?? null, x.seccion_error ?? x.section ?? null)),
    });
  }
  return out;
}

export interface AlarmEvent extends ActiveError { serial: string; type: string | null; at: string | null }
export async function recentAlarms(tx: Tx, serial: string, days = 14, limit = 30): Promise<AlarmEvent[]> {
  const rows = Demo.isDemoTx(tx) ? Demo.demoAlarmRows(normSerial(serial), days).slice(0, limit) : await tx`
    select numero_serie, codigo_error, descripcion_error, seccion_error, tipo_mensaje, coalesce(detected_at, created_at) as at
    from public.monitoreo_errores_equipos
    where upper(regexp_replace(numero_serie, '\\s', '', 'g')) = ${normSerial(serial)}
      and coalesce(detected_at, created_at) > now() - make_interval(days => ${days})
    order by coalesce(detected_at, created_at) desc, id desc
    limit ${limit}`;
  return (rows as Row[]).map((r) => ({ ...describeAlarm(r.codigo_error, r.descripcion_error, r.seccion_error), serial: normSerial(r.numero_serie), type: r.tipo_mensaje, at: iso(r.at) }));
}

/** Catalog entry of a BA400 alarm code + how often it fired lately on that equipment. */
export async function alarmInfo(tx: Tx | null, code: string, serial?: string | null) {
  const norm = E.normalizeBa400AlarmCode(code) as string | null;
  const entry = norm ? ((E.BA400_ALARM_CATALOG as Record<string, Row>)[norm] ?? null) : null;
  let history: AlarmEvent[] = [];
  if (tx && serial && norm) history = (await recentAlarms(tx, serial, 30, 200)).filter((a) => E.normalizeBa400AlarmCode(a.code ?? "") === norm);
  return entry
    ? { code: norm, description: entry.description, location: entry.target, scope: entry.scope, severity: entry.severity, note: entry.note, timesLast30Days: history.length, lastAt: history[0]?.at ?? null }
    : null;
}

// ── Tickets & SLA ────────────────────────────────────────────────────────────
export interface TicketSla { limitHours: number; remainingHours: number; severity: "healthy" | "warning" | "critical" | "breached"; falcon: boolean; cdmx: boolean }
export interface TicketInfo {
  id: string;
  folio: string;
  subject: string;
  status: string;
  createdAt: string;
  serial: string | null;
  model: string | null;
  client: string | null;
  city: string | null;
  area: "ingenieria" | "quimica" | null;
  assignedToMe: boolean;
  /** Name of the assignee when the person may see the assignment (admins: always; staff: their own). */
  assignee: string | null;
  mine: boolean;
  sla: TicketSla;
  /** State of the equipment, as the fleet records it ("Nuevo León"). */
  state: string | null;
  /** What the client reported (description without channel metadata). */
  description: string;
  contact: { name: string | null; phone: string | null; email: string | null };
  /** First response to the client (sends the client a WhatsApp) and closure, from ticket_service_events. */
  respondedAt: string | null;
  closedAt: string | null;
  closureReason: string | null;
  updatedAt: string | null;
}

const normText = (v: string | null | undefined) => unaccent(v ?? "").replace(/\s+/g, " ");
const labeled = (raw: string, labels: string[]) => {
  for (const label of labels) {
    const m = raw.match(new RegExp(`(?:^|\\n)\\s*${label.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}\\s*:?[ \\t]*(?:\\n\\s*)?([^\\n]+)`, "i"));
    if (m?.[1]) return m[1].replace(/\s+/g, " ").trim();
  }
  return "";
};
const isCdmx = (v: string | null | undefined) => ["cdmx", "ciudad de mexico", "distrito federal", "mexico city", "ciudad mexico"].some((c) => normText(v).includes(c));
const channelOf = (subject: string, description: string | null, client: string | null) => {
  const t = normText(`${subject}\n${description ?? ""}`);
  if (["[falcon]", "canal: falcon", "reporte falcon", "no. de reporte falcon", "numero de reporte falcon"].some((k) => t.includes(k))) return "falcon";
  if (["[centrum]", "canal: centrum", "ticket zendesk", "centrum"].some((k) => t.includes(k))) return "centrum";
  if (["[genesis]", "canal: genesis", "numero de reporte genesis", "genesis healthcare", " genesis "].some((k) => t.includes(k))) return "genesis";
  if (["[dicipa]", "canal: dicipa", "dicipa"].some((k) => t.includes(k))) return "dicipa";
  const c = normText(client);
  for (const ch of ["falcon", "centrum", "genesis", "dicipa"]) if (c.includes(ch)) return ch;
  return "";
};

/**
 * Same rules as Orion web: Falcon cases (ticketIntake.getFalconTicketSla) are 24 h in CDMX / 48 h elsewhere with
 * their own warning/critical bands; every other support case follows the general 48 h rule (por vencer from 40 h).
 */
export function ticketSla(t: { subject: string; description: string | null; createdAt: string; client: string | null; equipment?: Partial<Equipment> | null }, now = Date.now()): TicketSla {
  const falcon = channelOf(t.subject, t.description, t.client) === "falcon";
  const raw = t.description ?? "";
  const cdmx = falcon && [t.equipment?.city, t.equipment?.state, t.equipment?.address, labeled(raw, ["Localidad", "Ciudad", "Municipio", "Unidad/Laboratorio"]) || labeled(raw, ["Cliente/Institución"]), labeled(raw, ["Estado"]), labeled(raw, ["Dirección"])].some(isCdmx);
  const limit = falcon ? (cdmx ? 24 : 48) : 48;
  const created = new Date(t.createdAt).getTime() || now;
  const remaining = (created + limit * MS_H - now) / MS_H;
  let severity: TicketSla["severity"];
  if (remaining <= 0) severity = "breached";
  else if (falcon) severity = remaining <= (limit === 24 ? 3 : 6) ? "critical" : remaining <= (limit === 24 ? 8 : 16) ? "warning" : "healthy";
  else severity = remaining <= 8 ? "warning" : "healthy";
  return { limitHours: limit, remainingHours: remaining, severity, falcon, cdmx };
}

const areaOf = (subject: string): TicketInfo["area"] => (/soporte\s*ingenier/i.test(subject) ? "ingenieria" : /soporte\s*qu[ií]mic/i.test(subject) ? "quimica" : null);
const PLANNING_MARK = "[METADATA_PLANEACION]";

type TicketScope = "mine" | "all" | "serial" | "id";
interface TicketQuery { scope: TicketScope; serial?: string; id?: string; includeClosed?: boolean; limit?: number; suffix?: string }

async function ticketRows(tx: Tx, q: TicketQuery) {
  if (Demo.isDemoTx(tx)) return Demo.demoTicketRows({ ...q, serial: q.serial ? normSerial(q.serial) : undefined });
  const s = q.serial ? normSerial(q.serial) : "";
  const suffix = (q.suffix ?? "").replace(/\D/g, "");
  const id = q.id ?? "00000000-0000-0000-0000-000000000000";
  const closed = Boolean(q.includeClosed);
  return (await tx`
    select t.id, t.numero_caso, t.asunto, t.descripcion, t.estado::text as estado, t.creado_en, t.actualizado_en, t.numero_serie_equipo, t.user_id,
      t.nombre_cliente_guest, t.telefono_cliente_guest, t.email_cliente_guest,
      (t.user_id = auth.uid()) as mine,
      exists(select 1 from public.ticket_assignments a where a.ticket_id = t.id and a.assigned_to = auth.uid()) as assigned_to_me,
      (select p.nombre_completo from public.ticket_assignments a join public.profiles p on p.id = a.assigned_to where a.ticket_id = t.id limit 1) as assignee,
      (select min(ev.occurred_at) from public.ticket_service_events ev where ev.ticket_id = t.id and ev.kind = 'respuesta') as respondido_en,
      (select ev.occurred_at from public.ticket_service_events ev where ev.ticket_id = t.id and ev.kind = 'cierre' order by ev.occurred_at desc limit 1) as cerrado_en,
      (select ev.closure_reason from public.ticket_service_events ev where ev.ticket_id = t.id and ev.kind = 'cierre' order by ev.occurred_at desc limit 1) as motivo_cierre,
      e.modelo, coalesce(nullif(e.ciudad, ''), e.municipio) as ciudad, e.estado as edo, e.direccion, c.razon_social
    from public.tickets t
    left join lateral (
      select * from public.equipos e
      where e.fecha_fin is null and upper(regexp_replace(e.numero_serie, '\\s', '', 'g')) = upper(regexp_replace(coalesce(t.numero_serie_equipo, ''), '\\s', '', 'g'))
      limit 1) e on true
    left join public.clientes c on c.id = e.cliente_id
    where (${closed} or t.estado <> 'cerrado')
      and position(${PLANNING_MARK} in coalesce(t.descripcion, '')) = 0
      and (
        (${q.scope} = 'all')
        or (${q.scope} = 'mine' and (t.user_id = auth.uid() or exists(select 1 from public.ticket_assignments a where a.ticket_id = t.id and a.assigned_to = auth.uid())))
        or (${q.scope} = 'serial' and (upper(regexp_replace(coalesce(t.numero_serie_equipo, ''), '\\s', '', 'g')) = ${s}
          or (length(${suffix}) >= 4 and right(regexp_replace(coalesce(t.numero_serie_equipo, ''), '\\D', '', 'g'), length(${suffix})) = ${suffix})))
        or (${q.scope} = 'id' and t.id = ${id}::uuid)
      )
    order by case when ${closed} then t.creado_en end desc nulls last, t.creado_en asc
    limit ${q.limit ?? 120}`) as Row[];
}

/** Metadata lines Orion web writes into descriptions (ticketIntake.buildTicketDescription): not what the client said. */
const META_LINE = /^\s*(canal|localidad|ciudad|municipio|estado|direcci[oó]n|cliente\/instituci[oó]n|unidad\/laboratorio|tel[eé]fono|correo|email|contacto|equipo|no\. de serie|n[uú]mero de serie|serie|modelo|pa[ií]s|tipo de servicio|prioridad sugerida|fecha del reporte|folio[^:]{0,30}|referencia[^:]{0,30}|ticket[^:]{0,30}|orden[^:]{0,30})\s*:/i;
/** "Falla reportada: …" when the form wrote it; otherwise the description without its metadata lines. */
const reported = (raw: string) =>
  labeled(raw, ["Falla reportada"]) ||
  raw.split("[METADATA_")[0]!.split("\n").filter((l) => l.trim() && !META_LINE.test(l)).join(" ").replace(/\s+/g, " ").trim();

function toTicket(r: Row, now = Date.now()): TicketInfo {
  const equipment = { city: r.ciudad, state: r.edo, address: r.direccion };
  const raw = String(r.descripcion ?? "");
  return {
    id: r.id,
    folio: r.numero_caso,
    // "[Soporte Ingeniero] [FALCON] Equipo no enciende" → "Equipo no enciende" (channel tags are not the reason).
    subject: String(r.asunto ?? "").replace(/^(\s*\[[^\]]+\]\s*)+/, "").trim() || String(r.asunto ?? ""),
    status: r.estado,
    createdAt: iso(r.creado_en)!,
    serial: r.numero_serie_equipo ? normSerial(r.numero_serie_equipo) : null,
    model: r.modelo ?? null,
    client: r.razon_social?.trim() || labeled(raw, ["Cliente/Institución", "Unidad/Laboratorio"]) || null,
    city: r.ciudad || labeled(raw, ["Localidad", "Ciudad"]) || null,
    area: areaOf(String(r.asunto ?? "")),
    assignedToMe: Boolean(r.assigned_to_me),
    assignee: r.assignee ?? null,
    mine: Boolean(r.mine),
    sla: ticketSla({ subject: String(r.asunto ?? ""), description: r.descripcion, createdAt: iso(r.creado_en)!, client: r.razon_social, equipment }, now),
    state: r.edo?.trim() || null,
    description: reported(raw),
    contact: {
      name: r.nombre_cliente_guest?.trim() || labeled(raw, ["Contacto", "Nombre", "Solicitante", "Reporta"]) || null,
      phone: r.telefono_cliente_guest?.trim() || labeled(raw, ["Teléfono", "Telefono", "Tel"]) || null,
      email: r.email_cliente_guest?.trim() || labeled(raw, ["Correo", "Email"]) || null,
    },
    respondedAt: iso(r.respondido_en),
    closedAt: iso(r.cerrado_en),
    closureReason: r.motivo_cierre ?? null,
    updatedAt: iso(r.actualizado_en),
  };
}

/** Open support cases the person works: assigned to them or opened by them (admins: `scope: "all"`). */
export async function openTickets(tx: Tx, scope: "mine" | "all" = "mine"): Promise<TicketInfo[]> {
  return (await ticketRows(tx, { scope })).map((r) => toTicket(r));
}
export async function ticketsForSerial(tx: Tx, serial: string): Promise<TicketInfo[]> {
  return (await ticketRows(tx, { scope: "serial", serial })).map((r) => toTicket(r));
}
/** One case by id (open or closed) if the person may see it. */
export async function ticketById(tx: Tx, id: string): Promise<TicketInfo | null> {
  const [r] = await ticketRows(tx, { scope: "id", id, includeClosed: true, limit: 1 });
  return r ? toTicket(r) : null;
}
/** Every case of an equipment, newest first, closed ones included (the equipment's history). */
export async function serialHistory(tx: Tx, serial: string, limit = 12, suffix?: string): Promise<TicketInfo[]> {
  return (await ticketRows(tx, { scope: "serial", serial, includeClosed: true, limit, suffix })).map((r) => toTicket(r));
}
/** Closures since a moment (planning excluded): the person's own, or the whole team's for `scope: "all"`. */
export async function closedStats(tx: Tx, sinceIso: string, scope: "mine" | "all"): Promise<{ n: number; solved: number; reason: string | null }> {
  const [r] = Demo.isDemoTx(tx) ? [Demo.demoClosedStats(sinceIso)] : await tx`
    select count(*)::int as n, count(*) filter (where ev.closure_reason = 'solucionado')::int as solved, min(ev.closure_reason) as reason
    from public.ticket_service_events ev
    join public.tickets t on t.id = ev.ticket_id
    where ev.kind = 'cierre' and ev.occurred_at >= ${sinceIso}::timestamptz
      and position(${PLANNING_MARK} in coalesce(t.descripcion, '')) = 0
      and (${scope} = 'all' or ev.actor_id = auth.uid())`;
  const row = r as Row;
  return { n: row.n ?? 0, solved: row.solved ?? 0, reason: row.reason ?? null };
}
/** Staff who may receive cases (admins assign among them). */
export async function caseReceivers(tx: Tx): Promise<Array<{ id: string; name: string; team: "quimica" | "ingenieria" | null }>> {
  // Team from the profile's employee type: the same reading as public.service_staff_team, which the ranking uses but
  // is not executable by signed-in users (20261011020000 revokes it), so it is spelled out here.
  const rows = Demo.isDemoTx(tx) ? Demo.DEMO_PEOPLE : await tx`
    select p.id, p.nombre_completo,
      case when public.ticket_routing_key(p.employee_type) like '%quim%' then 'quimica'
           when public.ticket_routing_key(p.employee_type) like '%ingen%' then 'ingenieria' end as team
    from public.profiles p
    where p.rol in ('admin', 'tecnico') and coalesce(p.nombre_completo, '') <> '' and public.ticket_receiver_eligible(p.id)
    order by p.nombre_completo`;
  return (rows as Row[]).map((r) => ({ id: r.id, name: String(r.nombre_completo).trim(), team: r.team ?? null }));
}
// ── Who should get a case: the owner's assignment rules (2026-10-11) ────────
// The database ranks (public.ticket_assignment_ranking, also used when Orion routes a new case); Alexa reads it
// through the admin-only get_ticket_assignment_suggestions and only turns its reasons into speech.
export interface AssignCandidate {
  id: string;
  name: string;
  team: "quimica" | "ingenieria" | null;
  open: number;
  busy: string | null;
  /** Why this person is suggested (spoken). */
  reason: string;
}

/** The ranking's reasons are already Spanish; this only makes them sound natural when read aloud. */
function spokenReason(reason: string, tk: TicketInfo): string {
  return reason
    // The ranking compares a normalised state ("nuevo leon"); say it as the equipment records it ("Nuevo León").
    .replace(/^cubre la región de [^;]+/, (m) => (tk.state ? `cubre la región de ${tk.state}` : m.replace(/\b(\p{L})/gu, (c) => c.toUpperCase())))
    .replace(/^es responsable habitual del equipo/, "es el responsable habitual de este equipo")
    .replace(/\b1 caso abierto/, "un caso abierto")
    .replace(/; caso de gobierno y es del equipo de gobierno$/, ", y es del equipo de gobierno")
    .replace(/^todos están ocupados; tiene la menor carga, aunque /, "todos están ocupados; es quien tiene menos carga, aunque ");
}

/**
 * Who should attend a case, best first (continuity → region → balanced load, within the case's area; busy people go
 * last), and — when the continuity person was skipped for being busy — why ("Juan Pérez atendió el caso anterior de
 * este equipo, pero hoy tiene una visita programada").
 */
export async function assignmentCandidates(tx: Tx, tk: TicketInfo): Promise<{ ranked: AssignCandidate[]; skipped: string | null }> {
  const rows = (Demo.isDemoTx(tx) ? Demo.demoSuggestionRows(tk.id) : await tx`select * from public.get_ticket_assignment_suggestions(${tk.id}::uuid)`) as Row[];
  const people = rows.map((r): AssignCandidate & { continuity: string | null } => ({
    id: r.user_id, name: String(r.full_name ?? "").trim(), team: tk.area, open: Number(r.open_cases ?? 0),
    busy: r.busy_reason ?? null, reason: spokenReason(String(r.reason ?? ""), tk), continuity: r.continuity ?? null,
  }));
  const free = people.filter((p) => !p.busy);
  const passed = people.find((p) => p.continuity && p.busy);
  const skipped = passed ? `${passed.name} ${passed.continuity}, pero ${passed.busy!.replace(/^atiende /, "ya atiende ")}` : null;
  return { ranked: (free.length ? free : people).map(({ continuity: _c, ...p }) => p), skipped };
}

/** Can this person approve delays beyond 48 h (administration or authorised management)? */
export async function canApproveDelay(tx: Tx): Promise<boolean> {
  if (Demo.isDemoTx(tx)) return false;
  const [r] = await tx`select public.can_approve_ticket_delay() as ok`;
  return Boolean((r as Row | undefined)?.ok);
}

// ── Writes: the same RPCs Orion web uses, as the person (RLS and the RPC checks decide) ──
/** A case-log movement (avance, llamada, visita, pieza, escalamiento, nota, diagnóstico), first response, closure or delay approval. */
export async function registerMovement(tx: Tx, m: { ticketId: string; action: string; detail: string; state?: string | null; reason?: string | null }) {
  if (Demo.isDemoTx(tx)) return; // the reviewer's demo: accepted, not saved
  // Voice never makes an entry visible to the client: that stays a deliberate choice in Orion web.
  await tx`select public.register_ticket_movement(${m.ticketId}::uuid, ${m.action}, ${m.detail.slice(0, 3900)}, ${m.state ?? null}, false, ${m.reason ?? null})`;
}
export async function assignTicket(tx: Tx, ticketId: string, personId: string) {
  if (Demo.isDemoTx(tx)) return;
  await tx`select public.assign_support_ticket(${ticketId}::uuid, ${personId}::uuid)`;
}
/** Moves a case to the other support area: the subject tag Orion reads the area from, plus a note in the case log. */
export async function changeTicketArea(tx: Tx, ticketId: string, to: "quimica" | "ingenieria", note: string) {
  if (Demo.isDemoTx(tx)) return;
  const tag = to === "quimica" ? "[Soporte Químico]" : "[Soporte Ingeniero]";
  await tx`
    update public.tickets
    set asunto = ${tag} || ' ' || btrim(regexp_replace(asunto, '^\\s*(\\[soporte (ingeniero|qu[ií]mico)\\]|soporte (ingeniero|qu[ií]mico):)\\s*', '', 'i'))
    where id = ${ticketId}::uuid`;
  await registerMovement(tx, { ticketId, action: "nota", detail: note });
}
/** Opens a support case exactly like Orion web's form; returns the case number and who received it (auto-routing). */
export async function createTicket(tx: Tx, userId: string, c: { subject: string; description: string; serial: string | null }) {
  if (Demo.isDemoTx(tx)) return Demo.demoNewCase();
  // Like Orion web: the id is chosen here and the insert returns nothing, because RETURNING would be checked against
  // the read boundary (can_view_ticket) before the new row is visible to it.
  const id = crypto.randomUUID();
  await tx`insert into public.tickets (id, user_id, asunto, descripcion, numero_serie_equipo) values (${id}, ${userId}, ${c.subject.slice(0, 200)}, ${c.description}, ${c.serial})`;
  const [rc] = await tx`select numero_caso, responsable from public.get_ticket_creation_receipt(${id}::uuid)`;
  return { id, folio: ((rc as Row | undefined)?.numero_caso as string | undefined) ?? null, receiver: ((rc as Row | undefined)?.responsable as string | undefined) ?? null };
}
export const slaRank = (t: TicketInfo) => ({ breached: 0, critical: 1, warning: 2, healthy: 3 })[t.sla.severity] * 1e6 + t.sla.remainingHours;

/** Latest case-log lines (bitácora) of a ticket the person can see. */
export async function ticketLog(tx: Tx, ticketId: string, limit = 5) {
  const rows = Demo.isDemoTx(tx) ? Demo.demoLogRows(ticketId, limit) : await tx`
    select b.tipo, b.detalle, b.estado_resultante::text as estado, b.creado_en, p.nombre_completo
    from public.ticket_bitacora b left join public.profiles p on p.id = b.creado_por
    where b.ticket_id = ${ticketId} order by b.creado_en desc limit ${limit}`;
  return (rows as Row[]).map((r) => ({ type: r.tipo, detail: String(r.detalle).slice(0, 400), state: r.estado, at: iso(r.creado_en), by: r.nombre_completo }));
}

// ── Planning (the weekly board lives in tickets marked [PLAN]) ───────────────
export interface PlanItem {
  id: string;
  folio: string;
  serviceType: string;
  platform: string;
  locality: string;
  serial: string | null;
  start: string | null;
  end: string | null;
  scheduled: string | null;
  engineers: string;
  status: string;
}
const MONTHS: Record<string, number> = { ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6, JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, SETIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12 };
const isoDate = (v: unknown) => {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
/** "13 AL 17 OCTUBRE" / "29 SEPTIEMBRE AL 3 OCTUBRE" → ISO range (year from the ticket's creation). */
export function parseWeekLabel(label: string | null | undefined, year: number): { start: string; end: string } | null {
  const t = unaccent(label ?? "").toUpperCase();
  const m = t.match(/(\d{1,2})\s*(?:DE\s+)?([A-Z]+)?\s*(?:AL|A|-)\s*(\d{1,2})\s*(?:DE\s+)?([A-Z]+)/);
  if (!m) return null;
  const endMonth = MONTHS[m[4]!];
  if (!endMonth) return null;
  const startMonth = m[2] && MONTHS[m[2]] ? MONTHS[m[2]]! : endMonth;
  const startYear = startMonth > endMonth ? year - 1 : year;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { start: `${startYear}-${pad(startMonth)}-${pad(Number(m[1]))}`, end: `${year}-${pad(endMonth)}-${pad(Number(m[3]))}` };
}
function planMeta(description: string | null): Row {
  const i = (description ?? "").indexOf(PLANNING_MARK);
  if (i < 0) return {};
  try {
    return JSON.parse((description ?? "").slice(i + PLANNING_MARK.length).trim());
  } catch {
    return {};
  }
}

/** The person's planned services (lead or companion), open, with their dates. */
export async function myPlanning(tx: Tx): Promise<PlanItem[]> {
  const rows = (Demo.isDemoTx(tx) ? Demo.demoPlanRows() : await tx`
    select t.id, t.numero_caso, t.asunto, t.descripcion, t.estado::text as estado, t.numero_serie_equipo, t.creado_en
    from public.tickets t
    where t.estado <> 'cerrado' and position(${PLANNING_MARK} in coalesce(t.descripcion, '')) > 0
      and (t.user_id = auth.uid() or public.ticket_names_person(t.descripcion, (select p.nombre_completo from public.profiles p where p.id = auth.uid())))
    order by t.creado_en desc
    limit 300`) as Row[];
  return rows.map((r) => {
    const meta = planMeta(r.descripcion);
    const parts = String(r.asunto ?? "").replace(/^\[PLAN\]\s*/i, "").split(/\s+-\s+/);
    const year = new Date(r.creado_en).getFullYear();
    const week = isoDate(meta.week_start) && isoDate(meta.week_end) ? { start: isoDate(meta.week_start)!, end: isoDate(meta.week_end)! } : parseWeekLabel(meta.fecha_tentativa, year);
    const companions = Array.isArray(meta.companions_csv) ? meta.companions_csv.join(", ") : String(meta.companions_csv ?? "");
    return {
      id: r.id,
      folio: r.numero_caso,
      serviceType: String(meta.service_type ?? parts[0] ?? "servicio").toLowerCase(),
      platform: parts[1] ?? "",
      locality: parts.slice(2).join(" - ") || labeled(String(r.descripcion ?? ""), ["Cliente/Localidad"]),
      serial: r.numero_serie_equipo ? normSerial(r.numero_serie_equipo) : null,
      start: week?.start ?? null,
      end: week?.end ?? null,
      scheduled: isoDate(meta.scheduled_date) ?? isoDate(meta.fecha_acordada),
      engineers: [meta.ingeniero_csv, companions].filter(Boolean).join(" / "),
      status: r.estado,
    };
  });
}
/** Items that fall on a day (scheduled that day, or in a week that contains it). */
export const planOn = (items: PlanItem[], day: string) =>
  items.filter((p) => (p.scheduled ? p.scheduled === day : p.start && p.end ? p.start <= day && day <= p.end : false));

// ── Fleet ────────────────────────────────────────────────────────────────────
export interface FleetSummary {
  total: number;
  online: number;
  fatal: Array<{ serial: string; model: string | null; client: string | null; city: string | null; description: string | null; speech: string | null; since: string | null }>;
  warning: number;
  offline: number;
  qcRejected: Array<{ serial: string; test: string; at: string | null }>;
}
export async function fleet(tx: Tx): Promise<FleetSummary> {
  const [equipment, states, qc] = await Promise.all([
    activeEquipment(tx),
    equipmentStates(tx),
    Demo.isDemoTx(tx) ? Promise.resolve(Demo.demoRejectedControls()) : tx`select effective_equipment_serial as serial, test_name, max(occurred_at) as at
       from public.ba400_bpl_events
       where bpl_stage = 'quality_control' and bpl_status = 'rejected' and occurred_at > now() - interval '24 hours'
       group by 1, 2 order by 3 desc limit 50`.catch(() => [] as Row[]),
  ]);
  const bySerial = new Map(equipment.map((e) => [e.serial, e]));
  const monitored = [...states.values()].filter((s) => bySerial.has(s.serial) || !equipment.length);
  const fatal = monitored
    .filter((s) => s.status === "fatal" && s.online)
    .map((s) => ({ serial: s.serial, model: bySerial.get(s.serial)?.model ?? null, client: bySerial.get(s.serial)?.client ?? null, city: bySerial.get(s.serial)?.city ?? null, description: s.description, speech: s.activeErrors[0]?.speech ?? s.speech, since: s.since }));
  return {
    total: monitored.length,
    online: monitored.filter((s) => s.online).length,
    fatal,
    warning: monitored.filter((s) => s.status === "warning" && s.online).length,
    offline: monitored.filter((s) => !s.online).length,
    qcRejected: (qc as Row[]).map((r) => ({ serial: normSerial(r.serial), test: r.test_name, at: iso(r.at) })),
  };
}

// ── BPL: blanks, calibrations, controls ──────────────────────────────────────
export async function bplRows(tx: Tx, serial: string, days = 30, limit = 600): Promise<Row[]> {
  if (Demo.isDemoTx(tx)) return Demo.demoBplRows(normSerial(serial)).filter((r) => r.event_type !== "bpl_reaction_curve").slice(0, limit);
  return ((await tx`
    select * from public.ba400_bpl_events
    where event_type <> 'bpl_reaction_curve' and effective_equipment_serial = any(${serialCandidates(serial)})
      and occurred_at >= now() - make_interval(days => ${days})
    order by occurred_at desc limit ${limit}`) as Row[]).map(isoRow);
}

export interface BplTestStatus {
  test: string;
  status: string | null;
  lastAt: string | null;
  qc: { status: string | null; at: string | null; value: number | null; unit: string | null; mean: number | null; sd: number | null; z: number | null; rules: string[]; level: string | null; lot: string | null } | null;
  calibration: { status: string | null; at: string | null; factor: number | null; slope: number | null; correlation: number | null; relativeError: number | null; calibrator: string | null; lot: string | null } | null;
  blank: { status: string | null; at: string | null; absorbance: number | null; limit: number | null } | null;
  flips: number;
}
/** Per-test BPL picture (same summary Monitoreo shows), optionally for one test. */
export function bplStatus(serial: string, rows: Row[], test?: string | null): { tests: BplTestStatus[]; rejected: string[]; lastEventAt: string | null } | null {
  const summary = E.bplSummaryFromRows(serial, rows) as Row | null;
  if (!summary) return null;
  const want = test ? unaccent(test).replace(/[^a-z0-9]/g, "") : "";
  const tests: BplTestStatus[] = (summary.tests as Row[])
    .filter((t) => !want || unaccent(t.testName).replace(/[^a-z0-9]/g, "").includes(want) || want.includes(unaccent(t.testName).replace(/[^a-z0-9]/g, "")))
    .map((t) => {
      const st = (k: string) => t.stages?.[k] as Row | undefined;
      const qcEv = st("quality_control")?.latest as Row | undefined;
      const calEv = st("calibration")?.latest as Row | undefined;
      const blEv = st("reagent_blank")?.latest as Row | undefined;
      return {
        test: t.testName,
        status: t.effectiveStatus,
        lastAt: t.lastEventAt,
        qc: qcEv
          ? { status: qcEv.status, at: qcEv.timestamp, value: qcEv.qc?.resultValue ?? null, unit: qcEv.qc?.unit ?? null, mean: qcEv.qc?.targetMean ?? null, sd: qcEv.qc?.targetSd ?? null, z: qcEv.qc?.zScore ?? null, rules: qcEv.qc?.westgardRules ?? [], level: qcEv.qc?.controlLevel ?? null, lot: qcEv.lotNumber ?? null }
          : null,
        calibration: calEv
          ? { status: calEv.status, at: calEv.timestamp, factor: calEv.calibration?.factor ?? null, slope: calEv.calibration?.slope ?? null, correlation: calEv.calibration?.correlation ?? null, relativeError: calEv.calibration?.relativeError ?? null, calibrator: calEv.controlOrCalibratorName ?? null, lot: calEv.lotNumber ?? null }
          : null,
        blank: blEv ? { status: blEv.status, at: blEv.timestamp, absorbance: blEv.blank?.absorbance ?? null, limit: blEv.blank?.absorbanceLimit ?? null } : null,
        flips: t.statusFlips ?? 0,
      };
    });
  return { tests, rejected: summary.rejectedTests ?? [], lastEventAt: summary.lastEventAt ?? null };
}

/** Latest reaction curve of a test (only screen-abs-v2 rows may be plotted), replicates deduplicated. */
export async function reactionCurve(tx: Tx, serial: string, test?: string | null) {
  const rows = (Demo.isDemoTx(tx) ? Demo.demoCurveRows(normSerial(serial), test) : await tx`
    select test_name, occurred_at, detected_at, sample_class, payload->'reaction_curve' as rc
    from public.ba400_bpl_events
    where event_type = 'bpl_reaction_curve' and effective_equipment_serial = any(${serialCandidates(serial)})
      and payload->'reaction_curve'->>'calculation_version' = 'screen-abs-v2'
      and (${test ?? null}::text is null or upper(test_name) = upper(${test ?? ""}))
    order by occurred_at desc
    limit 24`) as Row[];
  if (!rows.length) return null;
  const head = rows[0]!.rc ?? {};
  const group = rows.filter((r) => r.rc?.work_session_id === head.work_session_id && String(r.rc?.order_test_id) === String(head.order_test_id));
  const latest = new Map<string, Row>();
  for (const r of group) {
    const k = `${r.rc?.execution_id}|${r.rc?.replicate_number}`;
    const prev = latest.get(k);
    if (!prev || new Date(r.detected_at).getTime() > new Date(prev.detected_at).getTime()) latest.set(k, r);
  }
  const replicates = [...latest.values()]
    .sort((a, b) => Number(a.rc?.replicate_number ?? 0) - Number(b.rc?.replicate_number ?? 0))
    .slice(0, 4)
    .map((r) => ({
      replicate: Number(r.rc?.replicate_number ?? 1),
      finalAbsorbance: r.rc?.final_absorbance ?? null,
      points: ((r.rc?.points ?? []) as Row[]).map((p) => [Number(p.cycle), Number(p.abs1)] as [number, number]).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])),
    }));
  return { test: rows[0]!.test_name as string, at: iso(rows[0]!.occurred_at), sampleClass: rows[0]!.sample_class as string | null, replicates };
}

// ── DRI context (what "Aplicar todo lo detectado" loads on the web) ──────────
let catalogCache: { at: number; catalog: unknown } | null = null;
export async function driCatalog(tx: Tx): Promise<unknown> {
  // The reviewer's demo uses the catalog bundled with the engine (einfo.bio IFU knowledge, no Biosystems data).
  if (Demo.isDemoTx(tx)) return E.seedCatalog();
  if (catalogCache && Date.now() - catalogCache.at < 10 * 60_000) return catalogCache.catalog;
  const safe = (p: Promise<Row[]>) => p.catch(() => [] as Row[]);
  const [reagents, factors, links, catalogRows, aliasRows] = await Promise.all([
    safe(tx`select * from public.reagents order by name`),
    safe(tx`select * from public.reagent_factors order by factor_type, label`),
    safe(tx`select * from public.reagent_factor_links order by reagent_id, factor_id`),
    safe(tx`select * from public.reactivo_rendimientos_catalogo`),
    safe(tx`select * from public.reactivo_test_aliases`),
  ]);
  const catalog = E.catalogFromRows({ reagents, factors, links, catalogRows, aliasRows });
  catalogCache = { at: Date.now(), catalog };
  return catalog;
}

export async function monitoringContext(tx: Tx, serial: string, equipment: Equipment | null) {
  const demo = Demo.isDemoTx(tx) ? Demo.demoMonitoring(normSerial(serial)) : null;
  const [states, alarms] = demo ? [demo.state ? [demo.state] : [], demo.errors] : await Promise.all([
    tx`select * from public.estado_errores_equipo_actual where upper(regexp_replace(numero_serie, '\\s', '', 'g')) = ${normSerial(serial)} order by updated_at desc limit 1`,
    tx`select id, numero_serie, modelo, codigo_error, descripcion_error, seccion_error, tipo_mensaje, detected_at, created_at, monitor_name, machine_name
       from public.monitoreo_errores_equipos where upper(regexp_replace(numero_serie, '\\s', '', 'g')) = ${normSerial(serial)}
       order by detected_at desc nulls last, id desc limit 20`,
  ]);
  const toIso = isoRow;
  return {
    serial,
    loadedAt: new Date().toISOString(),
    equipment: equipment ? { id: equipment.serial, serial: equipment.serial, model: equipment.model, clientName: equipment.client, location: [equipment.city, equipment.state, equipment.country].filter(Boolean).join(", ") || null, supremoEnabled: false } : null,
    currentState: (states as Row[])[0] ? toIso((states as Row[])[0]!) : null,
    recentErrors: (alarms as Row[]).map(toIso),
    warnings: [] as string[],
  };
}

export async function satContext(tx: Tx, serial: string) {
  const [imports, qc] = await Promise.all([
    tx`select normalized_payload, created_at from public.sat_report_imports where serial_number = any(${serialCandidates(serial)}) order by created_at desc limit 1`.catch(() => [] as Row[]),
    tx`select * from public.equipment_qc_latest where serial_number = any(${serialCandidates(serial)}) order by result_at desc`.catch(() => [] as Row[]),
  ]);
  const toIso = isoRow;
  return { sat: ((imports as Row[])[0]?.normalized_payload as Row | undefined) ?? null, satAt: iso((imports as Row[])[0]?.created_at), qcRows: (qc as Row[]).map(toIso) };
}

export interface DiagnosisInput { serial: string; failedTests?: string[]; correctTests?: string[]; observations?: string; useSources?: boolean }

/** Full voice diagnosis: load sources as the user, build the case like the DRI page, run the real engine. */
export async function diagnose(tx: Tx, input: DiagnosisInput, equipment: Equipment | null) {
  const catalog = await driCatalog(tx);
  const use = input.useSources !== false;
  const [mon, sat, bpl] = use
    ? await Promise.all([monitoringContext(tx, input.serial, equipment), satContext(tx, input.serial), bplRows(tx, input.serial, 30)])
    : [null, { sat: null, satAt: null, qcRows: [] as Row[] }, [] as Row[]];
  const eventDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  const built = E.buildVoiceCase({
    catalog,
    serial: input.serial,
    model: equipment?.model ?? null,
    eventDate,
    sources: { monitoring: mon, bplRows: bpl, sat: sat.sat, qcRows: sat.qcRows },
    failedTests: input.failedTests,
    correctTests: input.correctTests,
    observations: input.observations,
  }) as Row;
  const form = built.form as Row;
  const name = (id: string) => {
    const r = (catalog as Row).reagents.find((x: Row) => x.id === id);
    return r ? (E.getReagentDisplayName(r) as string) : id;
  };
  if (!form.failedReagentIds?.length) {
    return { ready: false as const, applied: built.applied as Row[], unresolved: built.unresolved as string[], failed: [], correct: (form.correctReagentIds ?? []).map(name), result: null };
  }
  const result = E.runVoiceDiagnosis(form, catalog) as Row;
  return {
    ready: true as const,
    applied: built.applied as Row[],
    unresolved: built.unresolved as string[],
    failed: (form.failedReagentIds as string[]).map(name),
    correct: (form.correctReagentIds as string[]).map(name),
    form,
    result: summarizeResult(result, name),
  };
}

const SUBSYSTEM = E.DRI_SUBSYSTEM_LABELS as Record<string, string>;
const SUBSYSTEM_EXTRA: Record<string, string> = { operational: "Operación", preanalytical: "Preanalítica", software: "Software", unknown: "Sin ubicar" };
export interface HypothesisSummary {
  key: string;
  title: string;
  score: number;
  confidence: number;
  label: string;
  subsystem: string | null;
  for: string[];
  against: string[];
  nextTest: string | null;
  checklist: Array<{ id: string; title: string; expected: string; onPass: string; onFail: string; interpretation: string }>;
  actions: string[];
  corrective: string[];
  parts: string[];
  warning: string | null;
}
export function summarizeResult(result: Row, name: (id: string) => string) {
  const hyps: HypothesisSummary[] = ((result.hypotheses ?? []) as Row[]).slice(0, 5).map((h) => ({
    key: h.key,
    title: h.title,
    score: Math.round(h.score ?? h.probabilityScore ?? 0),
    confidence: Math.round(h.confidenceScore ?? 0),
    label: h.probabilityLabel,
    subsystem: h.suspectedSubsystem ? SUBSYSTEM[h.suspectedSubsystem] ?? SUBSYSTEM_EXTRA[h.suspectedSubsystem] ?? h.suspectedSubsystem : null,
    for: ((h.payload?.positiveWeights ?? []) as Row[]).sort((a, b) => b.points - a.points).slice(0, 4).map((w) => `${w.label} (+${Math.round(w.points)})`),
    against: ((h.payload?.negativeWeights ?? []) as Row[]).sort((a, b) => b.points - a.points).slice(0, 3).map((w) => `${w.label} (−${Math.round(w.points)})`),
    nextTest: h.recommendedNextTest ?? null,
    checklist: ((h.checklist ?? []) as Row[]).map((c) => ({ id: c.id, title: c.title, expected: c.expectedResult, onPass: c.onPass, onFail: c.onFail, interpretation: c.interpretation })),
    actions: (h.confirmatoryActions ?? []) as string[],
    corrective: (h.correctiveActions ?? []) as string[],
    parts: ((h.candidateParts ?? []) as Row[]).map((p) => (typeof p === "string" ? p : p.name ?? p.label ?? String(p.id ?? ""))).filter(Boolean),
    warning: h.warningText ?? null,
  }));
  const contrast = result.contrast as Row | undefined;
  // The engine lists exonerations by suspicion; for a spoken answer the hardware factor that is cleared matters most
  // (primary filter, R2, temperature…), shared method traits (end point, 2-8 °C) least.
  const exPriority = (r: Row) => {
    const id = String(r.signalId ?? "");
    if (id.startsWith("wavelength:ref")) return 5;
    if (r.category === "wavelength") return 0;
    if (/r2|dispens/i.test(id) || r.category === "r2") return 1;
    if (r.category === "temperature" || /temp/i.test(id)) return 2;
    if (r.category === "blank" || r.category === "water" || /wash/i.test(id)) return 3;
    if (["storage", "contamination"].includes(r.category)) return 6;
    return 4;
  };
  const exonerations = [...((contrast?.exonerations ?? []) as Row[])].sort((a, b) => exPriority(a) - exPriority(b) || (b.exonerationStrength ?? 0) - (a.exonerationStrength ?? 0) || (b.suspicionScore ?? 0) - (a.suspicionScore ?? 0));
  return {
    hypotheses: hyps,
    exonerations: exonerations.slice(0, 4).map((r) => ({ signalId: r.signalId, label: r.label, strength: r.exonerationStrength, explanation: r.explanation, correct: (r.correctShared ?? []).map(name) })),
    implications: ((contrast?.implications ?? []) as Row[]).slice(0, 3).map((r) => ({ label: r.label, explanation: r.explanation })),
    discriminating: ((contrast?.discriminatingTests ?? []) as Row[]).slice(0, 3).map((d) => {
      const rows = ((contrast?.rows ?? []) as Row[]).filter((r) => (d.signalIds ?? []).includes(r.signalId)).sort((a, b) => exPriority(a) - exPriority(b));
      return { test: name(d.reagentId), reason: d.reason, factors: rows.map((r) => String(r.label)).slice(0, 2) };
    }),
    lotFindings: (((result.lotIntelligence as Row | undefined)?.findings ?? []) as Row[]).slice(0, 4).map((f) => ({ type: f.type, title: f.title ?? f.label ?? f.type, detail: f.detail ?? f.message ?? null, severity: f.severity ?? null })),
    missing: ((result.missingEvidence ?? []) as string[]).slice(0, 4),
    topSubsystems: ((result.topSubsystems ?? []) as Row[]).slice(0, 3).map((s) => SUBSYSTEM[s.subsystem] ?? SUBSYSTEM_EXTRA[s.subsystem] ?? s.subsystem),
  };
}

// ── Lots & IFU facts (bundled einfo.bio knowledge, no user data) ─────────────
export async function lotFacts(tx: Tx | null, test: string, lot?: string | null) {
  const catalog = tx ? await driCatalog(tx) : E.seedCatalog();
  const facts = E.lotFactsForTest(catalog, test) as { reagent: Row | null; lots: Row[] };
  const lots = lot ? facts.lots.filter((f) => [f.componentLot, f.productLot].some((x: string) => x && (x === lot || x.replace(/^0+/, "") === lot.replace(/^0+/, "")))) : facts.lots;
  const today = new Date().toISOString().slice(0, 10);
  return {
    reagent: facts.reagent?.name ?? null,
    reagentIfu: facts.reagent?.ifuFacts ?? null,
    lots: lots.slice(0, 4).map((f) => ({
      productCode: f.productCode,
      productLot: f.productLot,
      componentLot: f.componentLot,
      expiresAt: f.expiresAt,
      expired: f.expiresAt ? f.expiresAt < today : null,
      onboardStability: f.ifu?.onboardStability?.text ?? null,
      onboardHours: f.ifu?.onboardStability?.hours ?? null,
      detectionLimit: f.ifu?.detectionLimit ?? null,
      quantificationLimit: f.ifu?.quantificationLimit ?? null,
      linearity: f.ifu?.linearityLimit ?? null,
      precision: f.ifu?.precision?.[0] ?? null,
      interferences: (f.ifu?.interferenceThresholds ?? []).slice(0, 6),
      deterioration: f.ifu?.deteriorationSigns ?? null,
      blankLimit: f.ifu?.parameters?.blankAbsorbanceLimit?.ba400 ?? null,
      wavelength: f.ifu?.parameters?.primaryFilterNm?.ba400 ?? null,
      coaBlank: ((f.coa?.controlData ?? []) as Row[]).find((c) => /absorbance/i.test(c.name ?? ""))?.result ?? null,
      source: f.sourceUrl,
    })),
  };
}
