# Comparativa de productos con embeddings

> Propuesta de arquitectura para mejorar la comparativa entre supermercados.
> Estado: análisis; **no implementado**. Complementa la especificación existente
> en [COMPARATIVA.md](COMPARATIVA.md).

## Resumen ejecutivo

Sí es posible usar embeddings para encontrar productos similares entre
supermercados y detectar alternativas más baratas u ofertas. En la auditoría
remota del 9 de agosto de 2026 se verificaron `vector` 0.8.0 y `pg_trgm` 1.6.
`pgmq`, `pg_cron` y `pg_net` están disponibles en Supabase, pero **no están
instaladas actualmente en el proyecto**.

Los embeddings no deben decidir por sí solos que dos productos son equivalentes:
son excelentes para **encontrar candidatos**, pero pueden confundir variantes
importantes como «sin lactosa», «bio», «infantil», formatos o cantidades. La
solución recomendada es híbrida: datos estructurados y reglas como filtros,
búsqueda léxica y vectorial para recuperar candidatos, y un clasificador solo
para los casos ambiguos.

## Contexto actual de QuéFalta

- Hay 15 catálogos de supermercado, con 172.076 productos publicados en la
  fotografía remota del 9 de agosto de 2026.
- El catálogo conserva nombre, categoría, precio total, precio por unidad y
  unidad canónica en las tablas de productos; varias cadenas aportan también
  marca, EAN o ficha rica.
- El comparador existente usa la RPC `similar_products` y coincidencia léxica
  con `pg_trgm`, filtrando por familia y ordenando por precio unitario.
- La comparativa está desactivada mediante `PRICE_COMPARISON_ENABLED = false`.
  La especificación y sus pendientes se encuentran en `COMPARATIVA.md`.
- En la base de datos, la versión desplegada de `similar_products` aún cubre
  seis cadenas; cualquier reactivación deberá actualizarla para cubrir los
  supermercados publicados.

## Estado remoto verificado — 9 de agosto de 2026

La auditoría se ejecutó contra el proyecto de producción `QueFalta`. No se
aplicaron migraciones ni se modificaron datos.

| Tienda | Publicados | Con precio unitario | GTIN global válido |
| --- | ---: | ---: | ---: |
| Alcampo | 15.724 | 15.706 | 2.596 |
| Aldi | 1.615 | 1.351 | 0 |
| Ametller | 3.050 | 2.968 | 2.610 |
| bonÀrea | 3.111 | 3.101 | 0 |
| Caprabo | 11.802 | 0 | 0 |
| Carrefour | 29.647 | 29.624 | 12.401 |
| Condis | 7.605 | 7.461 | 0 |
| Consum | 11.036 | 10.873 | 10.891 |
| DIA | 7.475 | 7.406 | 0 |
| Eroski | 21.445 | 0 | 0 |
| Bonpreu/Esclat | 21.081 | 21.065 | 0 |
| HiperDino | 14.789 | 0 | 9.237 |
| Mercadona | 6.267 | 6.229 | 5.760 |
| Plusfresc | 7.939 | 7.919 | 0 |
| Sorli | 9.490 | 9.324 | 0 |

Conclusiones de esta fotografía:

- El backfill de HiperDino sí está reflejado en producción. Los productos con
  varios EAN continúan sin representarse en la columna individual.
- Antes de comparar ahorro deben completarse los precios unitarios de Caprabo,
  Eroski e HiperDino.
- La RPC remota devuelve resultados para Mercadona, Bonpreu/Esclat, Carrefour,
  bonÀrea, Consum y DIA. El SQL local contempla las 15 cadenas, pero no está
  desplegado.
- La firma actual recibe nombre y tiendas, pero no la unidad canónica del
  producto origen. Por tanto, todavía no puede garantizar en SQL la regla
  objetiva «€/L solo con €/L, €/kg solo con €/kg y €/ud solo con €/ud».
- `similar_products`, `catalog_clean_name` y `catalog_family_match` son
  `SECURITY INVOKER`, pero el asesor de seguridad marca `search_path` mutable.
- No existen todavía `catalog_product_embeddings`, `catalog_product_matches`,
  colas de embeddings ni una Edge Function para generarlos.
- Open Food Facts queda expresamente descartado como fuente de GTIN/EAN.

