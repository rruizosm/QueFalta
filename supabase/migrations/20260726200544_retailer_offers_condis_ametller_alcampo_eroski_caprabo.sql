-- Normaliza únicamente señales promocionales explícitas ya publicadas por cada
-- retailer. Los cambios ordinarios de unit_price/prev_unit_price no participan.

alter table public.condis_products
  add column if not exists promo_name text,
  add column if not exists promo_text text,
  add column if not exists promo_price numeric,
  add column if not exists promo_base_price numeric,
  add column if not exists promo_start date,
  add column if not exists promo_end date;

alter table public.ametller_products
  add column if not exists promo_name text,
  add column if not exists promo_text text,
  add column if not exists promo_price numeric,
  add column if not exists promo_base_price numeric,
  add column if not exists promo_start date,
  add column if not exists promo_end date;

alter table public.alcampo_products
  add column if not exists promo_name text,
  add column if not exists promo_text text,
  add column if not exists promo_price numeric,
  add column if not exists promo_base_price numeric,
  add column if not exists promo_start date,
  add column if not exists promo_end date;

alter table public.eroski_products
  add column if not exists promo_name text,
  add column if not exists promo_text text,
  add column if not exists promo_price numeric,
  add column if not exists promo_base_price numeric,
  add column if not exists promo_start date,
  add column if not exists promo_end date;

alter table public.caprabo_products
  add column if not exists promo_name text,
  add column if not exists promo_text text,
  add column if not exists promo_price numeric,
  add column if not exists promo_base_price numeric,
  add column if not exists promo_start date,
  add column if not exists promo_end date;

