begin;

create table if not exists public.dhl_push_subscriptions (
  subscription_id text primary key,
  account_id text not null,
  service text not null default 'express',
  scope text not null default 'subscription.validate',
  status text not null default 'validation_received' check (
    status in (
      'validation_received',
      'activation_requested',
      'awaiting_business_approval',
      'active',
      'failed',
      'deleted',
      'unknown'
    )
  ),
  self_url text,
  hook_uri text,
  expires_at timestamptz,
  activation_requested_at timestamptz,
  activated_at timestamptz,
  last_notification_at timestamptz not null default timezone('utc', now()),
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists dhl_push_subscriptions_account_idx
  on public.dhl_push_subscriptions (account_id, service, updated_at desc);

create table if not exists public.dhl_push_events (
  event_hash text primary key,
  subscription_id text,
  scope text not null,
  tracking_number text,
  occurred_at timestamptz,
  payload jsonb not null,
  received_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  processing_error text
);

create index if not exists dhl_push_events_tracking_idx
  on public.dhl_push_events (tracking_number, occurred_at desc nulls last, received_at desc);

create index if not exists dhl_push_events_subscription_idx
  on public.dhl_push_events (subscription_id, received_at desc);

create table if not exists public.dhl_push_shipments (
  tracking_number text primary key,
  status text not null check (
    status in ('capturado', 'pendiente_consulta', 'etiqueta_generada', 'en_transito', 'en_reparto', 'entregado', 'incidencia')
  ),
  fulfillment_state text not null check (fulfillment_state in ('pendiente', 'entregado')),
  payload jsonb not null default '{}'::jsonb,
  last_event_at timestamptz,
  received_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists dhl_push_shipments_status_idx
  on public.dhl_push_shipments (fulfillment_state, updated_at desc);

alter table public.dhl_push_subscriptions enable row level security;
alter table public.dhl_push_events enable row level security;
alter table public.dhl_push_shipments enable row level security;

revoke all on public.dhl_push_subscriptions from public, anon, authenticated;
revoke all on public.dhl_push_events from public, anon, authenticated;
revoke all on public.dhl_push_shipments from public, anon, authenticated;

create or replace function public.apply_dhl_push_snapshot_to_shipping_tracking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  snapshot public.dhl_push_shipments%rowtype;
begin
  if new.carrier is distinct from 'dhl' then
    return new;
  end if;

  select *
  into snapshot
  from public.dhl_push_shipments
  where tracking_number = upper(regexp_replace(new.tracking_number, '[^A-Za-z0-9]', '', 'g'));

  if not found or snapshot.updated_at < coalesce(new.last_lookup_at, '-infinity'::timestamptz) then
    return new;
  end if;

  if new.status <> 'entregado' then
    new.status := snapshot.status;
    new.fulfillment_state := snapshot.fulfillment_state;
  end if;

  new.payload := coalesce(new.payload, '{}'::jsonb) || snapshot.payload;
  new.last_lookup_at := greatest(coalesce(new.last_lookup_at, snapshot.updated_at), snapshot.updated_at);
  new.updated_at := greatest(coalesce(new.updated_at, snapshot.updated_at), snapshot.updated_at);
  new.refresh_requested_at := null;
  new.refresh_requested_by := null;
  new.agent_lock_id := null;
  new.agent_lock_until := null;
  new.last_agent_id := 'dhl-push';
  new.last_agent_seen_at := snapshot.updated_at;
  return new;
end;
$$;

drop trigger if exists apply_dhl_push_snapshot_on_shipping_tracking on public.shipping_trackings;
create trigger apply_dhl_push_snapshot_on_shipping_tracking
before insert or update on public.shipping_trackings
for each row execute function public.apply_dhl_push_snapshot_to_shipping_tracking();

revoke all on function public.apply_dhl_push_snapshot_to_shipping_tracking() from public, anon, authenticated;

commit;
