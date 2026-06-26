-- Multi-almacén para Mercadona. Aditiva sobre mercadona_catalog.sql.
--
-- La API de Mercadona es POR ALMACÉN (`wh`): cada almacén tiene su propio catálogo
-- y `GET /products/{id}/?wh=` da 404 si ese id no existe en el almacén consultado.
-- El sync ahora barre VARIOS almacenes (uno por provincia) y une los productos por
-- id (los ids son GLOBALES: un id = el mismo producto en toda España, o ausente).
-- Así aparecen también los regionales (p.ej. "Agua mineral grande Font Agudes",
-- que solo está en los almacenes catalanes).
--
-- `source_wh` guarda UN almacén que SÍ tiene el producto. El cliente lo usa para
-- pedir el detalle (ficha/foto/nutrición) sin 404: para los nacionales será mad1
-- (= el almacén por defecto del cliente) y para los regionales, su almacén de zona.
-- Ejecutar en: Supabase → SQL Editor.

alter table public.mercadona_products
  add column if not exists source_wh text;  -- almacén (wh) que contiene este producto
