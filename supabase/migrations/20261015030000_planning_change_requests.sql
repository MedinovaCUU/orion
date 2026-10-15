-- Planning change requests: the master table of Planeación is edited directly only by its approvers
-- (Sofia Ceballos, the planner, who approves and is notified; Ricardo Montañez, the owner, who can approve
-- but is not notified). Anyone else's edit (activity update/insert/delete, absence insert/update/delete)
-- becomes a row here that an approver approves or rejects; the approver's browser then applies it with
-- the normal update path and records the outcome (applied_result, or status 'failed'). The rows are the
-- evidence trail (e-mails will be sent from them later).
-- The database does NOT block direct writes to planning tickets or absences: service reports, trips, the
-- SAP closure and the sheet sync still write them. The control over who edits the master table is in the
-- app. New objects only; nothing existing changes.

-- 1) Approvers (managed by SQL only) ---------------------------------------------------------------
create table if not exists public.planning_approvers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  notify boolean not null default true,
  label text,
  added_at timestamptz not null default now()
);
comment on table public.planning_approvers is
  'People who edit the Planeación master table directly and approve/reject change requests from everyone else. notify = they receive request e-mails. Managed by SQL only (no write policies or grants).';

-- Seed by exact profile name; a name that matches no profile (or more than one) is skipped. Re-running
-- never overwrites a row that already exists (notify/label may have been changed by SQL since).
insert into public.planning_approvers (user_id, notify, label)
select match.id, seed.notify, seed.label
from (values ('Sofia Ceballos', true, 'planeación'),
             ('Ricardo Montañez', false, 'dueño')) as seed(name, notify, label)
cross join lateral (
  select (array_agg(p.id))[1] as id
  from public.profiles p
  where p.nombre_completo = seed.name
  having count(*) = 1
) as match
on conflict (user_id) do nothing;

alter table public.planning_approvers enable row level security;
drop policy if exists planning_approvers_read on public.planning_approvers;
create policy planning_approvers_read on public.planning_approvers for select to authenticated
using ((select public.is_staff()));
revoke all on public.planning_approvers from public, anon, authenticated;
grant select on public.planning_approvers to authenticated;

create or replace function public.is_planning_approver() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.planning_approvers where user_id = (select auth.uid()))
$$;
comment on function public.is_planning_approver() is
  'True when the signed-in user is in planning_approvers (edits the planning master table directly and reviews change requests).';
revoke all on function public.is_planning_approver() from public, anon;
grant execute on function public.is_planning_approver() to authenticated;

-- 2) Change requests -------------------------------------------------------------------------------
-- No foreign keys to tickets/absences/profiles: a request survives the deletion of what it points to.
create table if not exists public.planning_change_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('update', 'insert', 'delete', 'absence_insert', 'absence_update', 'absence_delete')),
  ticket_id uuid,
  absence_id uuid,
  payload jsonb not null default '{}'::jsonb,
  base_version integer,
  summary text not null check (length(btrim(summary)) between 1 and 2000),
  target_label text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled', 'failed')),
  requested_by uuid not null default auth.uid(),
  requested_by_name text,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_note text,
  applied_result jsonb
);
create index if not exists planning_change_requests_status_idx on public.planning_change_requests (status, requested_at desc);
create index if not exists planning_change_requests_ticket_idx on public.planning_change_requests (ticket_id);
create index if not exists planning_change_requests_requester_idx on public.planning_change_requests (requested_by, status);

comment on table public.planning_change_requests is
  'Edits of the Planeación master table proposed by non-approvers. pending → approved/rejected/failed/cancelled (approver), pending → cancelled (requester), failed → pending (approver retry). The requester reads and edits own pending requests; approvers read and review all. No deletes.';
comment on column public.planning_change_requests.ticket_id is
  'Planning ticket for update/delete (and the created ticket of an applied insert, set by the approver). No FK: survives deletes.';
comment on column public.planning_change_requests.absence_id is
  'planning_absences row for absence_update/absence_delete (and the created row of an applied absence_insert). No FK.';
comment on column public.planning_change_requests.payload is
  'Proposed field values (update), the new activity (insert) or the absence input (absence_*).';
comment on column public.planning_change_requests.base_version is
  'tickets.planning_version / planning_absences.version the requester was looking at.';
comment on column public.planning_change_requests.applied_result is
  'Outcome recorded by the approver''s browser when it applied (or failed to apply) the request.';

