import './service-parts-lab-stub';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ServicePartsLab from '../../src/components/ServicePartsLab';
import '../../src/index.css';
import '../../src/components/Tickets.css';
import '../../src/components/TicketControlCenter.css';
import '../../src/components/ServiceKpiCenter.css';

// Isolated parts lab with a stubbed get_service_parts_lab (synthetic data unless ?real).
function Fixture() {
  const [log, setLog] = useState('');
  return <main className="tc-center" style={{ maxWidth: 1400, margin: '0 auto', padding: '8px 0 24px' }}>
    <section className="kpi-section"><header><h3>Refacciones</h3><span>Uso por tipo de servicio, mes, sector y plataforma</span></header>
      {log && <p className="kpi-note" data-testid="parts-log">{log}</p>}
      <ServicePartsLab filters={{ from: '2026-01-01', to: '2026-10-13', granularity: 'month' }} revision={0} onOpenTicket={ticket => setLog(`Abrir expediente ${ticket.folio}`)} />
    </section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
