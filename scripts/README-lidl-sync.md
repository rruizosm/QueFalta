# Sync Lidl

`sync-lidl.mjs` replica el catálogo público de Lidl Plus para una tienda
española concreta. Recorre el árbol completo de categorías y
guarda nombre, marca, precio, precio canónico por kg/L/ud, imagen,
disponibilidad, tipo de producto y promociones visibles. En la misma pasada
consulta el feed público de ofertas de tienda, pero conserva separado el precio
ordinario del promocional. También incorpora las campañas semanales públicas de
`lidl.es` cuando puede confirmar el mismo producto en el catálogo de la tienda.

## Fuente y alcance

- API: `product-catalog.lidlplus.com/api/app/v1/ES/store/{storeId}`.
- Ofertas: `offers.lidlplus.com/app/api/v4/{country}/{storeId}/offers`.
- Campañas web: Formato ahorro XXL, Ofertas semanales, Fin de semana a lo
  grande, Precios imbatibles y Bajamos los precios. Las URLs se descubren desde
  `https://www.lidl.es/`; no se fijan los ids CMS semanales.
- Tienda por defecto del script: `ES3572`. Cada ejecución guarda precio,
  disponibilidad y surtido bajo ese `store_id`; nunca los publica como datos
  nacionales ni reemplaza la variante de otra tienda.
- No se inicia sesión y no se consulta Scan&Go.
- Los ids como `8807709681515_ES` son identificadores internos. El sync guarda
  `ean=NULL`; no intenta deducir el código de barras.
- La pasada semanal descarga el catálogo base (~2.800 productos). Para ofertas,
  usa el código del fichero de imagen o nombre+precio únicamente como
  preselección y consulta el detalle de esos pocos candidatos. Solo guarda la
  promoción cuando `productCodes[].code` confirma uno de los `productIds` del
  feed; nunca enlaza solo por semejanza de nombre.
- Se excluye `redemptionChannel=OnlineShop` y toda campaña aún no iniciada o
  caducada. Las ofertas de plantas, bazar u otras familias ausentes del Product
  Catalog alimentario se omiten si no hay producto verificable.
- Las páginas de campaña entregan `regionsV2` y `regionsPrices`, no tiendas. El
  sync consulta `lidl_stores.offer_region`, selecciona ese precio regional y
  conserva Product Catalog como autoridad de surtido/disponibilidad. `nat` o
  `ians` deben coincidir con `productCodes`; el título o código de imagen solo
  sirven para evitar descargar todas las fichas.
- El fleet descarga las cinco páginas una vez por worker y comparte una caché
  temporal privada entre sus tiendas. El feed de ofertas de tienda se aplica
  después y prevalece si el mismo producto aparece en ambas fuentes.
- En promociones con compra mínima (`3x1,49€`, `6x2€`, etc.), el feed publica
  también el coste efectivo por unidad. Se conserva la condición como texto,
  pero no se guarda ese coste como `promo_price`: el precio individual sigue
  siendo el precio ordinario del catálogo.
- Si el detalle promocional repite exactamente la etiqueta, se guarda una sola
  copia en `promo_name` y `promo_text` queda vacío.
- No se descargan todas las fichas una a una. Ingredientes y alérgenos siguen
  reservados para una fase de enriquecimiento incremental.

Antes de usar los datos con una finalidad comercial debe revisarse la
autorización de Lidl: las condiciones publicadas de Lidl Plus describen el
programa para consumidores privados y excluyen la participación comercial.

## Despliegue y operación

1. Las migraciones de catálogo, búsqueda y ofertas hasta
   `20260904122841_lidl_offers.sql` están aplicadas en Supabase. La migración
   multitienda `20260904134138_lidl_multistore_catalog.sql` ya está aplicada y
   debe estar presente antes de usar los syncs nuevos o esta versión del cliente.
   La cola y su política `20260904141250`/`20260904141502` también están
   desplegadas. `20260904175757_lidl_weekly_full_fleet.sql` retira la prioridad
   por usuario y deja el planificador semanal completo. La corrección
   `20260904185536_lidl_catalog_sync_queue_delete_grant.sql` concede a
   `service_role` el `DELETE` que usa ese planificador `SECURITY INVOKER`.
2. El primer sync productivo se validó el 2026-09-04: 2.811 productos y 43
   categorías, sin hojas vacías. El cliente ya incluye navegación, búsqueda,
   favoritos, carrito y ficha básica de Lidl.
   El DRY_RUN de ofertas del mismo día obtuvo 2.810 productos, 28 campañas (27
   vigentes de tienda) y 17 enlaces exactos; las 10 no enlazadas no
   pertenecían al catálogo alimentario disponible.
   La carga productiva posterior publicó 17 ofertas (12 con precio directo) y
   actualizó `catalog_sync_status` a las 12:30 UTC.
3. `sync-lidl-stores.mjs` se ejecutó en producción el 2026-09-04: cargó 730
   tiendas, 721 abiertas y 721 candidatos exactos para 645 códigos postales.
   Reejecutarlo diariamente con `LIDL_STORES_API_KEY` mantiene el directorio
   nacional al día. Las tiendas cercanas para CP sin coincidencia exacta
   requieren todavía el índice geocodificado.
