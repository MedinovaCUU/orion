-- Migración: Tabla de Precios Secretos

CREATE TABLE IF NOT EXISTS public.secret (
    codigo TEXT PRIMARY KEY,
    descripcion TEXT,
    precio NUMERIC NOT NULL DEFAULT 0.00,
    creado_en TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar los candados de seguridad en el núcleo de la base de datos
ALTER TABLE public.secret ENABLE ROW LEVEL SECURITY;

-- Política de lectura y escritura restringida exclusivamente al correo designado
CREATE POLICY "acceso_exclusivo_rmontanez" ON public.secret
FOR ALL USING (
   auth.jwt() ->> 'email' = 'rmontanez@biosystems.com.mx'
);
