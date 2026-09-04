# CE-1 / F0 — CE-002: revisión independiente de HNSW y modal

> 2026-09-02 · plan v1.1 / CE-ENV-001.
>
> CE-002 COMPLETADA como revisión. Ninguno de los dos parches queda aprobado
> automáticamente para un release de CE-1. En aquel cierre: F0 EN CURSO; G0 no aceptado.
>
> Sin cambios de aplicación, migraciones, cachés, cuotas o procesos productivos.

Continuidad: CE-005 está cerrada y F0 aceptada (G0 PASS) en
[acceptance.md](acceptance.md). CE-100 inicia F1 en
[CE-100-readiness.md](CE-100-readiness.md). Esta aceptación no aprueba para
despliegue los parches revisados aquí ni reescribe la captura histórica.

## 1. Conclusión ejecutiva

Los dos cambios locales resuelven problemas distintos y **no dependen entre sí**:

- HNSW: recuperar candidatos que se pierden al filtrar por tienda.
- Modal: conservar una ficha abierta ante errores y permitir reintentar.

La migración HNSW mezcla recuperación, reglas de identidad, una ampliación del
umbral de aceptación e invalidación transversal. No debe incorporarse tal cual
al comparador estricto. El modo iterativo sí merece evaluación aislada en CE-608.

Del modal conviene conservar el error persistente/reintento, pero hay una
regresión al reabrir el mismo producto y falta distinguir ficha global de
precio/disponibilidad local. No se declara listo para publicación.

El [JSON de evidencia](CE-002-independent-review.json) conserva hashes,
definiciones remotas, las consultas de solo lectura, resultados y el código de
la sonda local con sus limitaciones. Los fixtures de revisión no se añaden
automáticamente al holdout ni cambian los 35 casos del plan.

## 2. Estado comprobado y alcance

- Checkout: `codex/phase5-observation`,
  HEAD `03b8ba273e17709fd8fc69c20dddb68c147a7e2a`.
- Destino: `gkffvigcnsesbaihycay`, verificado en [CE-001](CE-001-supabase-inventory.md).
- Nueva lectura de definiciones: 2026-09-02 19:40:49 UTC.
- Candidatos v3: sin configuración iterativa; misma huella que CE-001.
- Helper `catalog_product_identity_family_v1`: no existe remotamente.
- Refrescador de caché: todavía exige 0,60 sin la nueva excepción de 0,59.
- Modal/fallback: cambios locales sin commit; no hay evidencia en esta revisión
  de que estén incluidos en una versión publicada. No se consultó App Store/EAS.
- Timeout de finalizadora ya aplicado: antecedente separado de CE-001, no se
  reaplica ni se considera parte necesaria de estos parches.

Solo se hicieron dos bloques SQL `READ ONLY`, con timeout 5 s, espera de lock
1 s y ROLLBACK: metadatos y diez pares de textos sintéticos. No se invocaron
candidatos vectoriales, refrescadores de caché, v7 ni trabajos de embeddings.
La guía de Supabase/Postgres llevó a separar la sonda pura del smoke mutante.

## 3. Inventario de cambios separados

| Unidad | Archivos / objetos | Alcance real | Decisión para CE-1 |
|---|---|---|---|
| HNSW iterativo | Migración local, líneas 5–6; candidates_v3 | Todas las llamadas a esa función compartida | Evaluar aislado en RPC nueva/sesión de prueba |
| Normalización e identidad | Misma migración, líneas 11–97 | Nuevo helper y sustitución del guard compartido | No sustituye perfil/pack/atributos de F3 |
| Aceptación 0,59 | Misma migración, líneas 103–317 | Refrescador compartido y todas las familias reconocidas | No importar esta excepción como regla estricta |
| Invalidación | Misma migración, líneas 327–329 | Todas las filas de generaciones; reconstrucción posterior bajo demanda | No aplicar por arrastre |
| Fallback global | SimilarProductsSection + StoreProductModal | Opt-in del Radar para Carrefour/Consum/DIA/Plusfresc | Solo informativo, con procedencia explícita |
| Error/reintento/estado | StoreProductModal | Consumidores del componente, no solo Radar | Conservar beneficio; corregir y probar estado |

