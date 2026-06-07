alter table if exists public.estado_errores_equipo_actual
  add column if not exists codigo_estado text,
  add column if not exists descripcion_estado text;

update public.estado_errores_equipo_actual
set
  codigo_estado = case
    when estado_actual = 'ok' then 'OK_000'
    when coalesce(array_length(codigos_error, 1), 0) > 1 then 'MULTI_ERROR'
    else coalesce(nullif(error_principal_codigo, ''), codigo_estado)
  end,
  descripcion_estado = case
    when estado_actual = 'ok' then 'Sin errores activos detectados por monitor'
    when coalesce(array_length(codigos_error, 1), 0) > 1 then 'Multiples errores activos detectados por monitor'
    else coalesce(nullif(error_principal_descripcion, ''), descripcion_estado, 'Error activo detectado por monitor')
  end
where codigo_estado is null
   or descripcion_estado is null;
