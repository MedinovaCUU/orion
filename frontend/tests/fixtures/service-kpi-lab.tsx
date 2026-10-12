import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ServiceKpiTimeLab from '../../src/components/ServiceKpiTimeLab';
import '../../src/index.css';
import '../../src/components/Tickets.css';
import '../../src/components/TicketControlCenter.css';
import '../../src/components/ServiceKpiCenter.css';

import { rows, summary, stubRecordsFetch } from './syntheticTickets';
stubRecordsFetch(rows);

function Fixture() {
  const [log, setLog] = useState('Haz clic en un punto, una barra o una celda.');
  return <main className="tc-center" style={{ maxWidth: 1400, margin: '0 auto', padding: '8px 0 24px' }}>
    <section className="kpi-section"><header><h3>Cumplimiento y tiempos</h3><span>Datos sintéticos · {rows.length} tickets</span></header>
      <p className="kpi-note" data-testid="lab-log">{log}</p>
      <ServiceKpiTimeLab view="general" summary={summary} filters={{ from: '2026-04-13', to: '2026-10-12', granularity: 'month' }} revision={0}
        onDrill={drill => setLog(`Registros: ${drill.title} · ${JSON.stringify(drill.match)}`)} onOpenTicket={ticket => setLog(`Abrir expediente ${ticket.folio}`)} />
    </section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
