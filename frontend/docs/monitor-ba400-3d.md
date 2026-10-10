# Monitoreo espacial BA400

## Uso

1. Abrir el módulo Monitoreo.
2. Seleccionar explícitamente un equipo con serie numérica que empiece por `83400` y estado `fatal` o `warning`. La selección desde el globo o desde la lista de alertas abre su vista espacial.
3. También se puede usar **Explorar alarmas en 3D** en la ficha de cualquier BA400, incluso sin alarmas.
4. Seleccionar una tarjeta o una etiqueta del modelo para enfocar su conjunto. Se puede girar, acercar, ocultar cubiertas, aislar el conjunto o ajustar el despiece visual.
5. Las cubiertas aparecen colocadas por defecto. **Ocultar cubiertas** permite ver el interior y el mismo botón las restaura. Seleccionar una alarma no cambia esta preferencia.
6. Los controles viven en una barra persistente bajo la cabecera del explorador (Vista general / Eventos, Restablecer vista, Pausar giro, Aislar conjunto, Ocultar cubiertas y el slider de despiece); en móvil se reparten en dos filas sin scroll horizontal.
7. El explorador aparece **sobre el globo**, como panel de cristal oscuro translúcido en la misma celda de la rejilla del escenario: el globo sigue montado debajo, en pausa (`data-paused="true"`, sin auto-giro ni bucle continuo) y difuminado por un filtro estático, y el riel de prioridad flota a la izquierda en cristal oscuro. Nunca hay dos lienzos WebGL vivos (el del globo en pausa no cuenta); por debajo de 1260 px el riel pasa a una tira horizontal bajo el escenario y el explorador cubre la columna única. Cerrar con **Cerrar** o Escape (capturado en `document`) retira el explorador y el globo recupera el giro y el enfoque; El escenario ya no va dentro de una tarjeta ni lleva título, subtítulo ni leyenda de uso: ocupa todo el ancho del módulo y casi la altura de la pantalla (`100svh − 8rem` en escritorio, mínimo 36 rem). Bajo el globo, una barra oscura muestra la leyenda de estados y el botón **Pantalla completa** (visible cuando el navegador expone `fullscreenEnabled`; iOS Safari no), que lleva el escenario completo a pantalla completa con o sin explorador; se sale con Esc o con el mismo botón. El chip "Cobertura simulada" desapareció del globo; la cobertura de demostración se activa o desactiva solo desde el menú **Acciones** de la franja de mando. Mientras el explorador está abierto, el riel se estira a toda su altura y su pie resume el equipo en exploración (estado, alarmas vigentes, BPL, último evento) con **Cerrar explorador** y **Diagnosticar en DRI**. 
8. En **Vista general**, las tarjetas ocupan las columnas laterales de la misma rejilla que el viewport 3D (hasta seis por página), de modo que ninguna tarjeta intersecta el modelo. Las líneas conectan con la proyección real del conjunto y lo siguen al girar o aplicar despiece. Por debajo de 1100 px las tarjetas pasan bajo el modelo y los conectores se ocultan. Los códigos sin correspondencia no tienen línea ni una pieza arbitraria.
9. **Eventos** permite consultar la lista completa; en ese modo el viewport queda oculto y el holograma deja de renderizar (sin auto-giro). Cambiar de vista no vuelve a descargar ni desmonta el modelo.

La selección automática inicial no abre el panel. Al entrar al módulo con permiso de mapa y algún BA400 en el catálogo se inicia una precarga silenciosa del modelo BA400 desde el inicio y en cualquier ancho de pantalla. En navegadores con Network Information API (Chromium) solo se omite con ahorro de datos (`saveData`), red distinta de 4g o poca memoria (`deviceMemory` < 4 GB); en navegadores sin esa API (Safari, Firefox) no se asume red rápida y solo precalientan los dispositivos de puntero fino, así que un teléfono carga el modelo al abrir el explorador. BA200, A15, A25 y los nodos simulados del globo no reciben el visor BA400.

## Datos y actualización

- La ventana recibe el mismo corte del módulo principal; no hace consultas adicionales ni escrituras a Supabase.
- Prefiere `estado_errores_equipo_actual`. Si solo hay historial, lo identifica explícitamente como últimos eventos conocidos, no como confirmación de alarmas activas.
- El sondeo de 30 segundos y las suscripciones Realtime existentes siguen actualizando los datos mientras la ventana está abierta. Cuando desaparece una alarma, también desaparece su marcador y su selección asociada.
- La señal reciente usa la regla existente del monitoreo; no confirma conectividad instantánea. Las fechas se presentan en la zona horaria del navegador.
- La bandera `monitoringErrorCodesVisible` sigue aplicándose: si está desactivada, las etiquetas usan `AL-01`, etc., como referencias visuales del corte, no como códigos del analizador.

