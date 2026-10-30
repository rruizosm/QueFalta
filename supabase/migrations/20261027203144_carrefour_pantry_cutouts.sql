alter table public.carrefour_products
  add column if not exists illustration_url text;

comment on column public.carrefour_products.illustration_url is
  'Fotografía aprobada con fondo transparente para Despensa/Nevera. No sustituye thumbnail. Excluir Papelería, Bazar y Calzado del proceso de recorte.';

create index if not exists carrefour_products_pantry_illustrated_idx
  on public.carrefour_products (display_name_norm, id)
  where published and available and illustration_url is not null and illustration_url <> '';
