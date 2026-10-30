-- Backfill de las etiquetas explícitas sin gluten de Carrefour y Aldi.
-- Los syncs escriben también esta columna para mantenerla al día.

update public.carrefour_products
set gluten_free_label = coalesce(
  raw->'info_tags' @> '[{"message":"Sin gluten"}]'::jsonb,
  false
)
where gluten_free_label is distinct from coalesce(
  raw->'info_tags' @> '[{"message":"Sin gluten"}]'::jsonb,
  false
);

update public.aldi_products
set gluten_free_label = coalesce(
  raw->'assets' @> '[{"type":"certificate","url":"https://s7g10.scene7.com/is/image/aldinord/07_Sin_gluten"}]'::jsonb,
  false
)
where gluten_free_label is distinct from coalesce(
  raw->'assets' @> '[{"type":"certificate","url":"https://s7g10.scene7.com/is/image/aldinord/07_Sin_gluten"}]'::jsonb,
  false
);
