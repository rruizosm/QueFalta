-- Pipeline incremental de embeddings. Depende de
-- 20260809120628_comparator_embeddings_layer.sql.
--
-- Esta migración instala la infraestructura y deja el cron APAGADO. El cron se
-- habilita solo después de desplegar catalog-embed y configurar los secretos.

create extension if not exists pgmq;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create schema if not exists comparator_internal;
revoke all on schema comparator_internal from public, anon, authenticated;

do $migration$
begin
  if not exists (
    select 1 from pgmq.list_queues() where queue_name = 'catalog_embedding_jobs'
  ) then
    perform pgmq.create('catalog_embedding_jobs');
  end if;
end
$migration$;

create table public.catalog_embedding_failures (
  msg_id bigint primary key,
  store text not null,
  product_id text not null,
  content_hash text not null,
  read_count integer not null,
  error_code text,
  error_message text not null,
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint catalog_embedding_failures_product_fk
    foreign key (store, product_id)
    references public.catalog_product_embeddings (store, product_id)
    on delete cascade,
  constraint catalog_embedding_failures_read_count_check check (read_count > 0),
  constraint catalog_embedding_failures_hash_check check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint catalog_embedding_failures_message_check check (length(error_message) between 1 and 1000)
);

alter table public.catalog_embedding_failures enable row level security;
revoke all on table public.catalog_embedding_failures from public, anon, authenticated;
grant all on table public.catalog_embedding_failures to service_role;

create index catalog_embedding_failures_open_idx
  on public.catalog_embedding_failures (last_failed_at desc)
  where archived_at is null;

create or replace function comparator_internal.enqueue_catalog_embedding_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  semantic_change boolean;
  republished boolean;
begin
  if tg_op = 'INSERT' then
    semantic_change := true;
    republished := false;
  else
    semantic_change := old.content_hash is distinct from new.content_hash
      or old.content_version is distinct from new.content_version;
    republished := not old.published and new.published;
  end if;

  if tg_op = 'UPDATE' and semantic_change then
    new.embedding := null;
    new.model := null;
    new.embedded_at := null;
  end if;

  if new.published
    and new.embedding is null
    and (semantic_change or republished)
  then
    perform pgmq.send(
      queue_name => 'catalog_embedding_jobs',
      msg => pg_catalog.jsonb_build_object(
        'store', new.store,
        'productId', new.product_id,
        'contentHash', new.content_hash,
        'contentVersion', new.content_version
      )
    );
  end if;

  return new;
end
$function$;

revoke all on function comparator_internal.enqueue_catalog_embedding_job()
  from public, anon, authenticated;

drop trigger if exists catalog_product_embeddings_enqueue on public.catalog_product_embeddings;
create trigger catalog_product_embeddings_enqueue
before insert or update of content_hash, content_version, published
on public.catalog_product_embeddings
for each row execute function comparator_internal.enqueue_catalog_embedding_job();

create or replace function comparator_internal.dispatch_catalog_embedding_jobs(
  p_batch_size integer default 100,
  p_max_requests integer default 3,
  p_visibility_timeout integer default 180,
  p_http_timeout_milliseconds integer default 60000
)
returns bigint[]
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  project_url text;
  worker_token text;
  batch jsonb;
  request_ids bigint[] := array[]::bigint[];
  request_id bigint;
