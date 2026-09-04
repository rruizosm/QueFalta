# Proyecto CE-1 — Radar de ahorro: comparador estricto

> Versión del plan: 1.4 · actualizado 2026-09-03 (CE-203 en curso).
>
> Estado: CE-000–CE-005, CE-101 y CE-102 completadas; FR-02 y QA-01 confirmadas.
> F0 aceptada (G0 PASS); F1 completada (G1 PASS acotado al canario privado).
> CE-100 cerrada por el propietario con limitaciones; CE-101–106 completadas.
> F2 en curso: CE-200–202 completadas; 6.000 parejas y 1.200 Q reproducibles.
> CE-201/202 completadas: primera anotación 6.000/6.000, incluido el bloque agua.
> Un equivalente de producto íntegro; cero ahorros elegibles, gold o revisión independiente.
> CE-203 en curso: sorteo ciego congelado, 1.336 revisiones del propietario
> pendientes. G2 y el comparador siguen sin aprobarse.
>
> El usuario autoriza trabajar directamente sobre el Supabase actual, incluida
> producción, dentro de CE-1. Ya no es obligatorio crear un backend separado ni
> esperar a F8 para aplicar cambios de base de datos. CE-103/105 han aplicado
> una base privada inactiva y su registro duradero de ejecución; CE-106 ha
> verificado el canario y su reversión a través del ejecutor integrado.
> No se ha modificado ni activado el comparador publicado.

## 1. Mandato y fuente de verdad

Convertir «Buscar productos más económicos» en una comparación de equivalentes
verificados del mismo formato: primero demostrar la equivalencia y después
comparar el precio. Priorizar precisión y confianza sobre cantidad de resultados.

Este documento es el **plan maestro de ejecución**. Se sigue en orden, sin saltar
fases ni rebajar criterios para cerrar una tarea.

- [COMPARADOR-ESTRICTO.md](COMPARADOR-ESTRICTO.md): auditoría, ejemplos y evidencia
  del 2 de septiembre de 2026.
- Este plan: decisiones de producto, trabajo por fases, controles y aceptación.
- [Registro de decisiones CE-003](docs/comparator-strict/decisions.md): contrato
  de D01–D14, piloto, mensajes y cuota; CU-01 corregida y registrada, no implementada.
- [Presupuesto CE-004](docs/comparator-strict/budget.md) y
  [matriz de fuentes/zonas](docs/comparator-strict/source-zone-matrix.md): cuatro
  tiendas y dos CP, límites de carga y responsables aceptados; no implementados.
- CE-005: [vigencia](docs/comparator-strict/freshness-policy.md) y
  [criterios de aceptación](docs/comparator-strict/acceptance.md) aprobados;
  FR-02 confirmada: catálogo activo y versiones, sin TTL comercial de 24 h.
  Sustituye FR-01; QA-01 y G0 aceptados por el propietario al ordenar cerrar
  CE-005 y empezar CE-100. Contrato aprobado, todavía no implementado.
- CE-100 cerrada por CE-SEQ-003: [acta del propietario](docs/comparator-strict/CE-100-owner-closure.md).
  Historial: [diagnóstico de preparación](docs/comparator-strict/CE-100-readiness.md)
  y [evidencia](docs/comparator-strict/CE-100-evidence.json). Proyecto, permisos y
  salud puntual revisados; backups físicos listados, PITR desactivado y
  compute Micro confirmados. Falta línea base completa de rendimiento por
  gráficos de I/O/conexiones no disponibles. Sin escrituras ni cambios productivos.
- CE-101 completada: [inventario](docs/comparator-strict/CE-101-services-inventory.md),
  conexión local verificada y catálogo 1.3 confirmado por el propietario en su
  móvil. No es prueba de código nuevo ni concesión de acceso a CE-1.
- CE-102 completada: [guardas](docs/comparator-strict/CE-102-execution-guards.md).
  Integradas en CE-105/106 para dos operaciones F1 exactas, no SQL arbitrario.
- CE-103–106 completadas: [acta de cierre F1/G1](docs/comparator-strict/CE-105-106-closure.md).
  Base privada, 72 filas reales y 32 casos sintéticos, PG17 multisesión y
  recuperación PASS; canario remoto revertido con recibos persistidos.
  G1 no certifica el baseline de rendimiento ni activa el motor.
- CE-200 completada: [acta y siguiente paso](docs/comparator-strict/CE-200-closure.md).
  4.176 referencias activas y 5.189 observaciones locales verificadas; 6.000
  parejas únicas (4.000 de muestra estratificada / 2.000 difíciles) y 1.200 Q.
  Marco, cuotas, pesos y hashes congelados; sin etiquetas gold ni holdout.
  [CE-BU-002](docs/comparator-strict/CE-BU-002-corpus-authority.md) retira el techo
  acumulado de tiempo y amplía filas/transferencia para este corpus, sin nuevos
  servicios. Semilla CE-104 e historial conservados; no contados como corpus nuevo.
- CE-201/202 completadas como primera anotación por «adelante»:
  [acta](docs/comparator-strict/CE-201-202-water-closure.md) y
  [guía estricta de agua](docs/comparator-strict/CE-202-water-source-review-guide.md).
  El lote final registra 771 fuentes y compone 2.485 parejas de agua; 2.483 son
  nuevas y E11/E16 no se duplican. Unión **6.000/6.000**, cero pendientes.
  En agua: 410 rechazos, 595 exclusiones y 1.480 abstenciones. Ocho fichas en
  disputa afectan a 68 parejas. Aquarel botella 1,5 L Consum/Mercadona es el
  primer equivalente íntegro respaldado: mismo GTIN global válido y formato
  exacto, sin oposición documental. No es ahorro elegible: comercio bilateral
  por CP sigue desconocido. Cero gold, revisión independiente, CE-203 o G2.
  Generador offline, hashes y capas anteriores intactas; sin consulta al proyecto,
  cambios de app/SQL/syncs/embeddings ni integraciones nuevas.
- CE-203 iniciado por «adelante»: [selección y estado](docs/comparator-strict/CE-203-progress.md)
  y [guía ciega](docs/comparator-strict/CE-203-owner-review-guide.md). Sorteo
  reproducible de 1.200/6.000 (20 %) estratificado por familia/cohorte, más las
  175 parejas disputadas; 39 solapan y el total queda en **1.336 casos**. Libro
  local sin propuestas ni predicciones, dividido en 54 lotes. Hay 0 respuestas
  del propietario, 0 arbitrajes y 0 gold: CE-203 y G2 permanecen abiertas.
- [CONTEXTO.md](CONTEXTO.md) y [HANDOFF.md](HANDOFF.md): estado real del repositorio
  y de producción; revisar al iniciar y cerrar cada fase.
- [COMPARATIVA.md](COMPARATIVA.md): diseño histórico; no usar sus reglas de
  equivalencia entre tamaños como especificación de CE-1.

Si una propuesta de la auditoría entra en conflicto con este plan, prevalece
este plan para CE-1. Los hechos históricos no se reescriben como si las mejoras
ya existieran.

### Qué cambia respecto a las primeras propuestas del chat

1. Cantidad nominal exacta; se retira la propuesta de tolerancia genérica del
   0,5 %. Solo se normalizan unidades y representación decimal.
2. El orden de palabras no define la identidad, pero se conserva el significado
   de negaciones, ingredientes, variantes y preparación.
3. Sabor, azúcar añadido, declaraciones sobre azúcar y edulcorantes son
   dimensiones separadas, no un único campo de opciones excluyentes.
4. «Natural» no equivale automáticamente a «sin azúcar añadido».
5. Un GTIN igual ayuda a demostrar identidad, pero no permite ignorar conflictos
   de formato, precio, disponibilidad o ubicación.
6. Open Food Facts ya existe para nutrición; se evalúa ampliar su uso, no
   instalarlo de cero. Un `off_code` nutricional no identifica necesariamente
   el multipack vendido.
7. Ante una incidencia, la salida segura es retirar el distintivo o desactivar
   CE-1; no volver ciegamente a resultados legacy que sabemos dudosos.
8. Se sustituye la prohibición general de tocar producción por ejecución
   controlada sobre el Supabase actual. La activación para usuarios y el trabajo
   de base de datos son hitos distintos.
9. FR-02 sustituye la propuesta de vigencia de 24 h por validación contra el
   catálogo activo tras sus sincronizaciones. El ahorro se reevalúa ante cambios
   de precio aunque no haga falta regenerar el embedding; no promete tiempo real.

### 1.1. Decisión CE-ENV-001 — Trabajo directo en Supabase

**Origen:** instrucción del usuario del 2 de septiembre de 2026: modificar las
tareas relacionadas con no tocar producción y poder trabajar en Supabase
directamente. Sustituye la restricción de entorno de la versión 1.0, no las
reglas de equivalencia ni los criterios de calidad.

**Autorizado dentro de la fase correspondiente:**

- Consultas y diagnósticos acotados del proyecto real desde F0.
- Crear y modificar objetos de CE-1, aplicar migraciones versionadas e instalar
  extensiones justificadas por el plan cuando se hayan superado sus controles.
- Normalizar/enriquecer datos y reconstruir resultados por lotes delimitados;
  preferir almacenamiento propio de CE-1 mientras no se active el nuevo motor.
- Probar nuevas RPC y procesos en ese mismo proyecto con acceso controlado,
  sin cobrar cuota ni cambiar resultados de usuarios ajenos a la prueba.
- Modificar objetos compartidos cuando sea necesario para CE-1, tras identificar
  dependencias, comprobar compatibilidad y preparar reversión específica.

No pedir otra autorización solo porque el destino verificado sea producción.
Sí mantienen aprobación específica los costes nuevos no acordados, operaciones
destructivas o reconstrucciones masivas, ampliaciones de alcance y la activación
para usuarios de F8. La autorización no incluye ejecutar migraciones pendientes
ajenas a la fase ni saltar los gates.

Una separación lógica de tablas/RPC **no aísla CPU, I/O, conexiones ni locks**:
puede afectar a usuarios aunque el flag esté apagado. Reducir y observar ese
riesgo, sin prometer impacto cero. Un entorno local sigue siendo útil para tests
destructivos o carga intensa, pero no es prerrequisito del trabajo remoto.

