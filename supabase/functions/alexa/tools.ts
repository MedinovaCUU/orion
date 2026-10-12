// ORION · Claude's tools. Each one is a thin wrapper over data.ts executed AS the linked user (Turn.run), so Claude
// can only see what that person sees in Orion. Drafts go to alexa_pending_actions for approval in Orion web.
import type { AgentTool } from "./agent.ts";
import * as D from "./data.ts";
import * as S from "./store.ts";
import type { Turn } from "./handlers.ts";
import { canonicalTest, todayIso } from "./speech.ts";

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : typeof v === "string" && v.trim() ? v.split(/,|\by\b/).map((x) => x.trim()).filter(Boolean) : []);

async function resolveSerial(t: Turn, q: string | null) {
  if (!q) throw new Error("Falta la serie o el nombre del equipo");
  const all = await t.run((tx) => D.activeEquipment(tx));
  const hits = D.matchEquipment(all, q);
  if (hits.length === 1) return hits[0]!;
  if (hits.length > 1) throw new Error(`Ambiguo: ${hits.slice(0, 6).map((e) => `${e.serial} (${e.client ?? "sin cliente"}, ${e.city ?? ""})`).join("; ")}`);
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 6) return { serial: D.normSerial(digits), model: null, client: null, city: null, state: null, country: null, address: null } as D.Equipment;
  throw new Error(`No encuentro un equipo activo para "${q}"`);
}
const obj = (props: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties: props, required, additionalProperties: false });
const S_SERIAL = { type: "string", description: "Serie completa o terminación (p. ej. '0473'), o cliente/ciudad del equipo" };
const S_TEST = { type: "string", description: "Prueba en español o código del analizador (glucosa, GLUCOSE, ALT-GPT…)" };

