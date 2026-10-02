create table if not exists public.shipping_trackings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tracking_number text not null,
  carrier text check (carrier is null or carrier in ('dhl', 'estafeta', 'tresguerras', 'chilexpress', 'chibra')),
  status text not null check (
    status in ('capturado', 'pendiente_consulta', 'etiqueta_generada', 'en_transito', 'en_reparto', 'entregado', 'incidencia')
  ),
  fulfillment_state text not null check (fulfillment_state in ('pendiente', 'entregado')),
  payload jsonb not null default '{}'::jsonb,
  last_lookup_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, tracking_number)
);

create index if not exists shipping_trackings_user_status_idx
  on public.shipping_trackings (user_id, fulfillment_state, updated_at desc);

create index if not exists shipping_trackings_pending_lookup_idx
  on public.shipping_trackings (last_lookup_at asc nulls first)
  where fulfillment_state = 'pendiente' and carrier is not null;

alter table public.shipping_trackings enable row level security;

drop policy if exists "Users read own shipping trackings" on public.shipping_trackings;
create policy "Users read own shipping trackings"
on public.shipping_trackings
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users insert own shipping trackings" on public.shipping_trackings;
create policy "Users insert own shipping trackings"
on public.shipping_trackings
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users update own shipping trackings" on public.shipping_trackings;
create policy "Users update own shipping trackings"
on public.shipping_trackings
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users delete own shipping trackings" on public.shipping_trackings;
create policy "Users delete own shipping trackings"
on public.shipping_trackings
for delete
to authenticated
using (user_id = auth.uid());

grant select, insert, update, delete on public.shipping_trackings to authenticated;
