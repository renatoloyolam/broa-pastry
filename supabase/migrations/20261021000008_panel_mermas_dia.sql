-- =====================================================================
-- Fase 5 (b): el panel descuenta las mermas también día por día
-- (para el gráfico de ganancia por día). Resto igual a 20261021000006.
-- =====================================================================

create or replace function public.panel(p_desde date, p_hasta date, p_desde_ant date, p_hasta_ant date)
returns json
language plpgsql stable security definer set search_path = ''
as $$
declare
  ver_costos boolean := private.tiene_permiso('ver_costos');
  divisor numeric;
  resultado json;
begin
  if not private.tiene_permiso('ver_ventas') then
    raise exception 'No tienes permiso para ver ventas.';
  end if;
  if p_hasta < p_desde or p_hasta - p_desde > 400 then
    raise exception 'El rango de fechas no es válido (máximo 400 días).';
  end if;

  select case when c.precios_incluyen_iva and c.margen_sobre_neto then 1 + c.tasa_iva else 1 end
  into divisor from public.configuracion c;

  with
  periodos as (
    select 'actual' as periodo, p_desde as desde, p_hasta as hasta
    union all
    select 'anterior', p_desde_ant, p_hasta_ant where p_desde_ant is not null
  ),
  -- Si no hay permiso, NO se calculan costos (se usa la versión sin costos).
  lin as (
    select pe.periodo, x.*
    from periodos pe
    cross join lateral (
      select lc.linea_id, lc.venta_numero, lc.fecha, lc.producto_id, lc.tipo, lc.categoria_id, lc.opcion_ids, lc.monto, lc.costo
      from private.lineas_costeadas(pe.desde, pe.hasta) lc
      where ver_costos
      union all
      select l.id, l.venta_numero, l.fecha, l.producto_id, p.tipo, p.categoria_id, l.opcion_ids, l.monto, null::numeric
      from public.venta_lineas l join public.productos p on p.id = l.producto_id
      where not ver_costos and l.fecha between pe.desde and pe.hasta
    ) x
  ),
  resumen as (
    select
      periodo,
      count(distinct venta_numero) filter (where tipo <> 'abono') as transacciones,
      count(*) filter (where tipo = 'producto') as unidades,
      round(coalesce(sum(monto) filter (where tipo <> 'abono'), 0)) as ventas,
      round(coalesce(sum(monto) filter (where tipo = 'abono'), 0)) as abonos,
      round(coalesce(sum(monto / divisor) filter (where tipo <> 'abono' and costo is not null), 0)) as ventas_netas_costeadas,
      round(coalesce(sum(costo), 0)) as costo,
      round(coalesce(sum(monto) filter (where tipo = 'producto' and costo is null), 0)) as ventas_sin_costo,
      count(*) filter (where tipo = 'producto' and costo is null) as unidades_sin_costo
    from lin
    group by periodo
  ),
  resumen_final as (
    select
      pe.periodo,
      coalesce(r.transacciones, 0) as transacciones,
      coalesce(r.unidades, 0) as unidades,
      coalesce(r.ventas, 0) as ventas,
      coalesce(r.abonos, 0) as abonos,
      case when ver_costos then coalesce(r.ventas_netas_costeadas, 0) end as ventas_netas_costeadas,
      case when ver_costos then coalesce(r.costo, 0) end as costo,
      case when ver_costos then round(private.mermas_periodo(pe.desde, pe.hasta)) end as mermas,
      case when ver_costos then coalesce(r.ventas_sin_costo, 0) end as ventas_sin_costo,
      case when ver_costos then coalesce(r.unidades_sin_costo, 0) end as unidades_sin_costo
    from periodos pe left join resumen r on r.periodo = pe.periodo
  ),
  actual as (select * from lin where periodo = 'actual'),
  por_producto as (
    select
      a.producto_id,
      p.nombre,
      count(*) as unidades,
      round(sum(a.monto)) as ventas,
      round(sum(a.monto / divisor) filter (where a.costo is not null)) as ventas_netas_costeadas,
      round(sum(a.costo)) as costo,
      count(*) filter (where a.costo is null) as unidades_sin_costo
    from actual a join public.productos p on p.id = a.producto_id
    where a.tipo = 'producto'
    group by a.producto_id, p.nombre
  ),
  mermas_dia as (
    select mv.fecha, sum(mv.valor) as mermas
    from private.mermas_valorizadas(p_desde, p_hasta) mv
    where ver_costos
    group by mv.fecha
  ),
  por_dia as (
    select a.fecha,
           round(sum(a.monto) filter (where a.tipo <> 'abono')) as ventas,
           round(sum(a.monto / divisor) filter (where a.tipo <> 'abono' and a.costo is not null)) as ventas_netas_costeadas,
           round(sum(a.costo)) as costo,
           count(distinct a.venta_numero) filter (where a.tipo <> 'abono') as transacciones,
           round(coalesce(max(md.mermas), 0)) as mermas
    from actual a left join mermas_dia md on md.fecha = a.fecha
    group by a.fecha
  ),
  por_turno as (
    select v.turno, coalesce(v.vendedor, 'Sin nombre') as vendedor,
           count(distinct a.venta_numero) as transacciones,
           count(*) filter (where a.tipo = 'producto') as unidades,
           round(sum(a.monto)) as ventas,
           round(sum(a.monto / divisor) filter (where a.costo is not null)) as ventas_netas_costeadas,
           round(sum(a.costo)) as costo
    from actual a join public.ventas v on v.numero = a.venta_numero
    where a.tipo <> 'abono'
    group by v.turno, coalesce(v.vendedor, 'Sin nombre')
  ),
  por_categoria as (
    select coalesce(c.nombre, 'Sin categoría') as categoria,
           count(*) as unidades,
           round(sum(a.monto)) as ventas,
           round(sum(a.monto / divisor) filter (where a.costo is not null)) as ventas_netas_costeadas,
           round(sum(a.costo)) as costo
    from actual a left join public.categorias c on c.id = a.categoria_id
    where a.tipo = 'producto'
    group by coalesce(c.nombre, 'Sin categoría')
  )
  select json_build_object(
    'ver_costos', ver_costos,
    'resumen', (select row_to_json(r) from resumen_final r where periodo = 'actual'),
    'anterior', (select row_to_json(r) from resumen_final r where periodo = 'anterior'),
    'productos', coalesce((
      select json_agg(json_build_object(
        'producto_id', producto_id, 'nombre', nombre, 'unidades', unidades, 'ventas', ventas,
        'ventas_netas_costeadas', case when ver_costos then ventas_netas_costeadas end,
        'costo', case when ver_costos then costo end,
        'unidades_sin_costo', case when ver_costos then unidades_sin_costo end
      ) order by unidades desc, ventas desc)
      from por_producto), '[]'::json),
    'dias', coalesce((
      select json_agg(json_build_object(
        'fecha', fecha, 'ventas', ventas, 'transacciones', transacciones,
        'ventas_netas_costeadas', case when ver_costos then ventas_netas_costeadas end,
        'costo', case when ver_costos then costo end,
        'mermas', case when ver_costos then mermas end
      ) order by fecha)
      from por_dia), '[]'::json),
    'turnos', coalesce((
      select json_agg(json_build_object(
        'turno', turno, 'vendedor', vendedor, 'transacciones', transacciones, 'unidades', unidades, 'ventas', ventas,
        'ventas_netas_costeadas', case when ver_costos then ventas_netas_costeadas end,
        'costo', case when ver_costos then costo end
      ) order by turno, ventas desc)
      from por_turno), '[]'::json),
    'categorias', coalesce((
      select json_agg(json_build_object(
        'categoria', categoria, 'unidades', unidades, 'ventas', ventas,
        'ventas_netas_costeadas', case when ver_costos then ventas_netas_costeadas end,
        'costo', case when ver_costos then costo end
      ) order by ventas desc)
      from por_categoria), '[]'::json),
    'ultimo_dia', (select max(fecha) from public.ventas)
  ) into resultado;
  return resultado;
end;
$$;
revoke all on function public.panel(date, date, date, date) from public, anon;
grant execute on function public.panel(date, date, date, date) to authenticated;
