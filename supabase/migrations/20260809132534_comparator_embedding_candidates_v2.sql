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
