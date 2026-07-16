-- Consum multi-zona: disponibilidad por CCAA y precios por zona de reparto.
-- Ejecutar DESPUÉS de consum_catalog.sql y ANTES del primer sync multi-zona.
-- `regions` conserva el contrato común: NULL = disponible en todas las CCAA
-- barridas; si no, contiene los nombres locales de CCAA. `regional_prices` se
-- indexa por zone id de Consum (X-TOL-ZONE), no por CCAA, porque València tiene
-- varias zonas de reparto.
alter table public.consum_products
  add column if not exists regions text[],
  add column if not exists regional_prices jsonb;

comment on column public.consum_products.regions is
  'CCAA donde Consum ofrece el producto; NULL = disponible en todas las zonas barridas.';
comment on column public.consum_products.regional_prices is
  'Precio distinto del centro de referencia, por zone id Consum: {zone:{p,pf,ppu,ppuu,av}}.';
