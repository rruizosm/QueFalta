# CE-1 — Registro de decisiones de producto / CE-003

> Fecha: 2026-09-02 · registro 1.0 · plan maestro v1.1.
>
> CE-003 COMPLETADA. CU-01 corregida tras la respuesta del usuario: solo
> consumir si la respuesta final incluye al menos un equivalente válido más barato.
>
> Estado posterior 2026-09-03: F0/G0 y F1/G1 cerradas; G1 acotado al canario
> privado. CE-100 cerrada por el propietario con limitaciones de rendimiento.
> Este documento no implementa ni activa reglas.

Nota de continuidad: CE-004 ya está cerrada en [budget.md](budget.md), con
alcance, límites y responsable de revisión confirmados. CE-005 está cerrada
en [acceptance.md](acceptance.md): FR-01 descartada, FR-02 confirmada (catálogo
activo sin TTL de 24 h), QA-01 y G0 aceptados. CE-100 se inicia en
[CE-100-readiness.md](CE-100-readiness.md);
el acta de la sección 8 conserva el cierre histórico de CE-003.
La continuación de F1 está en el [acta CE-105/106](CE-105-106-closure.md);
ninguna regla de equivalencia se ha implementado ni activado por ese cierre.

## 1. Autoridad y estado de las decisiones

Este registro desarrolla el [plan maestro](../../PROYECTO-COMPARADOR-ESTRICTO.md)
sin rebajar sus reglas ni cambiar el alcance por los resultados de una prueba.
El «adelante» autorizó preparar CE-003, no decidir por el usuario la política
comercial. Su respuesta posterior corrige CU-01; se conserva literalmente y
se explica su aplicación a la lista de ahorro en la sección 8.

Mandato explícito del chat:

- Agua de 1 L con agua de 1 L; yogur 6×125 g con el mismo formato; patatas
  congeladas de 2 kg con 2 kg, no 500 g o 1 kg.
- El cambio de orden «yogur griego» / «griego yogur» no debe impedir una
  equivalencia real; natural y azucarado no se equiparan por parecido textual.
- Revisar especialmente carne/embutidos por su peso variable. El plan vigente
  concreta una cuarentena inicial, no una excepción permisiva por kg.
- Se permite trabajo directo en el Supabase actual bajo CE-ENV-001. No se
  exige un segundo backend ni una nueva autorización por el mero destino.

Las decisiones D01–D14 y el piloto de tres familias ya constan en el plan y aquí
se conservan. Su registro no significa que estén implementados. La política de
consumo de cuota queda reformulada en CU-01, pendiente de implementación.
No se han aprobado precios de suscripción nuevos, más usos, reinicios de cuota,
nuevos proveedores, activación de CE-1 ni una ampliación a otras familias.

## 2. D01–D14: contrato conservado y criterio observable

| ID | Decisión vigente | Qué deberá demostrar la implementación |
|---|---|---|
| D01 | Recuperación y equivalencia son distintas | Un score alto solo propone candidatos; no concede el distintivo |
| D02 | Precio después de todas las puertas | Ningún resultado más barato con identidad/formato/comercio pendientes |
| D03 | Familia, subtipo y atributos relevantes conocidos | Yogur griego no se equipara a estándar; gas, sabor y preparación se validan |
| D04 | Desconocido no es ausencia ni igualdad | Dos formatos o familias desconocidos producen abstención, no aceptación |
| D05 | Misma cantidad nominal y estructura de pack | Coinciden número de envases, contenido por envase y total, con unidades exactas |
| D06 | Orden de palabras flexible, significado conservado | Reordenar no cambia identidad; no se borran negaciones ni calificadores relevantes |
| D07 | No convertir masa en volumen sin evidencia específica | 1 kg no se convierte automáticamente en 1 L; el piloto se abstiene |
| D08 | GTIN/revisión humana no saltan controles | Un GTIN igual con formato contradictorio queda en conflicto; precio/zona siguen verificándose |
| D09 | Precio incoherente fuera del distintivo | No gana un precio por kg que realmente contiene el peso del envase |
| D10 | Precio y disponibilidad recientes y aplicables | Cada alternativa tiene ubicación/canal y observaciones vigentes; abrir ficha global no los demuestra |
| D11 | No prometer mínimo global | La interfaz limita sus afirmaciones a equivalentes y precios comprobados |
| D12 | IA/proveedores enriquecen, no deciden excepciones | Ninguna inferencia puede saltar formato, variante, precio, fecha o zona |
| D13 | Convivencia con producción y clientes legacy | RPC nueva y controles de servidor; no aplicar parches, cron o invalidaciones por arrastre |
| D14 | Integraciones con utilidad, coste y derechos verificados | Adoptar solo tras el piloto/gate del plan; no instalar para suplir un guard insuficiente |

