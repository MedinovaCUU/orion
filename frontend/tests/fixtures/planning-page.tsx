import '../../src/index.css';
import { createRoot } from 'react-dom/client';
import ServicePlanningPage from '../../src/modules/service-planning/ServicePlanningPage';
import { mapPendingTicketToPlannedService } from '../../src/modules/service-planning/helpers/normalizeService';
import type { ProfileSummary } from '../../src/components/servicesPlanning';

// Synthetic planning only: the official workbook must never be read from tests.
const realFetch = window.fetch.bind(window);
window.fetch = (input, init) =>
  String(input instanceof Request ? input.url : input).includes('docs.google.com')
    ? Promise.reject(new Error('Hoja oficial bloqueada en la prueba'))
    : realFetch(input, init);

const profiles: ProfileSummary[] = [
  { id: 'a', nombre_completo: 'Alfredo Acevedo', employee_type: 'Ingeniero', recibe_tickets: true },
  { id: 'b', nombre_completo: 'Martha Carbajal', employee_type: 'Ingeniero', recibe_tickets: true },
];

const week = (start: number, end: number) => ({
  fecha_tentativa: `${start} AL ${end} OCTUBRE`,
  week_start: `2026-10-${String(start).padStart(2, '0')}`,
  week_end: `2026-10-${String(end).padStart(2, '0')}`,
  planning_month_key: '2026-10',
});

const rows = [
  { id: 's1', asunto: '[PLAN] PREVENTIVO - BA200 - Hospital Central', serial: '832000706', meta: { ...week(12, 16), ingeniero_csv: 'Alfredo Acevedo', service_type: 'preventivo', scheduled_date: '2026-10-13' } },
  { id: 's2', asunto: '[PLAN] CORRECTIVO - A25 - Laboratorio del Norte', serial: null, meta: { ...week(12, 16), ingeniero_csv: 'Martha Carbajal', service_type: 'correctivo' } },
  { id: 's3', asunto: '[PLAN] CAPACITACION - BA400 - Clínica Sur', serial: '834000123', meta: { ...week(19, 23), ingeniero_csv: '', service_type: 'capacitacion', scheduled_date: '2026-10-21' } },
  { id: 's4', asunto: '[PLAN] PREVENTIVO - BA200 - Atoyac', serial: '832001685', meta: { ...week(26, 30), ingeniero_csv: 'Alfredo Acevedo', service_type: 'preventivo', scheduled_date: '2026-10-27' } },
];

const services = rows.map((row) =>
  mapPendingTicketToPlannedService(
    {
      id: row.id,
      user_id: null,
      asunto: row.asunto,
      estado: 'abierto',
      creado_en: '2026-10-02T15:00:00Z',
      numero_serie_equipo: row.serial,
      descripcion: `Cliente/Localidad: ${row.asunto.split(' - ').at(-1)}\n\n[METADATA_PLANEACION] ${JSON.stringify(row.meta)}`,
    },
    [],
    profiles,
  ),
);

// ?fail = the first load failed; ?stale = a refresh failed after a good load.
const params = new URLSearchParams(location.search);
const loadError = params.has('fail') || params.has('stale') ? 'No se pudo conectar con el servidor (prueba).' : null;
const noop = async () => undefined;

createRoot(document.getElementById('root')!).render(
  <ServicePlanningPage
    services={params.has('fail') ? [] : services}
    loading={false}
    loadError={loadError}
    onRetryLoad={() => {
      (window as unknown as { __retries?: number }).__retries = ((window as unknown as { __retries?: number }).__retries || 0) + 1;
    }}
    userRole="admin"
    currentUserName="Ricardo Montañez"
    engineerOptions={profiles.map((profile) => profile.nombre_completo || '')}
    staffProfiles={profiles}
    onCreateService={noop}
    onUpdateService={noop}
    onDeleteService={noop}
    onOpenTravel={() => undefined}
    onOpenReport={() => undefined}
    equipments={[]}
    reactiveTickets={[]}
    historicalRecords={[]}
    travelAdminPanel={<div />}
  />,
);
