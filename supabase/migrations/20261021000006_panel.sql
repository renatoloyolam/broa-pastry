-- =====================================================================
-- Fase 4: panel de resultados
--
-- Toda la cuenta se hace aquí, en la base de datos. La función panel()
-- revisa el permiso "ver_costos" ANTES de calcular costos: a quien no lo
-- tiene le devuelve solo cifras de venta (los campos de costo van en null y
-- el ranking de rentabilidad no se calcula). Así ningún costo viaja al
-- teléfono de la Encargada.
--
-- Reglas:
--   * costo de una línea = costo vigente del producto en la fecha de la venta
--     + costo vigente de cada opción elegida (repetidas cuentan varias veces).
--   * Si falta el costo del producto o de alguna opción, la línea queda
--     "sin costo": su venta se informa aparte y NO entra en la ganancia.
--   * Abonos de tortas no son venta de productos; se informan aparte.
--   * Ventas netas = con IVA / (1 + IVA) si así está configurado.
--   * Ganancia = ventas netas costeadas − costo − mermas.
-- =====================================================================

-- Costo de cada línea vendida en un rango (null = sin costo definido).
create or replace function private.lineas_costeadas(p_desde date, p_hasta date)
returns table (
  linea_id bigint, venta_numero bigint, fecha date, producto_id bigint, tipo public.tipo_producto,
  categoria_id bigint, opcion_ids bigint[], monto numeric, costo numeric
)
language sql stable security definer set search_path = ''
as $$
  with l as (
    select l.id, l.venta_numero, l.fecha, l.producto_id, p.tipo, p.categoria_id, l.opcion_ids, l.monto
    from public.venta_lineas l
    join public.productos p on p.id = l.producto_id
    where l.fecha between p_desde and p_hasta
  ),
  ops as (
    select l.id,
           sum(c.costo_neto) as costo,
           bool_or(c.costo_neto is null) as falta
    from l
    cross join lateral unnest(l.opcion_ids) as o(opcion_id)
    left join lateral (
      select cv.costo_neto
      from public.costo_definiciones d
      join public.costo_versiones cv on cv.definicion_id = d.id
      where d.opcion_id = o.opcion_id and cv.vigente_desde <= l.fecha
      order by cv.vigente_desde desc
      limit 1
    ) c on true
    group by l.id
  )
  select l.id, l.venta_numero, l.fecha, l.producto_id, l.tipo, l.categoria_id, l.opcion_ids, l.monto,
         case
           when l.tipo <> 'producto' then 0
           when b.costo_neto is null or coalesce(ops.falta, false) then null
           else b.costo_neto + coalesce(ops.costo, 0)
         end
  from l
  left join ops on ops.id = l.id
  left join lateral (
    select cv.costo_neto
    from public.costo_definiciones d
    join public.costo_versiones cv on cv.definicion_id = d.id
    where d.producto_id = l.producto_id and cv.vigente_desde <= l.fecha
    order by cv.vigente_desde desc
    limit 1
  ) b on true
$$;
revoke all on function private.lineas_costeadas(date, date) from public, authenticated;

-- Mermas valorizadas del período. En la Fase 5 se reemplaza por la real.
create or replace function private.mermas_periodo(p_desde date, p_hasta date)
returns numeric
language sql stable security definer set search_path = ''
as $$ select 0::numeric $$;
revoke all on function private.mermas_periodo(date, date) from public, authenticated;

create index if not exists costo_versiones_def_fecha on public.costo_versiones (definicion_id, vigente_desde desc);
create index if not exists venta_lineas_fecha_producto on public.venta_lineas (fecha, producto_id);

-- ---------------------------------------------------------------------
-- Panel completo de un período (+ resumen del período anterior para comparar)
-- ---------------------------------------------------------------------
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
  por_dia as (
    select fecha,
           round(sum(monto) filter (where tipo <> 'abono')) as ventas,
           round(sum(monto / divisor) filter (where tipo <> 'abono' and costo is not null)) as ventas_netas_costeadas,
           round(sum(costo)) as costo,
           count(distinct venta_numero) filter (where tipo <> 'abono') as transacciones
    from actual group by fecha
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
        'costo', case when ver_costos then costo end
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

-- Detalle de un producto en el período: cuántas veces se eligió cada opción.
create or replace function public.detalle_producto(p_producto bigint, p_desde date, p_hasta date)
returns json
language plpgsql stable security definer set search_path = ''
as $$
declare
  ver_costos boolean := private.tiene_permiso('ver_costos');
begin
  if not private.tiene_permiso('ver_ventas') then
    raise exception 'No tienes permiso para ver ventas.';
  end if;
  return json_build_object(
    'opciones', coalesce((
      select json_agg(x order by x.veces desc)
      from (
        select o.id, o.nombre, count(*) as veces
        from public.venta_lineas l
        cross join lateral unnest(l.opcion_ids) as u(opcion_id)
        join public.opciones o on o.id = u.opcion_id
        where l.producto_id = p_producto and l.fecha between p_desde and p_hasta
        group by o.id, o.nombre
      ) x), '[]'::json),
    'sin_costo', case when ver_costos then (
      select count(*) from private.lineas_costeadas(p_desde, p_hasta) lc
      where lc.producto_id = p_producto and lc.costo is null) end
  );
end;
$$;
revoke all on function public.detalle_producto(bigint, date, date) from public, anon;
grant execute on function public.detalle_producto(bigint, date, date) to authenticated;

-- Atajo para el catálogo: marcar en $0 todas las opciones sin costo de un
-- producto (ej.: "Leche entera", "Sin leche"). SECURITY INVOKER: aplica RLS.
create or replace function public.opciones_sin_costo_a_cero(p_producto bigint)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.costo_definiciones (opcion_id, modo)
  select o.id, 'cero' from public.opciones o
  where o.producto_id = p_producto
    and not exists (select 1 from public.costo_definiciones d where d.opcion_id = o.id);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.opciones_sin_costo_a_cero(bigint) from public, anon;
grant execute on function public.opciones_sin_costo_a_cero(bigint) to authenticated;
