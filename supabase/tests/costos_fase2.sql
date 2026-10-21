-- Prueba de la Fase 2: cálculo de costos por receta, historial y seguridad.
-- Todo ocurre dentro de una transacción que se deshace al final.
-- Resultado esperado: "TODAS LAS PRUEBAS OK (cambios deshechos)".
do $$
declare
  u_dueno uuid := '00000000-0000-0000-0000-0000000000d2';
  u_admin uuid := '00000000-0000-0000-0000-0000000000a2';
  u_enc   uuid := '00000000-0000-0000-0000-0000000000e2';
  i_harina bigint; i_mante bigint; i_huevo bigint; i_cacao bigint;
  r_masa bigint; r_brownie bigint;
  p_brownie bigint; p_galletas bigint; o_nuez bigint;
  d_brownie bigint; d_nuez bigint;
  c numeric; n int;
begin
  insert into auth.users (id, email, aud, role) values
    (u_dueno, 'd2@prueba.test', 'authenticated', 'authenticated'),
    (u_admin, 'a2@prueba.test', 'authenticated', 'authenticated'),
    (u_enc,   'e2@prueba.test', 'authenticated', 'authenticated');
  insert into public.perfiles (id, nombre, email, rol) values
    (u_dueno, 'Dueño', 'd2@prueba.test', 'dueno'),
    (u_admin, 'Admin', 'a2@prueba.test', 'admin'),
    (u_enc, 'Encargada', 'e2@prueba.test', 'encargada');

  -- ===== Como dueño: armar catálogo y recetas =====
  perform set_config('request.jwt.claims', json_build_object('sub', u_dueno, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.productos (nombre, categoria_id, precio_referencia)
  values ('Brownie de prueba', (select id from public.categorias where nombre = 'Galletería'), 2200)
  returning id into p_brownie;

  -- Caso del documento: brownie a mano, costo $50
  insert into public.costo_definiciones (producto_id, modo, costo_manual_neto)
  values (p_brownie, 'manual', 50) returning id into d_brownie;
  select costo_vigente into c from public.v_costos where definicion_id = d_brownie;
  if c <> 50 then raise exception 'FALLO: costo manual esperado 50, obtuve %', c; end if;
  if (select vigente_desde from public.costo_versiones where definicion_id = d_brownie) <> date '2000-01-01' then
    raise exception 'FALLO: el primer costo debería regir desde siempre';
  end if;

  -- Ingredientes (precios netos)
  insert into public.ingredientes (nombre, cantidad_compra, unidad_compra, precio_compra_neto)
  values ('Harina prueba', 25, 'kg', 18000) returning id into i_harina;
  insert into public.ingredientes (nombre, cantidad_compra, unidad_compra, precio_compra_neto)
  values ('Mantequilla prueba', 1, 'kg', 8000) returning id into i_mante;
  insert into public.ingredientes (nombre, cantidad_compra, unidad_compra, precio_compra_neto)
  values ('Huevo prueba', 30, 'un', 6000) returning id into i_huevo;
  insert into public.ingredientes (nombre, cantidad_compra, unidad_compra, precio_compra_neto)
  values ('Cacao prueba', 1, 'kg', 12000) returning id into i_cacao;

  -- Receta base: masa, rinde 1 kg. 600 g harina ($432) + 400 g mantequilla ($3.200) = $3.632
  insert into public.recetas (nombre, rendimiento, unidad_rendimiento, es_base)
  values ('Masa prueba', 1, 'kg', true) returning id into r_masa;
  insert into public.receta_items (receta_id, ingrediente_id, cantidad, unidad) values
    (r_masa, i_harina, 600, 'g'), (r_masa, i_mante, 400, 'g');
  select costo_total into c from public.v_recetas where id = r_masa;
  if c <> 3632 then raise exception 'FALLO: masa esperada $3.632, obtuve %', c; end if;

  -- Brownie: 500 g masa ($1.816) + 3 huevos ($600) + 100 g cacao ($1.200)
  --          + mano de obra $2.400 = $6.016, rinde 12 → $501,33 c/u
  insert into public.recetas (nombre, rendimiento, unidad_rendimiento)
  values ('Brownie prueba', 12, 'un') returning id into r_brownie;
  insert into public.receta_items (receta_id, subreceta_id, cantidad, unidad) values (r_brownie, r_masa, 500, 'g');
  insert into public.receta_items (receta_id, ingrediente_id, cantidad, unidad) values
    (r_brownie, i_huevo, 3, 'un'), (r_brownie, i_cacao, 100, 'g');
  insert into public.receta_adicionales (receta_id, concepto, monto_neto) values (r_brownie, 'Mano de obra', 2400);
  select costo_unitario into c from public.v_recetas where id = r_brownie;
  if round(c, 2) <> 501.33 then raise exception 'FALLO: brownie esperado $501,33, obtuve %', c; end if;

  -- El producto pasa de costo manual a receta + $50 de packaging → $551,33
  update public.costo_definiciones set modo = 'receta', receta_id = r_brownie where id = d_brownie;
  insert into public.costo_adicionales (definicion_id, concepto, monto_neto) values (d_brownie, 'Caja', 50);
  select costo_vigente into c from public.v_costos where definicion_id = d_brownie;
  if c <> 551.33 then raise exception 'FALLO: brownie con caja esperado 551.33, obtuve %', c; end if;
  -- El costo de antes ($50) se conserva para las ventas pasadas
  -- (costo_vigente es interna: un usuario no la puede llamar directo)
  execute 'reset role';
  if private.costo_vigente(d_brownie, date '2026-01-01') <> 50 then
    raise exception 'FALLO: el historial no conservó el costo anterior';
  end if;
  if private.costo_vigente(d_brownie, private.hoy()) <> 551.33 then
    raise exception 'FALLO: el costo de hoy no es el nuevo';
  end if;
  execute 'set local role authenticated';

  -- Sube la harina: masa = 600 g × $1/g + $3.200 = $3.800 → brownie (1.900+600+1.200+2.400)/12 + 50 = $558,33
  update public.ingredientes set precio_compra_neto = 25000 where id = i_harina;
  select costo_vigente into c from public.v_costos where definicion_id = d_brownie;
  if c <> 558.33 then raise exception 'FALLO: tras subir la harina esperaba 558.33, obtuve %', c; end if;
  select count(*) into n from public.ingrediente_precios where ingrediente_id = i_harina;
  if n <> 2 then raise exception 'FALLO: historial de precio de harina tiene % filas', n; end if;

  -- Unidades incompatibles (ml de algo que se compra en kg) → incompleto, no se inventa costo
  insert into public.receta_items (receta_id, ingrediente_id, cantidad, unidad) values (r_brownie, i_cacao, 10, 'ml');
  select costo_calculado into c from public.v_costos where definicion_id = d_brownie;
  if c is not null then raise exception 'FALLO: unidades incompatibles deberían dejar el costo incompleto'; end if;
  select costo_vigente into c from public.v_costos where definicion_id = d_brownie;
  if c <> 558.33 then raise exception 'FALLO: con receta incompleta se debe mantener el último costo válido'; end if;
  delete from public.receta_items where receta_id = r_brownie and unidad = 'ml';

  -- Ciclo de recetas prohibido
  begin
    insert into public.receta_items (receta_id, subreceta_id, cantidad, unidad) values (r_masa, r_brownie, 1, 'un');
    raise exception 'FALLO: se permitió un ciclo de recetas';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;

  -- Modelo producto + opciones: Galletas (sin costo propio) + opción Galleta nuez $120
  insert into public.productos (nombre, categoria_id) values ('Galletas prueba', 1) returning id into p_galletas;
  insert into public.opciones (producto_id, nombre, precio_referencia) values (p_galletas, 'Galleta  Nuez ', 500)
  returning id into o_nuez;
  insert into public.costo_definiciones (producto_id, modo) values (p_galletas, 'cero');
  insert into public.costo_definiciones (opcion_id, modo, costo_manual_neto) values (o_nuez, 'manual', 120)
  returning id into d_nuez;
  if (select nombre_normalizado from public.opciones where id = o_nuez) <> 'galleta nuez' then
    raise exception 'FALLO: normalización de nombres';
  end if;
  execute 'reset role';

  -- ===== Encargada: no ve NADA de costos =====
  perform set_config('request.jwt.claims', json_build_object('sub', u_enc, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.productos where id in (p_brownie, p_galletas);
  if n <> 2 then raise exception 'FALLO: encargada no ve los productos'; end if;
  select (select count(*) from public.ingredientes) + (select count(*) from public.recetas)
       + (select count(*) from public.receta_items) + (select count(*) from public.receta_adicionales)
       + (select count(*) from public.costo_definiciones) + (select count(*) from public.costo_adicionales)
       + (select count(*) from public.costo_versiones) + (select count(*) from public.ingrediente_precios)
       + (select count(*) from public.v_costos) + (select count(*) from public.v_recetas)
  into n;
  if n <> 0 then raise exception 'FALLO: encargada ve % filas de costos', n; end if;
  update public.ingredientes set precio_compra_neto = 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: encargada modificó ingredientes'; end if;
  update public.productos set nombre = 'hackeado' where id = p_brownie;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: encargada modificó productos'; end if;
  begin
    perform public.aplicar_cambios_desde(date '2026-01-01');
    raise exception 'FALLO: encargada usó aplicar_cambios_desde';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  execute 'reset role';

  -- ===== Admin con permiso ve costos; sin permiso, nada =====
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.v_costos where definicion_id = d_brownie;
  if n <> 1 then raise exception 'FALLO: admin con permiso no ve costos'; end if;
  execute 'reset role';
  update public.permisos_admin set ver_costos = false;
  execute 'set local role authenticated';
  select count(*) into n from public.costo_versiones;
  if n <> 0 then raise exception 'FALLO: admin sin permiso ve costos'; end if;
  insert into public.productos (nombre) values ('Producto admin sin ver costos'); -- sí puede editar catálogo
  begin
    insert into public.ingredientes (nombre, cantidad_compra, unidad_compra, precio_compra_neto)
    values ('x', 1, 'kg', 1);
    raise exception 'FALLO: admin sin ver costos creó un ingrediente';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  update public.permisos_admin set ver_costos = true;

  -- ===== Corrección hacia atrás =====
  -- Simulamos que el $50 manual era de ayer: movemos la versión inicial a una fecha intermedia
  perform set_config('request.jwt.claims', json_build_object('sub', u_dueno, 'role', 'authenticated')::text, true);
  execute 'reset role';
  insert into public.costo_versiones (definicion_id, vigente_desde, costo_neto)
  values (d_brownie, private.hoy() - 10, 300);
  execute 'set local role authenticated';
  n := public.aplicar_cambios_desde(private.hoy() - 20);
  execute 'reset role';
  if private.costo_vigente(d_brownie, private.hoy() - 15) <> 558.33 then
    raise exception 'FALLO: la corrección no rige desde la fecha indicada';
  end if;
  if private.costo_vigente(d_brownie, private.hoy() - 25) <> 50 then
    raise exception 'FALLO: la corrección borró historia anterior a la fecha';
  end if;
  if exists (select 1 from public.costo_versiones where definicion_id = d_brownie and costo_neto = 300) then
    raise exception 'FALLO: quedó una versión intermedia que debía reemplazarse';
  end if;

  raise exception 'TODAS LAS PRUEBAS OK (cambios deshechos)';
end $$;
