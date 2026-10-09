import { createRoot } from 'react-dom/client';
import { useMemo } from 'react';
import { supabase } from '../../src/supabaseClient';
import FalconSlaAlerts from '../../src/components/FalconSlaAlerts';
import useSecondTicker from '../../src/components/useSecondTicker';
let userId = 'francisco';
let notify: (() => void) | undefined;
// This standalone development fixture has no production route or credentials.
supabase.auth.getUser = (async () => ({ data: { user: { id: userId } }, error: null })) as typeof supabase.auth.getUser;
supabase.auth.onAuthStateChange = ((callback: () => void) => {
  notify = callback;
  return { data: { subscription: { unsubscribe: () => { notify = undefined; } } } };
}) as typeof supabase.auth.onAuthStateChange;
const buildEntries = (nowMs: number) => ['alfredo-ticket','unassigned-ticket'].map(id => ({ id, asunto: id, estado:'abierto', locationLabel:'CDMX', sla: {
 tracked:true, channel:'falcon' as const, limitHours:24 as const, isMexicoCity:true,
 createdAtMs:0, dueAtMs:1000, elapsedMs:nowMs, remainingMs:1000 - nowMs, severity:'breached' as const,
 countdownLabel:'Vencido',statusLabel:'SLA vencido',scopeLabel:'24 h',
} }));
function Fixture() {
 // Rebuild the entries every second, exactly like TicketFalconAlertsBridge does in production.
 const nowMs = useSecondTicker(true);
 const entries = useMemo(() => buildEntries(nowMs), [nowMs]);
 return <><button onClick={() => { userId='alfredo'; notify?.(); }}>Sesión Alfredo</button><button onClick={() => { userId='francisco'; notify?.(); }}>Sesión Francisco</button><button onClick={() => window.dispatchEvent(new Event('ticket-assignment-changed'))}>Actualizar asignación</button><FalconSlaAlerts contextLabel="Test" entries={entries} /></>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
