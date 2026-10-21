-- =====================================================================
-- Fase 2: catálogo, ingredientes, recetas y costos
--
-- Modelo de costo (decidido con el dueño):
--   costo de una venta = costo del producto + costo de cada opción elegida
--   Ej.: Café chico (vaso) + "Latte" + "Leche sin lactosa"
--        Galletas (sin costo propio) + 4 × "Galleta nuez"
--
-- Todo costo se guarda NETO (sin IVA).
--
-- Seguridad:
--   * categorías, productos y opciones (nombres y precios de venta): los ve
--     quien tenga "ver_ventas".
--   * ingredientes, recetas y costos: SOLO quien tenga "ver_costos".
--
-- Historial de costos (costo_versiones):
--   * Cada vez que cambia el costo unitario de algo, se guarda una versión
--     nueva con la fecha de hoy (hora de Santiago). Las ventas usan el costo
--     vigente el día de la venta, así el pasado no cambia solo.
--   * La PRIMERA vez que algo recibe costo, rige "desde siempre" (01/01/2000),
--     para que las ventas antiguas importadas también queden costeadas.
--   * Para corregir un error hacia atrás está aplicar_cambios_desde(fecha).
-- =====================================================================

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function private.normalizar(texto text)
returns text
language sql immutable parallel safe set search_path = ''
as $$
  select regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, trim(coalesce(texto, '')))), '\s+', ' ', 'g')
$$;
grant execute on function private.normalizar(text) to authenticated;

create or replace function private.hoy()
returns date
language sql stable set search_path = ''
as $$ select (now() at time zone 'America/Santiago')::date $$;
grant execute on function private.hoy() to authenticated;

create type public.unidad as enum ('g', 'kg', 'ml', 'l', 'un');

-- g→g, kg→g, ml→ml, l→ml, un→un
create or replace function private.factor_unidad(u public.unidad)
returns numeric language sql immutable set search_path = ''
as $$ select case u when 'kg' then 1000 when 'l' then 1000 else 1 end::numeric $$;

create or replace function private.dimension_unidad(u public.unidad)
returns text language sql immutable set search_path = ''
as $$ select case u when 'g' then 'masa' when 'kg' then 'masa' when 'ml' then 'volumen' when 'l' then 'volumen' else 'unidad' end $$;

grant execute on function private.factor_unidad(public.unidad) to authenticated;
grant execute on function private.dimension_unidad(public.unidad) to authenticated;

-- ---------------------------------------------------------------------
-- Catálogo (sin información de costos)
-- ---------------------------------------------------------------------
create table public.categorias (
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) between 1 and 60),
  orden integer not null default 100,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index categorias_nombre_unico on public.categorias (private.normalizar(nombre));

insert into public.categorias (nombre, orden) values
  ('Cafetería', 10), ('Bebestibles', 20), ('Galletería', 30), ('Bollería', 40),
  ('Pastelería', 50), ('Panadería', 60), ('Salados', 70), ('Otras', 900);

create type public.tipo_producto as enum ('producto', 'ajuste', 'abono');

create table public.productos (
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) between 1 and 120),
  nombre_normalizado text generated always as (private.normalizar(nombre)) stored,
  categoria_id bigint references public.categorias (id),
  -- 'ajuste' = Ley Redondeo; 'abono' = abonos de tortas cobrados en caja.
  -- Ninguno de los dos necesita costo ni cuenta como venta de productos.
  tipo public.tipo_producto not null default 'producto',
  precio_referencia integer check (precio_referencia >= 0), -- con IVA, solo referencia
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index productos_nombre_unico on public.productos (nombre_normalizado);
create index productos_categoria on public.productos (categoria_id);

