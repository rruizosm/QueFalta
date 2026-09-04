# CE-005 — Criterios de aceptación y cierre de F0

> 2026-09-02 · versión 1.0 · FR-02 y QA-01 confirmadas.
> CE-005 COMPLETADA; F0 ACEPTADA y G0 PASS. CE-100 iniciada en F1.
> Especificación de evaluación, no un informe de métricas alcanzadas.

Actualización posterior, 2026-09-03: [F1/G1 cerrada para el canario privado](CE-105-106-closure.md).
CE-100 conserva baseline incompleto; no se han acreditado las métricas de
calidad del motor. F2 iniciada después en [CE-200](CE-200-dataset.md), todavía
sin corpus completo ni holdout. El acta de este documento sigue siendo la de F0.

## 1. Contrato aprobado

Se conservan los umbrales del [plan maestro, §17](../../PROYECTO-COMPARADOR-ESTRICTO.md)
y se concreta cómo medirlos. La [política FR-02](freshness-policy.md), corregida
por el propietario, valida contra el catálogo activo y sus versiones, sin
caducidad automática por edad. Sustituye la propuesta FR-01 de 24 h.
Ningún umbral relaja D01–D14, formato exacto, cuarentenas o CU-01.

| Decisión | Estado | Alcance |
|---|---|---|
| CE-ENV-001 / D01–D14 / CU-01 | Confirmadas antes de CE-005 | Supabase directo, equivalencia estricta y uso solo con ahorro válido |
| SC-01 / BU-01 / RV-01 | Confirmadas en CE-004 | Cuatro tiendas, dos CP, presupuesto acotado y segunda revisión del propietario |
| FR-01 | DESCARTADA | La propuesta de TTL de 24 h nunca llegó a aplicarse; sustituida por FR-02 |
| FR-02 | CONFIRMADA | Catálogo activo tras sincronización; reevaluar altas/cambios, sin TTL comercial de 24 h; precio y embedding separados |
| QA-01 | CONFIRMADA | Umbrales y protocolo de este documento, aceptados al ordenar cerrar CE-005 |
| G0 | PASS / ACEPTADO | F0 cerrada con autorización expresa para empezar CE-100 |

Historial: el primer «adelante» solo permitió preparar CE-005; la corrección
posterior confirmó FR-02. Después de explicar que únicamente faltaba aprobar
calidad/rendimiento y cerrar F0, el propietario ordena **«cierra CE-005 y empieza
CE-100»**. Esta instrucción confirma QA-01 y el cierre G0 el 2026-09-02.
No significa que esas métricas estén alcanzadas, que G1 esté aprobado o que se
autorice activar CE-1, contratar servicios o ejecutar tareas fuera de CE-100.

## 2. Unidades, denominadores y corpus

F2 mantiene **5.000–10.000 parejas y ≥1.000 consultas lógicas origen→tiendas**.
No son 10.000 llamadas a Supabase. Registrar tienda, CP, familia, pack, variantes,
fuente y reloj por caso; etiquetas por dimensión independientes de la predicción.
Segunda revisión del propietario: todas las disputas y 20 % aleatorio; revisión
asignada, todavía no realizada.

- **Pareja:** origen y alternativa comerciales; un par de IDs repetido no crea
  una nueva demostración de identidad. Versiones/contextos pueden producir
  observaciones distintas, pero no se presuponen independientes.
- **Consulta lógica Q:** producto origen, destinos solicitados, CP/canal y reloj
  de referencia. Polling, retries y reaperturas no son consultas nuevas.
- **Caso de recuperación R:** consulta Q y una tienda destino, con su conjunto
  conocido de equivalentes. Máximo 50 candidatos por destino, como en BU-01;
  no unir 150 candidatos de tres tiendas y llamarlos top 50.
- **Decisión emitida B:** cada alternativa incluida en una respuesta con ahorro.
  Contar su corrección completa, no solo coincidencia textual o recuperación.
  Registrar agrupación por consulta/origen/entidad para tratar correlaciones.

Fijar etiquetas, elegibilidad, denominadores, mezcla de casos, particiones y
método estadístico **antes de evaluar el motor**. No quitar de los denominadores
una consulta elegible porque el motor se abstuvo, tuvo un error o no la recuperó.
Un dato que la referencia independiente demuestra y el motor no extrajo es
un fallo del motor, no una excusa para declarar el caso no evaluable.

Separar dos ejecuciones:

1. Replay de calidad con evidencia, reloj y revisiones del catálogo fijados;
   avanzar el reloj para fin de promociones y las revisiones para cambios/altas/bajas.
   No rechazar una captura solo por su edad ni atribuir ese rechazo al algoritmo.
2. Validación comercial/remota con datos actuales, presupuesto y relojes reales.
   Un replay correcto no acredita stock actual, cobertura local ni latencia remota.

Separación por entidades/componentes conectados sin GTIN/productos compartidos
entre calibración y holdout; hashes de datos, reglas y etiquetas. El corpus de
negativos difíciles sirve para regresión, no representa por sí solo la mezcla
de uso. En F2 fijar la muestra confirmatoria representativa del piloto y reportar
por separado ese resultado y el de casos adversariales. No elegir pesos tras ver
qué familias fallan ni presentar una muestra conveniente como precisión global.

## 3. Puertas de calidad

Todas son necesarias. «No evaluable» por muestra insuficiente no es PASS.

| Métrica | Numerador / denominador y gate |
|---|---|
| Reglas duras | Casos obligatorios correctos / ejecutados = 100 %; cero bypass de familia, variante, formato, precio, stock, zona o vigencia |
| Desconocidos/conflictos | Casos que se abstienen correctamente / casos con conflicto o desconocido obligatorio = 100 % |
| Precisión del ahorro | Decisiones B completamente válidas / todas las B emitidas ≥ 99,5 % en holdout independiente |
| Evidencia agregada | Límite inferior unilateral al 95 % de esa precisión ≥ 99,5 %, con diseño y dependencia justificados |
| Familia que se publicará | ≥ 200 decisiones emitidas distintas revisadas; precisión observada ≥ 99,5 %, cero error crítico e incertidumbre publicada |
| Hit@50 | Casos R con ≥1 equivalente conocido en los primeros 50 / R con ≥1 equivalente conocido = ≥95 %, antes del filtro final de ahorro |
| Mejor precio conocido | R que recuperan entre sus primeros 50 un equivalente de precio mínimo conocido / R con mínimo estricto verificable = ≥95 %; cualquier empate mínimo acierta |
| Utilidad de equivalencia | Q que recuperan ≥1 equivalente válido / Q con ≥1 equivalente estricto conocido y datos completos = ≥60 %, preservando el objetivo original |
| Utilidad de ahorro | Q con ≥1 alternativa válida más barata en la respuesta final / Q con ≥1 alternativa conocida más barata y todos los datos elegibles = ≥60 % |
| Evidencia comercial | Distintivos con importe, moneda, formato, fechas, disponibilidad y zona trazables / todos los distintivos = 100 % |
| Cuota | Cero cargos sin ahorro válido final, por error/pendiente/parcial inconclusa o duplicados; todos los escenarios CU-01 pasan |

La utilidad de ahorro es una **precisión adicional de QA-01 sobre el significado
de «utilidad»**, no una sustitución del objetivo original: se conservan ambos
cálculos. Evita aprobar mostrando o recuperando solo productos iguales de precio
o más caros. Los casos sin ningún ahorro conocido se informan aparte; no se
penaliza al motor por no inventarlo ni se usan para inflar el éxito comercial.

El mínimo conocido se refiere únicamente a evidencia del corpus, para el mismo
formato, zona, condiciones y reloj. Puede no ser inferior al origen; ese caso
sirve para evaluar recuperación, no para emitir ahorro. No es una afirmación
de que se conoce el menor precio del mercado.

Una decisión emitida sin prueba suficiente cuenta como no verificada y no puede
certificarse como correcta; no retirarla del denominador. Si el defecto está
en el propio etiquetado, registrar disputa y bloquear el informe hasta resolverla
sin adaptar la verdad a la predicción. Una abstención no aumenta precisión, pero
sí afecta cobertura y, en casos elegibles, recuperación/utilidad.

**El 99,5 % no autoriza errores críticos.** Un ahorro con pack, variante, precio,
zona o disponibilidad incorrectos, un bypass de vigencia, una cuota indebida o
un fallo de permisos bloquea el gate aunque el promedio supere ese porcentaje.
Vigencia significa FR-02: versión válida del catálogo y condiciones aplicables,
no menos de 24 h. No medir una política temporal que el propietario ha descartado.
Con cero salidas, precisión es indefinida; no se acepta un motor vacío.

Reportar cada numerador/denominador por familia, tienda destino y CP, además del
agregado; no promediar porcentajes con muestras diferentes sin mostrar pesos.
Una combinación sin evidencia no se certifica por arrastre. Si el alcance no
reúne muestra, ampliarla o proponer un alcance menor, con decisión registrada.