La corrección está preparada localmente en la RPC `similar_products_v2`: recibe
tienda e identificador del producto origen, carga su nombre y unidad canónica en
servidor y descarta cualquier candidato con una base distinta. La migración se
ha validado contra datos reales dentro de una transacción con `ROLLBACK`; aún no
está desplegada.

## Qué problema resolvemos

Al abrir un producto, QuéFalta debería poder presentar la mejor opción en otras
cadenas sin prometer una identidad que no puede demostrar.

Ejemplo:

```text
Mercadona: Leche semidesnatada Hacendado 1 L
  ≈ Carrefour: Leche semidesnatada Carrefour Classic 1 L
  ≈ DIA: Leche semidesnatada DIA 1 L
  ≈ Consum: Leche semidesnatada Consum 1 L
```

La meta no es únicamente buscar palabras parecidas. Es resolver dos niveles de
relación distintos:

| Relación | Significado | Ejemplo | Uso en la interfaz |
| --- | --- | --- | --- |
| `identico` | Misma referencia comercial, normalmente EAN igual | Coca-Cola Zero 2 L en dos cadenas | «Mismo producto» |
| `comparable` | Misma necesidad, variante y unidad comparable, pero otra marca | Leche semidesnatada de marca blanca 1 L | «Alternativa comparable» |
| `sustituto` | Producto relacionado que puede interesar, pero no es directamente comparable | Leche semidesnatada frente a sin lactosa | No usar para el ahorro principal |
| `no_relacionado` | Falso positivo | Batido de chocolate frente a leche | No mostrar |

## El EAN: útil, pero no es el pilar

El EAN es una coincidencia de máxima confianza cuando está disponible. Sin
embargo, no puede ser el requisito para el comparador:

- Muchos supermercados no lo publican en todos los productos.
- Las marcas blancas de distintas cadenas nunca compartirán EAN.
- Frescos, productos a granel y referencias internas no tienen una identidad
  transversal fiable.
- Un producto funcionalmente equivalente no tiene por qué ser idéntico.

Por tanto, el EAN debe ser un atajo para clasificar `identico`, no la base del
sistema. El caso principal de uso será `comparable`.

## Arquitectura recomendada

```text
Producto origen
  ├─ EAN, si existe ────────────────────────> «idéntico» de máxima confianza
  ├─ Nombre, marca, categoría y formato ────> candidatos léxicos
  └─ Texto enriquecido + embedding ─────────> candidatos semánticos
                                                    ↓
                  filtros duros de unidad, cantidad y atributos excluyentes
                                                    ↓
                    ranking híbrido y clasificador para casos ambiguos
                                                    ↓
                  matches precalculados, auditables y reutilizables por la app
```

No se recomienda añadir una columna `embedding` a cada una de las quince tablas
de catálogo. Conviene mantener los datos de origen como están y crear una capa
transversal nueva.

### `catalog_product_embeddings`

Una fila por producto publicado:

```text
store, product_id, content, content_hash, embedding, model, embedded_at
```

- `content` reúne nombre, marca, categoría, formato y, cuando exista, datos de
  ficha relevantes. No debe incluir precio.
- `content_hash` evita recalcular vectores cuando el contenido semántico no ha
  cambiado.
- `model` permite saber cómo se generó cada vector. No se deben comparar
  embeddings generados con modelos distintos.
- Se usará `extensions.vector(n)`, donde `n` depende del modelo elegido.

### `catalog_product_matches`

Una fila por coincidencia validada:

```text
source_store, source_product_id,
target_store, target_product_id,
relation, confidence,
vector_score, lexical_score,
match_version, reviewed_at, review_decision, updated_at
```

Esta tabla permite:

- responder a la app sin llamadas de IA ni búsquedas pesadas al abrir una ficha;
- conservar el motivo, puntuación y versión del algoritmo de cada resultado;
- revisar o rechazar matches problemáticos;
- recalcular solo lo afectado al cambiar reglas, modelo o datos de producto.

## Qué representa el embedding

En vez de vectorizar solo el título, se genera una representación textual
normalizada, por ejemplo:

```text
nombre: leche semidesnatada;
marca: Hacendado;
categoría: leche y bebidas lácteas;
formato: líquido;
cantidad: 1 L;
atributos: sin lactosa = no, bio = no
```

Esto permite descubrir expresiones equivalentes en castellano y catalán. El
embedding no sustituye los atributos: sirve para traer candidatos que después
se validan con ellos.

