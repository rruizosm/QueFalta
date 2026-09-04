-- Índices de cobertura para las claves foráneas introducidas por el catálogo
-- Lidl multitienda. Evitan escaneos completos durante cascadas, validaciones y
-- cambios de la tienda elegida en profiles.

set lock_timeout = '5s';
set statement_timeout = '120s';

create index if not exists lidl_postal_stores_store_id_idx
  on public.lidl_postal_stores (store_id);

create index if not exists lidl_store_categories_category_id_idx
  on public.lidl_store_categories (category_id);

create index if not exists lidl_store_products_product_id_idx
  on public.lidl_store_products (product_id);

create index if not exists profiles_lidl_store_id_idx
  on public.profiles (lidl_store_id)
  where lidl_store_id is not null;
