-- Explicit sandbox invitations exercise the real response pipeline without evaluating staff.
alter table public.ticket_satisfaction add column is_test boolean not null default false;
alter table public.ticket_satisfaction alter column ticket_id drop not null;
alter table public.ticket_satisfaction add constraint satisfaction_ticket_required check (ticket_id is not null or is_test);
alter table public.ticket_satisfaction add constraint satisfaction_test_unassigned check (not is_test or (ticket_id is null and specialist_id is null));
create or replace function public.get_ticket_satisfaction(p_token text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.ticket_satisfaction%rowtype;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
 select * into s from public.ticket_satisfaction where token=p_token;
 if not found or s.expires_at<now() then return null; end if;
 return jsonb_build_object('case_number',s.case_number,'specialist_name',s.specialist_name,'answered',s.answered_at is not null,'is_test',s.is_test);
end; $$;
alter policy satisfaction_admin_read on public.ticket_satisfaction using(public.is_admin() and not is_test);