### 1.2. Decisión CE-SEQ-001 — CE-101 con CE-100 pendiente

**Autoridad:** «Empieza con CE-101 y dejamos pendiente cerrar CE-100», instrucción
del propietario el 2026-09-02. Se permite avanzar dentro de F1 con inventario,
comprobación de conexión y preparación del acceso de pruebas de CE-101 sin
esperar al cierre de CE-100. No equivale a aceptar su baseline incompleto.

CE-100 conserva sus pendientes. CE-101 se limita a documentación, lecturas
acotadas y preparación local: sin cambiar Auth, Storage, funciones, cron,
colas o webhooks, activar CE-1, crear cuentas ni generar notificaciones/compras.
Las escrituras, ensayos de carga y ampliaciones siguen sujetos a BU-01 y a
los controles correspondientes. No se aprueba G1 ni se inicia CE-102 por arrastre.

### 1.3. Decisión CE-SEQ-002 — Continuación condicionada a CE-102 y CE-103

**Autoridad:** «Cuando termines empieza la tarea CE-102 y si todo es correcto
empieza la CE-103», instrucción del propietario el 2026-09-03.

Al completar realmente CE-101, iniciar CE-102 sin pedir otra autorización.
Si sus guardas y pruebas son correctas, comenzar CE-103. La comprobación móvil
se resuelve mediante CE-VAL-001; no se simula una prueba de código no publicado.

La autorización permite avanzar en implementación local de guardas y en la
reconciliación de migraciones una vez cumplida la secuencia; no convierte el
baseline incompleto de CE-100 en suficiente para escribir. Mientras falten
sus métricas, CE-103 se limita a lecturas y preparación/pruebas locales según
BU-01. No aplicar el conjunto de migraciones legacy ni cambiar servicios
globales. G1 y la activación pública F8 siguen pendientes.

### 1.4. CE-VAL-001 — Comprobación móvil y cierre de CE-101

El propietario usa su móvil y la app de producción 1.3. Tras aclarar que CE-1
no había modificado código de la app ni Supabase, confirma «pues si, se abre
el catalogo correctamente confirmado». Se acepta esa comprobación básica y
se cierra CE-101 junto al inventario/conexión ya verificados. Exigir instalar
un build de desarrollo en este punto era prematuro.

No se acredita un build de desarrollo, EAS remoto, token/UID ni el comparador
nuevo. El acceso documental de `@rruizosma` sigue inactivo; la identidad real
se verifica al habilitar las guardas servidor y el código de app no publicado
se probará en su fase. CE-VAL-001 no relaja equivalencia, CU-01, BU-01 o G1.

### 1.5. CE-SEQ-003 — Cierre de CE-100 y continuación de F1

El propietario ordena «Cierra CE-100 y continua con el resto de tareas» el
2026-09-03. [Acta](docs/comparator-strict/CE-100-owner-closure.md): cierre por
aceptación de las limitaciones, no PASS del baseline. Autoriza continuar
CE-103–106 con cambios propios mínimos, controles de presupuesto/permisos,
salud actual y reversión. No autoriza costes adicionales, carga masiva,
activación pública ni cierre de G1 sin sus pruebas. Esta decisión posterior
sustituye el bloqueo de secuencia de CE-100 en los informes históricos.

## 2. Alcance del primer lanzamiento

### Incluido

- Funcionalidad bajo demanda desde la ficha de un producto.
- Tres familias piloto: agua, yogures y patatas congeladas de formato fijo.
- Supermercados elegidos por el usuario que superen controles de datos y zona.
- Equivalentes de marcas distintas, incluidas marcas blancas.
- Firma de producto y formato, evidencia, precios, ubicación, caché e interfaz.
- Pruebas, métricas, feedback y despliegue reversible.

### Fuera del primer lanzamiento

- Carne, charcutería y embutidos: cuarentena inicial.
- Todo producto al corte, a granel, de peso variable o aproximado.
- Optimización de cesta, rutas entre supermercados o comparación de envío.
- Conversión automática de tamaños distintos a una «compra equivalente».
- Surtidos/multipacks heterogéneos cuya composición no sea verificable.
- Conservas con peso neto/escurrido ambiguo, limpieza por dosis y otros tipos
  complejos hasta disponer de políticas específicas.
- Rediseño del comparador manual del catálogo, nutrición o buscador general.
- Nuevas promesas comerciales en la web antes de publicar la funcionalidad.

No se modifican otros módulos para mejorar artificialmente las métricas de CE-1.
La expansión posterior requiere repetir las puertas de calidad por familia.

## 3. Evidencia que justifica el proyecto

Fotografía auditada; no es una medida estadística de todos los resultados vistos
por usuarios ni una consulta actualizada en cada apertura de este documento.

| Hallazgo | Evidencia | Trabajo que obliga a realizar |
|---|---|---|
| Mucho vector y pocos datos estructurados | 198.449 publicados; 198.429 con vector; 145.824 con cantidad | Enriquecer identidad/formato antes de buscar más candidatos |
| Cantidad no demostrable en caché | 13.098 de 16.755 parejas `comparable` sin ambas cantidades: 78,2 % | Desconocido deja de ser compatible |
| Tamaños muy diferentes admitidos | 1.186 de 3.657 parejas con cantidad fuera de 0,5×–2× | Igualdad de firma, no ratio hasta ×12 |
| Yogur 1 kg frente a 125 g o 4×110 g | Parejas reales en caché | Contar envases y contenido por envase |
| Patatas ultracongeladas sin cantidad frente a 500 g–2,5 kg | Parejas reales en caché | Obtener peso estructurado del origen |
| Precio de Froiz sospechoso | 225 g almacenado como 0,225 €/kg en ejemplos | Validación aritmética y cuarentena por fuente |
| Familia materializada incompleta | 4.863 registros con `category_family` | Taxonomía común y estados explícitos |
| Orden de palabras | «yogur griego»/«griego yogur»: score léxico 0,925 y guard de identidad compatible | Conservar equivalencia de redacción |
| Subtipo griego no protegido suficientemente | Guard actual admite «yogur griego»/«yogur natural» | Tipo, sabor y endulzado como puertas independientes |
| Recuperación HNSW filtrada incompleta | Trabajo local pendiente para Bonpreu/bonÀrea | Evaluar recall, sin confundirlo con precisión |
| Resultado global abierto con filtro local | Fallback local ya preparado en los modales | El precio global no se convierte en precio local por abrir la ficha |

La cobertura de la columna `category_family` no es idéntica a la cobertura del
clasificador calculado por las RPC. Y una pareja de caché no equivale siempre a
una pareja finalmente mostrada: existen filtros posteriores. Los ejemplos
sirven como regresiones; no se extrapola un porcentaje de error desde ellos.

## 4. Decisiones obligatorias de CE-1

| ID | Regla |
|---|---|
| D01 | Recuperar candidatos y decidir equivalencia son operaciones distintas |
| D02 | Solo se compara precio después de superar todas las puertas |
| D03 | Familia, subtipo y atributos relevantes deben estar conocidos y ser compatibles |
| D04 | Desconocido no equivale a ausente; desconocido/desconocido tampoco demuestra igualdad |
| D05 | Igualdad nominal de número de envases, contenido por envase y contenido total |
| D06 | El orden de palabras puede cambiar sin alterar identidad; no se borran negaciones |
| D07 | No convertir masa en volumen sin evidencia específica; CE-1 se abstiene |
| D08 | GTIN y revisión humana no saltan controles comerciales ni conflictos |
| D09 | Fuente de precio incoherente queda fuera del distintivo |
| D10 | Precio y disponibilidad observados deben ser recientes y aplicables al usuario |
| D11 | No afirmar ser «el más barato» del mercado ni de tiendas no evaluadas |
| D12 | IA y datos externos proponen/enriquecen; las reglas verificadas deciden |
| D13 | Producción, clientes antiguos y pipeline existente se preservan |
| D14 | Una integración nueva solo se adopta con mejora medida, coste aprobado y derecho de uso claro |

### 4.1. Identidad y variantes

Ejemplo lógico, no esquema SQL desplegado:

```text
family: yogurt
style: greek
flavour: plain
added_sugar: no
sweeteners: no
sugar_claim: no_added_sugar
fat_class: whole
sale_mode: fixed_pack
pack_count: 6
unit_content: 125 g
total_content: 750 g
```

Cada dato relevante conserva estado `known / unknown / conflicting`, valor,
fuente y fecha. `no` requiere evidencia; no se deduce de que no aparezca una
palabra. `sugar_claim` registra una declaración explícita, no se genera a
partir de gramos de azúcar nutricionales.

Reglas por piloto:

- **Agua:** mineral/manantial u otra clase acordada, gas/sin gas, sabor/aditivos,
  volumen, pack y formato comercial.
- **Yogur:** yogur frente a postre/kéfir; griego frente a estándar; base
  láctea/vegetal y especie cuando proceda; sabor, grasa, azúcar añadido,
  edulcorantes y variantes dietéticas explícitas.
- **Patatas congeladas:** congelado frente a fresco/aperitivo; prefrita frente a
  cruda; corte, piel, condimentación y preparación relevante.

La política por familia lista qué campos son obligatorios. No exigir atributos
sin significado para esa familia ni aceptar `unknown` en los obligatorios.

**Caso natural/azucarado:** «yogur griego natural» no se empareja con
«yogur griego azucarado» usando solo el parecido del nombre. Se comprueban los
campos de endulzado; si no se conocen, se abstiene. El catálogo auditado contiene
«griego natural con azúcar», demostrando por qué sabor y endulzado deben
separarse.

### 4.2. Cantidad y formato

- `1 L = 1000 ml`; `125 g = 0,125 kg`: conversión exacta, sí.
- `125 g ≠ 124 g`: no usar una tolerancia para unir SKUs.
- `6×125 g ≠ 1×750 g`: mismo total no implica mismo formato.
- `1×2 kg ≠ 2×1 kg`: distinta estructura de envase.
- `1×1 L ≠ 6×1 L`: botella y pack son compras distintas.
- «1 kg» como unidad de referencia de precio no demuestra que el envase pese
  1 kg.
