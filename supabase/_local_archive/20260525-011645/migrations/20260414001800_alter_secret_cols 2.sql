-- Alterar tabla secreta para borrar descripcion y agregar esquemas de financiamiento e IVA

ALTER TABLE public.secret DROP COLUMN descripcion;

ALTER TABLE public.secret RENAME COLUMN precio TO precio_contado_sin_iva;
ALTER TABLE public.secret ADD COLUMN precio_contado_con_iva NUMERIC(15,2);

ALTER TABLE public.secret ADD COLUMN precio_12_meses_sin_iva NUMERIC(15,2);
ALTER TABLE public.secret ADD COLUMN precio_12_meses_con_iva NUMERIC(15,2);

ALTER TABLE public.secret ADD COLUMN precio_18_meses_sin_iva NUMERIC(15,2);
ALTER TABLE public.secret ADD COLUMN precio_18_meses_con_iva NUMERIC(15,2);
