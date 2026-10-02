-- Enrich existing records without replacing statuses, assignments or other payload fields.
create or replace function public.backfill_dhl_piece_details(
  guide text, expected_received_at timestamptz, details jsonb
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare changed integer;
begin
  if jsonb_typeof(details) <> 'object' then
    raise exception 'Expected a shipment details object';
  end if;
  update public.dhl_push_shipments
  set payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{shipmentDetails}', details)
  where tracking_number = guide and received_at is not distinct from expected_received_at;
  get diagnostics changed = row_count;
  if changed = 0 then return false; end if;
  update public.shipping_trackings
  set payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{shipmentDetails}', details)
  where carrier = 'dhl' and tracking_number = guide;
  return true;
end;
$$;
revoke all on function public.backfill_dhl_piece_details(text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.backfill_dhl_piece_details(text, timestamptz, jsonb) to service_role;
