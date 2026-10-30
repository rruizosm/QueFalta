-- Índices parciales para las páginas del filtro sin gluten ordenadas por precio.
create index if not exists froiz_gluten_unit_price_asc_idx
  on public.froiz_products (unit_price asc, id asc)
  where published and gluten_free_label and unit_price is not null;
create index if not exists froiz_gluten_unit_price_desc_idx
  on public.froiz_products (unit_price desc, id asc)
  where published and gluten_free_label and unit_price is not null;
create index if not exists froiz_gluten_ppu_asc_idx
  on public.froiz_products (price_per_unit asc, id asc)
  where published and gluten_free_label and price_per_unit is not null;
create index if not exists froiz_gluten_ppu_desc_idx
  on public.froiz_products (price_per_unit desc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists gadis_gluten_unit_price_asc_idx
  on public.gadis_products (unit_price asc, id asc)
  where published and gluten_free_label and unit_price is not null;
create index if not exists gadis_gluten_unit_price_desc_idx
  on public.gadis_products (unit_price desc, id asc)
  where published and gluten_free_label and unit_price is not null;
create index if not exists gadis_gluten_ppu_asc_idx
  on public.gadis_products (price_per_unit asc, id asc)
  where published and gluten_free_label and price_per_unit is not null;
create index if not exists gadis_gluten_ppu_desc_idx
  on public.gadis_products (price_per_unit desc, id asc)
  where published and gluten_free_label and price_per_unit is not null;
