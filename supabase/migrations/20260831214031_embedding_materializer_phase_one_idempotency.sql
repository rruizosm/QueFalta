-- Fase 1 del pipeline de embeddings: identidad explícita e idempotencia E2E.
--
-- La migración es deliberadamente aditiva. No rellena las columnas nuevas en
-- las ~200k filas existentes: content_hash sigue siendo el hash exacto del
-- texto legacy y el materializador adopta el contrato nuevo de forma gradual.

set lock_timeout = '5s';
set statement_timeout = '60s';

do $checks$
begin
  if to_regclass('public.catalog_product_embeddings') is null then
    raise exception 'Falta public.catalog_product_embeddings';
  end if;
  if to_regclass('pgmq.q_catalog_embedding_jobs') is null then
    raise exception 'Falta la cola pgmq catalog_embedding_jobs';
  end if;
  if to_regclass('comparator_internal.catalog_embedding_pipeline_control') is null then
    raise exception 'Falta el control de Fase 0';
  end if;
  if not exists (
    select 1
    from comparator_internal.catalog_embedding_pipeline_control as control
    where control.singleton
      and control.mode = 'paused'
  ) then
    raise exception 'Fase 1 requiere el pipeline pausado';
  end if;
  if exists (
    select 1
    from pgmq.q_catalog_embedding_jobs as job
    where job.vt > pg_catalog.now()
  ) then
    raise exception 'Fase 1 requiere cero trabajos en vuelo';
  end if;
  if exists (
    select 1
    from pgmq.q_catalog_embedding_jobs as job
    where job.message ? 'store'
      and job.message ? 'productId'
      and (job.message ? 'embeddingInputHash' or job.message ? 'contentHash')
    group by
      job.message ->> 'store',
      job.message ->> 'productId',
      coalesce(job.message ->> 'embeddingInputHash', job.message ->> 'contentHash'),
      coalesce(job.message ->> 'model', 'text-embedding-3-small')
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'La cola contiene identidades activas duplicadas; deduplicar antes de Fase 1';
  end if;
end
$checks$;

alter table public.catalog_product_embeddings
  add column if not exists embedding_input_hash text,
  add column if not exists semantic_identity_hash text,
  add column if not exists match_metadata_hash text,
  add column if not exists category_family text;

alter table public.catalog_product_embeddings
  drop constraint if exists catalog_product_embeddings_input_hash_check,
  add constraint catalog_product_embeddings_input_hash_check check (
    embedding_input_hash is null
    or embedding_input_hash ~ '^[0-9a-f]{64}$'
  ) not valid,
  drop constraint if exists catalog_product_embeddings_input_hash_alias_check,
  add constraint catalog_product_embeddings_input_hash_alias_check check (
    embedding_input_hash is null
    or embedding_input_hash = content_hash
  ) not valid,
  drop constraint if exists catalog_product_embeddings_semantic_hash_check,
  add constraint catalog_product_embeddings_semantic_hash_check check (
    semantic_identity_hash is null
    or semantic_identity_hash ~ '^[0-9a-f]{64}$'
  ) not valid,
  drop constraint if exists catalog_product_embeddings_metadata_hash_check,
  add constraint catalog_product_embeddings_metadata_hash_check check (
    match_metadata_hash is null
    or match_metadata_hash ~ '^[0-9a-f]{64}$'
  ) not valid,
  drop constraint if exists catalog_product_embeddings_category_family_check,
  add constraint catalog_product_embeddings_category_family_check check (
    category_family is null
    or category_family ~ '^[a-z][a-z0-9_]{0,63}$'
  ) not valid;

comment on column public.catalog_product_embeddings.embedding_input_hash is
  'SHA-256 del texto exacto enviado al modelo. NULL identifica una fila legacy y usa content_hash como fallback.';
comment on column public.catalog_product_embeddings.semantic_identity_hash is
  'SHA-256 de la identidad semántica estable usada para decidir si hay que reconstruir el input v1; no es el hash del texto enviado al modelo.';
comment on column public.catalog_product_embeddings.match_metadata_hash is
  'SHA-256 canónico de GTIN, unidad, cantidad, publicación, familia y filtros de matching; no invalida el vector.';
comment on column public.catalog_product_embeddings.category_family is
  'Familia estable derivada del nombre, independiente del árbol de categorías de cada supermercado.';

-- La unicidad vive mientras el mensaje está activo. Al borrarlo o archivarlo,
-- la misma identidad puede encolarse de nuevo (p. ej. una futura vuelta A→B→A).
create unique index if not exists catalog_embedding_jobs_identity_uidx
on pgmq.q_catalog_embedding_jobs (
  ((message ->> 'store')),
  ((message ->> 'productId')),
  ((coalesce(message ->> 'embeddingInputHash', message ->> 'contentHash'))),
  ((coalesce(message ->> 'model', 'text-embedding-3-small')))
)
where message ? 'store'
  and message ? 'productId'
  and (message ? 'embeddingInputHash' or message ? 'contentHash');

comment on index pgmq.catalog_embedding_jobs_identity_uidx is
  'Como máximo un trabajo activo por producto, input exacto y modelo; compatible con payloads legacy.';

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
    new.embedding := null;
    new.model := null;
    new.embedded_at := null;
  end if;

  return new;
end
$function$;

revoke all on function comparator_internal.invalidate_catalog_embedding()
  from public, anon, authenticated;

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
  if v_row.has_embedding and v_row.model = p_target_model then
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

create or replace function comparator_internal.enqueue_catalog_embedding_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_input_changed boolean;
  v_republished boolean;
  v_semantic_identity_changed boolean;
begin
  if tg_op = 'INSERT' then
    v_input_changed := true;
    v_republished := false;
    v_semantic_identity_changed := true;
  else
    v_input_changed := coalesce(old.embedding_input_hash, old.content_hash)
      is distinct from coalesce(new.embedding_input_hash, new.content_hash);
    v_republished := not old.published and new.published;
    v_semantic_identity_changed := old.semantic_identity_hash
      is distinct from new.semantic_identity_hash;
  end if;

  if v_input_changed or v_semantic_identity_changed or v_republished then
    perform comparator_internal.ensure_catalog_embedding_job(
      new.store,
      new.product_id,
      coalesce(new.embedding_input_hash, new.content_hash),
      'text-embedding-3-small'
    );
  end if;

  return new;
end
$function$;

revoke all on function comparator_internal.enqueue_catalog_embedding_job()
  from public, anon, authenticated;

drop trigger if exists catalog_product_embeddings_invalidate
  on public.catalog_product_embeddings;
drop trigger if exists catalog_product_embeddings_enqueue_insert
  on public.catalog_product_embeddings;
drop trigger if exists catalog_product_embeddings_enqueue_update
  on public.catalog_product_embeddings;

create trigger catalog_product_embeddings_invalidate
before update of content_hash, embedding_input_hash
on public.catalog_product_embeddings
for each row execute function comparator_internal.invalidate_catalog_embedding();

create trigger catalog_product_embeddings_enqueue_insert
after insert
on public.catalog_product_embeddings
for each row execute function comparator_internal.enqueue_catalog_embedding_job();

create trigger catalog_product_embeddings_enqueue_update
after update of content_hash, embedding_input_hash, semantic_identity_hash, published
on public.catalog_product_embeddings
for each row execute function comparator_internal.enqueue_catalog_embedding_job();

comment on function comparator_internal.invalidate_catalog_embedding() is
  'Invalida el vector solo cuando cambia el hash efectivo del input; content_version y metadatos no tocan HNSW.';
comment on function comparator_internal.enqueue_catalog_embedding_job() is
  'Encola de forma idempotente por tienda/producto/input/model y mantiene payload compatible con workers legacy.';

-- La eliminación y la reparación forman una única transacción. Esto cierra la
-- carrera A -> B -> A: si un worker borra A como obsoleto después de que la
-- fila haya vuelto a A, la identidad vigente se vuelve a garantizar aquí.
create or replace function public.catalog_delete_embedding_jobs(p_msg_ids bigint[])
returns bigint[]
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_job jsonb;
  v_jobs jsonb;
  v_deleted bigint[];
begin
  if coalesce(pg_catalog.cardinality(p_msg_ids), 0) = 0 then
    return array[]::bigint[];
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'store', target.store,
        'productId', target.product_id
      )
      order by target.store, target.product_id
    ),
    '[]'::jsonb
  )
  into v_jobs
  from (
    select distinct
      job.message ->> 'store' as store,
      job.message ->> 'productId' as product_id
    from pgmq.q_catalog_embedding_jobs as job
    where job.msg_id = any (p_msg_ids)
      and job.message ? 'store'
      and job.message ? 'productId'
  ) as target;

  -- Orden global producto -> cola, igual que el trigger. Bloquear primero evita
  -- el deadlock producto->queue / queue->producto con un sync concurrente.
  for v_job in
    select item.value
    from pg_catalog.jsonb_array_elements(v_jobs) as item(value)
  loop
    perform 1
    from public.catalog_product_embeddings as row
    where row.store = v_job ->> 'store'
      and row.product_id = v_job ->> 'productId'
    for update;
  end loop;

  select coalesce(
    pg_catalog.array_agg(deleted.msg_id),
    array[]::bigint[]
  )
  into v_deleted
  from pgmq.delete('catalog_embedding_jobs', p_msg_ids) as deleted(msg_id);

  for v_job in
    select item.value
    from pg_catalog.jsonb_array_elements(v_jobs) as item(value)
  loop
    perform comparator_internal.ensure_catalog_embedding_job(
      v_job ->> 'store',
      v_job ->> 'productId',
      null,
      'text-embedding-3-small'
    );
  end loop;

  return v_deleted;
