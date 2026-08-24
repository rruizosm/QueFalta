-- Ventana temporal de evaluación de alertas para @rruizosma.
-- Requiere process-price-alerts v2, cuyo EVALUATION_USER_ID está fijado a la
-- misma cuenta. No procesa entregas de ningún otro usuario.

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
  'process-rruizosma-price-alert-evaluation',
  '*/15 * * * *',
  $cron$
  do $job$
  begin
    if now() >= timestamptz '2026-08-25 00:00:00+00' then
      perform cron.unschedule('process-rruizosma-price-alert-evaluation');
    else
      perform net.http_post(
        url := (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'catalog_embed_project_url'
        ) || '/functions/v1/process-price-alerts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-alert-secret', (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'catalog_embed_worker_token'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 10000
      );
    end if;
  end
  $job$;
  $cron$
);

-- Verificación:
-- select jobid, jobname, schedule, active from cron.job
-- where jobname = 'process-rruizosma-price-alert-evaluation';
