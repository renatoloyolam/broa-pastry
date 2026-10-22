-- =====================================================================
-- Mapa de calor: ventas por día de la semana y hora (hora de Santiago).
-- Devuelve totales por celda y cuántos días de cada tipo hubo, para que
-- la app muestre promedios. Sin costos: lo ve quien puede ver ventas.
-- Opcional: solo una categoría de productos.
-- =====================================================================

create or replace function public.mapa_calor(p_desde date, p_hasta date, p_categoria bigint default null)
returns json
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.tiene_permiso('ver_ventas') then
    raise exception 'No tienes permiso para ver ventas.';
  end if;
  if p_hasta < p_desde or p_hasta - p_desde > 400 then
    raise exception 'El rango de fechas no es válido (máximo 400 días).';
  end if;

  return json_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    -- Cuántos lunes, martes… con ventas hubo en el período (para promediar)
    'dias', coalesce((
      select json_agg(json_build_object('dia', dia, 'cantidad', n) order by dia)
      from (
        select extract(isodow from fecha)::int as dia, count(distinct fecha) as n
        from public.ventas where fecha between p_desde and p_hasta
        group by 1
      ) x), '[]'::json),
    'celdas', coalesce((
      select json_agg(json_build_object('dia', dia, 'hora', hora, 'ventas', ventas, 'transacciones', transacciones, 'unidades', unidades))
      from (
        select extract(isodow from v.fecha)::int as dia,
               extract(hour from v.fecha_hora at time zone 'America/Santiago')::int as hora,
               round(sum(l.monto)) as ventas,
               count(distinct v.numero) as transacciones,
               count(*) filter (where p.tipo = 'producto') as unidades
        from public.ventas v
        join public.venta_lineas l on l.venta_numero = v.numero
        join public.productos p on p.id = l.producto_id
        where v.fecha between p_desde and p_hasta
          and p.tipo <> 'abono'
          and (p_categoria is null or p.categoria_id = p_categoria)
        group by 1, 2
      ) x), '[]'::json),
    'categorias', coalesce((
      select json_agg(json_build_object('id', c.id, 'nombre', c.nombre) order by c.orden, c.nombre)
      from public.categorias c where c.activa), '[]'::json)
  );
end;
$$;
revoke all on function public.mapa_calor(date, date, bigint) from public, anon;
grant execute on function public.mapa_calor(date, date, bigint) to authenticated;
