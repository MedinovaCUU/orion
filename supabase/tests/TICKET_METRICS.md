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
