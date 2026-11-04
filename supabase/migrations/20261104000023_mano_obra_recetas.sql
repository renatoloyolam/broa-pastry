-- =====================================================================
-- Mano de obra y G.I.F. por horas en las recetas, como en la planilla:
--   horas de la receta × valor hora ÷ lo que rinde.
--
-- * valores_hora: un valor único para toda la app, editable. Se recalculan
--   todas las recetas al cambiarlo. Los montos reales se cargan aparte (no van
--   en el repositorio porque salen de los sueldos).
-- * recetas.horas_mano_obra / horas_gif: el total de la tanda, sumando todas
--   las etapas, sin importar cuántas personas participan.
--
-- Finanzas: el costo de cada producto sigue incluyendo mano de obra y G.I.F.
-- para fijar precios y márgenes, pero el "Resultado real" del mes no los
-- descuenta: ahí se restan los sueldos y gastos reales de "Gastos del mes".
-- finanzas_mes() entrega esa parte del costo para poder separarla.
-- =====================================================================

create table public.valores_hora (
  id boolean primary key default true check (id),
  mano_obra numeric(10, 2) not null default 0 check (mano_obra >= 0),
  gif numeric(10, 2) not null default 0 check (gif >= 0),
  actualizado_en timestamptz not null default now()
);
insert into public.valores_hora default values;

create trigger valores_hora_actualizado before update on public.valores_hora
for each row execute function private.tocar_actualizado_en();
create trigger recalcular after update on public.valores_hora
for each statement execute function private.trigger_recalcular();

alter table public.valores_hora enable row level security;
revoke all on public.valores_hora from anon;
revoke insert, delete on public.valores_hora from authenticated;
create policy "valores_hora: ver" on public.valores_hora for select to authenticated
using ((select private.tiene_permiso('ver_costos')));
create policy "valores_hora: editar" on public.valores_hora for update to authenticated
using ((select private.tiene_permiso('editar_catalogo')))
with check ((select private.tiene_permiso('editar_catalogo')));

alter table public.recetas
  add column horas_mano_obra numeric(8, 3) not null default 0 check (horas_mano_obra >= 0),
  add column horas_gif numeric(8, 3) not null default 0 check (horas_gif >= 0);

-- Costo de UNA unidad de rendimiento: igual que antes, más las horas de la tanda.
create or replace function private.costo_receta_unitario(p_receta bigint, p_profundidad int default 0)
returns numeric
language plpgsql stable set search_path = ''
as $$
declare
  r record;
  it record;
  total numeric := 0;
  sub numeric;
begin
  if p_profundidad > 6 then
    return null;
  end if;
  select * into r from public.recetas where id = p_receta;
  if not found then
    return null;
  end if;
  for it in
    select ri.*, i.cantidad_compra, i.unidad_compra, i.precio_compra_neto,
           s.unidad_rendimiento as sub_unidad
    from public.receta_items ri
    left join public.ingredientes i on i.id = ri.ingrediente_id
    left join public.recetas s on s.id = ri.subreceta_id
    where ri.receta_id = p_receta
  loop
    if it.ingrediente_id is not null then
      if private.dimension_unidad(it.unidad) <> private.dimension_unidad(it.unidad_compra) then
        return null;
      end if;
      total := total + (it.cantidad * private.factor_unidad(it.unidad))
                       * it.precio_compra_neto
                       / (it.cantidad_compra * private.factor_unidad(it.unidad_compra));
    else
      if private.dimension_unidad(it.unidad) <> private.dimension_unidad(it.sub_unidad) then
        return null;
      end if;
      sub := private.costo_receta_unitario(it.subreceta_id, p_profundidad + 1);
      if sub is null then
        return null;
      end if;
      total := total + (it.cantidad * private.factor_unidad(it.unidad))
                       / private.factor_unidad(it.sub_unidad) * sub;
    end if;
  end loop;
  total := total + coalesce((select sum(monto_neto) from public.receta_adicionales where receta_id = p_receta), 0);
  total := total + coalesce((select r.horas_mano_obra * v.mano_obra + r.horas_gif * v.gif from public.valores_hora v), 0);
  return total / r.rendimiento;
end;
$$;