- Una cifra aproximada, rango o conflicto no se convierte en cantidad fija.
- No asumir `pack_count=1` solo porque no se haya detectado un pack.

Usar decimales exactos o cantidades enteras en unidades pequeñas. No hacer
igualdad comercial con floats. Las tolerancias de redondeo del precio unitario
se modelan en el validador de precios y nunca relajan la cantidad nominal.

### 4.3. Carne y productos variables

La primera versión los excluye. Para reactivar una referencia hará falta una
política aprobada de su familia y evidencia de envase fijo.

El futuro comparador por kg de productos al corte sería otro modo explícito,
sin ahorro de envase ni mezcla con CE-1.

### 4.4. Resultado y cuota

Contrato registrado en [decisions.md](docs/comparator-strict/decisions.md),
CE-003 completada. CU-01 revoca el consumo por equivalentes evaluados sin ahorro:
debe haber al menos una alternativa válida más económica en la respuesta final.
El cupo actual de tres búsquedas por cuenta no se modifica. Pendiente de
implementación; F0 y G0 no quedan aceptados por esta decisión.

- La lista principal muestra solo equivalentes estrictos más baratos.
- Máximo dos por tienda; no rellenar huecos con opciones dudosas.
- Entre candidatos ya válidos, ordenar por coste del envase; en empate,
  identidad exacta, calidad de evidencia y frescura.
- Si se evaluaron equivalentes pero no hay ahorro: «No hemos encontrado
  opciones comparables más económicas entre los precios comprobados».
- Si faltan datos: explicar que no puede verificarse el formato o el precio.
- No incluir productos solo parecidos en la primera versión; bloque separado
  únicamente en una ampliación posterior.
- Conservar el cupo comercial actual. No cobrar errores, timeouts,
  `not_ready`, búsquedas sin ahorro válido ofrecido ni trabajo en sombra.
- Una comparación final correcta solo puede consumir un uso si incluye al
  menos un equivalente válido más económico en su respuesta. Varios resultados
  consumen un único uso. Idempotencia por petición evita descuentos duplicados.

El resultado debe superar todas las puertas, incluidos precio, zona y fecha,
y el filtro de precio estrictamente inferior para el mismo formato. El recuento
se hace sobre la respuesta final, no sobre candidatos internos: un equivalente
igual de caro o más caro no consume. Las respuestas provisionales o con errores/
pendientes de ejecución tampoco consumen. Una pérdida de respuesta
no demuestra rollback del servidor: recuperar la petición original y su cuota,
sin repetir el descuento ni afirmar que no se consumió hasta confirmarlo.

## 5. Diseño técnico objetivo

### 5.1. Capas

```text
Datos del supermercado
  → normalización + procedencia + conflictos
  → perfil estructurado de identidad y formato
  → candidatos: firma estructurada / GTIN / léxico / vector
  → puertas de identidad, variantes y formato
  → precio, promoción, ubicación, disponibilidad y fecha
  → ranking entre equivalentes válidos
  → respuesta explicable y distintivo de ahorro
```

No hay llamadas externas ni generación de embeddings dentro de una transacción
de compra/comparación. El enriquecimiento corre en segundo plano con presupuesto.

La ruta estructurada consulta familia, variantes y formato por tienda/zona;
no depende de que el producto más barato aparezca entre los vecinos vectoriales.
Vector y léxico complementan la recuperación, pero un límite por similitud no
debe eliminar equivalentes estructurados antes de comparar sus precios. Medir
contra una búsqueda exhaustiva de referencia dentro del corpus de evaluación.

### 5.2. Contratos lógicos a definir en F3/F6

1. **Perfil de producto:** claves tienda/producto, familia, atributos, formato,
   modo de venta, fuentes y versiones de parser/taxonomía.
2. **Observación comercial:** precio total, base y precio unitario, moneda,
   promoción, ubicación, disponibilidad y fecha de observación.
3. **Decisión de pareja:** relación, puertas, razones de rechazo, referencias a
   evidencias y versiones; score de recuperación separado de decisión.
4. **Estado por tienda:** evaluada, sin equivalente, datos insuficientes,
   no local, caducada, error o pendiente.
5. **Respuesta cliente:** resultados, cobertura, motivo de abstención,
   frescura, idempotencia/cuota y versión del motor.

No convertir estos cinco contratos en cinco tablas obligatorias sin medir.
Los filtros frecuentes deben tener columnas tipadas; JSON puede conservar
evidencia variable con validación.

### 5.3. Cache e incrementalidad

- Reutilizar los vectores vigentes: el cambio de formato no obliga a regenerar
  200.000 embeddings.
- Hash/versionado independiente para identidad, formato y política.
- FR-02 añade dependencias comerciales y de catálogo por ámbito: altas, bajas,
  precio, disponibilidad y zona deben invalidar también resultados vacíos.
  Reconciliar la representación en cada cambio; regenerar vectores solo cuando
  cambie su input efectivo o falten. No condicionar un ahorro nuevo a un vector nuevo.
- Caché de candidatos no equivale a caché indefinida de «es más barato».
- Revalidar precio, publicación, zona y vigencia al servir.
- Invalidación por producto/lote; no bump por cada vector ni invalidación
  global por cada consulta.
- Claves incluyen origen, destinos, zona, versión y restricciones aplicables.
- Resultado pendiente responde rápido; enriquecimiento acotado e idempotente.
- No devolver como ahorro una respuesta caducada durante revalidación.

### 5.4. Seguridad y controles en Supabase compartido

- Credenciales administrativas solo en backend.
- RLS y privilegios mínimos en cualquier objeto expuesto.
- API pública mínima; auxiliares internas no invocables por el cliente.
- No cambiar autenticación, PKCE ni claves por usuario de AsyncStorage.
- Verificar y registrar el project ref real antes de cada operación; no confiar
  solo en `.env`, el directorio o el proyecto enlazado por la CLI.
- Los scripts admiten el destino productivo autorizado con modo de aplicación
  explícito, conjunto de objetos/filas permitido y límites de trabajo. Rechazar
  destinos desconocidos y operaciones fuera de esa lista, no toda producción.
- Preferir objetos propios, auxiliares en esquema privado y RPC nueva; comprobar
  permisos reales y revocar acceso público no necesario desde su creación.
- App de desarrollo contra el mismo backend, sin activar CE-1 para la app
  publicada. Un flag de interfaz no sustituye el control de acceso del servidor.
- No exportar perfiles, listas, emails ni pedidos. Casos sintéticos en fixtures
  o tablas de prueba separadas; nunca contaminar los espejos publicados.
- No desactivar globalmente emails, push, compras, cron o webhooks para hacer
  pruebas; evitar sus efectos solo en las rutas/cuentas de test identificadas.
- Código postal real no se envía a proveedores externos.

### 5.5. Procedimiento obligatorio para operaciones remotas

1. Identificar fase, tarea, destino, objetos, filas y efecto esperado; revisar
   diff/SQL y dependencias antes de aplicar. No ejecutar todas las migraciones
   locales pendientes por arrastre.
2. Comprobar salud y carga, y fijar máximo de filas, concurrencia, duración y
   criterio de parada. Usar `lock_timeout`/`statement_timeout` acotados a la
   sesión u operación, no relajar límites globales para superar un fallo.
3. Guardar evidencia previa y verificar recuperación disponible; en cambios de
   datos existentes conservar valores previos y claves del lote afectado.
4. Aplicar primero un lote/canario mínimo, observar y ampliar solo dentro del
   presupuesto. Transacciones cortas; ninguna llamada externa dentro de ellas.
5. Verificar datos, contratos de clientes anteriores, permisos, errores, locks
   y latencia tras cada cambio; registrar migración, recuentos y resultado.
6. Ante degradación, detener trabajo CE-1 y revertir su cambio concreto cuando
   sea seguro. Apagar el flag no detiene por sí solo un backfill ni libera un
   lock: cancelar únicamente los jobs/sesiones CE-1 identificados.

Priorizar franjas de menor tráfico para DDL, backfills y pruebas con carga;
las lecturas pequeñas y revisiones no necesitan esperar a una ventana global.
La reversión no consiste en restaurar toda la BD ni en borrar tablas compartidas.
Tampoco se considera un `ROLLBACK` aislamiento de recursos o de efectos externos.

## 6. Evaluación de integraciones

**Conclusión:** no hace falta otro buscador ni otra base vectorial para empezar.
La necesidad prioritaria es calidad de datos y validación. Ningún servicio
externo se convierte en requisito del botón de búsqueda.

| Opción | Situación observada | Decisión para CE-1 |
|---|---|---|
| Datos estructurados de retailers | Ya existen espejos y syncs | Obligatorio: mejorar extracción y trazabilidad |
| pgvector, pg_trgm, unaccent | Presentes en auditoría | Reutilizar; no sustituir |
| pgmq, pg_cron, pg_net, Vault | Presentes en auditoría | Reutilizar controles; no activar trabajos ahora |
| pgTAP | No instalado en la fotografía auditada | Recomendado desde F1; suite completa en local/CI y smoke remoto acotado; instalación en Supabase si se justifica |
| pg_jsonschema | Disponible, no instalado en auditoría | Adoptar en F3 solo si se persiste evidencia JSON con esquema; medir coste |
| Open Food Facts | Ya integrado para nutrición | Piloto de ampliación offline en F4, condicionado |
| Verified by GS1 | No se identificó integración en el código revisado | Piloto opcional para identidad/GTIN en F4 |
| GS1 GPC/GDM | Referencia de clasificación | Evaluar mapeo; no prometer cobertura ni acceso contratado |
| isn | Existe ya validador local GTIN | No añadir por ahora: duplicaría parte de `scripts/lib/gtin.mjs` |
| hypopg / index_advisor | Candidatos de diagnóstico | Solo si F6 detecta necesidad de índices |
| pgroonga / fuzzystrmatch / buscador externo | No resuelven la decisión comercial | Fuera del alcance inicial |
| Clasificador/reranker de IA adicional | No necesario para la base determinista | Experimento posterior si aporta cobertura sin degradar precisión |

Recomprobar inventario en F0; «disponible» no significa «instalado». Este
documento no instala ni contrata ninguna opción.

