-- =====================================================================
-- Fase 5: mermas
--
-- * Una merma = producto (y opcional sabor/opción), cantidad, fecha, motivo
--   y si era evitable.
-- * Se valoriza al costo vigente en la fecha de la merma (producto + opciones),
--   igual que las ventas. Si no hay costo, se informa como "sin costo".
-- * Registrar requiere "registrar_mermas". Ver el VALOR en pesos requiere
--   "ver_costos": las funciones de reporte devuelven null a quien no lo tiene.
-- * La merma valorizada se descuenta de la ganancia del panel.
-- =====================================================================

create table public.motivos_merma (
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) between 1 and 60),
  evitable_sugerido boolean not null default true,
  orden integer not null default 100,
  activo boolean not null default true
);
create unique index motivos_merma_nombre on public.motivos_merma (private.normalizar(nombre));
insert into public.motivos_merma (nombre, evitable_sugerido, orden) values
  ('No se vendió y se botó', true, 10),
  ('Regalado', true, 20),
  ('Error de producción', true, 30),
  ('Vencimiento', false, 40),
  ('Otro', false, 90);

create table public.mermas (
  id bigint generated always as identity primary key,
  fecha date not null default private.hoy(),
  producto_id bigint not null references public.productos (id),
  opcion_ids bigint[] not null default '{}',
  cantidad numeric(10, 2) not null check (cantidad > 0 and cantidad <= 10000),
  motivo_id bigint not null references public.motivos_merma (id),
  evitable boolean not null,
  nota text check (length(nota) <= 200),
  registrado_por uuid default auth.uid(),
  registrado_en timestamptz not null default now()
);
create index mermas_fecha on public.mermas (fecha);
create index mermas_producto on public.mermas (producto_id);

-- Mermas valorizadas en un rango (costo_unitario null = sin costo definido).
create or replace function private.mermas_valorizadas(p_desde date, p_hasta date)
returns table (
  id bigint, fecha date, producto_id bigint, opcion_ids bigint[], cantidad numeric,
  motivo_id bigint, evitable boolean, costo_unitario numeric, valor numeric
)
language sql stable security definer set search_path = ''
as $$
  with m as (select * from public.mermas where fecha between p_desde and p_hasta),
  ops as (
    select m.id, sum(c.costo_neto) as costo, bool_or(c.costo_neto is null) as falta
    from m
    cross join lateral unnest(m.opcion_ids) as o(opcion_id)
    left join lateral (
      select cv.costo_neto from public.costo_definiciones d
      join public.costo_versiones cv on cv.definicion_id = d.id
      where d.opcion_id = o.opcion_id and cv.vigente_desde <= m.fecha
      order by cv.vigente_desde desc limit 1
    ) c on true
    group by m.id
  ),
  unit as (
    select m.*,
      case when b.costo_neto is null or coalesce(ops.falta, false) then null
           else b.costo_neto + coalesce(ops.costo, 0) end as cu
    from m
    left join ops on ops.id = m.id
    left join lateral (
      select cv.costo_neto from public.costo_definiciones d
      join public.costo_versiones cv on cv.definicion_id = d.id
      where d.producto_id = m.producto_id and cv.vigente_desde <= m.fecha
      order by cv.vigente_desde desc limit 1
    ) b on true
  )
  select id, fecha, producto_id, opcion_ids, cantidad, motivo_id, evitable, cu, round(cu * cantidad, 2)
  from unit
$$;
revoke all on function private.mermas_valorizadas(date, date) from public, authenticated;

-- El panel usa esta función para descontar mermas de la ganancia.
create or replace function private.mermas_periodo(p_desde date, p_hasta date)
returns numeric
language sql stable security definer set search_path = ''
as $$ select coalesce(sum(valor), 0) from private.mermas_valorizadas(p_desde, p_hasta) $$;
revoke all on function private.mermas_periodo(date, date) from public, authenticated;

-- Reporte de mermas de un período.
create or replace function public.reporte_mermas(p_desde date, p_hasta date)
returns json
language plpgsql stable security definer set search_path = ''
as $$
declare
  ver_costos boolean := private.tiene_permiso('ver_costos');
