alter table public.ticket_whatsapp_outbox add column equipment_country text;

-- Snapshot the registered country by normalized serial, not by the digits in the serial.
create function public.ticket_whatsapp_equipment_country() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 select e.pais into new.equipment_country
 from public.tickets t join public.equipos e
 on public.normalize_equipment_serial(e.numero_serie)=public.normalize_equipment_serial(t.numero_serie_equipo)
 where t.id=new.ticket_id;
 return new;
end; $$;
revoke all on function public.ticket_whatsapp_equipment_country() from public,anon,authenticated;
create trigger ticket_whatsapp_country before insert on public.ticket_whatsapp_outbox
for each row execute function public.ticket_whatsapp_equipment_country();

-- Enrich pending work only. Accepted/uncertain attempts are never replayed.
update public.ticket_whatsapp_outbox o set equipment_country=e.pais
from public.tickets t join public.equipos e
on public.normalize_equipment_serial(e.numero_serie)=public.normalize_equipment_serial(t.numero_serie_equipo)
where o.ticket_id=t.id and o.status in ('queued','waiting','needs_phone');
