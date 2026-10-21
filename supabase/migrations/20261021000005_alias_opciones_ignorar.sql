-- Un alias de opción sin opción asociada = "es un comentario de caja, ignorar".
-- influye mezcla en la misma columna las opciones y comentarios libres de la
-- cajera ("sin crema", "con crema"); estos no deben crearse como opciones.
alter table public.alias_opciones alter column opcion_id drop not null;
comment on column public.alias_opciones.opcion_id is 'null = texto que se ignora (comentario escrito en caja)';
