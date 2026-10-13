-- Advisory ↔ WhatsApp bridge on Orion's ticket number (phones from auth.users.phone):
-- * a new advisory notifies each assigned trainer;
-- * every reply written in the app is mirrored by WhatsApp to the other side (requester → the trainers
--   who already answered, or all assigned ones until someone does; trainer → requester);
-- * staff WhatsApp messages are routed into the advisory thread (reply context first, then their most
--   recent open advisory) and mirrored the same way.
-- Sending happens in advisory-whatsapp-dispatch (pg_net right after commit + pg_cron every minute).

create table public.advisory_whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  asesoria_id uuid not null references public.asesorias_escaladas(id) on delete cascade,
  event text not null check (event in ('new_advisory', 'message')),
  message_id text not null default '',
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'waiting', 'accepted', 'failed', 'unknown', 'skipped', 'needs_phone')),
  mode text check (mode in ('text', 'template')),
  sent_to text,
  provider_message_id text,
  extra_message_ids text[] not null default '{}',
  delivery_status text check (delivery_status in ('sent', 'delivered', 'read', 'failed')),
  delivery_updated_at timestamptz,
  delivery_error text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  unique (asesoria_id, event, message_id, recipient_id)
);
create index advisory_whatsapp_outbox_due on public.advisory_whatsapp_outbox (next_attempt_at) where status in ('queued', 'waiting');
create index advisory_whatsapp_outbox_provider on public.advisory_whatsapp_outbox (provider_message_id) where provider_message_id is not null;
create index advisory_whatsapp_outbox_extra on public.advisory_whatsapp_outbox using gin (extra_message_ids);
alter table public.advisory_whatsapp_outbox enable row level security;
revoke all on public.advisory_whatsapp_outbox from public, anon, authenticated;
grant select on public.advisory_whatsapp_outbox to authenticated;
grant all on public.advisory_whatsapp_outbox to service_role;
create policy advisory_whatsapp_outbox_admin_read on public.advisory_whatsapp_outbox for select to authenticated using (public.is_admin());

alter table public.whatsapp_inbound_messages
  add column sender_profile_id uuid references public.profiles(id) on delete set null,
  add column advisory_id uuid references public.asesorias_escaladas(id) on delete set null,
  add column advisory_message_id text;
create index whatsapp_inbound_advisory_idx on public.whatsapp_inbound_messages (advisory_id) where advisory_id is not null;

create or replace function public.advisory_iso(p_at timestamptz) returns text
language sql immutable set search_path = pg_catalog as $$
  select to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

create or replace function public.advisory_uuid(p_value text) returns uuid
language sql immutable set search_path = pg_catalog as $$
  select case when p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_value::uuid end
$$;

-- Staff member (admin/tecnico) whose auth phone has this ten-digit key.
create or replace function public.staff_profile_by_phone_key(p_key text) returns uuid
language sql stable security definer set search_path = public, auth as $$
  select p.id from auth.users u join public.profiles p on p.id = u.id
  where p_key is not null and public.whatsapp_phone_key(u.phone) = p_key and p.rol in ('admin', 'tecnico')
  order by p.id limit 1
$$;
revoke all on function public.staff_profile_by_phone_key(text) from public, anon, authenticated;

-- The app rewrites the whole thread on every save. A screen loaded before a WhatsApp message arrived
-- must not erase it, nor drop fields it does not know (channel, attachments added later).
create or replace function public.advisory_thread_keep_messages() returns trigger
language plpgsql set search_path = public as $$
declare
  v_old jsonb := old.metadata -> 'thread';
  v_new jsonb := new.metadata -> 'thread';
  v_merged jsonb;
