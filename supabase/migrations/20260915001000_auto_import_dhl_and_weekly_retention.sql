begin;

create table public.dhl_tracking_subscribers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.dhl_tracking_subscribers enable row level security;
revoke all on public.dhl_tracking_subscribers from anon, authenticated;
grant all on public.dhl_tracking_subscribers to service_role;

alter table public.shipping_trackings add column dhl_auto_imported boolean not null default false;
alter table public.dhl_push_shipments add column delivered_at timestamptz;
update public.dhl_push_shipments set delivered_at = last_event_at where status = 'entregado';

create function public.stamp_dhl_delivery() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'entregado' then
    if tg_op = 'UPDATE' then
      new.delivered_at := coalesce(old.delivered_at, new.last_event_at, now());
    else
      new.delivered_at := coalesce(new.last_event_at, now());
    end if;
  else
    new.delivered_at := null;
  end if;
  return new;
end;
$$;
create trigger stamp_dhl_delivery before insert or update on public.dhl_push_shipments
for each row execute function public.stamp_dhl_delivery();

create function public.import_dhl_tracking_for_subscribers() returns void
language sql security definer set search_path = public as $$
  insert into public.shipping_trackings (
    user_id, tracking_number, carrier, status, fulfillment_state, payload,
    last_lookup_at, updated_at, last_agent_id, last_agent_seen_at, dhl_auto_imported
  )
  select u.user_id, s.tracking_number, 'dhl', s.status, s.fulfillment_state,
    s.payload || jsonb_build_object('source', 'dhl_push', 'notes', 'Alta automática desde DHL Unified Push'),
    s.received_at, s.updated_at, 'dhl-push', s.received_at, true
  from public.dhl_push_shipments s cross join public.dhl_tracking_subscribers u
  where s.delivered_at is null or s.delivered_at > now() - interval '7 days'
  on conflict (user_id, tracking_number) do nothing;
$$;
revoke all on function public.import_dhl_tracking_for_subscribers() from public, anon, authenticated;
grant execute on function public.import_dhl_tracking_for_subscribers() to service_role;

create function public.auto_import_dhl_notification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.delivered_at is null or new.delivered_at > now() - interval '7 days' then
    insert into public.shipping_trackings (
      user_id, tracking_number, carrier, status, fulfillment_state, payload,
      last_lookup_at, updated_at, last_agent_id, last_agent_seen_at, dhl_auto_imported
    )
    select u.user_id, new.tracking_number, 'dhl', new.status, new.fulfillment_state,
      new.payload || jsonb_build_object('source', 'dhl_push', 'notes', 'Alta automática desde DHL Unified Push'),
      new.received_at, new.updated_at, 'dhl-push', new.received_at, true
    from public.dhl_tracking_subscribers u
    on conflict (user_id, tracking_number) do nothing;
  end if;
  return new;
end;
$$;
create trigger auto_import_dhl_notification after insert or update on public.dhl_push_shipments
for each row execute function public.auto_import_dhl_notification();

-- Reject stale browser copies after retention, and preserve managed-row metadata.
create function public.guard_dhl_browser_copy() returns trigger
language plpgsql set search_path = public as $$
declare event_at timestamptz;
begin
  if new.carrier = 'dhl' and new.status = 'entregado' then
    begin event_at := nullif(new.payload->>'lastEventAt', '')::timestamptz;
    exception when others then event_at := null;
    end;
    if event_at <= now() - interval '7 days' then return null; end if;
  end if;
  if tg_op = 'UPDATE' then
    new.dhl_auto_imported := old.dhl_auto_imported;
    if auth.role() = 'authenticated' and old.dhl_auto_imported and new.updated_at < old.updated_at then
      return old;
    end if;
  end if;
  return new;
end;
$$;
create trigger zz_guard_dhl_browser_copy before insert or update on public.shipping_trackings
for each row execute function public.guard_dhl_browser_copy();

create or replace function public.purge_expired_dhl_tracking_data()
returns table (shipping_trackings_deleted bigint, push_events_deleted bigint, push_shipments_deleted bigint)
language plpgsql security definer set search_path = public as $$
declare
  cutoff timestamptz := now() - interval '7 days';
  deleted_trackings bigint;
  deleted_events bigint;
  deleted_shipments bigint;
begin
  delete from public.shipping_trackings t using public.dhl_push_shipments s
  where t.carrier = 'dhl' and t.tracking_number = s.tracking_number
    and s.status = 'entregado' and s.delivered_at <= cutoff;
  get diagnostics deleted_trackings = row_count;
  delete from public.dhl_push_events e using public.dhl_push_shipments s
  where e.tracking_number = s.tracking_number and s.status = 'entregado' and s.delivered_at <= cutoff;
  get diagnostics deleted_events = row_count;
  delete from public.dhl_push_shipments where status = 'entregado' and delivered_at <= cutoff;
  get diagnostics deleted_shipments = row_count;
  return query select deleted_trackings, deleted_events, deleted_shipments;
end;
$$;

select cron.unschedule(jobid) from cron.job where jobname = 'orion-dhl-tracking-retention';
select cron.schedule('orion-dhl-tracking-retention', '*/15 * * * *', 'select public.purge_expired_dhl_tracking_data();');
select public.purge_expired_dhl_tracking_data();

commit;
