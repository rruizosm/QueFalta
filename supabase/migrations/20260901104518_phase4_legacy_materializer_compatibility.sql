-- Compatibilidad transitoria para materializadores anteriores a Fase 4.
--
-- Si un run legacy intenta completarse sin manifiesto, solo se adopta cuando
-- los jobs de su tienda encolados desde started_at coinciden exactamente con
-- expected_embedding_jobs. El materializador nuevo registra siempre su
-- manifiesto explícito y no entra en este camino.

set lock_timeout = '5s';
set statement_timeout = '60s';

do $checks$
begin
  if to_regclass('comparator_internal.catalog_embedding_run_jobs') is null then
    raise exception 'Falta Fase 4 durable settlement';
  end if;
  if not exists (
    select 1
    from comparator_internal.catalog_embedding_pipeline_control as control
    where control.singleton
      and control.mode = 'paused'
  ) then
    raise exception 'La compatibilidad de Fase 4 requiere pipeline paused';
  end if;
  if exists (
    select 1
    from pgmq.q_catalog_embedding_jobs as job
    where job.vt > pg_catalog.now()
  ) then
    raise exception 'La compatibilidad de Fase 4 requiere cero jobs en vuelo';
  end if;
end
$checks$;

create or replace function public.catalog_complete_embedding_run(
  p_run_id uuid,
  p_success boolean,
  p_error_message text default null
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_run comparator_internal.catalog_embedding_runs%rowtype;
  v_settled boolean;
  v_legacy_jobs jsonb := '[]'::jsonb;
  v_legacy_job_count integer := 0;
begin
  if p_success is null then
    raise exception 'p_success es requerido' using errcode = '22023';
  end if;

  select run.*
  into v_run
  from comparator_internal.catalog_embedding_runs as run
  where run.id = p_run_id
  for update;

  if not found then
    raise exception 'Run inexistente: %', p_run_id;
  end if;

  if p_success then
    if v_run.status in ('blocked', 'materialized', 'settled') then
      return true;
    end if;
    if v_run.status = 'draining' then
      perform comparator_internal.revalidate_catalog_embedding_run_jobs(
        array[p_run_id],
        null,
        null
      );
      v_settled := comparator_internal.try_settle_catalog_embedding_run(p_run_id);
      if v_settled then
        return true;
      end if;
      return exists (
        select 1
        from comparator_internal.catalog_embedding_run_jobs as link
        where link.run_id = p_run_id
          and link.status = 'pending'
      );
    end if;
    if v_run.status <> 'running' then
      raise exception 'Run % ya finalizado con estado %', p_run_id, v_run.status;
    end if;

    if v_run.dependencies_registered_at is null
      and v_run.expected_dependency_count is null
    then
      if v_run.expected_embedding_jobs > 0 then
        select
          coalesce(
            pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'store', queued.message ->> 'store',
                'productId', queued.message ->> 'productId',
                'embeddingInputHash', coalesce(
                  queued.message ->> 'embeddingInputHash',
                  queued.message ->> 'contentHash'
                ),
                'model', coalesce(
                  queued.message ->> 'model',
                  'text-embedding-3-small'
                )
              )
              order by queued.msg_id
            ),
            '[]'::jsonb
          ),
          pg_catalog.count(*)::integer
        into v_legacy_jobs, v_legacy_job_count
        from pgmq.q_catalog_embedding_jobs as queued
        where queued.message ->> 'store' = v_run.store
          and queued.enqueued_at >= v_run.started_at;
      end if;

      if v_legacy_job_count <> v_run.expected_embedding_jobs then
        raise exception
          'Run legacy %: jobs adoptables no coinciden con expected_embedding_jobs (% <> %)',
          p_run_id,
          v_legacy_job_count,
          v_run.expected_embedding_jobs;
      end if;

      perform public.catalog_register_embedding_run_jobs(
        p_run_id,
        v_legacy_jobs,
        v_legacy_job_count,
        true
      );

      select run.*
      into v_run
      from comparator_internal.catalog_embedding_runs as run
      where run.id = p_run_id
      for update;
    end if;

    if v_run.dependencies_registered_at is null then
      raise exception 'El manifiesto de dependencias del run % no está cerrado', p_run_id;
    end if;
    if v_run.expected_dependency_count is null
      or v_run.dependency_count <> v_run.expected_dependency_count
    then
      raise exception 'El manifiesto de dependencias del run % no cuadra (% <> %)',
        p_run_id, v_run.dependency_count, v_run.expected_dependency_count;
    end if;

    update comparator_internal.catalog_embedding_runs as run
    set status = 'draining',
        materialized_at = coalesce(run.materialized_at, pg_catalog.now()),
        draining_at = coalesce(run.draining_at, pg_catalog.now()),
        error_message = null
    where run.id = p_run_id;

    perform comparator_internal.revalidate_catalog_embedding_run_jobs(
      array[p_run_id],
      null,
      null
    );
    v_settled := comparator_internal.try_settle_catalog_embedding_run(p_run_id);
    if v_settled then
      return true;
    end if;
    return exists (
      select 1
      from comparator_internal.catalog_embedding_run_jobs as link
      where link.run_id = p_run_id
        and link.status = 'pending'
    );
  end if;

  if v_run.status = 'failed' then
    return true;
  end if;
  if v_run.status not in ('running', 'blocked') then
    raise exception 'Run % no admite fallo en estado %', p_run_id, v_run.status;
  end if;

  if v_run.status = 'running' and v_run.comparator_impact then
    perform comparator_internal.bump_catalog_match_store_version_for_run(p_run_id);
  end if;

  update comparator_internal.catalog_embedding_runs as run
  set status = 'failed',
      materialized_at = coalesce(run.materialized_at, pg_catalog.now()),
      error_message = pg_catalog.left(
        coalesce(p_error_message, 'Materialización fallida'),
        1000
      )
  where run.id = p_run_id;

  update comparator_internal.catalog_embedding_pipeline_control as control
  set mode = 'paused',
      reason = pg_catalog.format('Run %s falló durante la materialización', p_run_id),
      updated_at = pg_catalog.now()
  where control.singleton;

  return true;
end
$function$;

revoke all on function public.catalog_complete_embedding_run(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.catalog_complete_embedding_run(uuid, boolean, text)
  to service_role;

comment on function public.catalog_complete_embedding_run(uuid, boolean, text) is
  'Cierra runs de Fase 4 y adopta temporalmente manifests legacy solo con conteo exacto desde started_at.';
