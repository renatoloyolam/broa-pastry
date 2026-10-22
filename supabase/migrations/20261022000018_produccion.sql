-- =====================================================================
-- Sugerencia de producción
--
-- Para una fecha, junta lo vendido y lo botado de cada producto en los
-- mismos días de la semana de las últimas semanas (solo días con ventas).
-- La sugerencia se calcula en la app (src/lib/produccion.ts).
--
-- * categorias.se_produce: las categorías que se preparan al momento
--   (café, bebidas) no necesitan sugerencia. Se puede cambiar en Categorías.
-- * La ve cualquiera con ver_ventas (la encargada también: son unidades).
--   El costo, para estimar el ahorro, solo para quien puede ver costos.
-- =====================================================================

alter table public.categorias add column se_produce boolean not null default true;
update public.categorias set se_produce = false
where private.normalizar(nombre) in ('cafeteria', 'bebestibles', 'bebidas', 'otras', 'otros');

create or replace function public.produccion_sugerida(p_fecha date, p_semanas integer default 6)
returns json
language plpgsql stable security definer set search_path = ''
as $$
declare
  ver_costos boolean := private.tiene_permiso('ver_costos');
  v_dias date[];
begin
  if not private.tiene_permiso('ver_ventas') then
    raise exception 'No tienes permiso para ver ventas.';
  end if;
  if p_semanas not between 2 and 12 then
    raise exception 'Elige entre 2 y 12 semanas.';
  end if;

  -- Los mismos días de la semana anteriores a la fecha, que tuvieron ventas
  select coalesce(array_agg(d order by d desc), '{}') into v_dias
  from (
    select g::date as d
    from generate_series(p_fecha - 7, p_fecha - 7 * 26, interval '-7 days') g
    where exists (select 1 from public.ventas v where v.fecha = g::date)
    order by g desc
    limit p_semanas
  ) x;

  return json_build_object(
    'fecha', p_fecha,
    'dias', to_json(v_dias),
    'dias_cerrado', (select to_json(u.dias_cerrado) from public.umbrales_alertas u),
    'ver_costos', ver_costos,
    'productos', coalesce((
      with base as (
        select p.id, p.nombre, coalesce(c.nombre, 'Sin categoría') as categoria, coalesce(c.orden, 999) as orden
        from public.productos p
        left join public.categorias c on c.id = p.categoria_id
        where p.activo and p.tipo = 'producto' and coalesce(c.se_produce, true)
      ),
      vendido as (
        select l.producto_id, l.fecha, count(*) as n, count(*) filter (where v.turno = 'AM') as am
        from public.venta_lineas l
        join public.ventas v on v.numero = l.venta_numero
        where l.fecha = any (v_dias)
        group by l.producto_id, l.fecha
      ),
      botado as (
        select m.producto_id, m.fecha, sum(m.cantidad) as n
        from public.mermas m
        where m.fecha = any (v_dias)
        group by m.producto_id, m.fecha
      ),
      serie as (
        select b.id, b.nombre, b.categoria, b.orden,
               array_agg(coalesce(ve.n, 0) order by d.fecha desc) as vendidos,
               array_agg(coalesce(ve.am, 0) order by d.fecha desc) as am,
               array_agg(coalesce(bo.n, 0) order by d.fecha desc) as mermas
        from base b
        cross join unnest(v_dias) as d(fecha)
        left join vendido ve on ve.producto_id = b.id and ve.fecha = d.fecha
        left join botado bo on bo.producto_id = b.id and bo.fecha = d.fecha
        group by b.id, b.nombre, b.categoria, b.orden
      ),
      -- Costo promedio por unidad vendida (incluye opciones); solo si se pueden ver costos
      costo_unidad as (
        select l.producto_id, avg(l.costo) as costo
        from private.lineas_costeadas(coalesce(v_dias[array_length(v_dias, 1)], p_fecha), p_fecha) l
        where ver_costos and l.costo is not null and l.fecha = any (v_dias)
        group by l.producto_id
      )
      select json_agg(json_build_object(
        'id', s.id, 'nombre', s.nombre, 'categoria', s.categoria,
        'vendidos', s.vendidos, 'am', s.am, 'mermas', s.mermas,
        'costo', case when ver_costos then round(cu.costo, 2) end
      ) order by s.orden, s.nombre)
      from serie s
      left join costo_unidad cu on cu.producto_id = s.id
      where exists (select 1 from unnest(s.vendidos) x where x > 0) or exists (select 1 from unnest(s.mermas) x where x > 0)
    ), '[]'::json)
  );
end;
$$;
revoke all on function public.produccion_sugerida(date, integer) from public, anon;
grant execute on function public.produccion_sugerida(date, integer) to authenticated;
