import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBA400Controller } from '../src/modules/dri/model3d/vendor/ba400-controls.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, cacheDir: 'node_modules/.vite-ba400-tests', server: { middlewareMode: true }, appType: 'custom' });
const checks = [];
// The DRI engine emits verbose trace logs; keep the test report machine-readable.
console.info = () => {}; console.debug = () => {}; console.warn = () => {};
const print = console.log; console.log = () => {};
const check = (name, fn) => { fn(); checks.push(name); };
try {
  const { resolveBa400Finding, BA400_RULE_LOCATIONS, BA400_PART_BY_ID } = await vite.ssrLoadModule('/src/modules/dri/model3d/ba400Mapping.ts');
  const { ownedBounds, setCoverVisibility, disposeModel } = await vite.ssrLoadModule('/src/modules/dri/model3d/ba400Scene.ts');
  const { runDriEngine, DRI_VALIDATION_FIXTURES, runDriValidationFixtures } = await vite.ssrLoadModule('/src/modules/dri/driEngine.ts');
  const { DRI_WORKBOOK_SEED } = await vite.ssrLoadModule('/src/modules/dri/driWorkbookSeed.generated.ts');
  const { enrichCatalogWithReagentIdentity } = await vite.ssrLoadModule('/src/modules/dri/knowledge/reagentIdentity.ts');
  const catalog = enrichCatalogWithReagentIdentity({ reagents: DRI_WORKBOOK_SEED.reagents, factors: DRI_WORKBOOK_SEED.factors, links: DRI_WORKBOOK_SEED.factorLinks }, { catalogRows: [], aliasRows: [] });
  const sourceCatalog = JSON.parse(await fs.readFile(new URL('../public/models/ba400/componentes.json', import.meta.url), 'utf8'));
  check('Generated catalog exactly preserves supplied identifiers, labels and service codes', () => {
    for (const part of sourceCatalog.componentes) {
      assert.deepEqual(BA400_PART_BY_ID.get(part.id), { id: part.id, name: part.nombre, serviceCode: part.codigo_servicio, collection: part.coleccion });
    }
  });
  const original = runDriEngine(DRI_VALIDATION_FIXTURES[0].input, catalog);
  const optical = original.hypotheses.find(h => h.matchedRuleIds.includes('ba400_optical_photometry'));
  assert(optical, 'Real DRI fixture must generate optical result');
  check('Real DRI fixture → optical rule → banco_opt / AC16614, still a suspicion', () => {
    assert.equal(optical.status, 'generated');
    const result = resolveBa400Finding('BA400', optical);
    assert.deepEqual(result.associations.map(a => a.partId), ['banco_opt']);
    assert.equal(BA400_PART_BY_ID.get('banco_opt').serviceCode, 'AC16614');
  });
  const synthetic = (patch) => ({ ...optical, key: 'TEST-ONLY', matchedRuleIds: [], candidateParts: [], ...patch });
  check('Exact service code identifies one component, prose never does', () => {
    assert.deepEqual(resolveBa400Finding('BA400', synthetic({ candidateParts: ['AC16606'] })).associations.map(a => a.partId), ['filtro_340']);
    assert.equal(resolveBa400Finding('BA400', synthetic({ title: 'AC16606 filtro_340 averiado', candidateParts: ['Revisar AC16606'] })).associations.length, 0);
  });
  check('One service code maps to all five physical check valves', () => {
    assert.deepEqual(resolveBa400Finding('BA400', synthetic({ candidateParts: ['AC17307'] })).associations.map(a => a.partId), ['check_01', 'check_02', 'check_03', 'check_04', 'check_05']);
  });
  check('No mapping is created for fluidics, unknowns, BA200 or A15', () => {
    assert.equal(resolveBa400Finding('BA400', synthetic({ matchedRuleIds: ['ba400_fluidics_pipetting'], candidateParts: ['Válvula'] })).associations.length, 0);
    assert.equal(resolveBa400Finding('BA200', optical).associations.length, 0);
    assert.equal(resolveBa400Finding('A15', optical).associations.length, 0);
  });
  check('All curated anchors exist and service identities agree', () => {
    for (const entry of BA400_RULE_LOCATIONS) {
      for (const id of entry.partIds) assert(BA400_PART_BY_ID.has(id));
      for (const code of entry.serviceCodes) assert(entry.partIds.some(id => BA400_PART_BY_ID.get(id).serviceCode === code));
    }
  });
  check('Mapping never mutates diagnostic state, including confirmation/discarding', () => {
    for (const status of ['generated', 'reviewed', 'confirmed', 'discarded']) {
      const finding = synthetic({ status, candidateParts: ['AC16606'] }); const before = JSON.stringify(finding);
      resolveBa400Finding('BA400', finding); assert.equal(JSON.stringify(finding), before);
    }
  });
  const bytes = await fs.readFile(new URL('../public/models/ba400/BA400_web.glb', import.meta.url));
  check('GLB matches the supplied SHA-256 and byte length', () => {
    assert.equal(bytes.byteLength, 81356700);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), '02074ca50ac28798f26b324f8218cb3d0dacf64b7714b4acc0fab977bf4e16b3');
  });
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const control = createBA400Controller(gltf);
  const partIds = control.ids();
  check('GLB: all 318 catalog part_ids, stable ownership and technical pivots excluded', () => {
    assert.equal(partIds.length, 318); assert.equal(new Set(partIds).size, 318);
    for (const id of partIds) assert(BA400_PART_BY_ID.has(id));
    gltf.scene.traverse(node => { if (node.name.startsWith('p_')) assert(!node.userData.part_id); });
    assert(gltf.animations.some(a => a.name === 'Explosion'));
  });
  check('New ISE and hose components are selectable, retired ids are removed', () => {
    for (const id of ['ise_01', 'ise_rot_01', 'ise_tubo_01', 'ise_tapa_01', 'soporte_ise', 'ventana_dos', 'tubo_dos_r2_sal']) {
      assert(control.meshes(id).length > 0, id);
      assert(BA400_PART_BY_ID.has(id), id);
      control.showOnly(id);
      for (const mesh of control.meshes(id)) assert(mesh.visible);
    }
    for (const id of ['JE1-B1', 'JE1-EV1', 'piston_r1', 'soporte_dos', 'cable_foto']) {
      assert.equal(control.get(id), null); assert.equal(BA400_PART_BY_ID.has(id), false);
    }
    control.showAll();
  });
  const originals = new Map();
  gltf.scene.traverse(n => { if (n.isMesh) originals.set(n, n.material); });
  check('Highlight clones shared materials, only own primitives, then restores them', () => {
    control.highlight('pcb_foto', 0x00ff00);
    for (const [mesh, material] of originals) {
      if (control.partId(mesh) === 'pcb_foto') assert.notEqual(mesh.material, material);
      else assert.equal(mesh.material, material);
    }
    control.clearHighlight('pcb_foto');
    for (const [mesh, material] of originals) assert.equal(mesh.material, material);
  });
  check('Nested led_340 keeps transform ancestors visible and owns only its meshes', () => {
    const led = control.get('led_340');
    assert.equal(led.parent.userData.part_id, 'pcb_foto');
    control.showOnly('led_340');
    gltf.scene.traverse(n => { if (n.isMesh) assert.equal(n.visible, control.partId(n) === 'led_340'); });
    for (let node = led; node; node = node.parent) assert(node.visible);
    assert(control.meshes('led_340').length > 0);
    assert(!ownedBounds(control, ['led_340']).isEmpty());
    control.showAll();
  });
  check('Internal optical component: covers hidden without hiding child transforms', () => {
    setCoverVisibility(control, true, ['filtro_340']);
    for (const mesh of control.meshes('tapa_opt')) assert.equal(mesh.visible, false);
    for (const mesh of control.meshes('filtro_340')) assert.equal(mesh.visible, true);
    for (const mesh of control.meshes('bastidor')) assert.equal(mesh.visible, true);
    setCoverVisibility(control, false, []);
  });
  const assembled = new Map(partIds.map(id => [id, control.get(id).getWorldPosition(new THREE.Vector3())]));
  check('Explosion at 50% uses supplied local translations once, including nested parts', () => {
    control.setExplosion(0.5);
    for (const id of partIds) {
      const node = control.get(id);
      const offset = new THREE.Vector3(...node.userData.explosion_offset_world).multiplyScalar(0.5);
      const expected = assembled.get(id).clone().add(offset);
      assert(node.getWorldPosition(new THREE.Vector3()).distanceTo(expected) < 0.00001, id);
    }
  });
  check('Changing highlight, isolation and explosion then reset restores the full model', () => {
    control.highlight('filtro_340'); control.highlight('led_340'); control.showOnly(['led_340', 'filtro_340']); control.setExplosion(1); control.reset();
    for (const id of partIds) assert(control.get(id).getWorldPosition(new THREE.Vector3()).distanceTo(assembled.get(id)) < 0.00001, id);
    for (const [mesh, material] of originals) { assert(mesh.visible); assert.equal(mesh.material, material); }
  });
  check('Graphics disposal releases model geometries/materials', () => {
    let geometryDisposed = 0, materialDisposed = 0;
    const g = new Set([...originals.keys()].map(m => m.geometry));
    const m = new Set([...originals.values()].flat());
    g.forEach(item => item.addEventListener('dispose', () => geometryDisposed++));
    m.forEach(item => item.addEventListener('dispose', () => materialDisposed++));
    control.dispose(); disposeModel(gltf.scene);
    assert.equal(geometryDisposed, g.size); assert.equal(materialDisposed, m.size);
  });
  const regressions = runDriValidationFixtures(catalog);
  print(JSON.stringify({ checks: checks.length, passed: checks, existingEngineFixtures: regressions.map(r => ({ id: r.id, passed: r.passed })) }, null, 2));
} finally { await vite.close(); }
