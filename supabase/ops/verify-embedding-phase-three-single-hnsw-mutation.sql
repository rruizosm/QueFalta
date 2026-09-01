-- Smoke transaccional de la Fase 3 real: conserva el vector durante un cambio
-- semantico, lo excluye de busqueda y lo sustituye una sola vez por CAS.
-- No persiste productos, jobs, matches ni vectores.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local role service_role;

do $smoke$
declare
  v_source_id text := '__phase3_source_' || pg_catalog.txid_current()::text;
  v_target_id text := '__phase3_target_' || pg_catalog.txid_current()::text;
  v_race_id text := '__phase3_race_' || pg_catalog.txid_current()::text;
  v_hash_a constant text := repeat('a', 64);
  v_hash_b constant text := repeat('b', 64);
  v_hash_c constant text := repeat('c', 64);
  v_model constant text := 'text-embedding-3-small';
  v_version constant text := 'catalog_embedding_content_v1';
  v_vector_a extensions.vector(512) :=
    (array[1::real] || array_fill(0::real, array[511]))::extensions.vector(512);
  v_vector_b extensions.vector(512) :=
    (array[0::real, 1::real] || array_fill(0::real, array[510]))::extensions.vector(512);
  v_vector_b_json jsonb := pg_catalog.to_jsonb(
    array[0::real, 1::real] || array_fill(0::real, array[510])
  );
  v_old_vector text;
  v_old_embedded_at timestamptz;
  v_msg_b bigint;
  v_result jsonb;