end
$function$;

revoke all on function public.catalog_delete_embedding_jobs(bigint[])
  from public, anon, authenticated;
grant execute on function public.catalog_delete_embedding_jobs(bigint[])
  to service_role;

comment on function public.catalog_delete_embedding_jobs(bigint[]) is
  'Borra trabajos y, en la misma transacción, garantiza la identidad actual si el producto sigue necesitando embedding.';

create or replace function public.catalog_delete_embedding_job(p_msg_id bigint)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $function$
  select p_msg_id = any (public.catalog_delete_embedding_jobs(array[p_msg_id]));
$function$;

revoke all on function public.catalog_delete_embedding_job(bigint)
  from public, anon, authenticated;
grant execute on function public.catalog_delete_embedding_job(bigint)
  to service_role;

create or replace function public.catalog_active_embedding_job_identities(
  p_store text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if p_store is null or p_store = '' or p_store <> pg_catalog.lower(p_store) then
    raise exception 'Tienda invalida';
  end if;

  with suppressions as (
    select distinct
      job.message ->> 'productId' as product_id,
      coalesce(
        job.message ->> 'embeddingInputHash',
        job.message ->> 'contentHash'
      ) as embedding_input_hash,
      coalesce(
        job.message ->> 'model',
        'text-embedding-3-small'
      ) as model,
      'active'::text as suppression_state
    from pgmq.q_catalog_embedding_jobs as job
    where job.message ->> 'store' = p_store
      and job.message ? 'store'
      and job.message ? 'productId'
      and (job.message ? 'embeddingInputHash' or job.message ? 'contentHash')
    union
    select distinct
      failure.product_id,
      failure.content_hash,
      'text-embedding-3-small'::text,
      'terminal_failure'::text
    from public.catalog_embedding_failures as failure
    where failure.store = p_store
      and failure.archived_at is not null
  )
  select pg_catalog.jsonb_build_object(
    'jobs', coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'product_id', suppression.product_id,
          'embedding_input_hash', suppression.embedding_input_hash,
          'model', suppression.model,
          'suppression_state', suppression.suppression_state
        )
        order by suppression.product_id,
          suppression.embedding_input_hash,
          suppression.model,
          suppression.suppression_state
      ),
      '[]'::jsonb
    ),
    'activeJobs', pg_catalog.count(*) filter (
      where suppression.suppression_state = 'active'
    ),
    'terminalFailures', pg_catalog.count(*) filter (
      where suppression.suppression_state = 'terminal_failure'
    )
  )
  into v_result
  from suppressions as suppression;

  return v_result;
