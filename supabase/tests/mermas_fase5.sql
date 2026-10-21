-- Prueba de la Fase 5: mermas valorizadas, descuento en la ganancia y permisos.
-- Se deshace al final.
do $$
declare
  u uuid := '00000000-0000-0000-0000-0000000000d6';
  a uuid := '00000000-0000-0000-0000-0000000000a6';
  e uuid := '00000000-0000-0000-0000-0000000000e6';
  p_dan bigint; p_gal bigint; o_nuez bigint; mot_bota bigint; mot_venc bigint;
  antes json; despues json; rep json; n int;
begin
  insert into auth.users (id, email, aud, role) values
    (u, 'd6@prueba.test', 'authenticated', 'authenticated'),
    (a, 'a6@prueba.test', 'authenticated', 'authenticated'),
    (e, 'e6@prueba.test', 'authenticated', 'authenticated');
  insert into public.perfiles (id, nombre, email, rol) values
    (u, 'D', 'd6@prueba.test', 'dueno'), (a, 'A', 'a6@prueba.test', 'admin'), (e, 'E', 'e6@prueba.test', 'encargada');
  select id into p_dan from public.productos where nombre = 'Danesas';
  select id into p_gal from public.productos where nombre = 'Galletas';
  select id into o_nuez from public.opciones where producto_id = p_gal and nombre = 'Galleta nuez';
  select id into mot_bota from public.motivos_merma where nombre = 'No se vendió y se botó';
  select id into mot_venc from public.motivos_merma where nombre = 'Vencimiento';

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.guardar_costo(p_dan, null, 'manual', 200, null, null, '[]');
  perform public.guardar_costo(p_gal, null, 'cero', null, null, null, '[]');
  perform public.guardar_costo(null, o_nuez, 'manual', 150, null, null, '[]');
  antes := public.panel('2026-10-10', '2026-10-10', null, null);

  -- 5 danesas botadas ($1.000) y 2 galletas de nuez vencidas ($300)
  insert into public.mermas (fecha, producto_id, cantidad, motivo_id, evitable) values ('2026-10-10', p_dan, 5, mot_bota, true);
  insert into public.mermas (fecha, producto_id, opcion_ids, cantidad, motivo_id, evitable)
  values ('2026-10-10', p_gal, array[o_nuez], 2, mot_venc, false);
  -- Una merma de un producto sin costo: se informa aparte, no suma valor
  insert into public.mermas (fecha, producto_id, cantidad, motivo_id, evitable)
  values ('2026-10-10', (select id from public.productos where nombre = 'Factura'), 1, mot_bota, true);

  despues := public.panel('2026-10-10', '2026-10-10', null, null);
  if (despues->'resumen'->>'mermas')::numeric <> 1300 then
    raise exception 'FALLO: mermas del día % (esperaba 1300)', despues->'resumen'->>'mermas';
  end if;
  if (despues->'dias'->0->>'mermas')::numeric <> 1300 then raise exception 'FALLO: mermas por día'; end if;

  rep := public.reporte_mermas('2026-10-10', '2026-10-10');
  if (rep->'total'->>'valor')::numeric <> 1300 then raise exception 'FALLO: total reporte %', rep->'total'; end if;
  if (rep->'total'->>'valor_evitable')::numeric <> 1000 then raise exception 'FALLO: evitable'; end if;
  if (rep->'total'->>'unidades_sin_costo')::numeric <> 1 then raise exception 'FALLO: sin costo'; end if;
  if json_array_length(rep->'por_motivo') <> 2 then raise exception 'FALLO: por motivo'; end if;
  if json_array_length(public.mermas_del_dia('2026-10-10')) <> 3 then raise exception 'FALLO: lista del día'; end if;
  execute 'reset role';

  -- Admin sin "ver costos": registra y ve cantidades, pero no pesos
  update public.permisos_admin set ver_costos = false;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.mermas (fecha, producto_id, cantidad, motivo_id, evitable) values ('2026-10-10', p_dan, 1, mot_bota, true);
  rep := public.reporte_mermas('2026-10-10', '2026-10-10');
  if rep->'total'->>'valor' is not null or (rep->'total'->>'unidades')::numeric <> 9 then
    raise exception 'FALLO: admin sin costos ve %', rep->'total';
  end if;
  if public.mermas_del_dia('2026-10-10')::text ~ '"valor"\s*:\s*[0-9]' then raise exception 'FALLO: admin ve valores'; end if;
  execute 'reset role';
  update public.permisos_admin set ver_costos = true;

  -- Encargada: ni registra ni ve mermas
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.mermas (fecha, producto_id, cantidad, motivo_id, evitable) values ('2026-10-10', p_dan, 1, mot_bota, true);
    raise exception 'FALLO: encargada registró una merma';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.mermas;
  if n <> 0 then raise exception 'FALLO: encargada ve mermas'; end if;
  begin
    perform public.reporte_mermas('2026-10-10', '2026-10-10');
    raise exception 'FALLO: encargada vio el reporte';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  despues := public.panel('2026-10-10', '2026-10-10', null, null);
  if despues->'resumen'->>'mermas' is not null then raise exception 'FALLO: encargada ve mermas en el panel'; end if;
  execute 'reset role';

  raise exception 'TODAS LAS PRUEBAS OK (cambios deshechos). Mermas antes: %',
    antes->'resumen'->>'mermas';
end $$;
