-- Convierte los tickets en casos rastreables sin romper los flujos de alta
-- autenticados o anonimos que ya existen.

alter type public.ticket_status add value if not exists 'pendiente_piezas';
alter type public.ticket_status add value if not exists 'en_observacion';

alter table public.tickets
  add column if not exists numero_caso text;

create table if not exists public.ticket_case_daily_counters (
  case_date date primary key,
  last_value smallint not null check (last_value between 1 and 99)
);

alter table public.ticket_case_daily_counters enable row level security;

-- Codifica fecha y consecutivo diario asi:
-- D1 + M1 + A3 + C1 + D2 + M3 + A4 + C2
-- 19/julio/2026, consecutivo 01 => 1J209L61
create or replace function public.format_ticket_case_number(
  p_case_date date,
  p_daily_number integer
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_day text := to_char(p_case_date, 'DD');
  v_year text := to_char(p_case_date, 'YYYY');
  v_sequence text := lpad(p_daily_number::text, 2, '0');
  v_month text := (array[
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
  ])[extract(month from p_case_date)::integer];
begin
  if p_daily_number not between 1 and 99 then
    raise exception 'El consecutivo diario debe estar entre 1 y 99';
  end if;

  return substr(v_day, 1, 1)
    || substr(v_month, 1, 1)
    || substr(v_year, 3, 1)
    || substr(v_sequence, 1, 1)
    || substr(v_day, 2, 1)
    || substr(v_month, 3, 1)
    || substr(v_year, 4, 1)
    || substr(v_sequence, 2, 1);
end;
$$;

create or replace function public.next_ticket_case_number()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_case_date date := timezone('America/Chihuahua', now())::date;
  v_daily_number smallint;
begin
  insert into public.ticket_case_daily_counters (case_date, last_value)
  values (v_case_date, 1)
  on conflict (case_date) do update
    set last_value = ticket_case_daily_counters.last_value + 1
    where ticket_case_daily_counters.last_value < 99
  returning last_value into v_daily_number;

  if v_daily_number is null then
    raise exception 'Se alcanzo el limite de 99 casos para el dia %', v_case_date;
  end if;

  return public.format_ticket_case_number(v_case_date, v_daily_number);
end;
$$;

alter table public.tickets
  alter column numero_caso set default public.next_ticket_case_number();

with numbered_cases as (
  select
    id,
    timezone('America/Chihuahua', creado_en)::date as case_date,
    row_number() over (
      partition by timezone('America/Chihuahua', creado_en)::date
      order by creado_en, id
    )::integer as daily_number
  from public.tickets
  where numero_caso is null
)
update public.tickets as ticket
set numero_caso = public.format_ticket_case_number(numbered.case_date, numbered.daily_number)
from numbered_cases as numbered
where ticket.id = numbered.id;

insert into public.ticket_case_daily_counters (case_date, last_value)
select
  timezone('America/Chihuahua', creado_en)::date,
  count(*)::smallint
from public.tickets
group by timezone('America/Chihuahua', creado_en)::date
on conflict (case_date) do update
set last_value = greatest(ticket_case_daily_counters.last_value, excluded.last_value);

alter table public.tickets
  alter column numero_caso set not null;

create unique index if not exists tickets_numero_caso_key
  on public.tickets (upper(numero_caso));

create index if not exists tickets_equipment_created_idx
  on public.tickets (public.normalize_equipment_serial(numero_serie_equipo), creado_en desc);

create table if not exists public.ticket_bitacora (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  numero_serie_equipo text,
  tipo text not null default 'avance' check (
    tipo in ('avance', 'diagnostico', 'llamada', 'visita', 'pieza', 'escalamiento', 'nota')
  ),
  detalle text not null check (char_length(btrim(detalle)) between 2 and 4000),
  estado_resultante public.ticket_status,
  visible_cliente boolean not null default true,
  creado_por uuid references public.profiles(id) on delete set null,
  creado_en timestamptz not null default now()
);

alter table public.ticket_bitacora enable row level security;

create index if not exists ticket_bitacora_ticket_created_idx
  on public.ticket_bitacora (ticket_id, creado_en desc);

create index if not exists ticket_bitacora_equipment_created_idx
  on public.ticket_bitacora (public.normalize_equipment_serial(numero_serie_equipo), creado_en desc);

drop policy if exists "Staff consulta bitacora de tickets" on public.ticket_bitacora;
create policy "Staff consulta bitacora de tickets"
on public.ticket_bitacora
for select
to authenticated
using (
  (select public.is_staff())
  or exists (
    select 1 from public.tickets
    where tickets.id = ticket_bitacora.ticket_id
      and tickets.user_id = (select auth.uid())
  )
);

drop policy if exists "Staff registra bitacora de tickets" on public.ticket_bitacora;
create policy "Staff registra bitacora de tickets"
on public.ticket_bitacora
for insert
to authenticated
with check (
  (select public.is_staff())
  and creado_por = (select auth.uid())
);

create or replace function public.sync_ticket_case_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tickets
  set
    estado = coalesce(new.estado_resultante, estado),
    actualizado_en = new.creado_en
  where id = new.ticket_id;
  return new;
end;
$$;

drop trigger if exists trg_sync_ticket_case_activity on public.ticket_bitacora;
create trigger trg_sync_ticket_case_activity
after insert on public.ticket_bitacora
for each row execute function public.sync_ticket_case_activity();

-- Alta publica controlada: devuelve un folio corto sin abrir lectura anonima
-- directa sobre la tabla de tickets.
create or replace function public.create_public_support_case(
  p_support_type text,
  p_serial text,
  p_contact_name text,
  p_phone text,
  p_description text
)
returns table (numero_caso text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case_number text;
begin
  if btrim(coalesce(p_support_type, '')) not in ('Ingeniero', 'Químico') then
    raise exception 'Tipo de soporte no valido';
  end if;
  if char_length(btrim(coalesce(p_serial, ''))) < 2
     or char_length(btrim(coalesce(p_contact_name, ''))) < 2
     or coalesce(p_phone, '') !~ '^[0-9]{10}$'
     or char_length(btrim(coalesce(p_description, ''))) < 5 then
    raise exception 'Datos del caso incompletos';
  end if;

  insert into public.tickets (
    user_id, asunto, descripcion, numero_serie_equipo,
    nombre_cliente_guest, telefono_cliente_guest, estado
  ) values (
    null,
    'Soporte ' || btrim(p_support_type) || ': Reporte en equipo ' || btrim(p_serial),
    btrim(p_description), btrim(p_serial), btrim(p_contact_name), p_phone, 'abierto'
  )
  returning tickets.numero_caso into v_case_number;

  return query select v_case_number;
end;
$$;

grant execute on function public.create_public_support_case(text, text, text, text, text) to anon, authenticated;

-- Consulta publica minima. El telefono funciona como segundo factor y nunca se
-- devuelve; tampoco se expone el historial tecnico completo del equipo.
create or replace function public.track_public_support_case(
  p_case_number text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets%rowtype;
begin
  select * into v_ticket
  from public.tickets
  where upper(numero_caso) = upper(btrim(coalesce(p_case_number, '')))
    and regexp_replace(coalesce(telefono_cliente_guest, ''), '\D', '', 'g') = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
  limit 1;

  if v_ticket.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'numero_caso', v_ticket.numero_caso,
    'asunto', v_ticket.asunto,
    'estado', v_ticket.estado,
    'numero_serie_equipo', v_ticket.numero_serie_equipo,
    'creado_en', v_ticket.creado_en,
    'actualizado_en', v_ticket.actualizado_en,
    'bitacora', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tipo', b.tipo,
        'detalle', b.detalle,
        'estado_resultante', b.estado_resultante,
        'creado_en', b.creado_en
      ) order by b.creado_en desc)
      from public.ticket_bitacora b
      where b.ticket_id = v_ticket.id and b.visible_cliente
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.track_public_support_case(text, text) to anon, authenticated;