## Reglas y filtros que no debe decidir un modelo

Estas comprobaciones son objetivas y deben aplicarse antes o durante el ranking:

- EAN igual: `identico`, sin clasificador.
- No comparar €/L con €/kg ni €/ud.
- Diferencias de volumen fuera de un margen definido degradan o excluyen el
  match; 1 L y 200 ml no son automáticamente equivalentes.
- Atributos que cambian el producto: sin lactosa, vegetal, bio, infantil,
  sin gluten, sin azúcar, alto en proteína, etc.
- Respeto de disponibilidad regional, código postal y precio efectivo del
  supermercado.

La comparación de ahorro debe usar siempre precio unitario en la misma base:
€/L, €/kg o €/ud.

## Clasificador o LLM sobre candidatos

El clasificador es una segunda comprobación después de la búsqueda. No recorre
todo el catálogo: recibe pocos pares que ya son prometedores.

Ejemplo de candidatos para «Leche semidesnatada Hacendado 1 L»:

1. «Leche semidesnatada Pascual 1 L».
2. «Leche sin lactosa semidesnatada 1 L».
3. «Bebida de avena 1 L».
4. «Batido lácteo de chocolate 1 L».

El clasificador recibe la información estructurada de ambos productos y devuelve
una respuesta cerrada, por ejemplo:

```json
{
  "relation": "comparable",
  "confidence": 0.96,
  "reason": "Misma familia, variante semidesnatada y volumen compatible.",
  "blocking_attributes": []
}
```

Se ejecuta en lote después de los syncs, nunca al abrir un modal. Debe tratar
solo los pares que quedan en una zona ambigua tras EAN, reglas, coincidencia
léxica y similitud vectorial. Así se controla coste, latencia y variabilidad.

## Componentes de Supabase útiles

| Componente | Papel recomendado | Efecto sobre la precisión |
| --- | --- | --- |
| `pgvector` / `vector` | Almacén y búsqueda de vecinos semánticos | Sube el recall: encuentra nombres equivalentes con redacciones distintas |
| Índice HNSW | Índice vectorial de lectura | Mantiene búsquedas rápidas y de alta calidad de candidatos |
| `pg_trgm` | Coincidencia de texto y nombre normalizado | Evita que el resultado sea solo semántico; ya está instalado |
| RPC SQL con filtros | Filtrar categoría, unidad y atributos antes de limitar | Evita perder buenos candidatos o devolver resultados incompatibles |
| Edge Function | Generar embeddings y llamar al clasificador externo | Mantiene claves y lógica sensible fuera de la app |
| `pgmq` | Cola de productos cambiados y pares pendientes | Procesamiento fiable y reintentable tras los syncs |
| `pg_cron` | Programar o supervisar lotes | Automatiza la actualización incremental |
| Vault / secretos de funciones | Guardar claves de proveedores | Seguridad; nunca exponer una clave de IA al cliente |

No se recomienda llamar a un LLM desde SQL con `pg_net`: una Edge Function y
una cola permiten gestionar secretos, reintentos, límites de proveedor,
observabilidad y errores de forma más controlada.

## Índice vectorial y búsqueda híbrida

Para el volumen de catálogo, HNSW es el índice vectorial que se debe evaluar
primero si el objetivo es maximizar la calidad de los candidatos y ofrecer
lecturas frecuentes de baja latencia. La consulta debe combinar la similitud
vectorial con los filtros de metadatos dentro de la propia función SQL.

La puntuación final puede combinar, ajustada mediante pruebas reales:

```text
puntuación =
  similitud vectorial
  + similitud léxica del nombre
  + compatibilidad de categoría
  + compatibilidad de formato y cantidad
  + coincidencia de atributos
```

El modelo no elige precio ni determina por sí mismo que el candidato es válido.
El precio se usa después, entre matches que ya son comparables.

## Flujo operativo

```text
Sync de un supermercado
  → detectar productos nuevos o cuyo contenido cambió
  → encolar trabajos de embedding
  → recuperar candidatos de otras cadenas con pgvector + pg_trgm
  → aplicar filtros duros y ranking híbrido
  → clasificar solo pares ambiguos
  → guardar matches de confianza alta y los pendientes de revisión
  → la app consulta catalog_product_matches
```

## Validación y mejora continua

