# Comparador estricto de productos: auditoría y plan de mejora

> Estado: documento de análisis. No se ha implementado ninguna modificación.
>
> Fecha de la auditoría: 2 de septiembre de 2026.
>
> Objetivo: dejar una especificación completa y retomable para convertir
> «Buscar productos más económicos» en un comparador de alta confianza.
>
> Plan maestro de ejecución: [PROYECTO-COMPARADOR-ESTRICTO.md](PROYECTO-COMPARADOR-ESTRICTO.md).
> Esta auditoría conserva la evidencia y el razonamiento; el proyecto CE-1 fija
> las decisiones finales, las fases F0–F8 y sus criterios de aceptación.
> Actualización de entorno: CE-ENV-001 (plan v1.1) autoriza trabajar directamente
> en el Supabase actual. Ya no se exige un proyecto separado ni esperar a F8
> para cambios de BD; F8 mantiene el control de activación para usuarios.

## 1. Resumen ejecutivo

El comparador actual tiene una base técnica potente —catálogo agregado,
embeddings, búsqueda léxica, caché y normalización parcial de precios—, pero
todavía no es suficientemente estricto para afirmar que una alternativa es
realmente comparable y más económica.

El problema principal no es encontrar candidatos. Es decidir cuándo dos
productos son suficientemente equivalentes como para comparar sus precios sin
engañar al usuario. En producción existen falsos positivos de identidad,
cantidad, formato y precio. Aumentar el número de candidatos o bajar umbrales de
similitud elevaría la cobertura, pero también el riesgo.

La decisión recomendada es separar claramente dos conceptos:

- **Alternativa estrictamente comparable:** misma identidad funcional, mismas
  variantes relevantes y mismo formato comercial. Puede recibir el distintivo
  «Más económico».
- **Producto parecido:** puede servir como descubrimiento, pero no debe recibir
  un distintivo de ahorro ni provocar el mensaje «Tu opción actual es la más
  económica».

La regla de confianza debe ser:

> Si falta un dato necesario para demostrar la comparabilidad, el sistema se
> abstiene. La ausencia de datos nunca debe funcionar como permiso para comparar.

Para mostrar «Más económico», una pareja debe superar cinco puertas
independientes:

1. identidad de producto;
2. cantidad y formato;
3. precio y base de precio válidos;
4. tienda y ubicación aplicables al usuario;
5. frescura y disponibilidad suficientes.

La similitud vectorial o textual solo debe recuperar candidatos. Nunca debe
decidir por sí sola que dos productos son equivalentes.

## 2. Decisiones de producto recomendadas

### 2.1. Mismo formato significa misma estructura, no solo mismo total

El sistema debe guardar y comparar la estructura completa del envase:

- Agua de 1 L: comparar con otra botella de 1 L.
- Agua de 1 L: no comparar con un pack de 6 × 1 L.
- Yogur de 6 × 125 g: comparar con otro 6 × 125 g.
- Yogur de 6 × 125 g: no comparar con 1 tarrina de 750 g, aunque el peso total
  sea el mismo.
- Yogur de 6 × 125 g: no comparar con 4 × 125 g, 8 × 125 g o 6 × 120 g.
- Patatas prefritas ultracongeladas de 2 kg: comparar con el mismo tipo de
  patata ultracongelada en un envase de 2 kg.
- Patatas de 2 kg: no comparar con 500 g, 600 g, 750 g, 1 kg o 2,5 kg.
- Patatas frescas de 2 kg: no comparar con patatas prefritas congeladas de
  2 kg. La cantidad coincide, pero el producto no.

La firma de formato propuesta sería equivalente a:

- agua individual de 1 L → `volume:single:1x1L`;
- agua en pack de 6 botellas de 1,5 L → `volume:multipack:6x1.5L`;
- yogur 6 × 125 g → `mass:multipack:6x125g`;
- patatas congeladas, bolsa 2 kg → `mass:single:1x2kg`.

### 2.2. Carne, charcutería y embutidos

La recomendación no es una exclusión permanente por categoría, sino una
exclusión estricta por **modo de venta**.

Deben quedar fuera del comparador de ahorro:

- productos al corte;
- productos a granel;
- piezas de peso aproximado;
- bandejas de peso variable;
- referencias cuyo precio se expresa por kg pero cuyo peso real de compra no
  está disponible;
- productos con señales contradictorias de cantidad.

Ejemplos reales del catálogo son «jamón ... al corte», «pieza 7,5 kg aprox.»,
«paleta ... peso aproximado» o cortes de carnicería sin peso de envase. En estos
casos puede compararse informativamente el precio por kg en el futuro, pero eso
debe ser una experiencia separada: **comparador de mostrador o precio por peso**,
no «mismo formato más barato».

Sí podrían incorporarse más adelante:

- jamón loncheado de 200 g frente a jamón loncheado equivalente de 200 g;
- carne picada en bandeja fija de 500 g frente a otra bandeja fija de 500 g;
- salchichas del mismo tipo y formato, por ejemplo 6 unidades y 400 g.

Para el primer despliegue de la versión estricta conviene poner en cuarentena
toda carne, charcutería y embutidos. Después se reactivaría únicamente el
subconjunto de envase fijo cuando el clasificador de modo de venta y el parser
de cantidades hayan superado la evaluación.

## 3. Alcance y método de esta auditoría

Se ha revisado, sin escribir en producción:

- el flujo cliente de la funcionalidad;
- las RPC y migraciones del comparador;
- la construcción y publicación de embeddings;
- el parser actual de unidades y cantidades;
- la caché de parejas comparables;
- muestras y agregados del catálogo real;
- la calidad de precios por supermercado;
- el aislamiento posible mediante desarrollo local o Supabase Branching;
- extensiones e integraciones que podrían elevar la precisión.

