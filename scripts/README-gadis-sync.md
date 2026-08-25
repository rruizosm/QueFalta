# Sync Gadisline

`sync-gadis.mjs` construye el espejo `gadis_products`/`gadis_categories` a
partir del JSON SSR público de Gadisline. No inicia sesión, no usa cupones y no
envía código postal: sincroniza el surtido público por defecto.

## Antes del primer run

1. Ejecutar `supabase/migrations/gadis_catalog.sql` en Supabase SQL Editor.
2. Re-ejecutar `supabase/migrations/similar_products.sql` después de añadir el
   brazo Gadis, si se quiere que participe en la comparativa.
3. Lanzar el workflow **Sync Gadis catalog** manualmente y comprobar su resumen.

## Ofertas, novedades y cambios de precio

- **Ofertas:** solo `offers[]` con `is_offer_coupon=false`; se guarda tipo,
  vigencia, grupo de productos relacionados y condición de combinación.
- **Novedades:** propiedad explícita `Nuevo` y, para los productos que no la
  tengan, `first_seen_at` del espejo.
- **Cambios:** el trigger guarda precio anterior y porcentaje al modificar
  `unit_price`.

## Precio por unidad

El sync convierte los sufijos de Gadisline (`el kilo`, `el litro`, `la unidad`,
`la docena`, `los 100 ml` y `los 100 gr.`) a las bases canónicas `kg`, `l` y
`ud`. Los frescos vendidos al peso, cuyo sufijo llega vacío, se reconocen por
`weight=P`. Metro y dosis se omiten porque no son comparables con esas bases.

## Variables

| Variable | Uso |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE` | destino (obligatorias salvo DRY_RUN) |
| `DRY_RUN=1` | descarga y resume sin escribir |
| `MAX_CATEGORIES=N` | limita categorías para una prueba |
| `MIN_PRODUCTS=8000` | guardarraíl contra una descarga parcial |

El workflow corre diariamente a las 05:20 UTC. Si Gadisline cambia su
paginación SSR, el guardarraíl impedirá despublicar el catálogo existente.
