# Sync de los catálogos de Eroski y Caprabo

Espeja los catálogos de **Eroski** (nacional) y **Caprabo** (Cataluña, enseña
catalana de Eroski) en Supabase para el catálogo y la búsqueda de la app.

## Cómo funciona

Eroski y Caprabo comparten backend (framework **Apache Tapestry**): mismos ids de
categoría, mismo markup, misma paginación. Toda la lógica vive en
`scripts/lib/eroski-tapestry.mjs`; `scripts/sync-eroski.mjs` y
`scripts/sync-caprabo.mjs` solo fijan la base URL y las tablas.

1. **GET home** (`/es/`) → el mega-menú trae el árbol de categorías completo como
   enlaces `/es/supermercado/{n1}/{n2}/{n3}[/{n4}]/`. De ahí se derivan las HOJAS
   (categorías sin hijas) y el mapa hijo→padre. Se excluyen los N1 no-alimentación
   (papelería, hogar/bricolaje, electrónica, descanso, electrohogar).
2. **GET de cada hoja** SIN query (el SSR trae el 1er lote de 20) guardando las
   cookies de sesión, y después el endpoint stateful de Tapestry:
   `POST /es/supermarket:loadpage?t:ac={ruta}` con cuerpo
   `t:zoneid=productListZone&pageNumber=N` (N = lotes ya recibidos) y cabeceras
   `Origin`/`Referer`/`X-Requested-With` (sin ellas → redirect a error). El JSON
   devuelve en `content` el siguiente lote de 20; vacío = fin de la categoría.
   ⚠️ La paginación clásica `?pageNumber=N` (diseño original) **dejó de funcionar
   el 2026-07-11**: el server responde "No se obtuvieron resultados".
3. Cada "tile" trae un JSON `data-metrics` (evento `select_item`) con **id, nombre,
   marca, categoría y precio**. El parser tolera comillas simples y dobles +
   HTML-escapado. Imagen grande = `/images/{id}_x.jpg`.
4. Tras guardar el catálogo, descarga incrementalmente la ficha HTML
   `GET /es/productdetail/{id}-{slug}/` y extrae **Ingredientes**, **Condiciones
   de conservación**, **Fabricante** (incluida la dirección cuando se publica) e
   **Información Nutricional**. La nutrición se normaliza por 100 g/ml (`Valor
   energético: …`, `Grasas: …`, etc.), formato compatible con
   `parseCatalogNutrition`. `detail_synced_at` evita repetir fichas durante el
   TTL, incluidas las que legítimamente no publican datos de ficha.
5. Normaliza + **upsert** en `{eroski,caprabo}_products` / `_categories`, con
   soft-delete (`markStale`) de lo ausente.

**Limitaciones:** no hay precio por unidad ni un EAN verificable en el listado o
en el HTML de ficha, así que `price_per_unit` queda null y no se guarda EAN.
Solo castellano (Caprabo `/ca/` redirige y no traduce los nombres de producto).

## Requisitos previos (una vez)

Ejecutar en el SQL Editor de Supabase **`supabase/migrations/eroski_catalog.sql`**
y **`supabase/migrations/caprabo_catalog.sql`** (crean las tablas con búsqueda
insensible a acentos, novedades y cambios de precio) y re-ejecutar
**`supabase/migrations/similar_products.sql`** (ya incluye los brazos de ambos).

Si las tablas ya existen, ejecutar antes del siguiente sync
**`supabase/migrations/20260718133958_eroski_caprabo_nutrition.sql`** y después
**`supabase/migrations/20260719102703_eroski_caprabo_product_detail.sql`**. La
segunda añade `ingredients`, `conservation` y `manufacturer`, y programa el
backfill incremental de las fichas existentes.

## Variables de entorno

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE` — destino de la escritura.
- `CONCURRENCY=6` — hojas rastreadas en paralelo.
- `LEAF_DELAY_MS=0` — pausa opcional después de cada hoja; el wrapper local de
  Caprabo usa 700 ms y concurrencia 2 para respetar su rate limit.
- `HOME_RETRY_ROUNDS=4` — rondas completas para la petición crítica `GET /es/`.
- `HOME_RETRY_DELAYS_SECONDS=60,180,360` — esperas entre rondas de la home
  (unos 10 min en total). Cada ronda conserva seis intentos cortos y deja en el
  log el HTTP, `Retry-After` y una muestra de la respuesta final.
- `DRY_RUN=1` — no escribe; imprime un resumen.
- `MAX_LEAVES=N` — limita nº de hojas (pruebas rápidas).
- `EMPTY_ABORT_PCT=20` — umbral del guardarraíl (ver abajo).
- `SKIP_DETAIL=1` — omite la pasada de ficha y conserva lo ya almacenado.
- `DETAIL_CONCURRENCY=3` — fichas descargadas en paralelo.
- `DETAIL_TTL_DAYS=90` — tiempo antes de volver a comprobar una ficha.
- `DETAIL_MAX=1000` — máximo de fichas por ejecución; permite un backfill
  progresivo sin exceder el tiempo del workflow.
- `DRY_DETAIL_MAX=3` — fichas de muestra descargadas en `DRY_RUN`.

## Guardarraíl anti-throttling

Cuando el servidor va cargado, sirve la página de categoría COMPLETA (200, título
correcto) pero SIN los tiles de producto — indistinguible de una categoría vacía
mirando una sola página. Para no despublicar productos vivos por un pico de carga:

1. La página 1 de cada hoja con 0 tiles se **reintenta** (3× con backoff).
2. Se cuenta la fracción de **hojas cuya página 1 llegó sin ningún tile**; si
   supera `EMPTY_ABORT_PCT` (20% por defecto) el run **aborta sin escribir**
   (ni upsert ni markStale).

⚠️ El criterio es "hojas SIN TILES", no "hojas que no aportan productos nuevos":
hay hojas legítimas que solo contienen productos ya vistos en otras categorías
(solapamiento del árbol; ~62 en Eroski, se loguean aparte como "hojas
solo-duplicados"). La 1ª versión mezclaba ambas cosas y el run de CI del
2026-07-11 abortó con "56% vacías" un crawl que en realidad igualaba al DRY_RUN
previo (10.694) — ambos capados a ~la mitad del catálogo real (21.073 con la
paginación stateful) por la retirada de `?pageNumber`.

## Ejecutar

- **Ejecución productiva local:** `run-eroski-sync.ps1` y
  `run-caprabo-sync.ps1`. El backend bloquea las IPs de GitHub Actions con 403,
  por lo que los workflows ya no se programan. Los wrappers leen `.env.local`,
  guardan logs en `scripts/logs/` y conservan los últimos 14.
- **Programación semanal:** crear tareas de Windows el lunes a las 10:00 (Eroski)
  y 10:30 (Caprabo), ejecutando los wrappers anteriores. El `workflow_dispatch`
  permanece solo para diagnóstico manual.
- **Prueba en seco:** `DRY_RUN=1 MAX_LEAVES=10 node scripts/sync-eroski.mjs`
  (o `sync-caprabo.mjs`). Al final imprime hasta 3 fichas reales con los campos
  extraídos.
- **Backfill acelerado manual:** aumentar `DETAIL_MAX` y el timeout del proceso;
  los siguientes runs continúan por las filas cuyo `detail_synced_at` siga vacío.
