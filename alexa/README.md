# Orion · Alexa

Skill personalizada **Orion** (es-MX), invocación **«servicio orión»**: «Alexa, abre servicio orión», «Alexa, pregúntale a servicio orión cómo vamos».

| Pieza | Dónde |
|---|---|
| Modelo de interacción (73 intenciones, ~730 frases; vocabulario de casos en `supabase/functions/alexa/caseVocab.ts`) | `alexa/build-model.mjs` → `skill-package/interactionModels/custom/es-MX.json` |
| Manifiesto | `alexa/skill-package/skill.json` |
| Endpoint (firma verificada, consultas como el usuario) | `supabase/functions/alexa/` |
| Avisos cada 5 min (pg_cron) | `supabase/functions/alexa-notify/` |
| Tablas, RPC y cron | `supabase/migrations/20261011010000_orion_alexa.sql` |
| Panel web (vincular, aprobar borradores, avisos, casos de voz) | `frontend/src/components/AlexaPanel.tsx` → Orion → pestaña **Alexa** (`/orion/alexa`) |
| Motor DRI para el servidor | `tools/alexa-engine/` → `supabase/functions/alexa/engine.bundle.js` |
| Imágenes del Echo Show e íconos | `tools/alexa-assets/build_assets.py` → `supabase/functions/alexa/assets.generated.ts` |

## Qué hace

- **Resumen** («cómo vamos»), **agenda** («qué tengo hoy»), **casos y SLA** (Falcon 24 h CDMX / 48 h foráneo, regla general de 48 h).
- **Casos (tickets / reportes)** — `supabase/functions/alexa/cases.ts`:
  - Consultas: filtros por estado, plazo, tipo, lugar o cliente («casos pendientes por piezas», «casos de Monterrey», «casos sin asignar»), conteos, de qué se trata, contacto, bitácora, historial del equipo y cierres de la semana.
  - Escrituras con los mismos RPC de la web, como la persona: avance, llamada, visita, diagnóstico, pieza, escalamiento, nota interna, cambio de estado, caso nuevo, asignación (admin) y demora aprobada (admin/gerencia).
  - Antes de guardar, Orion lee lo que entendió y pregunta «sí / no / borrador» (decisión del dueño, 2026-10-11). «Borrador» deja la acción en Orion → Alexa.
  - **Primera respuesta y cierre** mandan WhatsApp al cliente (y el cierre, la encuesta). Por eso piden un segundo «confirmo».
  - Por voz nada se marca como visible para el cliente.
- **Equipo** («cómo está el 473»): estado del monitor, alarma con su ubicación en el BA400 (catálogo de alarmas), alarmas, controles con Westgard, calibraciones, blancos y **curva de reacción** en Echo Show (solo `screen-abs-v2`).
- **Diagnóstico diferencial** («diagnostica el 473, glucosa fuera» → «colesterol y urea salen bien» → «por qué» → «guíame» → «ya quedó»). Es el **mismo motor DRI** de la web. Hace lo mismo que «Aplicar todo lo detectado»: carga Monitoreo, BPL y SAT del equipo, aplica la regla de contraste (un factor que también usan las pruebas que salen bien pierde peso, pero no se descarta sin una prueba directa) y usa la inteligencia de lotes. La verificación se guía paso a paso y el resultado queda registrado para que el DRI aprenda.
- **IFU y lotes** (einfo.bio): estabilidad a bordo, interferencias, linealidad, detección, precisión, blanco, caducidad.
- **Borradores**: refacciones, y lo que se responde con «borrador». Esperan aprobación en Orion → Alexa.
- **Avisos**: SLA por vencer, casos recién asignados, fatal y controles rechazados en *sus* equipos (admins: toda la flota), y el seguimiento «¿se resolvió?» del día siguiente. Llegan como notificación silenciosa de Alexa; «avisos» los lee y «enterado» los confirma. Los críticos sin acuse en 30 min se marcan para el panel web.
- **Preguntas abiertas** («pregunta…»): las responde Claude (`claude-opus-5-5`, esfuerzo bajo; se cambia con `ORION_CLAUDE_MODEL`) usando las mismas herramientas. Si pasan los ~7 s de Alexa, la respuesta se termina en segundo plano: «qué encontraste».

## Notas de comportamiento

