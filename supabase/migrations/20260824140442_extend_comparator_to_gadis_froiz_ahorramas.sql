-- Incorpora Gadis, Froiz y Ahorramás al radar de ahorro híbrido. El cliente
-- ya muestra el CTA en sus fichas y usa v6; faltaban el snapshot semántico,
-- la resolución de detalle/precio y las allowlists internas de v3/v5.

alter table public.catalog_product_embeddings
  drop constraint catalog_product_embeddings_store_check;

alter table public.catalog_product_embeddings
  add constraint catalog_product_embeddings_store_check check (
    store = any (array[
      'alcampo', 'aldi', 'ametller', 'ahorramas', 'bonarea', 'caprabo',
      'carrefour', 'condis', 'consum', 'dia', 'eroski', 'esclat', 'froiz',
      'gadis', 'hiperdino', 'mercadona', 'plusfresc', 'sorli'
    ]::text[])
  );

create or replace function public.catalog_embedding_semantic_name_v1(p_name text)
returns text
language sql
stable
set search_path = ''
as $function$
  with normalized as (
    select regexp_replace(
      lower(public.f_unaccent(coalesce(p_name, ''))),
      '\m(burger|burguer|hamburguesas?)\M',
      'hamburguesa',
      'g'
    ) as value
  )
  select trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                normalized.value,
                '\([^)]*\)', ' ', 'g'
              ),
              '\m[0-9]+([.,][0-9]+)?[[:space:]]*(kg|g|gr|ml|cl|l|ud|uds|u)\M', ' ', 'g'
            ),
            '\m(hacendado|bonpreu|bonarea|carrefour|consum|dia|deliplus|aliada|eroski|caprabo|sorli|ametller|alcampo|auchan|plusfresc|gadis|froiz|ahorramas)\M', ' ', 'g'
          ),
          '\m(brik|brick|carton|botella|garrafa|lata|tarro|bote|bolsa|paquete|bandeja|envase|granel)\M', ' ', 'g'
        ),
        '[^a-z0-9]+', ' ', 'g'
      ),
      '[[:space:]]+', ' ', 'g'
    )
  )
  from normalized;
$function$;

revoke all on function public.catalog_embedding_semantic_name_v1(text)
  from public, anon, authenticated;
grant execute on function public.catalog_embedding_semantic_name_v1(text)
  to service_role;

create or replace function public.catalog_public_product_v1(
  p_store text,
  p_product_id text
)
returns table(
  store text,
  id text,
  display_name text,
  thumbnail text,
  price_total numeric,
  price_per_unit numeric,
  price_per_unit_unit text
)
language sql
stable
set search_path = ''
as $function$
  select 'mercadona', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.mercadona_products p where p_store = 'mercadona' and p.id = p_product_id and p.published
  union all
  select 'esclat', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.bonpreu_products p where p_store = 'esclat' and p.id = p_product_id and p.published
  union all
  select 'carrefour', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.carrefour_products p where p_store = 'carrefour' and p.id = p_product_id and p.published
  union all
  select 'bonarea', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.bonarea_products p where p_store = 'bonarea' and p.id = p_product_id and p.published
  union all
  select 'consum', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.consum_products p where p_store = 'consum' and p.id = p_product_id and p.published
  union all
  select 'dia', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.dia_products p where p_store = 'dia' and p.id = p_product_id and p.published
  union all
  select 'sorli', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.sorli_products p where p_store = 'sorli' and p.id = p_product_id and p.published
  union all
  select 'eroski', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.eroski_products p where p_store = 'eroski' and p.id = p_product_id and p.published
  union all
  select 'caprabo', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.caprabo_products p where p_store = 'caprabo' and p.id = p_product_id and p.published
  union all
  select 'condis', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.condis_products p where p_store = 'condis' and p.id = p_product_id and p.published
  union all
  select 'ametller', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.ametller_products p where p_store = 'ametller' and p.id = p_product_id and p.published
  union all
  select 'aldi', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.aldi_products p where p_store = 'aldi' and p.id = p_product_id and p.published
  union all
  select 'hiperdino', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.hiperdino_products p where p_store = 'hiperdino' and p.id = p_product_id and p.published
  union all
  select 'alcampo', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.alcampo_products p where p_store = 'alcampo' and p.id = p_product_id and p.published
  union all
  select 'plusfresc', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.plusfresc_products p where p_store = 'plusfresc' and p.id = p_product_id and p.published
  union all
  select 'gadis', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.gadis_products p where p_store = 'gadis' and p.id = p_product_id and p.published
  union all
  select 'froiz', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.froiz_products p where p_store = 'froiz' and p.id = p_product_id and p.published
  union all
  select 'ahorramas', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.ahorramas_products p where p_store = 'ahorramas' and p.id = p_product_id and p.published;
$function$;

revoke all on function public.catalog_public_product_v1(text, text)
  from public, anon, authenticated;
grant execute on function public.catalog_public_product_v1(text, text)
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
    and source.embedded_at is not null;

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

-- v6 conserva su contrato y cupo transaccional: al apuntar ya a esta v5
-- ampliada, el cliente actual obtiene las tres cadenas sin una nueva versión.
