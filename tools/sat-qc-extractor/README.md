# Extractor de controles SAT

Los CSV/XML del reporte SAT describen ejecuciones, pero los valores numéricos de
control están dentro del respaldo SQL Server `.bak`. Este proceso restaura ese
respaldo en un contenedor temporal, obtiene únicamente el resultado más reciente
por prueba, lote y nivel, genera JSON normalizado y elimina tanto el contenedor
como la copia temporal.

Requisitos: Docker y `unzip`.

```bash
node tools/sat-qc-extractor/extract-latest-qc.mjs \
  --file "/ruta/SATReport.A400" \
  --password biosystems \
  --serial 834002824 \
  --model BA400 \
  --output /tmp/qc-latest.json
```

El servicio de ingestión debe hacer `upsert` de `results` en
`equipment_qc_latest`, usando la llave única
`(serial_number, test_key, control_level)`. El agente de conexión directa utiliza
el mismo contrato JSON; cambia solamente `sourceType` a `live_equipment`.
