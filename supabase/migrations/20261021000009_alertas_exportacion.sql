-- =====================================================================
-- Fase 6: alertas y exportación
--
-- Alertas (dentro de la app). Umbrales configurables solo por el Dueño.
--   * sin_costo        productos vendidos sin costo definido   (ver_costos)
--   * margen_bajo      productos con margen bajo el mínimo     (ver_costos)
--   * mermas_altas     mermas del día / semana sobre umbral    (ver_costos)
--   * dias_sin_ventas  días sin ventas importadas              (ver_ventas)
--   * variacion_costo  cambios fuertes de costo recientes      (ver_costos)
-- La función alertas() solo calcula las que el usuario puede ver.
--
-- Exportación: exportar_ventas() entrega el detalle por transacción para el
-- contador (sin costos). Los demás reportes salen de panel() y
-- reporte_mermas(), que ya ocultan costos a quien no puede verlos.
-- =====================================================================

create table public.umbrales_alertas (
  id boolean primary key default true check (id),
  margen_minimo numeric(4, 3) not null default 0.40 check (margen_minimo between 0 and 1),
  mermas_dia integer not null default 15000 check (mermas_dia >= 0),
  mermas_semana integer not null default 60000 check (mermas_semana >= 0),
  variacion_costo numeric(4, 3) not null default 0.15 check (variacion_costo between 0 and 5),
  dias_revision integer not null default 30 check (dias_revision between 7 and 120),
  -- Días de la semana en que Broa no abre (1 = lunes … 7 = domingo)
  dias_cerrado integer[] not null default '{}',
  activas jsonb not null default '{"sin_costo": true, "margen_bajo": true, "mermas_altas": true, "dias_sin_ventas": true, "variacion_costo": true}',
  actualizado_en timestamptz not null default now()
);
insert into public.umbrales_alertas default values;
create trigger umbrales_actualizado before update on public.umbrales_alertas
for each row execute function private.tocar_actualizado_en();

alter table public.umbrales_alertas enable row level security;
revoke all on public.umbrales_alertas from anon;
revoke insert, delete on public.umbrales_alertas from authenticated;
create policy "umbrales: ver" on public.umbrales_alertas for select to authenticated
using ((select private.tiene_permiso('ver_ventas')));
create policy "umbrales: solo el dueño edita" on public.umbrales_alertas for update to authenticated
using ((select private.rol_actual()) = 'dueno')
with check ((select private.rol_actual()) = 'dueno');

-- Nombre legible de una definición de costo ("Producto" o "Producto · Opción")
create or replace function private.nombre_definicion(p_def bigint)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(p.nombre, po.nombre || ' · ' || o.nombre)
  from public.costo_definiciones d
  left join public.productos p on p.id = d.producto_id
  left join public.opciones o on o.id = d.opcion_id
  left join public.productos po on po.id = o.producto_id
  where d.id = p_def
$$;
revoke all on function private.nombre_definicion(bigint) from public, authenticated;

create or replace function public.alertas()
returns json
language plpgsql stable security definer set search_path = ''
as $$
declare
  u public.umbrales_alertas;
  ver_costos boolean := private.tiene_permiso('ver_costos');
  hoy date := private.hoy();
  desde date;
  divisor numeric;
  lista jsonb := '[]'::jsonb;
  items jsonb;
  total numeric;