Fuentes locales principales:

- [COMPARATIVA.md](COMPARATIVA.md);
- [CONTEXTO.md](CONTEXTO.md);
- [HANDOFF.md](HANDOFF.md);
- [catalog-embedding-unit.mjs](scripts/lib/catalog-embedding-unit.mjs);
- [sync-comparator-embedding-catalog.mjs](scripts/sync-comparator-embedding-catalog.mjs);
- [catalog.ts](src/api/catalog.ts);
- [SimilarProductsSection.tsx](src/components/SimilarProductsSection.tsx);
- migraciones del comparador en [supabase/migrations](supabase/migrations);
- operación del pipeline en
  [README-comparator-embedding-pipeline.md](supabase/ops/README-comparator-embedding-pipeline.md).

Las cifras de catálogo y caché son una fotografía viva de producción en la
fecha indicada. Pueden cambiar con los syncs y con la construcción perezosa de
la caché.

## 4. Funcionamiento actual

El flujo actual es, de forma simplificada:

`SimilarProductsSection`
→ `src/api/catalog.ts`
→ `catalog_cheaper_products_v7`
→ `comparator_internal.catalog_cheaper_products_v5`
→ caché / `catalog_cheaper_products_v3`
→ candidatos exactos, vectoriales y léxicos
→ filtro de identidad
→ ranking de precio
→ hasta dos resultados por tienda.

### 4.1. Recuperación de candidatos

La recuperación combina:

- GTIN exacto cuando está disponible;
- embeddings con pgvector/HNSW;
- similitud léxica con pg_trgm;
- fusión de señales y umbral híbrido;
- filtros por unidad canónica, atributos y algunas variantes.

El enfoque híbrido es razonable para encontrar candidatos. El problema aparece
al convertir un candidato semántico en una afirmación comercial.

### 4.2. Identidad

El filtro actual usa familia y variantes, pero la familia materializada solo
está disponible en una parte pequeña del catálogo. Cuando ambos productos
carecen de familia, la compatibilidad puede seguir pasando. En una muestra
revisada, casi la mitad de las parejas visibles compatibles tenía la familia
ausente en ambos lados.

Esto explica errores como:

- cereales frente a galletas;
- panga frente a boquerón;
- chocolate frente a galletas;
- mango frente a mochi;
- arándanos frente a arándanos rojos deshidratados;
- papel higiénico frente a toallitas húmedas;
- tomate para ensalada frente a ensalada preparada;
- croissant frente a tarta de queso y chocolate.

### 4.3. Cantidad

El filtro actual:

- exige la misma unidad canónica cuando ambas existen;
- acepta relaciones de cantidad muy amplias, aproximadamente entre 1/12 y 12;
- deja pasar la pareja cuando una o ambas cantidades son desconocidas.

Para un comparador estricto, las dos últimas reglas son incompatibles con el
objetivo.

### 4.4. Precio

El ranking mezcla actualmente dos comportamientos:

- algunas tiendas se ordenan por precio total;
- otras se ordenan por precio por unidad.

Esto puede mezclar bases distintas entre supermercados. Además, una fuente con
precio por unidad corrupto puede ganar sistemáticamente el ranking.

En una comparación de formato exactamente igual, el orden por precio total y
por precio normalizado debería coincidir. Por tanto, la propuesta es:

1. verificar que ambos productos tienen la misma firma de formato;
2. usar el precio total de compra para determinar cuál es más barato;
3. usar el precio por kg, L o unidad como control de consistencia;
4. abstenerse si ambos precios no cuadran.

### 4.5. Ubicación y cobertura

La selección de tiendas del usuario se respeta, pero el núcleo del comparador
trabaja principalmente con el catálogo global. Un resultado puede no
corresponder al establecimiento, código postal o región concretos del usuario.

Tampoco debe afirmarse «Tu opción actual es la más económica» si:

- alguna tienda elegida no tiene datos aplicables a la zona;
- su precio está caducado;
- la referencia está sin stock;
- la búsqueda no logró evaluar productos comparables.

La redacción honesta en esos casos es:

> No hemos encontrado opciones estrictamente comparables más económicas.

## 5. Fotografía cuantitativa del problema

### 5.1. Cobertura estructurada del catálogo

| Señal | Productos publicados con señal |
|---|---:|
| Productos publicados | 198.449 |
| Embedding presente | 198.429 |
| Unidad canónica | 186.791 |
| Cantidad base | 145.824 |
| GTIN | 43.738 |
| Familia materializada | 4.863 |

Conclusiones:

- la cobertura vectorial es excelente;
- el cuello de botella no es el embedding;
- unos 52.625 productos publicados no tienen cantidad base;
- la familia estructurada solo cubre alrededor del 2,5 % del catálogo;
- el GTIN ayuda, pero no cubre la mayoría ni resuelve equivalencias de marca
  blanca.

### 5.2. Parejas comparables de la caché

En la fotografía final de la auditoría había:

- 16.755 parejas con relación `comparable`;
- 44 parejas con relación `identico`.

Sobre las 16.755 parejas comparables:

| Estado de cantidad | Parejas | Proporción |
|---|---:|---:|
| Cantidad conocida en ambos productos | 3.657 | 21,8 % |
| Cantidad desconocida en uno o ambos | 13.098 | 78,2 % |
| Relación dentro de ±2 %, entre las conocidas | 1.405 | 38,4 % |
| Fuera del intervalo 0,5×–2×, entre las conocidas | 1.186 | 32,4 % |