begin
  if not (private.tiene_permiso('registrar_mermas') or ver_costos) then
    raise exception 'No tienes permiso para ver mermas.';
  end if;
  if p_hasta < p_desde or p_hasta - p_desde > 400 then
    raise exception 'El rango de fechas no es válido (máximo 400 días).';
  end if;
  return (
    with mv as (select * from private.mermas_valorizadas(p_desde, p_hasta))
    select json_build_object(
      'ver_costos', ver_costos,
      'total', json_build_object(
        'registros', (select count(*) from mv),
        'unidades', (select coalesce(sum(cantidad), 0) from mv),
        'valor', case when ver_costos then (select round(coalesce(sum(valor), 0)) from mv) end,
        'unidades_sin_costo', case when ver_costos then (select coalesce(sum(cantidad), 0) from mv where valor is null) end,
        'valor_evitable', case when ver_costos then (select round(coalesce(sum(valor), 0)) from mv where evitable) end,
        'unidades_evitables', (select coalesce(sum(cantidad), 0) from mv where evitable)
      ),
      'por_motivo', coalesce((
        select json_agg(x order by x.unidades desc) from (
          select mo.nombre as motivo, sum(mv.cantidad) as unidades,
                 case when ver_costos then round(sum(mv.valor)) end as valor
          from mv join public.motivos_merma mo on mo.id = mv.motivo_id
          group by mo.nombre) x), '[]'::json),
      'por_producto', coalesce((
        select json_agg(x order by x.unidades desc) from (
          select p.id as producto_id, p.nombre, sum(mv.cantidad) as unidades,
                 case when ver_costos then round(sum(mv.valor)) end as valor,
                 case when ver_costos then bool_or(mv.valor is null) end as falta_costo
          from mv join public.productos p on p.id = mv.producto_id
          group by p.id, p.nombre) x), '[]'::json),
      'por_dia', coalesce((
        select json_agg(x order by x.fecha) from (
          select fecha, sum(cantidad) as unidades,
                 case when ver_costos then round(sum(valor)) end as valor
          from mv group by fecha) x), '[]'::json)
    )
  );
end;
$$;
revoke all on function public.reporte_mermas(date, date) from public, anon;
grant execute on function public.reporte_mermas(date, date) to authenticated;

-- Lista de mermas de un día con su valor (valor null si no hay permiso de costos).
create or replace function public.mermas_del_dia(p_fecha date)
returns json
language plpgsql stable security definer set search_path = ''
as $$
declare
  ver_costos boolean := private.tiene_permiso('ver_costos');
begin
  if not (private.tiene_permiso('registrar_mermas') or ver_costos) then
    raise exception 'No tienes permiso para ver mermas.';
  end if;
  return coalesce((
    select json_agg(json_build_object(
      'id', mv.id, 'producto', p.nombre, 'producto_id', mv.producto_id,
      'opciones', (select string_agg(o.nombre, ', ' order by u.ord)
                   from unnest(mv.opcion_ids) with ordinality u(opcion_id, ord)
                   join public.opciones o on o.id = u.opcion_id),
      'cantidad', mv.cantidad, 'motivo', mo.nombre, 'evitable', mv.evitable,
      'nota', me.nota,
      'valor', case when ver_costos then mv.valor end,
      'sin_costo', case when ver_costos then mv.valor is null end
    ) order by me.registrado_en desc)
    from private.mermas_valorizadas(p_fecha, p_fecha) mv
    join public.mermas me on me.id = mv.id
    join public.productos p on p.id = mv.producto_id
    join public.motivos_merma mo on mo.id = mv.motivo_id
  ), '[]'::json);
end;
$$;
revoke all on function public.mermas_del_dia(date) from public, anon;
grant execute on function public.mermas_del_dia(date) to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.motivos_merma enable row level security;
alter table public.mermas enable row level security;
revoke all on public.motivos_merma, public.mermas from anon;
revoke delete on public.motivos_merma from authenticated;

create policy "motivos: ver" on public.motivos_merma for select to authenticated
using ((select private.tiene_permiso('registrar_mermas')) or (select private.tiene_permiso('ver_costos')));
create policy "motivos: crear" on public.motivos_merma for insert to authenticated
with check ((select private.tiene_permiso('editar_configuracion')));
create policy "motivos: editar" on public.motivos_merma for update to authenticated
using ((select private.tiene_permiso('editar_configuracion')))
with check ((select private.tiene_permiso('editar_configuracion')));

create policy "mermas: ver" on public.mermas for select to authenticated
using ((select private.tiene_permiso('registrar_mermas')) or (select private.tiene_permiso('ver_costos')));
create policy "mermas: registrar" on public.mermas for insert to authenticated
with check ((select private.tiene_permiso('registrar_mermas')));
create policy "mermas: corregir" on public.mermas for update to authenticated
using ((select private.tiene_permiso('registrar_mermas')))
with check ((select private.tiene_permiso('registrar_mermas')));
create policy "mermas: borrar" on public.mermas for delete to authenticated
using ((select private.tiene_permiso('registrar_mermas')));
