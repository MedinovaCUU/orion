# Ingesta de partes de asistencia SAP FSM

Worker pequeno para convertir los PDF enviados por `noreply@eu.fsm.cloud.sap` en mantenimientos normalizados dentro de Supabase.

## Decisiones importantes

- Conserva el folio exactamente como texto (`0000007244`); nunca lo convierte a numero.
- Un SHA-256 evita reingresar exactamente el mismo archivo.
- La pareja `numero de informe SAP + folio de actividad` identifica el mantenimiento logico. Si SAP vuelve a emitirlo con cambios, se actualiza el mantenimiento y se conserva una nueva revision en `sap_service_report_imports`.
- Intenta extraer el texto incrustado del PDF primero. Solo ejecuta Tesseract cuando recibe un escaneo sin texto util.
- Valida el remitente real del mensaje antes de aceptar adjuntos. Si el reenvio manual cambia el campo `From`, ese correo interno debe declararse explicitamente en `SAP_ALLOWED_FORWARDERS`.

## Preparacion

1. Aplicar la migracion `supabase/migrations/20260722010000_add_sap_service_report_ingestion.sql`.
2. Crear un buzon dedicado y reenviar ahi los mensajes de SAP FSM.
3. Copiar `.env.example` a `.env` fuera de control de versiones y completar IMAP y Supabase.
4. Instalar Python 3.11+, Poppler y Tesseract con los idiomas `spa` y `eng`.
5. Instalar dependencias: `python -m pip install -r requirements.txt`.

La llave `SUPABASE_SERVICE_ROLE_KEY` no debe colocarse en el frontend ni compartirse por correo.

### Guardar secretos en el Llavero de macOS

El worker busca los secretos primero en variables de entorno y, si no existen, en el Llavero. Ejecuta estos comandos directamente en la Mac; sustituye cada texto entre comillas por el secreto real:

La forma mas sencilla es ejecutar el asistente interactivo:

```bash
./store-secrets-macos.sh
```

Tambien puedes guardarlos manualmente:

```bash
read -s "ORION_SECRET?Contrasena de aplicacion Gmail: klawguqgjwidzqfd"
security add-generic-password -U -a "orionmedinova@gmail.com" -s "orion-sap-imap" -w "$ORION_SECRET"
unset ORION_SECRET

read -s "ORION_SECRET?Supabase service role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16Z3JpZmt1bmV2Z2VzdGlobG1oIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTY2NjcyNSwiZXhwIjoyMDk1MjQyNzI1fQ.zyaBWxXH8dHfelLIpTnSF1IvPouRjjYeJadmR4t5n7o"
security add-generic-password -U -a "https://mzgrifkunevgestihlmh.supabase.co" -s "orion-sap-supabase-service-role" -w "$ORION_SECRET"
unset ORION_SECRET
```

No uses la contrasena normal de Gmail. La primera debe ser una contrasena de aplicacion creada exclusivamente para este worker.

## Validacion local sin escribir datos

```bash
python sap_service_ingestor.py parse "/ruta/PARTE DE ASISTENCIA 0000007244.pdf"
```

## Ingesta manual y correo

```bash
python sap_service_ingestor.py ingest "/ruta/parte.pdf"
python sap_service_ingestor.py ingest-directory "/ruta/historico-sap"
python sap_service_ingestor.py poll-once
```

En produccion, ejecutar `poll-once` cada minuto mediante cron, systemd timer, Cloud Run Job u otro scheduler. El worker marca el correo como leido unicamente cuando todos sus PDFs terminan correctamente; los reintentos son seguros por el hash y la clave SAP.

Ejemplo de cron:

```cron
* * * * * cd /opt/sap-service-report-ingestor && /opt/venv/bin/python sap_service_ingestor.py poll-once >> /var/log/sap-fsm-ingestor.log 2>&1
```

## Datos registrados

Se actualiza `service_reports` para que el mantenimiento aparezca junto con los reportes ya existentes. La evidencia y estructura completa quedan en:

- `sap_service_reports`: estado actual por documento/folio.
- `sap_service_report_imports`: cada revision recibida y su SHA-256.
- `service_report_materials`: refacciones/materiales con codigo y cantidad.
- Storage `sap-service-reports`: PDF original privado.

El payload conserva cliente, direccion, fechas, serie, modelo, firmware/software, tecnico, esfuerzos, duracion, materiales, checklist y observaciones. La descripcion generica `AUTOANALYZER` se guarda como evidencia, pero la relacion operativa se hace por numero de serie.
