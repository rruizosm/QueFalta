# QuéFalta — Contexto del proyecto

> Documento de contexto para agentes (Claude Code) y nuevos colaboradores.
> Resume identidad, arquitectura, decisiones clave y estado. Mantener al día.

## Reparación local de compilación en Xcode (2026-09-03)

- Los registros de Xcode mostraban `Framework 'React' not found` y después
  `unable to initiate PIF transfer session (operation in progress?)`.
- La caché Debug de este workspace contenía `React.framework` sin el ejecutable
  `React`, aunque el XCFramework original de `ios/Pods/React-Core-prebuilt`
  estaba completo. La fase de CocoaPods declara la carpeta como salida y podía
  omitir la copia al existir esa carpeta incompleta.
- Se apartó únicamente ese framework incompleto de DerivedData, conservándolo
  en `/private/tmp/quefalta-xcode-react-o_bvczhw/React.framework`, y se reinició
  el servicio de compilación bloqueado del editor (`SWBBuildService`). La nueva
  compilación restauró el binario de 110.374.464 bytes; su SHA-256 coincide con
  el original del Pod.
- `npx tsc --noEmit` y Debug con la caché de XcodeBuildMCP pasan. Debug también
  termina con `BUILD SUCCEEDED` y cero errores usando el DerivedData habitual
  de Xcode (`QuFalta-ezcfooquvvfmkmbomujykszbvwej`), destino iPhone 17 Pro,
  simulador iOS 26.5 arm64. Persisten avisos de dependencias nativas; no se han
  desactivado advertencias del compilador. No se arrancó la app.
- Reparación del entorno local, sin cambios de dependencias, código funcional,
  firma ni configuración nativa. Abrir `ios/QuFalta.xcworkspace`, scheme `QuFalta`.

## Proyecto CE-1: trabajo directo en Supabase autorizado (2026-09-02)

- ÚLTIMO AVANCE CE-203 (2026-09-04): [selección ciega y reanudación](docs/comparator-strict/CE-203-progress.md).
  Sorteo congelado desde la versión, hash del corpus y recibo CE-201/202:
  1.200/6.000 parejas aleatorias estratificadas por familia/cohorte + 175
  disputadas; 39 solapan, total **1.336** en 54 lotes. Libro local con evidencia
  fuente y desplegables, sin propuestas, predicciones, motivo de selección o
  gold. El propietario conserva la revisión; estado 0/1.336, arbitraje 0,
  CE-203/G2 `false`. No iniciar CE-204/205 todavía. Sin Supabase/retailers,
  cambios app/SQL/cron/syncs/embeddings, integración, despliegue, commit o push.
  Verificación integral terminada: TypeScript, ESLint y **592/592 pruebas PASS**.

- ÚLTIMO AVANCE CE-201/202 (2026-09-03): [cierre de primera anotación](docs/comparator-strict/CE-201-202-water-closure.md).
  CE-201/202 completadas: las 771 observaciones de agua permiten componer 2.485
  parejas; 2.483 son nuevas y la unión queda **6.000/6.000**, sin pendientes.
  Agua aporta 410 rechazos, 595 exclusiones y 1.480 abstenciones; ocho fuentes
  en disputa afectan 68 parejas. Un equivalente íntegro respaldado: Aquarel
  botella 1,5 L Consum/Mercadona, GTIN global `3700123300014`, formato exacto
  y sin contradicción. No es ahorro elegible: faltan precio/zona/stock/revisiones
  activas bilaterales. Cero gold y revisión independiente; CE-203/G2 pendientes.
  Siguiente CE-203: propietario revisa 20 % aleatorio y disputas en capa separada.
  Generador offline y hashes; capas previas intactas. Sin consultas al proyecto,
  cambios app/SQL/cron/syncs/embeddings, integraciones, despliegue, commit o push.

- AVANCE ANTERIOR CE-201/202 (2026-09-03): [Carrefour y reanudación](docs/comparator-strict/CE-201-202-yogurt-carrefour-progress.md).
  `label-yogurt-carrefour-v1`: 545 fichas nuevas (445 atributos/formato,
  100 por alcance), 431 anteriores intactas. Las 976 observaciones del bloque
  yogur quedan registradas, incluidos confusores; no equivalencias aprobadas.
  2.011 composiciones, 2.007 parejas nuevas y cuatro solapes editoriales:
  unión **3.517/6.000**, pendientes **2.483 de agua**. Propuestas de este lote:
  1.001 rechazos, 169 exclusiones y 841 abstenciones; no revisión humana
  individual ni métrica del motor. Ocho nuevas fichas en disputa y desacuerdo
  E07 (fresa/macedonia) conservados para arbitraje, sin sobrescribir versiones.
  108 formatos compatibles no aprueban variantes/comercio; cero positivos
  íntegros/gold/ahorros. CE-201/202 EN CURSO; CE-203 del propietario pendiente.
  35 pruebas nuevas, TypeScript/lint y **567/567 PASS**. Sin consultas al
  proyecto/retailers ni cambios app/SQL/cron/syncs/embeddings o integraciones.
  Seguir con agua y después completar positivos íntegros y revisión; no repetir
  extracción CE-200 ni reinterpretar sell_pack_unit=1 como un envase.

- AVANCE ANTERIOR CE-201/202 (2026-09-03): [Plusfresc y reanudación](docs/comparator-strict/CE-201-202-yogurt-plusfresc-progress.md).
  `label-yogurt-plusfresc-v1`: 219 fichas nuevas (207 atributos/formato,
  12 exclusiones de alcance), reutilizando las 212 anteriores byte a byte.
  449 parejas nuevas compuestas: 271 rechazos, 23 exclusiones, 155 abstenciones
  propuestas; no revisión humana individual ni evaluación de producción.
  Unión **1.510/6.000**, pendientes **4.490** (2.007 yogur / 2.483 agua).
  Cuatro nuevas fichas en disputa: arándanos/frambuesa, azucarado/sin añadido,
  dos conteos 6/8; 17 parejas con disputa incluyendo fuentes previas.
  25 formatos compatibles nuevos, cero positivos íntegros/gold/ahorros.
  CE-201/202 EN CURSO; CE-203 del propietario, 20 % + disputas, aún sin sorteo.
  35 tests nuevos; TypeScript/lint y **532/532 PASS**. Sin consultas al proyecto,
  retailer, cambios de app/SQL/cron/syncs/embeddings ni integraciones nuevas.
  Próximo: 545 fichas Carrefour pendientes, mediante capa incremental nueva.
  Mercadona/Consum/Plusfresc del bloque ya registrados; no reescribir capas
  congeladas, repetir extracción CE-200 ni confundir cantidad sin papel con total.

- AVANCE ANTERIOR CE-201/202 (2026-09-03): [yogures y reanudación](docs/comparator-strict/CE-201-202-yogurt-progress.md).
  `label-yogurt-v1`: 212 fichas (72 Mercadona, 118 Consum, 22 Carrefour),
  133 parejas nuevas compuestas desde hechos editoriales ligados a su observación.
  92 rechazos propuestos, 2 exclusiones, 39 abstenciones; 20 formatos iguales,
  cero equivalencias completas/gold/ahorros aprobados. No revisión humana individual.
  Unión acumulada: **1.061/6.000**, pendientes **4.939** (2.456 yogur / 2.483 agua).
  Cuatro fichas en disputa documental; azúcar añadido/total/edulcorantes separados,
  0% sin objeto no se completa, soja no implica sin lácteos, surtido no es mezcla.
  CE-201/202 siguen abiertas. CE-203 del propietario, 20 % + disputas, sin sortear.
  CLI `prepare-comparator-strict-yogurt-review.mjs`; 35 pruebas nuevas,
  TypeScript/lint y **497/497 PASS**. Fuentes y artefactos anteriores byte-idénticos;
  sin consultas a Supabase/retailers, cambios de app, SQL ni integraciones nuevas.
  Sus contadores son históricos; el lote Plusfresc y el pendiente actual
  figuran arriba. No sobrescribir v1 ni repetir CE-200/canarios.

- AVANCE ANTERIOR CE-201/202 (2026-09-03): [patatas](docs/comparator-strict/CE-201-202-potatoes-progress.md).
  Primera lectura de 146 fichas del bloque patatas (53 congelados y 93 confusores),
  922 parejas compuestas desde hechos editoriales ligados a la observación.
  No son 922 revisiones humanas individuales ni borradores promovidos. Propuestas:
  319 rechazos, 104 exclusiones, 499 abstenciones; solo 2 formatos íntegros iguales,
  sin equivalencia/ahorro aprobado. Unión con editoriales anteriores: 928 parejas
  distintas, E09 solapada sin cambio. Quedan 5.072 (2.589 yogur / 2.483 agua).
  CE-201/202 EN CURSO, sin positivos íntegros, gold, CE-203 ni G2. El propietario
  conserva su segunda revisión del 20 % y disputas, aún sin sortear/realizar.
  Lote `dataset/label-potatoes-v1`, CLI `prepare-comparator-strict-potato-review.mjs`
  y guía de reutilización; no parser F3 ni motor desplegado. 28 pruebas nuevas;
  TypeScript/lint y **462/462 tests PASS**. Fuentes y avances previos congelados,
  sin consultas al proyecto, DDL/DML, app, cron, syncs o contrataciones nuevas.
  Contadores históricos; el lote de yogur y el pendiente actual figuran arriba.
  El anterior estado de 5.993 pendientes queda preservado en su evidencia histórica.

- ACTUALIZACIÓN VIGENTE 2026-09-03: **CE-200 completada**;
  [acta y reanudación](docs/comparator-strict/CE-200-closure.md).
  4.176 referencias activas, 5.189 observaciones por ubicación y taxonomías
  originales; huellas coincidentes en segunda lectura. Corpus: 6.000 parejas
  únicas (4.000 estratificadas / 2.000 difíciles), 1.200 Q/600 orígenes, pesos y
  hashes congelados, cero gold/holdout. CE-201/202 deben etiquetar este corpus;
  CE-203–208 y G2 siguen pendientes. TypeScript/lint y **404/404 tests PASS**.
  CE-BU-002 retira el techo SQL acumulado y autoriza filas/transferencia para
  CE-200. Aplicada solo migración privada **20260903101356**, sin resets,
  grants app, catálogos, cron, RPC comerciales ni cambios del comparador publicado.
  Cierre: 1.518.920 ms, 108.246.478 bytes, 34.177 lecturas y 399 escrituras
  técnicas reservados; 0 jobs pendientes/bloqueos en comprobación puntual.
  Datos transferidos: 16,59 MiB dentro del margen Pro observado; sin nuevas
  integraciones, contrataciones ni cambios de compute. Guardas F1 históricas
  archivadas con su hash, política sucesora separada. No reejecutar canarios.
  Las notas siguientes de CE-200 abierta, «no más carga hoy» y sin nuevas
  consultas son avances anteriores, sustituidos por esta actualización.

- Actualización 2026-09-03, CE-SEQ-003: [CE-100 cerrada por el propietario](docs/comparator-strict/CE-100-owner-closure.md).
  Acepta continuar CE-103–106 con las limitaciones conocidas del baseline,
  sin cambiar el resultado a PASS. Controles de presupuesto, mínimo privilegio,
  salud y reversión siguen vigentes; no nuevos costes, carga masiva o activación.
  G1 se verifica en el cierre siguiente. Las referencias a CE-100 abierta más
  abajo son historial anterior.

- Estado actual 2026-09-03: **CE-103–106 completadas; F1/G1 PASS acotado**.
  [Acta y reanudación](docs/comparator-strict/CE-105-106-closure.md), con
  [JSON](docs/comparator-strict/CE-105-106-closure-evidence.json). Aplicadas solo
  la base `20260903080621` y los recibos duraderos `20260903084621` de CE-1.
  Cuatro tablas privadas RLS, sin grants a roles app ni exposición Data API.
  Integración mediante mensajes SQL transaccionales completos, reservas
  persistidas y ningún reintento automático. PG17.6 nativo: 16 grupos PASS,
  incluidas sesiones concurrentes, cancelación y muerte del proceso local.
  `npm run quality`: TypeScript/lint y 353/353 tests PASS.
  CI manual preparada, no ejecutada en GitHub. Servidor temporal detenido.
  Canario y reversión vía ejecutor confirmados: cero controles/identidades y
  cero trabajos pendientes; quedan cuatro trabajos de auditoría y una reserva.
  Un intento caducado antes del payload fue reconciliado sin resetear presupuesto.
  Reserva diaria 22.623.694/23.068.672 bytes y 299.920/300.000 ms; no más
  carga remota CE-1 hoy. Sin cambios en app, RPC legacy, cron, Auth/Plus ni
  catálogos. No activado el motor; CE-200 se inicia localmente a continuación.
  CE-100 conserva baseline incompleto: G1 no es certificación de rendimiento.
  Las notas inferiores de «sin escrituras/G1 pendiente» son históricas.

- CE-200 EN CURSO, 2026-09-03: [dataset y pendientes](docs/comparator-strict/CE-200-dataset.md).
  Constructor offline `scripts/prepare-comparator-strict-dataset.mjs`, plan de
  muestreo y artefactos en `docs/comparator-strict/dataset/`. Semilla histórica:
  72 productos, 648 parejas únicas, 144 borradores Q/432 casos destino; sin
  equivalencias etiquetadas, muestra confirmatoria ni holdout. No acredita el
  corpus requerido de 5.000–10.000 parejas y ≥1.000 Q. Los CSV antiguos son
  idénticos (400 parejas, no 800); 683 referencias legacy registradas como
  expuestas sin reutilizar sus etiquetas/atributos derivados. Cero llamadas
  nuevas a Supabase, retailers u OFF; app y fuentes intactas. TypeScript/lint
  y 367/367 tests PASS (14 nuevos). Falta adquisición y marco de muestreo
  representativo con presupuesto disponible. Este es el avance CE-200 inicial;
  la nota siguiente actualiza CE-201/202, sin modificar su semilla ni cerrar G2.

- CE-201/202 EN CURSO, 2026-09-03: [avance local y reanudación](docs/comparator-strict/CE-201-202-progress.md).
  Guía `ce202-v1`, validador offline de anotaciones y 22 propuestas reales
  separadas del seed: 9 exclusiones, 8 rechazos, 5 abstenciones; cero gold.
  56 casos sintéticos (32 CE-104 reutilizados + 24 nuevos), sin contarlos como
  corpus real. Natural no prueba endulzado; GTIN contradictorio se abstiene.
  Precio/ubicación/stock/revisiones siguen desconocidos en las 22 parejas.
  No revisión humana realizada ni 20 % sorteado, no parser ni motor evaluado.
  CE-200 abierta; CE-201/202 requieren el corpus completo; CE-203–208 pendientes.
  Puede prepararse CE-206/207 offline. Cero llamadas nuevas a Supabase, retailers,
  OFF/modelos o cambios de app, cron, cuota y dependencias. Presupuesto sin alterar.
  22/22 tests nuevos y `npm run quality` 389/389 PASS; TypeScript y lint correctos.

- [PROYECTO-COMPARADOR-ESTRICTO.md](PROYECTO-COMPARADOR-ESTRICTO.md) es el plan
  maestro para mejorar «Buscar productos más económicos»; la evidencia está
  en [COMPARADOR-ESTRICTO.md](COMPARADOR-ESTRICTO.md). Sus fases CE-1/F0–F8 no
  deben confundirse con las fases operativas del pipeline de embeddings.
- Plan v1.1: CE-ENV-001 registra la autorización del usuario para trabajar
  directamente en el Supabase actual, incluida producción. Ya no se exige
  backend separado ni esperar a F8 para cambios de BD dentro de cada fase.
- CE-000 completada: commit, worktree y precauciones registrados en
  [docs/comparator-strict/F0-baseline.md](docs/comparator-strict/F0-baseline.md).
  CE-001 completada: metadatos remotos reconciliados en
  [docs/comparator-strict/CE-001-supabase-inventory.md](docs/comparator-strict/CE-001-supabase-inventory.md).
  CE-002 completada: revisión independiente en
  [docs/comparator-strict/CE-002-independent-review.md](docs/comparator-strict/CE-002-independent-review.md).
  CE-003 completada: [registro de decisiones](docs/comparator-strict/decisions.md).
  CU-01 corregida tras la respuesta del usuario: un uso solo si la respuesta
  final correcta incluye al menos un equivalente válido más económico.
  Sin ahorro válido ofrecido, errores/pendientes o reintentos, cero descuentos
  adicionales. Se conservan tres usos por cuenta; pendiente de implementación.
  CE-004 completada: [presupuesto](docs/comparator-strict/budget.md) y
  [matriz de fuentes/zonas](docs/comparator-strict/source-zone-matrix.md).
  Aceptados Mercadona/Carrefour/Consum/Plusfresc, CP 08006 y 25001, sin nuevas
  contrataciones ni ampliaciones y con los límites de carga documentados
  (SC-01/BU-01). RV-01 confirmada: el propietario hará la
  segunda revisión del 20 % aleatorio y los casos discutidos en F2; todavía no
  realizada. CE-005 COMPLETADA: [vigencia](docs/comparator-strict/freshness-policy.md)
  y [aceptación](docs/comparator-strict/acceptance.md) ratificadas. FR-01 descartada,
  FR-02 confirmada por el propietario (catálogo activo, sin TTL de 24 h).
  QA-01 y G0 aceptados con «cierra CE-005 y empieza CE-100». F0 ACEPTADA;
  F1 después completada según el acta superior, sin dar las métricas de calidad
  del motor por alcanzadas.
  Cada fase exige tareas, entregables, métricas y acta de aceptación.
- CE-002 no aprueba los parches para release: HNSW mezcla recuperación, guard,
  umbral 0,59 e invalidación global. El guard aislado propuesto todavía acepta
  diferencias de endulzado, cantidad y pack; no confundirlo con CE-1 estricto.
  El modal conserva error/reintento, pero reaparece la ficha anterior al reabrir
  mientras carga; el fallback global no conserva procedencia comercial local.
  Evidencia SQL de solo lectura y sonda de hooks simulados; no pruebas nativas.
  `npm run quality` pasa con 213/213 tests; los cinco focalizados son estáticos.
- Captura CE-001: `auth.quefalta.es` corresponde a `gkffvigcnsesbaihycay`;
  cliente y backend usan v7, que reclama cuota antes del resultado. Timeout
  de finalizadora `20260901203103` aplicado (60 s); HNSW `20260902122234` pendiente.
- Pipeline pausado: cola de 20 mensajes (Gadis 19, Ahorramás 1), cron 17 inactivo.
  No se drenó ni reactivó. El JSON del acta conserva fechas y límites del snapshot.
- Historial: 80 entradas remotas frente a 163 SQL locales; 51 correspondencias
  por nombre con versión distinta/sin timestamp y dos entradas sin archivo del
  mismo nombre. No equivalen a SQL idéntico ni autorizan un `db push` genérico.
  GitHub `main` mantiene timeout DIA de 45 min, frente a 60 min en esta rama.
- Mayoría de syncs semanales/manuales; 15/20 estados globales superan 24 h en la
  captura. No son timestamps por producto ni exclusión por edad: FR-02 valida
  contra el catálogo activo y las últimas versiones válidas incorporadas.
- Reglas finales: cantidad nominal y estructura de pack exactas; tipo, sabor
  y endulzado separados; desconocidos/conflictos se abstienen. Ni GTIN ni IA
  permiten saltar formato, precio, vigencia o zona.
- Piloto aceptado: agua, yogur y patatas congeladas de envase fijo. Carne y
  embutidos quedan en cuarentena inicial. CE-005, FR-02 y QA-01 cerradas;
  G0 PASS permite iniciar F1, no saltarse sus controles ni activar CE-1.
- OFF ya está integrado para nutrición: solo se evaluará una ampliación de
  datos. pgTAP se recomienda en dev/CI; pg_jsonschema es condicional y GS1 un
  piloto opcional. No se ha instalado ni contratado nada.
- F1 prepara destino verificado, permisos mínimos, migraciones aditivas, límites
  de carga y reversión en la BD real. Separar objetos no aísla CPU/I/O/locks;
  se monitoriza el efecto sobre clientes existentes.
- No pedir permiso de nuevo por el mero destino productivo. Siguen requiriendo
  decisión específica costes no acordados, operaciones destructivas/masivas,
  ampliaciones de alcance y activación para usuarios en F8.
- CE-001/CE-002 solo consultan metadatos/lógica y actualizan documentación: no cambian
  código, migraciones, RPC ni datos remotos. Los cambios locales y fases
  operativas descritos a continuación mantienen su estado independiente;
  no se despliegan por arrastre.
- CE-003 solo consolida contrato/documentación, sin consultas nuevas a Supabase
  ni cambios en monetización efectiva. Distingue resultado sin ahorro de falta
  de evidencia/error; CE-005 retira después el TTL propuesto de 24 h con FR-02.
- CE-004 consulta metadatos y 600 filas de precios locales mediante agregados
  (no dataset de equivalencia), sin datos personales ni escrituras. Plan Pro
  confirmado; compute efectivo, factura, margen y CPU/I/O no verificados.
  Consum/Plusfresc tienen precios por zona/centro; Mercadona/Carrefour necesitan
  completar procedencia local. No extrapolar CCAA/provincia a un CP; Consum
  no tiene mapeo local para 25001. Muestras locales de ~31 h: esa edad no las
  excluye según FR-02, ni acredita equivalencia/zona/disponibilidad por sí sola.
  El marco aceptado limita lotes y concurrencia CE-1; no modifica límites ni procesos
  desplegados y no altera el trabajo de observación del pipeline. La mención
  histórica a Medium debe contrastarse con la captura Micro de CE-100.
- CE-005 / FR-02: el usuario rechaza las 24 h y fija el catálogo activo como
  referencia. Altas y cambios relevantes deben reevaluar ahorro, también cachés
  vacías y candidatos fuera del top-2. Precio/stock no forman parte del input
  vectorial: conservar vector compatible y recalcular ahorro sin esperar a otro.
  Baja conocida y promoción vencida retiran ahorro; sync fallido/parcial no
  acredita nuevas observaciones ni bajas por ausencia. No prometer tiempo real.
  35/35 tests locales de identidad/reconciliación correctos; recálculo comercial
  estricto aún no implementado. El JSON conserva los 16 escenarios del TTL
  anterior como historial descartado. QA-01 (≥99,5 %, utilidad y latencia) queda
  aceptada como criterio, no medida; CE-005 no añade consultas remotas ni código.
- CE-100 EN CURSO: [diagnóstico de preparación](docs/comparator-strict/CE-100-readiness.md)
  y [evidencia](docs/comparator-strict/CE-100-evidence.json). Reconfirmados ref
  `gkffvigcnsesbaihycay`, región eu-west-1, PostgreSQL 17.6, estado ACTIVE_HEALTHY
  y organización Pro. Cuatro consultas SQL READ ONLY acotadas, sin bloqueos
  observados en las dos muestras de actividad; no equivalen a una línea base
  de capacidad. Sesión administrativa `postgres` con BYPASSRLS: no prueba de
  permisos de cliente. Políticas de los cinco catálogos/precios consultados
  solo de lectura; hay grants de escritura amplios en cuatro tablas legacy,
  sin política RLS de escritura observada. No se han cambiado permisos.
  Pipeline aún pausado y cron 17 inactivo. Panel autenticado: diez copias
  PHYSICAL listadas, última 2026-09-02 08:00:12 UTC; PITR no activado. No se
  restauró nada. Compute actual MICRO/t4g.micro (1 GB), no Medium; no se cambió.
  Cuotas Pro no superadas y spend cap habilitado. CPU/memoria visibles, pero
  siete gráficos de I/O/red/conexiones/disco fallan tras un reintento. Falta
  línea base completa de carga; CE-100 sigue abierta, sin escrituras.
- Revisión CE-100 del 2026-09-03: [nueva evidencia](docs/comparator-strict/CE-100-capacity-recheck.md).
  Metrics API accesible con la credencial de servidor local existente, sin
  mostrarla/crear claves ni instalar servicios. Observador y analizador locales
  con 7 tests; quality 308/308. Panel aún incompleto; medias y logs recibidos
  no acreditan p95/tasa de errores/cobertura temporal del catálogo. No cerrar
  CE-100 ni habilitar escrituras con esta evidencia parcial. App/BD sin cambios.
- CE-100, ejecución posterior del 2026-09-03: [resultado de catálogo](docs/comparator-strict/CE-100-catalog-probe-results.md).
  61/61 lecturas válidas más una previa; mediana 368 ms, p95 3,49 s y máximo
  4,48 s. Baseline incompleto: la coordinación dejó 18/14/18 muestras por tramo
  de 5 min, no las 20 exigidas. No imputar huecos del conector a errores de BD.
  CPU media 4,10 %, máximo de intervalo 9,14 %, conexiones ≤16/60 y cero locks
  en muestras; hubo swap, sin causalidad demostrada. 20,94/22 MiB contabilizados,
  cuota Pro comprobada 3,901/250 GB. Usuario condicionó continuar a no añadir
  coste: se usó margen incluido, sin contrataciones ni cambios de recursos.
  Se aceptó el lock HTTP existente solo para esta prueba, sin cambiar roles.
  Ejecución terminada, manifiesto deshabilitado, sin usos comerciales ni
  escrituras. CE-100 abierta; corregir instrumentación local antes de repetir.
- CE-SEQ-001: el propietario ordena «Empieza con CE-101 y dejamos pendiente
  cerrar CE-100». CE-101 después completada con inventario y preparación de pruebas,
  sin cambiar servicios globales, activar CE-1 ni aceptar G1. CE-100 sigue
  pendiente; no se transfieren sus métricas ausentes a una aprobación implícita.
