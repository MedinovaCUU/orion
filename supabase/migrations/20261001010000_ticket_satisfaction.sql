-- One invitation per closed ticket. Snapshot the assigned specialist, never infer from the closer.
create table public.ticket_satisfaction (
 id uuid primary key default gen_random_uuid(),
 ticket_id uuid not null unique references public.tickets(id),
 token text not null unique default replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
 specialist_id uuid references public.profiles(id), specialist_name text,
 area text not null check(area in ('ingenieria','quimica','sin_clasificar')),
 case_number text not null, recipient text,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '30 days',
 sent_at timestamptz, sent_by uuid references auth.users(id), consented_at timestamptz, send_status text not null default 'ready' check(send_status in ('ready','sending','accepted','failed','unknown')),
 provider_message_id text, send_error text,
 answered_at timestamptz,
 satisfaction smallint check(satisfaction between 1 and 5), speed smallint check(speed between 1 and 5),
 resolution text check(resolution in ('total','partial','unresolved')),
 clarity smallint check(clarity between 1 and 5),
 improvement text check(improvement in ('speed','solution','clarity','care','followup','none','other')),
 comment text check(char_length(comment)<=1000),
 check(answered_at is null or (satisfaction is not null and speed is not null and resolution is not null and improvement is not null))
);
alter table public.ticket_satisfaction enable row level security;
revoke all on public.ticket_satisfaction from public,anon,authenticated;
grant select on public.ticket_satisfaction to authenticated;
grant all on public.ticket_satisfaction to service_role;
create policy satisfaction_admin_read on public.ticket_satisfaction for select to authenticated using(public.is_admin());

create function public.create_ticket_satisfaction() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if old.estado is distinct from new.estado and new.estado='cerrado' then
  insert into public.ticket_satisfaction(ticket_id,specialist_id,specialist_name,area,case_number,recipient)
  select new.id,a.assigned_to,p.nombre_completo,coalesce(public.ticket_support_area(new.asunto),'sin_clasificar'),
    coalesce(new.numero_caso,new.id::text),new.telefono_cliente_guest
  from (select 1) seed left join public.ticket_assignments a on a.ticket_id=new.id left join public.profiles p on p.id=a.assigned_to
  on conflict(ticket_id) do nothing;
 end if;
 return new;
end; $$;
revoke all on function public.create_ticket_satisfaction() from public,anon,authenticated;
create trigger ticket_satisfaction_on_close after update of estado on public.tickets for each row execute function public.create_ticket_satisfaction();

-- Capability URL: public access is restricted to this minimal projection for a high-entropy random token.
create function public.get_ticket_satisfaction(p_token text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.ticket_satisfaction%rowtype;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
 select * into s from public.ticket_satisfaction where token=p_token;
 if not found or s.expires_at<now() then return null; end if;
 return jsonb_build_object('case_number',s.case_number,'specialist_name',s.specialist_name,'answered',s.answered_at is not null);
end; $$;
revoke all on function public.get_ticket_satisfaction(text) from public;
grant execute on function public.get_ticket_satisfaction(text) to anon,authenticated;

create function public.submit_ticket_satisfaction(p_token text,p_satisfaction integer,p_speed integer,p_resolution text,p_clarity integer,p_improvement text,p_comment text default '') returns void
language plpgsql security definer set search_path=public as $$
declare s public.ticket_satisfaction%rowtype;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Enlace inválido o vencido'; end if;
 select * into s from public.ticket_satisfaction where token=p_token for update;
 if not found or s.expires_at<now() then raise exception 'Enlace inválido o vencido'; end if;
 if s.answered_at is not null then raise exception 'Esta encuesta ya fue respondida'; end if;
 if p_satisfaction is null or p_satisfaction not between 1 and 5 or p_speed is null or p_speed not between 1 and 5
 or p_resolution is null or p_resolution not in ('total','partial','unresolved') or (p_clarity is not null and p_clarity not between 1 and 5)
 or p_improvement is null or p_improvement not in ('speed','solution','clarity','care','followup','none','other')
 or char_length(coalesce(p_comment,''))>1000 then raise exception 'Revisa las respuestas de la encuesta'; end if;
 update public.ticket_satisfaction set satisfaction=p_satisfaction,speed=p_speed,resolution=p_resolution,clarity=p_clarity,
 improvement=p_improvement,comment=nullif(btrim(p_comment),''),answered_at=now() where id=s.id;
end; $$;
revoke all on function public.submit_ticket_satisfaction(text,integer,integer,text,integer,text,text) from public;
grant execute on function public.submit_ticket_satisfaction(text,integer,integer,text,integer,text,text) to anon,authenticated;
