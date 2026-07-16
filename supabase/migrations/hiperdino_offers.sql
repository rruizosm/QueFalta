-- Ofertas explícitas de HiperDino.
--
-- Magento publica final_price y regular_price en el mismo producto. Solo se
-- considera oferta si regular_price es estrictamente mayor que final_price;
-- una variación frente a un sync anterior no interviene en esta decisión.
--
-- Ejecutar DESPUÉS de hiperdino_catalog.sql y ANTES del próximo sync de
-- HiperDino, que ya enviará promo_base_price.

alter table public.hiperdino_products
  add column if not exists promo_base_price numeric;

create index if not exists hiperdino_products_promo_idx
  on public.hiperdino_products (promo_base_price)
  where promo_base_price is not null;

comment on column public.hiperdino_products.promo_base_price is
  'Precio regular tachado de Magento cuando es superior a final_price; NULL sin oferta.';
