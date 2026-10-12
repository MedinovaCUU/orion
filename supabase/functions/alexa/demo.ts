// ORION · demo data for Amazon's certification reviewer (an account listed in public.alexa_reviewers).
// Everything here is fictitious: laboratories, serials, people, phones and cases. The reviewer's turns never open a
// database transaction: index.ts hands the handlers DEMO_TX instead, and data.ts answers from these rows (already in
// the shape the database returns, so the same mapping and speech code runs). Writes are accepted and not saved.
// Times are relative to "now", so the story is always the same: a Falcon case about to expire, rejected glucose
// controls on the analyzer in fatal alarm, a case waiting for a part, and this week's preventive service.
import { buildBplDemoRows } from "./demoBpl.js";

type Row = Record<string, any>;

const DEMO = Symbol.for("orion.alexa.demo");
const empty = () => Promise.resolve([] as Row[]);
/** Stand-in for a transaction: any query that was not given demo rows reads as empty instead of touching Orion. */
export const DEMO_TX: any = Object.assign((..._args: unknown[]) => empty(), { [DEMO]: true, unsafe: empty, json: (v: unknown) => v });
export const isDemoTx = (tx: unknown): boolean => Boolean(tx && (tx as Record<symbol, unknown>)[DEMO]);

const H = 3.6e6;
const ago = (hours: number) => new Date(Date.now() - hours * H).toISOString();
const dayMx = (offsetDays: number) => new Date(Date.now() + offsetDays * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

export const DEMO_SERIALS = { fatal: "834009999", cdmx: "834000473", sur: "832001234", bajio: "830005678" };
export const DEMO_REVIEWER_NAME = "Revisión Alexa";

const EQUIPMENT: Row[] = [
  { numero_serie: DEMO_SERIALS.fatal, modelo: "BA400", razon_social: "Laboratorio Demo Norte", ciudad: "Monterrey", estado: "Nuevo León", pais: "México", direccion: "Av. Demostración 100" },
  { numero_serie: DEMO_SERIALS.cdmx, modelo: "BA400", razon_social: "Hospital Demo Centro", ciudad: "Ciudad de México", estado: "Ciudad de México", pais: "México", direccion: "Calle Ejemplo 25" },
  { numero_serie: DEMO_SERIALS.sur, modelo: "BA200", razon_social: "Clínica Demo Sur", ciudad: "Puebla", estado: "Puebla", pais: "México", direccion: "Blvd. Muestra 8" },
  { numero_serie: DEMO_SERIALS.bajio, modelo: "A15", razon_social: "Laboratorio Demo Bajío", ciudad: "Querétaro", estado: "Querétaro", pais: "México", direccion: "Privada Prueba 3" },
];
export const demoEquipmentRows = () => EQUIPMENT.map((e) => ({ ...e }));
const equipmentOf = (serial: string | null) => EQUIPMENT.find((e) => e.numero_serie === serial) ?? null;

/** estado_errores_equipo_actual (+ insumos_at) rows. */
export function demoStateRows(serials?: string[] | null): Row[] {
  const rows: Row[] = [
    { numero_serie: DEMO_SERIALS.fatal, estado_actual: "fatal", error_principal_codigo: "100", error_principal_descripcion: "BR1 Vertical Home Error", codigo_estado: "100", descripcion_estado: "BR1 Vertical Home Error", activo_desde: ago(2), last_event_at: ago(0.2), insumos_at: ago(0.5), errores_activos: [{ codigo_error: "100", descripcion_error: "BR1 Vertical Home Error", seccion_error: "ANALYZER" }], updated_at: ago(0.2), modelo: "BA400" },
    { numero_serie: DEMO_SERIALS.cdmx, estado_actual: "ok", error_principal_codigo: null, error_principal_descripcion: null, codigo_estado: "OK_000", descripcion_estado: "Sin alarmas", activo_desde: null, last_event_at: ago(1), insumos_at: ago(1), errores_activos: [], updated_at: ago(1), modelo: "BA400" },
    { numero_serie: DEMO_SERIALS.sur, estado_actual: "warning", error_principal_codigo: "301", error_principal_descripcion: "RR1 Fridge Temperature Alarm", codigo_estado: "301", descripcion_estado: "RR1 Fridge Temperature Alarm", activo_desde: ago(6), last_event_at: ago(0.4), insumos_at: ago(0.4), errores_activos: [{ codigo_error: "301", descripcion_error: "RR1 Fridge Temperature Alarm", seccion_error: "ANALYZER" }], updated_at: ago(0.4), modelo: "BA200" },
    { numero_serie: DEMO_SERIALS.bajio, estado_actual: "ok", error_principal_codigo: null, error_principal_descripcion: null, codigo_estado: "OK_000", descripcion_estado: "Sin alarmas", activo_desde: null, last_event_at: ago(70), insumos_at: ago(70), errores_activos: [], updated_at: ago(70), modelo: "A15" },
  ];
  return serials?.length ? rows.filter((r) => serials.includes(r.numero_serie)) : rows;
}

/** monitoreo_errores_equipos rows, newest first. */
export function demoAlarmRows(serial: string, days = 14): Row[] {
  const list: Array<[string, number, string, string, string]> = [
    [DEMO_SERIALS.fatal, 1, "100", "BR1 Vertical Home Error", "fatal"],
    [DEMO_SERIALS.fatal, 2, "100", "BR1 Vertical Home Error", "fatal"],
    [DEMO_SERIALS.fatal, 5, "301", "RR1 Fridge Temperature Alarm", "warning"],
    [DEMO_SERIALS.fatal, 30, "100", "BR1 Vertical Home Error", "fatal"],
    [DEMO_SERIALS.sur, 6, "301", "RR1 Fridge Temperature Alarm", "warning"],
    [DEMO_SERIALS.sur, 26, "301", "RR1 Fridge Temperature Alarm", "warning"],
  ];
  return list
    .filter(([s, hours]) => s === serial && hours <= days * 24)
    .map(([s, hours, code, desc, type], i) => ({ id: 9000 + i, numero_serie: s, modelo: equipmentOf(s)?.modelo ?? null, codigo_error: code, descripcion_error: desc, seccion_error: "ANALYZER", tipo_mensaje: type, detected_at: ago(hours), created_at: ago(hours), at: ago(hours), monitor_name: "demo", machine_name: "demo" }));
}

// ── BPL (blanks, calibrations, controls, reaction curves) of the analyzer in alarm ──
let bplCache: { at: number; status: Row[]; curves: Row[] } | null = null;
function bpl() {
  if (!bplCache || Date.now() - bplCache.at > 10 * 60_000) {
    const { statusRows, curveRows } = buildBplDemoRows({ serial: DEMO_SERIALS.fatal, now: new Date() }) as { statusRows: Row[]; curveRows: Row[] };
    bplCache = { at: Date.now(), status: statusRows.map((r, i) => ({ id: 800 + i, ...r })), curves: curveRows };
  }
  return bplCache;
}
export const demoBplRows = (serial: string) => (serial === DEMO_SERIALS.fatal ? bpl().status.map((r) => ({ ...r })) : []);
/** Rows shaped like reactionCurve()'s query (test_name, occurred_at, detected_at, sample_class, rc). */
export function demoCurveRows(serial: string, test?: string | null): Row[] {
  if (serial !== DEMO_SERIALS.fatal) return [];
  return bpl().curves
    .filter((r) => !test || String(r.test_name).toUpperCase() === test.toUpperCase())
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)))
    .map((r) => ({ test_name: r.test_name, occurred_at: r.occurred_at, detected_at: r.detected_at, sample_class: r.sample_class, rc: r.payload.reaction_curve }));
}
/** Controls rejected in the last 24 h (fleet summary). */
export const demoRejectedControls = () =>
  bpl().status
    .filter((r) => r.bpl_stage === "quality_control" && r.bpl_status === "rejected" && Date.now() - new Date(r.occurred_at).getTime() < 24 * H)
    .map((r) => ({ serial: r.effective_equipment_serial, test_name: r.test_name, at: r.occurred_at }));

