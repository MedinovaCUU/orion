import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TicketControlCenter from '../../src/components/TicketControlCenter';
import '../../src/index.css';
import '../../src/components/Tickets.css';
// Isolated control center: every request is intercepted by tests/service-kpi-browser.test.mjs.
const start = '2026-09-01T12:00:00Z';
function Fixture() {
  const [revision, setRevision] = useState(0);
  const entries = useMemo(() => Array.from({ length: 30 }, (_, i) => ({
    ticket: { id: `case-${i + 1}`, numero_caso: `OR-${String(i + 1).padStart(4, '0')}`, asunto: i % 2 ? '[Soporte Químico] Control de calidad fuera de rango' : '[Soporte Ingeniero] Revisión de bomba de lavado', descripcion: 'Caso de prueba.', estado: i < 20 ? 'cerrado' : 'abierto', creado_en: start, numero_serie_equipo: `SER-${i + 1}` },
    resolvedEquipment: { numero_serie: `SER-${i + 1}`, modelo: ['BA400', 'A15', 'BA200'][i % 3], ciudad: 'Chihuahua', estado: 'Chihuahua', clientes: { razon_social: 'Laboratorio de prueba' } },
    ticketClientLabel: ['Hospital Norte', 'Clínica Sur', 'Laboratorio Delta'][i % 3], ticketPhoneLabel: '6141000000', locationLabel: 'Chihuahua, Chihuahua', isPlanningTicket: false,
  })), [revision]);
  return <main style={{ maxWidth: 1600, margin: '0 auto' }}><TicketControlCenter entries={entries} loading={false} canWrite onChanged={() => setRevision(value => value + 1)} onDiagnose={() => {}} /></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
