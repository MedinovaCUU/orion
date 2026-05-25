-- Migración: Historial de Servicios, Catálogos de Averías, Soluciones y Refacciones

CREATE TABLE IF NOT EXISTS public.averias_catalogo (
    cda TEXT PRIMARY KEY,
    tipo_averia TEXT NOT NULL,
    detalle_averia TEXT NOT NULL,
    cta TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.soluciones_catalogo (
    cds TEXT PRIMARY KEY,
    tipo_solucion TEXT NOT NULL,
    detalle_solucion TEXT NOT NULL,
    cts TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.refacciones_catalogo (
    codigo_refaccion TEXT PRIMARY KEY,
    equipo TEXT,
    nombre TEXT,
    desc_breve TEXT,
    pagina_manual TEXT,
    descripcion TEXT
);

CREATE TABLE IF NOT EXISTS public.servicios_historial (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
    id_legacy INT,
    no_serie TEXT,
    cda TEXT,
    cds TEXT,
    motivo TEXT,
    tecnico_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    fecha_servicio DATE DEFAULT CURRENT_DATE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.servicios_refacciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    servicio_id UUID REFERENCES public.servicios_historial(id) ON DELETE CASCADE,
    codigo_refaccion TEXT REFERENCES public.refacciones_catalogo(codigo_refaccion) ON DELETE CASCADE,
    cantidad INT NOT NULL DEFAULT 1
);

-- Habilitar RLS
ALTER TABLE public.averias_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soluciones_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refacciones_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicios_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicios_refacciones ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura pública (todo el staff puede leer catálogos)
CREATE POLICY "Lectura pública de catálogos averías" ON public.averias_catalogo FOR SELECT USING (true);
CREATE POLICY "Lectura pública de catálogos soluciones" ON public.soluciones_catalogo FOR SELECT USING (true);
CREATE POLICY "Lectura pública de catálogos refacciones" ON public.refacciones_catalogo FOR SELECT USING (true);

-- Técnicos y Admins pueden ver y crear históricos de servicio
CREATE POLICY "Lectura de servicios historial" ON public.servicios_historial FOR SELECT USING (true);
CREATE POLICY "Inserción de servicios historial" ON public.servicios_historial FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Lectura de refacciones usadas" ON public.servicios_refacciones FOR SELECT USING (true);
CREATE POLICY "Inserción de refacciones usadas" ON public.servicios_refacciones FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
