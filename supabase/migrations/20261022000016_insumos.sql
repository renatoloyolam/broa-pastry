-- =====================================================================
-- Compras de insumos vs. lo que se usó según las recetas
--
-- * Compras reales: facturas y boletas de categoría Insumos y Packaging
--   (tabla compras, sin IVA).
-- * Uso teórico: por cada unidad vendida o mermada, el costo de su versión
--   vigente ese día, sin la parte de mano de obra y otros gastos. Esa
--   proporción se toma de la definición de costo actual (las versiones
--   antiguas solo guardan el total), por eso es una estimación.
-- * Proveedores: la categoría de cada RUT se recuerda; al subir el registro
--   del SII los documentos de proveedores conocidos se clasifican solos y
--   los nuevos quedan "Por clasificar".
-- * Compras con boleta (feria, supermercado): tipo "Boleta", sin IVA
--   recuperable: el neto es el total pagado.
-- =====================================================================

alter table public.compras drop constraint compras_tipo_doc_check;
alter table public.compras add constraint compras_tipo_doc_check check (tipo_doc in (
  'Factura', 'Factura exenta', 'Factura de compra', 'Nota de crédito', 'Nota de débito', 'Importación', 'Boleta', 'Otro'));
alter table public.compras drop constraint compras_categoria_check;
alter table public.compras add constraint compras_categoria_check check (categoria in (
  'Insumos', 'Packaging', 'Gastos del local', 'Equipos', 'Otros', 'Por clasificar'));
create index compras_rut on public.compras (rut);

create table public.proveedores (
  rut text primary key check (length(rut) between 3 and 15),
  nombre text not null check (length(trim(nombre)) between 1 and 120),
  categoria text not null check (categoria in ('Insumos', 'Packaging', 'Gastos del local', 'Equipos', 'Otros')),
  actualizado_en timestamptz not null default now()
);
alter table public.proveedores enable row level security;
revoke all on public.proveedores from anon;
revoke insert, update, delete on public.proveedores from authenticated;
create policy "proveedores: ver" on public.proveedores for select to authenticated
using ((select private.tiene_permiso('gestionar_finanzas')));

