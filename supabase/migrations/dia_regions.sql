-- Disponibilidad regional (por comunidad autónoma) de los productos de Dia.
-- Aditiva sobre dia_catalog.sql. Ejecutar en: Supabase → SQL Editor. Después,
-- relanzar el sync (sync-dia.yml).
--
-- dia.es adapta el SURTIDO al código postal (lo anuncia el propio sitio). El sync
-- (scripts/sync-dia.mjs) barre una zona (physical_store_id) por provincia,
-- fijando el CP en la sesión, y acumula en qué zonas aparece cada producto. De
-- ahí deriva la(s) comunidad(es) autónoma(s) donde está disponible:
--   NULL        = producto NACIONAL (aparece en TODAS las CCAA con servicio).
--   {CCAA, …}   = "solo disponible en esas CCAA".
-- Misma semántica que mercadona_products.regions (null = sin restricción), pero
-- la nacionalidad se decide por aparecer en todas las CCAA barridas, no por
-- estar en una zona de referencia (la tienda de Madrid de Dia no es superconjunto
-- nacional). Los nombres van en su forma local (Catalunya, Comunitat Valenciana,
-- Euskadi…), igual que en Mercadona.
--
-- HOY solo se GUARDA (no se filtra nada en la app con ello): el filtrado por el
-- código postal / la comunidad autónoma del usuario se implementará más adelante
-- (ver src/constants/regions.ts). Se persiste ahora para no rehacer el barrido
-- multi-zona después.

alter table public.dia_products
  add column if not exists regions text[];  -- CCAA donde está disponible; NULL = nacional
