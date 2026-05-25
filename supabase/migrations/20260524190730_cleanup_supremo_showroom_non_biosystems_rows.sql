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
    RETURN;
  END IF;

  UPDATE public.equipos AS eq
  SET
    supremo_id = NULL,
    supremo_alias = NULL,
    supremo_enabled = false
  FROM (
    VALUES
      ('831055847', '958113330', 'A15 Showroom'),
      ('832001973', '909548874', 'BA200 Showroom'),
      ('834001902', '792529172', 'BA400 Showroom')
  ) AS src(numero_serie, supremo_id, supremo_alias)
  WHERE eq.numero_serie = src.numero_serie
    AND eq.supremo_id = src.supremo_id
    AND eq.supremo_alias = src.supremo_alias
    AND COALESCE(eq.cliente_id, -1) <> biosystems_client_id;
END;
$$;
