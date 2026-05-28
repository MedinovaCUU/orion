BEGIN;

ALTER FUNCTION public.master_data_normalize_text(text) SET search_path = public;
ALTER FUNCTION public.master_data_phone_digits(text) SET search_path = public;
ALTER FUNCTION public.master_data_word_count(text) SET search_path = public;
ALTER FUNCTION public.master_data_overlap_score(text, text) SET search_path = public;
ALTER FUNCTION public.master_data_is_reliable_contact(text) SET search_path = public;
ALTER FUNCTION public.master_data_is_reliable_phone(text) SET search_path = public;
ALTER FUNCTION public.master_data_is_reliable_city(text) SET search_path = public;
ALTER FUNCTION public.master_data_is_reliable_address(text) SET search_path = public;
ALTER FUNCTION public.master_data_is_reliable_equipment_name(text) SET search_path = public;
ALTER FUNCTION public.master_data_extract_ticket_client_hint(text) SET search_path = public;
ALTER FUNCTION public.master_data_resolve_equipment(text, integer, text) SET search_path = public;
ALTER FUNCTION public.master_data_is_reliable_version(text) SET search_path = public;
ALTER FUNCTION public.current_auth_uid() SET search_path = public;
ALTER FUNCTION public.current_auth_email() SET search_path = public;

COMMIT;
