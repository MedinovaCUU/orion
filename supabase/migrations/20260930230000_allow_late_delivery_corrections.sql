begin;

-- Reject expired reinsertions, but let existing rows receive late delivery events.
-- The retention job removes those rows after their true status is reconciled.
create or replace function public.guard_dhl_browser_copy() returns trigger
language plpgsql set search_path = public as $$
declare event_at timestamptz;
begin
  if tg_op = 'INSERT' and new.carrier = 'dhl' and new.status = 'entregado' then
    begin event_at := nullif(new.payload->>'lastEventAt', '')::timestamptz;
    exception when others then event_at := null;
    end;
    if event_at <= now() - interval '7 days' then return null; end if;
  end if;
  if tg_op = 'UPDATE' then
    new.dhl_auto_imported := old.dhl_auto_imported;
    if auth.role() = 'authenticated' and old.dhl_auto_imported and new.updated_at < old.updated_at then return old; end if;
  end if;
  if new.dhl_auto_imported then new.payload := jsonb_set(new.payload, '{source}', '"dhl_push"'::jsonb); end if;
  return new;
end;
$$;

commit;
