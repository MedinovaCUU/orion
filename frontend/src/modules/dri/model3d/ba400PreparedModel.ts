import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { loadBa400Bytes } from './ba400ModelCache';
import { disposeModel } from './ba400Scene';

// Una sola escena GLTF analizada queda residente mientras haya visores que la reserven (Monitoreo y DRI la comparten:
// cada visor devuelve el modelo a su estado base al cerrarse, ver createBa400Scene().dispose({ retainModel: true })).
// Sin reservas se destruye tras BA400_MODEL_IDLE_MS. En equipos con poca memoria (navigator.deviceMemory < 4) no hay
// residencia: cada visor recibe propiedad exclusiva y destruye el modelo al desmontarse, como antes.
export const BA400_MODEL_IDLE_MS = 5 * 60 * 1000;

interface PreparedSlot {
  promise: Promise<GLTF>;
  model: GLTF | null;
  leases: number;
  timer?: ReturnType<typeof setTimeout>;
}
let prepared: PreparedSlot | null = null;
const parseModel = async () => new GLTFLoader().parseAsync(await loadBa400Bytes(), '');

/** Residencia desactivada cuando el navegador declara menos de 4 GiB (navigator.deviceMemory). */
export function isBa400ModelResidencyEnabled() {
  const memory = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return !(typeof memory === 'number' && memory < 4);
}

function scheduleIdleDispose(slot: PreparedSlot) {
  clearTimeout(slot.timer);
  slot.timer = setTimeout(() => {
    slot.timer = undefined;
    if (prepared !== slot || slot.leases > 0) return;
    prepared = null;
    if (slot.model) disposeModel(slot.model.scene);
  }, BA400_MODEL_IDLE_MS);
}

function createSlot(): PreparedSlot {
  const slot: PreparedSlot = { promise: parseModel(), model: null, leases: 0 };
  prepared = slot;
  void slot.promise.then(model => {
    slot.model = model;
    // Libera la escena si nadie la abre; los bytes descargados siguen en la caché común.
    if (prepared === slot && slot.leases === 0) scheduleIdleDispose(slot);
  }).catch(() => { if (prepared === slot) prepared = null; });
  return slot;
}

/** Descarga y analiza el GLB en segundo plano; no crea un contexto WebGL oculto. */
export function prepareBa400Model() {
  return (prepared ?? createSlot()).promise;
}

/**
 * Reserva el modelo residente (lo analiza si aún no existe) y pospone su liberación mientras dure la reserva.
 * Cada reserva se devuelve con releaseBa400Model. Sin residencia equivale a takeBa400Model (propiedad exclusiva).
 */
export function acquireBa400Model(): Promise<GLTF> {
  if (!isBa400ModelResidencyEnabled()) return takeBa400Model();
  const slot = prepared ?? createSlot();
  slot.leases += 1;
  clearTimeout(slot.timer); slot.timer = undefined;
  return slot.promise.then(
    model => { slot.model = model; return model; },
    (error: unknown) => { slot.leases = Math.max(0, slot.leases - 1); throw error; },
  );
}

/**
 * Devuelve una reserva. `true`: el modelo sigue residente (otro visor lo usa o espera reutilización) y quien llama NO
 * debe destruirlo (dispose({ retainModel: true })). `false`: quien llama tiene propiedad exclusiva y debe destruirlo.
 */
export function releaseBa400Model(model: GLTF): boolean {
  const slot = prepared;
  if (!slot || slot.model !== model) return false;
  slot.leases = Math.max(0, slot.leases - 1);
  if (slot.leases === 0) scheduleIdleDispose(slot);
  return true;
}

/**
 * API previa, conservada por compatibilidad: transfiere propiedad exclusiva y quien llama destruye el modelo.
 * Si el residente está reservado por otro visor se analiza una copia propia para no compartir geometrías desechables.
 * @deprecated Usa acquireBa400Model/releaseBa400Model.
 */
export function takeBa400Model(): Promise<GLTF> {
  const slot = prepared;
  if (!slot || slot.leases > 0) return parseModel();
  prepared = null;
  clearTimeout(slot.timer);
  return slot.promise;
}

/** Lectura de diagnóstico para pruebas: estado de la residencia, sin efectos secundarios. */
export function inspectBa400ModelResidency() {
  const slot = prepared;
  let meshes = 0, hiddenMeshes = 0, explodedParts = 0;
  slot?.model?.scene.traverse(node => {
    if ((node as { isMesh?: boolean }).isMesh) { meshes += 1; if (!node.visible) hiddenMeshes += 1; }
    const assembled = node.userData?.assembled_translation as number[] | undefined;
    if (assembled && (Math.abs(node.position.x - assembled[0]) + Math.abs(node.position.y - assembled[1]) + Math.abs(node.position.z - assembled[2])) > 1e-6) explodedParts += 1;
  });
  return {
    enabled: isBa400ModelResidencyEnabled(),
    resident: !!slot?.model,
    pending: !!slot && !slot.model,
    leases: slot?.leases ?? 0,
    idleTimerArmed: !!slot?.timer,
    detached: slot?.model ? slot.model.scene.parent === null : null,
    meshes, hiddenMeshes, explodedParts,
  };
}
