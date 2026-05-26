# AX00 Log Monitor

Paquete de despliegue para monitoreo nacional de equipos `BA200`, `BA400`, `A15` y `A25`.

Incluye:

- `monitor.mjs`: monitoreo de errores activos desde `TraceComm*.LAx00`.
- `consumption-monitor.mjs`: monitoreo de consumos desde `LogConsum`.
- `full-monitor.mjs`: supervisor que arranca ambos monitores, reinicia si uno cae y guarda logs locales.

## Archivos

- `node-v24.16.0-x64.msi`: instalador oficial Node.js LTS para Windows x64.
- `install-node-lts.cmd`: instalador silencioso de Node.js.
- `monitor.mjs`: monitor de errores.
- `consumption-monitor.mjs`: monitor de consumos.
- `full-monitor.mjs`: supervisor completo.
- `config.windows.nacional.json`: configuración del monitor de errores.
- `config.windows.consumo.json`: configuración del monitor de consumos.
- `config.windows.completo.json`: configuración del supervisor.
- `run-monitor-nacional.cmd` / `run-monitor-nacional.ps1`: prueba manual del monitor de errores.
- `run-consumption-monitor.cmd` / `run-consumption-monitor.ps1`: prueba manual del monitor de consumos.
- `run-full-monitor.cmd` / `run-full-monitor.ps1`: prueba manual del monitoreo completo.
- `run-full-monitor-daemon.ps1`: wrapper silencioso para ejecución continua.
- `install-autostart.cmd` / `install-autostart.ps1`: instala el arranque automático en Windows.
- `uninstall-autostart.cmd` / `uninstall-autostart.ps1`: elimina el arranque automático.
- `error-catalog.json`: catálogo local de códigos de error.
- `sql/create_monitoreo_errores_equipos.sql`: SQL de la tabla de errores.
- `sql/create_consumo_insumos_tables.sql`: SQL de las tablas de consumos.

## Instalación

### 1. Preparar la carpeta

1. Copia esta carpeta completa al equipo Windows.
2. Extrae el paquete en una ruta fija. Recomendado: `C:\AX00-Log-Monitor`
3. Confirma que existan al menos:
   - `install-node-lts.cmd`
   - `install-autostart.cmd`
   - `run-full-monitor.cmd`

### 2. Instalar Node.js

1. Entra a la carpeta extraída.
2. Ejecuta `install-node-lts.cmd`
3. Espera a que termine la instalación.

### 3. Preparar Supabase

1. Abre el proyecto Supabase `mzgrifkunevgestihlmh`.
2. En el SQL Editor ejecuta `sql/create_monitoreo_errores_equipos.sql`.
3. Ejecuta `sql/create_estado_errores_equipo_actual.sql`.
3. En el SQL Editor ejecuta `sql/create_consumo_insumos_tables.sql`.

Las tablas esperadas quedan así:

- `public.monitoreo_errores_equipos`
- `public.consumo_reactivos_hora`
- `public.consumo_rotores_mensual`
- `public.estado_insumos_equipo_actual`

### 4. Revisar rutas

El paquete intenta primero rutas comunes:

- errores:
  - `C:\ProgramData\BA400\Log`
  - `C:\ProgramData\BA200\Log`
  - `C:\ProgramData\A15\Log`
  - `C:\ProgramData\A25\Log`
  - `C:\ProgramData\Y15\Log`
  - `C:\ProgramData\Y25\Log`
- consumos:
  - `C:\ProgramData\BA400\LogConsum`
  - `C:\ProgramData\BA200\LogConsum`
  - `C:\ProgramData\A15\LogConsum`
  - `C:\ProgramData\A25\LogConsum`
  - `C:\ProgramData\Y15\LogConsum`
  - `C:\ProgramData\Y25\LogConsum`

Si no encuentra una ruta válida, hace autodetección.

Reglas de autodetección:

- errores: busca carpetas con `TraceComm*.LAx00`
- consumos: busca carpetas con `*_ReagentConsumption_YYYYMM.csv` y `*_RotorConsumption_YYYYMM.csv`
- si existen dos carpetas válidas, usa la que tenga archivos más recientes y más cercanos al mes o fecha actual
- reevalúa la carpeta detectada periódicamente para poder cambiar a una instalación nueva aunque la carpeta vieja siga existiendo

Si una instalación usa una ruta muy fuera de lo normal, ajusta:

- `config.windows.nacional.json`
- `config.windows.consumo.json`

Los campos que normalmente necesitarías tocar son:

- `source.path`
- `source.pathCandidates`
- `source.discoveryRoots`

### 5. Prueba manual

1. Ejecuta `run-full-monitor.cmd`
2. Déjalo correr unos minutos.
3. Revisa que se creen estos logs:
   - `logs\full-monitor-daemon.log`
   - `logs\errores.log`
   - `logs\consumos.log`
4. Si quieres validar el envío:
   - provoca un error nuevo y revisa `monitoreo_errores_equipos`
   - espera la siguiente sincronización de consumos y revisa las tablas mensuales

### 6. Instalar arranque automático

1. Cierra la prueba manual si sigue abierta.
2. Ejecuta `install-autostart.cmd` como administrador.
3. Eso crea la tarea programada `AX00 Equipment Monitor`.
4. La tarea:
   - corre al iniciar Windows
   - usa la cuenta `SYSTEM`
   - ejecuta el monitor completo sin depender de una ventana abierta
5. Reinicia la PC o ejecuta manualmente la tarea para confirmar que arranca sola.

### 7. Verificación final

