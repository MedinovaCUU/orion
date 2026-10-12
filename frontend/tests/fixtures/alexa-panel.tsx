import { createRoot } from 'react-dom/client';
import { supabase } from '../../src/supabaseClient';
import AlexaPanel from '../../src/components/AlexaPanel';
import '../../src/index.css';

// Standalone fixture: in-memory tables and RPCs, no network, no credentials. window.__alexaCalls records writes.
const now = Date.now();
const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3.6e6).toISOString();
const userId = 'tecnico-demo';
const db: Record<string, Array<Record<string, unknown>>> = {
  profiles: [{ id: userId, nombre_completo: 'Juan Pérez' }],
  alexa_links: [{ alexa_user_id: 'amzn1.ask.account.DEMO123456', linked_at: iso(48), last_seen_at: iso(0.2), notify: true, quiet_from: 20, quiet_to: 7 }],
  alexa_pending_actions: [
    { id: 'a1', kind: 'ticket', summary: 'Ticket de ingeniería · BA400 ···473 · Hospital Angeles · alarma de temperatura del rotor', payload: { serial: '834000473', area: 'ingenieria', motivo: 'alarma de temperatura del rotor', descripcion: 'alarma de temperatura del rotor\nCanal: Alexa (dictado por voz)\nCliente/Institución: Hospital Angeles' }, status: 'pendiente', created_at: iso(0.1), result: null },
    { id: 'a2', kind: 'refaccion', summary: '2 × lámparas halógenas · BA400 ···473', payload: { pieza: 'lámparas halógenas', cantidad: 2, serial: '834000473' }, status: 'pendiente', created_at: iso(0.2), result: null },
    { id: 'a3', kind: 'bitacora', summary: 'Nota de servicio · Hospital Angeles ···473', payload: { ticketId: 't1', tipo: 'avance', detalle: 'Hallazgos: lámpara agotada.\nAcciones: cambio de lámpara y calibración de glucosa.' }, status: 'pendiente', created_at: iso(0.3), result: null },
  ],
  alexa_alerts: [
    { id: 'l1', kind: 'sla', severity: 'critical', title: 'SLA Falcon · Hospital Angeles', speech: 'El caso Falcon de Hospital Angeles vence en 1 hora.', created_at: iso(0.5), acknowledged_at: null, ack_via: null, escalated_at: null },
    { id: 'l2', kind: 'alarma', severity: 'critical', title: 'Alarma fatal · ···999', speech: 'El BA400 terminación 9 9 9 está en alarma fatal, en brazo r1.', created_at: iso(2), acknowledged_at: iso(1.5), ack_via: 'voz', escalated_at: null },
  ],
  alexa_voice_cases: [
    { id: 'c1', user_id: userId, serial: '834000473', equipment_model: 'BA400', failed_tests: ['GLU'], correct_tests: ['CHOL', 'TG', 'URIC'], hypotheses: [{ key: 'hyp:control', title: 'Sospecha de control / calibrador', score: 100 }], top_hypothesis: 'hyp:control', confirmed_hypothesis: null, outcome: null, outcome_note: null, checks: [], created_at: iso(20) },
    { id: 'c2', user_id: userId, serial: '834009999', equipment_model: 'BA400', failed_tests: ['GLU', 'CHOL'], correct_tests: [], hypotheses: [{ key: 'hyp:optical', title: 'Sospecha óptica / fotometría', score: 72 }], top_hypothesis: 'hyp:optical', confirmed_hypothesis: 'hyp:optical', outcome: 'resuelto', outcome_note: null, checks: [], created_at: iso(72) },
  ],
};
const calls: Array<{ op: string; table?: string; fn?: string; args?: unknown }> = [];
(window as unknown as { __alexaCalls: typeof calls }).__alexaCalls = calls;

function query(table: string) {
  let rows = [...(db[table] || [])];
  let single = false;
  const api: Record<string, unknown> = {
    select: () => api,
    order: () => api,
    limit: () => api,
    eq: (col: string, value: unknown) => ((rows = rows.filter((r) => r[col] === value)), api),
    maybeSingle: () => ((single = true), api),
    single: () => ((single = true), api),
    insert: (value: Record<string, unknown>) => {
      calls.push({ op: 'insert', table, args: value });
      rows = [{ id: `${table}-new`, ...value }];
      return api;
    },
    then: (resolve: (v: unknown) => void) => resolve({ data: single ? rows[0] ?? null : rows, error: null }),
  };
  return api;
}
supabase.auth.getUser = (async () => ({ data: { user: { id: userId, email: 'juan@orion.test' } }, error: null })) as unknown as typeof supabase.auth.getUser;
supabase.from = ((table: string) => query(table)) as unknown as typeof supabase.from;
supabase.rpc = (async (fn: string, args: Record<string, unknown>) => {
  calls.push({ op: 'rpc', fn, args });
  if (fn === 'claim_alexa_code') return { data: args.p_code === '123456' ? 'ok' : 'invalido', error: null };
  if (fn === 'get_ticket_creation_receipt') return { data: [{ numero_caso: '1O200T61', responsable: 'Juan Pérez' }], error: null };
  if (fn === 'decide_alexa_action') {
    const row = db.alexa_pending_actions.find((r) => r.id === args.p_action_id);
    if (row) row.status = args.p_status;
  }
  if (fn === 'ack_alexa_alert') {
    const row = db.alexa_alerts.find((r) => r.id === args.p_alert_id);
    if (row) Object.assign(row, { acknowledged_at: new Date().toISOString(), ack_via: 'web' });
  }
  if (fn === 'set_alexa_case_outcome') {
    const row = db.alexa_voice_cases.find((r) => r.id === args.p_case_id);
    if (row) row.outcome = args.p_outcome;
  }
  return { data: null, error: null };
}) as unknown as typeof supabase.rpc;

createRoot(document.getElementById('root')!).render(
  <main style={{ maxWidth: 1200, margin: '0 auto', padding: '1rem' }}>
    <div className="card dashboard-card">
      <AlexaPanel isAdmin />
    </div>
  </main>,
);