Percentiles de la relación cantidad objetivo / cantidad origen, cuando ambas
cantidades existen:

- p10: 0,300;
- p25: 0,650;
- mediana: 1,000;
- p75: 1,182;
- p90: 3,788.

Una mediana de 1 oculta una distribución muy insegura. El dato decisivo es que
el 78,2 % no puede demostrar la relación de cantidad y que casi un tercio de las
parejas conocidas está por debajo de la mitad o por encima del doble.

### 5.3. Confianza semántica

La confianza de las parejas comparables se concentraba aproximadamente en:

- p10: 0,624;
- p25: 0,653;
- mediana: 0,700;
- p75: 0,761;
- p90: 0,817.

Un umbral global no separa bien equivalencias de falsos positivos. Hay parejas
incorrectas con puntuaciones altas porque comparten marca o muchas palabras.
También hay equivalencias reales con redacción distinta y puntuación más baja.

Por tanto, la confianza semántica debe ser una señal de recuperación y de
ranking, no una puerta comercial única.

## 6. Auditoría profunda de cantidad y formato

### 6.1. Qué conserva hoy el modelo

La tabla de embeddings conserva principalmente:

- `canonical_unit`;
- `quantity_base`.

El parser reconoce algunos patrones `cantidad × tamaño` y calcula el total.
Sin embargo, no conserva por separado:

- número de unidades;
- tamaño de cada unidad;
- tipo de envase;
- si es envase individual o multipack;
- si el peso es fijo, aproximado o variable;
- fuente y confianza de la cantidad;
- conflictos entre nombre, formato y precio.

Como consecuencia, 6 × 125 g y una tarrina de 750 g terminan representados como
0,75 kg. La estructura comercial se pierde.

### 6.2. Patrones que el parser no resuelve de forma fiable

Ejemplos:

- `6 uds. × 1,5 L`: el texto intermedio entre el número y la multiplicación
  puede impedir el parseo;
- `paq. de 6 botellas de 50 cl`: puede capturarse 50 cl como si fuera el total,
  en vez de 3 L;
- yogures descritos en ml mientras la unidad canónica es kg: la cantidad puede
  quedar nula;
- peso indicado en un campo de packaging pero ausente en el nombre: el dato no
  siempre llega a `quantity_base`;
- cantidades aproximadas: el parser no distingue nominal, estimada y real.

El catálogo contiene al menos:

- 10.031 referencias con un patrón explícito de multipack;
- 5.359 con una señal directa de `n × tamaño`;
- 11.079 con lenguaje de pack y tamaño, con solapamientos entre grupos;
- 628 referencias con multipack explícito y cantidad base todavía ausente.

### 6.3. Agua

La muestra de agua es especialmente clara. Un mismo origen puede recibir
candidatos de:

- 330 ml;
- 500 ml;
- 750 ml;
- 1 L;
- 1,5 L;
- 2 L;
- 2,5 L;
- 3,14 L;
- 5 L;
- 6,25 L;
- 8 L;
- packs de 6 botellas de varios tamaños.

Los nombres de marca elevan mucho la similitud aunque el formato sea distinto.
Además:

- una referencia `6,25 L` puede compararse con `6 × 1,5 L`,
  `6 × 2 L` o `6 × 50 cl` si el objetivo no tiene cantidad parseada;
- se observó 500 ml frente a 6 L, una relación de 12× admitida por el filtro;
- `pack de 6 botellas de 50 cl` puede almacenarse erróneamente como 0,5 L.

Política:

- número de botellas exacto;
- volumen nominal por botella exacto tras normalizar unidades;
- tipo con gas/sin gas compatible;
- agua saborizada, mineral y bebidas funcionales no se mezclan;
- formato desconocido implica abstención.

### 6.4. Yogur

Se encontraron 510 parejas comparables cuyo origen contiene «yogur»:

| Estado | Parejas |
|---|---:|
| Total | 510 |
| Cantidad conocida en ambos | 152 |
| Cantidad desconocida | 358 |
| Relación dentro de ±2 % | 28 |
| Fuera del intervalo 0,5×–2× | 52 |

Entre las cantidades conocidas:

- solo el 18,4 % está dentro de ±2 %;
- el 34,2 % está por debajo de la mitad o por encima del doble;
- la relación mediana es 0,5.

Ejemplos reales:

- yogur griego natural 1 kg frente a 125 g;
- yogur griego 1 kg frente a pack 4 × 110 g;
- yogur 4 × 125 g frente a una tarrina de 125 g;
- yogur para consumo humano frente a «yogur natural para gatos»;
- incluso productos de bizcocho «de yogur» entran en el espacio de candidatos.

Política:

- familia exacta: yogur, postre lácteo, kéfir y alimento animal son familias
  distintas;
- tipo y base compatibles: griego/estándar, lácteo/vegetal, infantil, proteico;
- variantes importantes verificadas: azúcar añadido, edulcorantes, lactosa,
  grasa y sabor; «natural» no determina por sí solo el endulzado;
- `pack_count` exacto;
- `unit_content` exacto;
- `total_content` exacto como validación;
- masa y volumen no se convierten entre sí sin una equivalencia estructurada y
  fiable para ese producto.

### 6.4.1. Orden de palabras y diferencias de significado

La comprobación de «yogur griego» frente a «griego yogur» dio similitud por
trigramas de 1, puntuación léxica validada de 0,925 e identidad compatible. La
normalización actual ya tolera ese cambio de orden, aunque la puntuación
combinada no sea siempre idéntica para todas las redacciones.