4. `sync-lidl-fleet.mjs` programa todas las tiendas abiertas y reclama una cada
   vez. El sync valida y despublica solo dentro de esa tienda; únicamente
   `ES3572` actualiza también `lidl_products` para clientes legacy. La tienda
   elegida por el usuario no altera el planificador.
5. La variable de repositorio `LIDL_SYNC_ENABLED=true` está activa. El barrido
   queda programado cada lunes a las 11:20 UTC. El primer dispatch manual falló
   antes de llamar a Supabase porque el nombre local `URL` ocultaba al
   constructor global; el orquestador usa ahora `SUPABASE_URL` y una prueba de
   proceso cubre su arranque completo. El segundo llegó a la RPC pero falló
   porque faltaba `DELETE` sobre la cola; la migración `20260904185536` ya está
   aplicada y una ejecución transaccional como `service_role` programó las 721
   tiendas antes de hacer `ROLLBACK` y dejar la cola vacía.

La cola usa `pending → running → succeeded`, con `retry` exponencial y `dead`
tras tres intentos. Cada claim tiene un lease de 45 minutos y usa
`FOR UPDATE SKIP LOCKED`, por lo que los workers no se bloquean ni procesan la
misma tienda a la vez. Las RPC de programación/claim/cierre solo conceden
`EXECUTE` a `service_role`.

Lidl está integrado en el comparador mediante
`20260905175806_lidl_comparator_multistore.sql`. El materializador consulta
`lidl_comparator_products`: una ficha por `lidl_product_master.id`, con categoría
y unidad de referencia de un surtido publicado. No incorpora precios, stock o
identificadores de tienda al texto semántico ni interpreta IDs internos como EAN.
El servidor resuelve precio y disponibilidad de origen y destino desde la tienda
del perfil; Lidl exige Plus y una tienda seleccionada. Las ofertas directas vigentes
ajustan también el precio unitario; compras mínimas y promociones caducadas se excluyen.
Si falta precio por kg/L/ud, el motor se abstiene: no presenta un origen de precio
desconocido como la opción más económica. El producto conserva su embedding.

El job `comparator` se ejecuta una sola vez después de los workers, incluso ante
fallos parciales: solo lee los productos que los syncs individuales publicaron
tras sus validaciones. `run-lidl-sync.ps1` también materializa después de un sync
real correcto. Ambos respetan el interruptor global de embeddings y los límites
de anomalías. Si el pipeline está pausado, las altas quedan encoladas hasta su
procesamiento explícito; añadir Lidl no reactiva el cron ni los otros catálogos.

La primera carga de 3.321 productos requiere `STORES=lidl` y el override de
anomalía revisado, porque supera el límite incremental. No guardar ese override
en workflows. `supabase/ops/dispatch-lidl-embedding-batch.sql` procesa explícitamente
un lote máximo de 100 mensajes Lidl con el pipeline pausado. Esperar el resultado
del worker y verificar fallos antes de repetir; no programar ese script en cron.

Prueba SQL local con datos ficticios (módulo PGlite temporal externo al proyecto):
`node scripts/test-lidl-comparator-sql-local.mjs /ruta/absoluta/a/pglite/dist/index.js`.

## Variables