begin
  if p_batch_size not between 1 and 200 then
    raise exception 'p_batch_size debe estar entre 1 y 200';
  end if;
  if p_max_requests not between 1 and 10 then
    raise exception 'p_max_requests debe estar entre 1 y 10';
  end if;
  if p_visibility_timeout not between 30 and 900 then
    raise exception 'p_visibility_timeout debe estar entre 30 y 900 segundos';
  end if;

  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'catalog_embed_project_url';

  select decrypted_secret into worker_token
  from vault.decrypted_secrets
  where name = 'catalog_embed_worker_token';

  if project_url is null or worker_token is null then
    raise exception 'Faltan secretos Vault catalog_embed_project_url/catalog_embed_worker_token';
  end if;

  project_url := pg_catalog.rtrim(project_url, '/');

  for batch in
    with jobs as materialized (
      select
        q.*,
        pg_catalog.row_number() over (order by q.msg_id) as row_number
      from pgmq.read(
        queue_name => 'catalog_embedding_jobs',
        vt => p_visibility_timeout,
        qty => p_batch_size * p_max_requests
      ) as q
    )
    select pg_catalog.jsonb_agg(
      jobs.message || pg_catalog.jsonb_build_object(
        'msgId', jobs.msg_id,
        'readCount', jobs.read_ct
      )
      order by jobs.msg_id
    )
    from jobs
    group by ((jobs.row_number - 1) / p_batch_size)
    order by ((jobs.row_number - 1) / p_batch_size)
  loop
    select net.http_post(
      url => project_url || '/functions/v1/catalog-embed',
      headers => pg_catalog.jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Embedding-Worker-Token', worker_token
      ),
      body => batch,
      timeout_milliseconds => p_http_timeout_milliseconds
    ) into request_id;
    request_ids := pg_catalog.array_append(request_ids, request_id);
  end loop;

  return request_ids;
end
$function$;

revoke all on function comparator_internal.dispatch_catalog_embedding_jobs(integer, integer, integer, integer)
  from public, anon, authenticated;

grant usage on schema pgmq to service_role;
grant execute on function pgmq.delete(text, bigint) to service_role;
grant execute on function pgmq.delete(text, bigint[]) to service_role;
grant execute on function pgmq.archive(text, bigint) to service_role;

create or replace function public.catalog_delete_embedding_job(p_msg_id bigint)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $function$
  select pgmq.delete('catalog_embedding_jobs', p_msg_id);
$function$;

revoke all on function public.catalog_delete_embedding_job(bigint)
  from public, anon, authenticated;
grant execute on function public.catalog_delete_embedding_job(bigint) to service_role;

create or replace function public.catalog_delete_embedding_jobs(p_msg_ids bigint[])
returns bigint[]
language sql
volatile
security invoker
set search_path = ''
as $function$
  select coalesce(pg_catalog.array_agg(deleted.msg_id), array[]::bigint[])
  from pgmq.delete('catalog_embedding_jobs', p_msg_ids) as deleted(msg_id);
$function$;

revoke all on function public.catalog_delete_embedding_jobs(bigint[])
  from public, anon, authenticated;
grant execute on function public.catalog_delete_embedding_jobs(bigint[]) to service_role;

create or replace function public.catalog_fail_embedding_job(
  p_msg_id bigint,
  p_store text,
  p_product_id text,
  p_content_hash text,
  p_read_count integer,
  p_error_code text,
  p_error_message text,
  p_max_attempts integer default 5
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  archived boolean := false;
begin
  if p_max_attempts not between 1 and 20 then
    raise exception 'p_max_attempts debe estar entre 1 y 20';
  end if;

  insert into public.catalog_embedding_failures (
    msg_id, store, product_id, content_hash, read_count,
    error_code, error_message, last_failed_at, archived_at
  ) values (
    p_msg_id, p_store, p_product_id, p_content_hash, p_read_count,
    pg_catalog.left(p_error_code, 100),
    pg_catalog.left(p_error_message, 1000),
    pg_catalog.now(),
    case when p_read_count >= p_max_attempts then pg_catalog.now() else null end
  )
  on conflict (msg_id) do update set
    read_count = excluded.read_count,
    error_code = excluded.error_code,
    error_message = excluded.error_message,
    last_failed_at = excluded.last_failed_at,
    archived_at = excluded.archived_at;

  if p_read_count >= p_max_attempts then
    select pgmq.archive('catalog_embedding_jobs', p_msg_id) into archived;
  end if;

  return archived;
end
$function$;

revoke all on function public.catalog_fail_embedding_job(bigint, text, text, text, integer, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.catalog_fail_embedding_job(bigint, text, text, text, integer, text, text, integer)
  to service_role;

comment on function comparator_internal.dispatch_catalog_embedding_jobs(integer, integer, integer, integer) is
  'Lee pgmq por lotes e invoca catalog-embed mediante pg_net. Requiere secretos Vault; el cron se habilita aparte.';
