# CE-005 — Vigencia por catálogo activo y sincronización

> 2026-09-02 · versión 1.0 · FR-02 confirmada como criterio de producto.
> Sustituye la propuesta FR-01 de 24 h, rechazada por el propietario.
> CE-005 COMPLETADA: FR-02 y QA-01 confirmadas; F0 aceptada (G0 PASS).
> CE-100 iniciada; no hay implementación del comparador estricto.

## 1. Decisión del propietario

La referencia del comparador será **el catálogo activo de la app, con la última
versión válida incorporada para cada producto y ubicación**. No se descarta un
producto o un precio por haber transcurrido 24 horas desde su sincronización.
Tampoco se sustituye ese plazo por otro TTL obligatorio de siete días.

El propietario indica: «Necesitamos validar el producto con los productos
activos dentro de la app» y «no debemos exigir 24h». Pide que las actualizaciones
y altas permitan volver a evaluar si existe ahorro. **FR-02 confirma ese
principio y revoca FR-01**; los detalles técnicos siguientes desarrollan el
diseño que habrá que implementar y probar en las fases previstas.

La promesa es ahorro **según los precios del catálogo sincronizado**, no precio
o stock comprobados en tiempo real en el supermercado. Mostrar procedencia y
última actualización real. Una fecha antigua no bloquea por sí sola; una
observación contradictoria, una baja o una promoción terminada sí pueden hacerlo.

D01–D14 y CU-01 se conservan: mismo formato exacto y variante, evidencia suficiente,
precio válido en la zona y al menos una alternativa realmente más barata para
consumir un uso. Estar publicado no sustituye esos controles.

## 2. Qué confirma el código actual

Revisión local, sin nueva consulta a producción:

- Los workflows de [Mercadona](../../.github/workflows/sync-catalog.yml),
  [Consum](../../.github/workflows/sync-consum.yml) y
  [Plusfresc](../../.github/workflows/sync-plusfresc.yml) ejecutan el
  [materializador](../../scripts/sync-comparator-embedding-catalog.mjs) después
  del sync de catálogo. Esto no demuestra por sí solo que el worker haya
  terminado o que todos los resultados estén recalculados.
- El [constructor de identidad/input](../../scripts/lib/catalog-embedding-identity.mjs)
  **no incluye precio, promoción ni disponibilidad en el texto del embedding**.
  Estos datos pueden cambiar sin necesitar un vector nuevo.
- La [reconciliación](../../scripts/lib/catalog-embedding-reconcile.mjs)
  diferencia altas, cambios semánticos, metadatos, republicación y filas sin
  cambios. Reutiliza vectores compatibles y repara los ausentes/obsoletos.
- Existe [invalidación por sentencia/run](../../supabase/migrations/20260901103216_embedding_runs_durable_settlement_and_set_based_invalidation.sql)
  para cambios de la capa de embeddings y generaciones de tienda. No darla
  por cobertura completa de los cambios de precio/stock en tablas de catálogo
  y precios locales: esos caminos se deben verificar e integrar en CE-505/606.
- El último inventario remoto documentaba el pipeline pausado. No afirmar que
  hoy todo embedding se actualiza inmediatamente; no se ha reactivado ni
  consultado su estado por esta revisión.

Se han ejecutado **35/35 tests existentes** de identidad y reconciliación.
Demuestran comportamiento de esos helpers, no equivalencia estricta ni
invalidación comercial completa en producción.

La muestra histórica de CE-004 tenía 600 filas con fechas de 31,22–31,58 h.
**Esa edad ya no las excluye**. Tampoco las aprueba automáticamente: no son
600 equivalentes y aún necesitan formato, zona y disponibilidad válidos.
Los cálculos del TTL anterior quedan como historial descartado en
[CE-005-evidence.json](CE-005-evidence.json), no como requisito vigente.

## 3. Qué se actualiza según el cambio

«Actualizar el embedding» debe entenderse como reconciliar la representación del
producto, no volver a pagar por un vector idéntico en cada UPDATE. La decisión
de equivalencia y el cálculo económico tienen dependencias distintas.

