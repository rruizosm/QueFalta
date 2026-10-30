-- Materializa la señal explícita de producto sin gluten en los catálogos
-- existentes. El sync actualizará este booleano en cada upsert posterior.
UPDATE public.condis_products
SET gluten_free_label = coalesce(raw ->> 'without_gluten' IN ('1', 'true'), false)
WHERE gluten_free_label IS DISTINCT FROM coalesce(raw ->> 'without_gluten' IN ('1', 'true'), false);

UPDATE public.dia_products AS product
SET gluten_free_label = EXISTS (
  SELECT 1
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(product.raw -> 'allergens') = 'array' THEN product.raw -> 'allergens'
      ELSE '[]'::jsonb
    END
  ) AS allergen
  WHERE lower(trim(allergen ->> 'name')) IN ('sin gluten', 'sense gluten')
)
WHERE gluten_free_label IS DISTINCT FROM EXISTS (
  SELECT 1
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(product.raw -> 'allergens') = 'array' THEN product.raw -> 'allergens'
      ELSE '[]'::jsonb
    END
  ) AS allergen
  WHERE lower(trim(allergen ->> 'name')) IN ('sin gluten', 'sense gluten')
);
