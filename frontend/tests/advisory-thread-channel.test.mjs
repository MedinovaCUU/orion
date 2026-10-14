import assert from 'node:assert/strict';
import { appendAdvisoryThreadMessage, getAdvisoryThreadMessages } from '../src/components/escalatedAdvisoryThread.ts';

const source = { consultaEscalada: 'El rotor no centra', creadoEn: '2026-10-13T10:00:00.000Z', solicitanteId: 'req', solicitanteNombre: 'Alfredo', estado: 'solicitada' };
const whatsapp = { id: 'wa-1', kind: 'reply', role: 'trainer', actorId: 't1', actorName: 'Héctor', body: 'Cambia el sello', createdAt: '2026-10-13T10:05:00.000Z', attachments: [], statusSnapshot: 'solicitada', channel: 'whatsapp' };
// A thread written only by the WhatsApp bridge still shows the initial consultation first.
const thread = getAdvisoryThreadMessages({ thread: [whatsapp] }, source);
assert.deepEqual(thread.map(message => message.id), ['initial-consultation', 'wa-1']);
assert.equal(thread[1].channel, 'whatsapp');
// The app's next save keeps the mark, and app messages carry none.
const next = appendAdvisoryThreadMessage({ metadata: { thread: [whatsapp] }, source, nextStatus: 'solicitada',
  message: { id: 'app-1', kind: 'reply', role: 'requester', actorId: 'req', actorName: 'Alfredo', body: 'Gracias', createdAt: '2026-10-13T10:06:00.000Z', attachments: [], statusSnapshot: 'solicitada' } });
assert.equal(next.thread.find(message => message.id === 'wa-1').channel, 'whatsapp');
assert.equal('channel' in next.thread.find(message => message.id === 'app-1'), false);
assert.equal(getAdvisoryThreadMessages({ thread: [{ ...whatsapp, channel: 'sms' }] }, source)[1].channel, undefined);
console.log('PASS: WhatsApp channel survives the app thread round trip; initial consultation still derived');

// respondida_en comes back as «+00:00» while the thread keeps «.000Z»: the same reply must not be drawn twice.
const answered = { ...source, legacyRespuestaTrainer: 'Cambia el sello', legacyRespondidaEn: '2026-10-13T10:05:00+00:00', legacyRespondidaPorNombre: 'Héctor' };
const trainerReplies = metadata => getAdvisoryThreadMessages(metadata, answered).filter(message => message.role === 'trainer');
assert.deepEqual(trainerReplies({ thread: [{ ...whatsapp, createdAt: '2026-10-13T10:05:00.000Z' }] }).map(message => message.id), ['wa-1']);
// A copy saved earlier by that bug is hidden too (production advisory cbbda056, 2026-10-14).
const stored = { id: 'legacy-trainer-response', kind: 'reply', role: 'trainer', actorId: 't1', actorName: 'Héctor', body: 'Cambia el sello', createdAt: '2026-10-13T10:05:00+00:00', attachments: [] };
assert.deepEqual(trainerReplies({ thread: [whatsapp, stored] }).map(message => message.id), ['wa-1']);
// A real legacy answer (no thread reply with that text) is still shown, once.
assert.deepEqual(trainerReplies({ thread: [] }).map(message => message.id), ['legacy-trainer-response']);
assert.deepEqual(trainerReplies({ thread: [stored] }).map(message => message.id), ['legacy-trainer-response']);
console.log('PASS: the trainer reply copied into respuesta_trainer is not drawn twice; stored copies hidden; real legacy answers kept');
