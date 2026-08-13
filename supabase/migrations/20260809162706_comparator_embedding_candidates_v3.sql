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
  'Recuperación híbrida interna v3: GTIN exacto, HNSW y trigramas indexados con coincidencia por palabras; conserva filtros semánticos duros.';

revoke all on function public.catalog_embedding_candidates_v3(text, text, text[], integer, real)
  from public, anon, authenticated;
grant execute on function public.catalog_embedding_candidates_v3(text, text, text[], integer, real)
  to service_role;
