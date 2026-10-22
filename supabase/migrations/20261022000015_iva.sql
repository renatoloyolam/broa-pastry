-- =====================================================================
-- IVA estimado del mes (para planificar el F29; lo declara el contador)
--
-- * IVA débito: el IVA incluido en todo lo cobrado en influye del mes
--   (ventas y abonos de tortas: un abono con boleta también paga IVA).
-- * IVA crédito: facturas de compra del mes (tabla compras), anotadas a mano
--   o subidas desde el Registro de Compras del SII (CSV). Las notas de
--   crédito restan.
-- * Remanente del mes anterior y PPM: se ingresan a mano.
-- * Las compras NO se suman al resultado del mes (ese costo ya está en el
--   costo de los productos); aquí solo sirven para el IVA.
-- =====================================================================

alter table public.configuracion
  add column tasa_ppm numeric(6, 5) not null default 0 check (tasa_ppm between 0 and 0.1);

alter table public.gastos_meses
  add column remanente_anterior integer not null default 0 check (remanente_anterior >= 0);

create table public.compras (
  id bigint generated always as identity primary key,
  periodo date not null check (extract(day from periodo) = 1),
  fecha date,
  tipo_doc text not null default 'Factura' check (tipo_doc in (
    'Factura', 'Factura exenta', 'Factura de compra', 'Nota de crédito', 'Nota de débito', 'Importación', 'Otro')),
  rut text check (length(rut) <= 15),
  proveedor text not null check (length(trim(proveedor)) between 1 and 120),
  folio text check (length(folio) <= 20),
  neto integer not null default 0 check (neto >= 0),
  exento integer not null default 0 check (exento >= 0),
  iva integer not null default 0 check (iva >= 0),
  total integer not null default 0 check (total >= 0),
  categoria text not null default 'Insumos' check (categoria in ('Insumos', 'Packaging', 'Gastos del local', 'Equipos', 'Otros')),
  nota text check (length(nota) <= 200),
  origen text not null default 'manual' check (origen in ('manual', 'sii')),
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default now()
);
create index compras_periodo on public.compras (periodo);
-- Un mismo documento del SII no se carga dos veces
create unique index compras_documento on public.compras (rut, tipo_doc, folio) where rut is not null and folio is not null;

alter table public.compras enable row level security;
revoke all on public.compras from anon;
create policy "compras: ver" on public.compras for select to authenticated
using ((select private.tiene_permiso('gestionar_finanzas')));
create policy "compras: crear" on public.compras for insert to authenticated
with check ((select private.tiene_permiso('gestionar_finanzas')));
create policy "compras: editar" on public.compras for update to authenticated
using ((select private.tiene_permiso('gestionar_finanzas')))
with check ((select private.tiene_permiso('gestionar_finanzas')));
create policy "compras: borrar" on public.compras for delete to authenticated
using ((select private.tiene_permiso('gestionar_finanzas')));

-- Carga el Registro de Compras del SII. Devuelve {nuevas, repetidas}.
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

  insert into public.compras (periodo, fecha, tipo_doc, rut, proveedor, folio, neto, exento, iva, total, origen)
  select v_periodo, (f->>'fecha')::date, f->>'tipo_doc', f->>'rut', left(f->>'proveedor', 120), f->>'folio',
         (f->>'neto')::integer, (f->>'exento')::integer, (f->>'iva')::integer, (f->>'total')::integer, 'sii'
  from jsonb_array_elements(p_filas) f
  on conflict (rut, tipo_doc, folio) where rut is not null and folio is not null do nothing;
  get diagnostics v_nuevas = row_count;

  return json_build_object('nuevas', v_nuevas, 'repetidas', v_total - v_nuevas);
end;
$$;
revoke all on function public.importar_compras_sii(date, jsonb) from public, anon;
grant execute on function public.importar_compras_sii(date, jsonb) to authenticated;

create or replace function public.guardar_ajustes_iva(p_mes date, p_remanente integer, p_tasa_ppm numeric)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
begin
  if not private.tiene_permiso('gestionar_finanzas') then
    raise exception 'No tienes permiso para gestionar las finanzas.';
  end if;
  if p_remanente < 0 or p_tasa_ppm not between 0 and 0.1 then
    raise exception 'Revisa los valores: el remanente no puede ser negativo y el PPM va entre 0%% y 10%%.';
  end if;
  insert into public.gastos_meses (mes, remanente_anterior) values (v_mes, p_remanente)
  on conflict (mes) do update set remanente_anterior = excluded.remanente_anterior;
  update public.configuracion set tasa_ppm = p_tasa_ppm;
end;
$$;
revoke all on function public.guardar_ajustes_iva(date, integer, numeric) from public, anon;
grant execute on function public.guardar_ajustes_iva(date, integer, numeric) to authenticated;

create or replace function public.iva_mes(p_mes date)
returns json
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_desde date := date_trunc('month', p_mes)::date;
  v_hasta date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  c public.configuracion;
begin
  if not private.tiene_permiso('gestionar_finanzas') then
    raise exception 'No tienes permiso para gestionar las finanzas.';
  end if;
  select * into c from public.configuracion;

  return json_build_object(
    'mes', v_desde,
    'hoy', private.hoy(),
    'tasa_iva', c.tasa_iva,
    'precios_incluyen_iva', c.precios_incluyen_iva,
    'tasa_ppm', c.tasa_ppm,
    'remanente_anterior', coalesce((select m.remanente_anterior from public.gastos_meses m where m.mes = v_desde), 0),
    'ultimo_dia', (select max(fecha) from public.ventas where fecha between v_desde and v_hasta),
    'cobrado', (
      select json_build_object(
        'ventas', coalesce(round(sum(l.monto) filter (where p.tipo <> 'abono')), 0),
        'abonos', coalesce(round(sum(l.monto) filter (where p.tipo = 'abono')), 0),
        'sin_boleta', coalesce(round(sum(l.monto) filter (where v.con_boleta = false)), 0))
      from public.venta_lineas l
      join public.ventas v on v.numero = l.venta_numero
      join public.productos p on p.id = l.producto_id
      where l.fecha between v_desde and v_hasta),
    'compras', coalesce((
      select json_agg(json_build_object(
        'id', x.id, 'fecha', x.fecha, 'tipo_doc', x.tipo_doc, 'rut', x.rut, 'proveedor', x.proveedor, 'folio', x.folio,
        'neto', x.neto, 'exento', x.exento, 'iva', x.iva, 'total', x.total, 'categoria', x.categoria, 'nota', x.nota,
        'origen', x.origen
      ) order by x.fecha desc nulls last, x.id desc)
      from public.compras x where x.periodo = v_desde), '[]'::json)
  );
end;
$$;
revoke all on function public.iva_mes(date) from public, anon;
grant execute on function public.iva_mes(date) to authenticated;
