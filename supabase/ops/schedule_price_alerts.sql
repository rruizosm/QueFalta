-- Ejecutar una vez después de aplicar la migración y desplegar la función.
-- Reutiliza el secreto interno ya compartido por Vault y Edge Secrets con el
-- worker de embeddings; ningún valor secreto queda en cron.job ni en el repo.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

do $checks$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'catalog_embed_project_url' and decrypted_secret <> ''
  ) then
    raise exception 'missing_catalog_embed_project_url';
  end if;
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'catalog_embed_worker_token' and decrypted_secret <> ''
  ) then
    raise exception 'missing_catalog_embed_worker_token';
  end if;
end
$checks$;

select cron.schedule(
  'process-price-alerts-every-15-minutes',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'catalog_embed_project_url') || '/functions/v1/process-price-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-alert-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'catalog_embed_worker_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);

-- Verificación:
-- select jobid, jobname, schedule, active from cron.job
-- where jobname = 'process-price-alerts-every-15-minutes';