create table public.opciones (
  id bigint generated always as identity primary key,
  producto_id bigint not null references public.productos (id) on delete cascade,
  nombre text not null check (length(trim(nombre)) between 1 and 120),
  nombre_normalizado text generated always as (private.normalizar(nombre)) stored,
  precio_referencia integer check (precio_referencia >= 0), -- recargo con IVA, referencia
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index opciones_nombre_unico on public.opciones (producto_id, nombre_normalizado);

-- ---------------------------------------------------------------------
-- Ingredientes y recetas (CONFIDENCIAL)
-- ---------------------------------------------------------------------
create table public.ingredientes (
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) between 1 and 80),
  -- "Harina: 25 kg a $18.000 neto"
  cantidad_compra numeric(12, 3) not null check (cantidad_compra > 0),
  unidad_compra public.unidad not null,
  precio_compra_neto numeric(12, 2) not null check (precio_compra_neto >= 0),
  activo boolean not null default true,
  actualizado_en timestamptz not null default now(),
  creado_en timestamptz not null default now()
);
create unique index ingredientes_nombre_unico on public.ingredientes (private.normalizar(nombre));

-- Historial de precios de cada ingrediente (lo llena un trigger).
create table public.ingrediente_precios (
  id bigint generated always as identity primary key,
  ingrediente_id bigint not null references public.ingredientes (id) on delete cascade,
  cantidad_compra numeric(12, 3) not null,
  unidad_compra public.unidad not null,
  precio_compra_neto numeric(12, 2) not null,
  registrado_en timestamptz not null default now(),
  registrado_por uuid default auth.uid()
);
create index ingrediente_precios_ing on public.ingrediente_precios (ingrediente_id, registrado_en desc);

create table public.recetas (
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) between 1 and 80),
  -- "Rinde 12 un" o "Rinde 2.000 g" (las recetas base suelen rendir en gramos)
  rendimiento numeric(12, 3) not null check (rendimiento > 0),
  unidad_rendimiento public.unidad not null default 'un',
  es_base boolean not null default false,
  notas text,
  actualizado_en timestamptz not null default now(),
  creado_en timestamptz not null default now()
);
create unique index recetas_nombre_unico on public.recetas (private.normalizar(nombre));

create table public.receta_items (
  id bigint generated always as identity primary key,
  receta_id bigint not null references public.recetas (id) on delete cascade,
  ingrediente_id bigint references public.ingredientes (id),
  subreceta_id bigint references public.recetas (id),
  cantidad numeric(12, 3) not null check (cantidad > 0),
  unidad public.unidad not null,
  orden integer not null default 0,
  check ((ingrediente_id is null) <> (subreceta_id is null)),
  check (subreceta_id is null or subreceta_id <> receta_id)
);
create index receta_items_receta on public.receta_items (receta_id);
create index receta_items_ingrediente on public.receta_items (ingrediente_id);
create index receta_items_subreceta on public.receta_items (subreceta_id);

-- Costos fijos por tanda de receta (mano de obra, gas, etc.)
create table public.receta_adicionales (
  id bigint generated always as identity primary key,
  receta_id bigint not null references public.recetas (id) on delete cascade,
  concepto text not null check (length(trim(concepto)) between 1 and 60),
  monto_neto numeric(12, 2) not null check (monto_neto >= 0)
);
create index receta_adicionales_receta on public.receta_adicionales (receta_id);

-- ---------------------------------------------------------------------
-- Definición de costo de un producto u opción (CONFIDENCIAL)
--   manual: costo fijo escrito a mano
--   receta: costo unitario de una receta × cantidad usada
--   cero:   no tiene costo propio (ej.: "Galletas" cuyo costo está en las
--           opciones, o "Leche entera" que ya está incluida)
-- Sin fila de definición = "sin costo definido" (se avisa).
-- ---------------------------------------------------------------------
create type public.modo_costo as enum ('manual', 'receta', 'cero');

create table public.costo_definiciones (
  id bigint generated always as identity primary key,
  producto_id bigint references public.productos (id),
  opcion_id bigint references public.opciones (id),
  modo public.modo_costo not null,
  costo_manual_neto numeric(12, 2) check (costo_manual_neto >= 0),
  receta_id bigint references public.recetas (id),
  -- Cuánto de la receta usa 1 unidad vendida, en la unidad de rendimiento.
  -- Ej.: "Media luna x6" usa 6 un de la receta "Media lunas".
  cantidad_receta numeric(12, 3) not null default 1 check (cantidad_receta > 0),
  actualizado_en timestamptz not null default now(),
  check ((producto_id is null) <> (opcion_id is null)),
  check (modo <> 'manual' or costo_manual_neto is not null),
  check (modo <> 'receta' or receta_id is not null)
);
create unique index costo_def_producto on public.costo_definiciones (producto_id) where producto_id is not null;
create unique index costo_def_opcion on public.costo_definiciones (opcion_id) where opcion_id is not null;
create index costo_def_receta on public.costo_definiciones (receta_id);

