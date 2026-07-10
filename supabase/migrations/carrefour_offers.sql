-- Ofertas de Carrefour: promociona a columnas los datos de promoción que el SSR
-- ya trae en cada producto de listado (y que el sync guarda enteros en `raw`):
--   · badge/badge_map.promotions[0] → promo de lote ("3x2", "2ª unidad -70%",
--     "5€ dto."…) con texto completo de condiciones y fechas de validez.
--   · strikethrough_price → descuento directo (el precio anterior tachado;
--     unit_price ya es el rebajado).
-- Las lee fetchCarrefourOffers (src/api/catalog.ts) para la pantalla "Ofertas"
-- del Home (paginada por keyset sobre display_name_norm) y fetchCarrefourProduct
-- para el banner de oferta de la ficha (CarrefourProductModal).
--
-- ⚠️ IMPRESCINDIBLE ejecutarla ANTES del próximo sync de Carrefour: normalize()
-- (scripts/sync-carrefour.mjs) ya incluye estas columnas en el upsert y falla
-- por columna inexistente sin ellas. El BACKFILL de abajo puebla las ofertas
-- desde el `raw` del último sync, así que hay datos desde el primer momento.
-- Requiere catalog_unaccent_search.sql (columna display_name_norm) para el índice.
-- Idempotente: se puede re-ejecutar entera. Ejecutar en: Supabase → SQL Editor.

alter table public.carrefour_products
  add column if not exists promo_name          text,     -- etiqueta corta ("3x2")
  add column if not exists promo_text          text,     -- condiciones completas ("Compra 3 unidades…")
  add column if not exists promo_start         date,     -- inicio de validez
  add column if not exists promo_end           date,     -- fin de validez (la app oculta caducadas)
  add column if not exists strikethrough_price numeric;  -- precio ANTERIOR (tachado); unit_price = rebajado

-- Backfill desde el raw del último sync (solo filas con datos de promo, ~5k).
-- Mismos criterios que normalize() del sync: badge_map.promotions[0] con
-- fallback a badge (que no trae fechas), y strikethrough_price parseado de
-- "2,95 €" (el regex defensivo evita que un formato inesperado aborte el UPDATE).
update public.carrefour_products set
  promo_name = coalesce(raw->'badge_map'->'promotions'->0->>'name', raw->'badge'->>'name'),
  promo_text = coalesce(raw->'badge_map'->'promotions'->0->>'pdp_text', raw->'badge'->>'description'),
  promo_start = case when raw->'badge_map'->'promotions'->0->>'start_date' ~ '^\d{2}/\d{2}/\d{4}$'
                     then to_date(raw->'badge_map'->'promotions'->0->>'start_date', 'DD/MM/YYYY') end,
  promo_end   = case when raw->'badge_map'->'promotions'->0->>'end_date' ~ '^\d{2}/\d{2}/\d{4}$'
                     then to_date(raw->'badge_map'->'promotions'->0->>'end_date', 'DD/MM/YYYY') end,
  strikethrough_price =
    case when raw->>'strikethrough_price' ~ '\d'
         then nullif(replace(replace(regexp_replace(raw->>'strikethrough_price', '[^0-9,.]', '', 'g'), '.', ''), ',', '.'), '')::numeric end
where raw ?| array['badge', 'badge_map', 'strikethrough_price'];

-- Índice parcial para el listado de ofertas: keyset (display_name_norm, id)
-- sobre solo las filas con alguna oferta viva que filtra fetchCarrefourOffers.
create index if not exists carrefour_products_offer_idx
  on public.carrefour_products (display_name_norm, id)
  where promo_name is not null or strikethrough_price is not null;
