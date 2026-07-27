-- Ofertas explícitas de DIA.
-- Aplicada en producción con la versión Supabase 20260723204711.
--
-- El PLP general ya contiene la misma señal estructurada que /ofertas:
-- - descuento directo: prices.is_promo_price + strikethrough_price + porcentaje;
-- - promoción de lote/online: promotions[].description ("3X2", "2ª UD...", etc.).
-- El sync semanal normaliza ambas y conserva el precio/promoción por CCAA.

alter table public.dia_products add column if not exists promo_name text;
alter table public.dia_products add column if not exists promo_text text;
alter table public.dia_products add column if not exists promo_base_price numeric;
alter table public.dia_products add column if not exists offer_regions text[];
alter table public.dia_products add column if not exists regional_offers jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.dia_products'::regclass
      and conname = 'dia_products_promo_base_price_nonnegative'
  ) then
    alter table public.dia_products
      add constraint dia_products_promo_base_price_nonnegative
      check (promo_base_price is null or promo_base_price >= 0);
  end if;
end $$;

-- Backfill inmediato desde raw: la pantalla de Ofertas funciona al ejecutar la
-- migración, sin esperar al próximo sync. Hasta ese sync se considera nacional;
-- la siguiente pasada rellenará offer_regions/regional_offers con precisión.
with source as (
  select
    id,
    raw #>> '{promotions,0,description}' as description,
    coalesce((raw #>> '{prices,is_promo_price}')::boolean, false) as is_promo,
    coalesce((raw #>> '{prices,is_club_price}')::boolean, false) as is_club,
    coalesce(nullif(raw #>> '{prices,discount_percentage}', '')::numeric, 0) as discount_pct,
    nullif(raw #>> '{prices,strikethrough_price}', '')::numeric as strikethrough_price,
    unit_price,
    raw->>'headband_promotion' as headband
  from public.dia_products
), offers as (
  select *,
    description is not null
      or is_promo
      or coalesce(strikethrough_price > unit_price, false)
      or headband in ('exclusive_offer', 'exclusive_online') as is_offer
  from source
)
update public.dia_products p
set
  promo_name = case
    when o.description ~* '^\s*[0-9]+\s*x\s*[0-9]+'
      then regexp_replace(lower(o.description), '^\s*([0-9]+)\s*x\s*([0-9]+).*$', '\1x\2', 'i')
    when o.description ~* '^\s*[0-9]+[ªa]?\s*(ud(\.|s)?|unidad(es)?)\s+(al\s+)?[0-9]+\s*%'
      then regexp_replace(
        o.description,
        '^\s*([0-9]+)[ªa]?\s*(ud(\.|s)?|unidad(es)?)\s+(al\s+)?([0-9]+)\s*%.*$',
        '\1ª unidad al \6%',
        'i'
      )
    when o.description ~* '^\s*[0-9]+\s*ud(\.|s)?\s+por\s+[0-9]+([,.][0-9]+)?\s*euros?'
      then regexp_replace(
        o.description,
        '^\s*([0-9]+)\s*ud(\.|s)?\s+por\s+([0-9]+([,.][0-9]+)?)\s*euros?.*$',
        '\1 uds. por \3 €',
        'i'
      )
    when o.description is not null and o.headband = 'exclusive_online' then 'Oferta online'
    when o.description is not null then 'Promoción CLUB Dia'
    when o.discount_pct > 0 and o.is_club then 'CLUB Dia · ' || o.discount_pct::text || '%'
    when o.discount_pct > 0 then 'Oferta · ' || o.discount_pct::text || '%'
    when o.is_club then 'Oferta CLUB Dia'
    else 'Oferta'
  end,
  promo_text = o.description,
  promo_base_price = case
    when o.strikethrough_price > o.unit_price then o.strikethrough_price
    else null
  end,
  offer_regions = null,
  regional_offers = '{}'::jsonb
from offers o
where p.id = o.id
  and o.is_offer;

update public.dia_products
set
  promo_name = null,
  promo_text = null,
  promo_base_price = null,
  offer_regions = '{}'::text[],
  regional_offers = '{}'::jsonb
where not (
  coalesce((raw #>> '{prices,is_promo_price}')::boolean, false)
  or raw #>> '{promotions,0,description}' is not null
  or coalesce(nullif(raw #>> '{prices,strikethrough_price}', '')::numeric > unit_price, false)
  or coalesce(raw->>'headband_promotion' in ('exclusive_offer', 'exclusive_online'), false)
);

create index if not exists dia_products_offers_name_idx
  on public.dia_products (display_name_norm, id)
  where published = true and promo_name is not null;

create index if not exists dia_products_offer_regions_gin_idx
  on public.dia_products using gin (offer_regions)
  where published = true and promo_name is not null;

comment on column public.dia_products.promo_name is
  'Etiqueta corta de la oferta DIA (3x2, 2ª unidad, CLUB Dia con porcentaje).';
comment on column public.dia_products.promo_text is
  'Condiciones completas publicadas por DIA para promociones de lote/online.';
comment on column public.dia_products.promo_base_price is
  'Precio anterior tachado cuando la oferta es un descuento directo.';
comment on column public.dia_products.offer_regions is
  'CCAA donde la oferta está activa; NULL = todas, {} = ninguna.';
comment on column public.dia_products.regional_offers is
  'Snapshot por CCAA de etiqueta, condiciones, precio de oferta y precio anterior.';
