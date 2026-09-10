import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeMyDhlShipment } from './mydhl.ts';

const guide = '1234567890';
const fixture = (typeCode: string, extra = {}) => ({ shipments: [{ shipmentTrackingNumber: guide, status: 'Success', estimatedDeliveryDate: '2026-09-10', events: [{ date: '2026-09-09', time: '12:00:00', GMTOffset: '-06:00', typeCode, description: 'checkpoint' }], ...extra }] });
for (const [code, expected] of [['OK', 'delivered'], ['WC', 'out-for-delivery'], ['PL', 'transit'], ['PU', 'transit']]) {
  test(`maps ${code} to ${expected}`, () => assert.equal((normalizeMyDhlShipment(fixture(code), guide)?.status as Record<string, unknown>).statusCode, expected));
}
test('request success is not proof of delivery', () => assert.equal(normalizeMyDhlShipment(fixture('OK', { events: [] }), guide), null));
test('does not accept another guide', () => assert.equal(normalizeMyDhlShipment(fixture('OK'), '0000000000'), null));
test('preserves estimated delivery', () => assert.equal(normalizeMyDhlShipment(fixture('PU'), guide)?.estimatedDeliveryDate, '2026-09-10'));
test('uses latest event regardless of response order', () => {
  const payload = fixture('OK');
  payload.shipments[0].events.push({ date: '2026-09-08', time: '12:00:00', GMTOffset: '-06:00', typeCode: 'PU', description: 'picked up' });
  assert.equal((normalizeMyDhlShipment(payload, guide)?.status as Record<string, unknown>).statusCode, 'delivered');
});