begin
  if (public.catalog_embedding_pipeline_status() ->> 'mode') is distinct from 'paused' then
    raise exception 'El smoke requiere pipeline paused';
  end if;

  insert into public.catalog_product_embeddings (
    store, product_id, display_name, canonical_unit, quantity_base, global_gtin,
    content, content_hash, embedding_input_hash, embedded_content_hash,
    semantic_identity_hash, content_version, embedding, model, embedded_at, published
  ) values
    (
      'gadis', v_source_id, 'Phase 3 source', 'ud', 1, 'phase3-smoke-gtin',
      'source A', v_hash_a, v_hash_a, v_hash_a,
      v_hash_a, v_version, v_vector_a, v_model, pg_catalog.now(), true
    ),
    (
      'froiz', v_target_id, 'Phase 3 target', 'ud', 1, 'phase3-smoke-gtin',
      'target A', v_hash_a, v_hash_a, v_hash_a,
      v_hash_a, v_version, v_vector_a, v_model, pg_catalog.now(), true
    ),
    (
      'froiz', v_race_id, 'Phase 3 race', 'ud', 1, null,
      'race A', v_hash_a, v_hash_a, v_hash_a,
      v_hash_a, v_version, v_vector_a, v_model, pg_catalog.now(), true
    );

  if not exists (
    select 1
    from public.catalog_embedding_candidates_v3(
      'gadis', v_source_id, array['froiz'], 20, -1
    ) as candidate
    where candidate.target_product_id = v_target_id
  ) then
    raise exception 'El vector vigente inicial no aparece en candidatos';
  end if;

  select embedding::text, embedded_at
  into strict v_old_vector, v_old_embedded_at
  from public.catalog_product_embeddings
  where store = 'froiz' and product_id = v_target_id;

  update public.catalog_product_embeddings
  set content = 'target B',
      content_hash = v_hash_b,
      embedding_input_hash = v_hash_b,
      semantic_identity_hash = v_hash_b,
      updated_at = pg_catalog.now()
  where store = 'froiz' and product_id = v_target_id;

  if not exists (
    select 1
    from public.catalog_product_embeddings
    where store = 'froiz' and product_id = v_target_id
      and embedding::text = v_old_vector
      and model = v_model
      and embedded_at = v_old_embedded_at
      and embedded_content_hash = v_hash_a
      and embedding_input_hash = v_hash_b
  ) then
    raise exception 'El cambio semantico modifico o perdio el vector anterior';
  end if;

  if exists (
    select 1
    from public.catalog_embedding_candidates_v3(
      'gadis', v_source_id, array['froiz'], 20, -1
    ) as candidate
    where candidate.target_product_id = v_target_id
  ) then
    raise exception 'La busqueda devolvio un vector logicamente pendiente';
  end if;

  select job.msg_id into strict v_msg_b
  from pgmq.q_catalog_embedding_jobs as job
  where job.message ->> 'store' = 'froiz'
    and job.message ->> 'productId' = v_target_id
    and coalesce(job.message ->> 'embeddingInputHash', job.message ->> 'contentHash') = v_hash_b;

  v_result := public.catalog_finalize_embedding_batch(pg_catalog.jsonb_build_object(
    'writes', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'msg_ids', pg_catalog.jsonb_build_array(v_msg_b),
      'store', 'froiz',
      'product_id', v_target_id,
      'embedding_input_hash', v_hash_b,
      'expected_content_hash', v_hash_b,
      'content_version', v_version,
      'model', v_model,
      'embedding', v_vector_b_json
    )),
    'stale_msg_ids', '[]'::jsonb,
    'failure', null
  ));

  if (v_result ->> 'updated_products')::integer <> 1
    or not exists (
      select 1
      from public.catalog_product_embeddings
      where store = 'froiz' and product_id = v_target_id
        and embedding = v_vector_b
        and embedded_content_hash = v_hash_b
        and embedding_input_hash = v_hash_b
    )
  then
    raise exception 'Vector y hash no se sustituyeron juntos: %', v_result;
  end if;

  if not exists (
    select 1
    from public.catalog_embedding_candidates_v3(
      'gadis', v_source_id, array['froiz'], 20, -1
    ) as candidate
    where candidate.target_product_id = v_target_id
  ) then
    raise exception 'El vector finalizado no volvio a estar disponible';
  end if;

  -- Carrera OpenAI: B queda obsoleto antes de finalizar. Debe conservar A y
  -- catalog_delete_embedding_jobs debe garantizar la identidad C.
  update public.catalog_product_embeddings
  set content = 'race B', content_hash = v_hash_b,
      embedding_input_hash = v_hash_b, semantic_identity_hash = v_hash_b,
      updated_at = pg_catalog.now()
  where store = 'froiz' and product_id = v_race_id;

  select job.msg_id into strict v_msg_b
  from pgmq.q_catalog_embedding_jobs as job
  where job.message ->> 'store' = 'froiz'
    and job.message ->> 'productId' = v_race_id
    and coalesce(job.message ->> 'embeddingInputHash', job.message ->> 'contentHash') = v_hash_b;

  update public.catalog_product_embeddings
  set content = 'race C', content_hash = v_hash_c,
      embedding_input_hash = v_hash_c, semantic_identity_hash = v_hash_c,
      updated_at = pg_catalog.now()
  where store = 'froiz' and product_id = v_race_id;

  v_result := public.catalog_finalize_embedding_batch(pg_catalog.jsonb_build_object(
    'writes', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'msg_ids', pg_catalog.jsonb_build_array(v_msg_b),
      'store', 'froiz',
      'product_id', v_race_id,
      'embedding_input_hash', v_hash_b,
      'expected_content_hash', v_hash_b,
      'content_version', v_version,
      'model', v_model,
      'embedding', v_vector_b_json
    )),
    'stale_msg_ids', '[]'::jsonb,
    'failure', null
  ));

  if pg_catalog.jsonb_array_length(v_result -> 'stale_msg_ids') <> 1
    or not exists (
      select 1
      from public.catalog_product_embeddings
      where store = 'froiz' and product_id = v_race_id
        and embedding = v_vector_a
        and embedded_content_hash = v_hash_a
        and embedding_input_hash = v_hash_c
    )
    or not exists (
      select 1
      from pgmq.q_catalog_embedding_jobs as job
      where job.message ->> 'store' = 'froiz'
        and job.message ->> 'productId' = v_race_id
        and coalesce(job.message ->> 'embeddingInputHash', job.message ->> 'contentHash') = v_hash_c
    )
  then
    raise exception 'Un trabajo obsoleto piso el vector o no reparo C: %', v_result;
  end if;

  raise notice 'PHASE_THREE_SINGLE_HNSW_MUTATION_SMOKE_OK';
end
$smoke$;

rollback;
