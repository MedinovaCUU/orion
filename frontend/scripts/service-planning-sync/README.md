# Service Planning Sync

Ubicacion fija:

- `frontend/scripts/service-planning-sync/sync.mjs`
- `frontend/public/service-planning-sync/datasets/*.json`
- `frontend/src/modules/service-planning/helpers/servicePlanningSync.ts`

Comandos:

```bash
npm run planning:sync -- --list-datasets
npm run planning:sync -- --dataset june-july-2026 --dry-run
npm run planning:sync -- --dataset june-july-2026 --apply
```

Que hace:

- Lee un dataset JSON con actividades de planeacion.
- Resuelve nombres contra `profiles`.
- Elimina tickets planeados existentes de las semanas indicadas en `replaceWeeks`.
- Inserta la nueva version normalizada en `tickets`.

Como encontrarlo rapido despues:

- Busca `planning:sync` en `frontend/package.json`.
- Busca `service-planning-sync` en `frontend/scripts/` o `frontend/public/`.
- Busca `replaceWeeks` o `availabilityNotes` dentro de `frontend/public/service-planning-sync/datasets/`.
- Busca `canAccessPlanningSync` o `syncServicePlanningDataset` para ubicar el boton de la pagina.

Formato base del dataset:

```json
{
  "name": "june-july-2026",
  "year": 2026,
  "auditName": "Sincronizacion planeacion junio-julio 2026",
  "sourceFileName": "google-sheet-june-july-2026",
  "replaceWeeks": [
    "01 AL 05 JUNIO",
    "08 AL 12 JUNIO"
  ],
  "availabilityNotes": [
    {
      "week": "01 AL 05 JUNIO",
      "dateLabel": "SIN FECHA",
      "type": "tiempo_por_tiempo",
      "person": "Benjamin Martinez"
    }
  ],
  "rows": [
    {
      "week": "01 AL 05 JUNIO",
      "serviceType": "preventivo",
      "platform": "A15",
      "locality": "TORREON HOSP UNIVERSIDAD",
      "serial": "83105C1228",
      "observations": "COMODATO RONUAG",
      "engineers": ["MONTANEZ"],
      "companions": [],
      "scheduledDay": ""
    }
  ]
}
```

Notas importantes:

- `serviceType` debe usar un tipo canonico del modulo:
  - `preventivo`
  - `correctivo`
  - `capacitacion`
  - `recapacitacion`
  - `instalacion`
  - `ingenieria_soporte`
- Si en la hoja aparece algo como `VISITA`, `IMPLEMENTACION` o `PREINSTALACION`, hoy se mapea al tipo canonico mas cercano y se conserva el valor original en `rawTypeLabel`.
- `VAC` y `TXT` se guardan en `availabilityNotes` para no perder el dato, pero por ahora no se insertan en `tickets` porque el modulo actual no tiene un esquema propio para disponibilidad del personal.
- `VAC` significa vacaciones y `TXT` significa tiempo por tiempo; ambos se consideran descanso para no agendar a esa persona en esos dias.
- Si una semana debe quedar vacia, agregala en `replaceWeeks` aunque no tenga filas en `rows`.

Flujo recomendado:

1. Crear o duplicar un dataset en `datasets/`.
2. Correr `--dry-run`.
3. Revisar el resumen por semana.
4. Correr `--apply`.
5. Verificar en el modulo.

Boton en la pagina:

- La vista de planeacion tiene un boton pequeno de `Sincronizar`.
- Solo se muestra para el perfil habilitado en `canAccessPlanningSync`.
- El boton lee el mismo dataset publico y reescribe las semanas incluidas en `replaceWeeks`.
