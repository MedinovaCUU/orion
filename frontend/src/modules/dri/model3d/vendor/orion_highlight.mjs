/** Helper for an existing Three.js glTF viewer. No network or global side effects. */
export function createPartController(model) {
  const parts = new Map();
  const originals = new Map();
  model.traverse(node => {
    const id = node.userData?.part_id;
    if (id && !parts.has(id)) parts.set(id, node);
  });
  function ownedMeshes(node, id, visit) {
    if (node.userData?.part_id && node.userData.part_id !== id) return;
    if (node.isMesh) visit(node);
    for (const child of node.children || []) ownedMeshes(child, id, visit);
  }
  function clear(id) {
    const node = parts.get(id);
    if (!node) return false;
    ownedMeshes(node, id, mesh => {
      if (!originals.has(mesh)) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
      mesh.material = originals.get(mesh);
      originals.delete(mesh);
    });
    return true;
  }
  return {
    ids: () => [...parts.keys()],
    highlight(id, color = 0xff301c, intensity = 1) {
      const node = parts.get(id);
      if (!node) return false;
      clear(id);
      ownedMeshes(node, id, mesh => {
        originals.set(mesh, mesh.material);
        const clone = m => {
          const copy = m.clone();
          if (copy.emissive) { copy.emissive.setHex(color); copy.emissiveIntensity = intensity; }
          else if (copy.color) copy.color.setHex(color);
          return copy;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
      });
      return true;
    },
    clear,
    setVisible(id, visible) { const n = parts.get(id); if (!n) return false; n.visible = visible; return true; },
    dispose() { for (const id of parts.keys()) clear(id); }
  };
}
// Example after loading BA400_orion.glb:
// const parts = createPartController(gltf.scene);
// parts.setVisible('tapa_opt', false);
// parts.setVisible('banco_opt', false);
// parts.highlight('filtro_340');
