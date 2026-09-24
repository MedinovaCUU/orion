import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import type { CaseTicketRecord } from './TicketCaseDetail';

type StaffOption = { id: string; nombre_completo: string | null };
export default function TicketAssignmentControl({ ticket, onChanged }: { ticket: CaseTicketRecord; onChanged: () => void }) {
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [assigned, setAssigned] = useState('');
  const [selected, setSelected] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [assignment, profiles] = await Promise.all([
          supabase.from('ticket_assignments').select('assigned_to').eq('ticket_id', ticket.id).maybeSingle(),
          supabase.from('profiles').select('id,nombre_completo').in('rol', ['admin', 'tecnico']).order('nombre_completo'),
        ]);
        if (assignment.error || profiles.error) throw assignment.error || profiles.error;
        if (!active) return;
        setStaff(profiles.data || []); setAssigned(assignment.data?.assigned_to || ''); setSelected(assignment.data?.assigned_to || ''); setReady(true);
      } catch (cause) { if (active) setError((cause as Error).message); }
    })();
    return () => { active = false; };
  }, [ticket.id]);
  const save = async () => {
    setBusy(true); setError('');
    try {
      const result = await supabase.rpc('assign_support_ticket', { p_ticket_id: ticket.id, p_assigned_to: selected || null });
      if (result.error) throw result.error;
      setAssigned(selected);
      window.dispatchEvent(new Event('ticket-assignment-changed'));
      onChanged();
    } catch (cause) { setError((cause as Error).message || 'No se pudo guardar la asignación.'); }
    finally { setBusy(false); }
  };
  return <div className="tc-assignment">
    <label>Responsable del caso<select aria-label="Responsable del caso" disabled={!ready || busy || ticket.estado === 'cerrado'} value={selected} onChange={event => setSelected(event.target.value)}><option value="">Sin asignar</option>{staff.map(person => <option key={person.id} value={person.id}>{person.nombre_completo || person.id}</option>)}</select></label>
    {ticket.estado !== 'cerrado' && <button type="button" disabled={!ready || busy || selected === assigned} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar asignación'}</button>}
    <small>Las alarmas de Falcon se dirigen al responsable asignado. La asignación queda registrada en la bitácora.</small>
    {error && <p role="alert">{error}</p>}
  </div>;
}
