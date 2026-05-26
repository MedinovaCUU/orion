drop policy if exists "authenticated_select_monitoreo_errores_equipos" on public.monitoreo_errores_equipos;
create policy "authenticated_select_monitoreo_errores_equipos"
on public.monitoreo_errores_equipos
for select
to authenticated
using (true);

drop policy if exists "authenticated_select_consumo_reactivos_hora" on public.consumo_reactivos_hora;
create policy "authenticated_select_consumo_reactivos_hora"
on public.consumo_reactivos_hora
for select
to authenticated
using (true);

drop policy if exists "authenticated_select_consumo_rotores_mensual" on public.consumo_rotores_mensual;
create policy "authenticated_select_consumo_rotores_mensual"
on public.consumo_rotores_mensual
for select
to authenticated
using (true);

drop policy if exists "authenticated_select_estado_insumos_equipo_actual" on public.estado_insumos_equipo_actual;
create policy "authenticated_select_estado_insumos_equipo_actual"
on public.estado_insumos_equipo_actual
for select
to authenticated
using (true);
