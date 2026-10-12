// The conversation Amazon's reviewer is asked to try (testing instructions), on the demo account, printed as text:
//   deno run -A --no-lock --node-modules-dir=none supabase/functions/alexa/test/reviewer-transcript.ts
import { DB_URL, seed } from "./seed.ts";

Deno.env.set("ALEXA_NO_SERVE", "1");
Deno.env.set("ALEXA_SKIP_VERIFY", "1");
Deno.env.set("SUPABASE_DB_URL", DB_URL);
Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
Deno.env.delete("ANTHROPIC_API_KEY");
const { handler } = await import("../index.ts");
const { sql } = await import("../db.ts");

const R = { id: "a0000000-0000-4000-8000-0000000000ff", email: "revision.alexa@biosystems.com.mx", device: "amzn1.ask.account.TEST-REVISOR" };
await seed();
await sql`insert into auth.users (id, email, aud, role, instance_id) values (${R.id}, ${R.email}, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000') on conflict (id) do nothing`;
await sql`insert into public.profiles (id, nombre_completo, rol) values (${R.id}, 'Revisión Alexa', 'cliente') on conflict (id) do update set rol = 'cliente'`;
await sql`insert into public.alexa_reviewers (email) values (${R.email}) on conflict do nothing`;
await sql`delete from public.alexa_links where alexa_user_id = ${R.device}`;

let attrs: Record<string, unknown> = {};
async function say(label: string, req: Record<string, unknown>) {
  const body = {
    version: "1.0",
    session: { new: req.type === "LaunchRequest", sessionId: "s1", application: { applicationId: "amzn1.ask.skill.test" }, user: { userId: R.device }, attributes: attrs },
    context: { System: { application: { applicationId: "amzn1.ask.skill.test" }, user: { userId: R.device }, device: { supportedInterfaces: { "Alexa.Presentation.APL": { runtime: { maxVersion: "2023.2" } } } } } },
    request: { requestId: crypto.randomUUID(), timestamp: new Date().toISOString(), locale: "es-MX", ...req },
  };
  const out = await (await handler(new Request("http://localhost/alexa", { method: "POST", body: JSON.stringify(body) }))).json();
  attrs = out.sessionAttributes ?? {};
  console.log(`\n» ${label}\n  ${String(out.response?.outputSpeech?.ssml ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ")}${out.response?.shouldEndSession ? "  [fin]" : ""}`);
}
const I = (name: string, slots: Record<string, string> = {}) => ({ type: "IntentRequest", intent: { name, confirmationStatus: "NONE", slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, { name: k, value: v }])) } });

await say("abre servicio orión (sin vincular)", { type: "LaunchRequest" });
const [code] = await sql`select code from public.alexa_link_codes where alexa_user_id = ${R.device}`;
await sql`insert into public.alexa_links (alexa_user_id, user_id) values (${R.device}, ${R.id})`;
console.log(`\n  (código ${code?.code} reclamado en Orion web por ${R.email})`);
await say("abre servicio orión", { type: "LaunchRequest" });
await say("cómo vamos", I("ResumenIntent"));
await say("qué tengo hoy", I("MiDiaIntent"));
await say("mis casos", I("MisTicketsIntent"));
await say("el primero", I("TicketDetalleIntent", { ordinal: "1" }));
await say("de qué se trata el caso", I("CasoDescripcionIntent"));
await say("quién reportó el caso", I("CasoContactoIntent"));
await say("léeme la bitácora", I("CasoBitacoraIntent"));
await say("agrega un avance se revisó la lámpara y está fundida", I("AvanceIntent", { texto: "se revisó la lámpara y está fundida" }));
await say("sí", I("AMAZON.YesIntent"));
await say("registra la respuesta al cliente le confirmé la visita de mañana", I("RespuestaClienteIntent", { texto: "le confirmé la visita de mañana" }));
await say("sí", I("AMAZON.YesIntent"));
await say("confirmo", I("ConfirmoIntent"));
await say("cómo está el nueve nueve nueve nueve", I("EquipoIntent", { serie: "9999" }));
await say("qué alarmas tiene el nueve nueve nueve nueve", I("AlarmasIntent", { serie: "9999" }));
await say("qué significa la alarma cien", I("AlarmaInfoIntent", { codigo: "100" }));
await say("pasaron los controles del nueve nueve nueve nueve", I("ControlesIntent", { serie: "9999" }));
await say("diagnostica el nueve nueve nueve nueve", I("DiagnosticoIntent", { serie: "9999" }));
await say("glucosa", I("DiagnosticoIntent", { serie: "9999", pa: "glucosa" }));
await say("por qué", I("PorQueIntent"));
await say("guíame", I("GuiaIntent"));
await say("cuánto dura glucosa a bordo", I("EstabilidadIntent", { prueba: "glucosa" }));
await say("historial del nueve nueve nueve nueve", I("HistorialEquipoIntent", { serie: "9999" }));
await say("activa los avisos", I("ActivarAvisosIntent"));
await say("qué avisos tengo", I("AvisosIntent"));
await say("ayuda", I("AMAZON.HelpIntent"));
await say("salir", I("AMAZON.StopIntent"));
await sql`delete from public.alexa_links where alexa_user_id = ${R.device}`;
await sql.end();
