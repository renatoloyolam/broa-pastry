-- Fase 8: índices para llaves foráneas y una sola regla de lectura en pedido_costos
-- (recomendaciones del asesor de rendimiento de Supabase).
create index if not exists alias_opciones_opcion on public.alias_opciones (opcion_id);
create index if not exists alias_productos_producto on public.alias_productos (producto_id);
create index if not exists mermas_motivo on public.mermas (motivo_id);
create index if not exists pedidos_producto on public.pedidos (producto_id);
create index if not exists pedidos_opcion on public.pedidos (opcion_id);

drop policy "pedido_costos: editar con costos" on public.pedido_costos;
create policy "pedido_costos: crear" on public.pedido_costos for insert to authenticated
with check ((select private.tiene_permiso('ver_costos')) and (select private.tiene_permiso('gestionar_pedidos')));
create policy "pedido_costos: editar" on public.pedido_costos for update to authenticated
using ((select private.tiene_permiso('ver_costos')) and (select private.tiene_permiso('gestionar_pedidos')))
with check ((select private.tiene_permiso('ver_costos')) and (select private.tiene_permiso('gestionar_pedidos')));
create policy "pedido_costos: borrar" on public.pedido_costos for delete to authenticated
using ((select private.tiene_permiso('ver_costos')) and (select private.tiene_permiso('gestionar_pedidos')));
