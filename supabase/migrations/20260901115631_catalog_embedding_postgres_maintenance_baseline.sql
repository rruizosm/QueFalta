-- Fase 5A: mantenimiento preventivo del snapshot de embeddings.
--
-- Ajusta autovacuum por tabla para reaccionar antes al churn del vector HNSW
-- y expone un estado de salud privado para observacion. No ejecuta VACUUM,
-- REINDEX ni cambia hnsw.iterative_scan: esas decisiones requieren metricas.

set lock_timeout = '5s';
set statement_timeout = '60s';

do $checks$
declare
  v_dead_ratio numeric;
begin
  if to_regclass('public.catalog_product_embeddings') is null then
    raise exception 'Falta public.catalog_product_embeddings';
  end if;
  if to_regclass('public.catalog_product_embeddings_hnsw_idx') is null then
    raise exception 'Falta catalog_product_embeddings_hnsw_idx';
  end if;
  if to_regclass('comparator_internal.catalog_embedding_pipeline_control') is null then
    raise exception 'Falta catalog_embedding_pipeline_control';
  end if;
  if to_regclass('pgmq.q_catalog_embedding_jobs') is null then
    raise exception 'Falta pgmq.q_catalog_embedding_jobs';
  end if;
  if to_regclass('cron.job') is null then
    raise exception 'Falta cron.job';
  end if;

  perform control.singleton
  from comparator_internal.catalog_embedding_pipeline_control as control
  where control.singleton
    and control.mode = 'paused'
    and control.canary_remaining_requests = 0
  for update;
  if not found then
    raise exception 'Fase 5 requiere pipeline pausado y presupuesto canario cero';
  end if;

  if not exists (
    select 1
    from cron.job as job
    where job.jobid = 17
      and job.jobname = 'catalog-embedding-dispatch'
      and not job.active
  ) then
    raise exception 'Fase 5 requiere el cron 17 inactivo';
  end if;

  if exists (
    select 1
    from pgmq.q_catalog_embedding_jobs as job
    where job.vt > pg_catalog.now()
  ) then
    raise exception 'Fase 5 requiere cero jobs de embedding en vuelo';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_stat_progress_vacuum as progress
    where progress.relid = 'public.catalog_product_embeddings'::regclass
  ) or exists (
    select 1
    from pg_catalog.pg_stat_progress_create_index as progress
    where progress.relid = 'public.catalog_product_embeddings'::regclass
  ) then
    raise exception 'Fase 5 no se aplica durante vacuum o mantenimiento de indices';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index as index
    where index.indexrelid = 'public.catalog_product_embeddings_hnsw_idx'::regclass
      and index.indisvalid
      and index.indisready
      and index.indislive
  ) then
    raise exception 'Fase 5 requiere el HNSW valido, listo y vivo';
  end if;

  select stats.n_dead_tup::numeric
    / nullif(stats.n_live_tup + stats.n_dead_tup, 0)
  into strict v_dead_ratio
  from pg_catalog.pg_stat_user_tables as stats
  where stats.schemaname = 'public'
    and stats.relname = 'catalog_product_embeddings';

  if coalesce(v_dead_ratio, 0) >= 0.05 then
    raise exception
      'Fase 5 requiere revisar mantenimiento: catalog_product_embeddings tiene >= 5%% de tuplas muertas';
  end if;
end
$checks$;

