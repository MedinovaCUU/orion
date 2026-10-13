-- Encuesta de satisfacción: presentación del personal en la visita en sitio (bata de laboratorio y gafete).
-- both = bata y gafete · coat = solo bata · badge = solo gafete · none = ninguno · no_visit = no hubo visita en sitio.
-- En la base es opcional: un enlace abierto con la versión anterior de la página (7 respuestas) sigue
-- guardando; la página nueva la exige. Las encuestas ya respondidas quedan sin dato, no se infieren.
alter table public.ticket_satisfaction
 add column if not exists attire text check (attire in ('both','coat','badge','none','no_visit'));

drop function public.submit_ticket_satisfaction(text,integer,integer,text,integer,text,text);
create function public.submit_ticket_satisfaction(p_token text,p_satisfaction integer,p_speed integer,p_resolution text,p_clarity integer,p_improvement text,p_comment text default '',p_attire text default null) returns void
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
 or (p_attire is not null and p_attire not in ('both','coat','badge','none','no_visit'))
 or char_length(coalesce(p_comment,''))>1000 then raise exception 'Revisa las respuestas de la encuesta'; end if;
 update public.ticket_satisfaction set satisfaction=p_satisfaction,speed=p_speed,resolution=p_resolution,clarity=p_clarity,
 improvement=p_improvement,attire=p_attire,comment=nullif(btrim(p_comment),''),answered_at=now() where id=s.id;
end; $$;
revoke all on function public.submit_ticket_satisfaction(text,integer,integer,text,integer,text,text,text) from public;
grant execute on function public.submit_ticket_satisfaction(text,integer,integer,text,integer,text,text,text) to anon,authenticated;

notify pgrst, 'reload schema';
