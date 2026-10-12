import type { KpiSummary } from '../../src/components/serviceKpiModel';

// Isolated time lab with synthetic, realistic tickets (no session, no production data): ~650 cases in
// six months, long-tailed closing times, office-hours arrivals, Falcon CDMX on a 24 h commitment.
let seed = 7;
const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const normal = () => Math.sqrt(-2 * Math.log(random() || 1e-9)) * Math.cos(2 * Math.PI * random());
const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)];
const H = 3600000;
const start = Date.parse('2026-04-13T06:00:00Z'); const cut = Date.parse('2026-10-12T18:00:00Z');
const people = [['p1', 'Ana Torres', 'quimica'], ['p2', 'Luis Pérez', 'ingenieria'], ['p3', 'Sofía Ruiz', 'quimica'], ['p4', 'Jorge Díaz', 'ingenieria'], ['p5', 'Elena Mora', 'ingenieria'], ['p6', 'Raúl Soto', 'quimica']];
const clients = ['Hospital Central', 'Clínica del Valle', 'Laboratorio Norte', 'Centro de Salud Sur', 'Hospital General', 'Laboratorio Delta', 'Clínica San José'];
export const rows = Array.from({ length: 660 }, (_, i) => {
  let opened = start + random() * (cut - start);
  const local = new Date(opened - 6 * H); // America/Chihuahua
  if (local.getUTCDay() === 0 || local.getUTCDay() === 6) opened += (random() < 0.7 ? 2 : 0) * 24 * H;
  const hourShift = 8 + Math.floor(Math.abs(normal()) * 3.2) - local.getUTCHours();
  opened += hourShift * H;
  const [id, name, team] = i % 23 === 0 ? [null, null, pick(['quimica', 'ingenieria'])] : pick(people);
  const falcon = random() < 0.16; const cdmx = falcon && random() < 0.45;
  const target = cdmx ? 24 : 48;
  const priority = pick(['alta', 'media', 'media', 'baja', 'sin_prioridad']);
  const hours = Math.exp(Math.log(team === 'ingenieria' ? 26 : 14) + normal() * 1.25 + (priority === 'alta' ? -0.4 : 0));
  const closedAt = opened + hours * H;
  const cancelled = random() < 0.04;
  const closed = closedAt <= cut;
  const late = hours > target;
  const result = !closed ? (hours > target ? 'vencido' : 'en_curso') : cancelled ? 'no_aplica' : late ? 'fuera' : 'dentro';
  const month = (t: number) => new Date(t).toISOString().slice(0, 7) + '-01';
  return {
    ticket_id: `lab-${i}`, folio: `OR-${String(1000 + i)}`, asunto: 'Caso sintético', team, service_type: `soporte_${team}`, priority,
    channel: falcon ? 'falcon' : random() < 0.08 ? 'centrum' : null, region: cdmx ? 'cdmx' : 'foraneo', client: pick(clients), platform: pick(['BA400', 'BA200', 'A15', 'A25', 'Y15']),
    serial: `SN-${i}`, responsible_id: id, responsible_name: name, estado: closed ? 'cerrado' : 'abierto',
    opened_at: new Date(opened).toISOString(), closed_at: closed ? new Date(closedAt).toISOString() : null, opened_bucket: month(opened), closed_bucket: closed ? month(closedAt) : null,
    closure_class: closed ? (cancelled ? 'cancelado' : 'solucionado') : null, sla_target_hours: target, sla_result: result, justified: result === 'fuera' && random() < 0.12,
    opened_in_period: true, closed_in_period: closed, sla_evaluable: closed && !cancelled, relevant: true,
  };
});
export const months = ['2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'];
const series = months.map(bucket => ({
  bucket, opened: rows.filter(row => row.opened_bucket === bucket).length, closed: rows.filter(row => row.closed_bucket === bucket).length,
  closed_late: rows.filter(row => row.closed_bucket === bucket && row.sla_result === 'fuera').length,
  sla_evaluable: rows.filter(row => row.closed_bucket === bucket && row.sla_evaluable).length,
}));
export const summary = {
  period: { from: '2026-04-13', to: '2026-10-12', previous_from: '2025-10-13', previous_to: '2026-04-12', cut_at: new Date(cut).toISOString(), cut_is_now: true,
    timezone: 'America/Chihuahua', granularity: 'month', recurrence_days: 30, min_sample: 5, capture_since: '2026-10-12T00:38:00Z' },
  current: {}, previous: {}, series, breakdowns: { staff: [] }, quality: {}, policies: [],
} as unknown as KpiSummary;