alter table public.catalog_product_embeddings set (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

create or replace function public.catalog_embedding_maintenance_status()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with relation as (
    select
      class.oid,
      class.reloptions,
      pg_catalog.pg_relation_size(class.oid) as table_bytes,
      pg_catalog.pg_total_relation_size(class.oid) as total_bytes
    from pg_catalog.pg_class as class
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'catalog_product_embeddings'
  ),
  options as (
    select
      max(option.option_value::numeric) filter (
        where option.option_name = 'autovacuum_vacuum_scale_factor'
      ) as vacuum_scale_factor,
      max(option.option_value::numeric) filter (
        where option.option_name = 'autovacuum_analyze_scale_factor'
      ) as analyze_scale_factor
    from relation
    cross join lateral pg_catalog.pg_options_to_table(
      coalesce(relation.reloptions, array[]::text[])
    ) as option
  ),
  effective_options as (
    select
      coalesce(
        options.vacuum_scale_factor,
        pg_catalog.current_setting('autovacuum_vacuum_scale_factor')::numeric
      ) as vacuum_scale_factor,
      coalesce(
        options.analyze_scale_factor,
        pg_catalog.current_setting('autovacuum_analyze_scale_factor')::numeric
      ) as analyze_scale_factor,
      pg_catalog.current_setting('autovacuum_vacuum_threshold')::numeric
        as vacuum_threshold,
      pg_catalog.current_setting('autovacuum_analyze_threshold')::numeric
        as analyze_threshold
    from options
  ),
  stats as (
    select
      stats.n_live_tup,
      stats.n_dead_tup,
      stats.n_mod_since_analyze,
      stats.last_autovacuum,
      stats.last_autoanalyze,
      stats.autovacuum_count,
      stats.autoanalyze_count,
      coalesce(
        stats.n_dead_tup::numeric
          / nullif(stats.n_live_tup + stats.n_dead_tup, 0),
        0
      ) as dead_ratio
    from pg_catalog.pg_stat_user_tables as stats
    where stats.schemaname = 'public'
      and stats.relname = 'catalog_product_embeddings'
  ),
  hnsw as (
    select
      index.indisvalid,
      index.indisready,
      index.indislive,
      pg_catalog.pg_relation_size(class.oid) as index_bytes,
      usage.idx_scan,
      usage.last_idx_scan
    from pg_catalog.pg_class as class
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = class.relnamespace
    join pg_catalog.pg_index as index
      on index.indexrelid = class.oid
    left join pg_catalog.pg_stat_user_indexes as usage
      on usage.indexrelid = class.oid
    where namespace.nspname = 'public'
      and class.relname = 'catalog_product_embeddings_hnsw_idx'
  ),
  maintenance as (
    select
      (
        select count(*)
        from pg_catalog.pg_stat_progress_vacuum as progress
        where progress.relid = 'public.catalog_product_embeddings'::regclass
      ) as vacuum_in_progress,
      (
        select count(*)
        from pg_catalog.pg_stat_progress_create_index as progress
        where progress.relid = 'public.catalog_product_embeddings'::regclass
      ) as index_maintenance_in_progress
  )
  select pg_catalog.jsonb_build_object(
    'observedAt', pg_catalog.now(),
    'pgvectorVersion', (
      select extension.extversion
      from pg_catalog.pg_extension as extension
      where extension.extname = 'vector'
    ),
    'table', pg_catalog.jsonb_build_object(
      'liveTuples', stats.n_live_tup,
      'deadTuples', stats.n_dead_tup,
      'deadTupleRatio', round(stats.dead_ratio, 6),
      'deadTuplePercent', round(100 * stats.dead_ratio, 3),
      'deadTupleAlertThreshold', 0.05,
      'deadTupleAlert', stats.dead_ratio >= 0.05,
      'modifiedSinceAnalyze', stats.n_mod_since_analyze,
      'lastAutovacuum', stats.last_autovacuum,
      'lastAutoanalyze', stats.last_autoanalyze,
      'autovacuumCount', stats.autovacuum_count,
      'autoanalyzeCount', stats.autoanalyze_count,
      'tableBytes', relation.table_bytes,
      'totalBytes', relation.total_bytes
    ),
    'autovacuum', pg_catalog.jsonb_build_object(
      'vacuumScaleFactor', effective_options.vacuum_scale_factor,
      'analyzeScaleFactor', effective_options.analyze_scale_factor,
      'vacuumThreshold', effective_options.vacuum_threshold,
      'analyzeThreshold', effective_options.analyze_threshold,
      'estimatedVacuumTriggerTuples', pg_catalog.ceil(
        effective_options.vacuum_threshold
          + effective_options.vacuum_scale_factor * stats.n_live_tup
      ),
      'estimatedAnalyzeTriggerChanges', pg_catalog.ceil(
        effective_options.analyze_threshold
          + effective_options.analyze_scale_factor * stats.n_live_tup
      )
    ),
    'hnsw', pg_catalog.jsonb_build_object(
      'valid', hnsw.indisvalid,
      'ready', hnsw.indisready,
      'live', hnsw.indislive,
      'indexBytes', hnsw.index_bytes,
      'indexScans', hnsw.idx_scan,
      'lastIndexScan', hnsw.last_idx_scan
    ),
    'maintenance', pg_catalog.jsonb_build_object(
      'vacuumInProgress', maintenance.vacuum_in_progress,
      'indexMaintenanceInProgress', maintenance.index_maintenance_in_progress
    ),
    'requiresAttention',
      stats.dead_ratio >= 0.05
      or not hnsw.indisvalid
      or not hnsw.indisready
      or not hnsw.indislive
  )
  from relation
  cross join effective_options
  cross join stats
  cross join hnsw
  cross join maintenance;
$function$;

revoke all on function public.catalog_embedding_maintenance_status()
  from public, anon, authenticated;
grant execute on function public.catalog_embedding_maintenance_status()
  to service_role;

comment on function public.catalog_embedding_maintenance_status() is
  'Estado operativo service_role de autovacuum, tuplas muertas y HNSW. Marca atencion desde 5 por ciento; no ejecuta mantenimiento.';
