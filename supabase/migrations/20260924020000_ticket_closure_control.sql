-- Existing closures stay unclassified: do not infer an outcome from an old status.
alter table public.ticket_service_events
 add column closure_reason text check (closure_reason in ('solucionado','visita_programada','sin_respuesta','administrativo'));
alter table public.ticket_service_events drop constraint ticket_service_events_kind_check;
alter table public.ticket_service_events add constraint ticket_service_events_kind_check
 check (kind in ('respuesta','cierre','justificacion','revision_cierre'));
alter table public.ticket_service_events add constraint ticket_service_events_reason_kind_check
 check (closure_reason is null or kind = 'cierre');

create or replace function public.register_ticket_service_event(p_ticket_id uuid, p_kind text, p_detail text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tickets%rowtype; v_end timestamptz;
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Acceso restringido a personal de servicio'; end if;
 if p_kind not in ('respuesta','cierre','justificacion') or p_kind is null then raise exception 'Movimiento inválido'; end if;
 if char_length(btrim(coalesce(p_detail,''))) not between 2 and 3900 then raise exception 'Escribe un detalle de 2 a 3900 caracteres'; end if;
 select * into t from public.tickets where id = p_ticket_id for update;
 if not found then raise exception 'Ticket no encontrado'; end if;
 if p_kind in ('respuesta','cierre') and t.estado = 'cerrado' then raise exception 'El ticket ya está cerrado'; end if;
 if p_kind = 'justificacion' then
   if not public.can_approve_ticket_delay() then raise exception 'Solo administración o gerencia autorizada puede aprobar'; end if;
   select occurred_at into v_end from public.ticket_service_events where ticket_id = t.id and kind = 'cierre';
   if t.estado = 'cerrado' and v_end is null then raise exception 'Cierre histórico sin fecha verificable'; end if;
   if coalesce(v_end, clock_timestamp()) <= t.creado_en + interval '48 hours' then raise exception 'El ticket no excedió 48 horas'; end if;
 end if;
 insert into public.ticket_service_events(ticket_id,kind,detail,actor_id,closure_reason)
 values(t.id,p_kind,btrim(p_detail),auth.uid(),case when p_kind = 'cierre' then 'solucionado' else null end);
 insert into public.ticket_bitacora(ticket_id,numero_serie_equipo,tipo,detalle,estado_resultante,visible_cliente,creado_por)
 values(t.id,t.numero_serie_equipo,'nota',
 case p_kind when 'respuesta' then 'Respuesta al cliente: ' when 'cierre' then 'Cierre de caso: ' else 'Demora aprobada: ' end || btrim(p_detail),
 case when p_kind = 'cierre' then 'cerrado'::public.ticket_status else null end,false,auth.uid());
end; $$;
revoke all on function public.register_ticket_service_event(uuid,text,text) from public;
grant execute on function public.register_ticket_service_event(uuid,text,text) to authenticated;


-- One transaction for classification, closure, server time and audit trail.
create function public.register_ticket_closure(p_ticket_id uuid, p_reason text, p_detail text)
returns void language plpgsql security definer set search_path = public as $$
begin
 if p_reason is null or p_reason not in ('solucionado','visita_programada','sin_respuesta','administrativo') then
   raise exception 'Selecciona un motivo de cierre válido';
 end if;
 perform public.register_ticket_service_event(p_ticket_id,'cierre',p_detail);
 update public.ticket_service_events set closure_reason = p_reason where ticket_id = p_ticket_id and kind = 'cierre';
end; $$;
revoke all on function public.register_ticket_closure(uuid,text,text) from public;
grant execute on function public.register_ticket_closure(uuid,text,text) to authenticated;

create function public.review_ticket_closure(p_ticket_id uuid, p_detail text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tickets%rowtype;
begin
 if auth.uid() is null or not public.can_approve_ticket_delay() then raise exception 'Solo administración o gerencia autorizada puede revisar cierres'; end if;
 if char_length(btrim(coalesce(p_detail,''))) not between 2 and 3900 then raise exception 'Escribe una observación de revisión de 2 a 3900 caracteres'; end if;
 select * into t from public.tickets where id = p_ticket_id for update;
 if not found then raise exception 'Ticket no encontrado'; end if;
 if t.estado <> 'cerrado' then raise exception 'El ticket debe estar cerrado para su revisión'; end if;
 insert into public.ticket_service_events(ticket_id,kind,detail,actor_id)
 values(t.id,'revision_cierre',btrim(p_detail),auth.uid());
 insert into public.ticket_bitacora(ticket_id,numero_serie_equipo,tipo,detalle,visible_cliente,creado_por)
 values(t.id,t.numero_serie_equipo,'nota','Revisión de cierre: ' || btrim(p_detail),false,auth.uid());
end; $$;
revoke all on function public.review_ticket_closure(uuid,text) from public;
grant execute on function public.review_ticket_closure(uuid,text) to authenticated;

-- Unified capture: one note produces one log entry and the required metric.
create function public.register_ticket_movement(
 p_ticket_id uuid, p_action text, p_detail text,
 p_state text default null, p_visible boolean default false, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare t public.tickets%rowtype;
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Acceso restringido a personal de servicio'; end if;
 if char_length(btrim(coalesce(p_detail,''))) not between 2 and 3900 then raise exception 'Escribe un detalle de 2 a 3900 caracteres'; end if;
 if p_action is null or p_action not in ('avance','diagnostico','llamada','visita','pieza','escalamiento','nota','respuesta','cierre','justificacion','revision_cierre') then
   raise exception 'Selecciona un movimiento válido';
 end if;
 select * into t from public.tickets where id = p_ticket_id for update;
 if not found then raise exception 'Ticket no encontrado'; end if;
 if p_action = 'cierre' then
   perform public.register_ticket_closure(t.id,p_reason,p_detail);
 elsif p_action = 'justificacion' then
   perform public.register_ticket_service_event(t.id,'justificacion',p_detail);
 elsif p_action = 'revision_cierre' then
   perform public.review_ticket_closure(t.id,p_detail);
 else
   if t.estado = 'cerrado' then raise exception 'El ticket ya está cerrado'; end if;
   if p_state is not null and p_state not in ('abierto','en_progreso','pendiente_piezas','en_observacion') then
     raise exception 'Estado de seguimiento inválido';
   end if;
   if p_action = 'respuesta' and not exists (
     select 1 from public.ticket_service_events where ticket_id = t.id and kind = 'respuesta'
   ) then
     perform public.register_ticket_service_event(t.id,'respuesta',p_detail);
   else
     insert into public.ticket_bitacora(ticket_id,numero_serie_equipo,tipo,detalle,estado_resultante,visible_cliente,creado_por)
     values(t.id,t.numero_serie_equipo,
       case when p_action = 'respuesta' then 'llamada' else p_action end,
       case when p_action = 'respuesta' then 'Seguimiento de respuesta al cliente: ' else '' end || btrim(p_detail),
       case when p_action = 'respuesta' then null else p_state::public.ticket_status end,
       case when p_action in ('respuesta','nota') then false else coalesce(p_visible,false) end,auth.uid());
   end if;
 end if;
end; $$;
revoke all on function public.register_ticket_movement(uuid,text,text,text,boolean,text) from public;
grant execute on function public.register_ticket_movement(uuid,text,text,text,boolean,text) to authenticated;
