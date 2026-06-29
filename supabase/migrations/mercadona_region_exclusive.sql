-- Productos de Mercadona exclusivos de ciertas comunidades autónomas.
-- Aditiva sobre mercadona_catalog.sql + mercadona_multi_warehouse.sql.
--
-- La API de Mercadona es POR ALMACÉN (`wh`): los productos nacionales están en
-- TODOS los almacenes (incluido mad1, el de referencia); los regionales solo en
-- los de su zona (p.ej. "Agua Font Agudes" únicamente en almacenes catalanes).
-- El sync (scripts/sync-catalog.mjs) ya barre ~un almacén por provincia: ahora
-- además acumula el CONJUNTO de almacenes de cada producto, los mapea a su
-- comunidad autónoma (almacén → provincia → CCAA) y, si el producto NO aparece
-- en mad1, guarda en `regions` la(s) comunidad(es) donde sí está.
--
-- NULL / array vacío = producto nacional (sin insignia). Con valores = exclusivo
-- de esas CCAA → la app pinta el icono de exclamación en la lista/cuadrícula y la
-- línea "Producto solo disponible en …" en la ficha.
-- Ejecutar en: Supabase → SQL Editor. Después, relanzar el sync (sync-catalog.yml).

alter table public.mercadona_products
  add column if not exists regions text[];  -- CCAA donde es exclusivo; NULL = nacional