La calidad no debe medirse por la distancia vectorial, sino con ejemplos
reales. Antes de desplegar el sistema se debe construir un conjunto de 300–500
pares etiquetados, con estas clases:

- idéntico;
- comparable;
- sustituto;
- no relacionado.

Debe incluir productos de marca blanca, español y catalán, formatos distintos,
frescos y los falsos positivos conocidos. Con él se comparan: el RPC actual,
reglas mejoradas, embeddings y el clasificador.

La revisión humana se reserva para confianza media. Una pantalla interna puede
permitir aprobar, rechazar o marcar un match como sustituto. Cada decisión se
guarda y sirve para ajustar umbrales, sinónimos, reglas y futuras versiones del
clasificador.

## Plan recomendado

1. **Cerrar la base actual.** Actualizar `similar_products` para todas las
   cadenas, completar los pendientes de precio por unidad y validar su calidad
   en una muestra de productos.
2. **Definir la verdad de evaluación.** Etiquetar 300–500 pares y decidir los
   criterios de «comparable» frente a «sustituto».
3. **Crear la capa transversal.** Añadir `catalog_product_embeddings` y
   `catalog_product_matches`, con RLS y permisos mínimos si se exponen mediante
   la Data API.
4. **Probar embeddings sin afectar a usuarios.** Generar vectores y comparar
   resultados contra el conjunto etiquetado, sin activar la UI.
5. **Implementar el pipeline incremental.** Edge Function + cola para productos
   nuevos o modificados después de los syncs.
6. **Aplicar el clasificador solo donde aporte valor.** Reservarlo para pares
   ambiguos; no usarlo para EAN ni reglas de compatibilidad objetivas.
7. **Activar gradualmente.** Mostrar primero matches de alta confianza y
   etiquetarlos siempre como «alternativa comparable», salvo coincidencia EAN.
8. **Medir y revisar.** Evaluar aperturas, clics, rechazos y correcciones antes
   de abordar la optimización completa de la cesta.

### Puertas de salida de la fase 1

No se inicia el despliegue de embeddings hasta que se cumplan estas condiciones:

1. `similar_products` dispone de la unidad canónica del producto origen y
   excluye candidatos con una base distinta.
2. Caprabo, Eroski e HiperDino tienen precio unitario utilizable o quedan fuera
   del ahorro principal de forma explícita.
3. La versión remota y el SQL local de la RPC dejan de divergir.
4. Las funciones fijan un `search_path` seguro y pasan los asesores aplicables.
5. Existe un conjunto etiquetado inicial que permite medir precisión, recall y
   falsos positivos del baseline léxico antes de añadir embeddings.

## Decisiones de producto recomendadas

- Es preferible no mostrar resultado a mostrar una equivalencia engañosa.
- «Mismo producto» queda reservado para evidencia fuerte, normalmente EAN.
- La funcionalidad principal se llama y presenta como «alternativa comparable».
- Un precio menor solo se destaca cuando la unidad y el formato son realmente
  comparables.
- El usuario debe poder abrir la ficha del candidato y juzgarlo; se muestran
  nombre, imagen, formato, unidad y precio.

## Estado de implementación (9 de agosto de 2026)

La capa transversal está definida en la migración
`20260809120628_comparator_embeddings_layer.sql` y se desplegó en producción
de forma controlada el 9 de agosto de 2026. Incluye:

- `catalog_product_embeddings`, privada, con contenido versionado, SHA-256,
  metadatos estructurados y `extensions.vector(512)`;
- índice HNSW de distancia coseno e índice trigram del nombre;
- `catalog_product_matches`, privada, versionada y auditable;
- filtros internos de unidad, proporción de cantidad y atributos excluyentes;
- una función de recuperación vectorial accesible únicamente por
  `service_role`.

Antes del despliegue, la migración se ejecutó dos veces dentro de una
transacción contra el proyecto remoto y terminó en `ROLLBACK`. La prueba final
confirmó RLS, permisos privados, dimensión vectorial, recuperación del candidato
compatible y exclusión de una variante con `sin_lactosa`. Después se aplicó en
producción y se verificó que `anon` y `authenticated` no pueden leer las tablas.

