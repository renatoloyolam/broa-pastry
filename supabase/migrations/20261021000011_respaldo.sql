-- Fase 8: fecha del último respaldo descargado (para recordarlo cada semana).
alter table public.configuracion add column ultimo_respaldo timestamptz;

create or replace function public.marcar_respaldo()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if private.rol_actual() is distinct from 'dueno' then
    raise exception 'Solo un dueño puede descargar el respaldo.';
  end if;
  update public.configuracion set ultimo_respaldo = now();
end;
$$;
revoke all on function public.marcar_respaldo() from public, anon;
grant execute on function public.marcar_respaldo() to authenticated;
