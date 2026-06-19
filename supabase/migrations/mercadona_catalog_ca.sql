-- Fase 2 (bilingüe): nombre de producto de Mercadona EN CATALÁN para el espejo.
--
-- La pestaña "Productos" del catálogo busca en el espejo (mercadona_products), no
-- en la API en vivo, así que necesita el nombre catalán guardado. Las demás vistas
-- de Mercadona (categorías, subcategoría→productos, detalle, sugeridos) sí van en
-- vivo y ya salen en català con `lang=ca` (src/api/mercadona.ts), sin tocar nada.
--
-- Mercadona expone el mismo catálogo con `lang=ca` (mismos ids/precios/imagen, solo
-- cambia el texto). El sync (scripts/sync-catalog.mjs) hace una 2ª pasada `lang=ca`
-- y rellena `display_name_ca`. Solo Mercadona soporta catalán por API; el resto de
-- súpers se quedan con su idioma nativo (ver memoria idioma-catalan-apis).
--
-- Aditivo: no toca columnas/índices existentes. Ejecutar en: Supabase → SQL Editor.

-- Nombre catalán (NULL hasta que el sync corra su 2ª pasada → fallback al castellano).
alter table public.mercadona_products
  add column if not exists display_name_ca text;

-- Columna normalizada para BUSCAR en catalán (minúsculas + sin acentos), con el
-- mismo wrapper inmutable f_unaccent de catalog_unaccent_search.sql. Usa
-- coalesce(display_name_ca, display_name): así, ANTES de que el sync rellene el
-- catalán, equivale al nombre castellano normalizado → la búsqueda en català sigue
-- funcionando (encuentra por el nombre español) y, tras el sync, ya casa en català.
alter table public.mercadona_products
  add column if not exists display_name_ca_norm text
  generated always as (lower(public.f_unaccent(coalesce(display_name_ca, display_name)))) stored;

create index if not exists mercadona_products_ca_norm_trgm_idx
  on public.mercadona_products using gin (display_name_ca_norm gin_trgm_ops);
