-- Fase 4: evita revalidar el manifiesto completo después de cada chunk.
-- Los bloques intermedios solo registran identidades; la clasificación contra
-- producto, PGMQ y fallos se ejecuta una vez al cerrar el manifiesto.

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
    raise exception 'El ajuste de manifiestos requiere pipeline paused';
  end if;
  if exists (
    select 1
    from pgmq.q_catalog_embedding_jobs as job
    where job.vt > pg_catalog.now()
  ) then
    raise exception 'El ajuste de manifiestos requiere cero jobs en vuelo';
  end if;
end
$checks$;

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

  if p_manifest_complete then
    perform comparator_internal.revalidate_catalog_embedding_run_jobs(
      array[p_run_id],
      null,
      null
    );
  end if;

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
  'Registra manifests en chunks de 500 y revalida una sola vez al cerrar el conjunto completo.';
