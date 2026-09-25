import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createBA400Controller } from './vendor/ba400-controls.mjs';
import type { BA400Controller } from './vendor/ba400-controls.mjs';
import { BA400_COVER_IDS, BA400_PART_BY_ID } from './ba400Mapping';

export interface Ba400View {
  associatedIds: string[]; primaryId: string | null; confirmed: boolean; discarded: boolean;
  coversHidden: boolean; isolated: boolean; explosion: number; focusToken: string;
  // Extensión opcional para Monitoreo: no cambia los colores ni los hallazgos de DRI.
  alarmMarkers?: { partId: string; label: string; tone: 'fatal' | 'warning' | 'unknown' }[];
  holographic?: boolean;
  autoRotate?: boolean;
}
export function ownedBounds(controller: BA400Controller, ids: string[]) {
  const bounds = new THREE.Box3();
  for (const id of ids) for (const mesh of controller.meshes(id)) {
    mesh.geometry.computeBoundingBox();
    if (mesh.geometry.boundingBox) bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  }
  return bounds;
}
export function setCoverVisibility(controller: BA400Controller, hidden: boolean, protectedIds: string[]) {
  const protectedSet = new Set(protectedIds);
  for (const id of BA400_COVER_IDS) {
    for (const mesh of controller.meshes(id)) mesh.visible = !hidden || protectedSet.has(id);
  }
}
export function disposeModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  textures.forEach(t => { t.dispose(); if (typeof ImageBitmap !== 'undefined' && t.image instanceof ImageBitmap) t.image.close(); });
}

