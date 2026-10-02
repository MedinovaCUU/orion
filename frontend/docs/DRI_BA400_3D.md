# BA400 en DRI: integración y demostración

Implementado en el módulo React/TypeScript existente de Orion; conserva el motor DRI, sus puntuaciones, sus estados y la selección de equipos. El nuevo espacio de inspección precede a la captura. El mapa relacional sigue disponible mediante «Abrir mapa de relaciones DRI» y se monta al abrirlo para no mantener dos escenas activas sin necesidad.

## Abrir el DEMO

Desde `frontend`, ejecutar `npm run dev -- --host 127.0.0.1 --port 5173` y abrir `http://127.0.0.1:5173/orion/dri-preview`.

La ruta de previsualización existente está limitada por `import.meta.env.DEV`. Ahora abre automáticamente el DEMO BA400 con el modelo montado y seis hipótesis producidas por `runDriEngine(buildDemoFormState(catalog), catalog)`. Usa el catálogo documental local, sin necesitar el catálogo remoto ni cargar reportes SAT reales. El botón existente «Demo BA400» también activa la integración dentro de DRI.

Recorrido sugerido para presentar las capacidades:

1. Girar el equipo completo y observar sus 318 componentes.
2. Seleccionar «Sospecha óptica / fotometría»: localizar `banco_opt`, AC16614, con tapas ocultas y contexto visible.
3. «Aislar componente» y «Ver ubicación en el equipo» para alternar detalle y contexto.
4. Seleccionar lavado y recorrer sus dos ubicaciones con las flechas.
5. Mover «Despiece visual» y restablecer el equipo.
6. Seleccionar control/calibrador: se conserva la explicación y aparece «Sin componente 3D asociado».
7. Abrir el catálogo, buscar `filtro_340` o `led_340` y explorar sus detalles sin generar una hipótesis.

La banda «PRUEBA LOCAL» identifica el caso. Los botones de demo no persisten diagnósticos; tampoco «Generar diagnóstico diferencial» mientras el formulario provenga de una demo. Esta procedencia se conserva al editar serie/modelo y solo se elimina con «Reiniciar», que vacía el formulario. `previewMode` nunca persiste un diagnóstico. El DEMO contiene evidencia simulada ya existente en Orion, no fallas de un equipo real. El visor no confirma nada por su cuenta.

## Mapeo explícito

Fuente ejecutable: `src/modules/dri/model3d/ba400Mapping.ts`.

Hay dos clases de asociación, diferenciadas en el inspector:

- **Código de servicio exacto**: una entrada completa de `DriHypothesisResult.candidateParts` debe ser igual a `codigo_servicio` del catálogo. No se extraen códigos de explicaciones, títulos o frases. Si un código aparece en varias piezas, se devuelven todas como candidatas asociadas; no se elige una arbitrariamente.
- **Referencia del conjunto**: tabla explícita de `matchedRuleIds` a ubicaciones del modelo. Es una referencia espacial del conjunto nombrado por la regla, no una equivalencia con una refacción averiada. Esto permite orientar al usuario incluso cuando DRI todavía no habilita `candidateParts` por falta de evidencia confirmatoria.

| Regla DRI | `part_id` | Código en el catálogo | Alcance y fuente |
|---|---|---|---|
| `ba400_optical_photometry` | `banco_opt` | AC16614 | Referencia del conjunto fotométrico: banco óptico sin filtros, según catálogo. No selecciona un filtro específico por longitud de onda. |
| `ba400_r2_dispensing` | `brazo_r2` | No provisto | Brazo R2 nombrado por la regla y por el catálogo. No asigna automáticamente bomba o electroválvula. |
| `ba400_temperature` | `rotor_pm`, `frio_rea` | No provistos | Referencias de reacción y refrigeración citadas por la regla. No identifica un sensor como averiado. |
| `ba400_wash_carryover` | `cabezal_lav`, `rotor_pm` | No provistos | Cabezal de lavado y rotor de 120 pocillos como referencias de lavado y cubetas. No equipara el cabezal con la estación completa ni el rotor con una refacción de cubetas. |
| `ba400_fluidics_pipetting` | Ninguno por regla | Pendiente | Bomba, válvula, nivel y línea son demasiado genéricos para una identificación individual fiable. |
| Control, interferencia, rango y software; reglas desconocidas | Ninguno por regla | No aplica | Mantiene el hallazgo y muestra «Sin componente 3D asociado». |

Las referencias proceden de `knowledge/ba400.rules.ts` y del `componentes.json` suministrado. El mapeo documenta ubicaciones interpretables desde esas fuentes; **no representa una validación de servicio independiente ni una recomendación de sustitución**. La asociación AC16614 falla de forma cerrada si su identidad cambia en el catálogo.

Ejemplos de códigos exactos soportados por el catálogo (solo actúan si DRI entrega ese código completo):

| Código | Identificadores |
|---|---|
| AC16606…AC16613 | `filtro_340`, `filtro_405`, `filtro_505`, `filtro_535`, `filtro_560`, `filtro_600`, `filtro_635`, `filtro_670`, respectivamente |
| AC16614 | `banco_opt` |
| AC16620 | `sensor_temp_rxn` |
| AC17307 | `check_01`…`check_05` |
| AC16621 | `vent_rxn_1`…`vent_rxn_4` |

