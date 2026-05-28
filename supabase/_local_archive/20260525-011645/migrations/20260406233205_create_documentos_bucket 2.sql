-- Creación de storage bucket para documentos
INSERT INTO storage.buckets (id, name, public) VALUES ('documentos', 'documentos', true)
ON CONFLICT (id) DO NOTHING;

-- Policies para lectura (publica porque a lo mejor se enlazan los PDFs en tickets publicos, etc.)
CREATE POLICY "Ver Documentos Todos"
ON storage.objects FOR SELECT
USING ( bucket_id = 'documentos' );

-- Inserción requiere autenticacion como admin/tecnico
CREATE POLICY "Subir Documentos Admin Tecnico"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'documentos' AND
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND rol IN ('admin', 'tecnico'))
);

CREATE POLICY "Actualizar Documentos Admin Tecnico"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'documentos' AND
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND rol IN ('admin', 'tecnico'))
);
