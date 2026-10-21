-- Prueba de la Fase 7: pedidos, abonos, saldos, costo estimado y permisos.
-- Requiere costos de "Torta 20 cm · torta amor" (cargados desde la planilla). Se deshace al final.
do $$
declare
  u uuid := '00000000-0000-0000-0000-0000000000d8';
  a uuid := '00000000-0000-0000-0000-0000000000a8';
  e uuid := '00000000-0000-0000-0000-0000000000e8';
  hoy date := private.hoy();
  p_torta bigint; o_amor bigint; ped bigint; ped2 bigint; l json; r json; costo numeric; n int;
begin
  insert into auth.users (id, email, aud, role) values
    (u, 'd8@prueba.test', 'authenticated', 'authenticated'), (a, 'a8@prueba.test', 'authenticated', 'authenticated'),
    (e, 'e8@prueba.test', 'authenticated', 'authenticated');
  insert into public.perfiles (id, nombre, email, rol) values
    (u, 'D', 'd8@prueba.test', 'dueno'), (a, 'A', 'a8@prueba.test', 'admin'), (e, 'E', 'e8@prueba.test', 'encargada');
  select id into p_torta from public.productos where nombre = 'Torta 20 cm';
  select id into o_amor from public.opciones where producto_id = p_torta and nombre = 'torta amor';
  select cv.costo_neto into costo from public.costo_versiones cv join public.costo_definiciones d on d.id = cv.definicion_id
  where d.opcion_id = o_amor order by cv.vigente_desde desc limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- Torta amor 20 cm para mañana, $28.000, abono $14.000
  insert into public.pedidos (cliente, telefono, descripcion, producto_id, opcion_id, fecha_entrega, precio_total)
  values ('Cliente prueba', '+56 9 1234 5678', 'Torta amor 20 cm, "Feliz cumpleaños"', p_torta, o_amor, hoy + 1, 28000)
  returning id into ped;
  insert into public.pedido_abonos (pedido_id, monto, medio_pago) values (ped, 14000, 'Transferencia');
  -- Pedido sin producto del catálogo, con costo a mano
  insert into public.pedidos (cliente, descripcion, fecha_entrega, precio_total) values ('Otro', 'Torta especial', hoy, 50000)
  returning id into ped2;
  insert into public.pedido_costos (pedido_id, costo_neto) values (ped2, 20000);

  select x into l from json_array_elements(public.lista_pedidos('proximos')) x where (x->>'id')::bigint = ped;
  if (l->>'abonado')::int <> 14000 or (l->>'saldo')::int <> 14000 then raise exception 'FALLO: saldo %', l; end if;
  if (l->>'costo_estimado')::numeric <> costo then raise exception 'FALLO: costo estimado % vs %', l->>'costo_estimado', costo; end if;
  if (l->>'ganancia_esperada')::numeric <> round(28000 / 1.19 - costo) then raise exception 'FALLO: ganancia esperada'; end if;
  select x into l from json_array_elements(public.lista_pedidos('proximos')) x where (x->>'id')::bigint = ped2;
  if (l->>'costo_estimado')::numeric <> 20000 or not (l->>'costo_manual')::boolean then raise exception 'FALLO: costo manual'; end if;

  r := public.resumen_pedidos();
  if (r->>'hoy')::int < 1 or (r->>'manana')::int < 1 or (r->>'saldo_pendiente')::int < 64000 then
    raise exception 'FALLO: resumen %', r;
  end if;

  -- Pagar el saldo y entregar: sale de "con saldo", entra en "entregados"
  insert into public.pedido_abonos (pedido_id, monto, medio_pago) values (ped, 14000, 'Débito');
  update public.pedidos set estado = 'entregado', entregado_en = now() where id = ped;
  if exists (select 1 from json_array_elements(public.lista_pedidos('saldo')) x where (x->>'id')::bigint = ped) then
    raise exception 'FALLO: pedido pagado sigue con saldo';
  end if;
  if not exists (select 1 from json_array_elements(public.lista_pedidos('entregados')) x where (x->>'id')::bigint = ped) then
    raise exception 'FALLO: no aparece en entregados';
  end if;
  execute 'reset role';

  -- Admin sin ver costos: gestiona pedidos pero no ve costo ni ganancia
  update public.permisos_admin set ver_costos = false;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  l := public.lista_pedidos('todos');
  if l::text ~ '"(costo_estimado|ganancia_esperada)"\s*:\s*[0-9]' then raise exception 'FALLO: admin ve costos de pedidos'; end if;
  select count(*) into n from public.pedido_costos;
  if n <> 0 then raise exception 'FALLO: admin lee pedido_costos'; end if;
  insert into public.pedido_abonos (pedido_id, monto) values (ped2, 1000);
  execute 'reset role';
  update public.permisos_admin set ver_costos = true;

  -- Encargada: nada de pedidos
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.pedidos;
  if n <> 0 then raise exception 'FALLO: encargada ve pedidos'; end if;
  if public.resumen_pedidos() is not null then raise exception 'FALLO: encargada ve resumen'; end if;
  begin
    perform public.lista_pedidos('todos');
    raise exception 'FALLO: encargada listó pedidos';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  execute 'reset role';

  raise exception 'TODAS LAS PRUEBAS OK (cambios deshechos). Costo torta amor 20 cm: %', costo;
end $$;
