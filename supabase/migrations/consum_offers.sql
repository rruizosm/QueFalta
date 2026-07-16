-- Ofertas explícitas de Consum.
--
-- Consum distingue una oferta de un cambio de precio normal con dos entradas en
-- priceData.prices: PRICE (habitual) y OFFER_PRICE (oferta activa). El sync
-- persiste esa señal de la API; NO se deriva de prev_unit_price ni del
-- histórico semanal.
--
-- Ejecutar DESPUÉS de consum_catalog.sql y consum_regions.sql, y ANTES del
-- próximo sync de Consum (el UPSERT ya enviará estas columnas).

alter table public.consum_products
  add column if not exists promo_base_price numeric,
  add column if not exists offer_zones text[];

create index if not exists consum_products_offer_zones_idx
  on public.consum_products using gin (offer_zones);

comment on column public.consum_products.promo_base_price is
  'Precio PRICE de Consum cuando el producto de la zona de referencia tiene OFFER_PRICE; NULL si no hay oferta.';
comment on column public.consum_products.offer_zones is
  'X-TOL-ZONE donde Consum marca explícitamente OFFER_PRICE; no incluye simples cambios de precio.';
