import '../../src/index.css';
import '../../src/modules/service-planning/servicePlanning.css';
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import PlanningGrid from '../../src/modules/service-planning/grid/PlanningGrid';
import { buildInsertPayload, emptyValues, type PlanningTicketRow, type PlanningValues } from '../../src/modules/service-planning/grid/planningRecord';
import { weekOfDate } from '../../src/modules/service-planning/grid/planningWeeks';
import type { EquipmentSummary, ProfileSummary } from '../../src/components/servicesPlanning';
import { createMemoryBackend, resetMemoryStore } from './memoryPlanningBackend';

// Synthetic people, equipment and activities only.
const profiles: ProfileSummary[] = [
  { id: 'p1', nombre_completo: 'Ricardo Montañez', rol: 'admin', recibe_tickets: true },
  { id: 'p2', nombre_completo: 'Alfredo Acevedo', rol: 'tecnico', employee_type: 'Ingeniero', recibe_tickets: true },
  { id: 'p3', nombre_completo: 'Diego Garcia Garcia', rol: 'tecnico', employee_type: 'Ingeniero', recibe_tickets: true },
  { id: 'p4', nombre_completo: 'Martha Carbajal', rol: 'tecnico', employee_type: 'Ingeniero', recibe_tickets: true },
  { id: 'p5', nombre_completo: 'Francisco Lopez', rol: 'tecnico', employee_type: 'Ingeniero', recibe_tickets: true },
];
const equipments = [
  { id: 'e1', numero_serie: '834000111', modelo: 'BA400', ciudad: 'Guadalajara', clientes: { id: 'c1', razon_social: 'Hospital Central de Prueba' } },
  { id: 'e2', numero_serie: '831050222', modelo: 'A15', ciudad: 'Chihuahua', clientes: { id: 'c2', razon_social: 'Laboratorio Norte de Prueba' } },
  { id: 'e3', numero_serie: '832000333', modelo: 'BA200', ciudad: 'Monterrey', clientes: { id: 'c3', razon_social: 'Clínica Sur de Prueba' } },
] as unknown as EquipmentSummary[];

const params = new URLSearchParams(location.search);
const ctx = { profiles, equipments, actorName: 'Ricardo Montañez', actorId: 'p1', now: '2026-10-10T15:00:00.000Z' };
const row = (values: Partial<PlanningValues>, date: string, extra: Partial<PlanningTicketRow> = {}): PlanningTicketRow => ({
  id: crypto.randomUUID(),
  creado_en: '2026-10-01T15:00:00.000Z',
  numero_caso: null,
  planning_version: 1,
  ...buildInsertPayload({ ...emptyValues(), ...values }, weekOfDate(date), ctx),
  ...extra,
});

if (params.has('reset') || !localStorage.getItem('pgrid-memory')) {
  const seed: PlanningTicketRow[] = [
    row({ serviceType: 'preventivo', platform: 'BA400', locality: 'Hospital Central de Prueba', serialNumber: '834000111', engineer: 'Alfredo Acevedo', companions: ['Diego Garcia Garcia'], scheduledDate: '2026-10-13', observations: 'Servicio programado' }, '2026-10-13'),
    row({ serviceType: 'correctivo', platform: 'A15', locality: 'Laboratorio Norte de Prueba', serialNumber: '831050222', engineer: 'Diego Garcia Garcia', days: 'MIE', observations: 'Falla de rotor' }, '2026-10-14'),
    row({ serviceType: 'capacitacion', platform: 'BA200', locality: 'Clínica Sur de Prueba', engineer: 'Francisco Lopez', days: 'JUE-VIE', observations: 'Capacitación inicial' }, '2026-10-15'),
    row({ serviceType: 'preventivo', platform: 'BA400', locality: 'Hospital Poniente de Prueba', engineer: 'Martha Carbajal', scheduledDate: '2026-10-21' }, '2026-10-21'),
    row({ serviceType: 'instalacion', platform: 'BA200', locality: 'Unidad Médica de Prueba', engineer: 'Alfredo Acevedo', scheduledDate: '2026-10-13', observations: 'Mismo día que otro servicio' }, '2026-10-13'),
    row({ serviceType: 'preventivo', platform: 'BTS', locality: 'Laboratorio Cerrado de Prueba', engineer: 'Martha Carbajal' }, '2026-10-06', { estado: 'cerrado' }),
  ];
  const bulk = Number(params.get('bulk') || 0);
  for (let index = 0; index < bulk; index += 1) {
    const day = String(1 + (index % 28)).padStart(2, '0');
    seed.push(row({ serviceType: index % 3 ? 'preventivo' : 'correctivo', platform: ['BA400', 'BA200', 'A15'][index % 3], locality: `Sitio de prueba ${index + 1}`, engineer: profiles[1 + (index % 4)].nombre_completo || '', observations: `Fila sintética ${index + 1}` }, `2026-10-${day}`));
  }
  // Synthetic absences: Martha has TXT the day of her service on the 21st; Francisco is on vacation
  // during his training on the 15th-16th.
  const absence = (personName: string, personId: string, kind: 'TXT' | 'VAC', startDate: string, endDate: string) => ({
    id: crypto.randomUUID(), personId, personName, kind, startDate, endDate, note: '', source: 'orion' as const, sheetKey: null,
    sheetSyncedAt: null, orionEditedAt: null, version: 1, createdByName: 'Prueba', updatedByName: 'Prueba', updatedAt: '2026-10-10T00:00:00.000Z',
  });
  resetMemoryStore(seed, [absence('Martha Carbajal', 'p4', 'TXT', '2026-10-21', '2026-10-21'), absence('Francisco Lopez', 'p5', 'VAC', '2026-10-15', '2026-10-16')]);
  if (params.has('reset')) history.replaceState(null, '', location.pathname + location.search.replace(/[?&]reset(=[^&]*)?/, '').replace(/^&/, '?'));
}

const actor = params.get('actor') || 'Ricardo Montañez';
const { backend, controls } = createMemoryBackend(actor);
Object.assign(window, { __pgrid: controls });

function App() {
  const [month, setMonth] = useState(params.get('month') || '2026-10');
  return (
    <div className="planning-shell" style={{ display: 'block', padding: 16 }}>
      <PlanningGrid
        backend={backend}
        profiles={profiles}
        equipments={equipments}
        currentUserName={actor}
        currentUserId="p1"
        canEdit={!params.has('readonly')}
        canDelete={!params.has('readonly')}
        canManageColumns
        canImport
        month={month}
        onMonthChange={setMonth}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
export default App;