-- Costos adicionales por unidad vendida (packaging, mano de obra extra…)
create table public.costo_adicionales (
  id bigint generated always as identity primary key,
  definicion_id bigint not null references public.costo_definiciones (id) on delete cascade,
  concepto text not null check (length(trim(concepto)) between 1 and 60),
  monto_neto numeric(12, 2) not null check (monto_neto >= 0)
);
create index costo_adicionales_def on public.costo_adicionales (definicion_id);

-- Historial de costo unitario vigente (lo escriben solo los triggers).
create table public.costo_versiones (
  id bigint generated always as identity primary key,
  definicion_id bigint not null references public.costo_definiciones (id),
  vigente_desde date not null,
  costo_neto numeric(12, 2) not null check (costo_neto >= 0),
  registrado_en timestamptz not null default now(),
  unique (definicion_id, vigente_desde)
);

-- ---------------------------------------------------------------------
-- Cálculo de costos
-- ---------------------------------------------------------------------

-- Costo de UNA unidad de rendimiento de la receta (ej.: 1 brownie, 1 g de masa).
-- Devuelve null si falta algo o hay unidades incompatibles (g vs ml).
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
  return total / r.rendimiento;
end;
$$;

-- Costo unitario actual de una definición (null = incompleto).
create or replace function private.costo_definicion(p_def bigint)
returns numeric
language sql stable set search_path = ''
as $$
  select case d.modo
           when 'manual' then d.costo_manual_neto
           when 'cero' then 0
           when 'receta' then private.costo_receta_unitario(d.receta_id) * d.cantidad_receta
         end
         + coalesce((select sum(a.monto_neto) from public.costo_adicionales a where a.definicion_id = d.id), 0)
  from public.costo_definiciones d
  where d.id = p_def
$$;

-- Recalcula todo y guarda versiones nuevas donde el costo cambió.
create or replace function private.recalcular_costos()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  d record;
  actual numeric;
  ultima record;
  hoy date := private.hoy();
begin
  for d in select id from public.costo_definiciones loop
    actual := round(private.costo_definicion(d.id), 2);
    if actual is null then
      continue; -- incompleta: se mantiene la última versión válida
    end if;
    select vigente_desde, costo_neto into ultima
    from public.costo_versiones
    where definicion_id = d.id
    order by vigente_desde desc
    limit 1;
    if not found then
      insert into public.costo_versiones (definicion_id, vigente_desde, costo_neto)
      values (d.id, date '2000-01-01', actual);
    elsif ultima.costo_neto <> actual then
      insert into public.costo_versiones (definicion_id, vigente_desde, costo_neto)
      values (d.id, greatest(hoy, ultima.vigente_desde), actual)
      on conflict (definicion_id, vigente_desde)
      do update set costo_neto = excluded.costo_neto, registrado_en = now();
    end if;
  end loop;
end;
$$;

create or replace function private.trigger_recalcular()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.recalcular_costos();
  return null;
end;
$$;

create trigger recalcular after insert or update or delete on public.ingredientes
for each statement execute function private.trigger_recalcular();
create trigger recalcular after insert or update or delete on public.recetas
for each statement execute function private.trigger_recalcular();
create trigger recalcular after insert or update or delete on public.receta_items
for each statement execute function private.trigger_recalcular();
create trigger recalcular after insert or update or delete on public.receta_adicionales
for each statement execute function private.trigger_recalcular();
create trigger recalcular after insert or update or delete on public.costo_definiciones
for each statement execute function private.trigger_recalcular();
create trigger recalcular after insert or update or delete on public.costo_adicionales
for each statement execute function private.trigger_recalcular();

