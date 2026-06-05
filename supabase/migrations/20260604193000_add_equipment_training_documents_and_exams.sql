alter table public.equipos
  add column if not exists doc_instalacion boolean default false,
  add column if not exists doc_instalacion_path text,
  add column if not exists doc_instalacion_filename text,
  add column if not exists doc_instalacion_uploaded_at timestamptz,
  add column if not exists doc_instalacion_uploaded_by uuid references public.profiles(id) on delete set null,
  add column if not exists doc_capacitacion boolean default false,
  add column if not exists doc_capacitacion_path text,
  add column if not exists doc_capacitacion_filename text,
  add column if not exists doc_capacitacion_uploaded_at timestamptz,
  add column if not exists doc_capacitacion_uploaded_by uuid references public.profiles(id) on delete set null;

create table if not exists public.equipo_capacitacion_examenes (
  id uuid primary key default gen_random_uuid(),
  equipo_id text not null references public.equipos(id) on delete cascade,
  numero_serie text not null,
  modelo text,
  participant_name text not null,
  participant_role text,
  participant_company text,
  score integer not null,
  total_questions integer not null,
  passed boolean not null default false,
  question_bank_code text not null,
  answers jsonb not null default '[]'::jsonb,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists equipo_capacitacion_examenes_equipo_id_created_at_idx
  on public.equipo_capacitacion_examenes (equipo_id, created_at desc);

alter table public.equipo_capacitacion_examenes enable row level security;

grant select, insert on public.equipo_capacitacion_examenes to authenticated;

create policy "Lectura examenes capacitacion admin tecnico"
on public.equipo_capacitacion_examenes
for select
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.rol in ('admin', 'tecnico')
  )
);

create policy "Insercion examenes capacitacion admin tecnico"
on public.equipo_capacitacion_examenes
for insert
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.rol in ('admin', 'tecnico')
  )
);