- CE-101 (documentado 2026-09-03): [inventario](docs/comparator-strict/CE-101-services-inventory.md)
  y [evidencia](docs/comparator-strict/CE-101-evidence.json). Tres SQL READ ONLY;
  HEAD local de catálogo y GET de ajustes públicos Auth responden 200 con ref
  correcta, sin sesión ni cuota. No es prueba del runtime nativo o de capacidad.
  Siete Edge ACTIVE; Auth email/Google/Apple, sin Auth Hooks; dos buckets públicos;
  cron de alertas activo cada 15 min aunque embeddings siguen pausados. Data API:
  `public`/`graphql_public`, autoexposición de tablas nuevas ON; revisar grants/RLS
  por objeto en CE-103. No cambiar Auth/Storage por arrastre. El propietario elige
  `@rruizosma`: existe un perfil coincidente, sin verificar token/UID. Manifiesto
  documental inactivo; control de acceso servidor pendiente. CE-VAL-001 cierra
  CE-101 al confirmar el propietario el catálogo en su móvil/producción 1.3.
  Se retira el requisito prematuro de instalar un build de desarrollo: no había
  código de app CE-1 nuevo. No se acredita runtime nuevo ni se conceden permisos.
- CE-SEQ-002 (2026-09-03): el propietario autoriza terminar CE-101, empezar CE-102
  y continuar a CE-103 si las guardas pasan. Secuencia ejecutada tras CE-VAL-001;
  CE-100/BU-01 siguen impidiendo escrituras sin baseline completo.
- CE-102 COMPLETADA localmente: [guardas](docs/comparator-strict/CE-102-execution-guards.md)
  y `scripts/lib/comparator-strict-guard.mjs`, con preflight offline, ref/origen
  exactos, hash revisado, objetos/filas explícitos, presupuestos, modo apply,
  comprobaciones previas al COMMIT y parada ante errores. No cambia la app ni
  procesos legacy. Sin adaptadores remotos: exige transporte transaccional y
  coordinador duradero exclusivo por proyecto; no tiene fallback inseguro.
  Tests locales con dobles, no prueba de permisos/canario en Supabase.
- CE-103 EN CURSO: [informe](docs/comparator-strict/CE-103-migration-readiness.md)
  y reconciliador local. Tres SQL READ ONLY sin errores: 80 entradas remotas,
  163 SQL locales, 27 asociaciones por versión y 51 por nombre; 50 textos
  correlacionados, 28 sin equivalencia acreditada, 2 sin candidato. 85 locales
  sin asociación no significan 85 pendientes de aplicar. `comparator_strict`
  no existe; base/coordinador propuestos sin crear. Finalizadora sigue en 60 s,
  HNSW no desplegado, pipeline pausado, cron 17 inactivo y 18 activo. Sin cambios
  remotos, reparación de historial ni nuevas integraciones. Continuar CE-103;
  CE-104/105/106 no iniciadas automáticamente, G1 pendiente.

## Recall del Radar en Bonpreu y bonÀrea (local, pendiente de desplegar, 2026-09-02)

- Reproducido en producción con Mercadona `31504` («Huevos grandes L»): la
  caché obtuvo 2 candidatos de Carrefour y 0 de Bonpreu/bonÀrea aunque ambos
  catálogos contienen huevos publicados, con precio y embedding vigente.
- Causa 1: el HNSW global aplicaba `store` como filtro posterior con
  `hnsw.iterative_scan = off`. La consulta pedía 20 vecinos, pero devolvía solo
  1 de bonÀrea y 6 de Bonpreu, todos irrelevantes. Con `relaxed_order` devuelve
  20 por tienda; el A/B caliente de las tres tiendas seleccionadas terminó en
  ~643 ms. La primera lectura fría de bonÀrea llegó a ~10,2 s, dentro del
  `statement_timeout` específico de 60 s de la RPC, pero justifica mantener el
  ajuste limitado a `catalog_embedding_candidates_v3`.
- Causa 2: la familia `eggs` exige que «huevos/ous» aparezca al principio. Un
  nombre como «BONPREU Huevos…» quedaba sin familia y v5 descartaba después los
  matches correctos. Además, al recuperar más vecinos apareció la necesidad de
  separar huevos de codorniz y huevos cocidos de los frescos.
- La migración local
  `20260902122234_fix_comparator_filtered_hnsw_recall.sql` activa el recorrido
  iterativo solo dentro de la función de candidatos, normaliza marcas propias
  antes de clasificar identidad, endurece codorniz/cocido y conserva el umbral
  global 0,60. El margen 0,59–0,60 solo se admite con familia reconocida e
  identidad compatible. Incrementa una vez la generación de cada tienda para
  reconstruir perezosamente los vacíos antiguos; no recalcula todo el catálogo
  ni reescribe el HNSW.
- Regresión local en
  `scripts/tests/comparator-filtered-hnsw-recall.test.mjs`; smoke transaccional
  preparado en `supabase/ops/verify-comparator-filtered-hnsw-recall.sql`.
  TypeScript y pruebas focalizadas pasan. **No está desplegada en producción.**
  CE-002 no recomienda incorporar el paquete tal cual a CE-1: separa el recorrido
  HNSW de identidad, umbral e invalidación. CE-ENV-001 ya autoriza el destino
  productivo; siguen pendientes la fase, pruebas, alcance y reversión del cambio.

## Apertura estable de resultados del Radar de ahorro (local, 2026-09-02)

- Corregido el cierre automático de la ficha anidada al tocar ciertos resultados
  de «Buscar productos más económicos». `StoreProductModal` abría la hoja con
  loader y llamaba a `onClose()` si el detalle devolvía `null` o fallaba, lo que
  producía el efecto de desplegarse y desaparecer unos instantes después.
- Los resultados del comparador proceden del catálogo global. Para Carrefour,
  Consum, Dia y Plusfresc la carga de detalle intenta primero la ubicación del
  perfil y, solo si esa fila no está disponible, recupera el mismo producto sin
  filtro regional. Este fallback se activa exclusivamente desde
  `SimilarProductsSection`; el resto de accesos conserva el filtro local.
- Si la ficha tampoco puede cargarse globalmente o hay un error de red, la hoja
  permanece abierta con cierre manual y «Reintentar», en vez de ocultarse sola.
  La carga queda ligada a producto, región, CP, idioma e intento para impedir
  que una respuesta obsoleta pinte otra ficha. `npm run quality` pasa con
  210/210 pruebas, incluida la nueva regresión de resiliencia.

## Fase 5A: mantenimiento preventivo de Postgres (producción, 2026-09-01)

- Desplegada como
  `20260901115631_catalog_embedding_postgres_maintenance_baseline.sql`. La
  tabla `catalog_product_embeddings` usa ahora
  `autovacuum_vacuum_scale_factor = 0.05` y
  `autovacuum_analyze_scale_factor = 0.02`; antes heredaba los globales
  0,20/0,10. El cambio no ejecuta `VACUUM`, `REINDEX` ni reescribe la tabla.
- `catalog_embedding_maintenance_status()` es una RPC `SECURITY INVOKER`
  exclusiva de `service_role`. Expone reloptions, umbrales estimados, tuplas
  muertas, último autoanalyze, tamaño/estado/uso del HNSW y mantenimiento en
  progreso; `requiresAttention` se activa desde el 5 % o si el índice deja de
  estar válido, listo o vivo.
- El smoke `verify-catalog-embedding-postgres-maintenance.sql` pasó con
  `ROLLBACK`, incluidos permisos y soporte de
  `hnsw.iterative_scan = relaxed_order` en pgvector 0.8.0. La opción solo se
  probó de forma transaccional: no está habilitada en ninguna búsqueda.
- Tras aplicar la migración, Postgres ejecutó un autoanalyze corto y dejó
  `n_mod_since_analyze = 0` sin iniciar vacuum. Snapshot posterior: 201.442
  tuplas vivas, 1.208 muertas (0,596 %), umbral estimado de vacuum 10.123,
  HNSW válido/listo/vivo de 597.745.664 bytes, cero locks o mantenimiento.
- La alerta diaria se define en
  `.github/workflows/catalog-embedding-maintenance.yml` y
  `scripts/check-catalog-embedding-maintenance.mjs`; fallará si se alcanza el
  5 %, derivan los reloptions o el HNSW se degrada. GitHub la ejecuta desde
  `main`.
- No reindexar automáticamente. Mantener compute Medium durante dos ciclos
  completos posteriores a esta base y comparar latencia, I/O, dead tuples y
  tamaño del índice. Solo usar `REINDEX INDEX CONCURRENTLY` con evidencia de
  bloat/degradación, dispatcher pausado y ventana de mantenimiento. Probar
  `relaxed_order` mediante A/B de latencia y recall antes de habilitarlo.
  Nota posterior CE-100 (2026-09-02): el panel muestra Micro actualmente.
  Esta instrucción de observación de Medium es histórica, no confirma el
  compute actual ni autoriza volver a cambiarlo. Revalidar capacidad antes
  de continuar el experimento; no trasladar conclusiones de Medium a Micro.
- Drenaje secuencial posterior al baseline: tras el canario 2716, la cadena
  2718–2746 procesó los 2.846 trabajos restantes en 29 ejecuciones
  (28×100 + 46), todas HTTP 200 y con 2.846 `completed`, 0 failed/stale/deferred
  y sin concurrencia. La cola quedó vacía y los runs de HiperDino, Gadis y
  Ahorramás se asentaron con un único bump por tienda: generaciones 6.907,
  37.485 y 18.079 respectivamente. Pipeline `paused`, cron 17 inactivo y cero
  jobs en vuelo. Este drenaje no cuenta como uno de los dos ciclos completos de
  sync.
- Postflight de la cadena: HNSW válido/listo/vivo y estable en 597.745.664
  bytes, 4.154 tuplas muertas (2,020 %), 2.946 cambios desde analyze, sin vacuum,
  mantenimiento de índice, bloqueos ni fallos abiertos.
- Los syncs posteriores generaron 2.131 dependencias adicionales de once
  tiendas. La petición 2778 confirmó que la finalizadora heredaba todavía el
  timeout corto de 8 s: falló antes de confirmar el primer sublote y los 100
  mensajes volvieron íntegros a la cola. La migración productiva
  `20260901203103_extend_embedding_finalize_statement_timeout.sql` fija
  `statement_timeout = 60s` solo en
  `catalog_finalize_embedding_batch(jsonb)`.
- La cadena reanudada 2780–2801 completó 2.131/2.131 en 22 ejecuciones
  (21×100 + 31), sin failed, stale, deferred ni respuestas HTTP fallidas. Los
  once runs se asentaron con 2.131/2.131 dependencias completadas y un único
  bump por tienda. Estado final: cola/vuelo 0, pipeline `paused`, cron 17
  inactivo, HNSW válido/listo/vivo de 597.745.664 bytes, 8.901 tuplas muertas
  (4,202 %), autoanalyze reciente y cero vacuum, locks o fallos abiertos.

## Fase 4: settlement e invalidación set-based (producción, 2026-09-01)

- Desplegada con las migraciones remotas/locales
  `20260901103216_embedding_runs_durable_settlement_and_set_based_invalidation.sql`,
  `20260901104518_phase4_legacy_materializer_compatibility.sql` y
  `20260901104730_phase4_manifest_revalidate_on_close.sql`. Los triggers legacy
  por fila se retiraron; insert/update/delete e invalidación de dependencias usan
  tablas de transición y se ejecutan una vez por sentencia.
- Cada sync nuevo registra un manifiesto M2M exacto por
  `expected_dependency_count`. Los runs pasan `running→draining→settled`; solo
  `completed`, `already_ready`, `superseded` y `terminal_failed` son terminales.
  El cierre marca `cache_bumped_at` y eleva la generación una única vez por run
  con impacto. Los fallos posteriores a escrituras también invalidan una sola
  vez; las escrituras sin run tienen fallback de un bump por tienda/sentencia.
- La invalidación como origen elimina en bloque solo los estados de caché de los
  productos realmente modificados. Como destino, la tienda se invalida al
  cerrar el run. El orden estable run→versión elimina el antiguo `SKIP LOCKED`.
  El registro acepta chunks de 500, pero revalida el manifiesto completo solo al
  cerrarlo, evitando el coste cuadrático observado durante la revisión.
- Los smokes productivos `verify-embedding-run-durable-settlement.sql` y
  `verify-embedding-run-legacy-compatibility.sql` pasaron con `ROLLBACK`. El
  canario HTTP 2705 completó 100/100, 0 fallos/stale/deferred, y la generación
  de HiperDino pasó exactamente 6.905→6.906; durante los primeros 90 resultados
  permaneció en 6.905 y solo saltó al asentarse el run.
- El PR #49 ya está fusionado en `main` (`b8cf096`) y publica el materializador
  nuevo. La compatibilidad temporal continúa desplegada hasta verificar dos
  ciclos completos; solo adopta jobs legacy cuando el conteo desde `started_at`
  coincide exactamente con `expected_embedding_jobs` y falla cerrada ante una
  diferencia.
- Backlog legacy ya adoptado: los 38 jobs de Gadis están ligados al run durable
  `1dda9168-c609-48d9-9221-7caff07368c4`; los 3.201 de HiperDino se registraron
  en siete bloques exactos (6×500 + 201) en el run
  `fae4f61b-4187-4488-9d8b-4deb55fdd058`. Ambos quedaron `draining`, con todos
  los enlaces `pending/queued`, equivalencia cola↔manifiesto y sin bump durante
  la adopción: HiperDino continuaba en generación 6.906. Los cuatro drenajes
  canarios 2709, 2710, 2712 y 2716 procesaron 400 dependencias, y la cadena
  secuencial 2718–2746 drenó después las 2.846 restantes en 29 ejecuciones
  (28×100 + 46). El resultado acumulado de la cadena fue 2.846 `completed` y
  0 failed/stale/deferred; HiperDino, Gadis y Ahorramás quedaron `settled` con
  todas sus dependencias completadas y un solo bump final por tienda. La cola
  está vacía; pipeline `paused`, cron 17 inactivo, 0 jobs en vuelo, fallos,
  bloqueos o vacuum. HNSW válido/listo y tuplas muertas 2,020 %.
- El stale-while-revalidate de la petición del comparador sigue pendiente como
  siguiente bloque; el camino actual ya elimina el fan-out de generación, pero
  todavía no programa el refresco de caché completamente en segundo plano.

## Fase 3: una sola mutación HNSW por cambio (producción, 2026-09-01)

- Implementada en
  `20260901094105_phase_three_single_hnsw_mutation.sql`. Añade
  `embedded_content_hash` sin backfill masivo. Un vector legacy con esa columna
  a `NULL` se considera ligado al input vigente hasta su primer cambio
  semántico; entonces el trigger conserva el vector y materializa el hash
  anterior, dejando la fila lógicamente pendiente.
- El worker y el materializador solo consideran listo un vector cuando modelo y
  hash embebido coinciden con el input actual. La finalizadora batch vuelve a
  validar publicación, `content_hash`, `embedding_input_hash`, versión y modelo,
  y sustituye `embedding` + `embedded_content_hash` en el mismo `UPDATE` CAS. Un
  resultado de OpenAI obsoleto se clasifica como `stale` y no puede pisar una
  versión más reciente.
- Las recuperaciones vectoriales v1/v2/v3, la reconstrucción de caché y las RPC
  internas v3/v5 excluyen tanto fuentes como destinos pendientes. El HNSW no
  incluye el hash en su predicado deliberadamente: hacerlo quitaría y volvería
  a insertar la fila en cada cambio.
- La migración quedó registrada en producción con la misma versión local,
  `20260901094105`. El smoke transaccional
  `supabase/ops/verify-embedding-phase-three-single-hnsw-mutation.sql`, que
  valida retención, exclusión de búsqueda, sustitución conjunta y carrera
  A→B→C con `ROLLBACK`, pasó sin residuos. `catalog-embed` v13 quedó `ACTIVE` y el bundle
  remoto coincide con `index.ts`, los dos helpers y `deno.json` locales. El
  smoke HTTP autenticado 2700 devolvió 400 `invalid_batch_size` sin reclamar
  cola.
- El canario único 2701 procesó 100/100 trabajos: 0 fallidos, obsoletos,
  diferidos o encadenados. Las 100 filas terminaron con vector, modelo y
  `embedded_content_hash = embedding_input_hash`; la cola bajó 3.401→3.301 y
  HiperDino subió 11.419→11.519 vectores listos. No hubo bloqueos, consultas
  largas, fallos ni vacuum activo, y el HNSW siguió válido/listo.
- Estado final: pipeline `paused`, presupuesto canario 0 y cron 17 inactivo.
  No usar `active` hasta desplegar la invalidación por run de Fase 4: el canario
  confirmó que el trigger actual todavía incrementa la generación de HiperDino
  100 veces (6.805→6.905). La separación física de la tabla de vectores queda
  como evolución posterior para independencia total frente a actualizaciones
  MVCC del catálogo.

## Hardening batch del worker (despliegue anterior, 2026-09-01)

- Aplicada en producción la migración
  `embedding_worker_phase_three_batch_writes` (remota `20260901072452`) y
  desplegado inicialmente `catalog-embed` v12, sustituido después por v13 en la
  Fase 3 HNSW. La finalizadora
  `catalog_finalize_embedding_batch(jsonb)` es `SECURITY INVOKER`, tiene
  `search_path` vacío y solo `service_role` puede ejecutarla; los privilegios
  mínimos de cola/archivo PGMQ quedaron verificados bajo ese mismo rol.
- OpenAI recibe bloques de 50 textos. El worker escribe sublotes de 20 productos
  (la RPC rechaza más de 25) con un único
  `UPDATE ... FROM jsonb_to_recordset`, CAS de publicación/hash/input/version/
  modelo y confirmación de PGMQ dentro de la misma transacción. Los fallos se
  registran por lote; un error determinista se aísla por bisección acotada y un
  error sistémico detiene el encadenamiento sin perder jobs.
- El smoke SQL real bajo `service_role` pasó completo y dejó cero residuos:
  escritura y fallo multi-fila, already-ready sin reescritura, carreras de hash,
  versión y publicación, identidad de cola incorrecta, fallo terminal a 20
  intentos y vector inválido con rollback integral. El smoke HTTP autenticado
  2687 respondió 400 `invalid_batch_size`, confirmando que el bundle v11 cargaba
  sin reclamar cola.
- Primer canario request 2688 (v11, sublote 25): 100/100, cuatro RPC, 0 fallos,
  stale, deferred o encadenamientos; máximo SQL 6,91 s, demasiado próximo al
  timeout REST de 8 s. Se ajustó a 20 y se desplegó v12. Segundo canario request
  2690: 100/100, seis RPC, 0 fallos/stale/deferred, ~15,7 s extremo a extremo y
  ~12,34 s SQL agregados; 0 locks, consultas largas o vacuum activo.
- Estado final: pipeline `paused`, cron 17 inactivo, 3.401 jobs visibles de
  HiperDino, 0 en vuelo/duplicados/fallos y 11.419 vectores HiperDino listos.
  No pasar aún a `active`: puede lanzar tres workers y la invalidación de caché
  continúa siendo row-level, con una actualización de generación por vector y
  riesgo de contención/deadlock si coincide con un sync. Antes de un drenaje
  continuo sigue pendiente la invalidación set-based por sentencia/run. Este
  hardening redujo las llamadas REST; la Fase 3 HNSW está implementada solo en
  local y todavía no cambia producción.

## Fase 1: materializador de embeddings idempotente (producción, 2026-09-01)

- Aplicada en producción la migración
  `20260831214031_embedding_materializer_phase_one_idempotency.sql` y desplegado
  `catalog-embed` v10. El código quedó fusionado en `main` mediante el PR #48
  (`11e2c2c`). El pipeline continúa en `paused`, el cron 17 está
  inactivo y quedan 3.601 jobs visibles de HiperDino, sin trabajos en vuelo ni
  duplicados.
- Se congela exactamente `catalog_embedding_content_v1`: las filas existentes
  conservan su texto/vector. `embedding_input_hash` identifica el input exacto,
  `semantic_identity_hash` decide si cambió el producto y
  `match_metadata_hash` separa GTIN/unidad/cantidad/publicación. Las cuatro
  columnas nuevas, incluida `category_family`, se desplegaron sin backfill.
- La cola impone unicidad por
  `(store, product_id, embedding_input_hash, model)`, incluida la compatibilidad
  con payloads legacy. Las reparaciones por vector ausente/modelo obsoleto son
  idempotentes; borrar un job obsoleto vuelve a garantizar la identidad vigente
  en la misma transacción y cierra la carrera A→B→A. Los fallos terminales
  suprimen el reintento automático hasta que se revisen y limpien.
- El guardarraíl de anomalías ya bloquea toda la materialización —upserts,
  despublicaciones y cola— y detiene el resto de tiendas; no se limita al
  dispatch. El override continúa siendo explícito y auditado.
- Smoke SQL real con `ROLLBACK` correcto: dedupe legacy/nuevo, job invisible,
  expected hash obsoleto, A→B→A, semantic-only, modelo obsoleto y fallo
  terminal. Gadis pasó un `DRY_RUN` y dos runs reales consecutivos con 10.901
  sin cambios, 0 upserts, 0 despublicaciones y 0 jobs.
- Dos canarios productivos de Fase 1 completados el 01-09: las peticiones
  manuales `pg_net` 2682 y 2684 procesaron los jobs legacy
  239803..239902 y 239903..240002 de HiperDino. Cada lote terminó con HTTP 200,
  100 completados, 0 fallidos, 0 obsoletos y 0 lotes encadenados. La cola bajó
  de 3.801 a 3.601 y HiperDino quedó con 11.219 vectores listos; después de ambos
  lotes seguían en cero los trabajos en vuelo, fallos, duplicados, bloqueos,
  consultas largas y autovacuum. El control quedó `paused` y el cron 17
  inactivo.
- El `DRY_RUN` global revisó 203.073 productos. El delta pendiente es real:
  7.024 altas, 709 cambios semánticos y 12.624 cambios solo de metadata; no hay
  regeneración masiva de las ~200k filas. Esclat (1.873 embeddings) y Carrefour
  (3.864) superan el límite automático, por lo que no se ejecutó el lote global.
  Mantener el drenaje continuo apagado: los dos canarios simples son sanos, pero
  antes de usar `active` conviene diseñar un drenaje de varios lotes con límite
  total explícito y observación entre lotes.

## Fase 0 del control de embeddings (local + backend, 2026-08-31)

- El pipeline tiene ahora un interruptor central en
  `comparator_internal.catalog_embedding_pipeline_control`: `paused` no
  despacha, cada activación de `canary` concede un único lote global y `active`
  conserva la concurrencia solicitada. El primer despacho canario consume el
  permiso, por lo que el worker no puede encadenar la cola completa.
- Cada reconciliación real se audita en
  `comparator_internal.catalog_embedding_runs`, con altas, cambios semánticos,
  cambios solo de metadatos, republicaciones, ausencias y embeddings previstos.
  Más de 1.000 trabajos o más del 10 % de la fuente bloquean automáticamente el
  despacho y dejan el pipeline en `paused`; el override explícito queda
  registrado.
- El reconciliador distingue ahora las causas del cambio y solo espera un
  embedding para altas, contenido semántico modificado o republicaciones sin
  vector reutilizable. Los cambios de GTIN/unidad/cantidad no regeneran el
  vector.
- Aplicadas en producción `embedding_pipeline_phase_zero_control`, su
  corrección `fix_embedding_phase_zero_special_expressions` y el presupuesto
  canario `enforce_single_canary_dispatch_budget`. Estado verificado:
  `paused`, cron 17 inactivo y apuntando a la RPC protegida, 3.901 trabajos
  visibles, cero en vuelo y cero ejecuciones de prueba persistidas. Las RPC de
  control son `SECURITY INVOKER` y solo ejecutables por `service_role`.
- No activar aún la cola completa. Dos canarios supervisados ya se completaron
  en Fase 1; el siguiente incremento debe conservar un presupuesto total
  acotado. Consultar primero
  `supabase/ops/README-comparator-embedding-pipeline.md`.

## Favoritos resilientes y menor fan-out inicial del catálogo (2026-08-31)

- Una incidencia productiva dejó Favoritos vacío y ralentizó Catálogo mientras
  Postgres acumulaba `statement_timeout` y un autovacuum de más de 2,7 horas
  sobre el índice HNSW de `catalog_product_embeddings`. La tabla `favorites`
  estaba sana: columna `store`, unicidad por tienda y 3.878 filas presentes.
- `FavoritesContext` conserva ahora un snapshot de categorías y productos en
  `startupCache`, siempre bajo una clave por usuario. Lo pinta antes de la red,
  revalida en segundo plano y hace dos reintentos acotados; un timeout transitorio
  ya no sustituye datos válidos por un vacío. El pull-to-refresh de Inicio también
  vuelve a consultar Favoritos y los toggles actualizan/revierten el snapshot.
- La carga inicial de Catálogo → «Todos» usaba el tamaño por defecto del
  paginador y pedía 50 filas a cada supermercado para mostrar 50 globales. Ahora
  usa lotes de 12, igual que la búsqueda conjunta, conservando los buffers y la
  tolerancia a fallos por tienda.
- Supabase no permite al rol del proyecto cancelar el trabajador de autovacuum,
  que pertenece al superusuario; el intento acotado al PID 1242429 fue
  rechazado sin modificar datos. No era un vacuum anti-wraparound. Como
  mitigación reversible se pausó el cron 17 `catalog-embedding-dispatch` para
  evitar nuevas escrituras de embeddings mientras termina; debe reactivarse al
  concluir y comprobarse la cola. La guía oficial de pgvector confirma que HNSW
  puede hacer lento `VACUUM` y recomienda reindexar primero si se programa
  mantenimiento manual. Regresión en `scripts/tests/favorites-resilience.test.mjs`.

