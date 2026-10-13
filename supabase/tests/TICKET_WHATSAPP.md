# WhatsApp de Tickets

Tickets → WhatsApp → Enviar mensajes está disponible para administradores.
La función `ticket-whatsapp` valida la sesión con `auth.getUser()` y consulta el
rol real. Las claves `TICKET_WA_*` son secretos de Supabase; no se incluyen en Vite.
La integración es independiente del destinatario fijo de asesorías.

Opciones:
- Iniciar contacto: `orion_contacto_soporte_v1`, `es_MX`, categoría MARKETING.
- Texto libre: el operador confirma que el destinatario escribió en las últimas 24 horas.
  Meta aplica la ventana; Orion aún no registra mensajes entrantes ni estados de entrega.
- Aviso de cierre: `orion_cierre_ticket_v1`, `es_MX`, categoría UTILITY. El servidor
  exige un ticket cerrado y obtiene caso y serie de la base de datos.
  Es un envío manual; cerrar un ticket no genera mensajes automáticamente.

Para iniciar contacto se requiere aprobación de Meta y consentimiento del
destinatario. La aprobación no elimina los límites de calidad, entrega o pago de
Meta. `hello_world` no funciona desde este número real.

Se aceptan números internacionales con `+`, hasta 20 por grupo. Se normalizan y
deduplican antes del envío. Cada solicitud tiene una UUID, reservada en la tabla
`ticket_whatsapp_messages` antes de contactar a Meta. Repetir esa UUID devuelve el
resultado previo, sin reenviar. Los envíos con resultado incierto detienen el grupo.
No reintentar automáticamente solicitudes `sending` o `unknown`.

`accepted` significa que Meta aceptó la solicitud; no confirma entrega. El panel
expone esta distinción. La confirmación automática requiere un webhook con firma
verificada; el antiguo webhook de asesorías no se usa como prueba de entrega.

Comprobaciones:
```
node frontend/tests/ticket-whatsapp-model.test.mjs
PGLITE_MODULE=/ruta/a/pglite/dist/index.js node supabase/tests/ticket_whatsapp.test.mjs
deno test --allow-env supabase/functions/ticket-whatsapp/handler.test.ts
deno check supabase/functions/ticket-whatsapp/index.ts
```

La interfaz aislada está en `/orion/tests/fixtures/ticket-whatsapp.html` al ejecutar
Vite en desarrollo. Intercepta únicamente las llamadas de esta función y simula
resultados; no utiliza el token de Meta ni envía mensajes.


## Notificaciones automáticas (3 de octubre de 2026)
La tabla ticket_whatsapp_outbox registra recepción al crear un ticket, primera atención al insertar un evento respuesta, cierre y encuesta. Cada evento se registra una vez por ticket. Se excluyen importaciones [PLAN] y no se retroenvían históricos. Teléfono ausente o inválido queda visible sin enviar.

ticket-whatsapp-dispatch procesa hasta cinco pendientes cada minuto mediante pg_cron y pg_net. TICKET_WA_WORKER_SECRET coincide con ticket_wa_worker_secret de Vault, nunca expuesto al navegador. Solo plantillas aprobadas es_MX; pendientes se revisan cada 15 minutos hasta siete días. Fallos definitivos y resultados inciertos no se reintentan automáticamente. accepted significa aceptación por Meta, no entrega.

Los controles independientes de WhatsApp están ocultos por decisión de producto. Los eventos se envían desde el ciclo normal del ticket; la auditoría permanece en ticket_whatsapp_outbox. La encuesta comparte reserva atómica con el envío manual. La plantilla de primera atención orion_primera_respuesta_v1 se presentó por separado; recepción utiliza orion_ticket_recibido_v1.

Pruebas: node supabase/tests/ticket_whatsapp_automation.test.mjs y deno test --allow-env supabase/functions/ticket-whatsapp-dispatch/index.test.ts.


### País y captura de teléfono
El trigger ticket_whatsapp_country copia equipos.pais mediante la serie normalizada del ticket. El worker usa libphonenumber-js 1.13.14 para interpretar números nacionales según ese país y validar destinos internacionales explícitos. No presupone México cuando falta el país. Acepta +52, 52, el prefijo móvil mexicano antiguo +521 y diez dígitos nacionales, con espacios, paréntesis o guiones. Una entrada internacional explícita prevalece sobre el país del equipo. Extensiones, números inválidos y país ausente con teléfono nacional quedan sin enviar.

La interfaz conserva las acciones del ticket y coloca Pulso del servicio debajo de la operación. El panel de encuestas ya no incluye controles manuales de WhatsApp. Prueba adicional: deno test --node-modules-dir=auto --allow-env supabase/functions/ticket-whatsapp-dispatch/phone.test.ts.

