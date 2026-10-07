-- Ilustración recortada de cada producto Mercadona, independiente de la foto
-- oficial (`thumbnail`). El archivo transparente vive fuera de Postgres; aquí
-- se guarda su URL pública. NULL indica que aún no hay ilustración aprobada.
alter table public.mercadona_products
  add column if not exists illustration_url text;

comment on column public.mercadona_products.illustration_url is
  'URL de la ilustración del producto con transparencia real (PNG/WebP); NULL si no existe. No sustituye thumbnail ni se actualiza desde la API de Mercadona.';
