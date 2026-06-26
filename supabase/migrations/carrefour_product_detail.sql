-- Ficha de producto de Carrefour (INGREDIENTES, NUTRICIÓN, ORIGEN, OPERADOR…).
-- Aditiva sobre carrefour_catalog.sql. La rellena scripts/sync-carrefour.mjs leyendo la
-- página de cada producto (raw.url → /supermercado/<slug>/R-<id>/p): Carrefour embebe el
-- producto en window.__INITIAL_STATE__ con `nutrition_info` TOTALMENTE estructurado
-- (ingredientes, alergenos{contiene,puedeContener}, valorEnergetico, macros, y `masInfo`
-- con nombre/valor: conservación, denominación legal, dirección del operador…). Solo
-- castellano → sin columnas _ca.
--
-- Coste: la ficha cambia poco frente al precio (diario) → el sync solo descarga la de
-- productos SIN ella o con detail_synced_at viejo (DETAIL_TTL_DAYS); el resto arrastra la
-- guardada. OJO: Carrefour está tras Cloudflare (el sync corre en local) → la pasada de
-- ficha multiplica peticiones; el crawl incremental + DETAIL_MAX la reparten en días.
-- Ejecutar en: Supabase → SQL Editor.

alter table public.carrefour_products
  add column if not exists ingredients       text,        -- nutrition_info.ingredientes (alérgenos en negrita en origen → inline)
  add column if not exists allergens         text,        -- nutrition_info.alergenos (contiene / puede contener)
  add column if not exists nutrition         text,        -- valorEnergetico + macros → texto (un nutriente por línea)
  add column if not exists conservation      text,        -- masInfo: condiciones de consumo una vez abierto
  add column if not exists preparation       text,        -- masInfo: modo de empleo / instrucciones de uso
  add column if not exists denomination      text,        -- masInfo: denominación legal
  add column if not exists origin            text,        -- masInfo: país de origen (cuando va como ítem aparte)
  add column if not exists operator          text,        -- masInfo: dirección del operador + razón social
  add column if not exists detail_synced_at  timestamptz; -- última vez que se descargó la ficha (null = nunca)

-- Para que el sync localice rápido los productos que aún no tienen ficha (o está vieja).
create index if not exists carrefour_products_detail_synced_idx
  on public.carrefour_products (detail_synced_at nulls first);
