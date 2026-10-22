-- Prueba de Finanzas: gastos, copia al mes siguiente, comisiones y permisos.
-- Usa las ventas reales de octubre 2026. Se deshace al final.
do $$
declare
  u uuid := '00000000-0000-0000-0000-0000000000d9';
  a uuid := '00000000-0000-0000-0000-0000000000a9';
  e uuid := '00000000-0000-0000-0000-0000000000e9';
  r json; n int; debito numeric; esperado numeric;
begin
  insert into auth.users (id, email, aud, role) values
    (u, 'd9@prueba.test', 'authenticated', 'authenticated'), (a, 'a9@prueba.test', 'authenticated', 'authenticated'),
    (e, 'e9@prueba.test', 'authenticated', 'authenticated');
  insert into public.perfiles (id, nombre, email, rol) values
    (u, 'D', 'd9@prueba.test', 'dueno'), (a, 'A', 'a9@prueba.test', 'admin'), (e, 'E', 'e9@prueba.test', 'encargada');

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- Octubre: dos gastos fijos y uno que no se repite
  perform public.preparar_mes_gastos('2026-10-15');
  insert into public.gastos (mes, nombre, categoria, monto, dia_pago) values
    ('2026-10-01', 'Arriendo', 'Arriendo y local', 1500000, 5),
    ('2026-10-01', 'Luz', 'Servicios básicos', 180000, 20);
  insert into public.gastos (mes, nombre, monto, se_repite) values ('2026-10-01', 'Horno reparación', 90000, false);

  -- Noviembre se prepara solo con los que se repiten
  n := public.preparar_mes_gastos('2026-11-01');
  if n <> 2 then raise exception 'FALLO: copió % gastos (esperaba 2)', n; end if;
  -- Abrirlo otra vez no duplica; borrar uno y reabrir no lo revive
  delete from public.gastos where mes = '2026-11-01' and nombre = 'Luz';
  n := public.preparar_mes_gastos('2026-11-01');
  if n <> 0 then raise exception 'FALLO: volvió a copiar'; end if;
  -- El botón "copiar del mes anterior" sí lo trae, sin duplicar Arriendo
  n := public.preparar_mes_gastos('2026-11-01', true);
  if n <> 1 then raise exception 'FALLO: copia forzada %', n; end if;

  -- Comisiones: 1,5% débito, 3% crédito
  perform public.guardar_comisiones(0.015, 0.03);
  r := public.finanzas_mes('2026-10-01');
  if json_array_length(r->'gastos') <> 3 then raise exception 'FALLO: gastos %', r->'gastos'; end if;
  if (r->'resumen'->>'ventas')::numeric <= 0 then raise exception 'FALLO: sin ventas'; end if;
  select (x->>'comision')::numeric into debito from json_array_elements(r->'por_medio') x where x->>'medio' = 'Débito';
  select round(sum(l.monto) * 0.015) into esperado
  from public.ventas v join public.venta_lineas l on l.venta_numero = v.numero join public.productos p on p.id = l.producto_id
  where v.fecha between '2026-10-01' and '2026-10-31' and p.tipo <> 'abono'
    and v.metodo_pago ilike '%débito%' and v.metodo_pago not ilike '%crédito%';
  if abs(debito - esperado) > 1 then raise exception 'FALLO: comisión débito % vs %', debito, esperado; end if;
  execute 'reset role';

  -- Administradora: por defecto NO ve finanzas
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.gastos;
  if n <> 0 then raise exception 'FALLO: admin ve gastos sin permiso'; end if;
  begin
    perform public.finanzas_mes('2026-10-01');
    raise exception 'FALLO: admin abrió finanzas';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  execute 'reset role';

  -- Con el permiso activado sí puede (y requiere ver costos)
  update public.permisos_admin set gestionar_finanzas = true;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.gastos;
  if n < 5 then raise exception 'FALLO: admin con permiso ve % gastos', n; end if;
  execute 'reset role';
  update public.permisos_admin set ver_costos = false;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.gastos;
  if n <> 0 then raise exception 'FALLO: admin sin ver_costos ve gastos'; end if;
  execute 'reset role';

  -- Encargada: nunca
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.gastos;
  if n <> 0 then raise exception 'FALLO: encargada ve gastos'; end if;
  begin
    insert into public.gastos (mes, nombre, monto) values ('2026-10-01', 'x', 1);
    raise exception 'FALLO: encargada creó gasto';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  begin
    perform public.guardar_comisiones(0, 0);
    raise exception 'FALLO: encargada cambió comisiones';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  execute 'reset role';

  raise exception 'TODAS LAS PRUEBAS OK';
end $$;
