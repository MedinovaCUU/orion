begin;
alter table public.user_module_permissions add column is_warehouse boolean not null default false;
create table public.dhl_tracking_assignments (
  user_id uuid references auth.users(id) on delete cascade,
  tracking_number text references public.dhl_push_shipments(tracking_number) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (user_id, tracking_number)
);
alter table public.dhl_tracking_assignments enable row level security;
revoke all on public.dhl_tracking_assignments from anon, authenticated;

create function public.prepare_warehouse_tracking_permission() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.is_warehouse or new.user_id = '2a87dde5-76ef-4365-8690-870efc7d9d82' then
    if not ('trazabilidad' = any(new.modules)) then new.modules := array_append(new.modules, 'trazabilidad'); end if;
    if not coalesce(new.sub_permissions->'trazabilidad', '[]'::jsonb) @> '["tracking"]'::jsonb then
      new.sub_permissions := jsonb_set(coalesce(new.sub_permissions, '{}'::jsonb), '{trazabilidad}',
        coalesce(new.sub_permissions->'trazabilidad', '[]'::jsonb) || '["tracking"]'::jsonb);
    end if;
  end if;
  return new;
end;
$$;
create trigger prepare_warehouse_tracking_permission before insert or update on public.user_module_permissions
for each row execute function public.prepare_warehouse_tracking_permission();

create function public.sync_warehouse_tracking_subscription() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_warehouse or new.user_id = '2a87dde5-76ef-4365-8690-870efc7d9d82' then
    insert into public.dhl_tracking_subscribers(user_id) values(new.user_id) on conflict do nothing;
    perform public.import_dhl_tracking_for_subscribers();
  else
    delete from public.dhl_tracking_subscribers where user_id = new.user_id;
    delete from public.shipping_trackings t where t.user_id = new.user_id and t.dhl_auto_imported
      and not exists (select 1 from public.dhl_tracking_assignments a where a.user_id = t.user_id and a.tracking_number = t.tracking_number);
  end if;
  return new;
end;
$$;
create trigger sync_warehouse_tracking_subscription after insert or update of is_warehouse on public.user_module_permissions
for each row execute function public.sync_warehouse_tracking_subscription();

create function public.assign_dhl_tracking(target_user_id uuid, guide text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.dhl_push_shipments%rowtype;
begin
  if not public.can_manage_user_permissions() then raise exception 'No autorizado para asignar envíos'; end if;
  select * into s from public.dhl_push_shipments where tracking_number = trim(guide);
  if not found then raise exception 'La guía todavía no está disponible en DHL Push'; end if;
  if s.delivered_at <= now() - interval '7 days' then raise exception 'La guía ya cumplió su plazo de conservación'; end if;
  if not exists(select 1 from public.profiles where id = target_user_id) then raise exception 'Usuario no encontrado'; end if;
  insert into public.dhl_tracking_assignments(user_id, tracking_number, assigned_by)
  values(target_user_id, s.tracking_number, auth.uid()) on conflict do nothing;
  insert into public.shipping_trackings(user_id, tracking_number, carrier, status, fulfillment_state, payload, last_lookup_at, dhl_auto_imported)
  values(target_user_id, s.tracking_number, 'dhl', s.status, s.fulfillment_state,
    s.payload || jsonb_build_object('source', 'dhl_push', 'notes', 'Guía asignada por administración'), s.received_at, true)
  on conflict(user_id, tracking_number) do nothing;
  update public.user_module_permissions
  set modules = case when 'trazabilidad' = any(modules) then modules else array_append(modules, 'trazabilidad') end,
    sub_permissions = jsonb_set(coalesce(sub_permissions, '{}'::jsonb), '{trazabilidad}',
      case when coalesce(sub_permissions->'trazabilidad', '[]'::jsonb) @> '["tracking"]'::jsonb
        then sub_permissions->'trazabilidad' else coalesce(sub_permissions->'trazabilidad', '[]'::jsonb) || '["tracking"]'::jsonb end)
  where user_id = target_user_id;
end;
$$;
revoke all on function public.assign_dhl_tracking(uuid, text) from public, anon;
grant execute on function public.assign_dhl_tracking(uuid, text) to authenticated;

-- Explicitly requested initial warehouse recipient: Cesar Ibarra.
update public.user_module_permissions set is_warehouse = true
where user_id = '71bcb118-e359-4ddc-a893-b1e5a19e1c3a';
update public.user_module_permissions set is_warehouse = is_warehouse
where user_id = '2a87dde5-76ef-4365-8690-870efc7d9d82';
commit;
