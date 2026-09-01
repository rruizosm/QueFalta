-- Fase 4: runs durables e invalidación set-based del comparador.
--
-- Introduce el contrato run <-> identidad de trabajo, revalida sus resultados
-- de forma set-based, invalida individualmente las fuentes modificadas y
-- sustituye el bump legacy por fila por un único bump al cerrar cada run.

set lock_timeout = '5s';
set statement_timeout = '60s';

do $checks$
begin
  if to_regclass('comparator_internal.catalog_embedding_runs') is null then
    raise exception 'Falta comparator_internal.catalog_embedding_runs';
  end if;
  if to_regclass('comparator_internal.catalog_match_store_versions') is null then
    raise exception 'Falta comparator_internal.catalog_match_store_versions';
  end if;
  if to_regclass('public.catalog_product_embeddings') is null then
    raise exception 'Falta public.catalog_product_embeddings';
  end if;
  if to_regclass('public.catalog_embedding_failures') is null then
    raise exception 'Falta public.catalog_embedding_failures';
  end if;
  if to_regclass('pgmq.q_catalog_embedding_jobs') is null then
    raise exception 'Falta pgmq.q_catalog_embedding_jobs';
  end if;
  if to_regclass('comparator_internal.catalog_embedding_pipeline_control') is null then
    raise exception 'Falta comparator_internal.catalog_embedding_pipeline_control';
  end if;
  if to_regclass('cron.job') is null then
    raise exception 'Falta cron.job';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = 'comparator_internal.catalog_embedding_runs'::regclass
      and attribute.attname = 'repair_products'
      and not attribute.attisdropped
  ) then
    raise exception 'Falta catalog_embedding_runs.repair_products de Fase 1';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = 'public.catalog_product_embeddings'::regclass
      and attribute.attname = 'embedded_content_hash'
      and not attribute.attisdropped
  ) then
    raise exception 'Falta catalog_product_embeddings.embedded_content_hash de Fase 3';
  end if;
  perform control.singleton
    from comparator_internal.catalog_embedding_pipeline_control as control
    where control.singleton
      and control.mode = 'paused'
    for update;
  if not found then
    raise exception 'Fase 4 requiere el pipeline pausado';
  end if;

  perform job.jobid
  from cron.job as job
  where job.jobid = 17
    and job.jobname = 'catalog-embedding-dispatch'
    and not job.active;
  if not found then
    raise exception 'Fase 4 requiere el cron catalog-embedding-dispatch (job 17) inactivo';
  end if;

  if exists (
    select 1
    from pgmq.q_catalog_embedding_jobs as job
    where job.vt > pg_catalog.now()
  ) then
    raise exception 'Fase 4 requiere cero mensajes de embedding en vuelo';
  end if;
end
$checks$;

alter table comparator_internal.catalog_embedding_runs
  add column if not exists dependencies_registered_at timestamptz,
  add column if not exists draining_at timestamptz,
  add column if not exists settled_at timestamptz,
  add column if not exists cache_bumped_at timestamptz,
  add column if not exists settled_generation bigint,
  add column if not exists expected_dependency_count integer;

alter table comparator_internal.catalog_embedding_runs
  add column if not exists comparator_impact boolean generated always as (
    new_products > 0
      or semantic_changed_products > 0
      or metadata_only_products > 0
      or republished_products > 0
      or repair_products > 0
      or unpublished_products > 0
  ) stored,
  add column if not exists dependency_count integer not null default 0,
  add column if not exists completed_dependency_count integer not null default 0,
  add column if not exists already_ready_dependency_count integer not null default 0,
  add column if not exists superseded_dependency_count integer not null default 0,
  add column if not exists terminal_failed_dependency_count integer not null default 0;

alter table comparator_internal.catalog_embedding_runs
  drop constraint if exists catalog_embedding_runs_status_check,
  add constraint catalog_embedding_runs_status_check check (
    status = any (array[
      'running', 'blocked', 'materialized', 'draining', 'settled', 'failed'
    ]::text[])
  ) not valid,
  add constraint catalog_embedding_runs_dependency_counts_check check (
    (expected_dependency_count is null or expected_dependency_count >= expected_embedding_jobs)
      and dependency_count >= 0
      and (expected_dependency_count is null or dependency_count <= expected_dependency_count)
      and completed_dependency_count >= 0
      and already_ready_dependency_count >= 0
      and superseded_dependency_count >= 0
      and terminal_failed_dependency_count >= 0
      and completed_dependency_count
        + already_ready_dependency_count
        + superseded_dependency_count
        + terminal_failed_dependency_count <= dependency_count
  ) not valid,
  add constraint catalog_embedding_runs_settlement_check check (
    (status <> 'settled' or settled_at is not null)
      and (cache_bumped_at is null or settled_generation is not null)
      and (settled_generation is null or settled_generation >= 1)
      and (
        status <> 'settled'
        or comparator_impact
        or (cache_bumped_at is null and settled_generation is null)
      )
      and (
        status <> 'settled'
        or not comparator_impact
        or (cache_bumped_at is not null and settled_generation is not null)
      )
      and (
        status <> 'settled'
        or (
          expected_dependency_count is not null
          and dependency_count = expected_dependency_count
        )
      )
  ) not valid;

