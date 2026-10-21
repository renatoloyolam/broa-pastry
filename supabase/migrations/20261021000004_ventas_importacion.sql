-- =====================================================================
-- Fase 3: ventas importadas desde influye.app
--
-- * ventas: una fila por transacción. La clave es el "#" de influye, así
--   una transacción nunca se guarda dos veces aunque se suba el mismo
--   período más de una vez.
-- * venta_lineas: una fila por ítem vendido (influye exporta 1 fila por
--   unidad). "monto" es lo efectivamente pagado con IVA, después de repartir
--   el descuento de la boleta entre sus ítems.
-- * Los costos NO se guardan aquí: se calculan con el historial de costos
--   según la fecha de la venta (ver Fase 4).
-- * Seguridad: las ventas las ve quien tiene "ver_ventas" (sin costos).
--   Importar y deshacer requiere "importar_ventas".
-- =====================================================================

create table public.importaciones (
  id bigint generated always as identity primary key,
  archivo text not null,
  subido_por uuid default auth.uid(),
  subido_en timestamptz not null default now(),
  desde date,
  hasta date,
  transacciones_nuevas integer not null default 0,
  transacciones_repetidas integer not null default 0,
  lineas integer not null default 0,
  filas_con_error integer not null default 0,
  detalle_errores jsonb not null default '[]',
  estado text not null default 'en_proceso' check (estado in ('en_proceso', 'completa', 'deshecha')),
  deshecha_en timestamptz,
  deshecha_por uuid
);

create table public.ventas (
  numero bigint primary key,
  importacion_id bigint not null references public.importaciones (id),
  fecha_hora timestamptz not null,
  fecha date not null,
  turno text not null check (turno in ('AM', 'PM')),
  vendedor text,
  metodo_pago text,
  total integer not null,
  descuento integer not null default 0,
  con_boleta boolean
);
create index ventas_fecha on public.ventas (fecha);
create index ventas_importacion on public.ventas (importacion_id);

create table public.venta_lineas (
  id bigint generated always as identity primary key,
  venta_numero bigint not null references public.ventas (numero) on delete cascade,
  fecha date not null,
  producto_id bigint not null references public.productos (id),
  opcion_ids bigint[] not null default '{}',
  precio integer not null,
  monto numeric(12, 2) not null,
  texto_item text not null,
  texto_opciones text
);
create index venta_lineas_fecha on public.venta_lineas (fecha);
create index venta_lineas_producto on public.venta_lineas (producto_id);
create index venta_lineas_venta on public.venta_lineas (venta_numero);

-- Nombres alternativos aprendidos al importar (para la próxima vez).
create table public.alias_productos (
  alias text primary key, -- normalizado
  producto_id bigint not null references public.productos (id) on delete cascade,
  creado_en timestamptz not null default now()
);

