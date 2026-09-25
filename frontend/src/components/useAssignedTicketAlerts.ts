import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function useAssignedTicketAlerts() {
  const [access, setAccess] = useState<{ userId: string | null; ticketIds: Set<string> }>({ userId: null, ticketIds: new Set() });
  useEffect(() => {
    let active = true;
    let generation = 0;
    const refresh = async () => {
      const request = ++generation;
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) throw new Error('Sin sesión');
        const ids = new Set<string>();
        for (let offset = 0; ; offset += 1000) {
          const result = await supabase.from('ticket_assignments').select('ticket_id')
            .eq('assigned_to', user.id).order('ticket_id').range(offset, offset + 999);
          if (result.error) throw result.error;
          result.data.forEach(row => ids.add(row.ticket_id));
          if (result.data.length < 1000) break;
        }
        if (active && request === generation) setAccess({ userId: user.id, ticketIds: ids });
      } catch {
        if (active && request === generation) setAccess({ userId: null, ticketIds: new Set() });
      }
    };
    const clearAndRefresh = () => {
      ++generation;
      setAccess({ userId: null, ticketIds: new Set() });
      void refresh();
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      ++generation;
      setAccess({ userId: null, ticketIds: new Set() });
      // Auth requests run outside the Supabase auth callback's lock.
      window.setTimeout(() => { if (active) void refresh(); }, 0);
    });
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    window.addEventListener('focus', clearAndRefresh);
    window.addEventListener('ticket-assignment-changed', clearAndRefresh);
    return () => {
      active = false; ++generation; subscription.unsubscribe(); window.clearInterval(timer);
      window.removeEventListener('focus', clearAndRefresh);
      window.removeEventListener('ticket-assignment-changed', clearAndRefresh);
    };
  }, []);
  return access;
}
