# BM — explorador multizona (Fase 1)

`scripts/explore-bm.mjs` es una prueba tecnica de **solo lectura** sobre la API
publica que consume la tienda online de BM. No carga `.env.local`, no necesita
credenciales y no tiene ningun camino de escritura a Supabase.

## Que comprueba

- resolucion de codigo postal a centro, zona y modalidad de entrega;
- recuento de productos y ofertas por zona;
- estructura y profundidad del arbol de categorias;
- muestra paginada y normalizada de productos;
- codigo BM, EAN/GTIN, precios, disponibilidad, novedades y promociones;
- senales disponibles en la ficha de detalle;
- diferencias de surtido, precio, oferta y disponibilidad frente a la primera
  zona soportada de la ejecucion.

La salida JSON se escribe en `stdout`. El progreso y los errores se escriben en
`stderr`, por lo que el informe se puede redirigir sin mezclar los mensajes.

## Ejecucion

```bash
node scripts/explore-bm.mjs
```

Prueba corta con tres zonas y una pagina de muestra:

```bash
POSTAL_CODES=20009,28008,48009 SAMPLE_PAGES=1 node scripts/explore-bm.mjs
```

Variables disponibles:

- `POSTAL_CODES`: lista separada por comas. Por defecto usa una capital o zona
  representativa de cada territorio donde se ha detectado presencia de BM.
- `PAGE_SIZE`: productos por pagina, entre 1 y 20; por defecto 20.
- `SAMPLE_PAGES`: paginas de catalogo por zona, entre 1 y 10; por defecto 2.
- `DETAIL_SAMPLES`: fichas de detalle consultadas por zona, entre 0 y 5; por
  defecto 3.
- `PREVIEW_PRODUCTS`: productos incluidos como muestra en el JSON; por defecto 3.
- `REQUEST_DELAY_MS`: separacion minima previa a cada peticion; por defecto 120.
- `REQUEST_TIMEOUT_MS`: timeout por peticion; por defecto 25 segundos.
- `MAX_RETRIES`: intentos para errores de red, `429` o `5xx`; por defecto 3.

## Interpretacion

Un codigo postal sin cobertura no hace fallar el proceso: queda registrado como
`supported: false`. Los errores de contrato o red se recogen en `errors`. El
proceso solo termina con codigo distinto de cero si ninguna zona funciona o si
todas las zonas solicitadas fallan.

Este explorador no es el sincronizador productivo. La publicacion en Supabase,
los guardarrailes de catalogo completo y el historial multizona pertenecen a las
fases siguientes.

## Resultado validado (2026-08-30)

El barrido representativo confirmo siete zonas online distintas y cero errores de
contrato o red:

| CP | Centro de entrega | Productos | Ofertas |
| --- | --- | ---: | ---: |
| 20009 | BM Pagola Online | 8.420 | 610 |
| 48009 | Zubiarte Online | 7.103 | 531 |
| 01001 | BM Lakua | 8.101 | 579 |
| 39001 | BM Santander Online | 8.120 | 579 |
| 31001 | BM Ardoi Online | 8.053 | 582 |
| 26001 | BM Avd. Madrid Online | 8.051 | 554 |
| 28008 | BM Princesa | 7.683 | 677 |

Los CP representativos 05001, 19001, 33001 y 50001 no devolvieron una zona
online habilitada. Esto describe esos CP concretos, no demuestra por si solo que
toda la provincia carezca de cobertura.

El catalogo limita cada bloque a 20 productos y pagina mediante `offset`;
`currentPage` se ignora aunque `hasMore` sea `true`. Los arboles observados tienen
entre 937 y 992 nodos y profundidad maxima 6. En muestras deterministas de 40
productos ya aparecen diferencias de surtido, precio y tipo de oferta entre
zonas, por lo que la integracion productiva debe conservar el contexto postal.

## Integración en la app (2026-09-20)

El catálogo BM se muestra en QuéFalta para cualquier código postal de las siete
provincias representadas en la tabla anterior. La app traduce el prefijo del CP
al CP de referencia sincronizado, resuelve `bm_postal_locations.location_id` y
usa esa ubicación en búsqueda, listados, categorías, fichas, ofertas, novedades
y cambios de precio.

Para ampliar cobertura a otra provincia hay que validar un CP de referencia con
el explorador, incorporarlo al sync y mantener en paridad las referencias en:

- `scripts/lib/bm.mjs`, fuente del sincronizador;
- `src/constants/retailerZones.ts`, guardia visible del cliente.

