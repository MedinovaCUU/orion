# Controles del SAT (respaldo `.bak`)

Los CSV y XML del reporte SAT describen ejecuciones y consumos, pero los **valores de control** solo están en el
respaldo SQL Server `.bak` que viaja dentro del `.A400`. El navegador no puede restaurarlo, así que el flujo es:

1. El usuario importa el SAT en Orion (DRI o Monitoreo). El importador guarda los datos y el **original** en
   Storage (`sat-reports`; si pasa de 45 MiB, en partes con un `…manifest.json`) y deja la importación en
   `processing_status = 'partial'`.
2. **`sat-qc-worker.mjs`** toma esas importaciones, descarga y reconstruye el original, verifica su huella SHA-256,
   restaura el `.bak` en un SQL Server temporal (Docker), lee el último resultado por prueba, lote y nivel con los
   límites del propio analizador y hace upsert en `equipment_qc_latest`. Marca la importación como `processed` y
   deja el detalle en `coverage.qcExtraction` (`status`, `resultCount`, `error`, `attempts`).
3. DRI espera esos resultados en la tarjeta SAT y, en cuanto aparecen, vuelve a aplicar el SAT con los controles:
   las pruebas quedan marcadas como fallidas o correctas contra los límites del analizador.

Cada extracción tarda unos 15–30 s. Requisitos del equipo que corre el servicio: Docker en marcha (imagen
`mcr.microsoft.com/mssql/server:2022-latest`, ~2.3 GB) y `unzip`.

```bash
# desde la raíz del proyecto
node tools/sat-qc-extractor/sat-qc-worker.mjs --watch            # servicio continuo (revisa cada 60 s)
node tools/sat-qc-extractor/sat-qc-worker.mjs --once             # procesa lo pendiente y termina
node tools/sat-qc-extractor/sat-qc-worker.mjs --file <SAT.A400>  # extrae un archivo local y lo incorpora
node tools/sat-qc-extractor/extract-latest-qc.mjs --file <SAT.A400> --serial <serie> --output qc.json  # solo JSON
```

Credenciales: `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en el entorno; si faltan, el servicio las toma en
memoria del Supabase CLI enlazado a este proyecto (`supabase login` y `supabase link`). No se escriben ni se
imprimen. La contraseña de exportación es el secreto `SAT_EXPORT_PASSWORD` del proyecto (`supabase secrets set`):
el servicio la pide a la función `sat-export-password` con la llave de servicio, y la aplicación con la sesión del
usuario. No está escrita en el código; `SAT_EXPORT_PASSWORD` en el entorno local la sustituye si hace falta.

## Dejarlo encendido

El servicio necesita una máquina con Docker siempre disponible. En una Mac se puede registrar como agente de
`launchd` (se inicia con la sesión y se reinicia si cae):

```xml
<!-- ~/Library/LaunchAgents/mx.biosystems.orion.sat-qc-worker.plist -->
<plist version="1.0"><dict>
  <key>Label</key><string>mx.biosystems.orion.sat-qc-worker</string>
  <key>ProgramArguments</key><array>
    <string>/usr/local/bin/node</string>
    <string>/RUTA/AL/PROYECTO/tools/sat-qc-extractor/sat-qc-worker.mjs</string>
    <string>--watch</string>
  </array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/orion-sat-qc-worker.log</string>
  <key>StandardErrorPath</key><string>/tmp/orion-sat-qc-worker.log</string>
</dict></plist>
```

```bash
launchctl load ~/Library/LaunchAgents/mx.biosystems.orion.sat-qc-worker.plist
```

Si el servicio no está encendido, la tarjeta SAT de DRI avisa a los 10 minutos y la importación queda en
`partial` hasta que corra; no se pierde nada.
