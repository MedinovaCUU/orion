import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeDhlDetails, dhlPieceStatus, readDhlShipmentDetails } from './dhl-pieces.ts';
import { normalizeMyDhlShipment } from '../resolve-shipping-tracking/mydhl.ts';

test('piece IDs are deduplicated and unscoped delivery does not deliver individual pieces', () => {
  const result = normalizeDhlDetails({ details: { totalNumberOfPieces: 3, pieceIds: ['JD001', 'JD001', 'JD002'] }, status: { statusCode: 'delivered', description: 'Delivered', timestamp: '2026-09-29T10:00:00Z' } });
  assert.equal(result.pieceCount, 3);
  assert.equal(result.pieces.length, 2);
  assert.equal(result.pieces[0].events.length, 0);
});
test('partial updates preserve other pieces, deduplicate events and resist older event regression', () => {
  const delivered = { pieceIds: ['JD001'], statusCode: 'delivered', description: 'Delivered', timestamp: '2026-09-29T10:00:00Z' };
  const shipment = { details: { totalNumberOfPieces: 2, pieceIds: ['JD001', 'JD002'] }, events: [delivered] };
  const first = normalizeDhlDetails(shipment);
  const second = normalizeDhlDetails({ events: [delivered, { ...delivered, statusCode: 'transit', description: 'Transit', timestamp: '2026-09-28T10:00:00Z' }] }, first);
  assert.equal(second.pieces[0].events.length, 2);
  assert.equal(dhlPieceStatus(second.pieces[0]), 'Entregado');
  assert.equal(second.pieces[1].events.length, 0);
  assert.equal(second.pieceCount, 2);
  assert.equal(first.pieces[0].events.length, 1);
});
test('MyDHL piece details include independent checkpoints and dimensions', () => {
  const baseEvent = { date: '2026-09-29', time: '10:00:00', GMTOffset: '-06:00', description: 'Delivered', typeCode: 'OK' };
  const shipment = normalizeMyDhlShipment({ shipments: [{ shipmentTrackingNumber: '1234567890', status: 'Success', numberOfPieces: 2, events: [baseEvent], pieces: [{ trackingNumber: 'JD001', number: 1, weight: 2, unitOfMeasurements: 'metric', dimensions: { length: 10, width: 20, height: 30 }, events: [baseEvent] }, { trackingNumber: 'JD002', events: [{ ...baseEvent, typeCode: 'WC', description: 'With courier' }] }] }] }, '1234567890');
  const result = normalizeDhlDetails(shipment!);
  assert.equal(dhlPieceStatus(result.pieces[0]), 'Entregado');
  assert.equal(dhlPieceStatus(result.pieces[1]), 'En reparto');
  assert.equal(result.pieces[0].weight, '2 kg');
  assert.equal(result.pieces[0].dimensions, '10 × 20 × 30 cm');
  assert.equal(result.pieces[0].events[0].timestamp, '2026-09-29T10:00:00-06:00');
});
test('unknown totals, malformed legacy values and ambiguous final codes remain unknown', () => {
  assert.equal(readDhlShipmentDetails(null), undefined);
  assert.equal(normalizeDhlDetails({ details: { totalNumberOfPieces: 'invalid' } }).pieceCount, null);
  const result = normalizeDhlDetails({ events: [{ pieceIds: ['JD001'], typeCode: 'CS', description: 'Final status' }] });
  assert.notEqual(dhlPieceStatus(result.pieces[0]), 'Entregado');
});
