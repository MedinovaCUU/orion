DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'equipos'
      AND column_name = 'Software'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'equipos'
        AND column_name = 'software'
    ) THEN
      EXECUTE '
        UPDATE public.equipos
        SET software = COALESCE(software, "Software")
        WHERE "Software" IS NOT NULL
      ';
      EXECUTE 'ALTER TABLE public.equipos DROP COLUMN "Software"';
    ELSE
      EXECUTE 'ALTER TABLE public.equipos RENAME COLUMN "Software" TO software';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'equipos'
      AND column_name = 'software'
  ) THEN
    EXECUTE 'ALTER TABLE public.equipos ADD COLUMN software TEXT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'equipos'
      AND column_name = 'Firmware'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'equipos'
        AND column_name = 'firmware'
    ) THEN
      EXECUTE '
        UPDATE public.equipos
        SET firmware = COALESCE(firmware, "Firmware")
        WHERE "Firmware" IS NOT NULL
      ';
      EXECUTE 'ALTER TABLE public.equipos DROP COLUMN "Firmware"';
    ELSE
      EXECUTE 'ALTER TABLE public.equipos RENAME COLUMN "Firmware" TO firmware';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'equipos'
      AND column_name = 'firmware'
  ) THEN
    EXECUTE 'ALTER TABLE public.equipos ADD COLUMN firmware TEXT';
  END IF;
END;
$$;
