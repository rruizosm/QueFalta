# Acceso JSON a Alcampo — verificado el 28-09-2026

Hay acceso anónimo a categorías y ofertas. **El listado general de productos
continúa bloqueado con HTTP 403** desde este equipo. No es una API de partners
ni una autorización comercial: son los endpoints que utiliza la web pública.

Base: `https://www.compraonline.alcampo.es`.

| Datos | Método y ruta | Resultado real |
| --- | --- | --- |
| Árbol de categorías | GET `/api/webproductpagews/v1/categories?decoration=false&categoryDepth=6` | 200; 28 raíces, 4.513 nodos contando apariciones en ramas |
| Productos en oferta | GET `/api/product-listing-pages/v1/pages/promotions` | 200; 4.726 productos únicos en 16 páginas, 894 IDs de promoción |
| Detalle de una promoción | GET `/api/webproductpagews/v4/promotion/retailer-id/{retailerPromotionId}` | 200; «Todo a 1 €»: 716 productos y fechas estructuradas |
| Catálogo general | GET `/api/webproductpagews/v6/product-pages` | 403 HTML; tampoco funcionó con la sesión anónima y parámetros de la web |
| Decoración de productos por UUID | PUT `/api/webproductpagews/v6/products`, body array de UUID | 403; no resuelve el bloqueo del catálogo |
| Búsqueda de productos | GET `/api/webproductpagews/v6/product-pages/search?q=leche&tag=web&includeAdditionalPageInfo=true&maxPageSize=300&maxProductsToDecorate=300` | 403; ruta contrastada con el JavaScript actual |
| Ficha individual | GET `/api/webproductpagews/v5/products/bop?retailerProductId=633548&regionId={regionId}` | 403; ruta documentada por el autor de la guía n8n, comprobada directamente |

Las rutas se contrastaron con el JavaScript publicado por Alcampo
(`/static/index-3BeSnM8c.js`), no con versiones supuestas de la API.

## Reproducir sin publicar

Node 22, sin claves, sin navegador y sin variables de Supabase:

```sh
# Muestra: 2 páginas y una promoción completa.
node scripts/probe-alcampo-api.mjs

# Recorrer el directorio completo de productos en oferta (límite de seguridad).
MAX_PAGES=60 node scripts/probe-alcampo-api.mjs

# Acotar a una categoría y elegir carpeta de salida.
CATEGORY_ID=OCC10 ALCAMPO_OUTPUT=/tmp/alcampo-api MAX_PAGES=10 node scripts/probe-alcampo-api.mjs
```

En PowerShell, establecer esas variables con `$env:MAX_PAGES = '60'` antes de
ejecutar `node scripts/probe-alcampo-api.mjs`.

Resultados en `scripts/logs/alcampo-api/` (gitignored): `categories.json`,
`offer-products.json`, `promotion-ids.json`, `promotion-detail.json` y
`summary.json`. El detalle corresponde solo a una promoción (primera descubierta
o `PROMOTION_ID` explícito). El cliente `AlcampoApi.promotion(id)` permite leer las
restantes; no se han descargado las 894 fichas completas.

Código de salida: **2 = acceso parcial, catálogo bloqueado**, 1 = error del
recorrido, 0 = acceso comprobado también a una muestra del catálogo general.
Ni el código 0 ni alcanzar `MAX_PAGES` significan haber descargado todo el
catálogo. Consultar `offersComplete` y `offersTruncated` en el resumen. Los
archivos de un intento anterior pueden seguir en la carpeta si un intento nuevo
falla; usar una carpeta nueva o comprobar `checkedAt` y `status`.

## Sesión y paginación

1. GET `/` crea una sesión anónima. Leer `regionId` del HTML de esa sesión.
2. Conservar y actualizar las cookies `Set-Cookie` **en memoria**.
3. Para promociones, pasar `regionId`, `maxPageSize=300`,
   `maxProductsToDecorate=300`, `includeAdditionalPageInfo=true` y, opcionalmente,
   `retailerCategoryId`.
