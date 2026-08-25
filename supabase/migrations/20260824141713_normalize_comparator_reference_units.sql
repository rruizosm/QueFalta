-- Gadis y Ahorramás publican algunas bases de precio con etiquetas comerciales
-- ("el litro", "los 100 ml", "docena"...). El comparador solo puede mezclar
-- €/l, €/kg y €/ud, por lo que normaliza tanto la unidad como el importe.

create or replace function comparator_internal.catalog_reference_price_v1(
  p_display_name text,
  p_packaging text,
  p_reference_price numeric,
  p_reference_unit text
)
returns table(price_per_unit numeric, canonical_unit text)
language sql
immutable
parallel safe
set search_path = ''
as $function$
  with normalized as (
    select
      lower(public.f_unaccent(btrim(coalesce(p_reference_unit, '')))) as unit,
      lower(public.f_unaccent(concat_ws(' ', p_display_name, p_packaging))) as product_text
  )
  select
    case
      when normalized.unit = any (array[
        'kg','kg.peso','kilo','kilos','el kilo','kilogramo','kilogramos',
        'l','litro','litros','el litro',
        'ud','uds','u','unidad','unidades','la unidad'
      ]) then p_reference_price
      when normalized.unit ~ '^(los[[:space:]]+)?100[[:space:]]*(ml|mililitros?)$'
        or normalized.unit ~ '^(los[[:space:]]+)?100[[:space:]]*(g|gr|gr\.|gramos?)$'
        or normalized.unit = '100'
        then p_reference_price * 10
      when normalized.unit = any (array['docena','docenas','la docena'])
        then p_reference_price / 12
      else null
    end,
    case
      when normalized.unit = any (array['l','litro','litros','el litro'])
        or normalized.unit ~ '^(los[[:space:]]+)?100[[:space:]]*(ml|mililitros?)$'
        then 'l'
      when normalized.unit = '100'
        and normalized.product_text ~ '\m[0-9]+([.,][0-9]+)?[[:space:]]*(ml|cl|l|litro|litros)\M'
        then 'l'
      when normalized.unit = any (array[
        'kg','kg.peso','kilo','kilos','el kilo','kilogramo','kilogramos'
      ])
        or normalized.unit ~ '^(los[[:space:]]+)?100[[:space:]]*(g|gr|gr\.|gramos?)$'
        or normalized.unit = '100'
        then 'kg'
      when normalized.unit = any (array[
        'ud','uds','u','unidad','unidades','la unidad','docena','docenas','la docena'
      ]) then 'ud'
      else null
    end
  from normalized;
$function$;

revoke all on function comparator_internal.catalog_reference_price_v1(text, text, numeric, text)
  from public, anon, authenticated;
grant execute on function comparator_internal.catalog_reference_price_v1(text, text, numeric, text)
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
  select 'gadis', p.id, p.display_name, p.thumbnail, p.unit_price, reference.price_per_unit, reference.canonical_unit
  from public.gadis_products p
  cross join lateral comparator_internal.catalog_reference_price_v1(
    p.display_name, p.packaging, p.price_per_unit, p.price_per_unit_unit
  ) as reference
  where p_store = 'gadis' and p.id = p_product_id and p.published
  union all
  select 'froiz', p.id, p.display_name, p.thumbnail, p.unit_price, reference.price_per_unit, reference.canonical_unit
  from public.froiz_products p
  cross join lateral comparator_internal.catalog_reference_price_v1(
    p.display_name, null, p.price_per_unit, p.price_per_unit_unit
  ) as reference
  where p_store = 'froiz' and p.id = p_product_id and p.published
  union all
  select 'ahorramas', p.id, p.display_name, p.thumbnail, p.unit_price, reference.price_per_unit, reference.canonical_unit
  from public.ahorramas_products p
  cross join lateral comparator_internal.catalog_reference_price_v1(
    p.display_name, p.packaging, p.price_per_unit, p.price_per_unit_unit
  ) as reference
  where p_store = 'ahorramas' and p.id = p_product_id and p.published;
$function$;

revoke all on function public.catalog_public_product_v1(text, text)
  from public, anon, authenticated;
grant execute on function public.catalog_public_product_v1(text, text)
  to service_role;
