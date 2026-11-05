-- Prueba de mermas de producción y materia prima. Se deshace al final.
do $$
declare
  u uuid := '00000000-0000-0000-0000-0000000000f4';
  e uuid := '00000000-0000-0000-0000-0000000000f5';
  dia date := '2026-10-10';
  v_ing bigint; v_rec bigint; mot bigint;
  m1 bigint; m2 bigint; m3 bigint; m4 bigint;
  mo numeric := (5 * 4438.87 + 3188.19) / 12 * 6;  -- 6 de 12 unidades
  antes json; despues json; fin0 json; fin1 json; r json; x numeric; n int;
begin
  insert into auth.users (id, email, aud, role) values
    (u, 'f4@prueba.test', 'authenticated', 'authenticated'), (e, 'f5@prueba.test', 'authenticated', 'authenticated');
  insert into public.perfiles (id, nombre, email, rol) values (u, 'D', 'f4@prueba.test', 'dueno'), (e, 'E', 'f5@prueba.test', 'encargada');
  select id into v_ing from public.ingredientes where nombre = 'Harina 000';
  update public.ingredientes set cantidad_compra = 25, unidad_compra = 'kg', precio_compra_neto = 16650 where id = v_ing;
  select id into mot from public.motivos_merma where nombre = 'Se cayó';
  if mot is null then raise exception 'FALLO: falta el motivo Se cayó'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.valores_hora set mano_obra = 4438.87, gif = 3188.19;
  v_rec := public.guardar_receta(null, 'Prueba masa', 12, 'un', true, null,
    jsonb_build_array(jsonb_build_object('ingrediente_id', v_ing, 'cantidad', 1000, 'unidad', 'g')), '[]'::jsonb, 5, 1);
  antes := public.panel(dia, dia, null, null);
  fin0 := public.finanzas_mes('2026-10-01');

  -- Materia prima: 2 kg de harina = $1.332
  m1 := public.registrar_merma_proceso(dia, 'materia_prima', null, v_ing, null, 2, 'kg', mot, true, null, null);
  -- En g también calcula bien
  m2 := public.registrar_merma_proceso(dia, 'materia_prima', null, v_ing, null, 500, 'g', mot, false, null, null);
  if (select valor_insumos from public.mermas_proceso where id = m1) <> 1332 then raise exception 'FALLO: valor materia prima'; end if;
  if (select valor_insumos from public.mermas_proceso where id = m2) <> 333 then raise exception 'FALLO: valor en gramos'; end if;
  perform public.borrar_merma_proceso(m2);

  -- Unidad que no corresponde
  begin
    perform public.registrar_merma_proceso(dia, 'materia_prima', null, v_ing, null, 2, 'un', mot, true, null, null);
    raise exception 'FALLO: aceptó unidad incompatible';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- Fecha futura
  begin
    perform public.registrar_merma_proceso(((now() at time zone 'America/Santiago')::date + 1), 'materia_prima', null, v_ing, null, 2, 'kg', mot, true, null, null);
    raise exception 'FALLO: aceptó fecha futura';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;

  -- Producción: media tanda, separa ingredientes ($333) de mano de obra
  m2 := public.registrar_merma_proceso(dia, 'produccion', v_rec, null, null, 6, 'un', mot, true, 'se cayó', null);
  if (select abs(valor_insumos - 333) from public.mermas_proceso where id = m2) > 0.01 then raise exception 'FALLO: insumos receta'; end if;
  if (select abs(valor_mano_obra - mo) from public.mermas_proceso where id = m2) > 0.01 then raise exception 'FALLO: mano de obra receta'; end if;

  -- Valor congelado: subir el precio no cambia lo registrado
  update public.ingredientes set precio_compra_neto = 99999 where id = v_ing;
  if (select abs(valor_insumos - 333) from public.mermas_proceso where id = m2) > 0.01 then raise exception 'FALLO: valor no congelado'; end if;

  -- Sin receta, con monto estimado
  m3 := public.registrar_merma_proceso(dia, 'produccion', null, null, 'Bandeja de cupcakes', null, null, mot, true, null, 5000);
  if not (select estimado from public.mermas_proceso where id = m3) then raise exception 'FALLO: no quedó estimado'; end if;

  -- Ganancia: producción y materia prima se descuentan completas
  despues := public.panel(dia, dia, null, null);
  x := (despues->'resumen'->>'mermas')::numeric - (antes->'resumen'->>'mermas')::numeric;
  if abs(x - round(1332 + 333 + mo + 5000)) > 1 then raise exception 'FALLO: panel descuenta %', x; end if;

  -- Finanzas: solo se quita la mano de obra para no contar dos veces los sueldos
  fin1 := public.finanzas_mes('2026-10-01');
  x := (fin1->'indirecto'->>'mermas')::numeric - (fin0->'indirecto'->>'mermas')::numeric;
  if abs(x - mo) > 1 then raise exception 'FALLO: finanzas mano de obra %', x; end if;

  -- Insumos: aparece como categoría aparte y solo con ingredientes
  r := public.insumos_periodo(dia, dia);
  select (j->>'insumos')::numeric into x from json_array_elements(r->'uso') j where j->>'categoria' = 'Mermas de producción y materia prima';
  if abs(x - (1332 + 333 + 5000)) > 1 then raise exception 'FALLO: insumos %', x; end if;

  -- Reporte
  r := public.reporte_mermas(dia, dia);
  if (r->'proceso'->>'registros')::int <> 3 then raise exception 'FALLO: registros %', r->'proceso'; end if;
  if abs((r->'proceso'->>'valor')::numeric - round(1332 + 333 + mo + 5000)) > 1 then raise exception 'FALLO: valor %', r->'proceso'; end if;
  -- El día puede tener mermas de producto terminado: la mano de obra perdida es al menos la de esta receta
  if (r->'perdida'->>'mano_obra')::numeric < mo - 1 then raise exception 'FALLO: pérdida %', r->'perdida'; end if;
  if json_array_length(r->'proceso'->'por_etapa') <> 2 then raise exception 'FALLO: por etapa'; end if;
  execute 'reset role';

  -- Encargada: anota cantidades, no ve pesos ni escribe montos
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.opciones_merma_proceso();
  if r::text ~* 'precio|costo' then raise exception 'FALLO: opciones con precios'; end if;
  if json_array_length(r->'recetas') = 0 then raise exception 'FALLO: encargada sin recetas'; end if;
  m4 := public.registrar_merma_proceso(dia, 'materia_prima', null, v_ing, null, 1, 'kg', mot, true, null, null);
  begin
    perform public.registrar_merma_proceso(dia, 'produccion', null, null, 'Algo', null, null, mot, true, null, 1000);
    raise exception 'FALLO: encargada escribió un monto';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  m1 := public.registrar_merma_proceso(dia, 'produccion', null, null, 'Masa sin receta', null, null, mot, true, null, null);
  select count(*) into n from public.mermas_proceso;
  if n <> 0 then raise exception 'FALLO: encargada lee la tabla'; end if;
  r := public.mermas_proceso_del_dia(dia);
  if json_array_length(r) <> 5 then raise exception 'FALLO: lista encargada %', r; end if;
  if r::text ~ '"valor"\s*:\s*[0-9]' or r::text ~ '"mano_obra"\s*:\s*[0-9]' then raise exception 'FALLO: encargada ve valores %', r; end if;
  r := public.reporte_mermas(dia, dia);
  if r->'proceso'->>'valor' is not null or r->>'perdida' is not null then raise exception 'FALLO: reporte con pesos %', r; end if;
  if (r->'proceso'->'por_item')::text ~ '"valor"\s*:\s*[0-9]' then raise exception 'FALLO: ítems con pesos'; end if;
  begin
    perform public.valorizar_merma_proceso(m1, 1000);
    raise exception 'FALLO: encargada valorizó';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin
    update public.mermas_proceso set valor_insumos = 1 where id = m1;
    raise exception 'FALLO: encargada editó la tabla';
  exception when insufficient_privilege then null; end;
  if json_array_length(public.mermas_por_valorizar()) <> 0 then raise exception 'FALLO: encargada ve pendientes'; end if;
  -- También registra producto terminado, sin ver su valor
  insert into public.mermas (fecha, producto_id, cantidad, motivo_id, evitable)
  values (dia, (select id from public.productos where nombre = 'Danesas'), 1, mot, true);
  if public.mermas_del_dia(dia)::text ~ '"valor"\s*:\s*[0-9]' then raise exception 'FALLO: encargada ve valor de producto'; end if;
  if public.panel(dia, dia, null, null)->'resumen'->>'mermas' is not null then raise exception 'FALLO: encargada ve mermas en el panel'; end if;
  execute 'reset role';

  -- Lo pendiente llega al dueño, que le pone monto; no cuenta hasta entonces
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if json_array_length(public.mermas_por_valorizar()) <> 1 then raise exception 'FALLO: pendientes'; end if;
  if not public.alertas()::text like '%mermas_por_valorizar%' then raise exception 'FALLO: sin alerta'; end if;
  x := (public.panel(dia, dia, null, null)->'resumen'->>'mermas')::numeric;
  perform public.valorizar_merma_proceso(m1, 2000);
  if abs((public.panel(dia, dia, null, null)->'resumen'->>'mermas')::numeric - x - 2000) > 1 then raise exception 'FALLO: valorizar no sumó'; end if;
  if public.alertas()::text like '%mermas_por_valorizar%' then raise exception 'FALLO: alerta sigue'; end if;
  begin
    perform public.valorizar_merma_proceso(m1, 3000);
    raise exception 'FALLO: valorizó dos veces';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  execute 'reset role';

  raise exception 'TODAS LAS PRUEBAS OK';
end $$;
