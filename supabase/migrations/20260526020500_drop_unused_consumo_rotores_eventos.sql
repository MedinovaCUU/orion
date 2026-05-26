do $$
begin
  if to_regclass('public.consumo_rotores_eventos') is null then
    return;
  end if;

  execute 'drop policy if exists "anon_insert_consumo_rotores_eventos" on public.consumo_rotores_eventos';
  execute 'drop policy if exists "anon_update_consumo_rotores_eventos" on public.consumo_rotores_eventos';
  execute 'drop policy if exists "anon_select_consumo_rotores_eventos" on public.consumo_rotores_eventos';
  execute 'drop table if exists public.consumo_rotores_eventos';
end
$$;
