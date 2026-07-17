-- Multi-zona por comunidad autónoma para el catálogo de Carrefour.
-- Aditiva sobre carrefour_catalog.sql. Ejecutar en: Supabase → SQL Editor.
-- Después, relanzar el sync (tarea/So workflow de Carrefour).
--
-- Carrefour REGIONALIZA catálogo Y precio por código postal: cada CP resuelve a un
-- ALMACÉN (werks_id) distinto (48 en toda España, incluso sub-provincia: Madrid
-- capital ≠ Las Rozas). El catálogo SSR que raspa scripts/sync-carrefour.mjs elige
-- almacén según la cookie `salepoint`; SIN cookie = Madrid (COL PINAR, CP 28232).
-- Verificado en vivo 2026-07-14: en una categoría (aceites y vinagres) Las Palmas
-- tiene 224 productos vs 156 de Madrid (85 exclusivos: marcas canarias), Barcelona
-- trae aceites catalanes que Madrid no, y el precio difiere en 43-59% de los
-- comunes → un crawl único de Madrid se pierde miles de productos regionales.
--
-- El sync barre UNA zona representativa por comunidad autónoma (la capital, ~19
-- zonas deduplicadas por almacén; decisión de coste vs los 48 almacenes) fijando
-- la cookie del CP, y une los productos por product_id (id global de Carrefour).
-- Guarda:
--   regions text[]      = CCAA donde el producto está disponible; NULL = NACIONAL
--                         (aparece en TODAS las CCAA barridas). Misma semántica que
--                         mercadona_products.regions / dia_products.regions.
--   regional_prices jsonb = precio por CCAA cuando difiere del de Madrid (base):
--                         { "<CCAA>": {"p":unit_price,"pf":price_format,
--                           "ppu":price_per_unit,"ppuu":unidad,"av":disponible} }.
--                         NULL si el precio es uniforme en todas las CCAA. Las
--                         columnas base (unit_price, price_format, price_per_unit…)
--                         siguen siendo las de MADRID (COL PINAR, = comportamiento
--                         actual sin cookie) → la app no cambia hasta implementar
--                         el filtro por CP/comunidad (ver src/constants/regions.ts).
--
-- HOY solo se GUARDA (la app aún no filtra el catálogo de Carrefour por comunidad):
-- se persiste ahora para no rehacer el barrido multi-zona después. Los nombres de
-- CCAA van en su forma local (Catalunya, Comunitat Valenciana, Euskadi…), igual que
-- en Mercadona/Dia (ver scripts/lib/province-community.mjs).

alter table public.carrefour_products
  add column if not exists regions text[];             -- CCAA donde está disponible; NULL = nacional

alter table public.carrefour_products
  add column if not exists regional_prices jsonb;       -- {CCAA: {p,pf,ppu,ppuu,av}} cuando el precio difiere de Madrid; NULL = uniforme