begin
  if v_old is null or jsonb_typeof(v_old) <> 'array' or jsonb_array_length(v_old) = 0 then return new; end if;
  if v_new is null or jsonb_typeof(v_new) <> 'array' then v_new := '[]'::jsonb; end if;
  select coalesce(jsonb_agg(s.m order by s.m ->> 'createdAt', s.m ->> 'id'), '[]'::jsonb) into v_merged
  from (
    select case when o.msg is null then n.msg
      else (o.msg || n.msg) || case
        when jsonb_array_length(coalesce(n.msg -> 'attachments', '[]'::jsonb)) = 0
         and jsonb_array_length(coalesce(o.msg -> 'attachments', '[]'::jsonb)) > 0
        then jsonb_build_object('attachments', o.msg -> 'attachments') else '{}'::jsonb end
    end as m
    from jsonb_array_elements(v_new) n(msg)
    left join lateral (
      select x.msg from jsonb_array_elements(v_old) x(msg) where x.msg ->> 'id' = n.msg ->> 'id' limit 1
    ) o on true
    union all
    select x.msg from jsonb_array_elements(v_old) x(msg)
    where coalesce(x.msg ->> 'id', '') <> ''
      and not exists (select 1 from jsonb_array_elements(v_new) n(msg) where n.msg ->> 'id' = x.msg ->> 'id')
  ) s;
  if v_merged is distinct from v_new then
    new.metadata := jsonb_set(coalesce(new.metadata, '{}'::jsonb), '{thread}', v_merged);
  end if;
  return new;
end; $$;
create trigger advisory_thread_keep_messages before update of metadata on public.asesorias_escaladas
for each row execute function public.advisory_thread_keep_messages();

-- New replies (from the app or from WhatsApp) → one WhatsApp per recipient on the other side.
create or replace function public.advisory_whatsapp_enqueue_messages() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_msg jsonb;
  v_author uuid;
  v_trainers uuid[];
begin
  for v_msg in
    select n.msg from jsonb_array_elements(case when jsonb_typeof(new.metadata -> 'thread') = 'array' then new.metadata -> 'thread' else '[]'::jsonb end) n(msg)
    where n.msg ->> 'kind' = 'reply' and n.msg ->> 'role' in ('requester', 'trainer')
      and coalesce(n.msg ->> 'id', '') not in ('', 'initial-consultation', 'legacy-trainer-response')
      and not exists (
        select 1 from jsonb_array_elements(case when jsonb_typeof(old.metadata -> 'thread') = 'array' then old.metadata -> 'thread' else '[]'::jsonb end) o(msg)
        where o.msg ->> 'id' = n.msg ->> 'id')
  loop
    v_author := public.advisory_uuid(v_msg ->> 'actorId');
    if v_msg ->> 'role' = 'trainer' then
      insert into public.advisory_whatsapp_outbox (asesoria_id, event, message_id, recipient_id)
      select new.id, 'message', v_msg ->> 'id', new.solicitante_id
      where new.solicitante_id is not null and new.solicitante_id is distinct from v_author
        and exists (select 1 from public.profiles p where p.id = new.solicitante_id)
      on conflict do nothing;
    else
      -- Trainers who already answered; until someone does, every assigned trainer.
      select array_agg(distinct t.id) into v_trainers from (
        select public.advisory_uuid(x.msg ->> 'actorId') as id
        from jsonb_array_elements(new.metadata -> 'thread') x(msg)
        where x.msg ->> 'role' = 'trainer' and x.msg ->> 'kind' = 'reply'
        union all select new.respondida_por_id
      ) t where t.id is not null;
      if v_trainers is null then
        select array_agg(d.destinatario_id) into v_trainers from public.asesorias_escaladas_destinatarios d where d.asesoria_id = new.id;
      end if;
      insert into public.advisory_whatsapp_outbox (asesoria_id, event, message_id, recipient_id)
      select new.id, 'message', v_msg ->> 'id', p.id
      from public.profiles p
      where p.id = any(coalesce(v_trainers, '{}')) and p.id is distinct from v_author
      on conflict do nothing;
    end if;
  end loop;
  return new;
end; $$;
revoke all on function public.advisory_whatsapp_enqueue_messages() from public, anon, authenticated;
create trigger advisory_whatsapp_messages after update of metadata on public.asesorias_escaladas
for each row when (old.metadata is distinct from new.metadata)
execute function public.advisory_whatsapp_enqueue_messages();

