-- Ejecutar solo después de:
-- 1) desplegar las dos migraciones del comparador;
-- 2) desplegar la Edge Function catalog-embed;
-- 3) configurar OPENAI_API_KEY y EMBEDDING_WORKER_TOKEN en Edge Secrets;
-- 4) crear en Vault catalog_embed_project_url y catalog_embed_worker_token;
-- 5) desplegar event_driven_catalog_embedding_dispatch y la Fase 0.
--
-- Este script habilita CANARY (un unico lote en vuelo), nunca ACTIVE.

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
  if to_regprocedure('public.catalog_set_embedding_pipeline_mode(text,text)') is null then
    raise exception 'La Fase 0 del control de embeddings no está desplegada';
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

select public.catalog_set_embedding_pipeline_mode(
  'canary',
  'Canario operativo habilitado desde enable-comparator-embedding-cron.sql'
);

do $configure_cron$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'catalog-embedding-dispatch'
  order by jobid
  limit 1;

  if existing_job_id is null then
    perform cron.schedule(
      'catalog-embedding-dispatch',
      '*/15 * * * *',
      'select public.catalog_dispatch_embedding_jobs(3);'
    );
  else
    perform cron.alter_job(
      job_id => existing_job_id,
      schedule => '*/15 * * * *',
      command => 'select public.catalog_dispatch_embedding_jobs(3);',
      active => true
    );
  end if;
end
$configure_cron$;