// ── Cases ──
const PEOPLE = { quimica: "Ana Torres", ingenieria: "Luis Herrera", quimica2: "Marta Ríos" };
export const DEMO_PEOPLE = [
  { id: "d0000000-0000-4000-8000-000000000101", nombre_completo: PEOPLE.quimica, team: "quimica" },
  { id: "d0000000-0000-4000-8000-000000000102", nombre_completo: PEOPLE.ingenieria, team: "ingenieria" },
  { id: "d0000000-0000-4000-8000-000000000103", nombre_completo: PEOPLE.quimica2, team: "quimica" },
];

/** Orion's eight-character case number (format_ticket_case_number) for a date and daily sequence. */
export function demoFolio(date: Date, seq: number): string {
  const [y, m, d] = date.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }).split("-");
  const month = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"][Number(m) - 1]!;
  const s = String(seq).padStart(2, "0");
  return `${d![0]}${month[0]}${y![2]}${s[0]}${d![1]}${month[2]}${y![3]}${s[1]}`;
}

interface DemoCase { id: string; seq: number; hours: number; subject: string; description: string; serial: string | null; state: string; mine?: boolean; assignedToMe?: boolean; assignee?: string | null; respondedHours?: number; closedHours?: number; reason?: string; contact?: { name: string; phone: string; email?: string } }
const CASES: DemoCase[] = [
  { id: "d1000000-0000-4000-8000-000000000001", seq: 3, hours: 20, subject: "[Soporte Ingeniero] [FALCON] La lámpara no enciende", description: "Canal: FALCON\nLocalidad: Ciudad de México\n\nFalla reportada: La lámpara del fotómetro no enciende desde el arranque de la mañana.", serial: DEMO_SERIALS.cdmx, state: "abierto", assignedToMe: true, contact: { name: "Dra. Laura Demo", phone: "5512345678", email: "laboratorio@demo.example" } },
  { id: "d1000000-0000-4000-8000-000000000002", seq: 5, hours: 30, subject: "[Soporte Químico] Controles de glucosa fuera de rango", description: "Cliente/Institución: Laboratorio Demo Norte\n\nFalla reportada: El control nivel uno de glucosa sale alto desde ayer; la calibración pasó.", serial: DEMO_SERIALS.fatal, state: "en_progreso", assignedToMe: true, respondedHours: 28, contact: { name: "Q. F. B. Mario Demo", phone: "8112345678" } },
  { id: "d1000000-0000-4000-8000-000000000003", seq: 2, hours: 6, subject: "[Soporte Ingeniero] Alarma de temperatura del refrigerador de reactivos", description: "Cliente/Institución: Clínica Demo Sur\n\nFalla reportada: Alarma de temperatura del refrigerador de reactivos intermitente.", serial: DEMO_SERIALS.sur, state: "pendiente_piezas", assignedToMe: true, mine: true, respondedHours: 5, contact: { name: "Ing. Sofía Demo", phone: "2221234567" } },
  { id: "d1000000-0000-4000-8000-000000000004", seq: 1, hours: 2, subject: "[Soporte Químico] Resultados de creatinina altos", description: "Cliente/Institución: Laboratorio Demo Bajío\n\nFalla reportada: Varias muestras de creatinina salen altas contra el equipo de respaldo.", serial: DEMO_SERIALS.bajio, state: "abierto", contact: { name: "Q. C. Elena Demo", phone: "4421234567" } },
  { id: "d1000000-0000-4000-8000-000000000005", seq: 4, hours: 9 * 24, subject: "[Soporte Químico] Calibración de glucosa con error", description: "Cliente/Institución: Laboratorio Demo Norte\n\nFalla reportada: La calibración de glucosa no pasa.", serial: DEMO_SERIALS.fatal, state: "cerrado", assignee: PEOPLE.quimica, respondedHours: 9 * 24 - 2, closedHours: 8 * 24, reason: "solucionado" },
  { id: "d1000000-0000-4000-8000-000000000006", seq: 7, hours: 20 * 24, subject: "[Soporte Ingeniero] Baja energía de la lámpara", description: "Cliente/Institución: Hospital Demo Centro\n\nFalla reportada: Mensaje de baja energía de la lámpara.", serial: DEMO_SERIALS.cdmx, state: "cerrado", assignee: PEOPLE.ingenieria, respondedHours: 20 * 24 - 1, closedHours: 19 * 24, reason: "solucionado" },
];

