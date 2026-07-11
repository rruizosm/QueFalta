# Sync de Dia — espejo del catálogo en Supabase

dia.es es una SPA **Vike (vite-plugin-ssr)** con una **API REST JSON abierta**
(`/api/v1/plp-back`). Desde 2026-07-11 el sync usa esa API en vez de raspar el SSR
(la API antes daba 422 fuera del navegador; ya no). Es más robusta —versionada,
~20 KB JSON/página vs ~150 KB de HTML— y da la misma data; la lección de Eroski
(retiraron `?pageNumber=N` y rompió su scraper) empuja a preferir la API. No hay
que parsear HTML ni usar navegador headless, y **no hay Cloudflare**.

- **Vía recomendada:** workflow [`.github/workflows/sync-dia.yml`](../.github/workflows/sync-dia.yml)
  (cron diario 07:00 UTC + botón "Run workflow"). Usa los secrets `SUPABASE_URL` y
  `SUPABASE_SERVICE_ROLE` que ya existen en el repo. Solo node (fetch nativo).
- **Local (opcional):** `scripts/run-dia-sync.ps1`, útil para probar a mano.

## Cómo funciona (API JSON, reescrito 2026-07-11)

- **Endpoint:** `GET https://www.dia.es/api/v1/plp-back/plp?navigation=L1&page=N`
  con cabeceras `Origin`/`Referer` de dia.es (si no, 403). `navigation=L1` es
  obligatorio y **NO filtra: devuelve el CATÁLOGO ENTERO** paginado (~5.500
  productos, ~278 páginas de 20). De la respuesta se usa:
  - `plp_items[]`: productos (`object_id`, `sku_id`, `display_name`, `brand`,
    `image`, `prices`, `units_in_stock`, `url`).
  - `category_data.categories`: **árbol N1→N2 completo** (31 N1, ~296 N2, con
    `id`/`name`/`link`) — llega en cada página, de ahí sale la taxonomía.
  - `pagination.total_pages` (PLANO; el SSR lo anidaba en `pagination.pagination`).
- **Categoría de cada producto:** se deriva de su `url`
  (`/frutas/platanos-y-bananas/p/42070` → N2 "platanos-y-bananas") casada contra
  los `link` del árbol (100 % de las urls mapean; `category_ids` = N2 + su N1).
- **Precios:** `prices.price` ya lleva la promo aplicada (`strikethrough_price` =
  original; `is_promo_price`/`is_club_price`/`discount_percentage` en `raw`).
  `prices.price_per_unit` + `measure_unit` ("KILO"/"LITRO"/"UNIDAD"/"100 GR."/
  "DOCENA"…) → `price_per_unit` canónico (l/kg/ud) vía `lib/price.mjs` (la docena
  a €/ud; "LAVADO"/"METRO" quedan sin ppu, no son comparables).
- La N1 **"Novedades y recomendados" (L128) se salta** (marketing rotatorio).
- **Endpoints alternativos (no usados):** los filtrados por categoría
  `/api/v1/plp-back/l1/all/{N1}/reduced?category_id={N2}` filtran pero OMITEN
  `brand` (por eso se usa el catálogo completo). `/api/v1/search-back/search?q=`
  es API de búsqueda abierta con items estructurados + `l1/l2_category_description`.
- La **ficha** (INGREDIENTES/NUTRICIÓN/…) sí sigue viniendo del **SSR de cada
  producto** (`raw.url` → `vike_pageContext`): la API de listado no la expone.
  Gotcha: con `Accept: text/html` a secas ese SSR devuelve **500** (usar el
  Accept completo de navegador).
- Los precios son de la **zona por defecto** (CP 28041 Madrid, sesión anónima).

## 1. Crear las tablas en Supabase (una vez)

En Supabase → **SQL Editor**, ejecuta
[`supabase/migrations/dia_catalog.sql`](../supabase/migrations/dia_catalog.sql).
Crea `dia_products` y `dia_categories`. Sin esto, el sync falla al escribir.

Para la **ficha de producto** (INGREDIENTES/NUTRICIÓN/CONSERVACIÓN/DENOMINACIÓN…), ejecuta
también [`supabase/migrations/dia_product_detail.sql`](../supabase/migrations/dia_product_detail.sql)
(columnas anulables + `detail_synced_at`). Sin ella, el upsert de la pasada de ficha falla
por columnas inexistentes.

