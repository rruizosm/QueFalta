-- Ficha de producto de Dia (INGREDIENTES, NUTRICIÓN, CONSERVACIÓN, DENOMINACIÓN…).
-- Aditiva sobre dia_catalog.sql. La rellena scripts/sync-dia.mjs leyendo la página de
-- cada producto (raw.url): dia.es es un SSR Vike con TODO el producto estructurado en el
-- JSON embebido <script id="vike_pageContext"> (ingredients.text, nutritional_info,
-- instructions, manufacturer_contact, product_info). NO bilingüe: dia.es es solo en
-- castellano (a diferencia de bonÀrea/Mercadona), así que no hay columnas _ca.
--
-- Coste: la ficha cambia poco frente al precio (diario) → el sync solo descarga la de
-- productos SIN ficha o con detail_synced_at viejo (DETAIL_TTL_DAYS); el resto arrastra
-- la guardada. Columnas anulables: un producto sin ficha simplemente no las muestra.
-- Ejecutar en: Supabase → SQL Editor.

alter table public.dia_products
  add column if not exists description       text,        -- product_info.description (cuando existe)
  add column if not exists ingredients       text,        -- ingredients.text (alérgenos en negrita en origen → quedan inline)
  add column if not exists nutrition         text,        -- nutritional_info estructurada → texto (un nutriente por línea)
  add column if not exists conservation      text,        -- instructions.storage_instructions.text
  add column if not exists preparation       text,        -- instructions.instructions_for_preparation.text
  add column if not exists denomination      text,        -- product_info.product (nombre legal)
  add column if not exists operator          text,        -- manufacturer_contact (nombre + dirección)
  add column if not exists detail_synced_at  timestamptz; -- última vez que se descargó la ficha (null = nunca)

-- Para que el sync localice rápido los productos que aún no tienen ficha (o está vieja).
create index if not exists dia_products_detail_synced_idx
  on public.dia_products (detail_synced_at nulls first);