function caseRow(c: DemoCase): Row {
  const e = equipmentOf(c.serial);
  const created = new Date(Date.now() - c.hours * H);
  return {
    id: c.id, numero_caso: demoFolio(created, c.seq), asunto: c.subject, descripcion: c.description, estado: c.state,
    creado_en: created.toISOString(), actualizado_en: ago(Math.min(c.hours, 1)), numero_serie_equipo: c.serial, user_id: null,
    nombre_cliente_guest: c.contact?.name ?? null, telefono_cliente_guest: c.contact?.phone ?? null, email_cliente_guest: c.contact?.email ?? null,
    mine: Boolean(c.mine), assigned_to_me: Boolean(c.assignedToMe), assignee: c.assignedToMe ? DEMO_REVIEWER_NAME : c.assignee ?? null,
    respondido_en: c.respondedHours != null ? ago(c.respondedHours) : null, cerrado_en: c.closedHours != null ? ago(c.closedHours) : null, motivo_cierre: c.reason ?? null,
    modelo: e?.modelo ?? null, ciudad: e?.ciudad ?? null, edo: e?.estado ?? null, direccion: e?.direccion ?? null, razon_social: e?.razon_social ?? null,
  };
}

/** Same filters as data.ts ticketRows (planning is never in the demo cases). */
export function demoTicketRows(q: { scope: "mine" | "all" | "serial" | "id"; serial?: string; id?: string; includeClosed?: boolean; limit?: number; suffix?: string }): Row[] {
  const suffix = (q.suffix ?? "").replace(/\D/g, "");
  const rows = CASES.map(caseRow).filter((r) => {
    if (!q.includeClosed && r.estado === "cerrado") return false;
    if (q.scope === "all") return true;
    if (q.scope === "mine") return r.mine || r.assigned_to_me;
    if (q.scope === "serial") return r.numero_serie_equipo === q.serial || (suffix.length >= 4 && String(r.numero_serie_equipo ?? "").endsWith(suffix));
    return r.id === q.id;
  });
  rows.sort((a, b) => (q.includeClosed ? b.creado_en.localeCompare(a.creado_en) : a.creado_en.localeCompare(b.creado_en)));
  return rows.slice(0, q.limit ?? 120);
}

