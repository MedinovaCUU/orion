begin;
do $$
declare guide text;
begin
  select tracking_number into guide from public.dhl_push_shipments
  where delivered_at is null or delivered_at > now() - interval '7 days' limit 1;
  if guide is null then return; end if;
  begin
    perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
    begin
      perform public.assign_dhl_tracking('71bcb118-e359-4ddc-a893-b1e5a19e1c3a', guide);
      raise exception 'Unauthorized assignment was accepted';
    exception when raise_exception then
      if sqlerrm <> 'No autorizado para asignar envíos' then raise; end if;
    end;
    perform set_config('request.jwt.claim.sub', '2a87dde5-76ef-4365-8690-870efc7d9d82', true);
    perform public.assign_dhl_tracking('71bcb118-e359-4ddc-a893-b1e5a19e1c3a', guide);
    update public.user_module_permissions set is_warehouse = false where user_id = '71bcb118-e359-4ddc-a893-b1e5a19e1c3a';
    if exists(select 1 from public.dhl_tracking_subscribers where user_id = '71bcb118-e359-4ddc-a893-b1e5a19e1c3a') then
      raise exception 'Warehouse revocation failed';
    end if;
    if not exists(select 1 from public.shipping_trackings where user_id = '71bcb118-e359-4ddc-a893-b1e5a19e1c3a' and tracking_number = guide) then
      raise exception 'Explicit assignment was incorrectly removed';
    end if;
    raise no_data_found using message = 'rollback_assignment_probe';
  exception when no_data_found then
    if sqlerrm <> 'rollback_assignment_probe' then raise; end if;
  end;
end;
$$;
commit;