## 2. Service_role key en `.env.local`

Igual que el resto: añade en `MercaAppMobile/.env.local` (gitignored) la línea
`SUPABASE_SERVICE_ROLE=eyJhbGciOi...` (Supabase → Project Settings → API → service_role).

## 3. Probar a mano

```powershell
# Prueba rápida sin escribir en Supabase (8 páginas de catálogo, sin ficha):
$env:DRY_RUN='1'; $env:MAX_PAGES='8'; $env:SKIP_DETAIL='1'; node scripts/sync-dia.mjs

# Run real (escribe en Supabase, lee secretos de .env.local):
& "C:\Users\ruben\OneDrive\Escritorio\MercaApp\MercaAppMobile\scripts\run-dia-sync.ps1"
```

Debe terminar con `[dia] OK`. El log queda en `scripts/logs/dia-sync-<fecha>.log`.

Resultado del DRY_RUN completo (API, 2026-07-11): 278 páginas → **5.556 productos**,
0 sin precio, 0 sin imagen, 17 sin categoría (0,3 %, urls que no mapean), 49 sin
€/unidad, 102 con promo. Más ligero que el SSR anterior (JSON de ~20 KB/página).

### Variables de entorno

| Var | Por defecto | Uso |
|-----|-------------|-----|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE` | — | destino (obligatorias salvo DRY_RUN) |
| `CONCURRENCY` | `4` | páginas del catálogo en paralelo |
| `DRY_RUN` | — | `1` = no escribe, imprime resumen |
| `MAX_PAGES` | ∞ | limita nº de páginas del catálogo (pruebas; alias viejo `MAX_CATEGORIES`) |
| `SKIP_N1` | `L128` | N1 a excluir (CSV). Por defecto solo "Novedades y recomendados" |
| `SKIP_DETAIL` | — | `1` = no toca la ficha (preserva la guardada) |
| `DETAIL_TTL_DAYS` | `30` | refresca la ficha si su `detail_synced_at` es más viejo que esto |
| `DETAIL_MAX` | ∞ | tope de fichas a descargar por ejecución (reparte el rastreo) |
| `DETAIL_CONCURRENCY` | `4` | páginas de ficha en paralelo |

### Ficha de producto (INGREDIENTES/NUTRICIÓN/CONSERVACIÓN…)

dia.es trae el producto **estructurado** en el `vike_pageContext` de su página
(`raw.url` → `/…/p/<object_id>`): `ingredients.text`, `nutritional_info` (→ texto), `instructions`
(conservación/preparación), `manufacturer_contact`, `product_info`. **Solo castellano** (dia.es no
es bilingüe). El sync la descarga **incremental**: solo de productos sin ficha o con
`detail_synced_at` más viejo que `DETAIL_TTL_DAYS`; el resto arrastra la guardada (el upsert de
precios no la toca). En DRY_RUN se imprime la ficha de los 3 primeros productos para verificar.

## 4. Programarlo 1×/día (si se prefiere local en vez de Actions)

```powershell
$ps1 = "C:\Users\ruben\OneDrive\Escritorio\MercaApp\MercaAppMobile\scripts\run-dia-sync.ps1"
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ps1`""
$trigger  = New-ScheduledTaskTrigger -Daily -At 9:45am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 45)
Register-ScheduledTask -TaskName 'QueFalta - Sync Dia' -Action $action -Trigger $trigger -Settings $settings -Description 'Sincroniza el catalogo de Dia a Supabase' -Force
```

## Notas

- **Marcas blancas Dia con el nombre dentro:** "Selección de Dia", "Dia Láctea",
  "Dia Mari Marinera"… El `catalog_clean_name` de la comparativa ya las quita del
  needle (ver similar_products.sql).
- **Geobloqueo:** las pruebas funcionaron desde fuera de España → GitHub Actions
  debería ir bien; si algún día da 403/500 persistente, mover a local como Carrefour.
- **Carrito (futuro):** existe `/api/v1/cart`; seguramente exija sesión/CP. No
  bloquea catálogo+búsqueda+comparativa.
