-- =====================================================================
-- Carga masiva de costos desde la plantilla Excel de la app.
--
-- importar_costos(p_filas) recibe solo las filas que cambiaron:
--   [{producto_id, opcion_id, modo: 'manual'|'cero', costo, mano_obra, otros}]
-- y para cada una deja: modo y costo base, más dos costos adicionales
-- ("Mano de obra y gastos (planilla)" y "Otros costos"). Reemplaza los
-- adicionales anteriores de esa fila.
--
-- Mientras carga, el recálculo de costos se posterga y se hace una sola vez
-- al final (si no, se recalcularía todo el catálogo por cada fila).
-- Las reglas de historial son las de siempre: un costo nuevo rige desde hoy;
-- el primer costo de un producto rige "desde siempre".
-- =====================================================================

create or replace function private.trigger_recalcular()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(current_setting('broa.recalculo_diferido', true), '') = 'si' then
    return null;
  end if;
  perform private.recalcular_costos();
  return null;
end;
$$;

create or replace function public.importar_costos(p_filas jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  f record;
  v_def bigint;
  n integer := 0;
begin
  if not (private.tiene_permiso('ver_costos') and private.tiene_permiso('editar_catalogo')) then
    raise exception 'No tienes permiso para cambiar costos.';
  end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) > 2000 then
    raise exception 'El archivo no tiene un formato válido.';
  end if;

  perform set_config('broa.recalculo_diferido', 'si', true);

  for f in
    select (x->>'producto_id')::bigint as producto_id,
           nullif(x->>'opcion_id', '')::bigint as opcion_id,
           x->>'modo' as modo,
           coalesce((x->>'costo')::numeric, 0) as costo,
           coalesce((x->>'mano_obra')::numeric, 0) as mano_obra,
           coalesce((x->>'otros')::numeric, 0) as otros
    from jsonb_array_elements(p_filas) x
  loop
    if f.modo not in ('manual', 'cero') or f.costo < 0 or f.mano_obra < 0 or f.otros < 0 then
      raise exception 'Hay un valor no válido en la fila del producto %.', f.producto_id;
    end if;
    if not exists (select 1 from public.productos p where p.id = f.producto_id and p.tipo = 'producto') then
      raise exception 'Un producto del archivo ya no existe (código P%).', f.producto_id;
    end if;
    if f.opcion_id is not null and not exists (
      select 1 from public.opciones o where o.id = f.opcion_id and o.producto_id = f.producto_id) then
      raise exception 'Una opción del archivo ya no existe (código O%).', f.opcion_id;
    end if;

    select id into v_def from public.costo_definiciones
    where (f.opcion_id is null and producto_id = f.producto_id)
       or (f.opcion_id is not null and opcion_id = f.opcion_id);

    if v_def is null then
      insert into public.costo_definiciones (producto_id, opcion_id, modo, costo_manual_neto)
      values (case when f.opcion_id is null then f.producto_id end, f.opcion_id, f.modo::public.modo_costo,
              case when f.modo = 'manual' then f.costo end)
      returning id into v_def;
    else
      update public.costo_definiciones
      set modo = f.modo::public.modo_costo,
          costo_manual_neto = case when f.modo = 'manual' then f.costo end,
          receta_id = null,
          cantidad_receta = 1
      where id = v_def;
    end if;

    delete from public.costo_adicionales where definicion_id = v_def;
    insert into public.costo_adicionales (definicion_id, concepto, monto_neto)
    select v_def, c, m from (values ('Mano de obra y gastos (planilla)', f.mano_obra), ('Otros costos', f.otros)) a(c, m)
    where m > 0;
    n := n + 1;
  end loop;

  perform set_config('broa.recalculo_diferido', '', true);
  perform private.recalcular_costos();
  return n;
end;
$$;
revoke all on function public.importar_costos(jsonb) from public, anon;
grant execute on function public.importar_costos(jsonb) to authenticated;
