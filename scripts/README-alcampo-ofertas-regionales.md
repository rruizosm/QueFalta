# Alcampo: diferencias de ofertas por zona

Comprobado el 28-09-2026. **Existen folletos diferenciados geográficamente, pero
no se ha podido comprobar la oferta efectiva por cada código postal.**

## Evidencia de la API

El árbol público separa dos ramas oficiales dentro de Folletos y Promociones:

| Rama | retailerCategoryId | Productos en oferta | Páginas completas |
| --- | --- | ---: | ---: |
| Folleto de Alimentación (excepto Canarias) | OC3009192 | 2.048 | 7 |
| Folleto Alimentación Canarias | OCFolletocanarias | 882 | 3 |

Consultadas con `/api/product-listing-pages/v1/pages/promotions`, usando
`retailerCategoryId` y siguiendo todos los `nextPageToken` hasta su ausencia.
Hay 875 productos comunes, 1.173 exclusivos de la primera rama y 7 exclusivos
de la segunda. Se deduplicó por UUID de producto.

Ejemplos de pertenencia a las ramas en la respuesta: patata blanca al peso
(`51961`) solo en la primera; bebida de avena ALPRO sin azúcar (`766667`) solo
en la segunda. **Eso no prueba exclusividad comercial de esas ofertas**: un
producto puede tener una promoción fuera de ese folleto.

Las dos sesiones nuevas resolvieron a Vaguada
(`ac90d761-9d58-4918-a37d-dd14e1ce384a`). Los 875 productos comunes tenían iguales
campos `price`, `promoPrice` y `promotions` en ambas respuestas. No es una
comparación de precios Madrid–Canarias: la región de precios era la misma.

## Prueba de códigos postales

El endpoint `PUT /api/ecomdeliverydestinations/v2/deliverability` respondió
`DELIVERABLE` para 28029 (Madrid), 08001 (Barcelona), 41001 (Sevilla), 35001
(Las Palmas) y 07001 (Palma), usando coordenadas aproximadas públicas de cada
zona, sin cuentas ni direcciones personales. Solo prueba cobertura, no asignación
de tienda ni igualdad de catálogo.

La creación del destino anónimo para 08001 mediante
`POST /api/ecomdeliverydestinations/v2/temporary-delivery-destinations` recibió
403. En el navegador, seleccionar la sugerencia «08001 Barcelona, España» dejó
el selector cargando, sin confirmar un cambio de región. Se detuvo la comparación
por CP para no atribuir cinco veces los datos de la tienda predeterminada a cinco
zonas diferentes.

El JavaScript actual distingue consulta de propuesta (`POST
/api/customersessions/v2/sessions/proposition`) de actualización de sesión
(`PUT/POST /api/customersessions/v2/sessions/active`). Obtener una propuesta o
una respuesta de cobertura no basta para demostrar el cambio efectivo.

## Consecuencia para QuéFalta

No asumir que todas las ofertas de Alcampo son nacionales a partir de la prueba
histórica del catálogo. Para regionalizar correctamente falta verificar el mapa
CP → destino → tienda/región, comprobar la región activa y comparar las mismas
referencias, precios, condiciones y fechas entre sesiones seleccionadas.

La separación Canarias/resto es evidencia útil para los folletos. No basta para
asignar indiscriminadamente todas las promociones a los prefijos 35/38 ni para
afirmar diferencias entre Madrid y Barcelona. No se ha modificado el sync ni se
ha aplicado una clasificación regional en producción.

## Evidencias y fuentes

- Datos, resumen y script exacto de comparación en
  `scripts/logs/alcampo-regional/` (gitignored): `branches.json`, `summary.json`,
  `postal-checks.json`, `reproduce.mjs`.
- [Árbol oficial JSON](https://www.compraonline.alcampo.es/api/webproductpagews/v1/categories?decoration=false&categoryDepth=6).
- [Folleto oficial Canarias](https://www.compraonline.alcampo.es/categories/folletos-y-promociones/folleto-alimentaci%C3%B3n-canarias/OCFolletocanarias?sortBy=favorite).
- [Folletos oficiales](https://www.compraonline.alcampo.es/content/folletos-alcampo).
