-- =====================================================================
-- Fase 7: pedidos de tortas con abonos
--
-- Decisión (con el dueño): el abono y el saldo se cobran en influye, así
-- que el pedido NO se suma a las ventas del panel (ya viene en el Excel).
-- Este módulo controla pedidos, fechas de entrega, abonos y saldos, y
-- estima la ganancia de cada pedido.
--
-- Seguridad:
--   * pedidos y abonos: quien tiene "gestionar_pedidos".
--   * costo estimado y ganancia: solo con "ver_costos" (tabla aparte y
--     funciones que devuelven null a quien no puede verlos).
-- =====================================================================

create type public.estado_pedido as enum ('pendiente', 'entregado', 'cancelado');

create table public.pedidos (
  id bigint generated always as identity primary key,
  cliente text not null check (length(trim(cliente)) between 1 and 80),
  telefono text check (length(telefono) <= 30),
  descripcion text not null check (length(trim(descripcion)) between 1 and 300),
  producto_id bigint references public.productos (id),
  opcion_id bigint references public.opciones (id),
  fecha_entrega date not null,
  hora_entrega time,
  precio_total integer not null check (precio_total > 0), -- con IVA
  estado public.estado_pedido not null default 'pendiente',
  entregado_en timestamptz,
  notas text check (length(notas) <= 500),
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index pedidos_entrega on public.pedidos (fecha_entrega);
create index pedidos_estado on public.pedidos (estado);
create trigger pedidos_actualizado before update on public.pedidos
for each row execute function private.tocar_actualizado_en();

create table public.pedido_abonos (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references public.pedidos (id) on delete cascade,
  fecha date not null default private.hoy(),
  monto integer not null check (monto > 0),
  medio_pago text check (length(medio_pago) <= 40),
  nota text check (length(nota) <= 200),
  registrado_por uuid default auth.uid(),
  registrado_en timestamptz not null default now()
);
create index pedido_abonos_pedido on public.pedido_abonos (pedido_id);

-- Costo estimado escrito a mano (si no, se usa el costo del producto/opción del catálogo)
create table public.pedido_costos (
  pedido_id bigint primary key references public.pedidos (id) on delete cascade,
  costo_neto numeric(12, 2) not null check (costo_neto >= 0)
);

-- Costo de catálogo de un producto + opción en una fecha (null si falta algo).
create or replace function private.costo_catalogo(p_producto bigint, p_opcion bigint, p_fecha date)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select case when p_producto is null then null else
    (select private.costo_vigente(d.id, p_fecha) from public.costo_definiciones d where d.producto_id = p_producto)
    + case when p_opcion is null then 0 else
        (select private.costo_vigente(d.id, p_fecha) from public.costo_definiciones d where d.opcion_id = p_opcion) end
  end
$$;
revoke all on function private.costo_catalogo(bigint, bigint, date) from public, authenticated;

-- Lista de pedidos con abonos, saldo y (si se puede) costo y ganancia esperada.
-- p_filtro: 'proximos' | 'saldo' | 'entregados' | 'cancelados' | 'todos'
create or replace function public.lista_pedidos(p_filtro text default 'proximos')
returns json
language plpgsql stable security definer set search_path = ''
as $$
declare
  ver_costos boolean := private.tiene_permiso('ver_costos');
  hoy date := private.hoy();
  divisor numeric;
begin
  if not private.tiene_permiso('gestionar_pedidos') then
    raise exception 'No tienes permiso para ver pedidos.';
  end if;
  select case when c.precios_incluyen_iva and c.margen_sobre_neto then 1 + c.tasa_iva else 1 end
  into divisor from public.configuracion c;
  return coalesce((
    select json_agg(x order by
      case when p_filtro in ('entregados', 'cancelados', 'todos') then null else x.fecha_entrega end asc,
      case when p_filtro in ('entregados', 'cancelados', 'todos') then x.fecha_entrega end desc,
      x.hora_entrega nulls last, x.id)
    from (
      select
        p.id, p.cliente, p.telefono, p.descripcion, p.producto_id, p.opcion_id,
        coalesce(pr.nombre || coalesce(' · ' || o.nombre, ''), null) as producto,
        p.fecha_entrega, to_char(p.hora_entrega, 'HH24:MI') as hora_entrega,
        p.precio_total, p.estado, p.notas, p.entregado_en,
        coalesce(a.abonado, 0) as abonado,
        p.precio_total - coalesce(a.abonado, 0) as saldo,
        coalesce(a.abonos, '[]'::json) as abonos,
        case when ver_costos then coalesce(pc.costo_neto, private.costo_catalogo(p.producto_id, p.opcion_id, p.fecha_entrega)) end as costo_estimado,
        case when ver_costos then pc.costo_neto is not null end as costo_manual,
        case when ver_costos then round(p.precio_total / divisor
             - coalesce(pc.costo_neto, private.costo_catalogo(p.producto_id, p.opcion_id, p.fecha_entrega))) end as ganancia_esperada
      from public.pedidos p
      left join public.productos pr on pr.id = p.producto_id
      left join public.opciones o on o.id = p.opcion_id
      left join public.pedido_costos pc on pc.pedido_id = p.id
      left join lateral (
        select sum(ab.monto) as abonado,
               json_agg(json_build_object('id', ab.id, 'fecha', ab.fecha, 'monto', ab.monto, 'medio_pago', ab.medio_pago, 'nota', ab.nota)
                        order by ab.fecha, ab.id) as abonos
        from public.pedido_abonos ab where ab.pedido_id = p.id
      ) a on true
      where case p_filtro
        when 'proximos' then p.estado = 'pendiente'
        when 'saldo' then p.estado <> 'cancelado' and p.precio_total - coalesce(a.abonado, 0) > 0
        when 'entregados' then p.estado = 'entregado' and p.fecha_entrega >= hoy - 120
        when 'cancelados' then p.estado = 'cancelado' and p.fecha_entrega >= hoy - 120
        else p.fecha_entrega >= hoy - 120
      end
    ) x
  ), '[]'::json);
end;
$$;
revoke all on function public.lista_pedidos(text) from public, anon;
grant execute on function public.lista_pedidos(text) to authenticated;

-- Resumen para Inicio: entregas de hoy y mañana, y saldo pendiente total.
create or replace function public.resumen_pedidos()
returns json
language plpgsql stable security definer set search_path = ''
as $$
declare
  hoy date := private.hoy();
begin
  if not private.tiene_permiso('gestionar_pedidos') then
    return null;
  end if;
  return json_build_object(
    'hoy', (select count(*) from public.pedidos where estado = 'pendiente' and fecha_entrega = hoy),
    'manana', (select count(*) from public.pedidos where estado = 'pendiente' and fecha_entrega = hoy + 1),
    'atrasados', (select count(*) from public.pedidos where estado = 'pendiente' and fecha_entrega < hoy),
    'proximos_7', (select count(*) from public.pedidos where estado = 'pendiente' and fecha_entrega between hoy and hoy + 7),
    'saldo_pendiente', (
      select coalesce(sum(p.precio_total - coalesce((select sum(monto) from public.pedido_abonos a where a.pedido_id = p.id), 0)), 0)
      from public.pedidos p where p.estado = 'pendiente')
  );
end;
$$;
revoke all on function public.resumen_pedidos() from public, anon;
grant execute on function public.resumen_pedidos() to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.pedidos enable row level security;
alter table public.pedido_abonos enable row level security;
alter table public.pedido_costos enable row level security;
revoke all on public.pedidos, public.pedido_abonos, public.pedido_costos from anon;

create policy "pedidos: todo con permiso" on public.pedidos for all to authenticated
using ((select private.tiene_permiso('gestionar_pedidos')))
with check ((select private.tiene_permiso('gestionar_pedidos')));

create policy "abonos: todo con permiso" on public.pedido_abonos for all to authenticated
using ((select private.tiene_permiso('gestionar_pedidos')))
with check ((select private.tiene_permiso('gestionar_pedidos')));

create policy "pedido_costos: ver con costos" on public.pedido_costos for select to authenticated
using ((select private.tiene_permiso('ver_costos')));
create policy "pedido_costos: editar con costos" on public.pedido_costos for all to authenticated
using ((select private.tiene_permiso('ver_costos')) and (select private.tiene_permiso('gestionar_pedidos')))
with check ((select private.tiene_permiso('ver_costos')) and (select private.tiene_permiso('gestionar_pedidos')));
