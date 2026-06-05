create or replace function public.set_dri_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.reagents (
  id text primary key,
  name text not null,
  calibration_mode text,
  read_mode text,
  primary_wavelength_nm integer,
  reference_wavelength_nm integer,
  reported_method text,
  reagent_type text,
  operational_note text,
  preliminary_risk text,
  source_status text,
  confidence text not null default 'pending' check (confidence in ('confirmed', 'pending', 'inferred')),
  source_type text not null default 'manual' check (source_type in ('ifu', 'ba400_export', 'manual', 'internal_validation', 'user_input')),
  source_reference text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.reagent_factors (
  id text primary key,
  factor_type text not null,
  label text not null,
  value_text text,
  value_numeric numeric(12, 4),
  unit text,
  description text,
  priority text,
  source_status text,
  confidence text not null default 'pending' check (confidence in ('confirmed', 'pending', 'inferred')),
  source_type text not null default 'manual' check (source_type in ('ifu', 'ba400_export', 'manual', 'internal_validation', 'user_input')),
  source_reference text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.reagent_factor_links (
  id uuid primary key default gen_random_uuid(),
  reagent_id text not null references public.reagents(id) on delete cascade,
  factor_id text not null references public.reagent_factors(id) on delete cascade,
  relation_type text not null,
  weight numeric(8, 4) not null default 1 check (weight >= 0),
  confidence text not null default 'pending' check (confidence in ('confirmed', 'pending', 'inferred')),
  source_type text not null default 'manual' check (source_type in ('ifu', 'ba400_export', 'manual', 'internal_validation', 'user_input')),
  source_reference text not null,
  source_label text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (reagent_id, factor_id, relation_type)
);

create table if not exists public.diagnostic_cases (
  id uuid primary key default gen_random_uuid(),
  case_code text not null unique default ('DRI-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  equipment_model text not null check (equipment_model in ('BA400', 'BA200', 'A15')),
  serial_number text not null,
  event_date date not null default current_date,
  event_type text not null,
  failure_direction text not null,
  reagent_lot text,
  control_lot text,
  calibrator_lot text,
  observations text,
  case_summary text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'reviewed', 'resolved', 'dismissed')),
  calculation_version text not null default 'dri-v1',
  selected_hypothesis_key text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.diagnostic_case_items (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.diagnostic_cases(id) on delete cascade,
  reagent_id text not null references public.reagents(id) on delete restrict,
  outcome_type text not null check (outcome_type in ('failed', 'correct')),
  control_level text,
  failure_direction text,
  result_value text,
  expected_mean text,
  standard_deviation text,
  z_score numeric(10, 4),
  reagent_lot text,
  control_lot text,
  calibrator_lot text,
  alarm_code text,
  curve_observation text,
  notes text,
  is_intermittent boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  position_index integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  unique (case_id, reagent_id, outcome_type)
);

create table if not exists public.qc_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.diagnostic_cases(id) on delete set null,
  case_item_id uuid references public.diagnostic_case_items(id) on delete set null,
  reagent_id text references public.reagents(id) on delete set null,
  equipment_model text,
  serial_number text,
  event_at timestamptz not null default timezone('utc', now()),
  event_type text not null,
  event_status text not null default 'observed' check (event_status in ('observed', 'confirmed', 'discarded')),
  failure_direction text,
  control_level text,
  result_value text,
  expected_mean text,
  standard_deviation text,
  z_score numeric(10, 4),
  reagent_lot text,
  control_lot text,
  calibrator_lot text,
  alarm_code text,
  curve_observation text,
  observations text,
  confidence text not null default 'pending' check (confidence in ('confirmed', 'pending', 'inferred')),
  source_type text not null default 'user_input' check (source_type in ('ifu', 'ba400_export', 'manual', 'internal_validation', 'user_input')),
  source_reference text not null default 'DRI UI',
  raw_payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.diagnostic_hypotheses (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.diagnostic_cases(id) on delete cascade,
  hypothesis_key text not null,
  title text not null,
  score numeric(6, 2) not null default 0,
  probability_label text not null,
  status text not null default 'generated' check (status in ('generated', 'reviewed', 'discarded', 'confirmed')),
  evidence_for jsonb not null default '[]'::jsonb,
  evidence_against jsonb not null default '[]'::jsonb,
  confirmatory_actions jsonb not null default '[]'::jsonb,
  supporting_factor_ids text[] not null default '{}',
  matched_rule_ids text[] not null default '{}',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.diagnostic_logs (
  id bigint generated always as identity primary key,
  case_id uuid references public.diagnostic_cases(id) on delete cascade,
  run_id uuid not null default gen_random_uuid(),
  log_level text not null default 'info',
  step text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists reagents_primary_wavelength_idx
  on public.reagents (primary_wavelength_nm);

create index if not exists reagent_factors_factor_type_idx
  on public.reagent_factors (factor_type);

create index if not exists reagent_factor_links_reagent_idx
  on public.reagent_factor_links (reagent_id);

create index if not exists reagent_factor_links_factor_idx
  on public.reagent_factor_links (factor_id);

create index if not exists diagnostic_cases_event_date_idx
  on public.diagnostic_cases (event_date desc);

create index if not exists diagnostic_cases_equipment_idx
  on public.diagnostic_cases (equipment_model, serial_number);

create index if not exists diagnostic_case_items_case_idx
  on public.diagnostic_case_items (case_id, outcome_type, position_index);

create index if not exists diagnostic_case_items_reagent_idx
  on public.diagnostic_case_items (reagent_id, outcome_type);

create index if not exists qc_events_reagent_event_idx
  on public.qc_events (reagent_id, event_at desc);

create index if not exists diagnostic_hypotheses_case_score_idx
  on public.diagnostic_hypotheses (case_id, score desc);

create index if not exists diagnostic_logs_case_created_idx
  on public.diagnostic_logs (case_id, created_at desc);

drop trigger if exists trg_reagents_set_updated_at on public.reagents;
create trigger trg_reagents_set_updated_at
before update on public.reagents
for each row
execute function public.set_dri_updated_at();

drop trigger if exists trg_reagent_factors_set_updated_at on public.reagent_factors;
create trigger trg_reagent_factors_set_updated_at
before update on public.reagent_factors
for each row
execute function public.set_dri_updated_at();

drop trigger if exists trg_reagent_factor_links_set_updated_at on public.reagent_factor_links;
create trigger trg_reagent_factor_links_set_updated_at
before update on public.reagent_factor_links
for each row
execute function public.set_dri_updated_at();

drop trigger if exists trg_diagnostic_cases_set_updated_at on public.diagnostic_cases;
create trigger trg_diagnostic_cases_set_updated_at
before update on public.diagnostic_cases
for each row
execute function public.set_dri_updated_at();

alter table public.reagents enable row level security;
alter table public.reagent_factors enable row level security;
alter table public.reagent_factor_links enable row level security;
alter table public.diagnostic_cases enable row level security;
alter table public.diagnostic_case_items enable row level security;
alter table public.qc_events enable row level security;
alter table public.diagnostic_hypotheses enable row level security;
alter table public.diagnostic_logs enable row level security;

create policy "authenticated can read dri seed tables"
on public.reagents
for select
to authenticated
using (true);

create policy "authenticated can read dri factors"
on public.reagent_factors
for select
to authenticated
using (true);

create policy "authenticated can read dri factor links"
on public.reagent_factor_links
for select
to authenticated
using (true);

create policy "authenticated can manage diagnostic cases"
on public.diagnostic_cases
for all
to authenticated
using (true)
with check (true);

create policy "authenticated can manage diagnostic case items"
on public.diagnostic_case_items
for all
to authenticated
using (true)
with check (true);

create policy "authenticated can manage qc events"
on public.qc_events
for all
to authenticated
using (true)
with check (true);

create policy "authenticated can manage diagnostic hypotheses"
on public.diagnostic_hypotheses
for all
to authenticated
using (true)
with check (true);

create policy "authenticated can manage diagnostic logs"
on public.diagnostic_logs
for all
to authenticated
using (true)
with check (true);
