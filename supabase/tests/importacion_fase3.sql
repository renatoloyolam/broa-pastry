-- Prueba de la Fase 3: importar lotes, duplicados, turnos, deshacer y permisos.
-- Se deshace al final. Requiere el catálogo cargado ("Danesas", "Galletas").
do $$
declare
  u uuid := '00000000-0000-0000-0000-0000000000d4';
  e uuid := '00000000-0000-0000-0000-0000000000e4';
  imp bigint; imp2 bigint; r json; n int; t text;
  p_dan bigint; p_gal bigint; o_nuez bigint;
  lote jsonb;
begin
  insert into auth.users (id, email, aud, role) values
    (u, 'd4@prueba.test', 'authenticated', 'authenticated'), (e, 'e4@prueba.test', 'authenticated', 'authenticated');
  insert into public.perfiles (id, nombre, email, rol) values
    (u, 'D', 'd4@prueba.test', 'dueno'), (e, 'E', 'e4@prueba.test', 'encargada');
  select id into p_dan from public.productos where nombre = 'Danesas';
  select id into p_gal from public.productos where nombre = 'Galletas';
  select id into o_nuez from public.opciones where producto_id = p_gal and nombre = 'Galleta nuez';

  -- Números de transacción ficticios muy altos para no chocar con datos reales
  lote := jsonb_build_array(
    jsonb_build_object('numero', 990000001, 'fecha_hora', '2026-10-10 09:31', 'vendedor', 'Paula', 'metodo_pago', 'Débito',
      'total', 2000, 'descuento', 0, 'con_boleta', true,
      'lineas', jsonb_build_array(
        jsonb_build_object('producto_id', p_dan, 'opcion_ids', '[]'::jsonb, 'precio', 500, 'monto', 500, 'texto_item', 'Danesas'),
        jsonb_build_object('producto_id', p_dan, 'opcion_ids', '[]'::jsonb, 'precio', 500, 'monto', 500, 'texto_item', 'Danesas'),
        jsonb_build_object('producto_id', p_gal, 'opcion_ids', jsonb_build_array(o_nuez, o_nuez), 'precio', 1000, 'monto', 1000,
          'texto_item', 'Galletas', 'texto_opciones', 'Galleta nuez, Galleta nuez'))),
    jsonb_build_object('numero', 990000002, 'fecha_hora', '2026-10-10 18:05', 'vendedor', 'Paula', 'metodo_pago', 'Efectivo',
      'total', 450, 'descuento', 50, 'con_boleta', false,
      'lineas', jsonb_build_array(
        jsonb_build_object('producto_id', p_dan, 'opcion_ids', '[]'::jsonb, 'precio', 500, 'monto', 450, 'texto_item', 'Danesas'))));

  -- Encargada no puede importar
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.importaciones (archivo) values ('x.xlsx');
    raise exception 'FALLO: encargada creó una importación';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  -- Dueño importa
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.importaciones (archivo) values ('prueba.xlsx') returning id into imp;
  r := public.importar_lote(imp, lote);
  if (r->>'nuevas')::int <> 2 or (r->>'lineas')::int <> 4 then raise exception 'FALLO: primer lote %', r; end if;

  -- Turnos por hora de corte (15:00)
  select turno into t from public.ventas where numero = 990000001;
  if t <> 'AM' then raise exception 'FALLO: 09:31 debería ser AM'; end if;
  select turno into t from public.ventas where numero = 990000002;
  if t <> 'PM' then raise exception 'FALLO: 18:05 debería ser PM'; end if;
  -- Fecha en hora de Santiago
  if (select fecha from public.ventas where numero = 990000002) <> date '2026-10-10' then
    raise exception 'FALLO: fecha mal guardada';
  end if;
  if (select opcion_ids from public.venta_lineas where venta_numero = 990000001 and texto_item = 'Galletas') <> array[o_nuez, o_nuez] then
    raise exception 'FALLO: opciones repetidas no se guardaron';
  end if;

  -- Subir lo mismo otra vez (otra importación): todo repetido, nada duplicado
  update public.importaciones set estado = 'completa' where id = imp;
  insert into public.importaciones (archivo) values ('prueba-otra-vez.xlsx') returning id into imp2;
  r := public.importar_lote(imp2, lote);
  if (r->>'nuevas')::int <> 0 or (r->>'repetidas')::int <> 2 then raise exception 'FALLO: duplicados %', r; end if;
  select count(*) into n from public.venta_lineas where venta_numero in (990000001, 990000002);
  if n <> 4 then raise exception 'FALLO: hay % líneas, esperaba 4', n; end if;

  -- Resumen del día
  select ventas::int into n from public.v_ventas_dia where fecha = date '2026-10-10';
  if n < 2450 then raise exception 'FALLO: resumen del día %', n; end if;
  execute 'reset role';

  -- La encargada ve las ventas pero no puede deshacer ni borrar
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.ventas where numero in (990000001, 990000002);
  if n <> 2 then raise exception 'FALLO: encargada no ve las ventas'; end if;
  begin
    perform public.deshacer_importacion(imp);
    raise exception 'FALLO: encargada deshizo una importación';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin
    delete from public.ventas where numero = 990000001;
    raise exception 'FALLO: encargada borró ventas';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  -- Dueño deshace la primera importación: se borran ventas y líneas
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  n := public.deshacer_importacion(imp);
  if n <> 2 then raise exception 'FALLO: deshacer borró % ventas', n; end if;
  select count(*) into n from public.venta_lineas where venta_numero in (990000001, 990000002);
  if n <> 0 then raise exception 'FALLO: quedaron líneas tras deshacer'; end if;
  if (select estado from public.importaciones where id = imp) <> 'deshecha' then raise exception 'FALLO: estado'; end if;
  execute 'reset role';

  raise exception 'TODAS LAS PRUEBAS OK (cambios deshechos)';
end $$;
