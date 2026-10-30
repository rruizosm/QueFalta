-- Declaraciones sin gluten en el nombre; reglas compartidas con scripts/lib/gluten-free-names.mjs.
-- S/G exige un tipo de alimento sólido para no confundirlo con «sin gas».
create or replace function public.catalog_name_gluten_free(p_name text)
returns boolean
language sql immutable parallel safe
set search_path = ''
as $function$
  select name ~ $gf$(^|[^a-z0-9])((sin|sense|sans|sem)[ /.-]*(gluten|glutren|glutenl)|ni +gluten|libres? +(de +)?gluten|gluten[ -]*free|glutenfrei|free +(from|of) +gluten|senza *glutine|s *[./] *(gluten|glut|gl)|0 *% *(de +)?gluten|no +contiene +gluten)([^a-z]|$)$gf$
    or (name ~ $gf$(^|[^a-z0-9])s *[./] *g([^a-z0-9]|$)$gf$
      and name ~ $gf$(^|[^a-z0-9])(pan|galletas?|pasta|harina|bizcochos?|magdalenas?|boll(o|ito)s?|brio(che|xe)|pizzas?|cereales|crackers|barquillos)([^a-z0-9]|$)$gf$)
  from (select public.catalog_search_normalize(p_name) as name) normalized;
$function$;

-- Las tablas *_products ya disponen de la bandera. Las maestras actuales de
-- Lidl e Hipercor la almacenan una sola vez, separada de precios y disponibilidad.
alter table public.lidl_product_master add column if not exists gluten_free_label boolean;
alter table public.hipercor_product_master add column if not exists gluten_free_label boolean;

update public.ametller_products p
set gluten_free_label = (public.catalog_name_gluten_free(p.display_name) or public.catalog_name_gluten_free(p.display_name_ca))
where p.gluten_free_label is distinct from (public.catalog_name_gluten_free(p.display_name) or public.catalog_name_gluten_free(p.display_name_ca));

update public.eljamon_products p
set gluten_free_label = (public.catalog_name_gluten_free(p.display_name))
where p.gluten_free_label is distinct from (public.catalog_name_gluten_free(p.display_name));

update public.hipercor_products p
set gluten_free_label = (public.catalog_name_gluten_free(p.display_name))
where p.gluten_free_label is distinct from (public.catalog_name_gluten_free(p.display_name));

update public.hiperdino_products p
set gluten_free_label = (public.catalog_name_gluten_free(p.display_name))
where p.gluten_free_label is distinct from (public.catalog_name_gluten_free(p.display_name));

update public.lidl_products p
set gluten_free_label = (public.catalog_name_gluten_free(p.display_name))
where p.gluten_free_label is distinct from (public.catalog_name_gluten_free(p.display_name));

update public.mercadona_products p
set gluten_free_label = (public.catalog_name_gluten_free(p.display_name) or public.catalog_name_gluten_free(p.display_name_ca))
where p.gluten_free_label is distinct from (public.catalog_name_gluten_free(p.display_name) or public.catalog_name_gluten_free(p.display_name_ca));

update public.lidl_product_master p
set gluten_free_label = (public.catalog_name_gluten_free(p.display_name))
where p.gluten_free_label is distinct from (public.catalog_name_gluten_free(p.display_name));

update public.hipercor_product_master p
set gluten_free_label = (public.catalog_name_gluten_free(p.display_name))
where p.gluten_free_label is distinct from (public.catalog_name_gluten_free(p.display_name));

create or replace view public.hipercor_product_centers with (security_invoker = true) as
 SELECT cp.center_id,
    p.id,
    p.retailer_product_id,
    p.ean,
    p.display_name,
    p.brand,
    p.packaging,
    p.thumbnail,
    p.product_url,
    cp.category_id,
    cp.category_name,
    cp.category_ids,
    cp.unit_price,
    cp.price_format,
    cp.price_per_unit,
    cp.price_per_unit_unit,
    cp.promo_name,
    cp.promo_text,
    cp.promo_price,
    cp.promo_base_price,
    cp.offer_unit_price,
    cp.available,
    p.published AND cp.published AS published,
    p.raw,
    cp.raw AS center_raw,
    cp.observed_at,
    GREATEST(p.synced_at, cp.synced_at) AS synced_at,
    cp.first_seen_at,
    cp.prev_unit_price,
    cp.price_changed_at,
    cp.price_delta_pct,
    p.display_name_norm,
    p.gluten_free_label
   FROM public.hipercor_product_master p
     JOIN public.hipercor_center_products cp ON cp.product_id = p.id;

