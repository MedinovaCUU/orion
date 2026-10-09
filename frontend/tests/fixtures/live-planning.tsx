import '../../src/index.css';
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import LivePlanningBoard from '../../src/modules/service-planning/components/LivePlanningBoard';
import { mapPendingTicketToPlannedService, buildQuickCreatePayload } from '../../src/modules/service-planning/helpers/normalizeService';
const profiles = [{ id: 'a', nombre_completo: 'Alfredo Acevedo', employee_type: 'Ingeniero', recibe_tickets: true }, { id: 'b', nombre_completo: 'Erick Duran', recibe_tickets: true }, { id: 'c', nombre_completo: 'Hector Cortes', employee_type: 'Ingeniero', recibe_tickets: true }];
profiles.push(...['Martha Carbajal', 'Miguel Chitala', 'Ricardo Vilchis', 'Ivonne Jaramillo', 'Olivia Angulo', 'Ana López', 'Mariana Lozano'].map((nombre_completo,i) => ({ id: `q${i}`, nombre_completo, employee_type: 'Químico', recibe_tickets: false })));
const initial = mapPendingTicketToPlannedService({ id: 'test', asunto: 'Preventivo BA200 - Atoyac', estado: 'abierto', creado_en: '2026-10-02T00:00:00Z', descripcion: 'Atoyac\n[METADATA_PLANEACION]\n'+JSON.stringify({fecha_tentativa:'05 AL 09 OCTUBRE',week_start:'2026-10-05',week_end:'2026-10-09',planning_month_key:'2026-10',ingeniero_csv:'Alfredo Acevedo',service_type:'preventivo'}) }, [], profiles);
// Falcon time alerts for the silent wall strip: one 9.5 min from its 24 h limit (assigned to Alfredo
// through the mocked ticket_assignments feed) and one already expired with nobody assigned.
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
const falconTickets = [
 { ticket: { id: 'case-a', user_id: null, asunto: '[Falcon] Falla de lectura BA200', descripcion: 'Localidad: Ciudad de México', estado: 'abierto', creado_en: minutesAgo(24 * 60 - 9.5), numero_serie_equipo: '832000706' }, locationLabel: 'Hospital Ángeles · CDMX' },
 { ticket: { id: 'case-b', user_id: null, asunto: '[Falcon] Sin comunicación con LIS', descripcion: 'Localidad: Ciudad de México', estado: 'abierto', creado_en: minutesAgo(24 * 60 + 5), numero_serie_equipo: null }, locationLabel: 'Clínica Sur · CDMX' },
];
function App() {
 const [services,setServices]=useState([...(location.search.includes('carousel') ? Array.from({length:12},(_,i)=>({...initial,id:`ivonne-${i}`,locality:`Pendiente ${i+1}`,scheduledDate:'2026-10-09',status:['pendiente' as const],responsibleEngineers:['Ivonne Jaramillo'],observations:'Revisar calibración y coordinar visita con el laboratorio.',serialNumber:`NS-${i+1}`})) : []),{...initial, id:'past-week', locality:'Semana terminada', weekStart:'2026-09-21', weekEnd:'2026-09-25', scheduledDate:undefined}, {...initial, locality: 'Atoyac', platform: 'BA200'}, {...initial, id: 'today', locality: 'Hospital Central', platform:'A25', scheduledDate:'2026-10-02', responsibleEngineers:['Martha Carbajal']}, {...initial, id:'overdue', locality:'Laboratorio del Norte', scheduledDate:'2026-10-01', responsibleEngineers:['Martha Carbajal']}] );
 return <LivePlanningBoard month="2026-10" services={services} profiles={profiles} falconTickets={falconTickets} canEdit onUpdate={async (s,u)=>{ if(u.locality==='ERROR') throw new Error('Error de prueba'); setServices(all=>all.map(row=>row.id===s.id?{...row,...u}:row)); }} onCreate={async draft=>{ const payload=buildQuickCreatePayload(draft,profiles,null,'Test'); setServices(all=>[...all,mapPendingTicketToPlannedService({...payload,id:crypto.randomUUID(),creado_en:new Date().toISOString()},[],profiles)]); }} />;
}
createRoot(document.getElementById('root')!).render(<App/>);