1. Abre el Programador de tareas y confirma que existe `AX00 Equipment Monitor`.
2. Revisa los logs en la carpeta `logs`.
3. Verifica en Supabase que lleguen datos a:
   - `monitoreo_errores_equipos`
   - `consumo_reactivos_hora`
   - `consumo_rotores_mensual`
   - `estado_insumos_equipo_actual`

### 8. Desinstalación

1. Ejecuta `uninstall-autostart.cmd` como administrador.
2. Borra la carpeta donde extrajiste el paquete.

## Operación

Si ya ejecutaste `install-autostart.cmd`, no necesitas abrir nada manualmente.

Usa estos comandos sólo para pruebas o diagnóstico:

- `run-monitor-nacional.cmd`
- `run-consumption-monitor.cmd`
- `run-full-monitor.cmd`

Logs útiles:

- `logs\full-monitor-daemon.log`
- `logs\errores.log`
- `logs\consumos.log`

## Monitoreo de errores

`monitor.mjs`:

- sigue archivos `TraceComm*.LAx00`
- empieza desde el final del log para capturar sólo eventos nuevos
- ignora `E:0`
- deduplica el mismo error mientras siga activo
- aprende la serie desde `ASN` o `SN`
- llena `tipo_mensaje` desde el catálogo de errores con `fatal`, `warning` u `ok`
- infiere el modelo con estos prefijos:
  - `83200` => `BA200`
  - `83400` => `BA400`
  - `83105` => `A15`
  - `83101` => `A25`

La tabla online esperada es `public.monitoreo_errores_equipos`.

La tabla de estado actual esperada es `public.estado_errores_equipo_actual`.

Campos principales enviados:

- `detected_at`
- `numero_serie`
- `modelo`
- `codigo_error`
- `descripcion_error`
- `seccion_error`
- `analizador_id`
- `tipo_mensaje`
- `monitor_name`
- `machine_name`
- `source_file`
- `source_basename`
- `line_number`
- `byte_offset_start`
- `byte_offset_end`
- `raw_line`
- `line_hash`
- `payload`

Reglas de estado actual:

- `STATUS ... E:<codigo>` mantiene el error activo.
- `ANSERR;N:<n>;E:<codigo>` confirma el detalle del error activo.
- `STATUS ... E:0` marca al equipo como limpio.
- `ANSERR;N:0` tambien marca al equipo como limpio.
- `ASN:` tiene prioridad sobre `SN:` para identificar correctamente la serie real del analizador.
- Una vez detectada una serie por `ASN:`, un `SN:` posterior no debe reemplazarla. Esto evita falsos cambios de serie en lineas como `ANSADJ`.

Si quieres reiniciar el seguimiento de errores desde cero, borra:

```text
state\monitor-state-nacional.json
```

## Monitoreo de consumos

`consumption-monitor.mjs` no sube cada pipeteo como fila independiente.

Modelo actual:

- `ReagentConsumption`: una fila por `mes + numero_serie + test_name`
- `RotorConsumption`: una fila por `mes + numero_serie`
- `estado_insumos_equipo_actual`: una fila por equipo con el estado más reciente

Frecuencia:

- el monitor corre cada hora
- el mes actual se recalcula completo en cada ciclo y se vuelve a subir como total absoluto
- meses cerrados sólo se reprocesan si el archivo cambia o si vence la resincronización periódica

Esto evita dos problemas:

- no se disparan millones de filas por hora
- una reinstalación o una caída de carga no duplica datos, porque el `upsert` vuelve a escribir el total mensual de la misma llave

Si un envío falla:

- el estado local no se confirma hasta que Supabase responde bien
- en la siguiente pasada el mismo archivo se vuelve a procesar

Si una instalación se reinstala:

- al no existir estado local, el monitor vuelve a leer los archivos mensuales encontrados
- como la llave es estable por `mes + numero_serie + test_name` o `mes + numero_serie`, el resultado vuelve a quedar correcto por `upsert`

Las tablas online esperadas son:

- `public.consumo_reactivos_hora`
- `public.consumo_rotores_mensual`
- `public.estado_insumos_equipo_actual`

Campos principales de `consumo_reactivos_hora`:

- `bucket_month`
- `numero_serie`
- `test_name`
- `pipetting_count`
- `vr1_total_ul`
- `vr2_total_ul`
- `sample_volume_total_ul`
- `patient_count`
- `blank_count`
- `calib_count`
- `ctrl_count`
- `factory_test_count`
- `non_factory_test_count`
- `first_event_at`
- `last_event_at`
- `source_basename`

`consumo_rotores_mensual` guarda:

- `bucket_month`
- `numero_serie`
- `modelo`
- `rotor_change_count`
- `first_change_at`
- `last_change_at`
- `change_timestamps`

Si quieres reiniciar el seguimiento de consumos desde cero, borra:

```text
state\consumption-monitor-state.json
```

En ese caso el monitor volverá a recalcular y subir los archivos mensuales detectados.

## Supervisor completo

`full-monitor.mjs` mantiene el monitoreo completo del equipo:

- errores casi en tiempo real con `pollIntervalMs = 5000`
- consumos con `pollIntervalMs = 3600000`
- reinicio automático si uno de los monitores se detiene
- logs locales en `logs\errores.log` y `logs\consumos.log`

## Notas

- La `publishable key` ya quedó configurada para el proyecto `mzgrifkunevgestihlmh`.
- Si `rest/v1` responde `401 Invalid API key`, la clave del proyecto cambió y habrá que actualizar `supabase.apiKey`.
