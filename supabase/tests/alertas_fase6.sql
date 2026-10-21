-- Prueba de la Fase 6: alertas y exportación. Se deshace al final.
-- Crea una venta de prueba de hace 3 días y costos/mermas que disparan cada alerta.
do $$
declare
  u uuid := '00000000-0000-0000-0000-0000000000d7';
  e uuid := '00000000-0000-0000-0000-0000000000e7';
  hoy date := private.hoy();
  p_dan bigint; p_fac bigint; mot bigint; imp bigint; def bigint;
  j json; je json; codigos text[]; ex json;
begin
  insert into auth.users (id, email, aud, role) values
    (u, 'd7@prueba.test', 'authenticated', 'authenticated'), (e, 'e7@prueba.test', 'authenticated', 'authenticated');
  insert into public.perfiles (id, nombre, email, rol) values (u, 'D', 'd7@prueba.test', 'dueno'), (e, 'E', 'e7@prueba.test', 'encargada');
  select id into p_dan from public.productos where nombre = 'Danesas';
  select id into p_fac from public.productos where nombre = 'Factura';
  select id into mot from public.motivos_merma where nombre = 'Vencimiento';

  -- Venta de prueba de hace 3 días: 4 danesas y una factura (sin costo)
  insert into public.importaciones (archivo, estado) values ('prueba', 'completa') returning id into imp;
  insert into public.ventas (numero, importacion_id, fecha_hora, fecha, turno, total)
  values (990000101, imp, (hoy - 3)::timestamp + time '10:00', hoy - 3, 'AM', 2000);
  insert into public.venta_lineas (venta_numero, fecha, producto_id, precio, monto, texto_item)
  select 990000101, hoy - 3, p_dan, 500, 500, 'Danesas' from generate_series(1, 4);
  insert into public.venta_lineas (venta_numero, fecha, producto_id, precio, monto, texto_item)
  values (990000101, hoy - 3, p_fac, 1300, 1300, 'Factura');

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- Danesas costaba $300 neto (precio $500 con IVA = $420 neto → margen 28,6% < 40%)
  def := public.guardar_costo(p_dan, null, 'manual', 300, null, null, '[]');
  execute 'reset role';
  -- Simular que ese costo rige desde hace 20 días
  update public.costo_versiones set vigente_desde = hoy - 20 where definicion_id = def;
  execute 'set local role authenticated';
  -- Hoy bajó a $100 (−67%): alerta de variación de costo
  perform public.guardar_costo(p_dan, null, 'manual', 100, null, null, '[]');
  -- Merma de hoy sobre el umbral de $15.000: 200 danesas × $100 = $20.000
  insert into public.mermas (fecha, producto_id, cantidad, motivo_id, evitable) values (hoy, p_dan, 200, mot, false);

  j := public.alertas();
  select array_agg(x->>'codigo') into codigos from json_array_elements(j) x;
  if not codigos @> array['sin_costo', 'margen_bajo', 'mermas_altas', 'variacion_costo'] then
    raise exception 'FALLO: faltan alertas, llegaron %', codigos;
  end if;
  -- Días sin ventas: debe calzar con un conteo independiente
  if coalesce((select json_array_length(x->'fechas') from json_array_elements(j) x where x->>'codigo' = 'dias_sin_ventas'), 0)
     <> (select count(*) from generate_series(greatest(hoy - 14, (select min(fecha) from public.ventas)), hoy - 1, interval '1 day') g(d)
         where not exists (select 1 from public.ventas v where v.fecha = g.d::date)) then
    raise exception 'FALLO: días sin ventas no calza';
  end if;

  -- El dueño puede desactivar una alerta
  update public.umbrales_alertas set activas = activas || '{"margen_bajo": false}';
  j := public.alertas();
  if exists (select 1 from json_array_elements(j) x where x->>'codigo' = 'margen_bajo') then
    raise exception 'FALLO: alerta desactivada sigue apareciendo';
  end if;

  select x into ex from json_array_elements(public.exportar_ventas(hoy - 3, hoy - 3)) x where (x->>'numero')::bigint = 990000101;
  if (ex->>'total')::int <> 2000 or (ex->>'neto')::int <> 1681 or (ex->>'iva')::int <> 319 then
    raise exception 'FALLO: exportación %', ex;
  end if;
  execute 'reset role';

  -- Encargada: solo el recordatorio de días sin ventas; no edita umbrales ni exporta
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  je := public.alertas();
  select coalesce(array_agg(x->>'codigo'), '{}') into codigos from json_array_elements(je) x;
  if not codigos <@ array['dias_sin_ventas'] then raise exception 'FALLO: encargada recibe %', codigos; end if;
  update public.umbrales_alertas set margen_minimo = 0.1;
  if (select margen_minimo from public.umbrales_alertas) <> 0.4 then raise exception 'FALLO: encargada cambió umbrales'; end if;
  begin
    perform public.exportar_ventas(hoy - 3, hoy);
    raise exception 'FALLO: encargada exportó';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  execute 'reset role';

  raise exception 'TODAS LAS PRUEBAS OK (cambios deshechos)';
end $$;