## Materializador incremental del comparador y reparación de Gadis (2026-08-30)

- El sync de Gadis terminó correctamente con 10.901 productos publicados, pero
  el materializador posterior reescribía el snapshot completo en lotes de 50.
  El coste de actualizar la tabla y sus índices, incluido HNSW, rozaba el
  `statement_timeout` de 8 s de la Data API: hubo cancelaciones `57014` y el
  proceso quedó a medias con 5 productos ausentes y 14 filas huérfanas aún
  publicadas.
- `scripts/sync-comparator-embedding-catalog.mjs` reconcilia ahora el estado
  ligero existente antes de escribir. Solo hace upsert de productos nuevos,
  modificados o republicados, en lotes de 25, y despublica por identificadores
  exactos ausentes en lotes de 100. Las filas sin cambios ya no actualizan
  `source_seen_at`/`updated_at`; `source_seen_at` deja de ser el mecanismo de
  detección de ausencias.
- La reparación productiva escribió solo 5 filas, conservó sin tocar 10.896 y
  despublicó 14. Verificación final: 10.901 productos publicados tanto en
  `gadis_products` como en `catalog_product_embeddings`, cero faltantes, cero
  huérfanos, cero vectores pendientes, cola vacía y cero fallos abiertos. No
  aparecieron nuevos timeouts durante ni después de la ejecución.
- No requiere migración SQL ni aumento global de timeouts. La regresión vive en
  `scripts/lib/catalog-embedding-reconcile.test.mjs`; `npm run quality` pasa
  con 107/107 pruebas.

## «Todos» incluido para todas las cuentas registradas (2026-08-29)

- Tras desplegar la versión 1.3, el selector «Todos» deja de ser un beneficio
  Plus: cualquier cuenta registrada puede usarlo en Catálogo, Novedades,
  Ofertas y Cambios de precio.
- La 1.3 ya publicada todavía decide el acceso mediante
  `profiles.legacy_all_stores_access`. La migración
  `20260829124046_grant_all_registered_users_all_stores_access.sql` cambia su
  `DEFAULT` a `true`, habilita los perfiles existentes que quedaban a `false` y
  mantiene el trigger que impide modificar el permiso desde el cliente.
- Antes del cambio, Supabase tenía 4.211 usuarios Auth con sus 4.211 perfiles:
  4.051 habilitados y 160 bloqueados. El cliente siguiente elimina el gate y
  retira «Todos los supermercados» de los beneficios comerciales del paywall.
- Aplicada en producción como `20260829124046`. Verificación posterior:
  4.211/4.211 perfiles habilitados, cero bloqueados, `DEFAULT true` y trigger
  protector activo.
- El popup de la 1.3 pasa a distinguir las cuentas anteriores por `created_at`,
  no por el permiso de «Todos», para que las altas posteriores no reciban una
  bienvenida heredada.

## Froiz y Alcampo pasan a sync productivo local con embeddings (2026-08-29)

- Los workflows `sync-froiz.yml` y `sync-alcampo.yml` dejan de tener `schedule`:
  conservan solo `workflow_dispatch` para diagnósticos manuales porque ambos
  orígenes fallan desde las IP de GitHub Actions.
- Froiz dispone de `scripts/run-froiz-sync.ps1`; Alcampo amplía
  `scripts/run-alcampo-playwright.ps1`. Tras un sync real con código 0 ejecutan
  `sync-comparator-embedding-catalog.mjs` con `STORES=froiz|alcampo`, que
  materializa los cambios y da el impulso inicial a los workers. `DRY_RUN` y
  Alcampo sin `-Publish` omiten el postproceso.
- La pantalla Perfil → Soporte → Actualización de catálogos ya queda
  actualizada por ambos syncs: `recordCatalogSync` se ejecuta después de los
  upserts y `markStale`, y la app lee `catalog_sync_status` incluyendo ambas
  cadenas. La fecha representa el catálogo de origen; un fallo posterior del
  materializador no oculta que el catálogo sí terminó correctamente.
- Froiz figura con `synced_at=2026-08-29T11:30:34.814Z`. Alcampo no había
  creado su fila aunque su producto más reciente llevaba
  `synced_at=2026-08-21T09:05:06.908Z`; a petición operativa se registró esa
  misma marca comprobada en `catalog_sync_status`, sin presentarla como una
  ejecución nueva. Verificación posterior: la fila de Alcampo devuelve
  exactamente `2026-08-21T09:05:06.908+00:00`.
- Regresión en `scripts/tests/comparator-sync-integration.test.mjs`.

## Preproducción del vídeo promocional de la versión 1.3 (2026-08-29)

- El concepto parte de un `1.2.1` monumental, viejo, sucio y con telarañas que
  las mascotas intentan desmontar antes de revelar la versión 1.3.
- El primer style frame vertical 9:16 está en
  `marketing/version-1.3/style-frame-1.2.1-viejo-v1.png`: el plátano actúa sobre
  el `2`, el tomate sobre el último `1` y la berenjena entra desde la derecha
  llevando una escalera.
- El frame es una referencia de composición, iluminación y materiales, no un
  fotograma definitivo. Para animar se generarán poses y objetos aislados; así
  los agarres, tirones, dígitos, telarañas, polvo y escalera podrán componerse
  de forma determinista sin depender de texto generado dentro del vídeo.
- Las primeras poses maestras del plátano, tomate y berenjena con escalera están
  en `marketing/version-1.3/assets/`. Sus direcciones de acción ya son las
  correctas. Los masters `*-v1.png`, con el damero incrustado por ImageGen, se
  conservan como referencias RGB. Las versiones finales `*-rgba-v2.png` se
  regeneraron sobre croma cian y se recortaron localmente; son PNG RGBA de
  1024 x 1536 px con alfa real verificado y ya están listas para el montaje.
- `marketing/version-1.3/style-frame-1.2.1-acciones-v2.png` es la nueva
  referencia de composición: corrige al tomate a la derecha del último `1` y
  muestra con claridad las fuerzas opuestas de los dos tirones.
- Se añadieron tres poses intermedias transparentes `*-rgba-v3.png`: agarre
  inicial del plátano, arranque del último `1` por el tomate y plantado de la
  escalera por la berenjena. Todas son RGBA 1024 x 1536 con alfa verificado. El
  README del paquete recoge un ritmo provisional de 4,8 segundos para la
  primera animática y la revelación final de `1.3`.
- La placa vacía del escenario y los dígitos móviles están en
  `marketing/version-1.3/assets/`. El `2` y el último `1` se extrajeron sobre
  croma magenta para conservar su pintura azul y son PNG RGBA 941 x 1672 con
  alfa verificado.
- `keyframe-ruptura-v1.png` y `keyframe-revelado-1.3-v1.png` completan el arco
  visual. La primera animática está en
  `marketing/version-1.3/animatica-1.2.1-a-1.3-v1.mp4`: 5 segundos, 1080 x
  1920, 30 fps, H.264 y sin sonido. Es una prueba de ritmo con cortes de pose,
  todavía sin interpolación, partículas animadas ni diseño sonoro final.
- La referencia vigente es
  `marketing/version-1.3/animatica-1.2.1-a-1.3-v4.mp4`: 6 segundos, 1080 x
  1920, 30 fps, H.264 y AAC estéreo. Ya desplaza y rota el `2` y el último `1`,
  interpola las poses, hace entrar a la berenjena y plantar la escalera, y
  añade polvo, estelas, vibración, destello de transformación, celebración y
  diseño sonoro sincronizado. El render reproducible está en
  `marketing/version-1.3/render_animatica_v2.py`; la mezcla sin recursos de
  audio externos está en `marketing/version-1.3/sound-design-v1.ffilter`.

## Alertas personalizadas activas para todas las cuentas (2026-08-28)

- `process-price-alerts` v6 ya usa `claim_price_alert_deliveries` y procesa las
  reglas activas de cualquier cuenta; se retiró el `EVALUATION_USER_ID` que
  limitaba la prueba a `@rruizosma`.
- El cron permanente `process-price-alerts-every-15-minutes` (job 18) está
  activo en producción. Llama cada 15 minutos mediante `pg_net` y conserva el
  secreto en Vault; reutiliza temporalmente el token interno del worker de
  embeddings que ya comparten Vault y Edge Secrets.
- La RPC general solo materializa eventos cuando `catalog_sync_status` confirma
  que el sync de la tienda terminó. Además omite lotes con más de 400 altas:
  son llenados/importaciones masivas, no una novedad apta para push. El lote de
  1.568 altas de Esclat del 25-08 queda por tanto excluido.
- Migración local `20260828164258_generalize_price_alert_processor.sql`, aplicada
  directamente en producción. La Edge Function y el SQL siguen autenticando con
  secreto y `claim_price_alert_deliveries` conserva `EXECUTE` solo para
  `service_role`.
- Al activar había 12 reglas: seis de `@rruizosma` (cinco activas) y seis de
  `@peperuben` (seis activas). Regresión en
  `scripts/tests/price-alerts-ui.test.mjs`; `npm run quality` pasa 100/100.
- Primera ejecución permanente verificada a las 17:00 UTC: cron y Edge Function
  v6 respondieron correctamente, no quedaron entregas `processing` y el lote
  masivo de Esclat produjo cero entregas. `@rruizosma` recibió 105 entregas
  agrupadas en cinco notificaciones, incluidas sus 10 novedades de Mercadona;
  `@peperuben` recibió 21 novedades agrupadas en una entrada de bandeja y sus
  otras 124 coincidencias quedaron `paused` por el cupo gratuito. Esta cuenta
  no tiene token push, por lo que su aviso existe solo en la bandeja.

## Sync de Mercadona resistente a ráfagas 403/429 (2026-08-28)

- El run manual `33162575907` abortó con 408/7.399 subcategorías fallidas
  (5,5%) antes de escribir en Supabase. Los `403` afectaron en distintos
  momentos a 148 de las 151 categorías y las mismas URLs volvieron a responder
  200, lo que descarta categorías retiradas y señala limitación temporal de la
  IP del runner por parte de Mercadona/WAF.
- `sync-catalog.mjs` reduce la concurrencia de categorías de 3 a 2 y separa las
  peticiones de cada worker al menos 250 ms. Ante `403/429`, un cooldown global
  de 30 segundos detiene todos los workers, respeta un `Retry-After` mayor y
  registra una muestra acotada de cabeceras/cuerpo para futuros diagnósticos.
- Las parejas almacén/categoría que agotan sus intentos se reintentan en hasta
  dos pasadas seriales, separadas por 60 segundos, antes de calcular el umbral
  final. Una recuperación tardía conserva la prioridad original de almacenes
  para `source_wh` y precios.
- El cortafuegos continúa en 3% y sigue situado antes de cualquier upsert o
  despublicación. El workflow dispone de 90 minutos para absorber cooldowns;
  no se sacrifica integridad por completar el job.

## Compra Plus clara y prueba condicionada para la versión 1.3 build 49 (2026-08-28)

- Apple no aceptó continuar con la build 46: App Review señaló bajo 3.1.2(c)
  que el flujo no explicaba que, tras la prueba, el cobro se inicia
  automáticamente ni mostraba claramente el importe posterior.
- El reemplazo conserva la versión comercial 1.3 y comprueba en iOS que el
  producto anual publica una prueba gratuita de una semana y que
  RevenueCat/StoreKit devuelve elegibilidad confirmada para la Cuenta de Apple
  actual. Solo entonces muestra la insignia y el CTA de siete días; `unknown`,
  no elegible, sin oferta o error usan el CTA normal sin prometer prueba.
- Debajo del botón de compra se muestran las condiciones del plan seleccionado
  con el `priceString` localizado de la tienda: duración de la prueba y precio
  anual posterior cuando corresponda, inicio automático del cobro y renovación
  anual o mensual hasta la cancelación. Los textos existen en castellano y catalán.
## Prueba anual condicionada por elegibilidad para la versión 1.3.1 (2026-08-27)

- La versión 1.3 build 46 anuncia siempre siete días gratis en el plan anual;
  App Review detectó que su cuenta sandbox no recibía la oferta. Apple permite
  aprobar esa build como bug-fix submission y corregir la presentación después.
- Para 1.3.1, el cliente comprueba en iOS que el producto anual publica una
  prueba gratuita de una semana y que RevenueCat/StoreKit devuelve elegibilidad
  confirmada para la Cuenta de Apple actual. Solo entonces muestra la insignia
  y el CTA de siete días; `unknown`, no elegible, sin oferta o error usan el CTA
  normal sin prometer prueba.
- La oferta de App Store Connect está activa exclusivamente en España del
  2026-08-21 al 2036-08-21, igual que la disponibilidad prevista de la app, y el
  Paid Apps Agreement figura activo. `app.json` permanece en 1.3.0 porque la 1.3
  aún no se ha publicado. Las builds 47 (1.3.0) y 48 (1.3.1) ya se generaron
  antes de añadir esta divulgación; EAS conserva el build number remoto con
  `autoIncrement`, por lo que el reemplazo esperado es la build 49.

## Lotes del materializador del comparador limitados a 50 (2026-08-27)

- Los upserts de `sync-comparator-embedding-catalog.mjs` usan lotes fijos de 50
  productos. Los lotes anteriores de 500 rozaban o superaban los 8 segundos del
  `statement_timeout` efectivo de la Data API y fallaban con PostgreSQL `57014`.
- El sync de origen no estaba afectado: el fallo aparecía al materializar
  `catalog_product_embeddings`. El mismo patrón se observó en Gadis, Esclat y
  Ahorramás, por lo que la corrección se aplica al materializador compartido.
- El workflow de Gadis dispone de 60 minutos en vez de 30 para cubrir sus
  aproximadamente 17 minutos de rastreo más las transacciones cortas del
  materializador sin agotar el timeout global del job.
- No cambia la semántica incremental, el disparo por evento ni el tamaño de los
  lotes del worker de embeddings; solo se acorta cada transacción REST de upsert.
- Verificación productiva real: Gadis completó 10.885/10.885 productos, lanzó
  un worker y terminó con cero productos publicados sin embedding, cero
  embeddings publicados obsoletos, cola vacía y cero fallos. `npm run quality`
  pasa con 92/92 pruebas.

## Embeddings del comparador sin polling continuo (2026-08-25)

- El materializador de cada catálogo llama al terminar a
  `catalog_dispatch_embedding_jobs(3)`, una RPC `SECURITY INVOKER` disponible
  exclusivamente para `service_role`. `DRY_RUN` no arranca ningún worker.
- El impulso inicial reclama hasta tres lotes de 100 trabajos. Cada instancia
  de `catalog-embed` reclama solo un lote adicional al terminar, manteniendo la
  concurrencia acotada hasta vaciar `catalog_embedding_jobs` sin ramificación.
- El cron remoto `catalog-embedding-dispatch` deja de ejecutarse cada 10
  segundos y queda como red de seguridad `*/15 * * * *` para impulsos perdidos
  y reintentos tras el visibility timeout. La Edge Function `catalog-embed` v9
  y la migración local
  `20260825174505_event_driven_catalog_embedding_dispatch.sql` están
  desplegadas en producción; la migración remota es `20260825175141`.
- Verificación real: `anon`/`authenticated` no pueden ejecutar la RPC,
  `service_role` sí; un mensaje duplicado controlado se despachó por evento,
  `catalog-embed` respondió HTTP 200 y la cola volvió a cero. Los advisors no
  añadieron incidencias y `npm run quality` pasa con 90/90 pruebas.

## Resultados del Radar de ahorro localizados (2026-08-24)

- El cliente envía el idioma activo a `catalog_cheaper_products_v7`. En catalán,
  Mercadona, Esclat, bonÀrea, Sorli, Condis, Ametller Origen y Plusfresc devuelven
  `display_name_ca`; si una cadena o producto no publica nombre catalán se usa el
  nombre original como fallback.
- La comparación semántica, el orden por precio y el cupo de tres usos gratuitos
  no cambian. La v6 permanece disponible para clientes publicados.
- Migración local `20260824213612_localize_comparator_results.sql`, desplegada
  en producción como `20260824213809`. Una llamada autenticada real a v7 con
  `ca` devolvió «Galetes Rebuenas Hacendado farcides de xocolata»; la prueba se
  ejecutó dentro de una transacción revertida para no consumir cupo.
- El selector de «Producto asociado» consulta en paralelo los índices ES y CA
  de los siete catálogos bilingües. El texto de búsqueda puede estar en cualquiera
  de los dos idiomas, pero el nombre mostrado y guardado lo decide siempre el
  idioma activo de la app; los duplicados ES/CA se fusionan por tienda+producto.

## Beneficios mostrados en QuéFalta Plus (2026-08-24)

- «Filtros avanzados» deja de aparecer entre las funciones que desbloquea Plus
  en castellano y catalán. Los seis beneficios restantes conservan tipografías
  e iconos legibles, con descripciones más directas.
- La composición aprovecha toda la altura disponible: reduce solo separaciones
  secundarias y ancla «Elige tu plan», planes, CTA y enlaces legales al bloque
  inferior. En una pantalla habitual se ve todo sin desplazamiento; el scroll
  sigue disponible como respaldo accesible.

## Teclado del editor de alertas personalizadas corregido (2026-08-24)

- La hoja de crear/editar alertas evita ahora el teclado mediante padding tanto
  en iOS como en Android edge-to-edge. El bloque se mantiene por encima del
  teclado y su contenido desplazable conserva visible el campo enfocado.
- Se puede ocultar el teclado arrastrando y los toques en los controles del
  formulario siguen respondiendo mientras está abierto. Cambio solo de cliente.

## Popup de novedades para cuentas anteriores a 1.3 (2026-08-24)

- Tras entrar en la app, las cuentas con `legacy_all_stores_access=true` ven una
  bienvenida compacta a la versión 1.3. Una descarga directa con una cuenta
  nueva no la muestra; el cierre se guarda por usuario y dispositivo en
  `@whats_new_seen:1.3.0:${userId}`.
- El modal es centrado, no ocupa toda la pantalla y puede cerrarse con la X, el
  fondo, Atrás del sistema o el CTA. Respeta Reducir movimiento, modo
  claro/oscuro, color de acento, texto grande y castellano/catalán.
- Comunica cuatro novedades ya listas: 18 supermercados y conservación de
  «Todos», búsqueda por relevancia con tolerancia a erratas, Radar de ahorro
  con tres usos gratuitos, y comentarios/iconos/grupos ilimitados.
- Las alertas personalizadas quedan deliberadamente fuera hasta activar y
  validar su entrega general. Regresión en
  `scripts/tests/whats-new-prompt.test.mjs`.

## Activación inmediata y estable de QuéFalta Plus (2026-08-24)

- Una compra o restauración validada por el SDK de RevenueCat activa al momento
  `isPremium` y la insignia dorada. Durante 60 segundos, una lectura de perfil
  anterior al webhook no puede pisar ese entitlement optimista; en cuanto
  Supabase devuelve un Plus activo vuelve a ser la autoridad.
- `sync-plus-subscription` es una Edge Function autenticada de confirmación:
  deriva el usuario del JWT, consulta el CustomerInfo v1 de RevenueCat con
  `REVENUECAT_REST_API_KEY` y escribe `premium_until`/`verified` con service role.
  No acepta uid ni fecha desde el cliente y nunca revoca ante una respuesta
  ausente; el webhook conserva renovaciones, cancelaciones y expiraciones.
- `revenuecat-webhook` v5 y `sync-plus-subscription` v1 constan activos en
  producción. Pendiente operativo: guardar `REVENUECAT_REST_API_KEY` y completar
  la prueba sandbox; hasta entonces la confirmación directa responde 503 y el
  webhook sigue siendo el respaldo. Cambio sin migración SQL.

## Cabecera y estados visuales de alertas personalizadas corregidos (2026-08-24)

- La cabecera de Alertas personalizadas usa un tamaño adaptado para mostrar el
  título completo incluso con los botones Atrás y Añadir en un iPhone estrecho.
- El interruptor de una alerta activa usa ahora el accent sólido con thumb
  blanco; el estado inactivo conserva el color neutro. El estado accesible del
  control refleja el mismo booleano que se persiste en la regla.
- Los interruptores de tipos de aviso dentro del editor (bajada, oferta y
  novedad) comparten exactamente ese mismo diseño activo/inactivo y exponen su
  estado real a accesibilidad.
- Cambio solo de cliente, sin migración ni modificación de cupos.

## Hallazgos medios de Inicio/Catálogo/Cesta/Grupos corregidos (2026-08-24)

- Los controles de icono auditados ya exponen nombre, rol y estado a
  VoiceOver/TalkBack: asignar/vaciar, checkbox de recogido, plegado de
  tienda/zona, lista/cuadrícula, volver, compartir, expandir y acciones de
  miembros.
- Detalle de grupo prepara la cesta una sola vez con `useMemo` y la pinta con
  `SectionList`; al expandir desmonta la copia normal, por lo que nunca mantiene
  dos cestas completas ni renderiza todos los productos mediante `ScrollView`.
- Cesta deja de animar altura/opacidad en cada fila desde JavaScript. Las zonas
  plegadas retiran sus datos virtualizados y usan una sola transición de layout,
  respetando reducción de movimiento.
- Añadir miembro publica amigos+miembros como un snapshot conjunto, muestra
  error recuperable y serializa las altas. Transferir administración y expulsar
  requieren confirmación explícita.
- La cuadrícula usa `useWindowDimensions` y adapta 3/4/5 columnas a rotación,
  Split View/iPad y ventanas Android. `ProductImage` conserva un fallback
  visible ante errores y las tarjetas de Añadir miembro adoptan el redondeado de
  Grupos.
- Sin cambios de backend ni onboarding. `npm run quality` pasa con 73/73 pruebas,
  los exports Hermes de iOS y Android terminan correctamente y la build Release
  de iOS compila, se instala y arranca en el simulador iPhone 15 Pro (iOS 26.5).

## DAU, WAU y MAU exactos de la app (2026-08-24)

- La app registra una entrada de actividad cuando recupera una sesión en primer
  plano y cada vez que pasa de segundo plano/inactiva a activa. El registro es
  best-effort: un fallo de analítica nunca bloquea el acceso.
- `public.record_app_activity(platform, app_version)` es la única frontera de
  cliente. Exige sesión y delega en una función privilegiada de `private`, que
  deriva usuario y hora en servidor; no acepta fechas ni ids suministrados por
  el dispositivo.
- `private.app_daily_activity` conserva una fila por usuario y día natural de
  `Europe/Madrid`, con primera/última actividad, entradas al primer plano,
  plataformas y última versión. La tabla y la vista agregada no son legibles
  por `anon` ni `authenticated`.
- `private.app_active_user_metrics` devuelve DAU del día, WAU móvil de 7 días y
  MAU móvil de 30 días. No hay backfill con Auth: `tracking_started_on` deja
  clara la cobertura y la medición exacta comienza al distribuir este cliente.
- Migraciones locales `20260824170826_app_active_user_metrics.sql` y
  `20260824171201_app_active_user_metrics_hardening.sql`, desplegadas en
  producción como `20260824171037` y `20260824171226`. Prueba autenticada
  transaccional correcta; permisos y asesores sin incidencias relacionadas.

## Imágenes y categorías de Froiz recuperadas (2026-08-24)

- La API pública de Froiz sí entrega `image_id`, categoría, sección y familia.
  El sync construía mal las miniaturas al anteponer a `image` una base que ya
  contenía el identificador de Cloudflare Images; todas las URLs duplicaban ese
  identificador y devolvían 404. Ahora usa una URL pública estable derivada de
  `image_id`, con parseo de la ruta como fallback.
- Catálogo vuelve a mostrar Productos/Categorías para Froiz, carga el árbol ya
  existente en `froiz_categories` y navega a sus productos por subcategoría.
  Producción conserva 12 categorías principales, 539 subcategorías y 6.889
  productos categorizados.
- Las miniaturas existentes se repararon directamente desde `raw.image_id` en
  producción. Hay 6.877 URLs estables; los 12 productos para los que Froiz no
  publica `image_id` quedan sin miniatura en vez de conservar un enlace roto, y
  ninguna fila mantiene el patrón duplicado.

## Precio unitario de Gadis corregido (2026-08-24)

- Gadisline publica sufijos como `el kilo`, `el litro`, `la unidad`, `la
  docena`, `los 100 ml` y `los 100 gr.`; el sync los guardaba literalmente y
  el cliente interpretaba cualquier valor distinto de `l`/`kg` como `ud`.
- El sync normaliza ahora a kg/L/ud, convierte las bases de 100 ml, 100 g y
  docena, e identifica como kg los frescos con `weight=P` aunque la web omita
  el sufijo. Metro y dosis no se muestran como €/ud.
- Las columnas ya existen. La migración local
  `20260824143104_normalize_gadis_reference_units.sql` está desplegada en
  producción como `20260824143221`; el catálogo publicado queda corregido y los
  siguientes syncs conservarán las unidades canónicas. Verificación remota:
  6.065 productos en kg, 3.150 en L y 1.638 en ud, sin unidades no canónicas.

## Comparador para Froiz, Gadis y Ahorramás (2026-08-24)

- «Buscar productos más económicos» admite ya las tres cadenas como
  producto de origen y como destino. La app conserva el contrato transaccional
  `catalog_cheaper_products_v6`; la ampliación está en el snapshot semántico,
  el worker, el resolvedor de detalle, las RPC internas v3/v5 y la caché.
- El materializador cubre ahora los 18 catálogos. Froiz, Gadis y Ahorramás
  aportan 25.240 productos publicados en total; su contenido semántico y sus
  unidades kg/L/ud se regeneran de forma incremental tras cada sync. El
  backfill remoto terminó con 25.240/25.240 embeddings, cola vacía y cero
  fallos pendientes.