end
$function$;

revoke all on function public.catalog_active_embedding_job_identities(text)
  from public, anon, authenticated;
grant execute on function public.catalog_active_embedding_job_identities(text)
  to service_role;

create or replace function public.catalog_ensure_embedding_jobs(
  p_jobs jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_job jsonb;
  v_store text;
  v_product_id text;
  v_expected_hash text;
  v_model text;
  v_requested integer;
  v_enqueued integer := 0;
begin
  if p_jobs is null or pg_catalog.jsonb_typeof(p_jobs) <> 'array' then
    raise exception 'p_jobs debe ser un array JSON';
  end if;
  v_requested := pg_catalog.jsonb_array_length(p_jobs);
  if v_requested not between 1 and 500 then
    raise exception 'p_jobs debe contener entre 1 y 500 trabajos';
  end if;

  for v_job in
    select distinct on (
      item.value ->> 'store',
      item.value ->> 'productId',
      item.value ->> 'embeddingInputHash',
      coalesce(item.value ->> 'model', 'text-embedding-3-small')
    ) item.value
    from pg_catalog.jsonb_array_elements(p_jobs) as item(value)
    order by
      item.value ->> 'store',
      item.value ->> 'productId',
      item.value ->> 'embeddingInputHash',
      coalesce(item.value ->> 'model', 'text-embedding-3-small')
  loop
    v_store := nullif(v_job ->> 'store', '');
    v_product_id := nullif(v_job ->> 'productId', '');
    v_expected_hash := nullif(v_job ->> 'embeddingInputHash', '');
    v_model := coalesce(
      nullif(v_job ->> 'model', ''),
      'text-embedding-3-small'
    );

    if comparator_internal.ensure_catalog_embedding_job(
      v_store,
      v_product_id,
      v_expected_hash,
      v_model
    ) then
      v_enqueued := v_enqueued + 1;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'requestedJobs', v_requested,
    'enqueuedJobs', v_enqueued
  );
