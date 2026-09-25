import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { TrackingMission } = await server.ssrLoadModule('/src/components/TrackingMission.tsx');
  const entries = Array.from({ length: 55 }, (_, index) => ({
    id: `test-${index}`, trackingNumber: String(4000000000 + index), carrier: 'dhl',
    status: 'en_transito', fulfillmentState: 'pendiente', timeline: [],
  }));
  const render = search => renderToStaticMarkup(createElement(TrackingMission, {
    entries, search, selectedId: entries[0].id, onSelect() {}, onSearch() {},
  }));
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
