-- Creación de la tabla de clientes públicos
CREATE TABLE public.clientes (
    id SERIAL PRIMARY KEY,
    id_original TEXT UNIQUE,
    razon_social TEXT NOT NULL,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lectura pública de clientes para referencias" ON public.clientes FOR SELECT USING (true);
CREATE POLICY "Admins gestionan clientes" ON public.clientes FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND rol IN ('admin', 'tecnico'))
);

-- Creación de tabla de equipos
CREATE TABLE public.equipos (
    id TEXT PRIMARY KEY,
    numero_serie TEXT NOT NULL,
    modelo TEXT,
    cliente_id INT REFERENCES public.clientes(id) ON DELETE CASCADE,
    fecha_inicio DATE,
    termino_garantia DATE,
    empleado_asignado UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    doc_asignacion BOOLEAN DEFAULT false,
    fecha_fin DATE,
    empleado_retira UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    doc_terminacion BOOLEAN DEFAULT false,
    creado_en TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.equipos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lectura pública de equipos para poder levantar tickets por numero de serie" 
ON public.equipos FOR SELECT USING (true);
CREATE POLICY "Admins gestionan equipos" 
ON public.equipos FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND rol IN ('admin', 'tecnico'))
);

-- Modificar tabla de tickets para permitir tickets sin cuenta (huéspedes)
ALTER TABLE public.tickets ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.tickets ADD COLUMN numero_serie_equipo TEXT;
ALTER TABLE public.tickets ADD COLUMN nombre_cliente_guest TEXT;
ALTER TABLE public.tickets ADD COLUMN telefono_cliente_guest TEXT;
ALTER TABLE public.tickets ADD COLUMN email_cliente_guest TEXT;

CREATE POLICY "Cualquiera puede crear tickets anonimamente" 
ON public.tickets FOR INSERT WITH CHECK (true);