create or replace function public.advisory_whatsapp_enqueue_new() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.advisory_whatsapp_outbox (asesoria_id, event, message_id, recipient_id)
  select new.asesoria_id, 'new_advisory', '', new.destinatario_id
  from public.asesorias_escaladas a
  where a.id = new.asesoria_id and a.estado <> 'cerrada' and a.creado_en > now() - interval '3 days'
    and a.solicitante_id is distinct from new.destinatario_id
  on conflict do nothing;
  return new;
end; $$;
revoke all on function public.advisory_whatsapp_enqueue_new() from public, anon, authenticated;
create trigger advisory_whatsapp_new after insert on public.asesorias_escaladas_destinatarios
for each row execute function public.advisory_whatsapp_enqueue_new();

-- Same worker secret as the ticket notices; nothing is sent from SQL.
create or replace function public.run_advisory_whatsapp_dispatch() returns void
language plpgsql security definer set search_path = public as $$
declare worker_secret text;
begin
  if not exists (
    select 1 from public.advisory_whatsapp_outbox
    where (status in ('queued', 'waiting') and next_attempt_at <= now()) or (status = 'processing' and updated_at < now() - interval '3 minutes')
  ) then return; end if;
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name = 'ticket_wa_worker_secret' limit 1;
  if worker_secret is null then return; end if;
  perform net.http_post(
    url := 'https://mzgrifkunevgestihlmh.supabase.co/functions/v1/advisory-whatsapp-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-token', worker_secret),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
end; $$;
revoke all on function public.run_advisory_whatsapp_dispatch() from public, anon, authenticated;

-- Chat latency: kick the worker as soon as the transaction that queued work commits.
create or replace function public.advisory_whatsapp_kick() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.run_advisory_whatsapp_dispatch();
  return null;
end; $$;
revoke all on function public.advisory_whatsapp_kick() from public, anon, authenticated;
create trigger advisory_whatsapp_kick after insert on public.advisory_whatsapp_outbox
for each statement execute function public.advisory_whatsapp_kick();

create or replace function public.claim_advisory_whatsapp() returns table (
  id uuid, asesoria_id uuid, event text, message_id text, recipient_id uuid, recipient_name text, recipient_phone text,
  window_open boolean, opted_out boolean, area text, requester_name text, label text, consulta text,
  author_name text, body text, attachments jsonb, created_at timestamptz
)
language plpgsql security definer set search_path = public, auth as $$
#variable_conflict use_column
begin
  update public.advisory_whatsapp_outbox o set status = 'unknown', error_message = 'El proceso no confirmó el resultado. No se reintentará automáticamente.', updated_at = now()
  where o.status = 'processing' and o.updated_at < now() - interval '3 minutes';
  update public.advisory_whatsapp_outbox o set status = 'skipped', error_message = 'Aviso vencido sin enviar.', updated_at = now()
  where o.status in ('queued', 'waiting') and o.created_at < now() - interval '7 days';
  return query
  with claimed as (
    update public.advisory_whatsapp_outbox o set status = 'processing', updated_at = now()
    where o.id in (
      select x.id from public.advisory_whatsapp_outbox x
      where x.status in ('queued', 'waiting') and x.next_attempt_at <= now()
      order by x.created_at, x.id for update skip locked limit 10)
    returning o.*
  )
  select c.id, c.asesoria_id, c.event, c.message_id, c.recipient_id, rp.nombre_completo, u.phone,
    exists (select 1 from public.whatsapp_conversations w where w.is_ticket_line
      and w.phone_key = public.whatsapp_phone_key(u.phone) and w.last_inbound_at > now() - interval '23 hours 30 minutes'),
    exists (select 1 from public.whatsapp_opt_outs oo where oo.phone_key = public.whatsapp_phone_key(u.phone)),
    a.area::text,
    coalesce(nullif(btrim(a.solicitante_nombre_snapshot), ''), sp.nombre_completo, 'Solicitante'),
    coalesce(nullif(concat_ws(' · ', t.numero_caso, coalesce(nullif(btrim(t.numero_serie_equipo), ''), nullif(btrim(a.plataforma_snapshot), ''))), ''), 'sin ticket'),
    a.consulta_escalada,
    m.msg ->> 'actorName', m.msg ->> 'body', coalesce(m.msg -> 'attachments', '[]'::jsonb), c.created_at
  from claimed c
  join public.asesorias_escaladas a on a.id = c.asesoria_id
  left join public.profiles rp on rp.id = c.recipient_id
  left join auth.users u on u.id = c.recipient_id
  left join public.profiles sp on sp.id = a.solicitante_id
  left join public.tickets t on t.id = a.ticket_id
  left join lateral (
    select x.msg from jsonb_array_elements(case when jsonb_typeof(a.metadata -> 'thread') = 'array' then a.metadata -> 'thread' else '[]'::jsonb end) x(msg)
    where x.msg ->> 'id' = c.message_id limit 1
  ) m on true;
