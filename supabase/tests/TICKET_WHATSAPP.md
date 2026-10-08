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
