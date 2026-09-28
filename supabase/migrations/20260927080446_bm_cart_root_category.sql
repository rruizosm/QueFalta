create or replace view public.bm_product_locations
with (security_invoker = true)
as
select
  lp.location_id,
  p.id,
  p.retailer_product_id,
  p.ean,
  p.global_gtin,
  p.display_name,
  p.brand,
  p.packaging,
  p.thumbnail,
  p.product_url,
  p.root_category_id,
  p.category_id,
  p.category_name,
  p.category_ids,
  lp.unit_price,
  lp.base_unit_price,
  lp.price_format,
  lp.price_per_unit,
  lp.price_per_unit_unit,
  p.price_unit_type,
  p.minimum_unit,
  p.interval_unit,
  lp.promo_type,
  lp.promo_name,
  lp.promo_text,
  lp.promo_price,
  lp.promo_base_price,
  lp.promo_start,
  lp.promo_end,
  lp.offer_id,
  lp.promotion_id,
  lp.promo_discount,
  lp.available,
  lp.is_new,
  (p.published and lp.published) as published,
  p.raw,
  lp.raw as location_raw,
  greatest(p.synced_at, lp.synced_at) as synced_at,
  lp.first_seen_at,
  p.display_name_norm,
  nullif(concat_ws(' › ', root.name, p.category_name), '') as cart_category_name
from public.bm_products as p
join public.catalog_location_prices as lp
  on lp.store = 'bm'
 and lp.product_id = p.id
left join public.bm_categories as root
  on root.id = p.root_category_id and root.parent_id is null;


comment on column public.bm_product_locations.cart_category_name is
  'Ruta N1 › N2 de BM para clasificar productos en la cesta; category_name conserva la N2 para los filtros del catálogo.';

update public.list_items as li
set category_name = nullif(concat_ws(' › ', root.name, p.category_name), '')
from public.bm_products as p
join public.bm_categories as root
  on root.id = p.root_category_id and root.parent_id is null
where li.store_key = 'bm'
  and li.store_product_id = p.id
  and li.category_name is distinct from nullif(concat_ws(' › ', root.name, p.category_name), '');

update public.purchase_items as pi
set category_name = nullif(concat_ws(' › ', root.name, p.category_name), '')
from public.bm_products as p
join public.bm_categories as root
  on root.id = p.root_category_id and root.parent_id is null
where pi.store_key = 'bm'
  and pi.store_product_id = p.id
  and pi.category_name is distinct from nullif(concat_ws(' › ', root.name, p.category_name), '');

notify pgrst, 'reload schema';