create or replace view public.lidl_product_stores with (security_invoker = true) as
 SELECT sp.store_id,
    p.id,
    p.retailer_product_id,
    p.ean,
    p.display_name,
    p.brand,
    p.packaging,
    p.thumbnail,
    sp.category_id,
    sp.category_name,
    sp.category_ids,
    sp.unit_price,
    sp.price_format,
    sp.price_per_unit,
    sp.price_per_unit_unit,
    sp.promo_name,
    sp.promo_text,
    sp.promo_price,
    sp.promo_base_price,
    sp.promo_start,
    sp.promo_end,
    sp.offer_unit_price,
    sp.is_lidl_plus_offer,
    sp.available,
    sp.stock_indicator,
    p.product_line,
    p.listing_type,
    sp.click_collect,
    p.published AND sp.published AS published,
    p.raw,
    sp.raw AS store_raw,
    sp.observed_at,
    GREATEST(p.synced_at, sp.synced_at) AS synced_at,
    sp.first_seen_at,
    sp.prev_unit_price,
    sp.price_changed_at,
    sp.price_delta_pct,
    p.display_name_norm,
    p.gluten_free_label
   FROM public.lidl_product_master p
     JOIN public.lidl_store_products sp ON sp.product_id = p.id;

create index if not exists ametller_gluten_unit_price_asc_idx
  on public.ametller_products (unit_price asc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists ametller_gluten_unit_price_desc_idx
  on public.ametller_products (unit_price desc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists ametller_gluten_ppu_asc_idx
  on public.ametller_products (price_per_unit asc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists ametller_gluten_ppu_desc_idx
  on public.ametller_products (price_per_unit desc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists eljamon_gluten_unit_price_asc_idx
  on public.eljamon_products (unit_price asc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists eljamon_gluten_unit_price_desc_idx
  on public.eljamon_products (unit_price desc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists eljamon_gluten_ppu_asc_idx
  on public.eljamon_products (price_per_unit asc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists eljamon_gluten_ppu_desc_idx
  on public.eljamon_products (price_per_unit desc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists hiperdino_gluten_unit_price_asc_idx
  on public.hiperdino_products (unit_price asc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists hiperdino_gluten_unit_price_desc_idx
  on public.hiperdino_products (unit_price desc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists hiperdino_gluten_ppu_asc_idx
  on public.hiperdino_products (price_per_unit asc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists hiperdino_gluten_ppu_desc_idx
  on public.hiperdino_products (price_per_unit desc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists mercadona_gluten_unit_price_asc_idx
  on public.mercadona_products (unit_price asc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists mercadona_gluten_unit_price_desc_idx
  on public.mercadona_products (unit_price desc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists mercadona_gluten_ppu_asc_idx
  on public.mercadona_products (price_per_unit asc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists mercadona_gluten_ppu_desc_idx
  on public.mercadona_products (price_per_unit desc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists lidl_gluten_unit_price_asc_idx
  on public.lidl_products (unit_price asc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists lidl_gluten_unit_price_desc_idx
  on public.lidl_products (unit_price desc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists lidl_gluten_ppu_asc_idx
  on public.lidl_products (price_per_unit asc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists lidl_gluten_ppu_desc_idx
  on public.lidl_products (price_per_unit desc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists hipercor_gluten_unit_price_asc_idx
  on public.hipercor_products (unit_price asc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists hipercor_gluten_unit_price_desc_idx
  on public.hipercor_products (unit_price desc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists hipercor_gluten_ppu_asc_idx
  on public.hipercor_products (price_per_unit asc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists hipercor_gluten_ppu_desc_idx
  on public.hipercor_products (price_per_unit desc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists lidl_master_gluten_idx
  on public.lidl_product_master (id) where published and gluten_free_label;

create index if not exists hipercor_master_gluten_idx
  on public.hipercor_product_master (id) where published and gluten_free_label;

notify pgrst, 'reload schema';

