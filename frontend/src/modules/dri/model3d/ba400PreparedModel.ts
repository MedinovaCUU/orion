import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { loadBa400Bytes } from './ba400ModelCache';
import { disposeModel } from './ba400Scene';

// Una escena preparada de un solo uso. No comparte geometrías desechables entre dos visores.
let prepared: { promise: Promise<GLTF>; timer?: ReturnType<typeof setTimeout> } | null = null;
const parseModel = async () => new GLTFLoader().parseAsync(await loadBa400Bytes(), '');

/** Descarga y analiza el GLB en segundo plano; no crea un contexto WebGL oculto. */
export function prepareBa400Model() {
  if (prepared) return prepared.promise;
  const slot = { promise: parseModel(), timer: undefined as ReturnType<typeof setTimeout> | undefined };
  prepared = slot;
  void slot.promise.then(model => {
    if (prepared !== slot) return;
    // Libera la escena si nunca se abre; los bytes descargados siguen en la caché común.
    slot.timer = setTimeout(() => {
      if (prepared === slot) { prepared = null; disposeModel(model.scene); }
    }, 5 * 60 * 1000);
  }).catch(() => { if (prepared === slot) prepared = null; });
  return slot.promise;
}

/** Transfiere propiedad exclusiva al visor, que la libera al desmontarse. */
export function takeBa400Model() {
  const slot = prepared;
  if (!slot) return parseModel();
  prepared = null;
  clearTimeout(slot.timer);
  return slot.promise;
}
