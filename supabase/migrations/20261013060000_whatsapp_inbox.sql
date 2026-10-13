-- WhatsApp inbox: messages customers send to Orion's numbers (Meta webhook), delivery statuses of what
-- Orion sends, BAJA/ALTA opt-outs and the administrators' inbox. The webhook (service role) is the only
-- writer of inbound rows; administrators read through RLS and the RPCs below and reply via ticket-whatsapp.

-- Same person, any spelling: +52 614…, 52 1 614…, 614… all share the last ten digits.
create or replace function public.whatsapp_phone_key(p_phone text) returns text
language sql immutable set search_path = pg_catalog as $$
  select case when length(d) >= 8 then right(d, 10) end
  from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) s
$$;

create index if not exists tickets_whatsapp_phone_key_idx
  on public.tickets (public.whatsapp_phone_key(telefono_cliente_guest))
  where telefono_cliente_guest is not null;

create table public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  business_phone_id text not null check (business_phone_id ~ '^[0-9]{1,32}$'),
  -- Only the ticket line (TICKET_WA_PHONE_NUMBER_ID) can be answered from Orion.
  is_ticket_line boolean not null default false,
  phone text not null check (phone ~ '^[1-9][0-9]{7,14}$'),
  phone_key text generated always as (public.whatsapp_phone_key(phone)) stored,
  display_name text check (char_length(display_name) <= 200),
  ticket_id uuid references public.tickets(id) on delete set null,
  last_inbound_at timestamptz,
  last_message_at timestamptz,
  last_preview text,
  last_kind text,
  last_direction text check (last_direction in ('in', 'out')),
  last_read_at timestamptz,
  last_read_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_phone_id, phone)
);
create index whatsapp_conversations_recent_idx on public.whatsapp_conversations (last_message_at desc nulls last);
create index whatsapp_conversations_phone_key_idx on public.whatsapp_conversations (phone_key);

create table public.whatsapp_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  wa_message_id text not null unique check (char_length(wa_message_id) <= 200),
  kind text not null check (kind ~ '^[a-z_]{1,32}$'),
  body text check (char_length(body) <= 8000),
  extra jsonb,
  media_id text,
  media_mime text,
  media_filename text check (char_length(media_filename) <= 255),
  media_path text,
  media_error text,
  context_message_id text,
  ticket_id uuid references public.tickets(id) on delete set null,
  sent_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index whatsapp_inbound_conversation_idx on public.whatsapp_inbound_messages (conversation_id, received_at desc);
create index whatsapp_inbound_ticket_idx on public.whatsapp_inbound_messages (ticket_id) where ticket_id is not null;

-- One row per number that answered BAJA; ALTA deletes it. Applies to every Orion line.
create table public.whatsapp_opt_outs (
  phone_key text primary key,
  phone text not null,
  opted_out_at timestamptz not null default now(),
  source_message_id text
);

-- Delivery as reported by Meta (sent → delivered → read, or failed). `status` stays the send result.
alter table public.ticket_whatsapp_messages
  add column conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
  add column delivery_status text check (delivery_status in ('sent', 'delivered', 'read', 'failed')),
  add column delivery_updated_at timestamptz,
  add column delivery_error text;
alter table public.ticket_whatsapp_outbox
  add column delivery_status text check (delivery_status in ('sent', 'delivered', 'read', 'failed')),
  add column delivery_updated_at timestamptz,
  add column delivery_error text;
create index if not exists ticket_whatsapp_messages_provider_idx on public.ticket_whatsapp_messages (provider_message_id) where provider_message_id is not null;
create index if not exists ticket_whatsapp_outbox_provider_idx on public.ticket_whatsapp_outbox (provider_message_id) where provider_message_id is not null;

alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_inbound_messages enable row level security;
alter table public.whatsapp_opt_outs enable row level security;
revoke all on public.whatsapp_conversations, public.whatsapp_inbound_messages, public.whatsapp_opt_outs from public, anon, authenticated;
grant select on public.whatsapp_conversations, public.whatsapp_inbound_messages, public.whatsapp_opt_outs to authenticated;
grant all on public.whatsapp_conversations, public.whatsapp_inbound_messages, public.whatsapp_opt_outs to service_role;
create policy whatsapp_conversations_admin_read on public.whatsapp_conversations for select to authenticated using (public.is_admin());
create policy whatsapp_inbound_admin_read on public.whatsapp_inbound_messages for select to authenticated using (public.is_admin());
create policy whatsapp_opt_outs_admin_read on public.whatsapp_opt_outs for select to authenticated using (public.is_admin());

-- Automatic notifications never go to a number that answered BAJA.
create or replace function public.ticket_whatsapp_respect_opt_out() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('queued', 'waiting') and exists (
    select 1 from public.whatsapp_opt_outs o where o.phone_key = public.whatsapp_phone_key(new.recipient)
  ) then
    new.status := 'skipped';
    new.error_message := 'El cliente pidió BAJA por WhatsApp; no se envía.';
  end if;
  return new;
end; $$;
revoke all on function public.ticket_whatsapp_respect_opt_out() from public, anon, authenticated;
-- Fires after ticket_whatsapp_country (alphabetical), so it sees the final recipient.
create trigger ticket_whatsapp_opt_out before insert on public.ticket_whatsapp_outbox
for each row execute function public.ticket_whatsapp_respect_opt_out();

