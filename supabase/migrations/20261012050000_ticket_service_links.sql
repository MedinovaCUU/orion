-- Liga ticket → visita para el histórico de Biosisa, donde los reportes de servicio no traen el ticket que los originó.
-- Se infiere por número de serie y fecha, se guarda aparte con su nivel de confianza y nunca toca
-- servicios_historial.ticket_id (la liga capturada en Orion), así que los indicadores existentes no cambian.
--
-- Reglas (servicio de campo del mismo equipo, entre la apertura del ticket y los días indicados):
--   segura   · ticket cerrado como "Cerrado por Agendar Visita" + correctivo o visita en ≤ 15 días.
--   probable · ticket "Agendar Visita" + otro tipo de servicio (preventivo, instalación…) en ≤ 15 días, o
--              cualquier otro ticket + correctivo o visita en ≤ 7 días.
--   Cada ticket se liga a una sola visita (la más segura y cercana); una visita puede atender varios tickets.
--   Un preventivo después de un ticket "Solucionado" no se liga: suele ser mantenimiento ya programado.

create table if not exists public.ticket_service_links (
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  servicio_id uuid not null references public.servicios_historial(id) on delete cascade,
  metodo text not null default 'serie_fecha' check (metodo in ('serie_fecha')),
  confianza text not null check (confianza in ('segura', 'probable')),
  dias integer not null check (dias between 0 and 15),
  creado_en timestamptz not null default now(),
  primary key (ticket_id, servicio_id)
);
create index if not exists ticket_service_links_servicio_idx on public.ticket_service_links (servicio_id);
comment on table public.ticket_service_links is 'Liga inferida ticket → visita (histórico Biosisa) por número de serie y fecha; ver migración 20261012050000.';

alter table public.ticket_service_links enable row level security;
drop policy if exists "Ticket service links follow ticket visibility" on public.ticket_service_links;
create policy "Ticket service links follow ticket visibility" on public.ticket_service_links
  for select to authenticated using (public.can_view_ticket(ticket_id));
revoke all on public.ticket_service_links from anon, authenticated;
grant select on public.ticket_service_links to authenticated;

create or replace function public.rebuild_ticket_service_links()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text := coalesce((select s.timezone from public.service_kpi_settings s limit 1), 'America/Chihuahua');
  v_count integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Solo administradores pueden recalcular las ligas de ticket y visita';
  end if;
  delete from public.ticket_service_links where metodo = 'serie_fecha';
  insert into public.ticket_service_links (ticket_id, servicio_id, metodo, confianza, dias)
  select distinct on (c.ticket_id) c.ticket_id, c.servicio_id, 'serie_fecha', c.confianza, c.dias
  from (
    select t.id as ticket_id, h.id as servicio_id, x.dias,
      case
        when e.closure_reason = 'visita_programada' and x.kind in ('correctivo', 'visita') then 'segura'
        when e.closure_reason = 'visita_programada' then 'probable'
        when x.kind in ('correctivo', 'visita') and x.dias <= 7 then 'probable'
      end as confianza
    from public.tickets t
    left join public.ticket_service_events e on e.ticket_id = t.id and e.kind = 'cierre'
    join public.servicios_historial h
      on public.normalize_equipment_serial(h.no_serie) = public.normalize_equipment_serial(t.numero_serie_equipo)
     and h.ticket_id is null
     and coalesce(h.origen, '') not in ('biosisa_llamada', 'biosisa_capacitacion')
    cross join lateral (
      select h.fecha_servicio - (t.creado_en at time zone v_tz)::date as dias,
             public.service_history_kind(h.tipo_servicio, h.motivo) as kind
    ) x
    where not public.ticket_is_planning(t.descripcion)
      and public.normalize_equipment_serial(t.numero_serie_equipo) is not null
      and x.dias between 0 and 15
      and x.kind not in ('prueba', 'llamada', 'capacitacion', 'recapacitacion')
  ) c
  where c.confianza is not null
  order by c.ticket_id, (c.confianza = 'segura') desc, c.dias, c.servicio_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.rebuild_ticket_service_links() from public, anon;
grant execute on function public.rebuild_ticket_service_links() to authenticated;

-- Indicadores estimados (tiempo del ticket a la visita, % que termina en visita, resolución en primera visita):
-- una fila por ticket relevante del periodo con visita, inferida (segura/probable) o capturada en Orion (registrada).
-- revisitas = otros correctivos o visitas del mismo equipo dentro de la ventana de reincidencia tras esa visita.
create or replace function public.get_service_kpi_visit_links(p_filters jsonb default '{}'::jsonb)
returns table (
  ticket_id uuid, folio text, servicio_id uuid, id_legacy integer, fecha_servicio date, dias integer, confianza text,
  tipo text, tecnico text, revisitas integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  w public.service_kpi_window;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Los indicadores del personal son exclusivos para administradores';
  end if;
  w := public.service_kpi_window(coalesce(p_filters, '{}'::jsonb));
  return query
  with t as (
    select x.ticket_id, x.folio, x.opened_at from public.service_kpi_ticket_rows(coalesce(p_filters, '{}'::jsonb)) x where x.relevant
  ),
  links as (
    select l.ticket_id, l.servicio_id, l.dias, l.confianza from public.ticket_service_links l join t on t.ticket_id = l.ticket_id
    union all
    (select distinct on (h.ticket_id) h.ticket_id, h.id, greatest(h.fecha_servicio - (t.opened_at at time zone w.tz)::date, 0), 'registrada'::text
     from public.servicios_historial h join t on t.ticket_id = h.ticket_id
     where public.service_history_kind(h.tipo_servicio, h.motivo) not in ('prueba', 'llamada', 'capacitacion', 'recapacitacion')
     order by h.ticket_id, h.fecha_servicio)
  )
  select t.ticket_id, t.folio, h.id, h.id_legacy, h.fecha_servicio, l.dias, l.confianza,
    public.service_history_kind(h.tipo_servicio, h.motivo), p.nombre_completo,
    (select count(*) from public.servicios_historial r
      where public.normalize_equipment_serial(r.no_serie) = public.normalize_equipment_serial(h.no_serie)
        and r.id <> h.id and r.fecha_servicio > h.fecha_servicio and r.fecha_servicio <= h.fecha_servicio + w.recurrence_days
        and public.service_history_kind(r.tipo_servicio, r.motivo) in ('correctivo', 'visita'))::integer
  from links l
  join t on t.ticket_id = l.ticket_id
  join public.servicios_historial h on h.id = l.servicio_id
  left join public.profiles p on p.id = h.tecnico_id;
end;
$$;
revoke all on function public.get_service_kpi_visit_links(jsonb) from public, anon;
grant execute on function public.get_service_kpi_visit_links(jsonb) to authenticated;

select public.rebuild_ticket_service_links();