Para el piloto se selecciona inicialmente `text-embedding-3-small` reducido a
512 dimensiones. El corpus reproducible contiene 683 productos únicos de los
400 pares revisados y se genera sin llamadas externas mediante
`scripts/build-comparator-embedding-pilot.mjs`. Antes de fijar este modelo para
todo el catálogo debe medirse contra el baseline híbrido y conservarse solo si
mejora cobertura sin bajar la precisión acordada.

### Resultado del piloto vectorial

Los 683 vectores se generaron correctamente en 7 solicitudes, con 26.441 tokens
de entrada y un coste estimado de 0,000529 USD. Después se regeneraron solo 9
vectores al añadir el atributo estructurado `preparado`, confirmando el flujo
incremental por `content_hash`.

Sobre los 400 pares humanos, la configuración recomendada combina 50 % score
vectorial y 50 % score léxico con umbral 0,58. Obtiene 100 % de precisión de
`comparable`, 71,91 % de recall, 87,5 % de exactitud y recupera 128 comparables.
El baseline recuperaba 125 con 99,2 % de precisión y 86,25 % de exactitud.

El piloto confirma una mejora pequeña pero real sin falsos positivos en la
muestra. Los umbrales de cobertura más agresivos se descartan para publicación:
confundieron productos unidos por una licencia comercial (`Toy Story`) y
especies distintas con descripciones de preparación similares.

### Pipeline incremental desplegado con procesamiento automático apagado

La migración local `20260809123232_comparator_embedding_pipeline.sql` añade:

- `pgmq`, `pg_net` y `pg_cron` sin fijar versiones obsoletas;
- cola `catalog_embedding_jobs` y trigger que solo encola inserciones, cambios
  de `content_hash`/versión o republicaciones;
- limpieza automática del vector cuando cambia el contenido semántico;
- dispatcher privado por lotes hacia la Edge Function `catalog-embed`;
- reintentos por visibility timeout, archivo tras el máximo de intentos y tabla
  privada `catalog_embedding_failures`;
- RPC internas limitadas a `service_role` para completar o archivar trabajos.

La Edge Function valida un token interno independiente, agrupa productos por
tienda, evita trabajos obsoletos mediante `content_hash`, genera lotes de 512
dimensiones y actualiza cada fila con comprobación optimista del hash. Sus
dependencias de Supabase están fijadas a versiones exactas.

La infraestructura ya está desplegada en producción: `pgmq` 1.5.1, `pg_net`
0.20.3 y `pg_cron` 1.6.4, la cola `catalog_embedding_jobs`, los secretos de Edge
y Vault, y la Edge Function `catalog-embed`. La función rechaza con HTTP 401
las peticiones sin el token interno. El cron permanece expresamente sin
programar y la interfaz continúa desactivada, por lo que no hay procesamiento
automático ni exposición a usuarios.

La prueba remota de extremo a extremo introdujo un trabajo deliberadamente
obsoleto y recorrió `pgmq -> pg_net -> catalog-embed -> Postgres`. Detectó que
las funciones `pgmq.delete`/`archive` son `SECURITY INVOKER` y requieren
permisos sobre las tablas físicas de la cola; se añadieron a `service_role`
solo `SELECT`/`DELETE` en la cola e `INSERT` en el archivo. La repetición terminó
con HTTP 200, `stale=1`, cola vacía, cero fallos y las 683 filas intactas. `anon`
y `authenticated` no recibieron permisos sobre la cola.

El piloto local se importó mediante
`scripts/import-comparator-embedding-pilot.mjs`: 683 filas publicadas, 683
vectores presentes, una sola combinación de modelo/versión y 512 dimensiones
en todas las filas. La cola quedó vacía y el índice HNSW quedó válido y listo.
El asesor de seguridad solo informa de que las tres tablas privadas tienen RLS
sin políticas, que es intencionado porque se revocó el acceso público y solo
trabaja `service_role`. Se añadió el índice recomendado para cubrir la clave
foránea de `catalog_embedding_failures`.

### Benchmark híbrido remoto

`scripts/benchmark-comparator-embedding-remote.mjs` ejecutó 400 recuperaciones
reales contra Supabase usando los pares revisados. El vector remoto coincide con
el local con una diferencia absoluta máxima de 0,0000007. Se descartó usar
`pg_trgm.similarity` como score final porque no reproduce el Dice de tokens y
trigramas validado; PostgreSQL recupera el top-N vectorial y el reranking aplica
después exactamente la fórmula del piloto.

