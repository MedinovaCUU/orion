import { createRoot } from 'react-dom/client';
import { ServiceHistoryCard } from '../../src/components/ServiceHistoryCard';
import { summarizeHistory } from '../../src/components/serviceHistoryRecord';
import '../../src/index.css';
import { serviceHistoryRows } from './serviceHistoryRows.mjs';
// Ficha de historial del equipo sin Supabase: servicio, capacitación y servicio telefónico importados de Biosisa.
function Fixture() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h4 style={{ color: 'var(--primary-color)', margin: 0 }}>Desglose de Servicios Realizados</h4>
      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{summarizeHistory(serviceHistoryRows)}</p>
      {serviceHistoryRows.map((row, index) => <ServiceHistoryCard key={row.id} serv={index === 0 ? { ...row, ticket_links: [{ ticketId: 't1', folio: 'BIO-2304', days: 2, confidence: 'segura' }] } : row} />)}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
