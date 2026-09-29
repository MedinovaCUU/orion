import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { TrackingMission } = await server.ssrLoadModule('/src/components/TrackingMission.tsx');
  const { coerceTrackingEntry, applyTrackingPortalSnapshot } = await server.ssrLoadModule('/src/components/orionTracking.ts');
  const entries = Array.from({ length: 55 }, (_, index) => ({
    id: `test-${index}`, trackingNumber: String(4000000000 + index), carrier: 'dhl',
    status: 'en_transito', fulfillmentState: 'pendiente', timeline: [],
  }));
  const render = search => renderToStaticMarkup(createElement(TrackingMission, {
    entries, search, selectedId: entries[0].id, onSelect() {}, onSearch() {},
  }));
  entries[54].shipmentDetails = { pieceCount: 1, pieces: [{ id: 'JD014600012808373608', number: '', weight: '', dimensions: '', events: [] }], weight: '', description: '', references: [] };
  const pieceMatch = render('JD014600012808373608');
  assert.equal((pieceMatch.match(/aria-pressed=/g) || []).length, 1);
  const restored = coerceTrackingEntry(entries[54]);
  assert.equal(restored.shipmentDetails.pieces[0].id, 'JD014600012808373608');
  const refreshed = applyTrackingPortalSnapshot(restored, { status: 'en_transito', fulfillmentState: 'pendiente', timeline: [], lookedUpAt: '2026-09-29T12:00:00Z' });
  assert.equal(refreshed.shipmentDetails.pieces[0].id, 'JD014600012808373608');
  const all = render('');
  assert.equal((all.match(/aria-pressed=/g) || []).length, 55);
  assert(all.includes('55 de 55 envíos'));
  const filtered = render(entries[54].trackingNumber);
  assert.equal((filtered.match(/aria-pressed=/g) || []).length, 1);
  assert(filtered.includes('1 de 55 envíos'));
  assert(filtered.includes('Limpiar búsqueda'));
  console.log('PASS: all 55 shipments rendered; search retains total count and clear action.');
} finally {
  await server.close();
}