-- Condis: price.current ya es el precio rebajado. on_sale, on_promotion y
-- promotion_text son señales del feed; price.regular aporta el precio tachado.
update public.condis_products
set
  promo_name = case
    when coalesce(raw->>'on_sale', 'false') = 'true'
      or coalesce(raw->>'on_promotion', 'false') = 'true'
      or nullif(btrim(raw->>'promotion_text'), '') is not null
      or (raw#>>'{price,regular}')::numeric > (raw#>>'{price,current}')::numeric
    then coalesce(
      nullif(btrim(raw->>'promotion_text'), ''),
      case
        when (raw#>>'{price,regular}')::numeric > (raw#>>'{price,current}')::numeric
          then 'Precio rebajado'
        else 'Promoción'
      end
    )
    else null
  end,
  promo_text = nullif(btrim(raw->>'promotion_text'), ''),
  promo_price = case
    when (raw#>>'{price,regular}')::numeric > (raw#>>'{price,current}')::numeric
      then (raw#>>'{price,current}')::numeric
    else null
  end,
  promo_base_price = case
    when (raw#>>'{price,regular}')::numeric > (raw#>>'{price,current}')::numeric
      then (raw#>>'{price,regular}')::numeric
    else null
  end,
  promo_start = null,
  promo_end = null;

-- Ametller: productPromotions contiene el callout visible y, cuando es una
-- rebaja directa, promotionalPrice. Las promociones de lote no se convierten a
-- un precio unitario ficticio.
with offer_data as (
  select
    product.id,
    string_agg(
      distinct nullif(
        btrim(regexp_replace(regexp_replace(promotion.value->>'calloutMsg', '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g')),
        ''
      ),
      ' · '
    ) as labels,
    min((promotion.value->>'promotionalPrice')::numeric) filter (
      where nullif(promotion.value->>'promotionalPrice', '') is not null
        and (promotion.value->>'promotionalPrice')::numeric > 0
        and (promotion.value->>'promotionalPrice')::numeric < product.unit_price
    ) as promo_price
  from public.ametller_products product
  left join lateral jsonb_array_elements(
    case
      when jsonb_typeof(product.raw->'productPromotions') = 'array'
        then product.raw->'productPromotions'
      else '[]'::jsonb
    end
  ) promotion(value) on true
  group by product.id
)
update public.ametller_products product
set
  promo_name = coalesce(
    offer_data.labels,
    case when offer_data.promo_price is not null then 'Precio rebajado' else 'Oferta' end
  ),
  promo_text = case when offer_data.labels like '% · %' then offer_data.labels else null end,
  promo_price = offer_data.promo_price,
  promo_base_price = case when offer_data.promo_price is not null then product.unit_price else null end,
  promo_start = null,
  promo_end = null
from offer_data
where product.id = offer_data.id
  and (
    jsonb_array_length(
      case
        when jsonb_typeof(product.raw->'productPromotions') = 'array'
          then product.raw->'productPromotions'
        else '[]'::jsonb
      end
    ) > 0
    or coalesce(product.raw->>'c_isSale', 'false') = 'true'
  );

-- Alcampo: promotions[].description identifica ofertas directas, lotes y Club;
-- promoPrice.amount solo existe cuando hay un precio final directo.
with offer_data as (
  select
    product.id,
    string_agg(
      distinct nullif(btrim(regexp_replace(promotion.value->>'description', '\s+', ' ', 'g')), ''),
      ' · '
    ) as promo_text
  from public.alcampo_products product
  left join lateral jsonb_array_elements(
    case
      when jsonb_typeof(product.raw->'promotions') = 'array'
        then product.raw->'promotions'
      else '[]'::jsonb
    end
  ) promotion(value)
    on coalesce(promotion.value->>'limitReached', 'false') <> 'true'
  group by product.id
),
normalized as (
  select
    offer_data.*,
    regexp_match(coalesce(offer_data.promo_text, ''), '(\d{2}/\d{2}/\d{4})\s*-\s*(\d{2}/\d{2}/\d{4})') as validity
  from offer_data
)
update public.alcampo_products product
set
  promo_name = coalesce(
    nullif(
      btrim(regexp_replace(split_part(normalized.promo_text, ' · ', 1), '\s*\(\d{2}/\d{2}/\d{4}\s*-\s*\d{2}/\d{2}/\d{4}\)\s*$', '')),
      ''
    ),
    case
      when (product.raw#>>'{promoPrice,amount}')::numeric < (product.raw#>>'{price,amount}')::numeric
        then 'Precio rebajado'
      else 'Promoción'
    end
  ),
  promo_text = normalized.promo_text,
  promo_price = case
    when (product.raw#>>'{promoPrice,amount}')::numeric > 0
      and (product.raw#>>'{promoPrice,amount}')::numeric < (product.raw#>>'{price,amount}')::numeric
      then (product.raw#>>'{promoPrice,amount}')::numeric
    else null
  end,
  promo_base_price = case
    when (product.raw#>>'{promoPrice,amount}')::numeric > 0
      and (product.raw#>>'{promoPrice,amount}')::numeric < (product.raw#>>'{price,amount}')::numeric
      then (product.raw#>>'{price,amount}')::numeric
    else null
  end,
  promo_start = case when normalized.validity is not null then to_date(normalized.validity[1], 'DD/MM/YYYY') else null end,
  promo_end = case when normalized.validity is not null then to_date(normalized.validity[2], 'DD/MM/YYYY') else null end
from normalized
where product.id = normalized.id
  and (
    normalized.promo_text is not null
    or (
      (product.raw#>>'{promoPrice,amount}')::numeric > 0
      and (product.raw#>>'{promoPrice,amount}')::numeric < (product.raw#>>'{price,amount}')::numeric
    )
  );

-- Eroski y Caprabo necesitan un sync posterior: el scraper ampliado inserta
-- estos campos en raw al leer el HTML de cada tile.
update public.eroski_products
set
  promo_name = raw->>'promo_name',
  promo_text = raw->>'promo_text',
  promo_price = nullif(raw->>'promo_price', '')::numeric,
  promo_base_price = nullif(raw->>'promo_base_price', '')::numeric,
  promo_start = nullif(raw->>'promo_start', '')::date,
  promo_end = nullif(raw->>'promo_end', '')::date
where raw ? 'promo_name';

update public.caprabo_products
set
  promo_name = raw->>'promo_name',
  promo_text = raw->>'promo_text',
  promo_price = nullif(raw->>'promo_price', '')::numeric,
  promo_base_price = nullif(raw->>'promo_base_price', '')::numeric,
  promo_start = nullif(raw->>'promo_start', '')::date,
  promo_end = nullif(raw->>'promo_end', '')::date
where raw ? 'promo_name';

create index if not exists condis_products_live_offers_idx
  on public.condis_products (display_name_norm, id)
  where published = true and promo_name is not null;
create index if not exists ametller_products_live_offers_idx
  on public.ametller_products (display_name_norm, id)
  where published = true and promo_name is not null;
create index if not exists alcampo_products_live_offers_idx
  on public.alcampo_products (display_name_norm, id)
  where published = true and promo_name is not null;
create index if not exists eroski_products_live_offers_idx
  on public.eroski_products (display_name_norm, id)
  where published = true and promo_name is not null;
create index if not exists caprabo_products_live_offers_idx
  on public.caprabo_products (display_name_norm, id)
  where published = true and promo_name is not null;

comment on column public.condis_products.promo_name is
  'Oferta explícita de Empathy: on_sale/on_promotion/promotion_text; nunca historial semanal.';
comment on column public.ametller_products.promo_name is
  'Oferta explícita de SCAPI productPromotions/c_isSale; nunca historial semanal.';
comment on column public.alcampo_products.promo_name is
  'Oferta explícita de Ocado promotions/promoPrice; nunca historial semanal.';
comment on column public.eroski_products.promo_name is
  'Oferta explícita del tile HTML de Eroski; nunca historial semanal.';
comment on column public.caprabo_products.promo_name is
  'Oferta explícita del tile HTML de Caprabo; nunca historial semanal.';