- Las bases comerciales (`el litro`, 100 g/ml, docena, etc.) se normalizan
  antes de comparar precios. Lavado, dosis y metro se excluyen para no tratarlos
  como unidades equivalentes.
- Migraciones locales desplegadas en producción:
  `20260824140442_extend_comparator_to_gadis_froiz_ahorramas.sql` como
  `20260824140836`, `20260824141713_normalize_comparator_reference_units.sql`
  como `20260824141904` y
  `20260824150548_extend_comparator_cache_status_stores.sql` como
  `20260824150622`. `catalog-embed` está desplegada en su versión 7.
- Verificación remota real: una leche de cada una de las tres cadenas devuelve
  alternativas semánticas de las otras dos, con precios actuales, unidad
  compatible e indicador de ahorro. TypeScript, lint y 66/66 pruebas pasan.

## Materialización incremental del comparador tras los syncs (2026-08-24)

- Los 17 workflows de GitHub Actions cuyos catálogos participan en el
  comparador ejecutan `sync-comparator-embedding-catalog.mjs` para su tienda
  después de completar correctamente el sync de origen. Bonpreu/Esclat espera
  expresamente al último lote de su ciclo encadenado.
- Los diez runners PowerShell locales aplican el mismo postproceso cuando el
  sync real termina con código 0 y lo omiten en `DRY_RUN`. Esto cubre en
  particular Carrefour, Eroski, Caprabo, Froiz y Alcampo, cuyos procesos
  productivos son locales por los bloqueos a las IP de GitHub Actions.
- Cada ejecución limita el materializador con `STORES=<tienda>`. El upsert
  transversal solo encola un embedding nuevo si cambia el contenido semántico,
  la versión o la publicación; un cambio exclusivo de precio reutiliza el vector.
- Hipercor queda fuera hasta que sus tablas y RPC se incorporen formalmente al
  comparador. El materializador arranca el procesamiento de los trabajos nuevos
  de `catalog_embedding_jobs`; el cron remoto queda solo como respaldo cada 15
  minutos.

## Reportes de resultados incorrectos del comparador (2026-08-24)

- Cada alternativa del comparador muestra a la izquierda un botón circular con
  bandera. El producto conserva un botón hermano independiente para abrir su
  ficha; no hay controles táctiles anidados. Tras enviar el aviso, la bandera
  pasa a check y se confirma con un toast. Textos y accesibilidad están en ES/CA.
- `public.report_catalog_product_match` es la única entrada desde la app: exige
  sesión, valida que la pareja siga siendo un match vigente y deduplica por
  usuario, pareja y versión. La app no puede leer ni escribir directamente la
  cola.
- Los reportes viven en `private.catalog_match_reports` con estado `pending`,
  `accepted` o `dismissed`, nota/revisor y snapshots del producto origen, del
  resultado y de las métricas del match. Así pueden revisarse uno a uno aunque
  los catálogos o la caché cambien después.
- La migración local `20260824140037_catalog_match_reports.sql` está desplegada
  en producción como `20260824140510`. Prueba autenticada: primer envío crea el
  reporte, el segundo devuelve el mismo id, los snapshots son válidos y el
  registro de prueba se eliminó dejando la cola vacía.

## Fondo del onboarding sin líneas blancas (2026-08-24)

- Las cinco pantallas del onboarding conservan la persiana azul y sus separaciones
  oscuras, pero eliminan los reflejos horizontales blancos y el borde blanco del
  remate inferior. Es un cambio exclusivamente visual.

## Diseño unificado de filtros en Ofertas y Novedades (2026-08-24)

- La hoja de filtros de Ofertas activa ahora la misma composición visual Plus
  y los mismos iconos de categoría que Novedades. Conserva sin cambios sus
  facetas propias de supermercado, tipo de oferta, precio y orden.

## Timeout ampliado del comparador (2026-08-24)

- Una primera consulta sin caché de `catalog_cheaper_products_v6` podía superar
  los 8 segundos del rol `authenticated` al construir secuencialmente los
  matches de muchas tiendas y terminaba en HTTP 500.
- La RPC v6 tiene ahora `statement_timeout = 60s`, el máximo configurable para
  la Data API de Supabase. El límite general de `authenticated` sigue en 8 s y
  la v5 permanece sin excepción.
- La migración local
  `20260824131021_extend_comparator_statement_timeout.sql` está desplegada en
  producción como `20260824131133`. La prueba real del producto Mercadona 4717
  completó la caché fría y devolvió 20 alternativas; no requiere cambios de
  cliente.

## Logotipo local de Ahorramás (2026-08-23)

- Ahorramás usa ya `assets/stores/ahorramas.jpg` en selectores, preferencias,
  filtros y agrupaciones, en lugar del icono genérico de tienda. No cambia la
  disponibilidad regional, el catálogo ni el esquema remoto.

## Motor de búsqueda del catálogo (2026-08-23)

- Los 18 catálogos usan ahora RPC homogéneas `search_*_products` en Supabase:
  normalizan acentos/mayúsculas, combinan Full Text Search por prefijo con
  tolerancia a erratas de `pg_trgm`, rankean en servidor y paginan con
  `limit`/`offset` estable. Las funciones son `SECURITY INVOKER`, respetan RLS
  y filtran CCAA o centro antes del ranking.
- La app presenta «Relevancia» por defecto al buscar; precio y precio unitario
  siguen disponibles y se ordenan en servidor antes de paginar. Un supermercado
  carga páginas de 50 al llegar al final; «Todos» mezcla las páginas de las
  tiendas habilitadas y aplica el mismo orden global.
- Froiz queda conectado por primera vez al flujo de búsqueda y reutiliza el
  árbol de categorías construido por su sincronizador.
- Novedades y Ofertas reutilizan el mismo motor cuando hay al menos dos letras:
  relevancia, prefijos, erratas, idioma y ubicación se resuelven antes de
  paginar. Sus reglas propias (ventana semanal, rellenos iniciales, vigencia y
  zona de la promoción, categoría y precio) se conservan dentro de las RPC.
- Migraciones locales `20260823101900_catalog_search_engine_v1.sql`,
  `20260823103646_catalog_search_language_index_planner.sql` y
  `20260823104120_catalog_search_server_sort_orders.sql`, desplegadas en
  producción como `20260823103505`, `20260823103803` y `20260823104828`.
  Verificación PostgREST anónima: HTTP 200; ES/CA, erratas, caracteres especiales,
  orden por precio y páginas sin solape.
  Medición caliente: Mercadona ~26 ms, Carrefour ~69 ms y Alcampo ~28 ms; los
  índices FTS registran uso real.
- `20260823110039_catalog_feed_search_engine.sql` está desplegada en producción
  como `20260823110849`. Verificada por la API anónima con Novedades y Ofertas,
  errata real, orden por precio y páginas sin solape; Carrefour ronda 51 ms en
  una búsqueda caliente de 50 ofertas.

## Cupos gratuitos de alertas y radar de ahorro (2026-08-23)

- Una cuenta sin Plus puede crear y mantener una alerta personalizada activa;
  Plus conserva alertas ilimitadas. Perfil permite entrar a la gestión a todas
  las cuentas y «Avísame» abre el editor mientras el hueco gratuito esté libre.
- Una cuenta sin Plus puede ejecutar tres veces «Buscar productos más
  económicos»; el cuarto intento abre el paywall. Plus mantiene búsquedas
  ilimitadas.
- Ambos límites son por cuenta. La alerta se comprueba contra sus reglas en
  Supabase y el contador del comparador vive en `private.free_tier_usage`, por
  lo que no se reinicia al reinstalar o cambiar de dispositivo.
- Estos dos cupos se aplican aunque `paywall_enabled()` continúe apagado durante
  el pre-lanzamiento; el interruptor comercial sigue controlando los demás gates.
- `catalog_cheaper_products_v6` reserva el uso y devuelve resultados+cupo en una
  sola transacción. La v5 queda protegida para clientes anteriores. Las
  migraciones locales `20260823063529_free_tier_alert_and_comparator_allowances.sql`
  y `20260823065123_restrict_free_tier_usage_direct_access.sql`, junto con
  `20260823065448_enforce_free_allowances_before_paywall_launch.sql`, están
  desplegadas en producción como `20260823064939`, `20260823065153` y
  `20260823065550`; la prueba transaccional confirmó 3 usos, bloqueo del 4º y
  bloqueo de una 2ª alerta free con el paywall remoto todavía apagado.

## Precio unitario de Eroski y Caprabo recuperado (2026-08-22)

- Ambas webs publican en la tarjeta textos como `1 KILO A 18,40 €`, `1 LITRO
  A ...` y `1 UNIDAD A ...`; el scraper compartido los ignoraba y escribía
  siempre `price_per_unit = null`.
- `scripts/lib/eroski-tapestry.mjs` extrae ahora esa etiqueta en los lotes SSR y
  AJAX, la normaliza a kg/L/ud y el cliente la selecciona y muestra en listados,
  ofertas, novedades y cambios de precio. No requiere migración: las columnas
  ya existen; sí requiere relanzar ambos syncs para rellenar producción.

## Apertura estable del índice alimentario y el comparador (2026-08-22)

- Las fichas con datos nutricionales coordinan ahora la resolución del índice
  y la aparición de «Buscar productos más económicos». Mientras Open Food
  Facts o el fallback del catálogo responden muestran un estado compacto y,
  después, revelan ambos elementos juntos con un fundido que respeta Reducir
  movimiento; el botón deja de pintarse en una posición provisional y saltar.
- `useNutritionInfoDisclosure` expone `resolved`/`loading` y vincula el resultado
  a la identidad de la consulta para no reutilizar un producto anterior durante
  el primer render. `ProductDetailDiscoverySection` centraliza el patrón para
  las nueve cadenas con índice. Sin cambios de esquema ni consultas adicionales.

## Plegado progresivo de categorías del carrito (2026-08-22)

- Las filas de cada zona del carrito ya no aparecen o desaparecen de golpe:
  conservan su altura medida y se recortan con una animación escalonada.
- Al plegar se cierra primero el producto inferior y el recorrido avanza hacia
  la cabecera; al desplegar se reproduce el orden inverso. El doble toque para
  aplicar la dirección a toda la tienda se conserva.
- Plegar una tienda completa usa una transición de layout más suave. Reducir
  movimiento mantiene todos estos cambios inmediatos y las filas ocultas salen
  del árbol de accesibilidad. No requiere cambios de datos ni migraciones SQL.

## Estadísticas generales de la comunidad (2026-08-22)

- El botón «Estadísticas generales» permanece visible aunque el usuario no haya
  finalizado ninguna compra y abre una pantalla independiente.
- La vista muestra los supermercados seleccionados en las preferencias de la
  comunidad, los diez productos de catálogo más añadidos y los diez
  supermercados con más unidades añadidas. Combina carritos activos e historial
  finalizado y excluye entradas manuales para no publicar texto privado.
- `public.general_purchase_statistics()` es una frontera `SECURITY INVOKER`;
  delega la agregación privilegiada en una función del esquema no expuesto
  `private`. Exige autenticación y Plus, revoca `anon` y devuelve solo recuentos:
  ningún id de usuario, grupo, lista o compra.
- Las migraciones `20260822165410_general_statistics.sql` y
  `20260822171122_general_statistics_private_boundary.sql` están desplegadas en
  producción como `20260822171009` y `20260822171221`. La llamada autenticada
  devuelve 17 preferencias, 10 productos y 10 supermercados; los advisors no
  muestran avisos relacionados.

## Resultados claros en «Buscar productos más económicos» (2026-08-22)

- El comparador bajo demanda presenta las coincidencias en tarjetas agrupadas
  solo por supermercados con resultados, con mayor jerarquía de imagen, nombre,
  precio total, precio unitario y un distintivo verde en las opciones mejores.
- Después de la búsqueda muestra un resumen explícito. Si ninguna fila devuelta
  por `catalog_cheaper_products_v5` tiene `is_cheaper=true`, informa de que el
  producto actual ya es la opción más económica; este estado es distinto de no
  haber encontrado alternativas fiables.
- Las filas usan miniaturas con caché, objetivos táctiles completos y etiquetas
  accesibles con producto, supermercado y precio. No requiere cambios de SQL.

## Identidad centrada en Perfil (2026-08-22)

- La tarjeta de identidad ya no contiene el botón promocional QuéFalta Plus;
  el único acceso vive en Perfil → Cuenta, donde sirve también para gestionar
  una suscripción activa.
- El `@usuario` vuelve a su posición horizontal a la derecha del avatar, alineado
  a la izquierda, y queda centrado verticalmente en el eje Y de la tarjeta.

## Gestión de QuéFalta Plus desde Perfil (2026-08-22)

- Perfil → Cuenta contiene una entrada permanente de QuéFalta Plus cuando el
  paywall está disponible o la cuenta ya conserva acceso Plus.
- En free abre el paywall. Para suscripciones de tienda consulta RevenueCat y
  abre la gestión oficial de App Store/Google Play; refleja plan mensual/anual,
  prueba o fecha final si se canceló la renovación.
- Un `premium_until` activo sin entitlement de tienda se presenta como Plus de
  cortesía y no ofrece una cancelación inexistente. No requiere migración SQL.

## Acceso heredado a «Todos» para cuentas anteriores a 1.3 (2026-08-24)

- Las cuentas registradas antes de QuéFalta 1.3 conservan el selector «Todos»
  en Catálogo, Novedades, Ofertas y Cambios de precio aunque no tengan Plus.
- El permiso vive en `profiles.legacy_all_stores_access`, está protegido contra
  escrituras del cliente y no desbloquea ninguna otra función Plus.
- La columna y el primer snapshot ya estaban desplegados. Como se ejecutaron
  antes del lanzamiento, 66 cuentas creadas todavía desde 1.2.1 habían quedado
  fuera; `20260824174500_grant_legacy_all_stores_to_pre_1_3_accounts.sql` está
  desplegada en producción como `20260824174522` y amplía el snapshot a todas
  las cuentas existentes antes de 1.3.
- Snapshot operativo repetido el 2026-08-25 antes de enviar la 1.3 a revisión:
  se habilitaron 22 altas adicionales. Verificación remota: 4.054/4.054 perfiles
  tienen el permiso y ninguna cuenta actual queda bloqueada. El trigger protector
  sigue activo y las altas posteriores conservan `false` como valor por defecto;
  repetir el snapshot justo antes de publicar la versión.

## Icono personalizado por grupo (2026-08-22)

- El administrador dispone en el detalle del grupo de una tarjeta independiente
  de «Gestionar miembros» para elegir el icono compartido del grupo.
- El selector se deriva automáticamente de los emojis reales de categorías N1
  y subcategorías del catálogo de supermercados; no mantiene un listado visual
  paralelo. Los duplicados se eliminan y el carrito queda como fallback.
- El icono identifica el carrito activo en la tarjeta de Inicio, la cabecera de
  Carrito, la barra flotante de selección y los CTA de las fichas de producto.
  `CartContext` lo persiste por usuario y lo resincroniza al validar los grupos.
- La migración `20260822071818_add_group_icon.sql` está aplicada en producción
  como versión remota `20260822073002`: `groups.icon_emoji` es `text` nullable,
  su restricción está validada y la tabla conserva RLS y la policy del admin.

## Barra flotante para añadir varias unidades (2026-08-22)

- Al seleccionar una o más unidades en un listado de productos, el resumen de
  selección ya no aparece como la antigua franja oscura de borde a borde. Ahora
  usa una tarjeta flotante redondeada, con superficie Liquid Glass cuando está
  disponible y fallback temado, icono de cesta y CTA «Añadir» en cápsula.
- Se conservan sin cambios el contador total, el grupo de destino, el estado de
  carga y la compensación de la barra de navegación inferior.

## Consulta visible al desplazar el Catálogo (2026-08-21)

- Al comenzar a desplazar resultados después de escribir en el buscador de
  Productos, el campo se contrae y la cabecera de Catálogo crece suavemente para
  mostrar la consulta activa en cursiva debajo del botón circular de la lupa.
- Al volver a abrir el buscador, cambiar de supermercado o pasar a Categorías,
  la segunda línea desaparece. Altura, desplazamiento y opacidad usan una curva
  progresiva independiente; el alto reserva espacio para los descendentes de la
  cursiva y la transición respeta Reducir movimiento.

## Orden unitario de Novedades, Ofertas y Cambios de precio reservado a Plus (2026-08-21)

- En las hojas de filtros de Novedades, Ofertas y Cambios de precio, únicamente
  «De menor a mayor» y «De mayor a menor» de la sección «Ordenar por precio
  unitario» requieren Plus.
- Una cuenta gratuita ve esos dos botones con candado; al pulsarlos abre el
  paywall sin cambiar el orden. Si Plus caduca, el orden unitario activo se limpia.
- La sección «Ordenar por precio» del envase continúa siendo gratuita.
- Las tarjetas de Ofertas conservan ahora el formato/cantidad y el precio por
  unidad de Novedades; el precio anterior, cuando existe, aparece después.
- Cambios de precio conserva su fila de precio anterior, actual y porcentaje, y
  recupera debajo el formato/cantidad y el precio unitario del producto.

## Producto alternativo en comentarios reservado a Plus (2026-08-21)

- Escribir y editar comentarios de productos en la cesta continúa siendo
  gratuito. «Asignar producto» y «Cambiar» son funciones QuéFalta Plus.
- En cuentas gratuitas, intentar abrir el selector muestra el paywall antes de
  buscar. Una alternativa existente permanece visible, puede conservarse al
  editar el comentario y puede quitarse sin suscripción.
- El paywall incluye «Productos en comentarios» entre sus beneficios, también
  en catalán. No hay cambios de esquema ni de persistencia.

## Historial de compra gratuito e ilimitado (2026-08-21)

- Perfil → Historial de compra está disponible para todas las cuentas, sin
  candado ni apertura del paywall.
- Se puede consultar y repetir cualquier compra anterior; se retiraron el gate
  completo de `HistoryScreen`, el límite de tres compras y los textos Plus.
- El historial ya no figura entre los beneficios del popup QuéFalta Plus.

## Dorado Plus reservado a «Mejor precio» y la bienvenida (2026-08-22)

- El fondo dorado animado de `PremiumGoldBackground` queda limitado a la
  etiqueta «Mejor precio» del plan anual. El sello del usuario propio conserva
  su variante dorada dentro de la cabecera de identidad.
- El resto de superficies Plus usan el acento normal de la app: accesos de
  cuenta, color personalizado, alertas, comparador, orden unitario, «Todos» y
  resto del paywall. Los candados y gates no cambian.
- Las insignias Plus fuera de la cabecera propia usan el acento de la app. La
  bienvenida posterior a una compra o restauración confirmada recupera su sello,
  brillo y partículas dorados sobre el fundido negro.
- `PremiumGoldBackground` tiene un único consumidor intencionado:
  `PaywallModal`, exclusivamente en la etiqueta anual «Mejor precio».

## Doble toque en categorías del carrito (2026-08-21)

- El toque simple en una categoría del carrito conserva su comportamiento:
  contrae o expande solo esa categoría.
- Dos toques seguidos sobre la misma categoría aplican esa dirección a todas
  las categorías del mismo supermercado. El primer toque responde al instante
  y el gesto no afecta a las categorías de otras tiendas.

## Fondo ambiental compartido en Inicio y Carrito (2026-08-21)

- Carrito incorpora las mismas 21 burbujas radiales y lavados ambientales de
  Inicio en todos sus estados (lista, carga, error y vacío), pero mantiene el
  fondo plano de papel sin el degradado superior.
- El fondo vive en `AmbientBubbleBackdrop`, compartido por ambas pestañas: usa
  un único SVG memoizado, sigue el acento de Apariencia, no intercepta gestos y
  queda fuera del árbol de accesibilidad.
- La zona libre a la izquierda de la campana y el avatar en la cabecera de
  Inicio muestra «¡Prepara la compra!», con su versión catalana. Carrito no
  muestra este mensaje.

## Comentarios y producto alternativo en el carrito (2026-08-21)

- Cada tarjeta del carrito incorpora un pie compacto unido al bloque principal
  y separado por un divisor punteado. Vacío muestra «Añade comentarios sobre el
  producto»; al tocarlo abre un editor multilínea de hasta 280 caracteres.
- El editor permite además asignar un producto alternativo al comentario. Abre
  un buscador sobre los supermercados activos del perfil y disponibles en su
  CCAA/CP; el usuario puede seleccionar, cambiar o quitar la alternativa.
  El caso esperado es escribir «Si no queda, compra esto:» y enlazar el producto.
- Si el perfil tiene más de un supermercado disponible, antes de buscar exige
  elegir uno en la misma hoja mediante una fila de opciones con logotipo y
  nombre. Con una sola preferencia lo selecciona automáticamente y no muestra
  ese paso. Cambiar de supermercado limpia consulta y resultados anteriores.
- La tarjeta muestra la alternativa con nombre, tienda y miniatura.
- La nota es compartida por todos los miembros del grupo, se aplica a todas las
  filas fusionadas del mismo producto y se conserva al finalizar o repetir una
  compra. El producto vinculado sigue el mismo ciclo y ambos se muestran en el
  resumen del grupo en modo lectura.
- Restar y eliminar usan círculos de 28 pt, iguales al control de asignación, y
  aumentan la separación vertical cuando aparecen juntos.
- Migración `20260821175658_list_item_notes.sql` aplicada y verificada en
  producción: columnas `note` en `list_items`/`purchase_items`, límites de 280
  caracteres, permisos existentes intactos y sin nuevos avisos de advisors.
- Migración `20260821181503_list_item_note_product.sql` aplicada en producción
  (versión remota `20260821182635`): referencia tienda+id y snapshot de nombre,
  miniatura y precio en `list_items`/`purchase_items`, constraints validados,
  RLS y los seis policies existentes intactos.

## Integridad de carrito, compra y catálogo multisúper (2026-08-24)

- `list_items.store_key` es ahora la identidad canónica de supermercado. Todas
  las altas nuevas la envían explícitamente y la fusión usa `tienda:id`, evitando
  colisiones entre catálogos. Un trigger privado conserva compatibilidad con
  builds antiguos que todavía dependen de la miniatura.
- Marcar varias filas fusionadas y asignarlas a un miembro usan una sola RPC
  atómica. «Finalizar compra» archiva cabecera, detalle fusionado y vacía la
  lista dentro de la misma transacción, serializada por lista para que un doble
  toque o reintento no duplique compras ni deje un archivo parcial.
- La migración `20260824165601_high_priority_cart_integrity.sql` está desplegada
  en producción como `20260824170527`: backfill completo, 0 claves nulas,
  constraints de tiendas, funciones `SECURITY INVOKER`, `search_path` fijo,
  ejecución exclusiva para `authenticated` y pruebas RLS revertidas correctas.
- La selección del carrito se serializa en el cliente; Inicio descarta respuestas
  obsoletas y Grupos no anida objetivos táctiles ni permite activaciones paralelas.
- Catálogo «Todos» tolera el fallo aislado de una tienda y pagina con buffers por
  súper de 12 filas, sin volver a descargar desde offset 0 al pedir más.
- El plugin local `withAndroidReleaseHardening` deja el release sin fallback a
  la clave debug, activa minificación/recorte de recursos y bloquea permisos de
  audio, almacenamiento heredado y overlay en producción. EAS sigue inyectando
  el keystore real y gestionando `versionCode` en remoto con `autoIncrement`.

## Creación ilimitada de grupos (2026-08-21)

- Crear grupos deja de ser una función Plus: el botón «Nuevo» abre siempre el
  formulario, independientemente del número de grupos o del estado premium.
- Eliminados el gate local, el manejo de `free_group_limit` y los textos del
  límite. La migración `20260821175745_allow_unlimited_group_creation.sql`
  retira el trigger `groups_enforce_limit` y su función si existían.

## Popup redondeado para crear y renombrar grupos (2026-08-21)

- `NameInputSheet` adopta el lenguaje visual actual: esquinas superiores de la
  hoja a 28 px, icono y cierre circulares, campo con radio 16 y CTA en cápsula.
- El CTA deja de usar el antiguo borde duro de `HardShadow`. El cambio se aplica
  tanto al alta de grupos como al renombrado, sin alterar validación ni estados.

## Controles redondeados en el pie de las fichas de producto (2026-08-21)

- El selector horizontal de cantidad adopta una cápsula con radio completo y
  recorta correctamente sus controles de restar y sumar.
- «Añadir a la cesta» usa también una cápsula en las fichas de todos los
  supermercados. No cambia el tamaño táctil ni la lógica de cantidad o alta.

## Acción circular en el estado vacío de Grupos (2026-08-21)

- Cuando el usuario todavía no pertenece a ningún grupo, «Crear grupo» usa
  ahora un botón circular de acento con el icono de suma y mantiene su etiqueta
  visible debajo. Se retiró el antiguo CTA rectangular con borde duro.
- La acción completa conserva un único objetivo táctil y una etiqueta explícita
  para lectores de pantalla; la lógica de creación y activación no cambia.

## Cabeceras de Catálogo, Carrito y Grupos alineadas (2026-08-21)

- «Mi Lista» y «Grupos» usan la misma tipografía de 20 pt que «Catálogo»;
  sus iconos y fondos circulares se redujeron proporcionalmente.
- Catálogo adopta el mismo bloque de icono circular y título que Carrito; el
  selector de supermercado permanece integrado a la derecha de esa cabecera.
- El icono exclusivo de biblioteca identifica Catálogo también en la navegación
  inferior clásica y Liquid Glass.

## Controles actuales en categorías y subcategorías (2026-08-21)