Eso no implica que las variantes estén bien protegidas: el guard de identidad
también aceptó «yogur griego» frente a «yogur natural». Es una debilidad de esa
puerta, no prueba de que todos los filtros finales admitan siempre la pareja.

Decisión final:

- «yogur griego» y «griego yogur» representan el mismo tipo si el resto de
  atributos verificados coincide;
- griego y estándar son tipos distintos;
- sabor natural, azúcar añadido, edulcorantes y declaraciones como «sin
  azúcares añadidos» se guardan en campos separados;
- «natural» no significa automáticamente «sin azúcar añadido»: el catálogo
  contiene referencias como «griego natural con azúcar»;
- «sin azúcar» y «sin azúcares añadidos» no se intercambian por similitud;
- falta de información no significa ausencia de azúcar o edulcorantes;
- si el endulzado requerido no está demostrado, se abstiene.

Por tanto, no se comparará griego natural con griego azucarado basándose solo en
el nombre. El parser debe conservar negaciones y relaciones entre palabras;
ordenar todos los tokens y eliminar palabras cortas no es una política de
identidad suficiente. Los casos obligatorios están en la sección 18 del plan
maestro.

### 6.5. Patatas congeladas

La caché contiene ejemplos donde patatas ultracongeladas de Mercadona, sin
cantidad base, reciben candidatos de:

- 500 g;
- 600 g;
- 750 g;
- 1 kg;
- 2,5 kg;
- formatos gajo, corte fino, corte grueso, ondulado, clásico o rústico.

También aparecen confusiones con patatas de aperitivo y otros preparados.

La referencia «Patatas prefritas ... 2 kg» existe en el catálogo de DIA, pero
no basta con encontrar cualquier producto de patata de 2 kg. Deben coincidir:

- estado: congelado frente a congelado;
- preparación: prefrita frente a prefrita;
- corte o variante cuando sea relevante;
- peso de bolsa: 2 kg frente a 2 kg;
- modo de cocción especial cuando cambie materialmente el producto.

El origen Mercadona revisado tenía `canonical_unit=kg`, pero
`quantity_base=NULL`; su contenido de embedding solo indicaba «formato:
Paquete». Esto demuestra que no puede suponerse el tamaño a partir de la unidad
de precio.

### 6.6. Carne y embutidos

Una segmentación amplia por categorías de carne, carnicería, charcutería,
embutido y fiambre encontró, de forma orientativa:

| Señal | Productos |
|---|---:|
| Universo segmentado | 8.620 |
| Cantidad conocida | 6.236 |
| Cantidad desconocida | 2.384 |
| Categoría explícita «al corte» | 537 |
| Alguna señal textual de peso variable/al corte/pieza | 1.275 |

Los grupos se solapan y no constituyen todavía una taxonomía definitiva, pero
confirman que una exclusión por modo de venta es necesaria.

Política de lanzamiento:

1. cuarentena temporal de toda la familia;
2. clasificar `fixed_pack`, `variable_weight`, `by_weight`,
   `approximate_piece` y `unknown`;
3. reactivar únicamente `fixed_pack`;
4. exigir firma de formato exacta;
5. mantener el resto fuera del distintivo de ahorro.

## 7. Modelo de datos propuesto

No es necesario instalar otra base de datos. Postgres/Supabase puede soportar
este modelo. Conviene añadir una representación estructurada separada o
versionada, en vez de depender del texto del embedding.

Campos mínimos:

| Campo | Propósito |
|---|---|
| `quantity_dimension` | `mass`, `volume`, `count`, `length`, etc. |
| `canonical_unit` | kg, L, ud, m… |
| `total_content_base` | contenido total normalizado |
| `pack_count` | número de unidades internas |
| `unit_content_base` | contenido de cada unidad |
| `format_kind` | single, multipack, fixed_pack, variable_weight… |
| `sale_mode` | packaged, by_weight, by_unit, by_length… |
| `package_type` | botella, lata, brik, tarrina, bolsa, bandeja… |
| `format_signature` | firma canónica usada por el filtro |
| `quantity_source` | campo estructurado, nombre, packaging, GTIN externo… |
| `quantity_confidence` | confianza de extracción |
| `quantity_conflict` | discrepancia no resuelta entre fuentes |
| `net_weight_base` | peso neto cuando aplique |
| `drained_weight_base` | peso escurrido para conservas |
| `format_parser_version` | trazabilidad e invalidación |

Restricciones recomendadas:

- `pack_count >= 1`;
- si existe `pack_count` y `unit_content_base`, el total nominal debe cuadrar
  exactamente tras normalizar unidades con aritmética decimal;
- los conteos deben ser enteros;
- `variable_weight` no puede declararse a la vez `fixed_pack`;
- una firma no se publica si existe conflicto;
- el hash de metadatos de matching debe incluir toda la firma para invalidar la
  caché cuando cambie.

### 7.1. Jerarquía de fuentes

Orden recomendado:

1. dato estructurado del retailer;
2. dato verificado por GTIN;
3. packaging estructurado;
4. nombre comercial;
5. inferencia a partir de precio total / precio unitario, solo como validación;
6. modelo automático offline, únicamente como propuesta revisable.

No debe aplicarse «la fuente de mayor prioridad gana» a ciegas. Si dos fuentes
fiables discrepan, se conserva el conflicto y el producto se abstiene.

### 7.2. Igualdad nominal, sin tolerancia comercial

La decisión final de CE-1 sustituye la propuesta inicial de tolerancia genérica
del 0,5 %: los tamaños nominales deben ser iguales.

