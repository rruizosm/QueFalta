-- Smoke transaccional de Fase 4.
--
-- Valida relación muchos-a-muchos, retryable != terminal, cierre idempotente,
-- invalidación set-based, un único bump por run y fallback por sentencia.
-- No persiste productos, mensajes, fallos, runs ni generaciones.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local role service_role;

do $smoke$
declare
  v_store constant text := 'gadis';
  v_product_id text := '__phase4_run_' || pg_catalog.txid_current()::text;
  v_product_id_2 text := '__phase4_run_batch_' || pg_catalog.txid_current()::text;
  v_hash constant text := repeat('a', 64);
  v_model constant text := 'text-embedding-3-small';
  v_version constant text := 'catalog_embedding_content_v1';
  v_msg_id bigint;
  v_run_with_impact uuid;
  v_run_shared uuid;
  v_run_without_impact uuid;
  v_run_already_ready uuid;
  v_run_metadata uuid;
  v_run_failed uuid;
  v_generation_before bigint;
  v_generation_after bigint;
  v_target_generation bigint;
  v_source_embedded_at timestamptz;
  v_result jsonb;
  v_count integer;
  v_manifest_rejected boolean := false;
  v_null_success_rejected boolean := false;
begin
  if (public.catalog_embedding_pipeline_status() ->> 'mode') is distinct from 'paused' then
    raise exception 'El smoke requiere pipeline paused';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.catalog_register_embedding_run_jobs(uuid,jsonb,integer,boolean)',
    'execute'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.catalog_revalidate_embedding_runs(uuid[])',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.catalog_register_embedding_run_jobs(uuid,jsonb,integer,boolean)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.catalog_revalidate_embedding_runs(uuid[])',
    'execute'
  ) then
    raise exception 'Permisos inesperados en las RPC de settlement';
  end if;

  select version.generation
  into strict v_generation_before
  from comparator_internal.catalog_match_store_versions as version
  where version.store = v_store;

  insert into public.catalog_product_embeddings (
    store,
    product_id,
    display_name,
    content,
    content_hash,
    embedding_input_hash,
    semantic_identity_hash,
    content_version,
    published
  ) values
    (
      v_store,
      v_product_id,
      'Phase 4 durable run',
      'phase 4 durable input',
      v_hash,
      v_hash,
      v_hash,
      v_version,
      true
    ),
    (
      v_store,
      v_product_id_2,
      'Phase 4 statement batch',
      'phase 4 statement batch input',
      v_hash,
      v_hash,
      v_hash,
      v_version,
      true
    );

  select version.generation
  into strict v_generation_after
  from comparator_internal.catalog_match_store_versions as version
  where version.store = v_store;

  if v_generation_after <> v_generation_before + 1 then
    raise exception 'Dos inserts de una sentencia no hicieron un único fallback: % -> %',
      v_generation_before, v_generation_after;
  end if;

  select job.msg_id
  into strict v_msg_id
  from pgmq.q_catalog_embedding_jobs as job
  where job.message ->> 'store' = v_store
    and job.message ->> 'productId' = v_product_id
    and coalesce(
      job.message ->> 'embeddingInputHash',
      job.message ->> 'contentHash'
    ) = v_hash;

  v_result := public.catalog_begin_embedding_run(
    p_store => v_store,
    p_source_products => 1,
    p_existing_products => 0,
    p_new_products => 1,
    p_semantic_changed_products => 0,
    p_metadata_only_products => 0,
    p_republished_products => 0,
    p_repair_products => 0,
    p_unpublished_products => 0,
    p_unchanged_products => 0,
    p_expected_embedding_jobs => 1,
    p_allow_anomaly => true
  );
  v_run_with_impact := (v_result ->> 'runId')::uuid;

  v_result := public.catalog_begin_embedding_run(
    p_store => v_store,
    p_source_products => 1,
    p_existing_products => 1,
    p_new_products => 0,
    p_semantic_changed_products => 0,
    p_metadata_only_products => 0,
    p_republished_products => 0,
    p_repair_products => 0,
    p_unpublished_products => 0,
    p_unchanged_products => 1,
    p_expected_embedding_jobs => 0,
    p_allow_anomaly => false
  );
  v_run_shared := (v_result ->> 'runId')::uuid;

  v_result := public.catalog_begin_embedding_run(
    p_store => v_store,
    p_source_products => 1,
    p_existing_products => 1,
    p_new_products => 0,
    p_semantic_changed_products => 0,
    p_metadata_only_products => 0,
    p_republished_products => 0,
    p_repair_products => 0,
    p_unpublished_products => 0,
    p_unchanged_products => 1,
    p_expected_embedding_jobs => 0,
    p_allow_anomaly => false
  );
  v_run_without_impact := (v_result ->> 'runId')::uuid;

  begin
    perform public.catalog_complete_embedding_run(v_run_without_impact, null, null);
  exception
    when invalid_parameter_value then
      v_null_success_rejected := true;
  end;
  if not v_null_success_rejected then
    raise exception 'catalog_complete_embedding_run aceptó p_success NULL';
  end if;

  select version.generation
  into strict v_generation_before
  from comparator_internal.catalog_match_store_versions as version
  where version.store = v_store;

  perform public.catalog_register_embedding_run_jobs(
    v_run_without_impact,
    '[]'::jsonb,
    0,
    true
  );
  if not public.catalog_complete_embedding_run(v_run_without_impact, true, null) then
    raise exception 'El run sin impacto no devolvió settled=true';
  end if;

  select version.generation
  into strict v_generation_after
  from comparator_internal.catalog_match_store_versions as version
  where version.store = v_store;

  if v_generation_after <> v_generation_before or not exists (
    select 1
    from comparator_internal.catalog_embedding_runs as run
    where run.id = v_run_without_impact
      and run.status = 'settled'
      and not run.comparator_impact
      and run.dependency_count = 0
      and run.cache_bumped_at is null
      and run.settled_generation is null
  ) then
    raise exception 'El run sin dependencias/impacto hizo bump o no cerró';
  end if;

  begin
    perform public.catalog_register_embedding_run_jobs(
      v_run_with_impact,
      '[]'::jsonb,
      1,
      true
    );
  exception
    when raise_exception then
      if pg_catalog.strpos(sqlerrm, 'está incompleto') = 0 then
        raise;
      end if;
      v_manifest_rejected := true;
  end;
  if not v_manifest_rejected then
    raise exception 'El cierre aceptó un manifiesto incompleto';
  end if;

  perform public.catalog_register_embedding_run_jobs(
    v_run_with_impact,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'store', v_store,
      'productId', v_product_id,
      'embeddingInputHash', v_hash,
      'model', v_model
    )),
    1,
    true
  );
  perform public.catalog_register_embedding_run_jobs(
    v_run_shared,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'store', v_store,
      'productId', v_product_id,
      'embeddingInputHash', v_hash,
      'model', v_model
    )),
    1,
    true
  );

  if not public.catalog_complete_embedding_run(v_run_with_impact, true, null) then
    raise exception 'El run con dependencia pendiente no quedó atendido';
  end if;
  if not public.catalog_complete_embedding_run(v_run_shared, true, null) then
    raise exception 'El run observador pendiente no quedó atendido';
  end if;

  if exists (
    select 1
    from comparator_internal.catalog_embedding_runs as run
    where run.id = any (array[v_run_with_impact, v_run_shared])
      and run.status <> 'draining'
  ) then
    raise exception 'Los runs con dependencia activa no quedaron draining';
  end if;

  select pg_catalog.count(*)::integer
  into v_count
  from comparator_internal.catalog_embedding_job_identities as identity
  where identity.store = v_store
    and identity.product_id = v_product_id
    and identity.embedding_input_hash = v_hash
    and identity.model = v_model;
  if v_count <> 1 then
    raise exception 'La identidad durable no se deduplicó: %', v_count;
  end if;

  select pg_catalog.count(*)::integer
  into v_count
  from comparator_internal.catalog_embedding_run_jobs as link
  join comparator_internal.catalog_embedding_job_identities as identity
    on identity.id = link.job_identity_id
  where link.run_id = any (array[v_run_with_impact, v_run_shared])
    and identity.store = v_store
    and identity.product_id = v_product_id
    and link.status = 'pending'
    and link.last_observed_state = 'queued';
  if v_count <> 2 then
    raise exception 'La relación muchos-a-muchos no observó dos dependencias queued: %', v_count;
  end if;

  insert into public.catalog_embedding_failures (
    msg_id,
    store,
    product_id,
    content_hash,
    read_count,
    error_code,
    error_message,
    last_failed_at,
    archived_at
  ) values (
    v_msg_id,
    v_store,
    v_product_id,
    v_hash,
    1,
    'phase4_retryable',
    'Fallo reintentable sintético',
    pg_catalog.now(),
    null
  );

  select pg_catalog.count(*)::integer
  into v_count
  from comparator_internal.catalog_embedding_run_jobs as link
  where link.run_id = any (array[v_run_with_impact, v_run_shared])
    and link.status = 'pending'
    and link.last_observed_state = 'retryable_failed';
  if v_count <> 2 then
    raise exception 'Un fallo reintentable cerró o clasificó mal las dependencias: %', v_count;
  end if;

  select version.generation
  into strict v_generation_before
  from comparator_internal.catalog_match_store_versions as version
  where version.store = v_store;

  update public.catalog_embedding_failures as failure
  set read_count = 20,
      error_code = 'phase4_terminal',
      error_message = 'Fallo terminal sintético',
      last_failed_at = pg_catalog.now(),
      archived_at = pg_catalog.now()
  where failure.msg_id = v_msg_id;

  select version.generation
  into strict v_generation_after
  from comparator_internal.catalog_match_store_versions as version
  where version.store = v_store;

  if v_generation_after <> v_generation_before + 1 then
    raise exception 'Solo el run que creó trabajo debía hacer bump: % -> %',
      v_generation_before, v_generation_after;
  end if;

  if not exists (
    select 1
    from comparator_internal.catalog_embedding_runs as run
    where run.id = v_run_with_impact
      and run.status = 'settled'
      and run.comparator_impact
      and run.cache_bumped_at is not null
      and run.settled_generation between v_generation_before + 1 and v_generation_after
      and run.terminal_failed_dependency_count = 1
  ) then
    raise exception 'El run con impacto no cerró con el fallo terminal';
  end if;

  if not exists (
    select 1
    from comparator_internal.catalog_embedding_runs as run
    where run.id = v_run_shared
      and run.status = 'settled'
      and not run.comparator_impact
      and run.expected_embedding_jobs = 0
      and run.expected_dependency_count = 1
      and run.cache_bumped_at is null
      and run.settled_generation is null
      and run.terminal_failed_dependency_count = 1
  ) then
    raise exception 'El run observador no cerró sin bump';
  end if;

  perform public.catalog_revalidate_embedding_runs(
    array[v_run_with_impact, v_run_shared, v_run_without_impact]
  );
  if not public.catalog_complete_embedding_run(v_run_with_impact, true, null)
    or not public.catalog_complete_embedding_run(v_run_shared, true, null)
    or not public.catalog_complete_embedding_run(v_run_without_impact, true, null)
  then
    raise exception 'Un cierre terminal/idempotente devolvió settled=false';
  end if;

  if (
    select version.generation
    from comparator_internal.catalog_match_store_versions as version
    where version.store = v_store
  ) <> v_generation_after then
    raise exception 'Revalidar o completar de nuevo repitió el bump';
  end if;

  -- Simula la carrera en la que el worker termina entre el plan local y el
  -- registro del manifiesto. La dependencia debe quedar already_ready.
  update public.catalog_product_embeddings as product
  set embedding = array_fill(0::real, array[512])::extensions.vector(512),
      embedded_content_hash = v_hash,
      model = v_model,
      embedded_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where product.store = v_store
    and product.product_id = v_product_id;

  select version.generation
  into strict v_generation_before
  from comparator_internal.catalog_match_store_versions as version
  where version.store = v_store;

  v_result := public.catalog_begin_embedding_run(
    p_store => v_store,
    p_source_products => 1,
    p_existing_products => 1,
    p_new_products => 0,
    p_semantic_changed_products => 0,
    p_metadata_only_products => 0,
    p_republished_products => 0,
    p_repair_products => 1,
    p_unpublished_products => 0,
    p_unchanged_products => 1,
    p_expected_embedding_jobs => 1,
    p_allow_anomaly => true
  );
  v_run_already_ready := (v_result ->> 'runId')::uuid;

  perform public.catalog_register_embedding_run_jobs(
    v_run_already_ready,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'store', v_store,
      'productId', v_product_id,
      'embeddingInputHash', v_hash,
      'model', v_model
    )),
    1,
    true
  );
  if not public.catalog_complete_embedding_run(v_run_already_ready, true, null) then
    raise exception 'El run already_ready no devolvió settled=true';
  end if;

  select version.generation
  into strict v_generation_after
  from comparator_internal.catalog_match_store_versions as version
  where version.store = v_store;

  if v_generation_after <> v_generation_before + 1 or not exists (
    select 1
    from comparator_internal.catalog_embedding_runs as run
    join comparator_internal.catalog_embedding_run_jobs as link
      on link.run_id = run.id
    where run.id = v_run_already_ready
      and run.status = 'settled'
      and run.already_ready_dependency_count = 1
      and link.status = 'already_ready'
  ) then
    raise exception 'La carrera already_ready no cerró con un único bump';
  end if;

  perform public.catalog_revalidate_embedding_runs(array[v_run_already_ready]);
  if not public.catalog_complete_embedding_run(v_run_already_ready, true, null) then
    raise exception 'Repetir el cierre already_ready no devolvió settled=true';
  end if;
  if (
    select version.generation
    from comparator_internal.catalog_match_store_versions as version
    where version.store = v_store
  ) <> v_generation_after then
    raise exception 'Repetir el cierre already_ready duplicó el bump';
  end if;

  -- Un cambio de metadata dentro de un run elimina solo sus cachés como
  -- origen, no incrementa la tienda durante el UPDATE y hace un único bump al
  -- cerrar el run.
  select product.embedded_at
  into strict v_source_embedded_at
  from public.catalog_product_embeddings as product
  where product.store = v_store
    and product.product_id = v_product_id;

  select version.generation
  into strict v_target_generation
  from comparator_internal.catalog_match_store_versions as version
  where version.store = 'mercadona';

  insert into public.catalog_product_match_cache_status (
    source_store,
    source_product_id,
    target_store,
    match_version,
    source_content_hash,
    source_embedded_at,
    target_generation,
    built_at,
    updated_at
  ) values (
    v_store,
    v_product_id,
    'mercadona',
    'phase4_smoke_set_based',
    v_hash,
    v_source_embedded_at,
    v_target_generation,
    pg_catalog.now(),
    pg_catalog.now()
  );

  v_result := public.catalog_begin_embedding_run(
    p_store => v_store,
    p_source_products => 1,
    p_existing_products => 1,
    p_new_products => 0,
    p_semantic_changed_products => 0,
    p_metadata_only_products => 1,
    p_republished_products => 0,
    p_repair_products => 0,
    p_unpublished_products => 0,
    p_unchanged_products => 0,
    p_expected_embedding_jobs => 0,
    p_allow_anomaly => false
  );
  v_run_metadata := (v_result ->> 'runId')::uuid;
  perform public.catalog_register_embedding_run_jobs(
    v_run_metadata,
    '[]'::jsonb,
    0,
    true
  );

  select version.generation
  into strict v_generation_before
  from comparator_internal.catalog_match_store_versions as version
  where version.store = v_store;

  update public.catalog_product_embeddings as product
  set display_name = product.display_name || ' metadata',
      match_metadata_hash = repeat('b', 64),
      updated_at = pg_catalog.now()
  where product.store = v_store
    and product.product_id = v_product_id;

  select version.generation
  into strict v_generation_after
  from comparator_internal.catalog_match_store_versions as version
  where version.store = v_store;

  if v_generation_after <> v_generation_before or exists (
    select 1
    from public.catalog_product_match_cache_status as status
    where status.source_store = v_store
      and status.source_product_id = v_product_id
      and status.match_version = 'phase4_smoke_set_based'
  ) then
    raise exception 'El UPDATE del run hizo bump prematuro o no invalidó la fuente';
  end if;

  if not public.catalog_complete_embedding_run(v_run_metadata, true, null) then
    raise exception 'El run metadata no devolvió settled=true';
  end if;

  select version.generation
  into strict v_generation_after
  from comparator_internal.catalog_match_store_versions as version
  where version.store = v_store;

  if v_generation_after <> v_generation_before + 1 or not exists (
    select 1
    from comparator_internal.catalog_embedding_runs as run
    where run.id = v_run_metadata
      and run.status = 'settled'
      and run.cache_bumped_at is not null
      and run.settled_generation = v_generation_after
  ) then
    raise exception 'El run metadata no cerró con exactamente un bump';
  end if;

  -- Si la materialización falla después de escribir, el fallback sigue
  -- suprimido durante el UPDATE y el camino de error asume el único bump.
  v_result := public.catalog_begin_embedding_run(
    p_store => v_store,
    p_source_products => 1,
    p_existing_products => 1,
    p_new_products => 0,
    p_semantic_changed_products => 0,
    p_metadata_only_products => 1,
    p_republished_products => 0,
    p_repair_products => 0,
    p_unpublished_products => 0,
    p_unchanged_products => 0,
    p_expected_embedding_jobs => 0,
    p_allow_anomaly => false
  );
  v_run_failed := (v_result ->> 'runId')::uuid;
  perform public.catalog_register_embedding_run_jobs(
    v_run_failed,
    '[]'::jsonb,
    0,
    true
  );

  select version.generation
  into strict v_generation_before
  from comparator_internal.catalog_match_store_versions as version
  where version.store = v_store;

  update public.catalog_product_embeddings as product
  set display_name = product.display_name || ' failed',
      match_metadata_hash = repeat('c', 64),
      updated_at = pg_catalog.now()
  where product.store = v_store
    and product.product_id = v_product_id;

  if (
    select version.generation
    from comparator_internal.catalog_match_store_versions as version
    where version.store = v_store
  ) <> v_generation_before then
    raise exception 'El UPDATE del run fallido hizo bump prematuro';
  end if;

  if not public.catalog_complete_embedding_run(
    v_run_failed,
    false,
    'Fallo sintético posterior a escritura'
  ) then
    raise exception 'El cierre fallido no devolvió true';
  end if;

  select version.generation
  into strict v_generation_after
  from comparator_internal.catalog_match_store_versions as version
  where version.store = v_store;

  if v_generation_after <> v_generation_before + 1 or not exists (
    select 1
    from comparator_internal.catalog_embedding_runs as run
    where run.id = v_run_failed
      and run.status = 'failed'
      and run.cache_bumped_at is not null
      and run.settled_generation = v_generation_after
  ) then
    raise exception 'El run fallido no invalidó exactamente una vez';
  end if;

  perform public.catalog_complete_embedding_run(
    v_run_failed,
    false,
    'Repetición idempotente'
  );
  if (
    select version.generation
    from comparator_internal.catalog_match_store_versions as version
    where version.store = v_store
  ) <> v_generation_after then
    raise exception 'Repetir el cierre fallido duplicó el bump';
  end if;

  raise notice 'PHASE_FOUR_DURABLE_SETTLEMENT_SMOKE_OK';
end
$smoke$;

rollback;