const LOG: Record<string, Array<[number, string, string, string | null, string]>> = {
  "d1000000-0000-4000-8000-000000000001": [[19.5, "nota", "Caso recibido por el canal Falcon; el laboratorio reporta que la lámpara no enciende desde la mañana.", "abierto", PEOPLE.ingenieria]],
  "d1000000-0000-4000-8000-000000000002": [
    [3, "diagnostico", "Control nivel uno de glucosa en 140 miligramos por decilitro, fuera de la regla uno tres s. La calibración se aceptó hace cinco horas.", "en_progreso", PEOPLE.quimica],
    [28, "respuesta", "Primera respuesta al cliente: revisaremos los controles de glucosa hoy.", "en_progreso", PEOPLE.quimica],
  ],
  "d1000000-0000-4000-8000-000000000003": [
    [4, "pieza", "Se solicitó el termostato del refrigerador de reactivos.", "pendiente_piezas", PEOPLE.ingenieria],
    [5, "respuesta", "Primera respuesta al cliente: el refrigerador mantiene temperatura; pedimos la pieza.", "en_progreso", PEOPLE.ingenieria],
  ],
  "d1000000-0000-4000-8000-000000000005": [[8 * 24, "cierre", "Se recalibró glucosa con un lote nuevo de calibrador; los controles quedaron dentro.", null, PEOPLE.quimica]],
  "d1000000-0000-4000-8000-000000000006": [[19 * 24, "cierre", "Se cambió la lámpara; energía dentro de especificación.", null, PEOPLE.ingenieria]],
};
/** ticket_bitacora rows (tipo, detalle, estado, creado_en, nombre_completo), newest first. */
export const demoLogRows = (ticketId: string, limit = 5): Row[] =>
  (LOG[ticketId] ?? []).slice(0, limit).map(([hours, tipo, detalle, estado, by]) => ({ tipo, detalle, estado, creado_en: ago(hours), nombre_completo: by }));

