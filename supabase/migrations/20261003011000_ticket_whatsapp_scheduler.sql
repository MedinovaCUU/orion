create extension if not exists pg_net with schema extensions;
create function public.run_ticket_whatsapp_dispatch() returns void
language plpgsql security definer set search_path=public as $$
declare worker_secret text;
begin
 if not exists(select 1 from public.ticket_whatsapp_outbox where (status in ('queued','waiting') and next_attempt_at<=now()) or (status='processing' and updated_at<now()-interval '3 minutes')) then return; end if;
 select decrypted_secret into worker_secret from vault.decrypted_secrets where name='ticket_wa_worker_secret' limit 1;
 if worker_secret is null then return; end if;
 perform net.http_post(url:='https://mzgrifkunevgestihlmh.supabase.co/functions/v1/ticket-whatsapp-dispatch',headers:=jsonb_build_object('Content-Type','application/json','x-worker-token',worker_secret),body:='{}'::jsonb,timeout_milliseconds:=60000);
end; $$;
revoke all on function public.run_ticket_whatsapp_dispatch() from public,anon,authenticated;
select cron.schedule('ticket-whatsapp-dispatch','* * * * *','select public.run_ticket_whatsapp_dispatch()');
