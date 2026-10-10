// Derivaciones puras del módulo de monitoreo: lista de equipos, resumen en una pasada, filtro, orden de prioridad y firma del corte.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createMonitorMock } from './fixtures/monitorMock.mjs';

const vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
try {
  const { buildEquipmentList, buildSnapshotSignature, filterEquipments, sortByPriority, summarizeEquipments } = await vite.ssrLoadModule('/src/modules/equipment-monitoring/monitoringDerivations.ts');
  const now = new Date().toISOString();
  const mock = createMonitorMock({ now, extended: true });
  const geo = { geo_latitude: 28.632, geo_longitude: -106.0691, geo_precision: 'city', geo_locality_cache_key: 'chihuahua|chihuahua' };
  const snapshot = {
    equipments: [mock.first, mock.second, mock.quiet].map(item => ({ ...item, ...geo })).concat([mock.unlocated]),
    errors: mock.alarms.map((alarm, index) => ({ ...alarm, id: index + 1, numero_serie: mock.first.numero_serie, detected_at: now })),
    currentErrorStates: [
      ...[mock.first, mock.second].map(item => ({ numero_serie: item.numero_serie, estado_actual: 'fatal', tipo_mensaje: 'fatal', errores_activos: mock.alarms, last_event_at: now, updated_at: now })),
      { numero_serie: mock.quiet.numero_serie, estado_actual: 'ok', tipo_mensaje: 'ok', errores_activos: [], last_event_at: now, updated_at: now },
    ],
    supplies: [{ numero_serie: mock.quiet.numero_serie, updated_at: now, ultimo_evento_consumo_at: now, pack_ise_sn: 'P-1', ref_electrode: 'R', na_electrode: 'Na', k_electrode: null, cl_electrode: null, li_electrode: null }],
    reagentSummaries: [],
    rotors: [],
    bplRows: mock.bplRows,
    refreshedAt: now,
  };

  const equipments = buildEquipmentList(snapshot);
  const bySerial = new Map(equipments.map(item => [item.serial, item]));
  assert.equal(equipments.length, 4);
  const ba400 = bySerial.get('834001902');
  assert.equal(ba400.status, 'fatal'); assert.equal(ba400.isBa400, true); assert.equal(ba400.priorityRank, 0);
  assert.equal(ba400.priorityAlarmCount, 3, 'tres alarmas fatales vigentes');
  assert.equal(ba400.bpl?.tone, 'rejected'); assert.equal(ba400.monthlyTests, -1);
  assert(ba400.lastErrorTs > 0);
  assert.equal(bySerial.get('832001902').isBa400, false);
  assert.equal(bySerial.get('834001903').status, 'ok'); assert.equal(bySerial.get('834001903').priorityRank, 2);
  const unlocated = bySerial.get('851000777');
  assert.equal(unlocated.errorSource, 'none'); assert.equal(unlocated.priorityRank, 3); assert.equal(unlocated.geoPoint, null);

  // Resumen en una pasada: cuenta sobre todos los equipos, no solo el filtro.
  assert.deepEqual(summarizeEquipments(equipments), { total: 4, fatal: 2, warning: 0, ok: 2, telemetryLive: 1, bplRejected: 1, withSignal: 3 });
  assert.deepEqual(summarizeEquipments([]), { total: 0, fatal: 0, warning: 0, ok: 0, telemetryLive: 0, bplRejected: 0, withSignal: 0 });

  // Orden del riel: Fatal → Warning → OK → sin estado; empates por alarmas, pruebas del mes, fecha y serie.
  assert.deepEqual(sortByPriority(equipments).map(item => item.serial), ['832001902', '834001902', '834001903', '851000777']);
  assert.deepEqual(filterEquipments(equipments, 'fatal', '').map(item => item.serial), ['832001902', '834001902']);
  assert.deepEqual(filterEquipments(equipments, 'ok', '').map(item => item.serial), ['834001903', '851000777']);
  assert.deepEqual(filterEquipments(equipments, 'all', 'sin alarmas').map(item => item.serial), ['834001903']);
  assert.deepEqual(filterEquipments(equipments, 'all', '8340019').map(item => item.serial), ['834001902', '834001903']);
  assert.deepEqual(filterEquipments(equipments, 'warning', ''), []);

  // Firma del corte: igual contenido → misma firma; cambia con el estado vigente, los errores o el catálogo.
  const signature = buildSnapshotSignature(snapshot);
  assert.equal(buildSnapshotSignature({ ...snapshot, errors: snapshot.errors.map(row => ({ ...row })) }), signature);
  assert.notEqual(buildSnapshotSignature({ ...snapshot, currentErrorStates: snapshot.currentErrorStates.map(row => ({ ...row, tipo_mensaje: 'ok' })) }), signature);
  assert.notEqual(buildSnapshotSignature({ ...snapshot, errors: [...snapshot.errors, { ...snapshot.errors[0], id: 99 }] }), signature);
  assert.notEqual(buildSnapshotSignature({ ...snapshot, equipments: snapshot.equipments.slice(1) }), signature);
  assert.notEqual(buildSnapshotSignature({ ...snapshot, bplRows: [] }), signature);
  console.log('PASS: derivaciones del monitoreo · lista de equipos, resumen en una pasada, filtro, prioridad y firma del corte.');
} finally { await vite.close(); }
