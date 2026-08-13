-- Caprabo, Eroski e HiperDino no publican un precio por unidad fiable.
-- Para esos destinos el comparador ordena los equivalentes por el precio total
-- del envase. El resto mantiene €/l, €/kg o €/ud como métrica principal y el
-- precio total como desempate. El matching estricto y la caché no cambian.

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
    and source.embedded_at is not null;

  if not found then
    return;
  end if;

  for v_requested in
    select requested.store, min(requested.ordinality) as store_order
    from unnest(coalesce(p_stores, array[]::text[])) with ordinality as requested(store, ordinality)
    where requested.store = any (array[
      'mercadona','esclat','carrefour','bonarea','consum','dia','sorli','eroski',
      'caprabo','condis','ametller','aldi','hiperdino','alcampo','plusfresc'
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
    from unnest(coalesce(p_stores, array[]::text[])) with ordinality as requested(store, ordinality)
    where requested.store = any (array[
      'mercadona','esclat','carrefour','bonarea','consum','dia','sorli','eroski',
      'caprabo','condis','ametller','aldi','hiperdino','alcampo','plusfresc'
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