-- Server-maintained fields (security definer only to read the signer's profile name under any profiles RLS).
-- Insert: status 'pending'; requested_by = the JWT user (a JWT-less service/SQL insert keeps what it sent);
--   requested_at = updated_at = now(); reviewed_*, review_note and applied_result null; requested_by_name =
--   the client's value if non-blank, otherwise the requester's profile name.
-- Update, everyone: id, kind, requested_by, requested_by_name and requested_at are reset to the stored values.
-- Update, non-approver (in practice only the requester on a pending row, see RLS): only payload, summary,
--   target_label, base_version and status pending → cancelled change; any other status change RAISES
--   (42501); ticket_id, absence_id, reviewed_*, review_note and applied_result are silently reset.
-- Update, approver (or no JWT): status pending → approved/rejected/failed/cancelled or failed → pending, other
--   status changes RAISE (23514). When it leaves pending: reviewed_by = the JWT user (no JWT: the value
--   sent), reviewed_at = now(), reviewed_by_name = the client's value if non-blank, otherwise that profile's
--   name. Otherwise reviewed_by/reviewed_by_name/reviewed_at keep the stored values.
-- updated_at = now() when anything else really changed, otherwise it keeps the stored value.
create or replace function public.planning_change_requests_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.requested_by := coalesce(v_uid, new.requested_by);
    new.requested_at := now();
    new.updated_at := now();
    new.requested_by_name := coalesce(nullif(btrim(new.requested_by_name), ''),
      (select p.nombre_completo from public.profiles p where p.id = new.requested_by));
    new.reviewed_by := null;
    new.reviewed_by_name := null;
    new.reviewed_at := null;
    new.review_note := null;
    new.applied_result := null;
    return new;
  end if;

  new.id := old.id;
  new.kind := old.kind;
  new.requested_by := old.requested_by;
  new.requested_by_name := old.requested_by_name;
  new.requested_at := old.requested_at;

  if v_uid is not null and not public.is_planning_approver() then
    if new.status is distinct from old.status and not (old.status = 'pending' and new.status = 'cancelled') then
      raise exception 'Solo quien aprueba la planeación cambia una solicitud a «%»; quien la pidió solo puede editarla o cancelarla mientras está pendiente', new.status
        using errcode = 'insufficient_privilege';
    end if;
    new.ticket_id := old.ticket_id;
    new.absence_id := old.absence_id;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_by_name := old.reviewed_by_name;
    new.reviewed_at := old.reviewed_at;
    new.review_note := old.review_note;
    new.applied_result := old.applied_result;
  else
    if new.status is distinct from old.status
       and not ((old.status = 'pending' and new.status in ('approved', 'rejected', 'failed', 'cancelled'))
                or (old.status = 'failed' and new.status = 'pending')) then
      raise exception 'Cambio de estado no permitido en una solicitud de planeación: % → %', old.status, coalesce(new.status, 'null')
        using errcode = 'check_violation';
    end if;
    if old.status = 'pending' and new.status <> 'pending' then
      new.reviewed_by := coalesce(v_uid, new.reviewed_by);
      new.reviewed_at := now();
      new.reviewed_by_name := coalesce(nullif(btrim(new.reviewed_by_name), ''),
        (select p.nombre_completo from public.profiles p where p.id = new.reviewed_by));
    else
      new.reviewed_by := old.reviewed_by;
      new.reviewed_by_name := old.reviewed_by_name;
      new.reviewed_at := old.reviewed_at;
    end if;
  end if;

  new.updated_at := old.updated_at;
  if new is distinct from old then
    new.updated_at := now();
  end if;
  return new;
end $$;
revoke all on function public.planning_change_requests_guard() from public, anon, authenticated;

drop trigger if exists planning_change_requests_guard on public.planning_change_requests;
create trigger planning_change_requests_guard before insert or update on public.planning_change_requests
  for each row execute function public.planning_change_requests_guard();

-- Access: the requester reads own requests and edits/cancels them while pending; approvers read and review
-- all. Any staff member may file a request (as themselves). No deletes: requests are the evidence trail.
alter table public.planning_change_requests enable row level security;
drop policy if exists planning_change_requests_read on public.planning_change_requests;
create policy planning_change_requests_read on public.planning_change_requests for select to authenticated
using (requested_by = (select auth.uid()) or (select public.is_planning_approver()));
drop policy if exists planning_change_requests_insert on public.planning_change_requests;
create policy planning_change_requests_insert on public.planning_change_requests for insert to authenticated
with check ((select public.is_staff()) and requested_by = (select auth.uid()));
drop policy if exists planning_change_requests_update on public.planning_change_requests;
create policy planning_change_requests_update on public.planning_change_requests for update to authenticated
using ((select public.is_planning_approver()) or (requested_by = (select auth.uid()) and status = 'pending'))
with check ((select public.is_planning_approver()) or (requested_by = (select auth.uid()) and status in ('pending', 'cancelled')));
revoke all on public.planning_change_requests from public, anon, authenticated;
grant select, insert, update on public.planning_change_requests to authenticated;

-- Live updates (Realtime applies the read policy per subscriber).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'planning_change_requests') then
    alter publication supabase_realtime add table public.planning_change_requests;
  end if;
end $$;
