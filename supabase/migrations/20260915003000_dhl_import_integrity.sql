begin;
create or replace function public.guard_dhl_browser_copy() returns trigger
language plpgsql set search_path = public as $$
declare event_at timestamptz;
begin
  if new.carrier = 'dhl' and new.status = 'entregado' then
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
update public.shipping_trackings set payload = jsonb_set(payload, '{source}', '"dhl_push"'::jsonb) where dhl_auto_imported;

-- Transactional regression probe: all fixture changes roll back inside the exception block.
do $$
declare expected_count integer; actual_count integer;
begin
  begin
    select count(*) into expected_count from public.dhl_tracking_subscribers;
    insert into public.dhl_push_shipments(tracking_number, status, fulfillment_state, payload, last_event_at)
    values ('ORION_IMPORT_REGRESSION', 'en_transito', 'pendiente', '{"status":"en_transito","timeline":[]}', now());
    select count(*) into actual_count from public.shipping_trackings where tracking_number = 'ORION_IMPORT_REGRESSION';
    if actual_count <> expected_count then raise exception 'Automatic import fan-out failed'; end if;
    update public.dhl_push_shipments set updated_at = now() where tracking_number = 'ORION_IMPORT_REGRESSION';
    select count(*) into actual_count from public.shipping_trackings where tracking_number = 'ORION_IMPORT_REGRESSION';
    if actual_count <> expected_count then raise exception 'Duplicate notification import failed'; end if;
    update public.dhl_push_shipments set status = 'entregado', fulfillment_state = 'entregado', last_event_at = now() - interval '8 days'
    where tracking_number = 'ORION_IMPORT_REGRESSION';
    perform public.purge_expired_dhl_tracking_data();
    if exists(select 1 from public.shipping_trackings where tracking_number = 'ORION_IMPORT_REGRESSION') then raise exception 'Seven-day retention failed'; end if;
    if exists(select 1 from public.dhl_push_shipments where tracking_number = 'ORION_IMPORT_REGRESSION') then raise exception 'Snapshot retention failed'; end if;
    raise no_data_found using message = 'rollback_probe';
  exception when no_data_found then
    if sqlerrm <> 'rollback_probe' then raise; end if;
  end;
end;
$$;
commit;
