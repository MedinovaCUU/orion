// DATOS FICTICIOS para desarrollo y pruebas del laboratorio de confiabilidad. Nunca se mezclan con información real:
// series «FIC-…», clientes «Cliente ficticio N». Reacondicionamientos con menos piezas fallan más (λ 1.6 vs 0.6 por año)
// para que las pruebas y la página aislada tengan una señal conocida.
const DAY = 86400000;
const iso = day => new Date(day * DAY).toISOString().slice(0, 10);
const toDay = text => Date.UTC(+text.slice(0, 4), +text.slice(5, 7) - 1, +text.slice(8, 10)) / DAY;

export function syntheticLab({ seed = 11, recon = 56, fresh = 90, cut = '2026-10-13' } = {}) {
  let state = seed;
  const random = () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
  const pick = items => items[Math.floor(random() * items.length)];
  const cutDay = toDay(cut); const start = toDay('2023-04-01');
  const kits = { A15: ['LA10429', 'AC11527', 'AC11500', 'ME13377'], A25: ['LA10418', 'AC11527', 'MO11522'], BA200: ['5625', 'AC17292', 'AC16582'], BA400: ['5625', 'AC16603', 'AC17265', 'AC16581'] };
  const others = ['AC16561', 'AC16565', 'PC15061', 'AC14463', 'AC13304', 'AC16627'];
  const catalog = Object.fromEntries([...new Set([...Object.values(kits).flat(), ...others])].map(code => [code, `Pieza ficticia ${code}`]));
  const services = []; const tickets = []; const equipment = []; let n = 0;
  const service = (serial, day, kind, model, client, extra = {}) => services.push({ id: `hist:fic-${++n}`, history_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, ref: `Servicio F${n}`,
    day: iso(day), day_end: iso(day), kind, serial_key: serial, serial, model, client, sector: random() < 0.5 ? 'gobierno' : 'particular', minutes: Math.round(120 + random() * 400), ticket_id: null,
    note: extra.note ?? `Registro ficticio de ${kind}.`, parts: extra.parts ?? [] });
  const failuresAfter = (serial, t0, end, rate, model, client, pool) => {
    let t = t0;
    for (;;) {
      t += Math.max(1, Math.round((-Math.log(random() || 1e-9) / rate) * 365.25 * (random() < 0.3 ? 0.25 : 1)));
      if (t >= end) break;
      service(serial, t, 'correctivo', model, client, { parts: random() < 0.7 ? [[pick(pool), 1]] : [], note: 'Correctivo ficticio.' });
      if (random() < 0.6) tickets.push({ id: `tk-fic-${tickets.length}`, folio: `FIC-${tickets.length}`, serial_key: serial, opened_at: new Date((t - 2) * DAY + 15 * 3600000).toISOString(), closed_at: null, status: 'cerrado', subject: 'Ticket ficticio' });
    }
  };
  for (let i = 0; i < recon; i++) {
    const model = pick(Object.keys(kits)); const serial = `FIC-R${String(i).padStart(3, '0')}`; const client = `Cliente ficticio ${1 + (i % 17)}`;
    const recDay = start + Math.floor(random() * (cutDay - start - 120));
    service(serial, recDay - 200, 'preventivo', model, 'Cliente anterior ficticio');
    service(serial, recDay - 20, 'retiro', model, 'Cliente anterior ficticio');
    const parts = Math.floor(random() * 8); const used = [...kits[model]].sort(() => random() - 0.5).slice(0, Math.min(parts, kits[model].length));
    const lines = used.map(code => [code, 1]); if (parts > used.length) lines.push([pick(others), parts - used.length]);
    const caveat = i % 11 === 0 ? 'Proceso incompleto, queda a cargo de otro ingeniero.' : i % 13 === 0 ? 'No se realizaron pruebas a petición del cliente.' : 'Protocolo de reacondicionamiento ficticio.';
    service(serial, recDay, 'reacondicionamiento', model, 'Biosystems', { parts: lines, note: caveat });
    const delivery = recDay + 10 + Math.floor(random() * 50);
    const byInstall = random() < 0.6;
    if (delivery < cutDay) {
      if (byInstall) service(serial, delivery, 'instalacion', model, client);
      equipment.push({ serial_key: serial, model, client, assigned_on: iso(delivery), ended_on: null, warranty_until: null });
      failuresAfter(serial, delivery, cutDay, parts < 3 ? 1.6 : 0.6, model, client, [...kits[model], ...others]);
    } else equipment.push({ serial_key: serial, model, client: 'Biosystems', assigned_on: null, ended_on: null, warranty_until: null });
  }
  for (let i = 0; i < fresh; i++) {
    const model = pick(Object.keys(kits)); const serial = `FIC-N${String(i).padStart(3, '0')}`; const client = `Cliente ficticio ${1 + (i % 23)}`;
    const t0 = start + Math.floor(random() * (cutDay - start - 30));
    service(serial, t0, 'instalacion', model, client);
    equipment.push({ serial_key: serial, model, client, assigned_on: iso(t0), ended_on: null, warranty_until: iso(t0 + 365) });
    failuresAfter(serial, t0, cutDay, 1.0, model, client, [...kits[model], ...others]);
  }
  services.sort((a, b) => a.day.localeCompare(b.day));
  return { generated_at: new Date(cutDay * DAY).toISOString(), services, tickets, equipment, catalog, episodes: [], decisions: [], tests: [], links: [], costs: [] };
}