end; $$;
revoke all on function public.claim_advisory_whatsapp() from public, anon, authenticated;
grant execute on function public.claim_advisory_whatsapp() to service_role;

-- A staff member's WhatsApp → the advisory it belongs to. Idempotent; null when it is a customer.
create or replace function public.route_whatsapp_inbound_to_advisory(p_inbound uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.whatsapp_inbound_messages%rowtype;
  v_line boolean;
  v_key text;
  v_staff uuid;
  v_advisory uuid;
begin
  select * into r from public.whatsapp_inbound_messages where id = p_inbound;
  if not found then return null; end if;
  if r.advisory_id is not null then
    return jsonb_build_object('advisory_id', r.advisory_id, 'pending', r.advisory_message_id is null, 'conversation_id', r.conversation_id);
  end if;
  select c.is_ticket_line, c.phone_key into v_line, v_key from public.whatsapp_conversations c where c.id = r.conversation_id;
  if not v_line or r.kind in ('reaction', 'system', 'unsupported') then return null; end if;
  v_staff := public.staff_profile_by_phone_key(v_key);
  if v_staff is null then return null; end if;
  if r.context_message_id is not null then
    select o.asesoria_id into v_advisory from public.advisory_whatsapp_outbox o
    where o.provider_message_id = r.context_message_id or r.context_message_id = any(o.extra_message_ids)
    limit 1;
  end if;
  if v_advisory is null then
    select a.id into v_advisory from public.asesorias_escaladas a
    where a.estado <> 'cerrada' and (
      a.solicitante_id = v_staff or a.respondida_por_id = v_staff
      or exists (select 1 from public.asesorias_escaladas_destinatarios d where d.asesoria_id = a.id and d.destinatario_id = v_staff))
    order by a.actualizado_en desc nulls last, a.creado_en desc limit 1;
  end if;
  update public.whatsapp_inbound_messages set sender_profile_id = v_staff, advisory_id = v_advisory where id = r.id;
  if v_advisory is null then return null; end if;
  return jsonb_build_object('advisory_id', v_advisory, 'pending', true, 'conversation_id', r.conversation_id);
end; $$;

-- Adds the routed WhatsApp message to the thread exactly once. The update fires the mirror trigger.
create or replace function public.append_advisory_whatsapp_message(p_inbound uuid, p_attachments jsonb default '[]'::jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.whatsapp_inbound_messages%rowtype;
  a public.asesorias_escaladas%rowtype;
  v_role text;
  v_name text;
  v_body text;
  v_id text := gen_random_uuid()::text;
  v_at text;
  v_sd jsonb;
  v_thread jsonb;
  v_map text;
begin
  select * into r from public.whatsapp_inbound_messages where id = p_inbound for update;
  if not found or r.advisory_id is null then return null; end if;
  if r.advisory_message_id is not null then return r.advisory_message_id; end if;
  select * into a from public.asesorias_escaladas where id = r.advisory_id for update;
  if not found then return null; end if;
  v_role := case when a.solicitante_id = r.sender_profile_id then 'requester' else 'trainer' end;
  select nombre_completo into v_name from public.profiles where id = r.sender_profile_id;
  if r.kind = 'location' and (r.extra ->> 'latitude') is not null then
    v_map := 'https://www.google.com/maps?q=' || (r.extra ->> 'latitude') || ',' || (r.extra ->> 'longitude');
  end if;
  v_body := concat_ws(E'\n', coalesce(nullif(btrim(r.body), ''), case r.kind
    when 'image' then 'Envió una foto por WhatsApp.' when 'sticker' then 'Envió un sticker por WhatsApp.'
    when 'video' then 'Envió un video por WhatsApp.' when 'audio' then 'Envió un audio por WhatsApp.'
    when 'document' then 'Envió un documento por WhatsApp.' when 'location' then 'Envió una ubicación por WhatsApp.'
    else 'Envió un mensaje por WhatsApp.' end), v_map);
  if r.media_error is not null and jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) = 0 and r.media_id is not null then
    v_body := v_body || E'\n(No se pudo copiar el archivo: ' || r.media_error || ')';
  end if;
  v_at := public.advisory_iso(r.sent_at);
  v_thread := case when jsonb_typeof(a.metadata -> 'thread') = 'array' then a.metadata -> 'thread' else '[]'::jsonb end;
  v_sd := case when jsonb_typeof(a.metadata -> 'serviceDesk') = 'object' then a.metadata -> 'serviceDesk' else '{}'::jsonb end;
  v_sd := v_sd || jsonb_build_object(
    'unreadRequester', (case when v_sd ->> 'unreadRequester' ~ '^\d+$' then (v_sd ->> 'unreadRequester')::int else 0 end) + case when v_role = 'trainer' then 1 else 0 end,
    'unreadTrainer', (case when v_sd ->> 'unreadTrainer' ~ '^\d+$' then (v_sd ->> 'unreadTrainer')::int else 0 end) + case when v_role = 'requester' then 1 else 0 end,
    'lastActorRole', v_role, 'lastMessageAt', v_at,
    'waitingOn', case when a.estado = 'cerrada' then 'closed' when v_role = 'trainer' then 'requester' else 'trainer' end,
    'messageCount', (case when v_sd ->> 'messageCount' ~ '^\d+$' then (v_sd ->> 'messageCount')::int else jsonb_array_length(v_thread) end) + 1,
    'responseCount', (case when v_sd ->> 'responseCount' ~ '^\d+$' then (v_sd ->> 'responseCount')::int else 0 end) + case when v_role = 'trainer' then 1 else 0 end,
    'attachmentCount', (case when v_sd ->> 'attachmentCount' ~ '^\d+$' then (v_sd ->> 'attachmentCount')::int else 0 end) + jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)));
  if v_role = 'trainer' and coalesce(v_sd ->> 'firstTrainerResponseAt', '') = '' then
    v_sd := v_sd || jsonb_build_object('firstTrainerResponseAt', v_at);
  end if;
  update public.asesorias_escaladas set
    metadata = jsonb_set(jsonb_set(coalesce(metadata, '{}'::jsonb), '{thread}', v_thread || jsonb_build_object(
      'id', v_id, 'kind', 'reply', 'role', v_role, 'actorId', r.sender_profile_id, 'actorName', coalesce(v_name, 'Staff'),
      'body', v_body, 'createdAt', v_at, 'attachments', coalesce(p_attachments, '[]'::jsonb), 'statusSnapshot', a.estado,
      'channel', 'whatsapp', 'whatsappMessageId', r.wa_message_id)), '{serviceDesk}', v_sd),
    respuesta_trainer = case when v_role = 'trainer' then v_body else respuesta_trainer end,
    respondida_por_id = case when v_role = 'trainer' then r.sender_profile_id else respondida_por_id end,
    respondida_en = case when v_role = 'trainer' then r.sent_at else respondida_en end,
    actualizado_en = now()
  where id = a.id;
  update public.whatsapp_inbound_messages set advisory_message_id = v_id where id = r.id;
  return v_id;
