import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import type { TicketServiceEvent } from './ticketControlModel';

export default function useTicketServiceEvents(refreshKey: unknown, ticketId?: string) {
  const [events, setEvents] = useState<TicketServiceEvent[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const scope = useRef(ticketId);
  const [canApprove, setCanApprove] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      // Refresh the same case in place. Only a different case needs an initial loader.
      if (scope.current !== ticketId) {
        scope.current = ticketId;
        setLoaded(false);
        setEvents([]);
        setCanApprove(false);
      }
      setError('');
      try {
        const all: TicketServiceEvent[] = [];
        for (let offset = 0; ; offset += 1000) {
          const result = ticketId
            ? await supabase.from('ticket_service_events').select('*, profiles(nombre_completo)')
                .eq('ticket_id', ticketId).order('occurred_at').order('id').range(offset, offset + 999)
            : await supabase.rpc('get_ticket_control_events', { p_offset: offset, p_limit: 1000 });
          if (result.error) throw result.error;
          all.push(...result.data as TicketServiceEvent[]);
          if (!active) return;
          if (result.data.length < 1000) break;
        }
        const permission = await supabase.rpc('can_approve_ticket_delay');
        if (permission.error) throw permission.error;
        if (!active) return;
        setEvents(all); setCanApprove(permission.data === true); setLoaded(true);
      } catch (cause) {
        if (active) setError((cause as { message?: string }).message || 'No fue posible cargar los movimientos de servicio.');
      }
    })();
    return () => { active = false; };
  }, [refreshKey, ticketId]);
  return { events, error, loaded, canApprove };
}
