# Métricas de servicio

Aplicar `20260924010000_ticket_service_metrics.sql` antes de publicar el frontend.
En Permisos, habilitar Tickets → Consultar tickets y Aprobar demoras de servicio
para el gerente (perfil técnico). Los administradores pueden aprobar directamente.

El SLA usa 48 horas corridas desde `tickets.creado_en`, sin pausas por piezas ni
observación. Una justificación aprobada conserva la duración real y excluye el
cierre tardío de los incumplimientos sin justificar. Puede aprobarse estando
abierto o después de cerrar. No se infieren fechas de tickets históricos.

Cada respuesta y cierre se atribuye a su autor autenticado. Las métricas muestran
los casos accesibles cargados y distinguen cierres automáticos sin autor. No
representan una asignación de responsabilidad de tickets sin movimientos.
Los eventos son inmutables; para recurrencias se abre un nuevo caso del equipo,
conservando el cierre anterior. Registrar respuesta no envía WhatsApp.

Prueba aislada con PostgreSQL embebido (PGlite):

```sh
PGLITE_MODULE=/ruta/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/ticket_service_metrics.mjs
```

La prueba cubre permisos, gerente delegado, primera respuesta única, cierre
atómico con evento, integraciones de cierre existentes, aprobación de demoras,
límite exacto de 48 horas, históricos sin fecha e inmutabilidad de registros.

## Centro de control y revisión de cierres

La migración `20260924020000_ticket_closure_control.sql` agrega resultados de cierre
(solucionado, visita programada, sin respuesta, administrativo) y revisión de gerencia.
Las operaciones guardan motivo, autor y hora del servidor. Revisar no justifica
una demora. Los resultados antiguos quedan sin clasificar; no se infieren.

El cumplimiento técnico considera únicamente cierres solucionados con fechas
verificables, excluyendo los justificados del denominador. Los filtros afectan
indicadores, desempeño y exportaciones completas. El periodo usa la fecha local
del navegador y permite elegir apertura o cierre. Planeación se consulta por separado.

Pruebas del modelo: `node frontend/tests/ticket-control-model.test.mjs`.
Prueba de interfaz aislada: arrancar Vite en frontend en el puerto 5198 y ejecutar
`node frontend/tests/ticket-control-browser.test.mjs`. La prueba intercepta las
peticiones de datos; no modifica tickets reales. Valida filtros, paginación,
revisión, Excel, impresión/PDF y la vista móvil.

La captura se realiza en un único formulario: movimiento, detalle y guardar.
`register_ticket_movement` registra atómicamente una sola entrada de bitácora y
los eventos que correspondan. La primera respuesta se registra una sola vez;
respuestas posteriores se agregan como seguimiento sin reiniciar el tiempo.
El estado y la visibilidad solo se aplican a avances; las notas, aprobaciones y
revisiones son internas. Los permisos y la validación de estados se comprueban
en la base de datos, además de controlar los campos visibles en la interfaz.

## Acceso administrativo y alarmas por asignación

La migración `20260924030000_ticket_control_admin_and_assignments.sql` exige rol
`admin` para consultar los datos globales del centro de control y asignar casos.
La vista operativa y el seguimiento individual conservan sus permisos existentes.
La autorización del centro se valida tanto al abrir la pantalla como en su RPC.

`ticket_assignments` es la fuente de asignación; no se deduce del creador del
caso ni del técnico que instaló el equipo. Los administradores asignan casos
abiertos desde el expediente del centro de control. Cada cambio deja bitácora.
Los técnicos solo pueden leer sus propias asignaciones mediante RLS.

Las alertas de Falcon de Tickets y Planeación pasan por la misma verificación:
solo se muestran/reproducen para casos asignados al usuario autenticado. Se
reconsulta cada 30 segundos y al recuperar foco o cambiar de cuenta. Los casos
sin asignación no generan alarmas personales. Los umbrales recordados en el
navegador se separan por usuario.

Pruebas adicionales: `frontend/tests/ticket-alert-access.test.mjs` y
`frontend/tests/ticket-alerts-browser.test.mjs` (Vite, puerto 5198). La segunda
simula a Francisco y otro responsable, sin usar sesiones o tickets reales.

## Asignación y aislamiento (20260924040000)

- Los técnicos solo consultan y modifican tickets con asignación explícita a su usuario. Ser creador no concede acceso. La restricción aplica en RLS a tickets, bitácora y métricas y dentro de los RPC de movimientos, cierres y revisiones.
- El administrador configura responsables habituales por serie y especialidad en el centro de control. En ausencia de un habitual habilitado, se sortea entre las coberturas del estado del equipo y la especialidad solicitada.
- La cobertura es explícita en `ticket_staff_coverage`; el valor histórico “Ubicaciones” de perfiles y el instalador del equipo no se usan como responsables. Un administrador puede habilitar varias coberturas y especialidades para una persona.
- Solo participa personal admin/técnico con módulo tickets y `can_receive_tickets`. Serie desconocida, equipos activos duplicados, especialidad desconocida o territorio sin candidatos quedan pendientes; nunca se sortean fuera del territorio.
- El reparto ocurre al crear el caso. “Distribuir casos sin asignación” permite procesar casos previos tras configurar reglas. No altera asignaciones existentes, cierres ni retiros manuales. La reasignación manual registra responsable, administrador, hora y bitácora.
- No se inventan asignaciones para casos históricos ni de planeación a partir del creador. Administración puede asignarlos explícitamente; el reparto automático procesa solo solicitudes de soporte con especialidad identificada.
- Pruebas PGlite cubren prioridad habitual, territorio, especialidad, falta de configuración, aislamiento del creador, RPC heredado, movimiento permitido y revocación tras reasignar. Pruebas de navegador cubren configuración, reparto de pendientes, control y alarmas entre usuarios.
