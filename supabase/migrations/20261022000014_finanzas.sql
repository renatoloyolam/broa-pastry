-- =====================================================================
-- Finanzas del mes: gastos fijos, meta (punto de equilibrio) y resultado real
--
-- * gastos: los gastos de cada mes (arriendo, sueldos, luz…). Los marcados
--   "se repite" se copian solos al mes siguiente (preparar_mes_gastos).
-- * gastos_meses: recuerda qué meses ya se prepararon, para no volver a
--   copiar un gasto que se borró a propósito.
-- * Comisiones de tarjeta: % de débito y crédito en configuracion.
-- * finanzas_mes(): junta ventas, costos, mermas, comisiones y gastos del mes.
--   La meta y la proyección se calculan en la app (src/lib/finanzas.ts).
-- * Permiso nuevo "gestionar_finanzas": el Dueño siempre; la Administradora
--   solo si el Dueño lo activa (los sueldos son información sensible).
-- =====================================================================

alter table public.permisos_admin add column gestionar_finanzas boolean not null default false;

alter table public.configuracion
  add column comision_debito numeric(6, 5) not null default 0 check (comision_debito between 0 and 0.2),
  add column comision_credito numeric(6, 5) not null default 0 check (comision_credito between 0 and 0.2);

create or replace function private.tiene_permiso(permiso text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    case private.rol_actual()
      when 'dueno' then true
      when 'admin' then (
        select case permiso
          when 'ver_ventas' then true
          when 'ver_costos' then pa.ver_costos
          when 'editar_catalogo' then pa.editar_catalogo
          when 'importar_ventas' then pa.importar_ventas
          when 'registrar_mermas' then pa.registrar_mermas
          when 'gestionar_pedidos' then pa.gestionar_pedidos
          when 'exportar' then pa.exportar
          when 'editar_configuracion' then pa.editar_configuracion
          -- finanzas incluye costos: sin ver_costos no sirve
          when 'gestionar_finanzas' then pa.gestionar_finanzas and pa.ver_costos
          else false -- gestionar_usuarios y cualquier otro: nunca
        end
        from public.permisos_admin pa
      )
      when 'encargada' then permiso = 'ver_ventas'
    end,
    false)
$$;

create or replace function public.mi_sesion()
returns json
language sql stable security definer set search_path = ''
as $$
  select json_build_object(
    'perfil', (select row_to_json(p) from (
        select id, nombre, email, rol, activo, debe_cambiar_clave
        from public.perfiles where id = auth.uid()) p),
    'existe_dueno', exists (select 1 from public.perfiles where rol = 'dueno' and activo),
    'permisos', (select coalesce(json_agg(x), '[]'::json) from unnest(array[
        'ver_ventas', 'ver_costos', 'editar_catalogo', 'importar_ventas', 'registrar_mermas',
        'gestionar_pedidos', 'exportar', 'editar_configuracion', 'gestionar_usuarios', 'gestionar_finanzas'
      ]) as x where private.tiene_permiso(x))
  )
$$;

-- ---------------------------------------------------------------------
-- Gastos
-- ---------------------------------------------------------------------
create table public.gastos_meses (
  mes date primary key check (extract(day from mes) = 1),
  preparado_en timestamptz not null default now()
);

