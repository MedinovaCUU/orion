-- A creator is not an assignee. No assignments are inferred for existing cases.
create table public.ticket_assignments (
 ticket_id uuid primary key references public.tickets(id) on delete cascade,
 assigned_to uuid references public.profiles(id),
 assigned_by uuid references public.profiles(id),
 assigned_at timestamptz not null default clock_timestamp()
);
alter table public.ticket_assignments enable row level security;
create policy "Admins or assignees read ticket assignments" on public.ticket_assignments
 for select to authenticated using (public.is_admin() or assigned_to = auth.uid());
grant select on public.ticket_assignments to authenticated;
revoke all on public.ticket_assignments from anon;
revoke insert,update,delete on public.ticket_assignments from authenticated;
create index ticket_assignments_assignee_idx on public.ticket_assignments(assigned_to) where assigned_to is not null;

create function public.assign_support_ticket(p_ticket_id uuid, p_assigned_to uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tickets%rowtype; old_assignee uuid; assignee_name text;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Solo administradores pueden asignar tickets'; end if;
 select * into t from public.tickets where id = p_ticket_id for update;
 if not found then raise exception 'Ticket no encontrado'; end if;
 if t.estado = 'cerrado' then raise exception 'No se puede reasignar un ticket cerrado'; end if;
 if p_assigned_to is not null then
   select nombre_completo into assignee_name from public.profiles where id = p_assigned_to and rol in ('admin','tecnico');
   if not found then raise exception 'Selecciona personal de servicio válido'; end if;
 end if;
 select assigned_to into old_assignee from public.ticket_assignments where ticket_id = t.id;
 if old_assignee is not distinct from p_assigned_to then return; end if;
 insert into public.ticket_assignments(ticket_id,assigned_to,assigned_by,assigned_at)
 values(t.id,p_assigned_to,auth.uid(),clock_timestamp())
 on conflict(ticket_id) do update set assigned_to=excluded.assigned_to,assigned_by=excluded.assigned_by,assigned_at=excluded.assigned_at;
 insert into public.ticket_bitacora(ticket_id,numero_serie_equipo,tipo,detalle,visible_cliente,creado_por)
 values(t.id,t.numero_serie_equipo,'nota',case when p_assigned_to is null then 'Asignación retirada. Caso pendiente de asignar.' else 'Caso asignado a ' || coalesce(assignee_name,p_assigned_to::text) || '.' end,false,auth.uid());
end; $$;
revoke all on function public.assign_support_ticket(uuid,uuid) from public,anon;
grant execute on function public.assign_support_ticket(uuid,uuid) to authenticated;

-- Global control data is served only to administrators. Individual case history
-- remains available through existing staff policies for operational follow-up.
create function public.get_ticket_control_events(p_offset integer default 0, p_limit integer default 1000)
returns table(id uuid,ticket_id uuid,kind text,detail text,actor_id uuid,occurred_at timestamptz,closure_reason text,profiles jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'El centro de control es exclusivo para administradores'; end if;
 return query select e.id,e.ticket_id,e.kind,e.detail,e.actor_id,e.occurred_at,e.closure_reason,
   jsonb_build_object('nombre_completo',p.nombre_completo)
 from public.ticket_service_events e left join public.profiles p on p.id = e.actor_id
 order by e.occurred_at,e.id offset greatest(coalesce(p_offset,0),0) limit least(greatest(coalesce(p_limit,1000),1),1000);
end; $$;
revoke all on function public.get_ticket_control_events(integer,integer) from public,anon;
grant execute on function public.get_ticket_control_events(integer,integer) to authenticated;