alter table comparator_internal.catalog_embedding_runs
  validate constraint catalog_embedding_runs_status_check;
alter table comparator_internal.catalog_embedding_runs
  validate constraint catalog_embedding_runs_dependency_counts_check;
alter table comparator_internal.catalog_embedding_runs
  validate constraint catalog_embedding_runs_settlement_check;

comment on column comparator_internal.catalog_embedding_runs.dependencies_registered_at is
  'El materializador cerró el manifiesto de identidades de embedding de este run.';
comment on column comparator_internal.catalog_embedding_runs.draining_at is
  'El snapshot terminó y el run espera únicamente resultados terminales de embeddings.';
comment on column comparator_internal.catalog_embedding_runs.settled_at is
  'Todas las dependencias alcanzaron estado terminal y la invalidación de tienda terminó.';
comment on column comparator_internal.catalog_embedding_runs.cache_bumped_at is
  'Marca idempotente escrita en la misma transacción que el único bump de generación del run.';
comment on column comparator_internal.catalog_embedding_runs.comparator_impact is
  'Derivado solo de deltas materializados o reparaciones nuevas; observar una identidad suprimida no invalida la tienda.';
comment on column comparator_internal.catalog_embedding_runs.expected_dependency_count is
  'Tamaño lógico del manifiesto durable; no participa en el guardarraíl de trabajo nuevo expected_embedding_jobs.';
comment on column comparator_internal.catalog_embedding_runs.repair_products is
  'Productos cuya reparación crea trabajo nuevo no suprimido; el tamaño lógico del manifiesto se guarda aparte.';