- El selector principal Productos/Categorías de Catálogo conserva una sola
  superficie Liquid Glass, pero refuerza su geometría con una variante de 44 px:
  contorno adaptado a claro/oscuro, reflejo superior, sombra exterior no recortada
  y una píldora activa con mayor presencia. En Catálogo, los controles de orden
  y lista/cuadrícula adoptan el mismo borde, reflejo, sombra y selección reforzada,
  pero conservan su altura compacta original de 40 px; el bloque unitario bloqueado
  replica también esa geometría. El resto de `SlidingSegments` no cambia.
- El botón Atrás de la pantalla de categoría y de todos los listados de
  productos por subcategoría vuelve a ser circular (38 px, radio 19).
- El toolbar compartido de productos usa el lenguaje visual actual: buscador
  con radio 16 y sombra suave, y selector lista/cuadrícula en pastilla con el
  modo activo marcado mediante el color de acento. En Liquid Glass reutiliza
  `SlidingSegments`, incluida la misma transición deslizante de Catálogo →
  Productos; el fallback comparte también su geometría y estado activo. El
  glifo de cuadrícula lleva una compensación óptica de 1 pt a la derecha para
  quedar centrado en la píldora tanto aquí como en Catálogo.

## Entrada estable desde onboarding e Inicio (2026-08-21)

- Eliminada por completo de Inicio la tarjeta «Completa tu perfil», incluido su
  componente y sus traducciones. Foto, amigos y grupo siguen siendo opcionales.
- El CTA final del onboarding activa una superficie azul de continuidad. Inicio
  espera a tener layout, grupos, favoritos y última compra resueltos antes de
  revelarse con un fundido de 260 ms, con un máximo de espera de 900 ms y soporte
  para Reducir movimiento.
- La cabecera Liquid Glass parte de su altura conocida para no desplazar el
  contenido tras el primer `onLayout`; las cachés distinguen un resultado vacío
  válido de una lectura todavía pendiente.
- Favoritos, grupos y última compra ya no muestran estados vacíos falsos durante
  su carga. Los fallos de grupos ofrecen reintento y la tarjeta de última compra
  ya no contiene controles táctiles anidados.
- Las burbujas decorativas de Inicio se dibujan en un solo SVG memoizado y
  toman el color de acento elegido en Apariencia.
- Perfil reserva desde el primer frame la altura determinista de su cabecera
  Liquid Glass y solo actualiza la medida si cambia realmente; al entrar ya no
  nace colapsado arriba ni desplaza todo el contenido tras `onLayout`.
- Los builds de simulador que se instalen para probar autenticación deben
  conservar la firma local de Xcode. Compilar con `CODE_SIGNING_ALLOWED=NO`
  deja a SecureStore sin acceso al llavero, impide guardar el verificador PKCE
  de Google y puede producir también errores de persistencia en notificaciones.

## Refuerzo integral del onboarding (2026-08-21)

- Un perfil sin resolver ya no permite entrar en la app: red/timeout muestran
  una pantalla recuperable con reintento.
- `profiles.onboarding_step` reanuda Username, Stores, Avatar, Friends o Group;
  cada guardado avanza el marcador junto con sus datos.
- La disponibilidad de @usuario vincula la respuesta remota al texto validado,
  evitando que una respuesta antigua habilite otro valor.
- `create_group_with_owner` crea grupo y membresía en una transacción y usa
  `groups.creation_key` para que reintentos o doble tap sean idempotentes.
- `complete_onboarding()` valida @usuario, región y supermercados y fecha el
  alta en servidor. Después se muestra una pantalla Done antes de Inicio.
- VoiceOver, texto grande, errores del selector de fotos y jerarquía de CTA
  están reforzados. Las lamas usan un SVG compartido.
- Migración `20260821130300_onboarding_integrity.sql` aplicada en producción y
  verificada: permisos solo autenticados y 0 perfiles completos desalineados.

## Desplegable de correo integrado en Login (2026-08-21)

- Login muestra el isotipo oficial de QuéFalta centrado sobre el título,
  reutilizando el PNG transparente empleado en el arranque. El conjunto
  principal queda desplazado 20 px hacia arriba respecto al centrado base.
- El fondo incorpora quince burbujas azules radiales, estáticas y de tamaños
  variados. Son puramente decorativas, no interceptan gestos y quedan fuera del
  árbol de accesibilidad.
- La cabecera comunica «Tu compra, más organizada» y resume comparación,
  ofertas, novedades y cambios de precio; dispone de versión catalana
  equivalente.
- «Continuar con correo electrónico» y su formulario forman ahora una sola
  pieza visual: al abrirse, el bloque nace del borde inferior del botón sin
  separación ni una segunda tarjeta flotante.
- La apertura y el cierre animan altura y opacidad con una curva suave. Con
  Reducir movimiento, el cambio es inmediato y el contenido contraído queda
  fuera del foco táctil y del árbol de accesibilidad.
- El `ScrollView` conserva su posición al abrir: título, subtítulo, Apple y
  Google permanecen fijos y el formulario aumenta exclusivamente hacia abajo.
  Solo se desplaza cuando el usuario enfoca el campo y aparece el teclado.
- El panel comienza directamente con el campo de correo; se retiró la
  explicación redundante sobre el acceso sin contraseña.

## Cierre de auditoría de arranque y Login (2026-08-21)

- El splash nativo ya no puede desembocar en una pantalla vacía mientras cargan
  las fuentes: `App` muestra una superficie de continuidad y cede al
  `BootLoader` cuando están listas. Idioma y tema exponen `ready` sin bloquear el
  montaje, de modo que el watchdog de 10 s cubre también su hidratación. Se
  conserva un mínimo visual de 350 ms para evitar destellos.
- `authStorage` trata una lectura no autorizada o corrupta del llavero como
  sesión ausente (con fallback solo a la sesión legacy ya existente), evitando
  el error periódico de auto-refresh sin degradar nuevas escrituras a texto
  plano.
- Login limita la escala tipográfica de título, subtítulo, botones, campo y
  legal; con `accessibility-large` se reorganiza, conserva objetivos táctiles y
  permite desplazarse hasta todo el contenido. El legal vive dentro del área
  desplazable.
- El botón de Google usa la G oficial multicolor y Apple reserva su espacio
  desde el primer frame en iOS, evitando saltos al resolver disponibilidad.
- Las quince burbujas comparten un único SVG y gradiente. `metro.config.js`
  activa `inlineRequires`; cuatro imágenes sobredimensionadas se ajustaron a su
  uso real. El export iOS de esta revisión pasa de 1.868 a 1.828 módulos y de
  15.236 a 11.532 KiB totales (el bytecode Hermes aislado sube de 7.460.130 a
  7.597.028 bytes por los cambios funcionales).
- Xcode toma `CFBundleShortVersionString` y `CFBundleVersion` de los build
  settings, alineados en 1.3.0 (34). El scheme compartido ya no referencia el
  target inexistente `QuFaltaTests`.
- Sin cambios de esquema, migraciones ni configuración remota de Supabase.

## Bienvenida animada a QuéFalta Plus (2026-08-22)

- Los CTA mensual y anual invocan la compra real del paquete seleccionado en
  RevenueCat. La celebración solo se presenta cuando la respuesta contiene el
  entitlement activo `plus`; se eliminó el antiguo atajo de vista previa que la
  mostraba sin comprar.
- Tras la confirmación de RevenueCat, la expiración se aplica al perfil local
  para activar los gates inmediatamente. Los reintentos de perfil esperan a que
  `revenuecat-webhook` persista `premium_until` y `verified` en Supabase.
- `PlusWelcomeTransition` oscurece el paywall durante 1,5 segundos y después
  presenta el sello dorado central con su brillo propio, virutas, partículas y
  los textos de bienvenida. La X, Atrás y el gesto de escape de accesibilidad
  cierran la experiencia y el paywall. No se dibuja ningún halo detrás del sello.
- Con Reducir movimiento, el oscurecimiento y la revelación son inmediatos y
  las partículas permanecen estáticas. El contenido está traducido al castellano
  y catalán y se anuncia al lector de pantalla una vez completado el fundido.

## Filtros en Cambios de precio (2026-08-21)

- La fila de controles incorpora un botón de filtros independiente a la
  izquierda de `Bajadas / Subidas`, tanto en Liquid Glass como en fallback. El
  botón usa el color de acento mientras exista algún filtro activo.
- La hoja compartida `ProductFilterSheet` permite filtrar este feed por una o
  varias categorías y por magnitud porcentual absoluta del cambio: hasta 5 %,
  5–10 %, 10–20 % o más de 20 %. Los mismos rangos sirven para bajadas y
  subidas. Sin orden unitario activo se conserva la relevancia del servidor.
- El orden por precio unitario ascendente/descendente pertenece a Plus, pagina
  por `price_per_unit` y deja al final los productos que no publican ese dato.
- Con `Todos`, las categorías se agrupan por supermercado y su valor interno
  incluye la cadena para evitar colisiones entre categorías homónimas. El
  filtrado se aplica a las páginas ya cargadas y la paginación continúa
  recuperando resultados al llegar al final.
- `ProductFilterSheet` no aplica ninguna transformación manual al arrastrar. En
  cuanto detecta un deslizamiento vertical hacia abajo desde el tirador
  superior, cambia inmediatamente el estado a cerrado y deja que la única
  transición nativa del `Modal` complete la salida: no espera a soltar, no se
  detiene y nunca rebota hacia arriba. Botón, backdrop y Atrás usan el mismo
  cierre; Reducir movimiento sigue siendo inmediato.

## Buscador ampliado de Catálogo (2026-08-21)

- Al enfocar el buscador de productos, este ocupa toda su fila y oculta los
  controles de orden y de vista. Al perder el foco, los controles reaparecen.
- La lupa y su superficie permanecen montadas durante toda la transición: el
  botón circular se abre lentamente como una cápsula de borde redondo y se
  contrae hasta su misma posición, sin retraso independiente del icono.
- El comportamiento es el mismo con Liquid Glass y con el fallback.
- La fila conserva exactamente su altura al expandirse: 40 px en Liquid Glass
  y 44 px en fallback. La cabecera ya no crece ni desplaza el catálogo al abrir
  el campo.

## Orden por precio unitario reservado a Plus (2026-08-21)

- En Catálogo, los controles `€/u↑` y `€/u↓` son una función de
  QuéFalta Plus. Las cuentas gratuitas los ven en un segundo bloque con
  tratamiento neutro con tinta de acento, sin candado; al pulsarlos se abre el
  paywall con la cabecera compacta, sin texto descriptivo contextual, y sin
  cambiar el orden ni recargar el catálogo. Las flechas de precio total siguen
  siendo gratuitas.
- Con Plus activo los dos bloques vuelven a unirse en el selector original de
  cuatro segmentos y conservan la transición del filtro seleccionado. Si la
  suscripción caduca mientras estaba activo el orden unitario, Catálogo vuelve
  al orden gratuito por precio total.
- El bloque unitario bloqueado replica la geometría del control de precio:
  pastilla exterior, extremos redondeados y etiquetas centradas en ambos ejes.
- Novedades y Ofertas exponen orden por precio total y unitario; Cambios de
  precio conserva su orden de relevancia y añade el unitario. En una cuenta
  gratuita, solo los botones unitarios muestran candado y abren el paywall sin
  cambiar el orden. Si Plus caduca con uno activo, lo limpia. El orden por
  precio total continúa siendo gratuito donde existe.

## Fondo del carrito activo ligado a Apariencia (2026-08-21)

- La tarjeta del carrito activo toma el lenguaje visual de la cabecera del
  paywall: fondo recortado y dos círculos amplios que asoman desde los bordes.
- Su base usa el color de acento elegido en Perfil → Apariencia, incluido el
  personalizado de Plus. El degradado y los dos círculos son luces y sombras
  neutras sobre ese color; el contenido, la navegación y el estado no cambian.

## Preferencia e información de notificaciones (2026-08-21)

- Perfil → Notificaciones muestra qué avisos puede recibir el usuario: productos
  añadidos a carritos compartidos, solicitudes de amistad, altas en grupos y
  alertas personalizadas (bajadas, ofertas y novedades).
- La misma pantalla incorpora el interruptor de avisos del dispositivo. Parte
  apagado cuando no existe una preferencia y, al activarlo, solicita permiso,
  registra el token push y envía una confirmación local. Al apagarlo elimina el
  token de este dispositivo; los avisos recibidos continúan disponibles desde
  la campana de Inicio. La pantalla de ajustes no duplica esa bandeja.
- La preferencia local está separada por cuenta con
  `@notifications_enabled:${userId}`. El arranque reconcilia esa preferencia y
  retira tokens antiguos cuando está desactivada, evitando que dos usuarios del
  mismo dispositivo hereden la configuración.

## Alertas personalizadas — evaluación acotada activa (actualizado 2026-08-23)

- Implementado localmente el MVP de alertas por producto exacto o por palabras,
  con uno o varios supermercados, bajada mínima configurable, nueva oferta y
  vista previa del catálogo. Perfil incorpora «Alertas personalizadas» y todas
  las fichas muestran «Avísame» dentro de la esquina superior derecha de la
  imagen mediante `ProductDetailImage`/`ProductDetailHero`, sin duplicar lógica
  entre los 18 supermercados.
- El CTA compartido «Avísame» conserva la campana y abre el editor para crear la
  primera regla gratuita o editar esa misma alerta exacta. Con el hueco ocupado,
  intentar crear otra regla abre Plus.
- Perfil → Alertas personalizadas entra en la gestión para todas las cuentas.
  Free puede conservar una regla; Plus puede crear reglas ilimitadas.
- La migración `20260820162731_personalized_price_alerts.sql` crea reglas con RLS,
  una proyección interna unificada del catálogo, eventos duraderos de sync y una
  outbox de entregas con `unique(rule_id,event_id)`. El servidor comprueba
  `premium_until`: al caducar Plus las reglas se conservan, la más reciente de
  las activas ocupa el hueco gratuito y las demás quedan pausadas.
- `process-price-alerts` es independiente de `send-push`: reclama solo mediante
  un RPC reservado a `service_role`, agrupa todos los productos de la misma
  regla+actualización, crea atómicamente una única fila en la bandeja y envía
  push best-effort. Los reintentos reutilizan esa fila y no repiten el push.
  Si el mismo producto genera bajada y nueva oferta en un lote, se deduplica
  como oferta. Los taps `price_alert` abren la lista exacta de productos que
  originó la notificación, y desde cada resultado se puede abrir su ficha.
- La migración
  `20260821210209_price_alert_notification_products.sql` expone esa lista con
  una RPC `SECURITY DEFINER` que valida `auth.uid()` y mantiene ocultos los
  eventos internos. El push transporta solo `notificationId`; la bandeja usa
  directamente el id de su fila. Está desplegada en producción como
  `20260823193941`.
- Consum y Plusfresc guardan la zona/centro en la regla; sus cambios regionales
  se cruzan con esa ubicación. La vista previa filtra CCAA y centro cuando el
  espejo publica esos datos.
- Al crear una regla por palabras, el selector muestra exclusivamente la
  intersección entre los supermercados activados en Perfil → Supermercados y
  los disponibles en la CCAA del usuario. Al editar una regla antigua también
  se descartan de su selección las cadenas que el usuario haya desactivado. Cada
  opción muestra el logotipo local de la cadena a la derecha del nombre.
- Cada regla guarda un emoji inferido automáticamente con
  `getSubcategoryEmoji`, el mismo clasificador que usa el carrito. El editor lo
  actualiza mientras se escriben las palabras y la lista lo muestra como icono;
  si no hay coincidencia usa `🛒`. La alerta inicial «aceite oliva» quedó
  migrada a `🫒`.
- El editor ofrece además el modo exclusivo «Novedad» (`new_arrival`). Al
  activarlo limpia y oculta Palabras, desactiva y oculta bajadas, ofertas y
  bajada mínima, y marca la vista previa como no disponible. Conserva el
  selector de supermercados del perfil y usa `🆕`. La migración
  `20260820170935_personalized_alert_new_arrivals.sql`, desplegada en producción,
  captura las altas publicadas de los 18 espejos y las cruza solo con reglas de
  novedades; Postgres impide combinar este modo con los otros disparadores.
- La migración, sus dos correcciones y el backfill de los 18 catálogos están
  desplegados en producción. El verificador transaccional pasa, incluido RLS,
  detección, deduplicación y bandeja. El cliente estabiliza además el valor de
  `ToastContext` para que un error de carga no reactive la consulta en bucle.
- Para evaluar los sync del lunes 24-08-2026, `process-price-alerts` v2 está
  desplegada con una frontera adicional
  `claim_price_alert_deliveries_for_user`: este despliegue solo puede reclamar
  entregas de `@rruizosma`. Reutiliza temporalmente el secreto interno del
  worker de embeddings sin exponerlo; un futuro
  `PROCESS_PRICE_ALERTS_SECRET` dedicado tiene precedencia. La migración local
  `20260823214058_targeted_price_alert_processor.sql` quedó aplicada como
  `20260823194159` y su corrección de alias como `20260823194414`.
- El cron de `ops/schedule_rruizosma_price_alert_evaluation.sql` llama al
  procesador cada 15 minutos y se desprograma automáticamente el 25-08-2026 a
  las 00:00 UTC. Hay
  seis reglas `TEST 1` a `TEST 6`: novedades, bajadas sin umbral, bajadas ≥10%,
  ofertas, mezcla bajada+oferta y producto exacto. La llamada vacía de control
  devolvió HTTP 200 (`claimed=0`, `groups=0`), por lo que no consumió eventos
  anteriores a la creación de las reglas.
- La primera ejecución real descubrió que
  `create_price_alert_notification` comprobaba la GUC heredada
  `request.jwt.claim.role`; PostgREST expone el JWT actual mediante
  `request.jwt.claims`, por lo que las llamadas legítimas de `service_role`
  fallaban antes de crear la bandeja. La migración
  `20260824194005_fix_price_alert_service_role_claim.sql` usa ahora
  `auth.jwt()->>'role'`, conserva `EXECUTE` solo para `service_role` y está
  desplegada en producción. Desde v3 el procesador serializa además los errores
  de PostgREST en vez de guardar `[object Object]`.
- Prueba controlada de producción a las 19:42 UTC: se reabrió solo un lote de
  `TEST 2`, el procesador devolvió `claimed=1`, `sentGroups=1` y
  `failedGroups=0`, creó la fila de bandeja y marcó la entrega como `sent`.
  Una segunda prueba controlada a las 19:51 UTC reabrió un lote de cada una de
  las otras modalidades con eventos reales: novedad, bajada ≥10 %, oferta y
  mixta. El procesador devolvió `claimed=11`, `sentGroups=4` y
  `failedGroups=0`.
- `process-price-alerts` v4 está ACTIVE. Lee en el momento del envío el nombre y
  el emoji actuales de la regla, elimina defensivamente prefijos históricos
  `TEST N ·`, incorpora `emoji` al payload y antepone ese emoji al título push.
  La bandeja del cliente usa el mismo emoji como icono de la fila en lugar del
  pictograma genérico. Las cinco filas ya creadas para `@rruizosma` quedaron
  limpiadas y enriquecidas; una verificación nueva a las 20:04 UTC envió
  `🍫 Bajadas ≥10% · chocolate` con `sentGroups=1` y cero fallos.
  Quedan 500 entregas agotadas en `failed`; no se reactivaron
  para evitar una ráfaga de avisos durante la evaluación.
- **Despliegue general aún pendiente:** retirar el id acotado de evaluación,
  configurar un secreto exclusivo y activar `ops/schedule_price_alerts.sql`
  para todas las cuentas después de valorar el resultado. La entrega seguirá
  limitada por la frecuencia real de cada sincronizador aunque el procesador
  corra cada 15 minutos.
- La ficha genérica de Froiz ya obtiene su producto desde `froiz_products` (no
  desde el fallback de BonÀrea), por lo que el CTA exacto cubre los 18 catálogos.

## Fondo Plus en el selector conjunto de supermercados (2026-08-20)

- La cabecera del paywall es ahora compacta: reutiliza el sello dorado de
  `VerifiedBadge` junto a «QuéFalta Plus» y elimina el bloque promocional
  «Más control para encontrar el mejor precio». No admite subtítulos ni texto
  descriptivo contextual, independientemente del acceso que lo abra.
- El paywall ocupa toda la altura y su fondo llega al borde superior, aunque el
  contenido respeta el notch. No muestra tirador, no se cierra tocando fuera y
  el descarte por gesto está desactivado; se conserva la X y Atrás del sistema.
- Los planes del paywall se presentan en una sola fila, Mensual a la izquierda
  y Anual a la derecha; se retiró la etiqueta redundante «Incluido» del título
  de beneficios. La tarjeta Anual incorpora el barrido azul difuminado e
  irregular del antiguo botón QuéCocino; con Reducir movimiento queda estático.
  Su etiqueta «Mejor precio» conserva el fondo dorado animado y la tinta
  oscura. Sus filas ya no muestran un check
  redundante en el extremo derecho. El comparador se presenta en el paywall como «Radar de
  ahorro»: alternativas similares más baratas en los supermercados del usuario.
- El realce de selección de Mensual/Anual se dibuja sobre la tarjeta sin cambiar
  su borde de layout, de modo que alternar planes no desplaza el CTA ni el
  contenido inferior.
- El CTA del comparador «Buscar productos más económicos» conserva lupa, carga y
  confirmación de resultados. Solo en cuentas gratuitas usa
  `PremiumGoldBackground`, tinta oscura y candado, y abre el paywall sin ejecutar
  la búsqueda ni llamar a la RPC y sin texto descriptivo contextual; con Plus
  activo usa el estilo normal de acento.
- La opción «Todos» del selector de supermercado usa el fondo dorado en
  movimiento únicamente cuando está bloqueada para una cuenta gratuita. Con
  Plus activo se presenta como una opción normal. Se aplica en Catálogo, Cambios
  de precio, Novedades y Ofertas.
- El efecto vive en `src/components/PremiumGoldBackground.tsx`, usa una opacidad
  base del 30 %, respeta Reducir movimiento y solo anima mientras el panel está
  abierto. La etiqueta «Mejor precio» del plan anual conserva el 70 %.
- La tarjeta de identidad no contiene accesos Plus: el `@usuario` queda a la
  derecha del avatar y centrado en el eje Y. QuéFalta Plus se abre o gestiona
  exclusivamente desde su fila en la sección Cuenta.
- Perfil → Apariencia reutiliza también este fondo en «Color personalizado» solo
  mientras esté bloqueado; con Plus activo usa una fila normal. El borde dorado
  giratorio anterior se eliminó por completo.
- El estado Plus del cliente tiene una sola fuente de verdad:
  `profiles.premium_until` debe contener una fecha futura. `profiles.verified`
  es su reflejo booleano público y protegido: muestra la insignia dorada de Plus
  en Perfil, Amigos y Grupos sin revelar la fecha de vencimiento. El perfil propio
  deriva la insignia directamente de `isPremium`.
- Cada instancia genera su propia distribución, fases, trayectorias y duraciones:
  las virutas y partículas de bloques distintos nunca se mueven sincronizadas.
- Las partículas caen continuamente de arriba abajo con relojes independientes.
  Al sobrepasar el borde inferior se desvanecen y reaparecen arriba, sin un
  reinicio, retroceso o salto conjunto visible.
- Si el número de supermercados es impar, la última tarjeta conserva exactamente
  el tamaño de una celda; la segunda celda de esa fila queda vacía.

## Push de solicitudes de amistad fiable (2026-08-20)

- `sendFriendRequest` obtiene el id de la amistad creada y espera a que la Edge
  Function procese el aviso antes de resolver la acción. El push sigue siendo
  best-effort: un fallo de notificación no convierte la solicitud ya guardada
  en un falso error para el usuario.
- `send-push` valida el id, emisor, destinatario y estado pendiente de la
  solicitud. La versión 7 está desplegada en producción y conserva un fallback
  compatible con clientes publicados que todavía no envían `friendshipId`.
- El tap con `data.type = "friend"` abre directamente `Home → Friends`. Si la
  sesión, el perfil o el árbol autenticado aún no están listos, el destino se
  conserva hasta `NavigationContainer.onReady`; la respuesta inicial se consume
  una sola vez para evitar redirecciones antiguas.

## Valoración nativa en App Store y Google Play (2026-08-20)

- La app usa `expo-store-review` para solicitar el diálogo oficial de
  valoración sin sacar al usuario de QuéFalta. Ya no existe un modal propio ni
  un botón previo que redirija a la tienda.
- La primera apertura autenticada guarda una fecha local por usuario. En una
  reapertura posterior, una vez transcurridas al menos 24 horas, se realiza un
  único intento y se guarda también por usuario y dispositivo.
- Apple y Google deciden si muestran finalmente el diálogo y no informan a la
  app de la puntuación ni de si se envió. El estado local representa un intento,
  nunca una valoración confirmada.
- `expo-store-review` incorpora código nativo: este cambio necesita un nuevo
  build de iOS y Android y no puede distribuirse solo mediante OTA.

## Fondo ambiental en Inicio (2026-08-18)

- Inicio conserva el papel cálido como base, pero añade un lavado de color muy
  suave y tres formas amplias, casi fuera de pantalla, para dar profundidad sin
  competir con las tarjetas. Es una composición nativa, sin recursos raster.
- Sobre ese lavado aparecen veintiuna burbujas del color de acento estáticas de distintos
  tamaños, algunas grandes, con degradado radial y borde desvanecido. Están
  repartidas de forma irregular detrás del contenido.
- El fondo usa los tokens dinámicos `accent*` y `paper`, por lo que responde al
  color elegido (incluido el personalizado de Plus) y al modo claro/oscuro. Es
  decorativo, no intercepta gestos y queda oculto al árbol de accesibilidad.

## QuéCocino reactivado para desarrollo (2026-08-30)

