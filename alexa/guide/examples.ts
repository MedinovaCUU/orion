// ORION · captures REAL conversations for the voice guide (alexa/guide/build.mjs renders them).
//   supabase/functions/alexa/test/setup-db.sh
//   deno run -A --no-lock --node-modules-dir=none alexa/guide/examples.ts
// Runs the deployed skill code against the throwaway DB with demo clients, so every phrase and answer in the PDF is
// exactly what Orion says today. Writes alexa/guide/examples.json.
import { DB_URL, DEVICES, IDS, seed, TICKETS } from "../../supabase/functions/alexa/test/seed.ts";

Deno.env.set("ALEXA_NO_SERVE", "1");
Deno.env.set("ALEXA_SKIP_VERIFY", "1");
Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
Deno.env.set("SUPABASE_DB_URL", DB_URL);
Deno.env.delete("ANTHROPIC_API_KEY");
const { handler } = await import("../../supabase/functions/alexa/index.ts");
const { sql } = await import("../../supabase/functions/alexa/db.ts");

await seed();
// Demo identities for a document that may be shared: no real customer names.
await sql`update public.clientes set razon_social = 'LABORATORIO DEMO NORTE SA DE CV' where id = 90001`;
await sql`update public.clientes set razon_social = 'LABORATORIO DEMO CENTRO SA DE CV' where id = 90002`;
await sql`update public.tickets set descripcion = replace(descripcion, 'Laboratorio Falcon Monterrey', 'Laboratorio Demo Norte') where descripcion like '%Falcon Monterrey%'`;
await sql`update public.tickets set asunto = '[Soporte Ingeniero] Ruido en el brazo de muestra' where asunto like '%Caso de otra persona%'`;
await sql`update public.alexa_alerts set speech = 'El caso de Falcon del Laboratorio Demo Centro vence en 4 horas.', title = 'SLA Falcon · Laboratorio Demo Centro'`;

/** Spoken SSML → what a reader expects to see written. */
const printable = (ssml: string) =>
  ssml
    .replace(/<\/?speak>/g, "")
    .replace(/<phoneme[^>]*>([^<]*)<\/phoneme>/g, "$1")
    .replace(/<say-as interpret-as="(digits|characters)">([^<]*)<\/say-as>/g, "$2")
    .replace(/<break[^>]*\/>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\bB A (\d{3})\b/g, "BA$1")
    .replace(/\bA L T\b/g, "ALT")
    .replace(/\bA S T\b/g, "AST")
    .replace(/\s{2,}/g, " ")
    .trim();

let attrs: Record<string, unknown> = {};
async function turn(device: string, user: string, req: Record<string, unknown>, isNew = false) {
  const body = {
    version: "1.0",
    session: { new: isNew, sessionId: "guide", application: { applicationId: "guide" }, user: { userId: device }, attributes: attrs },
    context: { System: { application: { applicationId: "guide" }, user: { userId: device }, device: { supportedInterfaces: { "Alexa.Presentation.APL": { runtime: { maxVersion: "2023.2" } } } } } },
    request: { requestId: crypto.randomUUID(), timestamp: new Date().toISOString(), locale: "es-MX", ...req },
  };
  const res = await (await handler(new Request("http://guide/", { method: "POST", body: JSON.stringify(body) }))).json();
  attrs = res.sessionAttributes ?? {};
  const screen = (res.response?.directives ?? []).find((d: { type: string }) => d.type === "Alexa.Presentation.APL.RenderDocument")?.datasources?.s ?? null;
  return { user, orion: printable(String(res.response?.outputSpeech?.ssml ?? "")), screen };
}
const intent = (name: string, slots: Record<string, string> = {}) => ({ type: "IntentRequest", intent: { name, slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, { name: k, value: v }])) } });
const T = DEVICES.tecnico, A = DEVICES.admin;
const out: Record<string, Array<{ user: string; orion: string; screen: unknown }>> = {};
const dialog = async (name: string, steps: Array<[string, string, Record<string, unknown>, boolean?]>, reset: boolean | Record<string, unknown> = true) => {
  if (reset) attrs = reset === true ? {} : { ...reset };
  out[name] = [];
  for (const [device, user, req, isNew] of steps) out[name]!.push(await turn(device, user, req, isNew));
};