create table comparator_internal.catalog_embedding_job_identities (
  id bigint generated always as identity primary key,
  store text not null,
  product_id text not null,
  embedding_input_hash text not null,
  model text not null,
  first_linked_at timestamptz not null default pg_catalog.now(),
  last_linked_at timestamptz not null default pg_catalog.now(),
  constraint catalog_embedding_job_identities_store_check check (
    store <> '' and store = pg_catalog.lower(store)
  ),
  constraint catalog_embedding_job_identities_product_check check (product_id <> ''),
  constraint catalog_embedding_job_identities_hash_check check (
    embedding_input_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint catalog_embedding_job_identities_model_check check (
    model = 'text-embedding-3-small'
  ),
  constraint catalog_embedding_job_identities_identity_key unique (
    store, product_id, embedding_input_hash, model
  )
);

comment on table comparator_internal.catalog_embedding_job_identities is
  'Identidad durable y deduplicada de un trabajo lógico; una misma identidad puede satisfacer varios runs.';

alter table comparator_internal.catalog_embedding_job_identities enable row level security;
revoke all on table comparator_internal.catalog_embedding_job_identities
  from public, anon, authenticated;
grant select, insert, update
  on table comparator_internal.catalog_embedding_job_identities
  to service_role;
grant usage
  on sequence comparator_internal.catalog_embedding_job_identities_id_seq
  to service_role;

create table comparator_internal.catalog_embedding_run_jobs (
  run_id uuid not null,
  job_identity_id bigint not null,
  status text not null default 'pending',
  linked_at timestamptz not null default pg_catalog.now(),
  resolved_at timestamptz,
  last_observed_state text not null default 'missing',
  last_queue_msg_id bigint,
  last_observed_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (run_id, job_identity_id),
  constraint catalog_embedding_run_jobs_run_fkey foreign key (run_id)
    references comparator_internal.catalog_embedding_runs (id)
    on delete cascade,
  constraint catalog_embedding_run_jobs_identity_fkey foreign key (job_identity_id)
    references comparator_internal.catalog_embedding_job_identities (id)
    on delete restrict,
  constraint catalog_embedding_run_jobs_status_check check (
    status = any (array[
      'pending', 'completed', 'already_ready', 'superseded', 'terminal_failed'
    ]::text[])
  ),
  constraint catalog_embedding_run_jobs_resolution_check check (
    (status = 'pending' and resolved_at is null)
      or (status <> 'pending' and resolved_at is not null)
  ),
  constraint catalog_embedding_run_jobs_observation_check check (
    last_observed_state = any (array[
      'queued', 'retryable_failed', 'missing',
      'completed', 'already_ready', 'superseded', 'terminal_failed'
    ]::text[])
  )
);

comment on table comparator_internal.catalog_embedding_run_jobs is
  'Relación muchos-a-muchos entre runs e identidades. Retryable/queued/missing siguen pending; el estado terminal pertenece al run y no se reabre si la identidad se reutiliza después.';

alter table comparator_internal.catalog_embedding_run_jobs enable row level security;
revoke all on table comparator_internal.catalog_embedding_run_jobs
  from public, anon, authenticated;
grant select, insert, update
  on table comparator_internal.catalog_embedding_run_jobs
  to service_role;

create index catalog_embedding_run_jobs_identity_idx
  on comparator_internal.catalog_embedding_run_jobs (job_identity_id);
create index catalog_embedding_run_jobs_pending_run_idx
  on comparator_internal.catalog_embedding_run_jobs (run_id, job_identity_id)
  where status = 'pending';
create index catalog_embedding_run_jobs_pending_identity_idx
  on comparator_internal.catalog_embedding_run_jobs (job_identity_id, run_id)
  where status = 'pending';

create or replace function comparator_internal.bump_catalog_match_store_version_for_run(
  p_run_id uuid
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_run comparator_internal.catalog_embedding_runs%rowtype;
  v_generation bigint;
begin
  -- Orden global de locks para el camino coordinado: run -> versión de tienda.
  select run.*
  into v_run
  from comparator_internal.catalog_embedding_runs as run
  where run.id = p_run_id
  for update;

  if not found then
    raise exception 'Run inexistente: %', p_run_id;
  end if;
  if not v_run.comparator_impact then
    return null;
  end if;
  if v_run.cache_bumped_at is not null then
    return v_run.settled_generation;
  end if;

  insert into comparator_internal.catalog_match_store_versions as version (
    store,
    generation,
    updated_at
  ) values (
    v_run.store,
    1,
    pg_catalog.now()
  )
  on conflict (store) do update
    set generation = version.generation + 1,
        updated_at = excluded.updated_at
  returning generation into v_generation;

  update comparator_internal.catalog_embedding_runs as run
  set cache_bumped_at = pg_catalog.now(),
      settled_generation = v_generation
  where run.id = p_run_id
    and run.cache_bumped_at is null;

  if not found then
    select run.settled_generation
    into v_generation
    from comparator_internal.catalog_embedding_runs as run
    where run.id = p_run_id;
  end if;

  return v_generation;
end
$function$;

revoke all on function comparator_internal.bump_catalog_match_store_version_for_run(uuid)
  from public, anon, authenticated;
grant execute on function comparator_internal.bump_catalog_match_store_version_for_run(uuid)
  to service_role;

comment on function comparator_internal.bump_catalog_match_store_version_for_run(uuid) is
  'Hace el único bump de tienda de un run con impacto bajo orden run -> versión y lo marca idempotentemente.';

create or replace function comparator_internal.try_settle_catalog_embedding_run(
  p_run_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_run comparator_internal.catalog_embedding_runs%rowtype;
  v_dependency_count integer;
  v_pending_count integer;
  v_completed_count integer;
  v_already_ready_count integer;
  v_superseded_count integer;
  v_terminal_failed_count integer;
begin
  select run.*
  into v_run
  from comparator_internal.catalog_embedding_runs as run
  where run.id = p_run_id
  for update;

  if not found then
    raise exception 'Run inexistente: %', p_run_id;
  end if;
  if v_run.status = 'settled' then
    return true;
  end if;
  if v_run.status <> 'draining' or v_run.dependencies_registered_at is null then
    return false;
  end if;

  select
    pg_catalog.count(*)::integer,
    (pg_catalog.count(*) filter (where link.status = 'pending'))::integer,
    (pg_catalog.count(*) filter (where link.status = 'completed'))::integer,
    (pg_catalog.count(*) filter (where link.status = 'already_ready'))::integer,
    (pg_catalog.count(*) filter (where link.status = 'superseded'))::integer,
    (pg_catalog.count(*) filter (where link.status = 'terminal_failed'))::integer
  into
    v_dependency_count,
    v_pending_count,
    v_completed_count,
    v_already_ready_count,
    v_superseded_count,
    v_terminal_failed_count
  from comparator_internal.catalog_embedding_run_jobs as link
  where link.run_id = p_run_id;

  update comparator_internal.catalog_embedding_runs as run
  set dependency_count = v_dependency_count,
      completed_dependency_count = v_completed_count,
      already_ready_dependency_count = v_already_ready_count,
      superseded_dependency_count = v_superseded_count,
      terminal_failed_dependency_count = v_terminal_failed_count
  where run.id = p_run_id;

  if v_pending_count > 0 then
    return false;
  end if;

  if v_run.comparator_impact then
    perform comparator_internal.bump_catalog_match_store_version_for_run(p_run_id);
  end if;

  update comparator_internal.catalog_embedding_runs as run
  set status = 'settled',
      settled_at = coalesce(run.settled_at, pg_catalog.now()),
      dependency_count = v_dependency_count,
      completed_dependency_count = v_completed_count,
      already_ready_dependency_count = v_already_ready_count,
      superseded_dependency_count = v_superseded_count,
      terminal_failed_dependency_count = v_terminal_failed_count
  where run.id = p_run_id;

  return true;
end
$function$;

revoke all on function comparator_internal.try_settle_catalog_embedding_run(uuid)
  from public, anon, authenticated;
grant execute on function comparator_internal.try_settle_catalog_embedding_run(uuid)
  to service_role;

comment on function comparator_internal.try_settle_catalog_embedding_run(uuid) is
  'Cierra un run draining bajo bloqueo de fila y hace como máximo un bump de generación gracias a cache_bumped_at.';

create or replace function comparator_internal.revalidate_catalog_embedding_run_jobs(
  p_run_ids uuid[] default null,
  p_store text default null,
  p_product_ids text[] default null
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_resolved integer := 0;
  v_run_ids uuid[] := array[]::uuid[];
  v_run_id uuid;
begin
  -- Orden global run -> links. Registro y revalidación toman los mismos locks
  -- para que un cierre concurrente no forme el ciclo run→link / link→run.
  for v_run_id in
    select distinct link.run_id
    from comparator_internal.catalog_embedding_run_jobs as link
    join comparator_internal.catalog_embedding_job_identities as identity
      on identity.id = link.job_identity_id
    where link.status = 'pending'
      and (p_run_ids is null or link.run_id = any (p_run_ids))
      and (p_store is null or identity.store = p_store)
      and (p_product_ids is null or identity.product_id = any (p_product_ids))
    order by link.run_id
  loop
    perform 1
    from comparator_internal.catalog_embedding_runs as run
    where run.id = v_run_id
    for update;
  end loop;

  with classified as (
    select
      link.run_id,
      link.job_identity_id,
      case
        when product.store is null
          or not product.published
          or coalesce(product.embedding_input_hash, product.content_hash)
            is distinct from identity.embedding_input_hash
          then 'superseded'::text
        when product.embedding is not null
          and product.model = identity.model
          and coalesce(
            product.embedded_content_hash,
            product.embedding_input_hash,
            product.content_hash
          ) = identity.embedding_input_hash
          and product.embedded_at <= link.linked_at
          then 'already_ready'::text
        when product.embedding is not null
          and product.model = identity.model
          and coalesce(
            product.embedded_content_hash,
            product.embedding_input_hash,
            product.content_hash
          ) = identity.embedding_input_hash
          then 'completed'::text
        when failure_state.has_terminal_failure then 'terminal_failed'::text
        else 'pending'::text
      end as next_status,
      case
        when product.store is null
          or not product.published
          or coalesce(product.embedding_input_hash, product.content_hash)
            is distinct from identity.embedding_input_hash
          then 'superseded'::text
        when product.embedding is not null
          and product.model = identity.model
          and coalesce(
            product.embedded_content_hash,
            product.embedding_input_hash,
            product.content_hash
          ) = identity.embedding_input_hash
          and product.embedded_at <= link.linked_at
          then 'already_ready'::text
        when product.embedding is not null
          and product.model = identity.model
          and coalesce(
            product.embedded_content_hash,
            product.embedding_input_hash,
            product.content_hash
          ) = identity.embedding_input_hash
          then 'completed'::text
        when failure_state.has_terminal_failure then 'terminal_failed'::text
        when failure_state.has_retryable_failure then 'retryable_failed'::text
        when queued.msg_id is not null then 'queued'::text
        else 'missing'::text
      end as observed_state,
      queued.msg_id as queue_msg_id
    from comparator_internal.catalog_embedding_run_jobs as link
    join comparator_internal.catalog_embedding_job_identities as identity
      on identity.id = link.job_identity_id
    left join public.catalog_product_embeddings as product
      on product.store = identity.store
     and product.product_id = identity.product_id
    left join lateral (
      select pg_catalog.min(job.msg_id) as msg_id
      from pgmq.q_catalog_embedding_jobs as job
      where job.message ->> 'store' = identity.store
        and job.message ->> 'productId' = identity.product_id
        and coalesce(
          job.message ->> 'embeddingInputHash',
          job.message ->> 'contentHash'
        ) = identity.embedding_input_hash
        and coalesce(
          job.message ->> 'model',
          'text-embedding-3-small'
        ) = identity.model
    ) as queued on true
    left join lateral (
      select
        coalesce(
          pg_catalog.bool_or(failure.archived_at is not null),
          false
        ) as has_terminal_failure,
        coalesce(
          pg_catalog.bool_or(failure.archived_at is null),
          false
        ) as has_retryable_failure
      from public.catalog_embedding_failures as failure
      where failure.store = identity.store
        and failure.product_id = identity.product_id
        and failure.content_hash = identity.embedding_input_hash
    ) as failure_state on true
    where link.status = 'pending'
      and (p_run_ids is null or link.run_id = any (p_run_ids))
      and (p_store is null or identity.store = p_store)
      and (p_product_ids is null or identity.product_id = any (p_product_ids))
  ), changed as (
    update comparator_internal.catalog_embedding_run_jobs as link
    set status = classified.next_status,
        resolved_at = case
          when classified.next_status = 'pending' then null
          else pg_catalog.now()
        end,
        last_observed_state = classified.observed_state,
        last_queue_msg_id = classified.queue_msg_id,
        last_observed_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    from classified
    where link.run_id = classified.run_id
      and link.job_identity_id = classified.job_identity_id
      and (
        classified.next_status <> 'pending'
        or link.last_observed_state is distinct from classified.observed_state
        or link.last_queue_msg_id is distinct from classified.queue_msg_id
      )
    returning link.run_id, link.status
  )
  select
    (pg_catalog.count(*) filter (where changed.status <> 'pending'))::integer,
    coalesce(
      pg_catalog.array_agg(distinct changed.run_id)
        filter (where changed.status <> 'pending'),
      array[]::uuid[]
    )
  into v_resolved, v_run_ids
  from changed;

  foreach v_run_id in array v_run_ids
  loop
    perform comparator_internal.try_settle_catalog_embedding_run(v_run_id);
  end loop;

  return v_resolved;
end
$function$;

revoke all on function comparator_internal.revalidate_catalog_embedding_run_jobs(
  uuid[], text, text[]
) from public, anon, authenticated;
grant execute on function comparator_internal.revalidate_catalog_embedding_run_jobs(
  uuid[], text, text[]
) to service_role;

comment on function comparator_internal.revalidate_catalog_embedding_run_jobs(
  uuid[], text, text[]
) is
  'Resuelve dependencias pending contra producto vigente o fallo terminal y prueba el cierre de los runs afectados.';

create or replace function public.catalog_register_embedding_run_jobs(
  p_run_id uuid,
  p_jobs jsonb,
  p_expected_dependency_count integer,
  p_manifest_complete boolean default true
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_run comparator_internal.catalog_embedding_runs%rowtype;
  v_requested integer;
  v_new_links integer := 0;
  v_linked integer;
  v_pending integer;
begin
  if p_jobs is null or pg_catalog.jsonb_typeof(p_jobs) is distinct from 'array' then
    raise exception 'p_jobs debe ser un array JSON' using errcode = '22023';
  end if;
  if p_manifest_complete is null then
    raise exception 'p_manifest_complete es requerido' using errcode = '22023';
  end if;
  if p_expected_dependency_count is null or p_expected_dependency_count < 0 then
    raise exception 'p_expected_dependency_count debe ser no negativo'
      using errcode = '22023';
  end if;

  v_requested := pg_catalog.jsonb_array_length(p_jobs);
  if v_requested > 500 then
    raise exception 'p_jobs admite como máximo 500 identidades' using errcode = '22023';
  end if;

  select run.*
  into v_run
  from comparator_internal.catalog_embedding_runs as run
  where run.id = p_run_id
  for update;

  if not found then
    raise exception 'Run inexistente: %', p_run_id;
  end if;
  if v_run.status <> 'running' then
    raise exception 'El manifiesto del run % no admite cambios en estado %', p_run_id, v_run.status;
  end if;
  if p_expected_dependency_count < v_run.expected_embedding_jobs then
    raise exception 'El manifiesto lógico no puede ser menor que expected_embedding_jobs (% < %)',
      p_expected_dependency_count, v_run.expected_embedding_jobs;
  end if;
  if v_run.expected_dependency_count is not null
    and v_run.expected_dependency_count <> p_expected_dependency_count
  then
    raise exception 'El tamaño lógico del manifiesto cambió para el run % (% <> %)',
      p_run_id, p_expected_dependency_count, v_run.expected_dependency_count;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_jobs) as item(value)
    where pg_catalog.jsonb_typeof(item.value) is distinct from 'object'
      or coalesce(item.value ->> 'store', '') = ''
      or item.value ->> 'store' <> pg_catalog.lower(item.value ->> 'store')
      or coalesce(item.value ->> 'productId', item.value ->> 'product_id', '') = ''
      or coalesce(
        item.value ->> 'embeddingInputHash',
        item.value ->> 'embedding_input_hash',
        ''
      ) !~ '^[0-9a-f]{64}$'
      or coalesce(nullif(item.value ->> 'model', ''), 'text-embedding-3-small')
        <> 'text-embedding-3-small'
  ) then
    raise exception 'p_jobs contiene una identidad inválida' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_jobs) as item(value)
    where item.value ->> 'store' is distinct from v_run.store
  ) then
    raise exception 'Todas las identidades deben pertenecer a la tienda del run'
      using errcode = '22023';
  end if;

  if v_run.dependencies_registered_at is not null and exists (
    with input as (
      select distinct
        item.value ->> 'store' as store,
        coalesce(item.value ->> 'productId', item.value ->> 'product_id') as product_id,
        coalesce(
          item.value ->> 'embeddingInputHash',
          item.value ->> 'embedding_input_hash'
        ) as embedding_input_hash,
        coalesce(nullif(item.value ->> 'model', ''), 'text-embedding-3-small') as model
      from pg_catalog.jsonb_array_elements(p_jobs) as item(value)
    )
    select 1
    from input
    left join comparator_internal.catalog_embedding_job_identities as identity
      on identity.store = input.store
     and identity.product_id = input.product_id
     and identity.embedding_input_hash = input.embedding_input_hash
     and identity.model = input.model
    left join comparator_internal.catalog_embedding_run_jobs as link
      on link.run_id = p_run_id
     and link.job_identity_id = identity.id
    where link.run_id is null
  ) then
    raise exception 'El manifiesto del run % ya está cerrado', p_run_id;
  end if;

  with input as materialized (
    select distinct
      item.value ->> 'store' as store,
      coalesce(item.value ->> 'productId', item.value ->> 'product_id') as product_id,
      coalesce(
        item.value ->> 'embeddingInputHash',
        item.value ->> 'embedding_input_hash'
      ) as embedding_input_hash,
      coalesce(nullif(item.value ->> 'model', ''), 'text-embedding-3-small') as model
    from pg_catalog.jsonb_array_elements(p_jobs) as item(value)
  )
  insert into comparator_internal.catalog_embedding_job_identities as identity (
    store,
    product_id,
    embedding_input_hash,
    model,
    last_linked_at
  )
  select
    input.store,
    input.product_id,
    input.embedding_input_hash,
    input.model,
    pg_catalog.now()
  from input
  order by input.store, input.product_id, input.embedding_input_hash, input.model
  on conflict (store, product_id, embedding_input_hash, model) do update
    set last_linked_at = excluded.last_linked_at;

  with input as materialized (
    select distinct
      item.value ->> 'store' as store,
      coalesce(item.value ->> 'productId', item.value ->> 'product_id') as product_id,
      coalesce(
        item.value ->> 'embeddingInputHash',
        item.value ->> 'embedding_input_hash'
      ) as embedding_input_hash,
      coalesce(nullif(item.value ->> 'model', ''), 'text-embedding-3-small') as model
    from pg_catalog.jsonb_array_elements(p_jobs) as item(value)
  ), inserted as (
    insert into comparator_internal.catalog_embedding_run_jobs (
      run_id,
      job_identity_id
    )
    select p_run_id, identity.id
    from input
    join comparator_internal.catalog_embedding_job_identities as identity
      on identity.store = input.store
     and identity.product_id = input.product_id
     and identity.embedding_input_hash = input.embedding_input_hash
     and identity.model = input.model
    order by identity.id
    on conflict (run_id, job_identity_id) do nothing
    returning 1
  )
  select pg_catalog.count(*)::integer
  into v_new_links
  from inserted;

  select pg_catalog.count(*)::integer
  into v_linked
  from comparator_internal.catalog_embedding_run_jobs as link
  where link.run_id = p_run_id;

  if v_linked > p_expected_dependency_count then
    raise exception 'El manifiesto del run % supera expected_dependency_count (% > %)',
      p_run_id, v_linked, p_expected_dependency_count;
  end if;
  if p_manifest_complete and v_linked <> p_expected_dependency_count then
    raise exception 'El manifiesto del run % está incompleto (% <> %)',
      p_run_id, v_linked, p_expected_dependency_count;
  end if;

  update comparator_internal.catalog_embedding_runs as run
  set expected_dependency_count = coalesce(
        run.expected_dependency_count,
        p_expected_dependency_count
      ),
      dependency_count = v_linked,
      dependencies_registered_at = case
        when p_manifest_complete then coalesce(run.dependencies_registered_at, pg_catalog.now())
        else run.dependencies_registered_at
      end
  where run.id = p_run_id;

  perform comparator_internal.revalidate_catalog_embedding_run_jobs(
    array[p_run_id],
    null,
    null
  );

  select pg_catalog.count(*)::integer
  into v_pending
  from comparator_internal.catalog_embedding_run_jobs as link
  where link.run_id = p_run_id
    and link.status = 'pending';

  return pg_catalog.jsonb_build_object(
    'runId', p_run_id,
    'requestedJobs', v_requested,
    'newlyLinkedJobs', v_new_links,
    'linkedJobs', v_linked,
    'expectedDependencyCount', p_expected_dependency_count,
    'pendingJobs', v_pending,
    'manifestComplete', p_manifest_complete
  );
end
$function$;

revoke all on function public.catalog_register_embedding_run_jobs(uuid, jsonb, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.catalog_register_embedding_run_jobs(uuid, jsonb, integer, boolean)
  to service_role;

comment on function public.catalog_register_embedding_run_jobs(uuid, jsonb, integer, boolean) is
  'Registra por bloques el manifiesto durable de un run. Es idempotente por identidad y solo service_role puede cerrarlo.';

create or replace function public.catalog_revalidate_embedding_runs(
  p_run_ids uuid[] default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_run_id uuid;
  v_resolved integer;
  v_draining integer;
  v_settled integer;
begin
  if p_run_ids is not null and (
    coalesce(pg_catalog.cardinality(p_run_ids), 0) not between 1 and 100
    or pg_catalog.array_position(p_run_ids, null) is not null
  ) then
    raise exception 'p_run_ids debe contener entre 1 y 100 UUID no nulos'
      using errcode = '22023';
  end if;

  v_resolved := comparator_internal.revalidate_catalog_embedding_run_jobs(
    p_run_ids,
    null,
    null
  );

  for v_run_id in
    select run.id
    from comparator_internal.catalog_embedding_runs as run
    where run.status = 'draining'
      and (p_run_ids is null or run.id = any (p_run_ids))
    order by run.id
  loop
    perform comparator_internal.try_settle_catalog_embedding_run(v_run_id);
  end loop;

  select
    pg_catalog.count(*) filter (where run.status = 'draining')::integer,
    pg_catalog.count(*) filter (where run.status = 'settled')::integer
  into v_draining, v_settled
  from comparator_internal.catalog_embedding_runs as run
  where p_run_ids is null or run.id = any (p_run_ids);

  return pg_catalog.jsonb_build_object(
    'resolvedJobs', v_resolved,
    'drainingRuns', v_draining,
    'settledRuns', v_settled
  );
end
$function$;

revoke all on function public.catalog_revalidate_embedding_runs(uuid[])
  from public, anon, authenticated;
grant execute on function public.catalog_revalidate_embedding_runs(uuid[])
  to service_role;

comment on function public.catalog_revalidate_embedding_runs(uuid[]) is
  'Revalidación operativa idempotente para runs concretos o para todos los draining; solo service_role.';

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

  -- Los cambios parciales de un run que falla también deben invalidar el
  -- destino una sola vez. Un run bloqueado por el guardarraíl no escribió nada.
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
  'Cierra la materialización. Los runs correctos esperan dependencias; un fallo con escrituras invalida la tienda una sola vez.';

create or replace function comparator_internal.bump_catalog_match_store_versions_for_statement(
  p_stores text[]
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_bumped integer := 0;
begin
  if coalesce(pg_catalog.cardinality(p_stores), 0) = 0 then
    return 0;
  end if;

  -- Fallback para escrituras administrativas o legacy que no pertenecen a
  -- ningún run con impacto. Se bloquean versiones en orden de tienda y cada
  -- sentencia incrementa como máximo una vez por tienda.
  with requested as materialized (
    select distinct requested.store
    from pg_catalog.unnest(p_stores) as requested(store)
    where requested.store is not null
      and requested.store <> ''
  ), eligible as materialized (
    select requested.store
    from requested
    where not exists (
      select 1
      from comparator_internal.catalog_embedding_runs as run
      where run.store = requested.store
        and run.comparator_impact
        and run.status in ('running', 'draining')
    )
  ), bumped as (
    insert into comparator_internal.catalog_match_store_versions as version (
      store,
      generation,
      updated_at
    )
    select eligible.store, 1, pg_catalog.now()
    from eligible
    order by eligible.store
    on conflict (store) do update
      set generation = version.generation + 1,
          updated_at = excluded.updated_at
    returning 1
  )
  select pg_catalog.count(*)::integer
  into v_bumped
  from bumped;

  return v_bumped;
end
$function$;

revoke all on function comparator_internal.bump_catalog_match_store_versions_for_statement(text[])
  from public, anon, authenticated;
grant execute on function comparator_internal.bump_catalog_match_store_versions_for_statement(text[])
  to service_role;

comment on function comparator_internal.bump_catalog_match_store_versions_for_statement(text[]) is
  'Fallback set-based: una generación por tienda y sentencia solo cuando ningún run activo asumirá la invalidación.';

create or replace function comparator_internal.invalidate_match_cache_after_product_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_stores text[];
begin
  select coalesce(
    pg_catalog.array_agg(distinct changed.store order by changed.store),
    array[]::text[]
  )
  into v_stores
  from phase4_inserted_products as changed;

  perform comparator_internal.bump_catalog_match_store_versions_for_statement(v_stores);
  return null;
end
$function$;

create or replace function comparator_internal.invalidate_match_cache_after_product_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_stores text[];
  v_invalidated bigint;
begin
  with changed as materialized (
    select
      coalesce(new_row.store, old_row.store) as store,
      coalesce(new_row.product_id, old_row.product_id) as product_id
    from phase4_old_products as old_row
    full join phase4_new_products as new_row
      on new_row.store = old_row.store
     and new_row.product_id = old_row.product_id
    where old_row.store is null
      or new_row.store is null
      or old_row.display_name is distinct from new_row.display_name
      or old_row.category_family is distinct from new_row.category_family
      or old_row.canonical_unit is distinct from new_row.canonical_unit
      or old_row.quantity_base is distinct from new_row.quantity_base
      or old_row.global_gtin is distinct from new_row.global_gtin
      or old_row.attributes is distinct from new_row.attributes
      or old_row.match_metadata_hash is distinct from new_row.match_metadata_hash
      or coalesce(old_row.embedding_input_hash, old_row.content_hash)
        is distinct from coalesce(new_row.embedding_input_hash, new_row.content_hash)
      or old_row.content_version is distinct from new_row.content_version
      or old_row.embedded_at is distinct from new_row.embedded_at
      or old_row.model is distinct from new_row.model
      or old_row.published is distinct from new_row.published
  ), invalidated as (
    delete from public.catalog_product_match_cache_status as status
    using changed
    where status.source_store = changed.store
      and status.source_product_id = changed.product_id
    returning 1
  )
  select
    coalesce(
      pg_catalog.array_agg(distinct changed.store order by changed.store),
      array[]::text[]
    ),
    (select pg_catalog.count(*) from invalidated)
  into v_stores, v_invalidated
  from changed;

  perform comparator_internal.bump_catalog_match_store_versions_for_statement(v_stores);
  return null;
end
$function$;

create or replace function comparator_internal.invalidate_match_cache_after_product_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_stores text[];
begin
  -- Las cachés donde el producto era origen desaparecen por la FK ON DELETE
  -- CASCADE; aquí solo queda invalidar su tienda como destino.
  select coalesce(
    pg_catalog.array_agg(distinct changed.store order by changed.store),
    array[]::text[]
  )
  into v_stores
  from phase4_deleted_cache_products as changed;

  perform comparator_internal.bump_catalog_match_store_versions_for_statement(v_stores);
  return null;
end
$function$;

revoke all on function comparator_internal.invalidate_match_cache_after_product_insert()
  from public, anon, authenticated;
revoke all on function comparator_internal.invalidate_match_cache_after_product_update()
  from public, anon, authenticated;
revoke all on function comparator_internal.invalidate_match_cache_after_product_delete()
  from public, anon, authenticated;

drop trigger if exists catalog_product_embeddings_match_cache_insert_delete
  on public.catalog_product_embeddings;
drop trigger if exists catalog_product_embeddings_match_cache_update
  on public.catalog_product_embeddings;
drop trigger if exists catalog_a_match_cache_insert
  on public.catalog_product_embeddings;
drop trigger if exists catalog_a_match_cache_update
  on public.catalog_product_embeddings;
drop trigger if exists catalog_a_match_cache_delete
  on public.catalog_product_embeddings;

-- El prefijo catalog_a_ hace que estos triggers se ejecuten antes de los
-- catalog_embedding_runs_revalidate_* del mismo evento. Así el fallback ve el
-- run todavía running/draining y el settlement conserva el único bump.
create trigger catalog_a_match_cache_insert
after insert on public.catalog_product_embeddings
referencing new table as phase4_inserted_products
for each statement
execute function comparator_internal.invalidate_match_cache_after_product_insert();

create trigger catalog_a_match_cache_update
after update on public.catalog_product_embeddings
referencing old table as phase4_old_products new table as phase4_new_products
for each statement
execute function comparator_internal.invalidate_match_cache_after_product_update();

create trigger catalog_a_match_cache_delete
after delete on public.catalog_product_embeddings
referencing old table as phase4_deleted_cache_products
for each statement
execute function comparator_internal.invalidate_match_cache_after_product_delete();

-- Revalidación set-based después de cualquier lote que modifique productos. No
-- incrementa generaciones: únicamente resuelve dependencias y deja el bump al
-- cierre idempotente del run.
create or replace function comparator_internal.revalidate_embedding_runs_after_product_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_group record;
begin
  for v_group in
    select
      changed.store,
      pg_catalog.array_agg(distinct changed.product_id order by changed.product_id) as product_ids
    from phase4_changed_products as changed
    where exists (
      select 1
      from comparator_internal.catalog_embedding_job_identities as identity
      join comparator_internal.catalog_embedding_run_jobs as link
        on link.job_identity_id = identity.id
       and link.status = 'pending'
      where identity.store = changed.store
        and identity.product_id = changed.product_id
    )
    group by changed.store
    order by changed.store
  loop
    perform comparator_internal.revalidate_catalog_embedding_run_jobs(
      null,
      v_group.store,
      v_group.product_ids
    );
  end loop;
  return null;
end
$function$;

create or replace function comparator_internal.revalidate_embedding_runs_after_product_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_group record;
begin
  for v_group in
    select
      changed.store,
      pg_catalog.array_agg(distinct changed.product_id order by changed.product_id) as product_ids
    from phase4_deleted_products as changed
    where exists (
      select 1
      from comparator_internal.catalog_embedding_job_identities as identity
      join comparator_internal.catalog_embedding_run_jobs as link
        on link.job_identity_id = identity.id
       and link.status = 'pending'
      where identity.store = changed.store
        and identity.product_id = changed.product_id
    )
    group by changed.store
    order by changed.store
  loop
    perform comparator_internal.revalidate_catalog_embedding_run_jobs(
      null,
      v_group.store,
      v_group.product_ids
    );
  end loop;
  return null;
end
$function$;

create or replace function comparator_internal.revalidate_embedding_runs_after_failure_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_group record;
begin
  for v_group in
    select
      changed.store,
      pg_catalog.array_agg(distinct changed.product_id order by changed.product_id) as product_ids
    from phase4_changed_failures as changed
    where exists (
      select 1
      from comparator_internal.catalog_embedding_job_identities as identity
      join comparator_internal.catalog_embedding_run_jobs as link
        on link.job_identity_id = identity.id
       and link.status = 'pending'
      where identity.store = changed.store
        and identity.product_id = changed.product_id
    )
    group by changed.store
    order by changed.store
  loop
    perform comparator_internal.revalidate_catalog_embedding_run_jobs(
      null,
      v_group.store,
      v_group.product_ids
    );
  end loop;
  return null;
end
$function$;

revoke all on function comparator_internal.revalidate_embedding_runs_after_product_update()
  from public, anon, authenticated;
revoke all on function comparator_internal.revalidate_embedding_runs_after_product_delete()
  from public, anon, authenticated;
revoke all on function comparator_internal.revalidate_embedding_runs_after_failure_change()
  from public, anon, authenticated;

drop trigger if exists catalog_embedding_runs_revalidate_after_product_update
  on public.catalog_product_embeddings;
create trigger catalog_embedding_runs_revalidate_after_product_update
after update on public.catalog_product_embeddings
referencing new table as phase4_changed_products
for each statement
execute function comparator_internal.revalidate_embedding_runs_after_product_update();

drop trigger if exists catalog_embedding_runs_revalidate_after_product_delete
  on public.catalog_product_embeddings;
create trigger catalog_embedding_runs_revalidate_after_product_delete
after delete on public.catalog_product_embeddings
referencing old table as phase4_deleted_products
for each statement
execute function comparator_internal.revalidate_embedding_runs_after_product_delete();

drop trigger if exists catalog_embedding_runs_revalidate_after_failure_insert
  on public.catalog_embedding_failures;
create trigger catalog_embedding_runs_revalidate_after_failure_insert
after insert on public.catalog_embedding_failures
referencing new table as phase4_changed_failures
for each statement
execute function comparator_internal.revalidate_embedding_runs_after_failure_change();

drop trigger if exists catalog_embedding_runs_revalidate_after_failure_update
  on public.catalog_embedding_failures;
create trigger catalog_embedding_runs_revalidate_after_failure_update
after update on public.catalog_embedding_failures
referencing new table as phase4_changed_failures
for each statement
execute function comparator_internal.revalidate_embedding_runs_after_failure_change();
