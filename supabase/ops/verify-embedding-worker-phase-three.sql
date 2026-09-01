-- Smoke transaccional de la Fase 3 del worker. No persiste productos, vectores,
-- mensajes ni fallos. Requiere la migracion desplegada y el pipeline pausado.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local role service_role;

do $smoke$
declare
  v_store constant text := 'gadis';
  v_prefix text := '__phase3_batch_' || pg_catalog.txid_current()::text || '_';
  v_model constant text := 'text-embedding-3-small';
  v_version constant text := 'catalog_embedding_content_v1';
  v_version_2 constant text := 'catalog_embedding_content_v2';
  v_hash_a constant text := repeat('a', 64);
  v_hash_b constant text := repeat('b', 64);
  v_hash_c constant text := repeat('c', 64);
  v_hash_d constant text := repeat('d', 64);
  v_hash_e constant text := repeat('e', 64);
  v_hash_f constant text := repeat('f', 64);
  v_hash_0 constant text := repeat('0', 64);
  v_hash_1 constant text := repeat('1', 64);
  v_hash_2 constant text := repeat('2', 64);
  v_hash_3 constant text := repeat('3', 64);
  v_hash_4 constant text := repeat('4', 64);
  v_hash_9 constant text := repeat('9', 64);
  v_vector jsonb := pg_catalog.to_jsonb(array[1::real] || array_fill(0::real, array[511]));
  v_vector_511 jsonb := pg_catalog.to_jsonb(array[1::real] || array_fill(0::real, array[510]));
  v_msg bigint;
  v_other_msg bigint;
  v_embedded_at timestamptz;
  v_result jsonb;
  v_count integer;
  v_invalid_rejected boolean := false;
  v_identity_rejected boolean := false;
  v_failure_params_rejected boolean := false;
