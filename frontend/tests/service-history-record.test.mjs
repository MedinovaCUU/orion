import assert from 'node:assert/strict';
import {
  formatDuration, historyFacts, historyRecordKind, historyRecordRef, historyTypeLabel,
  reflowText, scheduleSummary, summarizeHistory, trainingTopics,
} from '../src/components/serviceHistoryRecord.ts';

const service = { id: 'a', id_legacy: 2700, origen: 'biosisa_servicio', tipo_servicio: 'instalacion', fecha_servicio: '2026-10-07', fecha_fin: '2026-10-07', hora_inicio: '12:00:00', hora_fin: '16:00:00', duracion_min: 240, datos_origen: { cliente_biosisa: 'ESCOBEDO ZAMORA JOSE ALFREDO' } };
const training = { id: 'b', id_legacy: 790, origen: 'biosisa_capacitacion', tipo_servicio: 'capacitacion', fecha_servicio: '2026-10-05', fecha_fin: '2026-10-07', hora_fin: '11:15:00', datos_origen: { asistentes: 'Melissa Tirado', encargado_laboratorio: 'Melissa Tirado', temas: { 'Mantenimiento': 'Sí', 'Programación de controles': 'no', 'Descripción del equipo': 'si' } } };
const call = { id: 'c', id_legacy: 635, origen: 'biosisa_llamada', tipo_servicio: 'otro', fecha_servicio: '2026-10-08', datos_origen: { contacto: 'ANA YASMIN GOMEZ BONILLA', categoria: 'Otros' } };
const orion = { id: 'd', ticket_id: '3f2a9c10-1111-2222-3333-444455556666', tipo_servicio: null, creado_en: '2026-10-10T18:00:00Z' };
const legacyNoOrigin = { id: 'e', id_legacy: 120 };

assert.equal(historyRecordKind(training), 'capacitacion');
assert.equal(historyRecordKind(call), 'llamada');
assert.equal(historyRecordKind(orion), 'servicio');
assert.equal(historyRecordRef(service), 'LEG-2700');
assert.equal(historyRecordRef(training), 'CAP-790', 'trainings keep their own numbering');
assert.equal(historyRecordRef(call), 'TEL-635');
assert.equal(historyRecordRef(orion), 'TKT-3F2A9C10');
assert.equal(historyRecordRef(legacyNoOrigin), 'LEG-120');
assert.equal(historyRecordRef({ id: 'x' }), 'SRV-IND');

assert.equal(historyTypeLabel(service), 'Instalación');
assert.equal(historyTypeLabel(call), 'Servicio telefónico', 'calls are labelled by origin, not by tipo_servicio');
assert.equal(historyTypeLabel(orion), null);

assert.equal(formatDuration(45), '45 min');
assert.equal(formatDuration(240), '4 h');
assert.equal(formatDuration(210), '3 h 30 min');
assert.equal(formatDuration(3120), '2 d 4 h');
assert.equal(formatDuration(null), null);
assert.equal(formatDuration(-30), null, 'reversed schedules never show a negative duration');

assert.deepEqual(scheduleSummary(service), { dates: '2026-10-07', hours: '12:00–16:00', duration: '4 h', multiDay: false });
assert.deepEqual(scheduleSummary(training), { dates: '2026-10-05 → 2026-10-07', hours: 'hasta 11:15', duration: null, multiDay: true });
assert.equal(scheduleSummary(orion).dates, '2026-10-10', 'Orion records fall back to their creation date');

assert.deepEqual(trainingTopics(training), { covered: ['Descripción del equipo', 'Mantenimiento'], pending: ['Programación de controles'] });
assert.equal(trainingTopics(service), null);

assert.deepEqual(historyFacts(call).map((f) => f.label), ['Contacto'], 'the category already shows in its own panel');
assert.deepEqual(historyFacts(training).map((f) => f.label), ['Encargado del laboratorio', 'Asistentes']);
assert.deepEqual(historyFacts(service), [{ label: 'Cliente en Biosisa', value: 'ESCOBEDO ZAMORA JOSE ALFREDO' }]);

assert.equal(summarizeHistory([service, orion, training, call, call]), '2 servicios · 1 capacitación · 2 servicios telefónicos');
assert.equal(summarizeHistory([service]), '1 servicio');
assert.equal(reflowText('Se corrobora que la programación sea\ncorrecta y se realizan pruebas'), 'Se corrobora que la programación sea correcta y se realizan pruebas');
assert.equal(reflowText('Limpieza general.\nCambio de lámpara.'), 'Limpieza general.\nCambio de lámpara.', 'sentence breaks stay');
assert.equal(reflowText('Se realiza:\n-Limpieza\n-Ajustes'), 'Se realiza:\n-Limpieza\n-Ajustes', 'list items stay on their own line');
console.log('service history record: ok');