4. Seguir `metadata.nextPageToken` usando la misma sesión y
   `includeAdditionalPageInfo=false`. Finalizar únicamente cuando no haya token.
5. Leer `productGroups[].decoratedProducts[]` y deduplicar por `productId`.
6. Extraer `promotions[].retailerPromotionId` para consultar cada detalle.

La prueba usó la región anónima de la página de inicio,
`ac90d761-9d58-4918-a37d-dd14e1ce384a` (Vaguada, retailerRegionId 5). **No se ha
comprobado que ofertas y precios sean iguales en otras tiendas o regiones.**
Se incluyeron todas las categorías promocionales, también no alimentarias;
no equivale al catálogo alimentario completo de QuéFalta.

## Interpretar precios y ofertas

- `price.amount` puede ser el precio base. Usar `promoPrice.amount` cuando exista
  para la rebaja directa, conservando ambos. Ejemplo real: alcachofas PEÑA TORCAL,
  base 1,11 €, promocional 1,00 €.
- Las promociones de club o de varias unidades no deben convertirse en rebajas
  unitarias sin condiciones. Conservar `promotions` y `requiredProductQuantity`.
- El detalle devuelve `activePeriod.activeFrom/activeTo`, descripción,
  `promotionGroups[].products`, cantidades y recompensas. Fechas en UTC.
- En la prueba, «Todo a 1 €» tenía vigencia local 14-09 a 08-10-2026. Los conteos
  cambian con el catálogo y la disponibilidad; no son constantes del contrato.

## Pendiente

Diagnóstico adicional del 28-09: una sesión anónima recién creada, con cookies,
`X-CSRF-TOKEN`, Origin/Referer y cabeceras de versión/página publicadas por la web,
mantiene 200 en categorías y 403 en GET de catálogo y PUT de decoración. No era
únicamente la ausencia del CSRF en la prueba inicial. El 403 es HTML de
CloudFront, sin cabecera `x-amzn-waf-action`: no permite atribuir con certeza el
rechazo a IP, detección de automatización o una regla concreta. No equivale a una
sesión de navegador con sus posibles tokens adicionales. Evidencia sin secretos
en `scripts/logs/alcampo-api/session-diagnostic.json`, con script reproducible al
lado. No se ha probado ningún proxy; no hay proxy configurado en las variables
HTTP_PROXY/HTTPS_PROXY/ALL_PROXY del proceso de prueba.

El acceso general necesita una sesión que Alcampo acepte o un acceso facilitado
por el proveedor. El runner existente de
[navegador](README-alcampo-playwright.md) sigue siendo una vía separada para el
catálogo. Esta prueba no lo sustituye, no automatiza verificaciones humanas,
no despliega cambios y no ejecuta migraciones ni escrituras en producción.

### Vías externas para desbloquear el catálogo

- Alcampo publica el [canal de atención](https://www.compraonline.alcampo.es/content/atencion-al-cliente)
  `atencioncliente@alcampo.es` y el 913 687 857. Puede solicitarse derivación al
  equipo responsable de datos de catálogo/integraciones; no se ha enviado ninguna
  solicitud ni se ha identificado un portal oficial de alta de desarrolladores.
- [Parse anuncia un adaptador de Alcampo](https://parse.bot/marketplace/75d273ca-3157-46b6-809a-a554c3fd90b9/compraonline-alcampo-es-api)
  con categorías, productos y promociones. Es un proveedor independiente que
  exige cuenta y `X-API-Key`, no acceso oficial de Alcampo. Su afirmación de
  funcionamiento no se ha verificado con una llamada propia. No se ha creado
  cuenta, contratado servicio ni incorporado esta dependencia. Antes de adoptarlo
  hay que comprobar con una clave autorizada los productos sin promoción y la
  paginación completa; una respuesta de ejemplo no demuestra cobertura.

La prueba adicional del buscador y de la ficha mantiene el mismo bloqueo del
catálogo. Repetir esas llamadas sin cambiar el estado de acceso no aporta una
solución. El acceso parcial ya descargado sigue disponible.

Verificación local: `node --test scripts/lib/alcampo-api.test.mjs` y
`npx tsc --noEmit`.
