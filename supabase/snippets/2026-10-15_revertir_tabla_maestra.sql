-- Emergency rollback of 20261015010000_planning_grid (editable master table).
-- Removes what acts on every ticket write (the two triggers) and the Realtime publication entry.
-- The grid tables and the planning_version column are kept (harmless, and they hold history and user
-- preferences); the frontend falls back to "no version control" when it cannot use them.
-- Run in the SQL editor or with `supabase db query --linked -f <this file>`.

begin;
drop trigger if exists tickets_planning_version on public.tickets;
drop trigger if exists tickets_planning_changes_log on public.tickets;
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'planning_changes') then
    alter publication supabase_realtime drop table public.planning_changes;
  end if;
end $$;
commit;

-- Full removal (only if the grid is abandoned; loses the change history, custom column definitions,
-- saved views and settings):
-- drop table if exists public.planning_saved_views, public.planning_user_settings, public.planning_custom_columns, public.planning_changes;
-- drop function if exists public.log_planning_changes(), public.bump_planning_version(), public.planning_grid_values(text, text, text, text),
--   public.planning_value_text(jsonb), public.planning_touch_updated_at(), public.guard_planning_custom_column();
-- alter table public.tickets drop column if exists planning_version;
