// deno test -A --no-lock --node-modules-dir=none supabase/functions/alexa-notify/notify.test.ts  (after alexa/test/setup-db.sh)
import { assert, assertEquals } from "jsr:@std/assert@1";
import { DB_URL, DEVICES, IDS, seed, SERIAL_FATAL, TICKETS } from "../alexa/test/seed.ts";

Deno.env.set("ALEXA_NO_SERVE", "1");
Deno.env.set("SUPABASE_DB_URL", DB_URL);
const { runNotifier } = await import("./index.ts");
const { sql } = await import("../alexa/db.ts");

Deno.test("notifier: Amazon's reviewer gets the demo story's alerts once a day, never Orion's", async () => {
  await seed();
  const reviewer = { id: "a0000000-0000-4000-8000-0000000000ff", email: "revision.alexa@biosystems.com.mx", device: "amzn1.ask.account.TEST-REVISOR" };
  await sql`insert into auth.users (id, email, aud, role, instance_id) values (${reviewer.id}, ${reviewer.email}, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000') on conflict (id) do nothing`;
  await sql`insert into public.profiles (id, nombre_completo, rol) values (${reviewer.id}, 'Revisión Alexa', 'cliente') on conflict (id) do update set rol = 'cliente'`;
  await sql`insert into public.alexa_reviewers (email) values (${reviewer.email}) on conflict do nothing`;
  await sql`delete from public.alexa_alerts`;
  await sql`insert into public.alexa_links (alexa_user_id, user_id, notify) values (${reviewer.device}, ${reviewer.id}, true)`;
  const rung: string[] = [];
  await runNotifier({ send: async (device) => (rung.push(device), true), hour: 11 });
  const alerts = (await sql`select dedupe_key, speech, ticket_id from public.alexa_alerts where user_id = ${reviewer.id}`) as Array<{ dedupe_key: string; speech: string; ticket_id: string | null }>;
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  assert(alerts.length >= 2, JSON.stringify(alerts));
  assert(alerts.every((a) => a.dedupe_key.startsWith(`demo:${day}:`) && a.ticket_id === null), JSON.stringify(alerts));
  assert(alerts.some((a) => /Hospital Demo Centro|demo centro/i.test(a.speech)), JSON.stringify(alerts));
  assert(alerts.every((a) => !/Falcon Monterrey|Angeles|falcon monterrey|angeles/i.test(a.speech)), JSON.stringify(alerts));
  assert(rung.includes(reviewer.device));
  await sql`delete from public.alexa_links where user_id = ${reviewer.id}`;
});

Deno.test("notifier: SLA thresholds, fatal alarm on my equipment, follow-up, dedupe, quiet hours", async () => {
  await seed();
  await sql`delete from public.alexa_alerts`;
  await sql`insert into public.alexa_voice_cases (user_id, serial, equipment_model, hypotheses, follow_up_at) values (${IDS.tecnico}, ${SERIAL_FATAL}, 'BA400', ${sql.json([{ key: "hyp:control", title: "Sospecha de control / calibrador" }])}, now() - interval '1 hour')`;
  const rung: Array<[string, number]> = [];
  const send = async (device: string, count: number) => (rung.push([device, count]), true);
  const first = await runNotifier({ send, hour: 11 });
  assert(first.fresh >= 4, JSON.stringify(first));
  const alerts = await sql`select kind, severity, dedupe_key, speech from public.alexa_alerts where user_id = ${IDS.tecnico} order by dedupe_key`;
  const keys = alerts.map((a) => a.dedupe_key as string);
  assert(keys.includes(`sla:${TICKETS.falcon}:4h`), keys.join(","));
  assert(keys.includes(`sla:${TICKETS.vencido}:vencido`), keys.join(","));
  assert(keys.some((k) => k.startsWith(`fatal:${SERIAL_FATAL}`)), keys.join(","));
  assert(keys.some((k) => k.startsWith("seguimiento:")), keys.join(","));
  assert(!keys.includes(`sla:${TICKETS.ajeno}:vencido`));
  assert(alerts.find((a) => a.kind === "alarma")!.speech.includes("entró en alarma fatal: error de posición inicial vertical del brazo de reactivo 1"), alerts.find((a) => a.kind === "alarma")!.speech);
  assert(rung.some(([d]) => d === DEVICES.tecnico));
  // Same state again: nothing new, nobody rung.
  rung.length = 0;
  const second = await runNotifier({ send, hour: 11 });
  assertEquals(second.fresh, 0);
  assertEquals(rung.length, 0);
  // Quiet hours: a non-critical novelty is stored but does not ring.
  await sql`update public.alexa_voice_cases set follow_up_sent_at = null, follow_up_at = now() - interval '1 minute' where user_id = ${IDS.tecnico}`;
  await sql`delete from public.alexa_alerts where dedupe_key like 'seguimiento:%'`;
  await sql`update public.alexa_links set last_notified_at = null`;
  const night = await runNotifier({ send, hour: 23 });
  assert(night.fresh >= 1);
  assertEquals(rung.filter(([d]) => d === DEVICES.tecnico).length, 0);
});

Deno.test("notifier: a case newly assigned by someone else rings once for the assignee", async () => {
  await seed();
  await sql`delete from public.alexa_alerts`;
  await sql`insert into public.ticket_assignments (ticket_id, assigned_to, assigned_by, source) values (${TICKETS.vencido}, ${IDS.tecnico}, ${IDS.admin}, 'manual')`;
  const rung: string[] = [];
  const send = async (device: string) => (rung.push(device), true);
  await runNotifier({ send, hour: 11 });
  const [a] = await sql`select severity, speech from public.alexa_alerts where user_id = ${IDS.tecnico} and dedupe_key like ${`asignacion:${TICKETS.vencido}:%`}`;
  assert(a, "assignment alert stored");
  assertEquals(a.severity, "critical"); // the case is already past its deadline
  assert(String(a.speech).startsWith("Te asignaron un caso de Falcon: Laboratorio Falcon Monterrey, del B A 400 terminación 9 9 9 9. El motivo: Controles de glucosa fuera; ya venció"), String(a.speech));
  assert(rung.includes(DEVICES.tecnico));
  // The seed also assigned the Falcon case to the technician moments ago: two announcements, and none again.
  const [{ n }] = await sql`select count(*)::int as n from public.alexa_alerts where dedupe_key like 'asignacion:%'`;
  assertEquals(n, 2);
  rung.length = 0;
  assertEquals((await runNotifier({ send, hour: 11 })).fresh, 0);
});

Deno.test({ name: "close db", sanitizeResources: false, sanitizeOps: false, fn: async () => { await sql.end(); } });
