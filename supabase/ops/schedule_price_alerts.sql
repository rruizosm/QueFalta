-- Ejecutar una vez después de aplicar la migración, desplegar la función y
-- definir PROCESS_PRICE_ALERTS_SECRET. Sustituye ambos placeholders.
-- Vault evita guardar el secreto en cron.job o en el repositorio.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

select vault.create_secret('https://PROJECT_REF.supabase.co', 'price_alerts_project_url');
select vault.create_secret('REPLACE_WITH_PROCESS_PRICE_ALERTS_SECRET', 'price_alerts_processor_secret');

select cron.schedule(
  'process-price-alerts-every-15-minutes',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'price_alerts_project_url') || '/functions/v1/process-price-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-alert-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'price_alerts_processor_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);

-- Verificación:
-- select jobid, jobname, schedule, active from cron.job
-- where jobname = 'process-price-alerts-every-15-minutes';