Fuentes locales:

- [Migración HNSW](../../supabase/migrations/20260902122234_fix_comparator_filtered_hnsw_recall.sql).
- [StoreProductModal](../../src/components/StoreProductModal.tsx) y
  [SimilarProductsSection](../../src/components/SimilarProductsSection.tsx).
- [Test HNSW](../../scripts/tests/comparator-filtered-hnsw-recall.test.mjs),
  [test modal](../../scripts/tests/store-product-modal-resilience.test.mjs) y
  [smoke SQL](../../supabase/ops/verify-comparator-filtered-hnsw-recall.sql).

El modal compartido tiene cinco consumidores directos localizados: Radar,
StoreProductList, ListScreen, GroupDetailScreen y PriceAlertResultsScreen.
Solo Radar activa el fallback, pero los nuevos estados de carga/error afectan
a todos. Mercadona delega en ProductDetailModal y no usa este nuevo fetch/error
de espejos. No afirmar que se ha corregido toda ficha de todos los supermercados.

## 4. HNSW: utilidad, límites y riesgos

### CE002-H01 — Identidad y aceptación insuficientes para CE-1

**Prioridad alta para incorporación a CE-1.** El criterio inferior a 0,60 no
está limitado a huevos: admite cualquier familia reconocida con el guard actual.
Ese guard compara familia y una lista limitada de variantes, sin la firma de
pack y sin modelar por separado tipo griego, sabor, azúcar añadido o edulcorantes.

Se ejecutó como SELECT el cuerpo literal del guard propuesto, expandiendo el
nuevo helper de marca, sobre diez fixtures. Se contrastó con el guard desplegado.
No se instaló la función nueva.

`true` en esta tabla significa **«pasa el guard aislado»**, no «el comparador
completo devuelve este producto». Otras puertas actuales pueden excluirlo; estos
resultados no son una tasa de falsos positivos ni una búsqueda sobre catálogo.

| Par sintético | Guard desplegado | Guard propuesto | Lectura para CE-1 |
|---|---|---|---|
| Mismo yogur y pack; orden de palabras | true | true | Compatible solo si el resto de campos coincide |
| Yogur natural / azucarado, 6×125 g | true | true | No aprobar identidad sin resolver endulzado |
| Yogur 6×125 g / 3×250 g | true | true | Rechazar por estructura de pack |
| Agua 1 L / 1,5 L | true | true | Rechazar por cantidad |
| Patatas congeladas 2 kg / 0,5 kg | true | true | Rechazar por cantidad; familia aún sin identificar |
| Huevos L, 6 ud / BONPREU L/XL, 12 ud | false | true | No aceptar como estricto; huevos fuera del piloto inicial |
| Huevos L / codorniz | true | false | Separación útil |
| Huevos L / cocidos | true | false | Separación útil |
| Huevos L / bonÀrea Huevos L | false | false | Falso negativo del reconocimiento de marca |
| Huevos de gallina / pato | true | true | Especie distinta; rechazo necesario si se amplía a huevos |

Problemas ya existentes que el parche no resuelve:

- Familia desconocida en ambos lados puede pasar por `IS NOT DISTINCT FROM`;
  no equivale a demostrar identidad. Ocurre con el fixture de patatas.
- Los candidatos vectoriales/léxicos mantienen ratios de cantidad entre 1/12 y
  12, y permiten cantidad desconocida. El parche no endurece esa lógica.
- Se conserva el bypass de GTIN en el refrescador y el de GTIN/revisión en v5.
- El smoke espera que L y L/XL sean compatibles. No demuestra mismo número de
  huevos ni calibre equivalente; tampoco autoriza añadir huevos al piloto.

**Dirección:** conservar recuperación amplia como generación de candidatos, pero
solo aprobar equivalencia tras F3 y CE-602. Mantener el piloto agua/yogur/patatas
y no trasladar el 0,59 como excepción a los controles. «Natural» por sí solo no
prueba ausencia de azúcar añadido.

### CE002-H02 — Cambio compartido e invalidación sin aislamiento

**Prioridad alta operativa.** Aunque el ajuste GUC queda ligado a una función,
esa función pertenece a la cadena legacy utilizada por v7. También se sustituye
el guard y el refrescador compartidos: un flag CE-1 apagado no aísla estos efectos.

