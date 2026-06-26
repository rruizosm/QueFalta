-- Ficha de producto de bonÀrea (DESCRIPCIÓN, INGREDIENTES, NUTRICIÓN, ORIGEN…).
-- Aditiva sobre bonarea_catalog.sql. La rellena scripts/sync-bonarea.mjs leyendo la
-- página de cada producto (raw.urlFriendly): bonÀrea sirve la ficha como HTML en
-- servidor (bloque .general-product-info), con pares <strong>ETIQUETA</strong><p>valor</p>.
--
-- Coste: la ficha cambia poco (ingredientes/origen son cuasi-estáticos) frente al
-- precio (diario) → el sync solo descarga la ficha de productos SIN ella o con
-- detail_synced_at viejo (DETAIL_TTL_DAYS). Por eso detail_synced_at es independiente
-- de synced_at (el del precio). Las columnas son anulables: un producto sin ficha
-- (o aún no rastreado) simplemente no las muestra.
-- Ejecutar en: Supabase → SQL Editor.

-- Bilingüe (como display_name/display_name_ca): bonÀrea sirve la ficha en castellano
-- y en català por urlFriendly distintas (/online/producto/… vs /online/producte/…). Se
-- guardan las dos y la app (mapBonarea) elige según el idioma activo, con fallback al
-- castellano si falta el català.
alter table public.bonarea_products
  add column if not exists description      text,        -- DESCRIPCIÓN
  add column if not exists ingredients       text,        -- INGREDIENTES (con alérgenos en mayúsculas/negrita en origen)
  add column if not exists allergens          text,        -- ALÉRGENOS (sección aparte cuando bonÀrea la separa)
  add column if not exists nutrition          text,        -- INFORMACIÓN NUTRICIONAL (texto libre, saltos de línea por nutriente)
  add column if not exists conservation       text,        -- CONSERVACIÓN
  add column if not exists denomination       text,        -- DENOMINACIÓN (nombre legal)
  add column if not exists origin             text,        -- ORIGEN / PAÍS DE ORIGEN
  add column if not exists operator           text,        -- NOMBRE Y DIRECCIÓN DEL OPERADOR
  add column if not exists description_ca     text,        -- ídem en català (DESCRIPCIÓ)
  add column if not exists ingredients_ca     text,        -- INGREDIENTS
  add column if not exists allergens_ca       text,        -- AL·LÈRGENS
  add column if not exists nutrition_ca       text,        -- INFORMACIÓ NUTRICIONAL
  add column if not exists conservation_ca    text,        -- CONSERVACIÓ
  add column if not exists denomination_ca    text,        -- DENOMINACIÓ
  add column if not exists origin_ca          text,        -- ORIGEN
  add column if not exists operator_ca        text,        -- NOM I ADREÇA DE L'OPERADOR
  add column if not exists detail_synced_at   timestamptz; -- última vez que se descargó la ficha (null = nunca)

-- Para que el sync localice rápido los productos que aún no tienen ficha (o está vieja).
create index if not exists bonarea_products_detail_synced_idx
  on public.bonarea_products (detail_synced_at nulls first);
