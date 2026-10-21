-- =====================================================================
-- Fase 2 (b): guardado en un solo paso y ajuste del primer costo
-- =====================================================================

-- Si el primer costo de algo (vigente "desde siempre") se ajusta el mismo
-- día en que se creó, se corrige esa misma versión en vez de crear otra.
-- Así, definir un costo y luego agregarle la caja o corregir un dígito sigue
-- rigiendo para todas las ventas pasadas.
create or replace function private.recalcular_costos()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  d record;
  actual numeric;
  ultima record;
  hoy date := private.hoy();
begin
  for d in select id from public.costo_definiciones loop
    actual := round(private.costo_definicion(d.id), 2);
    if actual is null then
      continue;
    end if;
    select id, vigente_desde, costo_neto, registrado_en into ultima
    from public.costo_versiones
    where definicion_id = d.id
    order by vigente_desde desc
    limit 1;
    if not found then
      insert into public.costo_versiones (definicion_id, vigente_desde, costo_neto)
      values (d.id, date '2000-01-01', actual);
    elsif ultima.costo_neto <> actual then
      if ultima.vigente_desde = date '2000-01-01'
         and (ultima.registrado_en at time zone 'America/Santiago')::date = hoy then
        update public.costo_versiones set costo_neto = actual, registrado_en = now() where id = ultima.id;
      else
        insert into public.costo_versiones (definicion_id, vigente_desde, costo_neto)
        values (d.id, greatest(hoy, ultima.vigente_desde), actual)
        on conflict (definicion_id, vigente_desde)
        do update set costo_neto = excluded.costo_neto, registrado_en = now();
      end if;
    end if;
  end loop;
end;
$$;

-- Guarda la definición de costo de un producto u opción con sus adicionales.
-- SECURITY INVOKER: las reglas RLS de quien llama siguen aplicando.
-- p_adicionales: [{"concepto": "Caja", "monto_neto": 50}, ...]
create or replace function public.guardar_costo(
  p_producto_id bigint,
  p_opcion_id bigint,
  p_modo public.modo_costo,
  p_costo_manual_neto numeric,
  p_receta_id bigint,
  p_cantidad_receta numeric,
  p_adicionales jsonb
)
returns bigint
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id bigint;
begin
  if (p_producto_id is null) = (p_opcion_id is null) then
    raise exception 'Indica un producto o una opción.';
  end if;
  select id into v_id from public.costo_definiciones
  where (p_producto_id is not null and producto_id = p_producto_id)
     or (p_opcion_id is not null and opcion_id = p_opcion_id);

  if v_id is null then
    insert into public.costo_definiciones (producto_id, opcion_id, modo, costo_manual_neto, receta_id, cantidad_receta)
    values (p_producto_id, p_opcion_id, p_modo,
            case when p_modo = 'manual' then p_costo_manual_neto end,
            case when p_modo = 'receta' then p_receta_id end,
            coalesce(p_cantidad_receta, 1))
    returning id into v_id;
  else
    update public.costo_definiciones set
      modo = p_modo,
      costo_manual_neto = case when p_modo = 'manual' then p_costo_manual_neto end,
      receta_id = case when p_modo = 'receta' then p_receta_id end,
      cantidad_receta = coalesce(p_cantidad_receta, 1)
    where id = v_id;
  end if;
  if v_id is null then
    raise exception 'No tienes permiso para cambiar costos.';
  end if;

  delete from public.costo_adicionales where definicion_id = v_id;
  insert into public.costo_adicionales (definicion_id, concepto, monto_neto)
  select v_id, trim(a->>'concepto'), (a->>'monto_neto')::numeric
  from jsonb_array_elements(coalesce(p_adicionales, '[]'::jsonb)) a
  where trim(coalesce(a->>'concepto', '')) <> '';
  return v_id;
end;
$$;
revoke all on function public.guardar_costo(bigint, bigint, public.modo_costo, numeric, bigint, numeric, jsonb) from public, anon;
grant execute on function public.guardar_costo(bigint, bigint, public.modo_costo, numeric, bigint, numeric, jsonb) to authenticated;

-- Guarda una receta completa (datos, ingredientes y adicionales).
-- p_items: [{"ingrediente_id": 1, "cantidad": 600, "unidad": "g"}, {"subreceta_id": 3, ...}]
create or replace function public.guardar_receta(
  p_id bigint,
  p_nombre text,
  p_rendimiento numeric,
  p_unidad_rendimiento public.unidad,
  p_es_base boolean,
  p_notas text,
  p_items jsonb,
  p_adicionales jsonb
)
returns bigint
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id bigint := p_id;
begin
  if v_id is null then
    insert into public.recetas (nombre, rendimiento, unidad_rendimiento, es_base, notas)
    values (trim(p_nombre), p_rendimiento, p_unidad_rendimiento, p_es_base, nullif(trim(p_notas), ''))
    returning id into v_id;
  else
    update public.recetas set
      nombre = trim(p_nombre), rendimiento = p_rendimiento, unidad_rendimiento = p_unidad_rendimiento,
      es_base = p_es_base, notas = nullif(trim(p_notas), '')
    where id = v_id
    returning id into v_id;
  end if;
  if v_id is null then
    raise exception 'No tienes permiso para editar recetas.';
  end if;

  delete from public.receta_items where receta_id = v_id;
  insert into public.receta_items (receta_id, ingrediente_id, subreceta_id, cantidad, unidad, orden)
  select v_id, (i->>'ingrediente_id')::bigint, (i->>'subreceta_id')::bigint,
         (i->>'cantidad')::numeric, (i->>'unidad')::public.unidad, ord::int
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(i, ord);

  delete from public.receta_adicionales where receta_id = v_id;
  insert into public.receta_adicionales (receta_id, concepto, monto_neto)
  select v_id, trim(a->>'concepto'), (a->>'monto_neto')::numeric
  from jsonb_array_elements(coalesce(p_adicionales, '[]'::jsonb)) a
  where trim(coalesce(a->>'concepto', '')) <> '';
  return v_id;
end;
$$;
revoke all on function public.guardar_receta(bigint, text, numeric, public.unidad, boolean, text, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_receta(bigint, text, numeric, public.unidad, boolean, text, jsonb, jsonb) to authenticated;
