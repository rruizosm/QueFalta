-- The comparator looks up a product across stores, then takes the first
-- published store. The browse index (store_id, product_id) cannot efficiently
-- seek that product, and the single-column FK index still requires sorting.
-- Keep the view, its metadata selection, grants and RLS unchanged.
set lock_timeout = '5s';
set statement_timeout = '120s';

create index lidl_store_products_comparator_idx
  on public.lidl_store_products (product_id, store_id)
  where published;
