alter table public.reagents
  add column if not exists reference_code text,
  add column if not exists platforms text[] not null default '{}',
  add column if not exists analytical_family text,
  add column if not exists reaction_kind text,
  add column if not exists reagent_scheme text,
  add column if not exists uses_r1 boolean,
  add column if not exists uses_r2 boolean,
  add column if not exists shared_r2_group text,
  add column if not exists mechanical_subsystems text[] not null default '{}',
  add column if not exists related_reagent_ids text[] not null default '{}',
  add column if not exists technical_profile jsonb not null default '{}'::jsonb;

alter table public.diagnostic_cases
  add column if not exists capture_mode text not null default 'quick',
  add column if not exists ambient_temperature_c numeric(6, 2),
  add column if not exists reagent_opened_at date,
  add column if not exists reagent_expires_at date,
  add column if not exists calibrator_name text,
  add column if not exists service_test_results jsonb not null default '[]'::jsonb,
  add column if not exists evidence_payload jsonb not null default '[]'::jsonb,
  add column if not exists final_action text,
  add column if not exists final_outcome text;

alter table public.diagnostic_hypotheses
  add column if not exists severity text not null default 'medium',
  add column if not exists probability_score numeric(6, 2) not null default 0,
  add column if not exists confidence_score numeric(6, 2) not null default 0,
  add column if not exists suspected_subsystem text,
  add column if not exists invasiveness_level text not null default 'operational_review',
  add column if not exists recommended_next_test text,
  add column if not exists corrective_actions jsonb not null default '[]'::jsonb,
  add column if not exists candidate_parts jsonb not null default '[]'::jsonb,
  add column if not exists warning_text text;

alter table public.diagnostic_logs
  add column if not exists namespace text not null default '[DRI][ENGINE]';

create index if not exists reagents_platforms_idx
  on public.reagents using gin (platforms);

create index if not exists reagents_mechanical_subsystems_idx
  on public.reagents using gin (mechanical_subsystems);
