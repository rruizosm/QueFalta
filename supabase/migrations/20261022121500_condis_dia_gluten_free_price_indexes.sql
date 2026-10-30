-- Índices parciales para servir en orden de precio las páginas del filtro
-- sin gluten sin recorrer productos que no tienen la etiqueta.
create index if not exists condis_gluten_unit_price_asc_idx
  on public.condis_products (unit_price asc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists condis_gluten_unit_price_desc_idx
  on public.condis_products (unit_price desc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists condis_gluten_ppu_asc_idx
  on public.condis_products (price_per_unit asc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists condis_gluten_ppu_desc_idx
  on public.condis_products (price_per_unit desc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists dia_gluten_unit_price_asc_idx
  on public.dia_products (unit_price asc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists dia_gluten_unit_price_desc_idx
  on public.dia_products (unit_price desc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists dia_gluten_ppu_asc_idx
  on public.dia_products (price_per_unit asc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists dia_gluten_ppu_desc_idx
  on public.dia_products (price_per_unit desc, id asc)
  where published and gluten_free_label and price_per_unit is not null;
