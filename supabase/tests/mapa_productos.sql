-- Prueba del mapa de productos: el dueño lo ve, la encargada no. Se deshace al final.
do $$
declare
  u uuid := '00000000-0000-0000-0000-0000000000dc';
  e uuid := '00000000-0000-0000-0000-0000000000ec';
  r json;
begin
  insert into auth.users (id, email, aud, role) values
    (u, 'dc@prueba.test', 'authenticated', 'authenticated'), (e, 'ec@prueba.test', 'authenticated', 'authenticated');
  insert into public.perfiles (id, nombre, email, rol) values (u, 'D', 'dc@prueba.test', 'dueno'), (e, 'E', 'ec@prueba.test', 'encargada');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.mapa_productos('2026-10-01', '2026-10-31');
  if json_array_length(r->'productos') = 0 then raise exception 'FALLO: mapa vacío'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.mapa_productos('2026-10-01', '2026-10-31');
    raise exception 'FALLO: encargada vio el mapa';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  execute 'reset role';
  raise exception 'TODAS LAS PRUEBAS OK';
end $$;
