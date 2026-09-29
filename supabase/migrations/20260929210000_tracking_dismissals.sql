begin;
create table public.shipping_tracking_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  tracking_number text not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, tracking_number)
);
alter table public.shipping_tracking_dismissals enable row level security;
grant select on public.shipping_tracking_dismissals to authenticated;
grant all on public.shipping_tracking_dismissals to service_role;
create policy "Read own dismissed tracking" on public.shipping_tracking_dismissals
for select to authenticated using (user_id = auth.uid());

create function public.guard_dismissed_shipping_tracking() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || new.tracking_number, 0));
  if exists (select 1 from public.shipping_tracking_dismissals
    where user_id = new.user_id and tracking_number = new.tracking_number) then return null; end if;
  return new;
end;
$$;
-- Applies to browser copies, service-role imports, assignments and agent writes alike.
create trigger aa_guard_dismissed_shipping_tracking before insert or update on public.shipping_trackings
for each row execute function public.guard_dismissed_shipping_tracking();

create function public.dismiss_shipping_trackings(tracking_numbers text[]) returns void
language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); number text;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if coalesce(cardinality(tracking_numbers),0) not between 1 and 1000 then raise exception 'Invalid guide list'; end if;
  for number in select distinct upper(trim(n)) from unnest(tracking_numbers) n order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || number, 0));
  end loop;
  insert into public.shipping_tracking_dismissals(user_id, tracking_number)
  select actor, guide from (select distinct upper(trim(n)) as guide from unnest(tracking_numbers) n) numbers
  where guide <> '' on conflict (user_id, tracking_number) do update set dismissed_at = now();
  delete from public.shipping_trackings t using public.shipping_tracking_dismissals d
  where d.user_id = actor and t.user_id = d.user_id and t.tracking_number = d.tracking_number;
end;
$$;
create function public.restore_shipping_trackings(tracking_numbers text[]) returns void
language plpgsql security definer set search_path = public as $$
declare number text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(cardinality(tracking_numbers),0) not between 1 and 1000 then raise exception 'Invalid guide list'; end if;
  for number in select distinct upper(trim(n)) from unnest(tracking_numbers) n order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || number, 0));
  end loop;
  delete from public.shipping_tracking_dismissals
  where user_id = auth.uid() and tracking_number in (select upper(trim(n)) from unnest(tracking_numbers) n);
end;
$$;
revoke all on function public.dismiss_shipping_trackings(text[]) from public, anon;
revoke all on function public.restore_shipping_trackings(text[]) from public, anon;
grant execute on function public.dismiss_shipping_trackings(text[]) to authenticated;
grant execute on function public.restore_shipping_trackings(text[]) to authenticated;

-- All fixture data and temporary auth claims roll back, even when the assertions succeed.
do $$
declare actor uuid; other_user uuid; guide text := 'ORION_DISMISS_PROBE';
begin
  select user_id into actor from public.dhl_tracking_subscribers order by user_id limit 1;
  select user_id into other_user from public.dhl_tracking_subscribers where user_id <> actor limit 1;
  if actor is null then raise exception 'No subscriber available for dismissal regression test'; end if;
  begin
    insert into public.dhl_push_shipments(tracking_number,status,fulfillment_state,payload,last_event_at)
    values(guide,'en_transito','pendiente','{"timeline":[]}',now());
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform public.dismiss_shipping_trackings(array[guide]);
    if exists(select 1 from public.shipping_trackings where user_id=actor and tracking_number=guide) then raise exception 'Dismiss failed'; end if;
    update public.dhl_push_shipments set updated_at=now() where tracking_number=guide;
    perform public.import_dhl_tracking_for_subscribers();
    insert into public.shipping_trackings(user_id,tracking_number,carrier,status,fulfillment_state,payload)
    values(actor,guide,'dhl','en_transito','pendiente','{}') on conflict(user_id,tracking_number) do nothing;
    if exists(select 1 from public.shipping_trackings where user_id=actor and tracking_number=guide) then raise exception 'Automatic resurrection allowed'; end if;
    if other_user is not null then
      if not exists(select 1 from public.shipping_trackings where user_id=other_user and tracking_number=guide) then raise exception 'Other profile changed'; end if;
      perform set_config('request.jwt.claim.sub',other_user::text,true);
      perform public.restore_shipping_trackings(array[guide]);
      if not exists(select 1 from public.shipping_tracking_dismissals where user_id=actor and tracking_number=guide) then raise exception 'Cross-profile restoration allowed'; end if;
    end if;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform public.restore_shipping_trackings(array[guide]);
    insert into public.shipping_trackings(user_id,tracking_number,carrier,status,fulfillment_state,payload)
    values(actor,guide,'dhl','capturado','pendiente','{}');
    if not exists(select 1 from public.shipping_trackings where user_id=actor and tracking_number=guide) then raise exception 'Manual restoration failed'; end if;
    raise no_data_found using message='rollback_dismissal_probe';
  exception when no_data_found then
    if sqlerrm <> 'rollback_dismissal_probe' then raise; end if;
  end;
end;
$$;
commit;
