-- Prueba de la Fase 4 (panel). Usa las ventas importadas de octubre y
-- costos ficticios que se deshacen al final.
-- Resultado esperado: "TODAS LAS PRUEBAS OK (...)" con los tiempos medidos.
do $$
declare
  u uuid := '00000000-0000-0000-0000-0000000000d5';
  e uuid := '00000000-0000-0000-0000-0000000000e5';
  p_dan bigint; p_gal bigint;
  j json; je json;
  dan_unidades int; dan_ventas numeric; esperado_ganancia numeric;
  t0 timestamptz; ms_dia int; ms_mes int;
begin
  insert into auth.users (id, email, aud, role) values
    (u, 'd5@prueba.test', 'authenticated', 'authenticated'), (e, 'e5@prueba.test', 'authenticated', 'authenticated');
  insert into public.perfiles (id, nombre, email, rol) values
    (u, 'D', 'd5@prueba.test', 'dueno'), (e, 'E', 'e5@prueba.test', 'encargada');
  select id into p_dan from public.productos where nombre = 'Danesas';
  select id into p_gal from public.productos where nombre = 'Galletas';

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- Danesas cuesta $200 neto. Galletas: sin costo propio; cada galleta de cualquier sabor $150.
  perform public.guardar_costo(p_dan, null, 'manual', 200, null, null, '[]');
  perform public.guardar_costo(p_gal, null, 'cero', null, null, null, '[]');
  perform public.guardar_costo(null, o.id, 'manual', 150, null, null, '[]') from public.opciones o where o.producto_id = p_gal;

  t0 := clock_timestamp();
  j := public.panel('2026-10-10', '2026-10-10', '2026-10-09', '2026-10-09');
  ms_dia := extract(milliseconds from clock_timestamp() - t0);

  -- Total del día = total importado
  if (j->'resumen'->>'ventas')::numeric <> (select sum(total) from public.ventas where fecha = '2026-10-10')
     - coalesce((select sum(l.monto) from public.venta_lineas l join public.productos p on p.id = l.producto_id
                 where l.fecha = '2026-10-10' and p.tipo = 'abono'), 0) then
    raise exception 'FALLO: ventas del día no calzan: %', j->'resumen'->>'ventas';
  end if;

  -- Ganancia = ventas netas costeadas − costo, calculado a mano
  select count(*), sum(monto) into dan_unidades, dan_ventas
  from public.venta_lineas where fecha = '2026-10-10' and producto_id = p_dan;
  select round(sum(l.monto / 1.19)) - round(sum(case when l.producto_id = p_dan then 200 else 150 * cardinality(l.opcion_ids) end))
  into esperado_ganancia
  from public.venta_lineas l where l.fecha = '2026-10-10' and l.producto_id in (p_dan, p_gal);
  if abs((j->'resumen'->>'ventas_netas_costeadas')::numeric - (j->'resumen'->>'costo')::numeric - esperado_ganancia) > 1 then
    raise exception 'FALLO: ganancia % vs esperada %',
      (j->'resumen'->>'ventas_netas_costeadas')::numeric - (j->'resumen'->>'costo')::numeric, esperado_ganancia;
  end if;
  if (select (x->>'costo')::numeric from json_array_elements(j->'productos') x where (x->>'producto_id')::bigint = p_dan) <> dan_unidades * 200 then
    raise exception 'FALLO: costo de Danesas en el ranking';
  end if;
  -- Lo que no tiene costo se informa aparte
  if (j->'resumen'->>'ventas_sin_costo')::numeric <= 0 then raise exception 'FALLO: ventas sin costo no informadas'; end if;
  if (j->'anterior'->>'ventas')::numeric <= 0 then raise exception 'FALLO: período anterior vacío'; end if;

  t0 := clock_timestamp();
  j := public.panel('2026-10-01', '2026-10-31', '2026-09-01', '2026-09-30');
  ms_mes := extract(milliseconds from clock_timestamp() - t0);
  if (j->'resumen'->>'transacciones')::int < 3500 then raise exception 'FALLO: mes incompleto'; end if;
  execute 'reset role';

  -- Encargada: mismas ventas, CERO información de costos
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  je := public.panel('2026-10-10', '2026-10-10', null, null);
  if (je->>'ver_costos')::boolean then raise exception 'FALLO: encargada con ver_costos'; end if;
  if je::text ~ '"(costo|ventas_netas_costeadas|ventas_sin_costo|unidades_sin_costo|mermas)"\s*:\s*[0-9]' then
    raise exception 'FALLO: la respuesta de la encargada contiene costos';
  end if;
  if (je->'resumen'->>'ventas') is null then raise exception 'FALLO: encargada no ve ventas'; end if;
  begin
    perform * from private.lineas_costeadas('2026-10-10', '2026-10-10');
    raise exception 'FALLO: encargada llamó a lineas_costeadas';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  raise exception 'TODAS LAS PRUEBAS OK (cambios deshechos). Día: % ms, mes: % ms', ms_dia, ms_mes;
end $$;
