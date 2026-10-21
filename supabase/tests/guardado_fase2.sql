-- Prueba de guardar_costo / guardar_receta. Se deshace al final.
-- Requiere que exista el producto "Alfajor chips" (catálogo cargado).
do $$
declare u uuid := '00000000-0000-0000-0000-0000000000d3'; u2 uuid := '00000000-0000-0000-0000-0000000000e3';
  p bigint; d bigint; n int; c numeric; r bigint; ing bigint;
begin
  insert into auth.users (id, email, aud, role) values (u, 'd3@prueba.test', 'authenticated', 'authenticated'), (u2, 'e3@prueba.test', 'authenticated', 'authenticated');
  insert into public.perfiles (id, nombre, email, rol) values (u, 'D', 'd3@prueba.test', 'dueno'), (u2, 'E', 'e3@prueba.test', 'encargada');
  select id into p from public.productos where nombre = 'Alfajor chips';
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- Primer costo y corrección el mismo día: una sola versión, "desde siempre"
  d := public.guardar_costo(p, null, 'manual', 400, null, null, '[{"concepto":"Bolsa","monto_neto":30}]');
  d := public.guardar_costo(p, null, 'manual', 420, null, null, '[{"concepto":"Bolsa","monto_neto":30},{"concepto":" ","monto_neto":5}]');
  select count(*), max(costo_neto), min(vigente_desde) into n, c from public.costo_versiones where definicion_id = d;
  if n <> 1 or c <> 450 then raise exception 'FALLO: primer costo corregido el mismo día: % versiones, costo %', n, c; end if;
  insert into public.ingredientes (nombre, cantidad_compra, unidad_compra, precio_compra_neto) values ('Ing t', 1, 'kg', 1000) returning id into ing;
  r := public.guardar_receta(null, 'Receta t', 10, 'un', false, '', format('[{"ingrediente_id":%s,"cantidad":500,"unidad":"g"}]', ing)::jsonb, '[{"concepto":"MO","monto_neto":500}]');
  select costo_unitario into c from public.v_recetas where id = r;
  if c <> 100 then raise exception 'FALLO: receta t esperada 100, obtuve %', c; end if;
  r := public.guardar_receta(r, 'Receta t', 5, 'un', false, '', format('[{"ingrediente_id":%s,"cantidad":500,"unidad":"g"}]', ing)::jsonb, '[]');
  select costo_unitario into c from public.v_recetas where id = r;
  if c <> 100 then raise exception 'FALLO: receta t editada esperada 100, obtuve %', c; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.guardar_costo(p, null, 'manual', 1, null, null, '[]');
    raise exception 'FALLO: encargada guardó un costo';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin
    perform public.guardar_receta(r, 'x', 1, 'un', false, '', '[]', '[]');
    raise exception 'FALLO: encargada editó receta';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  execute 'reset role';
  raise exception 'TODAS LAS PRUEBAS OK (cambios deshechos)';
end $$;