- `pack_count`: igualdad entera exacta;
- peso/volumen por unidad y contenido total: igualdad nominal exacta;
- 1 L y 1000 ml: misma cantidad;
- 125 g y 0,125 kg: misma cantidad;
- 125 g y 124 g: distinto formato, aunque la diferencia sea pequeña;
- 6 × 125 g y 1 × 750 g: distinta estructura;
- una cantidad aproximada o una discrepancia entre fuentes implica abstención;
- no asumir un solo envase cuando falta el número de unidades.

La normalización decimal evita errores de representación, no autoriza unir
SKUs distintos. La tolerancia aritmética del precio unitario redondeado se
define por separado en el validador de precios y nunca modifica esta regla.

## 8. Política estricta por familia

| Familia/formato | Regla mínima para «Más económico» |
|---|---|
| Agua y bebidas | mismo tipo, gas/sin gas, pack y volumen por unidad |
| Yogur y postres | misma familia/variante, número de tarrinas y gramos por tarrina |
| Congelados | mismo producto/preparación, peso de bolsa y formato |
| Leche y bebidas vegetales | mismo tipo, pack y volumen por envase |
| Huevos | mismo tamaño/clase y mismo número de huevos |
| Papel higiénico | mismo subtipo y rollos; más adelante, hojas/longitud por rollo |
| Pañales | misma talla/tipo y mismo número de unidades |
| Cápsulas/dosis | mismo sistema o compatibilidad y mismo número de dosis |
| Conservas | misma preparación y formato; definir neto frente a escurrido |
| Limpieza | mismo uso/concentración y misma cantidad o número de dosis |
| Carne/charcutería de envase fijo | cuarentena inicial; después firma exacta |
| Al corte/granel/peso variable | excluido del distintivo de ahorro |
| Cantidad o formato desconocido | abstención |

Los atributos que cambian materialmente el producto deben ser puertas duras:

- fresco, refrigerado, congelado o conserva;
- entero, desnatado, semidesnatado;
- con o sin azúcar;
- con o sin lactosa/gluten cuando se anuncia como variante;
- ecológico cuando sea parte explícita de la elección;
- especie, corte y preparación en carne/pescado;
- sabor;
- alimento humano frente a alimento para mascotas;
- producto listo para comer frente a ingrediente base.

## 9. Arquitectura de matching propuesta

### 9.1. Separar recuperación y decisión

Pipeline:

1. **Identidad exacta:** GTIN igual y válido.
2. **Recuperación amplia:** vector, léxico, marca, categoría y taxonomía.
3. **Clasificación de familia:** familia materializada y versionada.
4. **Compatibilidad de variantes:** puertas duras por familia.
5. **Compatibilidad de formato:** firma completa y conocida.
6. **Validador de precio:** total, base, coherencia, promoción y frescura.
7. **Aplicabilidad local:** tienda, zona, stock y fecha.
8. **Reranking:** escoger el más barato entre los que ya son comparables.
9. **Abstención:** cero resultados si ninguna pareja supera todas las puertas.

La búsqueda vectorial debe poder recuperar muchos candidatos. El reranker
estructurado decide. No se debe bajar el umbral final para compensar problemas
de recall.

### 9.2. Niveles de relación

Conviene modelar explícitamente:

- `identical_trade_item`: GTIN idéntico;
- `equivalent_same_format`: equivalente funcional y formato idéntico;
- `similar_different_format`: parecido, pero no comparable en precio total;
- `incompatible`;
- `unknown`.

Solo los dos primeros son elegibles para el distintivo de ahorro, después de
superar también formato, precio, zona y vigencia. Ni el GTIN ni una aprobación
manual permiten saltarse esos controles. El tercero puede aparecer en una
sección futura «Productos parecidos», visualmente separada y fuera de CE-1.

### 9.3. Familia desconocida

La regla actual que permite que dos familias nulas sean compatibles debe
desaparecer del camino estricto. CE-1 exige familia conocida y atributos
obligatorios verificados. Un GTIN o un clasificador pueden ayudar a completar
la evidencia, pero no son una excepción a la política. Si la familia sigue
desconocida, se abstiene.

### 9.4. Migración pendiente de HNSW

Existe trabajo local pendiente para mejorar el recall filtrado de HNSW mediante
`iterative_scan` y un umbral más bajo en algunos casos. Esa mejora puede ser
útil para recuperar candidatos, pero **no resuelve la precisión**:

- no añade formato;
- no arregla precios;
- no elimina el paso con familias nulas;
- un umbral más bajo puede añadir candidatos incorrectos.

No debe desplegarse como si fuera la solución del comparador estricto. Primero
se necesitan las puertas estructuradas.

## 10. Integridad de precios

### 10.1. Error real de Froiz

Se detectó un patrón grave en Froiz:

- «Galletas ... 225 g»: precio total 2,95 €, pero precio por unidad 0,225
  etiquetado como kg;
- «Oreo 246 g»: precio total 3,30 €, pero precio por unidad 0,246.

El supuesto precio por kg es en realidad el peso del paquete. Esto hace que
Froiz parezca artificialmente barato.

Indicadores de la anomalía en la fotografía auditada:

- 6.897 productos publicados de Froiz;
- 6.624 con valor de precio por unidad;
- mediana aproximada: 0,36, frente a medianas de otros supers en el rango
  aproximado 5,5–14,9;
- 2.929 productos en base kg por debajo de 0,50;
- 4.491 casos donde el precio unitario era menor que precio total / 5.

En la caché, Froiz intervenía en cientos de parejas y podía generar decenas de
distintivos falsos incluso después del top por tienda.

