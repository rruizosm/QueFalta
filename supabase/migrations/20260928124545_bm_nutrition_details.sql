-- Datos comunes de la ficha BM. El JSON de nutricion es publico y se resuelve
-- por EAN; precio y promociones siguen siendo exclusivos de cada ubicacion.
alter table public.bm_products
  add column if not exists nutrition text,
  add column if not exists ingredients text,
  add column if not exists allergens text,
  add column if not exists conservation text,
  add column if not exists detail_ean text,
  add column if not exists detail_synced_at timestamptz;

comment on column public.bm_products.nutrition is
  'Tabla nutricional BM normalizada a texto, con referencia y unidades de la fuente.';
comment on column public.bm_products.detail_ean is
  'EAN usado al descargar el detalle nutricional; un cambio obliga a invalidar la ficha.';
comment on column public.bm_products.detail_synced_at is
  'Ultima consulta valida del JSON nutricional, incluso si la ficha no publica tabla.';

-- CREATE OR REPLACE VIEW solo admite columnas nuevas al final. Se conserva el
-- orden de la vista vigente, el security_invoker y todos los brazos zonales.
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
  nullif(concat_ws(' › ', root.name, p.category_name), '') as cart_category_name,
  p.nutrition,
  p.ingredients,
  p.allergens,
  p.conservation
from public.bm_products as p
join public.catalog_location_prices as lp
  on lp.store = 'bm'
 and lp.product_id = p.id
left join public.bm_categories as root
  on root.id = p.root_category_id and root.parent_id is null;

notify pgrst, 'reload schema';
