# Viabilidad de Hiperber en QuéFalta

Auditoría del 7 de octubre de 2026 sobre `https://tienda.hiperber.com` y el
checkout actual de QuéFalta. **La integración es técnicamente viable mediante
un espejo de catálogo por centro, aprovechando el patrón de BM. La publicación
queda condicionada a resolver el acceso y la reutilización de contenidos con
Hiperber, y a validar la calidad del catálogo completo.**

Las pruebas fueron consultas públicas de solo lectura, sin sesión, cookies,
credenciales de cliente ni acceso a Supabase. No se ha implementado Hiperber en
la app ni se ha programado una extracción recurrente. Evidencia estructurada:
[hiperber-audit-20261007.json](hiperber-audit-20261007.json).

## Acceso al catálogo

La tienda es una SPA Angular de Aktios. El HTML inicial no contiene el catálogo;
la API REST que utiliza la tienda responde directamente a consultas sin
autenticación. No hizo falta navegador headless para leer los datos.
La configuración pública identifica centro de referencia `16`, zona de entrega
`16D`, CP `03293`, canal `1`, moneda `EUR` e idioma `es`.
[Configuración de Hiperber](https://tienda.hiperber.com/config.json).

Rutas comprobadas bajo `https://tienda.hiperber.com/api/rest/V1.0`:

| Ruta | Información |
| --- | --- |
| `/shipping/area?shippingMethod=D,X,T,L&showDisableStore=false&zipCode=03293` | Centro y zona de entrega para un CP |
| `/shopping/category/menu` | Árbol de categorías |
| `/catalog/product?blockSize=20&offset=0&orderById=3` | Productos, total y continuación |
| `/catalog/product?blockSize=20&offset=20&orderById=3` | Segunda página |
| `/catalog/product?blockSize=20&offset=0&categories=99999` | Sección de ofertas |
| `/catalog/product/code/26161` | Ficha individual y EAN |

El catálogo se consultó con `X-TOL-LOCALE: es`, `X-TOL-ZONE: 16`,
`X-TOL-CHANNEL: 1`, `X-TOL-CURRENCY: EUR` y `X-TOL-SHIPPING-ZONE: 16D`,
cambiando centro y zona en las otras ubicaciones. Son cabeceras de contexto,
no una clave de acceso. Esta API de la tienda no constituye un contrato público
de integración ni garantiza continuidad o estabilidad.

## Cobertura y diferencias por centro

Los totales siguientes son registros declarados por la API, antes de depurar
nombres vacíos y otras anomalías. No son productos ya importados en QuéFalta.

| Centro | Zona | CP comprobados con cobertura | Catálogo | Sección de ofertas |
| --- | --- | --- | ---: | ---: |
| Elche Crevillente Central | `16D` | 03293, 03201 | 6.972 | 1.284 |
| Novelda 3 | `81-D` | 03600, 03801, 02660, 46870 | 7.043 | 1.300 |
| Alfaz del Pi | `62D` | 03501, 03590 | 7.090 | 1.301 |

Los CP `03001`, `03181`, `46001` y `28001` devolvieron un listado vacío de
zonas habilitadas. Esto describe esos CP, no toda su provincia. El CP `02660`
corresponde a Caudete y `46870` a Ontinyent: un centro ubicado en Alicante puede
servir localidades de otra provincia o comunidad.

Hiperber anunció en enero de 2025 la ampliación a localidades como Caudete y
Ontinyent, además de Elche y Marina Baixa. Su anuncio hablaba de más de 9.000
referencias; ese dato histórico no debe sustituir los totales actuales por
centro. [Anuncio oficial de cobertura](https://hiperber.com/ampliamos-nuestro-servicio-de-tienda-online-con-el-comienzo-del-ano-2025/).

Para QuéFalta, la disponibilidad y el precio deben resolverse por CP y centro.
No conviene habilitar toda la Comunidad Valenciana o toda una provincia por
haber encontrado un solo CP atendido. La muestra detectó diferencias en
cantidad de registros y en precios unitarios y promociones entre centros.
El filtro territorial podría contemplar `ES-VC` y `ES-CM`, pero siempre sujeto
a la cobertura postal validada.

## Calidad y significado de los datos

- **Paginación:** pedir `blockSize=100` devolvió 20 registros. Dos páginas con
  `offset=0` y `offset=20` devolvieron 40 códigos únicos en cada uno de los dos
  centros examinados con ese recorrido. Debe paginarse por `offset`, verificar
  duplicados y confrontar el total descargado con `totalCount`. Un recorrido
  simple de unas 7.000 filas supondría unas 350–355 peticiones por centro.
- **Categorías:** los árboles de Elche y Novelda tienen 208 nodos, profundidad
  máxima 5 y 12 raíces: Ofertas más 11 departamentos. El cliente necesita
  agrupar esa profundidad en su navegación N1/N2 y pasar la categoría principal
  al añadir a la cesta.
- **Campos disponibles:** código estable, ID interno, EAN, nombre, marca,
  imágenes, URL, categorías, precio, precio por medida, disponibilidad,
  señal de novedad, límites de cantidad y promociones con fechas. Su presencia
  no garantiza calidad ni cobertura total.
- **Nombres vacíos:** los primeros 40 registros con `orderById=3` tenían el
  nombre vacío en Elche y Novelda. La ficha `89422` también lo devolvió vacío;
  cambiar `es` a `ES` no lo resolvió. En cambio, las 20 filas consultadas con
  `orderById=1` tenían nombre, precio, URL de imagen y EAN. No debe publicarse
  una fila sin nombre ni sustituirlo por un dato inventado. Hay que medir el
  alcance en el catálogo completo y excluir o recuperar las filas afectadas.
- **Importes:** pese a llamarse `centAmount`, el campo está expresado en euros:
  el agua `69047` devuelve `0.35` y la web muestra 0,35 €. Dividirlo entre 100
  sería un error. `centUnitAmount` representa el precio por medida.
- **Anomalía de unidad:** la cerveza de 330 ml `85661` cuesta 0,28 € en ambos
  centros, pero su €/L es `0.85` en Elche y `8.48` en Novelda. El segundo valor
  es incoherente con el envase anunciado. El comparador debe omitir o validar
  unidades incoherentes; no corregirlas por una regla global sin evidencia.
- **EAN e imágenes:** son buenas bases para comparar productos y enriquecer
  fichas. Quedan pendientes la validación de GTIN, códigos locales, packs y
  descarga efectiva de todas las imágenes. La auditoría comprobó campos y
  algunas imágenes visibles, no la disponibilidad de cada URL del catálogo.

## Ofertas y nutrición

Hay descuentos directos con `PRICE` y `OFFER_PRICE`, además de promociones de
varias unidades con condiciones en `offers[]`. El agua `69047`, por ejemplo,
incluye un descuento del 14 % en la tercera unidad y conserva el precio normal
de 0,35 €. La etiqueta genérica «OFERTA» no basta para convertir una promoción
de lote en un descuento del precio individual.

La integración debe conservar todas las promociones relevantes, sus fechas,
centro, requisitos y modalidad; distinguir descuentos directos, lotes y
beneficios de club; y filtrar las campañas caducadas. Una variación entre
sincronizaciones no constituye por sí sola una oferta. Los recuentos de la
tabla son los de la sección del retailer y no una auditoría de vigencia de cada
campaña.

La configuración anuncia JSON nutricionales por EAN en
`https://cdn-hiperber.aktiosdigitalservices.com/tol/hiperber/media/product/nutritional-info/{ean}.json`.
La muestra de cuatro fichas produjo estos resultados:

| Código | Producto | JSON nutricional |
| --- | --- | --- |
| 26161 | Tomate Triturado 400G | 200, tabla nutricional estructurada |
| 69047 | Agua Mineral Natural Botella 1L | 404 |
| 80210 | Sopa de Pollo con Fideos 72G | 404 |
| 89422 | Ficha sin nombre | 404 |

El tomate usa una estructura compatible con la fuente nutricional de BM y
contiene valores de energía, grasas, saturadas, hidratos, azúcares, fibra,
proteínas y sal. Su lista de ingredientes está vacía. La web de la sopa muestra
un aviso de información adicional no disponible. Esto permite una ficha
nutricional opcional, pero no prometer ingredientes, alérgenos o nutrición para
todo el surtido. Una lista vacía de alérgenos no debe interpretarse como una
declaración verificada de ausencia de alérgenos.

## Acceso automatizado y reutilización

El [robots.txt](https://tienda.hiperber.com/robots.txt) indica `Disallow: /api/`
para agentes generales. Aunque las consultas responden, el operador pide
excluir la API del rastreo. No es una licencia de uso ni una barrera de
autenticación; es una limitación operativa relevante para un sync recurrente.

Los [términos de Hiperber](https://hiperber.com/terminos-y-condiciones/),
apartado 4, reservan derechos sobre contenidos y marcas y condicionan la copia
o distribución para fines públicos o comerciales a autorización previa por
escrito. El apartado 7 también establece condiciones restrictivas para enlaces.
Antes de lanzar, conviene obtener un acuerdo que cubra acceso automatizado,
precios y catálogo, fotos, logo, enlaces a fichas, frecuencia y atribución,
o evaluar con asesoría el alcance de esas cláusulas para la integración.
Esta auditoría no determina su validez jurídica ni presupone que la API abierta
autorice el uso comercial.

## Encaje con QuéFalta y trabajo necesario

Hiperber no figura actualmente en `CatalogStore` ni en `CATALOG_STORES`.
La base más próxima es BM: `scripts/lib/bm.mjs`, `scripts/lib/bm-sync.mjs`,
`scripts/sync-bm.mjs`, su API de cliente y su modelo multizona.
La similitud permite compartir utilidades de Aktios, pero no copiar sin revisar
el clasificador de ofertas, la cobertura provincial de BM o sus guardarraíles.

Una implementación completa requeriría:

1. Un explorador reproducible y un barrido completo autorizado por cada centro,
   con control de calidad y mapa de CP. Validar también la recogida en tienda:
   las pruebas postales solo devolvieron entrega a domicilio.
2. Un sync con límites de frecuencia, reintentos acotados, abortado ante bloqueo,
   validación de totales y protección contra despublicar un catálogo tras una
   descarga parcial. Registrar su estado y dejar la nutrición como opcional.
3. Migraciones para productos, categorías, centros, cobertura postal y precios
   por ubicación, aprovechando el historial zonal existente. Lectura con RLS y
   vistas que respeten permisos; escritura exclusivamente desde el backend.
   Aplicar y verificar las migraciones antes de que el cliente las consulte.
4. Tipo, logo autorizado, adaptador de producto, reconocimiento de artículos de
   cesta, selector de supermercados y filtro de cobertura. Integrar catálogo,
   búsqueda paginada, categorías, ficha, favoritos, novedades, ofertas y cambios
   de precio en la misma ubicación efectiva.
5. Extensión del comparador actual: fuente, filtros zonales, GTIN, caché,
   embeddings y precios/unidades validados. Reejecutar solo el SQL histórico de
   `similar_products.sql` no sustituye las extensiones actuales del comparador
   híbrido usadas para BM y El Jamón.
6. Typecheck, pruebas de precios/promociones/cobertura, un sync completo de
   validación y recorrido nativo. La auditoría actual pasa `npx tsc --noEmit`.

**Prioridad propuesta:** resolver primero el acuerdo de acceso y derechos;
después validar el catálogo completo y desplegar catálogo/cesta/ofertas por CP;
finalmente incorporar comparador e información nutricional donde haya datos.
La complejidad técnica es media, menor que una extracción basada en navegador,
pero superior a añadir un catálogo nacional único. No se ha medido el tiempo
de un sync completo ni la fiabilidad de una ejecución programada.
