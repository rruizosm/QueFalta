-- La ilustración pertenece al producto único Lidl, no a cada tienda.
-- La fotografía original, precio y disponibilidad se conservan.
alter table public.lidl_product_master
  add column if not exists illustration_url text;

comment on column public.lidl_product_master.illustration_url is
  'URL pública de una ilustración aprobada del producto; independiente de la fotografía original.';
