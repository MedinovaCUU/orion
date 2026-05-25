DO $$
DECLARE
  biosystems_client_id INT;
BEGIN
  SELECT id
  INTO biosystems_client_id
  FROM public.clientes
  WHERE lower(trim(razon_social)) = 'biosystems'
  ORDER BY id
  LIMIT 1;

  IF biosystems_client_id IS NULL THEN
    INSERT INTO public.clientes (id_original, razon_social)
    VALUES ('SHOWROOM-BIOSYSTEMS', 'Biosystems')
    RETURNING id INTO biosystems_client_id;
  END IF;

  UPDATE public.equipos AS eq
  SET
    modelo = COALESCE(eq.modelo, src.modelo),
    cliente_id = COALESCE(eq.cliente_id, biosystems_client_id),
    pais = COALESCE(eq.pais, src.pais),
    estado = COALESCE(eq.estado, src.estado),
    ciudad = COALESCE(eq.ciudad, src.ciudad),
    municipio = COALESCE(eq.municipio, src.municipio),
    supremo_id = src.supremo_id,
    supremo_alias = src.supremo_alias,
    supremo_enabled = true
  FROM (
    VALUES
      ('showroom-a15-831055847', '831055847', 'A15', 'Mexico', 'Jalisco', 'Guadalajara', 'Guadalajara', '958113330', 'A15 Showroom'),
      ('showroom-ba200-832001973', '832001973', 'BA200', 'Mexico', 'Jalisco', 'Guadalajara', 'Guadalajara', '909548874', 'BA200 Showroom'),
      ('showroom-ba400-834001902', '834001902', 'BA400', 'Mexico', 'Jalisco', 'Guadalajara', 'Guadalajara', '792529172', 'BA400 Showroom')
  ) AS src(id, numero_serie, modelo, pais, estado, ciudad, municipio, supremo_id, supremo_alias)
  WHERE eq.numero_serie = src.numero_serie
    AND eq.cliente_id = biosystems_client_id;

  INSERT INTO public.equipos (
    id,
    numero_serie,
    modelo,
    cliente_id,
    pais,
    estado,
    ciudad,
    municipio,
    supremo_id,
    supremo_alias,
    supremo_enabled
  )
  SELECT
    src.id,
    src.numero_serie,
    src.modelo,
    biosystems_client_id,
    src.pais,
    src.estado,
    src.ciudad,
    src.municipio,
    src.supremo_id,
    src.supremo_alias,
    true
  FROM (
    VALUES
      ('showroom-a15-831055847', '831055847', 'A15', 'Mexico', 'Jalisco', 'Guadalajara', 'Guadalajara', '958113330', 'A15 Showroom'),
      ('showroom-ba200-832001973', '832001973', 'BA200', 'Mexico', 'Jalisco', 'Guadalajara', 'Guadalajara', '909548874', 'BA200 Showroom'),
      ('showroom-ba400-834001902', '834001902', 'BA400', 'Mexico', 'Jalisco', 'Guadalajara', 'Guadalajara', '792529172', 'BA400 Showroom')
  ) AS src(id, numero_serie, modelo, pais, estado, ciudad, municipio, supremo_id, supremo_alias)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.equipos eq
    WHERE eq.numero_serie = src.numero_serie
      AND eq.cliente_id = biosystems_client_id
  );
END;
$$;