| Cambio incorporado al catálogo | Representación / embedding | Comparación y ahorro |
|---|---|---|
| Producto nuevo | Crear perfil y generar vector si esa ruta lo necesita | Incorporarlo a recuperación y evaluar nuevas oportunidades, también donde antes no había resultados |
| Nombre, tipo o variante cambian | Actualizar perfil; regenerar vector si cambia su input efectivo | Invalidar equivalencias afectadas y aplicar de nuevo las puertas estrictas |
| Cantidad, pack, GTIN o metadatos cambian | Actualizar firma y metadatos; conservar vector si sigue siendo compatible | Volver a validar formato/identidad; nunca usar una aprobación anterior del pack |
| Solo cambia precio o promoción | Conservar vector | Recalcular ahorro y orden, tanto si cambia origen como destino; también puede desaparecer el ahorro |
| Cambia disponibilidad, zona o publicación | No necesita un vector para retirar resultados | Excluir o reconsiderar inmediatamente según el catálogo; invalidar ámbito afectado |
| Republicación / vuelta de disponibilidad | Reutilizar vector compatible o generar/reparar si falta | Reconsiderar candidaturas y resultados vacíos previos |
| Solo imagen o fecha de observación, sin cambio relevante | No regenerar vector por ese motivo | Actualizar presentación/procedencia; no reevaluar toda la identidad |
| Reintento del mismo cambio | Una identidad de trabajo por versión | Efectos idempotentes; sin duplicar cálculo innecesario ni cuota |

Ejemplo: un yogur 6×125 g del mismo tipo pasa de 2,50 € a 2,10 €, frente a un
origen de 2,30 €. No ha cambiado qué producto es, pero aparece un ahorro de
0,20 €. **Esperar a un cambio de embedding perdería esa oportunidad**.
A la inversa, si sube por encima de 2,30 €, retirar el ahorro anterior.

Las rutas estructurada y GTIN de CE-601 pueden demostrar equivalencia sin vector
listo. En la ruta vectorial, un vector incompatible no representa la versión
nueva. Si no hay otra ruta válida, estado pendiente o datos insuficientes, nunca
aceptar la versión anterior por defecto.

## 4. Contrato de catálogo y versiones

Antes de servir un resultado, comprobar en origen y alternativa:

1. Referencia activa/publicada en el catálogo fuente que usa la app, no solo en
   el espejo vectorial. Una baja conocida se respeta aunque el worker se retrase.
2. Identidad, variante y firma nominal exactas, coherentes con la revisión
   actual. Desconocidos/conflictos obligatorios producen abstención.
3. Precio total válido y disponibilidad según los datos de catálogo de la
   ubicación/canal aplicables. No convertir un precio global en local ni
   `published=true` en prueba de stock. Los defaults de stock siguen pendientes
   de corregir según la [matriz de fuentes](source-zone-matrix.md).
4. Resultado calculado con versiones compatibles del perfil, formato, precio,
   disponibilidad, ámbito y reglas. Revalidar contra las revisiones actuales,
   no contra la hora en que se construyó la caché.
5. Promoción/condición comercial aún válida si tiene vencimiento explícito.
   Su fecha sí se respeta aunque no haya nuevo sync; usar otro precio vigente
   solo si está demostrado, sin inventarlo desde un precio tachado.

Los nombres de revisiones/generaciones son conceptuales: F3/F5/F6 definirán su
almacenamiento reutilizando los mecanismos existentes cuando sirvan. No obliga
a crear tablas duplicadas ni a usar la misma revisión para todas las tiendas.

### Sincronización completa, incremental y fallida

- Cada dato debe proceder de un cambio confirmado y validado. Inicio de sync,
  final de descarga, materialización y finalización de vectores son estados
  distintos; no publicitar un resultado actualizado al completar solo uno.
- Tras sync completo exitoso, reconocer altas, cambios y bajas en su alcance.
  Una ausencia solo demuestra baja si la extracción de ese alcance fue completa.
- En sync incremental, lo no incluido conserva su última versión válida;
  en uno parcial, no despublicar lo no recorrido. No inventar una observación
  nueva para esas filas ni exigir que todas tengan la fecha del último run.
- Si falla un sync, conservar la última versión válida donde no fue sustituida.
  Registrar el fallo sin renovar fechas. Si dejó datos mezclados o incoherentes,
  aislar las filas/ámbitos afectados hasta reconciliarlos: no afirmar que existe
  un snapshot atómico que los scripts actuales aún no garantizan.
- Vigilar retrasos según el calendario de cada fuente y avisar al operador de
  fallos/ciclos incumplidos. **La edad por sí sola no retira productos** ni crea
  un TTL encubierto. Una cuarentena requiere un problema concreto de integridad,
  disponibilidad o condiciones, registrado con su causa.

