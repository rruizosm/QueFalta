-- El Jamón: catálogo común, identidad semántica única y precio vigente del
-- propio catálogo. A diferencia de BM, no existe una dimensión geográfica.
set lock_timeout = '5s';
set statement_timeout = '120s';

alter table public.catalog_product_embeddings
  drop constraint catalog_product_embeddings_store_check,
  add constraint catalog_product_embeddings_store_check check (
    store = any(array['alcampo','aldi','ametller','ahorramas','bm','bonarea','caprabo',
      'carrefour','condis','consum','dia','eljamon','eroski','esclat','froiz','gadis',
      'hiperdino','lidl','mercadona','plusfresc','sorli']::text[])
  ) not valid;

alter table public.catalog_product_match_cache_status
  drop constraint catalog_product_match_cache_status_target_store_check,
  add constraint catalog_product_match_cache_status_target_store_check check (
    target_store = any(array['alcampo','aldi','ametller','ahorramas','bm','bonarea','caprabo',
      'carrefour','condis','consum','dia','eljamon','eroski','esclat','froiz','gadis',
      'hiperdino','lidl','mercadona','plusfresc','sorli']::text[])
  ) not valid;

create or replace view public.eljamon_comparator_products
with (security_invoker = true) as
select
  product.id,
  product.display_name,
  product.brand,
  product.packaging,
  product.ean,
  product.category_name,
  lower(product.price_per_unit_unit) as price_per_unit_unit,
  product.published
from public.eljamon_products as product
where product.published
  and product.available
  and product.unit_price > 0
  and product.price_per_unit > 0
  and lower(product.price_per_unit_unit) in ('kg','l','ud');

revoke all on public.eljamon_comparator_products from public, anon, authenticated;
grant select on public.eljamon_comparator_products to service_role;

insert into comparator_internal.catalog_match_store_versions(store, generation, updated_at)
values ('eljamon', 1, now())
on conflict (store) do nothing;

-- Conserva la resolución vigente de las veinte cadenas y la envuelve para
-- incorporar El Jamón sin duplicar toda la función histórica.
alter function public.catalog_public_product_v1(text, text)
  set schema comparator_internal;
alter function comparator_internal.catalog_public_product_v1(text, text)
  rename to catalog_public_product_pre_eljamon_v1;

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
  select legacy.*
  from comparator_internal.catalog_public_product_pre_eljamon_v1(
    p_store,
    p_product_id
  ) as legacy
  union all
  select
    'eljamon',
    product.id,
    product.display_name,
    product.thumbnail,
    product.unit_price,
    product.price_per_unit,
    lower(product.price_per_unit_unit)
  from public.eljamon_products as product
  where p_store = 'eljamon'
    and product.id = p_product_id
    and product.published
    and product.available
    and product.unit_price > 0
    and product.price_per_unit > 0
    and lower(product.price_per_unit_unit) in ('kg','l','ud');
$function$;

revoke all on function public.catalog_public_product_v1(text, text)
  from public, anon, authenticated;
grant execute on function public.catalog_public_product_v1(text, text)
  to service_role;