// One documented episode (still fictitious) so the decision views have something to draw.
export function withCapturedEpisode(payload) {
  const recon = payload.services.find(s => s.kind === 'reacondicionamiento' && payload.services.some(x => x.serial_key === s.serial_key && x.kind === 'correctivo'));
  const id = 'e0000000-0000-4000-8000-000000000001';
  const failure = payload.services.find(s => s.serial_key === recon.serial_key && s.kind === 'correctivo');
  return { ...payload,
    episodes: [{ id, serial_key: recon.serial_key, serial_raw: recon.serial, platform: recon.model, started_on: recon.day, finished_on: recon.day, history_service_ids: [recon.history_id], scope: 'minimo',
      release_result: 'liberado_con_salvedades', release_notes: 'Ficticio', budget_requested_mxn: 15000, budget_approved_mxn: 5000, budget_source: 'Cotización ficticia', notes: null, created_by_name: 'Usuario ficticio', created_at: recon.day, updated_at: recon.day }],
    decisions: [
      { id: 'd1', episode_id: id, component_code: 'AC16581', component_name: 'Bomba ficticia', subsystem: 'Fluídico', criticality: 'critica', condition: 'desgaste', condition_evidence: 'Ruido', recommendation: 'sustituir', recommended_by_name: 'Ingeniero ficticio', recommended_on: recon.day, estimated_cost_mxn: 8000, cost_source: 'Lista ficticia', authorization_status: 'rechazada', authorization_reason: 'presupuesto', authorization_detail: 'Ficticio', authorized_by_name: 'Gerente ficticio', authorized_on: recon.day, action_taken: 'conservado', action_evidence: null, residual_risk: 'alto', created_at: recon.day },
      { id: 'd2', episode_id: id, component_code: 'LA10429', component_name: 'Lámpara ficticia', subsystem: 'Fotométrico', criticality: 'mayor', condition: 'desgaste', condition_evidence: null, recommendation: 'sustituir', recommended_by_name: 'Ingeniero ficticio', recommended_on: recon.day, estimated_cost_mxn: 2000, cost_source: null, authorization_status: 'aprobada', authorization_reason: null, authorization_detail: null, authorized_by_name: 'Gerente ficticio', authorized_on: recon.day, action_taken: 'sustituido', action_evidence: null, residual_risk: 'bajo', created_at: recon.day },
    ],
    links: failure ? [{ id: 'l1', episode_id: id, failure_service_id: failure.history_id, failure_ticket_id: null, decision_id: 'd1', component_code: 'AC16581', relation: 'mismo_componente', evidence: 'Ficticio', assessed_by_name: 'Ingeniero ficticio', assessed_on: failure.day }] : [],
    costs: failure ? [
      { id: 'c1', serial_key: recon.serial_key, episode_id: id, service_id: recon.history_id, ticket_id: null, phase: 'reacondicionamiento', category: 'refacciones', amount_mxn: 5000, nature: 'comprobado', source_document: 'FIC-1', occurred_on: recon.day, notes: null },
      { id: 'c2', serial_key: recon.serial_key, episode_id: id, service_id: failure.history_id, ticket_id: null, phase: 'correctivo', category: 'viaticos', amount_mxn: 7500, nature: 'comprobado', source_document: 'FIC-2', occurred_on: failure.day, notes: null },
      { id: 'c3', serial_key: recon.serial_key, episode_id: id, service_id: failure.history_id, ticket_id: null, phase: 'correctivo', category: 'refacciones', amount_mxn: 8000, nature: 'estimado', source_document: null, occurred_on: failure.day, notes: null },
    ] : [] };
}