export function buildTools(t: Turn): AgentTool[] {
  return [
    {
      name: "find_equipment",
      description: "Busca equipos activos (BA400/BA200/A15) por terminación de serie, cliente o ciudad. Úsala cuando el usuario nombre un equipo de forma ambigua.",
      input_schema: obj({ query: { type: "string" } }, ["query"]),
      run: async (i) => D.matchEquipment(await t.run((tx) => D.activeEquipment(tx)), String(i.query ?? "")).slice(0, 8),
    },
    {
      name: "fleet_summary",
      description: "Estado de toda la flota monitoreada: equipos en línea, en alarma fatal (con cliente/ciudad), advertencias, sin reportar y controles BPL rechazados en 24 h.",
      input_schema: obj({}),
      run: () => t.run((tx) => D.fleet(tx)),
    },
    {
      name: "equipment_status",
      description: "Estado actual de un equipo: alarma vigente y su ubicación en el BA400, alarmas de 24 h, controles/calibraciones/blancos BPL de 7 días y casos abiertos con SLA.",
      input_schema: obj({ equipment: S_SERIAL }, ["equipment"]),
      run: async (i) => {
        const e = await resolveSerial(t, str(i.equipment));
        return t.run(async (tx) => ({
          equipment: e,
          state: (await D.equipmentStates(tx, [e.serial])).get(e.serial) ?? null,
          alarms24h: (await D.recentAlarms(tx, e.serial, 1, 50)).length,
          bpl: D.bplStatus(e.serial, await D.bplRows(tx, e.serial, 7, 400)),
          openTickets: (await D.ticketsForSerial(tx, e.serial)).map((x) => ({ id: x.id, folio: x.folio, subject: x.subject, status: x.status, sla: x.sla })),
        }));
      },
    },
    {
      name: "recent_alarms",
      description: "Historial de alarmas de un equipo (códigos BA400 con descripción y ubicación del catálogo).",
      input_schema: obj({ equipment: S_SERIAL, days: { type: "integer", minimum: 1, maximum: 90 } }, ["equipment"]),
      run: async (i) => {
        const e = await resolveSerial(t, str(i.equipment));
        return t.run((tx) => D.recentAlarms(tx, e.serial, Number(i.days ?? 14), 120));
      },
    },
    {
      name: "alarm_info",
      description: "Qué significa un código de alarma del BA400 (descripción del firmware, severidad, ubicación) y cuántas veces apareció en 30 días en un equipo.",
      input_schema: obj({ code: { type: "string" }, equipment: S_SERIAL }, ["code"]),
      run: async (i) => {
        const e = str(i.equipment) ? await resolveSerial(t, str(i.equipment)) : null;
        return t.run((tx) => D.alarmInfo(tx, String(i.code), e?.serial ?? null));
      },
    },
    {
      name: "qc_and_calibration",
      description: "Controles de calidad (valor, media, z, reglas de Westgard), calibraciones (factor, correlación) y blancos de reactivo del monitor BPL de un equipo; opcionalmente de una prueba.",
      input_schema: obj({ equipment: S_SERIAL, test: S_TEST, days: { type: "integer", minimum: 1, maximum: 180 } }, ["equipment"]),
      run: async (i) => {
        const e = await resolveSerial(t, str(i.equipment));
        const test = str(i.test);
        return t.run(async (tx) => ({ bpl: D.bplStatus(e.serial, await D.bplRows(tx, e.serial, Number(i.days ?? 30)), test ? canonicalTest(test) : null), satQc: (await D.satContext(tx, e.serial)).qcRows.slice(0, 40) }));
      },
    },
    {
      name: "reaction_curve",
      description: "Última curva de reacción (cálculo screen-abs-v2) de una prueba en un equipo: réplicas, absorbancia final y número de puntos.",
      input_schema: obj({ equipment: S_SERIAL, test: S_TEST }, ["equipment"]),
      run: async (i) => {
        const e = await resolveSerial(t, str(i.equipment));
        const c = await t.run((tx) => D.reactionCurve(tx, e.serial, str(i.test) ? canonicalTest(str(i.test)!) : null));
        return c ? { ...c, replicates: c.replicates.map((r) => ({ replicate: r.replicate, finalAbsorbance: r.finalAbsorbance, points: r.points.length, first: r.points[0], last: r.points.at(-1) })) } : null;
      },
    },
    {
      name: "run_differential",
      description: "Corre el motor de diagnóstico diferencial DRI (el mismo de Orion web) para un equipo. Carga solo Monitoreo, BPL y SAT del equipo y agrega las pruebas que el usuario diga que fallan o salen bien. Devuelve hipótesis con probabilidad, descartes por contraste, hallazgos de lote, pruebas discriminantes y pasos de verificación.",
      input_schema: obj({ equipment: S_SERIAL, failed_tests: { type: "array", items: { type: "string" } }, correct_tests: { type: "array", items: { type: "string" } }, observations: { type: "string" } }, ["equipment"]),
      run: async (i) => {
        const e = await resolveSerial(t, str(i.equipment));
        const d = await t.run((tx) => D.diagnose(tx, { serial: e.serial, failedTests: list(i.failed_tests).map(canonicalTest), correctTests: list(i.correct_tests).map(canonicalTest), observations: str(i.observations) ?? undefined }, e));
        return { equipment: e, ready: d.ready, failed: d.failed, correct: d.correct, unresolvedTests: d.unresolved, sourcesUsed: d.applied, result: d.result };
      },
    },
    {
      name: "lot_and_ifu",
      description: "Datos de IFU y certificado por lote (einfo.bio) de una prueba: estabilidad a bordo, interferencias, linealidad, límites de detección, precisión, límite de blanco, caducidad de lotes documentados.",
      input_schema: obj({ test: S_TEST, lot: { type: "string" } }, ["test"]),
      run: (i) => t.run((tx) => D.lotFacts(tx, canonicalTest(String(i.test)), str(i.lot))),
    },
    {
      name: "my_day",
      description: "Agenda del usuario: servicios planeados (preventivos, correctivos, instalaciones, capacitaciones) para una fecha y sus casos abiertos con SLA.",
      input_schema: obj({ date: { type: "string", description: "YYYY-MM-DD; por defecto hoy" } }),
      run: async (i) => {
        const day = str(i.date) ?? todayIso();
        return t.run(async (tx) => ({ day, planned: D.planOn(await D.myPlanning(tx), day), openTickets: (await D.openTickets(tx, "mine")).sort((a, b) => D.slaRank(a) - D.slaRank(b)) }));
      },
    },
    {
      name: "open_tickets",
      description: "Casos de soporte abiertos con SLA (Falcon 24 h CDMX / 48 h foráneo; general 48 h). scope 'mine' = asignados o creados por el usuario; 'all' = todos los que puede ver (administradores).",
      input_schema: obj({ scope: { type: "string", enum: ["mine", "all"] } }),
      run: async (i) => (await t.run((tx) => D.openTickets(tx, i.scope === "all" ? "all" : "mine"))).sort((a, b) => D.slaRank(a) - D.slaRank(b)),
    },
    {
      name: "ticket_log",
      description: "Últimos movimientos de bitácora de un caso (por id del caso).",
      input_schema: obj({ ticket_id: { type: "string" } }, ["ticket_id"]),
      run: (i) => t.run((tx) => D.ticketLog(tx, String(i.ticket_id), 8)),
    },
    {
      name: "voice_cases",
      description: "Diagnósticos hechos por voz por este usuario (opcionalmente de un equipo), con su resultado: sirve para recordar qué resolvió una falla parecida antes.",
      input_schema: obj({ equipment: S_SERIAL }),
      run: async (i) => {
        const e = str(i.equipment) ? await resolveSerial(t, str(i.equipment)) : null;
        return t.run((tx) => tx`select serial, failed_tests, correct_tests, top_hypothesis, hypotheses, outcome, outcome_note, confirmed_hypothesis, created_at
          from public.alexa_voice_cases where (${e?.serial ?? null}::text is null or serial = ${e?.serial ?? ""}) order by created_at desc limit 10`);
      },
    },
    {
      name: "draft_ticket",
      description: "Deja un BORRADOR de ticket de soporte (ingeniería o química) para un equipo. No se crea hasta que el usuario lo confirme en Orion web.",
      input_schema: obj({ equipment: S_SERIAL, reason: { type: "string" }, area: { type: "string", enum: ["ingenieria", "quimica"] } }, ["equipment", "reason"]),
      run: async (i) => {
        const e = await resolveSerial(t, str(i.equipment));
        const area = i.area === "quimica" ? "quimica" : "ingenieria";
        const id = t.viewer.demo ? null : await S.createAction(t.viewer.id, "ticket", `Ticket ${area} · ${e.serial} · ${String(i.reason)}`, { serial: e.serial, area, motivo: String(i.reason), cliente: e.client, descripcion: `${String(i.reason)}\nCanal: Alexa (Orion)${e.client ? `\nCliente/Institución: ${e.client}` : ""}${e.city ? `\nLocalidad: ${e.city}` : ""}` });
        return { draftId: id, status: "pendiente de confirmar en Orion web (sección Alexa)" };
      },
    },
    {
      name: "draft_spare_part",
      description: "Deja un BORRADOR de solicitud de refacción. No se envía hasta que el usuario lo confirme en Orion web.",
      input_schema: obj({ part: { type: "string" }, quantity: { type: "integer", minimum: 1, maximum: 50 }, equipment: S_SERIAL }, ["part"]),
      run: async (i) => {
        const e = str(i.equipment) ? await resolveSerial(t, str(i.equipment)) : null;
        const id = t.viewer.demo ? null : await S.createAction(t.viewer.id, "refaccion", `${Number(i.quantity ?? 1)} × ${String(i.part)}${e ? ` · ${e.serial}` : ""}`, { pieza: String(i.part), cantidad: Number(i.quantity ?? 1), serial: e?.serial ?? null, modelo: e?.model ?? null, cliente: e?.client ?? null });
        return { draftId: id, status: "pendiente de confirmar en Orion web (sección Alexa)" };
      },
    },
  ];
}
