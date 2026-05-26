create or replace function public.normalize_location_label(value text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(
      regexp_replace(
        translate(
          lower(coalesce(value, '')),
          'áàäâãåéèëêíìïîóòöôõúùüûñç',
          'aaaaaaeeeeiiiiooooouuuunc'
        ),
        '\s+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

create or replace function public.build_equipment_locality_query(
  p_city text,
  p_municipality text,
  p_state text
)
returns text
language sql
immutable
as $$
  with parts as (
    select
      nullif(trim(coalesce(p_city, '')), '') as city_label,
      nullif(trim(coalesce(p_municipality, '')), '') as municipality_label,
      nullif(trim(coalesce(p_state, '')), '') as state_label
  )
  select concat_ws(
    ', ',
    coalesce(city_label, municipality_label),
    state_label,
    'Mexico'
  )
  from parts;
$$;

create or replace function public.build_equipment_locality_cache_key(
  p_city text,
  p_municipality text,
  p_state text
)
returns text
language sql
immutable
as $$
  select concat_ws(
    '|',
    public.normalize_location_label(coalesce(nullif(trim(coalesce(p_city, '')), ''), nullif(trim(coalesce(p_municipality, '')), ''))),
    public.normalize_location_label(p_state)
  );
$$;

create table if not exists public.equipment_location_geocodes (
  cache_key text primary key,
  query text not null,
  precision text not null,
  latitude double precision not null,
  longitude double precision not null,
  boundingbox jsonb not null default '[]'::jsonb,
  display_name text,
  provider text not null default 'nominatim',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists equipment_location_geocodes_precision_idx
  on public.equipment_location_geocodes (precision);

create index if not exists equipment_location_geocodes_updated_at_idx
  on public.equipment_location_geocodes (updated_at desc);

alter table public.equipment_location_geocodes enable row level security;

drop policy if exists "anon_select_equipment_location_geocodes" on public.equipment_location_geocodes;
create policy "anon_select_equipment_location_geocodes"
on public.equipment_location_geocodes
for select
to anon
using (true);

drop policy if exists "authenticated_select_equipment_location_geocodes" on public.equipment_location_geocodes;
create policy "authenticated_select_equipment_location_geocodes"
on public.equipment_location_geocodes
for select
to authenticated
using (true);

create or replace view public.v_equipment_map_locations
with (security_invoker = true)
as
select
  eq.id as equipment_id,
  eq.numero_serie,
  eq.estado,
  eq.ciudad,
  eq.municipio,
  eq.direccion,
  eq.codigo_postal,
  public.build_equipment_locality_query(eq.ciudad, eq.municipio, eq.estado) as locality_query,
  public.build_equipment_locality_cache_key(eq.ciudad, eq.municipio, eq.estado) as locality_cache_key,
  geo.latitude as geo_latitude,
  geo.longitude as geo_longitude,
  geo.boundingbox as geo_boundingbox,
  geo.precision as geo_precision,
  geo.display_name as geo_display_name,
  geo.provider as geo_provider,
  geo.updated_at as geo_updated_at
from public.equipos eq
left join public.equipment_location_geocodes geo
  on geo.cache_key = public.build_equipment_locality_cache_key(eq.ciudad, eq.municipio, eq.estado);