La función privada `catalog_embedding_candidates_v2` conserva los bloqueos de
unidad y atributos, pero amplía el margen de formato de x4 a x12 de forma
simétrica. La v1 permanece intacta. En los 400 pares, v2 reproduce exactamente
el resultado offline recomendado:

- 128 comparables publicados por el clasificador;
- 100 % de precisión y cero falsos positivos;
- 71,91 % de recall y 87,5 % de exactitud;
- pesos 50 % vector / 50 % léxico y umbral 0,58;
- latencia extremo a extremo p50 de 75,69 ms y p95 de 85,58 ms;
- ejecución PostgreSQL medida con `EXPLAIN ANALYZE`: 10,0 ms en el piloto.

La RPC v2 es `SECURITY INVOKER`, fija `search_path` vacío y solo puede ejecutarla
`service_role`; `anon` y `authenticated` no tienen permiso. Los asesores no
añadieron avisos de seguridad o rendimiento específicos de la función. Los
avisos de índices sin uso son esperables mientras el piloto tenga 683 filas y
la interfaz permanezca apagada.

Dos pruebas transaccionales remotas previas confirmaron cola, trigger,
invalidación, reintento/archivo, RLS, permisos, activación/pausa del cron y
rollback completo. Los procedimientos operativos están en
`supabase/ops/README-comparator-embedding-pipeline.md`.

El materializador `scripts/sync-comparator-embedding-catalog.mjs` conecta los
quince catálogos con esta capa. Descarga primero cada tienda completa, rechaza
catálogos vacíos o filas sin identidad, hace upsert por `(store, product_id)` y
solo después marca ausencias como no publicadas mediante `source_seen_at`. Una
ejecución `DRY_RUN=1` leyó correctamente los 172.076 productos publicados: no
encontró pérdidas de filas y reprodujo las coberturas auditadas de unidad y
GTIN, sin efectuar escrituras.

### Canario de catálogo ampliado

El 9 de agosto de 2026 se ejecutó un canario controlado sobre tres catálogos
representativos, manteniendo el cron y la interfaz apagados:

- Mercadona: 6.267 productos, 6.229 con unidad y 5.760 con GTIN global;
- Ametller: 3.050 productos, 2.968 con unidad y 2.610 con GTIN global;
- Aldi: 1.615 productos, 1.351 con unidad y sin GTIN directo.

La simulación y la materialización coincidieron exactamente en 10.932
productos. Antes de consumir la API se detectaron 69 mensajes duplicados: el
trigger `BEFORE INSERT` producía un efecto lateral antes de resolver un
`INSERT ... ON CONFLICT DO UPDATE`, y el mismo producto se encolaba de nuevo en
el trigger de actualización. La migración
`20260809143000_comparator_embedding_enqueue_after_upsert.sql` separa la
invalidación del vector (`BEFORE UPDATE`) del encolado (`AFTER INSERT/UPDATE`).
Se retiraron exclusivamente los 69 duplicados y una prueba transaccional de
UPSERT confirmó que una actualización sin cambio semántico deja la cola vacía.

El procesamiento se hizo manualmente en un lote inicial de 25 y oleadas
posteriores monitorizadas. Resultado final:

- 10.932/10.932 productos del canario con embedding;
- 512 dimensiones y modelo `text-embedding-3-small` en todas las filas;
- cero trabajos pendientes y cero fallos abiertos;
- todas las peticiones de procesamiento respondieron HTTP 200;
- índice HNSW válido y listo;
- ningún trabajo de `pg_cron` programado y comparador aún desactivado.

Incluyendo los productos del piloto de otras tiendas, la tabla contiene 11.546
filas y 11.546 embeddings. El coste no se registra todavía por ejecución; a
partir del promedio medido en el piloto y del precio oficial de 0,02 USD por
millón de tokens de entrada, este canario se estima en aproximadamente
0,008-0,009 USD.

Los asesores posteriores no detectaron avisos nuevos que impidan continuar.
Para estas tablas solo muestran RLS sin políticas, intencionado por su acceso
exclusivo mediante `service_role`, e índices todavía sin uso, esperable mientras
la interfaz sigue apagada.

### Catálogo completo y backfill

El mismo 9 de agosto de 2026 se amplió la capa a los quince catálogos. La
simulación y la materialización coincidieron exactamente en 172.076 productos.
Durante la carga aparecieron dos incidencias que se resolvieron antes de generar
los vectores restantes:

