-- =====================================================================
-- Envío programado del resumen semanal: cada lunes a las 16:00 UTC
-- (13:00 en Chile con horario de verano, 12:00 en invierno), para dar
-- tiempo a subir las ventas del domingo en la mañana.
-- El secreto se lee de private.push_config al momento del envío.
-- =====================================================================

select cron.schedule(
  'resumen-semanal',
  '0 16 * * 1',
  $$
  select net.http_post(
    url := 'https://yercpblgvkcdqgtfsyzy.supabase.co/functions/v1/resumen-semanal',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-secreto', (select secreto_cron from private.push_config)),
    body := '{"tipo": "semanal"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
