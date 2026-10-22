-- Prueba del resumen semanal: textos según permisos, suscripciones propias y funciones protegidas. Se deshace al final.
do $$
declare
  u uuid := '00000000-0000-0000-0000-0000000000df';
  e uuid := '00000000-0000-0000-0000-0000000000ef';
  t json; n int;
begin
  insert into auth.users (id, email, aud, role) values
    (u, 'df@prueba.test', 'authenticated', 'authenticated'), (e, 'ef@prueba.test', 'authenticated', 'authenticated');
  insert into public.perfiles (id, nombre, email, rol) values (u, 'D', 'df@prueba.test', 'dueno'), (e, 'E', 'ef@prueba.test', 'encargada');

  -- Texto para la encargada: ventas sí, ganancia no
  t := public.texto_resumen_semanal(e, '2026-10-12');
  if t->>'cuerpo' not like 'Vendiste%' or t->>'cuerpo' like '%Ganancia%' then raise exception 'FALLO: texto encargada %', t; end if;
  t := public.texto_resumen_semanal(u, '2026-10-12');
  if t->>'cuerpo' not like '%Ganancia%' then raise exception 'FALLO: texto dueño %', t; end if;
  perform set_config('request.jwt.claims', '', true);

  -- La encargada registra su teléfono y solo ve el suyo
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.registrar_push('https://push.example/e1', 'k', 'a', 'iPhone');
  select count(*) into n from public.push_suscripciones;
  if n <> 1 then raise exception 'FALLO: suscripciones visibles %', n; end if;
  if public.vapid_publica() is null then raise exception 'FALLO: sin llave pública'; end if;
  -- No puede pedir textos ni la configuración
  begin
    perform public.texto_resumen_semanal(u, '2026-10-12');
    raise exception 'FALLO: encargada pidió el texto de otro';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  begin
    perform public.config_push();
    raise exception 'FALLO: encargada leyó las llaves';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  execute 'reset role';

  -- El dueño no ve el teléfono de la encargada
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.push_suscripciones;
  if n <> 0 then raise exception 'FALLO: dueño ve teléfonos ajenos'; end if;
  execute 'reset role';

  raise exception 'TODAS LAS PRUEBAS OK';
end $$;