create or replace function public.record_whatsapp_inbound(
  p_business_phone_id text, p_is_ticket_line boolean, p_phone text, p_name text,
  p_wa_message_id text, p_kind text, p_body text, p_extra jsonb,
  p_media_id text, p_media_mime text, p_media_filename text,
  p_context_message_id text, p_sent_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_conv public.whatsapp_conversations%rowtype;
  v_ticket uuid;
  v_id uuid;
  v_at timestamptz := coalesce(p_sent_at, now());
  v_word text;
  v_opt text;
begin
  -- Meta retries deliveries: the provider id makes every message land once.
  select id into v_id from public.whatsapp_inbound_messages where wa_message_id = p_wa_message_id;
  if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;

  insert into public.whatsapp_conversations as c (business_phone_id, phone, display_name, is_ticket_line)
  values (p_business_phone_id, p_phone, left(nullif(btrim(p_name), ''), 200), coalesce(p_is_ticket_line, false))
  on conflict (business_phone_id, phone) do update
    set display_name = coalesce(excluded.display_name, c.display_name), is_ticket_line = excluded.is_ticket_line
  returning * into v_conv;

  if v_conv.is_ticket_line then
    -- 1) A reply to one of our messages names its ticket.
    if p_context_message_id is not null then
      select s.ticket_id into v_ticket from (
        select o.ticket_id, 1 as rank from public.ticket_whatsapp_outbox o where o.provider_message_id = p_context_message_id
        union all
        select w.ticket_id, 2 from public.ticket_whatsapp_messages w where w.provider_message_id = p_context_message_id and w.ticket_id is not null
        union all
        select i.ticket_id, 3 from public.whatsapp_inbound_messages i where i.wa_message_id = p_context_message_id and i.ticket_id is not null
      ) s order by s.rank limit 1;
    end if;
    -- 2) Keep the current link (automatic or chosen by an admin) while that ticket is open.
    if v_ticket is null and v_conv.ticket_id is not null
       and exists (select 1 from public.tickets t where t.id = v_conv.ticket_id and t.estado is distinct from 'cerrado') then
      v_ticket := v_conv.ticket_id;
    end if;
    -- 3) Newest open ticket with this phone, then the last ticket we notified on this number.
    if v_ticket is null then
      select t.id into v_ticket from public.tickets t
      where t.telefono_cliente_guest is not null
        and public.whatsapp_phone_key(t.telefono_cliente_guest) = v_conv.phone_key
        and t.estado is distinct from 'cerrado'
      order by t.creado_en desc nulls last limit 1;
    end if;
    if v_ticket is null then
      select o.ticket_id into v_ticket from public.ticket_whatsapp_outbox o
      where o.provider_message_id is not null and public.whatsapp_phone_key(o.recipient) = v_conv.phone_key
      order by o.updated_at desc limit 1;
    end if;
    v_ticket := coalesce(v_ticket, v_conv.ticket_id);
  end if;

  insert into public.whatsapp_inbound_messages (
    conversation_id, wa_message_id, kind, body, extra, media_id, media_mime, media_filename,
    context_message_id, ticket_id, sent_at
  ) values (
    v_conv.id, p_wa_message_id, p_kind, left(p_body, 8000), p_extra, p_media_id, p_media_mime,
    left(p_media_filename, 255), p_context_message_id, v_ticket, v_at
  )
  on conflict (wa_message_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.whatsapp_inbound_messages where wa_message_id = p_wa_message_id;
    return jsonb_build_object('id', v_id, 'duplicate', true);
  end if;

  update public.whatsapp_conversations set
    last_inbound_at = greatest(coalesce(last_inbound_at, v_at), v_at),
    last_preview = case when last_message_at is null or v_at >= last_message_at then left(p_body, 160) else last_preview end,
    last_kind = case when last_message_at is null or v_at >= last_message_at then p_kind else last_kind end,
    last_direction = case when last_message_at is null or v_at >= last_message_at then 'in' else last_direction end,
    last_message_at = greatest(coalesce(last_message_at, v_at), v_at),
    ticket_id = coalesce(v_ticket, ticket_id),
    updated_at = now()
  where id = v_conv.id;

  -- The contact template says «responde BAJA». Only the bare word counts; ALTA undoes it.
  if p_kind in ('text', 'button', 'interactive') then
    v_word := regexp_replace(translate(lower(coalesce(p_body, '')), 'áéíóúü', 'aeiouu'), '[^a-z]', '', 'g');
    if v_word in ('baja', 'stop') then
      insert into public.whatsapp_opt_outs (phone_key, phone, opted_out_at, source_message_id)
      values (v_conv.phone_key, v_conv.phone, v_at, p_wa_message_id)
      on conflict (phone_key) do update
        set phone = excluded.phone, opted_out_at = excluded.opted_out_at, source_message_id = excluded.source_message_id;
      update public.ticket_whatsapp_outbox
        set status = 'skipped', error_message = 'El cliente pidió BAJA por WhatsApp; no se envía.', updated_at = now()
      where status in ('queued', 'waiting') and public.whatsapp_phone_key(recipient) = v_conv.phone_key;
      v_opt := 'out';
    elsif v_word = 'alta' then
      delete from public.whatsapp_opt_outs where phone_key = v_conv.phone_key;
      v_opt := 'in';
    end if;
  end if;

  return jsonb_build_object('id', v_id, 'conversation_id', v_conv.id, 'ticket_id', v_ticket, 'duplicate', false, 'opt', v_opt);
end; $$;

-- Statuses arrive out of order and repeated: only move forward.
create or replace function public.record_whatsapp_status(
  p_wa_message_id text, p_status text, p_at timestamptz, p_error text default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_order constant text[] := array['sent', 'delivered', 'read', 'failed'];
  v_rank integer := array_position(v_order, p_status);
  v_total integer := 0;
  v_rows integer;
begin
  if v_rank is null or p_wa_message_id is null then return 0; end if;
  update public.ticket_whatsapp_messages set
    delivery_status = p_status, delivery_updated_at = coalesce(p_at, now()),
    delivery_error = case when p_status = 'failed' then left(p_error, 500) else delivery_error end
  where provider_message_id = p_wa_message_id and coalesce(array_position(v_order, delivery_status), 0) < v_rank;
  get diagnostics v_rows = row_count; v_total := v_total + v_rows;
  update public.ticket_whatsapp_outbox set
    delivery_status = p_status, delivery_updated_at = coalesce(p_at, now()),
    delivery_error = case when p_status = 'failed' then left(p_error, 500) else delivery_error end
  where provider_message_id = p_wa_message_id and coalesce(array_position(v_order, delivery_status), 0) < v_rank;
  get diagnostics v_rows = row_count; v_total := v_total + v_rows;
  return v_total;
end; $$;

revoke all on function public.record_whatsapp_inbound(text, boolean, text, text, text, text, text, jsonb, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.record_whatsapp_status(text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.record_whatsapp_inbound(text, boolean, text, text, text, text, text, jsonb, text, text, text, text, timestamptz) to service_role;
grant execute on function public.record_whatsapp_status(text, text, timestamptz, text) to service_role;

create or replace function public.whatsapp_inbox(p_limit integer default 200) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo administración puede ver WhatsApp.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.last_message_at desc nulls last, x.id)
    from (
      select c.id, c.business_phone_id, c.is_ticket_line, c.phone, c.display_name, c.ticket_id,
        t.numero_caso, t.estado as ticket_estado,
        c.last_inbound_at, c.last_message_at, c.last_preview, c.last_kind, c.last_direction,
        (select count(*) from public.whatsapp_inbound_messages m
          where m.conversation_id = c.id and m.received_at > coalesce(c.last_read_at, '-infinity'::timestamptz))::integer as unread,
        exists (select 1 from public.whatsapp_opt_outs o where o.phone_key = c.phone_key) as opted_out
      from public.whatsapp_conversations c
      left join public.tickets t on t.id = c.ticket_id
      order by c.last_message_at desc nulls last, c.id
      limit least(greatest(coalesce(p_limit, 200), 1), 500)
    ) x
  ), '[]'::jsonb);
end; $$;

-- Badge count; zero (not an error) for everyone else so the hook can run anywhere.
create or replace function public.whatsapp_unread_count() returns integer
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then (
    select count(*)::integer from public.whatsapp_inbound_messages m
    join public.whatsapp_conversations c on c.id = m.conversation_id
    where m.received_at > coalesce(c.last_read_at, '-infinity'::timestamptz)
  ) else 0 end
$$;

create or replace function public.whatsapp_thread(p_conversation uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c public.whatsapp_conversations%rowtype;
begin
  if not public.is_admin() then raise exception 'Solo administración puede ver WhatsApp.' using errcode = '42501'; end if;
  select * into c from public.whatsapp_conversations where id = p_conversation;
  if not found then raise exception 'Conversación no encontrada.' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'conversation', (
      select to_jsonb(x) from (
        select c.id, c.business_phone_id, c.is_ticket_line, c.phone, c.display_name, c.ticket_id,
          t.numero_caso, t.estado as ticket_estado, c.last_inbound_at, c.last_message_at, c.last_read_at,
          o.opted_out_at is not null as opted_out, o.opted_out_at
        from (select 1) one
        left join public.tickets t on t.id = c.ticket_id
        left join public.whatsapp_opt_outs o on o.phone_key = c.phone_key
      ) x
    ),
    'messages', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.at, m.id)
      from (
        select * from (
          select i.id::text as id, 'in' as direction, 'customer' as source, i.kind, i.body, i.extra,
            i.media_mime, i.media_filename, i.media_path, i.media_error, i.context_message_id,
            i.wa_message_id as provider_message_id, i.ticket_id, i.sent_at as at,
            null::text as status, null::text as delivery_status, null::text as author,
            null::text as template, null::jsonb as parameters, null::text as error_message
          from public.whatsapp_inbound_messages i where i.conversation_id = c.id
          union all
          select w.id::text, 'out', 'manual', w.mode, w.body, null, null, null, null, null, null,
            w.provider_message_id, w.ticket_id, w.created_at, w.status, w.delivery_status, p.nombre_completo,
            null, null, coalesce(w.delivery_error, w.error_message)
          from public.ticket_whatsapp_messages w
          left join public.profiles p on p.id = w.actor_id
          where c.is_ticket_line and public.whatsapp_phone_key(w.recipient) = c.phone_key
          union all
          select o.id::text, 'out', 'auto', o.event, null, null, null, null, null, null, null,
            o.provider_message_id, o.ticket_id, o.updated_at, o.status, o.delivery_status, null,
            o.template, o.parameters, coalesce(o.delivery_error, o.error_message)
          from public.ticket_whatsapp_outbox o
          where c.is_ticket_line and o.status in ('accepted', 'unknown', 'failed')
            and public.whatsapp_phone_key(o.recipient) = c.phone_key
        ) u
        order by u.at desc
        limit 400
      ) m
    ), '[]'::jsonb),
    'tickets', coalesce((
      select jsonb_agg(to_jsonb(k) order by k.creado_en desc nulls last)
      from (
        select t.id, t.numero_caso, t.estado, t.asunto, t.creado_en
        from public.tickets t
        where t.id = c.ticket_id or (
          t.telefono_cliente_guest is not null and public.whatsapp_phone_key(t.telefono_cliente_guest) = c.phone_key)
        order by t.creado_en desc nulls last
        limit 20
      ) k
    ), '[]'::jsonb)
  );
