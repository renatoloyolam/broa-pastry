-- Prueba de seguridad de la Fase 1.
-- Crea usuarios ficticios DENTRO de una transacción y al final lanza una
-- excepción a propósito para deshacer todo. Si todo está bien, el mensaje
-- final es "TODAS LAS PRUEBAS OK". Si algo falla, el mensaje dice qué.
do $$
declare
  u_dueno uuid := '00000000-0000-0000-0000-0000000000d1';
  u_admin uuid := '00000000-0000-0000-0000-0000000000a1';
  u_enc   uuid := '00000000-0000-0000-0000-0000000000e1';
  u_nadie uuid := '00000000-0000-0000-0000-0000000000f1';
  n int;
  s json;
  ok boolean;
begin
  if exists (select 1 from public.perfiles) then
    raise exception 'Esta prueba solo corre con la base vacía de perfiles';
  end if;

  insert into auth.users (id, email, aud, role)
  values (u_dueno, 'dueno@prueba.test', 'authenticated', 'authenticated'),
         (u_admin, 'admin@prueba.test', 'authenticated', 'authenticated'),
         (u_enc,   'enc@prueba.test',   'authenticated', 'authenticated'),
         (u_nadie, 'nadie@prueba.test', 'authenticated', 'authenticated');

  -- 1. El primero en reclamar se vuelve dueño
  perform set_config('request.jwt.claims', json_build_object('sub', u_dueno, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.reclamar_dueno('Dueño Prueba');
  execute 'reset role';

  -- 2. Un segundo intento falla
  perform set_config('request.jwt.claims', json_build_object('sub', u_nadie, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.reclamar_dueno('Intruso');
    raise exception 'FALLO: un segundo usuario pudo reclamar dueño';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  -- Usuario sin perfil no ve nada
  select count(*) into n from public.configuracion;
  if n <> 0 then raise exception 'FALLO: usuario sin perfil ve configuración'; end if;
  select count(*) into n from public.permisos_admin;
  if n <> 0 then raise exception 'FALLO: usuario sin perfil ve permisos'; end if;
  execute 'reset role';

  -- Perfiles de prueba (como lo haría la Edge Function)
  insert into public.perfiles (id, nombre, email, rol)
  values (u_admin, 'Admin Prueba', 'admin@prueba.test', 'admin'),
         (u_enc, 'Encargada Prueba', 'enc@prueba.test', 'encargada');

  -- 3. Encargada
  perform set_config('request.jwt.claims', json_build_object('sub', u_enc, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  s := public.mi_sesion();
  if (s->'permisos')::text <> '["ver_ventas"]' then
    raise exception 'FALLO: encargada tiene permisos de más: %', s->'permisos';
  end if;
  select count(*) into n from public.perfiles;
  if n <> 1 then raise exception 'FALLO: encargada ve % perfiles', n; end if;
  select count(*) into n from public.permisos_admin;
  if n <> 0 then raise exception 'FALLO: encargada ve permisos de admin'; end if;
  select count(*) into n from public.configuracion;
  if n <> 1 then raise exception 'FALLO: encargada no ve configuración'; end if;
  update public.configuracion set minutos_inactividad = 600;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: encargada editó configuración'; end if;
  update public.perfiles set rol = 'dueno' where id = u_enc;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: encargada se cambió el rol'; end if;
  begin
    insert into public.perfiles (id, nombre, email, rol) values (u_nadie, 'x', 'x', 'dueno');
    raise exception 'FALLO: encargada insertó un perfil';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  -- 4. Administradora
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  s := public.mi_sesion();
  if (s->'permisos')::jsonb ? 'gestionar_usuarios' then
    raise exception 'FALLO: admin puede gestionar usuarios';
  end if;
  if not (s->'permisos')::jsonb ? 'ver_costos' then
    raise exception 'FALLO: admin no ve costos por defecto';
  end if;
  update public.permisos_admin set editar_configuracion = true;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: admin se dio permisos'; end if;
  update public.configuracion set minutos_inactividad = 600;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: admin editó configuración sin permiso'; end if;
  execute 'reset role';

  -- 5. Dueño quita "ver costos" a la admin y ella lo pierde
  perform set_config('request.jwt.claims', json_build_object('sub', u_dueno, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.permisos_admin set ver_costos = false;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO: dueño no pudo editar permisos'; end if;
  select count(*) into n from public.perfiles;
  if n <> 3 then raise exception 'FALLO: dueño ve % perfiles (esperaba 3)', n; end if;
  -- El dueño no puede desactivarse a sí mismo
  begin
    update public.perfiles set activo = false where id = u_dueno;
    raise exception 'FALLO: dueño se desactivó a sí mismo';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  -- Desactiva a la encargada
  update public.perfiles set activo = false where id = u_enc;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select private.tiene_permiso('ver_costos') into ok;
  if ok then raise exception 'FALLO: admin sigue viendo costos tras quitarle el permiso'; end if;
  execute 'reset role';

  -- 6. Encargada desactivada no ve nada
  perform set_config('request.jwt.claims', json_build_object('sub', u_enc, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.configuracion;
  if n <> 0 then raise exception 'FALLO: usuaria desactivada ve configuración'; end if;
  execute 'reset role';

  -- 7. Anónimo no ve nada
  execute 'set local role anon';
  begin
    select count(*) into n from public.configuracion;
    raise exception 'FALLO: anónimo leyó configuración';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.mi_sesion();
    raise exception 'FALLO: anónimo ejecutó mi_sesion';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  raise exception 'TODAS LAS PRUEBAS OK (cambios deshechos)';
end $$;
