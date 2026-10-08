-- Manual sending is restricted to administrators. The edge function owns writes.
create table if not exists public.ticket_whatsapp_messages (
  id uuid primary key,
  actor_id uuid not null references auth.users(id),
  ticket_id uuid references public.tickets(id),
  recipient text not null check (recipient ~ '^[1-9][0-9]{7,14}$'),
  mode text not null check (mode in ('text','contact','closure')),
  body text not null,
  payload_hash text not null,
  status text not null default 'sending' check (status in ('sending','accepted','failed','unknown')),
  provider_message_id text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ticket_whatsapp_messages_created_idx on public.ticket_whatsapp_messages(created_at desc);
alter table public.ticket_whatsapp_messages enable row level security;
revoke all on public.ticket_whatsapp_messages from public, anon, authenticated;
grant select on public.ticket_whatsapp_messages to authenticated;
grant all on public.ticket_whatsapp_messages to service_role;
create policy ticket_whatsapp_admin_read on public.ticket_whatsapp_messages
  for select to authenticated using (public.is_admin());
comment on table public.ticket_whatsapp_messages is 'Outbound audit. accepted means Meta accepted the request, not delivered. Never automatically retry unknown/sending.';
