-- Ofertas explícitas de Plusfresc por centro de entrega.
--
-- La API publica copias Oferta2 con new_value_cents y end_date. El sync guarda
-- esta señal de promoción separada del precio normal: nunca se infiere de un
-- cambio histórico de unit_price. Algunas promociones son de lote y mantienen
-- el mismo precio individual; siguen siendo ofertas, pero no tienen "Antes".
--
-- Ejecutar DESPUÉS de plusfresc_catalog.sql y ANTES del próximo sync de
-- Plusfresc, que ya enviará estas columnas.

alter table public.plusfresc_products
  add column if not exists promo_name text,
  add column if not exists promo_name_ca text,
  add column if not exists promo_offer_price numeric,
  add column if not exists promo_base_price numeric,
  add column if not exists promo_end date,
  add column if not exists offer_centers text[];

create index if not exists plusfresc_products_offer_centers_idx
  on public.plusfresc_products using gin (offer_centers);
create index if not exists plusfresc_products_promo_end_idx
  on public.plusfresc_products (promo_end)
  where promo_offer_price is not null;

comment on column public.plusfresc_products.offer_centers is
  'Centros donde la API de Plusfresc publica una copia Oferta2 activa.';
