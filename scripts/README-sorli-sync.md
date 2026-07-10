# Sync del catálogo de Sorli (Sorliclic)

Espeja el catálogo de **Sorli** (súper catalán, ~95 tiendas en Maresme/Vallès/
Barcelona) en Supabase para el catálogo y la búsqueda de la app, igual que
Mercadona/Bonpreu/Carrefour/bonÀrea/Consum/Dia.

## Cómo funciona

`scripts/sync-sorli.mjs` usa la API JSON de Sorliclic (`api.sorliclic.com`), que
protege sus llamadas con un token de sesión `s` (32 hex) que el SPA calcula en el
navegador (MD5 dependiente de `window`) y que el servidor valida contra la cookie
`an_us_id`. Un `s` autogenerado da **400**. Por eso el sync, como Bonpreu:

1. **Arranca la sesión con un navegador headless** (Playwright + Chromium):
   carga una página de sorliclic y captura el `s` real + las cookies.
2. **Pagina con `fetch` de node** reusando ese par `{s, cookies}`:
   - `GET /categorias?idioma=es|ca` → árbol de categorías bilingüe (N1→N2→N3).
   - `POST /articulos/filtersort` con `codigoCategoria=''` → catálogo **entero**
     paginado (~9.460 productos, 95 páginas de 100). **Dos pasadas**
     (`idioma=es` y `idioma=ca`) rellenan `display_name` / `display_name_ca`.
3. Normaliza (precio con oferta aplicada, €/unidad canónica, categoría hoja +
   ancestros) y hace **upsert** en `sorli_products` / `sorli_categories`, con
   soft-delete (`markStale`) de lo que ya no aparece.

`nutriScore` y las `agrupaciones` (Ecológico/Sin Gluten/Vegano/Sin Lactosa/
Producto de Aquí) se conservan en `raw` para features futuras. Los precios son
los de la tienda por defecto de la sesión de invitado (como Consum).

## Requisitos previos (una vez)

Ejecutar la migración **`supabase/migrations/sorli_catalog.sql`** en el SQL Editor
de Supabase (crea las tablas con todo: búsqueda insensible a acentos, novedades y
cambios de precio) y re-ejecutar **`supabase/migrations/similar_products.sql`**
(ya incluye el brazo de Sorli en la comparativa).

## Variables de entorno

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE` — destino de la escritura.
- `PW_CHANNEL=chrome` — en local, usa el Chrome del sistema (evita instalar el
  Chromium de Playwright). Vacío en CI → Chromium.
- `CONCURRENCY=6` — páginas en paralelo.
- `DRY_RUN=1` — no escribe; imprime un resumen (útil para probar).
- `MAX_PAGES=N` — limita páginas por pasada (pruebas rápidas).

## Ejecutar

- **GitHub Actions:** workflow `.github/workflows/sync-sorli.yml` (lunes 06:50 UTC,
  tras Dia — crons escalonados para no solapar los markStale —, o botón
  *Run workflow*). Instala Playwright + Chromium.
- **Local (PowerShell):** `scripts/run-sorli-sync.ps1` (lee `.env.local`, fija
  `PW_CHANNEL=chrome`).
- **Prueba en seco:** `DRY_RUN=1 PW_CHANNEL=chrome node scripts/sync-sorli.mjs`

## Notas

- Solo hay imagen `135x135` en el CDN de Sorli (resoluciones mayores dan 404).
- El nombre catalán llega inconsistente en los campos `descripcionCat`/`Es` según
  la consulta, así que el sync hace 2 pasadas deterministas (una por idioma) en
  lugar de fiarse de esos campos.