## Localización y límites

`ba400AlarmMapping.ts` mantiene 55 códigos explícitos asociados a 17 conjuntos del catálogo 3D de DRI. La correspondencia se basa en las descripciones del catálogo BAX00 local. No se usan búsquedas difusas sobre textos ni rangos para inventar asociaciones.

Las marcas son referencias de conjunto: por ejemplo, una colisión de dispensación R1 señala el brazo R1, sin afirmar qué pieza requiere sustitución. Las alarmas no mapeadas siguen en las tarjetas con el aviso **Sin ubicación 3D definida**. Antes de ampliar las asociaciones, validar el código y el conjunto con documentación técnica.

La apariencia cian, la transparencia, las líneas y el despiece son recursos visuales. No representan mediciones físicas, una secuencia de desmontaje ni el estado real de cubiertas. No se ejecutan maniobras del analizador.

## Implementación

### Estructura del módulo (rediseño de octubre de 2026)

`src/modules/equipment-monitoring/` se organiza en tres niveles, todos hijos directos de `div.equipment-monitor` y en rejilla (ningún bloque usa `position:absolute/fixed` para convivir con otro; solo los HUD dentro de sus lienzos). Estética: el **escenario** (globo + riel + explorador 3D) es oscuro cinematográfico (tokens `--stage-*`: superficie profunda, cristal oscuro, tinta clara, cian como acento de datos y rojo solo para riesgo); el resto del módulo (franja de mando, expediente, alertas) sigue en perla. Las capas del escenario se superponen por rejilla (misma fila y columna, distinto `z-index`), no por posicionamiento absoluto:

| Archivo | Responsabilidad |
|---|---|
| `EquipmentMonitoring.tsx` | Compositor: carga el corte, deriva listas, resuelve la selección visible y reparte el estado. |
| `useMonitoringSnapshot.ts` | Conjunto **caliente** cada 30 s (`estado_errores_equipo_actual`, `monitoreo_errores_equipos`, `estado_insumos_equipo_actual`) y **frío** cada 5 min o por su aviso Realtime (`equipos`, `v_equipment_map_locations`, consumos, rotores, resumen BPL). Firma del corte: si nada cambió no se publica un corte nuevo (memos, globo y modelo conservan identidad). Avisos Realtime agrupados (1500 ms) y sin recargas con la pestaña oculta. |
| `monitorLiveStore.ts` | `refreshing`, `refreshedAt` y `lastRealtimeEventAt` fuera del árbol (`useSyncExternalStore`): solo la lectura en vivo se suscribe. |
| `monitoringDerivations.ts` / `monitorFormat.ts` | Tipos de filas, `buildEquipmentList`, resumen en una pasada, filtro, orden del riel y firma; formateadores `Intl` construidos una sola vez. |
| `MonitorCommandStrip.tsx` | Franja de mando: identidad, lectura en vivo con anillo de 30 s, buscador, filtro segmentado, importación SAT, menú **Acciones** (Actualizar ahora · Cobertura simulada, persistida en `localStorage['orion.monitor.simulated']`) y cinco KPIs. |
| `MonitorStage.tsx` + `EquipmentPriorityRail.tsx` | Escenario oscuro: cabecera perla con leyenda de cinco estados y, debajo, la rejilla superpuesta `.equipment-monitor__spatial-workspace` (columnas `288px | 1fr`, una fila `minmax(--stage-h, auto)`): el globo ocupa toda la celda (z 1), el riel de prioridad flota en cristal oscuro en la columna 1 (z 2; 40 filas + **Mostrar más**, vacío con **Limpiar filtros**) y, al inspeccionar (`.is-inspecting`), `Ba400AlarmPanel` entra en la columna 2 (z 3, margen 16 px, entrada por `opacity`/`transform`) mientras el globo recibe `paused` y `filter: blur()`. ≤ 1259 px: una columna, riel en tira horizontal en la fila 2; móvil apaisado (≤ 520 px de alto): columnas `232px | 1fr`. |
| `EquipmentDossier.tsx` + `CollapsibleSection.tsx` + `useEquipmentDetail.ts` + `useSupremoLaunch.ts` | Expediente: identidad y acciones, tira de cinco lecturas, navegación pegajosa (Estado · BPL · Consumos · Insumos), estado fusionado (ubicación · errores vigentes con **Ver N más** · historial en tira), `BplStatusSection`, consumos plegados (las filas por prueba se consultan solo al desplegar, paginadas de 24) e insumos. |
| `AlertsList.tsx` | Alertas activas (hasta ocho), punto de entrada para el permiso `alertas`. |
| `monitor.tokens.css`, `monitorCommand.css`, `monitorStage.css`, `monitorDossier.css`, `equipmentMonitoring.css` | Tokens (cian instrumental como único acento de datos, rojo solo para riesgo, ámbar para pendiente, grafito para sin dato; un solo mapa `data-tone`; familia `--stage-*` para el escenario oscuro: `--stage-deep`, `--stage-glass`, `--stage-glass-strong`, `--stage-glass-soft`, `--stage-outline`, `--stage-ink`, `--stage-ink-2`, `--stage-ink-3`, `--stage-shadow`, `--stage-blur`), hoja por bloque y barril. Escalera única de puntos de ruptura 1440 / 1260 / 1100 / 960 / 560 más `(orientation: landscape) and (max-height: 520px)`. |

