-- Índices parciales para las páginas del filtro sin gluten, ordenadas por
-- precio de envase o precio por unidad. Asc/desc mantienen id ascendente como
-- desempate del cursor keyset.

create index if not exists aldi_gluten_unit_price_asc_idx
  on public.aldi_products (unit_price asc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists aldi_gluten_unit_price_desc_idx
  on public.aldi_products (unit_price desc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists aldi_gluten_ppu_asc_idx
  on public.aldi_products (price_per_unit asc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists aldi_gluten_ppu_desc_idx
  on public.aldi_products (price_per_unit desc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists carrefour_gluten_unit_price_asc_idx
  on public.carrefour_products (unit_price asc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists carrefour_gluten_unit_price_desc_idx
  on public.carrefour_products (unit_price desc, id asc)
  where published and gluten_free_label and unit_price is not null;

create index if not exists carrefour_gluten_ppu_asc_idx
  on public.carrefour_products (price_per_unit asc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists carrefour_gluten_ppu_desc_idx
  on public.carrefour_products (price_per_unit desc, id asc)
  where published and gluten_free_label and price_per_unit is not null;
