-- Fase 2 (bilingüe): nombre EN CATALÁN para el espejo de bonÀrea.
--
-- Igual que Bonpreu: bonÀrea lee TODO de su espejo (categorías, listados por
-- subcategoría, búsqueda y detalle), así que guardamos los DOS idiomas:
--   display_name / name      → castellano (primario, fallback)
--   display_name_ca / name_ca → catalán (lo rellena la 2ª pasada del sync)
-- y la app elige columna según el idioma activo (src/api/catalog.ts).
--
-- El idioma lo fija la ruta del endpoint (/es/shop vs /ca/shop). El sync hace una
-- pasada en cada idioma y casa por id (los ids son estables entre idiomas).
--
-- Aditivo: no toca columnas/índices existentes. Ejecutar en: Supabase → SQL Editor.

-- ── Productos ────────────────────────────────────────────────────────────────
alter table public.bonarea_products
  add column if not exists display_name_ca text;

alter table public.bonarea_products
  add column if not exists display_name_ca_norm text
  generated always as (lower(public.f_unaccent(coalesce(display_name_ca, display_name)))) stored;

create index if not exists bonarea_products_ca_norm_trgm_idx
  on public.bonarea_products using gin (display_name_ca_norm gin_trgm_ops);

-- ── Categorías ───────────────────────────────────────────────────────────────
alter table public.bonarea_categories
  add column if not exists name_ca text;