end; $$;
revoke all on function public.route_whatsapp_inbound_to_advisory(uuid) from public, anon, authenticated;
revoke all on function public.append_advisory_whatsapp_message(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.route_whatsapp_inbound_to_advisory(uuid) to service_role;
grant execute on function public.append_advisory_whatsapp_message(uuid, jsonb) to service_role;

-- Delivery statuses also reach the advisory notices (main or extra message ids).
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
  -- Attachments sent after the text only report problems; the main message carries the status.
  update public.advisory_whatsapp_outbox set
    delivery_status = case when provider_message_id = p_wa_message_id then p_status else delivery_status end,
    delivery_updated_at = coalesce(p_at, now()),
    delivery_error = case when p_status = 'failed' then left(p_error, 500) else delivery_error end
  where (provider_message_id = p_wa_message_id and coalesce(array_position(v_order, delivery_status), 0) < v_rank)
     or (p_status = 'failed' and p_wa_message_id = any(extra_message_ids));
  get diagnostics v_rows = row_count; v_total := v_total + v_rows;
  return v_total;
end; $$;

-- Inbox: staff messages that went to an advisory do not count as unread customer messages,
-- and the advisory notices sent to a number show in its conversation.
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
          where m.conversation_id = c.id and m.advisory_id is null
            and m.received_at > coalesce(c.last_read_at, '-infinity'::timestamptz))::integer as unread,
        exists (select 1 from public.whatsapp_opt_outs o where o.phone_key = c.phone_key) as opted_out,
        public.staff_profile_by_phone_key(c.phone_key) is not null as is_staff
      from public.whatsapp_conversations c
      left join public.tickets t on t.id = c.ticket_id
      order by c.last_message_at desc nulls last, c.id
      limit least(greatest(coalesce(p_limit, 200), 1), 500)
    ) x
  ), '[]'::jsonb);
