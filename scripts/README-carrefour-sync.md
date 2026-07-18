# Sync de Carrefour — tarea programada en tu PC

Carrefour está detrás de **Cloudflare**, que bloquea con un **403** las IPs de
datacenter de GitHub Actions. Tu IP residencial española **sí** pasa, así que el
sync de Carrefour se ejecuta desde tu PC con una Tarea Programada de Windows
(Mercadona y Bonpreu siguen en GitHub Actions; solo Carrefour va en local).

## 1. Crear las tablas en Supabase (una vez)

En Supabase → **SQL Editor**, ejecuta
[`supabase/migrations/carrefour_catalog.sql`](../supabase/migrations/carrefour_catalog.sql).
Crea `carrefour_products` y `carrefour_categories`. Sin esto, el sync falla al
escribir.

Para la **ficha de producto** (INGREDIENTES/NUTRICIÓN/ORIGEN/OPERADOR…), ejecuta también
[`supabase/migrations/carrefour_product_detail.sql`](../supabase/migrations/carrefour_product_detail.sql)
(columnas anulables + `detail_synced_at`). Sin ella, el upsert de la pasada de ficha falla
por columnas inexistentes.

Para las **ofertas** (pantalla "Ofertas" del Home), ejecuta también
[`supabase/migrations/carrefour_offers.sql`](../supabase/migrations/carrefour_offers.sql)
(columnas `promo_*` + `strikethrough_price`, con backfill desde `raw`). Sin ella, el
upsert del sync falla por columnas inexistentes. Los datos de promo vienen embebidos
en las MISMAS páginas de listado que ya se recorren (badge + precio tachado del SSR),
así que no añade peticiones.

Para el **multi-zona por comunidad autónoma** (ver "Multi-zona" abajo), ejecuta también
[`supabase/migrations/carrefour_regions.sql`](../supabase/migrations/carrefour_regions.sql)
(columnas `regions text[]` + `regional_prices jsonb`). **IMPRESCINDIBLE antes del próximo
sync**: el upsert ya incluye esas columnas en cada fila y falla sin ellas (como
`carrefour_offers.sql`).

## 2. Poner la service_role key en `.env.local`

`MercaAppMobile/.env.local` (gitignored) ya tiene `EXPO_PUBLIC_SUPABASE_URL`.
Añade una línea con la **service_role key** (la misma que el secret
`SUPABASE_SERVICE_ROLE` de GitHub — Supabase → Project Settings → API → service_role):

```
SUPABASE_SERVICE_ROLE=eyJhbGciOi...la-clave-secreta...
```

> La service_role salta RLS: trátala como secreta. `.env.local` no se sube a git.

## 3. Probar a mano

Desde PowerShell:

```powershell
& "C:\Users\ruben\OneDrive\Escritorio\MercaApp\MercaAppMobile\scripts\run-carrefour-sync.ps1"
```

Debe terminar con `[carrefour] OK`. El **barrido multi-zona** (~18 almacenes, una
capital por comunidad) recorre el catálogo entero una vez por zona → tarda **~2 h** y
puebla la UNIÓN de todas las zonas (más de los ~16.000 de solo-Madrid, por los
exclusivos regionales). Para una prueba rápida usa `MAX_ZONES=2 MAX_CATEGORIES=5
DRY_RUN=1`. El log queda en `scripts/logs/carrefour-sync-<fecha>.log`.

## 4. Programarlo 1×/semana (lunes 08:00)

Pega esto en PowerShell (crea la tarea "QueFalta - Sync Carrefour", semanal los lunes a las 08:00):

