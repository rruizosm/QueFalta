-- Smoke transaccional de la compatibilidad temporal del materializador legacy.
-- No deja productos, jobs, runs ni generaciones persistidos.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local role service_role;

do $smoke$
declare
  v_store constant text := 'gadis';
  v_mismatch_store constant text := 'froiz';
  v_product_id text := '__phase4_legacy_' || pg_catalog.txid_current()::text;
  v_mismatch_product_id text := '__phase4_legacy_mismatch_' || pg_catalog.txid_current()::text;
  v_hash constant text := repeat('d', 64);
  v_model constant text := 'text-embedding-3-small';
  v_version constant text := 'catalog_embedding_content_v1';
  v_result jsonb;
  v_run_id uuid;
  v_mismatch_run_id uuid;
  v_generation_before bigint;
  v_generation_after bigint;
  v_rejected boolean := false;
begin
  if (public.catalog_embedding_pipeline_status() ->> 'mode') is distinct from 'paused' then
    raise exception 'El smoke requiere pipeline paused';
  end if;

  select version.generation
  into strict v_generation_before
  from comparator_internal.catalog_match_store_versions as version
  where version.store = v_store;

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
  v_run_id := (v_result ->> 'runId')::uuid;

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
  ) values (
    v_store,
    v_product_id,
    'Phase 4 legacy compatibility',
    'phase 4 legacy compatibility input',
    v_hash,
    v_hash,
    v_hash,
    v_version,
    true
  );

  if (
    select version.generation
    from comparator_internal.catalog_match_store_versions as version
    where version.store = v_store
  ) <> v_generation_before then
    raise exception 'El insert legacy hizo bump antes del cierre';
  end if;

  if not public.catalog_complete_embedding_run(v_run_id, true, null) then
    raise exception 'El cierre legacy exacto devolvió false';
  end if;

  if not exists (
    select 1
    from comparator_internal.catalog_embedding_runs as run
    join comparator_internal.catalog_embedding_run_jobs as link
      on link.run_id = run.id
    where run.id = v_run_id
      and run.status = 'draining'
      and run.expected_embedding_jobs = 1
      and run.expected_dependency_count = 1
      and run.dependency_count = 1
      and link.status = 'pending'
      and link.last_observed_state = 'queued'
  ) then
    raise exception 'El run legacy no adoptó exactamente su job nuevo';
  end if;

  update public.catalog_product_embeddings as product
  set embedding = array_fill(0::real, array[512])::extensions.vector(512),
      embedded_content_hash = v_hash,
      model = v_model,
      embedded_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where product.store = v_store
    and product.product_id = v_product_id;

  select version.generation
  into strict v_generation_after
  from comparator_internal.catalog_match_store_versions as version
  where version.store = v_store;

  if v_generation_after <> v_generation_before + 1 or not exists (
    select 1
    from comparator_internal.catalog_embedding_runs as run
    where run.id = v_run_id
      and run.status = 'settled'
      and run.completed_dependency_count + run.already_ready_dependency_count = 1
      and run.settled_generation = v_generation_after
  ) then
    raise exception 'El run legacy exacto no cerró con un único bump';
  end if;

  v_result := public.catalog_begin_embedding_run(
    p_store => v_mismatch_store,
    p_source_products => 2,
    p_existing_products => 1,
    p_new_products => 1,
    p_semantic_changed_products => 0,
    p_metadata_only_products => 0,
    p_republished_products => 0,
    p_repair_products => 1,
    p_unpublished_products => 0,
    p_unchanged_products => 1,
    p_expected_embedding_jobs => 2,
    p_allow_anomaly => true
  );
  v_mismatch_run_id := (v_result ->> 'runId')::uuid;

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
  ) values (
    v_mismatch_store,
    v_mismatch_product_id,
    'Phase 4 legacy mismatch',
    'phase 4 legacy mismatch input',
    repeat('e', 64),
    repeat('e', 64),
    repeat('e', 64),
    v_version,
    true
  );

  begin
    perform public.catalog_complete_embedding_run(v_mismatch_run_id, true, null);
  exception
    when raise_exception then
      if pg_catalog.strpos(sqlerrm, 'jobs adoptables no coinciden') = 0 then
        raise;
      end if;
      v_rejected := true;
  end;

  if not v_rejected then
    raise exception 'La compatibilidad legacy aceptó un manifiesto incompleto';
  end if;

  raise notice 'PHASE_FOUR_LEGACY_COMPATIBILITY_SMOKE_OK';
end
$smoke$;

rollback;