## 4. Evidencia estadística, sin confundir muestra con garantía

Usar intervalo binomial exacto cuando corresponda al diseño, no una aproximación
normal que colapse al observar cero errores. NIST describe el método exacto
para pocos fallos y distingue intervalos unilaterales y bilaterales:
[intervalos de confianza para proporciones](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm).

Para **n ensayos independientes, todos correctos**, el límite inferior exacto
unilateral del 95 % es `0,05^(1/n)`. Cálculo local, no resultado del comparador:

| n correctas de n | Límite inferior | Alcanza ≥99,5 % |
|---:|---:|---|
| 200 | 98,5133 % | No |
| 597 | 99,4995 % | No |
| 598 | 99,5003 % | Sí, bajo esos supuestos |
| 600 | 99,5020 % | Sí, bajo esos supuestos |

Por eso 200 por familia no certifica individualmente 99,5 % con ese nivel de
confianza: es el mínimo por familia del plan, con incertidumbre explícita.
El objetivo agregado no equivale a garantía por tienda, familia o todo el mercado.
Las 600 filas de CE-004 no son 600 aciertos independientes y no prueban esta puerta.

En F2, preregistrar unidad de muestreo y tratamiento de componentes correlacionados.
La tabla solo se aplica a ensayos cuya independencia y representatividad se
justifiquen. Para múltiples decisiones relacionadas usar un método válido para
ese diseño, no reemplazar n por el número de filas ni inventar un «n efectivo».
Si no puede justificarse, evidencia insuficiente. Con errores, calcular el
intervalo exacto/general apropiado; la fórmula de todos-aciertos deja de valer.

No reabrir el holdout para ajustar el motor. Una muestra insuficiente requiere
un nuevo tamaño/cohorte predefinidos antes de inspeccionarlos, o un procedimiento
secuencial válido fijado de antemano. No añadir ejemplos de uno en uno hasta que
el porcentaje pase. Si se modifica el motor tras un fallo, nueva evaluación
independiente conforme a CE-707.

## 5. Rendimiento, seguridad y carga

Se conservan **p95 ≤2 s** para respuesta caliente y para respuesta inicial
pendiente en cache miss. No son dos segundos para terminar todo enriquecimiento.
Pendiente solo es éxito de latencia si admite realmente un trabajo acotado y
devuelve identidad recuperable; una respuesta rápida de error no pasa por éxito.

QA-01 fija **≥100 consultas distintas por escenario** caliente/miss,
con mezcla, destino, red, dispositivo, carga y estado de caché registrados.
Separar duración del servidor y extremo a extremo hasta interpretar respuesta;
el objetivo se mide en el cliente de prueba. Ordenar duraciones de cada escenario
y tomar posición `ceil(0,95 × n)` (índice de base 1); no promediar percentiles.
Registrar todas las peticiones intentadas, errores, timeouts y reintentos; no
eliminarlos para mejorar latencia. Fallos sin respuesta válida se tratan como
incumplimientos, además de reportarse como errores; no como respuestas de 0 ms.

El mínimo combinado de 200 consultas no autoriza superar 100/día de BU-01:
repartir entre días/ventanas y respetar también 5 min SQL/día, transferencia,
concurrencia 1 y parada por salud. Si no caben, ampliar calendario, no límites.
Un ensayo secuencial no acredita rendimiento bajo carga pública concurrente;
la carga intensa se prueba fuera de la BD compartida y F8 exige su propia evidencia.

Regresión: typecheck, lint, tests SQL/unitarios/propiedades y flujos iOS/Android
según fase. Seguridad: cero hallazgo nuevo crítico/alto y negativos bajo roles
reales, sin privilegios de servicio en cliente. Preservar consumidores legacy.
Conservar métricas de coste por 1.000, p99, errores por tienda, cola, retrasos
de sincronización y revisiones por reconciliar,
abstención y recall@50; Hit@50 no se renombra recall, ni se exige recuperar el
95 % de un conjunto de más de 50 equivalentes dentro de 50 plazas.

Los criterios de parada y límites son los de [BU-01](budget.md), no se sustituyen
por estos promedios. Los mínimos de F8 (24 h/100 internas, 48 h/200 por escalón,
siete días/dos ciclos) permanecen. Ni el tiempo transcurrido ni cero tráfico
sustituyen muestras, revisión o autorización de activación.

