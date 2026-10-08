create table public.ticket_whatsapp_outbox (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.tickets(id),
 survey_id uuid references public.ticket_satisfaction(id),
 event text not null check(event in ('received','response','closed','survey')),
 template text not null, parameters jsonb not null, recipient text,
 status text not null default 'queued' check(status in ('queued','processing','waiting','accepted','failed','unknown','skipped','needs_phone')),
 error_message text, provider_message_id text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), next_attempt_at timestamptz not null default now(),
 unique(ticket_id,event)
);
alter table public.ticket_whatsapp_outbox enable row level security;
revoke all on public.ticket_whatsapp_outbox from public,anon,authenticated;
grant select on public.ticket_whatsapp_outbox to authenticated;
grant all on public.ticket_whatsapp_outbox to service_role;
create policy whatsapp_outbox_admin_read on public.ticket_whatsapp_outbox for select to authenticated using(public.is_admin());
create index ticket_whatsapp_outbox_due on public.ticket_whatsapp_outbox(next_attempt_at) where status in ('queued','waiting');

create function public.queue_ticket_whatsapp(p_ticket uuid,p_event text,p_survey uuid default null) returns void
language plpgsql security definer set search_path=public as $$
declare t public.tickets%rowtype; s public.ticket_satisfaction%rowtype; template_name text; params jsonb;
begin
 select * into t from public.tickets where id=p_ticket;
 if not found or t.asunto like '[PLAN]%' then return; end if;
 if p_event='received' then
  template_name:='orion_ticket_recibido_v1';params:=jsonb_build_array(coalesce(t.numero_caso,t.id::text),coalesce(t.numero_serie_equipo,'Sin serie registrada'));
 elsif p_event='response' then
  template_name:='orion_primera_respuesta_v1';params:=jsonb_build_array(coalesce(t.numero_caso,t.id::text));
 elsif p_event='closed' then
  template_name:='orion_cierre_ticket_v1';params:=jsonb_build_array(coalesce(t.numero_caso,t.id::text),coalesce(t.numero_serie_equipo,'Sin serie registrada'));
 elsif p_event='survey' then
  select * into s from public.ticket_satisfaction where id=p_survey and ticket_id=t.id and not is_test;
  if not found then return; end if;
  template_name:='orion_encuesta_servicio_v1';params:=jsonb_build_array(coalesce(t.numero_caso,t.id::text),'https://medinovacuu.github.io/orion/encuesta#'||s.token);
 else raise exception 'Evento inválido'; end if;
 insert into public.ticket_whatsapp_outbox(ticket_id,survey_id,event,template,parameters,recipient,status,error_message)
 values(t.id,p_survey,p_event,template_name,params,t.telefono_cliente_guest,
 case when nullif(btrim(t.telefono_cliente_guest),'') is null then 'needs_phone' else 'queued' end,
 case when nullif(btrim(t.telefono_cliente_guest),'') is null then 'El ticket no tiene teléfono de contacto.' end)
 on conflict(ticket_id,event) do nothing;
end; $$;
revoke all on function public.queue_ticket_whatsapp(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.queue_ticket_whatsapp(uuid,text,uuid) to service_role;

create function public.ticket_whatsapp_lifecycle() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if TG_TABLE_NAME='tickets' then
  if TG_OP='INSERT' then perform public.queue_ticket_whatsapp(new.id,'received');
  elsif new.estado='cerrado' and old.estado is distinct from new.estado then perform public.queue_ticket_whatsapp(new.id,'closed'); end if;
 elsif TG_TABLE_NAME='ticket_service_events' then
  if new.kind='respuesta' then perform public.queue_ticket_whatsapp(new.ticket_id,'response'); end if;
 elsif TG_TABLE_NAME='ticket_satisfaction' then
  if not new.is_test then perform public.queue_ticket_whatsapp(new.ticket_id,'survey',new.id); end if;
 end if;
 return new;
end; $$;
revoke all on function public.ticket_whatsapp_lifecycle() from public,anon,authenticated;
create trigger ticket_whatsapp_created after insert on public.tickets for each row execute function public.ticket_whatsapp_lifecycle();
create trigger ticket_whatsapp_closed after update of estado on public.tickets for each row execute function public.ticket_whatsapp_lifecycle();
create trigger ticket_whatsapp_response after insert on public.ticket_service_events for each row execute function public.ticket_whatsapp_lifecycle();
create trigger ticket_whatsapp_survey after insert on public.ticket_satisfaction for each row execute function public.ticket_whatsapp_lifecycle();

create function public.claim_ticket_whatsapp() returns setof public.ticket_whatsapp_outbox
language plpgsql security definer set search_path=public as $$
begin
 update public.ticket_whatsapp_outbox set status='unknown',error_message='El proceso no confirmó el resultado. No se reintentará automáticamente.',updated_at=now() where status='processing' and updated_at<now()-interval '3 minutes';
 update public.ticket_whatsapp_outbox set status='skipped',error_message='Notificación vencida sin enviar.',updated_at=now() where status in ('queued','waiting') and created_at<now()-interval '7 days';
 return query update public.ticket_whatsapp_outbox o set status='processing',updated_at=now() where o.id in
 (select id from public.ticket_whatsapp_outbox where status in ('queued','waiting') and next_attempt_at<=now() order by created_at,id for update skip locked limit 5) returning o.*;
end; $$;
revoke all on function public.claim_ticket_whatsapp() from public,anon,authenticated;
grant execute on function public.claim_ticket_whatsapp() to service_role;
