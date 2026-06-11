-- Fase 1a de COMPARATIVA.md — €/unidad NORMALIZADO en los cuatro espejos.
-- Es la señal que ORDENA la comparativa ("equivalente más barato"), no solo se
-- muestra. Lo pueblan los syncs desde el dato estructurado de cada retailer.
--
-- Dos columnas:
--   price_per_unit       numeric  → € por UNIDAD CANÓNICA (no por envase).
--   price_per_unit_unit  text     → la base canónica: 'l' | 'kg' | 'ud'.
--
-- "Canónica" = una sola base por dimensión, para que sea comparable entre tiendas:
--   líquidos → €/L (ml/cl/dl se convierten ×1000/×100/×10),
--   peso     → €/kg (g/mg se convierten),
--   conteo   → €/ud.
-- Así un gel a "0,01 €/ml" se guarda como 10 €/L y NO parece más barato que la
-- leche a 0,96 €/L. unit_price (la columna que ya existía) sigue siendo el precio
-- TOTAL del envase; esto es aparte.
--
-- NULL = el retailer no da €/unidad para ese producto (p.ej. parte de Carrefour).
-- Ejecutar en: Supabase → SQL Editor.

alter table public.mercadona_products
  add column if not exists price_per_unit      numeric,
  add column if not exists price_per_unit_unit text;

alter table public.bonpreu_products
  add column if not exists price_per_unit      numeric,
  add column if not exists price_per_unit_unit text;

alter table public.carrefour_products
  add column if not exists price_per_unit      numeric,
  add column if not exists price_per_unit_unit text;

alter table public.bonarea_products
  add column if not exists price_per_unit      numeric,
  add column if not exists price_per_unit_unit text;

comment on column public.mercadona_products.price_per_unit is '€ por unidad canónica (price_per_unit_unit). NULL = sin dato.';
comment on column public.bonpreu_products.price_per_unit  is '€ por unidad canónica (price_per_unit_unit). NULL = sin dato.';
comment on column public.carrefour_products.price_per_unit is '€ por unidad canónica (price_per_unit_unit). NULL = sin dato.';
comment on column public.bonarea_products.price_per_unit  is '€ por unidad canónica (price_per_unit_unit). NULL = sin dato.';
