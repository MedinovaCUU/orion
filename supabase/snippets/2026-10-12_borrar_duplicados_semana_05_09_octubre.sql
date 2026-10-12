-- Borra las 5 copias abiertas de la semana 05 AL 09 OCTUBRE que el boton Sincronizar
-- volvio a crear el 2026-10-11 23:42 (lote 1791783733454). Cada una tiene su gemela
-- cerrada (mismo asunto y serie) del cierre administrativo del 2026-10-09.
-- Correr con: supabase db query --linked -f supabase/snippets/2026-10-12_borrar_duplicados_semana_05_09_octubre.sql
do $$
declare
  dup_ids uuid[];
begin
  select array_agg(d.id) into dup_ids
  from public.tickets d
  where d.descripcion like '%1791783733454%'
    and d.descripcion like '%"fecha_tentativa":"05 AL 09 OCTUBRE"%'
    and d.estado <> 'cerrado'
    and exists (
      select 1 from public.tickets t
      where t.id <> d.id and t.estado = 'cerrado'
        and t.asunto = d.asunto
        and coalesce(t.numero_serie_equipo, '') = coalesce(d.numero_serie_equipo, '')
        and t.descripcion like '%"fecha_tentativa":"05 AL 09 OCTUBRE"%'
    );

  if coalesce(array_length(dup_ids, 1), 0) <> 5 then
    raise exception 'Se esperaban 5 duplicados, se encontraron %', coalesce(array_length(dup_ids, 1), 0);
  end if;

  if exists (select 1 from public.ticket_service_events where ticket_id = any(dup_ids))
     or exists (select 1 from public.service_reports where service_ticket_id = any(dup_ids))
     or exists (select 1 from public.travel_requests where service_ticket_id = any(dup_ids))
     or exists (select 1 from public.servicios where ticket_id = any(dup_ids)) then
    raise exception 'Algun duplicado ya tiene informacion ligada; no se borra nada';
  end if;

  delete from public.tickets where id = any(dup_ids);
  raise notice 'Borrados % duplicados', array_length(dup_ids, 1);
end $$;