end; $$;

create or replace function public.mark_whatsapp_conversation_read(p_conversation uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo administración puede ver WhatsApp.' using errcode = '42501'; end if;
  update public.whatsapp_conversations set last_read_at = now(), last_read_by = auth.uid() where id = p_conversation;
end; $$;

create or replace function public.link_whatsapp_conversation(p_conversation uuid, p_ticket uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo administración puede ligar conversaciones.' using errcode = '42501'; end if;
  if p_ticket is not null and not exists (select 1 from public.tickets where id = p_ticket) then
    raise exception 'Ticket no encontrado.' using errcode = 'P0002';
  end if;
  update public.whatsapp_conversations set ticket_id = p_ticket, updated_at = now() where id = p_conversation;
  if not found then raise exception 'Conversación no encontrada.' using errcode = 'P0002'; end if;
end; $$;

revoke all on function public.whatsapp_inbox(integer) from public, anon;
revoke all on function public.whatsapp_unread_count() from public, anon;
revoke all on function public.whatsapp_thread(uuid) from public, anon;
revoke all on function public.mark_whatsapp_conversation_read(uuid) from public, anon;
revoke all on function public.link_whatsapp_conversation(uuid, uuid) from public, anon;
grant execute on function public.whatsapp_inbox(integer) to authenticated;
grant execute on function public.whatsapp_unread_count() to authenticated;
grant execute on function public.whatsapp_thread(uuid) to authenticated;
grant execute on function public.mark_whatsapp_conversation_read(uuid) to authenticated;
grant execute on function public.link_whatsapp_conversation(uuid, uuid) to authenticated;

-- Photos, audio and documents customers send. Private: administrators get short-lived signed URLs.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('whatsapp-media', 'whatsapp-media', false, 26214400)
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
    execute 'drop policy if exists whatsapp_media_admin_read on storage.objects';
    execute $p$create policy whatsapp_media_admin_read on storage.objects for select to authenticated
      using (bucket_id = 'whatsapp-media' and public.is_admin())$p$;
  end if;
end $$;

-- Live inbox. Realtime applies the admin read policies above.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.whatsapp_conversations, public.whatsapp_inbound_messages;
  end if;
end $$;

comment on table public.whatsapp_inbound_messages is 'Messages customers send to Orion WhatsApp numbers (Meta webhook, signature verified). Written only by whatsapp-webhook.';
comment on table public.whatsapp_opt_outs is 'Numbers that answered BAJA. Automatic and template messages skip them; ALTA removes the row.';