export function stubRecordsFetch(source: Array<Record<string, unknown>>) {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/rpc/get_service_kpi_visit_links')) {
      const links = source.filter((row, index) => row.closed_in_period && index % 5 === 0).map((row, k) => ({
        ticket_id: row.ticket_id, folio: row.folio, servicio_id: `svc-${k}`, id_legacy: 5000 + k, fecha_servicio: String(row.opened_at).slice(0, 10),
        dias: [0, 1, 1, 2, 2, 3, 4, 6, 9][k % 9], confianza: k % 3 === 0 ? 'segura' : 'probable', tipo: k % 4 ? 'correctivo' : 'visita', tecnico: 'Luis Pérez', revisitas: k % 4 === 0 ? 1 : 0 }));
      return new Response(JSON.stringify(links), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/rpc/get_service_kpi_records')) {
      const body = JSON.parse(String(init?.body || '{}'));
      await new Promise(resolve => setTimeout(resolve, 250));
      return new Response(JSON.stringify({ total: source.length, rows: source.slice(body.p_offset, body.p_offset + body.p_limit) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(input, init);
  };
}

// A complete general summary for the deck fixture, derived from the same synthetic rows
// (activity and quality figures are plausible constants: they have no per-row source here).
export function fullSummary(): KpiSummary {
  const ratio = (num: number, den: number) => ({ num, den, pct: den ? Math.round(num / den * 1000) / 10 : null });
  const quantile = (values: number[], q: number) => { const s = [...values].sort((a, b) => a - b); return s.length ? Math.round(s[Math.floor((s.length - 1) * q)] * 100) / 100 : null; };
  const hours = (row: (typeof rows)[number]) => row.closed_at ? (Date.parse(row.closed_at) - Date.parse(row.opened_at)) / H : null;
  const closed = rows.filter(row => row.closed_in_period);
  const evaluable = closed.filter(row => row.sla_evaluable);
  const late = evaluable.filter(row => row.sla_result === 'fuera');
  const solved = closed.filter(row => row.closure_class === 'solucionado').map(hours).filter((value): value is number => value !== null);
  const open = rows.filter(row => !row.closed_in_period);
  const current = {
    tickets_opened: rows.length, tickets_closed: closed.length, tickets_cancelled: closed.filter(row => row.closure_class === 'cancelado').length,
    late_rate: ratio(late.length, evaluable.length), sla_compliance: ratio(evaluable.length - late.length, evaluable.length),
    sla_late_justified: late.filter(row => row.justified).length, sla_no_policy: 0,
    first_response_median: 1.4, first_response_avg: 2.6, first_response_n: 412, first_response_base: rows.length,
    resolution_median: quantile(solved, 0.5), resolution_avg: Math.round(solved.reduce((a, b) => a + b, 0) / solved.length * 100) / 100, resolution_p90: quantile(solved, 0.9), resolution_n: solved.length,
    pending_at_cut: open.length, overdue_at_cut: open.filter(row => row.sla_result === 'vencido').length, unassigned_pending: open.filter(row => !row.responsible_id).length, unknown_at_cut: 0,
    reopen_rate: ratio(9, 512), ftf_rate: ratio(204, 262), recurrence_rate: ratio(31, 238),
    preventive_compliance: ratio(61, 84), preventive_pending: 6, preventive_overdue: 11, preventive_no_evidence: 6,
    corrective_share: ratio(118, 262), visits: 312, visits_with_failure: 140, calls: 205, trainings_total: 48,
  };
  const previous = { ...current, tickets_opened: 612, tickets_closed: 598, late_rate: ratio(171, 571), sla_compliance: ratio(400, 571), resolution_median: 21.3, pending_at_cut: 14,
    reopen_rate: ratio(12, 498), ftf_rate: ratio(188, 251), recurrence_rate: ratio(35, 226), preventive_compliance: ratio(55, 82), corrective_share: ratio(121, 251), visits: 296, calls: 188, trainings_total: 41 };
  const series = summary.series.map((row, index) => ({ ...row, preventive_executed: [8, 11, 10, 9, 12, 10, 3][index], corrective: [14, 19, 21, 18, 22, 19, 5][index],
    maintenance_visits: [22, 30, 31, 27, 34, 29, 8][index], visits: [34, 49, 52, 47, 58, 54, 18][index], calls: [22, 33, 35, 31, 38, 34, 12][index] }));
  const staff = people.map(([id, name, team], index) => {
    const mine = rows.filter(row => row.responsible_id === id);
    const mineEvaluable = mine.filter(row => row.sla_evaluable);
    const mineSolved = mine.filter(row => row.closure_class === 'solucionado').map(hours).filter((value): value is number => value !== null);
    return { id, name, team, tickets_relevant: mine.length, tickets_opened: mine.length, tickets_closed: mine.filter(row => row.closed_in_period).length,
      sla_evaluable: mineEvaluable.length, sla_late: mineEvaluable.filter(row => row.sla_result === 'fuera').length,
      pending_at_cut: mine.filter(row => !row.closed_in_period).length, overdue_at_cut: mine.filter(row => row.sla_result === 'vencido').length,
      pending_by_priority: {}, pending_by_type: {}, resolution_median: quantile(mineSolved, 0.5),
      trainings: team === 'quimica' ? 12 + index : 0, trainings_done: team === 'quimica' ? 10 + index : 0, visits: 40 + index * 7, calls: 25 + index * 4, call_minutes: null,
      preventive_programmed: team === 'ingenieria' ? 18 + index : 0, preventive_done: team === 'ingenieria' ? 13 + index : 0, corrective: team === 'ingenieria' ? 30 + index * 2 : 0,
      surveys: 0, satisfaction_avg: null };
  });
  return { ...summary, current, previous, series, breakdowns: { staff },
    quality: { tickets_without_first_response: 248, tickets_without_priority: 131, history_unclassified: 17, calls_without_duration: 205, surveys_answered_total: 0, capture_since: '2026-10-12T00:38:00Z' } } as unknown as KpiSummary;
}
