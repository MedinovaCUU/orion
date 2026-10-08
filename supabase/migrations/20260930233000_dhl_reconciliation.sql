begin;
alter table public.dhl_push_shipments
  add column if not exists reconciliation_checked_at timestamptz,
  add column if not exists reconciliation_error text;
commit;
