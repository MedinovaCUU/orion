> Actualización de Orion: el GLB actual tiene 318 componentes (81 356 700 bytes).
> El catálogo se regeneró desde sus metadatos y geometría. La guía y el informe de
> verificación que siguen proceden del ZIP original de 309 piezas; son históricos.
> Las pruebas actuales están en frontend/tests y la documentación en
> frontend/docs/DRI_BA400_3D.md.

# BA400 para web

Usa **BA400_web.glb**. Contiene el equipo completo montado, sus materiales y
309 componentes funcionales identificados por `part_id`. Es glTF 2.0 binario,
autocontenido, de 81.6 MB (77.8 MiB), con el mismo detalle geométrico del modelo
original. No necesita archivos de textura ni decodificadores Draco/Meshopt.

La animación integrada **Explosion** dura dos segundos: empieza montado y termina
separado. Es un despiece visual radial, no una secuencia mecánica de desmontaje.
El bastidor permanece fijo. Puedes controlar el porcentaje desde un slider o
reproducir la animación con el motor 3D de tu página.

## Integración con Three.js

Instala `three` en tu proyecto. Copia el GLB, `ba400-controls.mjs` y
`orion_highlight.mjs` a rutas públicas de tu aplicación. Ejemplo dentro de tu visor:

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBA400Controller } from './ba400-controls.mjs';

const gltf = await new GLTFLoader().loadAsync('/models/BA400_web.glb');
scene.add(gltf.scene); // La escena de tu visor.
const ba400 = createBA400Controller(gltf);

ba400.setExplosion(0.65);             // 0 montado; 1 explosionado.
ba400.setExplosion(0);                // Volver a montar.
ba400.showOnly('rotor_pm');           // Aislar una pieza.
ba400.showOnly(['rotor_pm', 'torn_rxn']); // Aislar varias.
ba400.showAll();                      // Recuperar visibilidad inicial.
ba400.highlight('filtro_340');         // Resaltar un componente.
ba400.clearHighlight('filtro_340');
ba400.reset();                       // Montaje, visibilidad y materiales iniciales.

// Para identificar un componente al pulsarlo con el raycaster:
const id = ba400.partId(intersection.object);
// Para encuadrarlo con tu cámara, usa solo sus propias mallas:
const meshes = ba400.meshes(id);
```

El controlador no crea cámaras, controles de órbita ni bucle de renderizado.
`showOnly()` cambia visibilidad; tu visor debe ajustar el encuadre de la cámara.
Sirve los archivos por HTTP(S). El GLB usa metros y eje vertical Y.

También puedes reproducir `gltf.animations.find(a => a.name === 'Explosion')`
con `AnimationMixer`; usa `LoopOnce` y `clampWhenFinished = true`. No ejecutes
simultáneamente el mixer y `setExplosion()` sobre este modelo porque ambos
controlan las mismas posiciones. Los controladores nativos de Blender no se
ejecutan en web; esta animación sí está guardada en el GLB.

`componentes.json` contiene nombres, códigos de servicio, límites de cada pieza
y desplazamientos del despiece. Usa `part_id`, no el índice de una malla ni
el material, para asociar fallas con componentes. Una pieza puede contener
varias primitivas de material. Los nodos `p_…` son pivotes técnicos.

Las pruebas con GLTFLoader y AnimationMixer de Three.js 0.186.0 comprobaron
309 identificadores, los extremos e interpolación del despiece, retorno al
montaje, aislamiento de piezas anidadas y resaltado independiente. El validador
glTF de Khronos informó cero errores y cero avisos. No se ha integrado todavía
en la página web de Orion. El informe está en `verificacion_web.json`.

Documentación oficial:
[GLTFLoader](https://threejs.org/docs/#examples/en/loaders/GLTFLoader),
[AnimationMixer](https://threejs.org/docs/#api/en/animation/AnimationMixer).
