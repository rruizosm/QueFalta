-- Nutricion estructurada de Mercadona.
--
-- La respuesta nueva de GET /api/products/{id}/ con x-version=v9317 expone
-- product_information.nutritional_information como tabla por 100 g/ml. Se guarda
-- tal cual en jsonb para poder calcular el indice nutricional si Open Food Facts
-- no tiene ese EAN.

alter table public.mercadona_products
  add column if not exists nutrition jsonb;

alter table public.mercadona_products
  drop constraint if exists mercadona_products_nutrition_json;

alter table public.mercadona_products
  add constraint mercadona_products_nutrition_json
  check (
    nutrition is null
    or jsonb_typeof(nutrition) in ('array', 'object')
  );

comment on column public.mercadona_products.nutrition is
  'Tabla nutricional estructurada de Mercadona (product_information.nutritional_information). NULL si la API no la expone.';
