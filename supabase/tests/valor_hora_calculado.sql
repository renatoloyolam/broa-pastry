-- Prueba del valor hora calculado desde trabajadores y gastos. Se deshace al final.
do $$
declare
  u uuid := '00000000-0000-0000-0000-0000000000f6';
  a uuid := '00000000-0000-0000-0000-0000000000f7';
  e uuid := '00000000-0000-0000-0000-0000000000f8';
  t1 bigint; t2 bigint; v_rec bigint; c1 numeric; n int; vh record;
begin
  insert into auth.users (id, email, aud, role) values
    (u, 'f6@prueba.test', 'authenticated', 'authenticated'),
    (a, 'f7@prueba.test', 'authenticated', 'authenticated'),
    (e, 'f8@prueba.test', 'authenticated', 'authenticated');
  insert into public.perfiles (id, nombre, email, rol) values
    (u, 'D', 'f6@prueba.test', 'dueno'), (a, 'A', 'f7@prueba.test', 'admin'), (e, 'E', 'f8@prueba.test', 'encargada');
  delete from public.costo_trabajadores;
  delete from public.costo_gif;

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.valores_hora set calcular = false, mano_obra = 1000, gif = 500, dias_mes = 26, horas_dia = 8;

  -- Sin trabajadores no se puede activar
  begin
    update public.valores_hora set calcular = true;
    raise exception 'FALLO: activó sin trabajadores';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;

  -- $704.000 en 176 h = $4.000/h; $480.000 en 160 h = $3.000/h → promedio $3.500
  insert into public.costo_trabajadores (nombre, horas_dia, dias_mes, costo_mensual) values ('Uno', 8, 22, 704000) returning id into t1;
  insert into public.costo_trabajadores (nombre, horas_dia, dias_mes, costo_mensual) values ('Dos', 8, 20, 480000) returning id into t2;
  -- $416.000 de gastos ÷ 26 ÷ 8 = $2.000/h ÷ 2 personas = $1.000
  insert into public.costo_gif (concepto, tipo, monto_mensual) values ('Arriendo', 'fijo', 300000), ('Luz', 'variable', 116000);

  -- Mientras está a mano, nada cambia
  if (select mano_obra from public.valores_hora) <> 1000 then raise exception 'FALLO: cambió estando a mano'; end if;

  v_rec := public.guardar_receta(null, 'Prueba valor hora', 10, 'un', false, null, '[]'::jsonb, '[]'::jsonb, 1, 1);
  update public.valores_hora set calcular = true;
  select * into vh from public.valores_hora;
  if vh.mano_obra <> 3500 or vh.gif <> 1000 then raise exception 'FALLO: calculado % %', vh.mano_obra, vh.gif; end if;
  select costo_unitario into c1 from public.v_recetas where id = v_rec;
  if abs(c1 - 450) > 0.01 then raise exception 'FALLO: receta no se recalculó %', c1; end if;

  -- Sacar a alguien del cálculo cambia el promedio y el divisor del G.I.F.
  update public.costo_trabajadores set incluir = false where id = t2;
  select * into vh from public.valores_hora;
  if vh.mano_obra <> 4000 or vh.gif <> 2000 then raise exception 'FALLO: al excluir % %', vh.mano_obra, vh.gif; end if;

  -- Cambiar días y horas del local
  update public.valores_hora set horas_dia = 10;
  if (select gif from public.valores_hora) <> 1600 then raise exception 'FALLO: horas del local'; end if;

  -- Escribir a mano estando en cálculo no tiene efecto
  update public.valores_hora set mano_obra = 1;
  if (select mano_obra from public.valores_hora) <> 4000 then raise exception 'FALLO: se pudo escribir a mano'; end if;

  -- No se puede quedar sin trabajadores incluidos
  begin
    delete from public.costo_trabajadores where id = t1;
    raise exception 'FALLO: borró al último';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;

  -- Volver a mano deja el último valor
  update public.valores_hora set calcular = false, mano_obra = 4100;
  if (select mano_obra from public.valores_hora) <> 4100 then raise exception 'FALLO: no volvió a mano'; end if;
  execute 'reset role';

  -- Admin sin finanzas y encargada no ven sueldos
  update public.permisos_admin set gestionar_finanzas = false;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.costo_trabajadores;
  if n <> 0 then raise exception 'FALLO: admin sin finanzas ve sueldos'; end if;
  begin
    insert into public.costo_gif (concepto, monto_mensual) values ('x', 1);
    raise exception 'FALLO: admin sin finanzas agregó gastos';
  exception when insufficient_privilege then null; end;
  -- Sigue viendo el resultado (lo necesita para las recetas)
  if (select mano_obra from public.valores_hora) <> 4100 then raise exception 'FALLO: admin no ve el valor hora'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.costo_trabajadores;
  if n <> 0 then raise exception 'FALLO: encargada ve sueldos'; end if;
  select count(*) into n from public.costo_gif;
  if n <> 0 then raise exception 'FALLO: encargada ve gastos'; end if;
  execute 'reset role';

  raise exception 'TODAS LAS PRUEBAS OK';
end $$;