### Correspondencias pendientes de validación técnica

- Códigos comerciales y variantes por número de serie para brazo R2, rotor desechable, refrigeración y cabezal de lavado: el catálogo no entrega códigos para estas ubicaciones.
- «Bomba de muestra», «Bomba de reactivo», «Válvula», «Válvula de dispensación», «Detección de nivel» y líneas: validar canal S/R1/R2, referencias JE1/SF1, revisión y código de recambio.
- «Sensor térmico»: diferenciar rotor, refrigeración y calentador de lavado; no asignar todos a AC16620.
- «Filtro óptico»: el DEMO incluye evidencia de 505 nm, pero una coincidencia de longitud de onda no confirma que el filtro AC16608 sea la causa. Se localiza el banco óptico hasta disponer de una referencia diagnóstica inequívoca.
- «Rotor de reacción», «Cubetas» y «Conjunto fotométrico»: validar el alcance del conjunto reemplazable. `rotor_pm` es una referencia del rotor de 120 pocillos; no se le inventa un AC de servicio.
- «Agitador»: validar A1/A2. Un hallazgo sobre R2 no basta para elegir un agitador.
- `led_340` está anidado en `pcb_foto`, pero no tiene código de servicio. Se puede explorar y aislar; no recibe un hallazgo óptico del padre por herencia.

Para agregar una correspondencia: validar regla/candidato, código, alcance y revisión; incorporarla a la tabla explícita; añadir prueba con el identificador real. Nunca introducir búsqueda aproximada ni inferir averías desde nombres. Una pieza ausente conserva el hallazgo sin una asociación 3D.

## Estados y selección

`generated` → «Sospecha · sin confirmar»; `reviewed` → «Sospecha revisada · sin confirmar»; `confirmed` → «Hallazgo confirmado por DRI»; `discarded` → «Hipótesis descartada».

Las puntuaciones y severidad no cambian estos estados. Una hipótesis confirmada de un conjunto no prueba la avería de cada pieza localizada. El inspector conserva la explicación y el alcance de la asociación. Cian y retícula indican selección; ámbar indica otras ubicaciones de la sospecha; rosa indica asociación con un hallazgo confirmado. También se muestran texto de estado, indicador de selección, nombre, código y posición dentro de la lista. Los descartados no mantienen resaltado de sospecha; una selección explícita sigue siendo una acción de exploración.

La relación inversa usa el mismo resolver: seleccionar una pieza muestra los hallazgos existentes asociados a su `part_id`. No llama al motor ni persiste datos. Un resultado sin correspondencia limpia el resaltado, aislamiento y explosión anteriores; restablecer el visor conserva el diagnóstico. Cambiar de equipo/serie o reiniciar la captura elimina el diagnóstico anterior para evitar asociaciones cruzadas.

## Arquitectura gráfica y recursos

- `Ba400DiagnosticViewer.tsx`: selección, catálogo accesible con teclado, inspector, controles y estados de equipo. Integra con la selección del ranking existente en `DriDashboard`.
- `Ba400Canvas.tsx`: importación diferida, carga, progreso, preparación, errores y reintento.
- `ba400ModelCache.ts`: una descarga compartida y caché de bytes. Sobrevive al cambio de hallazgo y al desmontaje/remontaje; las escenas y recursos GPU no se comparten. El timeout de 120 s y los errores HTTP/GLB admiten reintento.
- `ba400Scene.ts`: Three.js existente en Orion, OrbitControls, cámara interpolada, materiales de contexto, encuadre por mallas propias, raycasting y limpieza. La retícula señala la posición real proyectada del componente. Respeta `prefers-reduced-motion`.
- `vendor/ba400-controls.mjs` y `vendor/orion_highlight.mjs`: copiados sin modificaciones del ZIP; se acompañan de tipos TypeScript. Se usa exclusivamente `setExplosion()`, sin `AnimationMixer`.
- `ba400Parts.generated.json`: índice pequeño de catálogo, sin geometría. Regenerar con `npm run ba400:catalog` después de actualizar el catálogo de origen.

El GLB está en `public/models/ba400/BA400_web.glb` (81 356 700 bytes, metros, Y vertical). La URL usa `import.meta.env.BASE_URL`, por lo que respeta `/orion/`. Se copiaron el catálogo y las instrucciones originales. `SHA256SUMS.txt` verifica los recursos públicos actuales. Los controladores originales están bajo `vendor/`; la imagen de referencia del ZIP no es necesaria para la página.

Se ocultan solo mallas propias de las tapas explícitamente catalogadas; nunca se apaga un ancestro de transformación que contiene otras piezas. Adicionalmente, rayos hacia centro y extremos del componente detectan obstrucciones y las atenúan con materiales clonados. Los materiales originales se restauran al cambiar de selección. Mostrar tapas elimina esa atenuación; aislar conserva ancestros y muestra únicamente las primitivas propias de la pieza. La exposición de geometría oculta sirve para inspección visual, no para prescribir acceso físico.

