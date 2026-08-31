-- Corrige el uso de COALESCE/NULLIF/LEAST/GREATEST en las funciones de la Fase 0.
--
-- PostgreSQL implementa ambas como expresiones especiales, no como funciones
-- del catalogo, por lo que no admiten el prefijo pg_catalog.

set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function public.catalog_set_embedding_pipeline_mode(
  p_mode text,
  p_reason text default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_control comparator_internal.catalog_embedding_pipeline_control%rowtype;
begin
  if p_mode is null or p_mode <> all (array['paused', 'canary', 'active']::text[]) then
    raise exception 'Modo de pipeline invalido: %', p_mode;
  end if;

  update comparator_internal.catalog_embedding_pipeline_control as control
  set mode = p_mode,
      reason = nullif(pg_catalog.left(coalesce(p_reason, ''), 500), ''),
      updated_at = now()
  where control.singleton
  returning control.* into v_control;

  if not found then
    raise exception 'Falta catalog_embedding_pipeline_control';
  end if;

  return pg_catalog.jsonb_build_object(
    'mode', v_control.mode,
    'maxAutoJobs', v_control.max_auto_jobs,
    'maxAutoRatio', v_control.max_auto_ratio,
    'canaryMaxRequests', v_control.canary_max_requests,
    'reason', v_control.reason,
    'updatedAt', v_control.updated_at
  );
end;
$function$;

revoke all on function public.catalog_set_embedding_pipeline_mode(text, text)
  from public, anon, authenticated;
grant execute on function public.catalog_set_embedding_pipeline_mode(text, text)
  to service_role;

create or replace function public.catalog_begin_embedding_run(
  p_store text,
  p_source_products integer,
  p_existing_products integer,
  p_new_products integer,
  p_semantic_changed_products integer,
  p_metadata_only_products integer,
  p_republished_products integer,
  p_unpublished_products integer,
  p_unchanged_products integer,
  p_expected_embedding_jobs integer,
  p_allow_anomaly boolean default false
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_control comparator_internal.catalog_embedding_pipeline_control%rowtype;
  v_run_id uuid := gen_random_uuid();
  v_change_ratio numeric;
  v_anomaly boolean;
  v_anomaly_reason text;
  v_effective_mode text;
begin
  if p_store is null or p_store = '' or p_store <> pg_catalog.lower(p_store) then
    raise exception 'Tienda invalida';
  end if;
  if least(
    p_source_products,
    p_existing_products,
    p_new_products,
    p_semantic_changed_products,
    p_metadata_only_products,
    p_republished_products,
    p_unpublished_products,
    p_unchanged_products,
    p_expected_embedding_jobs
  ) < 0 then
    raise exception 'Los contadores del run no pueden ser negativos';
  end if;
  if p_source_products <> p_new_products
      + p_semantic_changed_products
      + p_metadata_only_products
      + p_republished_products
      + p_unchanged_products then
    raise exception 'El desglose del run no suma source_products';
  end if;
  if p_expected_embedding_jobs > p_new_products
      + p_semantic_changed_products
      + p_republished_products then
    raise exception 'expected_embedding_jobs supera los cambios que pueden encolar';
  end if;

  select control.*
  into v_control
  from comparator_internal.catalog_embedding_pipeline_control as control
  where control.singleton
  for update;

  if not found then
    raise exception 'Falta catalog_embedding_pipeline_control';
  end if;

  v_change_ratio := case
    when p_source_products = 0 then 0
    else p_expected_embedding_jobs::numeric / p_source_products::numeric
  end;
  v_anomaly := not p_allow_anomaly and (
    p_expected_embedding_jobs > v_control.max_auto_jobs
    or v_change_ratio > v_control.max_auto_ratio
  );

  if v_anomaly then
    v_anomaly_reason := pg_catalog.format(
      'Run %s bloqueado: %s embeddings previstos de %s productos (%s%%; limites %s / %s%%)',
      v_run_id,
      p_expected_embedding_jobs,
      p_source_products,
      pg_catalog.round(v_change_ratio * 100, 2),
      v_control.max_auto_jobs,
      pg_catalog.round(v_control.max_auto_ratio * 100, 2)
    );
    update comparator_internal.catalog_embedding_pipeline_control as control
    set mode = 'paused',
        reason = v_anomaly_reason,
        updated_at = now()
    where control.singleton;
    v_effective_mode := 'paused';
  else
    v_effective_mode := v_control.mode;
  end if;

  insert into comparator_internal.catalog_embedding_runs (
    id,
    store,
    status,
    pipeline_mode_at_start,
    source_products,
    existing_products,
    new_products,
    semantic_changed_products,
    metadata_only_products,
    republished_products,
    unpublished_products,
    unchanged_products,
    expected_embedding_jobs,
    change_ratio,
    anomaly_blocked,
    anomaly_override,
    anomaly_reason
  ) values (
    v_run_id,
    p_store,
    case when v_anomaly then 'blocked' else 'running' end,
    v_control.mode,
    p_source_products,
    p_existing_products,
    p_new_products,
    p_semantic_changed_products,
    p_metadata_only_products,
    p_republished_products,
    p_unpublished_products,
    p_unchanged_products,
    p_expected_embedding_jobs,
    v_change_ratio,
    v_anomaly,
    p_allow_anomaly,
    v_anomaly_reason
  );

  return pg_catalog.jsonb_build_object(
    'runId', v_run_id,
    'pipelineMode', v_effective_mode,
    'anomalyBlocked', v_anomaly,
    'dispatchAllowed', not v_anomaly and v_effective_mode <> 'paused',
    'expectedEmbeddingJobs', p_expected_embedding_jobs,
    'changeRatio', v_change_ratio,
    'reason', coalesce(v_anomaly_reason, v_control.reason)
  );
end;
$function$;

revoke all on function public.catalog_begin_embedding_run(
  text, integer, integer, integer, integer, integer, integer, integer, integer, integer, boolean
) from public, anon, authenticated;
grant execute on function public.catalog_begin_embedding_run(
  text, integer, integer, integer, integer, integer, integer, integer, integer, integer, boolean
) to service_role;

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
  v_status text;
begin
  update comparator_internal.catalog_embedding_runs as run
  set status = case
        when not p_success then 'failed'
        when run.status = 'blocked' then 'blocked'
        else 'materialized'
      end,
      materialized_at = now(),
      error_message = case
        when p_success then null
        else pg_catalog.left(coalesce(p_error_message, 'Materializacion fallida'), 1000)
      end
  where run.id = p_run_id
    and run.status in ('running', 'blocked')
  returning run.status into v_status;

  if not found then
    select run.status
    into v_status
    from comparator_internal.catalog_embedding_runs as run
    where run.id = p_run_id;

    if not found then
      raise exception 'Run inexistente: %', p_run_id;
    end if;
    if (p_success and v_status in ('materialized', 'blocked'))
      or (not p_success and v_status = 'failed') then
      return true;
    end if;
    raise exception 'Run % ya finalizado con estado %', p_run_id, v_status;
  end if;

  if not p_success then
    update comparator_internal.catalog_embedding_pipeline_control as control
    set mode = 'paused',
        reason = pg_catalog.format('Run %s fallo durante la materializacion', p_run_id),
        updated_at = now()
    where control.singleton;
  end if;

  return true;
end;
$function$;

revoke all on function public.catalog_complete_embedding_run(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.catalog_complete_embedding_run(uuid, boolean, text)
  to service_role;

create or replace function public.catalog_record_embedding_dispatch(
  p_run_id uuid,
  p_request_count integer
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  if p_request_count < 0 then
    raise exception 'p_request_count no puede ser negativo';
  end if;

  update comparator_internal.catalog_embedding_runs as run
  set dispatch_request_count = greatest(run.dispatch_request_count, p_request_count),
      dispatched_at = case when p_request_count > 0 then now() else run.dispatched_at end
  where run.id = p_run_id;

  if not found then
    raise exception 'Run inexistente: %', p_run_id;
  end if;
  return true;
end;
$function$;

revoke all on function public.catalog_record_embedding_dispatch(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.catalog_record_embedding_dispatch(uuid, integer)
  to service_role;

create or replace function public.catalog_dispatch_embedding_jobs(
  p_max_requests integer default 3
)
returns bigint[]
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_control comparator_internal.catalog_embedding_pipeline_control%rowtype;
  v_effective_requests integer;
begin
  if p_max_requests not between 1 and 10 then
    raise exception 'p_max_requests debe estar entre 1 y 10';
  end if;

  select control.*
  into v_control
  from comparator_internal.catalog_embedding_pipeline_control as control
  where control.singleton;

  if not found then
    raise exception 'Falta catalog_embedding_pipeline_control';
  end if;
  if v_control.mode = 'paused' then
    return array[]::bigint[];
  end if;

  v_effective_requests := case
    when v_control.mode = 'canary'
      then least(p_max_requests, v_control.canary_max_requests)
    else p_max_requests
  end;

  return comparator_internal.dispatch_catalog_embedding_jobs(
    100,
    v_effective_requests,
    180,
    60000
  );
end;
$function$;

revoke all on function public.catalog_dispatch_embedding_jobs(integer)
  from public, anon, authenticated;
grant execute on function public.catalog_dispatch_embedding_jobs(integer)
  to service_role;

comment on function public.catalog_dispatch_embedding_jobs(integer) is
  'Despacho protegido por kill switch: paused=0, canary=maximo 1, active=concurrencia solicitada.';