create table public.gastos (
  id bigint generated always as identity primary key,
  mes date not null check (extract(day from mes) = 1),
  nombre text not null check (length(trim(nombre)) between 1 and 80),
  categoria text not null default 'Otros' check (categoria in (
    'Arriendo y local', 'Sueldos y honorarios', 'Servicios básicos', 'Contabilidad y trámites',
    'Marketing', 'Mantención y equipos', 'Créditos y seguros', 'Otros')),
  monto integer not null check (monto between 0 and 1000000000),
  dia_pago smallint check (dia_pago between 1 and 31),
  se_repite boolean not null default true,
  pagado boolean not null default false,
  pagado_en date,
  nota text check (length(nota) <= 200),
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index gastos_mes on public.gastos (mes);

create trigger gastos_actualizado before update on public.gastos
for each row execute function private.tocar_actualizado_en();

alter table public.gastos enable row level security;
alter table public.gastos_meses enable row level security;
revoke all on public.gastos, public.gastos_meses from anon;
revoke insert, update, delete on public.gastos_meses from authenticated;

create policy "gastos: ver" on public.gastos for select to authenticated
using ((select private.tiene_permiso('gestionar_finanzas')));
create policy "gastos: crear" on public.gastos for insert to authenticated
with check ((select private.tiene_permiso('gestionar_finanzas')));
create policy "gastos: editar" on public.gastos for update to authenticated
using ((select private.tiene_permiso('gestionar_finanzas')))
with check ((select private.tiene_permiso('gestionar_finanzas')));
create policy "gastos: borrar" on public.gastos for delete to authenticated
using ((select private.tiene_permiso('gestionar_finanzas')));
create policy "gastos_meses: ver" on public.gastos_meses for select to authenticated
using ((select private.tiene_permiso('gestionar_finanzas')));

-- Copia al mes los gastos "se repite" del último mes anterior que tenga gastos.
-- Automático: solo la primera vez que se abre el mes. Con p_forzar (botón
-- "Copiar del mes anterior") copia aunque el mes ya se haya preparado, sin
-- duplicar nombres que ya existen. Devuelve cuántos copió.
create or replace function public.preparar_mes_gastos(p_mes date, p_forzar boolean default false)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_origen date;
  v_nuevo boolean;
  v_copiados integer;
begin
  if not private.tiene_permiso('gestionar_finanzas') then
    raise exception 'No tienes permiso para gestionar las finanzas.';
  end if;

  insert into public.gastos_meses (mes) values (v_mes) on conflict do nothing;
  get diagnostics v_copiados = row_count;
  v_nuevo := v_copiados = 1;
  if not v_nuevo and not p_forzar then
    return 0;
  end if;

  select max(g.mes) into v_origen from public.gastos g where g.mes < v_mes and g.se_repite;
  if v_origen is null then
    return 0;
  end if;

  insert into public.gastos (mes, nombre, categoria, monto, dia_pago, se_repite, nota)
  select v_mes, g.nombre, g.categoria, g.monto, g.dia_pago, true, g.nota
  from public.gastos g
  where g.mes = v_origen and g.se_repite
    and not exists (select 1 from public.gastos x where x.mes = v_mes and lower(x.nombre) = lower(g.nombre))
  order by g.id;
  get diagnostics v_copiados = row_count;
  return v_copiados;
end;
$$;
revoke all on function public.preparar_mes_gastos(date, boolean) from public, anon;
grant execute on function public.preparar_mes_gastos(date, boolean) to authenticated;

create or replace function public.guardar_comisiones(p_debito numeric, p_credito numeric)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.tiene_permiso('gestionar_finanzas') then
    raise exception 'No tienes permiso para gestionar las finanzas.';
  end if;
  if p_debito not between 0 and 0.2 or p_credito not between 0 and 0.2 then
    raise exception 'La comisión debe estar entre 0%% y 20%%.';
  end if;
  update public.configuracion set comision_debito = p_debito, comision_credito = p_credito;
end;
$$;
revoke all on function public.guardar_comisiones(numeric, numeric) from public, anon;
grant execute on function public.guardar_comisiones(numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- Números del mes
-- ---------------------------------------------------------------------
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
begin
  if not private.tiene_permiso('gestionar_finanzas') then
    raise exception 'No tienes permiso para gestionar las finanzas.';
  end if;
  select * into c from public.configuracion;
  v_divisor := case when c.precios_incluyen_iva then 1 + c.tasa_iva else 1 end;
  v_panel := public.panel(v_desde, v_hasta, null, null);

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
revoke all on function public.finanzas_mes(date) from public, anon;
grant execute on function public.finanzas_mes(date) to authenticated;
