-- =====================================================================
-- Resumen semanal: pantalla en la app + notificación en el teléfono
--
-- * resumen_semana(lunes): los números de una semana (lunes a domingo)
--   y de la anterior, según los permisos de quien pregunta.
-- * Notificaciones (Web Push): cada teléfono que las activa se guarda en
--   push_suscripciones. Las llaves VAPID y el secreto del envío programado
--   viven en private.push_config (no se exponen por la API).
-- * Envío: cada lunes pg_cron llama a la Edge Function "resumen-semanal",
--   que arma el texto de cada usuario (texto_resumen_semanal, solo para
--   la llave de servicio) y lo manda a sus teléfonos.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table private.push_config (
  id boolean primary key default true check (id),
  vapid_publica text not null,
  vapid_privada text not null,
  secreto_cron text not null
);
revoke all on private.push_config from public, authenticated;

create table public.push_suscripciones (
  id bigint generated always as identity primary key,
  usuario uuid not null references public.perfiles (id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%'),
  p256dh text not null,
  auth text not null,
  dispositivo text check (length(dispositivo) <= 200),
  creado_en timestamptz not null default now(),
  ultimo_envio timestamptz
);
create index push_suscripciones_usuario on public.push_suscripciones (usuario);
alter table public.push_suscripciones enable row level security;
revoke all on public.push_suscripciones from anon;
revoke insert, update on public.push_suscripciones from authenticated;
create policy "push: ver las propias" on public.push_suscripciones for select to authenticated
using (usuario = (select auth.uid()));
create policy "push: borrar las propias" on public.push_suscripciones for delete to authenticated
using (usuario = (select auth.uid()));

-- Llave pública para suscribirse (no es secreta)
create or replace function public.vapid_publica()
returns text
language sql stable security definer set search_path = ''
as $$ select vapid_publica from private.push_config where private.rol_actual() is not null $$;
revoke all on function public.vapid_publica() from public, anon;
grant execute on function public.vapid_publica() to authenticated;

-- Guarda (o reasigna) el teléfono del usuario actual
create or replace function public.registrar_push(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if private.rol_actual() is null then
    raise exception 'Sin acceso.';
  end if;
  insert into public.push_suscripciones (usuario, endpoint, p256dh, auth, dispositivo)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_dispositivo, 200))
  on conflict (endpoint) do update
    set usuario = excluded.usuario, p256dh = excluded.p256dh, auth = excluded.auth,
        dispositivo = excluded.dispositivo, creado_en = now();
end;
$$;
revoke all on function public.registrar_push(text, text, text, text) from public, anon;
grant execute on function public.registrar_push(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Números de una semana
-- ---------------------------------------------------------------------
create or replace function public.resumen_semana(p_lunes date)
returns json
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_lunes date := p_lunes - (extract(isodow from p_lunes)::int - 1);
  v_domingo date := v_lunes + 6;
  v_panel json;
begin
  if not private.tiene_permiso('ver_ventas') then
    raise exception 'No tienes permiso para ver ventas.';
  end if;
  v_panel := public.panel(v_lunes, v_domingo, v_lunes - 7, v_domingo - 7);
  return json_build_object(
    'desde', v_lunes,
    'hasta', v_domingo,
    'ultimo_dia', (select max(fecha) from public.ventas where fecha between v_lunes and v_domingo),
    'ver_costos', v_panel->'ver_costos',
    'resumen', v_panel->'resumen',
    'anterior', v_panel->'anterior',
    'dias', v_panel->'dias',
    'productos', (select coalesce(json_agg(x), '[]'::json) from (
      select x from json_array_elements(v_panel->'productos') x limit 5) y),
    'finanzas', private.tiene_permiso('gestionar_finanzas')
  );
end;
$$;
revoke all on function public.resumen_semana(date) from public, anon;
grant execute on function public.resumen_semana(date) to authenticated;

-- "1234567" → "$1.234.567"
create or replace function private.pesos(v numeric)
returns text
language sql immutable set search_path = ''
as $$ select case when v < 0 then '-' else '' end || '$' || replace(to_char(abs(round(v)), 'FM999,999,999,990'), ',', '.') $$;

-- Texto de la notificación para un usuario (lo usa solo la Edge Function)
create or replace function public.texto_resumen_semanal(p_usuario uuid, p_lunes date)
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  r json;
  v numeric; va numeric; g numeric;
  cambio text := '';
  meses text[] := array['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  titulo text;
  cuerpo text;
begin
  -- Se calcula con los permisos de ese usuario
  perform set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated')::text, true);
  if private.rol_actual() is null then
    return null;
  end if;
  r := public.resumen_semana(p_lunes);
  v := (r->'resumen'->>'ventas')::numeric;
  va := (r->'anterior'->>'ventas')::numeric;
  titulo := 'Resumen semanal · ' || extract(day from (r->>'desde')::date) || '–' || extract(day from (r->>'hasta')::date) || ' '
            || meses[extract(month from (r->>'hasta')::date)];
  if coalesce(v, 0) = 0 then
    cuerpo := 'Aún no hay ventas cargadas de la semana pasada. Sube el Excel de influye para ver el resumen.';
  else
    if va > 0 then
      cambio := ' (' || case when v >= va then '▲ ' else '▼ ' end || round(abs(v - va) / va * 100) || '% vs la anterior)';
    end if;
    cuerpo := 'Vendiste ' || private.pesos(v) || cambio || '.';
    if (r->>'ver_costos')::boolean then
      g := (r->'resumen'->>'ventas_netas_costeadas')::numeric - (r->'resumen'->>'costo')::numeric - coalesce((r->'resumen'->>'mermas')::numeric, 0);
      cuerpo := cuerpo || ' Ganancia ' || private.pesos(g) || '.';
    end if;
    if (r->>'ultimo_dia')::date < (r->>'hasta')::date then
      cuerpo := cuerpo || ' (Ventas cargadas hasta el ' || to_char((r->>'ultimo_dia')::date, 'DD/MM') || ').';
    end if;
    cuerpo := cuerpo || ' Toca para ver el detalle.';
  end if;
  return json_build_object('titulo', titulo, 'cuerpo', cuerpo, 'url', '/resumen');
end;
$$;
revoke all on function public.texto_resumen_semanal(uuid, date) from public, anon, authenticated;
grant execute on function public.texto_resumen_semanal(uuid, date) to service_role;

-- Llaves y suscripciones para la Edge Function (solo llave de servicio)
create or replace function public.config_push()
returns json
language sql stable security definer set search_path = ''
as $$ select row_to_json(c) from private.push_config c $$;
revoke all on function public.config_push() from public, anon, authenticated;
grant execute on function public.config_push() to service_role;
