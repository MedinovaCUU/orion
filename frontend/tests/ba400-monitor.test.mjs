import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
try {
  const { ba400AlarmAntecedents, isBa400Serial, resolveBa400Alarm, BA400_ALARM_LOCATIONS, alarmTone, alarmKey, classifyBa400Alarm, ba400AlarmLocationLabel, BA400_ALARM_CATALOG } = await vite.ssrLoadModule('/src/modules/equipment-monitoring/ba400AlarmMapping.ts');
  const { BA400_PART_BY_ID } = await vite.ssrLoadModule('/src/modules/dri/model3d/ba400Mapping.ts');
  const catalog = JSON.parse(await fs.readFile(new URL('../../tools/ba400-log-monitor/error-catalog.json', import.meta.url)));
  assert(isBa400Serial('834001902')); assert(isBa400Serial(' 83400 1902 '));
  for (const serial of ['832001902', '831050012', '831010012', 'BA400', '83400invalid', '83400']) assert(!isBa400Serial(serial));
  const seen = new Set();
  for (const row of BA400_ALARM_LOCATIONS) {
    assert(BA400_PART_BY_ID.has(row.partId), row.partId);
    for (const code of row.codes) { assert(catalog[code], code); assert(!seen.has(code), code); seen.add(code); }
  }
  for (const [code, id] of [['203', 'brazo_r1'], ['E:213', 'brazo_r2'], ['E(213)', 'brazo_r2'], ['E:0213', 'brazo_r2'], ['108', 'pcb_r1'], ['660', 'SF1-B1'], ['702', 'jeringa_r2'], ['223', 'brazo_s'], ['541', 'cabezal_lav'], ['640', 'bascula_2'], ['650', 'bascula_1'], ['208', 'brazo_r1'], ['209', 'brazo_r1'], ['218', 'brazo_r2'], ['219', 'brazo_r2'], ['228', 'brazo_s'], ['229', 'brazo_s'], ['70', 'tapa_sup']]) {
    assert.equal(resolveBa400Alarm({ codigo_error: code })?.partId, id);
  }
  for (const code of [null, '0', '99', '999', '203;E:213', 'E203b', '20', '21', '720']) {
    assert.equal(resolveBa400Alarm({ codigo_error: code, descripcion_error: 'BR1 Collision brazo_r1 AC16614' }), null);
  }
  assert.deepEqual(Object.keys(BA400_ALARM_CATALOG).sort(), Object.keys(catalog).sort());
  for (const [code, entry] of Object.entries(BA400_ALARM_CATALOG)) {
    assert.equal(entry.description, catalog[code].description);
    assert(entry.target && entry.note);
  }
  for (const code of ['20', '21']) {
    assert.equal(classifyBa400Alarm({ codigo_error: code }).scope, 'consequence');
    assert.match(ba400AlarmLocationLabel({ codigo_error: code }), /Evento derivado.*Sin pieza/);
  }
  assert.match(ba400AlarmLocationLabel({ codigo_error: '213' }), /R2.*Ubicación 3D definida/);
  assert.match(ba400AlarmLocationLabel({ codigo_error: '613' }), /Ventilador SFX.*Sin ubicación/);
  assert.deepEqual(resolveBa400Alarm({ codigo_error: '61' }).partIds, ['ise_01', 'ise_02', 'ise_03']);
  const prior = { id: 1, codigo_error: '213', detected_at: '2026-10-08T10:00:00Z' };
  const aborted = { id: 2, codigo_error: '21', detected_at: '2026-10-08T10:00:01Z' };
  assert.deepEqual(ba400AlarmAntecedents(aborted, [prior, aborted]), [prior]);
  assert.deepEqual(ba400AlarmAntecedents(aborted, [prior, { ...prior, id: 3 }]), [prior]);
  assert.deepEqual(ba400AlarmAntecedents(aborted, [{ ...prior, detected_at: '2026-10-08T10:00:02Z' }]), []);
  assert.deepEqual(ba400AlarmAntecedents(aborted, [prior, { id: 4, codigo_error: '0', detected_at: '2026-10-08T10:00:00.500Z' }]), []);
  assert.deepEqual(ba400AlarmAntecedents({ ...aborted, detected_at: null }, [prior]), []);
  assert.deepEqual(ba400AlarmAntecedents(prior, [aborted]), []);
  assert.deepEqual(ba400AlarmAntecedents(aborted, [aborted, { ...prior, codigo_error: '99' }]), []);
  const bytes = await fs.readFile(new URL('../public/models/ba400/BA400_web.glb', import.meta.url));
  const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const meshIds = new Set(glb.nodes.filter(node => node.mesh !== undefined).map(node => node.extras?.part_id));
  for (const entry of BA400_ALARM_LOCATIONS) for (const id of entry.partIds) assert(meshIds.has(id), `GLB mesh missing: ${id}`);
  assert.equal(alarmTone({ tipo_mensaje: null }), 'unknown');
  assert.equal(alarmTone({ codigo_error: '213' }), 'fatal');
  assert.equal(alarmTone({ codigo_error: '301' }), 'warning');
  assert.equal(alarmTone({ tipo_mensaje: 'Fatal' }), 'fatal');
  assert.equal(alarmKey({ id: -1, codigo_error: '203' }), alarmKey({ id: -88, codigo_error: '203' }));
  console.log(`PASS: identificación BA400, ${seen.size} códigos explícitos válidos, piezas existentes, desconocidos sin asociación y claves estables.`);
} finally { await vite.close(); }