-- Clasifica un proveedor: se recuerda y se aplica a todos sus documentos.
create or replace function public.clasificar_proveedor(p_rut text, p_nombre text, p_categoria text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  if not private.tiene_permiso('gestionar_finanzas') then
    raise exception 'No tienes permiso para gestionar las finanzas.';
  end if;
  insert into public.proveedores (rut, nombre, categoria) values (p_rut, left(p_nombre, 120), p_categoria)
  on conflict (rut) do update set nombre = excluded.nombre, categoria = excluded.categoria, actualizado_en = now();
  update public.compras set categoria = p_categoria where rut = p_rut;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.clasificar_proveedor(text, text, text) from public, anon;
grant execute on function public.clasificar_proveedor(text, text, text) to authenticated;

-- Igual que antes, pero clasifica con la categoría conocida del proveedor.
create or replace function public.importar_compras_sii(p_periodo date, p_filas jsonb)
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  v_periodo date := date_trunc('month', p_periodo)::date;
  v_total integer := jsonb_array_length(p_filas);
  v_nuevas integer;
begin
  if not private.tiene_permiso('gestionar_finanzas') then
    raise exception 'No tienes permiso para gestionar las finanzas.';
  end if;
  if v_total > 3000 then
    raise exception 'El archivo tiene demasiadas filas (máximo 3.000).';
  end if;

  insert into public.compras (periodo, fecha, tipo_doc, rut, proveedor, folio, neto, exento, iva, total, origen, categoria)
  select v_periodo, (f->>'fecha')::date, f->>'tipo_doc', f->>'rut', left(f->>'proveedor', 120), f->>'folio',
         (f->>'neto')::integer, (f->>'exento')::integer, (f->>'iva')::integer, (f->>'total')::integer, 'sii',
         coalesce(pr.categoria, 'Por clasificar')
  from jsonb_array_elements(p_filas) f
  left join public.proveedores pr on pr.rut = f->>'rut'
  on conflict (rut, tipo_doc, folio) where rut is not null and folio is not null do nothing;
  get diagnostics v_nuevas = row_count;

  return json_build_object('nuevas', v_nuevas, 'repetidas', v_total - v_nuevas);
end;
$$;

-- Insumos usados según costos, entre dos fechas: ventas y mermas.
create or replace function private.uso_insumos(p_desde date, p_hasta date)
returns table (origen text, categoria_id bigint, costo numeric, insumos numeric)
language sql stable security definer set search_path = ''
as $$
  with fraccion as (
    -- Parte del costo actual que es ingredientes y packaging (sin mano de obra ni otros)
    select v.definicion_id,
           case when coalesce(v.costo_calculado, 0) > 0
                then greatest(0, least(1, (v.costo_calculado - coalesce(a.suma, 0)) / v.costo_calculado))
                else 1 end as f
    from public.v_costos v
    left join (select definicion_id, sum(monto_neto) as suma from public.costo_adicionales group by definicion_id) a
      on a.definicion_id = v.definicion_id
  ),
  unidades as (
    select 'ventas' as origen, l.fecha, p.categoria_id, d.id as def_id, 1::numeric as n
    from public.venta_lineas l
    join public.productos p on p.id = l.producto_id and p.tipo = 'producto'
    join public.costo_definiciones d on d.producto_id = l.producto_id
    where l.fecha between p_desde and p_hasta
    union all
    select 'ventas', l.fecha, p.categoria_id, d.id, 1
    from public.venta_lineas l
    join public.productos p on p.id = l.producto_id and p.tipo = 'producto'
    cross join lateral unnest(l.opcion_ids) o(id)
    join public.costo_definiciones d on d.opcion_id = o.id
    where l.fecha between p_desde and p_hasta
    union all
    select 'mermas', m.fecha, p.categoria_id, d.id, m.cantidad
    from public.mermas m
    join public.productos p on p.id = m.producto_id
    join public.costo_definiciones d on d.producto_id = m.producto_id
    where m.fecha between p_desde and p_hasta
    union all
    select 'mermas', m.fecha, p.categoria_id, d.id, m.cantidad
    from public.mermas m
    join public.productos p on p.id = m.producto_id
    cross join lateral unnest(m.opcion_ids) o(id)
    join public.costo_definiciones d on d.opcion_id = o.id
    where m.fecha between p_desde and p_hasta
  )
  select u.origen, u.categoria_id, sum(u.n * cv.costo_neto), sum(u.n * cv.costo_neto * coalesce(fr.f, 1))
  from unidades u
  join lateral (
    select c.costo_neto from public.costo_versiones c
    where c.definicion_id = u.def_id and c.vigente_desde <= u.fecha
    order by c.vigente_desde desc limit 1
  ) cv on true
  left join fraccion fr on fr.definicion_id = u.def_id
  group by u.origen, u.categoria_id
$$;
revoke all on function private.uso_insumos(date, date) from public, authenticated;

create or replace function public.insumos_periodo(p_desde date, p_hasta date)
returns json
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_divisor numeric;
begin
  if not private.tiene_permiso('gestionar_finanzas') then
    raise exception 'No tienes permiso para gestionar las finanzas.';
  end if;
  if p_hasta < p_desde or p_hasta - p_desde > 400 then
    raise exception 'El rango de fechas no es válido (máximo 400 días).';
  end if;
  select case when c.precios_incluyen_iva then 1 + c.tasa_iva else 1 end into v_divisor from public.configuracion c;

  return json_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'ultimo_dia', (select max(fecha) from public.ventas where fecha between p_desde and p_hasta),
    -- Compras: por período tributario (mes) que cae dentro del rango
    'compras', coalesce((
      select json_agg(x order by x.monto desc)
      from (
        select c.categoria, coalesce(c.rut, '') as rut, max(c.proveedor) as proveedor, count(*) as documentos,
               sum(case when c.tipo_doc = 'Nota de crédito' then -1 else 1 end * (c.neto + c.exento)) as monto
        from public.compras c
        where c.periodo between date_trunc('month', p_desde)::date and p_hasta
        group by c.categoria, coalesce(c.rut, ''), case when c.rut is null then c.proveedor end
      ) x), '[]'::json),
    'uso', coalesce((
      select json_agg(json_build_object('origen', u.origen, 'categoria', coalesce(cat.nombre, 'Sin categoría'),
                                        'costo', round(u.costo), 'insumos', round(u.insumos)) order by u.insumos desc)
      from private.uso_insumos(p_desde, p_hasta) u
      left join public.categorias cat on cat.id = u.categoria_id), '[]'::json),
    -- Para estimar lo vendido sin costo cargado
    'ventas', (
      select json_build_object(
        'netas_costeadas', coalesce(round(sum(l.monto / v_divisor) filter (where l.costo is not null)), 0),
        'netas_sin_costo', coalesce(round(sum(l.monto / v_divisor) filter (where l.tipo = 'producto' and l.costo is null)), 0))
      from private.lineas_costeadas(p_desde, p_hasta) l where l.tipo = 'producto')
  );
end;
$$;
revoke all on function public.insumos_periodo(date, date) from public, anon;
grant execute on function public.insumos_periodo(date, date) to authenticated;
