-- Valor hora calculado desde los trabajadores y los gastos, como en la hoja "MDO Y GIF" de la planilla,
-- pero contando a los trabajadores en vez de dividir por un número fijo (la planilla usa 13).
--
--   sueldo por hora de cada uno = costo mensual ÷ (horas al día × días al mes)
--   mano de obra = promedio del sueldo por hora de los trabajadores incluidos
--   G.I.F.       = gastos del mes ÷ días abiertos ÷ horas al día ÷ trabajadores incluidos
--
-- Los sueldos solo los ven quienes gestionan finanzas. Los montos reales se cargan aparte.

alter table public.valores_hora
  add column calcular boolean not null default false,
  add column dias_mes numeric(4, 1) not null default 26 check (dias_mes > 0 and dias_mes <= 31),
  add column horas_dia numeric(4, 1) not null default 8 check (horas_dia > 0 and horas_dia <= 24);

create table public.costo_trabajadores (
  id bigint generated always as identity primary key,
  nombre text not null check (length(btrim(nombre)) between 1 and 80),
  area text check (area is null or length(area) <= 60),
  horas_dia numeric(4, 1) not null check (horas_dia > 0 and horas_dia <= 24),
  dias_mes numeric(4, 1) not null check (dias_mes > 0 and dias_mes <= 31),
  costo_mensual numeric(12, 2) not null check (costo_mensual >= 0),
  incluir boolean not null default true,
  creado_en timestamptz not null default now()
);

create table public.costo_gif (
  id bigint generated always as identity primary key,
  concepto text not null check (length(btrim(concepto)) between 1 and 80),
  tipo text not null default 'fijo' check (tipo in ('fijo', 'variable')),
  monto_mensual numeric(12, 2) not null check (monto_mensual >= 0),
  creado_en timestamptz not null default now()
);

alter table public.costo_trabajadores enable row level security;
alter table public.costo_gif enable row level security;
revoke all on public.costo_trabajadores, public.costo_gif from anon;

create policy "costo_trabajadores: todo (finanzas)" on public.costo_trabajadores for all to authenticated
  using ((select private.tiene_permiso('gestionar_finanzas')))
  with check ((select private.tiene_permiso('gestionar_finanzas')));
create policy "costo_gif: todo (finanzas)" on public.costo_gif for all to authenticated
  using ((select private.tiene_permiso('gestionar_finanzas')))
  with check ((select private.tiene_permiso('gestionar_finanzas')));

-- Resultado del cálculo con los datos actuales (null si no hay a quién dividir)
create function private.valor_hora_calculado(p_dias_mes numeric, p_horas_dia numeric)
returns table (mano_obra numeric, gif numeric, trabajadores int)
language sql stable security definer set search_path = ''
as $$
  with t as (
    select costo_mensual / (horas_dia * dias_mes) as por_hora
    from public.costo_trabajadores where incluir
  )
  select
    round((select avg(por_hora) from t), 2),
    round((select coalesce(sum(monto_mensual), 0) from public.costo_gif) / (p_dias_mes * p_horas_dia)
          / nullif((select count(*) from t), 0), 2),
    (select count(*)::int from t)
$$;
revoke all on function private.valor_hora_calculado(numeric, numeric) from public, authenticated;

-- Con "calcular" activo, el valor hora no se escribe a mano: sale de las tablas
create function private.aplicar_valor_hora()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  c record;
begin
  if new.calcular then
    select * into c from private.valor_hora_calculado(new.dias_mes, new.horas_dia);
    if c.trabajadores = 0 then
      raise exception 'Agrega al menos un trabajador incluido para calcular el valor hora.';
    end if;
    new.mano_obra := c.mano_obra;
    new.gif := c.gif;
  end if;
  return new;
end;
$$;
create trigger aplicar_calculo before update on public.valores_hora
for each row execute function private.aplicar_valor_hora();

-- Al cambiar trabajadores o gastos, se vuelve a calcular (y con eso se recalculan las recetas)
create function private.trigger_valor_hora()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select calcular from public.valores_hora) then
    update public.valores_hora set actualizado_en = now();
  end if;
  return null;
end;
$$;
create trigger recalcular_valor_hora after insert or update or delete on public.costo_trabajadores
for each statement execute function private.trigger_valor_hora();
create trigger recalcular_valor_hora after insert or update or delete on public.costo_gif
for each statement execute function private.trigger_valor_hora();
