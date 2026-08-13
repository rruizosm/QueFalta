-- Evita duplicar trabajos pgmq durante INSERT ... ON CONFLICT DO UPDATE.
--
-- Un trigger BEFORE INSERT con efectos laterales se ejecuta antes de resolver el
-- conflicto y el mismo UPSERT vuelve a ejecutar el trigger de UPDATE. Separamos
-- la invalidacion del vector (BEFORE UPDATE) del encolado (AFTER INSERT/UPDATE).

create or replace function comparator_internal.invalidate_catalog_embedding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.content_hash is distinct from new.content_hash
    or old.content_version is distinct from new.content_version
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

drop trigger if exists catalog_product_embeddings_enqueue
  on public.catalog_product_embeddings;
drop trigger if exists catalog_product_embeddings_invalidate
  on public.catalog_product_embeddings;
drop trigger if exists catalog_product_embeddings_enqueue_insert
  on public.catalog_product_embeddings;
drop trigger if exists catalog_product_embeddings_enqueue_update
  on public.catalog_product_embeddings;

create trigger catalog_product_embeddings_invalidate
before update of content_hash, content_version
on public.catalog_product_embeddings
for each row execute function comparator_internal.invalidate_catalog_embedding();

create trigger catalog_product_embeddings_enqueue_insert
after insert
on public.catalog_product_embeddings
for each row execute function comparator_internal.enqueue_catalog_embedding_job();

create trigger catalog_product_embeddings_enqueue_update
after update of content_hash, content_version, published
on public.catalog_product_embeddings
for each row execute function comparator_internal.enqueue_catalog_embedding_job();

comment on function comparator_internal.invalidate_catalog_embedding() is
  'Invalida el vector antes de guardar un cambio semantico; no produce efectos laterales durante un UPSERT.';

comment on function comparator_internal.enqueue_catalog_embedding_job() is
  'Encola despues de resolver INSERT/UPDATE para producir un unico trabajo pgmq por UPSERT.';
