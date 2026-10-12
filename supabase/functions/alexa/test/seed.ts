// TEST ONLY: deterministic Orion data for the Alexa end-to-end test (throwaway DB from test/setup-db.sh).
import postgres from "npm:postgres@3.4.9";
import { buildBplDemoRows } from "../../../../frontend/tests/fixtures/bplDemoData.mjs";

export const DB_URL = Deno.env.get("ORION_ALEXA_TEST_DB") ?? "postgres://postgres:postgres@127.0.0.1:54399/postgres";
export const IDS = {
  admin: "a0000000-0000-4000-8000-000000000001",
  tecnico: "a0000000-0000-4000-8000-000000000002",
  cliente: "a0000000-0000-4000-8000-000000000003",
  otro: "a0000000-0000-4000-8000-000000000004",
  quimico: "a0000000-0000-4000-8000-000000000005",
  gobierno: "a0000000-0000-4000-8000-000000000006",
};
export const DEVICES = { admin: "amzn1.ask.account.TEST-ADMIN", tecnico: "amzn1.ask.account.TEST-TECNICO", cliente: "amzn1.ask.account.TEST-CLIENTE", nuevo: "amzn1.ask.account.TEST-NUEVO" };
export const SERIAL_FATAL = "834009999";
export const SERIAL_CDMX = "834000473";
export const TICKETS = { falcon: "b0000000-0000-4000-8000-000000000001", vencido: "b0000000-0000-4000-8000-000000000002", ajeno: "b0000000-0000-4000-8000-000000000003", plan: "b0000000-0000-4000-8000-000000000004", previo: "b0000000-0000-4000-8000-000000000005", planHoy: "b0000000-0000-4000-8000-000000000006" };

