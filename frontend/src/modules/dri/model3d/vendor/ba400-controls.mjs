import {createPartController} from './orion_highlight.mjs';

/** Pass the result of GLTFLoader for BA400_web.glb. No render loop is installed. */
export function createBA400Controller(gltf) {
  const root = gltf.scene, parts = new Map(), visibility = new Map(), meshes = [];
  root.traverse(node => {
    visibility.set(node, node.visible);
    if (node.userData?.part_id) parts.set(node.userData.part_id, node);
    if (node.isMesh) {
      if (node.children.length) throw new Error('This controller expects leaf meshes.');
      meshes.push(node);
    }
  });
  function partId(object) {
    for (let n = object; n; n = n.parent) {
      if (n.userData?.part_id) return n.userData.part_id;
      if (n === root) break;
    }
    return null;
  }
  const highlight = createPartController(root);
  function setExplosion(value) {
    if (!Number.isFinite(value)) throw new TypeError('Explosion must be a finite number.');
    const t = Math.max(0, Math.min(1, value));
    for (const node of parts.values()) {
      const a = node.userData.assembled_translation, b = node.userData.exploded_translation;
      node.position.set(...a.map((v, i) => v + (b[i] - v) * t));
    }
    root.updateMatrixWorld(true);
  }
  function showAll() { for (const [node, visible] of visibility) node.visible = visible; }
  function showOnly(ids) {
    const wanted = new Set(typeof ids === 'string' ? [ids] : ids);
    for (const id of wanted) if (!parts.has(id)) throw new Error(`Unknown component: ${id}`);
    // Keep transform ancestors visible, even when isolating a child of another part.
    root.traverse(node => { node.visible = node.isMesh ? wanted.has(partId(node)) : true; });
  }
  return {
    ids: () => [...parts.keys()],
    get: id => parts.get(id) || null,
    partId,
    meshes: id => meshes.filter(mesh => partId(mesh) === id),
    setExplosion,
    showOnly,
    showAll,
    highlight: highlight.highlight,
    clearHighlight: highlight.clear,
    reset() { setExplosion(0); showAll(); for (const id of parts.keys()) highlight.clear(id); },
    dispose() { setExplosion(0); showAll(); highlight.dispose(); }
  };
}
