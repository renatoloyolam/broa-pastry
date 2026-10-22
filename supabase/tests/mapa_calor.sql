-- Prueba del mapa de calor: la encargada lo ve y el total de las celdas cuadra con las ventas. Se deshace al final.
do $$
declare
  e uuid := '00000000-0000-0000-0000-0000000000ee';
  r json;
begin
  insert into auth.users (id, email, aud, role) values (e, 'ee@prueba.test', 'authenticated', 'authenticated');
  insert into public.perfiles (id, nombre, email, rol) values (e, 'E', 'ee@prueba.test', 'encargada');
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.mapa_calor('2026-09-01', '2026-10-31');
  execute 'reset role';
  if abs((select sum((x->>'ventas')::numeric) from json_array_elements(r->'celdas') x) -
         (select sum(l.monto) from public.venta_lineas l join public.productos p on p.id = l.producto_id
          where l.fecha between '2026-09-01' and '2026-10-31' and p.tipo <> 'abono')) > 200 then
    raise exception 'FALLO: el total no cuadra';
  end if;
  raise exception 'TODAS LAS PRUEBAS OK';
end $$;