```powershell
$ps1 = "C:\Users\ruben\OneDrive\Escritorio\MercaApp\MercaAppMobile\scripts\run-carrefour-sync.ps1"
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ps1`""
$trigger  = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 8:00am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 4)
Register-ScheduledTask -TaskName 'QueFalta - Sync Carrefour' -Action $action -Trigger $trigger -Settings $settings -Description 'Sincroniza el catalogo de Carrefour a Supabase' -Force
```

- **`-StartWhenAvailable`**: si el PC estaba apagado a las 09:00, la tarea corre
  en cuanto se encienda.
- Corre **solo cuando tu usuario ha iniciado sesión** (no guarda contraseña). Si
  quieres que corra aunque no estés logueado, en el Programador de tareas marca
  "Ejecutar tanto si el usuario inició sesión como si no".
- Necesita `node` en el PATH (ya lo tienes).

### Comprobar / lanzar / quitar la tarea

```powershell
Start-ScheduledTask  -TaskName 'QueFalta - Sync Carrefour'   # lanzarla ahora
Get-ScheduledTaskInfo -TaskName 'QueFalta - Sync Carrefour'  # última ejecución y resultado
Unregister-ScheduledTask -TaskName 'QueFalta - Sync Carrefour' -Confirm:$false  # borrarla
```

## Ficha de producto (INGREDIENTES/NUTRICIÓN/ORIGEN…)

Carrefour embebe el producto en `window.__INITIAL_STATE__` de su PDP (`raw.url` →
`/supermercado/<slug>/R-<id>/p`) con `nutrition_info` **totalmente estructurado**:
`ingredientes`, `alergenos` (contiene/puede contener), `valorEnergetico`, macros, y
`masInfo` (grupos → `listaInfo` de nombre/valor: conservación, denominación legal,
dirección del operador…). Es la ficha más rica de todos los espejos.

El sync la descarga **incremental**: solo de productos sin ficha o con `detail_synced_at`
más viejo que `DETAIL_TTL_DAYS`; el resto arrastra la guardada (el upsert de precios no la
toca). **OJO Cloudflare:** la pasada de ficha añade +1 PDP por producto → usa conc. baja y
reparte con `DETAIL_MAX` (la 1ª ejecución, con todo el catálogo sin ficha, será larga; los
días siguientes solo lo nuevo/caducado). En DRY_RUN se imprime la ficha de los 3 primeros.

| Var de ficha | Por defecto | Uso |
|---|---|---|
| `SKIP_DETAIL` | — | `1` = no toca la ficha (preserva la guardada; solo refresca precios) |
| `DETAIL_TTL_DAYS` | `30` | refresca la ficha si su `detail_synced_at` es más viejo que esto |
| `DETAIL_MAX` | ∞ | tope de fichas por ejecución (reparte el crawl bajo Cloudflare en días) |
| `DETAIL_CONCURRENCY` | `3` | PDPs de ficha en paralelo (bajo para no irritar a Cloudflare) |

## Multi-zona por comunidad autónoma

Carrefour **regionaliza catálogo Y precio** por código postal: cada CP resuelve a un
**almacén** (`werks_id`) distinto (48 en toda España, incluso sub-provincia: Madrid
capital ≠ Las Rozas). El SSR elige almacén según la cookie `salepoint`
(`salePointId|drive|CP|deliveryType|projectionDays`); **SIN cookie = Madrid** (COL
PINAR, CP 28232). Truco: con un `salePointId` placeholder + el CP real,
`/cloud-api/salepoints/v1/` re-resuelve el almacén de esa zona (el `?postalCode=` de la
query se ignora, todo va por cookie).

Verificado en vivo: en "aceites y vinagres" Las Palmas trae **224 productos vs 156** de
Madrid (85 exclusivos: marcas canarias), Barcelona añade aceites catalanes, y el precio
difiere en **43-59%** de los comunes. Un crawl único de Madrid se pierde miles de
productos regionales.

El sync barre **una capital por comunidad autónoma** (~19 CPs, deduplicados por almacén
≈ 18 crawls; decisión de coste frente a los 48 almacenes), pasando la cookie del CP, y
une los productos por `product_id`. Guarda (ver
[`carrefour_regions.sql`](../supabase/migrations/carrefour_regions.sql)):

- `regions text[]` — CCAA donde el producto está disponible; `NULL` = **nacional** (en
  todas las CCAA barridas). Misma semántica que `mercadona/dia_products.regions`.
- `regional_prices jsonb` — precio por CCAA cuando **difiere del de Madrid** (base):
  `{ "<CCAA>": {"p":unit_price,"pf":price_format,"ppu":…,"ppuu":…,"av":disponible} }`;
  `NULL` si el precio es uniforme.

Las **columnas base** (`unit_price`, `price_format`…) siguen siendo las de **Madrid**
(COL PINAR = comportamiento sin cookie) → **la app NO cambia** hasta implementar el
filtro por comunidad (`src/constants/regions.ts`). Hoy solo se GUARDA, para no rehacer
el barrido después. Madrid se barre primero (sus datos = los "por defecto").

Variables útiles: `MAX_ZONES=N` (limita nº de almacenes; para pruebas o para partir el
barrido) y `MAX_CATEGORIES=N` (limita nº de N2).

**Orden a prueba de cortes + tope de ficha.** El sync guarda el **catálogo + `regions`/
`regional_prices` PRIMERO** (log `[carrefour] catálogo + regions guardados`) y descarga la
**ficha después**, en una 2ª pasada. Así, si la tarea se corta a media ficha (el 1er run
multi-zona tiene ~17 000 fichas nuevas ≈ 3 h que, sumadas a las ~2 h de zonas, **no caben en
la ventana de 4 h**), el catálogo ya quedó a salvo en Supabase. Para que cada run termine
limpio con `[carrefour] OK`, `run-carrefour-sync.ps1` fija **`DETAIL_MAX=6000`** (tope de
fichas por ejecución); el backlog de fichas se drena en ~3 runs semanales (la ficha es
incremental, `DETAIL_TTL_DAYS=30`). Si amplías `-ExecutionTimeLimit`, sube o quita ese tope.

## Notas

- **Backfill de EAN:** [`backfill-carrefour-ean.mjs`](backfill-carrefour-ean.mjs)
  recorre los productos publicados que aún no tienen EAN, descarga su ficha y lo
  completa sin reejecutar el barrido multi-zona. Primero probar en PowerShell con
  `$env:DRY_RUN='1'; $env:LIMIT='10'; node scripts/backfill-carrefour-ean.mjs`;
  para ejecutar un producto concreto, `$env:DRY_RUN='1';
  $env:PRODUCT_ID='VC4AECOMM-550788'; node scripts/backfill-carrefour-ean.mjs`;
  para ejecutarlo completo, `node scripts/backfill-carrefour-ean.mjs`. Es
  reanudable: al relanzarlo solo procesa las filas cuyo `ean` continúe siendo
  `NULL`.
- **Rama excluida:** el sync omite por completo “Droguería y limpieza” (N1
  `cat20005`) y sus subcategorías; no se incorpora ningún producto al recorrer
  esa rama. La retirada inicial de los datos existentes está documentada en
  [`supabase/migrations/carrefour_exclude_drogueria_limpieza.sql`](../supabase/migrations/carrefour_exclude_drogueria_limpieza.sql).
- Tope de Carrefour: ~1008 productos por categoría N2; las secciones enormes
  (Alimentación, Desayuno, Conservas…) quedan truncadas ahí.
- Si algún día Cloudflare empieza a bloquear también tu IP residencial, las
  alternativas son un proxy residencial en CI o un runner self-hosted.
