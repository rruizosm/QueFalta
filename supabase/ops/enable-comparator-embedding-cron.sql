-- Ejecutar solo después de:
-- 1) desplegar las dos migraciones del comparador;
-- 2) desplegar la Edge Function catalog-embed;
-- 3) configurar OPENAI_API_KEY y EMBEDDING_WORKER_TOKEN en Edge Secrets;
-- 4) crear en Vault catalog_embed_project_url y catalog_embed_worker_token;
-- 5) desplegar la migración event_driven_catalog_embedding_dispatch.

do $checks$
begin
  if to_regprocedure(
    'comparator_internal.dispatch_catalog_embedding_jobs(integer,integer,integer,integer)'
  ) is null then
    raise exception 'La migración comparator_embedding_pipeline no está desplegada';
  end if;
  if to_regprocedure('public.catalog_dispatch_embedding_jobs(integer)') is null then
    raise exception 'La migración event_driven_catalog_embedding_dispatch no está desplegada';
  end if;
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'catalog_embed_project_url' and decrypted_secret <> ''
  ) then
    raise exception 'Falta catalog_embed_project_url en Vault';
  end if;
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'catalog_embed_worker_token' and decrypted_secret <> ''
  ) then
    raise exception 'Falta catalog_embed_worker_token en Vault';
  end if;
end
$checks$;

do $unschedule$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'catalog-embedding-dispatch'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end
$unschedule$;

select cron.schedule(
  'catalog-embedding-dispatch',
  '*/15 * * * *',
  $cron$select comparator_internal.dispatch_catalog_embedding_jobs(100, 3, 180, 60000);$cron$
);
