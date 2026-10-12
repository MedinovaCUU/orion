# Plantillas de servicio de Orion-Biosystems

Idioma: es_MX. Categoría solicitada: UTILITY. Creadas el 1 de octubre de 2026.

El archivo `ticket-template-submissions.json` conserva la respuesta de Meta por plantilla. La aceptación de la solicitud con estado PENDING no implica aprobación ni un plazo garantizado.

Estas plantillas corresponden a solicitudes de servicio existentes. Los ejemplos son ficticios y deben sustituirse por datos reales del ticket al enviar. El panel actual solo integra las plantillas de contacto y cierre; este catálogo prepara las demás para revisión, y su envío desde Orion requiere integrar sus parámetros en el panel y el servidor.

## Recepción de ticket

`orion_ticket_recibido_v1`

Orion-Biosystems recibió tu solicitud de soporte y registró el ticket {{1}} para el equipo {{2}}. Revisaremos el caso y te informaremos el siguiente paso por este medio. Conserva este folio para dar seguimiento.

Parámetros: 1. Folio, 2. Equipo y serie.

## Asignación de técnico

`orion_ticket_asignado_v1`

Tu ticket {{1}} de Orion-Biosystems fue asignado al técnico {{2}}, quien dará seguimiento a tu solicitud de soporte. Puedes responder a este mensaje para agregar información del caso.

Parámetros: 1. Folio, 2. Nombre del técnico.

## Visita programada

`orion_visita_programada_v1`

Orion-Biosystems programó la visita de servicio de tu ticket {{1}} para el {{2}} a las {{3}} en {{4}}. Responde CONFIRMAR para confirmar la disponibilidad o CAMBIAR para solicitar otro horario.

Parámetros: 1. Folio, 2. Fecha, 3. Hora y zona horaria, 4. Lugar.

## Recordatorio de visita

`orion_recordatorio_visita_v1`

Te recordamos la visita de Orion-Biosystems correspondiente a tu ticket {{1}}, programada para el {{2}} a las {{3}}. Por favor, ten disponible el equipo {{4}} para el servicio. Si necesitas reprogramar, responde a este mensaje.

Parámetros: 1. Folio, 2. Fecha, 3. Hora y zona horaria, 4. Equipo y serie.

## Solicitud de información

`orion_datos_ticket_v1`

Para continuar con tu solicitud de soporte {{1}} en Orion-Biosystems, necesitamos el siguiente dato del equipo: {{2}}. Responde a este mensaje con la información solicitada. No incluyas datos de pacientes.

Parámetros: 1. Folio, 2. Dato técnico solicitado.

## Reprogramación de visita

`orion_reprogramacion_visita_v1`

La visita de servicio de tu ticket {{1}} con Orion-Biosystems fue reprogramada para el {{2}} a las {{3}}. Responde CONFIRMAR si estás disponible o CAMBIAR para solicitar otro horario.

Parámetros: 1. Folio, 2. Nueva fecha, 3. Nueva hora y zona horaria.

## Refacción pendiente

`orion_refaccion_pendiente_v1`

El servicio de tu ticket {{1}} en Orion-Biosystems está en espera de la refacción {{2}} para el equipo {{3}}. Te avisaremos cuando esté disponible para continuar con la atención. Puedes responder a este mensaje para consultar el estado del caso.

Parámetros: 1. Folio, 2. Refacción, 3. Equipo y serie.

## Confirmación de solución

`orion_confirmacion_solucion_v1`

Orion-Biosystems finalizó la intervención de tu ticket {{1}} en el equipo {{2}}. Antes de cerrar el caso, necesitamos confirmar el resultado contigo. Responde RESUELTO si el equipo funciona correctamente o SEGUIMIENTO si el problema continúa.

Parámetros: 1. Folio, 2. Equipo y serie.

## Reapertura de ticket

`orion_ticket_reabierto_v1`

Tu ticket {{1}} de Orion-Biosystems para el equipo {{2}} fue reabierto para continuar con la atención. El equipo de soporte revisará el caso. Puedes responder a este mensaje para compartir información adicional sobre la falla.

Parámetros: 1. Folio, 2. Equipo y serie.