## 5. Invalidación incremental, resultados nuevos y carreras

Cada cambio relevante debe marcar qué decisiones han quedado desactualizadas
y activar una reevaluación acotada. Separar «ya invalidado» de «ya recalculado».

No basta con invalidar parejas que ya existían: una alta, una republicación o
una bajada de precio puede afectar búsquedas con resultado vacío y productos
que antes no estaban en el top-2. Considerar dependencias de origen y del
catálogo destino, con ámbito de tienda/zona/familia cuando sea fiable. Si no
puede acotarse una familia, usar una invalidación lógica conservadora del ámbito
afectado, **no un barrido de todas las parejas ni de todas las tiendas**.

Diseño para CE-505/606: registrar revisiones y trabajo pendiente tras cambios
confirmados, agrupar eventos repetidos, recalcular lotes afectados dentro de
BU-01 y comprobar versiones al consultar. Si falta cálculo, recuperar o admitir
trabajo acotado y responder pendiente; no servir una caché antigua como actual.
La siguiente consulta debe poder descubrir el alta, no esperar a que caduque
un resultado vacío por tiempo. No se prometen actualizaciones instantáneas de
todo el catálogo ni se añaden notificaciones a usuarios.

Al finalizar un worker o cálculo, verificar que el producto no cambió o se dio
de baja mientras trabajaba. Un resultado de versión antigua no sobrescribe una
nueva. La invalidación no debe depender exclusivamente de que se regenere un
vector: precio/stock y metadatos tienen sus propias señales.

Al servir y al reabrir la ficha, comprobar contexto de producto/cuenta/CP y
versiones. El servidor no puede garantizar que el retailer no cambie después;
la interfaz mostrará «según el catálogo actualizado el…», no tiempo real.
Una expiración técnica de caché permite recalcular con el catálogo vigente:
**TTL de caché, antigüedad comercial e idempotencia son conceptos separados**.

## 6. Cuota, costes e integraciones

CU-01 no cambia: cero usos sin ahorro válido final, por pendientes/errores o
respuesta parcial inconclusa; máximo un uso por petición consumible.
Sincronizar, generar embeddings, invalidar o recalcular en segundo plano no
descuenta usos comerciales. Reintentos y recuperación de una petición ya
cobrada no vuelven a descontar; no mostrar su ahorro histórico como actual si
el catálogo cambió. Una nueva búsqueda voluntaria debe identificarse como tal.

No hacen falta nuevas consultas al retailer para cumplir una ventana artificial
de 24 h. Se trabaja sobre el catálogo que ya mantiene la app. No cambia la
frecuencia de los syncs, los topes de extracción/escritura, la concurrencia ni
el presupuesto de nuevas llamadas/embeddings. BU-01 sigue vigente.

No se instala ninguna integración. Reutilizar y medir el pipeline, los hashes,
las generaciones y las colas existentes en las fases previstas. Si hacen falta
recursos o cambios de alcance, presentar su impacto; no ampliar el gasto
implícitamente por querer reevaluar cada actualización. F0 sigue sin ejecución
remota; activación para usuarios solo en F8.

## 7. Regresiones obligatorias y estado

CE-207/208/505/603/606/706 deben cubrir, dentro de T28/T31/T32/T35:

- mismo catálogo válido tras 24 h y siete días: no excluir solo por edad;
- baja, agotado y promoción terminada: retirar ahorro sin esperar al vector;
- bajada/subida de precio del origen o destino, conservando el mismo embedding;
- alta/republicación que convierte un resultado vacío en oportunidad;
- cambio 6×125 g → 4×125 g: la decisión anterior no se reutiliza;
- fallo o extracción parcial: no asumir éxito ni bajas por ausencia;
- dos syncs solapados, eventos duplicados y worker que finaliza fuera de orden;
- reapertura/respuesta tardía con otra versión o CP; cuota y trabajos de fondo.

Estas pruebas de CE-1 están **pendientes de implementación**. Los 35 tests de
helpers existentes no las sustituyen. Se retiran como gates los escenarios de
24 h de FR-01; se conserva su evidencia histórica sin atribuirles validez actual.

**Estado:** FR-02 confirmada por la corrección del propietario. QA-01 y G0
aceptados al ordenar «cierra CE-005 y empieza CE-100»; acta en
[acceptance.md](acceptance.md). Continúa el diagnóstico de F1 en
[CE-100-readiness.md](CE-100-readiness.md), sin implementar esta política todavía.
