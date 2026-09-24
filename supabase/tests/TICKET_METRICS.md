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