- `EquipmentMonitoring.tsx`: apertura por selección explícita y paso del corte actualizado.
- `Ba400AlarmPanel.tsx`: región accesible no modal, tarjetas, estados de selección y controles del modelo.
- `ba400AlarmPanel.css`: cristal oscuro translúcido sobre el globo (tinta `--stage-ink`, eyebrows cian), colores de gravedad (el antecedente fatal usa `#ff6b7a`, legible sobre oscuro), rejilla estricta con espaciados 12/16 px, escala tipográfica 11 / 12 / 13 / 15 / 28 px y adaptación móvil.
- `AlarmSpatialConnectors.tsx`: líneas SVG actualizadas a partir de las etiquetas proyectadas por el motor 3D; no usa coordenadas ilustrativas fijas ni añade otro bucle continuo de renderizado.
- `ba400AlarmMapping.ts`: identificación por serie y asociaciones explícitas código/conjunto.
- `Ba400Canvas.tsx`, `ba400ModelCache.ts` y `ba400PreparedModel.ts` de DRI: descarga compartida y preparación silenciosa del mismo GLB, sin duplicar el archivo. Una escena preparada se entrega a un único visor para evitar compartir recursos que otro visor pueda liberar.
- `ba400Scene.ts`: opciones `holographic` y `alarmMarkers`, desactivadas por defecto para conservar la presentación de DRI. Restaura materiales y libera recursos al cerrar.
- `GlobalEquipmentGlobe.tsx`: con `paused` (que `MonitorStage` activa al inspeccionar) expone `data-paused="true"` en su raíz y pasa el bucle a renderizado bajo demanda, manteniendo la interacción del mapa sin animarlo continuamente.

El marco angular, los símbolos esquemáticos y las tarjetas cian reproducen el lenguaje visual de las referencias. Las tarjetas cian informan sobre la fuente y la cobertura de localización, no certifican que un subsistema esté operativo. Durante la inspección el globo no se desplaza: queda montado bajo el explorador, en pausa y difuminado con un filtro estático (barato porque el lienzo no cambia), con `pointer-events: none`; las coordenadas de los equipos no se modifican y al cerrar recupera el giro.

El GLB actual ocupa 81 356 700 bytes (aproximadamente 77,6 MiB). Se descarga al entrar al módulo y sus bytes se reutilizan durante la sesión de la página; no se descarga con cada refresco. También se analiza en segundo plano, sin crear un contexto WebGL oculto. Si nadie abre la escena preparada durante cinco minutos se libera esa escena, conservando los bytes. La preparación no garantiza espera cero si se selecciona antes de terminar la descarga, si caduca la escena o durante la inicialización de la GPU. La vista requiere WebGL. Si falla la precarga no se muestra una notificación; al abrir el visor se puede reintentar y las tarjetas siguen disponibles.

## DEMO en Supabase

El script `tools/monitor-visual-demo.mjs` utiliza la sesión autenticada de Supabase CLI contra `mzgrifkunevgestihlmh`, sin guardar credenciales. Crea exclusivamente el equipo virtual `834009999`, modelo `BA400 [DEMO]`, identificado como DEMO en el mapa y el panel. Su ubicación ilustrativa es Chihuahua, no un laboratorio real. No modifica analizadores instalados ni añade consumos.

