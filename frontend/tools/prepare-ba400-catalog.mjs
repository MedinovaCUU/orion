import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBA400Controller } from '../src/modules/dri/model3d/vendor/ba400-controls.mjs';

// The GLB is authoritative for identifiers, labels, service codes and geometry.
// Retain only collection labels from the previous catalog when part_id survives.
const folder = new URL('../public/models/ba400/', import.meta.url);
const source = new URL('../src/modules/dri/model3d/', import.meta.url);
const previous = JSON.parse(await fs.readFile(new URL('componentes.json', folder), 'utf8'));
const previousById = new Map(previous.componentes.map(p => [p.id, p]));
const bytes = await fs.readFile(new URL('BA400_web.glb', folder));
const sha256 = createHash('sha256').update(bytes).digest('hex');
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const control = createBA400Controller(gltf);
gltf.scene.updateMatrixWorld(true);
const components = control.ids().map(id => {
  const node = control.get(id), data = node.userData;
  const bounds = new Box3();
  for (const mesh of control.meshes(id)) {
    mesh.geometry.computeBoundingBox();
    bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  }
  if (bounds.isEmpty()) throw new Error(`Component without geometry: ${id}`);
  for (const key of ['assembled_translation', 'exploded_translation']) {
    if (!Array.isArray(data[key]) || data[key].length !== 3 || !data[key].every(Number.isFinite)) throw new Error(`Invalid ${key}: ${id}`);
  }
  return { id, nodo: node.name, nombre: data.label || id, codigo_servicio: data.service_code || data.codigo_servicio || '',
    coleccion: previousById.get(id)?.coleccion || 'Sin clasificación en el modelo',
    pivote: node.parent?.name || '', bounds_gltf: [bounds.min.toArray(), bounds.max.toArray()],
    centro_gltf: bounds.getCenter(new Vector3()).toArray(), desplazamiento_explosion: data.explosion_offset_world,
    fuente: 'BA400_web.glb · extras y geometría; colección previa cuando existe' };
});
if (new Set(components.map(p => p.id)).size !== components.length) throw new Error('Duplicate part_id');
const rows = components.map(p => ({ id: p.id, name: p.nombre, serviceCode: p.codigo_servicio, collection: p.coleccion }));
await fs.writeFile(new URL('componentes.json', folder), JSON.stringify({ modelo: 'BA400v2', unidades: 'metros', eje_vertical: 'Y', animacion: 'Explosion', source_sha256: sha256, componentes: components }, null, 2) + '\n');
await fs.writeFile(new URL('ba400Parts.generated.json', source), JSON.stringify(rows, null, 2) + '\n');
await fs.writeFile(new URL('ba400Model.generated.json', source), JSON.stringify({ sha256, bytes: bytes.byteLength, partCount: rows.length }, null, 2) + '\n');
control.dispose();
console.log(JSON.stringify({ parts: rows.length, bytes: bytes.byteLength, sha256, added: rows.filter(p => !previousById.has(p.id)).map(p => p.id), removed: [...previousById.keys()].filter(id => !control.ids().includes(id)) }, null, 2));