La prueba `scripts/tests/bm-app-integration.test.mjs` falla si ambas listas dejan
de coincidir. El workflow productivo continúa manual hasta que se valide su
operación recurrente.

## Validación de la fuente nutricional (2026-09-28)

- La ficha `/api/rest/V1.0/catalog/product/code/{code}` devuelve el EAN, pero no
  la tabla nutricional. La tienda carga un segundo JSON usando ese EAN; la ruta
  observada en el `config.json` público es
  `https://cdn-bm.aktiosdigitalservices.com/tol/bm/media/product/nutritional-info/{ean}.json`.
  El listado `/catalog/product` ya incluye `ean`, que el sync guarda en
  `bm_products.ean`; el futuro enriquecimiento puede consultar el CDN
  directamente, sin descargar antes cada ficha `/code/{code}`. Reservar
  `global_gtin` para la consulta externa a Open Food Facts.
- Los JSON de cuatro alimentos reales —leche condensada `67714`, tarta helada
  `7433`, bocaditos al cacao `87976` y leche entera `76411`— respondieron 200
  con `nutrilabel.productInformation.nutritionalValues[].values`. Cada valor
  contiene nombre, cantidad, unidad y `servingSize`; los nutrientes subordinados
  (saturadas, azúcares) van en `children`. El mismo objeto ofrece
  `ingredientsInformation` y `allergensInformation`; `messages` aporta, entre
  otros datos, conservación. La web rotula la tabla «por 100g» incluso para la
  leche de 1 l; no se debe convertirla implícitamente a 100 ml.
- La presencia de `nutritional.info.date` en los atributos de la ficha no prueba
  que exista tabla. Los artículos no alimentarios `24377` y `47424` tenían esa
  señal, pero sus JSON respondieron 200 con solo `{"messages":[]}`. El parser
  debe comprobar `nutritionalValues`, no solo el estado HTTP ni el atributo.
- La ficha del producto `67714` se consultó con las cabeceras de Gipuzkoa
  (`20009`) y Madrid (`28008`): devolvió el mismo EAN y contenido JSON. El CDN
  usa una ruta por EAN sin parámetros de zona. Esto avala guardar el detalle en
  `bm_products`, manteniendo los precios y ofertas en las tablas zonales. No se
  ha medido la cobertura nutricional de todo el catálogo.
- La validación inicial fue de solo lectura. La app todavía no presenta la
  información nutricional ni el Índice alimentario BM.

## Sync nutricional (2026-09-28)

`scripts/sync-bm.mjs` descarga el JSON del CDN por cada EAN único después de
validar la cobertura de las siete zonas. Normaliza nutrientes y unidades en
`nutrition` (incluyendo valores anidados), quita HTML de `ingredients`, reúne
`allergens` y extrae los mensajes de `conservation`. Guarda los cuatro campos
en `bm_products`; `bm_product_locations` los expone junto al precio zonal.
La migración `20260928124545_bm_nutrition_details.sql` está aplicada.

- `DETAIL_MAX=1000`: límite por ejecución; `DETAIL_MAX=10000` sirve para un
  backfill excepcional. Los productos pendientes se retoman en el siguiente
  run, sin borrar lo ya publicado.
- `DETAIL_TTL_DAYS=90`: vuelve a consultar un EAN tras ese plazo.
- `DETAIL_CONCURRENCY=3`: descargas simultáneas, sujetas además al retardo
  global `REQUEST_DELAY_MS`.
- `DRY_DETAIL_MAX=3`: muestras consultadas en `DRY_RUN=1`; nunca escribe.
- `SKIP_DETAIL=1`: conserva el detalle existente y omite el CDN.

Un JSON 200 sin contenido cuenta como comprobado si el producto no tenía ficha.
Si ya tenía datos, se conservan y se reintenta en el próximo sync. Los errores
de red también dejan intactos los campos previos; un 403/429 detiene el lote
nutricional para no insistir contra el CDN. Un cambio de EAN invalida la ficha
anterior. El primer sync productivo consultó 1.000 EAN sin errores: 515 tablas
nutricionales, 561 listas de ingredientes y 289 listas de alérgenos en productos
publicados. Un segundo sync, con `DETAIL_MAX=10000`, completó los 9.197 EAN
restantes sin fallos. Verificación final en Supabase: 10.197 productos
publicados y consultados; 4.873 con tabla nutricional, 5.437 con ingredientes,
3.730 con alérgenos y 4.962 con conservación. La vista zonal expone 28.288
filas publicadas con tabla nutricional. El producto `67714` mostró el mismo
detalle en tres ubicaciones comprobadas.
