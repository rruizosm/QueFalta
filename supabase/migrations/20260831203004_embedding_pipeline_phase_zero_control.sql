-- Fase 0 del endurecimiento del pipeline de embeddings.
--
-- Añade un kill switch central, un modo canario de concurrencia uno y una
-- auditoria por materializacion. El estado inicial es deliberadamente PAUSED:
-- desplegar esta migracion nunca arranca la cola existente.

set lock_timeout = '5s';
set statement_timeout = '60s';

grant usage on schema comparator_internal to service_role;

create table comparator_internal.catalog_embedding_pipeline_control (
  singleton boolean primary key default true check (singleton),
  mode text not null default 'paused'
    check (mode = any (array['paused', 'canary', 'active']::text[])),
  max_auto_jobs integer not null default 1000 check (max_auto_jobs between 1 and 100000),
  max_auto_ratio numeric not null default 0.10 check (max_auto_ratio > 0 and max_auto_ratio <= 1),
  canary_max_requests integer not null default 1 check (canary_max_requests between 1 and 3),
  reason text,
  updated_at timestamptz not null default now()
);

comment on table comparator_internal.catalog_embedding_pipeline_control is
  'Interruptor central del pipeline. paused no despacha; canary limita a un lote; active usa la concurrencia solicitada.';

alter table comparator_internal.catalog_embedding_pipeline_control enable row level security;
revoke all on table comparator_internal.catalog_embedding_pipeline_control
  from public, anon, authenticated;
grant select, update on table comparator_internal.catalog_embedding_pipeline_control
  to service_role;

insert into comparator_internal.catalog_embedding_pipeline_control (
  singleton,
  mode,
  reason,
  updated_at
) values (
  true,
  'paused',
  'Fase 0 desplegada: activacion pendiente de canario controlado',
  now()
)
on conflict (singleton) do update set
  mode = 'paused',
  reason = excluded.reason,
  updated_at = excluded.updated_at;

create table comparator_internal.catalog_embedding_runs (
  id uuid primary key default gen_random_uuid(),
  store text not null check (store <> '' and store = lower(store)),
  status text not null
    check (status = any (array['running', 'blocked', 'materialized', 'failed']::text[])),
  pipeline_mode_at_start text not null
    check (pipeline_mode_at_start = any (array['paused', 'canary', 'active']::text[])),
  source_products integer not null check (source_products >= 0),
  existing_products integer not null check (existing_products >= 0),
  new_products integer not null check (new_products >= 0),
  semantic_changed_products integer not null check (semantic_changed_products >= 0),
  metadata_only_products integer not null check (metadata_only_products >= 0),
  republished_products integer not null check (republished_products >= 0),
  unpublished_products integer not null check (unpublished_products >= 0),
  unchanged_products integer not null check (unchanged_products >= 0),
  expected_embedding_jobs integer not null check (expected_embedding_jobs >= 0),
  change_ratio numeric not null check (change_ratio >= 0 and change_ratio <= 1),
  anomaly_blocked boolean not null default false,
  anomaly_override boolean not null default false,
  anomaly_reason text,
  dispatch_request_count integer not null default 0 check (dispatch_request_count >= 0),
  started_at timestamptz not null default now(),
  materialized_at timestamptz,
  dispatched_at timestamptz,
  error_message text,
  constraint catalog_embedding_runs_source_breakdown_check check (
    source_products = new_products
      + semantic_changed_products
      + metadata_only_products
      + republished_products
      + unchanged_products
  ),
  constraint catalog_embedding_runs_expected_jobs_check check (
    expected_embedding_jobs <= new_products + semantic_changed_products + republished_products
  )
);

comment on table comparator_internal.catalog_embedding_runs is
  'Auditoria de cada reconciliacion del snapshot semantico y de su decision de despacho.';

alter table comparator_internal.catalog_embedding_runs enable row level security;
revoke all on table comparator_internal.catalog_embedding_runs
  from public, anon, authenticated;
grant select, insert, update on table comparator_internal.catalog_embedding_runs
  to service_role;

create index catalog_embedding_runs_store_started_idx
  on comparator_internal.catalog_embedding_runs (store, started_at desc);
create index catalog_embedding_runs_attention_idx
  on comparator_internal.catalog_embedding_runs (started_at desc)
  where status in ('blocked', 'failed');

create or replace function public.catalog_embedding_pipeline_status()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'mode', control.mode,
    'maxAutoJobs', control.max_auto_jobs,
    'maxAutoRatio', control.max_auto_ratio,
    'canaryMaxRequests', control.canary_max_requests,
    'reason', control.reason,
    'updatedAt', control.updated_at
  )
  from comparator_internal.catalog_embedding_pipeline_control as control
  where control.singleton;
$function$;

revoke all on function public.catalog_embedding_pipeline_status()
  from public, anon, authenticated;
grant execute on function public.catalog_embedding_pipeline_status()
  to service_role;

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
      reason = nullif(pg_catalog.left(pg_catalog.coalesce(p_reason, ''), 500), ''),
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
  if pg_catalog.least(
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
    'reason', pg_catalog.coalesce(v_anomaly_reason, v_control.reason)
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
        else pg_catalog.left(pg_catalog.coalesce(p_error_message, 'Materializacion fallida'), 1000)
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
  set dispatch_request_count = pg_catalog.greatest(run.dispatch_request_count, p_request_count),
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

-- Conserva la firma que ya usan materializador y worker, pero todos los caminos
-- de despacho pasan ahora por el mismo interruptor.
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
      then pg_catalog.least(p_max_requests, v_control.canary_max_requests)
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

-- El cron existente estaba pausado durante la incidencia. Solo se cambia su
-- comando para que no pueda saltarse el kill switch; su flag active se conserva.
do $cron_guard$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'catalog-embedding-dispatch'
  loop
    perform cron.alter_job(
      job_id => existing_job.jobid,
      command => 'select public.catalog_dispatch_embedding_jobs(3);'
    );
  end loop;
end
$cron_guard$;
