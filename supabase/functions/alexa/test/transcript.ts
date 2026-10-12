// TEST ONLY: prints a sample conversation against the seeded throwaway DB (review wording by ear).
//   deno run -A --no-lock --node-modules-dir=none supabase/functions/alexa/test/transcript.ts
import { DB_URL, DEVICES, seed, SERIAL_CDMX, SERIAL_FATAL } from "./seed.ts";
Deno.env.set("ALEXA_NO_SERVE", "1");
Deno.env.set("ALEXA_SKIP_VERIFY", "1");
Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
Deno.env.set("SUPABASE_DB_URL", DB_URL);
const { handler } = await import("../index.ts");
const { sql } = await import("../db.ts");
await seed();
let attrs: Record<string, unknown> = {};
async function turn(device: string, label: string, name: string, slots: Record<string, string> = {}) {
  const req = name === "LaunchRequest" ? { type: "LaunchRequest" } : { type: "IntentRequest", intent: { name, slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, { name: k, value: v }])) } };
  const body = { version: "1.0", session: { new: false, attributes: attrs, user: { userId: device }, application: { applicationId: "x" } }, context: { System: { user: { userId: device }, device: { supportedInterfaces: {} } } }, request: { requestId: "r", timestamp: new Date().toISOString(), locale: "es-MX", ...req } };
  const res = await (await handler(new Request("http://l/", { method: "POST", body: JSON.stringify(body) }))).json();
  attrs = res.sessionAttributes ?? {};
  console.log(`\n👤 ${label}\n🔵 ${String(res.response.outputSpeech.ssml).replace(/<\/?speak>/g, "").replace(/<say-as interpret-as="digits">(\d+)<\/say-as>/g, "[$1]").replace(/<say-as interpret-as="characters">([^<]+)<\/say-as>/g, "[$1]").replace(/<break[^>]*\/>/g, " … ")}`);
}
const T = DEVICES.tecnico, A = DEVICES.admin;
await turn(A, "Alexa, abre servicio orion", "LaunchRequest");
await turn(A, "cómo vamos", "ResumenIntent");
attrs = {};
await turn(T, "qué tengo hoy", "MiDiaIntent");
await turn(T, "sí", "AMAZON.YesIntent");
await turn(T, "cómo está el nueve nueve nueve nueve", "EquipoIntent", { serie: "9999" });
await turn(T, "sí", "AMAZON.YesIntent");
await turn(T, "colesterol triglicéridos y ácido úrico salen bien", "PruebasBienIntent", { pa: "colesterol", pb: "triglicéridos", pc: "ácido úrico" });
await turn(T, "por qué", "PorQueIntent");
await turn(T, "guíame", "GuiaIntent");
await turn(T, "sí", "AMAZON.YesIntent");
await turn(T, "no", "AMAZON.NoIntent");
await turn(T, "siguiente", "AMAZON.NextIntent");
await turn(T, "pasaron los controles", "ControlesIntent");
await turn(T, "cuándo se calibró glucosa", "CalibracionIntent", { prueba: "glucosa" });
await turn(T, "qué alarmas tiene", "AlarmasIntent");
await turn(T, "qué significa la alarma 203", "AlarmaInfoIntent", { codigo: "203" });
await turn(T, "estabilidad a bordo de colesterol", "IfuIntent", { prueba: "colesterol", dato: "estabilidad" });
await turn(T, "qué interfiere con glucosa", "IfuIntent", { prueba: "glucosa", dato: "interferencias" });
attrs = {};
await turn(T, "diagnostica el cero cuatro siete tres, glucosa fuera", "DiagnosticoIntent", { serie: SERIAL_CDMX.slice(-4), pa: "glucosa" });
await turn(T, "ya quedó", "ResueltoIntent");
await sql.end();
void SERIAL_FATAL;
