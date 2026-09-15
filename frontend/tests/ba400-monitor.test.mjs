import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
try {
  const { isBa400Serial, resolveBa400Alarm, BA400_ALARM_LOCATIONS, alarmTone, alarmKey } = await vite.ssrLoadModule('/src/modules/equipment-monitoring/ba400AlarmMapping.ts');
  const { BA400_PART_BY_ID } = await vite.ssrLoadModule('/src/modules/dri/model3d/ba400Mapping.ts');
  const catalog = JSON.parse(await fs.readFile(new URL('../../tools/ba400-log-monitor/error-catalog.json', import.meta.url)));
  assert(isBa400Serial('834001902')); assert(isBa400Serial(' 83400 1902 '));
  for (const serial of ['832001902', '831050012', '831010012', 'BA400', '83400invalid', '83400']) assert(!isBa400Serial(serial));
  const seen = new Set();
  for (const row of BA400_ALARM_LOCATIONS) {
    assert(BA400_PART_BY_ID.has(row.partId), row.partId);
    for (const code of row.codes) { assert(catalog[code], code); assert(!seen.has(code), code); seen.add(code); }
  }
  for (const [code, id] of [['203', 'brazo_r1'], ['E:213', 'brazo_r2'], ['223', 'brazo_s'], ['541', 'rotor_pm'], ['70', 'tapa_sup']]) {
    assert.equal(resolveBa400Alarm({ codigo_error: code })?.partId, id);
  }
  for (const code of [null, '0', '99', '999', '203;E:213', 'E203b', '108', '61']) {
    assert.equal(resolveBa400Alarm({ codigo_error: code, descripcion_error: 'BR1 Collision brazo_r1 AC16614' }), null);
  }
  assert.equal(alarmTone({ tipo_mensaje: null }), 'unknown');
  assert.equal(alarmTone({ tipo_mensaje: 'Fatal' }), 'fatal');
  assert.equal(alarmKey({ id: -1, codigo_error: '203' }), alarmKey({ id: -88, codigo_error: '203' }));
  console.log(`PASS: identificación BA400, ${seen.size} códigos explícitos válidos, piezas existentes, desconocidos sin asociación y claves estables.`);
} finally { await vite.close(); }