### 6.1. Open Food Facts: ampliar con cautela

El repositorio ya contiene [openFoodFacts.ts](src/api/openFoodFacts.ts) y
[enrich-bonarea-off.mjs](scripts/enrich-bonarea-off.mjs). El primero obtiene
nutrición; el segundo documenta que `off_code` puede corresponder al envase
individual aunque el supermercado venda un pack.

Por tanto:

- no convertir `off_code` en GTIN global del pack;
- no heredar cantidad, precio o formato comercial desde ese vínculo;
- las coincidencias por nombre sirven para revisión, no como identidad exacta;
- no inferir azúcar añadido de los azúcares totales nutricionales;
- no alterar la ficha nutricional existente como efecto colateral.

La API es colaborativa, tiene límites y exige identificación del consumidor.
Para volumen, su documentación recomienda exportaciones de datos. La licencia y
las condiciones de reutilización deben aprobarse antes de incorporar datos a
una base combinada; no asumir que basta con citar la fuente. Referencia:
[documentación oficial de OFF](https://openfoodfacts.github.io/openfoodfacts-server/api/).

El adaptador nuevo verificará la versión y endpoints vigentes en F4. No copiar
sin revisión el endpoint v2 existente ni migrar nutrición como parte de CE-1.

### 6.2. GS1

Puede verificar identidad a partir de GTIN; el acceso API avanzado se gestiona
con la organización miembro correspondiente. No es un catálogo gratuito de
precios ni identifica por sí mismo equivalentes de marcas blancas. Referencia:
[Verified by GS1](https://support.gs1.org/support/solutions/articles/43000734077-what-is-verified-by-gs1-).

El piloto debe medir campos realmente recuperables, formato comercial, cobertura
española y coste. No contratar por una expectativa genérica de «más precisión».

### 6.3. Gate para adoptar un enriquecedor externo

Piloto estratificado de al menos 500 referencias del ámbito con carencias,
siempre separado del holdout final:

1. registrar aciertos, conflictos, abstenciones y disponibilidad por campo;
2. auditar manualmente todas las aceptaciones del piloto;
3. mejora de al menos 5 puntos porcentuales de perfiles completos elegibles
   en ese ámbito, sin errores críticos detectados;
4. presupuesto por 1.000 referencias y mantenimiento mensual aprobado;
5. licencia/retención/procedencia aceptadas;
6. prueba de desconexión: el comparador funciona sin el proveedor;
7. nueva evaluación final del motor tras incorporar los datos.

Si falla, decisión `NO ADOPTAR` con informe; F4 puede cerrarse sin integración.
La muestra piloto no demuestra por sí sola una precisión universal.

### 6.4. Referencias de plataforma para la ejecución

- [pgTAP en Supabase](https://supabase.com/docs/guides/database/extensions/pgtap)
  permite probar funciones, estructura y políticas.
- [pg_jsonschema](https://github.com/supabase/pg_jsonschema) valida JSON/JSONB;
  usar solo funciones disponibles en la versión realmente instalada.
- [Supabase Branching](https://supabase.com/docs/guides/deployment/branching)
  proporciona entorno y credenciales propios, sin datos de producción por
  defecto. Es opcional en CE-1; crear una rama requiere autorización de coste.
- [Seguridad de la API](https://supabase.com/docs/guides/api/securing-your-api)
  y [timeouts](https://supabase.com/docs/guides/database/postgres/timeouts):
  comprobar exposición/permisos y acotar operaciones del proyecto compartido.
- El changelog consultado advierte cambios de
  [selección de versiones de extensiones](https://supabase.com/changelog/extension-version-pinning-ignored):
  registrar la versión efectiva y no asumir que un pin SQL fija la instalada.
- Si la ejecución usa la Management API para logs, verificar la transición
  [logs.all → logs](https://supabase.com/changelog/48235-migration-of-supabase-management-api-logs-all-analytics-endpoint-to-logs-endpoint).
  No alterar monitorización ajena a CE-1 sin verificar afectación.

## 7. Cómo se gobierna el proyecto

### Roles

- **Responsable de producto:** usuario/propietario de QuéFalta; aprueba alcance,
  costes, cambios de política y activación para usuarios. Ya ha autorizado el
  trabajo directo en producción dentro de CE-ENV-001.
- **Responsable técnico:** quien implemente la fase; conserva compatibilidad,
  pruebas, versiones y evidencias.
- **Responsable de validación:** revisa etiquetas y resultados; las disputas no
  se resuelven haciendo coincidir la etiqueta con la predicción del motor.
  El propietario confirma que hará la segunda revisión de CE-203 (RV-01,
  2026-09-02); responsable asignado, revisión todavía no realizada.

No se presupone equipo contratado ni se crean tareas externas con este plan.

### Estados y reglas de avance

`PENDIENTE → EN CURSO → EN VALIDACIÓN → ACEPTADA`.
Una fase puede quedar `BLOQUEADA` o volver a `EN CURSO`.

- Solo una fase principal en curso; subtareas independientes dentro de ella
  pueden ejecutarse en paralelo si se autoriza el equipo.
- No se inicia F(n+1) sin acta de aceptación de F(n).
- El acta identifica evidencia, commit, entorno, resultados y responsable.
- Las pruebas técnicas pueden cerrar una fase dentro de una implementación
  autorizada. La autorización CE-ENV-001 cubre el destino productivo; no repetir
  esa solicitud para cada cambio ordinario dentro de fase y presupuesto.
- Costes nuevos, alcance, política, operaciones destructivas/masivas y la
  activación para usuarios siguen requiriendo la decisión correspondiente.
- Cambiar una regla, métrica o proveedor exige registro de decisión antes de
  ejecutar; jamás rebajar un umbral después de ver un fallo para aprobarlo.
- Si cambia parser, taxonomía, proveedor o política, se reabren los gates
  afectados y se invalida la evaluación final anterior.
- No mezclar migraciones/PR de CE-1 con arreglos ajenos.

### Secuencia obligatoria

| Fase | Resultado esperado | Depende de | Estado actual |
|---|---|---|---|
| F0 | Contrato de producto y baseline congelados | Este plan | ACEPTADA / G0 PASS |
| F1 | Operación segura en el Supabase actual | F0 | COMPLETADA / G1 PASS acotado; CE-100 cerrada con limitaciones |
| F2 | Dataset y evaluación independientes | F1 | EN CURSO / CE-200 completada; etiquetado, particiones y evaluación pendientes |
| F3 | Identidad, formato y procedencia estructurados | F2 | PENDIENTE |
| F4 | Decisión medida sobre enriquecimiento | F3 | PENDIENTE |
| F5 | Precio, promoción, disponibilidad y zona fiables | F4 | PENDIENTE |
| F6 | Motor estricto, API y caché | F5 | PENDIENTE |
| F7 | Interfaz y candidato de lanzamiento validado | F6 | PENDIENTE |
| F8 | Activación controlada y cierre operativo | F7 + autorización | PENDIENTE |

Las rutas de entregables se crean al ejecutar cada tarea. Ya existen el
[baseline de CE-000](docs/comparator-strict/F0-baseline.md) y el
[inventario remoto de CE-001](docs/comparator-strict/CE-001-supabase-inventory.md),
con su JSON de evidencia, además de la
[revisión independiente de CE-002](docs/comparator-strict/CE-002-independent-review.md).
El [registro CE-003](docs/comparator-strict/decisions.md) está completado, con
CU-01 corregida tras la respuesta del usuario. Su cierre individual no aprobó
F0: el cierre conjunto se registra después en CE-005, sin aprobar otros gates.
CE-004 tiene [presupuesto](docs/comparator-strict/budget.md),
[matriz de fuentes/zonas](docs/comparator-strict/source-zone-matrix.md) y
[evidencia remota](docs/comparator-strict/CE-004-evidence.json), con SC-01/BU-01/RV-01
confirmadas. CE-005 completada y G0 aceptado en
[acceptance.md](docs/comparator-strict/acceptance.md): FR-02 y QA-01 confirmadas,
sin caducidad comercial por edad. CE-100 iniciada por autorización del propietario.

## 8. F0 — Congelar contrato y reconciliar el estado real

**Objetivo:** eliminar ambigüedades antes de codificar.

Tareas:

- [x] CE-000: leer plan, auditoría, CONTEXTO y HANDOFF; registrar commit y
  cambios locales existentes sin sobrescribirlos. Evidencia:
  [F0-baseline.md](docs/comparator-strict/F0-baseline.md), cierre 2026-09-02.
- [x] CE-001: reconciliar RPC desplegadas, migraciones locales/remotas,
  extensiones, pipeline, horarios de sync y destinos de entorno mediante
  consultas de metadatos acotadas en el Supabase real. Evidencia:
  [CE-001-supabase-inventory.md](docs/comparator-strict/CE-001-supabase-inventory.md),
  cierre 2026-09-02; límites de verificación externa registrados.
- [x] CE-002: identificar por separado el ajuste HNSW pendiente y la resiliencia
  del modal; no darlos por desplegados ni aplicarlos por dependencia implícita.
  Evidencia: [CE-002-independent-review.md](docs/comparator-strict/CE-002-independent-review.md),
  cierre 2026-09-02. Revisión completada; parches no aprobados tal cual para CE-1.
- [x] CE-003: ratificar D01–D14, tres familias piloto, cuarentenas y política de
  cuota/mensajes. Evidencia: [decisions.md](docs/comparator-strict/decisions.md),
  cierre 2026-09-02; CU-01 exige al menos un resultado válido más económico.
- [x] CE-004: fijar tiendas/zonas del piloto, presupuesto de infraestructura,
  llamadas externas y cálculo, responsables y límites de carga en producción.
  Evidencia: [budget.md](docs/comparator-strict/budget.md) y
  [source-zone-matrix.md](docs/comparator-strict/source-zone-matrix.md).
  Aceptados Mercadona/Carrefour/Consum/Plusfresc y CP 08006/25001; sin nuevas
  contrataciones/ampliaciones y con los límites de carga documentados. El
  propietario revisará los casos. SC-01/BU-01/RV-01 confirmadas; cierre 2026-09-02.
- [x] CE-005: congelar umbrales de la sección 17 y política de vigencia; registrar
  cualquier ajuste previo con justificación.
  COMPLETADA: [política de vigencia](docs/comparator-strict/freshness-policy.md),
  [protocolo de aceptación](docs/comparator-strict/acceptance.md) y
  [cálculos de diseño](docs/comparator-strict/CE-005-evidence.json) preparados.
  FR-01 (24 h) descartada; FR-02 confirmada: catálogo activo e invalidación por
  cambios. QA-01 confirmada y G0 aceptado el 2026-09-02 mediante «cierra CE-005
  y empieza CE-100». Cierre documental, no métricas del motor alcanzadas.

**Entregables:** `docs/comparator-strict/F0-baseline.md`,
`docs/comparator-strict/CE-001-supabase-inventory.md` y su JSON,
`docs/comparator-strict/CE-002-independent-review.md` y su JSON,
`decisions.md`, `budget.md`, `source-zone-matrix.md`, `CE-004-evidence.json`,
`freshness-policy.md`, `acceptance.md` y `CE-005-evidence.json`.

**Gate G0:** estado local/productivo distinguido; ninguna decisión bloqueante
abierta; producto aprueba alcance y presupuesto. Registrar CE-ENV-001 como
autorización de trabajo directo en Supabase y precisar sus límites operativos.

**Límite de F0:** inventario y decisiones, todavía sin migraciones o backfills.
Es una dependencia de las fases, no una prohibición de trabajar en producción.

## 9. F1 — Preparar la operación segura en el Supabase actual

**Objetivo:** poder implementar directamente en el proyecto real con destino,
permisos, carga, compatibilidad y recuperación controlados.

Tareas:

- [x] CE-100: verificar el Supabase actual, project ref, permisos disponibles,
  salud, backups/recuperación y límites de carga. No crear otro proyecto como
  requisito ni asumir que existe PITR por defecto.
  CERRADA por decisión del propietario, CE-SEQ-003: [acta de límites](docs/comparator-strict/CE-100-owner-closure.md).
  No es un PASS de rendimiento. Historial: autorizado tras aceptar G0. Diagnóstico de
  lectura, sin escrituras, migraciones, restauraciones ni activación de jobs.
  [Informe](docs/comparator-strict/CE-100-readiness.md): ref/permisos, copias
  físicas, PITR no activado, Micro y cuotas comprobados. [Revisión 2026-09-03](docs/comparator-strict/CE-100-capacity-recheck.md):
  Metrics API accesible para CPU/memoria/I/O/conexiones sin instalaciones;
  faltaban latencia p95, errores y cobertura temporal comparables. No convertir
  medias o logs incompletos en baseline válido por el cierre administrativo.
  [Prueba de lectura ejecutada](docs/comparator-strict/CE-100-catalog-probe-results.md):
  61/61 respuestas válidas más una lectura previa; p95 3,49 s. La cadencia
  dejó 18/14/18 muestras por tramo de 5 min, menos de 20: baseline incompleto
  por coordinación de la medición. Esa medición no constituye PASS. Consumo conservador
  20,94/22 MiB tras verificar cuota incluida y permiso condicionado a no
  añadir coste; excepción solo hoy. Sin escrituras ni configuración cambiada.
  Corregir primero la instrumentación local; no repetir otra ventana hoy.
- [x] CE-101: configuración local conectada al mismo Supabase; inventariar Auth,
  Storage, Edge Functions, cron, colas y webhooks sin cambiar su configuración
  global. Preparar acceso a CE-1 solo para pruebas identificadas.
  COMPLETADA por CE-VAL-001: [inventario](docs/comparator-strict/CE-101-services-inventory.md),
  conexión técnica y comprobación básica en móvil/producción 1.3 confirmadas.
  Acceso preparado documentalmente para `@rruizosma`, sin conceder permisos
  ni acreditar código nuevo. Motor no habilitado.
- [x] CE-102: guardas de destino y alcance: permitir producción verificada en
  modo aplicar explícito, rechazar otra ref y limitar objetos, filas y ejecución.
  COMPLETADA localmente: [guardas y pruebas](docs/comparator-strict/CE-102-execution-guards.md).
  Ejecución real, coordinación duradera y negativos de permisos verificados
  en CE-105/106 para el registro F1 acotado. No se modifica la app.
- [x] CE-103: reconciliar migraciones y crear, cuando sea necesario, la base
  aditiva de CE-1 con permisos mínimos. No resetear la BD ni desplegar por
  arrastre migraciones locales ajenas o ya aplicadas.
  COMPLETADA: [informe](docs/comparator-strict/CE-103-migration-readiness.md).
  80 entradas remotas/163 locales; 50 textos correlacionados, 28 no acreditados
  y 2 sin candidato en el inventario inicial, ahora acotadas a funciones ajenas
  y separadas. Solo base privada 20260903080621 aplicada, permisos cerrados.
  No interpretar locales sin historial como pendientes seguros ni ejecutar db push.
- [x] CE-104: obtener muestra acotada del catálogo real y mantener fixtures/
  cuentas de prueba identificadas, sin insertar productos falsos en catálogos
  publicados ni enviar emails/push o iniciar compras reales.
  COMPLETADA: [muestra/contrato](docs/comparator-strict/CE-103-106-progress.md),
  72 filas activas, 24 parejas y ocho escenarios sintéticos; @rruizosma sin
  acceso concedido. No equivale al dataset etiquetado/revisado de F2.
- [x] CE-105: configurar SQL/CI y pgTAP si procede; distinguir tests locales de
  smoke remoto seguro. No ejecutar pruebas destructivas en objetos compartidos.
  COMPLETADA: adaptador atómico y coordinación duradera integrados; PG17.6
  nativo, 16 grupos PASS de concurrencia, cancelación y recuperación. CI manual
  configurada/no ejecutada en GitHub; pgTAP no necesario para estos contratos.
- [x] CE-106: ensayar una operación mínima y su reversión sobre objetos propios
  de CE-1; verificar permisos, contratos legacy y salud antes/después.
  COMPLETADA: canario y compensación vía ejecutor CE-102/105, dos recibos
  confirmados, 12 denegaciones reales; legacy sin cambios. Cero controles,
  identidades o trabajos pendientes. [Acta y límites](docs/comparator-strict/CE-105-106-closure.md).

**Entregables:** manifiesto de destino sin secretos, inventario de objetos y
permisos, límites/ventanas de carga, muestra versionada, procedimiento de
operación/reversión y evidencias del canario.

**Gate G1:** destino y alcance comprobados; escritura mínima CE-1 y reversión
verificadas; ningún permiso público accidental ni efecto en notificaciones/
compras; API anterior compatible y sin degradación observada en el canario.
Esto no demuestra aislamiento físico ni elimina la monitorización posterior.

**G1 PASS, 2026-09-03:** [acta](docs/comparator-strict/CE-105-106-closure.md).
Alcance limitado a la base y al canario inactivo; CE-100 conserva su baseline
incompleto. No constituye permiso de carga masiva ni de activación F8.

**Prohibido:** resetear/restaurar producción para preparar pruebas, cambiar
secretos o servicios globales, o presentar un esquema privado como aislamiento
de rendimiento. Local/CI es una ayuda para ensayos, no un backend remoto obligatorio.

## 10. F2 — Construir el conjunto de verdad y la evaluación

**Objetivo:** medir calidad sin adaptar las respuestas a los ejemplos conocidos.

Tareas:

- [x] CE-200: dataset de 5.000–10.000 parejas y al menos 1.000 casos de consulta
  origen→tiendas; representativo de las tres familias, marcas, tiendas y formatos.
  COMPLETADA: [acta](docs/comparator-strict/CE-200-closure.md), 6.000 parejas y
  1.200 Q/600 orígenes, con pesos del marco de catálogo documentado. 4.176
  referencias activas, 5.189 observaciones de ubicación y taxonomías conservadas.
  33 grupos de posibles alias tratados conservadoramente, exposición anterior
  separada. No son 6.000 equivalencias ni una medida de todo el tráfico de la app.
- [x] CE-201: incluir positivos, negativos difíciles y desconocidos; conservar
  evidencia original y fecha.
  COMPLETADA: [acta de primera anotación](docs/comparator-strict/CE-201-202-water-closure.md).
  El corpus contiene positivos respaldados, negativos difíciles y desconocidos;
  el positivo Aquarel exige GTIN global válido y botella 1,5 L exacta. Las
  disputas siguen abiertas para CE-203, sin reescribir la primera anotación.
- [x] CE-202: etiquetar dimensiones por separado: identidad, variantes, formato,
  precio, ubicación y decisión final.
  COMPLETADA: 6.000/6.000 primeras anotaciones con ocho dimensiones y decisión.
  Las carencias comerciales se mantienen `unknown`: no se rellenan para cerrar
  la tarea. Generación y citas reproducibles, todavía sin gold, segunda revisión
  CE-203 ni evaluación del motor.
- [ ] CE-203: doble revisión de todos los casos disputados y muestra aleatoria
  del 20 %; arbitraje independiente de las predicciones.
  EN CURSO: [sorteo y formulario ciego](docs/comparator-strict/CE-203-progress.md)
  preparados. Muestra aleatoria 1.200/6.000 + 175 disputas; tras 39 solapes,
  1.336 casos. Revisión del propietario 0/1.336 y arbitraje 0; no cerrar ni crear
  gold hasta recibir, validar y confrontar las respuestas.
- [ ] CE-204: dividir por entidades/componentes conectados para que el mismo
  producto o GTIN no se filtre entre calibración y holdout.
- [ ] CE-205: bloquear holdout y generar hashes; no usarlo para ajustar reglas.
- [ ] CE-206: harness que compara motores con fixtures locales y/o consultas
  remotas acotadas; calcular precisión, recall, abstención, cobertura y latencias.
  Verificar efectos de las RPC legacy antes de invocarlas: no generar cachés,
  colas ni cobros de usuarios reales como efecto de la evaluación masiva.
- [ ] CE-207: reservar negativos de cuota, error, carreras, caché y precios
  corruptos, además de los ejemplos de la sección 18.
- [ ] CE-208: fijar reloj/fecha de referencia por caso y precio mínimo conocido
  por origen–tienda, con revisiones del catálogo conforme a FR-02. El replay usa
  ese reloj; avanzar tiempo para promociones y revisiones para altas/bajas/precios,
  sin caducidad automática por edad. Separar esta evaluación de las pruebas con
  datos comerciales actuales del Supabase real.

**Entregables:** dataset, guía de etiquetado, particiones con hash, baseline del
motor actual y ejecutor reproducible.

**Gate G2:** ningún caso ambiguo etiquetado automáticamente como positivo;
particiones sin fuga; métricas reproducibles; conjunto no dominado por duplicados.

**Prohibido:** presentar la precisión de una muestra elegida manualmente o de
la caché existente como precisión global de la aplicación.

## 11. F3 — Normalizar identidad, atributos y formato

**Objetivo:** dejar de depender del título como única representación.

Tareas:

- [ ] CE-300: definir diccionario por familia y estados de evidencia por campo.
- [ ] CE-301: extracción prioritaria de campos estructurados del retailer;
  completar con packaging/título y conservar procedencia.
- [ ] CE-302: parser de unidades, decimales, conteos, multipacks y orden de
  presentación; reconocer patrones como «6 botellas de 50 cl».
- [ ] CE-303: clasificar peso fijo, variable, aproximado, granel y desconocido.
- [ ] CE-304: extraer tipo griego, sabor, azúcar añadido, declaraciones,
  edulcorantes y demás variantes sin borrar negaciones.
- [ ] CE-305: validación de GTIN reutilizando el helper existente; distinguir
  identidad comercial de vínculos nutricionales o códigos restringidos.
- [ ] CE-306: firma canónica nominal y detector de conflictos entre fuentes.
- [ ] CE-307: almacenamiento versionado e incremental en Supabase, con migración
  aditiva y backfill por lotes CE-1; sin regeneración vectorial masiva ni
  publicación automática de los nuevos datos a clientes anteriores.
- [ ] CE-308: tests unitarios y de propiedades: mismo significado tras cambio
  inocuo de orden/unidad; distinto significado tras cambio de variante.

**Entregables:** contrato estructurado, política de cada familia, parser
versionado, migración aplicada y verificada en Supabase, evidencia de los lotes
y reporte de cobertura por campo/tienda.

**Gate G3:** 100 % del conjunto obligatorio de formato y negación pasa; todos
los conflictos se abstienen; idempotencia comprobada; ninguna cantidad se
inventa desde €/kg. Medir exactitud también sobre muestra aleatoria real, no
solo tests sintéticos.

**Prohibido:** introducir tolerancia de tamaño o asumir `false`/un envase para
rellenar datos ausentes.

## 12. F4 — Evaluar y decidir las integraciones

**Objetivo:** cubrir carencias reales sin añadir dependencias innecesarias.

Tareas:

- [ ] CE-400: ordenar carencias de F3 por impacto en las familias piloto.
- [ ] CE-401: mejorar primero el uso de campos ya presentes en retailers.
- [ ] CE-402: si queda carencia material, preparar piloto OFF/GS1 de la sección 6.
- [ ] CE-403: comprobar acceso, licencia, campos, límites, presupuesto y
  condiciones antes de realizar llamadas de volumen o contratar.
- [ ] CE-404: comparar enriquecimiento frente al baseline, revisar aceptaciones
  y conservar conflictos; nunca copiar `off_code` a GTIN de pack.
- [ ] CE-405: implementar adaptador offline solo si pasa el gate de adopción,
  con caché, backoff, presupuesto y desconexión; ejecución acotada en Supabase,
  sin activar ni alterar por arrastre los cron/procesos legacy.
- [ ] CE-406: registrar ADOPTAR/NO ADOPTAR por candidato y repetir G3 si cambia
  la evidencia publicada.

**Entregables:** informe de retorno por integración, decisión, coste y permisos;
adaptador probado únicamente para las opciones adoptadas.

**Gate G4:** cada opción tiene decisión razonada. Cero dependencias externas
síncronas del botón y cero incertidumbres de acceso/licencia pendientes.

**Prohibido:** bloquear todo CE-1 esperando GS1 o mejorar cobertura a costa de
identidad dudosa.

## 13. F5 — Verificar precios y aplicabilidad

**Objetivo:** que un equivalente más barato lo sea en la compra que mostramos.

Tareas:

- [ ] CE-500: contrato de precio por fila, no excepciones fijas por tienda.
- [ ] CE-501: validar precio total, moneda, base y cantidad; si hay precio
  unitario, contrastarlo con tolerancia derivada de su redondeo declarado.
- [ ] CE-502: reparar extractores corruptos, incluido el patrón de Froiz, y
  verificar el resultado primero en el perfil CE-1. Si es necesario corregir
  filas compartidas en Supabase, delimitar claves/lote, conservar valores previos
  y comprobar consumidores antes de aplicar; definir cuarentena por fuente.
- [ ] CE-503: distinguir precio normal/promoción pública/tarjeta/multicompra.
  CE-1 inicial excluye condiciones no verificadas.
- [ ] CE-504: resolver tienda, región/CP/centro y alcance nacional solo cuando
  esté demostrado; un precio global por defecto no es nacional verificado.
- [ ] CE-505: disponibilidad y revisión por fila/ubicación del catálogo activo;
  `published` por sí solo no prueba stock. Aplicar FR-02: altas/bajas y cambios
  de precio/stock invalidan resultados sin depender de la regeneración vectorial;
  distinguir sync completo/incremental/fallido y no caducar por edad.
- [ ] CE-506: estado independiente por destino y cobertura parcial.
- [ ] CE-507: controles estadísticos por tienda + controles de cada fila.

**Política FR-02 confirmada por el propietario:** validar origen y alternativa
contra la última versión válida del catálogo activo de la app, sin límite de
24 h ni otro TTL comercial automático. Ver
[contrato de sincronización](docs/comparator-strict/freshness-policy.md).
Respetar bajas, disponibilidad, revisiones y vencimientos explícitos de promociones.
No inventar fechas ni garantizar stock/precio en tiempo real; no cambiar los syncs.

Un PPU ausente no invalida necesariamente un precio total estructurado fiable
de un formato exacto; un PPU presente e incoherente sí crea conflicto. No
fabricar PPU para ocultar el problema.

**Entregables:** validador de precio, matriz de capacidades, versiones/zona,
reporte de anomalías y cuarentenas.

**Gate G5:** cero ahorros en pruebas de precio corrupto, formatos distintos,
promoción no cumplida/vencida, zona desconocida, versión sustituida o producto
inactivo/no disponible. La antigüedad sola no es motivo de rechazo.
Todos los resultados elegibles tienen evidencia comercial trazable.

**Prohibido:** heredar el precio global como local o ordenar bases monetarias
incompatibles.

## 14. F6 — Construir el motor estricto, API y caché

**Objetivo:** servir decisiones verificadas con coste y latencia acotados.

Tareas:

- [ ] CE-600: nueva versión de RPC/API, con nombre libre comprobado en F0;
  desplegar en Supabase con acceso de prueba controlado; no sobrescribir `v7`.
- [ ] CE-601: rutas estructurada, GTIN, léxica y vectorial recuperan candidatos;
  las dos primeras no exigen embedding listo. No truncar equivalentes por
  similitud antes de evaluar precio; contrastar el mínimo con la referencia
  exhaustiva del corpus.
- [ ] CE-602: puertas de familia, atributos y formato; todos los overrides
  manuales siguen sometidos a esas puertas y a los mismos controles comerciales.
- [ ] CE-603: validación de precio/zona/vigencia y revisiones actuales del
  catálogo al servir; sin rechazar por edad ni usar precios de la caché obsoletos.
- [ ] CE-604: ranking y top-2 solo después de los filtros; calcular ahorro con
  precio total del mismo formato.
- [ ] CE-605: razones estables de rechazo/abstención y cobertura por tienda.
- [ ] CE-606: caché versionada, invalidación acotada, jobs idempotentes y
  respuesta `pending` rápida en miss. Resolver CE002-H02: reglas distintas no
  comparten una versión indistinguible; reversión sin decrementar generaciones
  sobre syncs concurrentes ni reutilizar resultados obsoletos.
  Aplicar FR-02: dependencia de origen y destinos, incluidos vacíos/top-2 que
  cambian por altas o precio; eventos agrupados, recálculo acotado y finalización
  protegida frente a versiones superadas. No regenerar vectores por precio solo.
- [ ] CE-607: cuota atómica e idempotente conforme a CU-01: descontar solo con
  al menos un equivalente válido más económico en la respuesta final correcta.
  Sin ahorro válido ofrecido, cero usos; los reintentos no descuentan de nuevo.
- [ ] CE-608: probar HNSW iterativo como recuperación, compararlo con referencia
  exacta sobre muestra acotada del proyecto real o fixture equivalente; ajustar
  solo sesión/RPC nueva. No transportar el umbral 0,59 como excepción al gate.
  Incorporar CE002-H01–H04: separar recuperación/identidad/invalidación y medir
  relevancia, orden y coste; contar vecinos no basta como prueba de recall útil.
- [ ] CE-609: medir planes, índices, memoria, concurrencia y coste. Batches
  pequeños y transacciones cortas; no HTTP externo dentro de ellas. Las pruebas
  de carga intensa se ejecutan fuera de la BD compartida; las mediciones remotas
  respetan presupuesto y parada por degradación.
- [ ] CE-610: RLS, grants, auth y acceso a auxiliares bajo roles reales de prueba.

**Entregables:** API nueva, caché, políticas, tests SQL, matriz de permisos,
benchmarks y contrato de cliente.

**Gate G6:** criterios técnicos de la sección 17; ningún bypass; ruta legacy
intacta; prueba de caída del worker/proveedor sin falso ahorro ni cuota duplicada.
En esta fase se usa la partición de calibración para calidad y rendimiento;
el holdout final continúa cerrado hasta F7.

**Prohibido por defecto:** reindexar tablas compartidas, vaciar cachés globales
o regenerar todo el catálogo para aprobar rendimiento. Si se demuestra una
necesidad real, preparar operación específica con impacto, ventana y aprobación;
la autorización de trabajo directo no es permiso para reconstrucciones masivas.

## 15. F7 — Interfaz, regresión y candidato de lanzamiento

**Objetivo:** que la promesa visual coincida con la evidencia del servidor.

Tareas:

- [ ] CE-700: integrar API desplegada en Supabase desde la app de desarrollo;
  acceso CE-1 restringido en servidor y flag público apagado.
- [ ] CE-701: mostrar formato exacto, precio total, ahorro, tienda, zona y fecha;
  diferenciar mismo GTIN de equivalente de otra marca.
- [ ] CE-702: estados de sin ahorro, sin equivalente, incompleto, pendiente y
  error; no afirmar mínimo global.
- [ ] CE-703: no reinterpretar una apertura global de detalle como precio local.
  Preservar el beneficio de error persistente/reintento, sin dar por validado el
  parche local. Resolver CE002-M01–M03: procedencia del fallback, ficha anterior
  al reabrir, cierre durante carga y petición global después de cancelar.
- [ ] CE-704: feedback con motivos: identidad, variante, cantidad, pack,
  precio, zona, disponibilidad; revisión antes de cualquier corrección.
- [ ] CE-705: traducciones ES/CA, accesibilidad, temas y claves por usuario.
- [ ] CE-706: pruebas end-to-end iOS/Android con app de desarrollo; navegación,
  cambio de usuario/zona, reintentos y red lenta. Añadir cerrar/reabrir el mismo
  producto, A→B→A, precio global distinto del local y todos los consumidores
  del modal; las sondas de hooks simulados no sustituyen estas pruebas.
- [ ] CE-707: ejecutar una sola evaluación final del holdout congelado;
  publicar resultados y desacuerdos sin retocar etiquetas para aprobar.
- [ ] CE-708: replay de calidad con datos congelados y prueba remota controlada
  contra Supabase; carga intensa en local/entorno opcional, sin duplicar consultas
  de todos los usuarios ni someter producción a estrés sin presupuesto.
- [ ] CE-709: verificar las migraciones CE-1 ya aplicadas, desactivación y
  reversión específica de un canario remoto; ensayar acciones destructivas solo
  sobre fixtures fuera de la BD compartida.

**Entregables:** UI validada, pruebas de dispositivo, informe de release,
manual de despliegue/rollback y evidencias de G7.

**Gate G7:** todas las métricas de salida cumplidas; cero defectos críticos;
aprobación de producto de textos, comportamiento y alcance. Si el holdout
revela un fallo y se modifica el motor, nueva evaluación independiente.

**Prohibido:** activar resultados a usuarios para descubrir si funcionan. El
backend puede estar desplegado y probado directamente en Supabase antes de F8.

## 16. F8 — Activación gradual y cierre

**Objetivo:** publicar sin sobresaltos y conservar una retirada segura.

Subfases obligatorias:

1. **F8.0 — Autorización de activación:** aprobar mostrar CE-1 a usuarios, versión,
   coste, alcance, ventana, salud de Postgres, recuperación y operador responsable.
   No volver a pedir permiso para el mero uso del Supabase ya autorizado.
2. **F8.1 — Verificación del despliegue oscuro:** reconciliar migraciones, datos
   y endpoint ya desplegados en F1–F7; aplicar solo deltas pendientes de la fase,
   sin repetir backfills o migraciones. Flag público todavía apagado. Revisar
   conexiones, locks, permisos, errores y clientes antiguos.
3. **F8.2 — Usuarios internos:** allowlist de cuentas autorizadas. Observar al
   menos 24 h y 100 consultas distintas completadas; revisar todos los
   distintivos de esta etapa.
4. **F8.3 — Piloto externo:** 1 % de usuarios elegibles, después 5 %, 25 % y
   100 %. Cada escalón requiere al menos 48 h y 200 consultas distintas
   completadas, revisión aleatoria de 100 decisiones o todas si hay menos,
   métricas sanas y autorización de ampliación.
5. **F8.4 — Estabilización:** siete días y dos ciclos completos de las fuentes
   publicadas, sin incidentes abiertos ni degradación. Traspaso a operación.

La falta de tráfico no autoriza saltar muestras ni ampliar automáticamente.
Estos mínimos operativos no sustituyen la evidencia estadística de G7.

**Disparadores de pausa:**

Aplican a operaciones remotas desde F1, no solo a la activación de F8.

- un falso ahorro crítico confirmado;
- precio, formato o zona incorrectos que el gate debía rechazar;
- cobro duplicado de cuota;
- exposición de datos o permisos;
- error rate > 1 % o latencia p95 > 2× baseline durante 15 minutos, con al
  menos 100 peticiones; incidentes graves se paran sin esperar la muestra;
- bloqueos atribuibles a CE-1 o crecimiento de cola fuera del presupuesto.

**Rollback seguro:**

- apagar CE-1 por flag/kill switch del servidor;
- detener sus backfills/jobs y, si hace falta, cancelar únicamente las sesiones
  CE-1 identificadas; observar que se libera la carga;
- retirar distintivos afectados; responder «temporalmente no disponible» si
  no se puede demostrar la comparación;
- mantener v7 sin modificar para clientes anteriores, pero no forzar la nueva
  interfaz a usarla automáticamente como fuente estricta;
- no borrar datos ni restaurar toda la BD por defecto;
- reparar, repetir gates afectados y pedir autorización para reactivar.

**Entregables:** acta de cada escalón, monitorización, runbook, responsables,
presupuesto real y cierre de incidencias.

**Gate G8:** estabilización cumplida y aceptación del propietario. No se retira
legacy hasta un proyecto posterior explícito de compatibilidad.

## 17. Criterios numéricos de aceptación

Son objetivos del proyecto, no resultados ya alcanzados. Ratificados en G0.
CE-005 concreta denominadores, independencia, relojes y pruebas en
[acceptance.md](docs/comparator-strict/acceptance.md), aprobado el 2026-09-02.

| Dimensión | Gate |
|---|---|
| Reglas duras | 100 % de casos obligatorios; cero bypass de formato, variante, precio o zona |
| Desconocidos/conflictos | 100 % se abstiene cuando afectan un campo obligatorio |
| Precisión del distintivo | ≥ 99,5 % en holdout independiente; reportar intervalo de confianza |
| Evidencia de precisión agregada del piloto | Límite inferior unilateral del 95 % ≥ 99,5 %; diseño muestral justificado, sin extrapolar al mínimo de precio del mercado |
| Por familia publicada | ≥ 200 decisiones emitidas distintas revisadas, precisión observada ≥ 99,5 % y cero error crítico; reportar incertidumbre |
| Recuperación de alternativas | Hit@50 ≥ 95 %: casos origen–tienda con equivalente conocido que recuperan al menos uno entre los primeros 50 por destino, antes de la decisión final |
| Recuperación del mejor precio conocido | ≥ 95 % de casos origen–tienda recuperan una alternativa de precio mínimo estricto conocido; empates cuentan como acierto |
| Utilidad de equivalencia | ≥ 60 % de consultas con alternativa estricta conocida y datos completos recuperan al menos una alternativa válida |
| Utilidad de ahorro (QA-01 aprobada) | ≥ 60 % de consultas con alternativa conocida válida más barata y datos completos incluyen al menos una en la respuesta final; no sustituye utilidad de equivalencia |
| Precio | 100 % de badges con precio, moneda, cantidad, vigencia y zona trazables |
| Cuota | 0 cargos sin alternativa válida más barata en la respuesta final, por error/not-ready o respuesta parcial con errores/pendientes; 0 duplicados por reintento |
| API caliente | p95 ≤ 2 s en piloto remoto acotado, con carga/concurrencia registradas y sin degradación de clientes anteriores; QA-01 fija ≥ 100 consultas distintas |
| Cache miss | respuesta pendiente p95 ≤ 2 s; trabajo asíncrono acotado y sin falso resultado; QA-01 fija ≥ 100 consultas distintas, dentro del presupuesto diario |
| Regresión | typecheck, lint, tests y flujos principales sin regresiones |
| Seguridad | cero hallazgo nuevo crítico/alto y permisos negativos comprobados |

Para ilustrar la necesidad de muestra: unas 600 decisiones independientes,
todas correctas, producen un límite binomial unilateral del 95 % cercano al
99,5 %. Repetir el mismo producto o la misma pareja no crea nueva evidencia
independiente. Si existen grupos correlacionados, evaluar por origen/entidad y
usar intervalo que contemple esos grupos; no aplicar la fórmula ingenuamente.
El cálculo exacto de todos-aciertos da un mínimo de 598 ensayos independientes;
200 por familia no certifica por sí solo ese límite de confianza. Ampliaciones
de muestra con protocolo previo, no añadiendo casos hasta que el porcentaje pase.

Medir también precisión de equivalencia sin badge, cobertura sobre todo el
catálogo, abstención por causa, coste por 1.000 comparaciones, p99, hit rate,
errores por tienda, retrasos/fallos de sync y revisiones pendientes. Conforme a
FR-02, edad elevada es información operativa, no exclusión comercial automática.

Reportar recall de candidatos además de Hit@50, con el tamaño del conjunto
relevante: no exigir 95 % de recall@50 si existen más de 50 equivalentes para
una consulta. El precio mínimo se conoce solo en el corpus etiquetado, con
evidencias y reloj fijados; esta métrica no autoriza una promesa de mínimo global.

No aprobar un motor que devuelve cero resultados: precisión sin denominador
no es 100 %. Si una familia no reúne evidencia suficiente, no se publica;
se amplía el dataset o se estrecha el alcance con decisión registrada.

## 18. Matriz mínima de regresión

«Aceptar» presupone precio, zona y demás atributos válidos.

| ID | Caso | Decisión |
|---|---|---|
| T01 | yogur griego ↔ griego yogur, resto de campos verificados iguales | aceptar |
| T02 | yogur griego ↔ yogur estándar | rechazar |
| T03 | griego natural sin azúcar añadido ↔ griego azucarado | rechazar |
| T04 | «natural» sin evidencia de endulzado ↔ azucarado | abstenerse |
| T05 | sin azúcares añadidos ↔ sin azúcar, sin demostrar resto | no asumir equivalencia |
| T06 | endulzado con edulcorantes ↔ no endulzado | rechazar |
| T07 | agua 1 L ↔ agua 1000 ml, botella individual verificada | aceptar |
| T08 | agua 1 L ↔ agua 1,5 L | rechazar |
| T09 | botella 1 L ↔ pack 6×1 L | rechazar |
| T10 | 6 botellas de 50 cl ↔ 6×500 ml | aceptar |
| T11 | agua con gas ↔ sin gas | rechazar |
| T12 | yogur 6×125 g ↔ 6×0,125 kg | aceptar |
| T13 | yogur 6×125 g ↔ tarrina 750 g | rechazar |
| T14 | yogur 6×125 g ↔ 4×125 g u 8×125 g | rechazar |
| T15 | yogur 6×125 g ↔ 6×120 g o 6×124 g | rechazar |
| T16 | bolsa patatas congeladas 2 kg ↔ 1 kg o 500 g | rechazar |
| T17 | bolsa 2 kg ↔ pack 2×1 kg | rechazar |
| T18 | patata fresca ↔ congelada, mismo peso | rechazar |
| T19 | patata congelada fina ↔ gajo especiado | rechazar |
| T20 | alimento humano ↔ alimento para gatos | rechazar |
| T21 | peso fijo ↔ peso aproximado/al corte | rechazar |
| T22 | dos familias o cantidades desconocidas | abstenerse |
| T23 | mismo GTIN con formato contradictorio | abstenerse y registrar conflicto |
| T24 | pack vinculado al off_code de una unidad | no usar como GTIN/forma exactos del pack |
| T25 | revisión humana «aprobada» con precio corrupto | rechazar |
| T26 | 225 g interpretado como 0,225 €/kg | cuarentena, sin badge |
| T27 | precio local desconocido, pero detalle global disponible | sin badge local |
| T28 | origen/destino inactivo, agotado, stock desconocido, promoción vencida o datos/versiones contradictorios | sin badge afectado; superar 24 h con catálogo válido no es rechazo |
| T29 | oferta con tarjeta no verificada | sin badge |
| T30 | sin ahorro válido en respuesta, reintento o doble toque concurrente | cero usos sin resultado elegible; máximo un uso por petición conforme a CU-01 |
| T31 | caché previa a alta, baja, formato, precio o fin de promoción; incluir vacíos y respuesta tardía | revalidar versiones; descubrir ahorro nuevo sin exigir nuevo vector ni servir ahorro obsoleto |
| T32 | proveedor externo o worker caído | abstención/pending sin bloquear ni inventar |
| T33 | cambio de usuario/CP mientras llega respuesta | no pintar resultados del contexto anterior |
| T34 | ninguna alternativa encontrada | no afirmar «el más barato del mercado» |
| T35 | proveedor cambia payload o unidades | validación falla cerrada, no dato silenciosamente válido |

## 19. Mapa de impacto y convivencia con trabajo existente

| Área | Archivos actuales a revisar cuando toque | Fase |
|---|---|---|
| Cantidad | `scripts/lib/catalog-embedding-unit.mjs` | F3 |
| Identidad | `scripts/lib/catalog-embedding-identity.mjs` | F3 |
| GTIN | `scripts/lib/gtin.mjs` | F3 |
| Materializador | `scripts/sync-comparator-embedding-catalog.mjs` | F3/F6 |
| Fuentes | `scripts/sync-*.mjs` y helpers de precio | F3/F5 |
| OFF | `src/api/openFoodFacts.ts`, `scripts/enrich-bonarea-off.mjs` | F4, sin romper nutrición |
| RPC y caché | `supabase/migrations/`, `supabase/ops/` | F6 |
| Cliente | `src/api/catalog.ts` | F7 |
| Resultado y detalle | `SimilarProductsSection.tsx`, `StoreProductModal.tsx` | F7 |
| Texto | `src/i18n/translations.ts` | F7 |
| Calidad | `scripts/lib/*.test.mjs`, `scripts/tests/*.test.mjs`, tests SQL | F1–F7 |

El pipeline de embeddings ya tiene fases propias 0–5 y trabajo operativo en
vuelo. **CE-1/F0–F8 no son esas fases**. No reactivar cron/dispatcher, drenar
colas, cambiar compute ni dar por cumplidos sus dos ciclos de observación como
efecto colateral de este proyecto.

La migración local de HNSW y el arreglo de apertura de modales se preservan.
Antes de incorporarlos a un release CE-1, reconciliar su estado y probarlos como
cambios independientes. Toda migración de CE-1 se crea con la CLI según el
procedimiento del proyecto, no editando migraciones históricas ya aplicadas.

## 20. Plantilla obligatoria de cierre de fase

```text
Proyecto / fase:
Fecha / responsable:
Estado anterior → estado nuevo:
Commit y estado del worktree:
Entorno y project ref (sin secretos):
Autorización aplicable: CE-ENV-001 / aprobación adicional identificada
Objetos/filas y presupuesto de operación:
Estado previo/posterior y límites de carga:
Tareas CE-xxx cerradas:
Entregables y rutas:
Pruebas ejecutadas y resultados:
Dataset / hashes / versión de reglas:
Métricas con numerador, denominador e incertidumbre:
Impacto real en producción: ninguno / operación autorizada identificada
Coste real frente a presupuesto:
Incidencias y decisiones:
Gate: PASS / FAIL, con evidencia
Aprobación necesaria y referencia:
Rollback comprobado:
Próxima tarea exacta:
```

Cerrar con `npx tsc --noEmit` como mínimo; en fases de implementación,
`npm run quality`, pruebas SQL y validación de dispositivo según impacto.
No usar «hecho» si solo se escribió código pero no se verificó.

## 21. Estado inicial y orden para retomar

- Auditoría previa: realizada y documentada.
- Plan maestro: versión 1.1, trabajo directo en Supabase autorizado por CE-ENV-001.
- Decisiones nuevas del chat: incorporadas a este plan.
- CE-000: completada tras incorporar CE-ENV-001; commit y worktree registrados
  en [F0-baseline.md](docs/comparator-strict/F0-baseline.md).
- CE-001: completada en solo lectura; destino, RPC, migraciones, extensiones,
  pipeline y horarios reconciliados en
  [CE-001-supabase-inventory.md](docs/comparator-strict/CE-001-supabase-inventory.md).
- CE-002: revisión completada en
  [CE-002-independent-review.md](docs/comparator-strict/CE-002-independent-review.md).
  HNSW candidato a evaluación aislada; no adoptar la excepción 0,59 ni el
  paquete completo. Modal útil, con regresión de reapertura y procedencia global
  pendientes. No se aprueba un release por pasar las pruebas estáticas.
- CE-003: completada; contrato en
  [decisions.md](docs/comparator-strict/decisions.md). CU-01 exige al menos un
  equivalente válido más económico incluido en la respuesta final correcta;
  sin ahorro válido ofrecido, cero usos. Ningún contador modificado.
- F0: ACEPTADA; CE-005 completada, G0 PASS.
  F1: COMPLETADA / G1 PASS acotado; CE-100 cerrada por el propietario con
  limitaciones de rendimiento, CE-101–106 completadas;
  F2 EN CURSO: CE-200–202 completadas; CE-203 iniciado con revisión pendiente;
  CE-204–208 y F3–F8 PENDIENTES.
- CE-004: completada. Alcance, presupuesto y responsables aceptados en
  [budget.md](docs/comparator-strict/budget.md), con matriz de fuentes/zonas.
  La evidencia distingue precios locales existentes de precio aplicable a cada
  CP; no se han certificado equivalentes ni capacidad sobrante. SC-01/BU-01/RV-01
  confirmadas: cuatro tiendas, CP 08006/25001, sin nuevas contrataciones, límites
  documentados y segunda revisión a cargo del propietario; aún no realizada.
- CE-005: contratos aprobados en [acceptance.md](docs/comparator-strict/acceptance.md)
  y [freshness-policy.md](docs/comparator-strict/freshness-policy.md). FR-01
  descartada por el propietario; FR-02 confirmada: catálogo activo/versionado,
  sin TTL de 24 h, recálculo por altas y cambios, precio separado del vector.
  QA-01 (calidad ≥99,5 %, cero errores críticos, utilidad y medición) aceptada
  al ordenar el usuario cerrar CE-005 e iniciar CE-100; G0 PASS.
  35 tests locales de helpers correctos; ninguna métrica del nuevo motor medida.
- Infraestructura adicional: no creada.
- Integraciones nuevas: no instaladas ni contratadas.
- Código de app y RPC legacy: sin cambios por este avance de CE-1. Una base
  privada aplicada con recibos duraderos y canario revertido; no motor nuevo desplegado.

**Próximo paso:** el propietario inicia el lote 1 del
[libro ciego CE-203](outputs/ce203-owner-review-v1/CE-203-revision-ciega.xlsx),
siguiendo la [guía](docs/comparator-strict/CE-203-owner-review-guide.md). El
sorteo ya está congelado; no regenerarlo ni cambiar la semilla. Conservar las
revisiones separadas y resolver desacuerdos antes de CE-204/205. CE-200–202 no
deben repetirse salvo evidencia concreta de corrupción.
No confundir la primera anotación ni el positivo de producto con gold o ahorro.
CE-203–208 no se cierran por este avance.
No repetir bootstrap, canario o extracción cerrada ni borrar auditorías/presupuesto.
CE-BU-002 elimina el techo SQL acumulado. Reserva al cierre: 1.518.920 ms,
108.246.478 bytes y 34.177 filas; sin reset. No contratar recursos ni ampliar
las autorizaciones del corpus a otro trabajo. CE-100 conserva sus limitaciones.

**Orden de trabajo para quien retome:**

> Lee PROYECTO-COMPARADOR-ESTRICTO.md, COMPARADOR-ESTRICTO.md, CONTEXTO.md y
> HANDOFF.md. Continúa por la primera fase no aceptada. No saltes puertas, no
> rebajes reglas para obtener resultados. Puedes trabajar directamente en
> Supabase bajo CE-ENV-001 y el procedimiento de la sección 5.5; no esperes a
> F8 para cambios de BD. F8 regula su activación para usuarios. Entrega el acta
> de cierre antes de avanzar y registra cualquier ampliación de autoridad.
