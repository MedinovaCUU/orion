import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ServiceSupremoMetric from '../../src/components/ServiceSupremoMetric';
import SupremoVisitCheck from '../../src/components/SupremoVisitCheck';
import '../../src/index.css';
import '../../src/components/Tickets.css';
import '../../src/components/TicketControlCenter.css';
import '../../src/components/ServiceKpiCenter.css';
import '../../src/components/TravelPlannerModal.css';
import '../../src/components/ServiceReportModal.css';

// Isolated Supremo metric: the RPCs are answered by an in-memory server with the same rules as
// 20261013020000 (outcome per visit, written exemptions, switch, capture from the visit).
type Visit = { visit_date: string; serial: string | null; platform: string | null; client: string | null; people: string[]; sources: string; valid: 'start' | 'cut' | 'late' | 'none'; detail?: string; in_catalog?: boolean; folio?: string };
const NAMES: Record<string, [string, string]> = { e1: ['Alfredo Acevedo', 'ingenieria'], e2: ['Diego Garcia', 'ingenieria'], q1: ['Ivonne Jaramillo', 'quimica'] };
const visits: Visit[] = [
  { visit_date: '2026-10-01', serial: '834001902', platform: 'BA400', client: 'Hospital Norte', people: ['e1'], sources: 'Reporte de servicio', valid: 'start' },
  { visit_date: '2026-10-02', serial: '832001973', platform: 'BA200', client: 'Clínica Sur', people: ['e2'], sources: 'Historial de servicio + Bitácora · visita', valid: 'cut', folio: 'OR-0102' },
  { visit_date: '2026-10-03', serial: '831055847', platform: 'A15', client: 'Laboratorio Delta', people: ['e2'], sources: 'Reporte de servicio', valid: 'none' },
  { visit_date: '2026-10-05', serial: '834003418', platform: 'BA400', client: 'Hospital Ángeles', people: ['e1', 'q1'], sources: 'Parte SAP 4410', valid: 'none', detail: 'ID de Supremo inválido (debe tener 9 dígitos)' },
  { visit_date: '2026-10-06', serial: '832000111', platform: 'BA200', client: 'Laboratorio Médico Polanco', people: ['q1'], sources: 'Historial de servicio', valid: 'late' },
  { visit_date: '2026-10-07', serial: 'X-998', platform: null, client: null, people: ['e1'], sources: 'Bitácora · visita', valid: 'none', in_catalog: false },
  { visit_date: '2026-10-08', serial: null, platform: null, client: null, people: ['e2'], sources: 'Historial de servicio', valid: 'none' },
  { visit_date: '2026-10-12', serial: '834009999', platform: 'BA400 [DEMO]', client: 'Biosystems', people: ['e1'], sources: 'Reporte de servicio', valid: 'none' },
];
const today = '2026-10-13';
let settings = { active: true, effective_from: '2026-10-01', grace_days: 3, history_since: '2026-10-01T18:00:00Z', reason: null as string | null, updated_at: '2026-10-01T18:00:00Z', updated_by_name: null as string | null, timezone: 'America/Chihuahua' };
const exemptions: Array<Record<string, unknown>> = [];
const registered = new Map([['834001902', '958113330']]);
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 864e5).toISOString().slice(0, 10);
const ratio = (num: number, den: number) => ({ num, den, pct: den ? Math.round(num / den * 1000) / 10 : null });

