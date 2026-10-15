# Planning grid (migration 20261015010000)

Database side of the Excel-like Planeación grid. Planning activities stay rows of `public.tickets`
(`asunto` = `[PLAN] TYPE - PLATFORM - LOCALITY`, attributes in `descripcion` after `[METADATA_PLANEACION]`).

## What the migration adds

| Object | Purpose |
| --- | --- |
| `tickets.planning_version integer not null default 1` | Row version for optimistic concurrency. Metadata-only column add (no rewrite). |
| trigger `tickets_planning_version` → `bump_planning_version()` (BEFORE UPDATE) | `old + 1` when `asunto`, `descripcion`, `numero_serie_equipo`, `user_id` or `estado` really change, otherwise keeps `old`. Client-sent values are always ignored. Applies to every ticket, not only planning. Does not touch `actualizado_en`. Its name sorts after `ticket_capture_closure`/`ticket_reopen_link`, so it judges the final row. |
| `planning_changes` | Audit trail, written only by trigger `tickets_planning_changes_log` → `log_planning_changes()` (AFTER INSERT/UPDATE/DELETE, security definer). No FK to tickets: a deleted ticket keeps its history. Published to `supabase_realtime`. |
| `planning_custom_columns` | Custom column definitions (values live in each ticket's `meta.custom_fields[key]`). Archived via `archived_at`, never deleted; `key` cannot change after creation. |
| `planning_user_settings` | One `grid` jsonb per user (`user_id` defaults to `auth.uid()`). |
| `planning_saved_views` | Named views per user, `unique (user_id, name)`. |

`updated_at` is maintained by trigger on the three grid tables. Internal helpers `planning_value_text(jsonb)` and
`planning_grid_values(asunto, descripcion, serie, estado)` are not executable by API roles.

### History rows

Only planning rows are logged (`ticket_is_planning` on new or old `descripcion`). Insert → one `insert` row,
delete → one `delete` row (`field` null). Update → one row per changed field, in this order:

`tipo` (meta.service_type), `plataforma` (2nd ` - ` part of asunto after `[PLAN] `), `localidad` / `observaciones`
(their own line in descripcion), `numero_serie`, `ingeniero` (ingeniero_csv), `acompanantes` (companions_csv),
`semana` (fecha_tentativa), `fecha_programada` (scheduled_date), `fecha_fin` (scheduled_end_date), `dias`
(scheduled_day), `estados` (status_values), `prioridad` (priority_csv), `estado_ticket` (tickets.estado), then
`custom:<key>` sorted by key.

Values are display text: whitespace collapsed and trimmed, arrays joined with `, `, numbers/booleans as JSON text
(`120`, `true`), objects as compact JSON, empty → `null`. Comparison uses those texts, so a reformatted JSON or
`"A"` → `["A"]` logs nothing (the version still bumps because `descripcion` changed). Changes to columns outside the
list (prioridad column, actualizado_en, …) log nothing.

`changed_by` = `auth.uid()`; `changed_by_name` = that profile's `nombre_completo`, or `meta.updated_by_name` of the
new row when there is no JWT (service role / SQL); a JWT-less delete has no name. `version` = new version (old on
delete). All rows of one statement share `changed_at` (transaction time); order by `id` within it.

### Access (RLS)

- `planning_changes`: SELECT for authenticated when `is_admin()` or `ticket_id in viewable_ticket_ids()`
  (so admins also read deleted tickets' history). No insert/update/delete for anyone; anon has no grant.
- `planning_custom_columns`: SELECT for staff (`is_staff()`), INSERT/UPDATE for admins, no DELETE.
- `planning_user_settings`: own row only (select/insert/update; no delete).
- `planning_saved_views`: own rows only (select/insert/update/delete).

## Frontend usage

```ts
// Save with optimistic concurrency; 0 rows = conflict, deleted or no permission → re-read to tell them apart.
supabase.from('tickets').update(payload).eq('id', id).eq('planning_version', expected).select('id, planning_version, …')
// Live updates: one INSERT event per logged row (a multi-field edit emits several) → coalesce by ticket_id.
supabase.channel('…').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'planning_changes' }, …)
```

Do not send `planning_version` in the payload (ignored anyway) and do not let users edit a custom column's `key`
(the update fails with SQLSTATE 23514). Before the migration is applied PostgREST answers `42703` (select/filter on
`planning_version`), `PGRST204` (unknown column in a payload) and `PGRST205` (missing table) → fall back to the
legacy save path.

## Test

```sh
npm i --prefix <scratch> @electric-sql/pglite
PGLITE_MODULE=<scratch>/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/planning_grid.test.mjs
```

The test rebuilds the production helpers, tickets policies, the closure/state/reopen triggers, Supabase's default
grants and the Realtime publication, applies the migration twice (it is re-runnable) and checks versioning,
every history field, authorship, the read boundary and the per-user tables.

## Absences (migration 20261015020000)

`public.planning_absences`: one row per person and inclusive date range (`start_date`..`end_date`, at most 366 days
apart). `kind` ∈ `TXT` (tiempo por tiempo), `VAC`, `PERMISO`, `INCAPACIDAD`, `CUMPLEANOS`, `OTRO`. `person_id` →
`profiles(id)` (`on delete set null`, so a deleted profile keeps the row by `person_name`, 1–120 chars). Rows imported
from the planning sheet have `source = 'sheet'` and a unique `sheet_key`; rows created in Orion have `source = 'orion'`
and `sheet_key` null. `orion_edited_at` is set by the client when a person edits a row in Orion. Indexed on
`(start_date, end_date)` and `(person_id)`; published to `supabase_realtime`.

Server-maintained (trigger `planning_absences_versioning`, BEFORE INSERT/UPDATE): insert → `version = 1`,
`created_at = updated_at = now()`, `created_by = auth.uid()` (a JWT-less service/SQL insert keeps the value it sent).
Update → `created_by`/`created_at` are reset to the stored values; `version = old + 1` and `updated_at = now()` only
when any other column really changed, otherwise both keep their stored values. Client-sent `version`/`updated_at`
are always ignored. Note that `sheet_synced_at` is a column like any other: a sync that only refreshes it bumps the
version, so send it only when the row's content changed.

Access: SELECT for staff (`is_staff()`, the whole team); INSERT/UPDATE/DELETE for admins, or for staff on rows with
`person_id = auth.uid()` (WITH CHECK too: a technician cannot move an absence to another person or detach it). Clients
read nothing; anon has no grant.

```ts
// Optimistic save: 0 rows = conflict, deleted or no permission.
supabase.from('planning_absences').update(patch).eq('id', id).eq('version', expected).select()
// Sheet sync (admin): one row per sheet note.
supabase.from('planning_absences').upsert(rows, { onConflict: 'sheet_key' }).select()
```

Before the migration is applied PostgREST answers `PGRST205` (missing table). Test:

```sh
PGLITE_MODULE=<scratch>/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/planning_absences.test.mjs
```

## Change requests (migration 20261015030000)

Only the approvers edit the master table directly: Sofia Ceballos (the planner; approves and is notified) and
Ricardo Montañez (the owner; approves, not notified). Anyone else's edit is filed as a request; an approver approves or
rejects it and their browser applies it with the normal update path (`planning_version` / absence `version`), then
records `approved` + `applied_result` or `failed` + `review_note`. Requests are the evidence trail (e-mails later).

**Not enforced in the database:** planning tickets and absences can still be written directly by anyone the existing
policies allow — service reports, trips, the SAP closure and the sheet sync write them. Routing non-approvers' edits
through requests is the app's job.

| Object | Purpose |
| --- | --- |
| `planning_approvers (user_id → profiles on delete cascade, notify, label, added_at)` | Who approves. SELECT for staff; no write policies or grants (managed by SQL). Seeded by exact `nombre_completo`: Sofia Ceballos (`notify` true, `planeación`), Ricardo Montañez (`notify` false, `dueño`). A name matching no profile, or more than one, is skipped silently; a re-run never overwrites an existing row (`on conflict do nothing`). |
| `is_planning_approver()` | Stable, security definer: the JWT user is in `planning_approvers`. Execute for `authenticated` only. |
| `planning_change_requests` | One row per proposed edit: `kind` ∈ `update`, `insert`, `delete`, `absence_insert`, `absence_update`, `absence_delete`; `ticket_id` / `absence_id` without FKs (survive deletes); `payload` (proposed values / new activity / absence input); `base_version`; `summary` (1–2000 chars after trim); `target_label`; requester, reviewer and `applied_result`. Indexed on `(status, requested_at desc)`, `(ticket_id)`, `(requested_by, status)`. Published to `supabase_realtime`. |

Server-maintained (trigger `planning_change_requests_guard`, BEFORE INSERT/UPDATE; security definer only to read the
signer's profile name):

- Insert: `status = 'pending'`; `requested_by = auth.uid()` (a JWT-less service/SQL insert must send it);
  `requested_at = updated_at = now()`; `reviewed_by`, `reviewed_by_name`, `reviewed_at`, `review_note`,
  `applied_result` null. `requested_by_name` = the client's value if non-blank, else the profile's `nombre_completo`.
- Every update: `id`, `kind`, `requested_by`, `requested_by_name`, `requested_at` are reset to the stored values.
- Non-approver (in practice the requester on a pending row): may change `payload`, `summary`, `target_label`,
  `base_version` and `status` pending → cancelled. Any other status change **raises** 42501 («Solo quien aprueba…»);
  `ticket_id`, `absence_id`, `reviewed_*`, `review_note`, `applied_result` are **silently reset** (so sending them is
  harmless).
- Approver (or no JWT): every other column is writable; status transitions allowed: same status, pending → approved /
  rejected / failed / cancelled, failed → pending (retry). Anything else **raises** 23514 («Cambio de estado no
  permitido…»). When the status leaves pending: `reviewed_by = auth.uid()` (no JWT: the value sent), `reviewed_at =
  now()`, `reviewed_by_name` = the client's value if non-blank, else that profile's name. Otherwise the three keep their
  stored values (a retried request shows its last reviewer until it is decided again).
- `updated_at = now()` only when something else really changed.

Access: SELECT own requests (`requested_by = auth.uid()`) or all for approvers; INSERT for staff as themselves; UPDATE
for approvers, or for the requester while `status = 'pending'` (WITH CHECK: pending or cancelled); no DELETE for
anyone. Clients and other staff see nothing that is not theirs; anon has no grant.

```ts
supabase.rpc('is_planning_approver')                                   // true | false
supabase.from('planning_change_requests').insert(row).select().single() // non-approver files a request
supabase.from('planning_change_requests').update({ status: 'approved', reviewed_by_name, applied_result }).eq('id', id).select().single()
```

Before the migration is applied PostgREST answers `PGRST205` (missing tables) and `PGRST202` (missing RPC). Test:

```sh
PGLITE_MODULE=<scratch>/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/planning_change_requests.test.mjs
```