Política:

- bloquear una fuente/tienda del distintivo si falla controles de distribución;
- comprobar `cantidad implícita = precio_total / precio_por_unidad`;
- comparar la cantidad implícita con la firma del envase;
- no usar un precio unitario incoherente;
- no declarar ahorro si el precio total o la base no son fiables.

### 10.2. Bases obsoletas por tienda

El código mantiene excepciones históricas para Caprabo, Eroski e HiperDino que
usan precio total. Sin embargo, su cobertura actual de precio por unidad ya es
considerable. Las excepciones fijas por nombre de tienda deben sustituirse por
capacidades y validaciones de cada fila.

### 10.3. Promociones

El comparador debe distinguir:

- precio normal;
- promoción pública;
- promoción con tarjeta;
- compra mínima o 2×1;
- precio por suscripción;
- precio online frente a tienda.

Una oferta condicionada no debe ganar contra un precio normal sin mostrar la
condición y sin saber que el usuario puede cumplirla.

## 11. Ubicación, stock y frescura

Cada resultado debería llevar:

- supermercado y establecimiento/zona;
- código postal o área de aplicabilidad;
- fecha/hora de captura;
- estado de disponibilidad;
- tipo de precio;
- identificador de la fuente;
- nivel de confianza del dato.

Reglas:

- pasar la zona del usuario hasta la consulta final;
- no usar el catálogo global como prueba de precio local;
- no afirmar «más barato» con precio caducado;
- diferenciar «sin resultados» de «tienda no evaluada»;
- reservar «Tu opción es la más económica» para cobertura completa y válida.

## 12. Caché, latencia y cuota

Problemas actuales:

- la caché es perezosa y la primera consulta puede ser lenta;
- la ruta exacta también depende demasiado de que el embedding esté listo;
- una búsqueda gratuita puede consumirse antes de saber si hay resultados
  válidos;
- invalidar solo por contenido semántico no basta cuando cambia el formato;
- los timeouts pueden confundirse con ausencia de alternativas.

Mejoras:

- resolver GTIN exacto antes de exigir embedding;
- construir candidatos en segundo plano, no durante la experiencia del usuario;
- incluir `format_parser_version` y `format_signature` en los hashes de caché;
- separar «sin comparable» de error/timeout;
- consumir cuota solo cuando la respuesta final correcta incluye al menos un
  equivalente válido más económico; sin ahorro válido ofrecido, cero usos
  (CU-01 en [decisions.md](docs/comparator-strict/decisions.md));
- precalentar productos más consultados;
- monitorizar latencia p50/p95/p99 y tasa de abstención.

## 13. Experiencia de usuario

### 13.1. Mensajes

Evitar:

- «Tu opción actual es la más económica» si no se evaluó todo;
- «Más económico» si la equivalencia es solo semántica;
- ahorro sin explicar la base.

Preferir:

- «Mismo formato: 6 × 125 g»;
- «Misma botella: 1 L»;
- «Precio verificado en tu zona»;
- «No hemos encontrado opciones estrictamente comparables más económicas»;
- «Hay productos parecidos, pero con otro formato», en una sección separada.

### 13.2. Evidencia visible

Cada alternativa estricta debería mostrar:

- nombre e imagen;
- precio total;
- formato de origen y objetivo;
- razón de equivalencia;
- fecha y zona del precio;
- condiciones de promoción;
- supermercado.

### 13.3. Feedback

El reporte actual es demasiado genérico. Añadir motivos:

- no es el mismo producto;
- cantidad incorrecta;
- multipack incorrecto;
- variante o sabor incorrecto;
- precio incorrecto;
- tienda/zona incorrecta;
- producto no disponible;
- otro.

Ese feedback debe alimentar un conjunto de evaluación, no modificar
automáticamente la producción.

## 14. Extensiones e integraciones

### 14.1. Supabase ya instalado

La instancia ya dispone, entre otras, de:

- `vector`;
- `pg_trgm`;
- `unaccent`;
- `pg_cron`;
- `pgmq`;
- `pg_net`;
- Vault.

Son suficientes para ejecutar la arquitectura principal. El problema no se
soluciona instalando otra extensión de similitud.

### 14.2. Extensiones a considerar

| Extensión | Prioridad | Uso |
|---|---|---|
| `pgtap` | Alta en dev/CI | tests SQL de reglas, RLS, funciones y casos límite |
| `pg_jsonschema` | Condicionada al modelo | validar evidencia JSON si se adopta ese almacenamiento |
| `isn` | No añadir inicialmente | ya existe validación en `scripts/lib/gtin.mjs` |
| `hypopg` | Solo si hay necesidad medida | evaluar índices hipotéticos antes de crearlos |
| `index_advisor` | Solo si hay necesidad medida | apoyo al análisis de planes, no sustituto de medición |
| `pgroonga` | Baja/experimental | búsqueda multilingüe; no necesaria para el gate |
| `fuzzystrmatch` | Baja | señal léxica adicional, no juez de equivalencia |

Las extensiones justificadas pueden instalarse en el Supabase actual en la
fase correspondiente, después de revisar versión, permisos, impacto y
mantenimiento. Las pruebas deben ser acotadas y los ensayos destructivos
quedan fuera de los objetos compartidos. CE-000 y esta revisión documental no
instalan nada: autorizar el destino no elimina la evaluación de necesidad.

### 14.3. Integraciones de datos

Decisión consolidada en la fase F4 del proyecto:

1. **Fuentes estructuradas de cada retailer.** Prioridad obligatoria para
   packaging, precio y disponibilidad.
