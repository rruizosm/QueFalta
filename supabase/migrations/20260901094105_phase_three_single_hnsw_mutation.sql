-- Fase 3: una sola mutacion HNSW por cambio semantico.
--
-- No se hace backfill masivo: para vectores anteriores a esta migracion,
-- embedded_content_hash NULL significa que el vector corresponde al input
-- efectivo de la fila. Cuando ese input cambia, el trigger materializa el hash
-- anterior y conserva el vector hasta que el worker lo sustituye por CAS.

set lock_timeout = '5s';
set statement_timeout = '60s';

do $checks$
begin
  if to_regclass('public.catalog_product_embeddings') is null then
    raise exception 'Falta public.catalog_product_embeddings';
  end if;
  if to_regprocedure('public.catalog_finalize_embedding_batch(jsonb)') is null then
    raise exception 'Falta public.catalog_finalize_embedding_batch(jsonb)';
  end if;
  if to_regclass('pgmq.q_catalog_embedding_jobs') is null then
    raise exception 'Falta la cola pgmq catalog_embedding_jobs';
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

alter table public.catalog_product_embeddings
  add column if not exists embedded_content_hash text;

comment on column public.catalog_product_embeddings.embedded_content_hash is
  'Hash del input que genero el vector almacenado. NULL es compatibilidad legacy y equivale al input vigente hasta su primer cambio semantico.';

alter table public.catalog_product_embeddings
  drop constraint if exists catalog_product_embeddings_embedded_content_hash_check;
alter table public.catalog_product_embeddings
  add constraint catalog_product_embeddings_embedded_content_hash_check
  check (
    embedded_content_hash is null
    or (
      embedded_content_hash ~ '^[0-9a-f]{64}$'
      and embedding is not null
    )
  ) not valid;
alter table public.catalog_product_embeddings
  validate constraint catalog_product_embeddings_embedded_content_hash_check;

create or replace function comparator_internal.invalidate_catalog_embedding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(old.embedding_input_hash, old.content_hash)
      is distinct from coalesce(new.embedding_input_hash, new.content_hash)
  then
    -- El vector no se toca. Para una fila legacy se materializa en este mismo
    -- UPDATE el hash del input anterior; desde ese instante queda pendiente.
    if new.embedding is not null then
      new.embedded_content_hash := coalesce(
        old.embedded_content_hash,
        old.embedding_input_hash,
        old.content_hash
      );
    else
      new.embedded_content_hash := null;
    end if;
  end if;

  return new;
end
$function$;

revoke all on function comparator_internal.invalidate_catalog_embedding()
  from public, anon, authenticated;

comment on function comparator_internal.invalidate_catalog_embedding() is
  'Al cambiar el input conserva el vector y congela su hash anterior. La desigualdad de hashes invalida el vector logicamente sin mutar HNSW.';

