-- Prueba de mano de obra y G.I.F. por horas en recetas, con el valor hora de la planilla. Se deshace al final.
do $$
declare
  u uuid := '00000000-0000-0000-0000-0000000000f2';
  e uuid := '00000000-0000-0000-0000-0000000000f3';
  v_ing bigint; v_base bigint; v_rec bigint; v_prod bigint;
  x numeric; ind numeric; n int; r json;
begin
  insert into auth.users (id, email, aud, role) values
    (u, 'f2@prueba.test', 'authenticated', 'authenticated'), (e, 'f3@prueba.test', 'authenticated', 'authenticated');
  insert into public.perfiles (id, nombre, email, rol) values (u, 'D', 'f2@prueba.test', 'dueno'), (e, 'E', 'f3@prueba.test', 'encargada');
  select id into v_ing from public.ingredientes where nombre = 'Harina 000';
  update public.ingredientes set cantidad_compra = 25, unidad_compra = 'kg', precio_compra_neto = 16650 where id = v_ing;
  select id into v_prod from public.productos where nombre = 'Danesas';

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.valores_hora set mano_obra = 4438.87, gif = 3188.19;

  -- 1 kg de harina ($666) + 5 h de mano de obra + 1 h de G.I.F., rinde 12
  v_rec := public.guardar_receta(null, 'Prueba horas', 12, 'un', false, null,
    jsonb_build_array(jsonb_build_object('ingrediente_id', v_ing, 'cantidad', 1000, 'unidad', 'g')), '[]'::jsonb, 5, 1);
  select costo_unitario into x from public.v_recetas where id = v_rec;
  if abs(x - (666 + 5 * 4438.87 + 3188.19) / 12) > 0.01 then raise exception 'FALLO: costo unitario %', x; end if;

  -- Receta base con horas usada dentro de otra: su mano de obra también cuenta
  v_base := public.guardar_receta(null, 'Prueba base', 1000, 'g', true, null,
    jsonb_build_array(jsonb_build_object('ingrediente_id', v_ing, 'cantidad', 1000, 'unidad', 'g')), '[]'::jsonb, 2, 0);
  perform public.guardar_receta(v_rec, 'Prueba horas', 12, 'un', false, null,
    jsonb_build_array(jsonb_build_object('subreceta_id', v_base, 'cantidad', 500, 'unidad', 'g')), '[]'::jsonb, 5, 1);
  execute 'reset role';
  ind := private.indirecto_receta_unitario(v_rec);
  if abs(ind - (5 * 4438.87 + 3188.19 + 4438.87) / 12) > 0.01 then raise exception 'FALLO: indirecto %', ind; end if;
  execute 'set local role authenticated';

  -- Producto conectado: el costo sube solo si cambia el valor hora
  perform public.guardar_costo(v_prod, null, 'receta', null, v_rec, 1, '[]'::jsonb);
  select costo_calculado into x from public.v_costos where producto_id = v_prod;
  update public.valores_hora set mano_obra = 5000;
  if (select costo_calculado from public.v_costos where producto_id = v_prod) <= x then raise exception 'FALLO: no se recalculó'; end if;

  -- Finanzas separa la parte de mano de obra y G.I.F. del costo vendido
  r := public.finanzas_mes('2026-10-01');
  if (r->'indirecto'->>'ventas')::numeric <= 0 then raise exception 'FALLO: sin indirecto %', r->'indirecto'; end if;
  execute 'reset role';

  -- Encargada: no ve el valor hora ni lo cambia
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.valores_hora;
  if n <> 0 then raise exception 'FALLO: encargada ve el valor hora'; end if;
  update public.valores_hora set mano_obra = 1;
  execute 'reset role';
  if (select mano_obra from public.valores_hora) <> 5000 then raise exception 'FALLO: encargada cambió el valor hora'; end if;

  raise exception 'TODAS LAS PRUEBAS OK';
end $$;