await dialog("vincular", [[DEVICES.nuevo, "Alexa, abre servicio orión", { type: "LaunchRequest" }, true]]);
await dialog("abrir", [[T, "Alexa, abre servicio orión", { type: "LaunchRequest" }, true]]);
await dialog("resumen", [[A, "cómo vamos", intent("ResumenIntent")]]);
await dialog("casos", [
  [T, "qué tengo hoy", intent("MiDiaIntent")],
  [T, "sí", intent("AMAZON.YesIntent")],
  [T, "cómo vamos con el reporte", intent("TicketDetalleIntent")],
  [T, "cero cuatro siete tres", intent("TicketDetalleIntent", { serie: "0473" })],
]);
// ── Cases: queries ──
await dialog("filtros", [
  [T, "cuántos casos tengo", intent("ContarCasosIntent")],
  [A, "casos de Monterrey", intent("CasosFiltroIntent", { filtro: "monterrey" })],
  [T, "casos sin respuesta", intent("CasosFiltroIntent", { condicion: "sin respuesta" })],
]);
const onCdmx = { ticketId: TICKETS.falcon };
await dialog("detalleCaso", [
  [T, "de qué se trata el caso", intent("CasoDescripcionIntent")],
  [T, "quién reportó el caso", intent("CasoContactoIntent")],
], onCdmx);
// ── Cases: writes (sí / no / borrador; first response and closure also «confirmo») ──
await dialog("avance", [
  [T, "agrega un avance cambié la lámpara y pásalo a pendiente por piezas", intent("AvanceIntent", { texto: "cambié la lámpara y pásalo a pendiente por piezas" })],
  [T, "sí", intent("AMAZON.YesIntent")],
  [T, "léeme la bitácora", intent("CasoBitacoraIntent")],
], onCdmx);
await dialog("borrador", [
  [T, "registra una llamada el cliente confirma que ya enciende", intent("LlamadaIntent", { texto: "el cliente confirma que ya enciende" })],
  [T, "borrador", intent("BorradorIntent")],
], onCdmx);
await dialog("respuesta", [
  [T, "registra la respuesta al cliente le expliqué que mañana vamos a primera hora", intent("RespuestaClienteIntent", { texto: "le expliqué que mañana vamos a primera hora" })],
  [T, "sí", intent("AMAZON.YesIntent")],
  [T, "confirmo", intent("ConfirmoIntent")],
], onCdmx);
await dialog("cerrar", [
  [T, "cierra el caso", intent("CerrarCasoIntent")],
  [T, "solucionado", intent("CerrarCasoIntent", { razon: "solucionado" })],
  [T, "solución cambié la lámpara y calibré glucosa", intent("DetalleIntent", { texto: "cambié la lámpara y calibré glucosa" })],
  [T, "sí", intent("AMAZON.YesIntent")],
  [T, "confirmo", intent("ConfirmoIntent")],
], onCdmx);
await dialog("historial", [
  [T, "historial del cero cuatro siete tres", intent("HistorialEquipoIntent", { serie: "0473" })],
  [T, "cuántos casos cerré esta semana", intent("MisCierresIntent")],
]);
// A demo chemist with the same first name as the administrator, to show how the case's area picks the person.
await sql`update public.profiles set nombre_completo = 'Ricardo Ruiz' where id = ${IDS.quimico}`;
await dialog("adminVer", [
  [A, "casos sin asignar", intent("CasosFiltroIntent", { condicion: "sin asignar" })],
  [A, "sí", intent("AMAZON.YesIntent")],
  [A, "Ricardo Ruiz", intent("AsignarCasoIntent", { persona: "ricardo ruiz" })],
  [A, "sí", intent("AMAZON.YesIntent")],
]);
await dialog("asignar", [
  [A, "asigna el caso a Juan", intent("AsignarCasoIntent", { persona: "juan" })],
  [A, "sí", intent("AMAZON.YesIntent")],
], { ticketId: TICKETS.vencido });
await dialog("equipo", [[T, "cómo está el nueve nueve nueve nueve", intent("EquipoIntent", { serie: "9999" })]]);
await dialog("alarmas", [
  [T, "qué alarmas tiene el nueve nueve nueve nueve", intent("AlarmasIntent", { serie: "9999" })],
  [T, "qué significa la alarma doscientos tres", intent("AlarmaInfoIntent", { codigo: "203" })],
]);
await dialog("controles", [
  [T, "pasaron los controles del nueve nueve nueve nueve", intent("ControlesIntent", { serie: "9999" })],
  [T, "cuándo se calibró glucosa", intent("CalibracionIntent", { prueba: "glucosa" })],
  [T, "muéstrame la curva de reacción de glucosa", intent("CurvaIntent", { prueba: "glucosa" })],
]);
await dialog("diagnostico", [
  [T, "cómo está el nueve nueve nueve nueve", intent("EquipoIntent", { serie: "9999" })],
  [T, "sí", intent("AMAZON.YesIntent")],
  [T, "colesterol, triglicéridos y ácido úrico salen bien", intent("PruebasBienIntent", { pa: "colesterol", pb: "triglicéridos", pc: "ácido úrico" })],
  [T, "por qué", intent("PorQueIntent")],
]);
await dialog("guia", [
  [T, "guíame", intent("GuiaIntent")],
  [T, "sí", intent("AMAZON.YesIntent")],
  [T, "siguiente", intent("AMAZON.NextIntent")],
], false);
attrs = { ...attrs, proc: undefined };
await dialog("cierre", [[T, "ya quedó", intent("ResueltoIntent")]], false);
await dialog("inserto", [
  [T, "cuánto dura colesterol a bordo", intent("EstabilidadIntent", { prueba: "colesterol" })],
  [T, "qué interfiere con glucosa", intent("InterferenciasIntent", { prueba: "glucosa" })],
  [T, "qué lotes de glucosa hay", intent("LoteIntent", { prueba: "glucosa" })],
]);
await dialog("borradores", [
  [T, "cómo está el cero cuatro siete tres", intent("EquipoIntent", { serie: "0473" })],
  [T, "abre un ticket por alarma de temperatura del rotor", intent("AbrirTicketIntent", { motivo: "alarma de temperatura del rotor" })],
  [T, "sí", intent("AMAZON.YesIntent")],
  [T, "pide dos lámparas halógenas", intent("RefaccionIntent", { pieza: "dos lámparas halógenas" })],
  [T, "qué borradores tengo", intent("MisBorradoresIntent")],
]);
await dialog("dictado", [
  [T, "mis casos", intent("MisTicketsIntent")],
  [T, "el segundo", intent("TicketDetalleIntent", { ordinal: "2" })],
  [T, "sí", intent("AMAZON.YesIntent")],
  [T, "anota cambié la lámpara y calibré glucosa", intent("AnotaIntent", { texto: "cambié la lámpara y calibré glucosa" })],
  [T, "es todo", intent("FinDictadoIntent")],
  [T, "sí", intent("AMAZON.YesIntent")],
]);
await dialog("avisos", [
  [T, "qué avisos tengo", intent("AvisosIntent")],
  [T, "enterado", intent("AcuseIntent")],
  [T, "activa los avisos", intent("ActivarAvisosIntent")],
]);
await dialog("ayuda", [[T, "ayuda", intent("AMAZON.HelpIntent")]]);

const target = new URL("./examples.json", import.meta.url);
await Deno.writeTextFile(target, JSON.stringify({ generatedAt: new Date().toISOString(), dialogs: out }, null, 2));
await sql.end();
console.log("examples:", Object.entries(out).map(([k, v]) => `${k}(${v.length})`).join(" "));
