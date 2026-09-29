import { createRoot } from 'react-dom/client';
import { TrackingPieces } from '../../src/components/TrackingPieces';
import type { TrackingEntry } from '../../src/components/orionTracking';

const entry = {
  trackingNumber: '1234567890', status: 'entregado', serviceType: 'DHL Express',
  shipmentDetails: { pieceCount: 3, weight: '12 kg', description: 'Reactivos', references: ['CU: TEST'], pieces: [
    { id: 'JD014600012808373608', number: '1', weight: '4 kg', dimensions: '20 × 20 × 30 cm', events: [{ label: 'Entregado', statusCode: 'delivered', timestamp: '2026-09-29T10:00:00-06:00', location: 'Chihuahua', note: 'Movimiento asociado a esta pieza' }] },
    { id: 'JD014600012808373609', number: '2', weight: '', dimensions: '', events: [{ label: 'Con mensajero', statusCode: 'out-for-delivery', timestamp: '2026-09-29T09:00:00-06:00', location: 'Chihuahua', note: '' }] },
    { id: 'JD014600012808373610', number: '3', weight: '', dimensions: '', events: [] },
  ] },
} as TrackingEntry;
createRoot(document.getElementById('root')!).render(<main style={{ maxWidth: 740, margin: 'auto', padding: 16, fontFamily: 'sans-serif', color: '#234' }}><TrackingPieces entry={entry} /></main>);
