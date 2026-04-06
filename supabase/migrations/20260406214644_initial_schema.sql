-- 1. Enum para roles
CREATE TYPE user_role AS ENUM ('admin', 'tecnico', 'cliente');

-- 2. Tabla profiles que extiende auth.users
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    nombre_completo TEXT,
    rol user_role DEFAULT 'cliente'::user_role,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS en profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Perfiles públicos para lectura" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Un usuario puede actualizar su propio perfil" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 3. Tabla tickets
CREATE TYPE ticket_status AS ENUM ('abierto', 'en_progreso', 'cerrado');

CREATE TABLE public.tickets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    asunto TEXT NOT NULL,
    descripcion TEXT,
    estado ticket_status DEFAULT 'abierto'::ticket_status,
    creado_en TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Los usuarios pueden ver sus propios tickets y los admins/ti pueden ver todos" 
ON public.tickets FOR SELECT 
USING (
  auth.uid() = user_id OR 
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND rol IN ('admin', 'tecnico'))
);

CREATE POLICY "Los usuarios pueden crear tickets" 
ON public.tickets FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins y tecnicos actualizan tickets" 
ON public.tickets FOR UPDATE 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND rol IN ('admin', 'tecnico')));

-- 4. Tabla servicios
CREATE TABLE public.servicios (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
    tecnico_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    detalles_servicio TEXT NOT NULL,
    fecha_servicio TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins y tecnicos pueden gestionar servicios"
ON public.servicios FOR ALL
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND rol IN ('admin', 'tecnico')));

CREATE POLICY "Clientes ven servicios de sus tickets"
ON public.servicios FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.tickets WHERE tickets.id = servicios.ticket_id AND tickets.user_id = auth.uid())
);

-- 5. Tabla tutoriales
CREATE TABLE public.tutoriales (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    url_video TEXT,
    activo BOOLEAN DEFAULT true,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tutoriales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cualquiera puede ver tutoriales activos"
ON public.tutoriales FOR SELECT
USING (activo = true);

CREATE POLICY "Solo admins pueden modificar tutoriales"
ON public.tutoriales FOR ALL
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND rol = 'admin'));

-- 6. Tabla diagnosticos (ayuda de diagnóstico)
CREATE TABLE public.diagnosticos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sintoma TEXT NOT NULL,
    causa_probable TEXT,
    solucion_sugerida TEXT,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.diagnosticos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lectura publica de diagnosticos"
ON public.diagnosticos FOR SELECT USING (true);

CREATE POLICY "Modificable por admins y tecnicos"
ON public.diagnosticos FOR ALL
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND rol IN ('admin', 'tecnico')));

-- 7. Tabla solicitudes de refacciones
CREATE TYPE refaccion_status AS ENUM ('pendiente', 'aprobada', 'rechazada', 'entregada');

CREATE TABLE public.refacciones_solicitudes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    equipo_modelo TEXT,
    nombre_pieza TEXT NOT NULL,
    cantidad INT DEFAULT 1,
    estado_solicitud refaccion_status DEFAULT 'pendiente'::refaccion_status,
    fecha_solicitud TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.refacciones_solicitudes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios ven sus propias solicitudes"
ON public.refacciones_solicitudes FOR SELECT
USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND rol IN ('admin', 'tecnico')));

CREATE POLICY "Usuarios pueden crear solicitudes"
ON public.refacciones_solicitudes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins y tecnicos actualizan solicitudes"
ON public.refacciones_solicitudes FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND rol IN ('admin', 'tecnico')));
