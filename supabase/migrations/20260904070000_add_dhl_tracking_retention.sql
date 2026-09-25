begin;

create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.purge_expired_dhl_tracking_data()
returns table (
  shipping_trackings_deleted bigint,
  push_events_deleted bigint,
  push_shipments_deleted bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz := timezone('utc', now()) - interval '30 days';
  deleted_trackings bigint := 0;
  deleted_events bigint := 0;
  deleted_shipments bigint := 0;
begin
  delete from public.shipping_trackings as tracking
  using public.dhl_push_shipments as shipment
  where tracking.carrier = 'dhl'
    and upper(regexp_replace(tracking.tracking_number, '[^A-Za-z0-9]', '', 'g')) = shipment.tracking_number
    and shipment.status = 'entregado'
    and shipment.last_event_at < cutoff;
  get diagnostics deleted_trackings = row_count;

  delete from public.dhl_push_events as event
  using public.dhl_push_shipments as shipment
  where event.tracking_number = shipment.tracking_number
    and shipment.status = 'entregado'
    and shipment.last_event_at < cutoff;
  get diagnostics deleted_events = row_count;

  delete from public.dhl_push_shipments
  where status = 'entregado'
    and last_event_at < cutoff;
  get diagnostics deleted_shipments = row_count;

  return query select deleted_trackings, deleted_events, deleted_shipments;
end;
$$;

revoke all on function public.purge_expired_dhl_tracking_data() from public, anon, authenticated;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'orion-dhl-tracking-retention';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'orion-dhl-tracking-retention',
    '17 4 * * *',
    'select public.purge_expired_dhl_tracking_data();'
  );
end;
$$;

commit;
