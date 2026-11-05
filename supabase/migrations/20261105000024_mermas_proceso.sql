-- Mermas durante la producción y de materia prima.
-- El valor queda congelado al registrar (las recetas no guardan historial de precios).
-- Se separa ingredientes de mano de obra: Finanzas resta solo ingredientes, porque los sueldos ya están en Gastos.

create table public.mermas_proceso (
  id bigint generated always as identity primary key,
  fecha date not null default private.hoy(),
  etapa text not null check (etapa in ('produccion', 'materia_prima')),
  receta_id bigint references public.recetas (id) on delete set null,
  ingrediente_id bigint references public.ingredientes (id) on delete set null,
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  cantidad numeric check (cantidad > 0),
  unidad public.unidad,
  motivo_id bigint not null references public.motivos_merma (id),
  evitable boolean not null default false,
  nota text,
  valor_insumos numeric,            -- null = por valorizar
  valor_mano_obra numeric not null default 0,
  estimado boolean not null default false,
  registrado_por uuid default auth.uid() references public.perfiles (id) on delete set null,
  registrado_en timestamptz not null default now(),
  check (receta_id is null or ingrediente_id is null)
);
create index mermas_proceso_fecha on public.mermas_proceso (fecha);
create index mermas_proceso_pendientes on public.mermas_proceso (fecha) where valor_insumos is null;

alter table public.mermas_proceso enable row level security;
create policy "mermas_proceso: ver (costos)" on public.mermas_proceso for select to authenticated
  using ((select private.tiene_permiso('ver_costos')));
-- Tiene pesos: se escribe y se lee por funciones que los ocultan a quien no ve costos.
revoke all on public.mermas_proceso from anon;
revoke insert, update, delete, truncate on public.mermas_proceso from authenticated;

-- La encargada anota mermas, sin ver pesos
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
          when 'gestionar_finanzas' then pa.gestionar_finanzas and pa.ver_costos
          else false
        end
        from public.permisos_admin pa
      )
      when 'encargada' then permiso in ('ver_ventas', 'registrar_mermas')
    end,
    false)
$$;

insert into public.motivos_merma (nombre, evitable_sugerido, orden)
select v.nombre, true, v.orden
from (values ('Se cayó', 31), ('Se quemó', 32), ('Salió mal', 33), ('Mala conservación', 41)) v(nombre, orden)
where not exists (select 1 from public.motivos_merma m where m.nombre = v.nombre);

-- Recetas e ingredientes para elegir: solo nombres y rendimiento, nunca precios
create function public.opciones_merma_proceso()
returns json
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.tiene_permiso('registrar_mermas') then
    raise exception 'No tienes permiso para registrar mermas.';
  end if;
  return json_build_object(
    'recetas', coalesce((select json_agg(json_build_object('id', r.id, 'nombre', r.nombre, 'rendimiento', r.rendimiento, 'unidad', r.unidad_rendimiento) order by r.nombre)
                         from public.recetas r), '[]'::json),
    'ingredientes', coalesce((select json_agg(json_build_object('id', i.id, 'nombre', i.nombre, 'unidad', i.unidad_compra) order by i.nombre)
                              from public.ingredientes i where i.activo), '[]'::json)
  );
end;
$$;
revoke all on function public.opciones_merma_proceso() from public, anon;
grant execute on function public.opciones_merma_proceso() to authenticated;

create function public.registrar_merma_proceso(
  p_fecha date, p_etapa text, p_receta bigint, p_ingrediente bigint, p_descripcion text,
  p_cantidad numeric, p_unidad public.unidad, p_motivo bigint, p_evitable boolean, p_nota text, p_monto numeric
)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_nombre text;
  v_insumos numeric;
  v_mano_obra numeric := 0;
  v_estimado boolean := false;
  v_id bigint;
  r public.recetas;
  i public.ingredientes;
  q numeric;
  unitario numeric;
  indirecto numeric;
