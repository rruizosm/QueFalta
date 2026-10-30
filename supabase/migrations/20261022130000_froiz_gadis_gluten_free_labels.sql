-- Materializa las marcas explícitas de sin gluten que publican ambos catálogos.
UPDATE public.froiz_products
SET gluten_free_label = coalesce(raw #>> '{properties,is_glutenfree}' = 'true', false)
WHERE gluten_free_label IS DISTINCT FROM coalesce(raw #>> '{properties,is_glutenfree}' = 'true', false);

UPDATE public.gadis_products AS product
SET gluten_free_label = EXISTS (
  SELECT 1
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(product.raw -> 'properties') = 'array' THEN product.raw -> 'properties'
      ELSE '[]'::jsonb
    END
  ) AS property
  WHERE property ->> 'property_code' = '16'
)
WHERE gluten_free_label IS DISTINCT FROM EXISTS (
  SELECT 1
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(product.raw -> 'properties') = 'array' THEN product.raw -> 'properties'
      ELSE '[]'::jsonb
    END
  ) AS property
  WHERE property ->> 'property_code' = '16'
);
