-- Smoke transaccional de Fase 1. No persiste productos, jobs ni fallos.
-- Requiere ejecutar la migración y mantener el pipeline en paused.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $smoke$
declare
  v_store constant text := 'gadis';
  v_product_id text := '__phase1_smoke_' || pg_catalog.txid_current()::text;
  v_model constant text := 'text-embedding-3-small';
  v_hash_a constant text := repeat('a', 64);
  v_hash_b constant text := repeat('b', 64);
  v_semantic_a constant text := repeat('c', 64);
  v_semantic_b constant text := repeat('d', 64);
  v_msg_a bigint;
  v_replacement_a bigint;
  v_count integer;
  v_deleted bigint[];
  v_snapshot jsonb;
  v_archived boolean;
begin
  if (select control.mode
      from comparator_internal.catalog_embedding_pipeline_control as control
      where control.singleton) is distinct from 'paused' then
    raise exception 'El smoke requiere pipeline paused';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.catalog_ensure_embedding_jobs(jsonb)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.catalog_ensure_embedding_jobs(jsonb)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.catalog_active_embedding_job_identities(text)',
    'execute'
  ) then
    raise exception 'Los permisos de las RPC de Fase 1 no son los esperados';
  end if;

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
    'Phase 1 smoke A',
    'input A',
    v_hash_a,
    v_hash_a,
    v_semantic_a,
    'catalog_embedding_content_v1',
    true
  );

  select job.msg_id
  into strict v_msg_a
  from pgmq.q_catalog_embedding_jobs as job
  where job.message ->> 'store' = v_store
    and job.message ->> 'productId' = v_product_id
    and coalesce(
      job.message ->> 'embeddingInputHash',
      job.message ->> 'contentHash'
    ) = v_hash_a;

  if comparator_internal.ensure_catalog_embedding_job(
    v_store, v_product_id, v_hash_a, v_model
  ) then
    raise exception 'ensure duplicó la identidad A';
  end if;

  update pgmq.q_catalog_embedding_jobs
  set vt = now() + interval '5 minutes'
  where msg_id = v_msg_a;

  if comparator_internal.ensure_catalog_embedding_job(
    v_store, v_product_id, v_hash_a, v_model
  ) then
    raise exception 'ensure duplicó un job invisible';
  end if;

  if comparator_internal.ensure_catalog_embedding_job(
    v_store, v_product_id, v_hash_b, v_model
  ) then
    raise exception 'Un expected hash obsoleto creó trabajo';
  end if;

  update public.catalog_product_embeddings
  set display_name = 'Phase 1 smoke B',
      content = 'input B',
      content_hash = v_hash_b,
      embedding_input_hash = v_hash_b,
      semantic_identity_hash = v_semantic_b,
      updated_at = now()
  where store = v_store
    and product_id = v_product_id;

  update public.catalog_product_embeddings
  set display_name = 'Phase 1 smoke A',
      content = 'input A',
      content_hash = v_hash_a,
      embedding_input_hash = v_hash_a,
      semantic_identity_hash = v_semantic_a,
      updated_at = now()
  where store = v_store
    and product_id = v_product_id;

  select count(*)::integer
  into v_count
  from pgmq.q_catalog_embedding_jobs as job
  where job.message ->> 'store' = v_store
    and job.message ->> 'productId' = v_product_id;

  if v_count <> 2 then
    raise exception 'A→B→A debía dejar dos identidades, dejó %', v_count;
  end if;

  v_deleted := public.catalog_delete_embedding_jobs(array[v_msg_a]);
  if not (v_msg_a = any(v_deleted)) then
    raise exception 'No se eliminó el A obsoleto';
  end if;

  select job.msg_id
  into strict v_replacement_a
  from pgmq.q_catalog_embedding_jobs as job
  where job.message ->> 'store' = v_store
    and job.message ->> 'productId' = v_product_id
    and coalesce(
      job.message ->> 'embeddingInputHash',
      job.message ->> 'contentHash'
    ) = v_hash_a;

  if v_replacement_a = v_msg_a then
    raise exception 'A→B→A no recreó la identidad vigente';
  end if;

  v_snapshot := public.catalog_active_embedding_job_identities(v_store);
  if not exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_snapshot -> 'jobs') as item(value)
    where item.value ->> 'product_id' = v_product_id
      and item.value ->> 'embedding_input_hash' = v_hash_a
      and item.value ->> 'suppression_state' = 'active'
  ) then
    raise exception 'El snapshot no contiene la identidad A vigente';
  end if;

  update public.catalog_product_embeddings
  set embedding = array_fill(0::real, array[512])::extensions.vector,
      model = v_model,
      embedded_at = now(),
      updated_at = now()
  where store = v_store
    and product_id = v_product_id;

  select public.catalog_delete_embedding_jobs(
    coalesce(array_agg(job.msg_id), array[]::bigint[])
  )
  into v_deleted
  from pgmq.q_catalog_embedding_jobs as job
  where job.message ->> 'store' = v_store
    and job.message ->> 'productId' = v_product_id;

  if exists (
    select 1
    from pgmq.q_catalog_embedding_jobs as job
    where job.message ->> 'store' = v_store
      and job.message ->> 'productId' = v_product_id
  ) then
    raise exception 'Un vector vigente volvió a encolarse';
  end if;

  update public.catalog_product_embeddings
  set embedding = null,
      model = null,
      embedded_at = null,
      semantic_identity_hash = repeat('e', 64),
      updated_at = now()
  where store = v_store
    and product_id = v_product_id;

  select job.msg_id
  into strict v_replacement_a
  from pgmq.q_catalog_embedding_jobs as job
  where job.message ->> 'store' = v_store
    and job.message ->> 'productId' = v_product_id
    and coalesce(
      job.message ->> 'embeddingInputHash',
      job.message ->> 'contentHash'
    ) = v_hash_a;

  select public.catalog_fail_embedding_job(
    p_msg_id => v_replacement_a,
    p_store => v_store,
    p_product_id => v_product_id,
    p_content_hash => v_hash_a,
    p_read_count => 5,
    p_error_code => 'phase_one_smoke',
    p_error_message => 'terminal smoke',
    p_max_attempts => 5
  )
  into v_archived;

  if not v_archived or comparator_internal.ensure_catalog_embedding_job(
    v_store, v_product_id, v_hash_a, v_model
  ) then
    raise exception 'El fallo terminal no suprimió el reintento';
  end if;

  v_snapshot := public.catalog_active_embedding_job_identities(v_store);
  if not exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_snapshot -> 'jobs') as item(value)
    where item.value ->> 'product_id' = v_product_id
      and item.value ->> 'embedding_input_hash' = v_hash_a
      and item.value ->> 'suppression_state' = 'terminal_failure'
  ) then
    raise exception 'El snapshot no contiene el fallo terminal';
  end if;

  raise notice 'PHASE_ONE_SMOKE_OK product_id=%', v_product_id;
end
$smoke$;

rollback;
