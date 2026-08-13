-- Añade a la respuesta del comparador una señal explícita para resaltar las
-- alternativas cuyo precio comparable es inferior al producto abierto.
-- Caprabo, Eroski e HiperDino usan precio total; el resto, precio por unidad.

create function comparator_internal.catalog_cheaper_products_v4(
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
language sql
volatile
security definer
set search_path = ''
as $function$
  with source_product as (
    select
      source.store,
      case
        when source.store = any (array['caprabo','eroski','hiperdino'])
          then source.price_total
        else source.price_per_unit
      end as comparison_price
    from public.catalog_public_product_v1(p_source_store, p_source_product_id) as source
  ),
  alternatives as (
    select *
    from comparator_internal.catalog_cheaper_products_v3(
      p_source_store,
      p_source_product_id,
      p_stores
    )
  )
  select
    alternative.store,
    alternative.id,
    alternative.display_name,
    alternative.thumbnail,
    alternative.price_total,
    alternative.price_per_unit,
    alternative.price_per_unit_unit,
    alternative.match_kind,
    alternative.match_score,
    alternative.vector_score,
    alternative.lexical_score,
    alternative.quantity_ratio,
    coalesce(
      case
        when alternative.store = any (array['caprabo','eroski','hiperdino'])
          then alternative.price_total
        else alternative.price_per_unit
      end < source_product.comparison_price,
      false
    ) as is_cheaper
  from alternatives as alternative
  cross join source_product;
$function$;

revoke all on function comparator_internal.catalog_cheaper_products_v4(text, text, text[])
  from public, anon;
grant execute on function comparator_internal.catalog_cheaper_products_v4(text, text, text[])
  to authenticated, service_role;

create function public.catalog_cheaper_products_v4(
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
language sql
volatile
security invoker
set search_path = ''
as $function$
  select *
  from comparator_internal.catalog_cheaper_products_v4(
    p_source_store,
    p_source_product_id,
    p_stores
  );
$function$;

revoke all on function public.catalog_cheaper_products_v4(text, text, text[])
  from public, anon;
grant execute on function public.catalog_cheaper_products_v4(text, text, text[])
  to authenticated, service_role;
