# Sync de Dia — espejo del catálogo en Supabase

dia.es es una SPA **Vike (vite-plugin-ssr) con SSR completo**: cada página de
categoría embebe TODO su estado (productos estructurados + árbol de categorías +
paginación) en un `<script id="vike_pageContext" type="application/json">`. No hay
que parsear HTML ni usar navegador headless, y **no hay Cloudflare**.

- **Vía recomendada:** workflow [`.github/workflows/sync-dia.yml`](../.github/workflows/sync-dia.yml)
  (cron diario 07:00 UTC + botón "Run workflow"). Usa los secrets `SUPABASE_URL` y
  `SUPABASE_SERVICE_ROLE` que ya existen en el repo. Solo node (fetch nativo).
- **Local (opcional):** `scripts/run-dia-sync.ps1`, útil para probar a mano.

## Cómo funciona (descubierto 2026-06-12)

- **Páginas de categoría:** `GET https://www.dia.es/<cat>/<subcat>/c/L####?page=N`
  (paginadas a 20). Del JSON embebido se usa:
  - `INITIAL_STATE.l2.plp_items[]`: productos (`object_id`, `display_name`, `brand`,
    `image`, `prices`, `units_in_stock`, `url`).
  - `INITIAL_STATE.header.categoriesData.categories`: **árbol N1→N2 completo**
    (30 N1, ~290 N2) — disponible en cualquier página, de ahí sale la taxonomía.
  - `INITIAL_STATE.pagination.pagination.total_pages`.
- **Precios:** `prices.price` ya lleva la promo aplicada (`strikethrough_price` =
  original; `is_promo_price`/`is_club_price`/`discount_percentage` en `raw`).
  `prices.price_per_unit` + `measure_unit` ("KILO"/"LITRO"/"UNIDAD"/"100 GR."/
  "DOCENA"…) → `price_per_unit` canónico (l/kg/ud) vía `lib/price.mjs` (la docena
  se convierte a €/ud; "LAVADO"/"METRO" quedan sin ppu, no son comparables).
- La N1 **"Novedades y recomendados" (L128) se salta** (marketing rotatorio, no
  taxonomía). El resto de N1 "agregadoras" (Verano, Sin gluten) se conservan:
  la membership por `category_ids` deduplica sola.
- **El API XHR `/api/v1/plp-back` devuelve 422 fuera del navegador** — no usarlo.
  `/api/v1/search-back/search/reduced?q=<texto>` SÍ es API JSON abierta (búsqueda;
  documentada para el futuro, el sync no la necesita). También existe `/api/v1/cart`.
- **Gotcha HTTP:** con `Accept: text/html` a secas el servidor devuelve **500**;
  hay que mandar el Accept completo de navegador (o ninguno).
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
# Prueba rápida sin escribir en Supabase (6 subcategorías):
$env:DRY_RUN='1'; $env:MAX_CATEGORIES='6'; node scripts/sync-dia.mjs

# Run real (escribe en Supabase, lee secretos de .env.local):
& "C:\Users\ruben\OneDrive\Escritorio\MercaApp\MercaAppMobile\scripts\run-dia-sync.ps1"
```

Debe terminar con `[dia] OK`. El log queda en `scripts/logs/dia-sync-<fecha>.log`.

Resultado del DRY_RUN completo (2026-06-12): 287 N2 → **5.433 productos**,
0 sin precio, 0 sin imagen, 58 sin €/unidad (1 %), 123 con promo. Tarda ~6 min
con CONCURRENCY=4 (son ~600 páginas de ~170 KB).

### Variables de entorno

| Var | Por defecto | Uso |
|-----|-------------|-----|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE` | — | destino (obligatorias salvo DRY_RUN) |
| `CONCURRENCY` | `4` | subcategorías en paralelo |
| `DRY_RUN` | — | `1` = no escribe, imprime resumen |
| `MAX_CATEGORIES` | ∞ | limita nº de N2 (pruebas) |
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
