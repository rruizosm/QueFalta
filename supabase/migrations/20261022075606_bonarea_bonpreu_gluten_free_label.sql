-- Etiqueta declarada por cada supermercado. «false» solo indica que el producto
-- no trae esta etiqueta; no equivale a afirmar que contiene gluten.
-- STORED rellena los datos existentes y se recalcula cuando el sync cambia raw.
alter table public.bonarea_products
  add column if not exists gluten_free_label boolean
  generated always as (
    raw @> '{"caracteristiques":[{"descripcio":"SENSE_GLUTEN"}]}'::jsonb
  ) stored not null;

alter table public.bonpreu_products
  add column if not exists gluten_free_label boolean
  generated always as (
    raw @> '{"iconAttributes":[{"file":"glutenFree"}]}'::jsonb
  ) stored not null;

-- Los dos booleanos son claves en vez de predicados parciales para que el
-- índice sirva también en consultas preparadas de PostgREST.
create index if not exists bonarea_products_gluten_es_idx
  on public.bonarea_products (published, gluten_free_label, display_name_norm, id);
create index if not exists bonarea_products_gluten_ca_idx
  on public.bonarea_products (published, gluten_free_label, display_name_ca_norm, id);
create index if not exists bonpreu_products_gluten_es_idx
  on public.bonpreu_products (published, gluten_free_label, display_name_norm, id);
create index if not exists bonpreu_products_gluten_ca_idx
  on public.bonpreu_products (published, gluten_free_label, display_name_ca_norm, id);

analyze public.bonarea_products;
analyze public.bonpreu_products;
