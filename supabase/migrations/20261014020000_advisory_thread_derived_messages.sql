-- The app derives two thread entries on its own: 'initial-consultation' (from consulta_escalada) and
-- 'legacy-trainer-response' (from respuesta_trainer). Until the 2026-10-14 frontend fix it compared
-- respondida_en («…+00:00») with the reply's createdAt («….000Z») as text, so every trainer reply got a
-- derived copy that the next save stored. The keep-messages trigger must not protect those derived
-- entries, and the stored copies that repeat a real trainer reply are removed.

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
    -- Real messages a stale screen did not have come back; derived entries are the app's to rebuild.
    select x.msg from jsonb_array_elements(v_old) x(msg)
    where coalesce(x.msg ->> 'id', '') not in ('', 'initial-consultation', 'legacy-trainer-response')
      and not exists (select 1 from jsonb_array_elements(v_new) n(msg) where n.msg ->> 'id' = x.msg ->> 'id')
  ) s;
  if v_merged is distinct from v_new then
    new.metadata := jsonb_set(coalesce(new.metadata, '{}'::jsonb), '{thread}', v_merged);
  end if;
  return new;
end; $$;

-- Stored copies of a reply that is already in the thread (keeps order; no WhatsApp is queued for removals).
update public.asesorias_escaladas a
set metadata = jsonb_set(a.metadata, '{thread}', (
  select coalesce(jsonb_agg(x.msg order by x.i), '[]'::jsonb)
  from jsonb_array_elements(a.metadata -> 'thread') with ordinality x(msg, i)
  where not (x.msg ->> 'id' = 'legacy-trainer-response' and exists (
    select 1 from jsonb_array_elements(a.metadata -> 'thread') o(msg)
    where o.msg ->> 'role' = 'trainer' and o.msg ->> 'id' <> 'legacy-trainer-response'
      and btrim(o.msg ->> 'body') = btrim(x.msg ->> 'body')))
))
where jsonb_typeof(a.metadata -> 'thread') = 'array' and exists (
  select 1 from jsonb_array_elements(a.metadata -> 'thread') x(msg)
  where x.msg ->> 'id' = 'legacy-trainer-response' and exists (
    select 1 from jsonb_array_elements(a.metadata -> 'thread') o(msg)
    where o.msg ->> 'role' = 'trainer' and o.msg ->> 'id' <> 'legacy-trainer-response'
      and btrim(o.msg ->> 'body') = btrim(x.msg ->> 'body')));
