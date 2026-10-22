-- Prueba de la sugerencia de producción: días comparables, sin cafetería, la encargada la ve sin costos.
-- Usa las ventas reales. Se deshace al final.
do $$
declare
  u uuid := '00000000-0000-0000-0000-0000000000dd';
  e uuid := '00000000-0000-0000-0000-0000000000ed';
  r json; r2 json;
begin
  insert into auth.users (id, email, aud, role) values
    (u, 'dd@prueba.test', 'authenticated', 'authenticated'), (e, 'ed@prueba.test', 'authenticated', 'authenticated');
  insert into public.perfiles (id, nombre, email, rol) values (u, 'D', 'dd@prueba.test', 'dueno'), (e, 'E', 'ed@prueba.test', 'encargada');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.produccion_sugerida('2026-10-24');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r2 := public.produccion_sugerida('2026-10-24');
  execute 'reset role';
  -- Solo sábados anteriores con ventas
  if exists (select 1 from json_array_elements_text(r->'dias') d where extract(isodow from d::date) <> 6) then
    raise exception 'FALLO: días de otra semana %', r->'dias';
  end if;
  if json_array_length(r2->'productos') = 0 then raise exception 'FALLO: encargada sin lista'; end if;
  if exists (select 1 from json_array_elements(r2->'productos') x where x->>'costo' is not null) then
    raise exception 'FALLO: encargada ve costos';
  end if;
  if exists (select 1 from json_array_elements(r->'productos') x where x->>'categoria' in ('Cafetería', 'Bebestibles')) then
    raise exception 'FALLO: incluye cafetería';
  end if;
  if (select (x->>'costo')::numeric from json_array_elements(r->'productos') x where x->>'nombre' = 'Rollitos de canela') <= 0 then
    raise exception 'FALLO: costo de producto con opciones en 0';
  end if;
  raise exception 'TODAS LAS PRUEBAS OK';
end $$;
