import { createRoot } from 'react-dom/client';
import { useMemo, useState } from 'react';
import { supabase } from '../../src/supabaseClient';
import FalconSlaAlerts, { type FalconSlaAlertEntry } from '../../src/components/FalconSlaAlerts';
import useSecondTicker from '../../src/components/useSecondTicker';
import type { FalconTicketSla } from '../../src/components/ticketIntake';

// Manual QA page for the Falcon SLA alarms (visual + audio) without Supabase or real tickets.
// Open it in any browser, Safari included, click anywhere once and pick a scenario.
const DEMO_USER = 'demo-user';
const DEMO_TICKET = 'demo-ticket';
supabase.auth.getUser = (async () => ({ data: { user: { id: DEMO_USER } }, error: null })) as typeof supabase.auth.getUser;
supabase.auth.onAuthStateChange = (() => ({ data: { subscription: { unsubscribe: () => {} } } })) as unknown as typeof supabase.auth.onAuthStateChange;
const assignmentQuery = { data: [{ ticket_id: DEMO_TICKET }], error: null };
const chain = { eq: () => chain, order: () => chain, range: async () => assignmentQuery };
supabase.from = (() => ({ select: () => chain })) as unknown as typeof supabase.from;

const HOUR_MS = 60 * 60 * 1000;
const SCENARIOS = [
  { label: 'Quedan 7 h 59 min (aviso 8 h)', remainingMs: 8 * HOUR_MS - 60 * 1000 },
  { label: 'Quedan 3 h 59 min (aviso 4 h)', remainingMs: 4 * HOUR_MS - 60 * 1000 },
  { label: 'Quedan 59 min (aviso 1 h)', remainingMs: HOUR_MS - 60 * 1000 },
  { label: 'Quedan 29 min (alerta 30 min)', remainingMs: 29 * 60 * 1000 },
  { label: 'Quedan 9 min (alerta 10 min)', remainingMs: 9 * 60 * 1000 },
  { label: 'SLA vencido', remainingMs: -5 * 60 * 1000 },
];

const formatCountdown = (remainingMs: number) => {
  const abs = Math.abs(remainingMs);
  const h = Math.floor(abs / HOUR_MS);
  const m = Math.floor((abs % HOUR_MS) / 60000);
  const s = Math.floor((abs % 60000) / 1000);
  const label = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return remainingMs < 0 ? `Vencido hace ${label}` : label;
};

const buildSla = (dueAtMs: number, nowMs: number): FalconTicketSla => {
  const remainingMs = dueAtMs - nowMs;
  const severity = remainingMs <= 0 ? 'breached' : remainingMs <= 3 * HOUR_MS ? 'critical' : remainingMs <= 8 * HOUR_MS ? 'warning' : 'healthy';
  return {
    tracked: true, channel: 'falcon', limitHours: 24, isMexicoCity: true,
    createdAtMs: dueAtMs - 24 * HOUR_MS, dueAtMs, elapsedMs: nowMs - (dueAtMs - 24 * HOUR_MS), remainingMs, severity,
    countdownLabel: formatCountdown(remainingMs),
    statusLabel: remainingMs <= 0 ? 'SLA vencido' : `Vence en ${formatCountdown(remainingMs)}`,
    scopeLabel: '24 h · CDMX',
  };
};

function Demo() {
  const [dueAtMs, setDueAtMs] = useState<number | null>(null);
  const nowMs = useSecondTicker(dueAtMs !== null);
  const entries = useMemo<FalconSlaAlertEntry[]>(
    () => (dueAtMs === null ? [] : [{ id: DEMO_TICKET, asunto: 'BA400 sin comunicación con LIS', estado: 'abierto', numeroSerie: 'BA400-2201', locationLabel: 'Hospital Ángeles · CDMX', sla: buildSla(dueAtMs, nowMs) }]),
    [dueAtMs, nowMs],
  );
  const reset = () => {
    sessionStorage.removeItem(`orion-falcon-sla-thresholds-v1:${DEMO_USER}`);
    setDueAtMs(null);
  };
  return (
    <>
      <h1>Demo de alertas SLA Falcon</h1>
      <p>Haz clic en cualquier parte de la página una vez (el navegador exige un gesto antes de reproducir audio) y elige un escenario. Cada botón reinicia la memoria de umbrales de la sesión.</p>
      <div>
        {SCENARIOS.map((scenario) => (
          <button key={scenario.label} type="button" onClick={() => { reset(); setDueAtMs(Date.now() + scenario.remainingMs); }}>{scenario.label}</button>
        ))}
        <button type="button" onClick={reset}>Limpiar</button>
      </div>
      <p>{dueAtMs === null ? 'Sin ticket activo.' : <>Ticket <code>{DEMO_TICKET}</code> vence {new Date(dueAtMs).toLocaleTimeString('es-MX')}.</>}</p>
      <FalconSlaAlerts contextLabel="Demo" entries={entries} />
    </>
  );
}

createRoot(document.getElementById('root')!).render(<Demo />);
