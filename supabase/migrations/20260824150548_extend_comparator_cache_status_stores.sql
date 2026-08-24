-- La caché incremental validaba todavía las 15 tiendas originales aunque
-- las RPC v3/v5 ya admiten Froiz, Gadis y Ahorramás. Sin ampliar esta
-- restricción, una búsqueda real falla al persistir el estado del destino.

alter table public.catalog_product_match_cache_status
  drop constraint catalog_product_match_cache_status_target_store_check;

alter table public.catalog_product_match_cache_status
  add constraint catalog_product_match_cache_status_target_store_check
  check (target_store = any (array[
    'mercadona','esclat','carrefour','bonarea','consum','dia','sorli','eroski',
    'caprabo','condis','ametller','aldi','hiperdino','alcampo','plusfresc',
    'gadis','froiz','ahorramas'
  ]::text[]));
