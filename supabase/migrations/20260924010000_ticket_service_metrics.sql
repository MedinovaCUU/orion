-- Immutable server-timed events. Historical dates are deliberately not inferred.
create table public.ticket_service_events (
 id uuid primary key default gen_random_uuid(),
 ticket_id uuid not null references public.tickets(id),
 kind text not null check (kind in ('respuesta','cierre','justificacion')),
 detail text not null check (char_length(btrim(detail)) between 2 and 4000),
 actor_id uuid references public.profiles(id),
 occurred_at timestamptz not null default clock_timestamp(),
 unique(ticket_id, kind)
);
alter table public.ticket_service_events enable row level security;
create policy "Staff reads service metrics" on public.ticket_service_events for select to authenticated using (public.is_staff());
grant select on public.ticket_service_events to authenticated;
revoke insert, update, delete on public.ticket_service_events from anon, authenticated;

create function public.can_approve_ticket_delay() returns boolean
language sql stable security definer set search_path = public as $$
 select public.is_admin() or (public.is_staff() and exists (
 select 1 from public.user_module_permissions where user_id = auth.uid()
 and modules @> array['tickets']::text[]
 and coalesce(sub_permissions->'tickets','[]'::jsonb) ? 'aprobar_demoras'));
$$;

create function public.register_ticket_service_event(p_ticket_id uuid, p_kind text, p_detail text)
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
 insert into public.ticket_service_events(ticket_id,kind,detail,actor_id)
 values(t.id,p_kind,btrim(p_detail),auth.uid());
 insert into public.ticket_bitacora(ticket_id,numero_serie_equipo,tipo,detalle,estado_resultante,visible_cliente,creado_por)
 values(t.id,t.numero_serie_equipo,'nota',
 case p_kind when 'respuesta' then 'Respuesta al cliente: ' when 'cierre' then 'Solución y cierre: ' else 'Demora aprobada: ' end || btrim(p_detail),
 case when p_kind = 'cierre' then 'cerrado'::public.ticket_status else null end,false,auth.uid());
end; $$;
revoke all on function public.register_ticket_service_event(uuid,text,text) from public;
grant execute on function public.register_ticket_service_event(uuid,text,text) to authenticated;

-- Cover existing closing integrations too, without inventing a first response.
create function public.capture_ticket_closure() returns trigger
language plpgsql security definer set search_path = public as $$
begin
 if old.estado = 'cerrado' and new.estado <> 'cerrado' then
   raise exception 'Crea un nuevo caso vinculado al equipo para conservar las métricas del cierre';
 end if;
 if old.estado <> 'cerrado' and new.estado = 'cerrado' then
   insert into public.ticket_service_events(ticket_id,kind,detail,actor_id)
   values(new.id,'cierre','Cierre registrado por el flujo de servicio',auth.uid()) on conflict do nothing;
 end if;
 if new.creado_en is distinct from old.creado_en then raise exception 'La fecha de apertura es inmutable'; end if;
 return new;
end; $$;
create trigger ticket_capture_closure before update on public.tickets for each row execute function public.capture_ticket_closure();