begin
  if not private.tiene_permiso('registrar_mermas') then
    raise exception 'No tienes permiso para registrar mermas.';
  end if;
  if p_fecha is null or p_fecha > private.hoy() then
    raise exception 'La fecha no puede ser futura.';
  end if;
  if p_etapa not in ('produccion', 'materia_prima') then
    raise exception 'Elige dónde ocurrió la merma.';
  end if;
  if p_motivo is null then
    raise exception 'Elige el motivo.';
  end if;
  -- Quien no ve costos no pone montos: queda por valorizar
  if p_monto is not null and not private.tiene_permiso('ver_costos') then
    raise exception 'Solo quien ve costos puede escribir un monto.';
  end if;
  if p_monto is not null and p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero.';
  end if;

  if p_receta is not null or p_ingrediente is not null then
    if p_receta is not null and p_ingrediente is not null then
      raise exception 'Elige una receta o un ingrediente, no ambos.';
    end if;
    if coalesce(p_cantidad, 0) <= 0 or p_unidad is null then
      raise exception 'Escribe cuánto se perdió.';
    end if;
  end if;

  if p_receta is not null then
    select * into r from public.recetas where id = p_receta;
    if not found then raise exception 'Esa receta ya no existe.'; end if;
    if private.dimension_unidad(p_unidad) <> private.dimension_unidad(r.unidad_rendimiento) then
      raise exception 'La receta % se mide en %: no se puede anotar en %.', r.nombre, r.unidad_rendimiento, p_unidad;
    end if;
    v_nombre := r.nombre;
    q := p_cantidad * private.factor_unidad(p_unidad) / private.factor_unidad(r.unidad_rendimiento);
    unitario := nullif(private.costo_receta_unitario(p_receta), 0);
    if unitario is not null then
      indirecto := least(unitario, coalesce(private.indirecto_receta_unitario(p_receta), 0));
      v_insumos := round(q * (unitario - indirecto), 2);
      v_mano_obra := round(q * indirecto, 2);
    end if;
  elsif p_ingrediente is not null then
    select * into i from public.ingredientes where id = p_ingrediente;
    if not found then raise exception 'Ese ingrediente ya no existe.'; end if;
    if private.dimension_unidad(p_unidad) <> private.dimension_unidad(i.unidad_compra) then
      raise exception '% se compra en %: no se puede anotar en %.', i.nombre, i.unidad_compra, p_unidad;
    end if;
    v_nombre := i.nombre;
    v_insumos := nullif(round(p_cantidad * private.factor_unidad(p_unidad) * i.precio_compra_neto
                              / (i.cantidad_compra * private.factor_unidad(i.unidad_compra)), 2), 0);
  else
    v_nombre := nullif(btrim(coalesce(p_descripcion, '')), '');
    if v_nombre is null then
      raise exception 'Escribe qué se perdió.';
    end if;
    v_insumos := p_monto;
    v_estimado := p_monto is not null;
  end if;

  insert into public.mermas_proceso (fecha, etapa, receta_id, ingrediente_id, nombre, cantidad, unidad, motivo_id,
                                     evitable, nota, valor_insumos, valor_mano_obra, estimado)
  values (p_fecha, p_etapa, p_receta, p_ingrediente, v_nombre, nullif(p_cantidad, 0), p_unidad, p_motivo,
          coalesce(p_evitable, false), nullif(btrim(coalesce(p_nota, '')), ''), v_insumos, v_mano_obra, v_estimado)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.registrar_merma_proceso(date, text, bigint, bigint, text, numeric, public.unidad, bigint, boolean, text, numeric) from public, anon;
grant execute on function public.registrar_merma_proceso(date, text, bigint, bigint, text, numeric, public.unidad, bigint, boolean, text, numeric) to authenticated;