El UPDATE final no tiene WHERE: incrementaría todas las filas que existan entonces
en `catalog_match_store_versions`, no solo Bonpreu/bonÀrea. CE-001 registró
18 como estimación; el SQL no contiene un límite de 18. Las filas son pocas,
pero los misses y reconstrucciones posteriores pueden alcanzar muchos pares y
añadir carga/locks en búsquedas y syncs. La invalidación es perezosa, no gratuita.

Se mantiene `embedding_hybrid_v3_0_60` aunque cambie la aceptación. Si hubiera
que volver atrás, desactivar el recorrido iterativo **no** revierte los helpers,
los matches ya recalculados ni la generación de caché.

**Antes de incorporar:** separar cambios, versionar reglas/evidencia, fijar
alcance y probar reversión del conjunto. No decrementar generaciones para
«deshacer» ignorando syncs concurrentes ni restaurar una caché obsoleta.
CE-103/CE-606 deben concretarlo; no hay script de reversión aprobado en esta tarea.

La configuración por función se restaura al salir según
[PostgreSQL 17](https://www.postgresql.org/docs/17/sql-createfunction.html).
Eso limita la variable, no el consumo de recursos ni el conjunto de usuarios
que llama a la función.

### CE002-H03 — Las pruebas no justifican el despliegue

**Prioridad media.** Los tres tests HNSW solo buscan patrones de texto. Su nombre
dice «hasta llenar candidatos», pero el test no ejecuta el índice ni garantiza
llenar el cupo. El smoke:

- mezcla helpers y escritura de matches/caché mediante refresh;
- depende de IDs reales de huevos y de que sigan publicados/embebidos;
- cuenta candidatos combinados (GTIN, vector y léxico), no solo el aporte HNSW;
- pide al menos diez candidatos, pero no demuestra diez equivalentes;
- no mide falsos positivos de las familias piloto, planes, memoria o concurrencia;
- no fija localmente límites de tiempo/locks ni verifica el retorno del GUC tras
  la llamada; presupone que la sesión ya expone `off`;
- emite el marcador OK después de ROLLBACK. Un runner que continúe tras error
  podría llegar a imprimirlo aun habiendo fallado el DO.

El runner futuro debe fallar ante cualquier error y comprobar código de salida,
no solo el marcador; en psql esa parada requiere configuración explícita.
[Referencia de psql](https://www.postgresql.org/docs/17/app-psql.html).

**No se ejecutó el smoke.** ROLLBACK no lo convierte en solo lectura: sigue
ejecutando trabajo, tomando locks y haciendo escrituras transaccionales.
Por este motivo no se usó como validación en F0.

### CE002-H04 — Recall acotado, idioma y orden pendientes de medir

El prefijo de marca se elimina antes de quitar acentos. `bonÀrea` no coincide
con `bonarea` en ese regexp; la sonda confirma el falso negativo. Tampoco las
reglas de codorniz/cocido constituyen una taxonomía completa de especies,
preparación o idioma. El helper afecta a todas las familias, no solo huevos.

pgvector 0.8.0 permite seguir buscando tras filtros, pero termina también por
límites de exploración/memoria. `relaxed_order` puede alterar el orden de
distancia; recuperar más filas no demuestra equivalencia ni mínimo de precio.
[Documentación versionada de pgvector](https://github.com/pgvector/pgvector/blob/v0.8.0/README.md#iterative-index-scans).

La función actual usa ranking por distancia y luego fusión de rangos. Evaluar
`strict_order` frente a `relaxed_order`, reordenación explícita/materializada
y desempates deterministas en CE-608; no se afirma aquí un fallo de ranking
reproducido. Comparar con referencia exhaustiva acotada, frío/caliente, por tienda
y con un caso sin equivalentes. El A/B histórico de ~643 ms / lectura fría de
~10,2 s es un antecedente, no un benchmark nuevo ni una garantía de latencia.

## 5. Modal: mejoras útiles y defectos pendientes

### CE002-M01 — Ficha global no equivale a oferta local

**Prioridad alta para CE-1; decisión de producto, no fallo de RLS demostrado.**

El fallback solo ocurre si el primer fetch devuelve null, no ante una excepción.
Quita región/CP y vuelve a pedir el mismo ID. En
[catalog.ts](../../src/api/catalog.ts), los fetchers usan esos valores tanto
para filtrar disponibilidad como para elegir precio regional/por centro.
Con null, por ejemplo Carrefour devuelve el precio base sin override regional.

El resultado se guarda solo como `{ key, product }`: no conserva si se utilizó
fallback ni una ubicación comercial verificable. El modal hijo recibe un producto
ordinario. Sus acciones pueden mostrar precio, guardar favorito y añadir a la
lista con ese precio; no existe en este camino una etiqueta de «no verificado
para tu zona».

**Dirección:** separar abrir información de certificar precio/ahorro. Conservar
procedencia y estado regional. Si falta verificación, no presentar el precio
como local ni habilitar acciones que lo den por verificado. La política de añadir
un producto meramente informativo a la lista deberá ser explícita; CE-002 no
prohíbe toda adición ni implementa una nueva UX.

Los accesos no Radar conservan `fallbackToGlobalCatalog=false`. El problema no
es que se filtre mal una cuenta privada; es la promesa comercial del resultado.

### CE002-M02 — Reaparece la ficha anterior al reabrir

**Prioridad media; regresión del parche local.**

`requestKey` depende de tienda, producto, región, CP, idioma y reintento.
Al pasar a `target=null` se conserva `mirrorResult`; al reabrir el mismo
producto vuelve a coincidir la clave. El efecto no limpia ese resultado y se
muestra mientras la nueva consulta sigue pendiente. Puede reintroducir un precio
anterior sin indicar que está pendiente de validar.

Se reprodujo usando el TSX real transpilado, hooks/effects simulados y promesas
controladas. El código HEAD limpia el resultado después del efecto de reapertura;
el parche conserva el anterior. La sonda no es un renderer React Native ni mide
un frame de dispositivo.

`requestKey` tampoco incluye la política de fallback. Aunque hoy el prop es fijo
en cada consumidor, un cambio de política debe invalidar la ficha; registrar el
caso antes de hacer dinámico ese control.

**Dirección:** definir sesión/estado de carga y frescura; invalidar o etiquetar
el dato previo, sin mostrarlo como verificado. Probar cerrar/reabrir, A→B→A,
cambio de usuario/zona/idioma y rechazo tardío de una petición.

### CE002-M03 — Carga sin cierre y trabajo tras cancelar

**Prioridad media; distinguir deuda heredada de comportamiento nuevo.**

- Loader sin botón visible de cierre: existe tanto en HEAD como en el parche.
  Hay `onRequestClose` para el modal, pero no sustituye un control accesible
  visible en todas las plataformas. No se probó un bloqueo real en iOS.
- Si se cierra antes de que el fetch regional devuelva null, la nueva rama inicia
  igualmente el fetch global: comprueba `cancelled` después de ese segundo
  fetch. La sonda confirmó dos llamadas simuladas frente a una en HEAD.
- La bandera de cancelación evita pintar una respuesta obsoleta, pero no aborta
  la petición de red. Añadir límites/reintento/cancelación reales es trabajo
  posterior, no un motivo para aumentar silenciosamente los timeouts.

Beneficios que sí se conservarán: ante null/error la hoja no se cierra sola,
muestra error y permite reintento; una respuesta tardía de A no sustituye B.
Estos casos pasaron en la sonda lógica. Sigue pendiente validar interacción,
gestos, accesibilidad y temas en dispositivo.

## 6. Evidencia de pruebas y pendientes de aceptación

| Comprobación de CE-002 | Resultado | Qué no demuestra |
|---|---|---|
| Dos archivos de tests focalizados | 5/5 pasan | Son aserciones textuales, no SQL ni UI en ejecución |
| npm run quality | TypeScript, ESLint y 213/213 tests pasan | No certifica la comparación estricta o el render nativo |
| Sonda SQL de identidad | Diez pares; resultados en sección 4 y JSON | No ejecuta recuperación, scoring, v7 o precios |
| Sonda del modal | Reproduce M02/trabajo tras cierre; confirma error/reintento y descarte de respuesta vieja | Hooks/red simulados, sin dispositivo |
| Hashes protegidos | 8/8 coinciden con CE-000 | No prueba que el código esté listo para publicar |
| Revisión documental y diff | Enlaces/bloques/JSON válidos; 67 tareas, tres cerradas y 35 regresiones; git diff --check correcto | No acepta G0 ni un release |

Pruebas a exigir en sus fases, sin ejecutarlas por arrastre:

- **CE-105/F3/CE-602:** SQL real de formato, endulzado, desconocidos y bypasses;
  positivos y negativos ES/CA; packs con igual total y distinta estructura.
- **CE-608/609:** recall útil, pérdida del mínimo de precio, orden y latencia
  sobre corpus de calibración; no limitarse al número de vecinos.
- **CE-606/709:** invalidación y reversión con generaciones concurrentes y cachés
  calculadas con reglas distintas; evitar invalidación global no presupuestada.
- **CE-703/706:** regional válido, ausente, error, global disponible y ausente;
  precio local distinto del global; null no es igual a fallo de red.
- **CE-705/706:** cierre durante carga, retry, reopen, respuestas fuera de orden,
  cuenta/zona/idioma, ES/CA, temas, accesibilidad, iOS y Android.
- Mantener pruebas del resto de consumidores del modal, PKCE, estado por usuario,
  categoría al añadir a cesta y ausencia de cobro de cuota por abrir una ficha.

## 7. Decisión de incorporación y reversión

| Pieza | Decisión | Siguiente ubicación en el plan |
|---|---|---|
| Iterative scan | Evaluar y medir separado; no aplicar la migración completa | CE-608/609 |
| Wrapper de marca | Reutilizar el problema identificado; resolver idiomas/conflictos estructuralmente | F3 |
| Guard y excepción 0,59 | No adoptar como puerta de equivalencia estricta | CE-602 |
| UPDATE global de generaciones | No aplicar por dependencia implícita; diseñar versión/invalidación acotada | CE-103/606 |
| Modal error/reintento | Conservar intención y beneficio; corregir M02 y validar | CE-703/706 |
| Fallback global | Solo con semántica informativa explícita y verificación comercial separada | F5, CE-703 |
| Integraciones | No se necesita instalar ninguna en esta revisión; pgTAP sigue previsto para tests SQL | CE-105 |

Una corrección legacy urgente, si se solicita por separado, requiere su propio
alcance, pruebas y reversión; no se etiqueta automáticamente como CE-1 estricto.
La autorización de Supabase directo sigue vigente. El motivo para no aplicar
estos archivos ahora es la fase y los hallazgos, no una nueva prohibición de
producción ni una petición duplicada de permiso.

Retirada futura del fallback no debe reinstaurar el autocierre por error.
La reversión del paquete HNSW debe contemplar función, helpers y caché, no solo
el GUC. No se ejecutó ni se declara ensayada ninguna reversión remota.

## 8. Acta y siguiente paso

| Campo | Cierre |
|---|---|
| Proyecto / tarea | CE-1 / F0 / CE-002 |
| Estado de tarea | COMPLETADA: cambios, dependencias, pruebas y riesgos separados |
| Aprobación de los parches para release | NO; condicionada a los trabajos posteriores identificados |
| Estado de fase | F0 EN CURSO; CE-003–CE-005 pendientes; G0 no aceptado |
| Responsable técnico | Codex en esta tarea |
| Autoridad | Continuación «adelante» y CE-ENV-001 |
| Cambios persistentes en producción | Ninguno; dos consultas de lectura, sin cuota/caché ni catálogo modificado |
| Código/SQL preexistente | Íntegro, sin despliegue |
| Nuevos recursos/costes contratados | Ninguno; coste marginal de lecturas no cuantificado |
| Entregables | Esta acta y JSON; actualización del plan, contexto y handoff |
| Próxima tarea | CE-003: ratificar D01–D14, familias piloto, cuarentenas y cuota/mensajes |

La revisión consultó el [changelog de Supabase](https://supabase.com/changelog)
y documentación de la versión de pgvector observada; no exigió actualizar la
plataforma. No se ha instalado pgTAP, cambiado permisos ni creado una nueva RPC.
