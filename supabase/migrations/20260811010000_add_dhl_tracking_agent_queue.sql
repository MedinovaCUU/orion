alter table public.shipping_trackings
  add column if not exists refresh_requested_at timestamptz,
  add column if not exists refresh_requested_by uuid references auth.users(id) on delete set null,
  add column if not exists agent_lock_id text,
  add column if not exists agent_lock_until timestamptz,
  add column if not exists last_agent_id text,
  add column if not exists last_agent_seen_at timestamptz;

create index if not exists shipping_trackings_dhl_agent_queue_idx
  on public.shipping_trackings (
    carrier,
    fulfillment_state,
    refresh_requested_at desc nulls last,
    last_lookup_at asc nulls first
  )
  where carrier = 'dhl';

create table if not exists public.tracking_agents (
  agent_id text primary key,
  hostname text not null,
  version text not null,
  status text not null default 'online' check (status in ('online', 'busy', 'degraded', 'offline')),
  current_tracking_number text,
  last_error text,
  last_seen_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists tracking_agents_last_seen_idx
  on public.tracking_agents (last_seen_at desc);

alter table public.tracking_agents enable row level security;

drop policy if exists "Authenticated users read tracking agent health" on public.tracking_agents;
create policy "Authenticated users read tracking agent health"
on public.tracking_agents
for select
to authenticated
using (true);

grant select on public.tracking_agents to authenticated;

create or replace function public.request_shipping_tracking_refresh(p_tracking_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_at timestamptz := timezone('utc', now());
begin
  update public.shipping_trackings
  set
    refresh_requested_at = v_requested_at,
    refresh_requested_by = auth.uid()
  where id = p_tracking_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Tracking no encontrado o sin permisos.' using errcode = 'P0002';
  end if;

  return v_requested_at;
end;
$$;

revoke all on function public.request_shipping_tracking_refresh(uuid) from public;
grant execute on function public.request_shipping_tracking_refresh(uuid) to authenticated;

create or replace function public.claim_dhl_tracking_jobs(
  p_agent_id text,
  p_limit integer default 5
)
returns setof public.shipping_trackings
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select tracking.id
    from public.shipping_trackings tracking
    where tracking.carrier = 'dhl'
      and (
        tracking.refresh_requested_at is not null
        or (
          tracking.fulfillment_state <> 'entregado'
          and (
            tracking.last_lookup_at is null
            or tracking.last_lookup_at <= timezone('utc', now()) - interval '5 minutes'
          )
        )
      )
      and (
        tracking.agent_lock_until is null
        or tracking.agent_lock_until < timezone('utc', now())
        or tracking.agent_lock_id = p_agent_id
      )
    order by
      (tracking.refresh_requested_at is not null) desc,
      tracking.refresh_requested_at asc nulls last,
      tracking.last_lookup_at asc nulls first,
      tracking.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 20))
  )
  update public.shipping_trackings tracking
  set
    agent_lock_id = p_agent_id,
    agent_lock_until = timezone('utc', now()) + interval '3 minutes',
    last_agent_id = p_agent_id,
    last_agent_seen_at = timezone('utc', now())
  from candidates
  where tracking.id = candidates.id
  returning tracking.*;
end;
$$;

revoke all on function public.claim_dhl_tracking_jobs(text, integer) from public, anon, authenticated;
grant execute on function public.claim_dhl_tracking_jobs(text, integer) to service_role;
