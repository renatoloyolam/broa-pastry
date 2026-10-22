-- =====================================================================
-- Desglose de ventas de un período (un mes o un día): por producto (con
-- sus opciones), categoría, turno, medio de pago y vendedor; y para un día,
-- cada boleta con sus ítems. Sin costos: lo ve quien puede ver ventas.
-- =====================================================================

create or replace function public.detalle_ventas(p_desde date, p_hasta date, p_boletas boolean default false)
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
  if p_boletas and p_hasta - p_desde > 2 then
    raise exception 'El detalle por boleta es de a un día.';
  end if;

  return (
    with l as (
      select l.venta_numero, l.producto_id, l.opcion_ids, l.monto, l.texto_item, l.texto_opciones,
             p.nombre as producto, p.tipo, coalesce(c.nombre, 'Sin categoría') as categoria, coalesce(c.orden, 999) as orden,
             v.turno, coalesce(nullif(trim(v.vendedor), ''), 'Sin nombre') as vendedor,
             case
               when v.metodo_pago ilike '%,%' then 'Mixto'
               when v.metodo_pago ilike '%crédito%' or v.metodo_pago ilike '%credito%' then 'Crédito'
               when v.metodo_pago ilike '%débito%' or v.metodo_pago ilike '%debito%' then 'Débito'
               when v.metodo_pago ilike '%efectivo%' then 'Efectivo'
               when v.metodo_pago ilike '%transfer%' then 'Transferencia'
               else coalesce(nullif(trim(v.metodo_pago), ''), 'Otro')
             end as medio
      from public.venta_lineas l
      join public.ventas v on v.numero = l.venta_numero
      join public.productos p on p.id = l.producto_id
      left join public.categorias c on c.id = p.categoria_id
      where l.fecha between p_desde and p_hasta
    ),
    sin_abonos as (select * from l where tipo <> 'abono')
    select json_build_object(
      'desde', p_desde,
      'hasta', p_hasta,
      'resumen', (
        select json_build_object(
          'ventas', coalesce(round(sum(monto) filter (where tipo <> 'abono')), 0),
          'abonos', coalesce(round(sum(monto) filter (where tipo = 'abono')), 0),
          'transacciones', count(distinct venta_numero) filter (where tipo <> 'abono'),
          'unidades', count(*) filter (where tipo = 'producto'),
          'descuentos', (select coalesce(sum(v.descuento), 0) from public.ventas v where v.fecha between p_desde and p_hasta),
          'dias', (select count(distinct v.fecha) from public.ventas v where v.fecha between p_desde and p_hasta))
        from l),
      'por_turno', coalesce((
        select json_agg(x order by x.turno) from (
          select turno, round(sum(monto)) as ventas, count(distinct venta_numero) as transacciones
          from sin_abonos group by turno) x), '[]'::json),
      'por_medio', coalesce((
        select json_agg(x order by x.ventas desc) from (
          select medio, round(sum(monto)) as ventas, count(distinct venta_numero) as transacciones
          from sin_abonos group by medio) x), '[]'::json),
      'por_vendedor', coalesce((
        select json_agg(x order by x.ventas desc) from (
          select vendedor, round(sum(monto)) as ventas, count(distinct venta_numero) as transacciones
          from sin_abonos group by vendedor) x), '[]'::json),
      'por_categoria', coalesce((
        select json_agg(x order by x.ventas desc) from (
          select categoria, round(sum(monto)) as ventas, count(*) as unidades
          from sin_abonos where tipo = 'producto' group by categoria) x), '[]'::json),
      'productos', coalesce((
        select json_agg(x order by x.ventas desc) from (
          select pr.producto_id as id, pr.producto as nombre, pr.categoria, count(*) as unidades, round(sum(pr.monto)) as ventas,
                 (select coalesce(json_agg(o order by o.unidades desc), '[]'::json) from (
                    select op.nombre, count(*) as unidades
                    from sin_abonos x2
                    cross join lateral unnest(x2.opcion_ids) as u(id)
                    join public.opciones op on op.id = u.id
                    where x2.producto_id = pr.producto_id
                    group by op.nombre) o) as opciones
          from sin_abonos pr where pr.tipo = 'producto'
          group by pr.producto_id, pr.producto, pr.categoria) x), '[]'::json),
      'boletas', case when p_boletas then coalesce((
        select json_agg(b order by b.hora desc, b.numero desc) from (
          select v.numero, to_char(v.fecha_hora at time zone 'America/Santiago', 'HH24:MI') as hora, v.turno,
                 coalesce(nullif(trim(v.vendedor), ''), 'Sin nombre') as vendedor, coalesce(v.metodo_pago, '') as medio,
                 v.total, v.descuento, v.con_boleta,
                 (select json_agg(json_build_object('texto', li.texto_item, 'opciones', li.texto_opciones, 'monto', round(li.monto)) order by li.id)
                  from public.venta_lineas li where li.venta_numero = v.numero) as items
          from public.ventas v where v.fecha between p_desde and p_hasta) b), '[]'::json) end
    )
  );
end;
$$;
revoke all on function public.detalle_ventas(date, date, boolean) from public, anon;
grant execute on function public.detalle_ventas(date, date, boolean) to authenticated;
