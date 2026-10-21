-- =====================================================================
-- Fase 1: base de seguridad
-- Roles, perfiles, permisos de la administradora y configuración general.
-- Regla de oro: TODA tabla de public tiene RLS activado. Los permisos se
-- deciden en la base de datos (funciones private.*), nunca solo en la app.
-- =====================================================================

create type public.rol_usuario as enum ('dueno', 'admin', 'encargada');

-- Esquema privado: no se expone por la API, solo lo usan las políticas.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------
-- Perfiles: una fila por usuario con acceso. Sin perfil = sin acceso.
-- ---------------------------------------------------------------------
create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null check (length(trim(nombre)) between 1 and 80),
  email text not null,
  rol public.rol_usuario not null,
  activo boolean not null default true,
  debe_cambiar_clave boolean not null default false,
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Permisos ajustables de la Administradora (fila única).
-- ---------------------------------------------------------------------
create table public.permisos_admin (
  id boolean primary key default true check (id),
  ver_costos boolean not null default true,
  editar_catalogo boolean not null default true,
  importar_ventas boolean not null default true,
  registrar_mermas boolean not null default true,
  gestionar_pedidos boolean not null default true,
  exportar boolean not null default true,
  editar_configuracion boolean not null default false,
  actualizado_en timestamptz not null default now()
);
insert into public.permisos_admin default values;

-- ---------------------------------------------------------------------
-- Configuración general (fila única).
-- ---------------------------------------------------------------------
create table public.configuracion (
  id boolean primary key default true check (id),
  precios_incluyen_iva boolean not null default true,
  tasa_iva numeric(5, 4) not null default 0.19 check (tasa_iva >= 0 and tasa_iva < 1),
  margen_sobre_neto boolean not null default true,
  minutos_inactividad integer not null default 30 check (minutos_inactividad between 5 and 720),
  hora_corte_turno time not null default '15:00',
  actualizado_en timestamptz not null default now()
);
insert into public.configuracion default values;

-- ---------------------------------------------------------------------
-- Funciones de permisos
-- ---------------------------------------------------------------------
create or replace function private.rol_actual()
returns public.rol_usuario
language sql stable security definer set search_path = ''
as $$
  select p.rol from public.perfiles p where p.id = auth.uid() and p.activo
$$;

-- Lista de permisos conocidos:
--   ver_ventas, ver_costos, editar_catalogo, importar_ventas, registrar_mermas,
--   gestionar_pedidos, exportar, editar_configuracion, gestionar_usuarios
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
          else false -- gestionar_usuarios y cualquier otro: nunca
        end
        from public.permisos_admin pa
      )
      when 'encargada' then permiso = 'ver_ventas'
    end,
    false)
$$;

revoke all on function private.rol_actual() from public;
revoke all on function private.tiene_permiso(text) from public;
grant execute on function private.rol_actual() to authenticated;
grant execute on function private.tiene_permiso(text) to authenticated;

-- Para que la app sepa qué mostrar (la seguridad real está en las políticas).
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
        'gestionar_pedidos', 'exportar', 'editar_configuracion', 'gestionar_usuarios'
      ]) as x where private.tiene_permiso(x))
  )
$$;
revoke all on function public.mi_sesion() from public, anon;
grant execute on function public.mi_sesion() to authenticated;

-- Primer uso: el primer usuario que lo pida se convierte en Dueño,
-- solo si todavía no existe ningún perfil.
create or replace function public.reclamar_dueno(nombre text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión';
  end if;
  perform pg_advisory_xact_lock(hashtext('reclamar_dueno'));
  if exists (select 1 from public.perfiles) then
    raise exception 'La app ya tiene dueño. Pídele a un dueño que te cree una cuenta.';
  end if;
  select u.email into v_email from auth.users u where u.id = auth.uid();
  insert into public.perfiles (id, nombre, email, rol)
  values (auth.uid(), trim(reclamar_dueno.nombre), v_email, 'dueno');
end;
$$;
revoke all on function public.reclamar_dueno(text) from public, anon;
grant execute on function public.reclamar_dueno(text) to authenticated;

-- Tras cambiar la contraseña temporal.
create or replace function public.marcar_clave_cambiada()
returns void
language sql security definer set search_path = ''
as $$
  update public.perfiles set debe_cambiar_clave = false where id = auth.uid()
$$;
revoke all on function public.marcar_clave_cambiada() from public, anon;
grant execute on function public.marcar_clave_cambiada() to authenticated;

-- ---------------------------------------------------------------------
-- Protección: nunca quedarse sin un dueño activo, y nadie se cambia su
-- propio rol.
-- ---------------------------------------------------------------------
create or replace function private.proteger_perfiles()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.id = auth.uid() and (new.rol <> old.rol or new.activo <> old.activo) then
    raise exception 'No puedes cambiar tu propio rol ni desactivarte.';
  end if;
  if old.rol = 'dueno' and old.activo and (new.rol <> 'dueno' or not new.activo) then
    if not exists (select 1 from public.perfiles
                   where rol = 'dueno' and activo and id <> old.id) then
      raise exception 'Debe quedar al menos un dueño activo.';
    end if;
  end if;
  if new.email <> old.email or new.id <> old.id then
    raise exception 'El correo no se puede cambiar desde aquí.';
  end if;
  return new;
end;
$$;

create trigger perfiles_proteger
before update on public.perfiles
for each row execute function private.proteger_perfiles();

create or replace function private.tocar_actualizado_en()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;
create trigger configuracion_actualizado before update on public.configuracion
for each row execute function private.tocar_actualizado_en();
create trigger permisos_admin_actualizado before update on public.permisos_admin
for each row execute function private.tocar_actualizado_en();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.perfiles enable row level security;
alter table public.permisos_admin enable row level security;
alter table public.configuracion enable row level security;

-- El rol anónimo no toca nada.
revoke all on public.perfiles, public.permisos_admin, public.configuracion from anon;
-- Las inserciones de perfiles solo ocurren vía funciones / Edge Function.
revoke insert, delete on public.perfiles from authenticated;
revoke insert, delete on public.permisos_admin, public.configuracion from authenticated;

create policy "perfiles: ver el propio o todos si gestiona usuarios"
on public.perfiles for select to authenticated
using (id = (select auth.uid()) or (select private.tiene_permiso('gestionar_usuarios')));

create policy "perfiles: solo quien gestiona usuarios edita"
on public.perfiles for update to authenticated
using ((select private.tiene_permiso('gestionar_usuarios')))
with check ((select private.tiene_permiso('gestionar_usuarios')));

create policy "permisos_admin: lo ven dueño y administradora"
on public.permisos_admin for select to authenticated
using ((select private.rol_actual()) in ('dueno', 'admin'));

create policy "permisos_admin: solo el dueño edita"
on public.permisos_admin for update to authenticated
using ((select private.rol_actual()) = 'dueno')
with check ((select private.rol_actual()) = 'dueno');

create policy "configuracion: la ve cualquier usuario activo"
on public.configuracion for select to authenticated
using ((select private.rol_actual()) is not null);

create policy "configuracion: edita quien tiene permiso"
on public.configuracion for update to authenticated
using ((select private.tiene_permiso('editar_configuracion')))
with check ((select private.tiene_permiso('editar_configuracion')));