No se cambia el significado de D13 a «prohibido tocar producción». Se conserva
la operación controlada de CE-ENV-001, compatible con las fases F1–F8.

### Estados de la evidencia

- `known`: dato con fuente y significado verificables.
- `unknown`: no se conoce; no completar con una suposición silenciosa.
- `conflicting`: fuentes/atributos incompatibles; abstenerse y registrar motivo.
- «No aplica» solo puede proceder de la política explícita de la familia, no
  utilizarse para evitar un dato obligatorio que no se pudo extraer.

La ausencia de «azúcar» en el nombre no prueba ausencia de azúcar añadido.
«Natural» describe una señal distinta del endulzado. Tampoco los azúcares totales
de la tabla nutricional resuelven por sí solos si se añadieron azúcar/edulcorantes.
El diccionario y las pruebas de extracción se implementan en F3.

## 3. Piloto y cuarentenas del plan

| Familia piloto | Mínimos de identidad a formalizar en F3 | Formato obligatorio |
|---|---|---|
| Agua | Clase de agua, gas, sabor/aditivos y variantes relevantes | Volumen por envase, número de envases, total y modo de venta fijos |
| Yogures | Familia real, tipo griego/estándar, base y especie aplicable, sabor, grasa, azúcar añadido, edulcorantes y declaraciones relevantes | Contenido por unidad, conteo, total y composición del pack verificables |
| Patatas congeladas | Congelado, preparación/prefrita-cruda, corte, piel y condimentación relevantes | Peso nominal, número de bolsas/envases y total fijos |

No es una nueva taxonomía desplegada ni una lista exhaustiva de sinónimos.
CE-300–CE-308 concretarán valores, fuentes y campos aplicables, sin rebajar estos
requisitos para aumentar cobertura. Pueden compararse marcas distintas: misma
marca, foto o redacción no son requisitos universales de equivalencia funcional.

Se mantienen fuera del primer lanzamiento:

- carne, charcutería y embutidos, incluso si algún envase particular parece fijo;
- peso variable, aproximado, rangos, venta al corte, granel o por pieza sin
  cantidad nominal verificable;
- huevos y las demás familias no incluidas en el piloto, aunque tengan casos
  de recuperación HNSW ya estudiados;
- surtidos de composición desconocida o no compatible; mismo peso total no
  demuestra mismo surtido;
- otros formatos complejos sin política específica: neto/escurrido ambiguo,
  dosis de limpieza, etc.;
- conversión de tamaños a una compra equivalente, coste de envío/ruta o
  optimización de cesta.

Quedar fuera del piloto no retira el producto de los catálogos ni desactiva el
comparador legacy. Solo impide presentarlo como resultado verificado de CE-1.
Una futura ampliación a carne de peso fijo necesitará política y validación
propias; no se autoriza automáticamente por esta acta.

### Ejemplos vinculantes de formato

«Compatible» presupone que también superan identidad y controles comerciales.

| Origen | Destino | Decisión de formato |
|---|---|---|
| 1 botella de 1 L | 1 botella de 1000 ml | Compatible |
| 1 botella de 1 L | 1 botella de 1,5 L | Rechazar |
| 1 botella de 1 L | 6 botellas de 1 L | Rechazar |
| Yogur 6×125 g | Yogur 6×0,125 kg | Compatible |
| Yogur 6×125 g | Yogur 3×250 g o tarrina de 750 g | Rechazar |
| Yogur 6×125 g | Yogur 6×124 g | Rechazar; sin tolerancia nominal |
| Patatas 1 bolsa de 2 kg | Patatas 1 bolsa de 2000 g | Compatible |
| Patatas 1 bolsa de 2 kg | 2 bolsas de 1 kg, 1 kg o 500 g | Rechazar |
| Envase sin cantidad verificada | Otro envase sin cantidad verificada | Abstenerse |

La unidad de precio «€/kg» no demuestra que se vendan paquetes de 1 kg.
No inferir `pack_count=1` del mero fracaso de un parser. Normalizar unidades y
decimales exactos no equivale a admitir diferencias de tamaños.

## 4. Resultados y mensajes

Se conserva el contrato de la sección 4.4 del plan: lista principal solo con
alternativas estrictas más baratas y máximo dos por tienda. Si no hay dos válidas,
no rellenar. No mostrar un bloque de productos meramente parecidos en CE-1 inicial.