-- Las columnas nuevas van al final: una vista no puede reordenar las que ya tiene.
create or replace view public.v_recetas with (security_invoker = true) as
select
  r.id, r.nombre, r.rendimiento, r.unidad_rendimiento, r.es_base, r.notas, r.actualizado_en, r.creado_en,
  round(private.costo_receta_unitario(r.id) * r.rendimiento, 2) as costo_total,
  round(private.costo_receta_unitario(r.id), 4) as costo_unitario,
  r.horas_mano_obra,
  r.horas_gif
from public.recetas r;

drop function public.guardar_receta(bigint, text, numeric, public.unidad, boolean, text, jsonb, jsonb);
create function public.guardar_receta(
  p_id bigint,
  p_nombre text,
  p_rendimiento numeric,
  p_unidad_rendimiento public.unidad,
  p_es_base boolean,
  p_notas text,
  p_items jsonb,
  p_adicionales jsonb,
  p_horas_mano_obra numeric default 0,
  p_horas_gif numeric default 0
)
returns bigint
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id bigint := p_id;
begin
  if v_id is null then
    insert into public.recetas (nombre, rendimiento, unidad_rendimiento, es_base, notas, horas_mano_obra, horas_gif)
    values (trim(p_nombre), p_rendimiento, p_unidad_rendimiento, p_es_base, nullif(trim(p_notas), ''), p_horas_mano_obra, p_horas_gif)
    returning id into v_id;
  else
    update public.recetas set
      nombre = trim(p_nombre), rendimiento = p_rendimiento, unidad_rendimiento = p_unidad_rendimiento,
      es_base = p_es_base, notas = nullif(trim(p_notas), ''),
      horas_mano_obra = p_horas_mano_obra, horas_gif = p_horas_gif
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
revoke all on function public.guardar_receta(bigint, text, numeric, public.unidad, boolean, text, jsonb, jsonb, numeric, numeric) from public, anon;
grant execute on function public.guardar_receta(bigint, text, numeric, public.unidad, boolean, text, jsonb, jsonb, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- Qué parte del costo es mano de obra y G.I.F. (para no restarla dos veces)
-- ---------------------------------------------------------------------
create or replace function private.es_costo_indirecto(p_concepto text)
returns boolean
language sql immutable set search_path = ''
as $$ select p_concepto ~* '(mano de obra|g\.?i\.?f\.?($|[^a-z])|gastos indirectos)' $$;

-- Parte indirecta de UNA unidad de rendimiento, incluidas las recetas base.
create or replace function private.indirecto_receta_unitario(p_receta bigint, p_profundidad int default 0)
returns numeric
language plpgsql stable security definer set search_path = ''
as $$
declare
  r record;
  it record;
  total numeric := 0;
begin
  if p_profundidad > 6 then
    return 0;
  end if;
  select * into r from public.recetas where id = p_receta;
  if not found then
    return 0;
  end if;
  for it in
    select ri.subreceta_id, ri.cantidad, ri.unidad, s.unidad_rendimiento as sub_unidad
    from public.receta_items ri
    join public.recetas s on s.id = ri.subreceta_id
    where ri.receta_id = p_receta
  loop
    if private.dimension_unidad(it.unidad) = private.dimension_unidad(it.sub_unidad) then
      total := total + (it.cantidad * private.factor_unidad(it.unidad)) / private.factor_unidad(it.sub_unidad)
                       * private.indirecto_receta_unitario(it.subreceta_id, p_profundidad + 1);
    end if;
  end loop;
  total := total + coalesce((select sum(a.monto_neto) from public.receta_adicionales a
                             where a.receta_id = p_receta and private.es_costo_indirecto(a.concepto)), 0);
  total := total + coalesce((select r.horas_mano_obra * v.mano_obra + r.horas_gif * v.gif from public.valores_hora v), 0);
  return total / r.rendimiento;
end;
$$;
revoke all on function private.indirecto_receta_unitario(bigint, int) from public, authenticated;

create or replace function private.indirecto_definicion(p_def bigint)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select case when d.modo = 'receta' then private.indirecto_receta_unitario(d.receta_id) * d.cantidad_receta else 0 end
         + coalesce((select sum(a.monto_neto) from public.costo_adicionales a
                     where a.definicion_id = d.id and private.es_costo_indirecto(a.concepto)), 0)
  from public.costo_definiciones d
  where d.id = p_def
$$;
revoke all on function private.indirecto_definicion(bigint) from public, authenticated;

-- Igual que antes, pero "insumos" descuenta solo mano de obra y G.I.F.: el
-- packaging y otros adicionales del producto sí son compras de insumos.
create or replace function private.uso_insumos(p_desde date, p_hasta date)
returns table (origen text, categoria_id bigint, costo numeric, insumos numeric)
language sql stable security definer set search_path = ''
as $$
  with fraccion as (
    select v.definicion_id,
           case when coalesce(v.costo_calculado, 0) > 0
                then greatest(0, least(1, (v.costo_calculado - private.indirecto_definicion(v.definicion_id)) / v.costo_calculado))
                else 1 end as f
    from public.v_costos v
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

-- finanzas_mes(): lo mismo de antes, más "indirecto": la parte del costo de lo
-- vendido y de las mermas que es mano de obra y G.I.F.
create or replace function public.finanzas_mes(p_mes date)
returns json
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_desde date := date_trunc('month', p_mes)::date;
  v_hasta date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  c public.configuracion;
  v_panel json;
  v_divisor numeric;
  v_comisiones numeric;
  v_por_medio json;
  v_indirecto json;
begin
  if not private.tiene_permiso('gestionar_finanzas') then
    raise exception 'No tienes permiso para gestionar las finanzas.';
  end if;
  select * into c from public.configuracion;
  v_divisor := case when c.precios_incluyen_iva then 1 + c.tasa_iva else 1 end;
  v_panel := public.panel(v_desde, v_hasta, null, null);

  select json_build_object(
           'ventas', coalesce(round(sum(u.costo - u.insumos) filter (where u.origen = 'ventas')), 0),
           'mermas', coalesce(round(sum(u.costo - u.insumos) filter (where u.origen = 'mermas')), 0))
  into v_indirecto
  from private.uso_insumos(v_desde, v_hasta) u;

  -- Comisiones: sobre lo cobrado en cada venta (sin abonos de tortas, que
  -- tampoco cuentan como venta). Pagos mixtos: se usa la tarifa más alta.
  with por_venta as (
    select v.metodo_pago, sum(l.monto) as monto
    from public.ventas v
    join public.venta_lineas l on l.venta_numero = v.numero
    join public.productos p on p.id = l.producto_id
    where v.fecha between v_desde and v_hasta and p.tipo <> 'abono'
    group by v.numero, v.metodo_pago
  ),
  medios as (
    select case
             when metodo_pago ilike '%crédito%' or metodo_pago ilike '%credito%' then 'Crédito'
             when metodo_pago ilike '%débito%' or metodo_pago ilike '%debito%' then 'Débito'
             when metodo_pago ilike '%efectivo%' then 'Efectivo'
             else coalesce(nullif(trim(metodo_pago), ''), 'Otro')
           end as medio,
           monto
    from por_venta
  ),
  totales as (
    select medio, round(sum(monto)) as monto,
           round(sum(monto) * case medio when 'Crédito' then c.comision_credito
                                         when 'Débito' then c.comision_debito else 0 end) as comision
    from medios group by medio
  )
  select coalesce(sum(comision), 0),
         coalesce(json_agg(json_build_object('medio', medio, 'monto', monto, 'comision', comision) order by monto desc), '[]'::json)
  into v_comisiones, v_por_medio
  from totales;

  return json_build_object(
    'mes', v_desde,
    'hasta', v_hasta,
    'hoy', private.hoy(),
    'divisor', v_divisor,
    'resumen', v_panel->'resumen',
    'indirecto', v_indirecto,
    'ultimo_dia', (select max(fecha) from public.ventas where fecha between v_desde and v_hasta),
    'dias_con_venta', (select count(distinct fecha) from public.ventas where fecha between v_desde and v_hasta),
    'dias_cerrado', (select to_json(u.dias_cerrado) from public.umbrales_alertas u),
    'comisiones', v_comisiones,
    'por_medio', v_por_medio,
    'comision_debito', c.comision_debito,
    'comision_credito', c.comision_credito,
    'gastos', coalesce((
      select json_agg(json_build_object(
        'id', g.id, 'nombre', g.nombre, 'categoria', g.categoria, 'monto', g.monto, 'dia_pago', g.dia_pago,
        'se_repite', g.se_repite, 'pagado', g.pagado, 'pagado_en', g.pagado_en, 'nota', g.nota
      ) order by g.dia_pago nulls last, g.nombre)
      from public.gastos g where g.mes = v_desde), '[]'::json)
  );
end;
$$;
