# Encuesta de satisfacción

Tickets → Pulso del servicio (administración). Desde su instalación, cada transición a cerrado crea una invitación única. No se generan evaluaciones para cierres históricos ni se inventan asignaciones. Responsable, área y folio quedan fijados al cierre. Casos sin responsable no entran a una clasificación individual.

El cliente abre `/orion/encuesta#TOKEN`, sin iniciar sesión. Token aleatorio con vigencia de 30 días. La API pública solo revela folio, nombre del especialista y si se contestó. La respuesta se guarda atómicamente, sin edición ni duplicados. Solo administración puede leer la tabla; WhatsApp usa secretos del servidor.

## Preguntas e indicadores
1. Satisfacción, 1–5. CSAT = calificaciones 4–5 / respuestas × 100.
2. Rapidez, 1–5. Media de percepción; no equivale al SLA.
3. Resolución total / parcial / no resuelta. Totalmente / respuestas × 100; no equivale a resolución en primera visita.
4. Claridad, 1–5 o No aplica. Media sin los No aplica.
5. Prioridad de mejora: rapidez, solución, claridad, trato, seguimiento, nada u otro. Distribución de selección única.
Comentario opcional de hasta 1000 caracteres. Participación = respuestas / invitaciones creadas, incluso las aún no enviadas.

El periodo agrupa por creación al cierre, no fecha de respuesta. Radar: medias × 20 y resolución porcentual. Sin datos no se dibuja polígono completo. No hay índice compuesto. Clasificación descriptiva por CSAT dentro del área con cinco respuestas como mínimo; empate comparte puesto. Los reconocimientos por rapidez, claridad y resolución usan la mayor métrica entre especialistas elegibles. Claridad exige cinco respuestas aplicables. No hay ajuste por complejidad ni se presenta el umbral como garantía estadística. Los casos parciales/no resueltos aparecen para seguimiento, sin modificar tickets.

## Envío
Plantilla `orion_encuesta_servicio_v1`, es_MX, UTILITY; folio y enlace son parámetros del servidor. Aprobada en Meta al 3 de octubre de 2026. `ticket-survey-send` valida JWT y rol admin aunque gateway verify_jwt=false. Configuración TICKET_WA_* compartida con el panel previo.

El cierre crea la invitación y la pone en la cola automática si el ticket tiene teléfono. Administración puede copiar el enlace. Los controles manuales de envío están ocultos; el envío se realiza con las acciones del ticket. Cada invitación admite un intento mediante reserva atómica; sin reintentos ante errores o timeout. Usuario y consentimiento se auditan. accepted significa aceptación de Meta, no entrega. No se conectó un webhook de entrega. La cola automática comparte la reserva atómica con el envío manual para evitar duplicados.

## Pruebas
- `node supabase/tests/ticket_satisfaction.test.mjs`: trigger, snapshot, RLS, tokens, validación, caducidad y respuesta única.
- `node frontend/tests/ticket-satisfaction.test.mjs`: denominadores, No aplica, áreas y falta de responsable.
- `supabase/_local_archive/whatsapp-tests/node_modules/.bin/deno test --allow-env supabase/functions/ticket-survey-send/index.test.ts`: permisos, aprobación, consentimiento, concurrencia y timeout.
- Fixture `/orion/tests/fixtures/ticket-satisfaction.html`: datos ficticios y RPC simulado, sin envíos reales; no incluido en producción.

## Pruebas de extremo a extremo
Las invitaciones `is_test=true` no se vinculan a un ticket ni a un especialista. La política RLS las excluye del panel incluso si el cliente usa una versión anterior. La pantalla identifica su propósito de prueba. El 1 de octubre se creó una invitación de prueba para el destinatario autorizado +52 614 177 2897; los detalles y resultado del envío se conservan en la fila correspondiente, sin usarlos para evaluar personal.
