-- Smoke de Fase 5A. Solo verifica configuracion y soporte; termina en ROLLBACK.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $smoke$
declare
  v_status jsonb;
begin
  if (public.catalog_embedding_pipeline_status() ->> 'mode') is distinct from 'paused'
     or (public.catalog_embedding_pipeline_status() ->> 'canaryRemainingRequests')::integer <> 0 then
    raise exception 'El smoke de Fase 5 requiere pipeline pausado';
  end if;

  if not exists (
    select 1
    from cron.job as job
    where job.jobid = 17
      and not job.active
  ) then
    raise exception 'El smoke de Fase 5 requiere cron 17 inactivo';
  end if;

  if exists (
    select 1
    from pgmq.q_catalog_embedding_jobs as job
    where job.vt > pg_catalog.now()
  ) then
    raise exception 'El smoke de Fase 5 requiere cero jobs en vuelo';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class as class
    cross join lateral pg_catalog.pg_options_to_table(class.reloptions) as option
    where class.oid = 'public.catalog_product_embeddings'::regclass
      and option.option_name = 'autovacuum_vacuum_scale_factor'
      and option.option_value::numeric = 0.05
  ) or not exists (
    select 1
    from pg_catalog.pg_class as class
    cross join lateral pg_catalog.pg_options_to_table(class.reloptions) as option
    where class.oid = 'public.catalog_product_embeddings'::regclass
      and option.option_name = 'autovacuum_analyze_scale_factor'
      and option.option_value::numeric = 0.02
  ) then
    raise exception 'Reloptions de autovacuum incorrectas';
  end if;

  if has_function_privilege('anon', 'public.catalog_embedding_maintenance_status()', 'EXECUTE')
     or has_function_privilege(
       'authenticated',
       'public.catalog_embedding_maintenance_status()',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.catalog_embedding_maintenance_status()',
       'EXECUTE'
     ) then
    raise exception 'Permisos incorrectos en catalog_embedding_maintenance_status';
  end if;

  v_status := public.catalog_embedding_maintenance_status();

  if (v_status #>> '{autovacuum,vacuumScaleFactor}')::numeric <> 0.05
     or (v_status #>> '{autovacuum,analyzeScaleFactor}')::numeric <> 0.02
     or (v_status #>> '{table,deadTupleAlertThreshold}')::numeric <> 0.05
     or (v_status #>> '{hnsw,valid}')::boolean is distinct from true
     or (v_status #>> '{hnsw,ready}')::boolean is distinct from true
     or (v_status #>> '{hnsw,live}')::boolean is distinct from true then
    raise exception 'Estado de mantenimiento incoherente: %', v_status;
  end if;

  perform pg_catalog.set_config('hnsw.iterative_scan', 'relaxed_order', true);
  if pg_catalog.current_setting('hnsw.iterative_scan') <> 'relaxed_order' then
    raise exception 'pgvector no acepta hnsw.iterative_scan=relaxed_order';
  end if;
  perform pg_catalog.set_config('hnsw.iterative_scan', 'off', true);
end
$smoke$;

select
  'PHASE_FIVE_MAINTENANCE_BASELINE_OK' as result,
  public.catalog_embedding_maintenance_status() as maintenance_status;

rollback;
