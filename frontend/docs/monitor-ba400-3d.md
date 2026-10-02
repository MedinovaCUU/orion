# Monitoreo espacial BA400

## Uso

1. Abrir el módulo Monitoreo.
2. Seleccionar explícitamente un equipo con serie numérica que empiece por `83400` y estado `fatal` o `warning`. La selección desde el globo o desde la lista de alertas abre su vista espacial.
3. También se puede usar **Explorar alarmas en 3D** en la ficha de cualquier BA400, incluso sin alarmas.
4. Seleccionar una tarjeta o una etiqueta del modelo para enfocar su conjunto. Se puede girar, acercar, ocultar cubiertas, aislar el conjunto o ajustar el despiece visual.
5. Las cubiertas aparecen colocadas por defecto. **Ocultar cubiertas** permite ver el interior y el mismo botón las restaura. Seleccionar una alarma no cambia esta preferencia.
6. Los controles aparecen sobre el modelo al pasar el puntero o darles foco con el teclado; en dispositivos táctiles permanecen visibles. Se conserva el slider de despiece.
7. El mapa permanece como fondo continuo, visible e interactivo a la izquierda del panel de cristal superpuesto. En móvil se coloca encima. Cerrar con **Cerrar** o Escape desde el panel devuelve el espacio completo al mapa.
8. En **Vista general**, las tarjetas se distribuyen a ambos lados del modelo, hasta seis por página. Las líneas conectan con la proyección real del conjunto y lo siguen al girar o aplicar despiece. Los códigos sin correspondencia no tienen línea ni una pieza arbitraria.
9. **Eventos** permite consultar la lista completa. Cambiar de vista no vuelve a descargar ni desmonta el modelo. En móvil las tarjetas se apilan debajo del modelo para dejar libre la exploración táctil.

La selección automática inicial no abre el panel. Al entrar al módulo con permiso de mapa se inicia una precarga silenciosa del modelo BA400. BA200, A15, A25 y los nodos simulados del globo no reciben el visor BA400.

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

- `EquipmentMonitoring.tsx`: apertura por selección explícita y paso del corte actualizado.
- `Ba400AlarmPanel.tsx`: región accesible no modal, tarjetas, estados de selección y controles del modelo.
- `ba400AlarmPanel.css`: cristal translúcido, colores de gravedad y adaptación móvil.
- `AlarmSpatialConnectors.tsx`: líneas SVG actualizadas a partir de las etiquetas proyectadas por el motor 3D; no usa coordenadas ilustrativas fijas ni añade otro bucle continuo de renderizado.
- `ba400AlarmMapping.ts`: identificación por serie y asociaciones explícitas código/conjunto.
- `Ba400Canvas.tsx`, `ba400ModelCache.ts` y `ba400PreparedModel.ts` de DRI: descarga compartida y preparación silenciosa del mismo GLB, sin duplicar el archivo. Una escena preparada se entrega a un único visor para evitar compartir recursos que otro visor pueda liberar.
- `ba400Scene.ts`: opciones `holographic` y `alarmMarkers`, desactivadas por defecto para conservar la presentación de DRI. Restaura materiales y libera recursos al cerrar.
- `GlobalEquipmentGlobe.tsx`: renderizado bajo demanda durante la inspección, manteniendo la interacción del mapa sin animarlo continuamente.

El marco angular, los símbolos esquemáticos y las tarjetas cian reproducen el lenguaje visual de las referencias. Las tarjetas cian informan sobre la fuente y la cobertura de localización, no certifican que un subsistema esté operativo. La cámara del mapa desplaza su proyección durante la inspección para que la ubicación permanezca a la izquierda del panel; las coordenadas de los equipos no se modifican.

El GLB actual ocupa 81 356 700 bytes (aproximadamente 77,6 MiB). Se descarga al entrar al módulo y sus bytes se reutilizan durante la sesión de la página; no se descarga con cada refresco. También se analiza en segundo plano, sin crear un contexto WebGL oculto. Si nadie abre la escena preparada durante cinco minutos se libera esa escena, conservando los bytes. La preparación no garantiza espera cero si se selecciona antes de terminar la descarga, si caduca la escena o durante la inicialización de la GPU. La vista requiere WebGL. Si falla la precarga no se muestra una notificación; al abrir el visor se puede reintentar y las tarjetas siguen disponibles.

## DEMO en Supabase

El script `tools/monitor-visual-demo.mjs` utiliza la sesión autenticada de Supabase CLI contra `mzgrifkunevgestihlmh`, sin guardar credenciales. Crea exclusivamente el equipo virtual `834009999999`, modelo `BA400 [DEMO]`, identificado como DEMO en el mapa y el panel. Su ubicación ilustrativa es Chihuahua, no un laboratorio real. No modifica analizadores instalados ni añade consumos.

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
node tests/ba400-model.test.mjs
node node_modules/typescript/bin/tsc -b --pretty false
node node_modules/vite/bin/vite.js build
```

Con un servidor Vite local disponible:

```sh
MONITOR_TEST_ORIGIN=http://127.0.0.1:5174 node tests/ba400-monitor-browser.test.mjs
```

Las pruebas de navegador montan el componente real mediante `tests/fixtures/monitor.tsx` en un documento interceptado. Las respuestas de Supabase son simuladas y las escrituras se bloquean. Esta entrada no se añade a las rutas de producción. Las capturas se guardan en `outputs/monitor-hologram`.

Compilar localmente no publica cambios en GitHub Pages. El despliegue debe incluir el GLB y el catálogo del modelo ya utilizados por DRI.
