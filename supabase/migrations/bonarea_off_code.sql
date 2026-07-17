-- Vínculo bonÀrea ↔ OpenFoodFacts (para Nutri-Score/nutrición sin visión).
-- Aditiva sobre bonarea_catalog.sql. La rellena scripts/enrich-bonarea-off.mjs
-- (one-off con WRITE=1) matcheando NOMBRES contra el universo bonÀrea de OFF,
-- porque bonÀrea NO expone EAN en ningún sitio (ni la API ShoppingBody ni el
-- HTML de la ficha — verificado 2026-07-14).
--
-- off_code va en columna PROPIA y NO en ean (antes ean13, ver ean_unify.sql) a propósito:
--  · es el código OFF del producto UNITARIO (el EAN del bric individual); en los
--    multipacks ("paq. de 6 brics") el paquete lleva OTRO código de barras → si
--    algún día se escanea un EAN real del retailer, ean sigue libre para él.
--  · el sync semanal upserta ean:null en cada pasada → habría borrado el vínculo
--    cada lunes. off_code queda FUERA del payload del sync (merge-duplicates no
--    toca columnas ausentes, mismo mecanismo que first_seen_at) → sobrevive.
-- Ejecutar en: Supabase → SQL Editor.

alter table public.bonarea_products
  add column if not exists off_code       text,        -- código de producto en OFF (EAN-13 del unitario)
  add column if not exists off_name       text,        -- nombre del producto en OFF al vincular (auditoría del match)
  add column if not exists off_matched_at timestamptz; -- cuándo se vinculó (null = sin vincular)

-- Para el futuro job de enriquecimiento (Nutri-Score/NOVA por EAN): localizar
-- rápido los productos ya vinculados.
create index if not exists bonarea_products_off_code_idx
  on public.bonarea_products (off_code) where off_code is not null;