end; $$;

create or replace function public.whatsapp_unread_count() returns integer
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then (
    select count(*)::integer from public.whatsapp_inbound_messages m
    join public.whatsapp_conversations c on c.id = m.conversation_id
    where m.advisory_id is null and m.received_at > coalesce(c.last_read_at, '-infinity'::timestamptz)
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
          o.opted_out_at is not null as opted_out, o.opted_out_at,
          public.staff_profile_by_phone_key(c.phone_key) is not null as is_staff
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
            null::text as template, null::jsonb as parameters, null::text as error_message,
            i.advisory_id
          from public.whatsapp_inbound_messages i where i.conversation_id = c.id
          union all
          select w.id::text, 'out', 'manual', w.mode, w.body, null, null, null, null, null, null,
            w.provider_message_id, w.ticket_id, w.created_at, w.status, w.delivery_status, p.nombre_completo,
            null, null, coalesce(w.delivery_error, w.error_message), null::uuid
          from public.ticket_whatsapp_messages w
          left join public.profiles p on p.id = w.actor_id
          where c.is_ticket_line and public.whatsapp_phone_key(w.recipient) = c.phone_key
          union all
          select o.id::text, 'out', 'auto', o.event, null, null, null, null, null, null, null,
            o.provider_message_id, o.ticket_id, o.updated_at, o.status, o.delivery_status, null,
            o.template, o.parameters, coalesce(o.delivery_error, o.error_message), null::uuid
          from public.ticket_whatsapp_outbox o
          where c.is_ticket_line and o.status in ('accepted', 'unknown', 'failed')
            and public.whatsapp_phone_key(o.recipient) = c.phone_key
          union all
          select ao.id::text, 'out', 'advisory', ao.event,
            case when ao.event = 'new_advisory' then aa.consulta_escalada else (
              select x.msg ->> 'body' from jsonb_array_elements(case when jsonb_typeof(aa.metadata -> 'thread') = 'array' then aa.metadata -> 'thread' else '[]'::jsonb end) x(msg)
              where x.msg ->> 'id' = ao.message_id limit 1) end,
            null, null, null, null, null, null,
            ao.provider_message_id, aa.ticket_id, ao.updated_at, ao.status, ao.delivery_status, null,
            null, null, coalesce(ao.delivery_error, ao.error_message), ao.asesoria_id
          from public.advisory_whatsapp_outbox ao
          join public.asesorias_escaladas aa on aa.id = ao.asesoria_id
          where c.is_ticket_line and ao.status in ('accepted', 'unknown', 'failed')
            and public.whatsapp_phone_key(ao.sent_to) = c.phone_key
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

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('advisory-whatsapp-dispatch', '* * * * *', 'select public.run_advisory_whatsapp_dispatch()');
  end if;
end $$;

comment on table public.advisory_whatsapp_outbox is 'WhatsApp notices for escalated advisories (new advisory, mirrored replies). accepted = Meta accepted, not delivered. Unknown/processing are never retried automatically.';