Primero superar todas las puertas; después ordenar por precio total del mismo
formato. En empate: identidad exacta, calidad de evidencia y frescura; la
implementación añadirá un desempate estable. La ordenación entre tiendas no
autoriza declarar un mínimo de todo el mercado.

Cada resultado mostrará formato, precio total, ahorro, tienda, zona/canal, fecha
y condiciones de precio pertinentes. No se da por verificada una tarjeta,
suscripción o promoción condicionada porque exista su precio en el catálogo.

Los siguientes son textos de contrato, no cambios en traducciones de la app.
Su integración ES/CA y accesibilidad corresponde a CE-701–CE-706.

| Estado | Mensaje orientativo ES | Acción / distintivo |
|---|---|---|
| Ahorro estricto | «Mismo formato: 6 × 125 g. Ahorras {importe} por pack» | Mostrar ahorro solo con todas las evidencias |
| Equivalentes válidos, sin ahorro | «No hemos encontrado opciones comparables más económicas entre los precios comprobados» | Sin alternativas más caras como relleno ni afirmación de mínimo global |
| Sin equivalente verificado | «No hemos encontrado equivalentes del mismo formato con los datos comprobados» | No convertir ausencia de resultados en victoria del origen |
| Datos insuficientes/conflicto | «No podemos verificar el formato, la variante o el precio de estas alternativas» | Explicar causa y abstenerse |
| Fuera del piloto | «La comparación estricta aún no está disponible para este tipo de producto» | Sin fallback automático a legacy presentado como estricto |
| Pendiente | «Estamos preparando los datos necesarios para comparar» | Estado pendiente, sin resultado o ahorro inventado |
| Error/timeout | «No se ha podido completar la comparación. Puedes reintentarlo» | Reintento de la misma petición, sin autocierre ni cargo adicional |
| Ficha solo global | «Información del catálogo global; precio y disponibilidad sin verificar para tu zona» | Información, no prueba de ahorro local |
| Cobertura incompleta | «Resultados de las tiendas comprobadas. {n} tiendas no se han podido evaluar» | Identificar causas por tienda; no ocultar error/pendiente |
| Cupo agotado | «Has utilizado tus 3 comparaciones gratuitas. Puedes continuar con QuéFalta Plus» | Gate antes de una búsqueda nueva; no bloquear recuperación de una respuesta ya obtenida |

No usar «precio verificado en tu zona» sin la observación correspondiente.
Al cambiar cuenta, zona o producto, no reutilizar resultados del contexto anterior.
Al reabrir una ficha, un precio previo pendiente de revalidación no se muestra
como nuevamente verificado: incorpora CE002-M01–M03.

## 5. CU-01 — Consumo condicionado a un resultado válido más económico

Queda revocada la propuesta de descontar por una comparación sin ahorro aunque
se hayan evaluado equivalentes válidos internamente. Encontrar candidatos o
completar el cálculo no basta para consumir un uso.

### Cupo que se conserva

El contrato local vigente es **3 búsquedas gratuitas por cuenta**, no tres al día
ni al mes; Plus no tiene ese cupo. Se comprueba en
[MONETIZACION.md](../../MONETIZACION.md),
[limits.ts](../../src/constants/limits.ts) y la migración de contadores
[free_tier_allowances](../../supabase/migrations/20260823063529_free_tier_alert_and_comparator_allowances.sql).
Esta tarea no vuelve a consultar contadores de usuarios ni certifica su valor actual.

No reiniciar usos por reinstalación, cambio de dispositivo, idioma o adopción de
CE-1. No crear tres usos adicionales independientes de legacy ni reembolsar
retroactivamente usos históricos sin otra decisión. Los límites técnicos
antiabuso se definirán en CE-004 y no se disfrazarán de un nuevo cupo comercial.

### Definición de uso consumible para CE-1

Una petición lógica nueva puede consumir **un único uso** si termina
correctamente y su respuesta final incluye **al menos un equivalente válido
más económico**. Este debe superar identidad, formato, precio, disponibilidad,
zona y vigencia, además de tener un precio total estrictamente inferior al
del origen para el mismo formato. Un precio igual no constituye ahorro.

El recuento se realiza sobre las alternativas incluidas en la respuesta final
destinada al usuario, **después** de todas las validaciones y del filtro de
ahorro. No cuenta un vecino vectorial, un guard textual aprobado ni un
equivalente descartado de esa respuesta. No se cobra por tienda ni por candidato.
No se garantiza que toda búsqueda encuentre un equivalente: si no lo hay,
se conserva el uso, sin relajar reglas ni rellenar resultados.

