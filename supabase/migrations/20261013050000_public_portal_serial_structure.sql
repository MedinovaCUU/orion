-- Estructura de las series de analizadores (A15, A25, BA200, BA400, Y15, Y25, Y200, Y400…):
-- 5 números + 0 a 3 letras + 4 números finales (834001902, 83105C1526, 83400ISE1234).
-- Una serie no registrada solo puede confirmarse si tiene esa estructura; lo demás es «formato».
-- Las series registradas siguen siendo válidas aunque no la cumplan (BTS, destiladores, IMLD y los
-- A15 dados de alta como 831050#### en lugar de 83105C####), porque resolve_portal_equipment busca
-- primero en Equipos.

create or replace function public.portal_serial_issue(p_key text) returns text
language sql immutable as $$
  select case
    when p_key is null then 'vacio'
    when p_key like '%8435287%' then 'producto'      -- GS1 (01) product code printed on every BioSystems label
    when p_key ~ '^[0-9]{4,5}$' then 'incompleto'    -- only the SN of an older A15 label, without REF 83105
    when p_key !~ '^[0-9]{5}[A-Z]{0,3}[0-9]{4}$' then 'formato'
    when p_key ~ '^(.)\1+$' or p_key ~ '^000'
      or p_key ~ '(012345|123456|234567|345678|456789|543210|654321|765432|876543|987654)' then 'formato'
  end
$$;
