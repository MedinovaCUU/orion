-- ORION · Alexa skill "Orion".
-- Device linking (6-digit code confirmed in Orion web), answers that finish after Alexa's 8-second window, alerts with
-- voice/web acknowledgement, voice diagnosis cases (outcome follow-up = DRI learning loop) and actions dictated by
-- voice that only become real after the user approves them in Orion web.
-- The `alexa` Edge Function writes these tables as the database owner, but every Orion read it makes for a user runs
-- as that user (`set local role authenticated` + JWT claims), so the existing RLS decides what Alexa can say.

create table if not exists public.alexa_links (
  alexa_user_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  linked_at timestamptz not null default now(),
  last_seen_at timestamptz,
  notify boolean not null default true,
  quiet_from int not null default 20 check (quiet_from between 0 and 23),
  quiet_to int not null default 7 check (quiet_to between 0 and 23),
  last_notified_at timestamptz,
  last_digest text
);
create index if not exists alexa_links_user_idx on public.alexa_links(user_id);

create table if not exists public.alexa_link_codes (
  code text primary key check (code ~ '^[0-9]{6}$'),
  alexa_user_id text not null,
  expires_at timestamptz not null
);
create index if not exists alexa_link_codes_device_idx on public.alexa_link_codes(alexa_user_id);

create table if not exists public.alexa_link_failures (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists alexa_link_failures_user_idx on public.alexa_link_failures(user_id, at desc);

-- Answers Claude finished after Alexa's deadline ("¿qué encontraste?").
create table if not exists public.alexa_answers (
  id uuid primary key default gen_random_uuid(),
  alexa_user_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  answer text,
  status text not null default 'pending' check (status in ('pending', 'done', 'error')),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  delivered_at timestamptz
);
create index if not exists alexa_answers_device_idx on public.alexa_answers(alexa_user_id, created_at desc);

create table if not exists public.alexa_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('alarma', 'control', 'sla', 'seguimiento', 'sistema')),
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  dedupe_key text not null,
  serial text,
  ticket_id uuid,
  case_id uuid,
  title text not null,
  speech text not null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  ack_via text check (ack_via in ('voz', 'web')),
  escalated_at timestamptz,
  unique (user_id, dedupe_key)
);
create index if not exists alexa_alerts_open_idx on public.alexa_alerts(user_id, created_at desc) where acknowledged_at is null;

create table if not exists public.alexa_voice_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  serial text not null,
  equipment_model text,
  failed_tests text[] not null default '{}',
  correct_tests text[] not null default '{}',
  sources jsonb not null default '[]'::jsonb,
  hypotheses jsonb not null default '[]'::jsonb,
  top_hypothesis text,
  contrast jsonb,
  checks jsonb not null default '[]'::jsonb,
  outcome text check (outcome in ('resuelto', 'no_resuelto', 'parcial')),
  outcome_note text,
  confirmed_hypothesis text,
  follow_up_at timestamptz,
  follow_up_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists alexa_voice_cases_user_idx on public.alexa_voice_cases(user_id, created_at desc);
create index if not exists alexa_voice_cases_follow_idx on public.alexa_voice_cases(follow_up_at) where outcome is null and follow_up_sent_at is null;

create table if not exists public.alexa_pending_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('ticket', 'refaccion', 'bitacora')),
  summary text not null,
  payload jsonb not null,
  status text not null default 'pendiente' check (status in ('pendiente', 'aplicada', 'descartada', 'error')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  result jsonb
);
create index if not exists alexa_pending_actions_user_idx on public.alexa_pending_actions(user_id, created_at desc);

-- ── RLS: each person sees only their own rows; admins also read voice cases (fixture export) ──────────────────
alter table public.alexa_links enable row level security;
alter table public.alexa_link_codes enable row level security;
alter table public.alexa_link_failures enable row level security;
alter table public.alexa_answers enable row level security;
alter table public.alexa_alerts enable row level security;
alter table public.alexa_voice_cases enable row level security;
alter table public.alexa_pending_actions enable row level security;

drop policy if exists alexa_links_self on public.alexa_links;
create policy alexa_links_self on public.alexa_links for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists alexa_answers_self on public.alexa_answers;
create policy alexa_answers_self on public.alexa_answers for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists alexa_alerts_self on public.alexa_alerts;
create policy alexa_alerts_self on public.alexa_alerts for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists alexa_voice_cases_self on public.alexa_voice_cases;
create policy alexa_voice_cases_self on public.alexa_voice_cases for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
drop policy if exists alexa_pending_actions_self on public.alexa_pending_actions;
create policy alexa_pending_actions_self on public.alexa_pending_actions for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.alexa_links, public.alexa_link_codes, public.alexa_link_failures, public.alexa_answers, public.alexa_alerts,
  public.alexa_voice_cases, public.alexa_pending_actions from anon;