create or replace function comparator_internal.ensure_catalog_embedding_job(
  p_store text,
  p_product_id text,
  p_expected_hash text default null,
  p_target_model text default 'text-embedding-3-small'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row record;
  v_embedding_input_hash text;
  v_constraint_name text;
begin
  if p_store is null or p_store = '' or p_product_id is null or p_product_id = '' then
    raise exception 'store/product_id requeridos';
  end if;
  if p_target_model is distinct from 'text-embedding-3-small' then
    raise exception 'Modelo de embeddings no soportado: %', p_target_model;
  end if;
  if p_expected_hash is not null and p_expected_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Hash de input invalido';
  end if;

  select
    row.content_hash,
    row.embedding_input_hash,
    row.embedded_content_hash,
    row.content_version,
    row.published,
    row.embedding is not null as has_embedding,
    row.model
  into v_row
  from public.catalog_product_embeddings as row
  where row.store = p_store
    and row.product_id = p_product_id
  for update;

  if not found or not v_row.published then
    return false;
  end if;

  v_embedding_input_hash := coalesce(
    v_row.embedding_input_hash,
    v_row.content_hash
  );

  if p_expected_hash is not null
    and v_embedding_input_hash is distinct from p_expected_hash
  then
    return false;
  end if;

  if v_row.has_embedding
    and v_row.model = p_target_model
    and coalesce(
      v_row.embedded_content_hash,
      v_row.embedding_input_hash,
      v_row.content_hash
    ) = v_embedding_input_hash
  then
    return false;
  end if;

  if exists (
    select 1
    from public.catalog_embedding_failures as failure
    where failure.store = p_store
      and failure.product_id = p_product_id
      and failure.content_hash = v_embedding_input_hash
      and failure.archived_at is not null
  ) then
    return false;
  end if;

  begin
    perform pgmq.send(
      queue_name => 'catalog_embedding_jobs',
      msg => pg_catalog.jsonb_build_object(
        'store', p_store,
        'productId', p_product_id,
        'embeddingInputHash', v_embedding_input_hash,
        'contentHash', v_embedding_input_hash,
        'contentVersion', v_row.content_version,
        'model', p_target_model
      )
    );
  exception
    when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name is distinct from 'catalog_embedding_jobs_identity_uidx' then
        raise;
      end if;
      return false;
  end;

  return true;
end
$function$;

revoke all on function comparator_internal.ensure_catalog_embedding_job(text, text, text, text)
  from public, anon, authenticated;
grant execute on function comparator_internal.ensure_catalog_embedding_job(text, text, text, text)
  to service_role;

comment on function comparator_internal.ensure_catalog_embedding_job(text, text, text, text) is
  'Encola si falta vector o si model/embedded_content_hash no corresponden al input vigente; evita duplicados por identidad.';

-- La RPC conserva el contrato del worker por lotes, pero considera lista una
-- fila solo si el vector pertenece al input vigente y escribe ambos juntos.
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
    and product.model = write_item.model
    and coalesce(
      product.embedded_content_hash,
      product.embedding_input_hash,
      product.content_hash
    ) = write_item.embedding_input_hash;

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
        embedded_content_hash = input.embedding_input_hash,
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
        or coalesce(
          product.embedded_content_hash,
          product.embedding_input_hash,
          product.content_hash
        ) is distinct from input.embedding_input_hash
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
        and product.model = write_jobs.model
        and coalesce(
          product.embedded_content_hash,
          product.embedding_input_hash,
          product.content_hash
        ) = write_jobs.embedding_input_hash as completed
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
          or coalesce(
            product.embedded_content_hash,
            product.embedding_input_hash,
            product.content_hash
          ) is distinct from failure_job.embedding_input_hash
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
  'Finaliza hasta 25 productos por transaccion. Sustituye vector y embedded_content_hash en una sola escritura CAS; un trabajo obsoleto nunca puede pisar el input vigente. Solo service_role.';


-- Ninguna ruta de busqueda puede consumir un vector logicamente pendiente.
create or replace function public.catalog_embedding_candidates(
  p_source_store text,
  p_source_product_id text,
  p_target_stores text[] default null,
  p_match_count integer default 20,
  p_min_vector_score real default 0.45
)
returns table (
  target_store text,
  target_product_id text,
  target_name text,
  vector_score real,
  lexical_score real,
  quantity_ratio numeric
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with source as (
    select e.*
    from public.catalog_product_embeddings as e
    where e.store = p_source_store
      and e.product_id = p_source_product_id
      and e.published
      and e.embedding is not null
      and coalesce(e.embedded_content_hash, e.embedding_input_hash, e.content_hash)
        = coalesce(e.embedding_input_hash, e.content_hash)
  )
  select
    candidate.store,
    candidate.product_id,
    candidate.display_name,
    candidate.vector_score,
    candidate.lexical_score,
    candidate.quantity_ratio
  from source
  cross join lateral (
    select
      target.store,
      target.product_id,
      target.display_name,
      (1 - (target.embedding operator(extensions.<=>) source.embedding))::real as vector_score,
      public.similarity(source.display_name, target.display_name)::real as lexical_score,
      case
        when source.quantity_base is not null and target.quantity_base is not null
          then target.quantity_base / source.quantity_base
        else null
      end as quantity_ratio
    from public.catalog_product_embeddings as target
    where target.published
      and target.embedding is not null
      and coalesce(
        target.embedded_content_hash,
        target.embedding_input_hash,
        target.content_hash
      ) = coalesce(target.embedding_input_hash, target.content_hash)
      and target.store <> source.store
      and (p_target_stores is null or target.store = any (p_target_stores))
      and target.model = source.model
      and target.content_version = source.content_version
      and source.canonical_unit is not null
      and target.canonical_unit = source.canonical_unit
      and public.catalog_attributes_compatible(source.attributes, target.attributes)
      and (
        source.quantity_base is null
        or target.quantity_base is null
        or target.quantity_base / source.quantity_base between 0.25 and 4
      )
      and 1 - (target.embedding operator(extensions.<=>) source.embedding) >= p_min_vector_score
    order by target.embedding operator(extensions.<=>) source.embedding
    limit least(greatest(p_match_count, 1), 100)
  ) as candidate
  order by candidate.vector_score desc, candidate.lexical_score desc;
$function$;

comment on function public.catalog_embedding_candidates(text, text, text[], integer, real) is
  'Recuperación vectorial interna con filtros duros previos. No decide ni publica matches.';

revoke all on function public.catalog_embedding_candidates(text, text, text[], integer, real)
  from public, anon, authenticated;
grant execute on function public.catalog_embedding_candidates(text, text, text[], integer, real)
  to service_role;

create or replace function public.catalog_embedding_candidates_v2(
  p_source_store text,
  p_source_product_id text,
  p_target_stores text[] default null,
  p_match_count integer default 20,
  p_min_vector_score real default 0.45
)
returns table (
  target_store text,
  target_product_id text,
  target_name text,
  vector_score real,
  trigram_score real,
  quantity_ratio numeric
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with source as (
    select e.*
    from public.catalog_product_embeddings as e
    where e.store = p_source_store
      and e.product_id = p_source_product_id
      and e.published
      and e.embedding is not null
      and coalesce(e.embedded_content_hash, e.embedding_input_hash, e.content_hash)
        = coalesce(e.embedding_input_hash, e.content_hash)
  )
  select
    candidate.store,
    candidate.product_id,
    candidate.display_name,
    candidate.vector_score,
    candidate.trigram_score,
    candidate.quantity_ratio
  from source
  cross join lateral (
    select
      target.store,
      target.product_id,
      target.display_name,
      (1 - (target.embedding operator(extensions.<=>) source.embedding))::real as vector_score,
      public.similarity(source.display_name, target.display_name)::real as trigram_score,
      case
        when source.quantity_base is not null and target.quantity_base is not null
          then target.quantity_base / source.quantity_base
        else null
      end as quantity_ratio
    from public.catalog_product_embeddings as target
    where target.published
      and target.embedding is not null
      and coalesce(
        target.embedded_content_hash,
        target.embedding_input_hash,
        target.content_hash
      ) = coalesce(target.embedding_input_hash, target.content_hash)
      and target.store <> source.store
      and (p_target_stores is null or target.store = any (p_target_stores))
      and target.model = source.model
      and target.content_version = source.content_version
      and source.canonical_unit is not null
      and target.canonical_unit = source.canonical_unit
      and public.catalog_attributes_compatible(source.attributes, target.attributes)
      and (
        source.quantity_base is null
        or target.quantity_base is null
        or target.quantity_base / source.quantity_base between (1.0 / 12.0) and 12.0
      )
      and 1 - (target.embedding operator(extensions.<=>) source.embedding) >= p_min_vector_score
    order by target.embedding operator(extensions.<=>) source.embedding
    limit least(greatest(p_match_count, 1), 100)
  ) as candidate
  order by candidate.vector_score desc, candidate.trigram_score desc;
$function$;

comment on function public.catalog_embedding_candidates_v2(text, text, text[], integer, real) is
  'Recuperación vectorial interna v2. Tolera formatos hasta x12; el score léxico validado se calcula después sobre el top-N.';

revoke all on function public.catalog_embedding_candidates_v2(text, text, text[], integer, real)
  from public, anon, authenticated;
grant execute on function public.catalog_embedding_candidates_v2(text, text, text[], integer, real)
  to service_role;


create or replace function public.catalog_embedding_candidates_v3(
  p_source_store text,
  p_source_product_id text,
  p_target_stores text[] default null,
  p_match_count integer default 20,
  p_min_vector_score real default 0.45
)
returns table (
  target_store text,
  target_product_id text,
  target_name text,
  vector_score real,
  trigram_score real,
  quantity_ratio numeric
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with source as (
    select e.*
    from public.catalog_product_embeddings as e
    where e.store = p_source_store
      and e.product_id = p_source_product_id
      and e.published
      and e.embedding is not null
      and coalesce(e.embedded_content_hash, e.embedding_input_hash, e.content_hash)
        = coalesce(e.embedding_input_hash, e.content_hash)
  ),
  exact_candidates as (
    select
      target.store,
      target.product_id,
      target.display_name,
      (1 - (target.embedding operator(extensions.<=>) source.embedding))::real as vector_score,
      public.similarity(source.display_name, target.display_name)::real as trigram_score,
      case
        when source.quantity_base is not null and target.quantity_base is not null
          then target.quantity_base / source.quantity_base
        else null
      end as quantity_ratio,
      true as exact_gtin,
      null::bigint as vector_rank,
      null::bigint as lexical_rank
    from source
    join public.catalog_product_embeddings as target
      on source.global_gtin is not null
     and target.global_gtin = source.global_gtin
    where target.published
      and target.embedding is not null
      and coalesce(
        target.embedded_content_hash,
        target.embedding_input_hash,
        target.content_hash
      ) = coalesce(target.embedding_input_hash, target.content_hash)
      and target.store <> source.store
      and (p_target_stores is null or target.store = any (p_target_stores))
  ),
  vector_candidates as (
    select
      candidate.store,
      candidate.product_id,
      candidate.display_name,
      candidate.vector_score,
      candidate.trigram_score,
      candidate.quantity_ratio,
      false as exact_gtin,
      row_number() over (order by candidate.vector_distance) as vector_rank,
      null::bigint as lexical_rank
    from source
    cross join lateral (
      select
        target.store,
        target.product_id,
        target.display_name,
        target.embedding operator(extensions.<=>) source.embedding as vector_distance,
        (1 - (target.embedding operator(extensions.<=>) source.embedding))::real as vector_score,
        public.similarity(source.display_name, target.display_name)::real as trigram_score,
        case
          when source.quantity_base is not null and target.quantity_base is not null
            then target.quantity_base / source.quantity_base
          else null
        end as quantity_ratio
      from public.catalog_product_embeddings as target
      where target.published
        and target.embedding is not null
      and coalesce(
        target.embedded_content_hash,
        target.embedding_input_hash,
        target.content_hash
      ) = coalesce(target.embedding_input_hash, target.content_hash)
        and target.store <> source.store
        and (p_target_stores is null or target.store = any (p_target_stores))
        and target.model = source.model
        and target.content_version = source.content_version
        and source.canonical_unit is not null
        and target.canonical_unit = source.canonical_unit
        and public.catalog_attributes_compatible(source.attributes, target.attributes)
        and (
          source.quantity_base is null
          or target.quantity_base is null
          or target.quantity_base / source.quantity_base between (1.0 / 12.0) and 12.0
        )
        and 1 - (target.embedding operator(extensions.<=>) source.embedding) >= p_min_vector_score
      order by target.embedding operator(extensions.<=>) source.embedding
      limit least(greatest(p_match_count, 1), 100)
    ) as candidate
  ),
  lexical_candidates as (
    select
      candidate.store,
      candidate.product_id,
      candidate.display_name,
      candidate.vector_score,
      candidate.trigram_score,
      candidate.quantity_ratio,
      false as exact_gtin,
      null::bigint as vector_rank,
      row_number() over (
        order by candidate.lexical_retrieval_score desc, candidate.vector_score desc
      ) as lexical_rank
    from source
    cross join lateral (
      select
        target.store,
        target.product_id,
        target.display_name,
        (1 - (target.embedding operator(extensions.<=>) source.embedding))::real as vector_score,
        public.similarity(source.display_name, target.display_name)::real as trigram_score,
        greatest(
          public.similarity(source.display_name, target.display_name),
          public.word_similarity(source.display_name, target.display_name),
          public.word_similarity(target.display_name, source.display_name)
        )::real as lexical_retrieval_score,
        case
          when source.quantity_base is not null and target.quantity_base is not null
            then target.quantity_base / source.quantity_base
          else null
        end as quantity_ratio
      from public.catalog_product_embeddings as target
      where target.published
        and target.embedding is not null
      and coalesce(
        target.embedded_content_hash,
        target.embedding_input_hash,
        target.content_hash
      ) = coalesce(target.embedding_input_hash, target.content_hash)
        and target.store <> source.store
        and (p_target_stores is null or target.store = any (p_target_stores))
        and target.model = source.model
        and target.content_version = source.content_version
        and source.canonical_unit is not null
        and target.canonical_unit = source.canonical_unit
        and public.catalog_attributes_compatible(source.attributes, target.attributes)
        and (
          source.quantity_base is null
          or target.quantity_base is null
          or target.quantity_base / source.quantity_base between (1.0 / 12.0) and 12.0
        )
        and (
          target.display_name operator(public.%) source.display_name
          or target.display_name operator(public.%>) source.display_name
        )
      order by greatest(
                 public.similarity(source.display_name, target.display_name),
                 public.word_similarity(source.display_name, target.display_name),
                 public.word_similarity(target.display_name, source.display_name)
               ) desc,
               target.embedding operator(extensions.<=>) source.embedding
      limit least(greatest(p_match_count, 1), 100)
    ) as candidate
  ),
  combined as (
    select * from exact_candidates
    union all
    select * from vector_candidates
    union all
    select * from lexical_candidates
  ),
  deduplicated as (
    select
      store,
      product_id,
      max(display_name) as display_name,
      max(vector_score) as vector_score,
      max(trigram_score) as trigram_score,
      max(quantity_ratio) as quantity_ratio,
      bool_or(exact_gtin) as exact_gtin,
      min(vector_rank) as vector_rank,
      min(lexical_rank) as lexical_rank
    from combined
    group by store, product_id
  )
  select
    candidate.store,
    candidate.product_id,
    candidate.display_name,
    candidate.vector_score,
    candidate.trigram_score,
    candidate.quantity_ratio
  from deduplicated as candidate
  order by
    candidate.exact_gtin desc,
    (
      coalesce(1.0 / (60.0 + candidate.vector_rank), 0)
      + coalesce(1.0 / (60.0 + candidate.lexical_rank), 0)
    ) desc,
    candidate.vector_score desc,
    candidate.trigram_score desc;
$function$;

comment on function public.catalog_embedding_candidates_v3(text, text, text[], integer, real) is
  'Recuperación híbrida interna v3. Excluye fuentes y candidatos cuyo vector no corresponde al embedding_input_hash vigente.';

revoke all on function public.catalog_embedding_candidates_v3(text, text, text[], integer, real)
  from public, anon, authenticated;
grant execute on function public.catalog_embedding_candidates_v3(text, text, text[], integer, real)
  to service_role;

create or replace function comparator_internal.refresh_catalog_match_cache_pair_v3(
  p_source_store text,
  p_source_product_id text,
  p_target_store text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_match_version constant text := 'embedding_hybrid_v3_0_60';
  v_source record;
  v_target_generation bigint;
  v_refresh_token text;
  v_inserted integer := 0;
begin
  if p_source_store = p_target_store then
    return 0;
  end if;

  select
    source.content_hash,
    source.embedded_at,
    source.display_name,
    source.global_gtin
  into v_source
  from public.catalog_product_embeddings as source
  where source.store = p_source_store
    and source.product_id = p_source_product_id
    and source.published
    and source.embedding is not null
    and source.embedded_at is not null
    and coalesce(
      source.embedded_content_hash,
      source.embedding_input_hash,
      source.content_hash
    ) = coalesce(source.embedding_input_hash, source.content_hash);

  if not found then
    delete from public.catalog_product_matches as match
    where match.source_store = p_source_store
      and match.source_product_id = p_source_product_id
      and match.target_store = p_target_store
      and match.match_version = v_match_version;
    delete from public.catalog_product_match_cache_status as status
    where status.source_store = p_source_store
      and status.source_product_id = p_source_product_id
      and status.target_store = p_target_store
      and status.match_version = v_match_version;
    return 0;
  end if;

  select version.generation
  into v_target_generation
  from comparator_internal.catalog_match_store_versions as version
  where version.store = p_target_store;

  if v_target_generation is null then
    insert into comparator_internal.catalog_match_store_versions (store, generation, updated_at)
    values (p_target_store, 1, now())
    on conflict (store) do update set updated_at = excluded.updated_at
    returning generation into v_target_generation;
  end if;

  v_refresh_token := pg_catalog.txid_current()::text || ':' || pg_catalog.clock_timestamp()::text;

  with candidates as (
    select
      candidate.target_store,
      candidate.target_product_id,
      candidate.target_name,
      candidate.vector_score,
      candidate.quantity_ratio,
      target.global_gtin as target_gtin,
      target.content_hash as target_content_hash,
      public.catalog_validated_lexical_score_v1(v_source.display_name, candidate.target_name) as lexical_score
    from public.catalog_embedding_candidates_v3(
      p_source_store,
      p_source_product_id,
      array[p_target_store],
      20,
      -1
    ) as candidate
    join public.catalog_product_embeddings as target
      on target.store = candidate.target_store
     and target.product_id = candidate.target_product_id
     and target.published
     and target.embedding is not null
     and coalesce(
       target.embedded_content_hash,
       target.embedding_input_hash,
       target.content_hash
     ) = coalesce(target.embedding_input_hash, target.content_hash)
  ),
  scored as (
    select
      candidates.*,
      v_source.global_gtin is not null and v_source.global_gtin = candidates.target_gtin as exact_gtin,
      (0.5 * candidates.vector_score + 0.5 * candidates.lexical_score)::real as hybrid_score
    from candidates
  ),
  accepted as (
    select scored.*
    from scored
    where scored.exact_gtin
       or (
         public.catalog_has_preparation_marker_v1(v_source.display_name)
           = public.catalog_has_preparation_marker_v1(scored.target_name)
         and scored.hybrid_score >= 0.60
       )
  ),
  upserted as (
    insert into public.catalog_product_matches as match (
      source_store,
      source_product_id,
      target_store,
      target_product_id,
      relation,
      confidence,
      vector_score,
      lexical_score,
      match_version,
      evidence,
      created_at,
      updated_at
    )
    select
      p_source_store,
      p_source_product_id,
      accepted.target_store,
      accepted.target_product_id,
      case when accepted.exact_gtin then 'identico' else 'comparable' end,
      case when accepted.exact_gtin then 1::real else accepted.hybrid_score end,
      accepted.vector_score,
      accepted.lexical_score,
      v_match_version,
      pg_catalog.jsonb_build_object(
        'quantity_ratio', accepted.quantity_ratio,
        'source_content_hash', v_source.content_hash,
        'target_content_hash', accepted.target_content_hash,
        'target_generation', v_target_generation,
        'cache_refresh_token', v_refresh_token
      ),
      now(),
      now()
    from accepted
    on conflict (source_store, source_product_id, target_store, target_product_id, match_version)
    do update set
      relation = excluded.relation,
      confidence = excluded.confidence,
      vector_score = excluded.vector_score,
      lexical_score = excluded.lexical_score,
      evidence = excluded.evidence,
      updated_at = excluded.updated_at
    returning 1
  )
  select count(*)::integer into v_inserted from upserted;

  delete from public.catalog_product_matches as match
  where match.source_store = p_source_store
    and match.source_product_id = p_source_product_id
    and match.target_store = p_target_store
    and match.match_version = v_match_version
    and match.evidence ->> 'cache_refresh_token' is distinct from v_refresh_token;

  insert into public.catalog_product_match_cache_status as status (
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
    p_source_store,
    p_source_product_id,
    p_target_store,
    v_match_version,
    v_source.content_hash,
    v_source.embedded_at,
    v_target_generation,
    now(),
    now()
  )
  on conflict (source_store, source_product_id, target_store, match_version)
  do update set
    source_content_hash = excluded.source_content_hash,
    source_embedded_at = excluded.source_embedded_at,
    target_generation = excluded.target_generation,
    built_at = excluded.built_at,
    updated_at = excluded.updated_at;

  return v_inserted;
end;
$function$;

revoke all on function comparator_internal.refresh_catalog_match_cache_pair_v3(text, text, text)
  from public, anon, authenticated;
grant execute on function comparator_internal.refresh_catalog_match_cache_pair_v3(text, text, text)
  to service_role;

create or replace function comparator_internal.catalog_cheaper_products_v3(
  p_source_store text,
  p_source_product_id text,
  p_stores text[]
)
returns table(
  store text,
  id text,
  display_name text,
  thumbnail text,
  price_total numeric,
  price_per_unit numeric,
  price_per_unit_unit text,
  match_kind text,
  match_score real,
  vector_score real,
  lexical_score real,
  quantity_ratio numeric
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_match_version constant text := 'embedding_hybrid_v3_0_60';
  v_source record;
  v_requested record;
  v_target_generation bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select source.content_hash, source.embedded_at
  into v_source
  from public.catalog_product_embeddings as source
  where source.store = p_source_store
    and source.product_id = p_source_product_id
    and source.published
    and source.embedding is not null
    and source.embedded_at is not null
    and coalesce(
      source.embedded_content_hash,
      source.embedding_input_hash,
      source.content_hash
    ) = coalesce(source.embedding_input_hash, source.content_hash);

  if not found then
    return;
  end if;

  for v_requested in
    select requested.store, min(requested.ordinality) as store_order
    from unnest(coalesce(p_stores, array[]::text[])) with ordinality
      as requested(store, ordinality)
    where requested.store = any (array[
      'mercadona','esclat','carrefour','bonarea','consum','dia','sorli','eroski',
      'caprabo','condis','ametller','aldi','hiperdino','alcampo','plusfresc',
      'gadis','froiz','ahorramas'
    ])
      and requested.store <> p_source_store
    group by requested.store
    order by min(requested.ordinality)
  loop
    select version.generation
    into v_target_generation
    from comparator_internal.catalog_match_store_versions as version
    where version.store = v_requested.store;

    if not exists (
      select 1
      from public.catalog_product_match_cache_status as status
      where status.source_store = p_source_store
        and status.source_product_id = p_source_product_id
        and status.target_store = v_requested.store
        and status.match_version = v_match_version
        and status.source_content_hash = v_source.content_hash
        and status.source_embedded_at = v_source.embedded_at
        and status.target_generation = coalesce(v_target_generation, 1)
    ) then
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          p_source_store || ':' || p_source_product_id || ':' || v_requested.store || ':' || v_match_version,
          0
        )
      );

      select version.generation
      into v_target_generation
      from comparator_internal.catalog_match_store_versions as version
      where version.store = v_requested.store;

      if not exists (
        select 1
        from public.catalog_product_match_cache_status as status
        where status.source_store = p_source_store
          and status.source_product_id = p_source_product_id
          and status.target_store = v_requested.store
          and status.match_version = v_match_version
          and status.source_content_hash = v_source.content_hash
          and status.source_embedded_at = v_source.embedded_at
          and status.target_generation = coalesce(v_target_generation, 1)
      ) then
        perform comparator_internal.refresh_catalog_match_cache_pair_v3(
          p_source_store,
          p_source_product_id,
          v_requested.store
        );
      end if;
    end if;
  end loop;

  return query
  with requested_stores as (
    select requested.store, min(requested.ordinality) as store_order
    from unnest(coalesce(p_stores, array[]::text[])) with ordinality
      as requested(store, ordinality)
    where requested.store = any (array[
      'mercadona','esclat','carrefour','bonarea','consum','dia','sorli','eroski',
      'caprabo','condis','ametller','aldi','hiperdino','alcampo','plusfresc',
      'gadis','froiz','ahorramas'
    ])
      and requested.store <> p_source_store
    group by requested.store
  ),
  cached as (
    select
      requested.store_order,
      match.target_store,
      match.target_product_id,
      match.relation,
      match.confidence,
      match.vector_score,
      match.lexical_score,
      nullif(match.evidence ->> 'quantity_ratio', '')::numeric as quantity_ratio,
      detail.display_name,
      detail.thumbnail,
      detail.price_total,
      detail.price_per_unit,
      detail.price_per_unit_unit
    from requested_stores as requested
    join public.catalog_product_matches as match
      on match.source_store = p_source_store
     and match.source_product_id = p_source_product_id
     and match.target_store = requested.store
     and match.match_version = v_match_version
     and match.relation in ('identico', 'comparable')
     and match.review_decision is distinct from 'rechazado'
    cross join lateral public.catalog_public_product_v1(
      match.target_store,
      match.target_product_id
    ) as detail
  ),
  ranked as (
    select
      cached.*,
      row_number() over (
        partition by cached.target_store
        order by
          case
            when cached.target_store = any (array['caprabo','eroski','hiperdino'])
              then cached.price_total
            else cached.price_per_unit
          end asc nulls last,
          case
            when cached.target_store = any (array['caprabo','eroski','hiperdino'])
              then null
            else cached.price_total
          end asc nulls last,
          (cached.relation = 'identico') desc,
          cached.confidence desc,
          cached.target_product_id
      ) as store_rank
    from cached
  )
  select
    ranked.target_store,
    ranked.target_product_id,
    ranked.display_name,
    ranked.thumbnail,
    ranked.price_total,
    ranked.price_per_unit,
    ranked.price_per_unit_unit,
    case when ranked.relation = 'identico' then 'exact_gtin' else 'semantic' end,
    ranked.confidence,
    ranked.vector_score,
    ranked.lexical_score,
    ranked.quantity_ratio
  from ranked
  where ranked.store_rank <= 2
  order by ranked.store_order, ranked.store_rank;
end;
$function$;

revoke all on function comparator_internal.catalog_cheaper_products_v3(text, text, text[])
  from public, anon;
grant execute on function comparator_internal.catalog_cheaper_products_v3(text, text, text[])
  to authenticated, service_role;


create or replace function comparator_internal.catalog_cheaper_products_v5(
  p_source_store text,
  p_source_product_id text,
  p_stores text[]
)
returns table(
  store text,
  id text,
  display_name text,
  thumbnail text,
  price_total numeric,
  price_per_unit numeric,
  price_per_unit_unit text,
  match_kind text,
  match_score real,
  vector_score real,
  lexical_score real,
  quantity_ratio numeric,
  is_cheaper boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_match_version constant text := 'embedding_hybrid_v3_0_60';
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform 1
  from comparator_internal.catalog_cheaper_products_v3(
    p_source_store,
    p_source_product_id,
    p_stores
  )
  limit 1;

  return query
  with requested_stores as (
    select requested.store, min(requested.ordinality) as store_order
    from unnest(coalesce(p_stores, array[]::text[])) with ordinality
      as requested(store, ordinality)
    where requested.store = any (array[
      'mercadona','esclat','carrefour','bonarea','consum','dia','sorli','eroski',
      'caprabo','condis','ametller','aldi','hiperdino','alcampo','plusfresc',
      'gadis','froiz','ahorramas'
    ])
      and requested.store <> p_source_store
    group by requested.store
  ),
  source_embedding as (
    select source.display_name, source.category
    from public.catalog_product_embeddings as source
    where source.store = p_source_store
      and source.product_id = p_source_product_id
      and source.published
      and source.embedding is not null
      and coalesce(
        source.embedded_content_hash,
        source.embedding_input_hash,
        source.content_hash
      ) = coalesce(source.embedding_input_hash, source.content_hash)
  ),
  source_price as (
    select case
      when source.store = any (array['caprabo','eroski','hiperdino'])
        then source.price_total
      else source.price_per_unit
    end as comparison_price
    from public.catalog_public_product_v1(
      p_source_store,
      p_source_product_id
    ) as source
  ),
  compatible as (
    select
      requested.store_order,
      match.target_store,
      match.target_product_id,
      match.relation,
      match.confidence,
      match.vector_score,
      match.lexical_score,
      nullif(match.evidence ->> 'quantity_ratio', '')::numeric as quantity_ratio,
      detail.display_name,
      detail.thumbnail,
      detail.price_total,
      detail.price_per_unit,
      detail.price_per_unit_unit
    from requested_stores as requested
    cross join source_embedding as source
    join public.catalog_product_matches as match
      on match.source_store = p_source_store
     and match.source_product_id = p_source_product_id
     and match.target_store = requested.store
     and match.match_version = v_match_version
     and match.relation in ('identico', 'comparable')
     and match.review_decision is distinct from 'rechazado'
    join public.catalog_product_embeddings as target
      on target.store = match.target_store
     and target.product_id = match.target_product_id
     and target.published
     and target.embedding is not null
     and coalesce(
       target.embedded_content_hash,
       target.embedding_input_hash,
       target.content_hash
     ) = coalesce(target.embedding_input_hash, target.content_hash)
    cross join lateral public.catalog_public_product_v1(
      match.target_store,
      match.target_product_id
    ) as detail
    where match.relation = 'identico'
       or match.review_decision = 'aprobado'
       or public.catalog_product_identity_compatible_v1(
         source.display_name,
         source.category,
         target.display_name,
         target.category
       )
  ),
  ranked as (
    select
      compatible.*,
      row_number() over (
        partition by compatible.target_store
        order by
          case
            when compatible.target_store = any (array['caprabo','eroski','hiperdino'])
              then compatible.price_total
            else compatible.price_per_unit
          end asc nulls last,
          case
            when compatible.target_store = any (array['caprabo','eroski','hiperdino'])
              then null
            else compatible.price_total
          end asc nulls last,
          (compatible.relation = 'identico') desc,
          compatible.confidence desc,
          compatible.target_product_id
      ) as store_rank
    from compatible
  )
  select
    ranked.target_store,
    ranked.target_product_id,
    ranked.display_name,
    ranked.thumbnail,
    ranked.price_total,
    ranked.price_per_unit,
    ranked.price_per_unit_unit,
    case when ranked.relation = 'identico' then 'exact_gtin' else 'semantic' end,
    ranked.confidence,
    ranked.vector_score,
    ranked.lexical_score,
    ranked.quantity_ratio,
    coalesce(
      case
        when ranked.target_store = any (array['caprabo','eroski','hiperdino'])
          then ranked.price_total
        else ranked.price_per_unit
      end < source_price.comparison_price,
      false
    ) as is_cheaper
  from ranked
  cross join source_price
  where ranked.store_rank <= 2
  order by ranked.store_order, ranked.store_rank;
end;
$function$;

revoke all on function comparator_internal.catalog_cheaper_products_v5(text, text, text[])
  from public, anon;
grant execute on function comparator_internal.catalog_cheaper_products_v5(text, text, text[])
  to authenticated, service_role;

-- La RPC pública v3 seguía conteniendo una copia antigua del comparador. Se
-- enruta al contrato interno ya endurecido para que tampoco pueda servir
-- resultados almacenados cuando el vector fuente está pendiente.
create or replace function public.catalog_cheaper_products_v3(
  p_source_store text,
  p_source_product_id text,
  p_stores text[]
)
returns table(
  store text,
  id text,
  display_name text,
  thumbnail text,
  price_total numeric,
  price_per_unit numeric,
  price_per_unit_unit text,
  match_kind text,
  match_score real,
  vector_score real,
  lexical_score real,
  quantity_ratio numeric
)
language sql
volatile
security invoker
set search_path = ''
as $function$
  select *
  from comparator_internal.catalog_cheaper_products_v3(
    p_source_store,
    p_source_product_id,
    p_stores
  );
$function$;

revoke all on function public.catalog_cheaper_products_v3(text, text, text[])
  from public, anon;
grant execute on function public.catalog_cheaper_products_v3(text, text, text[])
  to authenticated, service_role;