2. **Open Food Facts.** Ya integrado para nutrición en `src/api/openFoodFacts.ts`
   y `scripts/enrich-bonarea-off.mjs`. Evaluar una ampliación offline de campos,
   no una instalación nueva. El `off_code` nutricional puede pertenecer a una
   unidad de un multipack: no convertirlo en GTIN ni formato del pack vendido.
3. **Verified by GS1 / GTIN.** Piloto opcional para identidad exacta, sujeto a
   acceso, coste y cobertura reales; no es una fuente de precios.
4. **GS1 GPC/GDM.** Referencia posible para taxonomía y atributos comunes;
   comprobar condiciones y utilidad antes de adoptarla.
5. **Clasificador offline adicional.** Diferido: solo como propuesta revisable
   si aporta cobertura sin degradar precisión.

Ninguna integración es requisito de lanzamiento. Debe superar el piloto,
revisión de licencia, presupuesto, desconexión y mejora medible definidos en
la sección 6 del plan maestro. Los conflictos no se ocultan escogiendo
automáticamente la fuente preferida.

Fuentes de referencia:

- [Supabase Branching](https://supabase.com/docs/guides/deployment/branching);
- [Entornos y despliegue en Supabase](https://supabase.com/docs/guides/deployment);
- [pgvector](https://github.com/pgvector/pgvector);
- [Verified by GS1](https://www.gs1.org/services/verified-by-gs1);
- [GS1 Global Product Classification](https://www.gs1.org/standards/gpc);
- [Open Food Facts API](https://openfoodfacts.github.io/openfoodfacts-server/api/);
- [pgTAP](https://pgtap.org/).

## 15. Evaluación antes de implementar

### 15.1. Dataset

Crear un conjunto etiquetado de 5.000–10.000 parejas, estratificado por:

- supermercado;
- familia;
- precio;
- presencia/ausencia de GTIN;
- cantidad conocida/desconocida;
- single/multipack;
- peso fijo/variable;
- positivos fáciles;
- negativos difíciles con nombres casi iguales;
- productos de marca y marca blanca.

Familias mínimas:

- agua;
- leche;
- yogur;
- patatas congeladas;
- papel higiénico;
- huevos;
- conservas;
- limpieza;
- carne/charcutería;
- alimentos de mascota.

Separar por entidad, no aleatoriamente por pareja, para evitar que el mismo
producto aparezca en train y test.

### 15.2. Tests deterministas de formato

Casos obligatorios:

| Origen | Candidato | Resultado |
|---|---|---|
| agua 1 × 1 L | agua 1 × 1 L | aceptar |
| agua 1 × 1 L | agua 6 × 1 L | rechazar |
| agua 6 × 1,5 L | agua 6 × 1,5 L | aceptar |
| agua 6 × 1,5 L | agua 9 × 1 L | rechazar |
| yogur 6 × 125 g | yogur 6 × 125 g | aceptar |
| yogur 6 × 125 g | yogur 1 × 750 g | rechazar |
| yogur 6 × 125 g | yogur 8 × 125 g | rechazar |
| yogur 6 × 125 g | yogur 6 × 120 g | rechazar |
| patata congelada 2 kg | patata congelada 2 kg | aceptar |
| patata congelada 2 kg | patata congelada 1 kg | rechazar |
| patata fresca 2 kg | patata congelada 2 kg | rechazar |
| jamón 200 g fijo | jamón 200 g fijo equivalente | aceptar tras cuarentena |
| jamón al corte | jamón 200 g | rechazar |
| cantidad desconocida | cualquier cantidad | abstenerse |

### 15.3. Métricas

Medir por separado:

- precisión de parejas elegibles;
- cobertura;
- precisión del distintivo «Más económico»;
- tasa de abstención;
- recall de equivalentes reales;
- tasa de cantidad/formato desconocido;
- coherencia del precio;
- latencia;
- cobertura local;
- tasa y motivo de reportes.

Objetivos de salida recomendados:

- precisión del distintivo ≥ 99,5 %;
- 100 % de parejas con base de precio compatible;
- 100 % de parejas con firma de formato conocida, incluido GTIN exacto;
- 100 % de desconocidos se abstiene;
- cero promociones condicionadas presentadas como precio normal;
- precio y zona verificables en cada resultado.

La cobertura es secundaria. Puede ampliarse después sin relajar la precisión.

## 16. Plan seguro para retomarlo

Trabajar «cuando haya menos tráfico» reduce el impacto de una migración, pero no
crea aislamiento. El usuario ha autorizado trabajar directamente en el Supabase
actual; se sustituyen las restricciones de backend separado por controles de
destino, permisos, migraciones, lotes, carga y recuperación. La app publicada
no pasa al nuevo comparador hasta su activación gradual en F8.

La propuesta inicial A–F queda sustituida por la secuencia obligatoria del
[plan maestro CE-1](PROYECTO-COMPARADOR-ESTRICTO.md):

| Fase | Resultado |
|---|---|
| F0 | Contrato y baseline reconciliados |
| F1 | Operación segura en el Supabase actual |
| F2 | Dataset etiquetado y evaluación independiente |
| F3 | Identidad, formato y procedencia |
| F4 | Decisión medida sobre integraciones |
| F5 | Precio, disponibilidad y ubicación verificables |
| F6 | Motor estricto, API y caché |
| F7 | Interfaz y validación final |
| F8 | Activación gradual para usuarios y estabilización |

Cada fase tiene tareas, entregables y un gate: no se inicia la siguiente sin
acta de aceptación. Las migraciones y pruebas remotas pueden ejecutarse desde
su fase en producción, con alcance y carga acotados. No se duplica automáticamente
todo el tráfico real. Local/CI sigue siendo útil para fixtures y pruebas intensas,
pero no es un backend separado obligatorio.

La retirada segura desactiva CE-1 o sus distintivos; no fuerza a la interfaz
nueva a presentar resultados legacy como si fueran estrictos. `v7` permanece
sin modificar para clientes anteriores. La expansión a otras familias,
mostrador o cesta queda fuera del lanzamiento inicial.

## 17. Observabilidad necesaria

Registrar sin datos personales innecesarios:

- versión de RPC;
- versión de parser/taxonomía;
- relación elegida;
- puertas superadas y motivo de abstención;
- firma de formato de ambos lados;
- origen de cantidad;
- base de precio;
- zona/frescura;
- latencia;
- si se mostró el distintivo;
- feedback del usuario.

Dashboards:

- precisión estimada y reportes por familia/tienda;
- productos con cantidad desconocida;
- conflictos de packaging;
- anomalías de precio por fuente;
- cobertura por zona;
- ratio de caché hit/miss;
- tiempo de primera consulta;
- abstenciones por motivo.

## 18. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Bajar el umbral para ganar cobertura | recuperación amplia + gate estructurado |
| Formato ausente | abstención y cola de enriquecimiento |
| Parser incorrecto | fuente, confianza, conflicto y dataset etiquetado |
| Precio corrupto | controles estadísticos y validación precio/cantidad |
| Precio no local | zona obligatoria y mensaje de cobertura |
| Caché obsoleta | hash de formato, precio, taxonomía y versión |
| Embedding no listo | ruta exacta/estructurada independiente |
| Migración con impacto | destino verificado, cambios aditivos, canario, límites y reversión; RPC nueva y flag |
| Recursos compartidos | medir CPU/I/O/locks/latencia y parar jobs CE-1 ante degradación; un esquema privado no aísla recursos |
| Falso «más barato» | badge solo tras cinco puertas |
| Exceso de exclusión | ampliar familia por familia, nunca relajar globalmente |

## 19. Decisiones cerradas y ratificaciones de F0

El plan maestro ya fija: igualdad nominal exacta, separación de variantes,
cuarentena inicial de carne/embutidos, abstención ante datos obligatorios
desconocidos y prohibición de afirmar el mínimo global del mercado.

CE-003 registra tres familias piloto, lista principal solo con ahorros estrictos,
máximo dos resultados por tienda y CU-01: un uso solo si la respuesta final
correcta incluye al menos un equivalente válido más económico. Sin ahorro
válido ofrecido, cero usos; esta política aún no está implementada.
CE-004 fija tiendas/zonas, presupuesto y responsables. Siguen pendientes la
antigüedad máxima propuesta de 24 h y las métricas de aceptación (CE-005),
además de la matriz de campos obligatorios que se implementará en F3.

El peso neto/escurrido ambiguo y los envases fijos de carne se dejan para una
ampliación con política específica, no como excepciones implícitas. La muestra
usará catálogo real y fixtures/cuentas de prueba identificados; no se exportan
perfiles ni listas ni se insertan productos falsos en los catálogos publicados.

## 20. Conclusión

El mejor comparador no es el que siempre devuelve algo. Es el que distingue
entre:

- sé que es el mismo formato y puedo comparar;
- es parecido, pero no puedo afirmar ahorro;
- no tengo datos suficientes.

La mejora prioritaria no es instalar un buscador más potente ni bajar el umbral
vectorial. Es construir una identidad comparable estructurada, conservar
pack_count y contenido por unidad, validar precios y convertir la abstención en
un resultado normal.

La política recomendada queda fijada así:

> Solo se marca como más económico un producto de identidad funcional
> compatible, misma firma de formato, precio válido, zona aplicable y datos
> suficientemente recientes. Lo desconocido se excluye.

Para carne y embutidos:

> Cuarentena inicial. Después, solo envases de peso fijo y firma verificable.
> Al corte, a granel, por pieza aproximada o con peso variable queda fuera del
> comparador estricto.

Esta auditoría es la evidencia de referencia. El estado de ejecución está en
[PROYECTO-COMPARADOR-ESTRICTO.md](PROYECTO-COMPARADOR-ESTRICTO.md) y el baseline
de CE-000 en [docs/comparator-strict/F0-baseline.md](docs/comparator-strict/F0-baseline.md).
CE-001 está completada: [inventario remoto y límites de la captura](docs/comparator-strict/CE-001-supabase-inventory.md).
CE-002 también está completada: [revisión de HNSW y modal](docs/comparator-strict/CE-002-independent-review.md).
No aprueba los parches tal cual ni los considera implementación de CE-1.
CE-003 está completada en [decisions.md](docs/comparator-strict/decisions.md),
con CU-01 corregida: no descontar sin una alternativa válida más económica
incluida en la respuesta final correcta. No cambia contadores ni producción.
CE-004 está completada: [presupuesto](docs/comparator-strict/budget.md) y
[matriz de fuentes/zonas](docs/comparator-strict/source-zone-matrix.md), con
cuatro tiendas candidatas y dos CP aceptados, sin certificar cobertura ni
contratar servicios. RV-01 confirmada: el propietario hará la segunda revisión
de los casos; aún no realizada. SC-01/BU-01 confirmadas: alcance y límites
aceptados. La siguiente tarea es CE-005, TTL y umbrales bajo CE-ENV-001.
No hace falta una rama remota;
las nuevas RPC no sustituyen automáticamente la utilizada por clientes actuales.
