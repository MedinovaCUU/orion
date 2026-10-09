-- Cierre administrativo de la planeación anterior al 13 de octubre de 2026.
-- Ejecutar en el SQL editor de Supabase (como postgres). Reproduce el mismo cierre que la
-- ingesta SAP: una entrada de bitácora con estado resultante "cerrado" (el trigger
-- sync_ticket_case_activity cierra el ticket y capture_ticket_closure registra el evento de
-- cierre), clasificada como cierre administrativo para no contaminar el cumplimiento técnico.
--
-- Fecha planeada = week_end, scheduled_date o week_start (ISO) y, si faltan, el día y mes
-- finales de la etiqueta fecha_tentativa ("29 AL 04 JULIO") con el año de creación del ticket.
-- Tickets sin fecha interpretable se conservan y se listan al final.

-- 1) Vista previa (solo lectura): qué se cerraría y qué se conservaría.
with planning as (
  select t.id, t.numero_caso, t.asunto, t.creado_en, p.meta->>'fecha_tentativa' as semana,
    coalesce(public.try_parse_iso_date(p.meta->>'week_end'), public.try_parse_iso_date(p.meta->>'scheduled_date'), public.try_parse_iso_date(p.meta->>'week_start')) as fecha_iso,
    (regexp_match(upper(translate(coalesce(p.meta->>'fecha_tentativa',''),'ÁÉÍÓÚáéíóú','AEIOUaeiou')), 'AL\s+(\d{1,2})\s+([A-Z]+)'))[1]::int as dia_fin,
    (regexp_match(upper(translate(coalesce(p.meta->>'fecha_tentativa',''),'ÁÉÍÓÚáéíóú','AEIOUaeiou')), 'AL\s+(\d{1,2})\s+([A-Z]+)'))[2] as mes_fin
  from public.tickets t
  cross join lateral (select public.try_parse_planning_metadata(t.descripcion) as meta) p
  where t.estado <> 'cerrado' and position('[METADATA_PLANEACION]' in coalesce(t.descripcion,'')) > 0
), meses as (
  select *, extract(year from creado_en)::int as anio, case mes_fin
      when 'ENERO' then 1 when 'ENE' then 1 when 'FEBRERO' then 2 when 'FEB' then 2 when 'MARZO' then 3 when 'MAR' then 3
      when 'ABRIL' then 4 when 'ABR' then 4 when 'MAYO' then 5 when 'MAY' then 5 when 'JUNIO' then 6 when 'JUN' then 6
      when 'JULIO' then 7 when 'JUL' then 7 when 'AGOSTO' then 8 when 'AGO' then 8 when 'SEPTIEMBRE' then 9 when 'SETIEMBRE' then 9 when 'SEP' then 9
      when 'OCTUBRE' then 10 when 'OCT' then 10 when 'NOVIEMBRE' then 11 when 'NOV' then 11 when 'DICIEMBRE' then 12 when 'DIC' then 12 end as mes_num
  from planning
), fechas as (
  -- Un día inexistente ("31 FEBRERO") deja la fecha nula y el ticket se conserva.
  select *, coalesce(fecha_iso, case when mes_num is not null
      and dia_fin between 1 and extract(day from (make_date(anio, mes_num, 1) + interval '1 month' - interval '1 day'))::int
      then make_date(anio, mes_num, dia_fin) end) as fecha_fin
  from meses
)
select case when fecha_fin is null then 'SIN FECHA (se conserva)' when fecha_fin < date '2026-10-13' then 'SE CIERRA' else 'SE CONSERVA' end as accion,
  semana, min(fecha_fin) as fecha_fin, count(*) as tickets
from fechas group by 1, 2 order by 1, 3 nulls last;

-- 2) Cierre (ejecutar solo después de revisar la vista previa).
do $$
declare
  v_cutoff constant date := date '2026-10-13';
  v_row record; v_fecha date; v_mes int; v_cerradas int := 0; v_conservadas int := 0;
begin
  for v_row in
    select t.id, t.numero_caso, t.numero_serie_equipo, extract(year from t.creado_en)::int as anio,
      p.meta->>'fecha_tentativa' as semana,
      coalesce(public.try_parse_iso_date(p.meta->>'week_end'), public.try_parse_iso_date(p.meta->>'scheduled_date'), public.try_parse_iso_date(p.meta->>'week_start')) as fecha_iso,
      (regexp_match(upper(translate(coalesce(p.meta->>'fecha_tentativa',''),'ÁÉÍÓÚáéíóú','AEIOUaeiou')), 'AL\s+(\d{1,2})\s+([A-Z]+)'))[1]::int as dia_fin,
      (regexp_match(upper(translate(coalesce(p.meta->>'fecha_tentativa',''),'ÁÉÍÓÚáéíóú','AEIOUaeiou')), 'AL\s+(\d{1,2})\s+([A-Z]+)'))[2] as mes_fin
    from public.tickets t
    cross join lateral (select public.try_parse_planning_metadata(t.descripcion) as meta) p
    where t.estado <> 'cerrado' and position('[METADATA_PLANEACION]' in coalesce(t.descripcion,'')) > 0
    order by t.creado_en, t.id
  loop
    v_fecha := v_row.fecha_iso;
    if v_fecha is null and v_row.dia_fin is not null then
      v_mes := case v_row.mes_fin
        when 'ENERO' then 1 when 'ENE' then 1 when 'FEBRERO' then 2 when 'FEB' then 2 when 'MARZO' then 3 when 'MAR' then 3
        when 'ABRIL' then 4 when 'ABR' then 4 when 'MAYO' then 5 when 'MAY' then 5 when 'JUNIO' then 6 when 'JUN' then 6
        when 'JULIO' then 7 when 'JUL' then 7 when 'AGOSTO' then 8 when 'AGO' then 8 when 'SEPTIEMBRE' then 9 when 'SETIEMBRE' then 9 when 'SEP' then 9
        when 'OCTUBRE' then 10 when 'OCT' then 10 when 'NOVIEMBRE' then 11 when 'NOV' then 11 when 'DICIEMBRE' then 12 when 'DIC' then 12 end;
      begin
        if v_mes is not null then v_fecha := make_date(v_row.anio, v_mes, v_row.dia_fin); end if;
      exception when others then v_fecha := null;
      end;
    end if;
    if v_fecha is null or v_fecha >= v_cutoff then
      v_conservadas := v_conservadas + 1;
      continue;
    end if;
    insert into public.ticket_bitacora (ticket_id, numero_serie_equipo, tipo, detalle, estado_resultante, visible_cliente, creado_por)
    values (v_row.id, v_row.numero_serie_equipo, 'nota',
      format('Cierre administrativo de planeación: semana %s (fin %s), anterior al %s. Depuración del tablero.',
        coalesce(v_row.semana, 'sin semana'), to_char(v_fecha, 'DD/MM/YYYY'), to_char(v_cutoff, 'DD/MM/YYYY')),
      'cerrado', false, null);
    update public.ticket_service_events
    set closure_reason = 'administrativo', detail = 'Cierre administrativo de planeación anterior al ' || to_char(v_cutoff, 'DD/MM/YYYY')
    where ticket_id = v_row.id and kind = 'cierre' and closure_reason is null;
    v_cerradas := v_cerradas + 1;
  end loop;
  raise notice 'Planeaciones cerradas: %. Conservadas (fecha >= % o sin fecha): %.', v_cerradas, v_cutoff, v_conservadas;
end $$;