| Variable | Uso |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE` | destino; obligatorias salvo DRY_RUN |
| `LIDL_STORE_ID=ES3572` | tienda concreta que se sincroniza |
| `LIDL_STORES_API_KEY` | clave rotatoria del directorio oficial; solo para `sync-lidl-stores.mjs` |
| `LIDL_CAMPAIGNS_FILE` | caché JSON creada por el fleet; en ejecución directa se descarga desde la web |
| `LIDL_CAMPAIGNS_DISABLED=1` | omite expresamente el complemento de campañas web |
| `LIDL_CAMPAIGNS_REQUIRED=1` | convierte un fallo de campañas en fallo del sync; por defecto conserva el catálogo/feed |
| `LIDL_OFFER_REGION=26` | región explícita solo para DRY_RUN sin conexión a `lidl_stores` |
| `LIDL_FLEET_JOB_LIMIT=10` | máximo por worker; el workflow semanal lo fija en `32` |
| `LIDL_FLEET_LEASE_MINUTES=45` | reserva recuperable de una tienda por worker |
| `LIDL_FLEET_STORE_TIMEOUT_MINUTES=35` | tope por tienda; debe ser menor que el lease |
| `LIDL_FLEET_MAX_ATTEMPTS=3` | intentos antes de dejar el trabajo en `dead` |
| `LIDL_COUNTRY=ES`, `LIDL_LANGUAGE=es` | país e idioma de la API |
| `DRY_RUN=1` | descarga y valida sin escribir |
| `MAX_LEAVES=N` | limita ramas solo en DRY_RUN |
| `MIN_PRODUCTS=2200`, `MIN_LEAVES=35` | guardarraíles absolutos contra catálogos parciales |
| `MIN_NONEMPTY_LEAVES=40`, `EMPTY_LEAF_RETRIES=3` | reintenta y bloquea la publicación si una rama desaparece temporalmente |
| `MIN_MATCHED_OFFERS=1` | si hay ofertas vigentes, bloquea la publicación si no se confirma ningún producto |
| `MIN_COVERAGE_RATIO=0.85` | exige al menos el 85 % del catálogo publicado anterior |
| `CONCURRENCY=4`, `PAGE_SIZE=100` | ritmo de descarga |

Prueba local completa, sin escritura:

```powershell
$env:DRY_RUN='1'
$env:LIDL_OFFER_REGION='26'
node scripts/sync-lidl.mjs
Remove-Item Env:DRY_RUN
Remove-Item Env:LIDL_OFFER_REGION
```

## Recuperación y resistencia del barrido (2026-09-04)

El run `33909268291` terminó con 643 tiendas completadas y 78 en `retry`.
Las 39 tiendas que devolvieron cero productos pertenecen a Canarias. Una
comprobación posterior de fruta y carne en ES0951, ES0953 y ES9100 volvió a
obtener HTTP 200 y `totalProducts=0`; ES2106, que había dado 403, volvió a
responder con 144 y 111 productos en esas ramas. No se usan precios peninsulares
como sustituto y no se rebajan los controles de las tiendas vacías.

Las cinco tiendas pequeñas repitieron exactamente sus recuentos en los dos
intentos del run y un DRY_RUN secuencial posterior (concurrencia 1, pausa 250 ms):

| Tienda | Productos | Mínimo específico (98 %) |
|---|---:|---:|
| ES0367 | 2145 | 2102 |
| ES0431 | 2151 | 2107 |
| ES0529 | 2195 | 2151 |
| ES0530 | 2166 | 2122 |
| ES0848 | 2146 | 2103 |

Todas completaron las 40 hojas, con 100 % de precio e imagen y ofertas
verificadas. `lib/lidl-store-coverage.mjs` limita las excepciones a estos IDs;
se mantiene además la cobertura del 85 % frente al catálogo previo. El resto
conserva el mínimo de 2.200. Las tiendas totalmente vacías se detectan con tres
ramas alimentarias antes de barrer las restantes; no se publica nada.

- Las escrituras ordenan las claves antes de dividir en lotes de 250 y
  reintentan deadlocks/errores transitorios con espera exponencial y jitter.
- Los JSON incompletos se reintentan con el endpoint y tamaño en el error.
  Los 403 no se reintentan inmediatamente; tras dos tiendas seguidas con
  403/429 el worker se detiene conservando la cola para una ejecución posterior.
- El hijo comunica su error real al orquestador por IPC; se guarda en `last_error`.
- La migración `20260904210752_lidl_fleet_recovery.sql` está aplicada. Añade claim
  filtrado, informe y recuperación explícita de `dead`, con `SECURITY INVOKER`
  y `EXECUTE` exclusivo de `service_role`. No reinicializa trabajos al desplegar.
- El workflow manual tiene modo `recover` por defecto (dos workers), `canary`
  (un worker, máximo cinco intentos, IDs obligatorios) y `weekly` (censo completo).
  El cron sigue siendo semanal. Cada worker admite hasta 100 intentos y espera
  hasta 35 minutos a reintentos diferidos, con un tope total de 300 minutos.
  Se reduce la concurrencia a tres workers semanales, dos peticiones por tienda
  y 250 ms entre descargas. Un informe final se ejecuta incluso si falla un worker
  y deja el run fallido si quedan pendientes, running, retry, dead o IDs ausentes.

Operación (credenciales en el entorno, nunca en argumentos):

```sh
# Recuperar solo los trabajos todavía procesables, sin reprogramar éxitos:
node scripts/sync-lidl-fleet.mjs --recover-only
# Prueba acotada:
LIDL_FLEET_STORE_IDS=ES0367,ES2106 LIDL_FLEET_JOB_LIMIT=2 LIDL_FLEET_IDLE_MINUTES=0 node scripts/sync-lidl-fleet.mjs --recover-only
# Informe autoritativo, exit 1 si falta completar alguna tienda:
node scripts/sync-lidl-fleet.mjs --report-only
# Tras resolver la causa de un dead, reabrir exclusivamente IDs explícitos:
LIDL_FLEET_STORE_IDS=ES0367 node scripts/sync-lidl-fleet.mjs --retry-dead-only
```

`recover` no reinicia automáticamente `dead`. No usar `weekly` para recuperar
un barrido parcial: volvería a programar también los catálogos ya completados.

La prueba productiva posterior recuperó ES0367, ES2106 y ES4003. ES5016,
ES5026 y ES5093 responden 204 sin contenido en `/categories` y cero productos
al consultar fruta directamente. El sync distingue explícitamente ese estado
como catálogo no disponible, sin intentar parsearlo ni publicarlo. Los errores
200 con JSON truncado sí conservan reintentos. Estas tres tiendas y las 39
canarias quedan pendientes de datos en la fuente, sin sustituciones.