-- Historial de precios de ingredientes
create or replace function private.registrar_precio_ingrediente()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.precio_compra_neto <> old.precio_compra_neto
     or new.cantidad_compra <> old.cantidad_compra
     or new.unidad_compra <> old.unidad_compra then
    insert into public.ingrediente_precios (ingrediente_id, cantidad_compra, unidad_compra, precio_compra_neto)
    values (new.id, new.cantidad_compra, new.unidad_compra, new.precio_compra_neto);
  end if;
  return null;
end;
$$;
create trigger historial_precio after insert or update on public.ingredientes
for each row execute function private.registrar_precio_ingrediente();

create trigger ingredientes_actualizado before update on public.ingredientes
for each row execute function private.tocar_actualizado_en();
create trigger recetas_actualizado before update on public.recetas
for each row execute function private.tocar_actualizado_en();
create trigger costo_def_actualizado before update on public.costo_definiciones
for each row execute function private.tocar_actualizado_en();

-- Evitar ciclos: una receta no puede contenerse a sí misma (ni indirectamente).
create or replace function private.evitar_ciclo_receta()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.subreceta_id is not null and exists (
    with recursive cadena(id) as (
      select new.subreceta_id
      union
      select ri.subreceta_id
      from public.receta_items ri join cadena c on ri.receta_id = c.id
      where ri.subreceta_id is not null
    )
    select 1 from cadena where id = new.receta_id
  ) then
    raise exception 'Esa receta ya usa a esta otra; no se pueden usar mutuamente.';
  end if;
  return new;
end;
$$;
create trigger evitar_ciclo before insert or update on public.receta_items
for each row execute function private.evitar_ciclo_receta();

-- Corrección hacia atrás: los cambios de costo hechos HOY pasan a regir
-- desde p_desde (se reemplazan las versiones intermedias).
create or replace function public.aplicar_cambios_desde(p_desde date)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  hoy date := private.hoy();
  n integer := 0;
  v record;
begin
  if not (private.tiene_permiso('editar_catalogo') and private.tiene_permiso('ver_costos')) then
    raise exception 'No tienes permiso para cambiar costos.';
  end if;
  if p_desde is null or p_desde >= hoy or p_desde < date '2020-01-01' then
    raise exception 'La fecha debe ser anterior a hoy.';
  end if;
  for v in select id, definicion_id from public.costo_versiones where vigente_desde = hoy loop
    delete from public.costo_versiones
    where definicion_id = v.definicion_id and vigente_desde >= p_desde and vigente_desde < hoy;
    update public.costo_versiones set vigente_desde = p_desde where id = v.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.aplicar_cambios_desde(date) from public, anon;
grant execute on function public.aplicar_cambios_desde(date) to authenticated;

-- Costo vigente en una fecha (para valorizar ventas y mermas).
create or replace function private.costo_vigente(p_def bigint, p_fecha date)
returns numeric
language sql stable set search_path = ''
as $$
  select costo_neto from public.costo_versiones
  where definicion_id = p_def and vigente_desde <= p_fecha
  order by vigente_desde desc limit 1
$$;

-- ---------------------------------------------------------------------
-- Vistas para la app (respetan RLS de quien consulta)
-- ---------------------------------------------------------------------
create view public.v_costos with (security_invoker = true) as
select
  d.id as definicion_id,
  d.producto_id,
  d.opcion_id,
  d.modo,
  d.costo_manual_neto,
  d.receta_id,
  d.cantidad_receta,
  round(private.costo_definicion(d.id), 2) as costo_calculado,
  v.costo_neto as costo_vigente,
  v.vigente_desde
from public.costo_definiciones d
left join lateral (
  select costo_neto, vigente_desde from public.costo_versiones cv
  where cv.definicion_id = d.id order by vigente_desde desc limit 1
) v on true;

create view public.v_recetas with (security_invoker = true) as
select
  r.*,
  round(private.costo_receta_unitario(r.id) * r.rendimiento, 2) as costo_total,
  round(private.costo_receta_unitario(r.id), 4) as costo_unitario
from public.recetas r;

