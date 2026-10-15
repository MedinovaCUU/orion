// Run: node tests/late-causes.test.mjs — cause of each out-of-time ticket (pure, no browser).
import assert from 'node:assert/strict';
import { causeBreakdown, isLate, lateCause, textFamily } from '../src/components/lateCauses.ts';

const cases = [
  ['La química menciona falla recurrentes en la ósmosis, se da indicación de conectarla', 'Agua'],
  ['El equipo de agua no se apagaba debido a que el sensor de alta presión no detectaba', 'Agua'],
  ['La lampara generaba errores de lectura en la linea base, se comprueba en test de fotometria', 'Optica'],
  ['Al usuario le apareció un mensaje de "Fallo en la termostatacion de la punta dosificadora"', 'Termo'],
  ['Con apoyo de ing del distribuidor formatean la computadora ya que se marca error', 'Software'],
  ['Ciente informa sobre problemas en la lecutura de codigo de barras.', 'Comunicaciones'],
  ['Se realizo limpieza de las valvulas check rojas de solución de lavado', 'Fluídica'],
  ['Se diagnostica correa de eje Y dañada por lo cual tiene perdida de pasos', 'Mecánica'],
  ['Se da atención al ingeniero Kevin de HIAR, se detecta fallo en sensor', 'Electrónica'],
  ['EL CONTROL DE ALT YA QUEDO BIEN DESPUES DE LA CALIBRACION', 'Aplicativo'],
  ['Se da asesoria a usuario sobre problematica de urea.', 'Aplicativo'],
  ['Se le mando la redacción correspondiente para su cambio.', 'Informacion/Formacion'],
  ['Se enviará cotización de preventivo', null],
  ['Pendiente de seguimiento.', null],
  ['Ticket de soporte Biosisa 2006', null],
];
for (const [text, family] of cases) assert.equal(textFamily(text), family, text);
assert.equal(textFamily('La alta presión del aire'), null, 'short words need a whole-word match («alt» ≠ «alta»)');

const point = (id, extra = {}) => ({ id, folio: `BIO-${id}`, subject: 'Ticket de soporte Biosisa 1', client: 'Hospital', platform: 'BA400', serial: 'S', team: 'ingenieria',
  priority: 'sin_prioridad', channel: null, region: null, responsibleId: null, responsible: 'Sin responsable', openedAt: 0, closedAt: 1, hours: 60, target: 48,
  outcome: 'fuera', openedInPeriod: true, closedInPeriod: true, evaluable: true, cancelled: false, closureReason: 'solucionado', hasFirstResponse: false, ...extra });
const info = (id, extra = {}) => ({ ticket_id: id, codes: [], waited_parts: false, text: '', ...extra });

assert.equal(lateCause(point('1', { closureReason: 'sin_respuesta' })).key, 'sin_respuesta_usuario');
assert.equal(lateCause(point('2'), info('2', { text: 'Se cambia la lampara' })).key, 'falla:Optica', 'Biosisa never recorded a first response: it is not a cause');
assert.equal(lateCause(point('3', { folio: 'OR-0003' })).key, 'sin_primera_respuesta', 'an Orion ticket without our first response');
assert.equal(lateCause(point('4', { folio: 'OR-0004', hasFirstResponse: true }), info('4', { waited_parts: true, text: 'lampara' })).key, 'espera_piezas');
assert.equal(lateCause(point('5', { closureReason: 'visita_programada' })).key, 'visita');
const coded = lateCause(point('6'), info('6', { codes: [{ code: 'AL13', family: 'Fluídica', label: 'Aguja Rota/Doblada' }], text: 'cambio de lampara' }));
assert.deepEqual([coded.key, coded.by, coded.detail], ['falla:Fluídica', 'codigo', 'AL13 · Aguja Rota/Doblada'], 'a catalog code wins over the text');
assert.equal(lateCause(point('7'), info('7', { text: 'Pendiente de seguimiento' })).key, 'sin_falla');

const late = [point('a', { closureReason: 'sin_respuesta' }), point('b', { closureReason: 'sin_respuesta' }), point('c'), point('d')];
const infos = new Map([['c', info('c', { text: 'falla en la osmosis' })], ['d', info('d', { codes: [{ code: 'AL08', family: 'Optica', label: 'Lámpara' }] })]]);
const rows = causeBreakdown(late, infos);
assert.deepEqual(rows.map(row => [row.label, row.n, row.share]), [['Sin respuesta del usuario', 2, 0.5], ['Agua / ósmosis', 1, 0.25], ['Óptica / lámpara', 1, 0.25]]);
assert.equal(rows.reduce((sum, row) => sum + row.share, 0), 1, 'one cause per ticket: shares add up to 100 %');
assert.deepEqual([rows[1].byText, rows[2].byCode], [1, 1]);
assert.equal(isLate(point('x', { outcome: 'justificado' })), true); assert.equal(isLate(point('y', { outcome: 'dentro' })), false); assert.equal(isLate(point('z', { evaluable: false })), false);
console.log('PASS: failure family from text (accents, whole words, generic Biosisa subjects), cause order, codes over text, breakdown adds up to 100 %');
