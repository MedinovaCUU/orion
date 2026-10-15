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
