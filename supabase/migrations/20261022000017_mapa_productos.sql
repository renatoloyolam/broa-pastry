-- =====================================================================
-- Mapa de productos: cuánto se vende y cuánto deja cada producto.
-- La clasificación (estrella, popular de bajo margen, rentable poco
-- vendido, débil) se hace en la app (src/lib/mapa.ts).
-- Requiere ver_costos (igual que la ganancia por producto del Inicio).
-- =====================================================================

create or replace function public.mapa_productos(p_desde date, p_hasta date)
returns json
language plpgsql stable security definer set search_path = ''
as $$
declare
  divisor numeric;
begin
  if not private.tiene_permiso('ver_costos') then
    raise exception 'No tienes permiso para ver costos.';
  end if;
  if p_hasta < p_desde or p_hasta - p_desde > 400 then
    raise exception 'El rango de fechas no es válido (máximo 400 días).';
  end if;
  select case when c.precios_incluyen_iva and c.margen_sobre_neto then 1 + c.tasa_iva else 1 end
  into divisor from public.configuracion c;

  return json_build_object(
    'divisor', divisor,
    'productos', coalesce((
      select json_agg(x order by x.unidades desc)
      from (
        select p.id, p.nombre, coalesce(c.nombre, 'Sin categoría') as categoria,
               count(*) as unidades,
               round(sum(l.monto)) as ventas,
               round(sum(l.monto / divisor), 2) as ventas_netas,
               round(sum(l.costo), 2) as costo,
               bool_and(l.costo is not null) as completo
        from private.lineas_costeadas(p_desde, p_hasta) l
        join public.productos p on p.id = l.producto_id
        left join public.categorias c on c.id = p.categoria_id
        where l.tipo = 'producto'
        group by p.id, p.nombre, c.nombre
      ) x), '[]'::json),
    -- Productos activos que no se vendieron en el período
    'sin_ventas', coalesce((
      select json_agg(json_build_object('id', p.id, 'nombre', p.nombre, 'categoria', coalesce(c.nombre, 'Sin categoría'))
                      order by c.orden nulls last, p.nombre)
      from public.productos p
      left join public.categorias c on c.id = p.categoria_id
      where p.activo and p.tipo = 'producto'
        and not exists (select 1 from public.venta_lineas l where l.producto_id = p.id and l.fecha between p_desde and p_hasta)), '[]'::json),
    'ultimo_dia', (select max(fecha) from public.ventas where fecha between p_desde and p_hasta)
  );
end;
$$;
revoke all on function public.mapa_productos(date, date) from public, anon;
grant execute on function public.mapa_productos(date, date) to authenticated;