grant execute on function private.costo_receta_unitario(bigint, int) to authenticated;
grant execute on function private.costo_definicion(bigint) to authenticated;
revoke all on function private.recalcular_costos() from public;
revoke all on function private.costo_vigente(bigint, date) from public;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.categorias enable row level security;
alter table public.productos enable row level security;
alter table public.opciones enable row level security;
alter table public.ingredientes enable row level security;
alter table public.ingrediente_precios enable row level security;
alter table public.recetas enable row level security;
alter table public.receta_items enable row level security;
alter table public.receta_adicionales enable row level security;
alter table public.costo_definiciones enable row level security;
alter table public.costo_adicionales enable row level security;
alter table public.costo_versiones enable row level security;

revoke all on public.categorias, public.productos, public.opciones, public.ingredientes,
  public.ingrediente_precios, public.recetas, public.receta_items, public.receta_adicionales,
  public.costo_definiciones, public.costo_adicionales, public.costo_versiones,
  public.v_costos, public.v_recetas
from anon;
-- Historiales: solo los escriben los triggers. Catálogo: se desactiva, no se borra.
revoke insert, update, delete on public.costo_versiones, public.ingrediente_precios from authenticated;
revoke delete on public.categorias, public.productos, public.opciones, public.costo_definiciones from authenticated;

-- Catálogo: lo ve quien ve ventas; lo edita quien edita catálogo.
create policy "categorias: ver" on public.categorias for select to authenticated
using ((select private.tiene_permiso('ver_ventas')));
create policy "categorias: crear" on public.categorias for insert to authenticated
with check ((select private.tiene_permiso('editar_catalogo')));
create policy "categorias: editar" on public.categorias for update to authenticated
using ((select private.tiene_permiso('editar_catalogo')))
with check ((select private.tiene_permiso('editar_catalogo')));

create policy "productos: ver" on public.productos for select to authenticated
using ((select private.tiene_permiso('ver_ventas')));
create policy "productos: crear" on public.productos for insert to authenticated
with check ((select private.tiene_permiso('editar_catalogo')));
create policy "productos: editar" on public.productos for update to authenticated
using ((select private.tiene_permiso('editar_catalogo')))
with check ((select private.tiene_permiso('editar_catalogo')));

create policy "opciones: ver" on public.opciones for select to authenticated
using ((select private.tiene_permiso('ver_ventas')));
create policy "opciones: crear" on public.opciones for insert to authenticated
with check ((select private.tiene_permiso('editar_catalogo')));
create policy "opciones: editar" on public.opciones for update to authenticated
using ((select private.tiene_permiso('editar_catalogo')))
with check ((select private.tiene_permiso('editar_catalogo')));

-- Tablas confidenciales: ver = ver_costos; editar = editar_catalogo + ver_costos.
do $$
declare
  t text;
begin
  foreach t in array array['ingredientes', 'recetas', 'receta_items', 'receta_adicionales',
                           'costo_definiciones', 'costo_adicionales'] loop
    execute format($f$
      create policy "%1$s: ver (costos)" on public.%1$I for select to authenticated
      using ((select private.tiene_permiso('ver_costos')));
      create policy "%1$s: crear (costos)" on public.%1$I for insert to authenticated
      with check ((select private.tiene_permiso('ver_costos')) and (select private.tiene_permiso('editar_catalogo')));
      create policy "%1$s: editar (costos)" on public.%1$I for update to authenticated
      using ((select private.tiene_permiso('ver_costos')) and (select private.tiene_permiso('editar_catalogo')))
      with check ((select private.tiene_permiso('ver_costos')) and (select private.tiene_permiso('editar_catalogo')));
    $f$, t);
  end loop;
  foreach t in array array['ingredientes', 'recetas', 'receta_items', 'receta_adicionales', 'costo_adicionales'] loop
    execute format($f$
      create policy "%1$s: borrar (costos)" on public.%1$I for delete to authenticated
      using ((select private.tiene_permiso('ver_costos')) and (select private.tiene_permiso('editar_catalogo')));
    $f$, t);
  end loop;
end $$;

create policy "costo_versiones: ver" on public.costo_versiones for select to authenticated
using ((select private.tiene_permiso('ver_costos')));
create policy "ingrediente_precios: ver" on public.ingrediente_precios for select to authenticated
using ((select private.tiene_permiso('ver_costos')));