- **QuéCocino vuelve a formar parte del árbol de navegación** y aparece como
  quinta pestaña entre Catálogo y Carrito. Su interruptor
  `QUE_COCINO_ENABLED` está activado en `src/constants/limits.ts`.
- La implementación continúa siendo preliminar: conserva cuatro recetas de
  muestra locales, el espacio de recetas oficiales, el icono y las traducciones
  en castellano y catalán.
- No hay todavía integración remota, persistencia, detalle de receta ni datos de
  usuario asociados. Esos son los siguientes bloques funcionales que desarrollar.

## Paso 2 del onboarding con persiana azul (2026-08-18)

- El cambio de `Username` a `Stores` es inmediato, sin la transición móvil que
  cruzaba ambos pasos. `Stores` replica la persiana azul del primer paso, con
  sus lamas, título blanco, tarjetas claras y CTA blanco; no muestra subtítulo.
- Se eliminó por completo la cabecera común «Paso 2 de 5». Solo queda un botón
  de volver flotante. La mascota con carrito se muestra completa en una
  cabecera fija y no desaparece al desplazar la selección: únicamente el grid
  de supermercados hace scroll y el botón Continuar también permanece fijo.
- El recurso con alfa real es
  `assets/mascot/berenjena-carrito-transicion.png`. Su ancho se limita tanto por
  el ancho como por la altura disponible para evitar recortes en pantallas
  pequeñas y orientación horizontal.
- El indicador de selección (`0/14`, según la comunidad) queda fijo en la
  esquina superior derecha, alineado con el botón de volver y fuera del scroll.
- Las tarjetas se filtran con `storeInRegion` usando la comunidad derivada del
  código postal guardado en el paso anterior. La cobertura de los regionales
  nuevos está declarada en `src/constants/regions.ts`: HiperDino (Canarias),
  Plusfresc (Cataluña y Aragón), Gadis (Galicia y Castilla y León), Froiz
  (Galicia, Castilla y León, Castilla-La Mancha y Madrid) y Ahorramás
  (Castilla-La Mancha, Madrid y Castilla y León).

## Paso 3 del onboarding con mascota selfie (2026-08-19)

- Foto de perfil replica la persiana azul con lamas de los pasos anteriores:
  volver flotante, título en la línea inmediatamente inferior al botón de
  volver, tarjeta clara para elegir o cambiar la foto y acciones fijas para
  continuar u omitir. No lleva subtítulo.
- La nueva pose `assets/mascot/berenjena-selfie.png` muestra a la mascota
  haciéndose un selfie con un móvil. Es un PNG RGBA de 512×768 con alfa real y
  se presenta en tamaño reducido entre la tarjeta de foto y el footer.
- La lógica no cambia: usa el selector nativo, recorta a 1:1 y solo sube la
  imagen al continuar; el paso sigue siendo opcional.

## Paso 4 del onboarding con mascotas amigas (2026-08-19)

- Amigos adopta la persiana azul con lamas de los pasos anteriores: botón de
  volver flotante, título y subtítulo superiores, búsqueda y resultados claros,
  y acciones fijas para continuar u omitir.
- El campo de búsqueda permanece fijo bajo las mascotas; solo se desplazan los
  resultados, con indicador vertical lateral del scroll.
- `assets/mascot/berenjena-amigos.png` es una composición PNG RGBA de 1024×1536
  con la berenjena en el centro y dos nuevas mascotas, un plátano y un tomate,
  dándole una mano cada uno. Se muestra entre la cabecera y la búsqueda al 50 %
  del tamaño usado en el primer diseño del paso.
- La lógica sigue intacta: búsqueda con debounce, exclusión del usuario actual,
  envío de solicitudes, confirmación háptica y paso opcional.
- La búsqueda incremental se comparte con Perfil → Amigos mediante
  `useUsernameSearch`: la primera consulta de dos caracteres sale sin espera,
  las siguientes esperan solo 100 ms, cancelan la petición anterior y filtran
  localmente el último prefijo resuelto mientras llega la respuesta. La consulta
  remota medida con rol autenticado y RLS ejecuta en ~5 ms; no se añadió ningún
  índice ni migración.

## Paso 5 del onboarding con primer grupo (2026-08-19)

- El último paso numerado adopta también la persiana azul con lamas, botón de
  volver flotante, título y subtítulo superiores, mascota con carrito, campo
  claro y sugerencias rápidas. El CTA y la acción para omitir permanecen fijos.
- `assets/mascot/berenjena-grupo.png` reutiliza el diseño de las tres mascotas
  del paso anterior: la berenjena empuja el carrito, el plátano va sentado
  dentro y el tomate queda a la derecha; los tres saludan. Es un PNG RGBA de
  1024×1536 con fondo transparente, también a través de los huecos interiores
  de la cesta y del bastidor del carrito.
- El nombre sigue siendo opcional y `createGroup` solo se ejecuta cuando hay
  texto. El grupo creado se activa automáticamente mediante `CartContext`; al
  terminar o al omitir el paso, el servidor valida el alta y abre la pantalla
  terminal «Todo listo» antes de Inicio. El primer grupo creado desde la pestaña
  Grupos también se activa automáticamente.

## Sync Mercadona: guardarraíl anti-bloqueo (2026-08-18)

- El sync semanal separa el catálogo del enriquecimiento nutricional: la tabla
  nutricional de Mercadona procede de la foto de etiqueta y de
  `extract-mercadona-nutrition.mjs`, no de la ficha API. Su ausencia no puede
  reencolar todo el catálogo en el sync principal.
- La pasada post-catálogo pide como máximo 300 EAN nuevos con concurrencia 2. El
  backfill intensivo, si hiciera falta, se ejecuta de forma reanudable con
  `scripts/backfill-mercadona-ean.mjs`.
- Si fallan más del 3% de subcategorías, se aborta antes de escribir o ejecutar
  `markStale`; así un 403/rate limit no despublica catálogo válido.

## Color personalizado de QuéFalta Plus (2026-08-18)

- Perfil → Apariencia incluye un selector de color completo (espectro, tono y
  brillo) para cuentas Plus. Las cuentas gratuitas ven el acceso bloqueado y
  reciben la hoja de suscripción. Es la primera opción del bloque de colores y
  se distingue con el fondo dorado animado mientras está bloqueada; con Plus
  activo recupera el aspecto normal del resto de preferencias.
- El color se guarda localmente con una clave por usuario y dispositivo: dos
  cuentas que compartan un móvil no heredan el color de la otra. Las claves de
  tema globales anteriores se migran una única vez a la primera cuenta.
- Usa `reanimated-color-picker`, `react-native-reanimated` y
  `react-native-worklets`, compatibles con iOS y Android. Al añadir estos
  módulos nativos hay que generar un nuevo build de desarrollo/producción; una
  OTA no los incorpora en instalaciones que no los tengan ya.

## Comparador: filtro estricto de identidad semántica (2026-08-17)

- Los tests de dispositivo detectaron que el comparador híbrido v4 podía
  aceptar productos cercanos semánticamente pero no comparables: por ejemplo,
  un refresco de té con limón frente a una gaseosa de limón. Unidad, cantidad,
  atributos y score no bastan para preservar la identidad principal.
- La migración
  `20260817124758_comparator_semantic_identity_guard.sql` añade familias
  deterministas y variantes explícitas como filtros duros, y expone
  `catalog_cheaper_products_v5`. El filtro se aplica **antes** del top-2 barato
  por tienda; GTIN global idéntico y revisión humana aprobada prevalecen.
- El cliente ya llama a v5. La migración está validada contra producción dentro
  de una transacción con `ROLLBACK`, pero **no está desplegada**. Debe aplicarse
  antes de distribuir este cliente. Verificador reproducible:
  `supabase/ops/verify_comparator_semantic_identity_guard.sql`.
- La misma migración normaliza `burger`, `burguer` y `hamburguesa` para el
  cálculo léxico. Es una equivalencia de términos, no una familia genérica:
  los filtros de identidad siguen evitando que pan, salsa, queso y carne se
  comparen entre sí solo por compartir esa palabra.

## Arranque estable y caché de pestañas (2026-08-17)

- Perfil, carrito activo y snapshots de Inicio/Carrito/Grupos se hidratan desde
  AsyncStorage con claves por usuario antes de entregar la navegación autenticada.
  Las pantallas pintan el snapshot y revalidan contra Supabase en segundo plano
  (stale-while-revalidate), sin borrar contenido ni sustituirlo por un loader.
- Solo un perfil cacheado con `onboarded_at` y `region` ya resueltos puede
  acelerar el gate. Un onboarding incompleto siempre espera el perfil remoto,
  para no mostrar pasos antiguos completados desde otro dispositivo.
- Inicio y Carrito comparten el snapshot de `list_items`; las lecturas simultáneas
  de grupos se agrupan en una única petición en vuelo por usuario. La checklist
  de perfil espera a conocer los grupos y no aparece con un conteo provisional.
- La caché vive en `src/lib/startupCache.ts`. Todo recurso nuevo debe mantener la
  regla por usuario y seguir revalidándose: nunca usar el snapshot como fuente
  definitiva de permisos o pertenencia a grupos.
- Las dos poses raster del primer paso se sirven a 512 px de ancho (su máximo
  visible es 150 pt): mantienen densidad suficiente para pantallas 3x y bajan
  juntas de 2,81 MB a unos 568 KB en el bundle.

## Persiana estática en el primer paso del onboarding (2026-08-19)

- El paso inicial de `@usuario` y código postal usa una persiana azul estática a
  pantalla completa (`#2f6cb5`). Ya no entra desde arriba ni usa la pose
  agarrada al borde inferior: contenido y formulario aparecen directamente.
- `src/screens/onboarding/OnboardingShutter.tsx` muestra desde el primer render
  `assets/mascot/berenjena-sentada-ok.png` fijada en su posición final sobre
  «¡Empezamos!». El campo de usuario recibe el foco al montar la pantalla.
- Al completar un código postal válido, su tarjeta reduce suavemente el ancho
  desde el borde derecho y revela en la misma fila la comunidad autónoma. Las
  dos tarjetas terminan con el mismo ancho y alto; Reducir movimiento muestra
  directamente el estado final.

## Pantalla de autenticación directa (2026-08-20)

- La app sin sesión abre directamente el formulario actual de acceso, sin
  portada previa ni gesto obligatorio. Conserva el título, subtítulo, Apple,
  Google, correo mágico y enlaces legales.
- La lógica de autenticación no cambia; Google continúa usando PKCE y los
  errores de magic link abren directamente el panel de correo.

## Identidad pública basada en @usuario (2026-08-15)

- El onboarding ya no solicita idioma ni nombre visible: comienza con un único
  paso de `@usuario` + código postal y consta de cinco pasos con progreso.
- Inicio muestra `QuéFalta` como título fijo. La tarjeta de Perfil muestra solo
  el `@usuario` junto al botón Editar; el nombre y el correo no aparecen allí.
  Editar perfil conserva el correo de solo lectura, pero ya no permite editar ni
  muestra el nombre.
- La pantalla de miembros de un grupo identifica a cada persona por `@usuario`.
  El cliente sigue leyendo `profiles.name` como dato legacy y fallback para
  cuentas antiguas sin username; no se ha eliminado la columna de base de datos.

## Hipercor (pendiente de migrar y primer sync, 2026-08-15)

- Añadido el espejo de catálogo público de **Hipercor**: migración
  `hipercor_catalog.sql`, `scripts/sync-hipercor.mjs` y workflow diario
  `sync-hipercor.yml`. Recorre las diez raíces públicas y todas sus páginas SSR
  con Google Chrome; incluye precio, precio por unidad, disponibilidad, novedades
  y promociones explícitas, y sólo despublica después del guardarraíl de 10.000
  productos.
- Akamai bloquea Chromium de Playwright en GitHub Actions; tanto la POC como el
  sync usan el canal `PW_CHANNEL=chrome`, ya validado en el runner. El script
  no inicia sesión ni usa dirección/cesta: guarda el surtido del centro público
  observado en `raw.centerId`. No presentar estos precios como personalizados
  por código postal hasta implementar la normalización por centro.
- Antes del primer sync real: ejecutar `hipercor_catalog.sql` en Supabase. La
  integración en el cliente y la comparativa se incorporarán después de validar
  ese primer catálogo completo.

## Gadisline (pendiente de migrar y primer sync, 2026-08-14)

## Estado de sincronización de catálogos (pendiente de migrar, 2026-08-14)

- `20260814170000_catalog_sync_status.sql` crea el registro común de la última
  sincronización correcta de cada supermercado. La app lo muestra en Perfil →
  Soporte → Actualización de catálogos.
- Los scripts solo anotan el estado después de terminar de escribir catálogo y
  categorías; `DRY_RUN` y ejecuciones fallidas no modifican la fecha. Esto se
  aplica también a los runners locales de Carrefour, Alcampo, Eroski, Caprabo y
  Gadis (si se ejecuta localmente), porque escriben directamente en Supabase.

- Añadido el 16º espejo **Gadis**: `gadis_catalog.sql`, `scripts/sync-gadis.mjs`
  y workflow diario `sync-gadis.yml`. El espejo conserva productos, categorías,
  ofertas explícitas sin cupón, novedad explícita y el histórico de precio.
- Gadisline resuelve surtido/precio por código postal. La primera versión usa la
  tienda pública por defecto; no afirmar precios locales hasta normalizar por
  tienda/CP y validar el primer run real.

## Estadísticas personales de compra (2026-08-11)

- Perfil → Cuenta incluye **Estadísticas**, una función de QuéFalta Plus. Ordena
  los supermercados, categorías y productos de las compras finalizadas por el
  propio usuario, por unidades compradas.
- La migración `20260811203243_purchase_statistics.sql` añade `store_key` al
  historial nuevo y el RPC `my_purchase_statistics()`. El RPC conserva RLS,
  solo usa `completed_by = auth.uid()` y deduce la tienda desde la imagen para
  compras históricas sin clave. Debe desplegarse antes de publicar la pantalla.

## Filtros visuales de Novedades (2026-08-11)

- Al abrir un producto desde Novedades, su ficha muestra la etiqueta localizada
  `Novedad`/`Novetat` dentro de la imagen principal, en la esquina inferior
  derecha. La misma ficha abierta desde otras pantallas no muestra la etiqueta.
- La hoja de filtros de Novedades usa la misma composición visual del paywall
  QuéFalta Plus: fondo oscurecido, modal inferior redondeado, cabecera destacada
  y CTA principal. El resto de pantallas que reutilizan `ProductFilterSheet`
  conserva su aspecto anterior.
- La franja superior de Novedades es ahora compacta (sin texto), funciona como
  asa de arrastre para cerrar deslizando hacia abajo y el CTA no usa el borde
  oscuro heredado de `HardShadow`.
- Mantiene el orden por precio del envase y añade un orden independiente por
  precio unitario (`pricePerUnit`), con los productos sin €/kg, €/l o €/ud al
  final en ambos sentidos. Elegir uno de los dos órdenes desactiva el otro.
- Las categorías muestran los emojis de `getSubcategoryEmoji`, el mismo mapa
  visual utilizado por las subcategorías del catálogo.

## Orden del catálogo por precio por unidad (2026-08-11)

- En la pestaña **Productos**, el buscador queda reducido a una lupa mientras no
  tiene foco y recupera el campo completo al tocarla. El hueco mantiene visibles
  los controles existentes de orden por precio de envase, un nuevo par de orden
  ascendente/descendente por `price_per_unit` y el selector lista/cuadrícula; al
  expandir la búsqueda se oculta temporalmente este último.
- La navegación pagina por `(price_per_unit, id)`, conserva los empates y deja al
  final los productos sin precio por unidad en ambos sentidos. La migración
  `20260811112706_catalog_price_per_unit_browse_indexes.sql` añade los índices
  parciales ascendente y descendente necesarios; sigue pendiente de desplegar.

## Inicio de sesión por enlace mágico (2026-08-03)

- `LoginScreen` ofrece correo electrónico además de Google y Apple. Envía un
  enlace de un solo uso con `supabase.auth.signInWithOtp`; las cuentas nuevas se
  crean al confirmar el correo y Supabase enlaza automáticamente identidades que
  compartan el mismo email verificado.
- En nativo vuelve por `quefalta://auth/callback`. `AuthContext` captura tanto el
  arranque en frío como la app abierta y acepta callback PKCE (`code`) o tokens
  del flujo implícito, sin canjear dos veces el mismo enlace. Web conserva el
  retorno al origen y `detectSessionInUrl`.
- Para producción, `quefalta://auth/callback` debe figurar en Supabase Auth > URL
  Configuration. Además hace falta SMTP propio: el SMTP por defecto de Supabase
  solo entrega a miembros autorizados del proyecto y no sirve para usuarios reales.

## Catálogo combinado y filtros por supermercado (2026-07-27)

- Con **Todos** activo, la segunda pestaña del Catálogo es **Comparador** en
  lugar de Categorías. Es una comparación manual: las tarjetas pasan a modo
  selección, una barra inferior habilita **Comparar** desde dos productos y un
  panel descendente llega hasta el límite del navegador inferior y muestra
  producto, supermercado, formato, precio y precio por unidad; la opción con
  menor precio de envase se marca en dorado. No usa
  el RPC de similitud ni reactiva `PRICE_COMPARISON_ENABLED`.

- El selector de supermercado de Catálogo, Ofertas, Novedades y Cambios de
  precios incluye **Todos** como fila
  compacta a ancho completo sobre la rejilla. Solo combina los supermercados
  elegidos en el perfil y disponibles en la región del usuario.
- Catálogo mezcla los cursores por precio y entrega páginas globales de 50
  productos; no concatena 50 resultados por supermercado. La búsqueda conjunta
  conserva también un máximo global de 50.
- Si una tabla sin índice de precio agota el tiempo de consulta, Catálogo
  recupera esa página alfabéticamente y mantiene disponible la mezcla de hasta
  50 productos en lugar de mostrar un error global.
- La migración `20260727090948_catalog_price_browse_indexes.sql` está aplicada
  en producción: añade índices parciales `(unit_price, id)` para los 15
  catálogos publicados y evita que la carga inicial de **Todos** espere al
  timeout de la API.
- Con **Todos** activo, las tarjetas de lista y cuadrícula muestran el logo
  legible del supermercado en la esquina superior izquierda; se aplica a
  Catálogo, Ofertas, Novedades y Cambios de precios.
- En la hoja de filtros, Supermercado usa esos logos y las facetas agrupadas
  de Categoría y Tipo de oferta los muestran en cada bloque. Al tocar un bloque,
  este se expande en línea conservando su borde, fondo y color.
- Con **Todos** en Categorías se muestran primero los nombres de los
  supermercados y, al tocar uno, se abre su árbol habitual.
- En Ofertas, el filtro de supermercado es multiselección. Categoría y Tipo de
  oferta se abren primero por supermercado y después muestran las facetas de esa
  tienda; la paginación keyset sigue recorriendo resultados hasta completar la
  página combinada.
- En Novedades, **Todos** carga hasta 50 novedades por supermercado para sus
  facetas locales y muestra como máximo 50 resultados combinados; su filtro de
  categoría se navega igualmente por supermercado. En Cambios de precios, las
  dos pestañas combinan el cambio porcentual de todas las tiendas y muestran
  los 50 cambios más relevantes de la dirección elegida.

## Rendimiento del catálogo (2026-07-18)

- La pestaña **Productos** conserva en memoria la primera página por
  `súper + idioma + comunidad + código postal` durante 5 minutos. Al volver a
  una tienda muestra la copia inmediatamente; si está caducada usa
  stale-while-revalidate y la renueva sin ocultar la lista ni mostrar el spinner
  inicial.
- Los árboles de categorías no se solicitan al cambiar de súper en Productos:
  se cargan únicamente al abrir la pestaña **Categorías**. Las peticiones de
  navegación, búsqueda y categorías usan `AbortController`, de modo que cambiar
  de tienda cancela el trabajo anterior y evita respuestas fuera de orden.
- Los `SELECT` de navegación/búsqueda piden solo los campos de las tarjetas. En
  particular, Mercadona ya no descarga `raw` para cada fila; las columnas de
  detalle y promoción quedan reservadas para ficha u Ofertas.
- `20260718183152_catalog_browse_indexes.sql` crea índices B-tree parciales
  `(display_name_norm, id) WHERE published = true` para todos los espejos y su
  variante catalana donde existe. Coinciden con el filtro y el orden de la
  paginación keyset. La migración es aditiva, pero sigue pendiente de ejecutar
  manualmente en producción.

## Índice alimentario (2026-07-16)

- La ficha de Mercadona consulta Open Food Facts por EAN y muestra un **Índice
  alimentario 0-100**. No requiere migración: se calcula en cliente con los
  `match` oficiales de los atributos `nutriscore`, `nova` y `ecoscore`, usando
  solo atributos con `status='known'`.
- Todas las fichas con EAN consultan primero Open Food Facts. Si devuelve un
  Nutri-Score aplicable (A–E), usan sus datos; si no hay coincidencia o el
  Nutri-Score no aplica, calculan el índice con la tabla nutricional publicada en
  Supabase para que el desglose de puntos se refiera a sus valores. Carrefour y
  Alcampo seleccionan su EAN solo en el detalle; Ametller ya lo aporta en la ficha
  estructurada.
- Plusfresc reutiliza también el bloque desplegable, pero como no ofrece EAN usa
  directamente `nutrition` en castellano y `nutrition_ca` en catalán, calculándolo
  en cliente con el mismo parser nutricional de catálogo.
- Eroski y Caprabo guardan también la tabla nutricional de su ficha HTML en
  `nutrition`, normalizada por 100 g/ml para reutilizar `parseCatalogNutrition`.
  El sync compartido la completa incrementalmente y sus modales reutilizan el
  mismo bloque visual del índice, sin consulta a Open Food Facts porque no hay EAN.
- Pesos según cobertura: nutrición sola 100%; nutrición+procesamiento 70/30;
  nutrición+sostenibilidad 80/20; los tres bloques 60/25/15. Sin nutrición no se
  publica índice. La UI muestra los pesos y la aportación de cada bloque.
- El bloque desplegable del índice alimentario enseña puntos positivos y negativos en
  escala 1-10 (10 siempre significa mejor), derivados de los componentes
  oficiales del Nutri-Score 2023, además de los valores por 100 g/ml.
- La respuesta de Open Food Facts se cachea por EAN durante la sesión para que
  el prefetch del detalle y la apertura del bloque no dupliquen la petición.

**Correccion 2026-07-17:** el desglose de componentes muestra los puntos
originales de Nutri-Score y su maximo por componente; no se convierte a una
escala propia de 1 a 10.

**Procesados y aditivos 2026-07-17:** el bloque desplegable muestra una seccion de
procesados cuando Open Food Facts clasifica el producto en NOVA 4, y una
seccion de aditivos con sus codigos y, cuando se conoce, su nombre.

El bloque de procesamiento entra siempre en el indice cuando existe NOVA:
NOVA 1 = 100, NOVA 2 = 75, NOVA 3 = 50 y NOVA 4 = 0; se aplica el peso de
cobertura correspondiente.

**Detalle de cambios de precio 2026-07-17:** todas las fichas consultan el
ultimo cambio semanal: muestran el precio anterior tachado y una etiqueta roja
de aumento o verde de bajada. Ejecutar `catalog_price_changes_all_stores.sql`
para que los espejos fuera de las seis tablas originales guarden el historial.
En la pantalla Cambios de precios, la cuadricula muestra anterior tachado y
nuevo precio verde/rojo sin porcentaje; la lista conserva el porcentaje.

**Sync Alcampo 2026-07-18:** el upsert de productos usa lotes de 50 con cuatro
reintentos y backoff. Los lotes de 500, por el `raw` jsonb, la ficha, los índices
trigram y el trigger de precios, podían superar el `statement_timeout` de
PostgREST (57014). El `timeout-minutes` de GitHub Actions es independiente.

**Categorías Alcampo 2026-07-19:** el árbol de Ocado repite las etiquetas de
alimentación dentro de Folletos, Club, campañas y ramas regionales. El sync
acepta únicamente las diez raíces de primer nivel —las de mayor número de
subcategorías— y sus hijos directos; no se deben volver a recorrer coincidencias
por nombre en todo el árbol. Se eliminaron de producción 162 categorías y 817
productos de esas ramas secundarias; quedan 120 categorías y 15.024 productos
del surtido nacional canónico.

## Identidad

## Actualizacion CP: Consum y Plusfresc (2026-07-16)

- Los feeds de Home **Novedades**, **Ofertas** y **Cambios de precios** también
  reciben `region`/`postalCode`: filtran la disponibilidad por CCAA o centro y
  muestran el precio regional cuando existe. Consum y Plusfresc guardan además
  el precio efectivo por zona/centro en `catalog_location_prices` y cada cambio
  en `catalog_location_price_changes`; la pantalla consulta ese histórico para
  el CP activo. Ejecutar `catalog_location_price_history.sql` antes del sync.

- `supabase/migrations/consum_regions.sql` añade disponibilidad por CCAA y
  `regional_prices` por `X-TOL-ZONE` a Consum. Ejecutarla antes del primer sync
  multi-zona; se barren València, Barcelona, Murcia, Albacete y Almería.
- `plusfresc_catalog.sql` incorpora `centers` y `center_prices`. El sync barre
  los ocho centros y el cliente resuelve el CP exacto contra `zones/zipcodes`
  (mapa en `src/constants/retailerZones.ts`). Centros no atendidos conservan el
  catálogo de referencia 12 para no ocultar productos incorrectamente.
- `consum_offers.sql` añade la señal de oferta explícita de Consum: el sync solo
  incluye en Ofertas productos con `OFFER_PRICE` junto a su `PRICE` habitual,
  y los filtra por la zona resuelta desde el CP. Una bajada semanal sin esa
  señal nunca se muestra como oferta.