Añade cuatro eventos del catálogo (203, 301, 502 y 70) y un estado actual, todos identificados con `[DEMO]` y `ORION_DEMO_VISUAL`. No envía latidos periódicos; la señal reciente caducará con las reglas normales del monitor. El equipo virtual sí añade un registro al inventario y a los contadores de equipos mientras exista: retirar la DEMO antes de usar esos totales en informes operativos.

Desde la raíz del proyecto, crear o refrescar sin duplicar eventos:

```sh
node tools/monitor-visual-demo.mjs --apply
```

Retirar exclusivamente esta DEMO (equipo, cuatro eventos y estado actual):

```sh
node tools/monitor-visual-demo.mjs --cleanup
```

## Verificación local

Desde `frontend`:

```sh
node tests/ba400-monitor.test.mjs
node tests/monitoring-derivations.test.mjs
node tests/ba400-model.test.mjs
node node_modules/typescript/bin/tsc -b --pretty false
node node_modules/vite/bin/vite.js build
```

Con un servidor Vite local disponible (`npm run dev` sirve `http://127.0.0.1:5174/orion/`; las pruebas de navegador leen el origen de `MONITOR_TEST_ORIGIN` y necesitan Google Chrome instalado):

| Script | Equivale a | Qué verifica |
|---|---|---|
| `npm run test:monitor:browser` | `node tests/ba400-monitor-browser.test.mjs` | Flujo completo del monitor a 1540×1100 con el mock: precarga única del GLB, explorador 3D, bloque BPL y curvas, superposición por diseño (el explorador se superpone al globo y `elementFromPoint` en su centro visible cae dentro de `.alarm-spatial`; no se empalma con el riel más de 8 px; el globo tiene `data-paused="true"` y `filter` con `blur`), viewport 3D sin tarjetas encima, un solo lienzo vivo (sin contar los de `[data-paused="true"]`), explorador en cristal oscuro (fondo con alfa > 0 y luminancia < 0,3; tinta con luminancia > 0,7) y piso tipográfico de 11 px, móvil 390×844 (viewport ≥ 280 px, riel sin empalme y explorador encima del globo) y 844×390, sondeo, Escape (globo sin `data-paused` y `filter: none`, foco restaurado) y BA200 sin modelo. Capturas en `outputs/monitor-hologram`. |
| `npm run test:monitor:derivations` | `node tests/monitoring-derivations.test.mjs` | Derivaciones puras con las filas del mock: lista de equipos, resumen en una pasada, filtro, orden del riel y firma del corte. |
| `npm run test:ba400:antecedents` | `node tests/ba400-antecedents-browser.test.mjs` | Monta `Ba400AlarmPanel` solo (1500×1200): antecedentes en tarjetas, anclas y conectores, color de riesgo calculado del antecedente fatal exactamente `rgb(255, 107, 122)` (#ff6b7a, legible sobre cristal oscuro). |
| `npm run test:monitor:shots` | `node tests/tools/monitor-screenshots.mjs --strict` | Capturas y compuertas de QA en cinco viewports y cuatro estados; termina con código 1 si alguna compuerta falla. Capturas y `report.json` en `outputs/monitor-visual/run`. |

```sh
MONITOR_TEST_ORIGIN=http://127.0.0.1:5174 npm run test:monitor:browser
MONITOR_TEST_ORIGIN=http://127.0.0.1:5174 npm run test:ba400:antecedents
MONITOR_TEST_ORIGIN=http://127.0.0.1:5174 npm run test:monitor:shots
```

Las pruebas de navegador montan el componente real mediante `tests/fixtures/monitor.tsx` en un documento interceptado. Las respuestas de Supabase son simuladas por `tests/fixtures/monitorMock.mjs` y las escrituras se bloquean. Esta entrada no se añade a las rutas de producción. (`npm run test:ba400:browser` es la verificación del visor DRI en `tests/ba400-browser.test.mjs` y usa `BA400_PREVIEW_URL`.)

### Capturas y compuertas de QA (`tests/tools/monitor-screenshots.mjs`)

```sh
node tests/tools/monitor-screenshots.mjs --origin http://127.0.0.1:5174 --out ../../../outputs/monitor-visual/run
node tests/tools/monitor-screenshots.mjs --strict --viewports mobile-portrait,mobile-landscape
npm run test:monitor:shots -- --budget-scale 1.15
```

- `--origin` (por defecto `MONITOR_TEST_ORIGIN` o `http://127.0.0.1:5174`), `--out` (relativo a `tests/tools`; por defecto `../../../outputs/monitor-visual/run`, es decir `outputs/monitor-visual/run` en la raíz del repositorio, junto a `outputs/monitor-hologram`), `--viewports` (lista separada por comas entre `desktop` 1540×1000, `laptop` 1280×800, `tablet` 834×1112, `mobile-portrait` 390×844 y `mobile-landscape` 844×390; los tres últimos con `isMobile` y táctil).
- `--strict` convierte las compuertas en código de salida 1; sin la bandera solo se imprime el resumen y `report.json`.
- `--budget-scale <factor>` multiplica los presupuestos de altura para calibrar una línea base; los presupuestos del código solo se ajustan a la baja. Línea base del 10 de octubre de 2026 (escenario oscuro con el explorador sobre el globo, expediente con BPL y curvas desplegadas): escritorio 3477 / 4546 / 4139 px (overview / inspect / selected), laptop 3333 / 4667 / 3996, tablet 4066 / 6041 / 4728, móvil vertical 4674 / 7390 / 5468, móvil horizontal 3351 / 4365 / 4013; los presupuestos llevan ~8 % de holgura sobre esos valores.
- El mock se instala con `createMonitorMock({ extended: true })`: además de `834001902` (BA400 con cuatro alarmas) y `832001902` (BA200) añade `834001903` (BA400 con estado vigente `ok` y sin alarmas) y `851000777` (A15 sin georreferencia, fuera del globo). Con `extended: false`, el valor por defecto, las respuestas son las que espera `tests/ba400-monitor-browser.test.mjs`.

Estados por viewport: `overview` (carga inicial), `focused-city` (clic en un elemento clicable de ciudad del globo con `aria-label` o `role` fuera del HUD o, en su defecto, en el primer botón de la bandeja de ciudad; se marca `skipped` si no existe), `inspect` (clic en `834001902` → explorador 3D; captura completa y recorte del `.alarm-spatial`) y `selected` (tras Escape).

Métricas por estado en `report.json`: `horizontalOverflow`, `pageHeight`, `overlaps` (pares de regiones con empalme > 8 px entre `.equipment-monitor__command`, `__summary-grid`, `.equipment-priority`, `.equipment-globe`, `.alarm-spatial`, `.alarm-spatial__viewport`, `__focus-panel`, `__lists-grid` y `__map-header`; se ignoran las contenidas unas en otras y los pares intencionales), `overlapsAll`, `intentionalOverlaps` (superposiciones por diseño sobre el globo: `.alarm-spatial × .equipment-globe`, `.alarm-spatial__viewport × .equipment-globe` y `.equipment-priority × .equipment-globe`; se reportan y no fallan), `liveCanvases` (lienzos con área, sin `visibility:hidden` y fuera de `[data-paused="true"]`, es decir, el globo en pausa no cuenta), `globeBlurred` (el `filter` calculado de `.equipment-globe` contiene `blur`; `null` sin globo), `globeTouchAction` (`touch-action` calculado del `canvas` del globo), `minFontPx` (menor `font-size` entre nodos con texto propio bajo `.equipment-monitor`, ignorando lo oculto; `smallTextElements` lista los infractores), `explorerFitsWidth`, `explorerScrollWidth` y `boxes`.

Compuertas de `--strict` (lista `failures` por viewport): desborde horizontal; cualquier empalme entre regiones salvo los tres pares intencionales sobre el globo; `pageHeight` por encima del presupuesto del viewport y estado; en viewports táctiles `globeTouchAction !== 'pan-y'`; `minFontPx < 11`; con el explorador abierto, más de un lienzo vivo, globo sin difuminar (`explorerOpen && !globeBlurred`), explorador más ancho que la pantalla o con scroll horizontal interno; cualquier `pageerror`. `focused-city` usa el presupuesto de `inspect` si el clic abrió el explorador y el de `selected` si no.

| Viewport | overview | inspect | selected |
|---|---|---|---|
| desktop | 3760 | 4910 | 4480 |
| laptop | 3600 | 5050 | 4320 |
| tablet | 4400 | 6530 | 5110 |
| mobile-portrait | 5050 | 7990 | 5910 |
| mobile-landscape | 3620 | 4720 | 4340 |

Compilar localmente no publica cambios en GitHub Pages. El despliegue debe incluir el GLB y el catálogo del modelo ya utilizados por DRI.