end
$function$;

revoke all on function public.catalog_ensure_embedding_jobs(jsonb)
  from public, anon, authenticated;
grant execute on function public.catalog_ensure_embedding_jobs(jsonb)
  to service_role;

comment on function public.catalog_active_embedding_job_identities(text) is
  'Devuelve en un único snapshot JSON las identidades activas (incluidas las invisibles/en vuelo) y fallos terminales para no duplicar ni reintentar reparaciones automáticamente.';
comment on function public.catalog_ensure_embedding_jobs(jsonb) is
  'Revalida el estado actual y garantiza un trabajo para cada producto publicado sin vector/modelo vigente; solo service_role.';

alter table comparator_internal.catalog_embedding_runs
  add column if not exists repair_products integer not null default 0;

alter table comparator_internal.catalog_embedding_runs
  drop constraint if exists catalog_embedding_runs_repair_products_check,
  add constraint catalog_embedding_runs_repair_products_check check (
    repair_products >= 0
      and repair_products <= metadata_only_products + unchanged_products
  ) not valid,
  drop constraint if exists catalog_embedding_runs_expected_jobs_check,
  add constraint catalog_embedding_runs_expected_jobs_check check (
    expected_embedding_jobs <= new_products
      + semantic_changed_products
      + republished_products
      + repair_products
  ) not valid;

comment on column comparator_internal.catalog_embedding_runs.repair_products is
  'Productos sin vector o con modelo obsoleto para los que no existía un trabajo activo; se solapan con unchanged/metadata y no forman parte del desglose source_products.';

