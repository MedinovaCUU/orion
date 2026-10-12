// ORION · the conversational brain. Claude answers free-form questions by calling Orion's tools (the same data
// functions the fixed intents use, always executed AS the linked user so RLS applies). Alexa waits ~8 s: the
// caller races this promise against its deadline and, when it loses, lets the same promise finish in the
// background (EdgeRuntime.waitUntil) and stores the answer for "¿qué encontraste?".
import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";

export const AGENT_MODEL = Deno.env.get("ORION_CLAUDE_MODEL") ?? "claude-opus-5-5";
const API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
export const agentEnabled = () => API_KEY !== "";
const client = API_KEY ? new Anthropic({ apiKey: API_KEY, maxRetries: 1, timeout: 25_000 }) : null;

export interface AgentTool {
  name: string;
  description: string;
  input_schema: Anthropic.Tool["input_schema"];
  run: (input: Record<string, unknown>) => Promise<unknown>;
}

const SYSTEM = `Eres ORION, el asistente de voz de servicio técnico de Biosystems México (marca Medinova). Hablas por Alexa con ingenieros de servicio, químicos de aplicaciones, coordinadores y dirección.

Contexto del negocio:
- Biosystems instala y da servicio a analizadores de química clínica: BA400 y BA200 (automatizados) y A15/A25. Orion es su plataforma: Monitoreo de equipos (alarmas, estado, eventos BPL: blancos de reactivo, calibraciones, controles con reglas de Westgard, curvas de reacción), DRI (motor de diagnóstico diferencial que separa causas de hardware, reactivo/lote, calibración y control), inteligencia de lotes (IFU y certificados de análisis por lote desde einfo.bio), tickets de servicio con SLA y la planeación semanal de ingenieros.
- Regla de contraste del dueño del DRI: si una prueba falla pero otras que comparten el mismo factor (por ejemplo la misma longitud de onda, el brazo R2 o el mismo lote) salen bien, ese factor pierde peso, pero no se descarta: una falla parcial puede afectar solo a algunas pruebas, y solo una prueba directa (Photometry, línea base, bombas, temperatura) lo confirma o lo descarta. Sin esa prueba, no digas que una causa es segura.

Cómo respondes (se escucha, no se lee):
- Español de México, natural y breve: dos o tres frases, máximo unas 60 palabras, salvo que te pidan detalle.
- Habla como un colega de servicio, no como un reporte: frases completas y naturales.
- No leas códigos de alarma ni siglas: di "colisión en el brazo de reactivo 1" (no "203" ni "DR1 Collision Detected"); "control de calidad" (no "QC"); "el inserto" (no "IFU"); "hoja de datos" (no "valuesheet"); "el sistema del laboratorio" (no "LIS"); "los controles del equipo" (no "BPL"). Las partes por su nombre: brazo de reactivo 1 y 2, brazo de muestra, rotor de reactivos, rotor de reacciones.
- Explica las reglas de Westgard en palabras ("quedó a más de 3 desviaciones estándar de la media"), nunca "1 3 s".
- Las probabilidades del DRI son certeza: "con 60 por ciento de certeza". Si sugieres correr una prueba, di por qué (qué factor comparte con la que falla y qué significaría que salga bien o mal).
- Sin markdown, viñetas, emojis, tablas ni URLs. No leas identificadores largos: un equipo se nombra por modelo y los cuatro últimos dígitos de su serie, separados por espacios ("el BA400 terminación 0 4 7 3").
- Primero la respuesta, después el porqué en una frase. Si hay un siguiente paso útil, ofrécelo como pregunta corta.

Reglas de datos:
- Usa SIEMPRE las herramientas para cualquier dato de equipos, tickets, controles, lotes o diagnósticos. Nunca inventes cifras, fechas, alarmas ni nombres. Si una herramienta no devuelve datos, dilo con naturalidad.
- Las herramientas ya respetan los permisos del usuario: si algo no aparece, puede ser que no tenga acceso; no lo adivines.
- Nunca menciones ni pronuncies resultados de pacientes. Solo blancos, calibradores y controles.
- No das consejo médico ni interpretas resultados clínicos: tu terreno es el diagnóstico técnico del equipo y del reactivo.
- Las acciones (abrir ticket, pedir refacción, borrador de reporte de servicio) solo crean un borrador pendiente que el usuario confirma en Orion. Dilo así: "dejé el borrador listo para que lo confirmes en Orion".
- Cuando el diagnóstico tenga varias hipótesis cercanas, propone la prueba o verificación que más las separa.`;

