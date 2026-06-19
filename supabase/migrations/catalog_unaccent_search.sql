-- Búsqueda de productos INSENSIBLE A ACENTOS en los 6 espejos de catálogo.
--
-- Problema: la app busca con `display_name ILIKE '%palabra%'` (server-side vía
-- PostgREST). ILIKE distingue acentos, así que "platano" no encuentra "Plátano",
-- "cafe" no encuentra "Café", etc. PostgREST solo filtra sobre columnas reales,
-- no sobre funciones aplicadas a la columna, así que no se puede meter unaccent()
-- en el filtro desde el cliente.
--
-- Solución: una columna GENERADA `display_name_norm` (minúsculas + sin acentos)
-- por tabla, con índice trigram, sobre la que la app filtra normalizando también
-- el texto del usuario (src/api/catalog.ts → filterByNameWords). Es aditivo: no
-- toca columnas ni índices existentes.
--
-- La columna `stored` se rellena sola al crearse (backfill automático) y se
-- recalcula en cada sync; los scripts de sync NO necesitan cambios (hacen upsert
-- con columnas explícitas y Postgres calcula la generada).
--
-- Ejecutar en: Supabase → SQL Editor.

-- En Supabase las extensiones viven en el esquema `extensions` (ya en el
-- search_path de los roles por defecto), no en public.
create extension if not exists unaccent with schema extensions;

-- unaccent() es STABLE (depende del diccionario); una columna generada exige una
-- función IMMUTABLE. Wrapper estándar para forzarlo (forma de 2 args = sin
-- depender del search_path para resolver el diccionario).
create or replace function public.f_unaccent(text)
returns text language sql immutable parallel safe strict as $func$
  select extensions.unaccent('extensions.unaccent', $1)
$func$;

-- ── Una columna generada + índice trigram por cada tabla *_products ──────────

alter table public.mercadona_products
  add column if not exists display_name_norm text
  generated always as (lower(public.f_unaccent(display_name))) stored;
create index if not exists mercadona_products_norm_trgm_idx
  on public.mercadona_products using gin (display_name_norm gin_trgm_ops);

alter table public.bonpreu_products
  add column if not exists display_name_norm text
  generated always as (lower(public.f_unaccent(display_name))) stored;
create index if not exists bonpreu_products_norm_trgm_idx
  on public.bonpreu_products using gin (display_name_norm gin_trgm_ops);

alter table public.carrefour_products
  add column if not exists display_name_norm text
  generated always as (lower(public.f_unaccent(display_name))) stored;
create index if not exists carrefour_products_norm_trgm_idx
  on public.carrefour_products using gin (display_name_norm gin_trgm_ops);

alter table public.bonarea_products
  add column if not exists display_name_norm text
  generated always as (lower(public.f_unaccent(display_name))) stored;
create index if not exists bonarea_products_norm_trgm_idx
  on public.bonarea_products using gin (display_name_norm gin_trgm_ops);

alter table public.consum_products
  add column if not exists display_name_norm text
  generated always as (lower(public.f_unaccent(display_name))) stored;
create index if not exists consum_products_norm_trgm_idx
  on public.consum_products using gin (display_name_norm gin_trgm_ops);

alter table public.dia_products
  add column if not exists display_name_norm text
  generated always as (lower(public.f_unaccent(display_name))) stored;
create index if not exists dia_products_norm_trgm_idx
  on public.dia_products using gin (display_name_norm gin_trgm_ops);
