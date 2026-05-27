begin;

do $$
declare
  pair record;
  override_x double precision;
  override_y double precision;
  override_updated_at timestamptz;
begin
  for pair in
    select *
    from (
      values
        ('showroom-a15-831055847'::text, '100145'::text),
        ('showroom-ba200-832001973'::text, '100434'::text)
    ) as pairs(old_id, new_id)
  loop
    if not exists (select 1 from public.equipos where id = pair.old_id) then
      continue;
    end if;

    if exists (select 1 from public.equipos where id = pair.new_id) then
      raise exception 'Cannot normalize showroom id %, target id % already exists', pair.old_id, pair.new_id;
    end if;

    if exists (select 1 from public.client_service_units where equipment_id = pair.old_id)
      or exists (select 1 from public.service_reports where equipment_id = pair.old_id)
      or exists (select 1 from public.service_report_version_alerts where equipment_id = pair.old_id)
      or exists (select 1 from public.refacciones_solicitudes where equipo_id = pair.old_id) then
      raise exception 'Cannot normalize showroom id %, it still has dependent references outside map overrides', pair.old_id;
    end if;

    select x_percent, y_percent, updated_at
    into override_x, override_y, override_updated_at
    from public.equipment_map_manual_overrides
    where equipment_id = pair.old_id;

    delete from public.equipment_map_manual_overrides
    where equipment_id = pair.old_id;

    update public.equipos
    set id = pair.new_id
    where id = pair.old_id;

    if override_x is not null and override_y is not null then
      insert into public.equipment_map_manual_overrides (
        equipment_id,
        x_percent,
        y_percent,
        updated_at
      )
      values (
        pair.new_id,
        override_x,
        override_y,
        override_updated_at
      );
    end if;

    update public.equipos_dedup_archive
    set
      keep_id = pair.new_id,
      keep_row = jsonb_set(keep_row, '{id}', to_jsonb(pair.new_id), true)
    where keep_id = pair.old_id;

    override_x := null;
    override_y := null;
    override_updated_at := null;
  end loop;
end;
$$;

commit;