create table public.alias_opciones (
  producto_id bigint not null references public.productos (id) on delete cascade,
  alias text not null, -- normalizado
  opcion_id bigint not null references public.opciones (id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (producto_id, alias)
);

-- Mapeo de columnas guardado (por si influye cambia sus títulos).
create table public.mapeo_importacion (
  id boolean primary key default true check (id),
  columnas jsonb not null default '{}',
  actualizado_en timestamptz not null default now()
);
insert into public.mapeo_importacion default values;

-- ---------------------------------------------------------------------
-- Importar un lote de transacciones (la app envía de a ~300).
-- p_ventas: [{numero, fecha_hora: "2026-10-10 09:01", turno?, vendedor,
--             metodo_pago, total, descuento, con_boleta,
--             lineas: [{producto_id, opcion_ids, precio, monto, texto_item, texto_opciones}]}]
-- Las transacciones que ya existían se ignoran y se cuentan como repetidas.
-- ---------------------------------------------------------------------
create or replace function public.importar_lote(p_importacion bigint, p_ventas jsonb)
returns json
language plpgsql security invoker set search_path = ''
as $$
declare
  v_corte time;
  v_nuevas integer;
  v_lineas integer;
  v_recibidas integer := jsonb_array_length(p_ventas);
begin
  if not private.tiene_permiso('importar_ventas') then
    raise exception 'No tienes permiso para importar ventas.';
  end if;
  if not exists (select 1 from public.importaciones where id = p_importacion and estado = 'en_proceso') then
    raise exception 'La importación no existe o ya terminó.';
  end if;
  select hora_corte_turno into v_corte from public.configuracion;

  -- Una sola sentencia: inserta las transacciones nuevas y luego sus líneas.
  with v as (
    select * from jsonb_to_recordset(p_ventas) as x(
      numero bigint, fecha_hora text, turno text, vendedor text, metodo_pago text,
      total integer, descuento integer, con_boleta boolean)
  ), ins as (
    insert into public.ventas (numero, importacion_id, fecha_hora, fecha, turno, vendedor, metodo_pago, total, descuento, con_boleta)
    select
      v.numero, p_importacion,
      (v.fecha_hora::timestamp at time zone 'America/Santiago'),
      v.fecha_hora::timestamp::date,
      case
        when upper(trim(coalesce(v.turno, ''))) in ('AM', 'MAÑANA', 'MANANA') then 'AM'
        when upper(trim(coalesce(v.turno, ''))) in ('PM', 'TARDE') then 'PM'
        when v.fecha_hora::timestamp::time < v_corte then 'AM'
        else 'PM'
      end,
      nullif(trim(v.vendedor), ''), nullif(trim(v.metodo_pago), ''),
      v.total, coalesce(v.descuento, 0), v.con_boleta
    from v
    on conflict (numero) do nothing
    returning numero
  ), lin as (
    insert into public.venta_lineas (venta_numero, fecha, producto_id, opcion_ids, precio, monto, texto_item, texto_opciones)
    select
      x.numero, x.fecha_hora::timestamp::date, l.producto_id,
      coalesce(array(select jsonb_array_elements_text(l.opcion_ids)::bigint), '{}'),
      l.precio, l.monto, l.texto_item, nullif(l.texto_opciones, '')
    from jsonb_to_recordset(p_ventas) as x(numero bigint, fecha_hora text, lineas jsonb)
    join ins on ins.numero = x.numero
    cross join jsonb_to_recordset(x.lineas) as l(
      producto_id bigint, opcion_ids jsonb, precio integer, monto numeric, texto_item text, texto_opciones text)
    returning 1
  )
  select (select count(*) from ins), (select count(*) from lin) into v_nuevas, v_lineas;

  update public.importaciones set
    transacciones_nuevas = transacciones_nuevas + v_nuevas,
    transacciones_repetidas = transacciones_repetidas + (v_recibidas - v_nuevas),
    lineas = lineas + v_lineas
  where id = p_importacion;

  return json_build_object('nuevas', v_nuevas, 'repetidas', v_recibidas - v_nuevas, 'lineas', v_lineas);
end;
$$;
revoke all on function public.importar_lote(bigint, jsonb) from public, anon;
grant execute on function public.importar_lote(bigint, jsonb) to authenticated;

-- Deshacer: borra las ventas que trajo esa importación. Se pueden volver a importar.
create or replace function public.deshacer_importacion(p_id bigint)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  if not private.tiene_permiso('importar_ventas') then
    raise exception 'No tienes permiso para deshacer importaciones.';
  end if;
  if not exists (select 1 from public.importaciones where id = p_id and estado <> 'deshecha') then
    raise exception 'Esa importación no existe o ya se deshizo.';
  end if;
  delete from public.ventas where importacion_id = p_id;
  get diagnostics n = row_count;
  update public.importaciones
  set estado = 'deshecha', deshecha_en = now(), deshecha_por = auth.uid()
  where id = p_id;
  return n;
end;
$$;
revoke all on function public.deshacer_importacion(bigint) from public, anon;
grant execute on function public.deshacer_importacion(bigint) to authenticated;

-- Números de transacción que ya existen dentro de un rango (para la vista previa).
create or replace function public.numeros_existentes(p_numeros bigint[])
returns setof bigint
language sql stable security invoker set search_path = ''
as $$
  select numero from public.ventas where numero = any (p_numeros)
$$;
revoke all on function public.numeros_existentes(bigint[]) from public, anon;
grant execute on function public.numeros_existentes(bigint[]) to authenticated;

-- Resumen diario SIN costos (lo pueden ver todos los que ven ventas).
create view public.v_ventas_dia with (security_invoker = true) as
select
  l.fecha,
  count(distinct l.venta_numero) as transacciones,
  coalesce(sum(l.monto) filter (where p.tipo <> 'abono'), 0) as ventas,
  coalesce(sum(l.monto) filter (where p.tipo = 'abono'), 0) as abonos,
  count(*) filter (where p.tipo = 'producto') as unidades
from public.venta_lineas l
join public.productos p on p.id = l.producto_id
group by l.fecha;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.importaciones enable row level security;
alter table public.ventas enable row level security;
alter table public.venta_lineas enable row level security;
alter table public.alias_productos enable row level security;
alter table public.alias_opciones enable row level security;
alter table public.mapeo_importacion enable row level security;

revoke all on public.importaciones, public.ventas, public.venta_lineas, public.alias_productos,
  public.alias_opciones, public.mapeo_importacion, public.v_ventas_dia from anon;
-- Ventas: solo se insertan con importar_lote y se borran con deshacer_importacion.
revoke update, delete on public.ventas, public.venta_lineas from authenticated;
revoke delete on public.importaciones, public.mapeo_importacion from authenticated;

create policy "importaciones: ver" on public.importaciones for select to authenticated
using ((select private.tiene_permiso('ver_ventas')));
create policy "importaciones: crear" on public.importaciones for insert to authenticated
with check ((select private.tiene_permiso('importar_ventas')));
create policy "importaciones: actualizar" on public.importaciones for update to authenticated
using ((select private.tiene_permiso('importar_ventas')))
with check ((select private.tiene_permiso('importar_ventas')));

create policy "ventas: ver" on public.ventas for select to authenticated
using ((select private.tiene_permiso('ver_ventas')));
create policy "ventas: importar" on public.ventas for insert to authenticated
with check ((select private.tiene_permiso('importar_ventas')));

create policy "venta_lineas: ver" on public.venta_lineas for select to authenticated
using ((select private.tiene_permiso('ver_ventas')));
create policy "venta_lineas: importar" on public.venta_lineas for insert to authenticated
with check ((select private.tiene_permiso('importar_ventas')));

create policy "alias_productos: ver" on public.alias_productos for select to authenticated
using ((select private.tiene_permiso('ver_ventas')));
create policy "alias_productos: crear" on public.alias_productos for insert to authenticated
with check ((select private.tiene_permiso('importar_ventas')) or (select private.tiene_permiso('editar_catalogo')));
create policy "alias_productos: borrar" on public.alias_productos for delete to authenticated
using ((select private.tiene_permiso('editar_catalogo')));

create policy "alias_opciones: ver" on public.alias_opciones for select to authenticated
using ((select private.tiene_permiso('ver_ventas')));
create policy "alias_opciones: crear" on public.alias_opciones for insert to authenticated
with check ((select private.tiene_permiso('importar_ventas')) or (select private.tiene_permiso('editar_catalogo')));
create policy "alias_opciones: borrar" on public.alias_opciones for delete to authenticated
using ((select private.tiene_permiso('editar_catalogo')));

create policy "mapeo: ver" on public.mapeo_importacion for select to authenticated
using ((select private.tiene_permiso('importar_ventas')));
create policy "mapeo: guardar" on public.mapeo_importacion for update to authenticated
using ((select private.tiene_permiso('importar_ventas')))
with check ((select private.tiene_permiso('importar_ventas')));

-- Quien importa también puede crear productos y opciones nuevos que vengan en el Excel.
drop policy "productos: crear" on public.productos;
create policy "productos: crear" on public.productos for insert to authenticated
with check ((select private.tiene_permiso('editar_catalogo')) or (select private.tiene_permiso('importar_ventas')));
drop policy "opciones: crear" on public.opciones;
create policy "opciones: crear" on public.opciones for insert to authenticated
with check ((select private.tiene_permiso('editar_catalogo')) or (select private.tiene_permiso('importar_ventas')));
