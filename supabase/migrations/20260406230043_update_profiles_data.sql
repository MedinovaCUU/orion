ALTER TABLE public.profiles ADD COLUMN telefono TEXT;
ALTER TABLE public.profiles ADD COLUMN territorio TEXT;
ALTER TABLE public.profiles ADD COLUMN recibe_tickets BOOLEAN DEFAULT false;
