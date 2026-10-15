-- Causas de los cierres fuera de plazo (laboratorio de tiempos de los indicadores del personal).
-- Para los tickets que el navegador marca fuera de plazo devuelve lo que sirve para explicarlos:
-- códigos de avería con su familia del catálogo (bitácora, historial ligado al ticket o por vínculo de
-- visita, reportes de servicio), si estuvo en espera de piezas y el texto de la falla (asunto y
-- descripción sin el pie de importación de Biosisa). La clasificación final se hace en el navegador.

create function public.get_ticket_late_causes(p_ticket_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Los indicadores del personal son exclusivos para administradores'; end if;
 if coalesce(cardinality(p_ticket_ids), 0) > 3000 then raise exception 'Demasiados tickets en una consulta'; end if;
 return coalesce((
  with ids as (select distinct unnest(coalesce(p_ticket_ids, '{}'::uuid[])) as ticket_id),
  raw_codes as (
   select b.ticket_id, upper(btrim(b.codigo_averia)) as code from public.ticket_bitacora b join ids on ids.ticket_id = b.ticket_id
   union all select h.ticket_id, upper(btrim(h.cda)) from public.servicios_historial h join ids on ids.ticket_id = h.ticket_id
   union all select r.service_ticket_id, upper(btrim(r.diagnostic_code)) from public.service_reports r join ids on ids.ticket_id = r.service_ticket_id
   union all select k.ticket_id, upper(btrim(h.cda)) from public.ticket_service_links k join ids on ids.ticket_id = k.ticket_id join public.servicios_historial h on h.id = k.servicio_id
  ),
  codes as (
   select x.ticket_id, jsonb_agg(jsonb_build_object('code', x.code, 'family', c.catalog_type, 'label', c.catalog_detail) order by x.code) as codes
   from (select distinct ticket_id, code from raw_codes where code is not null and code <> '' and code !~ '^AX') x
   left join lateral (select s.catalog_type, s.catalog_detail from public.catalogo_servicio s where s.catalog_kind = 'averia' and upper(s.catalog_code) = x.code limit 1) c on true
   group by x.ticket_id
  )
  select jsonb_agg(jsonb_build_object(
    'ticket_id', t.id,
    'codes', coalesce(codes.codes, '[]'::jsonb),
    'waited_parts', exists (select 1 from public.ticket_state_history s where s.ticket_id = t.id and s.estado::text = 'pendiente_piezas'),
    'text', left(btrim(concat_ws(' · ', nullif(btrim(t.asunto), ''),
      nullif(btrim(regexp_replace(split_part(coalesce(t.descripcion, ''), '[Importado de Biosisa]', 1), '\s+', ' ', 'g')), ''))), 600)))
  from public.tickets t join ids on ids.ticket_id = t.id left join codes on codes.ticket_id = t.id
 ), '[]'::jsonb);
end; $$;

revoke all on function public.get_ticket_late_causes(uuid[]) from public, anon;
grant execute on function public.get_ticket_late_causes(uuid[]) to authenticated;