## 6. Trazabilidad y ajustes frente al texto anterior

| Concreción CE-005 | Motivo | Tarea/prueba futura |
|---|---|---|
| FR-02: catálogo activo/versiones; se retira FR-01 de 24 h | Comparar datos que mantiene la app, sin caducidad artificial | CE-208/505/603; T28 |
| Evidencia de stock explícita y `synced_at` condicionado | Evitar defaults positivos y rejuvenecimiento | CE-301/505; T28/T35 |
| Cambios durante transporte/reapertura; idempotencia separada | Caché y cuota no convierten una revisión antigua en actual | CE-606/607/706; T30–T33 |
| Precio sin vector nuevo; altas y vacíos invalidados; sync/worker fuera de orden | Detectar ahorro nuevo y retirar el desaparecido sin trabajo vectorial innecesario | CE-505/606/706; T28/T31/T32/T35 |
| Denominadores de Q/R/B y top 50 por tienda | No ocultar misses o inflar recuperación con destinos agregados | CE-200/206/208/608 |
| Utilidad de ahorro ≥60 % además de utilidad de equivalencia | La lista principal solo promete opciones más baratas | CE-206/602/707 |
| Exacto unilateral y protocolo de independencia | 99,5 % observado no basta para certificar precisión | CE-203–205/707 |
| ≥100 por escenario de latencia y método de percentil | Benchmark reproducible dentro de BU-01 | CE-206/609/708 |

No se añaden tareas CE-xxx ni regresiones T36: se conservan **67 tareas y T01–T35**.
No se aprueba una nueva integración; el enriquecimiento se decide en F4 con
ganancia medida. La prioridad de FR-02 es coherencia con el catálogo e invalidación
comercial; no requiere consultas externas para sostener un TTL descartado.

## 7. Acta de cierre de CE-005 y G0

| Campo | Estado |
|---|---|
| Responsable | Codex prepara; propietario ratifica producto y cierre |
| Entregables | Este contrato, `freshness-policy.md` y `CE-005-evidence.json` |
| CE-005 | COMPLETADA como definición; FR-01 descartada, FR-02 y QA-01 confirmadas |
| Gate G0 | PASS: contrato, alcance, presupuesto, responsables y criterios aprobados |
| Aprobación | Usuario: «cierra CE-005 y empieza CE-100», 2026-09-02 |
| F0 / tareas | EN CURSO → ACEPTADA; CE-000–CE-005 cerradas; F1 iniciada por CE-100 |
| Autorización | CE-ENV-001 permite Supabase directo; F0 se limita a decisiones/inventario |
| Repositorio | `codex/phase5-observation`, HEAD `03b8ba273e17709fd8fc69c20dddb68c147a7e2a`; worktree preexistente preservado |
| Método | Lectura de código/documentos, fuente estadística primaria y cálculos locales reproducibles |
| Evidencia de diseño | 16 escenarios del TTL anterior conservados como historial descartado, no gates vigentes; nuevas regresiones FR-02 definidas, pendientes de implementar |
| Revisión FR-02 | 35/35 tests existentes de identidad/reconciliación correctos; no prueban el recálculo comercial completo |
| Validación de cierre | `npx tsc --noEmit`, 35/35 tests de helpers y `git diff --check` correctos; 14 documentos con enlaces/bloques válidos, 67 tareas (6 cerradas), T01–T35, D01–D14 y ocho hashes preexistentes conservados |
| Calidad, latencia y coste del motor nuevo | No medidos; muestra/holdout y motor todavía pendientes |
| Operaciones nuevas remotas de CE-005 | 0 consultas Supabase, 0 llamadas retailers/RPC, 0 escrituras/despliegues; diagnóstico de F1 separado en CE-100 |
| Integraciones, gasto, cuota | Sin altas, cambios de límites, contratos o contadores |
| Rollback | No aplica a escrituras remotas: no se ha ejecutado ninguna |
| Siguiente paso | [CE-100 iniciada](CE-100-readiness.md): diagnóstico realizado parcialmente; falta línea base completa de rendimiento |

La validación documental y el typecheck no sustituyen los gates de implementación.
Se mantiene la evidencia histórica: las métricas del nuevo motor no se han
medido, el corpus no está construido y los parches HNSW/modal no quedan aprobados.
Los requisitos operativos aún por verificar pertenecen a F1; G0 no certifica
backups, margen de carga ni permisos mínimos ya configurados. CE-ENV-001 permite
el destino productivo con los topes de BU-01, sin saltarse esos controles.
