import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildBplDemoRows } from '../frontend/tests/fixtures/bplDemoData.mjs';

// Datos sintéticos aislados. Nunca reutilizar la serie de un analizador instalado.
const project = 'mzgrifkunevgestihlmh';
const serial = '834009999';
const equipmentId = 'orion-demo-ba400-visual';
const monitorName = 'ORION_DEMO_VISUAL';
const bplTable = 'ba400_bpl_events';
const mode = process.argv[2];
if (!['--apply', '--cleanup', '--inspect'].includes(mode)) throw new Error('Uso: node tools/monitor-visual-demo.mjs --apply | --cleanup | --inspect');
const keys = JSON.parse(execFileSync('supabase', ['projects', 'api-keys', '--project-ref', project, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
const key = keys.find(item => item.name === 'service_role')?.api_key;
if (!key) throw new Error('La sesión de Supabase CLI no permite administrar la DEMO.');

// La credencial permanece en memoria: no se escribe ni se imprime.
async function rest(table, query = '', method = 'GET', body) {
  const response = await fetch(`https://${project}.supabase.co/rest/v1/${table}?${query}`, {
    method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${table}: HTTP ${response.status} ${await response.text()}`);
  return response.status === 204 ? [] : response.json();
}
const serialFilter = `numero_serie=eq.${serial}`;
const ownedFilter = `${serialFilter}&monitor_name=eq.${monitorName}`;
// Las filas BPL de la DEMO se reconocen por el marcador en el payload; la serie reservada no admite filas ajenas.
const bplSerialFilter = `effective_equipment_serial=eq.${serial}`;
const bplOwnedFilter = `${bplSerialFilter}&monitor_name=eq.${monitorName}`;
const existing = await rest('equipos', `or=(numero_serie.eq.${serial},id.eq.${equipmentId})&select=id,numero_serie,modelo`);
const states = await rest('estado_errores_equipo_actual', `${serialFilter}&select=monitor_name`);
const events = await rest('monitoreo_errores_equipos', `${serialFilter}&select=monitor_name`);
const bplRows = await rest(bplTable, `${bplSerialFilter}&select=id,event_type,monitor_name`);
if (mode === '--inspect') {
  // Solo lectura: esquema real de la tabla BPL (nombres de columna y claves del payload) y estado de la DEMO.
  const sample = await rest(bplTable, 'select=*&order=detected_at.desc&limit=1');
  const curveSample = await rest(bplTable, `select=*&event_type=eq.bpl_reaction_curve&${encodeURIComponent('payload->reaction_curve->>calculation_version')}=eq.screen-abs-v2&order=detected_at.desc&limit=1`);
  const describe = (rows) => rows.map(row => ({
    columns: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, key === 'payload' ? `json:${Object.keys(value || {}).join(',')}` : value === null ? 'null' : Array.isArray(value) ? `array(${value.length})` : typeof value])),
    reactionCurveKeys: row.payload?.reaction_curve ? Object.keys(row.payload.reaction_curve) : null,
    pointKeys: row.payload?.reaction_curve?.points?.[0] ? Object.keys(row.payload.reaction_curve.points[0]) : null,
    readingKeys: row.payload?.reaction_curve?.points?.[0]?.readings?.[0] ? Object.keys(row.payload.reaction_curve.points[0].readings[0]) : null,
    firstPoint: row.payload?.reaction_curve?.points?.[0] ?? null,
    pointCount: row.payload?.reaction_curve?.points?.length ?? null,
    payloadSample: row.payload?.reaction_curve ? undefined : row.payload,
    // Valores escalares reales (sin payload) para replicar las convenciones del monitor en la DEMO.
    scalars: Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'payload')),
    curveMeta: row.payload?.reaction_curve ? Object.fromEntries(Object.entries(row.payload.reaction_curve).filter(([key]) => key !== 'points')) : null,
  }));
  console.log(JSON.stringify({ demoEquipment: existing, demoBplRows: bplRows.length, latestRow: describe(sample), latestCurve: describe(curveSample) }, null, 2));
  process.exit(0);
}
if (existing.some(row => row.id !== equipmentId || row.numero_serie !== serial || row.modelo !== 'BA400 [DEMO]') || [...states, ...events].some(row => row.monitor_name !== monitorName) || bplRows.some(row => row.monitor_name !== monitorName)) {
  throw new Error('Conflicto con datos ajenos a esta DEMO. No se modificó ningún registro.');
}
async function cleanup() {
  await rest(bplTable, bplOwnedFilter, 'DELETE');
  await rest('estado_errores_equipo_actual', ownedFilter, 'DELETE');
  await rest('monitoreo_errores_equipos', ownedFilter, 'DELETE');
  await rest('equipos', `${serialFilter}&id=eq.${equipmentId}&modelo=eq.BA400%20%5BDEMO%5D`, 'DELETE');
}
if (mode === '--cleanup') {
  await cleanup();
  console.log(JSON.stringify({ result: 'DEMO eliminada', serial, project }));
} else {
  const catalog = JSON.parse(await readFile(new URL('./ba400-log-monitor/error-catalog.json', import.meta.url), 'utf8'));
  const now = new Date().toISOString();
  const payload = { demo: true, purpose: 'Visualización, no representa un equipo real', owner: monitorName };
  const alarms = ['203', '301', '502', '70'].map((code, index) => ({
    numero_serie: serial, modelo: 'BA400 [DEMO]', codigo_error: code,
    descripcion_error: `[DEMO] ${catalog[code].description}`, seccion_error: catalog[code].section,
    tipo_mensaje: catalog[code].error_type.toLowerCase(), detected_at: now,
    monitor_name: monitorName, machine_name: 'DEMO_NO_EQUIPO_REAL',
    source_file: 'DEMO/ORION_VISUAL', source_basename: 'ORION_VISUAL_DEMO',
    line_number: index + 1, byte_offset_start: 0, byte_offset_end: 0,
    raw_line: `[DEMO] E:${code}`, line_hash: createHash('sha256').update(`${monitorName}:${serial}:${code}`).digest('hex'), payload,
  }));
  // Serie y clave deterministas: repetir la prueba actualiza sus cuatro eventos, no los duplica.
  try {
    await rest('equipos', 'on_conflict=id', 'POST', { id: equipmentId, numero_serie: serial, modelo: 'BA400 [DEMO]', pais: 'México', estado: 'Chihuahua', ciudad: 'Chihuahua', municipio: 'Chihuahua', direccion: 'DEMO VIRTUAL - ubicación ilustrativa, no corresponde a un laboratorio', supremo_enabled: false });
    await rest('monitoreo_errores_equipos', 'on_conflict=line_hash', 'POST', alarms);
    await rest('estado_errores_equipo_actual', 'on_conflict=numero_serie', 'POST', {
      numero_serie: serial, modelo: 'BA400 [DEMO]', monitor_name: monitorName, machine_name: 'DEMO_NO_EQUIPO_REAL',
      estado_actual: 'fatal', tipo_mensaje: 'fatal', codigos_error: alarms.map(row => row.codigo_error), errores_activos: alarms,
      error_principal_codigo: alarms[0].codigo_error, error_principal_descripcion: alarms[0].descripcion_error, error_principal_seccion: alarms[0].seccion_error,
      activo_desde: now, last_event_at: now, updated_at: now, resolved_at: null, payload,
    });
    // Evidencia BPL y curvas de reacción: se reemplazan completas en cada aplicación para no acumular filas.
    const demo = buildBplDemoRows({ serial, now: new Date(now), marker: { ...payload } });
    const bplDemoRows = [...demo.statusRows, ...demo.curveRows].map((row, index) => ({
      ...row,
      monitor_name: monitorName, monitor_version: 'demo', machine_name: 'DEMO_NO_EQUIPO_REAL',
      line_hash: createHash('sha1').update(`${monitorName}:${serial}:bpl:${index}:${row.event_type}:${row.test_name}:${row.payload?.reaction_curve?.execution_id ?? ''}`).digest('hex'),
    }));
    await rest(bplTable, bplOwnedFilter, 'DELETE');
    await rest(bplTable, '', 'POST', bplDemoRows);
  } catch (error) {
    // Una primera instalación incompleta se revierte exclusivamente sobre la serie reservada.
    if (!existing.length && !states.length && !events.length) await cleanup();
    throw error;
  }
  const verified = await rest('estado_errores_equipo_actual', `${ownedFilter}&select=numero_serie,estado_actual,codigos_error`);
  const bplVerified = await rest(bplTable, `${bplOwnedFilter}&select=event_type`);
  const bplByType = bplVerified.reduce((counts, row) => ({ ...counts, [row.event_type]: (counts[row.event_type] || 0) + 1 }), {});
  console.log(JSON.stringify({ result: 'DEMO verificada', project, equipmentId, verified, bplRows: bplVerified.length, bplByType }, null, 2));
}
