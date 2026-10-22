-- Prueba del desglose de ventas: la encargada lo ve, cuadra con v_ventas_dia y las boletas son de a un día. Se deshace al final.
do $$
declare
  e uuid := '00000000-0000-0000-0000-0000000000e1';
  m json; d json;
begin
  insert into auth.users (id, email, aud, role) values (e, 'e1@prueba.test', 'authenticated', 'authenticated');
  insert into public.perfiles (id, nombre, email, rol) values (e, 'E', 'e1@prueba.test', 'encargada');
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  m := public.detalle_ventas('2026-10-01', '2026-10-31');
  d := public.detalle_ventas('2026-10-17', '2026-10-17', true);
  begin
    perform public.detalle_ventas('2026-10-01', '2026-10-31', true);
    raise exception 'FALLO: boletas de un mes';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  execute 'reset role';
  if abs((m->'resumen'->>'ventas')::numeric - (select sum(ventas) from public.v_ventas_dia where fecha between '2026-10-01' and '2026-10-31')) > 1 then
    raise exception 'FALLO: total del mes no cuadra';
  end if;
  if (select sum((x->>'total')::numeric) from json_array_elements(d->'boletas') x)
     <> (d->'resumen'->>'ventas')::numeric + (d->'resumen'->>'abonos')::numeric then
    raise exception 'FALLO: boletas no cuadran con el día';
  end if;
  raise exception 'TODAS LAS PRUEBAS OK';
end $$;
