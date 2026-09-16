# Sync de Dia — espejo del catálogo en Supabase

dia.es es una SPA **Vike (vite-plugin-ssr)**. Su antigua API REST JSON
(`/api/v1/plp-back`) devuelve `404`, por lo que el sync usa el fallback SSR con
`vike_pageContext`. El frontal es **Akamai/EdgeSuite** y desde 2026-09-14 devuelve
`403 Access Denied` de forma consistente a los runners alojados de GitHub/Azure.
El mismo flujo funciona desde una conexión residencial.

- **Vía operativa:** Windows mediante [`scripts/run-dia-sync.ps1`](run-dia-sync.ps1),
  manualmente o con la Tarea Programada semanal descrita más abajo. Lee
  `SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE` de
  `.env.local`, ejecuta el catálogo y, si termina bien, actualiza el comparador.
- **Diagnóstico únicamente:** workflow [`.github/workflows/sync-dia.yml`](../.github/workflows/sync-dia.yml).
  No tiene cron; conserva `workflow_dispatch` para comprobar en el futuro si
  DIA ha dejado de bloquear las IP de GitHub. Mientras responda `403`, no usarlo
  para el sync operativo.

## Multi-zona por código postal (2026-07-14)

dia.es **adapta el surtido al código postal** (lo anuncia el propio sitio: "¿Sabes
que podemos adaptar nuestro surtido a tu código postal?"), igual que Mercadona por
almacén. Verificado en vivo: el mismo catálogo va de **204 a 314 páginas** según la
zona, y CPs cercanos de una ciudad comparten `physical_store_id` → **un CP
representativo por provincia basta** (como Mercadona con sus almacenes). El sync
barre todas las zonas y **une el catálogo** (7.367 productos vs 5.551 de solo Madrid).

Flujo de sesión (anónima, por cookie):
1. `GET /` → `Set-Cookie session_id` (crea sesión).
2. `GET /api/v1/common-aggregator/check-service?postal_code=CP` → `{physical_store_id}`
   (o 206 sin cuerpo si esa zona no tiene servicio — **Canarias 35/38 y Melilla 52
   no responden con id**, se saltan).
3. `PUT /api/v1/common-aggregator/save-shipping-address?new_postal_code=CP` → 204,
   fija el CP en la sesión (**rota `session_id`** → hay que ir actualizando cookies).
4. `GET plp-back/products?navigation=L1` con esa cookie → catálogo **de esa zona**.

La columna `regions` (ver `dia_regions.sql`) guarda la(s) CCAA donde cada producto
está disponible (NULL = nacional, aparece en todas las CCAA con servicio). **HOY
solo se guarda**: filtrar el catálogo por el CP / la comunidad autónoma del usuario
se implementará más adelante (ver `src/constants/regions.ts`).

## Cómo funciona (API JSON, reescrito 2026-07-11)

- **Endpoint:** `GET https://www.dia.es/api/v1/plp-back/products?navigation=L1&page=N`
  con cabeceras `Origin`/`Referer` de dia.es (si no, 403) **+ la cookie de sesión
  con el CP fijado** (ver "Multi-zona"). `navigation=L1` es obligatorio y **NO
  filtra por categoría: devuelve el CATÁLOGO ENTERO de la zona** paginado
  (~204–314 páginas de 20 según la zona). De la respuesta se usa:
  - `products[]` (el sync también acepta el antiguo `plp_items[]`): productos (`object_id`, `sku_id`, `display_name`, `brand`,
    `image`, `prices`, `units_in_stock`, `url`).
  - `category_data.categories`: **árbol N1→N2 completo** (31 N1, ~296 N2, con
    `id`/`name`/`link`) — llega en cada página, de ahí sale la taxonomía.
- **Fallback SSR:** si DIA devuelve 404 para el BFF JSON, el sync obtiene el
  árbol del `vike_pageContext` y recorre las páginas SSR de cada categoría N2,
  conservando la cookie del código postal.
  - `pagination.total_pages` (PLANO; el SSR lo anidaba en `pagination.pagination`).
- **Categoría de cada producto:** se deriva de su `url`
  (`/frutas/platanos-y-bananas/p/42070` → N2 "platanos-y-bananas") casada contra
  los `link` del árbol (100 % de las urls mapean; `category_ids` = N2 + su N1).
- **Precios:** `prices.price` ya lleva la promo aplicada (`strikethrough_price` =
  original; `is_promo_price`/`is_club_price`/`discount_percentage` en `raw`).
  `prices.price_per_unit` + `measure_unit` ("KILO"/"LITRO"/"UNIDAD"/"100 GR."/
  "DOCENA"…) → `price_per_unit` canónico (l/kg/ud) vía `lib/price.mjs` (la docena
  a €/ud; "LAVADO"/"METRO" quedan sin ppu, no son comparables).
- **Ofertas:** la página `/ofertas` usa un feed específico para agrupar por
  categoría, pero los mismos productos del PLP general ya incluyen toda la señal
  necesaria y sin duplicados: descuentos directos en `prices` y promociones
  `promotions[].description` ("3X2", "2ª UD AL 50%", "2 UD POR 3 EUROS"…).
  El sync normaliza `promo_name`, `promo_text` y `promo_base_price`, y acumula
  `offer_regions`/`regional_offers` por CCAA durante el barrido multi-zona. Así
  la app muestra el tipo y el precio correctos de la región tanto en catálogo
  como en Ofertas y en la ficha.
- La N1 **"Novedades y recomendados" (L128) se salta** (marketing rotatorio).
- **Endpoints alternativos (no usados):** los filtrados por categoría
  `/api/v1/plp-back/l1/all/{N1}/reduced?category_id={N2}` filtran pero OMITEN
  `brand` (por eso se usa el catálogo completo). `/api/v1/search-back/search?q=`
  es API de búsqueda abierta con items estructurados + `l1/l2_category_description`.
- La **ficha** (INGREDIENTES/NUTRICIÓN/…) sí sigue viniendo del **SSR de cada
  producto** (`raw.url` → `vike_pageContext`): la API de listado no la expone.
  Gotcha: con `Accept: text/html` a secas ese SSR devuelve **500** (usar el
  Accept completo de navegador). La ficha **no depende de la zona** (la url del
  producto es la misma en toda España) → se baja una sola vez, no por zona.
- El precio de cada producto es el de la **primera zona que lo trae** (Madrid
  primero → los productos nacionales quedan con datos de Madrid).

## 1. Crear las tablas en Supabase (una vez)

En Supabase → **SQL Editor**, ejecuta
[`supabase/migrations/dia_catalog.sql`](../supabase/migrations/dia_catalog.sql).
Crea `dia_products` y `dia_categories`. Sin esto, el sync falla al escribir.

Para la **ficha de producto** (INGREDIENTES/NUTRICIÓN/CONSERVACIÓN/DENOMINACIÓN…), ejecuta
también [`supabase/migrations/dia_product_detail.sql`](../supabase/migrations/dia_product_detail.sql)
(columnas anulables + `detail_synced_at`). Sin ella, el upsert de la pasada de ficha falla
por columnas inexistentes.

Para la **disponibilidad por comunidad autónoma** (columna `regions`), ejecuta también
[`supabase/migrations/dia_regions.sql`](../supabase/migrations/dia_regions.sql). Sin ella,
el upsert del catálogo falla (el sync incluye `regions` en cada fila desde el barrido multi-zona).

Para las **ofertas de DIA**, ejecuta además
[`supabase/migrations/20260723204711_dia_offers.sql`](../supabase/migrations/20260723204711_dia_offers.sql).
Hace backfill inmediato desde `raw` y añade las columnas regionales que enviará
el próximo sync. Debe estar aplicada antes de ejecutarlo.

## 2. Service_role key en `.env.local`

Igual que el resto: añade en `MercaAppMobile/.env.local` (gitignored) la línea
`SUPABASE_SERVICE_ROLE=eyJhbGciOi...` (Supabase → Project Settings → API → service_role).

## 3. Probar a mano

```powershell
# Prueba rápida sin escribir (2 zonas, 8 páginas cada una, sin ficha):
$env:DRY_RUN='1'; $env:MAX_ZONES='2'; $env:MAX_PAGES='8'; $env:SKIP_DETAIL='1'; node scripts/sync-dia.mjs

# Run real desde la raíz del repo y en una PowerShell nueva
# (escribe en Supabase y lee los secretos de .env.local):
& '.\scripts\run-dia-sync.ps1'
```

Debe terminar con `[dia] OK`. El log queda en `scripts/logs/dia-sync-<fecha>.log`.
No encadenes el run real en la misma consola del ejemplo `DRY_RUN`: esas variables
de entorno limitarían también la ejecución siguiente.
Los avisos `provincia 35/38/52: sin servicio` son normales: Dia no sirve esas
provincias y el barrido continúa. El lanzador captura tanto avisos como errores
reales en el log; solo un código de salida distinto de 0 detiene el comparador.
Si se interrumpe, comprueba el `=== fin (exit N) ===` del último log.

Resultado del DRY_RUN completo multi-zona (API, 2026-07-14): **48 zonas** (una por
provincia; Canarias/Melilla sin servicio) → **7.367 productos únicos** (vs 5.551 de
solo Madrid), ~9 min con `CONCURRENCY=6`, 0 sin precio, 0 sin imagen, ~24 sin
categoría (0,3 %), ~60 sin €/unidad, 1.816 con disponibilidad regional limitada
(el resto, nacional → `regions` NULL).

### Variables de entorno

| Var | Por defecto | Uso |
|-----|-------------|-----|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE` | — | destino (obligatorias salvo DRY_RUN) |
| `CONCURRENCY` | `4` | páginas del catálogo en paralelo (por zona) |
| `DRY_RUN` | — | `1` = no escribe, imprime resumen |
| `MAX_ZONES` | ∞ | limita nº de zonas (provincias) a barrer (pruebas) |
| `MAX_PAGES` | ∞ | limita nº de páginas por zona (pruebas; alias viejo `MAX_CATEGORIES`) |
| `DIA_API_PREFIX` | autodetecta `/api/v1` y luego `/api` ante 404 | fuerza el prefijo del BFF de DIA |
| `DIA_PLP_PATH` | `plp-back/products` | fuerza el recurso de listado del BFF |
| `SKIP_N1` | `L128` | N1 a excluir (CSV). Por defecto solo "Novedades y recomendados" |
| `SKIP_DETAIL` | — | `1` = no toca la ficha (preserva la guardada) |
| `DETAIL_TTL_DAYS` | `30` | refresca la ficha si su `detail_synced_at` es más viejo que esto |
| `DETAIL_MAX` | ∞ | tope de fichas a descargar por ejecución (reparte el rastreo) |
| `DETAIL_CONCURRENCY` | `4` | páginas de ficha en paralelo |

La salida incluye dos contadores de promoción: productos en oferta y cuántos
de ellos tienen la oferta limitada a determinadas CCAA. Las promociones de lote
cuentan aunque `prices.is_promo_price` sea `false`.

### Ficha de producto (INGREDIENTES/NUTRICIÓN/CONSERVACIÓN…)

dia.es trae el producto **estructurado** en el `vike_pageContext` de su página
(`raw.url` → `/…/p/<object_id>`): `ingredients.text`, `nutritional_info` (→ texto), `instructions`
(conservación/preparación), `manufacturer_contact`, `product_info`. **Solo castellano** (dia.es no
es bilingüe). El sync la descarga **incremental**: solo de productos sin ficha o con
`detail_synced_at` más viejo que `DETAIL_TTL_DAYS`; el resto arrastra la guardada (el upsert de
precios no la toca). En DRY_RUN se imprime la ficha de los 3 primeros productos para verificar.

## 4. Programarlo 1×/semana en Windows

```powershell
# Ejecutar desde la raíz del repositorio en una PowerShell normal.
$ps1 = (Resolve-Path '.\scripts\run-dia-sync.ps1').Path
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ps1`""
$trigger  = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 9:50am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'QueFalta - Sync Dia' -Action $action -Trigger $trigger -Settings $settings -Description 'Sincroniza el catalogo de Dia a Supabase' -Force
```

La tarea usa la zona horaria local de Windows. El equipo debe estar encendido y
con red; `StartWhenAvailable` recupera la ejecución si estaba apagado a las 09:50.
Los logs quedan en `scripts/logs/dia-sync-<fecha>.log` y el lanzador conserva los
14 más recientes.

## Notas

- **Marcas blancas Dia con el nombre dentro:** "Selección de Dia", "Dia Láctea",
  "Dia Mari Marinera"… El `catalog_clean_name` de la comparativa ya las quita del
  needle (ver similar_products.sql).
- **Bloqueo de datacenter:** el 2026-09-14 dos ejecuciones consecutivas, desde
  Azure `eastus2` y `westus3`, recibieron `403` de Akamai en la primera categoría
  SSR. No es un error de Supabase ni del parser. Ejecutar desde Windows/local.
- **Carrito (futuro):** existe `/api/v1/cart`; seguramente exija sesión/CP. No
  bloquea catálogo+búsqueda+comparativa.
