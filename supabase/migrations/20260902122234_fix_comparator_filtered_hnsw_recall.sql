-- Recupera el recall perdido por los filtros posteriores al HNSW. Con el modo
-- por defecto (`off`), pgvector detiene el índice tras sus primeros vecinos
-- globales y puede devolver 0-6 filas de una tienda aunque existan equivalentes
-- válidos. El modo iterativo amplía únicamente las llamadas a esta función.
alter function public.catalog_embedding_candidates_v3(text, text, text[], integer, real)
  set hnsw.iterative_scan = 'relaxed_order';

-- Normaliza solo las marcas propias que pueden preceder al sustantivo del
-- producto. catalog_product_family_v1 mantiene deliberadamente el anclaje de
-- "huevos" al comienzo para no clasificar pasta/flanes "al huevo" como huevos.
create or replace function public.catalog_product_identity_family_v1(
  p_name text,
  p_category text default null
)
returns text
language sql
immutable
set search_path = ''
as $function$
  select public.catalog_product_family_v1(
    regexp_replace(
      coalesce(p_name, ''),
      '^[[:space:]]*(hacendado|bonpreu|bonarea|carrefour|consum|dia|deliplus|aliada|eroski|caprabo|sorli|ametller|alcampo|auchan|plusfresc|gadis|froiz|ahorramas|hiperdino)[[:space:]]+',
      '',
      'i'
    ),
    p_category
  );
$function$;

revoke all on function public.catalog_product_identity_family_v1(text, text)
  from public, anon, authenticated;
grant execute on function public.catalog_product_identity_family_v1(text, text)
  to service_role;

create or replace function public.catalog_product_identity_compatible_v1(
  p_left_name text,
  p_left_category text,
  p_right_name text,
  p_right_category text
)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  with signals as (
    select
      public.catalog_product_identity_family_v1(p_left_name, p_left_category) as left_family,
      public.catalog_product_identity_family_v1(p_right_name, p_right_category) as right_family,
      public.catalog_product_variants_v1(p_left_name) as left_variants,
      public.catalog_product_variants_v1(p_right_name) as right_variants,
      lower(public.f_unaccent(coalesce(p_left_name, ''))) as left_name,
      lower(public.f_unaccent(coalesce(p_right_name, ''))) as right_name
  ), normalized as (
    select
      left_family,
      right_family,
      left_name,
      right_name,
      case when left_family = 'coffee'
        then array_remove(left_variants, 'coffee')
        when left_family = 'cocoa_drink'
        then array_remove(left_variants, 'chocolate')
        when left_family = any (array['beer', 'wine', 'sparkling_wine', 'spirit'])
        then array_remove(left_variants, 'sugar_free')
        else left_variants
      end as left_variants,
      case when right_family = 'coffee'
        then array_remove(right_variants, 'coffee')
        when right_family = 'cocoa_drink'
        then array_remove(right_variants, 'chocolate')
        when right_family = any (array['beer', 'wine', 'sparkling_wine', 'spirit'])
        then array_remove(right_variants, 'sugar_free')
        else right_variants
      end as right_variants
    from signals
  )
  select
    left_family is not distinct from right_family
    and left_variants = right_variants
    and (
      left_family is distinct from 'eggs'
      or (
        (left_name ~ '\m(codorniz|guatlla)\M')
          = (right_name ~ '\m(codorniz|guatlla)\M')
        and (left_name ~ '\m(cocido|cocida|cocidos|cocidas|duro|dura|duros|duras|dur|durs|dures)\M')
          = (right_name ~ '\m(cocido|cocida|cocidos|cocidas|duro|dura|duros|duras|dur|durs|dures)\M')
      )
    )
  from normalized;
$function$;

revoke all on function public.catalog_product_identity_compatible_v1(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.catalog_product_identity_compatible_v1(text, text, text, text)
  to service_role;

-- Conserva el umbral validado de 0,60. El estrecho margen 0,59-0,60 solo se
-- admite cuando una familia determinista reconocida y todas sus variantes son
-- compatibles; esto recupera nombres como "Huevos grandes L" frente a
-- "BONPREU Huevos frescos clase L/XL" sin abrir el umbral global.
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
    source.category,
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
      target.category as target_category,
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
         and (
           scored.hybrid_score >= 0.60
           or (
             scored.hybrid_score >= 0.59
             and public.catalog_product_identity_family_v1(
               v_source.display_name,
               v_source.category
             ) is not null
             and public.catalog_product_identity_compatible_v1(
               v_source.display_name,
               v_source.category,
               scored.target_name,
               scored.target_category
             )
           )
         )
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

-- Fuerza una reconstrucción perezosa: no recalcula el catálogo completo ni
-- toca el HNSW, pero cada pareja consultada deja de reutilizar un vacío creado
-- con la búsqueda no iterativa.
update comparator_internal.catalog_match_store_versions
set generation = generation + 1,
    updated_at = now();
