import assert from 'node:assert/strict';
import {
  automaticNotice, conversationPreview, deliveryLabel, formatPhone, formatRemaining, groupByDay, inboundState, initials,
  mapsUrl, matchesSearch, replyWindow,
} from '../src/components/whatsappInboxModel.ts';

const now = Date.parse('2026-10-13T18:00:00Z');
assert.equal(replyWindow('2026-10-13T17:00:00Z', now).open, true);
assert.equal(formatRemaining(replyWindow('2026-10-13T17:00:00Z', now).remainingMs), '23 h 0 min');
assert.equal(replyWindow('2026-10-12T17:59:00Z', now).open, false);
assert.equal(replyWindow(null, now).open, false);
assert.equal(formatRemaining(30000), 'menos de 1 min');
assert.equal(formatRemaining(45 * 60000), '45 min');

assert.equal(formatPhone('526141772897'), '+52 614 177 2897');
assert.equal(formatPhone('12025550184'), '+1 202 555 0184');
assert.equal(formatPhone('573001234567'), '+573001234567');
assert.equal(initials('Laura Quiñones Díaz', '526141772897'), 'LD');
assert.equal(initials(null, '526141772897'), '97');
assert.equal(initials('🙂', '526141772897'), '97');
assert.equal(initials('Alfredo (asesorías)', '526141772897'), 'AA');

assert.equal(conversationPreview({ last_preview: null, last_kind: 'image', last_direction: 'in' }), 'Foto');
assert.equal(conversationPreview({ last_preview: 'Listo', last_kind: 'text', last_direction: 'out' }), 'Tú: Listo');
assert.deepEqual(automaticNotice('orion_ticket_asignado_v1', ['OR-12', 'Martha']), { title: 'Ticket asignado', detail: 'Caso OR-12 · responsable Martha' });
assert.equal(automaticNotice('plantilla_nueva', []).title, 'Aviso automático');

assert.equal(deliveryLabel({ status: 'accepted', delivery_status: 'read' }).label, 'Leído');
assert.equal(deliveryLabel({ status: 'accepted', delivery_status: 'failed' }).tone, 'error');
assert.equal(deliveryLabel({ status: 'unknown', delivery_status: null }).tone, 'warn');
assert.equal(deliveryLabel({ status: 'accepted', delivery_status: null }).label, 'Aceptado por Meta');

const today = new Date(2026, 9, 13, 12);
const groups = groupByDay([{ at: new Date(2026, 9, 12, 9).toISOString() }, { at: new Date(2026, 9, 13, 8).toISOString() }, { at: new Date(2026, 9, 13, 9).toISOString() }], today);
assert.deepEqual(groups.map(group => [group.day, group.items.length]), [['Ayer', 1], ['Hoy', 2]]);

assert.equal(mapsUrl({ latitude: 28.6, longitude: -106.1 }), 'https://www.google.com/maps?q=28.6,-106.1');
assert.equal(mapsUrl({ latitude: null, longitude: null }), null);
assert.equal(mapsUrl(null), null);

const conversation = { display_name: 'Laura Quiñones', numero_caso: 'OR-0042', last_preview: 'Sigue fallando', phone: '526141772897' };
assert.ok(matchesSearch(conversation, 'quinones'));
assert.ok(matchesSearch(conversation, '177 28'));
assert.ok(matchesSearch(conversation, 'or-0042'));
assert.ok(!matchesSearch(conversation, 'pedro'));

const expected = 'https://x.supabase.co/functions/v1/whatsapp-webhook';
assert.equal(inboundState(null), 'unknown');
assert.equal(inboundState({ expected, secretConfigured: true, apps: [] }), 'unsubscribed');
assert.equal(inboundState({ expected, secretConfigured: true, apps: [{ name: 'App', callback: expected }] }), 'connected');
assert.equal(inboundState({ expected, secretConfigured: true, apps: [{ name: 'App', callback: 'https://otro' }] }), 'elsewhere');
assert.equal(inboundState({ expected, secretConfigured: true, apps: [{ name: 'App', callback: null }] }), 'app-default');
console.log('PASS: 24 h window, phone/initials formatting, previews, automatic notices, delivery labels, day groups, maps, search and inbound state');
