import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TicketControlCenter from '../../src/components/TicketControlCenter';
import '../../src/index.css';
import '../../src/components/Tickets.css';
const start = '2026-09-01T12:00:00Z';
function Fixture() {
  const [revision, setRevision] = useState(0);
  const entries = useMemo(() => Array.from({ length: 22 }, (_, i) => ({
    ticket: { id: `case-${i + 1}`, numero_caso: `OR-${String(i + 1).padStart(4,'0')}`, asunto: ['Lectura fuera de rango en control de calidad', 'Revisión de presión y bomba de lavado', 'Cambio de pieza pendiente de importación'][i % 3], descripcion: 'Caso de prueba de control de servicio.', estado: i < 20 ? 'cerrado' : 'abierto', creado_en: start, numero_serie_equipo: `831060${i + 10}` },
    resolvedEquipment: { numero_serie: `831060${i + 10}`, modelo: ['BA400','A25','BA200'][i % 3], ciudad: 'Guadalajara', estado: 'Jalisco', clientes: { razon_social: 'Laboratorio de prueba' } },
    ticketClientLabel: ['Laboratorio San Rafael', 'Clínica del Norte', 'Diagnóstico Integral'][i % 3], ticketPhoneLabel: '3331004167', locationLabel: ['Guadalajara, Jalisco', 'Puebla, Puebla', 'Chihuahua, Chihuahua'][i % 3], isPlanningTicket: false,
  })), [revision]);
  return <main style={{maxWidth:1600,margin:'0 auto'}}><TicketControlCenter entries={entries} loading={false} canWrite onChanged={() => setRevision(value => value + 1)} onDiagnose={() => {}} /></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