export function createBa400Scene(host: HTMLElement, gltf: GLTF, onPick: (id: string) => void, onError: (error: string) => void) {
  const controller = createBA400Controller(gltf);
  const model = gltf.scene;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.005, 50);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(0x081923, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', 'Modelo 3D BA400. Arrastra para girar; usa los controles y el catálogo para seleccionar con teclado.');
  canvas.setAttribute('role', 'img');
  host.appendChild(canvas);
  const targetMarker = document.createElement('div');
  targetMarker.className = 'ba400-target-marker';
  targetMarker.setAttribute('aria-hidden', 'true');
  targetMarker.hidden = true;
  host.appendChild(targetMarker);
  const controls = new OrbitControls(camera, canvas);
  controls.autoRotateSpeed = 0.35;
  controls.enableDamping = true; controls.dampingFactor = 0.09;
  controls.minDistance = 0.045; controls.maxDistance = 12;
  controls.maxPolarAngle = Math.PI * 0.92;
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(environment, 0.04);
  scene.environment = envTarget.texture;
  environment.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xdaefff, 0x475a66, 1.3));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.8); keyLight.position.set(2, 4, 3); scene.add(keyLight);
  const rim = new THREE.DirectionalLight(0x65e9e6, 1.2); rim.position.set(-2, 2, -2); scene.add(rim);
  scene.add(model); model.updateMatrixWorld(true);
  const assembledBounds = new THREE.Box3().setFromObject(model);
  const modelCenter = assembledBounds.getCenter(new THREE.Vector3());
  const ringObjects: THREE.LineLoop[] = [];
  for (const radius of [1.05, 1.18]) {
    const pts = Array.from({ length: 128 }, (_, i) => new THREE.Vector3(Math.cos(i / 128 * Math.PI * 2) * radius, assembledBounds.min.y - 0.015, Math.sin(i / 128 * Math.PI * 2) * radius));
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x54ddd4, transparent: true, opacity: 0.22 }));
    ringObjects.push(ring); scene.add(ring);
  }
  const grid = new THREE.GridHelper(4, 32, 0x427a89, 0x284450);
  grid.position.y = assembledBounds.min.y - 0.018;
  (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = 0.2;
  scene.add(grid);
  const box = new THREE.Box3();
  const selectionBox = new THREE.Box3Helper(box, 0x8effed);
  (selectionBox.material as THREE.Material).depthTest = false;
  selectionBox.renderOrder = 10;
  selectionBox.visible = false;
  scene.add(selectionBox);
  const ghostOriginals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const highlighted = new Set<string>();
  const alarmButtons: { element: HTMLButtonElement; partId: string }[] = [];
  let markerSignature = '';
  const meshes: THREE.Mesh[] = [];
  model.traverse(node => { if (node instanceof THREE.Mesh) meshes.push(node); });
  // Materiales de presentación exclusivos del monitoreo; el GLB y DRI conservan sus originales.
  const hologramOriginals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const hologramEdges: { mesh: THREE.Mesh; line: THREE.LineSegments }[] = [];
  const edgeGeometries = new Map<THREE.BufferGeometry, THREE.EdgesGeometry>();
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x63e8ff, transparent: true, opacity: 0.52, depthWrite: false });
  function setHolographic(enabled: boolean) {
    if (enabled === (hologramOriginals.size > 0)) return;
    if (enabled) {
      for (const mesh of meshes) {
        hologramOriginals.set(mesh, mesh.material);
        mesh.material = new THREE.MeshBasicMaterial({ color: 0x29bce8, transparent: true, opacity: 0.065, depthWrite: false });
        // Evita calcular contornos de mallas de muy alta densidad; la superficie cian sigue visible.
        if (mesh.geometry.getAttribute('position').count > 20000) continue;
        let edges = edgeGeometries.get(mesh.geometry);
        if (!edges) { edges = new THREE.EdgesGeometry(mesh.geometry, 32); edgeGeometries.set(mesh.geometry, edges); }
        const line = new THREE.LineSegments(edges, edgeMaterial);
        line.matrixAutoUpdate = false;
        scene.add(line); hologramEdges.push({ mesh, line });
      }
    } else {
      for (const [mesh, material] of hologramOriginals) {
        (mesh.material as THREE.Material).dispose(); mesh.material = material;
      }
      hologramOriginals.clear();
      hologramEdges.forEach(({ line }) => scene.remove(line)); hologramEdges.length = 0;
      edgeGeometries.forEach(geometry => geometry.dispose()); edgeGeometries.clear();
    }
  }
  const raycaster = new THREE.Raycaster();
  let current: Ba400View | null = null;
  let focusToken = '';
  let tween: { from: THREE.Vector3; targetFrom: THREE.Vector3; to: THREE.Vector3; target: THREE.Vector3; started: number } | null = null;
  let frame = 0; let disposed = false; let inViewport = true; let dirty = true;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function restoreGhosts() {
    for (const [mesh, material] of ghostOriginals) {
      for (const copy of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) copy.dispose();
      mesh.material = material;
    }
    ghostOriginals.clear();
  }
  function ghost(mesh: THREE.Mesh) {
    if (ghostOriginals.has(mesh)) return;
    ghostOriginals.set(mesh, mesh.material);
    const clone = (material: THREE.Material) => {
      const copy = material.clone(); copy.transparent = true; copy.opacity = 0.07; copy.depthWrite = false; return copy;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
  }
  function revealFromCamera(view: Ba400View) {
    restoreGhosts();
    if (!view.primaryId || view.isolated || !view.coversHidden) return;
    const protectedIds = new Set([...view.associatedIds, view.primaryId]);
    const targetBounds = ownedBounds(controller, [view.primaryId]);
    if (targetBounds.isEmpty()) return;
    const center = targetBounds.getCenter(new THREE.Vector3());
    const targets = [center];
    for (const x of [targetBounds.min.x, targetBounds.max.x]) for (const y of [targetBounds.min.y, targetBounds.max.y]) for (const z of [targetBounds.min.z, targetBounds.max.z]) {
      targets.push(new THREE.Vector3(x, y, z).lerp(center, 0.15));
    }
    for (const target of targets) {
      const direction = target.clone().sub(camera.position); const distance = direction.length();
      raycaster.set(camera.position, direction.normalize()); raycaster.far = distance;
      for (const hit of raycaster.intersectObjects(meshes, false)) {
        const mesh = hit.object as THREE.Mesh;
        const id = controller.partId(mesh);
        if (mesh.visible && id && !protectedIds.has(id)) ghost(mesh);
      }
    }
    raycaster.far = Infinity;
  }
  function fit(ids: string[], immediate = false) {
    const bounds = ids.length ? ownedBounds(controller, ids) : new THREE.Box3().setFromObject(model);
    if (bounds.isEmpty()) return;
    const target = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, ids.length ? (current?.isolated ? 0.006 : 0.30) : 0.5);
    const limitingFov = Math.min(THREE.MathUtils.degToRad(camera.fov), 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
    const distance = radius / Math.sin(limitingFov / 2) * (ids.length ? 1.55 : 1.06);
    // Look from the nearest exterior side, with an elevated view of internal assemblies.
    const direction = ids.length
      ? new THREE.Vector3(target.x - modelCenter.x, 0.75, target.z - modelCenter.z).normalize()
      : new THREE.Vector3(1.3, 0.85, 1.7).normalize();
    const to = target.clone().addScaledVector(direction, distance);
    if (immediate || reducedMotion) { camera.position.copy(to); controls.target.copy(target); controls.update(); tween = null; }
    else tween = { from: camera.position.clone(), targetFrom: controls.target.clone(), to, target, started: performance.now() };
    dirty = true;
  }
  let previousSize = '';
  function resize() {
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height; camera.updateProjectionMatrix();
    renderer.setSize(width, height, false); dirty = true;
    const sizeKey = `${width}:${height}`;
    if (current && sizeKey !== previousSize) fit(current.primaryId ? [current.primaryId] : [], true);
    previousSize = sizeKey;
  }
  resize(); fit([], true);
  function setView(view: Ba400View) {
    const explosionChanged = current?.explosion !== view.explosion;
    current = view;
    const nextSignature = JSON.stringify(view.alarmMarkers || []);
    if (nextSignature !== markerSignature) {
      markerSignature = nextSignature;
      alarmButtons.forEach(({ element }) => element.remove());
      alarmButtons.length = 0;
      for (const marker of view.alarmMarkers || []) {
        if (!BA400_PART_BY_ID.has(marker.partId)) continue;
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'monitor-alarm-anchor';
        element.dataset.tone = marker.tone;
        element.dataset.partId = marker.partId;
        element.textContent = marker.label;
        element.setAttribute('aria-label', `${marker.label}: ${BA400_PART_BY_ID.get(marker.partId)?.name}. Referencia de conjunto`);
        element.addEventListener('click', () => onPick(marker.partId));
        host.appendChild(element);
        alarmButtons.push({ element, partId: marker.partId });
      }
    }
    restoreGhosts();
    for (const id of highlighted) controller.clearHighlight(id);
    highlighted.clear();
    setHolographic(!!view.holographic);
    controller.showAll(); controller.setExplosion(view.explosion);
    if (view.isolated && view.primaryId) controller.showOnly(view.primaryId);
    else setCoverVisibility(controller, view.coversHidden, view.primaryId ? [...view.associatedIds, view.primaryId] : view.associatedIds);
    if (!view.discarded) for (const id of view.associatedIds) {
      controller.highlight(id, view.confirmed ? 0xff677a : 0xf4b850, 0.6); highlighted.add(id);
    }
    if (view.primaryId) {
      controller.highlight(view.primaryId, 0x4affdf, 0.8); highlighted.add(view.primaryId);
      box.copy(ownedBounds(controller, [view.primaryId])).expandByScalar(0.006);
      selectionBox.visible = !box.isEmpty();
    } else selectionBox.visible = false;
    // En Monitoreo, la gravedad reportada prevalece sobre el color de selección.
    for (const marker of view.alarmMarkers || []) {
      controller.highlight(marker.partId, marker.tone === 'fatal' ? 0xff546d : marker.tone === 'warning' ? 0xffbd58 : 0x9cabb8, 0.75);
      highlighted.add(marker.partId);
      if (view.holographic) for (const mesh of controller.meshes(marker.partId)) {
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.opacity = 0.24;
      }
    }
    if (focusToken !== view.focusToken || explosionChanged) {
      focusToken = view.focusToken;
      fit(view.primaryId ? [view.primaryId] : []);
    }
    if (!tween) revealFromCamera(view);
    dirty = true;
  }
  let pointerStart = new THREE.Vector2();
  function onDown(event: PointerEvent) { pointerStart = new THREE.Vector2(event.clientX, event.clientY); }
  function onUp(event: PointerEvent) {
    if (event.button !== 0 || pointerStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) return;
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
    const hit = raycaster.intersectObjects(meshes, false).find(hit => {
      const mesh = hit.object as THREE.Mesh;
      const id = controller.partId(mesh);
      return mesh.visible && !ghostOriginals.has(mesh) && id && BA400_PART_BY_ID.has(id);
    });
    if (hit) { const id = controller.partId(hit.object); if (id) onPick(id); }
  }
  function controlStart() { tween = null; }
  function controlEnd() { if (current) revealFromCamera(current); dirty = true; }
  function controlChange() { dirty = true; }
  function contextLost(event: Event) {
    event.preventDefault();
    onError('Se perdió el contexto gráfico. Puedes reactivar el visor sin cambiar el diagnóstico.');
  }
  controls.addEventListener('start', controlStart); controls.addEventListener('end', controlEnd); controls.addEventListener('change', controlChange);
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('webglcontextlost', contextLost);
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
  const intersectionObserver = new IntersectionObserver(entries => { inViewport = entries[0]?.isIntersecting ?? true; dirty = true; }); intersectionObserver.observe(host);
  let previousFrameTime = 0;
  function render(now: number) {
    if (disposed) return;
    frame = requestAnimationFrame(render);
    const deltaSeconds = Math.min((now - previousFrameTime) / 1000, 0.05);
    previousFrameTime = now;
    if (!inViewport || document.hidden) return;
    if (tween) {
      const t = Math.min(1, (now - tween.started) / 680); const eased = t * t * (3 - 2 * t);
      camera.position.lerpVectors(tween.from, tween.to, eased);
      controls.target.lerpVectors(tween.targetFrom, tween.target, eased);
      dirty = true;
      if (t === 1) { tween = null; if (current) revealFromCamera(current); }
    }
    controls.autoRotate = !!current?.autoRotate && !tween && !reducedMotion;
    controls.update(deltaSeconds);
    if (dirty) {
      for (const { mesh, line } of hologramEdges) {
        line.matrix.copy(mesh.matrixWorld);
        line.visible = mesh.visible && !ghostOriginals.has(mesh);
      }
      renderer.render(scene, camera);
      // Las etiquetas siguen la posición real de cada conjunto al girar o expandir el modelo.
      for (const marker of alarmButtons) {
        const bounds = ownedBounds(controller, [marker.partId]);
        const point = bounds.getCenter(new THREE.Vector3()).project(camera);
        marker.element.hidden = bounds.isEmpty() || (!!current?.isolated && current.primaryId !== marker.partId)
          || point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1;
        marker.element.style.left = `${(point.x + 1) / 2 * host.clientWidth}px`;
        marker.element.style.top = `${(1 - point.y) / 2 * host.clientHeight}px`;
      }
      targetMarker.hidden = !selectionBox.visible || !!current?.isolated;
      if (!targetMarker.hidden) {
        const point = box.getCenter(new THREE.Vector3()).project(camera);
        targetMarker.style.left = `${(point.x + 1) / 2 * host.clientWidth}px`;
        targetMarker.style.top = `${(1 - point.y) / 2 * host.clientHeight}px`;
        targetMarker.hidden = point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1;
      }
      dirty = false;
    }
  }
  frame = requestAnimationFrame(render);
  return {
    setView,
    dispose() {
      disposed = true; cancelAnimationFrame(frame);
      resizeObserver.disconnect(); intersectionObserver.disconnect();
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('webglcontextlost', contextLost);
      controls.removeEventListener('start', controlStart); controls.removeEventListener('end', controlEnd); controls.removeEventListener('change', controlChange);
      controls.dispose(); restoreGhosts(); controller.dispose(); setHolographic(false); edgeMaterial.dispose(); disposeModel(model);
      selectionBox.geometry.dispose(); (selectionBox.material as THREE.Material).dispose();
      grid.geometry.dispose(); (grid.material as THREE.Material).dispose();
      ringObjects.forEach(ring => { ring.geometry.dispose(); (ring.material as THREE.Material).dispose(); });
      envTarget.dispose(); scene.clear(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); targetMarker.remove();
      alarmButtons.forEach(({ element }) => element.remove());
    },
  };
}
