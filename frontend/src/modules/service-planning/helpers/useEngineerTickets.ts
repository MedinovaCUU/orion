import { useEffect, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import type { ControlTicket, TicketServiceEvent } from '../../../components/ticketControlModel';
import type { EngineerTicketFeed, EngineerTicket } from './engineerTickets';

export default function useEngineerTickets(profileIds: string[], enabled = true): EngineerTicketFeed {
  const key = [...new Set(profileIds)].sort().join(',');
  const [feed,setFeed] = useState<EngineerTicketFeed>({tickets:[],loading:true,error:'',updatedAt:null});
  useEffect(()=>{
    if (!enabled) return;
    let active = true;
    let busy = false;
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const ids = key.split(',').filter(Boolean);
        const assignments: {ticket_id:string;assigned_to:string}[] = [];
        if (ids.length) for(let offset=0;;offset+=1000) {
          const result = await supabase.from('ticket_assignments').select('ticket_id,assigned_to').in('assigned_to',ids).order('ticket_id').range(offset,offset+999);
          if(result.error) throw result.error;
          assignments.push(...(result.data || []));
          if((result.data?.length || 0)<1000) break;
        }
        const tickets: EngineerTicket[] = [];
        for(let start=0;start<assignments.length;start+=100) {
          const chunk=assignments.slice(start,start+100);
          const result=await supabase.from('tickets').select('id,asunto,descripcion,estado,creado_en,numero_caso,numero_serie_equipo').in('id',chunk.map(a=>a.ticket_id)).neq('estado','cerrado');
          if(result.error) throw result.error;
          const open=(result.data || []).filter(t=>!t.descripcion?.includes('[METADATA_PLANEACION]')) as ControlTicket[];
          const events:TicketServiceEvent[]=[];
          if(open.length) for(let offset=0;;offset+=1000) {
            const history=await supabase.from('ticket_service_events').select('id,ticket_id,kind,detail,actor_id,occurred_at,closure_reason').in('ticket_id',open.map(t=>t.id)).order('occurred_at').order('id').range(offset,offset+999);
            if(history.error) throw history.error;
            events.push(...(history.data || []) as TicketServiceEvent[]);
            if((history.data?.length || 0)<1000) break;
          }
          tickets.push(...open.map(ticket=>({...ticket,assignedTo:chunk.find(a=>a.ticket_id===ticket.id)!.assigned_to,events:events.filter(e=>e.ticket_id===ticket.id)})));
        }
        if(active) setFeed({tickets,loading:false,error:'',updatedAt:new Date().toISOString()});
      } catch(error) {
        if(active) setFeed(current=>({...current,loading:false,error: error instanceof Error ? error.message : 'No se pudo actualizar el seguimiento de tickets.'}));
      } finally {busy=false;}
    };
    void refresh();
    const timer=window.setInterval(()=>void refresh(),30000);
    const update=()=>void refresh();
    window.addEventListener('focus',update);
    window.addEventListener('ticket-assignment-changed',update);
    return ()=>{active=false;clearInterval(timer);window.removeEventListener('focus',update);window.removeEventListener('ticket-assignment-changed',update);};
  },[key,enabled]);
  return feed;
}