- el disco anterior se quedó sin espacio con 1,4 GB de base y 400 MB de WAL;
  se amplió el disco administrado de Supabase a 8 GB y se confirmó de nuevo el
  modo de lectura/escritura;
- Plusfresc publica al menos un formato literal de `0 ml`; el normalizador ahora
  trata cantidades no positivas como desconocidas (`null`) en lugar de intentar
  guardar `quantity_base = 0`.

El materializador incorpora además reintentos exponenciales acotados para 429 y
errores 5xx de PostgREST. La reanudación se hizo únicamente desde la tienda que
había fallado y la cola final contenía 161.144 trabajos únicos, sin duplicados.

El backfill se ejecutó con un cron temporal supervisado. Un primer ritmo de diez
lotes de 200 cada diez segundos saturó `pg_net`: se observaron timeouts de DNS y
un `BOOT_ERROR` de Edge Function, pero los mensajes quedaron protegidos por el
visibility timeout y volvieron a la cola sin pérdida de datos. El tramo final se
procesó de forma estable con un lote de 200 cada diez segundos. Al terminar:

- 172.076/172.076 filas tienen embedding;
- todas usan `text-embedding-3-small`, 512 dimensiones y la versión de contenido
  esperada;
- cola, trabajos en vuelo y fallos abiertos quedaron en cero;
- el cron temporal se eliminó y la interfaz continúa apagada;
- el índice HNSW quedó válido y listo;
- la tabla transversal ocupa 1,10 GB, de los cuales 439 MB corresponden al HNSW;
- el clúster ocupa 2,35 GB y el WAL 784 MB sobre un disco provisionado de 8 GB.

La Edge Function no persiste todavía el uso de tokens de cada lote. Usando el
promedio medido en el piloto, los 161.144 embeddings de esta ampliación se
estiman en unos 6,2 millones de tokens de entrada y aproximadamente 0,12-0,13
USD al precio vigente de `text-embedding-3-small`.

### Benchmark posterior al catálogo completo

El benchmark de 400 pares se repitió contra los 172.076 productos. La prioridad
de precisión se mantiene: 100 % de precisión de `comparable` y cero falsos
positivos. Sin embargo, el top-100 puramente vectorial pierde cobertura al
competir contra el catálogo completo:

- 96 comparables recuperados, 53,93 % de recall y 79,5 % de exactitud;
- 82 pares idénticos y 82 comparables revisados no recuperan el objetivo esperado
  entre los cien primeros candidatos;
- latencia extremo a extremo p50 de 214,82 ms y p95 de 374,79 ms;
- 96 pares comparables aparecen dentro del top-100, 95 en el top-20 y 79 como
  primer candidato.

### Recuperación híbrida v3

La función privada `catalog_embedding_candidates_v3` combina tres vías sin
modificar v2: coincidencia exacta por GTIN global, top-N vectorial HNSW y
recuperación léxica indexada con `pg_trgm`. Los candidatos duplicados se fusionan
mediante reciprocal rank fusion. El GTIN exacto puede atravesar diferencias de
unidad porque representa identidad; las rutas semánticas conservan unidad,
atributos, versión del contenido y margen de cantidad x12.

El benchmark de 400 pares con 20 candidatos por rama, pesos 50 % vector / 50 %
léxico y umbral conservador 0,60 obtiene:

- 121 comparables correctos, 67,98 % de recall y 85,75 % de exactitud;
- 100 % de precisión y cero falsos positivos;
- 122 de 122 pares idénticos recuperados por GTIN exacto;
- 122 comparables presentes entre los candidatos, 120 en el top-5 y 100 como
  primer candidato;
- latencia extremo a extremo p50 de 475,87 ms y p95 de 734,22 ms en la pasada
  secuencial remota.

Frente a v2 sobre el catálogo completo, v3 añade 25 comparables correctos y
sube el recall de 53,93 % a 67,98 % sin perder precisión. De los 56 comparables
que no se recuperan, 50 quedan fuera por filtros duros actuales: 23 conflictos
de atributos, 17 unidades ausentes o incompatibles y 10 productos origen sin
unidad canónica. Solo seis pasan todos los filtros, por lo que ampliar más la
búsqueda tendría un beneficio acotado y un riesgo mayor de equivalencias falsas.

