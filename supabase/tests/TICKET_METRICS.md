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

## Reglas de asignación del dueño (20261011040000)

Vigentes desde el 11/10/2026 hasta nueva indicación. Sustituyen el reparto de `20260924040000`
(habitual → sorteo por territorio), que en producción no asignaba nada porque no había coberturas
ni responsables habituales. Cada caso de soporte nuevo se asigna, siempre dentro de su especialidad
(`[Soporte Ingeniero]` → ingenieros, `[Soporte Químico]` → químicos según `employee_type`), en este orden:

1. **Continuidad**: quien atendió el caso que se reabre (`reabre_ticket_id`), el responsable habitual
   del equipo (`ticket_equipment_owners`) o quien atendió el caso anterior del mismo equipo y área.
2. **Región**: quien cubre el estado del equipo (`ticket_staff_coverage`); sin equipo en flota se usa
   la línea «Estado:» de la captura.
3. **Carga equilibrada**: menos casos de soporte abiertos; en empate, quien cerró su último caso hace
   más tiempo; después, al azar.

- Se salta a quien hoy está ocupado: 3 o más casos abiertos, una planeación fechada hoy que lo nombra
  (`scheduled_date`/`fecha_acordada`, o semana de un solo día) o un viaje (`travel_requests`) que cubre
  hoy. La planeación de toda la semana no cuenta. Si todos están ocupados, se asigna al de menor carga.
- Casos de gobierno (Falcon, Genesis, Centrum, Dicipa; `ticket_is_government`): el equipo de gobierno
  (`ticket_government_team`, sembrado con Benjamín y Ángel, editable en el centro de control) cuenta
  un caso menos. No es obligatorio.
- `ticket_assignment_ranking(ticket)` ordena a todo el personal habilitado del área con la regla y el
  motivo; `route_support_ticket` toma al primero, registra `source` (`continuidad`, `region`, `carga`)
  y deja en la bitácora la regla, el motivo y a quién se omitió por estar ocupado. Un candado de
  transacción evita que dos casos simultáneos lean la misma carga.
- Sin especialidad, planeación, cerrados o con asignación (incluidos retiros manuales) no se tocan.
  «Distribuir casos sin asignación» aplica las mismas reglas a los pendientes.

Prueba: `PGLITE_MODULE=<ruta>/@electric-sql/pglite/dist/index.js node supabase/tests/ticket_assignment_rules.test.mjs`.

## Bandeja operativa por responsable (frontend)

La bandeja de Tickets filtra en el navegador los casos que ve un perfil no
administrador: asignación explícita en `ticket_assignments`, `user_id` propio
(altas propias y planeación donde es ingeniero líder) o su nombre de perfil en
`ingeniero_csv` / `companions_csv` de la planeación. Los administradores ven todo.
El filtro complementa el RLS de `20260924040000`; no lo sustituye ni lo relaja.

Pruebas: `node frontend/tests/ticket-visibility.test.mjs` y
`node frontend/tests/tickets-inbox-browser.test.mjs` (Vite en frontend, puerto 5200).
La segunda simula a Alfredo, Diego y un administrador interceptando las peticiones;
no usa sesiones ni tickets reales.

## Visibilidad por asociación y RLS reactivado (20261009010000)

En producción `public.tickets` tenía row level security desactivado (`relrowsecurity = false`),
por lo que las políticas de `20260924040000` existían pero no aplicaban: cualquier técnico veía
y modificaba todos los casos. La migración vuelve a activar RLS en tickets, bitácora, métricas y
servicios vinculados, y redefine el acceso:

- `can_view_ticket`: administradores todo; personal técnico sus asignaciones, sus propios
  casos (`user_id`) y toda la planeación (el tablero semanal es compartido); clientes sus casos.
- `can_work_ticket` (movimientos, cierres, updates): administradores, el asignado, quien registró
  el caso y el personal nombrado en `ingeniero_csv` / `companions_csv` de la planeación
  (`ticket_names_person`, sin acentos, puntos ni mayúsculas).
- Con RLS activo los administradores necesitan registrar planeación a nombre del ingeniero líder
  y borrar semanas reimportadas: se agregan políticas permisivas de insert y delete para `admin`.
- Los casos de soporte sin asignación solo los ve administración; se reparten con las reglas de
  cobertura o con “Distribuir casos sin asignación”.

La bandeja de Tickets sigue filtrando la planeación por persona en el navegador. La prueba
PGlite de este archivo cubre asignación, creador, nombres en planeación, clientes, bitácora
visible, límite de update y la reactivación de RLS.

## Cierre administrativo de planeación antigua

`supabase/snippets/2026-10-09_cerrar_planeacion_anterior_13_octubre.sql` cierra la planeación
con fecha planeada anterior al 13/10/2026 reproduciendo el cierre de la ingesta SAP: bitácora con
estado resultante `cerrado` (los triggers cierran el ticket y registran el evento) clasificado como
`administrativo`. La fecha sale de `week_end` / `scheduled_date` / `week_start` o de la etiqueta
`fecha_tentativa` con el año de creación. Incluye una vista previa de solo lectura.