create function public.borrar_merma_proceso(p_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.tiene_permiso('registrar_mermas') then
    raise exception 'No tienes permiso para registrar mermas.';
  end if;
  delete from public.mermas_proceso where id = p_id;
end;
$$;
revoke all on function public.borrar_merma_proceso(bigint) from public, anon;
grant execute on function public.borrar_merma_proceso(bigint) to authenticated;

-- Poner el monto a lo que quedó pendiente (solo quien ve costos)
create function public.valorizar_merma_proceso(p_id bigint, p_monto numeric)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.tiene_permiso('ver_costos') then
    raise exception 'Solo quien ve costos puede escribir un monto.';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto debe ser mayor a cero.';
  end if;
  update public.mermas_proceso
  set valor_insumos = p_monto, valor_mano_obra = 0, estimado = true
  where id = p_id and valor_insumos is null;
  if not found then
    raise exception 'Esa merma ya tiene valor o no existe.';
  end if;
end;
$$;
revoke all on function public.valorizar_merma_proceso(bigint, numeric) from public, anon;
grant execute on function public.valorizar_merma_proceso(bigint, numeric) to authenticated;

create function public.mermas_proceso_del_dia(p_fecha date)
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
      'id', m.id, 'etapa', m.etapa, 'nombre', m.nombre, 'cantidad', m.cantidad, 'unidad', m.unidad,
      'motivo', mo.nombre, 'evitable', m.evitable, 'nota', m.nota,
      'valor', case when ver_costos then m.valor_insumos + m.valor_mano_obra end,
      'mano_obra', case when ver_costos then m.valor_mano_obra end,
      'estimado', case when ver_costos then m.estimado end,
      'por_valorizar', case when ver_costos then m.valor_insumos is null end
    ) order by m.registrado_en desc)
    from public.mermas_proceso m
    join public.motivos_merma mo on mo.id = m.motivo_id
    where m.fecha = p_fecha
  ), '[]'::json);
end;
$$;
revoke all on function public.mermas_proceso_del_dia(date) from public, anon;
grant execute on function public.mermas_proceso_del_dia(date) to authenticated;

-- Todo lo pendiente, sin importar el día
create function public.mermas_por_valorizar()
returns json
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.tiene_permiso('ver_costos') then
    return '[]'::json;
  end if;
  return coalesce((
    select json_agg(json_build_object(
      'id', m.id, 'fecha', m.fecha, 'etapa', m.etapa, 'nombre', m.nombre,
      'cantidad', m.cantidad, 'unidad', m.unidad, 'motivo', mo.nombre, 'nota', m.nota
    ) order by m.fecha desc, m.id desc)
    from public.mermas_proceso m
    join public.motivos_merma mo on mo.id = m.motivo_id
    where m.valor_insumos is null
  ), '[]'::json);
end;
$$;
revoke all on function public.mermas_por_valorizar() from public, anon;
grant execute on function public.mermas_por_valorizar() to authenticated;

-- Ganancia y alertas: las mermas del período incluyen producción y materia prima
create or replace function private.mermas_periodo(p_desde date, p_hasta date)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce((select sum(valor) from private.mermas_valorizadas(p_desde, p_hasta)), 0)
       + coalesce((select sum(m.valor_insumos + m.valor_mano_obra) from public.mermas_proceso m
                   where m.fecha between p_desde and p_hasta), 0)
$$;

create function private.reporte_proceso(p_desde date, p_hasta date, p_ver boolean)
returns json
language sql stable security definer set search_path = ''
as $$
  with m as (
    select mp.*, mp.valor_insumos + mp.valor_mano_obra as valor
    from public.mermas_proceso mp where mp.fecha between p_desde and p_hasta
  )
  select json_build_object(
    'registros', (select count(*) from m),
    'registros_evitables', (select count(*) from m where evitable),
    'por_valorizar', case when p_ver then (select count(*) from m where valor is null) end,
    'valor', case when p_ver then (select round(coalesce(sum(valor), 0)) from m) end,
    'valor_evitable', case when p_ver then (select round(coalesce(sum(valor), 0)) from m where evitable) end,
    'por_etapa', coalesce((
      select json_agg(x order by x.etapa desc) from (
        select etapa, count(*) as registros, case when p_ver then round(coalesce(sum(valor), 0)) end as valor
        from m group by etapa) x), '[]'::json),
    'por_motivo', coalesce((
      select json_agg(x order by x.valor desc nulls last, x.registros desc) from (
        select mo.nombre as motivo, count(*) as registros, case when p_ver then round(coalesce(sum(m.valor), 0)) end as valor
        from m join public.motivos_merma mo on mo.id = m.motivo_id group by mo.nombre) x), '[]'::json),
    'por_item', coalesce((
      select json_agg(x order by x.valor desc nulls last, x.registros desc) from (
        select etapa, nombre, unidad, count(*) as registros, sum(cantidad) as cantidad,
               case when p_ver then round(coalesce(sum(valor), 0)) end as valor,
               case when p_ver then bool_or(valor is null) end as falta_valor,
               case when p_ver then bool_or(estimado) end as estimado
        from m group by etapa, nombre, unidad) x), '[]'::json)
  )
