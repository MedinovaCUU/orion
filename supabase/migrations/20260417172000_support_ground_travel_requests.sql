ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS employee_number TEXT;

ALTER TABLE public.travel_requests
ALTER COLUMN origin_airport DROP NOT NULL,
ALTER COLUMN destination_airport DROP NOT NULL,
ALTER COLUMN desired_departure_date DROP NOT NULL;
