import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import '../../src/components/Tickets.css';
import '../../src/components/TicketControlCenter.css';
import '../../src/components/ServiceKpiCenter.css';
import { fullSummary, rows, stubRecordsFetch } from './syntheticTickets';

// Isolated PowerPoint export with synthetic data: no session and no production rows.
stubRecordsFetch(rows);
const summary = fullSummary();
function Fixture() {
  const [status, setStatus] = useState('Listo');
  const generate = async () => {
    setStatus('Preparando…');
    try {
      const { buildServiceDeck } = await import('../../src/components/kpiDeck');
      const result = await buildServiceDeck({ summary, filters: { from: '2026-04-13', to: '2026-10-12', granularity: 'month' },
        criteria: [['Vista', 'Resumen general'], ['Periodo', '2026-04-13 a 2026-10-12'], ['Agrupación', 'Mes'], ['Colaborador', 'Todos']], onProgress: setStatus });
      setStatus(`Listo: ${result.fileName} · ${result.tickets} tickets`);
    } catch (cause) { setStatus(`Error: ${(cause as Error).message}`); }
  };
  return <main className="tc-center" style={{ maxWidth: 900, margin: '40px auto', padding: 30 }}>
    <div className="kpi-filter-actions"><button type="button" className="kpi-deck" onClick={() => void generate()}>Presentación PowerPoint</button></div>
    <p data-testid="deck-status" className="kpi-note">{status}</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
