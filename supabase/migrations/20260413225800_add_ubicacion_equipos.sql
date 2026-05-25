-- Añadir campos de ubicación a la tabla equipos

ALTER TABLE public.equipos ADD COLUMN pais TEXT;
ALTER TABLE public.equipos ADD COLUMN estado TEXT;
ALTER TABLE public.equipos ADD COLUMN ciudad TEXT;
ALTER TABLE public.equipos ADD COLUMN municipio TEXT;
ALTER TABLE public.equipos ADD COLUMN colonia TEXT;
ALTER TABLE public.equipos ADD COLUMN direccion TEXT;
ALTER TABLE public.equipos ADD COLUMN codigo_postal TEXT;