-- v6 conserva las veinte cadenas anteriores (incluido BM). Esta capa añade
-- El Jamón como destino y permite usarlo como origen contra cualquier cadena.
create or replace function comparator_internal.catalog_cheaper_products_v7(
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
security definer
set search_path = ''
as $function$
declare
  v_match_version constant text := 'embedding_hybrid_v3_0_60';
  v_source record;
  v_target_generation bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_source_store = 'eljamon' and not exists (
    select 1 from public.catalog_public_product_v1(p_source_store, p_source_product_id)
  ) then
    return;
  end if;

  return query
  select legacy.*
  from comparator_internal.catalog_cheaper_products_v6(
    p_source_store,
    p_source_product_id,
    pg_catalog.array_remove(coalesce(p_stores, array[]::text[]), 'eljamon')
  ) as legacy;

  if p_source_store = 'eljamon'
    or not ('eljamon' = any(coalesce(p_stores, array[]::text[])))
  then
    return;
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

  select version.generation
  into v_target_generation
  from comparator_internal.catalog_match_store_versions as version
  where version.store = 'eljamon';

  if not exists (
    select 1
    from public.catalog_product_match_cache_status as status
    where status.source_store = p_source_store
      and status.source_product_id = p_source_product_id
      and status.target_store = 'eljamon'
      and status.match_version = v_match_version
      and status.source_content_hash = v_source.content_hash
      and status.source_embedded_at = v_source.embedded_at
      and status.target_generation = coalesce(v_target_generation, 1)
  ) then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        p_source_store || ':' || p_source_product_id || ':eljamon:' || v_match_version,
        0
      )
    );

    select version.generation
    into v_target_generation
    from comparator_internal.catalog_match_store_versions as version
    where version.store = 'eljamon';

    if not exists (
      select 1
      from public.catalog_product_match_cache_status as status
      where status.source_store = p_source_store
        and status.source_product_id = p_source_product_id
        and status.target_store = 'eljamon'
        and status.match_version = v_match_version
        and status.source_content_hash = v_source.content_hash
        and status.source_embedded_at = v_source.embedded_at
        and status.target_generation = coalesce(v_target_generation, 1)
    ) then
      perform comparator_internal.refresh_catalog_match_cache_pair_v3(
        p_source_store,
        p_source_product_id,
        'eljamon'
      );
    end if;
  end if;

  return query
  with source_embedding as (
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
      when source.store = any(array['caprabo','eroski','hiperdino'])
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
    from source_embedding as source
    join public.catalog_product_matches as match
      on match.source_store = p_source_store
     and match.source_product_id = p_source_product_id
     and match.target_store = 'eljamon'
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
        order by
          compatible.price_per_unit asc nulls last,
          compatible.price_total asc nulls last,
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
    coalesce(ranked.price_per_unit < source_price.comparison_price, false)
  from ranked
  cross join source_price
  where ranked.store_rank <= 2
  order by ranked.store_rank;
end;
$function$;

revoke all on function comparator_internal.catalog_cheaper_products_v7(text, text, text[])
  from public, anon;
grant execute on function comparator_internal.catalog_cheaper_products_v7(text, text, text[])
  to authenticated, service_role;

create or replace function public.catalog_cheaper_products_v7(
  p_source_store text,
  p_source_product_id text,
  p_stores text[],
  p_language text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  entitlement record;
  matches jsonb;
begin
  select * into entitlement
  from private.claim_free_comparator_use();

  if not entitlement.allowed then
    return jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'results', '[]'::jsonb
    );
  end if;

  select coalesce(
    jsonb_agg(
      to_jsonb(result) || jsonb_build_object(
        'display_name',
        coalesce(
          comparator_internal.catalog_localized_product_name_v1(
            result.store,
            result.id,
            p_language
          ),
          result.display_name
        )
      )
    ),
    '[]'::jsonb
  )
  into matches
  from comparator_internal.catalog_cheaper_products_v7(
    p_source_store,
    p_source_product_id,
    p_stores
  ) as result;

  return jsonb_build_object(
    'allowed', true,
    'remaining', entitlement.remaining,
    'results', matches
  );
end
$function$;

alter function public.catalog_cheaper_products_v7(text, text, text[], text)
  set statement_timeout = '60s';

revoke all on function public.catalog_cheaper_products_v7(text, text, text[], text)
  from public, anon;
grant execute on function public.catalog_cheaper_products_v7(text, text, text[], text)
  to authenticated, service_role;

comment on function public.catalog_cheaper_products_v7(text, text, text[], text) is
  'Savings Radar v7 with El Jamón common prices, profile-local BM prices, localized names and atomic free-tier allowance.';

alter table public.catalog_product_embeddings
  validate constraint catalog_product_embeddings_store_check;
alter table public.catalog_product_match_cache_status
  validate constraint catalog_product_match_cache_status_target_store_check;

notify pgrst, 'reload schema';
