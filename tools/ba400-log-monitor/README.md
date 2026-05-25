# BA400 Log Monitor Prototype

Prototipo aislado para vigilar un archivo de log que crece en tiempo real y subir eventos a un proyecto de Supabase independiente al de este repo.

Si el archivo se puede abrir y leer en Bloc de notas, el monitor puede tratarlo como texto plano aunque la extension sea propietaria, por ejemplo `.LAX00`.

## Que hace

- Lee solo el crecimiento nuevo del archivo.
- Guarda offset y fragmento pendiente en `state/` para no releer todo.
- Detecta codigos con el patron `E:(codigo)`.
- Puede detectar errores estilo `E:(codigo)` o tramas `TraceComm` con campos `;E:550;`.
- Resuelve la descripcion contra el catalogo derivado de `Errors Lists.xlsx`.
- Puede trabajar sobre un archivo fijo o sobre el archivo mas reciente de una carpeta.
- Inserta por REST en la tabla de Supabase que configures.

## Archivos

- `monitor.mjs`: monitor principal.
- `sample-feed.mjs`: generador de lineas para simular un log vivo.
- `config.example.json`: plantilla de configuracion.
- `config.windows.example.json`: plantilla lista para Windows.
- `config.windows.834001902.json`: configuracion ya ajustada para el equipo real `834001902`.
- `run-monitor.cmd`: launcher para Windows por `cmd`.
- `run-monitor.ps1`: launcher para Windows por PowerShell.
- `run-monitor-834001902.cmd`: launcher directo para el equipo `834001902`.
- `run-monitor-834001902.ps1`: launcher directo para el equipo `834001902`.
- `error-catalog.json`: catalogo de errores BA400.

## Uso rapido

1. Copia `config.example.json` a `config.local.json`.
2. Cambia `source.path` para apuntar a tu archivo de prueba.
3. Pon el nombre real de tu tabla en `supabase.table`.
4. Si tu tabla no usa los nombres por defecto, ajusta `upload.columnMap`.
5. Ejecuta el monitor:

```bash
node tools/ba400-log-monitor/monitor.mjs --config tools/ba400-log-monitor/config.local.json
```

6. En otra terminal, simula escritura continua:

```bash
node tools/ba400-log-monitor/sample-feed.mjs
```

## Windows

Recomendado para despliegue real en los equipos.

1. Instala Node.js 20 o superior.
2. Copia la carpeta `tools/ba400-log-monitor` al equipo Windows.
3. Copia `config.windows.example.json` a `config.local.json`.
4. Ajusta `identity.equipmentSerial` con la serie real que quieras subir.
5. Ajusta `source.path` a la carpeta real donde salen los `.LAX00`.
6. Ejecuta `run-monitor.cmd`.

## Windows listo para probar ya

Para el equipo real `834001902` ya deje una configuracion cerrada:

- `config.windows.834001902.json`
- `run-monitor-834001902.cmd`

Esa variante:

- apunta a `C:\\ProgramData\\BA400\\Log`
- sigue `TraceComm*.LAx00`
- arranca desde el final del archivo para capturar solo eventos nuevos
- sube la serie fija `834001902`
- envia a la tabla `Prueba`

Si vas a provocar una colision para validar el envio, usa directamente:

```bat
run-monitor-834001902.cmd
```

Notas:

- `state.path` usa `${CONFIG_DIR}` para que el monitor guarde su estado junto a la configuracion, sin rutas del Mac.
- `machineName` puede tomar `${ENV:COMPUTERNAME}` automaticamente.
- Si el archivo esta temporalmente bloqueado por el software del analizador, el monitor reintenta la lectura antes de fallar.
- `latin1` suele ser mas seguro en logs de Windows si `utf8` produce caracteres extraños.
- Para BA400 real, el origen correcto suele ser `C:\\ProgramData\\BA400\\Log` y el patron `^TraceComm.*\\.[Ll][Aa][Xx]00$`.

## Modos de origen

### Archivo fijo

```json
{
  "identity": {
    "machineName": "${ENV:COMPUTERNAME}",
    "equipmentSerial": "BA400-TEST-001"
  },
  "source": {
    "mode": "file",
    "path": "C:\\ruta\\al\\archivo.LAX00"
  },
  "parser": {
    "mode": "tracecomm"
  }
}
```

### Ultimo archivo de una carpeta

```json
{
  "identity": {
    "machineName": "${ENV:COMPUTERNAME}",
    "equipmentSerial": "BA400-TEST-001"
  },
  "source": {
    "mode": "latest-file-in-dir",
    "path": "C:\\ProgramData\\BA400\\Log",
    "fileNamePattern": "^TraceComm.*\\.[Ll][Aa][Xx]00$",
    "startAtEndOnFirstSeen": true
  },
  "parser": {
    "mode": "tracecomm"
  }
}
```

Para el caso real puedes cambiar despues a la carpeta donde aparezcan los `TraceLog` y el monitor seguira el archivo mas recientemente modificado.

## Tabla recomendada

Si tu tabla de pruebas no coincide con el payload por defecto, esta es una referencia util:

```sql
create table public.ba400_log_events (
  id bigint generated always as identity primary key,
  monitor_name text not null,
  machine_name text not null,
  source_file text not null,
  source_basename text not null,
  line_number bigint not null,
  byte_offset_start bigint not null,
  byte_offset_end bigint not null,
  raw_line text not null,
  error_codes text[] not null default '{}',
  primary_error_code text,
  primary_error_description text,
  matched_error_descriptions jsonb not null default '[]'::jsonb,
  detected_at timestamptz not null,
  line_hash text not null unique,
  payload jsonb not null
);
```

Con una `publishable key` o `anon` legacy, tu tabla necesita permitir `insert` para el rol `anon`.

## Notas operativas

- `source.startAtEndOnFirstSeen`: si es `true`, el monitor ignora el contenido viejo y empieza a leer desde lo nuevo.
- `parser.mode: "tracecomm"`: usa la logica BA400 real sobre lineas `A400;STATUS;...;E:550;...`.
- `upload.dryRun`: si es `true`, no inserta; solo imprime los eventos detectados.
- `state.path`: guarda el avance local y evita duplicados al reiniciar el proceso.
- `source.encoding`: para logs Windows suele convenir `latin1` si `utf8` da caracteres raros.
- `identity.equipmentSerial`: si lo defines, la subida puede usar esa serie en vez del nombre de la PC.
- En `tracecomm`, el monitor ignora `E:0`, aprende la serie desde `ASN` o `SN` y evita repetir el mismo error mientras siga activo.
- `${CONFIG_DIR}` y `${ENV:VARIABLE}` pueden usarse dentro del JSON para evitar rutas fijas.
- Si `rest/v1` responde `401 Invalid API key`, copia la `Publishable key` actual del proyecto o confirma que la `anon` legacy corresponda exactamente a ese proyecto.
