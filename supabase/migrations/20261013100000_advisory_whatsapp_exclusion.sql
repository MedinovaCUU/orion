-- Advisories can be kept out of the WhatsApp bridge (20261013090000): no new-advisory notices, no
-- mirrored replies, staff WhatsApp messages are never routed into them, and anything already queued
-- for them is skipped instead of sent. The thread in Orion keeps working as before.
-- The owner marked the only existing advisory (2J204N61, Alfredo Acevedo ↔ Héctor Cortés) as a test:
-- it must not message either of them.

alter table public.asesorias_escaladas add column if not exists whatsapp_desactivado boolean not null default false;
comment on column public.asesorias_escaladas.whatsapp_desactivado is 'Excluida del puente de WhatsApp (p. ej. asesoría de prueba).';

create or replace function public.advisory_whatsapp_enqueue_messages() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_msg jsonb;
  v_author uuid;
  v_trainers uuid[];
begin
  if new.whatsapp_desactivado then return new; end if;
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

create or replace function public.advisory_whatsapp_enqueue_new() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.advisory_whatsapp_outbox (asesoria_id, event, message_id, recipient_id)
  select new.asesoria_id, 'new_advisory', '', new.destinatario_id
  from public.asesorias_escaladas a
  where a.id = new.asesoria_id and not a.whatsapp_desactivado and a.estado <> 'cerrada' and a.creado_en > now() - interval '3 days'
    and a.solicitante_id is distinct from new.destinatario_id
  on conflict do nothing;
  return new;
end; $$;

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
  update public.advisory_whatsapp_outbox o set status = 'skipped', error_message = 'Asesoría excluida de WhatsApp.', updated_at = now()
  from public.asesorias_escaladas a
  where a.id = o.asesoria_id and a.whatsapp_desactivado and o.status in ('queued', 'waiting');
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
    join public.asesorias_escaladas a on a.id = o.asesoria_id
    where (o.provider_message_id = r.context_message_id or r.context_message_id = any(o.extra_message_ids))
      and not a.whatsapp_desactivado
    limit 1;
  end if;
  if v_advisory is null then
    select a.id into v_advisory from public.asesorias_escaladas a
    where a.estado <> 'cerrada' and not a.whatsapp_desactivado and (
      a.solicitante_id = v_staff or a.respondida_por_id = v_staff
      or exists (select 1 from public.asesorias_escaladas_destinatarios d where d.asesoria_id = a.id and d.destinatario_id = v_staff))
    order by a.actualizado_en desc nulls last, a.creado_en desc limit 1;
  end if;
  update public.whatsapp_inbound_messages set sender_profile_id = v_staff, advisory_id = v_advisory where id = r.id;
  if v_advisory is null then return null; end if;
  return jsonb_build_object('advisory_id', v_advisory, 'pending', true, 'conversation_id', r.conversation_id);
end; $$;

-- Owner (2026-10-13): «era una de prueba». No-op where the row does not exist (local databases).
update public.asesorias_escaladas set whatsapp_desactivado = true where id = '6140478b-9636-40ac-8a5f-fd34a03943d3';
update public.advisory_whatsapp_outbox set status = 'skipped', error_message = 'Asesoría excluida de WhatsApp.', updated_at = now()
where asesoria_id = '6140478b-9636-40ac-8a5f-fd34a03943d3' and status in ('queued', 'waiting');
