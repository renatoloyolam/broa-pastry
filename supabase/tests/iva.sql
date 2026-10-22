-- Prueba de IVA: compras a mano y desde el SII (sin duplicar), ajustes y permisos.
-- Usa las ventas reales de octubre 2026. Se deshace al final.
do $$
declare
  u uuid := '00000000-0000-0000-0000-0000000000da';
  e uuid := '00000000-0000-0000-0000-0000000000ea';
  r json; n int; cobrado numeric;
  filas jsonb := '[
    {"fecha":"2026-10-03","tipo_doc":"Factura","rut":"76123456-7","proveedor":"Molino","folio":"100","neto":100000,"exento":0,"iva":19000,"total":119000},
    {"fecha":"2026-10-09","tipo_doc":"Nota de crédito","rut":"76123456-7","proveedor":"Molino","folio":"7","neto":10000,"exento":0,"iva":1900,"total":11900}
  ]';
begin
  insert into auth.users (id, email, aud, role) values
    (u, 'da@prueba.test', 'authenticated', 'authenticated'), (e, 'ea@prueba.test', 'authenticated', 'authenticated');
  insert into public.perfiles (id, nombre, email, rol) values (u, 'D', 'da@prueba.test', 'dueno'), (e, 'E', 'ea@prueba.test', 'encargada');

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  r := public.importar_compras_sii('2026-10-15', filas);
  if (r->>'nuevas')::int <> 2 then raise exception 'FALLO: importó %', r; end if;
  -- Subir el mismo archivo otra vez no duplica
  r := public.importar_compras_sii('2026-10-01', filas);
  if (r->>'nuevas')::int <> 0 or (r->>'repetidas')::int <> 2 then raise exception 'FALLO: duplicó %', r; end if;
  insert into public.compras (periodo, fecha, proveedor, neto, iva, total) values ('2026-10-01', '2026-10-10', 'Feria', 50000, 9500, 59500);

  perform public.guardar_ajustes_iva('2026-10-01', 25000, 0.0025);
  r := public.iva_mes('2026-10-20');
  if json_array_length(r->'compras') <> 3 then raise exception 'FALLO: compras %', r->'compras'; end if;
  if (r->>'remanente_anterior')::int <> 25000 or (r->>'tasa_ppm')::numeric <> 0.0025 then raise exception 'FALLO: ajustes %', r; end if;
  select round(sum(l.monto)) into cobrado from public.venta_lineas l where l.fecha between '2026-10-01' and '2026-10-31';
  if (r->'cobrado'->>'ventas')::numeric + (r->'cobrado'->>'abonos')::numeric <> cobrado then
    raise exception 'FALLO: cobrado % vs %', r->'cobrado', cobrado;
  end if;
  execute 'reset role';

  -- Encargada: no ve ni carga compras
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.compras;
  if n <> 0 then raise exception 'FALLO: encargada ve compras'; end if;
  begin
    perform public.importar_compras_sii('2026-10-01', filas);
    raise exception 'FALLO: encargada importó';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  begin
    perform public.iva_mes('2026-10-01');
    raise exception 'FALLO: encargada vio el IVA';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  execute 'reset role';

  raise exception 'TODAS LAS PRUEBAS OK';
end $$;
