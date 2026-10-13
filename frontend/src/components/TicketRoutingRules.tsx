import { useEffect, useState } from 'react';
import PrivateName from './PrivateName';
import { shownName } from '../config/presentationPrivacy';
import { supabase } from '../supabaseClient';

type Person = { id: string; nombre_completo: string | null };
type Coverage = { user_id: string; territory: string; area: string };
type Owner = { serial: string; area: string; assigned_to: string };
type GovernmentMember = { user_id: string };
export default function TicketRoutingRules({ onChanged }: { onChanged: () => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [coverage, setCoverage] = useState<Coverage[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [government, setGovernment] = useState<GovernmentMember[]>([]);
  const [person, setPerson] = useState('');
  const [area, setArea] = useState('ingenieria');
  const [territory, setTerritory] = useState('');
  const [serial, setSerial] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    const [p, c, o, m, g] = await Promise.all([
      supabase.from('profiles').select('id,nombre_completo').in('rol', ['admin', 'tecnico']).order('nombre_completo'),
      supabase.from('ticket_staff_coverage').select('*'), supabase.from('ticket_equipment_owners').select('*'),
      supabase.from('user_module_permissions').select('user_id,modules,can_receive_tickets'),
      supabase.from('ticket_government_team').select('user_id'),
    ]);
    const error = p.error || c.error || o.error || m.error || g.error;
    if (error) throw error;
    const eligible = new Set((m.data || []).filter(row => row.can_receive_tickets && row.modules?.includes('tickets')).map(row => row.user_id));
    setPeople((p.data || []).filter(row => eligible.has(row.id))); setCoverage(c.data || []); setOwners(o.data || []); setGovernment(g.data || []);
  };
  useEffect(() => { void refresh().catch(error => setMessage(error.message)); }, []);
  const perform = async (action: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true); setMessage('');
    try { const result = await action(); if (result.error) throw result.error; await refresh(); setMessage('Configuración guardada.'); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  };
  const name = (id: string) => people.find(p => p.id === id)?.nombre_completo || 'Usuario no habilitado';
  return <details className="tc-routing"><summary>Reglas de asignación y cobertura territorial</summary>
    <p>Cada caso nuevo se asigna dentro de su especialidad, en este orden: 1) continuidad: quien atendió el caso que se reabre, el responsable habitual del equipo o quien atendió su caso anterior; 2) región: quien cubre el estado del equipo; 3) carga: quien tenga menos casos abiertos y, en empate, quien cerró su último caso hace más tiempo.</p>
    <p>Se salta a quien hoy está ocupado: 3 o más casos abiertos, una visita planeada para hoy o un viaje. La planeación de toda la semana no cuenta. En casos de gobierno (Falcon, Genesis, Centrum, Dicipa) el equipo de gobierno tiene un poco más de peso, sin ser obligatorio. Cada asignación deja en la bitácora la regla que la decidió.</p>
    <p>La cobertura se define aquí por estado; “Ubicaciones” en el perfil no representa una cobertura. Habilita al personal en Permisos → Recibir tickets.</p>
    <div className="tc-filters">
      <label>Especialidad<select aria-label="Especialidad" value={area} onChange={e => setArea(e.target.value)}><option value="ingenieria">Ingeniería</option><option value="quimica">Química</option></select></label>
      <label>Responsable<select aria-label="Responsable" value={person} onChange={e => setPerson(e.target.value)}><option value="">Seleccionar personal habilitado</option>{people.map(p => <option key={p.id} value={p.id}>{shownName(p.nombre_completo) || p.id}</option>)}</select></label>
      <label>Estado de cobertura<input value={territory} onChange={e => setTerritory(e.target.value)} placeholder="Ej. Chihuahua (como aparece en el equipo)" /></label>
      <button disabled={busy || !person || !territory.trim()} onClick={() => void perform(() => supabase.from('ticket_staff_coverage').upsert({ user_id: person, area, territory: territory.trim().toLowerCase() }))}>Agregar cobertura</button>
      <label>Serie del equipo<input value={serial} onChange={e => setSerial(e.target.value)} placeholder="Serie para responsable habitual" /></label>
      <button disabled={busy || !person || !serial.trim()} onClick={() => void perform(() => supabase.from('ticket_equipment_owners').upsert({ serial: serial.trim(), area, assigned_to: person }))}>Guardar responsable habitual</button>
      <button disabled={busy || !person || government.some(g => g.user_id === person)} onClick={() => void perform(() => supabase.from('ticket_government_team').insert({ user_id: person }))}>Agregar al equipo de gobierno</button>
    </div>
    <ul>{coverage.map(c => <li key={`${c.user_id}-${c.territory}-${c.area}`}><PrivateName>{name(c.user_id)}</PrivateName> · {c.area} · {c.territory} <button disabled={busy} onClick={() => void perform(() => supabase.from('ticket_staff_coverage').delete().match({ user_id: c.user_id, territory: c.territory, area: c.area }))}>Retirar cobertura</button></li>)}</ul>
    <ul>{government.map(g => <li key={`gob-${g.user_id}`}><PrivateName>{name(g.user_id)}</PrivateName> · equipo de gobierno <button disabled={busy} onClick={() => void perform(() => supabase.from('ticket_government_team').delete().match({ user_id: g.user_id }))}>Retirar de gobierno</button></li>)}</ul>
    <ul>{owners.map(o => <li key={`${o.serial}-${o.area}`}>{o.serial} · {o.area} · <PrivateName>{name(o.assigned_to)}</PrivateName> <button disabled={busy} onClick={() => void perform(() => supabase.from('ticket_equipment_owners').delete().match({ serial: o.serial, area: o.area }))}>Retirar habitual</button></li>)}</ul>
    <button disabled={busy} onClick={() => { setBusy(true); void supabase.rpc('route_pending_support_tickets').then(({ data, error }) => { setMessage(error ? error.message : `${data} casos pendientes asignados. Las asignaciones existentes se conservan.`); setBusy(false); window.dispatchEvent(new Event('ticket-assignment-changed')); onChanged(); }); }}>Distribuir casos sin asignación</button>
    <p role="status">{message}</p>
  </details>;
}