El despiece utiliza las traslaciones locales suministradas, comprobadas también para `led_340`/`pcb_foto`; no se suma nuevamente el desplazamiento del padre. No se diagnostican pivotes `p_…` ni se identifican piezas por material o índice.

Al desmontar se cancelan frames y observadores, se eliminan listeners/controles, se restauran materiales, se liberan geometrías, materiales, texturas, entorno, recursos auxiliares y WebGLRenderer/contexto. Durante la inactividad se evita renderizar frames sin cambios; la escena también pausa el render cuando está fuera de pantalla o la pestaña está oculta. La retención de bytes en memoria es intencional para evitar otra descarga.

## Verificación

Comandos desde `frontend`:

```sh
npm run build
npm run test:ba400:model
# Con el servidor de desarrollo ejecutándose:
npm run test:ba400:browser
```

El navegador de pruebas usa `playwright-core` ya instalado y Google Chrome local. Se puede cambiar la URL mediante `BA400_PREVIEW_URL`. El servidor de pruebas SSR usa su propio directorio de caché para no invalidar dependencias del servidor de presentación.

Resultados de esta integración:

- **16 comprobaciones de catálogo/modelo**: identidad del catálogo y SHA-256, salida de un fixture real del motor → banco óptico, códigos exactos, código compartido por cinco piezas, rechazo de inferencias textuales y equipos distintos, conservación de estados, 318 identificadores, materiales independientes, aislamiento anidado, tapas, interpolación de explosión, cambio/reset y liberación gráfica.
- **17 comprobaciones en navegador**: apertura del DEMO con seis hipótesis, clic real sobre geometría, asociación individual, cámara/ubicación, aislamiento/contexto, dos componentes navegables, explosión gradual, tapas, filtro interno, LED anidado, resultado sin correspondencia, una única descarga, reset y reselección, cambio de equipo y remontaje, generación de diagnóstico de demo sin persistencia y reinicio de captura, disposición móvil de 390 px y error HTTP 503 seguido de reintento correcto. **Cero errores JavaScript, cero solicitudes fallidas inesperadas y cero escrituras de diagnóstico en producción.**
- Compilación TypeScript/Vite de producción correcta. Vite conserva avisos de tamaño de algunos bundles del proyecto; el GLB queda como recurso separado y `Ba400Canvas` como carga diferida.
- ESLint sin incidencias en los archivos nuevos del visor.

Las capturas y reportes se generan en `outputs/ba400-verification/` del proyecto.

### Observación independiente sobre los fixtures históricos de DRI

Con el catálogo local disponible, el conjunto histórico `runDriValidationFixtures` da **10/15**. No cumplen sus expectativas `case-1`, `case-2`, `case-6`, `case-7` y `case-9`. Es un resultado del motor/conocimiento existente, que esta integración no modifica. Los fallos se reportan separadamente de las pruebas de localización; no se ocultaron ni se cambiaron los umbrales para que la demostración apareciera aprobada. El DEMO BA400 utilizado en el navegador sí produce seis hallazgos y pasa el recorrido completo de inspección. La validación diagnóstica de esos fixtures históricos requiere una revisión independiente antes de presentarlos como una validación clínica/técnica completa.


## Actualización del GLB · 12 septiembre 2026

Se sustituyó el modelo por el archivo actualizado suministrado directamente (`BA400_web.glb`), SHA-256 `02074ca50ac28798f26b324f8218cb3d0dacf64b7714b4acc0fab977bf4e16b3`. Contiene 318 componentes: 20 incorporaciones y 11 identificadores retirados frente a la primera versión de 309 piezas. Incorpora bombas ISE, rotores, tubos y tapas, soporte ISE, ventana de inspección y mangueras de suministro/dispensación S/R1/R2. Los identificadores retirados se eliminan del catálogo; no se sustituyen por equivalencias supuestas.

El catálogo ahora se regenera desde los `extras` y las mallas del GLB con `npm run ba400:catalog`: conserva nombres y códigos exportados y recalcula límites mundiales considerando pivotes y piezas anidadas. Solo reutiliza la clasificación anterior cuando el identificador persiste. Los elementos nuevos sin clasificación o código permanecen señalados como tales. Las asociaciones de reglas existentes se mantienen porque sus piezas y códigos siguen presentes. No se generan nuevas hipótesis para los elementos ISE.

`ba400Model.generated.json` concentra tamaño, número de piezas y huella. La URL del GLB incorpora la huella como versión para invalidar la caché de la versión anterior; la sesión del visor se reinicia al cambiar esa huella. La caché de descarga sigue compartida entre hallazgos de una misma versión. Las tapas ISE y la ventana de inspección se incorporan a la lista explícita de cubiertas.

El informe original `verificacion_web.json` corresponde al primer ZIP y no es una validación Khronos de esta revisión. Esta revisión se comprobó mediante las 16 pruebas actuales de modelo/controlador y las 17 de navegador, incluyendo selección/aislamiento del nuevo rotor ISE. Los controles del ZIP no necesitaron cambios: la interpolación mundial y el restablecimiento pasan para los 318 componentes.
