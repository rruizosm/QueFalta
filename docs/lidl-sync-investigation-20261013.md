# Lidl: nueve workers fallidos, 13 de octubre de 2026

## Evidencia de producción

Ejecución revisada: [38303318853](https://github.com/rruizosm/QueFalta/actions/runs/38303318853),
commit `8149d84fc8e10a36d7e8cbaaea981ac080f533a8`, iniciada el 12 de octubre
a las 20:18 UTC y terminada el 13 a las 02:52 UTC.

- Los workers 1–9 fallaron después de procesar sus lotes: **661 tiendas
  completadas, 58 en `dead`, 174 intentos fallidos** (tres por tienda).
- Los workers 10–24 terminaron correctamente, sin trabajo pendiente reclamable.
  `recover` no reclama `dead`: relanzarlos sin reabrir los IDs no recupera nada.
- El job `report` falló correctamente al detectar esas 58 tiendas.
- El job `comparator` también falló, por `57014 statement timeout` al leer
  `lidl_comparator_products`. Son once jobs fallidos contando estos dos finales.
- La consulta de `private.lidl_catalog_sync_queue` confirmó 661 `succeeded` y
  58 `dead`; no había trabajos `pending`, `retry` ni `running`.

## 38 tiendas de Canarias: catálogo vacío sin activar el respaldo

Las 38 devuelven `solo 0 hojas con productos (< 40)`. El sondeo previo tenía
fijos los IDs de hojas `90`, `10`, `30`. Lidl usa ahora raíces `1005`, `1001`,
`1002` con subcategorías: ninguna coincidía. Tras recorrer todo el árbol, el
guardarraíl de hojas lanzaba un error de cobertura que el fleet, correctamente,
no interpreta como autorización para usar la tienda maestra.

IDs afectados:

```text
ES0951,ES0952,ES0953,ES0954,ES0955,ES0956,ES0958,ES0959,ES0961,ES0962,
ES0963,ES0964,ES0966,ES0969,ES0973,ES0977,ES0978,ES0982,ES0984,ES0985,
ES0986,ES0987,ES0988,ES0989,ES0990,ES0993,ES0994,ES0996,ES0999,ES9100,
ES9101,ES9102,ES9103,ES9104,ES9105,ES9106,ES9110,ES9114
```

Corrección local: identificar las familias alimentarias por nombre y comprobar
todas sus hojas antes de declarar ausencia. En cuanto aparece un producto se
continúa el barrido normal y sus controles. Si los nombres cambian, un barrido
completo con cero productos también emite `LIDL_CATALOG_EMPTY`. Las pruebas
limitadas y los árboles por debajo del mínimo no pueden activar esta señal.
Se reutilizan las respuestas del sondeo. HTTP 403/429 y catálogos parciales
conservan su tratamiento anterior.

La política existente usa `ES3572` como respaldo y conserva la procedencia en
`raw.fallbackSourceStoreId`. El cambio no amplía esa política. Un DRY_RUN real
de ES0951 con la corrección confirmó la señal `LIDL_CATALOG_EMPTY` después de
reintentar todas las hojas de panadería, fruta/verdura y carne.
El DRY_RUN de respaldo `ES0951 ← ES3572` completó 71 hojas y obtuvo 2652
productos, todos con precio e imagen, y 12 ofertas enlazadas. Las campañas web
se desactivaron expresamente en esta comprobación; no se escribió ningún dato.

## 20 tiendas: volumen inferior al mínimo

Los tres intentos de cada tienda devolvieron exactamente el mismo recuento.
Se mantiene publicado el catálogo anterior: los controles se ejecutan antes
de los upserts y de las bajas.

| Tienda | Productos del run | Publicados anteriores |
|---|---:|---:|
| ES0254 | 2182 | 2215 |
| ES0290 | 2079 | 2239 |
| ES0367 | 1966 | 2120 |
| ES0410 | 2029 | 2257 |
| ES0431 | 2079 | 2136 |
| ES0444 | 2138 | 2418 |
| ES0450 | 1946 | 2219 |
| ES0486 | 2127 | 2330 |
| ES0529 | 2074 | 2173 |
| ES0530 | 1903 | 2142 |
| ES0548 | 2052 | 2204 |
| ES0549 | 2042 | 2252 |
| ES0553 | 2058 | 2269 |
| ES0556 | 2126 | 2226 |
| ES0620 | 2139 | 2411 |
| ES0769 | 2122 | 2245 |
| ES0848 | 1968 | 2141 |
| ES0850 | 2196 | 2247 |
| ES5002 | 2051 | 2234 |
| ES5018 | 2169 | 2201 |

La mayoría conserva su última publicación del 21 de septiembre; otras del
29 de septiembre o del 5 de octubre. Un DRY_RUN completo de ES0530 el día 13
obtuvo 1906 productos, 69 hojas, 100 % con precio e imagen y nueve ofertas
enlazadas. Confirma el volumen actual de la fuente, pero no demuestra por sí
solo que el surtido esté completo. **No se han rebajado mínimos ni añadido
excepciones**. Requiere validar cobertura por familias y productos desaparecidos
antes de modificar la política de mínimos.

Nota de concurrencia: al terminar la revisión apareció un cambio de otro
trabajo en `lidl-store-coverage.mjs` que añade ES0410 (Langreo, 2028 productos
verificados). Se conserva; esa excepción y su eventual recuperación pertenecen
a ese trabajo. Los 20 casos de la tabla describen la ejecución fallida original.

## Comparador: índice para búsqueda por producto y primera tienda

La vista realiza un lateral con `product_id = m.id AND published`, ordenado por
`store_id`, con `LIMIT 1`. El EXPLAIN de producción para las primeras 1000 filas
elige `lidl_store_products_browse_idx (store_id, product_id)`; el índice separado
de `product_id` tampoco cubre ese orden. La consulta repite ese acceso por cada
producto y agota el timeout de la Data API.

Preparada, **sin aplicar**, la migración
`20261013144834_lidl_comparator_product_store_index.sql`: índice parcial
`(product_id, store_id) WHERE published`. No modifica la vista, los permisos,
las políticas RLS, los precios ni los embeddings. La prueba con PostgreSQL
embebido verifica resultados idénticos y un plan que puede usar el índice sin
Sort. La mejora de tiempo en producción queda pendiente de medir tras aplicarlo.

## Validación y siguiente operación

- 62/62 pruebas dirigidas, incluidas ocho nuevas regresiones de disponibilidad.
- SQL real del comparador y nuevo índice ejecutados con PGlite 0.5.9 temporal:
  origen/destino, aislamiento por tienda, Plus, promociones, hashes y permisos.
- `npx tsc --noEmit` correcto. Los scripts están excluidos del ESLint del repo;
  las pruebas ejecutan los módulos modificados.
- Sin commit/push, migraciones remotas, escrituras de catálogo ni relanzamientos.

Tras publicar la corrección, reabrir exclusivamente los 38 IDs de Canarias con
`retry_dead_lidl_catalog_sync_jobs` y ejecutar `recover` filtrado a esos IDs.
No usar `weekly`, que volvería a programar las 661 tiendas completadas.
Las tiendas bajo mínimo requieren su validación específica (incluido el trabajo
simultáneo sobre ES0410) antes de reabrirse.
Aplicar y medir el índice antes de reejecutar el comparador, conservando sus
controles de anomalías y el estado del interruptor de embeddings.