export async function seed() {
  const sql = postgres(DB_URL, { prepare: false, max: 1, onnotice: () => {} });
  const h = (n: number) => new Date(Date.now() - n * 3.6e6).toISOString();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  const plusDays = (d: number) => new Date(Date.now() + d * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  try {
    await sql.begin(async (tx) => {
      await tx`delete from public.alexa_links; delete from public.alexa_alerts; delete from public.alexa_voice_cases; delete from public.alexa_pending_actions; delete from public.alexa_answers; delete from public.alexa_link_codes`.simple();
      // Cases opened by voice in earlier runs, plus everything the case-write tests leave behind.
      const voiceTickets = (await tx`select id from public.tickets where descripcion like '%Canal: Alexa%' and user_id = any(${Object.values(IDS)})`).map((r) => r.id as string);
      const allTickets = [...Object.values(TICKETS), ...voiceTickets];
      await tx`delete from public.ticket_whatsapp_outbox where ticket_id = any(${allTickets})`;
      await tx`delete from public.ticket_satisfaction where ticket_id = any(${allTickets})`;
      await tx`delete from public.ticket_service_events where ticket_id = any(${allTickets})`;
      await tx`delete from public.ticket_bitacora where ticket_id = any(${allTickets})`;
      await tx`delete from public.ticket_assignments where ticket_id = any(${allTickets})`;
      await tx`delete from public.tickets where id = any(${voiceTickets})`;
      await tx`delete from public.user_module_permissions where user_id = any(${Object.values(IDS)})`;
      // The ranking's government team lives in its own table (20261011040000); tests add members when they need them.
      await tx`delete from public.ticket_government_team where user_id = any(${Object.values(IDS)})`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: IDS.admin, role: "authenticated" })}, true), set_config('request.jwt.claim.sub', ${IDS.admin}, true)`;
      await tx`delete from public.ticket_staff_coverage where user_id = any(${Object.values(IDS)})`;
      await tx`select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true)`;
      // Orion numbers cases per day (max 99); the throwaway DB re-creates them on every run.
      await tx`delete from public.tickets where id = any(${Object.values(TICKETS)})`;
      await tx`delete from public.ticket_case_daily_counters`;
      await tx`delete from public.ticket_bitacora where ticket_id = any(${Object.values(TICKETS)})`;
      await tx`delete from public.tickets where id = any(${Object.values(TICKETS)})`;
      await tx`delete from public.ba400_bpl_events where effective_equipment_serial = ${SERIAL_FATAL}`;
      await tx`delete from public.monitoreo_errores_equipos where numero_serie in (${SERIAL_FATAL}, ${SERIAL_CDMX})`;
      await tx`delete from public.estado_errores_equipo_actual where numero_serie in (${SERIAL_FATAL}, ${SERIAL_CDMX})`;
      await tx`delete from public.equipos where id in ('alexa-test-1', 'alexa-test-2')`;
      await tx`delete from public.clientes where id in (90001, 90002)`;
      for (const [k, id] of Object.entries(IDS)) {
        await tx`insert into auth.users (id, email, aud, role, instance_id) values (${id}, ${`${k}@orion.test`}, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000') on conflict (id) do nothing`;
      }
      const people: Array<[string, string, string]> = [[IDS.admin, "Ricardo Montañez", "admin"], [IDS.tecnico, "Juan Pérez", "tecnico"], [IDS.cliente, "Cliente Demo", "cliente"], [IDS.otro, "Otra Persona", "tecnico"], [IDS.quimico, "Ricardo Vilchis", "tecnico"], [IDS.gobierno, "Luis Angel Pérez", "tecnico"]];
      for (const [id, name, rol] of people) {
        await tx`insert into public.profiles (id, nombre_completo, rol) values (${id}, ${name}, ${rol}::user_role) on conflict (id) do update set nombre_completo = excluded.nombre_completo, rol = excluded.rol`;
      }
      await tx`insert into public.clientes (id, razon_social) values (90001, 'LABORATORIO FALCON MONTERREY SA DE CV'), (90002, 'HOSPITAL ANGELES DEL PEDREGAL SA DE CV')`;
      await tx`insert into public.equipos (id, numero_serie, modelo, cliente_id, pais, estado, ciudad) values
        ('alexa-test-1', ${SERIAL_FATAL}, 'BA400', 90001, 'México', 'Nuevo León', 'Monterrey'),
        ('alexa-test-2', ${SERIAL_CDMX}, 'BA400', 90002, 'México', 'Ciudad de México', 'Ciudad de México')`;
      await tx`insert into public.estado_errores_equipo_actual (numero_serie, modelo, monitor_name, estado_actual, tipo_mensaje, codigos_error, errores_activos, error_principal_codigo, error_principal_descripcion, error_principal_seccion, activo_desde, last_event_at, codigo_estado, descripcion_estado, updated_at) values
        (${SERIAL_FATAL}, 'BA400', 'test', 'fatal', 'fatal', ${["100"]}, ${tx.json([{ codigo_error: "100", descripcion_error: "BR1 Vertical Home Error", seccion_error: "ANALYZER" }])}, '100', 'BR1 Vertical Home Error', 'ANALYZER', ${h(2)}, ${h(0.2)}, '100', 'BR1 Vertical Home Error', now()),
        (${SERIAL_CDMX}, 'BA400', 'test', 'ok', 'ok', ${[]}, ${tx.json([])}, null, null, null, null, ${h(1)}, 'OK_000', 'Sin alarmas', now())`;
      await tx`update public.estado_errores_equipo_actual set payload = '{}'::jsonb where numero_serie in (${SERIAL_FATAL}, ${SERIAL_CDMX}) and payload is null`;
      const alarms = [[1, "100", "BR1 Vertical Home Error", "fatal"], [2, "100", "BR1 Vertical Home Error", "fatal"], [5, "301", "RR1 Fridge Temperature Alarm", "warning"], [30, "100", "BR1 Vertical Home Error", "fatal"]] as const;
      for (const [i, [hours, code, desc, type]] of alarms.entries()) {
        await tx`insert into public.monitoreo_errores_equipos (numero_serie, modelo, codigo_error, descripcion_error, seccion_error, tipo_mensaje, detected_at, monitor_name, source_file, source_basename, line_number, byte_offset_start, byte_offset_end, raw_line, line_hash, payload)
          values (${SERIAL_FATAL}, 'BA400', ${code}, ${desc}, 'ANALYZER', ${type}, ${h(hours)}, 'test', 'test.log', 'test.log', ${i}, 0, 0, ${`E:${code}`}, ${`alexa-test-${i}`}, ${tx.json({})})`;
      }
      const { statusRows, curveRows } = buildBplDemoRows({ serial: SERIAL_FATAL, now: new Date(), marker: { alexa_test: true } });
      for (const r of [...statusRows, ...curveRows] as Array<Record<string, unknown>>) {
        await tx`insert into public.ba400_bpl_events ${tx({ ...r, payload: tx.json(r.payload as never) } as never)}`;
      }
      // Falcon CDMX case assigned to the technician: 24 h SLA, created 20 h ago → 4 h left (warning).
      await tx`insert into public.tickets (id, user_id, asunto, descripcion, numero_serie_equipo, creado_en, estado) values
        (${TICKETS.falcon}, ${IDS.admin}, '[Soporte Ingeniero] [FALCON] Equipo no enciende la lámpara', 'Canal: FALCON\nLocalidad: Ciudad de México\n\nLa lámpara no enciende desde el arranque de la mañana.', ${SERIAL_CDMX}, ${h(20)}, 'abierto'),
        (${TICKETS.vencido}, ${IDS.tecnico}, '[Soporte Químico] Controles de glucosa fuera', 'Cliente/Institución: Laboratorio Falcon Monterrey', ${SERIAL_FATAL}, ${h(50)}, 'en_progreso'),
        (${TICKETS.ajeno}, ${IDS.otro}, '[Soporte Ingeniero] Caso de otra persona', 'Localidad: Guadalajara', null, ${h(3)}, 'abierto'),
        (${TICKETS.plan}, ${IDS.otro}, '[PLAN] PREVENTIVO - BA400 - MONTERREY', ${`Cliente/Localidad: Laboratorio Falcon Monterrey\nObservaciones: demo\n\n[METADATA_PLANEACION] ${JSON.stringify({ service_type: "preventivo", ingeniero_csv: "Otra Persona / Juan Pérez", companions_csv: [], week_start: plusDays(-1), week_end: plusDays(3), fecha_tentativa: "" })}`}, ${SERIAL_FATAL}, ${h(72)}, 'abierto')`;
      await tx`insert into public.ticket_assignments (ticket_id, assigned_to, assigned_by, source) values (${TICKETS.falcon}, ${IDS.tecnico}, ${IDS.admin}, 'manual')`;
      await tx`update public.tickets set nombre_cliente_guest = 'Dra. Laura Gómez', telefono_cliente_guest = '5512345678' where id = ${TICKETS.falcon}`;
      // After the cases exist (so Orion's routing does not reassign them): who may receive cases.
      await tx`insert into public.user_module_permissions (user_id, modules, can_receive_tickets) values (${IDS.tecnico}, ${["tickets"]}, true), (${IDS.admin}, ${["tickets"]}, true), (${IDS.quimico}, ${["tickets"]}, true) on conflict (user_id) do update set modules = excluded.modules, can_receive_tickets = excluded.can_receive_tickets`;
      // Teams as Orion reads them (employee type): engineering and chemistry, with two Ricardos on purpose.
      await tx`update public.profiles set employee_type = case id when ${IDS.admin}::uuid then 'Ingeniero de servicio' when ${IDS.tecnico}::uuid then 'Químico' when ${IDS.quimico}::uuid then 'Químico' when ${IDS.gobierno}::uuid then 'Químico' end where id in (${IDS.admin}, ${IDS.tecnico}, ${IDS.quimico}, ${IDS.gobierno})`;
      await tx`insert into public.alexa_links (alexa_user_id, user_id) values (${DEVICES.admin}, ${IDS.admin}), (${DEVICES.tecnico}, ${IDS.tecnico}), (${DEVICES.cliente}, ${IDS.cliente})`;
      await tx`insert into public.alexa_alerts (user_id, kind, severity, dedupe_key, serial, title, speech) values (${IDS.tecnico}, 'sla', 'critical', 'test-sla', ${SERIAL_CDMX}, 'SLA Falcon', 'El caso Falcon de Hospital Angeles vence en 4 horas.')`;
      void today;
    });
  } finally {
    await sql.end();
  }
}

if (import.meta.main) {
  await seed();
  console.log("seeded");
}
