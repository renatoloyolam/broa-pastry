-- Ítems para ordenar las recetas (Galletería, Bollería, Cafetería, Pastelería, Festividades…).
-- Se pueden crear, renombrar, ordenar y borrar; al borrar uno, sus recetas quedan "Sin ítem".

create table public.recetas_items (
  id bigint generated always as identity primary key,
  nombre text not null unique check (length(btrim(nombre)) between 1 and 60),
  orden int not null default 100,
  creado_en timestamptz not null default now()
);

alter table public.recetas_items enable row level security;
revoke all on public.recetas_items from anon;
create policy "recetas_items: ver (costos)" on public.recetas_items for select to authenticated
  using ((select private.tiene_permiso('ver_costos')));
create policy "recetas_items: crear" on public.recetas_items for insert to authenticated
  with check ((select private.tiene_permiso('ver_costos')) and (select private.tiene_permiso('editar_catalogo')));
create policy "recetas_items: editar" on public.recetas_items for update to authenticated
  using ((select private.tiene_permiso('ver_costos')) and (select private.tiene_permiso('editar_catalogo')))
  with check ((select private.tiene_permiso('ver_costos')) and (select private.tiene_permiso('editar_catalogo')));
create policy "recetas_items: borrar" on public.recetas_items for delete to authenticated
  using ((select private.tiene_permiso('ver_costos')) and (select private.tiene_permiso('editar_catalogo')));

insert into public.recetas_items (nombre, orden) values
  ('Galletería', 10), ('Bollería', 20), ('Cafetería', 30), ('Pastelería', 40), ('Festividades', 50);

alter table public.recetas add column item_id bigint references public.recetas_items (id) on delete set null;
create index recetas_item on public.recetas (item_id);

create or replace view public.v_recetas with (security_invoker = true) as
select r.id, r.nombre, r.rendimiento, r.unidad_rendimiento, r.es_base, r.notas, r.actualizado_en, r.creado_en,
       round(private.costo_receta_unitario(r.id) * r.rendimiento, 2) as costo_total,
       round(private.costo_receta_unitario(r.id), 4) as costo_unitario,
       r.horas_mano_obra, r.horas_gif,
       r.item_id
from public.recetas r;