export function demoClosedStats(sinceIso: string): Row {
  const since = new Date(sinceIso).getTime();
  const closed = CASES.filter((c) => c.closedHours != null && Date.now() - c.closedHours * H >= since);
  return { n: closed.length, solved: closed.filter((c) => c.reason === "solucionado").length, reason: closed[0]?.reason ?? null };
}

/** get_ticket_assignment_suggestions rows: same area first, the person who attended the equipment before on top. */
export function demoSuggestionRows(ticketId: string): Row[] {
  const c = CASES.find((x) => x.id === ticketId);
  const area = /qu[ií]mic/i.test(c?.subject ?? "") ? "quimica" : "ingenieria";
  return DEMO_PEOPLE.filter((p) => p.team === area).map((p, i) => ({
    user_id: p.id, full_name: p.nombre_completo, ranking: i + 1, rule: i === 0 ? "continuidad" : "carga",
    reason: i === 0 ? "atendió el caso anterior de este equipo" : "tiene la menor carga: 1 caso abierto",
    continuity: i === 0 ? "atendió el caso anterior de este equipo" : null, busy_reason: null, open_cases: i + 1, last_closed_at: ago(48),
  }));
}

/** Planning tickets ([PLAN] subject + [METADATA_PLANEACION] JSON), as myPlanning reads them. */
export function demoPlanRows(): Row[] {
  const plan = (id: string, subject: string, serial: string, meta: Row, place: string): Row => ({
    id, numero_caso: demoFolio(new Date(Date.now() - 72 * H), Number(id.slice(-1))), asunto: subject, estado: "abierto", numero_serie_equipo: serial, creado_en: ago(72),
    descripcion: `Cliente/Localidad: ${place}\n\n[METADATA_PLANEACION] ${JSON.stringify(meta)}`,
  });
  return [
    plan("d2000000-0000-4000-8000-000000000001", "[PLAN] PREVENTIVO - BA400 - MONTERREY", DEMO_SERIALS.fatal, { service_type: "preventivo", ingeniero_csv: DEMO_REVIEWER_NAME, companions_csv: [PEOPLE.ingenieria], week_start: dayMx(-1), week_end: dayMx(3) }, "Laboratorio Demo Norte"),
    plan("d2000000-0000-4000-8000-000000000002", "[PLAN] INSTALACION - A15 - QUERETARO", DEMO_SERIALS.bajio, { service_type: "instalación", ingeniero_csv: DEMO_REVIEWER_NAME, companions_csv: [], scheduled_date: dayMx(2) }, "Laboratorio Demo Bajío"),
  ];
}

/** monitoringContext() pieces for the DRI. */
export function demoMonitoring(serial: string): { state: Row | null; errors: Row[] } {
  return { state: demoStateRows([serial])[0] ?? null, errors: demoAlarmRows(serial, 30).slice(0, 20) };
}

/** A case opened by voice in the demo: a plausible number, not saved. */
export const demoNewCase = () => ({ id: crypto.randomUUID(), folio: demoFolio(new Date(), 8), receiver: PEOPLE.ingenieria as string | null });