- `plusfresc_offers.sql` incorpora las promociones `Oferta2` por centro. El
  precio normal no se altera en el catálogo: Ofertas usa `new_value_cents` y su
  fecha de fin para el CP activo, también para promociones de lote.
- `hiperdino_offers.sql` guarda el precio regular tachado de Magento. Solo se
  muestra como oferta si es estrictamente mayor que el precio final actual; no
  usa cambios entre syncs como señal de promoción.
- `aldi_offers.sql` normaliza el precio tachado, la etiqueta y la vigencia de
  Algolia. Ofertas solo incluye filas con precio tachado superior y campaña no
  caducada, nunca simples variaciones semanales.
- `20260723204711_dia_offers.sql` normaliza las dos señales del PLP de DIA:
  descuentos directos CLUB (precio tachado + porcentaje) y promociones de lote
  (`3x2`, `2ª unidad`, precio por varias unidades). El sync acumula además la
  oferta y su precio por CCAA; catálogo, Ofertas y ficha muestran la misma
  etiqueta regional.
- `20260723212240_sorli_offers.sql` normaliza la señal explícita de Sorliclic:
  tipo bilingüe, condiciones de promociones complejas, precio anterior y
  vigencia. La misma señal está en el catálogo general y en `/es/ofertas`, por
  lo que no se repite el crawl.

- **Nombre:** QuéFalta (antes "MercaApp"/"LaCompra"). La carpeta del repo sigue llamándose `MercaAppMobile`.
- **Qué es:** app móvil para organizar la compra **en grupo** (lista compartida en tiempo real, carrito por grupos) con catálogo real de **Mercadona**.
- **Stack app:** Expo **SDK 54**, React Native 0.81.5, TypeScript. Backend **Supabase** (auth + Postgres + storage + edge functions). Catálogo: **API pública de Mercadona** (`https://tienda.mercadona.es/api`).
- **iOS:** bundle `com.quefalta.app`, scheme `QuFalta`, Apple Team ID `LX4BLQDZS4`, EAS projectId `cdae19f5-47a5-4a4c-9f94-2befcada0885`.
- **Dominio:** `quefalta.es` (web Astro, repo aparte).
- **Repos:** app → `github.com/rruizosm/QueFalta` · web → `github.com/rruizosm/QueFalta-Web` (carpeta hermana `quefalta-web/`, NO está en este repo).

## ⚠️ Imprescindible para arrancar en una máquina nueva
`.env.local` está **gitignored** (no viaja con el repo). Sin él, Supabase no funciona. Crear en la raíz de `MercaAppMobile`:
```
EXPO_PUBLIC_SUPABASE_URL=https://auth.quefalta.es
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key del dashboard de Supabase>
```
La anon key se copia de Supabase → Project Settings → API. (Es pública/segura por RLS, pero no se commitea.)

**`google-services.json` también está gitignored (2026-07-10):** el repo es público y GitHub secret scanning avisó de la API key de Firebase (commit `1a6032c`; la clave sigue en ese historial — mitigación real = restringirla/rotarla en Google Cloud Console). Los builds de EAS la reciben vía la **file env var `GOOGLE_SERVICES_JSON`** (subida a los 3 entornos con `eas env:create --type file --visibility secret`); `app.config.js` (envoltorio dinámico sobre app.json, NO meter ahí más config) resuelve `android.googleServicesFile` = esa env var con fallback a `./google-services.json` en local. En máquina nueva: descargar el fichero de Firebase Console → raíz de `MercaAppMobile` (solo hace falta para `expo run:android`/prebuild local; los builds EAS no lo necesitan en disco).

**Custom domain (2026-06-21):** la API de Supabase se sirve por `https://auth.quefalta.es` (add-on Custom Domain). Así el popup de iOS al iniciar sesión muestra `auth.quefalta.es` en vez del subdominio `…supabase.co`. El subdominio original `https://gkffvigcnsesbaihycay.supabase.co` sigue funcionando (fallback de los syncs). El callback OAuth de Google `https://auth.quefalta.es/auth/v1/callback` está dado de alta en Google Cloud Console. La anon key NO cambia.

## Cómo ejecutar
- **Dev rápido (Expo Go):** `npx expo start` (en Windows con varios adaptadores de red, fijar IP de Wi-Fi: `REACT_NATIVE_PACKAGER_HOSTNAME=<ip>` y usar `--offline` si el CLI crashea con error `body`).
- **Mac / simulador iOS:** `npx expo run:ios` (hace prebuild + pods + build + Metro). Para iPhone USB: `npx expo run:ios --device`.
- **Dev build (EAS):** perfil `development` en `eas.json` (`developmentClient: true`). Expo Go NO soporta push notifications ni Universal Links → para eso hace falta dev build.

## Estructura
- `src/screens/` — Home, Catalog, SubCategory, Products, List, Groups, GroupDetail, Login, Profile, EditProfile, PrivacySecurity, DefaultGroup, Appearance (color de la app). `src/screens/onboarding/` — asistente de bienvenida (Welcome, Username, Stores, Avatar, Friends, Group, Done + `OnboardingNavigator`/`OnboardingLayout`). Ver `ONBOARDING.md`.
- `src/context/` — `AuthContext` (sesión), `ProfileContext` (perfil cacheado), `CartContext` (carrito activo + grupo por defecto), `ThemeContext` (accent elegido + `useThemedStyles`), `CoachMarkContext` (demo/tour sobre la app), `AppContext` (placeholder).
- `src/api/` — `profile`, `groups`, `lists`, `mercadona`, `account`.
- `src/lib/` — `supabase` (cliente), `notifications` (locales).
- `src/navigation/index.tsx` — Bottom Tabs + stacks; maneja deep links de invitación.
- `supabase/functions/delete-account/` — Edge Function de borrado de cuenta.

## Decisiones clave y gotchas (NO romper)
- **Login Google OAuth = PKCE.** `src/lib/supabase.ts` usa `flowType: 'pkce'`. En `AuthContext` (nativo): tras `WebBrowser.openAuthSessionAsync`, **extraer el `code` de la URL** (`Linking.parse(url).queryParams.code`) y pasar SOLO el code a `exchangeCodeForSession`. Pasar la URL entera da `invalid flow state`. La redirect URL del build será `quefalta://auth/callback` → debe estar en Supabase → Auth → URL Configuration (ya hay comodines `exp://**`, `exp://*.exp.direct/**`).
- **ProfileContext** carga el perfil UNA vez al haber sesión → evita el "flash" de campos vacíos al editar. Al guardar, `applyProfile(patch)` actualiza la caché.
- **Estado por-dispositivo en AsyncStorage = SIEMPRE por usuario** (`${KEY}:${userId}`), NUNCA con clave global: si no, se filtra entre cuentas del mismo móvil. Ya pasó (bug 2026-06-16): `CartContext` guardaba `activeCart`/`defaultGroup` con clave global → un usuario nuevo heredaba el carrito/grupo por defecto del anterior. Arreglado con claves por-usuario + limpieza de las globales heredadas + validación del carrito/grupo contra `fetchMyGroups` (descarta grupo borrado o del que te saliste). Mismo patrón en `@coachmarks_seen_v1` y `@checklist_dismissed_v1`.
- **Invitaciones por enlace:** `getInviteLink` devuelve `https://quefalta.es/join/{id}` (Universal Link). La recepción está en `navigation/index.tsx` (`parseInviteUrl` + listener de `Linking` → `joinGroup` → navega). `app.json` tiene `ios.associatedDomains: ["applinks:quefalta.es"]`. El fichero AASA vive en el repo web (`quefalta-web/public/.well-known/apple-app-site-association`, appID `LX4BLQDZS4.com.quefalta.app`, paths `/join/*`). Universal Links solo funcionan en build real + web desplegada.
- **Notificaciones:** Fase 1 (locales) hecha (`src/lib/notifications.ts`, toggle en ProfileScreen). Fase 2 (push) pendiente: requiere dev build + tabla `push_tokens` + Edge Function de envío. Ver `NOTIFICACIONES.md`.
- **Privacidad y seguridad:** `signOut('global')`, columna `discoverable` en profiles (el toggle se guarda pero aún no hay búsqueda por @usuario que lo aplique), y "Eliminar cuenta" vía Edge Function `delete-account` (hay que desplegarla: `supabase functions deploy delete-account`). Ver `PRIVACIDAD-SEGURIDAD.md`.
- **Imágenes de producto:** `list_items.image_url` se guarda al añadir (de `thumbnail` de Mercadona). `ProductDetailModal` consulta `GET /products/{id}/` y limpia el HTML que devuelve la API.
- **Tipos:** existe `src/types.ts` Y `src/types/index.ts`; el import `'../types'` resuelve a `types.ts`. Producto de API = `MercadonaProduct` (no `Product`).
- **Tema (color de la app):** Perfil → Apariencia permite elegir el accent (`ACCENT_OPTIONS` en `constants/colors.ts`; persistido en AsyncStorage `@accent_color`). `colors.accent/accentLight/accentMid` son **getters** sobre un valor mutable (`applyAccent`). Los `StyleSheet.create` que usan accent NO pueden ser estáticos: se definen como fábrica `const themedStyles = () => StyleSheet.create({...})` y se consumen con `const styles = useThemedStyles(themedStyles)` (de `ThemeContext`), que los recrea al cambiar el color. Si añades una pantalla/componente nuevo que use `colors.accent*` en su StyleSheet, sigue ese patrón; si solo lo usa inline en JSX basta con que el padre re-renderice (no hay React.memo en el código).

## Migraciones SQL pendientes en Supabase (ejecutar a mano)
- ✅ **Estadísticas generales:**
  `20260822165410_general_statistics.sql` y su frontera privada
  `20260822171122_general_statistics_private_boundary.sql` desplegadas como
  versiones remotas `20260822171009` y `20260822171221`.
- ✅ **Acceso heredado a «Todos»:** columna, protección y snapshot inicial
  desplegados. El segundo snapshot
  `20260824174500_grant_legacy_all_stores_to_pre_1_3_accounts.sql` está
  desplegado como `20260824174522`. Snapshot operativo repetido el 2026-08-25:
  4.054/4.054 perfiles actuales habilitados; las altas posteriores siguen
  recibiendo `false`, por lo que debe repetirse justo antes de publicar la 1.3.
- ✅ **Onboarding robusto:** `profile_onboarding.sql` y
  `20260821130300_onboarding_integrity.sql` aplicadas. La segunda añade
  `onboarding_step`, idempotencia de grupos y las RPC transaccionales. Ver
  `ONBOARDING.md`.
- ⚠️ **`profiles`: columna `premium_until timestamptz` + trigger de protección** (`supabase/migrations/profile_premium.sql`). IMPRESCINDIBLE antes de arrancar la app: `fetchProfile` ya selecciona la columna y falla si no existe. Ver `MONETIZACION.md`.
- ✅ **Insignia Plus pública:** migración
  `20260820163441_sync_plus_verified_badge.sql` aplicada en remoto. `verified`
  queda derivado y protegido desde `premium_until`; el backfill terminó con 0
  discrepancias. `revenuecat-webhook` aún no está desplegado y requiere primero
  configurar `RC_WEBHOOK_TOKEN`.
- **Gates del paywall en servidor** (`supabase/migrations/paywall_gates.sql`):
  `paywall_enabled()` (activado el 2026-08-25) e `is_premium()`. Crear grupos es ilimitado y
  no tiene trigger de monetización. Ejecutar DESPUÉS de profile_premium.sql y
  ANTES de re-ejecutar similar_products.sql (el RPC usa esas funciones).
