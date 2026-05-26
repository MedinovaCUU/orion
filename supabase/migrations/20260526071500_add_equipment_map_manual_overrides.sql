create table if not exists public.equipment_map_manual_overrides (
  equipment_id text primary key references public.equipos(id) on delete cascade,
  x_percent double precision not null check (x_percent >= 0 and x_percent <= 100),
  y_percent double precision not null check (y_percent >= 0 and y_percent <= 100),
  updated_at timestamptz not null default now()
);

create index if not exists equipment_map_manual_overrides_updated_at_idx
  on public.equipment_map_manual_overrides (updated_at desc);

grant select, insert, update, delete on public.equipment_map_manual_overrides to authenticated;
grant all on public.equipment_map_manual_overrides to service_role;

alter table public.equipment_map_manual_overrides enable row level security;

drop policy if exists "authenticated_select_equipment_map_manual_overrides" on public.equipment_map_manual_overrides;
create policy "authenticated_select_equipment_map_manual_overrides"
on public.equipment_map_manual_overrides
for select
to authenticated
using (true);

drop policy if exists "authenticated_insert_equipment_map_manual_overrides" on public.equipment_map_manual_overrides;
create policy "authenticated_insert_equipment_map_manual_overrides"
on public.equipment_map_manual_overrides
for insert
to authenticated
with check (true);

drop policy if exists "authenticated_update_equipment_map_manual_overrides" on public.equipment_map_manual_overrides;
create policy "authenticated_update_equipment_map_manual_overrides"
on public.equipment_map_manual_overrides
for update
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated_delete_equipment_map_manual_overrides" on public.equipment_map_manual_overrides;
create policy "authenticated_delete_equipment_map_manual_overrides"
on public.equipment_map_manual_overrides
for delete
to authenticated
using (true);