| Resultado de la petición | Consumo definido para CE-1 |
|---|---|
| Final correcta con uno o más equivalentes válidos más baratos incluidos en la respuesta | 1 uso |
| Final correcta, equivalentes válidos pero todos al mismo precio o más caros | 0 |
| Ninguna alternativa válida más barata en la respuesta final, aunque existan candidatos internos | 0 |
| Cero equivalentes verificables, aun si la evaluación terminó | 0 |
| Solo formatos distintos, datos insuficientes, conflictos o cuarentena | 0 |
| Error de ejecución o timeout confirmado | 0 |
| Pendiente/not_ready o respuesta provisional | 0; no cobrar el trabajo de preparación |
| Respuesta parcial con tiendas en error/pendiente | 0; mostrar solo lo válido y declarar cobertura |
| Reintento, polling, doble toque o repetición de la misma petición | 0 adicionales |
| Abrir/cerrar/reabrir ficha o recuperar una respuesta ya completada | 0 adicionales |
| Trabajo en sombra, enriquecimiento o cuentas de prueba identificadas | 0 usos comerciales |
| Plus vigente | Sin descuento del cupo gratuito |
| Cuenta sin cupo ante una nueva búsqueda | No ejecutar nueva comparación comercial; sin uso extra |

La regla conservadora para respuestas parciales concreta «no cobrar errores o
pendientes»; no convierte una tienda sin cobertura o sin datos en un fallo de
ejecución. Deben distinguirse exclusión final conocida y tarea aún inconclusa.
En ningún caso esas exclusiones permiten afirmar cobertura total.

### Fronteras para la implementación de CE-607

- Idempotencia por cuenta y petición lógica, con contexto de producto, destinos
  y ubicación; la clave no puede reutilizarse para otra consulta diferente.
- La decisión y el descuento son responsabilidad del servidor y deben ser
  atómicos y corresponder a la misma respuesta final con alternativas elegibles;
  no confiar en una declaración de éxito enviada por el cliente.
- Con un uso restante, dos peticiones distintas concurrentes no pueden consumir
  dos usos. La convivencia con legacy debe conservar el mismo cupo total.
- Un cache miss/pending no consume. No descontar por la mera finalización de un
  worker en segundo plano; resolver la solicitud del usuario por su identidad.
- Si se pierde la respuesta después de completarse la operación en servidor,
  no asumir ni éxito ni reversión: recuperar el resultado de la petición original
  y su estado de cuota, sin repetir el descuento. Un timeout de interfaz no prueba
  que la transacción de servidor haya fallado.
- Una nueva comparación voluntaria con datos renovados debe identificarse como
  nueva antes de consumir; abrir nuevamente la ficha no es esa autorización.
- La retención de idempotencia y la política de caducidad deben fijarse antes de
  implementar. Una clave caducada no se trata silenciosamente como un uso nuevo.

No se promete que toda pérdida de conexión posterior a un commit pueda revertir
un descuento confirmado. La respuesta final de la misma operación se debe poder
recuperar. El texto «no se ha consumido un uso» solo se muestra cuando el servidor
lo confirme; no se deduce de un catch de red.

La v7 actual reclama cuota antes de resolver resultados, pero dentro de una
transacción: un fallo SQL que aborte esa transacción revierte sus cambios.
El problema no es que todo timeout cobre necesariamente; sí puede descontar una
respuesta correcta vacía, y una respuesta perdida necesita idempotencia. Evidencia:
[migración v7](../../supabase/migrations/20260824213612_localize_comparator_results.sql)
y [CE-001](CE-001-supabase-inventory.md). No se ha invocado ni modificado v7 aquí.

## 6. Integraciones y límites de esta ratificación

Se mantiene D14 y la secuencia existente: datos de retailers y herramientas ya
instaladas primero; pgTAP para pruebas SQL cuando proceda en F1; pg_jsonschema
condicional en F3; ampliación de OFF y piloto opcional GS1 sujetos al gate de F4.
No se adopta otro buscador ni reranker por esta tarea. No hay instalación,
contratación o nuevo coste aprobado. El caso OFF de código de unidad frente al
pack comercial sigue sujeto a D05/D08.

Actualización posterior: tiendas/CP candidatos, responsables y presupuesto
aceptados en CE-004, [budget.md](budget.md) y
[source-zone-matrix.md](source-zone-matrix.md). Esto no certifica fuentes elegibles.

