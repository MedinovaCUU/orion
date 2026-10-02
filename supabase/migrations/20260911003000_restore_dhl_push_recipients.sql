begin;

-- Recover the receiver from original notifications, not the delivery signatory.
with recipients as (
  select distinct on (shipment->>'id')
    shipment->>'id' as tracking_number,
    shipment #>> '{details,receiver,name}' as recipient
  from public.dhl_push_events e
  cross join lateral jsonb_array_elements(coalesce(e.payload->'shipments', '[]'::jsonb)) shipment
  where nullif(trim(shipment #>> '{details,receiver,name}'), '') is not null
  order by shipment->>'id', e.received_at desc
)
update public.dhl_push_shipments s
set payload = jsonb_set(s.payload, '{recipient}', to_jsonb(r.recipient))
from recipients r
where s.tracking_number = r.tracking_number;

update public.shipping_trackings t
set payload = jsonb_set(coalesce(t.payload, '{}'::jsonb), '{recipient}', s.payload->'recipient')
from public.dhl_push_shipments s
where t.carrier = 'dhl' and t.tracking_number = s.tracking_number
  and nullif(trim(s.payload->>'recipient'), '') is not null
  and nullif(trim(t.payload->>'recipient'), '') is null;

commit;