begin
  if not private.tiene_permiso('ver_ventas') then
    return '[]'::json;
  end if;
  select * into u from public.umbrales_alertas;
  desde := hoy - u.dias_revision;
  select case when c.precios_incluyen_iva and c.margen_sobre_neto then 1 + c.tasa_iva else 1 end
  into divisor from public.configuracion c;

  -- 1. Días sin ventas importadas (últimos 14 días hasta ayer)
  if coalesce((u.activas->>'dias_sin_ventas')::boolean, true) and exists (select 1 from public.ventas) then
    select coalesce(jsonb_agg(to_char(d, 'YYYY-MM-DD') order by d), '[]'::jsonb) into items
    from generate_series(greatest(hoy - 14, (select min(fecha) from public.ventas)), hoy - 1, interval '1 day') g(d)
    where not (extract(isodow from d)::int = any (u.dias_cerrado))
      and not exists (select 1 from public.ventas v where v.fecha = g.d::date);
    if jsonb_array_length(items) > 0 then
      lista := lista || jsonb_build_object('codigo', 'dias_sin_ventas', 'nivel', 'aviso', 'fechas', items);
    end if;
  end if;

  if ver_costos then
    -- 2. Productos vendidos sin costo
    if coalesce((u.activas->>'sin_costo')::boolean, true) then
      select coalesce(jsonb_agg(x order by x.ventas desc), '[]'::jsonb), coalesce(sum(x.ventas), 0) into items, total
      from (
        select p.id as producto_id, p.nombre, count(*) as unidades, round(sum(l.monto)) as ventas
        from private.lineas_costeadas(desde, hoy) l join public.productos p on p.id = l.producto_id
        where l.tipo = 'producto' and l.costo is null
        group by p.id, p.nombre
      ) x;
      if jsonb_array_length(items) > 0 then
        lista := lista || jsonb_build_object('codigo', 'sin_costo', 'nivel', 'importante', 'dias', u.dias_revision,
                                             'total', total, 'productos', items);
      end if;
    end if;

    -- 3. Margen bajo (productos con costo completo y al menos 3 ventas)
    if coalesce((u.activas->>'margen_bajo')::boolean, true) then
      select coalesce(jsonb_agg(x order by x.margen), '[]'::jsonb) into items
      from (
        select p.id as producto_id, p.nombre, count(*) as unidades,
               round((sum(l.monto / divisor) - sum(l.costo)) / nullif(sum(l.monto / divisor), 0), 4) as margen
        from private.lineas_costeadas(desde, hoy) l join public.productos p on p.id = l.producto_id
        where l.tipo = 'producto'
        group by p.id, p.nombre
        having bool_and(l.costo is not null) and count(*) >= 3
           and (sum(l.monto / divisor) - sum(l.costo)) / nullif(sum(l.monto / divisor), 0) < u.margen_minimo
      ) x;
      if jsonb_array_length(items) > 0 then
        lista := lista || jsonb_build_object('codigo', 'margen_bajo', 'nivel', 'importante', 'dias', u.dias_revision,
                                             'minimo', u.margen_minimo, 'productos', items);
      end if;
    end if;

    -- 4. Mermas altas: hoy, ayer y últimos 7 días
    if coalesce((u.activas->>'mermas_altas')::boolean, true) then
      select coalesce(jsonb_agg(x), '[]'::jsonb) into items
      from (
        select 'dia' as periodo, d::date as fecha, round(private.mermas_periodo(d::date, d::date)) as valor, u.mermas_dia as umbral
        from unnest(array[hoy - 1, hoy]) d
        where private.mermas_periodo(d::date, d::date) > u.mermas_dia
        union all
        select 'semana', hoy, round(private.mermas_periodo(hoy - 6, hoy)), u.mermas_semana
        where private.mermas_periodo(hoy - 6, hoy) > u.mermas_semana
      ) x;
      if jsonb_array_length(items) > 0 then
        lista := lista || jsonb_build_object('codigo', 'mermas_altas', 'nivel', 'importante', 'casos', items);
      end if;
    end if;

    -- 5. Cambios fuertes de costo en los últimos 14 días
    if coalesce((u.activas->>'variacion_costo')::boolean, true) then
      select coalesce(jsonb_agg(x order by abs(x.variacion) desc), '[]'::jsonb) into items
      from (
        select private.nombre_definicion(cv.definicion_id) as nombre, cv.vigente_desde as desde,
               ant.costo_neto as antes, cv.costo_neto as ahora,
               round((cv.costo_neto - ant.costo_neto) / ant.costo_neto, 4) as variacion
        from public.costo_versiones cv
        cross join lateral (
          select a.costo_neto from public.costo_versiones a
          where a.definicion_id = cv.definicion_id and a.vigente_desde < cv.vigente_desde
          order by a.vigente_desde desc limit 1
        ) ant
        where cv.vigente_desde >= hoy - 14 and ant.costo_neto > 0
          and abs(cv.costo_neto - ant.costo_neto) / ant.costo_neto >= u.variacion_costo
        limit 20
      ) x;
      if jsonb_array_length(items) > 0 then
        lista := lista || jsonb_build_object('codigo', 'variacion_costo', 'nivel', 'aviso',
                                             'umbral', u.variacion_costo, 'cambios', items);
      end if;
    end if;
  end if;

  return lista::json;
end;
$$;
revoke all on function public.alertas() from public, anon;
grant execute on function public.alertas() to authenticated;

-- Detalle de ventas por transacción para exportar (sin costos).
create or replace function public.exportar_ventas(p_desde date, p_hasta date)
returns json
language plpgsql stable security definer set search_path = ''
as $$
declare
  tasa numeric;
begin
  if not (private.tiene_permiso('exportar') and private.tiene_permiso('ver_ventas')) then
    raise exception 'No tienes permiso para exportar.';
  end if;
  if p_hasta < p_desde or p_hasta - p_desde > 400 then
    raise exception 'El rango de fechas no es válido (máximo 400 días).';
  end if;
  select case when c.precios_incluyen_iva then c.tasa_iva else 0 end into tasa from public.configuracion c;
  return coalesce((
    select json_agg(json_build_object(
      'numero', v.numero,
      'fecha', v.fecha,
      'hora', to_char(v.fecha_hora at time zone 'America/Santiago', 'HH24:MI'),
      'turno', v.turno,
      'vendedor', v.vendedor,
      'metodo_pago', v.metodo_pago,
      'boleta', v.con_boleta,
      'total', v.total,
      'descuento', v.descuento,
      'neto', round(v.total / (1 + tasa)),
      'iva', v.total - round(v.total / (1 + tasa)),
      'productos', (select string_agg(l.texto_item || coalesce(' (' || l.texto_opciones || ')', ''), '; ' order by l.id)
                    from public.venta_lineas l where l.venta_numero = v.numero)
    ) order by v.fecha_hora)
    from public.ventas v
    where v.fecha between p_desde and p_hasta
  ), '[]'::json);
end;
$$;
revoke all on function public.exportar_ventas(date, date) from public, anon;
grant execute on function public.exportar_ventas(date, date) to authenticated;
