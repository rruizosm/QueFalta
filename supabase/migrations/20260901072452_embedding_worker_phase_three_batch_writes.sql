-- Hardening batch preparatorio del pipeline de embeddings: finalizacion por lotes.
--
-- El worker genera fuera de la transaccion y entrega como maximo 25 vectores
-- por llamada. Esta RPC vuelve a comprobar el estado actual, escribe con una
-- sola sentencia UPDATE ... FROM y confirma los mensajes PGMQ en la misma
-- transaccion. Los fallos tambien se registran por lote, sin N RPC paralelas.

set lock_timeout = '5s';
set statement_timeout = '60s';

do $checks$
begin
  if to_regclass('public.catalog_product_embeddings') is null then
    raise exception 'Falta public.catalog_product_embeddings';
  end if;
  if to_regclass('public.catalog_embedding_failures') is null then
    raise exception 'Falta public.catalog_embedding_failures';
  end if;
  if to_regclass('pgmq.q_catalog_embedding_jobs') is null then
    raise exception 'Falta la cola pgmq catalog_embedding_jobs';
  end if;
  if to_regclass('pgmq.a_catalog_embedding_jobs') is null then
    raise exception 'Falta el archivo pgmq catalog_embedding_jobs';
  end if;
  if to_regprocedure('public.catalog_delete_embedding_jobs(bigint[])') is null then
    raise exception 'Falta public.catalog_delete_embedding_jobs(bigint[])';
  end if;
  if not exists (
    select 1
    from comparator_internal.catalog_embedding_pipeline_control as control
    where control.singleton
      and control.mode = 'paused'
  ) then
    raise exception 'Fase 3 requiere el pipeline pausado';
  end if;
  if exists (
    select 1
    from pgmq.q_catalog_embedding_jobs as job
    where job.vt > pg_catalog.now()
  ) then
    raise exception 'Fase 3 requiere cero trabajos en vuelo';
  end if;
end
$checks$;

-- La sobrecarga de array evita un bucle de llamadas SQL al archivar un lote
-- terminal. Las tablas fisicas de la cola ya tienen los grants minimos de la
-- migracion base del pipeline.
revoke all on function pgmq.archive(text, bigint[])
  from public, anon, authenticated;
grant execute on function pgmq.archive(text, bigint[]) to service_role;
revoke all on table pgmq.q_catalog_embedding_jobs
  from public, anon, authenticated;
revoke all on table pgmq.a_catalog_embedding_jobs
  from public, anon, authenticated;
grant select, delete on table pgmq.q_catalog_embedding_jobs to service_role;
grant select, insert on table pgmq.a_catalog_embedding_jobs to service_role;

