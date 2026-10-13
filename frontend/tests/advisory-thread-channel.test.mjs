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