### Portal público (13 de octubre de 2026)
Excepción a «no presupone México»: el portal público solo acepta celulares mexicanos de 10 dígitos, así que en tickets del portal (sin usuario, asunto «Soporte …: Reporte en equipo …») con equipo sin país, ticket_whatsapp_country guarda el destinatario como +52 y el mensaje sale. Los tickets internos conservan la regla anterior. El teléfono del ticket se queda como se capturó. Además, el portal solo acepta series registradas en equipos (migración 20261013010000), así que el país sale del equipo en casi todos los casos.
Prueba: PGLITE_MODULE=… node supabase/tests/public_portal_guards.test.mjs.

## Bandeja de entrada (13 de octubre de 2026)
Antes, lo que los clientes escribían al número de Orion solo quedaba en el log de `whatsapp-webhook` (función publicada sin código en el repo) y se perdía. Ahora:

- `whatsapp-webhook` (código en el repo, `verify_jwt = false`) verifica `X-Hub-Signature-256` con `WHATSAPP_APP_SECRET` (admite varias claves separadas por comas, una por app de Meta). Sin esa clave responde 503 y Meta reintenta durante días; firma inválida = 401. Guarda cada mensaje con `record_whatsapp_inbound` (idempotente por id de Meta) y los estados de entrega con `record_whatsapp_status` (solo avanzan: enviado → entregado → leído, o fallido). Fotos, audio, video y documentos se copian al bucket privado `whatsapp-media` (máx. 25 MB). El log solo registra conteos, nunca teléfonos ni texto. Solo guarda mensajes de los números de la empresa (`TICKET_WA_PHONE_NUMBER_ID`, `WHATSAPP_PHONE_NUMBER_ID`); el ejemplo del botón «Probar» de Meta usa un número ficticio y se ignora (sirve para comprobar la firma: 200 = clave correcta, 401 = incorrecta).
- Migración `20261013060000_whatsapp_inbox.sql` (renombrada desde 050000, que chocó con `public_portal_serial_structure`; la versión fallida se revirtió completa): `whatsapp_conversations` (una por número que recibe y número del cliente), `whatsapp_inbound_messages`, `whatsapp_opt_outs`, columnas `delivery_*` en los envíos, RPC `whatsapp_inbox`, `whatsapp_thread`, `whatsapp_unread_count`, `mark_whatsapp_conversation_read`, `link_whatsapp_conversation`. Solo administración lee (RLS y RPC); solo el webhook escribe. Las conversaciones entran a Realtime.
- Mismo número = últimos 10 dígitos (`whatsapp_phone_key`): +52…, 52…, 521… y 10 dígitos coinciden.
- Ticket de la conversación: si el cliente responde a un aviso, el ticket de ese aviso; si no, se conserva el ligado mientras siga abierto; si no, el ticket abierto más reciente con ese teléfono; si no, el último ticket notificado a ese número. Administración puede cambiarlo desde la bandeja.
- BAJA/STOP (la palabra sola) registra la baja: los avisos automáticos pendientes y nuevos quedan `skipped` y `ticket-whatsapp` rechaza plantillas a ese número. ALTA la quita (no reenvía lo omitido). Contestar dentro de la ventana de 24 h sigue permitido.
- Tickets → WhatsApp (solo administración, con contador de no leídos): conversaciones, hilo con avisos automáticos y su estado de entrega, archivos, ticket ligado y respuesta. `ticket-whatsapp` acción `reply` valida en el servidor la ventana de 24 h y que la conversación sea del número de tickets; reutiliza la reserva idempotente por `requestId`. Mensajes a otros números de la empresa se muestran sin opción de contestar.
- Recepción: la acción `config` muestra a qué URL manda Meta los mensajes del número (`subscribed_apps`) y `connect_inbound` la apunta a `whatsapp-webhook` (`override_callback_uri` + `WHATSAPP_WEBHOOK_VERIFY_TOKEN`). Requiere que la app de Meta tenga activado el campo `messages` del webhook.

Orden de despliegue: `WHATSAPP_APP_SECRET` → `supabase db push` → `supabase functions deploy whatsapp-webhook ticket-whatsapp` → publicar el frontend → «Conectar a Orion» en la bandeja.

Pruebas (sin Deno: `run-deno-test.mjs` carga los `.test.ts` con Node 24):
```
PGLITE_MODULE=$PWD/supabase/_local_archive/whatsapp-tests/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/whatsapp_inbox.test.mjs
node supabase/tests/tools/run-deno-test.mjs supabase/functions/whatsapp-webhook/handler.test.ts
node supabase/tests/tools/run-deno-test.mjs supabase/functions/ticket-whatsapp/handler.test.ts
node frontend/tests/whatsapp-inbox-model.test.mjs
```
Interfaz aislada con datos simulados: `/orion/tests/fixtures/whatsapp-inbox.html` (configuración `orion-whatsapp`, puerto 5216).
