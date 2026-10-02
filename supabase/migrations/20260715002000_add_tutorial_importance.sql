alter table public.tutoriales
  add column if not exists importancia text not null default 'basico';

alter table public.tutoriales
  drop constraint if exists tutoriales_importancia_check;

alter table public.tutoriales
  add constraint tutoriales_importancia_check
  check (importancia in ('basico', 'medio', 'alto', 'critico'));