revoke insert, update, delete on public.alexa_links, public.alexa_link_codes, public.alexa_link_failures, public.alexa_answers,
  public.alexa_alerts, public.alexa_voice_cases, public.alexa_pending_actions from authenticated;
grant select on public.alexa_links, public.alexa_answers, public.alexa_alerts, public.alexa_voice_cases, public.alexa_pending_actions to authenticated;

-- ── RPCs used by Orion web ────────────────────────────────────────────────────────────────────────────────────
-- The signed-in user confirms the code Alexa read out loud. Staff only (admin / tecnico).
-- Returns 'ok' | 'invalido' | 'bloqueado' (8 wrong codes in 15 minutes) instead of raising, so failed attempts are
-- recorded (an exception would roll the counter back).
create or replace function public.claim_alexa_code(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare v_alexa text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión en Orion' using errcode = '42501'; end if;
  if not public.is_staff() then raise exception 'Alexa está disponible para ingenieros, químicos y administradores de Orion' using errcode = '42501'; end if;
  if (select count(*) from public.alexa_link_failures where user_id = auth.uid() and at > now() - interval '15 minutes') >= 8 then
    return 'bloqueado';
  end if;
  delete from public.alexa_link_codes where expires_at < now();
  select alexa_user_id into v_alexa from public.alexa_link_codes where code = btrim(coalesce(p_code, ''));
  if v_alexa is null then
    insert into public.alexa_link_failures(user_id) values (auth.uid());
    return 'invalido';
  end if;
  insert into public.alexa_links(alexa_user_id, user_id) values (v_alexa, auth.uid())
  on conflict (alexa_user_id) do update set user_id = excluded.user_id, linked_at = now(), last_digest = null;
  delete from public.alexa_link_codes where alexa_user_id = v_alexa;
  delete from public.alexa_link_failures where user_id = auth.uid();
  return 'ok';
end;
$$;

create or replace function public.unlink_alexa(p_alexa_user_id text default null)
returns void language sql security definer set search_path = public as $$
  delete from public.alexa_links where user_id = auth.uid() and (p_alexa_user_id is null or alexa_user_id = p_alexa_user_id);
$$;

create or replace function public.set_alexa_notify(p_notify boolean, p_quiet_from int default null, p_quiet_to int default null)
returns void language sql security definer set search_path = public as $$
  update public.alexa_links
  set notify = p_notify, quiet_from = coalesce(p_quiet_from, quiet_from), quiet_to = coalesce(p_quiet_to, quiet_to)
  where user_id = auth.uid();
$$;

create or replace function public.ack_alexa_alert(p_alert_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.alexa_alerts set acknowledged_at = coalesce(acknowledged_at, now()), ack_via = coalesce(ack_via, 'web')
  where id = p_alert_id and user_id = auth.uid();
$$;

-- Orion web performs the approved action itself (as the user, through the module's normal path) and then records
-- the outcome here; discarding needs no other step.
create or replace function public.decide_alexa_action(p_action_id uuid, p_status text, p_result jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('aplicada', 'descartada', 'error') then raise exception 'Estado inválido'; end if;
  update public.alexa_pending_actions set status = p_status, decided_at = now(), result = p_result
  where id = p_action_id and user_id = auth.uid() and status in ('pendiente', 'error');
  if not found then raise exception 'La acción ya no está pendiente'; end if;
end;
$$;

create or replace function public.set_alexa_case_outcome(p_case_id uuid, p_outcome text, p_note text default null, p_confirmed text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_outcome not in ('resuelto', 'no_resuelto', 'parcial') then raise exception 'Resultado inválido'; end if;
  update public.alexa_voice_cases
  set outcome = p_outcome, outcome_note = coalesce(p_note, outcome_note), confirmed_hypothesis = coalesce(p_confirmed, confirmed_hypothesis), updated_at = now()
  where id = p_case_id and user_id = auth.uid();
end;
$$;

revoke all on function public.claim_alexa_code(text), public.unlink_alexa(text), public.set_alexa_notify(boolean, int, int),
  public.ack_alexa_alert(uuid), public.decide_alexa_action(uuid, text, jsonb), public.set_alexa_case_outcome(uuid, text, text, text) from public, anon;
grant execute on function public.claim_alexa_code(text), public.unlink_alexa(text), public.set_alexa_notify(boolean, int, int),
  public.ack_alexa_alert(uuid), public.decide_alexa_action(uuid, text, jsonb), public.set_alexa_case_outcome(uuid, text, text, text) to authenticated;

-- ── Notifier: every 5 minutes (the function itself decides whether anything is worth a ring) ─────────────────
-- The shared secret lives in Vault as 'orion_alexa_cron_secret' and in the function secrets as ALEXA_CRON_SECRET.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('orion-alexa-notify') where exists (select 1 from cron.job where jobname = 'orion-alexa-notify');
select cron.schedule('orion-alexa-notify', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://mzgrifkunevgestihlmh.supabase.co/functions/v1/alexa-notify',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'orion_alexa_cron_secret'), '')),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$cron$);