function evaluate() {
  const rows = visits.map((visit, index) => {
    const deadline = addDays(visit.visit_date, settings.grace_days);
    const exemption = exemptions.find(item => item.serial_key === visit.serial && !item.revoked_at);
    const [outcome, reason, detail] = !visit.serial ? ['sin_serie', 'sin_serie', 'La visita no tiene número de serie']
      : exemption ? ['anulada', 'justificada', 'Anulada por justificación']
        : visit.valid === 'start' ? ['positiva', 'ya_registrado', 'Supremo ya registrado antes de la visita']
          : visit.valid === 'cut' ? ['positiva', 'registrado_en_plazo', 'Supremo registrado dentro del plazo']
            : registered.has(visit.serial) && deadline >= today ? ['positiva', 'registrado_en_plazo', 'Supremo registrado dentro del plazo']
              : deadline >= today ? ['pendiente', 'sin_registro', visit.detail || 'Sin Supremo registrado']
                : ['negativa', visit.in_catalog === false ? 'fuera_de_catalogo' : 'sin_registro', visit.in_catalog === false ? 'El número de serie no está en el catálogo de equipos' : visit.detail || 'Sin Supremo registrado'];
    return { visit_id: `visita:${index}`, visit_date: visit.visit_date, deadline, serial: visit.serial, serial_key: visit.serial, platform: visit.platform, client: visit.client,
      sources: visit.sources, kinds: ['correctivo'], ticket_id: visit.folio ? `t-${index}` : null, folio: visit.folio || null, participant_ids: visit.people,
      participant_names: visit.people.map(key => NAMES[key][0]).join(' / '), unmatched_names: null, outcome, reason, detail, in_catalog: visit.in_catalog !== false,
      equipment_id: visit.serial, supremo_id: outcome === 'positiva' ? visit.serial?.replace(/\D/g, '').padEnd(9, '0').slice(0, 9) : null,
      exemption_id: exemption?.id || null, exemption_justification: exemption?.justification || null, exemption_by: exemption ? 'Dirección de Servicio' : null, exemption_at: exemption?.created_at || null };
  });
  const count = (key: string) => rows.filter(row => row.outcome === key).length;
  const people = Object.entries(NAMES).map(([id, [name, team]]) => {
    const mine = rows.filter(row => row.participant_ids.includes(id));
    const c = (key: string) => mine.filter(row => row.outcome === key).length;
    return { id, name, team, positive: c('positiva'), negative: c('negativa'), pending: c('pendiente'), voided: c('anulada'), compliance: ratio(c('positiva'), c('positiva') + c('negativa')) };
  });
  const order = ['negativa', 'pendiente', 'sin_serie', 'anulada', 'positiva'];
  return { settings, totals: { visits: rows.length, positive: count('positiva'), already: rows.filter(row => row.reason === 'ya_registrado').length,
    installed: rows.filter(row => row.reason === 'registrado_en_plazo').length, negative: count('negativa'), pending: count('pendiente'), voided: count('anulada'), no_serial: count('sin_serie') },
    compliance: ratio(count('positiva'), count('positiva') + count('negativa')), people,
    visits: [...rows].sort((a, b) => order.indexOf(a.outcome) - order.indexOf(b.outcome) || b.visit_date.localeCompare(a.visit_date)) };
}

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (message: string) => reply({ message, code: 'P0001' }, 400);
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const rpc = url.match(/\/rpc\/([a-z_]+)/)?.[1];
  if (!rpc) return realFetch(input, init);
  const body = JSON.parse(String(init?.body || '{}'));
  await new Promise(resolve => setTimeout(resolve, 200));
  if (rpc === 'get_supremo_metric') return reply(settings.active ? evaluate() : { settings });
  if (rpc === 'get_supremo_exemptions') return reply(exemptions.map(item => ({ ...item, model: visits.find(v => v.serial === item.serial_key)?.platform || null, client: visits.find(v => v.serial === item.serial_key)?.client || null })));
  if (rpc === 'set_supremo_metric_settings') {
    if (settings.active && !body.p_active && String(body.p_reason || '').trim().length < 10) return fail('Escribe el motivo para desactivar la métrica (al menos 10 caracteres)');
    settings = { ...settings, active: body.p_active, effective_from: body.p_effective_from, grace_days: body.p_grace_days, reason: body.p_reason, updated_at: new Date().toISOString(), updated_by_name: 'Dirección de Servicio' };
    return reply(settings);
  }
  if (rpc === 'justify_supremo_exemption') {
    if (String(body.p_justification).trim().length < 20) return fail('Escribe la justificación completa (al menos 20 caracteres)');
    const item = { id: `ex-${exemptions.length + 1}`, serial: body.p_serial, serial_key: String(body.p_serial).trim().toUpperCase(), equipment_id: body.p_serial, justification: body.p_justification.trim(),
      created_at: new Date().toISOString(), created_by_name: 'Dirección de Servicio', revoked_at: null, revoked_by_name: null, revoke_reason: null };
    exemptions.unshift(item);
    return reply(item.id);
  }
  if (rpc === 'revoke_supremo_exemption') {
    const item = exemptions.find(entry => entry.id === body.p_id);
    if (item) Object.assign(item, { revoked_at: new Date().toISOString(), revoked_by_name: 'Dirección de Servicio', revoke_reason: body.p_reason });
    return reply(null);
  }
  const status = (serial: string) => ({ active: settings.active, serial_key: serial.toUpperCase(), in_catalog: serial !== 'X-998', equipment_id: serial, model: 'BA400',
    registered: registered.has(serial), supremo_id: registered.get(serial) || null, enabled: registered.has(serial),
    exempt: exemptions.some(item => item.serial_key === serial && !item.revoked_at), grace_days: settings.grace_days });
  if (rpc === 'get_equipment_supremo_status') return reply(settings.active ? status(String(body.p_serial).trim()) : { active: false });
  if (rpc === 'register_equipment_supremo') {
    if (!/^\d{9}$/.test(String(body.p_supremo_id).replace(/\D/g, ''))) return fail('El ID de Supremo debe tener 9 dígitos');
    registered.set(String(body.p_serial).trim(), String(body.p_supremo_id).replace(/\D/g, ''));
    return reply(status(String(body.p_serial).trim()));
  }
  return realFetch(input, init);
};

function Fixture() {
  const [revision, setRevision] = useState(0);
  const [serial, setSerial] = useState('834009999');
  const [log, setLog] = useState('');
  return <main style={{ maxWidth: 1400, margin: '0 auto', display: 'grid', gap: 24 }}>
    <div className="tc-center" style={{ background: '#fff', borderRadius: 16, paddingBottom: 12 }}>
      <ServiceSupremoMetric view="general" filters={{ from: '2026-10-01', to: today }} revision={revision} onOpenTicket={ticket => setLog(`Abrir expediente ${ticket.folio}`)} />
      {log && <p className="kpi-note" data-testid="log">{log}</p>}
    </div>
    <section className="travel-form-section" style={{ background: '#fff', borderRadius: 16, padding: 24 }}>
      <h3 style={{ marginTop: 0 }}>Reporte de servicio presencial · ingeniero</h3>
      <label>Número de serie <input className="input-field" value={serial} onChange={event => setSerial(event.target.value)} /></label>
      <SupremoVisitCheck serial={serial} />
      <button type="button" style={{ marginTop: 12 }} onClick={() => setRevision(value => value + 1)}>Recalcular métrica</button>
    </section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
