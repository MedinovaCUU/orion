// ORION · words people use for cases. Shared by the skill (cases.ts) and the interaction model generator
// (alexa/build-model.mjs), so what Alexa recognises and what the backend understands never drift apart.
// No imports: Node loads this file directly when it builds the model.

/** List filters: «casos pendientes por piezas», «reportes sin asignar», «casos de Falcon». First word = the slot value. */
export const CASE_FILTERS: Record<string, string[]> = {
  abiertos: ["abiertos", "abiertas", "activos"],
  en_progreso: ["en progreso", "en proceso", "en curso", "trabajándose"],
  pendiente_piezas: ["pendientes por piezas", "pendiente por piezas", "pendientes de piezas", "esperando piezas", "esperando refacción", "en espera de piezas", "pendientes de refacción", "esperando refacciones"],
  en_observacion: ["en observación", "en monitoreo", "en seguimiento", "observación"],
  sin_respuesta: ["sin respuesta", "sin primera respuesta", "sin contestar", "sin respuesta al cliente", "sin responder"],
  sin_asignar: ["sin asignar", "sin responsable", "sin dueño", "no asignados"],
  vencidos: ["vencidos", "vencidas", "fuera de plazo", "atrasados"],
  por_vencer: ["por vencer", "en riesgo", "por vencerse", "a punto de vencer"],
  nuevos: ["nuevos", "nuevas", "de hoy", "que entraron hoy", "recientes"],
  cerrados: ["cerrados", "cerradas", "resueltos", "terminados"],
  falcon: ["de falcon", "falcon"],
  quimica: ["de química", "químicos", "de soporte químico", "química"],
  ingenieria: ["de ingeniería", "de soporte de ingeniería", "ingeniería"],
};

/** States a case can be moved to by voice (register_ticket_movement p_state). */
export const CASE_STATES: Record<string, string[]> = {
  en_progreso: ["en progreso", "en proceso", "en curso", "trabajando"],
  pendiente_piezas: ["pendiente por piezas", "pendiente de piezas", "esperando piezas", "en espera de piezas", "pendiente de refacción", "esperando refacción"],
  en_observacion: ["en observación", "observación", "en monitoreo", "en seguimiento"],
  abierto: ["abierto", "abierta"],
};

/** Closure reasons of Orion web (closureReasons in ticketControlModel.ts). */
export const CLOSURE_REASONS: Record<string, string[]> = {
  solucionado: ["solucionado", "resuelto", "solucionada", "resuelta", "arreglado", "quedó resuelto"],
  visita_programada: ["visita programada", "con visita programada", "se programó visita", "se programó una visita"],
  sin_respuesta: ["sin respuesta del cliente", "sin respuesta", "el cliente no contestó", "no contestó el cliente"],
  administrativo: ["administrativo", "cierre administrativo", "otro motivo", "duplicado"],
};

/** A few names so Alexa recognises «asígnale el caso a Juan»; the real match is against Orion's staff. */
export const PEOPLE_SAMPLES = ["juan", "josé", "luis", "carlos", "ricardo", "miguel", "jorge", "alejandro", "fernando", "roberto", "maría", "ana", "laura", "patricia", "gabriela", "daniel", "eduardo", "francisco", "javier", "raúl", "juan pérez", "olivia", "ricardo montañez", "ricardo vilchis", "montañez", "vilchis"];

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Raw words → key of a vocabulary table: exact synonym first, then the longest synonym the words contain. */
export function matchVocab(table: Record<string, string[]>, raw: string | null | undefined): string | undefined {
  const v = fold(raw ?? "");
  if (!v) return undefined;
  for (const [key, words] of Object.entries(table)) if (key === v || words.some((w) => fold(w) === v)) return key;
  let best: { key: string; len: number } | undefined;
  for (const [key, words] of Object.entries(table)) {
    for (const w of words) {
      const f = fold(w);
      if (f.length >= 4 && new RegExp(`(^|\\s)${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s)`).test(v) && (!best || f.length > best.len)) best = { key, len: f.length };
    }
  }
  return best?.key;
}
