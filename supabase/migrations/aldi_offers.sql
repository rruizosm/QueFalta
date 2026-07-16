-- Ofertas explícitas de Aldi.
--
-- Los hits de Algolia incluyen el precio actual, currentPrice.strikePrice,
-- etiquetas de promoción y periodo de validez. Solo se persiste una oferta si
-- el precio tachado es estrictamente mayor que el actual; no se usan cambios
-- entre syncs como señal de promoción.
--
-- Ejecutar DESPUÉS de aldi_catalog.sql y ANTES del próximo sync de Aldi.

alter table public.aldi_products
  add column if not exists promo_name text,
  add column if not exists promo_base_price numeric,
  add column if not exists promo_end date;

create index if not exists aldi_products_promo_end_idx
  on public.aldi_products (promo_end)
  where promo_base_price is not null;

comment on column public.aldi_products.promo_base_price is
  'Precio tachado de Aldi si es estrictamente mayor que currentPrice.priceValue; NULL sin oferta.';