$$;
revoke all on function private.reporte_proceso(date, date, boolean) from public, authenticated;

-- Pequeños cambios en funciones largas: reemplazo exacto, y falla si el texto no está.
create function private.parchar_funcion(p_funcion regprocedure, p_viejo text, p_nuevo text)
returns void
language plpgsql set search_path = ''
as $$
declare
  def text := pg_get_functiondef(p_funcion);
begin
  if position(p_viejo in def) = 0 then
    raise exception 'No se encontró el texto a reemplazar en %', p_funcion;
  end if;
  execute replace(def, p_viejo, p_nuevo);
end;
$$;

-- Panel: mermas por día con producción y materia prima
select private.parchar_funcion('public.panel(date, date, date, date)',
$v$    select mv.fecha, sum(mv.valor) as mermas
    from private.mermas_valorizadas(p_desde, p_hasta) mv
    where ver_costos
    group by mv.fecha$v$,
$v$    select x.fecha, sum(x.valor) as mermas
    from (
      select mv.fecha, mv.valor from private.mermas_valorizadas(p_desde, p_hasta) mv
      union all
      select mp.fecha, mp.valor_insumos + mp.valor_mano_obra from public.mermas_proceso mp
      where mp.fecha between p_desde and p_hasta
    ) x
    where ver_costos
    group by x.fecha$v$);

-- Uso de insumos y Finanzas: entran como una categoría aparte (-1)
select private.parchar_funcion('private.uso_insumos(date, date)',
$v$  group by u.origen, u.categoria_id
$v$,
$v$  group by u.origen, u.categoria_id
  union all
  select 'mermas', -1::bigint, sum(mp.valor_insumos + mp.valor_mano_obra), sum(mp.valor_insumos)
  from public.mermas_proceso mp
  where mp.fecha between p_desde and p_hasta and mp.valor_insumos is not null
  having count(*) > 0
$v$);

select private.parchar_funcion('public.insumos_periodo(date, date)',
$v$coalesce(cat.nombre, 'Sin categoría')$v$,
$v$coalesce(cat.nombre, case when u.categoria_id = -1 then 'Mermas de producción y materia prima' else 'Sin categoría' end)$v$);

-- Reporte: suma la parte de proceso y separa ingredientes de mano de obra
select private.parchar_funcion('public.reporte_mermas(date, date)',
$v$      'ver_costos', ver_costos,
      'total', json_build_object($v$,
$v$      'ver_costos', ver_costos,
      'proceso', private.reporte_proceso(p_desde, p_hasta, ver_costos),
      'perdida', case when ver_costos then (
        select json_build_object('mano_obra', round(coalesce(sum(u.costo - u.insumos), 0)),
                                 'insumos', round(greatest(0, private.mermas_periodo(p_desde, p_hasta) - coalesce(sum(u.costo - u.insumos), 0))))
        from private.uso_insumos(p_desde, p_hasta) u where u.origen = 'mermas') end,
      'total', json_build_object($v$);

-- Campana: mermas que esperan un monto
select private.parchar_funcion('public.alertas()',
$v$    if coalesce((u.activas->>'variacion_costo')::boolean, true) then$v$,
$v$    select count(*) into total from public.mermas_proceso m where m.valor_insumos is null;
    if total > 0 then
      lista := lista || jsonb_build_object('codigo', 'mermas_por_valorizar', 'nivel', 'aviso', 'cantidad', total);
    end if;

    if coalesce((u.activas->>'variacion_costo')::boolean, true) then$v$);

drop function private.parchar_funcion(regprocedure, text, text);