Actualización CE-005: FR-02 sustituye el TTL propuesto por el catálogo activo y
sus revisiones, por instrucción del propietario. Ver
[freshness-policy.md](freshness-policy.md): altas/cambios reevaluados, precio
separado de regeneración de embeddings, sin modificar CU-01.

QA-01 queda ratificada en [acceptance.md](acceptance.md) al ordenar el propietario
cerrar CE-005 y empezar CE-100; aceptar los criterios no demuestra alcanzarlos.

No se fijan todavía:

- la forma final de tablas/RPC, extracción, interfaz o migración de cuotas;
- la aplicación del parche HNSW y del modal: siguen los hallazgos de CE-002;
- activación pública, cambios en suscripciones o contratos externos.

## 7. Trazabilidad hacia pruebas posteriores

Se conservan las 67 tareas y T01–T35; no se cambia el holdout en esta tarea.

| Contrato | Verificación posterior |
|---|---|
| D03–D07 y piloto | CE-300–CE-308, CE-602; T01–T22 |
| GTIN/overrides/procedencia | CE-305/306/602; T23–T25 |
| Precio, zona, fecha y promoción | F5, CE-603/701/703; T26–T29 |
| Uso solo con ahorro válido incluido en respuesta; idempotencia/último cupo/legacy | CE-607/610, CE-706; ampliar escenarios de T30 sin cambiar aún su dataset |
| Caché y contexto de ficha | CE-606/703/706; T31–T33 |
| Mensajes y pérdida de cobertura | CE-702/705; T34 |
| Proveedor no confiable o caído | F4/F6; T32/T35 |

Los cinco tests focalizados de cuota existentes pasan, pero solo uno comprueba
el número de usos y otro inspecciona SQL como texto; no validan la futura política
CU-01, concurrencia o idempotencia. No se dan esos comportamientos por hechos.

Escenarios obligatorios de CU-01 para esas tareas: cero alternativas, solo
equivalentes iguales/más caros, candidato barato rechazado por formato/variante
o precio/zona/vigencia, y candidatos no incluidos en la respuesta consumen cero.
Una respuesta final correcta con una o varias alternativas elegibles consume
un solo uso, salvo las exclusiones de la tabla. Cubrir también respuestas
parciales con error, reintentos y dos peticiones concurrentes con un uso restante.

## 8. Acta de cierre y corrección de CU-01

| Campo | Estado |
|---|---|
| Proyecto / tarea | CE-1 / F0 / CE-003 |
| Entregable | Registro de D01–D14, piloto, cuarentenas, resultados y CU-01 corregida |
| Estado | COMPLETADA como contrato documental; no implementada |
| Política de cuota | Conservar tres usos por cuenta; descontar uno solo con al menos un equivalente válido más económico en la respuesta final correcta |
| Evidencia de decisión | Corrección del usuario reproducida abajo; no se atribuye al «adelante» anterior |
| Fase | F0 EN CURSO; G0 sin aceptar |
| HEAD | 03b8ba273e17709fd8fc69c20dddb68c147a7e2a |
| Comprobaciones | TypeScript correcto; tests de cupos existentes 5/5; enlaces/bloques válidos y git diff --check correcto |
| Integridad del plan/worktree | 67 tareas, solo CE-000–CE-003 cerradas; 35 regresiones, D01–D14 y ocho hashes protegidos conservados |
| Cambios de código / Supabase / contadores | Ninguno |
| Costes/recursos nuevos | Ninguno |
| Próximo paso | CE-004: tiendas/zonas, presupuesto, responsables y límites de carga |

Historial de decisión (2026-09-02):

- Propuesta anterior, revocada: descontar por una comparación correcta con
  equivalentes válidos evaluados aunque ninguno fuese más económico.
- Respuesta literal del usuario: «No, rebocalo, debe haber almenos un equivalente valido».
- Aplicación al contrato existente: el equivalente debe formar parte de los
  resultados válidos ofrecidos al usuario. Como la lista principal de CE-1 solo
  incluye alternativas más económicas, el descuento exige al menos una de ellas
  en la respuesta final; no basta un equivalente interno sin ahorro. Esta es la
  interpretación contextual de la corrección, no una cita literal adicional.
- Se conservan tres usos gratuitos por cuenta y Plus sin ese cupo; no se
  modifican contadores históricos ni el comportamiento de producción.

Esta corrección cierra CE-003, no G0: CE-004 y CE-005 siguen pendientes.
