-- Prueba de insumos: proveedores que se recuerdan, boletas y permisos. Se deshace al final.
do $$
declare
  u uuid := '00000000-0000-0000-0000-0000000000db';
  e uuid := '00000000-0000-0000-0000-0000000000eb';
  r json; n int; cat text;
  fila jsonb := '[{"fecha":"2026-10-03","tipo_doc":"Factura","rut":"76123456-7","proveedor":"Molino","folio":"100","neto":100000,"exento":0,"iva":19000,"total":119000}]';
begin
  insert into auth.users (id, email, aud, role) values
    (u, 'db@prueba.test', 'authenticated', 'authenticated'), (e, 'eb@prueba.test', 'authenticated', 'authenticated');
  insert into public.perfiles (id, nombre, email, rol) values (u, 'D', 'db@prueba.test', 'dueno'), (e, 'E', 'eb@prueba.test', 'encargada');

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- Proveedor nuevo: queda por clasificar
  perform public.importar_compras_sii('2026-10-01', fila);
  select categoria into cat from public.compras where folio = '100';
  if cat <> 'Por clasificar' then raise exception 'FALLO: categoría inicial %', cat; end if;
  -- Clasificarlo actualiza sus documentos
  n := public.clasificar_proveedor('76123456-7', 'Molino', 'Insumos');
  if n <> 1 then raise exception 'FALLO: clasificó %', n; end if;
  -- El mes siguiente se clasifica solo
  perform public.importar_compras_sii('2026-11-01', jsonb_set(fila, '{0,folio}', '"101"'));
  select categoria into cat from public.compras where folio = '101';
  if cat <> 'Insumos' then raise exception 'FALLO: no recordó el proveedor (%)', cat; end if;
  -- Compra con boleta en la feria
  insert into public.compras (periodo, fecha, tipo_doc, proveedor, neto, iva, total, categoria)
  values ('2026-10-01', '2026-10-12', 'Boleta', 'Feria', 35000, 0, 35000, 'Insumos');

  r := public.insumos_periodo('2026-10-01', '2026-10-31');
  select sum((x->>'monto')::numeric) into n from json_array_elements(r->'compras') x where x->>'categoria' = 'Insumos';
  if n <> 135000 then raise exception 'FALLO: compras de insumos % (esperaba 135.000)', n; end if;
  if json_array_length(r->'uso') = 0 then raise exception 'FALLO: sin uso de insumos'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.proveedores;
  if n <> 0 then raise exception 'FALLO: encargada ve proveedores'; end if;
  begin
    perform public.clasificar_proveedor('76123456-7', 'Molino', 'Otros');
    raise exception 'FALLO: encargada clasificó';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  begin
    perform public.insumos_periodo('2026-10-01', '2026-10-31');
    raise exception 'FALLO: encargada vio insumos';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  execute 'reset role';

  raise exception 'TODAS LAS PRUEBAS OK';
end $$;
