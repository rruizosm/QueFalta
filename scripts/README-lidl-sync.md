# Sync Lidl

`sync-lidl.mjs` replica el catálogo público de Lidl Plus para una tienda
española concreta. Recorre el árbol completo de categorías y
guarda nombre, marca, precio, precio canónico por kg/L/ud, imagen,
disponibilidad, tipo de producto y promociones visibles. En la misma pasada
consulta el feed público de ofertas de tienda, pero conserva separado el precio
ordinario del promocional.

## Fuente y alcance

- API: `product-catalog.lidlplus.com/api/app/v1/ES/store/{storeId}`.
- Ofertas: `offers.lidlplus.com/app/api/v4/{country}/{storeId}/offers`.
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
   por usuario y deja el planificador semanal completo.
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
5. Tras la validación y la revisión de autorización, crear la variable de
   repositorio `LIDL_SYNC_ENABLED=true`. El único barrido queda preparado para
   cada lunes a las 11:20 UTC; los runs se omiten mientras falte esa variable.

La cola usa `pending → running → succeeded`, con `retry` exponencial y `dead`
tras tres intentos. Cada claim tiene un lease de 45 minutos y usa
`FOR UPDATE SKIP LOCKED`, por lo que los workers no se bloquean ni procesan la
misma tienda a la vez. Las RPC de programación/claim/cierre solo conceden
`EXECUTE` a `service_role`.

Lidl ya está integrado en el catálogo del cliente. El comparador semántico se
mantiene fuera hasta validar cobertura multi-tienda y disponer de EAN reales.

## Variables

| Variable | Uso |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE` | destino; obligatorias salvo DRY_RUN |
| `LIDL_STORE_ID=ES3572` | tienda concreta que se sincroniza |
| `LIDL_STORES_API_KEY` | clave rotatoria del directorio oficial; solo para `sync-lidl-stores.mjs` |
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
node scripts/sync-lidl.mjs
Remove-Item Env:DRY_RUN
```