La RPC es `SECURITY INVOKER`, fija `search_path` vacío y solo concede ejecución a
`service_role`. Los índices de GTIN, HNSW y trigramas ya aparecen utilizados. Los
avisos restantes de los asesores son anteriores y no específicos de v3. La
interfaz continúa apagada: esta fase valida la recuperación, pero no autoriza aún
su publicación en el cliente.

### Caché incremental de coincidencias v3

El 10 de agosto de 2026 se activó el comparador bajo demanda para validación en
dispositivo y se añadió una caché incremental. No se usa una vista materializada
global: recalcular 172.076 productos contra catorce tiendas destino generaría un
backfill largo y presión innecesaria sobre los 8 GB de disco.

La primera consulta de cada combinación producto/tienda aplica el matcher v3 y
guarda todos los candidatos aceptados en `catalog_product_matches`. La tabla
`catalog_product_match_cache_status` registra también resultados vacíos, por lo
que una ausencia fiable no vuelve a ejecutar HNSW. Las consultas posteriores
seleccionan los dos candidatos más económicos y cargan nombre, imagen y precios
desde los catálogos vivos; un cambio exclusivo de precio no invalida el match.

La invalidación usa dos señales:

- `content_hash` y `embedded_at` del producto origen;
- una generación por tienda destino, incrementada solo cuando cambia contenido,
  embedding, modelo o publicación de algún producto de esa tienda.

Una prueba con un origen y catorce destinos devolvió las mismas 14 opciones que
la ejecución directa. El primer llenado tardó 10,69 s y la lectura completa ya
cacheada 25,93 ms en PostgreSQL. Una invalidación transaccional de HiperDino
forzó correctamente un refresco de 606 ms y, tras revertirla, la lectura cacheada
de esa tienda volvió a 19,28 ms. La muestra ocupa 14 estados (incluidos negativos)
y 23 matches positivos: 48 kB y 104 kB respectivamente.

La Data API expone únicamente `public.catalog_cheaper_products_v3` como
`SECURITY INVOKER`. La escritura privilegiada vive en `comparator_internal`,
con `search_path` vacío, comprobación de `auth.uid()` y sin exposición directa
de las tablas de embeddings o caché.

## Referencias

### Endurecimiento de identidad semántica (17 de agosto de 2026)

Los tests de uso encontraron falsos positivos que compartían sabor, unidad y
contexto de bebida, pero no la familia esencial (por ejemplo, té de limón frente
a gaseosa de limón). Subir el umbral global no resuelve bien este problema:
también elimina equivalentes con nombres diferentes.

La RPC local `catalog_cheaper_products_v5` conserva la recuperación híbrida y
la caché v3, pero filtra antes de ordenar por precio mediante dos señales
deterministas:

- familia esencial normalizada (`tea`, `soft_drink`, `juice`, `yogurt`,
  especies de carne/pescado, limpieza e higiene, entre otras);
- variantes explícitas normalizadas (sabores, sin azúcar, sin alcohol, sin gas,
  integral, descafeinado, picante, ahumado, etc.).

Si una sola parte tiene una familia reconocible o las variantes explícitas no
coinciden, el par no se muestra. GTIN global idéntico y una aprobación humana
explícita conservan prioridad. La categoría de origen no decide la familia,
porque los árboles no están homologados y contienen asignaciones inconsistentes.
La normalización léxica también unifica variantes ortográficas conocidas como
`burger`/`burguer`/`hamburguesa`, sin convertirlas en una familia global: así un
pan de hamburguesa puede recuperar panes equivalentes, mientras que salsa,
queso y carne siguen sujetos a sus filtros de identidad.
La migración está preparada y probada con `ROLLBACK`, pendiente de despliegue.

- [COMPARATIVA.md](COMPARATIVA.md): especificación actual del comparador.
- [Supabase: búsqueda semántica](https://supabase.com/docs/guides/ai/semantic-search).
- [Supabase: pgvector](https://supabase.com/docs/guides/database/extensions/pgvector).
- [Supabase: índices vectoriales](https://supabase.com/docs/guides/ai/vector-indexes).
- [Supabase: búsqueda híbrida](https://supabase.com/docs/guides/ai/hybrid-search).
- [OpenAI: text-embedding-3-small](https://developers.openai.com/api/docs/models/text-embedding-3-small).