begin
  if (public.catalog_embedding_pipeline_status() ->> 'mode') is distinct from 'paused' then
    raise exception 'El smoke requiere pipeline paused';
  end if;
  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.catalog_finalize_embedding_batch(jsonb)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.catalog_finalize_embedding_batch(jsonb)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.catalog_finalize_embedding_batch(jsonb)',
    'execute'
  ) then
    raise exception 'Los permisos de la RPC batch no son los esperados';
  end if;
  if not pg_catalog.has_table_privilege(
    'service_role', 'pgmq.q_catalog_embedding_jobs', 'select,delete'
  ) or not pg_catalog.has_table_privilege(
    'service_role', 'pgmq.a_catalog_embedding_jobs', 'select,insert'
  ) or pg_catalog.has_table_privilege(
    'anon', 'pgmq.q_catalog_embedding_jobs', 'select,delete'
  ) or pg_catalog.has_table_privilege(
    'authenticated', 'pgmq.a_catalog_embedding_jobs', 'select,insert'
  ) then
    raise exception 'Los permisos internos de PGMQ no son los esperados';
  end if;

  -- Escritura valida y confirmacion atomica de la cola.
  insert into public.catalog_product_embeddings (
    store, product_id, display_name, content, content_hash,
    embedding_input_hash, semantic_identity_hash, content_version, published
  ) values (
    v_store, v_prefix || 'valid', 'Phase 3 valid', 'input A', v_hash_a,
    v_hash_a, v_hash_a, v_version, true
  );
  select job.msg_id into strict v_msg
  from pgmq.q_catalog_embedding_jobs as job
  where job.message ->> 'store' = v_store
    and job.message ->> 'productId' = v_prefix || 'valid';

  v_result := public.catalog_finalize_embedding_batch(pg_catalog.jsonb_build_object(
    'writes', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'msg_ids', pg_catalog.jsonb_build_array(v_msg),
      'store', v_store,
      'product_id', v_prefix || 'valid',
      'embedding_input_hash', v_hash_a,
      'expected_content_hash', v_hash_a,
      'content_version', v_version,
      'model', v_model,
      'embedding', v_vector
    )),
    'stale_msg_ids', '[]'::jsonb,
    'failure', null
  ));
  if (v_result ->> 'updated_products')::integer <> 1
    or pg_catalog.jsonb_array_length(v_result -> 'completed_msg_ids') <> 1
    or exists (select 1 from pgmq.q_catalog_embedding_jobs where msg_id = v_msg)
    or not exists (
      select 1 from public.catalog_product_embeddings
      where store = v_store and product_id = v_prefix || 'valid'
        and embedding is not null and model = v_model
    )
  then
    raise exception 'La escritura valida no se finalizo de forma atomica: %', v_result;
  end if;

  -- Dos productos validos demuestran el UPDATE ... FROM multi-fila.
  insert into public.catalog_product_embeddings (
    store, product_id, display_name, content, content_hash,
    embedding_input_hash, semantic_identity_hash, content_version, published
  ) values
    (v_store, v_prefix || 'multi_1', 'Phase 3 multi 1', 'input multi 1', v_hash_1,
     v_hash_1, v_hash_1, v_version, true),
    (v_store, v_prefix || 'multi_2', 'Phase 3 multi 2', 'input multi 2', v_hash_2,
     v_hash_2, v_hash_2, v_version, true);
  select job.msg_id into strict v_msg
  from pgmq.q_catalog_embedding_jobs as job
  where job.message ->> 'store' = v_store
    and job.message ->> 'productId' = v_prefix || 'multi_1';
  select job.msg_id into strict v_other_msg
  from pgmq.q_catalog_embedding_jobs as job
  where job.message ->> 'store' = v_store
    and job.message ->> 'productId' = v_prefix || 'multi_2';
  v_result := public.catalog_finalize_embedding_batch(pg_catalog.jsonb_build_object(
    'writes', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'msg_ids', pg_catalog.jsonb_build_array(v_msg), 'store', v_store,
        'product_id', v_prefix || 'multi_1', 'embedding_input_hash', v_hash_1,
        'expected_content_hash', v_hash_1, 'content_version', v_version,
        'model', v_model, 'embedding', v_vector
      ),
      pg_catalog.jsonb_build_object(
        'msg_ids', pg_catalog.jsonb_build_array(v_other_msg), 'store', v_store,
        'product_id', v_prefix || 'multi_2', 'embedding_input_hash', v_hash_2,
        'expected_content_hash', v_hash_2, 'content_version', v_version,
        'model', v_model, 'embedding', v_vector
      )
    ),
    'stale_msg_ids', '[]'::jsonb,
    'failure', null
  ));
  if (v_result ->> 'updated_products')::integer <> 2
    or pg_catalog.jsonb_array_length(v_result -> 'completed_msg_ids') <> 2
    or exists (
      select 1 from pgmq.q_catalog_embedding_jobs
      where msg_id in (v_msg, v_other_msg)
    )
    or (
      select pg_catalog.count(*)
      from public.catalog_product_embeddings
      where store = v_store
        and product_id in (v_prefix || 'multi_1', v_prefix || 'multi_2')
        and embedding is not null
    ) <> 2
  then
    raise exception 'El UPDATE batch multi-fila no se completo: %', v_result;
  end if;

  -- Repetir la misma identidad ya lista confirma sin tocar HNSW/embedded_at.
  select embedded_at into strict v_embedded_at
  from public.catalog_product_embeddings
  where store = v_store and product_id = v_prefix || 'valid';
  execute 'reset role';
  select pgmq.send(
    queue_name => 'catalog_embedding_jobs',
    msg => pg_catalog.jsonb_build_object(
      'store', v_store,
      'productId', v_prefix || 'valid',
      'embeddingInputHash', v_hash_a,
      'contentHash', v_hash_a,
      'contentVersion', v_version,
      'model', v_model
    )
  ) into v_msg;
  execute 'set local role service_role';
  v_result := public.catalog_finalize_embedding_batch(pg_catalog.jsonb_build_object(
    'writes', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'msg_ids', pg_catalog.jsonb_build_array(v_msg),
      'store', v_store,
      'product_id', v_prefix || 'valid',
      'embedding_input_hash', v_hash_a,
      'expected_content_hash', v_hash_a,
      'content_version', v_version,
      'model', v_model,
      'embedding', v_vector
    )),
    'stale_msg_ids', '[]'::jsonb,
    'failure', null
  ));
  if (v_result ->> 'updated_products')::integer <> 0
    or (v_result ->> 'already_ready_products')::integer <> 1
    or (select embedded_at from public.catalog_product_embeddings
        where store = v_store and product_id = v_prefix || 'valid')
      is distinct from v_embedded_at
  then
    raise exception 'already_ready reescribio el producto: %', v_result;
  end if;

  -- Hash cambiado durante OpenAI: stale, sin sobrescribir, y queda la identidad C.
  insert into public.catalog_product_embeddings (
    store, product_id, display_name, content, content_hash,
    embedding_input_hash, semantic_identity_hash, content_version, published
  ) values (
    v_store, v_prefix || 'hash_race', 'Phase 3 hash B', 'input B', v_hash_b,
    v_hash_b, v_hash_b, v_version, true
  );
  select job.msg_id into strict v_msg
  from pgmq.q_catalog_embedding_jobs as job
  where job.message ->> 'store' = v_store
    and job.message ->> 'productId' = v_prefix || 'hash_race'
    and coalesce(job.message ->> 'embeddingInputHash', job.message ->> 'contentHash') = v_hash_b;
  update public.catalog_product_embeddings
  set display_name = 'Phase 3 hash C', content = 'input C',
      content_hash = v_hash_c, embedding_input_hash = v_hash_c,
      semantic_identity_hash = v_hash_c, updated_at = pg_catalog.now()
  where store = v_store and product_id = v_prefix || 'hash_race';
  v_result := public.catalog_finalize_embedding_batch(pg_catalog.jsonb_build_object(
    'writes', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'msg_ids', pg_catalog.jsonb_build_array(v_msg),
      'store', v_store,
      'product_id', v_prefix || 'hash_race',
      'embedding_input_hash', v_hash_b,
      'expected_content_hash', v_hash_b,
      'content_version', v_version,
      'model', v_model,
      'embedding', v_vector
    )),
    'stale_msg_ids', '[]'::jsonb,
    'failure', null
  ));
  if pg_catalog.jsonb_array_length(v_result -> 'stale_msg_ids') <> 1
    or exists (
      select 1 from public.catalog_product_embeddings
      where store = v_store and product_id = v_prefix || 'hash_race'
        and embedding is not null
    )
    or (
      select pg_catalog.count(*)
      from pgmq.q_catalog_embedding_jobs as job
      where job.message ->> 'store' = v_store
        and job.message ->> 'productId' = v_prefix || 'hash_race'
        and coalesce(job.message ->> 'embeddingInputHash', job.message ->> 'contentHash') = v_hash_c
    ) <> 1
  then
    raise exception 'La carrera de hash no quedo reparada: %', v_result;
  end if;

  -- La version tambien se revalida y la RPC vuelve a garantizar la vigente.
  insert into public.catalog_product_embeddings (
    store, product_id, display_name, content, content_hash,
    embedding_input_hash, semantic_identity_hash, content_version, published
  ) values (
    v_store, v_prefix || 'version_race', 'Phase 3 version', 'input D', v_hash_d,
    v_hash_d, v_hash_d, v_version, true
  );
  select job.msg_id into strict v_msg
  from pgmq.q_catalog_embedding_jobs as job
  where job.message ->> 'store' = v_store
    and job.message ->> 'productId' = v_prefix || 'version_race';
  update public.catalog_product_embeddings
  set content_version = v_version_2, updated_at = pg_catalog.now()
  where store = v_store and product_id = v_prefix || 'version_race';
  v_result := public.catalog_finalize_embedding_batch(pg_catalog.jsonb_build_object(
    'writes', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'msg_ids', pg_catalog.jsonb_build_array(v_msg),
      'store', v_store,
      'product_id', v_prefix || 'version_race',
      'embedding_input_hash', v_hash_d,
      'expected_content_hash', v_hash_d,
      'content_version', v_version,
      'model', v_model,
      'embedding', v_vector
    )),
    'stale_msg_ids', '[]'::jsonb,
    'failure', null
  ));
  if pg_catalog.jsonb_array_length(v_result -> 'stale_msg_ids') <> 1
    or not exists (
      select 1 from pgmq.q_catalog_embedding_jobs as job
      where job.message ->> 'store' = v_store
        and job.message ->> 'productId' = v_prefix || 'version_race'
        and job.message ->> 'contentVersion' = v_version_2
    )
  then
    raise exception 'La version vigente no se reaseguro: %', v_result;
  end if;

  -- Producto despublicado durante OpenAI: stale, sin vector ni reencolado.
  insert into public.catalog_product_embeddings (
    store, product_id, display_name, content, content_hash,
    embedding_input_hash, semantic_identity_hash, content_version, published
  ) values (
    v_store, v_prefix || 'published_race', 'Phase 3 published', 'input 0', v_hash_0,
    v_hash_0, v_hash_0, v_version, true
  );
  select job.msg_id into strict v_msg
  from pgmq.q_catalog_embedding_jobs as job
  where job.message ->> 'store' = v_store
    and job.message ->> 'productId' = v_prefix || 'published_race';
  update public.catalog_product_embeddings
  set published = false, updated_at = pg_catalog.now()
  where store = v_store and product_id = v_prefix || 'published_race';
  v_result := public.catalog_finalize_embedding_batch(pg_catalog.jsonb_build_object(
    'writes', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'msg_ids', pg_catalog.jsonb_build_array(v_msg),
      'store', v_store,
      'product_id', v_prefix || 'published_race',
      'embedding_input_hash', v_hash_0,
      'expected_content_hash', v_hash_0,
      'content_version', v_version,
      'model', v_model,
      'embedding', v_vector
    )),
    'stale_msg_ids', '[]'::jsonb,
    'failure', null
  ));
  if pg_catalog.jsonb_array_length(v_result -> 'stale_msg_ids') <> 1
    or exists (select 1 from pgmq.q_catalog_embedding_jobs where msg_id = v_msg)
    or exists (
      select 1 from public.catalog_product_embeddings
      where store = v_store and product_id = v_prefix || 'published_race'
        and embedding is not null
    )
    or exists (
      select 1 from pgmq.q_catalog_embedding_jobs as job
      where job.message ->> 'store' = v_store
        and job.message ->> 'productId' = v_prefix || 'published_race'
    )
  then
    raise exception 'La despublicacion concurrente no quedo stale: %', v_result;
  end if;

  -- La identidad declarada debe coincidir con el mensaje o revierte el sublote.
  insert into public.catalog_product_embeddings (
    store, product_id, display_name, content, content_hash,
    embedding_input_hash, semantic_identity_hash, content_version, published
  ) values (
    v_store, v_prefix || 'identity', 'Phase 3 identity', 'input 9', v_hash_9,
    v_hash_9, v_hash_9, v_version, true
  );
  select job.msg_id into strict v_msg
  from pgmq.q_catalog_embedding_jobs as job
  where job.message ->> 'store' = v_store
    and job.message ->> 'productId' = v_prefix || 'identity';
  begin
    perform public.catalog_finalize_embedding_batch(pg_catalog.jsonb_build_object(
      'writes', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'msg_ids', pg_catalog.jsonb_build_array(v_msg),
        'store', v_store,
        'product_id', v_prefix || 'identity_wrong',
        'embedding_input_hash', v_hash_9,
        'expected_content_hash', v_hash_9,
        'content_version', v_version,
        'model', v_model,
        'embedding', v_vector
      )),
      'stale_msg_ids', '[]'::jsonb,
      'failure', null
    ));
  exception
    when sqlstate '22023' then
      v_identity_rejected := true;
  end;
  if not v_identity_rejected
    or not exists (select 1 from pgmq.q_catalog_embedding_jobs where msg_id = v_msg)
    or exists (
      select 1 from public.catalog_product_embeddings
      where store = v_store and product_id = v_prefix || 'identity'
        and embedding is not null
    )
  then
    raise exception 'La identidad de cola incorrecta no revirtio el sublote';
  end if;

  -- max_attempts nulo no puede crear un fallo que nunca llegue a terminal.
  begin
    perform public.catalog_finalize_embedding_batch(pg_catalog.jsonb_build_object(
      'writes', '[]'::jsonb,
      'stale_msg_ids', '[]'::jsonb,
      'failure', pg_catalog.jsonb_build_object(
        'jobs', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'msg_id', v_msg, 'read_count', 1, 'store', v_store,
          'product_id', v_prefix || 'identity', 'embedding_input_hash', v_hash_9,
          'content_version', v_version, 'model', v_model
        )),
        'code', 'phase_three_invalid_failure',
        'message', 'invalid failure smoke',
        'max_attempts', null
      )
    ));
  exception
    when sqlstate '22023' then
      v_failure_params_rejected := true;
  end;
  if not v_failure_params_rejected
    or not exists (select 1 from pgmq.q_catalog_embedding_jobs where msg_id = v_msg)
    or exists (select 1 from public.catalog_embedding_failures where msg_id = v_msg)
  then
    raise exception 'failure.max_attempts nulo no fue rechazado atomicamente';
  end if;

  -- Fallo reintentable: una sola llamada audita y mantiene el job en cola.
  insert into public.catalog_product_embeddings (
    store, product_id, display_name, content, content_hash,
    embedding_input_hash, semantic_identity_hash, content_version, published
  ) values
    (v_store, v_prefix || 'retry', 'Phase 3 retry', 'input E', v_hash_e,
     v_hash_e, v_hash_e, v_version, true),
    (v_store, v_prefix || 'retry_2', 'Phase 3 retry 2', 'input E2', v_hash_e,
     v_hash_e, v_hash_e, v_version, true);
  select job.msg_id into strict v_msg
  from pgmq.q_catalog_embedding_jobs as job
  where job.message ->> 'store' = v_store
    and job.message ->> 'productId' = v_prefix || 'retry';
  select job.msg_id into strict v_other_msg
  from pgmq.q_catalog_embedding_jobs as job
  where job.message ->> 'store' = v_store
    and job.message ->> 'productId' = v_prefix || 'retry_2';
  v_result := public.catalog_finalize_embedding_batch(pg_catalog.jsonb_build_object(
    'writes', '[]'::jsonb,
    'stale_msg_ids', '[]'::jsonb,
    'failure', pg_catalog.jsonb_build_object(
      'jobs', pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'msg_id', v_msg, 'read_count', 1, 'store', v_store,
          'product_id', v_prefix || 'retry', 'embedding_input_hash', v_hash_e,
          'content_version', v_version, 'model', v_model
        ),
        pg_catalog.jsonb_build_object(
          'msg_id', v_other_msg, 'read_count', 1, 'store', v_store,
          'product_id', v_prefix || 'retry_2', 'embedding_input_hash', v_hash_e,
          'content_version', v_version, 'model', v_model
        )
      ),
      'code', 'phase_three_retry', 'message', 'retry smoke', 'max_attempts', 5
    )
  ));
  if pg_catalog.jsonb_array_length(v_result -> 'failed_msg_ids') <> 2
    or (
      select pg_catalog.count(*) from pgmq.q_catalog_embedding_jobs
      where msg_id in (v_msg, v_other_msg)
    ) <> 2
    or (
      select pg_catalog.count(*)
      from public.catalog_embedding_failures
      where msg_id in (v_msg, v_other_msg) and archived_at is null and read_count = 1
    ) <> 2
    or not exists (
      select 1 from public.catalog_embedding_failures
      where msg_id = v_msg and archived_at is null and read_count = 1
    )
  then
    raise exception 'El fallo reintentable no quedo auditado: %', v_result;
  end if;

  -- Fallo terminal: se registra y se archiva dentro de la misma transaccion.
  insert into public.catalog_product_embeddings (
    store, product_id, display_name, content, content_hash,
    embedding_input_hash, semantic_identity_hash, content_version, published
  ) values (
    v_store, v_prefix || 'terminal', 'Phase 3 terminal', 'input F', v_hash_f,
    v_hash_f, v_hash_f, v_version, true
  );
  select job.msg_id into strict v_msg
  from pgmq.q_catalog_embedding_jobs as job
  where job.message ->> 'store' = v_store
    and job.message ->> 'productId' = v_prefix || 'terminal';
  v_result := public.catalog_finalize_embedding_batch(pg_catalog.jsonb_build_object(
    'writes', '[]'::jsonb,
    'stale_msg_ids', '[]'::jsonb,
    'failure', pg_catalog.jsonb_build_object(
      'jobs', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'msg_id', v_msg, 'read_count', 20, 'store', v_store,
        'product_id', v_prefix || 'terminal', 'embedding_input_hash', v_hash_f,
        'content_version', v_version, 'model', v_model
      )),
      'code', 'credit_balance_exhausted', 'message', 'terminal smoke', 'max_attempts', 20
    )
  ));
  if pg_catalog.jsonb_array_length(v_result -> 'archived_msg_ids') <> 1
    or exists (select 1 from pgmq.q_catalog_embedding_jobs where msg_id = v_msg)
    or not exists (
      select 1 from public.catalog_embedding_failures
      where msg_id = v_msg and archived_at is not null
    )
  then
    raise exception 'El fallo terminal no se archivo: %', v_result;
  end if;

  -- Un vector invalido hace rollback de todo el sublote antes de tocar HNSW.
  insert into public.catalog_product_embeddings (
    store, product_id, display_name, content, content_hash,
    embedding_input_hash, semantic_identity_hash, content_version, published
  ) values
    (v_store, v_prefix || 'atomic_1', 'Phase 3 atomic 1', 'input 1', v_hash_1,
     v_hash_1, v_hash_1, v_version, true),
    (v_store, v_prefix || 'atomic_2', 'Phase 3 atomic 2', 'input 2', v_hash_2,
     v_hash_2, v_hash_2, v_version, true);
  select job.msg_id into strict v_msg
  from pgmq.q_catalog_embedding_jobs as job
  where job.message ->> 'store' = v_store
    and job.message ->> 'productId' = v_prefix || 'atomic_1';
  select job.msg_id into strict v_other_msg
  from pgmq.q_catalog_embedding_jobs as job
  where job.message ->> 'store' = v_store
    and job.message ->> 'productId' = v_prefix || 'atomic_2';
  begin
    perform public.catalog_finalize_embedding_batch(pg_catalog.jsonb_build_object(
      'writes', pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'msg_ids', pg_catalog.jsonb_build_array(v_msg), 'store', v_store,
          'product_id', v_prefix || 'atomic_1', 'embedding_input_hash', v_hash_1,
          'expected_content_hash', v_hash_1, 'content_version', v_version,
          'model', v_model, 'embedding', v_vector
        ),
        pg_catalog.jsonb_build_object(
          'msg_ids', pg_catalog.jsonb_build_array(v_other_msg), 'store', v_store,
          'product_id', v_prefix || 'atomic_2', 'embedding_input_hash', v_hash_2,
          'expected_content_hash', v_hash_2, 'content_version', v_version,
          'model', v_model, 'embedding', v_vector_511
        )
      ),
      'stale_msg_ids', '[]'::jsonb,
      'failure', null
    ));
  exception
    when sqlstate '22023' then
      v_invalid_rejected := true;
  end;
  select pg_catalog.count(*)::integer into v_count
  from public.catalog_product_embeddings
  where store = v_store
    and product_id in (v_prefix || 'atomic_1', v_prefix || 'atomic_2')
    and embedding is not null;
  if not v_invalid_rejected or v_count <> 0
    or not exists (select 1 from pgmq.q_catalog_embedding_jobs where msg_id = v_msg)
    or not exists (select 1 from pgmq.q_catalog_embedding_jobs where msg_id = v_other_msg)
  then
    raise exception 'El sublote invalido no fue atomico';
  end if;

  -- stale detectado antes de OpenAI usa la misma finalizadora y repara A-B-A.
  insert into public.catalog_product_embeddings (
    store, product_id, display_name, content, content_hash,
    embedding_input_hash, semantic_identity_hash, content_version, published
  ) values (
    v_store, v_prefix || 'pre_stale', 'Phase 3 pre stale', 'input 3', v_hash_3,
    v_hash_3, v_hash_3, v_version, true
  );
  select job.msg_id into strict v_msg
  from pgmq.q_catalog_embedding_jobs as job
  where job.message ->> 'store' = v_store
    and job.message ->> 'productId' = v_prefix || 'pre_stale';
  update public.catalog_product_embeddings
  set display_name = 'Phase 3 pre stale 4', content = 'input 4',
      content_hash = v_hash_4, embedding_input_hash = v_hash_4,
      semantic_identity_hash = v_hash_4, updated_at = pg_catalog.now()
  where store = v_store and product_id = v_prefix || 'pre_stale';
  v_result := public.catalog_finalize_embedding_batch(pg_catalog.jsonb_build_object(
    'writes', '[]'::jsonb,
    'stale_msg_ids', pg_catalog.jsonb_build_array(v_msg),
    'failure', null
  ));
  if pg_catalog.jsonb_array_length(v_result -> 'stale_msg_ids') <> 1
    or not exists (
      select 1 from pgmq.q_catalog_embedding_jobs as job
      where job.message ->> 'store' = v_store
        and job.message ->> 'productId' = v_prefix || 'pre_stale'
        and coalesce(job.message ->> 'embeddingInputHash', job.message ->> 'contentHash') = v_hash_4
    )
  then
    raise exception 'La confirmacion stale no preservo la identidad vigente: %', v_result;
  end if;

  raise notice 'PHASE_THREE_BATCH_WRITE_SMOKE_OK prefix=%', v_prefix;
end
$smoke$;

rollback;
