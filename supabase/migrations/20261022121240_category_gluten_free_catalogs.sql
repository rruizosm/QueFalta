-- Categorías exclusivas sin gluten; se excluyen las ramas mixtas de pasta integral.
-- IDs externos del catálogo, compartidos con scripts/lib/gluten-free-categories.mjs.

update public.ahorramas_products p
set gluten_free_label = coalesce(p.category_ids && array['alimentacion/galletas-cereales-y-barritas/galletas/galletas-sin-gluten', 'alimentacion/galletas-cereales-y-barritas/cereales/cereales-sin-gluten', 'alimentacion/harina-levadura-y-preparados/harina/harina-sin-gluten']::text[], false)
where p.gluten_free_label is distinct from coalesce(p.category_ids && array['alimentacion/galletas-cereales-y-barritas/galletas/galletas-sin-gluten', 'alimentacion/galletas-cereales-y-barritas/cereales/cereales-sin-gluten', 'alimentacion/harina-levadura-y-preparados/harina/harina-sin-gluten']::text[], false);

update public.bm_products p
set gluten_free_label = (coalesce(p.category_ids && array['4110']::text[], false) or exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(p.raw->'categories') = 'array'
      then p.raw->'categories' else '[]'::jsonb end) category
    where category->>'id' = '4110'
  ))
where p.gluten_free_label is distinct from (coalesce(p.category_ids && array['4110']::text[], false) or exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(p.raw->'categories') = 'array'
      then p.raw->'categories' else '[]'::jsonb end) category
    where category->>'id' = '4110'
  ));

update public.consum_products p
set gluten_free_label = coalesce(p.category_ids && array['2717', '5016', '5338']::text[], false)
where p.gluten_free_label is distinct from coalesce(p.category_ids && array['2717', '5016', '5338']::text[], false);

update public.eroski_products p
set gluten_free_label = coalesce(p.category_ids && array['5000385', '2060143', '2060863', '2059795']::text[], false)
where p.gluten_free_label is distinct from coalesce(p.category_ids && array['5000385', '2060143', '2060863', '2059795']::text[], false);

update public.caprabo_products p
set gluten_free_label = coalesce(p.category_ids && array['5000385', '2060143', '2060863', '2059795']::text[], false)
where p.gluten_free_label is distinct from coalesce(p.category_ids && array['5000385', '2060143', '2060863', '2059795']::text[], false);

-- La bandera sigue almacenada solo en bm_products; la vista local la expone.
create or replace view public.bm_product_locations with (security_invoker = true) as
 SELECT lp.location_id,
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
    p.published AND lp.published AS published,
    p.raw,
    lp.raw AS location_raw,
    GREATEST(p.synced_at, lp.synced_at) AS synced_at,
    lp.first_seen_at,
    p.display_name_norm,
    NULLIF(concat_ws(' › '::text, root.name, p.category_name), ''::text) AS cart_category_name,
    p.nutrition,
    p.ingredients,
    p.allergens,
    p.conservation,
    p.gluten_free_label
   FROM public.bm_products p
     JOIN public.catalog_location_prices lp ON lp.store = 'bm'::text AND lp.product_id = p.id
     LEFT JOIN public.bm_categories root ON root.id = p.root_category_id AND root.parent_id IS NULL;

create index if not exists ahorramas_gluten_unit_price_asc_idx
  on public.ahorramas_products (unit_price asc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists ahorramas_gluten_unit_price_desc_idx
  on public.ahorramas_products (unit_price desc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists ahorramas_gluten_ppu_asc_idx
  on public.ahorramas_products (price_per_unit asc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists ahorramas_gluten_ppu_desc_idx
  on public.ahorramas_products (price_per_unit desc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists bm_gluten_products_idx
  on public.bm_products (id) where published and gluten_free_label;

create index if not exists consum_gluten_unit_price_asc_idx
  on public.consum_products (unit_price asc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists consum_gluten_unit_price_desc_idx
  on public.consum_products (unit_price desc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists consum_gluten_ppu_asc_idx
  on public.consum_products (price_per_unit asc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists consum_gluten_ppu_desc_idx
  on public.consum_products (price_per_unit desc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists eroski_gluten_unit_price_asc_idx
  on public.eroski_products (unit_price asc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists eroski_gluten_unit_price_desc_idx
  on public.eroski_products (unit_price desc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists eroski_gluten_ppu_asc_idx
  on public.eroski_products (price_per_unit asc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists eroski_gluten_ppu_desc_idx
  on public.eroski_products (price_per_unit desc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists caprabo_gluten_unit_price_asc_idx
  on public.caprabo_products (unit_price asc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists caprabo_gluten_unit_price_desc_idx
  on public.caprabo_products (unit_price desc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists caprabo_gluten_ppu_asc_idx
  on public.caprabo_products (price_per_unit asc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists caprabo_gluten_ppu_desc_idx
  on public.caprabo_products (price_per_unit desc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

notify pgrst, 'reload schema';