- `profiles`: columnas `username text unique`, `avatar_url text`, `discoverable boolean not null default true`.
- `profiles`: columna `catalog_stores text[]` (preferencia "Supermercados del catálogo"; NULL/[] = todos). En `supabase/migrations/profile_catalog_stores.sql`.
- Bucket `avatars` (público) + policies de subida/lectura. Path de avatar: `{userId}/avatar.{ext}`.
- `list_items`: columna `image_url text`.
- Edge Function `delete-account` desplegada.
- (Futuro Fase 2) tabla `push_tokens`.
- **`group_members` INSERT policy** `with check (user_id = auth.uid())` — IMPRESCINDIBLE para que las invitaciones por enlace funcionen (si falta, `joinGroup` da 42501 y el grupo no carga). Está en `supabase/policies/group_join.sql`.
- **Modelo de admin de grupo** (`supabase/policies/groups_owner.sql`): `groups.created_by` = creador (inmutable), `groups.owner_id` = admin actual (cambia al transferir). Incluye `is_group_admin(gid)` (SECURITY DEFINER, evita recursión), la policy UPDATE de groups (admin) y la DELETE de group_members (abandonar/expulsar). El admin se calcula con `owner_id`, NO con `created_by`.
- **Borrado de grupo por el admin** (`supabase/migrations/group_delete_cascade.sql`): recrea los FK de group_members/shopping_lists/list_items con ON DELETE CASCADE para que borrar el grupo arrastre miembros, listas e ítems. La policy DELETE ya está en groups_owner.sql (owner_id).
- **Catálogo Consum** (`supabase/migrations/consum_catalog.sql`): tablas `consum_products`/`consum_categories`. Tras ejecutarla, lanzar el sync (workflow `sync-consum.yml` o `scripts/run-consum-sync.ps1`). Ver `scripts/README-consum-sync.md`.
- **Catálogo Dia** (`supabase/migrations/dia_catalog.sql`): tablas `dia_products`/`dia_categories`. Tras ejecutarla, lanzar el sync (workflow `sync-dia.yml` o `scripts/run-dia-sync.ps1`). Ver `scripts/README-dia-sync.md`.
- **Catálogo Sorli** (`supabase/migrations/sorli_catalog.sql`): tablas `sorli_products`/`sorli_categories` (7º súper, catalán). Migración AUTOCONTENIDA: incluye ya las columnas que en los otros súpers añadieron migraciones posteriores (`display_name_norm`+`display_name_ca_norm` para búsqueda sin acentos bilingüe, `first_seen_at` para novedades, `prev_unit_price`/`price_changed_at`/`price_delta_pct` + trigger para cambios de precio). Sorli tiene API JSON propia protegida por un token de sesión que firma su SPA → el sync (`scripts/sync-sorli.mjs`) ARRANCA la sesión con navegador headless (Playwright, como Bonpreu) y luego pagina el catálogo entero (~9.460 productos) con fetch, en 2 pasadas es/ca (bilingüe). Tras ejecutarla, lanzar el sync (workflow `sync-sorli.yml` o `scripts/run-sorli-sync.ps1`) y **re-ejecutar `similar_products.sql`** (ya incluye el brazo de Sorli). Ver `scripts/README-sorli-sync.md`.
- **Catálogo Ametller Origen** (`supabase/migrations/ametller_catalog.sql`): tablas `ametller_products`/`ametller_categories` (11º súper, catalán de frescos). Migración AUTOCONTENIDA (mismas columnas base que Sorli) + columnas de FICHA bilingüe (`ingredients`/`nutrition`/`conservation`/`origin` + sus `_ca`) + `ean`. Ametller corre sobre Salesforce Commerce Cloud → su SCAPI responde con un token de invitado por PKCE que se obtiene 100% con fetch (SIN navegador headless, a diferencia de Sorli/Bonpreu); el sync (`scripts/sync-ametller.mjs`) enumera los ids con product-search (cgid=root, offset) y trae el detalle por lotes de 24 (`/products?ids=`) en 2 pasadas es/ca. DRY_RUN OK: 2.994 productos, 0 sin precio/imagen/EAN, 2.573 con ingredientes, 2.759 con nombre catalán. Único espejo (con Consum) con EAN estructurado. Logo placeholder en `assets/stores/ametller.png` (sustituir por el real). Tras ejecutarla, lanzar el sync (workflow `sync-ametller.yml`) y **re-ejecutar `similar_products.sql`** (ya incluye el brazo de Ametller + su marca en la limpieza del needle).
- **Catálogo Aldi** (`supabase/migrations/aldi_catalog.sql`): tablas `aldi_products`/`aldi_categories` (12º súper). Migración AUTOCONTENIDA, **SOLO castellano** (aldi.es no es bilingüe), SIN ficha ni EAN. Aldi no vende con reparto pero publica su surtido permanente con precios online: la web es Next.js con Algolia y los productos van RENDERIZADOS EN EL SERVIDOR, embebidos en el `__NEXT_DATA__` (`props.pageProps.algoliaState.initialResults[idx].results[0].hits`) de cada categoría HOJA (`/productos/{n1}/{n2}.html`, hitsPerPage 1000). El sync (`scripts/sync-aldi.mjs`) enumera hojas crawleando las N1 (del sitemap `/.aldi-nord-sitemap.xml` sale la lista de PDPs, pero se usan las hojas) y raspa el JSON embebido — fetch puro sin cookies/navegador (patrón Carrefour/Dia). Precio + €/unidad (basePrice) + imagen Scene7; sin EAN (solo nº de artículo interno → comparador por nombre). GUARDARRAÍL: aborta si <800 productos (scrape parcial) para que markStale no borre el catálogo vivo. Logo placeholder en `assets/stores/aldi.png`. Tras ejecutarla, lanzar el sync (workflow `sync-aldi.yml`, lunes 08:20) y **re-ejecutar `similar_products.sql`** (ya con el brazo de Aldi).
- **Catálogo HiperDino** (`supabase/migrations/hiperdino_catalog.sql`): tablas `hiperdino_products`/`hiperdino_categories` (13º espejo). Migración AUTOCONTENIDA, **SOLO castellano** y SIN ficha. HiperDino (cadena líder de **Canarias**) es Magento 2 con **GraphQL abierto** (`POST hiperdino.es/graphql`, sin auth/cookies/navegador): el sync (`scripts/sync-hiperdino.mjs`) enumera los productos por las 13 ramas de súper (anchor, `products(category_id)` agrega el subárbol) con `pageSize` alto y dedup por sku, y reconstruye el árbol N1→N2 desde el `path` embebido de las categorías — fetch puro (patrón Carrefour/Dia). `price_text` aporta el precio de referencia y se normaliza a €/L, €/kg o €/ud; los formatos €/lavado, €/dosis y €/metro quedan en `raw` hasta ampliar las unidades canónicas. El precio total usa `sap_final_price` y el tachado `sap_price`: evitan que un resolver roto de `price_range` invalide una rama completa. OJO: NO se pide el campo `image` (un producto con imagen rota tira toda la query GraphQL) → la miniatura se DERIVA del sku (`cdn.hiperdino.es/catalog/product/x/{sku}_1.jpg`, patrón determinista verificado). DRY_RUN del 2026-08-22 OK: **14.775 productos · 127 categorías**, 0 sin precio/imagen/categoría, **11.357 con precio unitario canónico**, 9.255 EAN válidos y 1.160 con precio tachado. GUARDARRAÍL: aborta si <10.000 productos. Logo en `assets/stores/hiperdino.jpg`. **⚠️ OJO NEGOCIO: HiperDino solo opera en Canarias** (precios con IGIC, no IVA) → solo relevante para usuarios canarios; el filtrado por comunidad autónoma decide si se muestra (ver `COMUNIDAD-AUTONOMA.md`). Las columnas ya existen: tras desplegar el sync actualizado basta relanzarlo para hacer el backfill; después re-ejecutar `similar_products.sql` si su definición remota sigue pendiente.
- **Catálogo Plusfresc** (`supabase/migrations/plusfresc_catalog.sql`): tablas `plusfresc_products`/`plusfresc_categories` (15º espejo, súper catalán de Lleida — Supsa; 8 centros online, todos en Catalunya → filtrado por comunidad `ES-CT`). Migración AUTOCONTENIDA, **BILINGÜE es/ca nativa** y con FICHA rica (descripción/ingredientes/**ALÉRGENOS legibles**/nutrición/conservación, bilingüe; único espejo con alérgenos junto a Carrefour). API REST ASP.NET abierta (`wscompra.plusfresc.cat/api`) con JWT de INVITADO (`POST loginGuest/{centro}`, 30 min, re-login en 401): fetch puro, sin cookies ni navegador — el sync más simple junto a Condis. El sync (`scripts/sync-plusfresc.mjs`) baja TODO el catálogo en UNA petición (`products/category/Root/{centro}`, centro 12 = Lleida Cap Pont como referencia; ~7.5k filas → dedup por `item_id`), el árbol bilingüe en otra (`categories/tree/{centro}/Root`; ids numéricos jerárquicos por PREFIJO: "09"→"0901"→"090110"→"09011001"; ramas de marketing con id no numérico excluidas) y la ficha INCREMENTAL por producto (`productdetails/files/{item}/{lang}`, es+ca, TTL 30 días, flags `SKIP_DETAIL`/`DETAIL_MAX`, patrón bonÀrea). DRY_RUN OK 2026-07-15: **7.316 productos · 787 categorías**, 0 sin precio/imagen/categoría/nombre-ca, 20 sin €/unidad. Ofertas (copias de "Oferta2" con `new_value_cents`/`end_date`) NO se aplican al precio (rotan entre semana): quedan en `raw.offer` para futuro. Sin EAN. GUARDARRAÍL: aborta si <6.000 productos. Logo real (icono "és") en `assets/stores/plusfresc.png`. Tras ejecutarla, lanzar el sync (workflow `sync-plusfresc.yml`, lunes 10:40) y **re-ejecutar `similar_products.sql`** (ya con el brazo de Plusfresc + su marca en la limpieza del needle).
- Tras las dos anteriores, **re-ejecutar `similar_products.sql`** (ya incluye los brazos de consum y dia, y sus marcas blancas en la limpieza del needle).
- **Lista por zonas** (`supabase/migrations/list_items_category.sql`): columna `category_name` en `list_items` Y en `purchase_items` (para que "repetir compra" conserve las zonas). Sin ella, añadir a la cesta falla (el insert incluye la columna).
- **Idioma de las notificaciones push** (`supabase/migrations/push_tokens_lang.sql`): columna `lang text` en `push_tokens`. El texto de las push se genera en servidor (`send-push`) y antes salía siempre en castellano aunque el usuario tuviera la app en català. Ahora el cliente guarda el idioma de CADA dispositivo en el token (al registrar y al cambiar de idioma) y `send-push` agrupa los tokens del destinatario por `lang` y traduce el mensaje por grupo (es/ca, dict `STRINGS` en la función). Aditiva (NULL = castellano). **Tras ejecutarla, RE-DESPLEGAR la función:** `supabase functions deploy send-push`.
- **Bandeja de notificaciones server-side** (`supabase/migrations/notifications_inbox.sql`): tabla `notifications` (user_id, type, title, body, data jsonb, read, created_at) con RLS (select/update/delete propias; INSERT solo `send-push` con service-role). Antes la campana del Home guardaba la bandeja LOCAL en AsyncStorage y solo registraba lo recibido en primer plano o tocado → lo de SEGUNDO PLANO no se contaba. Ahora `send-push` inserta una fila por destinatario (en su idioma) a la vez que manda el push, y `NotificationsContext` lee/gestiona esa tabla (refetch al volver a primer plano + al recibir/tocar; el proyecto no usa realtime). **Tras ejecutarla, RE-DESPLEGAR la función:** `supabase functions deploy send-push`.
- ⚠️ **Ficha de producto desde la cesta para todos los súpers** (`supabase/migrations/list_items_store_product_id.sql`): columna `store_product_id text` en `list_items` Y en `purchase_items`. Guarda el id del producto en su propio súper para poder abrir su ficha al tocarlo en la cesta (antes solo Mercadona, vía `mercadona_product_id`). La tienda se sigue deduciendo en cliente del dominio de la imagen (`storeOfItem`), así que con `{tienda, store_product_id}` la cesta abre el modal correcto vía `StoreProductModal`. IMPRESCINDIBLE antes de arrancar: `fetchListItems`/`fetchGroupItems`/`fetchPurchaseItems` ya seleccionan la columna y la cesta falla al cargar si no existe. NULL en ítems manuales o anteriores (no abren ficha, como hasta ahora); solo los productos añadidos tras la migración la tendrán.
- **Fix precios Bonpreu** (`supabase/migrations/fix_bonpreu_prices.sql`): UPDATE one-off que repara `unit_price` desde el raw (~50% del catálogo guardaba el €/kg de referencia como precio del envase). El sync ya está corregido; ejecutar el SQL para arreglar lo existente sin esperar al re-scrapeo. ⚠️ Ejecutarlo ANTES que `catalog_price_changes.sql` (si el trigger ya está instalado, la reparación masiva se registraría como "cambios de precio" falsos).
- ⚠️ **Publicación reanudable de Bonpreu** (`supabase/migrations/20260728182501_bonpreu_sync_staging.sql` → `20260729184317_bonpreu_resumable_publication.sql`): el crawler congela el árbol y guarda snapshots bilingües sin retirar el catálogo vivo; la finalización conserva un único `publication_started_at`, cursor y fase. Publica como máximo 1.000 productos por Action en micro-lotes de 50, confirma cada lote con compare-and-swap y solo ejecuta `markStale` tras verificar el plan completo. La segunda migración recupera automáticamente el prefijo exacto de un ciclo interrumpido (20.890 staged; 6.750 ya escritos en el incidente del 2026-07-29). **Aplicar la migración nueva a la vez que el script/workflow actualizado; el script antiguo ignora el cursor.**
- **Novedades de la semana** (`supabase/migrations/catalog_first_seen.sql`): columna `first_seen_at` + índice en las 6 tablas `*_products`. Se añade con default sentinel antiguo (solo metadatos, sin UPDATE masivo) y luego se cambia el default a `now()` → lo existente queda "antiguo" y solo lo que aparezca en próximos syncs cuenta como novedad; los syncs NO se tocan (merge-duplicates no pisa columnas fuera del payload). La lee `fetchWeeklyNewProducts` (`src/api/catalog.ts`) para la pantalla "Novedades de la semana" del Home (botón junto a la campana); Mercadona no la necesita (usa su endpoint oficial `/home/new-arrivals/` en vivo). Guarda en cliente: un lote > ~400 = primer llenado de un súper nuevo (Consum/Dia sin run), se oculta. Sin la migración, la pantalla funciona solo para Mercadona (el resto muestra su error).
- **Cambios de precios** (`supabase/migrations/catalog_price_changes.sql`): columnas `prev_unit_price` + `price_changed_at` + `price_delta_pct` (% de variación; las TRES las rellena el trigger — la 1ª versión usaba columna generada y la reescritura de tabla moría por 57014 en el SQL Editor) + trigger `BEFORE UPDATE OF unit_price` + índice parcial en las 6 tablas `*_products`. Migración 100% metadatos (instantánea, sin bloqueos); idempotente, ejecutable entera o por bloques. El upsert semanal de los syncs dispara el trigger solo (syncs intactos); markStale no toca `unit_price` → no lo dispara. Lo lee `fetchPriceChanges` (`src/api/catalog.ts`) para la pantalla "Cambios de precios" del Home (pestañas Bajadas/Subidas ordenadas por magnitud). **No hay datos hasta el primer sync (lunes) posterior a ejecutarla** → ejecutarla cuanto antes. ⚠️ ORDEN: `fix_bonpreu_prices.sql` va ANTES.
- ⚠️ **Ofertas de Carrefour** (`supabase/migrations/carrefour_offers.sql`): columnas `promo_name/promo_text/promo_start/promo_end` + `strikethrough_price` en `carrefour_products`, **con BACKFILL desde `raw`** (los badges de promo y el precio tachado ya venían en el SSR de listado y el sync los guardaba enteros en `raw` → hay datos nada más ejecutarla, sin esperar al lunes) + índice parcial para el keyset del listado. Las lee `fetchCarrefourOffers` (paginación keyset, filtro de caducidad por `promo_end`) para la pantalla "Ofertas" del Home (4º círculo glass de la cabecera, `OffersScreen`, hoy solo Carrefour vía `OFFER_STORES`) y `fetchCarrefourProduct` para el banner de oferta de la ficha (`CarrefourProductModal`: precio tachado + píldora con el badge y sus condiciones). **IMPRESCINDIBLE ejecutarla antes del próximo sync de Carrefour**: `normalize()` ya incluye las columnas en el upsert y falla sin ellas. Requiere `catalog_unaccent_search.sql` previa (usa `display_name_norm`).
- ⚠️ **Ofertas de Consum** (`supabase/migrations/consum_offers.sql`): columnas `promo_base_price` y `offer_zones` en `consum_products`. La API de Consum solo marca oferta cuando publica la pareja `PRICE` + `OFFER_PRICE`; el sync guarda la primera como precio anterior y todas las zonas con `OFFER_PRICE`. `OffersScreen` consulta exclusivamente `offer_zones` del CP activo, por lo que un simple cambio de precio histórico no puede entrar como oferta. **Ejecutarla antes del próximo sync de Consum**: el UPSERT ya envía ambas columnas.
- ⚠️ **Ofertas de Plusfresc** (`supabase/migrations/plusfresc_offers.sql`): columnas de promoción y `offer_centers` en `plusfresc_products`. La API crea una copia `Oferta2` por promoción con `new_value_cents`, etiqueta y fecha de fin. El sync guarda esa señal por centro; Ofertas muestra exclusivamente los centros correspondientes al CP, incluso para promos de lote con el mismo precio individual. **Ejecutarla antes del próximo sync de Plusfresc**: el UPSERT ya envía estas columnas.
- ⚠️ **Ofertas de HiperDino** (`supabase/migrations/hiperdino_offers.sql`): columna `promo_base_price` en `hiperdino_products`. Magento entrega `final_price` y `regular_price`; el sync guarda el regular únicamente si es mayor. Ofertas filtra esa columna y no consulta el historial semanal, por lo que una variación ordinaria de precio no se presenta como promoción. **Ejecutarla antes del próximo sync de HiperDino**: el UPSERT ya envía la columna.
- ⚠️ **Ofertas de Aldi** (`supabase/migrations/aldi_offers.sql`): columnas `promo_name`, `promo_base_price` y `promo_end` en `aldi_products`. Algolia publica `strikePrice`, etiqueta y vigencia dentro de `currentPrice`; el sync solo conserva la promoción cuando el precio tachado supera al actual. Ofertas excluye campañas caducadas y no consulta el historial semanal. **Ejecutarla antes del próximo sync de Aldi**: el UPSERT ya envía las columnas.
- ✅ **Ofertas de DIA** (`supabase/migrations/20260723204711_dia_offers.sql`, aplicada en producción el 2026-07-23): columnas `promo_name`, `promo_text`, `promo_base_price`, `offer_regions` y `regional_offers` en `dia_products`, con backfill desde `raw`. El PLP general ya contiene la misma señal que `/ofertas`, incluidos `promotions[].description` para 3x2/2ª unidad y el precio tachado/porcentaje de CLUB Dia. El sync une esa señal por CCAA y la app la consume en catálogo (lista/cuadrícula), Ofertas y ficha.
- ✅ **Ofertas de Sorli** (`supabase/migrations/20260723212240_sorli_offers.sql`, aplicada en producción el 2026-07-23): columnas bilingües `promo_name(_ca)`/`promo_text(_ca)`, `promo_base_price` y vigencia en `sorli_products`, con backfill desde `raw`. Sorliclic publica tipos estructurados (`Precio`, `2ª 50/70%`, `2x1`, `3x2`, `4x3`, lotes y regalo); el sync prioriza las condiciones concretas cuando contradicen el tipo genérico. La app lo consume en catálogo (lista/cuadrícula), Ofertas y ficha.
- ✅ **Ofertas de Condis, Ametller, Alcampo, Eroski y Caprabo** (`supabase/migrations/20260726200544_retailer_offers_condis_ametller_alcampo_eroski_caprabo.sql`, aplicada en producción el 2026-07-26): las cinco tablas comparten `promo_name`, `promo_text`, `promo_price`, `promo_base_price`, `promo_start` y `promo_end`. El backfill normaliza solo señales explícitas ya presentes en `raw` (promoción/club/lote o precio regular frente al promocional), sin convertir cambios semanales en ofertas. El parser compartido de Eroski/Caprabo extrae badge, condiciones, precio promocional, precio anterior y vigencia del HTML de cada tarjeta. Tras los syncs completos del 2026-07-26, producción contiene 1.075 ofertas de Condis, 344 de Ametller, 1.521 de Alcampo, 2.378 de Eroski y 1.002 de Caprabo; la app las consume en la sección Ofertas con el precio anterior tachado solo cuando existe una rebaja directa real.
- **Filtros de Ofertas:** la hoja permite multiselección por tipo (`Precio rebajado`, `Segunda unidad`, `3x2/2x1/lotes`, `Club/cupones` y `Otras promociones`) y por categoría del producto, además de precio, orden y búsqueda. Las etiquetas heterogéneas de cada retailer se clasifican en cliente después de resolver idioma/región, recorriendo páginas keyset hasta reunir coincidencias para no filtrar solo los productos ya visibles. Las categorías se obtienen paginando `id, category_name` y deduplicando: los agregados del Data API están deshabilitados en producción (`PGRST123`), por lo que no se usa `count()`.
- ⚠️ **Multi-zona de Carrefour por comunidad autónoma** (`supabase/migrations/carrefour_regions.sql`): columnas `regions text[]` + `regional_prices jsonb` en `carrefour_products`. Carrefour REGIONALIZA catálogo Y precio por CP (cada CP → un almacén `werks_id`; 48 en España; SIN cookie = Madrid COL PINAR). `scripts/sync-carrefour.mjs` ahora BARRE una capital por comunidad (~18 almacenes deduplicados, ~2 h) fijando la cookie `salepoint` y une por `product_id`; guarda `regions` (CCAA donde disponible; NULL = nacional, semántica de mercadona/dia) y `regional_prices` (precio por CCAA cuando difiere del de Madrid). Las **columnas base siguen siendo las de Madrid** (COL PINAR = comportamiento sin cookie) → la app NO cambia hasta implementar el filtro por comunidad (`regions.ts`); hoy solo se GUARDA. **IMPRESCINDIBLE ejecutarla antes del próximo sync**: el upsert incluye ambas columnas y falla sin ellas. Sube el `-ExecutionTimeLimit` de la tarea de Windows a ~4 h (barrido ×18). Ver `scripts/README-carrefour-sync.md`.
- **Ficha de producto bonÀrea** (`supabase/migrations/bonarea_product_detail.sql`): columnas anulables `description/ingredients/allergens/nutrition/conservation/denomination/origin/operator` **+ sus `_ca`** (bilingüe es/ca) + `detail_synced_at` en `bonarea_products`. La rellena `scripts/sync-bonarea.mjs` leyendo la página de cada producto (HTML server-rendered, bloque `.general-product-info`); **bilingüe**: la ficha catalana va por una urlFriendly distinta (`/online/producte/…`) que sale de la 2ª pasada `/ca/`. Descarga **incremental** (solo productos sin ficha o con `detail_synced_at` viejo, flags `DETAIL_*`/`SKIP_DETAIL`). `mapBonarea` elige idioma (fallback es) y `BonareaProductModal` pinta las secciones sin cambios. **Imprescindible ejecutarla antes del próximo sync**, si no el upsert de la pasada de ficha falla por columnas inexistentes. bonÀrea y Dia son los únicos espejos que exponen ficha; Consum NO (su API solo da códigos de filtro y el JSON nutricional del CDN da 404 — verificado en vivo 2026-06-26).
- **Ficha de producto Dia** (`supabase/migrations/dia_product_detail.sql`): columnas anulables `description/ingredients/nutrition/conservation/preparation/denomination/operator` + `detail_synced_at` en `dia_products`. La rellena `scripts/sync-dia.mjs` leyendo la página de cada producto (raw.url): dia.es es SSR Vike con el producto ESTRUCTURADO en `vike_pageContext` (`ingredients.text`, `nutritional_info`, `instructions`, `manufacturer_contact`, `product_info`). **Solo castellano** (dia.es no es bilingüe) → sin columnas `_ca`. Descarga **incremental** (flags `DETAIL_*`/`SKIP_DETAIL`, igual que bonÀrea). `mapDia`/`DiaProductModal` ya lo pintan. **Imprescindible ejecutarla antes del próximo sync de Dia**.
- **Ficha de producto Carrefour** (`supabase/migrations/carrefour_product_detail.sql`): columnas anulables `ingredients/allergens/nutrition/conservation/preparation/denomination/origin/operator` + `detail_synced_at` en `carrefour_products`. La rellena `scripts/sync-carrefour.mjs` leyendo la PDP de cada producto (raw.url): Carrefour embebe `window.__INITIAL_STATE__` con `nutrition_info` TOTALMENTE estructurado (ingredientes, `alergenos`{contiene,puedeContener}, valorEnergetico, macros, y `masInfo` grupos→listaInfo de nombre/valor: conservación, denominación legal, operador…). **Solo castellano** → sin `_ca`. Descarga **incremental** (flags `DETAIL_*`/`SKIP_DETAIL`). OJO Cloudflare: el sync corre en local y la pasada de ficha multiplica peticiones → `DETAIL_MAX`/conc. baja la reparten. `mapCarrefour`/`CarrefourProductModal` ya lo pintan. **Imprescindible ejecutarla antes del próximo sync de Carrefour**. El backfill independiente `scripts/backfill-carrefour-ean.mjs` descarga la misma PDP para las filas publicadas sin EAN y guarda `product.ean`; es reanudable (`ean IS NULL`) y admite `DRY_RUN`, `LIMIT` y `PRODUCT_ID`. (Bonpreu es el único espejo con ficha aún sin implementar: requiere el navegador headless del WAF, 1 nav/producto.)
- **Ficha Eroski/Caprabo** (`supabase/migrations/20260718133958_eroski_caprabo_nutrition.sql` + `20260719102703_eroski_caprabo_product_detail.sql`): añade `nutrition`, `ingredients`, `conservation`, `manufacturer` y `detail_synced_at` a ambas tablas. `scripts/lib/eroski-tapestry.mjs` descarga la PDP con GET y extrae esos bloques; normaliza la nutrición por 100 g/ml para el Índice Alimentario. La segunda migración invalida de forma segura el TTL para completar el backfill gradual (`DETAIL_MAX=1000`; TTL 90 días después). **Ejecutar ambas migraciones, en ese orden, antes del siguiente sync**; no se han aplicado automáticamente a producción.
- **Índices de navegación del catálogo** (`supabase/migrations/20260718183152_catalog_browse_indexes.sql`): índices B-tree parciales por `(display_name_norm, id)` y `(display_name_ca_norm, id)` donde corresponde, con `WHERE published = true`. Aceleran la primera página y el keyset de Productos sin cambiar el esquema que selecciona el cliente. El SQL omite de forma segura las tablas/columnas aún no creadas. **Pendiente de ejecutar manualmente en producción**.
- ⚠️ **Favoritos por tienda** (`supabase/migrations/favorites_store.sql`): añade columna `store` a `favorites` + cambia la unicidad a `(user_id, kind, store, ref_id)` (los ids se solapan entre súpers). IMPRESCINDIBLE antes de arrancar tras este cambio: `fetchFavorites` ya selecciona `store` y falla sin ella. La migración hace backfill de filas viejas (productos por dominio de imagen, categorías → mercadona). Habilita: favoritos de producto/categoría en los 6 súpers (swipe en listas/búsqueda + estrella en los modales) y el agrupado de favoritos por súper en el Home.
- **Búsqueda insensible a acentos** (`supabase/migrations/catalog_unaccent_search.sql`): añade columna generada `display_name_norm` (minúsculas + sin acentos vía wrapper inmutable `f_unaccent`) + índice trigram a las 6 tablas `*_products`. La app (`src/api/catalog.ts` → `filterByNameWords`) ya busca sobre esa columna normalizando el texto del usuario, así que "platano" encuentra "Plátano". Aditiva (no toca columnas/índices viejos), backfill automático, sin cambios en los syncs. Sin ejecutarla, la búsqueda no devuelve nada (filtra por una columna inexistente).
- **Catálogo Mercadona en catalán (Fase 2 bilingüe)** (`supabase/migrations/mercadona_catalog_ca.sql`): añade a `mercadona_products` la columna `display_name_ca` + la generada `display_name_ca_norm` (= `coalesce(display_name_ca, display_name)` normalizada) + índice trigram. La pestaña "Productos" del catálogo (espejo) busca/muestra en català cuando la UI está en català (`searchProducts` mira el idioma con `getLanguage()`); el resto de vistas de Mercadona van en vivo con `lang=ca` y no necesitan BD. **Imprescindible ejecutarla antes de arrancar en català** (si no, `searchProducts` filtra por `display_name_ca_norm`, inexistente → la búsqueda peta en català). Tras ejecutarla, **relanzar el sync** (`scripts/sync-catalog.mjs` / workflow `sync-catalog.yml`) para que su 2ª pasada `lang=ca` rellene `display_name_ca` (hasta entonces, búsqueda en català funciona pero muestra nombres en castellano por el coalesce). Solo Mercadona soporta catalán por API.
- Hay SQL previo en `supabase/` (RLS, policies de groups/group_members/shopping_lists/list_items).

## Estado / pendientes
- ✅ **Fase 3 de seguridad y rendimiento de datos (2026-08-14):** auditoría
  remota actualizada (44 avisos de seguridad y 121 de rendimiento) y migración
  desplegada para fijar `search_path`, cerrar RPC privilegiados a `anon`,
  consolidar RLS, evaluar `auth.uid()` una vez por consulta y cubrir 6 claves
  foráneas con índices. Resultado verificado: 20 avisos de seguridad y 69 de
  rendimiento; sin avisos RLS por fila, policies solapadas ni claves foráneas
  sin índice. Si un SQL legacy recrea estas funciones/policies, reauditar antes
  de desplegarlo. Detalle en
  `FASE-3-SEGURIDAD-RENDIMIENTO-DATOS.md`.
- ✅ **Fase 1 de estabilidad y rendimiento inicial (2026-08-14):** ESLint pasa de 82 avisos a cero y CI no admite nuevos; errores de Apple/Google se traducen a UI comprensible; BootLoader baja su mínimo artificial de 2 s a 350 ms; las pestañas se montan bajo demanda; arrays, filtros y efectos de catálogo estabilizados; Release validada en iPhone 17e e iPad mini. Sin cambios remotos ni migraciones. Detalle en `FASE-1-ESTABILIDAD-RENDIMIENTO.md`.
- ✅ **Fase 2 de accesibilidad, diseño y recursos (2026-08-14):** animaciones y transiciones respetan Reducir movimiento; controles compartidos exponen etiquetas y estados accesibles; contraste secundario y accents cumplen AA; Login se adapta a texto `accessibility-large`; el bundle importa solo Ionicons y los cuatro pesos usados de Space Grotesk. Export iOS: 57→38 recursos, 1.524→1.470 módulos, 6,15→5,81 MB de Hermes y ~35 % menos tamaño exportado. Sin cambios remotos ni migraciones. Detalle en `FASE-2-ACCESIBILIDAD-DISENO.md`.
- ✅ **Fase 0 de calidad y línea base (2026-08-13):** Node 22.23.2 y npm 10.9.8 fijados; `npm run quality` agrupa TypeScript, ESLint y 27 tests; workflow de CI añadido; Debug/Release verificados en iPhone y iPad simulados. Auditoría remota de Supabase de solo lectura confirma que las columnas críticas y los RPC usados por el cliente existen. No se aplicó ninguna migración. Detalle, medidas y backlog en `FASE-0-LINEA-BASE.md`. Las listas históricas de migraciones pendientes de este documento deben contrastarse con esa auditoría antes de tratar una columna como ausente.
- ✅ App funcional en Expo Go: auth, grupos, carrito, catálogo, perfil, notificaciones locales, privacidad.
- ⏳ Desplegar `quefalta-web` en Vercel + DNS de `quefalta.es` (Hostinger: A `@` → IP de Vercel, CNAME `www` → `cname.vercel-dns.com`).
- ⏳ Primer `eas build` iOS / `expo run:ios` para probar en dispositivo y los Universal Links.
- ⏳ URL real de App Store (sustituir `#`/`APP_STORE_URL` en la web).
- ⏳ **Consum añadido como 5º súper** (2026-06-12): código completo — sync (`scripts/sync-consum.mjs`, API REST abierta de Consum, DRY_RUN completo OK: 9.351 productos), espejo (`consum_catalog.sql`), app (stores/catalog/pantalla/modales) y comparativa. Pendiente: ejecutar la migración en Supabase, primer run real del sync y re-ejecutar `similar_products.sql`. Consum es el único súper con EAN y marca estructurados.
- ⏳ **Dia añadido como 6º súper** (2026-06-12): código completo — sync (`scripts/sync-dia.mjs`, SSR Vike de dia.es con JSON `vike_pageContext` embebido, DRY_RUN completo OK: 5.433 productos en 287 N2, ~6 min), espejo (`dia_catalog.sql`), app y comparativa. Mismos pendientes que Consum (migración + run + `similar_products.sql`). `lib/price.mjs` ahora convierte DOCENA→€/ud.
- ⏳ **Sorli añadido como 7º súper** (2026-07-10): código completo — sync (`scripts/sync-sorli.mjs`: la API firma un token de sesión en el navegador, así que arranca con Playwright y pagina con fetch; BILINGÜE es/ca en 2 pasadas; DRY_RUN OK: 9.460 productos, 1.109 categorías), espejo (`sorli_catalog.sql`, autocontenida), app completa (selector, búsqueda, navegación, categorías, ficha `SorliProductModal`, favoritos, zonas) y comparativa. Pendientes: ejecutar la migración, re-ejecutar `similar_products.sql`, primer run del sync (workflow `sync-sorli.yml`, lunes 06:50, tras Dia) y validar en device. Logo en `assets/stores/sorli.png`.
- ⏳ **Eroski (8º) y Caprabo (9º) añadidos** (2026-07-11): comparten backend (Apache Tapestry) → un scraper compartido `scripts/lib/eroski-tapestry.mjs` (GET de la página de categoría —SSR del 1er lote de 20— y después `POST supermarket:loadpage` con cookies de sesión + Origin/Referer; saca cada producto del JSON `data-metrics` del tile: id/nombre/marca/categoría/precio; ⚠️ la paginación `?pageNumber=N` original DEJÓ de funcionar el 2026-07-11: el server devuelve "No se obtuvieron resultados") y dos syncs mínimos (`sync-eroski.mjs`, `sync-caprabo.mjs`). Solo castellano, SIN €/unidad ni EAN, pero con nutrición de ficha HTML incremental normalizada para el Índice Alimentario. DRY_RUN completo OK (2026-07-11, ya con loadpage): **Eroski 21.073 productos** / 803 hojas / 0% sin tiles; **Caprabo 10.657** / 750 hojas (8% sin tiles por 429 de rate-limit tras encadenar crawls desde la misma IP — en CI no pasa). OJO: los crawls con `?pageNumber` daban 10.694 en Eroski = LA MITAD del catálogo (solo el 1er lote de cada hoja). GUARDARRAÍL anti-throttling: bajo carga el server sirve la página sin productos (o 429, con backoff largo + Retry-After) → reintentos en la pág. 1 + aborta el run si >20% de hojas llegan SIN TILES (para que markStale no despublique productos vivos); las hojas cuyo contenido ya se vio en otras categorías (~60 por súper, solapamiento del árbol) se cuentan APARTE como "solo-duplicados" y no disparan el aborto (la 1ª versión las mezclaba y abortó el run de CI del 2026-07-11 con un falso "56% vacías"). App: tipo/adaptador/modal (`TapestryProductModal`)/pantalla (`TapestryProductsScreen`) COMPARTIDOS por ambos, con funciones de `catalog.ts` por tabla. Migraciones `eroski_catalog.sql`+`caprabo_catalog.sql` (autocontenidas, es-only) + ampliación `20260718133958_eroski_caprabo_nutrition.sql` para tablas ya creadas. Pendientes: ejecutar las migraciones, re-ejecutar `similar_products.sql` (ya con ambos brazos), primer run (`sync-eroski.yml` lunes 09:00 / `sync-caprabo.yml` 09:30) y validar en device. Logos en `assets/stores/{eroski,caprabo}.png`. Ver `scripts/README-eroski-caprabo-sync.md`.
- ⏳ **Lista agrupada por zonas del súper** (2026-06-12): Lista y cesta de grupo agrupan Tienda → Zona ("pasillo": Fruta y verdura, Congelados al final…) con alfabético dentro. Mapeo de N1 de los 6 supers → ~15 zonas canónicas por keywords en `src/constants/zones.ts` (solo cliente, afinable sin migrar). La categoría se captura al añadir (`list_items.category_name`); manuales/históricos → "Otros". ⚠️ Si se añade un nuevo punto de "añadir a la cesta", pasar `categoryName`. Pendiente: ejecutar `list_items_category.sql`.
- 🧪 Comparativa de productos similares entre supers (detalle de producto) — **ACTIVADA PARA TESTERS** con `PRICE_COMPARISON_ENABLED = true`: funciona bajo demanda, usa la capa híbrida/caché y el cliente ya apunta a `catalog_cheaper_products_v5`. Antes de distribuir ese cliente debe desplegarse `20260817124758_comparator_semantic_identity_guard.sql`; la RPC v4 permanece disponible para builds anteriores.
- Monetización «QuéFalta Plus» (3,99 €/mes · 19,99 €/año): **ACTIVA DESDE LA VERSIÓN 1.3**. El paywall presenta orden por precio unitario, Radar de ahorro ilimitado, alertas personalizadas ilimitadas, productos asociados a comentarios y estadísticas; «Todos» está incluido para cualquier cuenta registrada desde el 2026-08-29. Cliente `PAYWALL_ENABLED = true` y servidor `paywall_enabled() = true`.
- Configuración externa de Plus (2026-08-22): Apple ya tiene los productos
  `com.quefalta.app.plus.monthly` y `.annual` (3,99/19,99 €, prueba anual de
  7 días) y RevenueCat ya enlaza Apple/Google/Test Store en `plus` → `default`
  → `$rc_monthly`/`$rc_annual`. Google tiene creada la suscripción
  `quefalta_plus`, pero no permitirá guardar los planes `monthly`/`annual` hasta
  subir una build con Google Play Billing al menos a prueba interna. Ver
  `MONETIZACION.md` y `HANDOFF.md` para credenciales y pruebas pendientes.
- 🧪 **Onboarding de primera vez + demo:** flujo robustecido y migraciones
  aplicadas; pendiente únicamente recorrerlo visualmente con una cuenta de prueba
  que tenga `onboarded_at` a NULL. Ver `ONBOARDING.md`.
- ❌ No publicar en App Store todavía (solo pruebas en dispositivo propio).
- ⏳ **Nota de salud estilo Yuka (Plus, solo Mercadona)**: backend incorporado en
  `scripts/lib/health-score.mjs`, `scripts/extract-mercadona-nutrition.mjs`,
  `supabase/migrations/mercadona_health.sql` y el workflow correspondiente.
  Pendiente: ejecutar la migración, configurar `ANTHROPIC_API_KEY`, lanzar el
  backfill y completar la Fase 3 de UI.
- ✅ **Icono personalizado por grupo**
  (`supabase/migrations/20260822071818_add_group_icon.sql`): añade la columna
  nullable `groups.icon_emoji` y limita su longitud. Aplicada y verificada en
  producción como `20260822073002`; reutiliza la policy UPDATE existente, por
  lo que solo el administrador puede cambiarlo.