- Los equipos se nombran por los **4 últimos dígitos** de la serie, leídos uno por uno («terminación cero cuatro siete tres»).
- «Orion» se pronuncia en español: toda la voz pasa por `brandSpeech`, que usa IPA `<phoneme>`. Con `ORION_ALEXA_BRAND=plain` se usa solo «Orión» acentuado.
- **Alexa+** rechaza la directiva `Dialog.UpdateDynamicEntities`, así que las entidades dinámicas están apagadas (`ORION_ALEXA_ENTITIES=on` las vuelve a activar). El equipo se encuentra igual por el texto que dices.
- Las respuestas se recortan a menos de 22 KB (`fitResponse`). El documento APL lleva solo la pantalla en uso, y su versión se ajusta a la del dispositivo.
- `Dialog.ElicitSlot` debe repetir **todas** las ranuras de la intención (aunque vayan vacías); Alexa+ rechaza la respuesta si faltan. Las genera `build-model.mjs` en `intentSlots.generated.ts`. Un mismo nombre de ranura no puede tener dos tipos en distintas intenciones.
- Cuando Amazon rechaza una respuesta, el motivo queda en los logs de la función como «alexa session ended with error». Para reproducirlo: `ask smapi simulate-skill` y después `get-skill-simulation`.

## Seguridad

- Toda solicitud se valida con la firma de Amazon: cadena de certificados hasta una raíz de Amazon fijada, SAN `echo-api.amazon.com`, firma `Signature-256` y una antigüedad máxima de 150 s. Si `ALEXA_SKILL_ID` está configurado, también se valida el `applicationId`.
- Sin vincular, la skill solo dicta el código de 6 dígitos.
  - Solo pueden vincularse cuentas `admin` o `tecnico`; las cuentas `cliente` no.
  - Tras 8 códigos erróneos en 15 minutos, la vinculación se bloquea.
- Cada lectura de Orion corre **como la persona vinculada** (`set local role authenticated` y los claims del JWT), así que aplican las mismas RLS que en la web: un técnico solo oye sus casos.
- No se pronuncian resultados de pacientes, solo blancos, calibradores y controles.

## Comandos

Configuración y secretos:

```bash
# Secretos de las funciones (proyecto mzgrifkunevgestihlmh)
supabase secrets set --project-ref mzgrifkunevgestihlmh ALEXA_SKILL_ID=amzn1.ask.skill.… ALEXA_STAGE=development
supabase secrets set --project-ref mzgrifkunevgestihlmh ALEXA_CLIENT_ID=… ALEXA_CLIENT_SECRET=…   # ask smapi get-skill-credentials -s <id>
supabase secrets set --project-ref mzgrifkunevgestihlmh ALEXA_CRON_SECRET=…                        # el mismo valor en Vault: orion_alexa_cron_secret
supabase secrets set --project-ref mzgrifkunevgestihlmh ANTHROPIC_API_KEY=…                        # activa «pregunta…» y la redacción de notas
```

Despliegue:

```bash
supabase functions deploy alexa alexa-notify --project-ref mzgrifkunevgestihlmh --no-verify-jwt
node alexa/build-model.mjs && ask smapi set-interaction-model -s <skillId> -g development -l es-MX --interaction-model "file:alexa/skill-package/interactionModels/custom/es-MX.json"
```

Pruebas:

```bash
supabase/functions/alexa/test/setup-db.sh               # Postgres desechable con todas las migraciones (puerto 54399)
deno test -A --no-lock --node-modules-dir=none supabase/functions/alexa/test/e2e.test.ts
deno test -A --no-lock --node-modules-dir=none supabase/functions/alexa/test/cases.test.ts
deno test -A --no-lock --node-modules-dir=none supabase/functions/alexa-notify/notify.test.ts
deno test -A --no-lock --node-modules-dir=none supabase/functions/alexa/verify.test.ts
deno run -A --no-lock --node-modules-dir=none supabase/functions/alexa/test/transcript.ts   # escuchar una conversación de ejemplo
node tools/alexa-engine/build.mjs --check && node tools/alexa-engine/lotDates.parity.test.mjs
ALEXA_PANEL_URL=http://127.0.0.1:5200/orion/tests/fixtures/alexa-panel.html node frontend/tests/alexa-panel-browser.test.mjs
docker rm -f orion-alexa-pgtest
```

**Cuando cambie el DRI** (motor, lotes, fuentes, catálogo de alarmas), regenera y vuelve a desplegar el paquete del servidor:

```bash
node tools/alexa-engine/build.mjs
```

`--check` falla si quedó desactualizado.

**Guía de voz (PDF)** — `alexa/guide/Orion_Guia_de_Voz.pdf`. Las conversaciones y pantallas salen de ejecutar la skill contra la base de prueba, y el build falla si una frase de la guía no está en el modelo de voz. Regénerala cuando cambie lo que dice Orion o el modelo:

```bash
supabase/functions/alexa/test/setup-db.sh                                  # si no está corriendo
deno run -A --no-lock --node-modules-dir=none alexa/guide/examples.ts      # → alexa/guide/examples.json
node alexa/guide/build.mjs                                                 # → guide.html + Orion_Guia_de_Voz.pdf (Chrome)
```

## Pendiente para publicar (certificación)

- Política de privacidad y términos en `skill.json`.
- Una cuenta de revisión de Orion con datos de ejemplo, descrita en `testingInstructions`.
- Pasar `ALEXA_STAGE` a `live`.
