begin;
drop policy if exists "Users delete own shipping trackings" on public.shipping_trackings;
create policy "Users delete own shipping trackings" on public.shipping_trackings
for delete to authenticated using (user_id = auth.uid() and not dhl_auto_imported);
commit;