## Indicadores del personal: químicos e ingenieros (20261011020000)

El centro de control suma tres secciones a «Control de casos»: **Resumen general**, **Químicos** e
**Ingenieros**. Todo se calcula en el servidor (`get_service_kpi_summary`, `get_service_kpi_records`,
`get_service_kpi_options`, solo administradores); el navegador no descarga los tickets para agregarlos.
Tarjetas, gráficas, tablas y exportaciones leen las mismas filas (`service_kpi_*_rows`), por lo que el
total de una tarjeta es el total de los registros que abre.

**Fuentes.** Tickets de soporte (la planeación se mide como actividad programada), eventos de servicio,
bitácora (llamadas y visitas), planeación `[PLAN]`, historial de servicio + refacciones, partes SAP,
reportes de servicio/remotos y encuestas respondidas.

**Reglas de cálculo.**
- Periodo por fecha local (`service_kpi_settings.timezone`, America/Chihuahua). Aperturas, cierres y
  actividades por su fecha; pendientes como fotografía al corte (fin del periodo o ahora).
- Periodo anterior equivalente: meses completos → mismos meses previos; mes a la fecha → mismos días del
  mes anterior; otro rango → mismo número de días previos.
- Plazo: `ticket_sla_policies` (canal, región, especialidad, prioridad; menor precedencia gana; horas
  corridas u hábiles, zona horaria y estados de pausa). Se sembraron las reglas vigentes: Falcon CDMX 24 h,
  Falcon foráneo 48 h, soporte general 48 h, corridas y sin pausas. Sin regla activa → «sin plazo».
- Cierres fuera de plazo = fuera ÷ cierres con plazo evaluable × 100. Excluye cancelaciones (cierre
  administrativo) y cierres sin fecha; los «sin plazo» se informan aparte; las demoras justificadas
  siguen contando como fuera de plazo (subconjunto).
- Primera respuesta: primer contacto registrado (respuesta, llamada o visita). Resolución: cierres
  solucionados (promedio, mediana, P90) por tipo de servicio y prioridad.
- Reapertura: caso nuevo vinculado (`tickets.reabre_ticket_id`); el cerrado no se reabre. Solo cierres
  posteriores a `capture_since` son evaluables.
- Visitas: registros del mismo equipo y día = una visita. Una actividad con varios participantes cuenta
  una vez para el equipo y una vez para cada participante. Un ticket se atribuye al responsable vigente;
  las reasignaciones quedan en `ticket_assignment_history`.
- Preventivos: programados del periodo realizados ÷ programados. Realizado = cierre solucionado,
  marcado «realizado» o mantenimiento preventivo al mismo equipo en el mismo mes. Un cierre
  administrativo no es evidencia. Fuera de programación = preventivo ejecutado sin preventivo programado.
- Reincidencia: mismo código de avería en el mismo equipo dentro de N días (`recurrence_days`, filtro);
  solo eventos con la ventana completa. Efectividad por avería y solución con tamaño de muestra.
- Costos: solo líneas con precio registrado; se informa la cobertura.
- «0» = sin actividad; «Sin dato» = falta el campo; «No aplica» = denominador cero.

**Captura nueva.** Prioridad del caso (alta y expediente, auditada con `set_ticket_priority`), vínculo de
reapertura, duración/motivo/resultado/códigos de llamadas y visitas (`register_ticket_movement` con
`p_activity`, compatible con la firma de 6 argumentos), tipo y resultado del servicio en el diagnóstico
(`servicios_historial.tipo_servicio`, `resultado`), historial de estados para pausas. Los históricos no se
modifican; su tipo se clasifica al consultar y los registros evidentemente de prueba se excluyen.

**Despliegue.** Aplicar la migración antes de publicar el frontend (el alta de tickets y el diagnóstico
envían columnas nuevas). `20261011030000_service_staff_kpis_performance.sql` reemplaza
`service_kpi_activity_rows` por una versión con uniones por equipo y mes: mismas filas (verificado fila
por fila en producción) y ~280 ms en lugar de ~935 ms por conjunto.

**Pruebas.**
- `PGLITE_MODULE=<ruta>/@electric-sql/pglite/dist/index.js node supabase/tests/service_staff_kpis.test.mjs`
  (cálculos, límites de fecha, denominadores, reaperturas, cierres fuera de plazo, horario hábil y pausas,
  filtros, permisos y tarjetas = registros bajo los mismos filtros).
- `npm run test:kpi:model` (estados cero / sin dato / no aplica, periodos, CSV).
- `npm run test:kpi:browser` con Vite en el puerto 5200 (secciones, filtros, tarjeta → registros,
  paginación, orden, búsqueda, CSV/Excel completos, registro → ticket, captura, móvil). No usa datos reales.
