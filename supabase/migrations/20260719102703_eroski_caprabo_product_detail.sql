-- Amplía la ficha incremental de Eroski y Caprabo.
-- Al dejar detail_synced_at a NULL, el sync vuelve a descargar cada PDP de forma
-- progresiva (DETAIL_MAX) para rellenar los nuevos campos sin esperar al TTL.

alter table public.eroski_products
  add column if not exists ingredients text,
  add column if not exists conservation text,
  add column if not exists manufacturer text;

alter table public.caprabo_products
  add column if not exists ingredients text,
  add column if not exists conservation text,
  add column if not exists manufacturer text;

comment on column public.eroski_products.ingredients is
  'Ingredientes publicados en la ficha de Eroski.';
comment on column public.eroski_products.conservation is
  'Condiciones de conservación publicadas en la ficha de Eroski.';
comment on column public.eroski_products.manufacturer is
  'Fabricante y dirección publicados en la ficha de Eroski.';
comment on column public.caprabo_products.ingredients is
  'Ingredientes publicados en la ficha de Caprabo.';
comment on column public.caprabo_products.conservation is
  'Condiciones de conservación publicadas en la ficha de Caprabo.';
comment on column public.caprabo_products.manufacturer is
  'Fabricante y dirección publicados en la ficha de Caprabo.';

update public.eroski_products
set detail_synced_at = null
where ingredients is null
  and conservation is null
  and manufacturer is null;

update public.caprabo_products
set detail_synced_at = null
where ingredients is null
  and conservation is null
  and manufacturer is null;