-- Sobrecarga Phase 1. Se conserva temporalmente la firma de Phase 0 para que
-- el despliegue migración -> worker -> materializador sea compatible.
create or replace function public.catalog_begin_embedding_run(
  p_store text,
  p_source_products integer,
  p_existing_products integer,
  p_new_products integer,
  p_semantic_changed_products integer,
  p_metadata_only_products integer,
  p_republished_products integer,
  p_repair_products integer,
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
  if least(
    p_source_products,
    p_existing_products,
    p_new_products,
    p_semantic_changed_products,
    p_metadata_only_products,
    p_republished_products,
    p_repair_products,
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
      + p_republished_products
      + p_repair_products then
    raise exception 'expected_embedding_jobs supera los cambios o reparaciones que pueden encolar';
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
        updated_at = pg_catalog.now()
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
    repair_products,
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
    p_repair_products,
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
    'repairProducts', p_repair_products,
    'changeRatio', v_change_ratio,
    'reason', coalesce(v_anomaly_reason, v_control.reason)
  );
end;
$function$;

revoke all on function public.catalog_begin_embedding_run(
  text, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer, boolean
) from public, anon, authenticated;
grant execute on function public.catalog_begin_embedding_run(
  text, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer, boolean
) to service_role;

-- match_metadata_hash invalida la caché de matching, pero nunca el embedding.
create or replace function comparator_internal.bump_catalog_match_store_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_store text;
  v_changed boolean := true;
begin
  if tg_op = 'UPDATE' then
    v_store := new.store;
    v_changed := old.display_name is distinct from new.display_name
      or old.category_family is distinct from new.category_family
      or old.canonical_unit is distinct from new.canonical_unit
      or old.quantity_base is distinct from new.quantity_base
      or old.global_gtin is distinct from new.global_gtin
      or old.attributes is distinct from new.attributes
      or old.match_metadata_hash is distinct from new.match_metadata_hash
      or coalesce(old.embedding_input_hash, old.content_hash)
        is distinct from coalesce(new.embedding_input_hash, new.content_hash)
      or old.content_version is distinct from new.content_version
      or old.embedded_at is distinct from new.embedded_at
      or old.model is distinct from new.model
      or old.published is distinct from new.published;

    if v_changed then
      delete from public.catalog_product_match_cache_status as status
      where status.source_store = new.store
        and status.source_product_id = new.product_id;
    end if;
  elsif tg_op = 'DELETE' then
    v_store := old.store;
  else
    v_store := new.store;
  end if;

  if v_changed then
    insert into comparator_internal.catalog_match_store_versions as version (store, generation, updated_at)
    values (v_store, 1, now())
    on conflict (store) do update
      set generation = version.generation + 1,
          updated_at = excluded.updated_at;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

revoke all on function comparator_internal.bump_catalog_match_store_version()
  from public, anon, authenticated;
grant execute on function comparator_internal.bump_catalog_match_store_version()
  to service_role;

drop trigger if exists catalog_product_embeddings_match_cache_update
  on public.catalog_product_embeddings;

create trigger catalog_product_embeddings_match_cache_update
after update of display_name, category_family, canonical_unit, quantity_base,
  global_gtin, attributes, match_metadata_hash, content_hash,
  embedding_input_hash, content_version, embedded_at, model, published
on public.catalog_product_embeddings
for each row
when (
  old.display_name is distinct from new.display_name
  or old.category_family is distinct from new.category_family
  or old.canonical_unit is distinct from new.canonical_unit
  or old.quantity_base is distinct from new.quantity_base
  or old.global_gtin is distinct from new.global_gtin
  or old.attributes is distinct from new.attributes
  or old.match_metadata_hash is distinct from new.match_metadata_hash
  or coalesce(old.embedding_input_hash, old.content_hash)
    is distinct from coalesce(new.embedding_input_hash, new.content_hash)
  or old.content_version is distinct from new.content_version
  or old.embedded_at is distinct from new.embedded_at
  or old.model is distinct from new.model
  or old.published is distinct from new.published
)
execute function comparator_internal.bump_catalog_match_store_version();
