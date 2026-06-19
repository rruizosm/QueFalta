-- Fase 2 (bilingüe): nombre EN CATALÁN para el espejo de BonpreuEsclat.
--
-- A diferencia de Mercadona (que va en vivo por API y solo necesitaba el catalán
-- para la búsqueda del espejo), Bonpreu lee TODO de su espejo: categorías, listados
-- por subcategoría, búsqueda y detalle. Por eso guardamos los DOS idiomas:
--   display_name / name      → castellano (primario, fallback)
--   display_name_ca / name_ca → catalán (lo rellena la 2ª pasada del sync)
-- y la app elige columna según el idioma activo (src/api/catalog.ts).
--
-- La web de Bonpreu es bilingüe: la cookie `language` (es-ES | ca-ES) controla el
-- idioma de categorías y de la hidratación de productos. El sync hace una pasada en
-- cada idioma y casa por id (los ids son estables entre idiomas).
--
-- Aditivo: no toca columnas/índices existentes. Ejecutar en: Supabase → SQL Editor.

-- ── Productos ────────────────────────────────────────────────────────────────
alter table public.bonpreu_products
  add column if not exists display_name_ca text;

-- Columna normalizada para BUSCAR/ORDENAR en catalán (minúsculas + sin acentos),
-- con el mismo wrapper inmutable f_unaccent de catalog_unaccent_search.sql.
-- coalesce(display_name_ca, display_name): antes de que el sync rellene el catalán
-- equivale al nombre castellano normalizado → la búsqueda en català sigue
-- funcionando, y tras el sync ya casa en català.
alter table public.bonpreu_products
  add column if not exists display_name_ca_norm text
  generated always as (lower(public.f_unaccent(coalesce(display_name_ca, display_name)))) stored;

create index if not exists bonpreu_products_ca_norm_trgm_idx
  on public.bonpreu_products using gin (display_name_ca_norm gin_trgm_ops);

-- ── Categorías ───────────────────────────────────────────────────────────────
-- El árbol de categorías se ordena en cliente (sortByName), así que basta el texto
-- (sin columna normalizada ni índice).
alter table public.bonpreu_categories
  add column if not exists name_ca text;