export interface AgentResult {
  text: string;
  toolsUsed: string[];
}

function textOf(m: Anthropic.Beta.BetaMessage | Anthropic.Message): string {
  return (m.content as Array<{ type: string; text?: string }>).filter((b) => b.type === "text").map((b) => b.text ?? "").join(" ").trim();
}

/** Speakable: strip markdown/symbols a model may still emit. */
export function speakable(t: string): string {
  return t
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_#`>|]/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Runs the tool loop until Claude answers. `history` carries the previous voice turns of this Alexa session
 * (question/answer pairs) so follow-ups like "¿y el de Monterrey?" keep their context.
 */
export async function runAgent(opts: {
  question: string;
  context: string;
  tools: AgentTool[];
  history?: Array<{ q: string; a: string }>;
}): Promise<AgentResult> {
  if (!client) throw new Error("ANTHROPIC_API_KEY not configured");
  const toolDefs: Anthropic.Tool[] = opts.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
  const byName = new Map(opts.tools.map((t) => [t.name, t]));
  const messages: Anthropic.MessageParam[] = [
    ...(opts.history ?? []).slice(-4).flatMap((h): Anthropic.MessageParam[] => [
      { role: "user", content: h.q },
      { role: "assistant", content: h.a },
    ]),
    { role: "user", content: `${opts.context}\n\nPregunta (dicha en voz): ${opts.question}` },
  ];
  const toolsUsed: string[] = [];
  for (let round = 0; round < 6; round++) {
    const params = {
      model: AGENT_MODEL,
      max_tokens: 2000,
      // Frozen system prompt first so it is cached across every Alexa request.
      system: [{ type: "text" as const, text: SYSTEM, cache_control: { type: "ephemeral" as const } }],
      tools: toolDefs,
      messages,
      output_config: { effort: "low" as const },
      // On a safety decline, Anthropic re-runs the request on its recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    };
    const res = await client.beta.messages.create(params as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming);
    if (res.stop_reason === "refusal") return { text: "Eso no lo puedo responder. Pregúntame por equipos, tickets, controles o diagnósticos.", toolsUsed };
    messages.push({ role: "assistant", content: res.content as Anthropic.MessageParam["content"] });
    if (res.stop_reason === "max_tokens") return { text: speakable(textOf(res)) || "Se me cortó la respuesta. ¿Me lo preguntas de forma más concreta?", toolsUsed };
    if (res.stop_reason !== "tool_use") return { text: speakable(textOf(res)), toolsUsed };
    const uses = (res.content as Array<{ type: string; id?: string; name?: string; input?: unknown }>).filter((b) => b.type === "tool_use");
    // Parallel tool calls: run together, return every result in ONE user message.
    const results = await Promise.all(
      uses.map(async (u): Promise<Anthropic.ToolResultBlockParam> => {
        const tool = byName.get(u.name ?? "");
        toolsUsed.push(u.name ?? "?");
        if (!tool) return { type: "tool_result", tool_use_id: u.id!, content: "Herramienta desconocida", is_error: true };
        try {
          const out = await tool.run((u.input ?? {}) as Record<string, unknown>);
          return { type: "tool_result", tool_use_id: u.id!, content: JSON.stringify(out ?? null).slice(0, 12_000) };
        } catch (e) {
          return { type: "tool_result", tool_use_id: u.id!, content: `Error: ${(e as Error).message}`.slice(0, 500), is_error: true };
        }
      }),
    );
    messages.push({ role: "user", content: results });
  }
  return { text: "Necesito más pasos de los que caben en una respuesta de voz. Revísalo en Orion o pregúntame algo más concreto.", toolsUsed };
}