create or replace function public.catalog_finalize_embedding_batch(
  p_batch jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_writes jsonb;
  v_stale_json jsonb;
  v_failure jsonb;
  v_failure_jobs jsonb;
  v_error_code text;
  v_error_message text;
  v_max_attempts integer;
  v_write_items integer;
  v_write_msg_ids bigint[] := array[]::bigint[];
  v_stale_msg_ids bigint[] := array[]::bigint[];
  v_failure_msg_ids bigint[] := array[]::bigint[];
  v_all_msg_ids bigint[] := array[]::bigint[];
  v_write_completed_ids bigint[] := array[]::bigint[];
  v_write_stale_ids bigint[] := array[]::bigint[];
  v_failure_stale_ids bigint[] := array[]::bigint[];
  v_failed_ids bigint[] := array[]::bigint[];
  v_archived_ids bigint[] := array[]::bigint[];
  v_archive_requested_ids bigint[] := array[]::bigint[];
  v_confirm_ids bigint[] := array[]::bigint[];
  v_deleted_ids bigint[] := array[]::bigint[];
  v_updated_products integer := 0;
  v_already_ready_products integer := 0;
  v_target record;
begin
  if p_batch is null or pg_catalog.jsonb_typeof(p_batch) is distinct from 'object' then
    raise exception 'p_batch debe ser un objeto JSON' using errcode = '22023';
  end if;

  v_writes := coalesce(p_batch -> 'writes', '[]'::jsonb);
  v_stale_json := coalesce(p_batch -> 'stale_msg_ids', '[]'::jsonb);
  v_failure := p_batch -> 'failure';

  if pg_catalog.jsonb_typeof(v_writes) is distinct from 'array' then
    raise exception 'writes debe ser un array JSON' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(v_stale_json) is distinct from 'array' then
    raise exception 'stale_msg_ids debe ser un array JSON' using errcode = '22023';
  end if;

  v_write_items := pg_catalog.jsonb_array_length(v_writes);
  if v_write_items > 25 then
    raise exception 'writes admite como maximo 25 productos' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(v_writes) as write_item(
      msg_ids jsonb,
      store text,
      product_id text,
      embedding_input_hash text,
      expected_content_hash text,
      content_version text,
      model text,
      embedding jsonb
    )
    where pg_catalog.jsonb_typeof(write_item.msg_ids) is distinct from 'array'
      or case
        when pg_catalog.jsonb_typeof(write_item.msg_ids) = 'array'
          then not (pg_catalog.jsonb_array_length(write_item.msg_ids) between 1 and 200)
        else true
      end
      or coalesce(write_item.store, '') = ''
      or write_item.store <> pg_catalog.lower(write_item.store)
      or coalesce(write_item.product_id, '') = ''
      or write_item.embedding_input_hash !~ '^[0-9a-f]{64}$'
      or write_item.expected_content_hash !~ '^[0-9a-f]{64}$'
      or coalesce(write_item.content_version, '') = ''
      or write_item.model is distinct from 'text-embedding-3-small'
      or pg_catalog.jsonb_typeof(write_item.embedding) is distinct from 'array'
      or case
        when pg_catalog.jsonb_typeof(write_item.embedding) = 'array'
          then pg_catalog.jsonb_array_length(write_item.embedding) <> 512
        else true
      end
      or case
        when pg_catalog.jsonb_typeof(write_item.embedding) = 'array'
          then exists (
            select 1
            from pg_catalog.jsonb_array_elements(write_item.embedding) as component(value)
            where pg_catalog.jsonb_typeof(component.value) is distinct from 'number'
          )
        else true
      end
  ) then
    raise exception 'writes contiene un producto invalido' using errcode = '22023';
  end if;

  if (
    select pg_catalog.count(*) <> pg_catalog.count(distinct (item.store, item.product_id))
    from pg_catalog.jsonb_to_recordset(v_writes) as item(
      msg_ids jsonb,
      store text,
      product_id text,
      embedding_input_hash text,
      expected_content_hash text,
      content_version text,
      model text,
      embedding jsonb
    )
  ) then
    raise exception 'writes contiene productos duplicados' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(v_writes) as write_item(
      msg_ids jsonb,
      store text,
      product_id text,
      embedding_input_hash text,
      expected_content_hash text,
      content_version text,
      model text,
      embedding jsonb
    )
    cross join lateral pg_catalog.jsonb_array_elements_text(write_item.msg_ids) as msg(value)
    where msg.value !~ '^[1-9][0-9]{0,18}$'
  ) then
    raise exception 'writes contiene msg_ids invalidos' using errcode = '22023';
  end if;

  select coalesce(pg_catalog.array_agg(msg.value::bigint order by msg.value::bigint), array[]::bigint[])
  into v_write_msg_ids
  from pg_catalog.jsonb_to_recordset(v_writes) as write_item(
    msg_ids jsonb,
    store text,
    product_id text,
    embedding_input_hash text,
    expected_content_hash text,
    content_version text,
    model text,
    embedding jsonb
  )
  cross join lateral pg_catalog.jsonb_array_elements_text(write_item.msg_ids) as msg(value);

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements_text(v_stale_json) as msg(value)
    where msg.value !~ '^[1-9][0-9]{0,18}$'
  ) then
    raise exception 'stale_msg_ids contiene valores invalidos' using errcode = '22023';
  end if;

  select coalesce(pg_catalog.array_agg(msg.value::bigint order by msg.value::bigint), array[]::bigint[])
  into v_stale_msg_ids
  from pg_catalog.jsonb_array_elements_text(v_stale_json) as msg(value);

  if v_failure is null or pg_catalog.jsonb_typeof(v_failure) = 'null' then
    v_failure_jobs := '[]'::jsonb;
    v_error_code := null;
    v_error_message := null;
    v_max_attempts := null;
  else
    if pg_catalog.jsonb_typeof(v_failure) is distinct from 'object' then
      raise exception 'failure debe ser un objeto JSON o null' using errcode = '22023';
    end if;
    v_failure_jobs := coalesce(v_failure -> 'jobs', '[]'::jsonb);
    v_error_code := nullif(pg_catalog.left(coalesce(v_failure ->> 'code', ''), 100), '');
    v_error_message := nullif(pg_catalog.left(coalesce(v_failure ->> 'message', ''), 1000), '');
    begin
      v_max_attempts := (v_failure ->> 'max_attempts')::integer;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'failure.max_attempts invalido' using errcode = '22023';
    end;

    if pg_catalog.jsonb_typeof(v_failure_jobs) is distinct from 'array'
      or pg_catalog.jsonb_array_length(v_failure_jobs) = 0
      or v_error_code is null
      or v_error_message is null
      or v_max_attempts is null
      or v_max_attempts not between 1 and 20
    then
      raise exception 'failure contiene parametros invalidos' using errcode = '22023';
    end if;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(v_failure_jobs) as failure_job(
      msg_id bigint,
      read_count integer,
      store text,
      product_id text,
      embedding_input_hash text,
      content_version text,
      model text
    )
    where failure_job.msg_id is null or failure_job.msg_id < 1
      or failure_job.read_count is null or failure_job.read_count < 1
      or coalesce(failure_job.store, '') = ''
      or failure_job.store <> pg_catalog.lower(failure_job.store)
      or coalesce(failure_job.product_id, '') = ''
      or failure_job.embedding_input_hash !~ '^[0-9a-f]{64}$'
      or coalesce(failure_job.content_version, '') = ''
      or failure_job.model is distinct from 'text-embedding-3-small'
  ) then
    raise exception 'failure.jobs contiene un trabajo invalido' using errcode = '22023';
  end if;

  select coalesce(pg_catalog.array_agg(failure_job.msg_id order by failure_job.msg_id), array[]::bigint[])
  into v_failure_msg_ids
  from pg_catalog.jsonb_to_recordset(v_failure_jobs) as failure_job(
    msg_id bigint,
    read_count integer,
    store text,
    product_id text,
    embedding_input_hash text,
    content_version text,
    model text
  );

  v_all_msg_ids := v_write_msg_ids || v_stale_msg_ids || v_failure_msg_ids;
  if coalesce(pg_catalog.cardinality(v_all_msg_ids), 0) not between 1 and 200 then
    raise exception 'El lote debe contener entre 1 y 200 mensajes' using errcode = '22023';
  end if;
  if (
    select pg_catalog.count(*) <> pg_catalog.count(distinct msg_id)
    from pg_catalog.unnest(v_all_msg_ids) as message(msg_id)
  ) then
    raise exception 'El lote contiene msg_ids duplicados o solapados' using errcode = '22023';
  end if;

  -- Cada mensaje debe seguir en la cola y pertenecer a la identidad declarada.
  -- Si no coincide, fallamos todo el sublote antes de escribir ningun vector.
  if exists (
    with declared as (
      select
        msg.value::bigint as msg_id,
        write_item.store,
        write_item.product_id,
        write_item.embedding_input_hash,
        write_item.content_version,
        write_item.model
      from pg_catalog.jsonb_to_recordset(v_writes) as write_item(
        msg_ids jsonb,
        store text,
        product_id text,
        embedding_input_hash text,
        expected_content_hash text,
        content_version text,
        model text,
        embedding jsonb
      )
      cross join lateral pg_catalog.jsonb_array_elements_text(write_item.msg_ids) as msg(value)
      union all
      select
        failure_job.msg_id,
        failure_job.store,
        failure_job.product_id,
        failure_job.embedding_input_hash,
        failure_job.content_version,
        failure_job.model
      from pg_catalog.jsonb_to_recordset(v_failure_jobs) as failure_job(
        msg_id bigint,
        read_count integer,
        store text,
        product_id text,
        embedding_input_hash text,
        content_version text,
        model text
      )
    )
    select 1
    from declared
    left join pgmq.q_catalog_embedding_jobs as queued
      on queued.msg_id = declared.msg_id
    where queued.msg_id is null
      or queued.message ->> 'store' is distinct from declared.store
      or queued.message ->> 'productId' is distinct from declared.product_id
      or coalesce(
        queued.message ->> 'embeddingInputHash',
        queued.message ->> 'contentHash'
      ) is distinct from declared.embedding_input_hash
      or queued.message ->> 'contentVersion' is distinct from declared.content_version
      or coalesce(
        queued.message ->> 'model',
        'text-embedding-3-small'
      ) is distinct from declared.model
  ) or exists (
    select 1
    from pg_catalog.unnest(v_stale_msg_ids) as stale(msg_id)
    left join pgmq.q_catalog_embedding_jobs as queued
      on queued.msg_id = stale.msg_id
    where queued.msg_id is null
  ) then
    raise exception 'Un msg_id no existe o no coincide con su identidad de cola'
      using errcode = '22023';
  end if;

  -- Orden global producto -> cola, igual que los triggers y la RPC de borrado.
  -- El bloqueo dura solo la finalizacion; OpenAI ya respondio fuera de aqui.
  for v_target in
    with targets as (
      select write_item.store, write_item.product_id
      from pg_catalog.jsonb_to_recordset(v_writes) as write_item(
        msg_ids jsonb,
        store text,
        product_id text,
        embedding_input_hash text,
        expected_content_hash text,
        content_version text,
        model text,
        embedding jsonb
      )
      union
      select failure_job.store, failure_job.product_id
      from pg_catalog.jsonb_to_recordset(v_failure_jobs) as failure_job(
        msg_id bigint,
        read_count integer,
        store text,
        product_id text,
        embedding_input_hash text,
        content_version text,
        model text
      )
      union
      select queued.message ->> 'store', queued.message ->> 'productId'
      from pgmq.q_catalog_embedding_jobs as queued
      where queued.msg_id = any (v_stale_msg_ids)
    )
    select targets.store, targets.product_id
    from targets
    order by targets.store, targets.product_id
  loop
    perform 1
    from public.catalog_product_embeddings as product
    where product.store = v_target.store
      and product.product_id = v_target.product_id
    for update;
  end loop;

  select pg_catalog.count(*)::integer
  into v_already_ready_products
  from pg_catalog.jsonb_to_recordset(v_writes) as write_item(
    msg_ids jsonb,
    store text,
    product_id text,
    embedding_input_hash text,
    expected_content_hash text,
    content_version text,
    model text,
    embedding jsonb
  )
  join public.catalog_product_embeddings as product
    on product.store = write_item.store
   and product.product_id = write_item.product_id
  where product.published
    and product.content_hash = write_item.expected_content_hash
    and coalesce(product.embedding_input_hash, product.content_hash)
      = write_item.embedding_input_hash
    and product.content_version = write_item.content_version
    and product.embedding is not null
    and product.model = write_item.model;

  with input as materialized (
    select
      write_item.store,
      write_item.product_id,
      write_item.embedding_input_hash,
      write_item.expected_content_hash,
      write_item.content_version,
      write_item.model,
      (write_item.embedding::text)::extensions.vector(512) as embedding
    from pg_catalog.jsonb_to_recordset(v_writes) as write_item(
      msg_ids jsonb,
      store text,
      product_id text,
      embedding_input_hash text,
      expected_content_hash text,
      content_version text,
      model text,
      embedding jsonb
    )
  ), updated as (
    update public.catalog_product_embeddings as product
    set embedding = input.embedding,
        model = input.model,
        embedded_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    from input
    where product.store = input.store
      and product.product_id = input.product_id
      and product.published
      and product.content_hash = input.expected_content_hash
      and coalesce(product.embedding_input_hash, product.content_hash)
        = input.embedding_input_hash
      and product.content_version = input.content_version
      and (
        product.embedding is null
        or product.model is distinct from input.model
      )
    returning product.store, product.product_id
  )
  select pg_catalog.count(*)::integer
  into v_updated_products
  from updated;

  with write_jobs as (
    select
      msg.value::bigint as msg_id,
      write_item.store,
      write_item.product_id,
      write_item.embedding_input_hash,
      write_item.expected_content_hash,
      write_item.content_version,
      write_item.model
    from pg_catalog.jsonb_to_recordset(v_writes) as write_item(
      msg_ids jsonb,
      store text,
      product_id text,
      embedding_input_hash text,
      expected_content_hash text,
      content_version text,
      model text,
      embedding jsonb
    )
    cross join lateral pg_catalog.jsonb_array_elements_text(write_item.msg_ids) as msg(value)
  ), classified as (
    select
      write_jobs.msg_id,
      product.store is not null
        and product.published
        and product.content_hash = write_jobs.expected_content_hash
        and coalesce(product.embedding_input_hash, product.content_hash)
          = write_jobs.embedding_input_hash
        and product.content_version = write_jobs.content_version
        and product.embedding is not null
        and product.model = write_jobs.model as completed
    from write_jobs
    left join public.catalog_product_embeddings as product
      on product.store = write_jobs.store
     and product.product_id = write_jobs.product_id
  )
  select
    coalesce(pg_catalog.array_agg(msg_id order by msg_id) filter (where completed), array[]::bigint[]),
    coalesce(pg_catalog.array_agg(msg_id order by msg_id) filter (where not completed), array[]::bigint[])
  into v_write_completed_ids, v_write_stale_ids
  from classified;

  -- Un fallo solo se conserva si el trabajo sigue siendo vigente y necesario.
  -- Si el producto cambio mientras fallaba la lectura/OpenAI, se confirma como
  -- obsoleto y catalog_delete_embedding_jobs garantiza la identidad actual.
  with classified as (
    select
      failure_job.msg_id,
      product.store is not null
        and product.published
        and coalesce(product.embedding_input_hash, product.content_hash)
          = failure_job.embedding_input_hash
        and product.content_version = failure_job.content_version
        and (
          product.embedding is null
          or product.model is distinct from failure_job.model
        ) as retryable
    from pg_catalog.jsonb_to_recordset(v_failure_jobs) as failure_job(
      msg_id bigint,
      read_count integer,
      store text,
      product_id text,
      embedding_input_hash text,
      content_version text,
      model text
    )
    left join public.catalog_product_embeddings as product
      on product.store = failure_job.store
     and product.product_id = failure_job.product_id
  )
  select
    coalesce(pg_catalog.array_agg(msg_id order by msg_id) filter (where retryable), array[]::bigint[]),
    coalesce(pg_catalog.array_agg(msg_id order by msg_id) filter (where not retryable), array[]::bigint[])
  into v_failed_ids, v_failure_stale_ids
  from classified;

  if pg_catalog.cardinality(v_failed_ids) > 0 then
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
    )
    select
      failure_job.msg_id,
      failure_job.store,
      failure_job.product_id,
      failure_job.embedding_input_hash,
      failure_job.read_count,
      v_error_code,
      v_error_message,
      pg_catalog.now(),
      case when failure_job.read_count >= v_max_attempts then pg_catalog.now() else null end
    from pg_catalog.jsonb_to_recordset(v_failure_jobs) as failure_job(
      msg_id bigint,
      read_count integer,
      store text,
      product_id text,
      embedding_input_hash text,
      content_version text,
      model text
    )
    where failure_job.msg_id = any (v_failed_ids)
    on conflict (msg_id) do update set
      read_count = excluded.read_count,
      error_code = excluded.error_code,
      error_message = excluded.error_message,
      last_failed_at = excluded.last_failed_at,
      archived_at = excluded.archived_at;

    select coalesce(pg_catalog.array_agg(failure_job.msg_id order by failure_job.msg_id), array[]::bigint[])
    into v_archived_ids
    from pg_catalog.jsonb_to_recordset(v_failure_jobs) as failure_job(
      msg_id bigint,
      read_count integer,
      store text,
      product_id text,
      embedding_input_hash text,
      content_version text,
      model text
    )
    where failure_job.msg_id = any (v_failed_ids)
      and failure_job.read_count >= v_max_attempts;

    if pg_catalog.cardinality(v_archived_ids) > 0 then
      v_archive_requested_ids := v_archived_ids;
      select coalesce(pg_catalog.array_agg(archived.msg_id order by archived.msg_id), array[]::bigint[])
      into v_archived_ids
      from pgmq.archive('catalog_embedding_jobs', v_archive_requested_ids) as archived(msg_id);
      if pg_catalog.cardinality(v_archived_ids)
          <> pg_catalog.cardinality(v_archive_requested_ids)
      then
        raise exception 'No se pudieron archivar todos los mensajes terminales';
      end if;
    end if;
  end if;

  v_confirm_ids := v_write_completed_ids
    || v_write_stale_ids
    || v_stale_msg_ids
    || v_failure_stale_ids;

  if pg_catalog.cardinality(v_confirm_ids) > 0 then
    v_deleted_ids := public.catalog_delete_embedding_jobs(v_confirm_ids);
    if pg_catalog.cardinality(v_deleted_ids) <> pg_catalog.cardinality(v_confirm_ids) then
      raise exception 'No se pudieron confirmar todos los mensajes del lote';
    end if;
  end if;

  if pg_catalog.cardinality(v_write_completed_ids) > 0 then
    delete from public.catalog_embedding_failures as failure_row
    where failure_row.msg_id = any (v_write_completed_ids);
  end if;

  return pg_catalog.jsonb_build_object(
    'completed_msg_ids', to_jsonb(v_write_completed_ids),
    'stale_msg_ids', to_jsonb(v_write_stale_ids || v_stale_msg_ids || v_failure_stale_ids),
    'failed_msg_ids', to_jsonb(v_failed_ids),
    'archived_msg_ids', to_jsonb(v_archived_ids),
    'deleted_msg_ids', to_jsonb(v_deleted_ids),
    'updated_products', v_updated_products,
    'already_ready_products', v_already_ready_products
  );
end
$function$;

revoke all on function public.catalog_finalize_embedding_batch(jsonb)
  from public, anon, authenticated;
grant execute on function public.catalog_finalize_embedding_batch(jsonb)
  to service_role;

comment on function public.catalog_finalize_embedding_batch(jsonb) is
  'Finaliza hasta 25 escrituras HNSW y hasta 200 jobs por transaccion: CAS de hash/version/publicacion, confirmacion PGMQ, reparacion A-B-A y fallos por lote. Solo service_role.';
