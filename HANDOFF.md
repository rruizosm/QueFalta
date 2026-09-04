# HANDOFF.md — Estado en vuelo (traspaso a Codex)

## Lidl: catálogo cargado e integración cliente local (2026-09-04)

- La conclusión histórica de Lidl como «sin espejo» queda superada: Product
  Catalog de Lidl Plus sí entrega el árbol y los precios para una tienda.
- El sync productivo de `ES3572` terminó OK: 2.811 productos, 43 categorías,
  2.811 con precio/imagen, 2.736 con precio por unidad y 2.633 disponibles.
  «Butifarra fresca de cerdo» está publicada a 3,69 € y la búsqueda RPC la
  devuelve como primer resultado.
- El origen de 2.531 frente a 2.811 era Cosmética devolviendo temporalmente 0
  en una pasada. Se añadieron 3 reintentos exponenciales y bloqueo si no hay
  40/40 hojas con producto antes de cualquier upsert/mark-stale.
- No confundir los ids terminados en `_ES` con EAN. El esquema deja `ean=NULL`;
  Scan&Go expone `barcode` en una masterdata autenticada y no se consulta.
- Las migraciones de tablas y búsqueda están aplicadas; RLS, lectura anon,
  búsqueda, índices y `catalog_sync_status` se verificaron en producción. Lidl
  está integrado localmente en selector, categorías, browse/búsqueda, ficha,
  carrito y favoritos, pero no en comparador. TypeScript pasa.
- Workflow semanal listo, aún no publicado: requiere commit/push y la variable
  GitHub `LIDL_SYNC_ENABLED=true`. Siguen pendientes el contraste multi-tienda
  y la revisión de autorización comercial. Ver `scripts/README-lidl-sync.md`.

## Compilación Xcode: caché de React y sesión PIF (local, 2026-09-03)

- Identificados los fallos `Framework 'React' not found` y sesión PIF ocupada.
  El framework de DerivedData carecía del binario; el Pod original sí lo tenía.
- Apartada solo la copia incompleta y reiniciado el `SWBBuildService` del editor.
  CocoaPods ya ha restaurado el framework; SHA-256 idéntico al original.
- TypeScript y Debug con XcodeBuildMCP correctos. Verificación final con el
  DerivedData habitual de Xcode: `BUILD SUCCEEDED`, cero errores, simulador
  iPhone 17 Pro/iOS 26.5 arm64. Persisten avisos de dependencias; no se arrancó
  la app. Ver CONTEXTO.md para el diagnóstico.
- Sin cambios funcionales, migraciones, reinstalación de Pods ni actualización
  de versiones. El workspace correcto sigue siendo `ios/QuFalta.xcworkspace`.

## CE-1: plan v1.1, Supabase directo autorizado (2026-09-02)

- ÚLTIMO AVANCE CE-203 (2026-09-04): [selección y formulario](docs/comparator-strict/CE-203-progress.md).
  Paquete `ce203-owner-independent-review-v1`: 1.200/6.000 aleatorias (20 %)
  por familia × confirmatoria/reto y 175 disputas obligatorias; solape 39,
  total **1.336**, 54 lotes. Semilla derivada de entradas congeladas, no elegida
  por resultados. Libro `outputs/ce203-owner-review-v1/CE-203-revision-ciega.xlsx`
  con evidencia original y formulario de ocho dimensiones; omite etiquetas
  previas, predicciones, cohorte, disputa y selección. Propietario: `owner-01`;
  0/1.336 respuestas, 0 arbitrajes, 0 gold. CE-203/G2 abiertas; no seguir a
  CE-204/205 hasta revisión y confrontación. Sin red, Supabase, retailers,
  app/SQL/cron/syncs/embeddings, integración, despliegue, commit o push.
  Verificación integral: TypeScript, ESLint y **592/592 pruebas PASS**.

- ÚLTIMO AVANCE CE-201/202 (2026-09-03): [cierre y reanudación](docs/comparator-strict/CE-201-202-water-closure.md).
  CE-201 y CE-202 completadas como primera anotación: lote agua con 771 fuentes,
  2.485 composiciones y 2.483 parejas nuevas; unión **6.000/6.000**, cero
  pendientes. 410 rechazos, 595 exclusiones y 1.480 abstenciones en agua.
  Ocho fichas en disputa/68 parejas. Positivo íntegro: Aquarel botella 1,5 L
  Consum `2569879` ↔ Mercadona `27232`, mismo GTIN global `3700123300014`,
  conteo/volumen total/envase exactos y sin oposición. Sigue `abstain` comercial:
  precio, CP, stock y revisiones bilaterales no acreditados; cero ahorros/gold.
  CE-203 es lo siguiente: propietario revisa 20 % aleatorio + todas las disputas,
  en capa separada y ciega a propuestas. CE-204–208/G2 pendientes. CLI
  `prepare-comparator-strict-water-review.mjs`; salida completa fijada por hash,
  informe/manifiesto compactos. Sin Supabase/retailers, app, SQL, cron, syncs,
  embeddings, integraciones, despliegue, commit o push. No repetir CE-200–202.

- AVANCE ANTERIOR CE-201/202 (2026-09-03): [Carrefour y reanudación](docs/comparator-strict/CE-201-202-yogurt-carrefour-progress.md).
  Capa `label-yogurt-carrefour-v1`: 545 fichas nuevas (445 atributos/formato,
  100 por alcance); 431 previas byte-idénticas. Registradas las 976 observaciones
  del bloque yogur. 2.011 composiciones, **2.007 parejas nuevas**, cuatro
  solapes E05/E06/E07/E17. Unión **3.517/6.000**, pendientes **2.483 de agua**.
  1.001 rechazos, 169 exclusiones y 841 abstenciones propuestas en este lote;
  no revisión humana individual ni evaluación del motor. 281 fichas nuevas sin
  denominación/ingredientes; sell_pack_unit no demuestra conteo de envases.
  Ocho fichas nuevas en disputa; E07 fresa/macedonia cambia de rechazo propuesto
  a abstención y queda para arbitraje, ambas versiones intactas. Política local
  conservadora cacao/chocolate/stracciatella: relación desconocida, no positiva.
  108 formatos compatibles, cero positivos íntegros/gold/ahorros. CE-201/202
  abiertas; CE-203 del propietario 20% + disputas aún sin sortear ni realizar.
  35 tests nuevos, TypeScript/lint y **567/567 PASS**. CLI
  `prepare-comparator-strict-yogurt-carrefour.mjs`; anotaciones completas por
  stdout con hash, fichas/índice/dossier materializados. Capas anteriores intactas.
  Seguir con fuentes/parejas de agua en nueva capa, después positivos completos
  y revisión independiente. No repetir lectura de yogur salvo disputa concreta,
  ni CE-200/canarios; no saltar a producción del motor. Sin consultas al
  proyecto/retailers, cambios app/SQL/cron/syncs/embeddings ni integraciones.

- AVANCE ANTERIOR CE-201/202 (2026-09-03): [Plusfresc y reanudación](docs/comparator-strict/CE-201-202-yogurt-plusfresc-progress.md).
  Lote `label-yogurt-plusfresc-v1`: 219 fichas nuevas (207 atributos/formato,
  12 por alcance), reutilizando 212 anteriores sin cambios. 449 parejas
  compuestas: 271 rechazos, 23 exclusiones, 155 abstenciones propuestas.
  No revisión humana individual ni resultado del motor. Unión **1.510/6.000**;
  pendientes **4.490** (2.007 yogur / 2.483 agua). 25 formatos compatibles
  nuevos, cero equivalencias completas/ahorros/gold. CE-201/202 abiertas;
  CE-203 del propietario, 20 % + disputas, sin sortear ni realizar.
  Cuatro nuevas fichas en disputa; no elegir ganador entre 6/8 unidades,
  arándanos/frambuesa o azucarado/sin añadido. Cantidades sin papel, masa/volumen,
  sufijos logísticos y surtidos incompletos conservan incertidumbre.
  CLI `prepare-comparator-strict-yogurt-plusfresc.mjs`, capa editorial nueva
  con contrato de datos v1 reutilizado. 35 tests nuevos; `npm run quality`:
  TypeScript/lint y **532/532 PASS**. Fuentes/artefactos anteriores intactos.
  Seguir con 545 observaciones Carrefour sin ficha del bloque yogur; crear
  otra capa, no alterar anteriores. No repetir Mercadona/Consum/Plusfresc
  salvo disputa, ni CE-200/canarios. Sin consultas al proyecto/retailers,
  escrituras app/SQL/cron/syncs/embeddings, contrataciones o integraciones.

- AVANCE ANTERIOR CE-201/202 (2026-09-03): [punto de reanudación de yogur](docs/comparator-strict/CE-201-202-yogurt-progress.md).
  Nuevo lote `label-yogurt-v1`: 212 fichas registradas (72 Mercadona, 118 Consum,
  22 Carrefour), 133 parejas nuevas; 92 rechazos, 2 exclusiones y 39 abstenciones
  propuestas. Composición desde hechos revisados, no revisión humana individual.
  Acumulado **1.061/6.000**, pendientes **4.939**: 2.456 yogur y 2.483 agua.
  Cero positivos íntegros/gold/ahorros; 20 formatos compatibles no bastan.
  Azúcar añadido/total/edulcorantes independientes; cuatro fichas en disputa,
  títulos 0% ambiguos sin completar, soja no implica vegetal, surtido no es mezcla.
  CE-201/202 EN CURSO; segunda revisión CE-203 del propietario no realizada.
  35 pruebas nuevas, `npm run quality`: TypeScript/lint y **497/497 PASS**.
  No consultas al proyecto ni cambios en producción; artefactos anteriores
  verificados byte a byte. Contadores históricos; el lote Plusfresc y el
  pendiente actual figuran arriba. No reescribir v1 ni repetir CE-200.
  Lectura preliminar sin hechos registrados no cuenta como anotación.

- AVANCE ANTERIOR CE-201/202 (2026-09-03): [patatas](docs/comparator-strict/CE-201-202-potatoes-progress.md).
  Nuevo lote `label-potatoes-v1`: 146 fuentes revisadas, 922 primeras anotaciones
  compuestas por reutilización de esos hechos exactos. No revisión humana
  individual; 93 confusores revisados por alcance y 53 congelados por atributos/formato.
  319 rechazos propuestos / 104 exclusiones / 499 abstenciones. E09 se solapa
  y mantiene estados: unión acumulada 928 parejas, pendientes 5.072 (yogur 2.589,
  agua 2.483). CE-201/202 EN CURSO, cero positivos íntegros/gold/CE-203/G2.
  Revisar después yogures y aguas; segunda revisión 20 % + disputas del propietario
  todavía pendiente. No promover propuestas por pasar tests ni fabricar positivos.
  CLI offline `scripts/prepare-comparator-strict-potato-review.mjs`; especificaciones
  editoriales, citas originales y hashes congelados. 28 pruebas nuevas;
  `npm run quality`: TypeScript/lint y **462/462 PASS**. No tocar artefactos v1: sus hashes
  siguen comprobándose, incluidos sus informes históricos de 5.993 pendientes.
  Diferenciar rebozado explícito/ausente/desconocido, corte/forma/grosor, puré
  moldeado, patatas Bravas refrigeradas/congeladas y papel unidad/total. No
  normalizar automáticamente «gueso», rústico o grandes a corte grueso.
  Sin app, SQL, cron, syncs, integraciones, nuevas contrataciones o consultas al
  proyecto. No repetir extracción/canarios ni usar esta anotación como motor F3.

- ACTUALIZACIÓN VIGENTE 2026-09-03, plan v1.2: **CE-200 completada**.
  [Acta y siguientes tareas](docs/comparator-strict/CE-200-closure.md);
  corpus-v1: 4.176 productos, 5.189 observaciones de ubicación, 6.000 parejas
  únicas y 1.200 Q de 600 orígenes. Descarga y segunda lectura de huellas coinciden.
  Muestreo/alias/exposición/pesos/hashes congelados. No hay gold, particiones ni
  holdout; seguir CE-201/202 con este corpus y luego CE-203–208, sin saltar G2.
  CE-BU-002 revoca el límite acumulado SQL y autoriza 128 MiB / 50.000 filas
  para este corpus. Migración privada **20260903101356** aplicada; counters
  conservados, 119 jobs correctos/1 reconciliado, 0 pendientes/controles/principals.
  Reserva final: 1.518.920 ms, 108.246.478 bytes, 34.177 lecturas, 399 escrituras
  técnicas; transporte extraído 16,59 MiB. No nuevas contrataciones ni cambios
  de app/legacy/cron/catálogo/compute. No volver a adquirir ni repetir canarios.
  Dos incidencias resueltas: censo agregado cancelado y microsegundo de diferencia
  entre relojes de lease; protocolo v3 correcto. Archivo de guarda F1 original
  conservado por su SHA-256; sucesor sin techo acumulado probado por separado.
  TypeScript/lint y **404/404 tests PASS**, más 14 comprobaciones PGlite del lector.
  No baseline de rendimiento completo. Las notas inferiores «no más carga hoy»,
  CE-200 abierta/sin consultas y límite 300.000 ms describen el estado anterior.

- NUEVA AUTORIDAD 2026-09-03, CE-SEQ-003: «Cierra CE-100 y continua con el resto
  de tareas». [Cierre administrativo](docs/comparator-strict/CE-100-owner-closure.md)
  con limitaciones aceptadas, sin PASS ficticio. Continuar CE-103–106, no saltar
  permisos, presupuesto, reversión o validación real. G1 verificado en el acta
  siguiente; sin contratación/ampliación de recursos. CE-100 abierta en notas
  inferiores es histórico.

- ESTADO ACTUAL 2026-09-03: CE-100 cerrada por el propietario;
  **CE-103–106 completadas; F1/G1 PASS acotado al canario privado**.
  [Acta y siguiente paso](docs/comparator-strict/CE-105-106-closure.md).
  Base privada `20260903080621` + recibos duraderos `20260903084621` aplicados.
  Ejecutor atómico probado: reserva persistida, control y reversión confirmados
  mediante transacciones completas por llamada, sin asumir sesión MCP estable.
  Cero controles/identidades/trabajos pendientes; cuatro trabajos de auditoría
  y una reserva diaria. No borrar pruebas ni repetir planes históricos.
  16 grupos PG17.6 nativo PASS (concurrencia, cancelación, SIGKILL local);
  `npm run quality`: TypeScript/lint y 353/353 tests PASS.
  servidor temporal detenido. CI manual configurada/no ejecutada en GitHub.
  El TTY truncaba JSON: corregido con entrada raw. Intento caducado reconciliado,
  sin payload ni devolución de su reserva de 6 s; nuevos jobs limitados por
  PostgreSQL a 2 s/transacción y 4 s reservados por trabajo.
  Reserva diaria: 22.623.694/23.068.672 bytes y 299.920/300.000 ms; 4.128
  lecturas, 35 escrituras técnicas. No nueva carga remota CE-1 hoy.
  CE-200/F2 iniciado localmente según la nota siguiente; CE-100 sigue sin baseline de rendimiento
  completo. Ningún cambio de app/legacy, grants globales, cron ni activación.
  Las notas inferiores «G1 pendiente/sin escrituras» son históricas. No aplicar
  migraciones locales por arrastre ni reutilizar autorizaciones caducadas.

- CE-200 EN CURSO (2026-09-03): [punto exacto de reanudación](docs/comparator-strict/CE-200-dataset.md).
  Solo preparación local: diseño de muestreo, CLI offline, semilla y hashes.
  72 referencias CE-104 → 648 parejas sin dirección duplicada, 144 Q/432 R;
  sin etiquetas, evidencia confirmatoria o holdout. Los 400 casos legacy están
  duplicados byte a byte en dos CSV; no sumarlos como 800 ni heredar etiquetas.
  Índice de 683 referencias previamente expuestas; 335 son de tiendas del
  piloto, no necesariamente sus tres familias. Corpus completo aún pendiente.
  14 nuevos tests; `npm run quality` 367/367, TypeScript y lint PASS.
  No más consultas a Supabase por el presupuesto documentado de 299.920 ms.
  Siguiente: operación nueva de lectura/censo paginado, con ref/salud/permisos y
  presupuesto revalidados; congelar diseño antes de nuevas etiquetas. No usar
  las excepciones F1 para importar corpus, ejecutar scripts legacy o llamar a
  retailers/OFF. Estado CE-201/202 actualizado en la nota siguiente; G2 no
  aceptado, nada programado.

- CE-201/202 EN CURSO (2026-09-03), petición «continua con las tareas»:
  [reanudación exacta](docs/comparator-strict/CE-201-202-progress.md) y
  [guía ce202-v1](docs/comparator-strict/CE-202-labeling-guide.md).
  CLI `scripts/prepare-comparator-strict-labels.mjs`, ocho dimensiones con
  citas ligadas a observación/hash, 22 propuestas reales (9 fuera de piloto,
  8 incompatibilidades, 5 abstenciones), ninguna gold ni revisada por propietario.
  56 sintéticos: 32 F1 reutilizados sin reescribirlos + 24 ampliaciones.
  Aclarados natural/azúcar y GTIN/formato contradictorio; no heredar predicciones.
  Semilla CE-200 intacta; anotaciones en `dataset/label-pilot-v1/` separadas.
  Cero nuevas consultas remotas, cambios de app/BD/cron/cuotas o dependencias.
  No cerrar CE-201/202: falta corpus completo y etiquetado respaldado; no marcar
  CE-203 hecha por haber generado un lote. CE-204–208 pendientes; el validador
  no es un matcher ni un harness de métricas. Siguiente avance local posible:
  CE-206/207; adquisición CE-200 requiere presupuesto/ref/salud/permisos revisados.
  Validación: 22/22 tests nuevos, `npm run quality` 389/389 PASS con TypeScript/lint.

- Punto de reanudación: [PROYECTO-COMPARADOR-ESTRICTO.md](PROYECTO-COMPARADOR-ESTRICTO.md).
  Evidencia y ejemplos: [COMPARADOR-ESTRICTO.md](COMPARADOR-ESTRICTO.md).
- El usuario ha autorizado trabajar en el Supabase actual, incluida producción:
  decisión CE-ENV-001 del plan. Se retira el backend separado obligatorio y la
  espera hasta F8 para aplicar cambios de BD; se mantienen fases y controles.
- CE-000 completada tras actualizar la política: ver
  [docs/comparator-strict/F0-baseline.md](docs/comparator-strict/F0-baseline.md).
  HEAD `03b8ba273e17709fd8fc69c20dddb68c147a7e2a`, rama
  `codex/phase5-observation`; cambios previos preservados. Estado actual:
  F0 ACEPTADA / G0 PASS; F1 COMPLETADA / G1 PASS acotado, CE-100 cerrada
  por el propietario con limitaciones.
  CE-001 completada en solo lectura: ver
  [docs/comparator-strict/CE-001-supabase-inventory.md](docs/comparator-strict/CE-001-supabase-inventory.md)
  y su JSON de evidencia. CE-002 completada: ver
  [docs/comparator-strict/CE-002-independent-review.md](docs/comparator-strict/CE-002-independent-review.md).
  CE-003 completada: [decisions.md](docs/comparator-strict/decisions.md)
  consolida D01–D14, piloto, cuarentenas, estados y cuota. El usuario revoca la
  propuesta anterior de CU-01: debe haber al menos un equivalente válido.
  En la lista principal de CE-1 esto exige una alternativa válida más económica
  incluida en la respuesta final correcta, no un candidato evaluado internamente.
  Sin ahorro válido ofrecido, cero usos. Tres usos por cuenta y Plus se conservan.
  CE-004 completada: [budget.md](docs/comparator-strict/budget.md),
  [source-zone-matrix.md](docs/comparator-strict/source-zone-matrix.md) y
  [CE-004-evidence.json](docs/comparator-strict/CE-004-evidence.json).
  RV-01 confirmada: el usuario se encargará de la segunda revisión (20 % aleatorio
  y todos los casos discutidos); preparar lotes con evidencia en F2, sin dar la
  revisión por realizada ni fijar horas. SC-01/BU-01 confirmadas con «si exacto,
  eso es» ante la pregunta expresa sobre alcance y límites. CE-005 COMPLETADA:
  [vigencia](docs/comparator-strict/freshness-policy.md) y
  [aceptación](docs/comparator-strict/acceptance.md) ratificadas. FR-01 descartada,
  FR-02 confirmada (catálogo activo, sin TTL de 24 h); QA-01 y G0 aceptados con
  «cierra CE-005 y empieza CE-100». No pedir de nuevo estas aprobaciones ni
  dar por alcanzadas las métricas del motor todavía no implementado.
- Resultado CE-002: no adoptar los parches tal cual en CE-1. El guard propuesto
  sigue pasando diferencias de pack, cantidad y endulzado en sondas aisladas;
  no son resultados finales del comparador. Separar HNSW del 0,59 y del UPDATE
  de todas las generaciones; seguimiento CE-602/606/608/609.
- Modal: conservar error/reintento; resolver la ficha anterior que reaparece al
  reabrir mientras carga y la pérdida de procedencia del fallback global.
  Hay una segunda petición global incluso tras cerrar si el fetch local da null.
  Sonda lógica con hooks/red simulados, no dispositivo. Seguimiento CE-703/706.
  `npm run quality`: 213/213; los cinco tests focalizados solo inspeccionan texto.
- Destino confirmado: `auth.quefalta.es` → `gkffvigcnsesbaihycay`; sin ramas
  remotas. v7 es la RPC del cliente y reclama cuota antes de devolver resultados;
  no invocarla como simple comprobación de lectura.
- El timeout `20260901203103` ya está aplicado; la función tiene 60 s.
  HNSW `20260902122234` sigue pendiente. Ledger remoto: 80 entradas; locales:
  163 SQL. Hay 51 correspondencias de nombre con versión distinta/legacy y dos
  entradas remotas sin archivo homónimo. Reconciliar contenido en CE-103, sin
  `db push` por arrastre ni reparación automática de historial.
- Captura 2026-09-02 19:18 UTC: pipeline pausado, cron 17 inactivo y 20 mensajes
  visibles (19 Gadis + 1 Ahorramás). Índice sano y dead tuples estimadas 4,222 %.
  No se procesaron colas ni se corrigieron runs antiguos; seguimiento operativo
  independiente. Revalidar estado mutable antes de una escritura posterior.
- Syncs mayoritariamente semanales/manuales: 15/20 estados globales tienen más
  de 24 h, sin afirmar vigencia por producto. FR-02 no excluye por esa edad; el scheduler
  Windows de Carrefour solo consta documentado, no verificado en esa máquina.
  GitHub main tiene timeout DIA de 45 min y el checkout 60 min; no se publicó.
- Igualdad nominal exacta (sin tolerancia genérica del 0,5 %), estructura de
  pack y variantes verificadas. «Natural» no prueba ausencia de azúcar;
  «yogur griego»/«griego yogur» pueden ser equivalentes si lo demás coincide.
- OFF nutricional ya existe y su `off_code` puede ser de una unidad, no del
  pack vendido. No convertirlo en identidad comercial sin evidencia.
- Hasta CE-101 solo documentación; CE-102/103 añaden herramientas Node locales
  y tests, sin modificar la app. CE-103 ya aplica una base privada inactiva;
  sin nuevas extensiones, ramas remotas ni syncs. Mantener separados el HNSW pendiente,
  la resiliencia del modal y las fases operativas del pipeline existentes.
- CE-003 no hace consultas remotas ni cambia contadores. Define cuota cero por
  error, pending, falta de alternativas válidas más económicas o reintento de
  la misma petición. Exige formato/variante y precio/zona/fecha válidos antes
  de contar resultados finales. Una respuesta de red perdida se recupera
  por idempotencia, sin asumir que el servidor revirtió su transacción.
- CE-004 fija Mercadona/Carrefour/Consum/Plusfresc, CP de referencia 08006 y
  25001, sin nuevas contrataciones/ampliaciones y con trabajo remoto secuencial.
  Son candidatas a evaluar, no cuatro fuentes habilitadas: Consum devuelve zona
  desconocida para 25001, Carrefour muestrea 08001 para Catalunya y Mercadona
  prioriza mad1 en el espejo. No heredar esos precios como locales sin prueba.
  Plusfresc mapea 08006→3 y 25001→12 en el código; revalidar antes de activar.
  Tres muestras locales de 200 filas tienen ~31 h; no son equivalentes ni una
  estimación de calidad. FR-02 no las excluye por edad ni rejuvenece sus fechas.
- Lecturas CE-004: proyecto/plan Pro, metadatos e índices, 25 conexiones y cero
  activas/locks/idle-in-transaction en dos instantes. No prueba capacidad libre
  ni compute efectivo; no se han verificado factura, margen ni CPU/I/O.
  Cinco intentos SQL READ ONLY (uno con error sintáctico corregido), sin writes,
  consultas de usuarios, llamadas a retailers, cambios de cron o embeddings.
  CE-004 cerrada documentalmente; después CE-005 y G0 quedan aceptados.
- CE-005 / FR-02 confirmada: catálogo activo tras sync, sin TTL comercial de
  24 h ni otro plazo fijo sustituto. Se descarta FR-01 por petición del usuario.
  Cambios semánticos reconcilian perfil/vector; precio/stock recalculan ahorro
  sin generar un vector idéntico. Invalidar también vacíos ante altas/bajadas,
  cambios de origen/destino y bajas antes de que termine el worker. Respetar
  promociones vencidas y detectar versiones mezcladas/fallos de sync; no
  declarar tiempo real ni completar un sync por el mero final de la descarga.
  35/35 tests existentes de identidad/reconciliación pasan; no prueban recálculo
  comercial CE-1. [CE-005-evidence.json](docs/comparator-strict/CE-005-evidence.json)
  conserva cálculos y 16 escenarios del TTL anterior como historial descartado.
  CU-01 y presupuesto intactos; sin cambios de código, Supabase o integraciones.
  QA-01 (precisión ≥99,5 %, utilidad, latencia) y G0 aceptados por el propietario
  al ordenar cerrar CE-005. Se aprueba el contrato, no resultados medidos.
- CE-100 iniciada, todavía EN CURSO: [informe](docs/comparator-strict/CE-100-readiness.md)
  y [JSON](docs/comparator-strict/CE-100-evidence.json). Reconfirmado proyecto
  `gkffvigcnsesbaihycay`, Pro, eu-west-1, PostgreSQL 17.6. Cuatro lecturas SQL
  con READ ONLY, timeout 5 s y lock_timeout 500 ms; cero errores SQL,
  escrituras, RPC comerciales, nuevas instalaciones o cambios de cron.
  Muestras de actividad sin locks/idle-in-transaction; no baseline de 15 min.
  `postgres` tiene BYPASSRLS; grants/políticas no sustituyen pruebas de cliente.
  Pipeline pausado y cron 17 inactivo en captura de 21:27 UTC. No contar como
  relectura de los 20 mensajes históricos: la cola no se ha consultado aquí.
  Acceso al panel resuelto: diez copias PHYSICAL, última 2026-09-02 08:00:12 UTC;
  PITR no activado. Ninguna restauración ensayada. Compute MICRO/t4g.micro,
  1 GB, no Medium; la UI de consumo registra 309 h Micro y 2 h Medium sin
  explicar el cambio. No se modificó tamaño. Cuotas Pro no superadas, spend
  cap habilitado. Ventana de métricas de 30 min incompleta: fallan siete
  gráficos de I/O/red/disco/conexiones tras un reintento; alternativa de
  conexiones pide preview que no se activó. Completar baseline de al menos
  15 min antes de cerrar CE-100/permitir carga. Actualización CE-SEQ-001:
  el usuario autoriza expresamente empezar CE-101 dejando CE-100 pendiente.
- Revisión CE-100 del 2026-09-03: [nueva evidencia](docs/comparator-strict/CE-100-capacity-recheck.md).
  Se recupera la lectura de CPU/memoria/I/O/conexiones por Metrics API, usando
  la credencial local existente sin exponerla ni crear otra. Observador puntual,
  analizador y 7 tests locales; quality 308/308. Sin servicios nuevos ni cambios
  de app/BD. Sigue pendiente una ventana comparable de p95/errores/locks del
  catálogo: medias y logs incompletos no permiten cerrar CE-100 ni escribir.
- CE-100, prueba ejecutada el 2026-09-03: [resultados y continuación](docs/comparator-strict/CE-100-catalog-probe-results.md).
  61/61 lecturas válidas más una previa, p95 3,49 s; 18/14/18 muestras por
  tramo de 5 min (<20). La coordinación serializada del conector no mantuvo
  densidad: no cerrar CE-100 ni cambiar umbrales para aprobarla. Corregir
  instrumentación local y desglosar latencia antes de otra ventana.
  Cuota incluida 3,901/250 GB verificada; permiso condicionado a no añadir
  coste, excepción a 22 MiB solo hoy y lock HTTP existente sin ALTER ROLE.
  Contabilidad 20,94/22 MiB; quedan 1.108.530 bytes, insuficientes para repetir.
  Todos los procesos terminaron; manifiesto deshabilitado, ninguna búsqueda
  comercial ni escritura. CE-100 abierta, CE-103 en curso, G1 no aceptado.
- CE-101 COMPLETADA: [inventario](docs/comparator-strict/CE-101-services-inventory.md)
  y [JSON](docs/comparator-strict/CE-101-evidence.json), documentados 2026-09-03.
  Tres SQL READ ONLY, cero errores; HEAD local y GET Auth/settings 200 con ref
  correcta. Siete Edge ACTIVE, dos buckets públicos, Data API public/graphql_public
  y autoexposición de tablas ON. Cron 18 de alertas activo cada 15 min; cron 17 y
  embeddings siguen pausados. No sembrar fixtures en catálogos reales. Auth sin
  Hooks; Site URL localhost y comodines Expo existentes, sin cambiar configuración.
  Cuenta habitual elegida `@rruizosma`, una coincidencia de perfil; no se leyó UID
  ni se verificó token. [Manifiesto](docs/comparator-strict/CE-101-test-access.json)
  documental `enabled=false`, sin runtime ni concesión de permisos. CE-VAL-001:
  el propietario confirma catálogo en su móvil, producción 1.3. Se corrige la
  exigencia prematura de build de desarrollo; no es prueba de código no publicado.
  No invocar comparador comercial como smoke. Sin cambios
  de servicios globales, cuentas, cuota, notificaciones o activación del motor.
  La excepción de secuencia no cierra CE-100/G1 ni autoriza CE-102 por arrastre.
- CE-SEQ-002 (2026-09-03) añade autorización expresa condicionada: al terminar
  CE-101 empezar CE-102; si sus guardas y tests son correctos, empezar CE-103.
  Secuencia cumplida tras CE-VAL-001. No se ha arrancado/instalado ninguna app.
  Los scripts legacy de importación/materialización escriben salvo DRY_RUN:
  no ejecutarlos como smoke ni suponer que las guardas nuevas ya los protegen.
- CE-102 COMPLETADA como componente local: [informe](docs/comparator-strict/CE-102-execution-guards.md).
  Guardas ejecutables de ref/origen, apply explícito, hash, objetos/filas,
  recursos, capacidad, COMMIT/rollback y resultado incierto; preflight offline.
  Sin transporte/coordinador remoto, ejecución rechazada. Los tests con dobles
  pasan; falta integración transaccional y presupuesto duradero real en
  CE-103/105/106. No confundir con RLS o protección de todas las vías administrativas.
- CE-103 EN CURSO: [informe](docs/comparator-strict/CE-103-migration-readiness.md),
  [evidencia](docs/comparator-strict/CE-103-evidence.json) y reconciliador reproducible.
  Tres SQL READ ONLY, cero errores/escrituras: 80 remotas/163 locales; 50 huellas
  textuales correlacionadas, 28 diferencias no resueltas, 2 remotas sin candidato.
  85 locales sin asociación no autorizan db push. Esquema comparator_strict
  ausente; propuesta de base/coordinador, sin SQL nuevo de despliegue. Finalizadora
  sigue a 60 s; HNSW pendiente; pipeline paused/cron 17 off/18 on. Mantener CE-100
  abierta: baseline antes de escrituras. Próximo: continuar reconciliación CE-103
  y diseño local del bootstrap/adaptadores; no iniciar CE-104 por arrastre.
- F1 prepara operación segura en la BD compartida: project ref, alcance,
  permisos, límites, canario y reversión. La autorización incluye cambios
  ordinarios de CE-1; no se vuelve a pedir por el mero destino productivo.
- F8 exige aprobación de activación para usuarios, no de acceso a Supabase.
  Costes nuevos no acordados y operaciones destructivas/masivas siguen separados.
  La retirada segura apaga CE-1 y detiene sus jobs, sin sustituirlos por
  resultados legacy presentados como estrictos.

## Radar sin resultados de Bonpreu/bonÀrea (local; despliegue pendiente, 2026-09-02)

- Reproducción productiva: Mercadona `31504` («Huevos grandes L») dejó estado
  de caché para Bonpreu y bonÀrea pero 0 matches; Carrefour devolvió 2. Los
  espejos no tienen huecos: Bonpreu 21.079/21.079 y bonÀrea 3.145/3.145
  productos publicados con embedding vigente, y casi todos tienen precio.
- El HNSW de ~201k filas se detenía antes de superar el filtro por tienda. La
  prueba de sesión con `hnsw.iterative_scan = relaxed_order` recuperó 20
  candidatos por destino y encontró «Huevos L rubio estuchado» en bonÀrea.
  Bonpreu tenía un segundo fallo: el prefijo `BONPREU` impedía reconocer la
  familia anclada `eggs`, y el match L/XL quedaba 0,5936, justo bajo 0,60.
- Preparada
  `20260902122234_fix_comparator_filtered_hnsw_recall.sql`: ajuste HNSW solo en
  la función, familia de identidad con marca propia normalizada, separación de
  codorniz/cocido, margen 0,59 condicionado a familia+identidad e invalidación
  perezosa de generaciones. Añadidos test estático y smoke SQL con `ROLLBACK`.
- Validación local: test focalizado 3/3, `npx tsc --noEmit` y `git diff --check`
  correctos. **No desplegada; CE-002 no aprueba el paquete para CE-1.** El UPDATE
  afecta a todas las generaciones existentes, no tiene un límite de 18 tiendas.
  CE-ENV-001 autoriza el destino productivo, pero no sustituye separación de
  cambios, pruebas y reversión. No ejecutar este smoke por arrastre en F0:
  escribe caché dentro de una transacción, aunque termine en ROLLBACK.

## Fichas del Radar de ahorro estables (local, 2026-09-02)

- `SimilarProductsSection` activa un fallback global controlado al abrir un
  resultado. Soluciona las filas de Carrefour, Consum, Dia o Plusfresc que el
  RPC devuelve desde el catálogo global pero cuyo detalle se filtraba después
  por la región/centro del perfil y respondía `null`.
- `StoreProductModal` ya no ejecuta `onClose()` ante `null` o error. Mantiene la
  hoja con un estado de error y botón «Reintentar»; las respuestas asíncronas se
  asocian a una clave de producto+ubicación+idioma+intento para no reutilizar un
  detalle anterior. El resto de aperturas continúa respetando la ubicación.
- Regresión en `scripts/tests/store-product-modal-resilience.test.mjs`.
  `npm run quality`: TypeScript, ESLint y 210/210 pruebas correctos.

## Fase 5A desplegada; observación de dos ciclos pendiente (2026-09-01)

- Producción tiene
  `20260901115631_catalog_embedding_postgres_maintenance_baseline.sql`:
  `catalog_product_embeddings` usa autovacuum 0,05 y autoanalyze 0,02 por
  tabla. No se ejecutó vacuum, reindex ni una reescritura del snapshot.
- La RPC `catalog_embedding_maintenance_status()` solo admite `service_role` y
  marca `requiresAttention` con >= 5 % de tuplas muertas o HNSW no
  válido/listo/vivo. El smoke productivo con rollback devolvió
  `PHASE_FIVE_MAINTENANCE_BASELINE_OK`.
- El cambio disparó únicamente un autoanalyze corto: 201.442 vivas, 1.208
  muertas (0,596 %), `n_mod_since_analyze = 0`, umbral de vacuum estimado
  10.123 y HNSW sano de 597.745.664 bytes. Cero locks, vacuum o mantenimiento
  de índice activo; pipeline `paused`, presupuesto 0 y cron 17 inactivo.
- Alerta diaria definida en
  `.github/workflows/catalog-embedding-maintenance.yml`, con script y cinco
  pruebas; GitHub la ejecuta desde `main`. Detecta 5 %, deriva de reloptions e
  índice degradado.
- Pendiente de Fase 5: mantener Medium y observar dos ciclos completos
  posteriores al baseline; ejecutar un A/B de `hnsw.iterative_scan` off frente
  a `relaxed_order`. pgvector 0.8.0 acepta la opción, pero sigue desactivada. No
  hacer `REINDEX` salvo bloat/degradación demostrados, con dispatcher pausado y
  ventana de mantenimiento.
  Nota posterior CE-100 (2026-09-02): compute Micro verificado en panel; no se
  modificó. «Mantener Medium» describe el plan histórico, no el tamaño actual
  ni una autorización para restaurarlo. Revalidar la capacidad del experimento.
- Tras el canario 2716, la cadena secuencial 2718–2746 drenó los 2.846 trabajos
  restantes en 29 ejecuciones (28×100 + 46): HTTP 200, 2.846/2.846 `completed`
  y 0 failed/stale/deferred. Cola vacía y cero en vuelo. HiperDino, Gadis y
  Ahorramás quedaron `settled`, con un solo bump por tienda y generaciones
  6.907, 37.485 y 18.079. Pipeline `paused`, cron 17 inactivo. HNSW sano y
  estable; tuplas muertas 4.154 (2,020 %), 2.946 cambios desde analyze, sin
  vacuum, bloqueos ni fallos. Este drenaje no cuenta como ciclo completo de
  sync para la observación 0/2.
- Después de los syncs posteriores se drenaron otros 2.131 trabajos. La primera
  petición (2778) se detuvo sin escrituras: el primer sublote de 20 agotó el
  `statement_timeout` de 8 s heredado por PostgREST y dejó los 100 mensajes
  diferidos hasta vencer su visibility timeout. Se desplegó
  `20260901203103_extend_embedding_finalize_statement_timeout.sql`, que fija
  60 s únicamente para `catalog_finalize_embedding_batch(jsonb)`.
- Reanudación 2780–2801: 22 ejecuciones (21×100 + 31), 2.131/2.131
  `completed`, 0 failed/stale/deferred y cero HTTP no-200. Once runs actuales
  quedaron `settled`, cada uno con un único bump de generación. Postflight:
  cola y vuelo 0, pipeline `paused`, cron 17 inactivo, HNSW sano/estable,
  8.901 tuplas muertas (4,202 %), autoanalyze completado, y cero vacuum,
  mantenimiento de índice, locks o fallos abiertos.

## Fase 4 desplegada; backlog legacy adoptado (2026-09-01)

- Producción tiene las migraciones `20260901103216` (runs durables +
  invalidación set-based), `20260901104518` (compatibilidad temporal del
  materializador legacy) y `20260901104730` (revalidación única al cerrar el
  manifiesto). Los triggers row-level de caché ya no existen.
- La fuente modificada se invalida individualmente mediante un `DELETE ...
  USING` por sentencia. La tienda destino incrementa generación una vez al
  cerrar o fallar el run; escrituras ajenas a runs conservan un fallback de una
  vez por tienda/sentencia. Locks en orden run→versión, sin `SKIP LOCKED`.
- Canario productivo 2705: 100 completados, 0 failed/stale/deferred/dispatched.
  Run `8d5406cc-9b7f-4eae-a61c-615538d2bb6b` quedó `settled` con 100 dependencias
  `completed`; HiperDino subió 6.905→6.906 exactamente una vez y la cola quedó
  sin jobs en vuelo. Ambos smokes SQL productivos pasaron con rollback.
- La compatibilidad temporal solo auto-adopta jobs legacy de la misma tienda con
  `enqueued_at >= started_at` cuando su conteo coincide exactamente con
  `expected_embedding_jobs`; no adivina manifests ambiguos. El materializador
  nuevo registra M2M en chunks de 500 y revalida una sola vez en el último
  bloque. El PR #49 ya está fusionado en `main` como `b8cf096`; retirar la
  compatibilidad solo después de dos ciclos completos verificados.
- Gadis: 38 jobs legacy asociados al run
  `1dda9168-c609-48d9-9221-7caff07368c4`, actualmente `draining`. Tras
  autorización explícita, los 3.201 jobs legacy de HiperDino se asociaron al
  run `fae4f61b-4187-4488-9d8b-4deb55fdd058` en siete bloques de 500/201. El
  preflight confirmó 3.201 identidades únicas, publicadas, vigentes y realmente
  pendientes; el fallback `coalesce(embedding_input_hash, content_hash)` cubre
  sus filas legacy. La verificación posterior dio 0 diferencias cola↔manifiesto,
  3.201 enlaces `pending/queued` y generación HiperDino todavía en 6.906.
- Drenajes canarios 2709, 2710, 2712 y 2716: cuatro peticiones FIFO con 400/400
  `completed`. A continuación, la cadena 2718–2746 procesó la cola restante:
  29 ejecuciones, 2.846/2.846 `completed` y 0 failed/stale/deferred. Los runs
  durables de HiperDino (3.201), Gadis (38) y Ahorramás (7) quedaron `settled`
  con todas sus dependencias completadas y un único bump al cierre.
- Estado operativo: pipeline `paused`, cron 17 inactivo, 0 trabajos en vuelo,
  fallos, bloqueos o vacuum; cola vacía, HNSW válido/listo y 2,020 % de tuplas
  muertas. Mantener la observación de dos ciclos completos de sync antes de
  decidir si se activa el dispatcher automático. Después queda implementar
  stale-while-revalidate en segundo plano.

## Fase 3 HNSW desplegada y canario sano (2026-09-01)

- Nueva migración
  `20260901094105_phase_three_single_hnsw_mutation.sql`: añade
  `embedded_content_hash` sin backfill, conserva el vector anterior al cambiar
  el input y usa la desigualdad de hashes como estado pendiente.
- `catalog-embed` lee el hash embebido y no descarta como listo un vector
  pendiente. `catalog_finalize_embedding_batch` escribe el vector nuevo y su
  hash en una única sentencia CAS; un job cuyo hash/contenido/versión ya no son
  actuales queda `stale` sin sobrescribir la fila.
- Todas las rutas de candidatos y caché vigentes filtran fuentes y destinos por
  hash. El materializador también detecta y repara filas con vector/modelo pero
  hash desfasado; las filas legacy con hash embebido `NULL` siguen listas hasta
  su primer cambio real.
- Migración aplicada con versión remota/local `20260901094105`; el smoke SQL
  con `ROLLBACK` pasó sin residuos. `catalog-embed` v13 está `ACTIVE` y coincide
  exactamente con el bundle local. El smoke HTTP autenticado 2700 respondió
  400 `invalid_batch_size` sin reclamar ningún trabajo.
- Canario 2701: HTTP 200, 100 completados y 0 failed/stale/deferred/dispatched.
  Las 100 filas escribieron el vector y su hash juntos; hay 0 hashes explícitos
  desfasados o sin vector. Cola 3.401→3.301, HiperDino 11.419→11.519 listos, 0
  fallos, duplicados, trabajos en vuelo, bloqueos o vacuum; HNSW válido/listo.
- Estado operativo final: `paused`, presupuesto 0 y cron 17 inactivo. No pasar
  a `active`: el trigger row-level aún elevó la generación de HiperDino
  6.805→6.905 durante el lote. La Fase 4 debe reemplazar ese fan-out por un
  único cierre e invalidación por run antes del drenaje continuo.

## Hardening batch anterior, canarios sanos (2026-09-01)

- Producción conserva `embedding_worker_phase_three_batch_writes` (versión
  remota `20260901072452`); su worker v12 fue reemplazado por v13 al desplegar
  la Fase 3 HNSW. El contrato usa OpenAI 50 y
  escritura 20; `catalog_finalize_embedding_batch` admite hasta 25, ejecuta
  `UPDATE ... FROM jsonb_to_recordset`, revalida con CAS y confirma PGMQ en la
  misma transacción. Fallos agrupados y aislamiento acotado de poison rows.
- Smoke transaccional bajo `service_role` correcto, incluidos multi-write,
  multi-failure, archive terminal, hash/versión/publicación concurrentes,
  identidad incorrecta y rollback por vector inválido. Cero productos, jobs,
  fallos o archivos sintéticos persistidos. Advisors sin hallazgos nuevos
  relacionados con la fase.
- Canario 2688 con tamaño 25: HTTP 200, 100 completados, 0 failed/stale/deferred,
  cuatro RPC, máximo SQL 6,91 s; se redujo por margen frente a 8 s. Canario 2690
  con tamaño 20: HTTP 200, 100 completados, 0 failed/stale/deferred, seis RPC,
  ~15,7 s total y ~12,34 s SQL; 0 locks, consultas largas o vacuum. La cola bajó
  3.601→3.401 y HiperDino quedó en 11.419 listos.
- Estado operativo final: `paused`, cron 17 inactivo, 3.401 visibles, 0 en
  vuelo, duplicados y fallos abiertos. No habilitar `active`: aún puede abrir
  tres workers y el trigger row-level de caché actualiza la generación una vez
  por vector. Antes del drenaje continuo implementar invalidación set-based por
  sentencia/run; mientras tanto, no solapar sync y canario. Este hardening
  reduce las llamadas REST (100→6 por request); la Fase 3 HNSW posterior sigue
  pendiente de desplegar.

## Fase 1 de embeddings desplegada y pipeline pausado (2026-09-01)

- Producción tiene aplicada
  `embedding_materializer_phase_one_idempotency` y `catalog-embed` v10 ACTIVE.
  El PR #48 está fusionado en `main` (`11e2c2c`). Estado operativo: control
  `paused`, cron 17 inactivo, 3.601 jobs visibles de
  HiperDino, 0 en vuelo, 0 duplicados y 0 filas sintéticas del smoke.
- La migración añadió, sin backfill, `embedding_input_hash`,
  `semantic_identity_hash`, `match_metadata_hash` y `category_family`; el
  índice único de PGMQ y las RPC de reparación/eliminación/supresión están
  desplegados y solo `service_role` puede ejecutarlos.
- Validación productiva: smoke transaccional A→B→A/legacy/terminal correcto;
  Gadis tuvo `DRY_RUN` + dos runs reales consecutivos con 0 upserts, 0
  despublicaciones y 0 jobs. Runs auditados:
  `1aa1d547-31f0-41c5-94fc-47e7a640770f` y
  `aae8add6-64a4-40cc-9ed4-79420d2ffd78`.
- Dos canarios productivos ejecutados manualmente con el cron siempre apagado:
  request 2682 procesó los jobs 239803..239902 y request 2684 los
  239903..240002, todos de HiperDino. Ambos devolvieron HTTP 200,
  `completed=100`, `failed=0`, `stale=0`, `dispatched=0`; cola 3.801→3.601,
  11.219 vectores HiperDino listos y generación de caché 6.605. La comprobación
  estabilizada dejó 0 invisibles, fallos, duplicados, bloqueos, consultas largas
  y autovacuum. El pipeline volvió a `paused` en la misma transacción,
  `canaryRemainingRequests=0`, y el cron 17 sigue inactivo.
- El `DRY_RUN` de las 18 tiendas revisó 203.073 productos y proyectó 7.733
  embeddings: 7.024 altas + 709 cambios semánticos. No es churn de 200k, pero
  Esclat (1.873) y Carrefour (3.864) activan el límite de 1.000. No ejecutar el
  materializador global ni usar override: revisar/trocear esos deltas. Mantener
  el cron apagado. Los dos canarios simples ya son sanos; antes de `active`,
  implementar o ejecutar un drenaje de varios lotes con presupuesto total
  explícito, baja concurrencia y observación entre lotes.
- El guardarraíl local bloquea ahora todas las escrituras y corta el recorrido
  cuando `anomalyBlocked=true`. `npm run quality` pasa 172/172. Advisors: ningún
  hallazgo nuevo bloqueante de Fase 1; los avisos relevantes son INFO esperados
  por RLS sin políticas en tablas privadas y un índice de runs aún sin uso.

## Fase 0 del pipeline de embeddings (local + backend, 2026-08-31)

- Ya están aplicadas en producción las migraciones
  `embedding_pipeline_phase_zero_control` y
  `fix_embedding_phase_zero_special_expressions`. La segunda corrige el uso
  prefijado de expresiones especiales de PostgreSQL detectado por la prueba
  transaccional. `enforce_single_canary_dispatch_budget` impide además que el
  encadenamiento convierta el canario en un vaciado serial de toda la cola.
  Ninguna ejecución de prueba quedó persistida.
- El control central permanece en `paused`. El cron 17 continúa inactivo, con
  frecuencia `*/15 * * * *` y comando
  `select public.catalog_dispatch_embedding_jobs(3);`; aunque alguien invoque
  materializador, cron o worker, la RPC devuelve cero lotes mientras esté
  pausado.
- Estado productivo final: 3.901 trabajos visibles, cero en vuelo y cero filas
  en `catalog_embedding_runs`. La cola no se vació ni se reescribió. `anon` y
  `authenticated` no pueden ejecutar la RPC; `service_role` sí.
- El materializador local audita el desglose, calcula los embeddings esperados
  y bloquea automáticamente si supera 1.000 o el 10 % de la tienda. Solo altas,
  cambios semánticos o republicaciones sin vector cuentan como embeddings;
  cambios de metadatos de comparación no regeneran el vector.
- El código de Fase 0 está publicado en la rama
  `codex/catalog-comparator-ui-hardening`. Dos canarios de Fase 1 ya validaron
  lotes individuales; mantener el cron inactivo y no pasar a drenaje continuo
  sin un presupuesto total acotado y observación entre lotes. No habilitar
  directamente el cron antiguo.
- Validación focalizada y prueba funcional remota correctas. Los advisors solo
  añaden avisos INFO esperados: tablas internas con RLS sin políticas (acceso
  exclusivo por `service_role`) e índices de auditoría todavía sin uso.

## Incidencia de Favoritos y carga de Catálogo (local + diagnóstico, 2026-08-31)

- Producción conserva `favorites.store`, la restricción única por
  usuario+tipo+tienda+referencia y 3.878 favoritos de 684 usuarios. El vacío no
  procede de una migración ausente: `FavoritesContext` silenciaba cualquier
  error inicial y, al no tener snapshot ni reintento, dejaba el estado vacío
  durante toda la sesión.
- El contexto hidrata ahora un snapshot por usuario mediante `startupCache`,
  revalida sin ocultarlo, reintenta dos veces y expone un refresh que Inicio
  ejecuta al arrastrar. Añadir o quitar favoritos mantiene la caché optimista y
  la revierte junto con el estado si Supabase falla.
- Catálogo → «Todos» precarga 12 filas por súper en vez de las 50 implícitas.
  Antes podía descargar hasta 900 filas para componer solo 50 resultados; la
  búsqueda conjunta ya usaba correctamente el lote de 12.
- Durante el diagnóstico Postgres mostró una ráfaga de timeouts, conexiones
  rotas y un autovacuum de `catalog_product_embeddings` atascado en
  `vacuuming indexes` (5/6) durante más de 2,8 h. El HNSW ocupa ~598 MB y la
  tabla tenía ~53.900 tuplas muertas tras el trabajo de embeddings. Se intentó
  cancelar únicamente el PID 1242429, pero Supabase lo rechazó porque el
  trabajador pertenece al superusuario; no se alteraron datos. No es un vacuum
  anti-wraparound (`xid_age` 1,17 M frente al límite 200 M).
- Mitigación productiva activa: el cron `catalog-embedding-dispatch` (job 17)
  quedó pausado mediante `cron.alter_job(... active := false)` para no generar
  más escritura mientras termina el vacuum. El cron 18 de alertas continúa
  activo. Aunque concluya el vacuum, ya no se debe reactivar directamente: la
  Fase 0 exige pasar primero por `canary`. El mantenimiento posterior debe ser
  `REINDEX INDEX CONCURRENTLY` del HNSW y después `VACUUM (ANALYZE)` en una
  ventana de baja actividad.
- `npm run quality` pasa TypeScript, lint y 132/132 pruebas. Nueva regresión:
  `scripts/tests/favorites-resilience.test.mjs`.

## Timeouts de Gadis resueltos con reconciliación incremental (2026-08-30)

- Causa confirmada en Supabase: el materializador reescribía las 10.901 filas
  de Gadis aunque no hubieran cambiado. Los upserts sobre
  `catalog_product_embeddings` y sus índices agotaban el timeout de 8 s y
  dejaron 5 productos sin snapshot y 14 snapshots huérfanos publicados.
- El materializador local ya consulta el estado existente y solo escribe filas
  nuevas, con cambios semánticos/de normalización o republicadas. Usa lotes de
  25 para upsert y de 100 para despublicar identificadores ausentes exactos; no
  vuelve a depender de `source_seen_at < seenAt` ni refresca timestamps de las
  filas sin cambios.
- Ejecutado en producción para `STORES=gadis`: 5 upserts, 10.896 sin cambios y
  14 despublicaciones. Estado posterior: fuente=10.901, snapshot publicado=10.901,
  faltantes=0, huérfanos=0, vectores pendientes=0, mensajes en cola=0 y fallos
  abiertos=0. No hubo errores Postgres nuevos en la ventana de reparación.
- No hay migración pendiente. `npm run quality` pasa TypeScript, lint y 107/107
  pruebas. Archivos centrales: `scripts/sync-comparator-embedding-catalog.mjs`
  y `scripts/lib/catalog-embedding-reconcile.mjs`.

## «Todos» para todas las cuentas registradas (local + backend, 2026-08-29)

- La versión 1.3 ya está desplegada. La regla cambia: Catálogo, Novedades,
  Ofertas y Cambios de precio permiten seleccionar «Todos» a cualquier cuenta
  registrada, no solo a Plus o a cuentas anteriores a 1.3.
- La compatibilidad inmediata con el cliente publicado se resuelve en
  `profiles.legacy_all_stores_access`: la nueva migración cambia el default a
  `true` y hace backfill de los `false`. Antes de aplicarla había 4.211/4.211
  usuarios con perfil, 4.051 habilitados y 160 bloqueados.
- Aplicada en producción como `20260829124046`: 4.211 perfiles habilitados,
  cero bloqueados, default `true` y trigger protector activo.
- El cliente local elimina ambos gates y el beneficio correspondiente del
  paywall. `WhatsNewPrompt` usa ahora `profiles.created_at` frente al instante
  de despliegue para no confundir el permiso universal con ser una cuenta
  anterior a 1.3.

## Froiz y Alcampo: cron remoto retirado y embeddings locales (2026-08-29)

- `sync-froiz.yml` y `sync-alcampo.yml` ya no tienen programación automática;
  solo conservan `workflow_dispatch` para diagnóstico manual porque los
  orígenes fallan desde GitHub Actions.
- Nuevo `scripts/run-froiz-sync.ps1` y ampliado
  `scripts/run-alcampo-playwright.ps1`: tras una publicación con código 0
  ejecutan el materializador limitado a su tienda. Froiz omite el paso con
  `DRY_RUN=1` y Alcampo cuando falta `-Publish`.
- Verificado en código y regresión que ambos syncs llaman a
  `recordCatalogSync` después de upsert+`markStale`; la pantalla
  «Actualización de catálogos» consulta esa tabla e incluye Froiz y Alcampo.
  No hizo falta migración ni cambio de cliente.
- Comprobación remota: Froiz tiene fecha del 29-08 a las 11:30 UTC. Alcampo no
  había creado la fila de estado aunque sus productos más recientes estaban
  sellados el 21-08 a las 09:05 UTC. A petición operativa se registró en
  `catalog_sync_status` esa marca real ya comprobada, sin usar la fecha actual:
  la fila devuelve `2026-08-21T09:05:06.908+00:00` y la app ya puede mostrarla.
- Pruebas focalizadas de integración y dispatch: 12/12 correctas.

## Procesador general de alertas personalizadas (local + backend, 2026-08-28)

- `process-price-alerts` v6 está ACTIVE y reclama con la RPC general, sin el id
  fijo de la evaluación de `@rruizosma`.
- El cron permanente `process-price-alerts-every-15-minutes` (job 18) está
  activo. Usa `catalog_embed_project_url` y `catalog_embed_worker_token` desde
  Vault; no guarda valores secretos en el repositorio ni en `cron.job`.
- La migración `20260828164258_generalize_price_alert_processor.sql`, ya aplicada
  en producción, exige un `catalog_sync_status` posterior al lote antes de
  materializarlo y omite lotes `new_arrival` de más de 400 eventos. Así el lote
  inicial de 1.568 altas de Esclat no genera una notificación masiva.
- Estado al activar: `@rruizosma` tiene seis reglas (cinco activas) y
  `@peperuben` seis (todas activas). `npm run quality` pasa 100/100.
- Primer cron permanente correcto a las 17:00 UTC: HTTP 200, cero entregas en
  proceso y cero entregas del lote masivo de Esclat. `@rruizosma` terminó con
  105 entregas `sent` en cinco notificaciones (10 son novedades de Mercadona).
  `@peperuben` terminó con 21 novedades `sent` en una entrada de bandeja y 124
  coincidencias `paused` por su cupo gratuito; no tiene token push registrado.

## Resiliencia del sync de Mercadona ante 403/429 (local, 2026-08-28)

- El run `33162575907` recibió 408 `403` en ráfagas temporales y activó el
  cortafuegos del 3% antes de escribir. No fallaron categorías concretas: 148
  de 151 IDs aparecieron al menos una vez y una muestra de URLs volvió a dar
  HTTP 200 fuera de la ventana de bloqueo.
- El cliente de Mercadona comparte ahora un cooldown de 30 segundos entre todos
  los workers, amplía la espera si existe `Retry-After` y deja una muestra
  diagnóstica de la primera respuesta de cada ráfaga. La concurrencia baja a 2
  y la separación base sube a 250 ms.
- Tras el barrido inicial se reintentan únicamente las parejas fallidas en dos
  pasadas seriales con 60 segundos de enfriamiento. Las recuperaciones respetan
  el orden original de almacenes para no cambiar `source_wh` o el precio de
  referencia. El 3% se calcula después y continúa bloqueando cualquier escritura.
- Workflow ampliado de 75 a 90 minutos. Pruebas nuevas en
  `scripts/lib/mercadona-rate-limit.test.mjs` y
  `scripts/tests/sync-mercadona-resilience.test.mjs`. Pendiente de validar la
  corrección en un sync real de GitHub Actions.

## Paywall 1.3 build 49: términos claros y prueba solo para elegibles (local, 2026-08-28)

- App Review no continuó con la versión 1.3 build 46. Además de la elegibilidad,
  señaló bajo 3.1.2(c) que el flujo no aclaraba el cobro automático ni el importe
  aplicable después de los siete días gratis.
## Paywall 1.3.1: prueba anual solo para cuentas elegibles (local, 2026-08-27)

- App Review permitió que la versión 1.3 build 46 continúe como bug-fix
  submission, pero señaló que su compra anual no recibía los siete días que
  el paywall anunciaba incondicionalmente.
- `getPlusOfferings` valida que Apple publique una prueba gratis de una semana y
  consulta `checkTrialOrIntroductoryPriceEligibility` para la Cuenta de Apple.
  La UI solo muestra la insignia y el CTA de prueba si el estado es `eligible`;
  ante `unknown`, no elegible, ausencia de oferta o error presenta el CTA normal.
- El texto situado bajo el CTA cambia con el plan y usa el precio localizado de
  StoreKit. Para una prueba elegible indica los siete días, el precio anual que
  se cobrará después y el inicio automático del pago; para mensual y anual sin
  prueba indica el cobro al confirmar. Los tres casos explican la renovación
  automática hasta la cancelación en castellano y catalán.
- La oferta remota está activa solo en España, del 21-08-2026 al 21-08-2036, y
  el Paid Apps Agreement está activo. `app.json` permanece en 1.3.0 para sustituir
  la build rechazada dentro de la misma versión 1.3. Las builds 47 (1.3.0) y 48
  (1.3.1) ya están generadas con la elegibilidad, pero sin el nuevo texto de
  renovación exigido por Apple; producción usará el auto-incremento remoto de
  EAS y se espera que el reemplazo sea la build 49.
- Regresión añadida en `scripts/tests/plus-activation.test.mjs`. Pendiente de
  generar y subir la build de producción.

## Upserts del materializador en lotes de 50 (local, 2026-08-27)

- `sync-comparator-embedding-catalog.mjs` limita ahora cada upsert a 50 filas.
  El lote anterior de 500 superó repetidamente el `statement_timeout` efectivo
  de 8 segundos de la Data API (`57014`) tras los syncs de Gadis, Esclat y
  Ahorramás.
- El cambio es común a los 17 workflows y ocho runners locales que invocan el
  materializador. No modifica el sync de origen, la cola, la RPC de dispatch ni
  los lotes de 100 que procesa `catalog-embed`.
- `sync-gadis.yml` amplía su timeout global de 30 a 60 minutos: el rastreo tarda
  unos 17 minutos y los lotes cortos necesitan margen adicional para completar
  el postproceso.
- Ejecución productiva completa: 10.885/10.885 productos materializados,
  dispatch inicial de un worker, cero ausentes, cero obsoletos publicados, cola
  vacía y cero fallos. Regresión incluida en
  `scripts/tests/embedding-dispatch.test.mjs`; `npm run quality` pasa 92/92.

## Embeddings por evento en vez de polling continuo (local + backend, 2026-08-25)

- `sync-comparator-embedding-catalog.mjs` llama al terminar a la nueva RPC
  `catalog_dispatch_embedding_jobs` con hasta tres peticiones. Se omite en
  `DRY_RUN`, por lo que los 17 workflows y ocho runners ya integrados obtendrán
  el impulso sin duplicar cambios en cada wrapper.
- La RPC es `SECURITY INVOKER`, fija lote/timeout en servidor y solo concede
  ejecución a `service_role`; `anon` y `authenticated` no tienen permiso.
  `catalog-embed` v9 encadena una sola petición al terminar cada lote para
  conservar la concurrencia inicial hasta vaciar la cola.
- El cron de producción `catalog-embedding-dispatch` pasó de 10 segundos a
  `*/15 * * * *` y queda exclusivamente como recuperación de impulsos fallidos
  o mensajes que vuelvan a ser visibles. Migración local
  `20260825174505_event_driven_catalog_embedding_dispatch.sql`, desplegada como
  `20260825175141`.
- Prueba remota controlada: el mensaje 212732 se reclamó mediante la RPC,
  `pg_net` 2047 devolvió HTTP 200 con
  `completed=0, failed=0, stale=1, dispatched=0` y la cola quedó vacía. Sin
  advisors nuevos; TypeScript, lint y 90/90 pruebas correctos.

## Nombres catalanes en el Radar de ahorro (local, 2026-08-24)

- `fetchSimilarProducts` usa la nueva RPC `catalog_cheaper_products_v7` y envía
  el idioma activo. La RPC conserva el cupo transaccional de v6 y reemplaza el
  nombre del resultado por `display_name_ca` en los siete catálogos bilingües,
  con fallback al nombre original.
- La v6 no se elimina para mantener compatibles las versiones publicadas. La
  migración `20260824213612_localize_comparator_results.sql` está desplegada en
  producción como `20260824213809`; una llamada autenticada real a v7 devolvió
  un nombre catalán y se revirtió para no consumir cupo. Regresión en
  `comparator-regional-stores.test.mjs`.
- `ProductNoteSheet` activa búsqueda bilingüe para «Producto asociado»: consulta
  ES+CA en los siete catálogos bilingües, deduplica los resultados y conserva el
  mapper del idioma activo. Así una consulta castellana muestra/guarda el nombre
  catalán cuando la app está en catalán. Sin migración adicional.

## Beneficios del paywall de QuéFalta Plus (local, 2026-08-24)

- Se ha retirado «Filtros avanzados» / «Filtres avançats» de la lista de
  beneficios. Los seis restantes mantienen tipografías e iconos legibles, con
  descripciones ES/CA más directas y separaciones verticales ajustadas.
- El contenedor usa toda la altura de pantalla y el bloque «Elige tu plan»,
  planes, CTA y enlaces queda anclado abajo mediante `marginTop: 'auto'`. El
  scroll queda como fallback de accesibilidad, no como recorrido normal.
- Regresión incluida en `scripts/tests/plus-activation.test.mjs`. Sin backend.

## Teclado del editor de alertas personalizadas (local, 2026-08-24)

- `PriceAlertEditorModal` usa `KeyboardAvoidingView` con padding en iOS y
  Android, necesario también con edge-to-edge de Expo SDK 54. La hoja deja de
  quedar tapada al escribir el nombre y el formulario se puede desplazar o
  cerrar el teclado arrastrando.
- Regresión incluida en `scripts/tests/price-alerts-ui.test.mjs`. Sin backend.

## Popup de novedades 1.3 (local, 2026-08-24)

- `WhatsNewPrompt` se monta sobre la navegación autenticada y usa
  `profile.legacyAllStoresAccess` para dirigirse exclusivamente a las cuentas
  existentes antes de 1.3. El cierre se recuerda con una clave de AsyncStorage
  versionada y separada por usuario.
- Es un modal central compacto, desplazable en pantallas pequeñas y cerrable por
  X, fondo, Atrás o CTA. Incluye castellano/catalán y respeta tema, acento y
  Reducir movimiento.
- Resume 18 supermercados+«Todos» heredado, búsqueda inteligente, Radar de
  ahorro y mejoras de carritos/grupos. No anuncia alertas mientras su procesador
  general continúe pendiente.
- Prueba de regresión en `scripts/tests/whats-new-prompt.test.mjs`.

## Activación inmediata de Plus sin carrera (local, 2026-08-24)

- `ProfileContext` conserva durante un máximo de 60 segundos el entitlement que
  RevenueCat acaba de validar, de modo que un primer refresh todavía antiguo no
  apaga el badge dorado ni vuelve a cerrar las funciones locales. Se descarta al
  recibir cualquier Plus activo de servidor, al vencer la ventana o al cambiar
  de usuario.
- Nueva Edge Function autenticada `sync-plus-subscription`: obtiene el uid del
  JWT, consulta a RevenueCat desde servidor y persiste la fecha verificada. No
  confía en ids ni fechas del dispositivo y no revoca; el webhook sigue siendo
  la fuente del ciclo de vida posterior.
- `sync-plus-subscription` v1 está desplegada en producción con verificación JWT.
  Antes de probar falta guardar `REVENUECAT_REST_API_KEY`; sin ese secret
  responde 503 de forma segura y el webhook conserva el respaldo. Sin migración SQL.
- Regresión en `scripts/tests/plus-activation.test.mjs`; TypeScript, lint de los
  archivos tocados y 77/77 pruebas correctos. El lint global solo queda rojo por
  un warning preexistente de `WhatsNewPrompt.tsx`, trabajo local concurrente.
- Supabase confirma que `revenuecat-webhook` v5 también está activo en
  producción. La confirmación directa real y su prueba sandbox siguen pendientes
  del secret externo indicado arriba.

## Alertas personalizadas: texto y estado visual (local, 2026-08-24)

- La cabecera deja de truncar «Alertas personalizadas» al convivir con Atrás y
  Añadir; usa el tamaño compacto ya previsto por `ProfileSubscreenHeader`.
- El switch de una regla activa pasa de `accentMid` translúcido a `accent`
  sólido, con thumb blanco y estado accesible sincronizado. El estado apagado
  sigue neutro y no cambia la persistencia ni los límites free/Plus.
- Los tres switches de tipo dentro de `PriceAlertEditorModal` usan ya el mismo
  estilo sólido/neutro y el mismo estado accesible, evitando que una alerta se
  vea distinta al editarla.
- Regresión cubierta en `scripts/tests/price-alerts-ui.test.mjs`. Sin backend.

## Hallazgos medios de la auditoría corregidos (local, 2026-08-24)

- Accesibilidad cerrada para los controles señalados de Catálogo, Cesta y
  Grupos: nombres, roles y estados de selección/checkbox/expansión en
  VoiceOver y TalkBack.
- `GroupDetailScreen` fusiona y agrupa una sola vez, usa listas virtualizadas y
  desmonta la vista normal al abrir la cesta completa. No quedan `ScrollView`
  de productos ni dos copias completas montadas.
- `ListScreen` elimina la animación JS de altura por producto: una zona plegada
  no conserva filas en `SectionList` y usa un único `LayoutAnimation` salvo con
  movimiento reducido.
- `AddMemberScreen` ya no silencia cargas parciales, ofrece reintento, evita
  presentar como disponible a un miembro existente y serializa incluso dobles
  toques mediante un guard síncrono. Su geometría queda alineada con Grupos.
- Transferir administración y expulsar abren `ConfirmDialog` antes de escribir.
  La cuadrícula de productos responde al ancho actual con 3/4/5 columnas y las
  imágenes fallidas conservan un placeholder visible.
- Regresiones en `scripts/tests/medium-priority-audit.test.mjs`. Validación:
  `npm run quality` verde (73/73), exports Hermes iOS/Android correctos y build
  Release iOS instalada y abierta en iPhone 15 Pro con iOS 26.5. No se tocó
  onboarding ni fue necesaria una migración.

## DAU, WAU y MAU exactos (local + backend, 2026-08-24)

- `AuthContext` registra el arranque autenticado en primer plano y las
  transiciones reales a `active` mediante `src/lib/appActivity.ts`. La llamada
  es best-effort y no altera el flujo de sesión si falla.
- La fecha y el usuario se fijan en Supabase. La app solo envía plataforma y
  versión; `private.app_daily_activity` agrega una fila por usuario/día de
  Madrid y cuenta entradas al primer plano sin exponer actividad individual.
- `private.app_active_user_metrics` calcula DAU, WAU de 7 días y MAU de 30 días.
  No se mezcló el histórico aproximado de Auth: empezará a poblarse cuando se
  distribuya este cliente y `tracking_started_on` indica desde cuándo hay datos.
- Desplegadas `20260824170826_app_active_user_metrics.sql` como
  `20260824171037` y `20260824171201_app_active_user_metrics_hardening.sql`
  como `20260824171226`. La escritura autenticada se probó dentro de una
  transacción revertida; `anon` no ejecuta la RPC y los clientes no leen tabla
  ni agregados. TypeScript y lint pasan; falta publicar el cambio de cliente.

## Imágenes y categorías de Froiz (local + backend, 2026-08-24)

- `sync-froiz.mjs` usa ahora URLs públicas estables de Cloudflare Images a
  partir de `image_id`; deja de concatenar la ruta firmada `image` sobre una base
  que ya incluía la cuenta y generaba 404. Hay tests para el id directo y el
  fallback extraído de la ruta.
- Catálogo ofrece la pestaña Categorías de Froiz, carga perezosamente su árbol,
  admite favoritos y abre `FroizProductsScreen` para cada subcategoría.
- En producción existen 12 categorías N1, 539 N2 y 6.889 productos categorizados.
  Se repararon 6.877 miniaturas desde `raw.image_id`; las 12 filas cuyo origen no
  publica imagen quedan a NULL. Verificación posterior: cero rutas duplicadas y
  una muestra real responde 200.
- DRY_RUN completo correcto: 6.893 productos, 551 categorías y 861 ofertas
  procesados sin escribir. `npm run quality` pasa TypeScript, lint y 66/66 tests.

## Precio unitario de Gadis corregido (local + backend, 2026-08-24)

- El origen publicaba `el kilo`, `el litro`, `la unidad`, `la docena`, `los
  100 ml` y `los 100 gr.`, pero el cliente reducía todos los textos no
  canónicos a €/ud. El sync guarda ahora exclusivamente `kg`, `l` o `ud` y
  convierte las cantidades de referencia.
- Los frescos sin sufijo usan `weight=P` y quedan en €/kg; los demás productos
  sin sufijo permanecen en €/ud. Metro y dosis se dejan sin precio unitario
  canónico para no presentar una equivalencia falsa.
- Incluida prueba de regresión. La migración local
  `20260824143104_normalize_gadis_reference_units.sql` está desplegada como
  `20260824143221`. Verificación remota: 6.065 productos en kg, 3.150 en L,
  1.638 en ud, cero unidades no canónicas y cero precios con unidad vacía.
- DRY_RUN real limitado: 150 productos y 112 categorías procesados. `npm run
  quality` correcto: TypeScript, lint y 66/66 pruebas.

## Comparador Froiz, Gadis y Ahorramás (local + backend, 2026-08-24)

- La acción compartida «Buscar productos más económicos» usa ya Froiz,
  Gadis y Ahorramás tanto como origen como destino sin cambiar la API v6 del
  cliente. Se ampliaron materializador, worker, detalle público, candidatos,
  matches internos y estado de caché.
- El snapshot contiene 6.889 productos de Froiz, 10.898 de Gadis y 7.453 de
  Ahorramás. La unidad y la cantidad canónica aceptan las etiquetas comerciales
  reales; dosis, lavado y metro quedan fuera de las comparaciones kg/L/ud. El
  backfill final deja 6.889/6.889, 10.898/10.898 y 7.453/7.453 embeddings,
  respectivamente, con cola y fallos a cero.
- Desplegadas `20260824140442` como `20260824140836`, `20260824141713` como
  `20260824141904` y `20260824150548` como `20260824150622`. Edge Function
  `catalog-embed` activa en v7.
- Pruebas reales correctas con leches de las tres cadenas como origen: cada RPC
  devolvió alternativas de las otras dos con match semántico, precio unitario
  compatible e `is_cheaper`. La validación local pasa TypeScript, lint y 66/66
  tests; los asesores remotos no añaden incidencias ligadas a este cambio.

## Embeddings enlazados a los syncs (local, 2026-08-24)

- Los 17 workflows de los supermercados admitidos por el comparador ejecutan
  ahora el materializador transversal para una sola tienda tras un sync
  correcto. Bonpreu lo hace solo cuando `continue_sync` deja de ser `true`.
- Los diez wrappers PowerShell hacen lo mismo tras ejecuciones reales y omiten
  el postproceso en `DRY_RUN`; así quedan cubiertos también los syncs productivos
  locales de Carrefour, Eroski, Caprabo, Froiz y Alcampo.
- Hipercor no se conecta todavía porque no está admitido por la capa de
  embeddings. El materializador da el impulso inicial y los workers encadenan
  los lotes; el cron remoto queda como respaldo cada 15 minutos.

## Reportes de resultados del comparador (local + backend, 2026-08-24)

- `SimilarProductsSection` incorpora dentro de cada fila una bandera a la
  izquierda del producto. Envía el reporte sin abrir la ficha, muestra loader,
  confirmación y estado completado, y conserva accesibilidad ES/CA.
- `src/api/catalog.ts` llama a `public.report_catalog_product_match`; la RPC
  autenticada valida el match y delega la escritura privilegiada. No se expone
  acceso directo a la cola privada.
- `private.catalog_match_reports` conserva usuario, pareja, versión, estados de
  revisión, nota/revisor y snapshots de productos+métricas. Un índice único
  evita duplicados por usuario y hay índices para pendientes y agrupación por
  pareja.
- `20260824140037_catalog_match_reports.sql` está desplegada como
  `20260824140510`. La prueba real confirmó idempotencia y snapshots; el reporte
  de prueba fue eliminado. TypeScript, lint y la suite global son correctos.

## Fondo del onboarding sin líneas blancas (local, 2026-08-24)

- Retirados del SVG compartido los reflejos horizontales blancos de la persiana
  y el borde blanco del remate inferior de los cinco pasos. Se mantienen el
  fondo azul y las separaciones oscuras; no cambia la lógica del flujo.

## Diseño unificado de filtros en Ofertas y Novedades (local, 2026-08-24)

- `OffersScreen` activa en `ProductFilterSheet` la misma variante visual Plus
  y los iconos de categoría de Novedades. La lógica y las facetas específicas
  de Ofertas no cambian.

## Timeout ampliado del comparador (local + backend, 2026-08-24)

- `catalog_cheaper_products_v6` ya no hereda los 8 segundos del rol
  `authenticated`: usa una excepción de función de 60 segundos, el máximo
  admitido por la Data API. El resto de consultas conserva 8 segundos y v5 no
  cambia.
- `20260824131021_extend_comparator_statement_timeout.sql` está desplegada como
  `20260824131133`. Verificación real con Mercadona 4717 y caché fría: la
  consulta terminó y devolvió 20 resultados en vez de HTTP 500.
- Es un cambio exclusivamente de backend; no hace falta modificar ni publicar
  el cliente.

## Logotipo local de Ahorramás (local, 2026-08-23)

- `CATALOG_STORES` enlaza ya `assets/stores/ahorramas.jpg`; desaparece el
  fallback genérico en todos los consumidores de los metadatos compartidos.
- Las rejillas temporales de tres y cuatro columnas usadas para las capturas
  fueron restauradas a las dos columnas actuales; no queda ningún cambio de
  layout en el cliente.

## Motor de búsqueda del catálogo (local + backend, 2026-08-23)

- Sustituida la búsqueda directa `ILIKE + limit(50)` de los 18 supermercados
  por RPC con FTS por prefijo, fallback trigram para erratas, ranking estable y
  paginación. Mantiene idioma, región, CP/centro, RLS y los adaptadores actuales.
- Catálogo usa relevancia por defecto durante la búsqueda y conserva precio y
  precio unitario como órdenes alternativos. El orden se aplica en el servidor
  antes de `limit`/`offset`, por lo que las tiendas individuales cargan páginas
  estables; «Todos» mezcla las cadenas habilitadas con el mismo criterio.
- Se corrigió el hueco previo de Froiz: existía el texto de búsqueda, pero no
  había efecto ni render de resultados. Su árbol de categorías, ya presente en
  el espejo, también queda conectado a la interfaz.
- El mismo motor queda conectado a Novedades y Ofertas cuando se escribe una
  búsqueda. Novedades deja de buscar solo en las páginas ya descargadas y
  Ofertas sustituye el filtro de palabras sin ranking; ambos aplican categoría,
  rango y orden antes de paginar y mantienen sus reglas de feed.
- `20260823101900_catalog_search_engine_v1.sql`,
  `20260823103646_catalog_search_language_index_planner.sql` y
  `20260823104120_catalog_search_server_sort_orders.sql` están desplegadas como
  `20260823103505`/`20260823103803`/`20260823104828`. Probadas las 18 RPC con rol
  `anon` y la ruta REST pública (HTTP 200), incluido orden por precio y páginas
  sin solape. Rendimiento caliente medido: 26–69 ms en Mercadona, Carrefour y
  Alcampo; suite completa, TypeScript y lint correctos.
- Backend listo antes del cliente, por lo que una build/OTA posterior no tendrá
  una ventana en la que falten las RPC.
- `20260823110039_catalog_feed_search_engine.sql` está desplegada como
  `20260823110849`: 18 RPC `SECURITY INVOKER`, acceso `anon` verificado,
  búsqueda con errata y paginación sin solape. Carrefour: ~51 ms/50 ofertas.

## Cupos gratuitos de alertas y comparador (local + backend, 2026-08-23)

- Las cuentas gratuitas pueden gestionar una alerta personalizada; Perfil ya
  no bloquea la pantalla y «Avísame» permite crearla o editarla. Al ocupar el
  hueco, intentar crear otra abre Plus. Las cuentas Plus siguen ilimitadas.
- «Buscar productos más económicos» permite tres ejecuciones gratuitas por
  cuenta. La cuarta abre el paywall; después de cada búsqueda se muestra el
  cupo restante. Plus sigue ilimitado.
- La cuota no usa AsyncStorage: `private.free_tier_usage` persiste el contador y
  `catalog_cheaper_products_v6` reserva uso+consulta de forma atómica. El
  procesador de alertas entrega la única regla free y pausa reglas sobrantes de
  una suscripción caducada.
- Los dos cupos están desacoplados del encendido comercial. El servidor se
  activó para la revisión de la versión 1.3 el 2026-08-25 y se verificó
  `paywall_enabled() = true`; los demás gates Plus están ya encendidos.
- `20260823063529_free_tier_alert_and_comparator_allowances.sql` y la policy
  defensiva `20260823065123_restrict_free_tier_usage_direct_access.sql` y
  `20260823065448_enforce_free_allowances_before_paywall_launch.sql` están
  desplegadas como versiones remotas `20260823064939`, `20260823065153` y
  `20260823065550`.
  Verificación transaccional real: usos restantes 2→1→0, 4º bloqueado y segunda
  alerta free rechazada; advisors sin avisos relacionados.

## Precio unitario de Eroski y Caprabo recuperado (local, 2026-08-22)

- Verificado en ambas webs que las tarjetas publican `1 KILO A ...`, `1 LITRO
  A ...` y `1 UNIDAD A ...`; el parser compartido ignoraba el bloque
  `quantity-text`/`quantity-price` y escribía siempre null.
- El sync normaliza ya esos valores a kg/L/ud, conserva null cuando la web omite
  la etiqueta y el cliente vuelve a seleccionarlos y mostrarlos. Las columnas
  ya existen: no hay migración; falta relanzar los syncs de Eroski y Caprabo
  para rellenar producción.
- DRY_RUN real de 3 hojas: Eroski 14/42 y Caprabo 10/31 productos con precio
  unitario, ambos con 0 hojas sin tiles. Suite 41/41, lint y typecheck correctos.

## Apertura estable de las fichas nutricionales (local, 2026-08-22)

- Corregido el salto por el que el comparador aparecía primero y bajaba al
  insertarse después el Índice alimentario. Un bloque compartido espera la
  resolución nutricional y revela índice+comparador en la misma actualización,
  con loader compacto, fundido y soporte para Reducir movimiento.
- El hook nutricional diferencia consulta pendiente y resuelta y evita exponer
  datos de la identidad anterior. Afecta a las nueve cadenas con índice y no
  modifica el comparador bajo demanda ni las fichas sin fuente nutricional.
- Añadidas dos pruebas de regresión; 39/39 tests y lint de los archivos tocados
  correctos. El chequeo global queda bloqueado por trabajo local concurrente en
  `ListScreen` y `GeneralStatisticsScreen`, ajeno a esta corrección.

## Plegado progresivo de categorías del carrito (local, 2026-08-22)

- `ListScreen` mantiene montadas las tarjetas de una zona al plegarla y anima
  su altura real con recorte: cierra de abajo hacia arriba y abre en el orden
  inverso, sin el salto instantáneo anterior.
- La ventana escalonada está acotada para que las categorías grandes no hagan
  lenta la interacción. Se conservan el doble toque por supermercado, la
  respuesta háptica, Reducir movimiento y la ocultación accesible.
- El plegado de la cabecera de supermercado incorpora también una transición
  suave de layout. Cambio solo de cliente, sin migración SQL.

## Precio unitario de HiperDino recuperado (local, 2026-08-22)

- La API GraphQL sí publica el precio de referencia en `price_text`; el sync
  anterior no solicitaba ese campo y escribía siempre `price_per_unit = null`.
- `scripts/sync-hiperdino.mjs` usa ahora `sap_final_price`/`sap_price` para el
  precio final y tachado, evitando el fallo actual de un resolver `price_range`,
  y normaliza kilo, litro, 100 g/ml, unidad y docena a l/kg/ud.
- Lavado, dosis y metro permanecen solo en `raw` para no mezclarlos con €/ud.
  DRY_RUN completo: 14.775 productos, 127 categorías, 0 sin precio y 11.357 con
  precio unitario canónico. Pruebas específicas del parser correctas.
- No requiere migración: las columnas y el cliente ya estaban preparados.
  Pendiente desplegar el sync y relanzarlo para rellenar producción.

## Estadísticas generales de la comunidad (local + backend, 2026-08-22)

- «Estadísticas generales» queda disponible también sin compras personales y
  abre `GeneralStatisticsScreen`, con refresco, errores recuperables, acceso
  Plus y versiones castellana/catalana.
- La pantalla ordena supermercados elegidos en preferencias, top 10 de
  productos de catálogo añadidos y top 10 de supermercados por unidades. Usa
  logos, miniaturas, barras proporcionales y etiquetas completas de accesibilidad.
- La implementación privada une `list_items` y `purchase_items`, excluye textos
  manuales y solo expone agregados. El RPC `public` es `SECURITY INVOKER`, exige
  sesión y Plus y revoca `anon`; no devuelve ids de usuarios, grupos, listas o
  compras. La lectura privilegiada vive en el esquema no expuesto `private`.
- `20260822165410_general_statistics.sql` y
  `20260822171122_general_statistics_private_boundary.sql` están desplegadas en
  producción como `20260822171009` y `20260822171221`. Verificación real: 17
  preferencias, 10 productos y 10 supermercados; sin avisos nuevos en advisors.

## Resultados del comparador rediseñados (local, 2026-08-22)

- «Buscar productos más económicos» muestra ahora una cabecera de resultados,
  un resumen del veredicto y tarjetas agrupadas únicamente para tiendas con
  coincidencias. Las filas priorizan miniatura, nombre y precios y marcan en
  verde las alternativas cuyo `isCheaper` es verdadero.
- Si hay alternativas fiables pero ninguna mejora el precio, aparece el aviso
  «Tu opción actual es la más económica». El vacío sin matches conserva su
  mensaje separado. Textos y accesibilidad están cubiertos en español y catalán.
- Cambio solo de cliente en `SimilarProductsSection`; no requiere migración SQL.
- `npm run quality` correcto: TypeScript, ESLint y 33/33 pruebas.

## Identidad centrada en Perfil (local, 2026-08-22)

- Retirado el botón promocional QuéFalta Plus de la tarjeta de identidad; la
  entrada de Cuenta añadida para compra/gestión es ahora el único acceso.
- El `@usuario` y su insignia vuelven a quedar a la derecha del avatar en el eje
  X, alineados a la izquierda, y centrados verticalmente en el eje Y.

## Gestión de suscripción en Perfil (local, 2026-08-22)

- La sección Cuenta incorpora QuéFalta Plus para free y premium: abre el
  paywall en free y la gestión oficial de App Store/Google Play en suscriptores.
- Lee `CustomerInfo` de RevenueCat para mostrar mensual, anual, prueba o fecha
  final. Si Supabase concede Plus sin entitlement (testers), muestra «De
  cortesía» sin enlazar a una cancelación inexistente.
- No hay cambios de esquema. Pendiente validar el destino real en las pruebas
  sandbox de iOS y Android ya previstas para Fase 3.

## Acceso heredado a «Todos» (local + backend, 2026-08-24)

- Catálogo y el selector compartido de Novedades, Ofertas y Cambios de precio
  mantienen «Todos» habilitado para cuentas anteriores a QuéFalta 1.3.
- La excepción usa `profiles.legacy_all_stores_access`; solo afecta a este gate,
  no a los demás beneficios Plus, y un trigger impide cambiarla desde el cliente.
- La columna, el primer snapshot y el trigger ya estaban en producción, pero 66
  altas posteriores habían quedado fuera mientras la versión pública seguía en
  1.2.1. `20260824174500_grant_legacy_all_stores_to_pre_1_3_accounts.sql` está
  desplegada como `20260824174522` y amplía el permiso a esas cuentas.
- Snapshot operativo repetido el 2026-08-25: 22 altas adicionales habilitadas.
  Verificación remota: 4.054 perfiles, 4.054 con acceso heredado y cero sin él.
  El valor por defecto continúa en `false` y el trigger protector sigue activo,
  por lo que hay que repetir el snapshot justo antes de publicar la versión 1.3.

## Icono personalizado por grupo (local + backend, 2026-08-22)

- El detalle de grupo incorpora una tarjeta propia, separada por completo de
  gestionar miembros, desde la que el administrador elige un emoji.
- El selector reúne y deduplica todos los iconos de categoría y subcategoría ya
  usados por los catálogos. El icono elegido se refleja en Inicio, la cabecera
  de Carrito, la barra flotante de selección y todas las fichas de producto.
- `CartContext` conserva `groupIcon` en la clave por usuario, migra snapshots
  antiguos sin ese campo y actualiza nombre/icono al revalidar la pertenencia.
- `20260822071818_add_group_icon.sql` está desplegada en producción como versión
  remota `20260822073002`. Verificados columna, constraint, RLS y policy UPDATE
  del administrador. Typecheck, lint y 30/30 pruebas pasan.

## Barra de selección de productos actualizada (local, 2026-08-22)

- La barra que aparece al elegir cantidades en `StoreProductList` adopta una
  tarjeta flotante redondeada con superficie glass/fallback temado, icono de
  cesta y botón «Añadir» en cápsula. Sustituye la antigua franja oscura de ancho
  completo sin modificar la lógica de alta, el grupo de destino ni el offset de
  la navegación inferior.

## Suscripciones creadas en Apple y RevenueCat (2026-08-22)

- App Store Connect: grupo «QuéFalta Plus», nivel 1, España y localizaciones
  castellano/catalán. Productos definitivos:
  `com.quefalta.app.plus.monthly` (Apple ID `6804053263`, 3,99 €/mes) y
  `com.quefalta.app.plus.annual` (Apple ID `6804054501`, 19,99 €/año, prueba
  gratuita de una semana). No se enviaron a revisión ni se activó el paywall.
- Google Play: suscripción `quefalta_plus` creada con ficha ES/CA. Los planes
  definitivos siguen siendo `monthly` y `annual`, pero Play rechaza guardarlos
  porque la app aún no tiene ninguna build publicada en un canal (prueba interna
  figura inactiva, 0/3). Subir primero una build Android con RevenueCat/Google
  Play Billing; después crear los planes y la prueba anual de 7 días.
- RevenueCat: apps Apple y Google (`com.quefalta.app`), entitlement `plus`,
  offering `default` y paquetes `$rc_monthly`/`$rc_annual` configurados. Cada
  paquete ya enlaza Test Store, Apple y el producto Google futuro
  (`quefalta_plus:monthly` o `quefalta_plus:annual`). Pendientes: credencial de
  cuenta de servicio Google, clave App Store Connect para importación automática,
  API keys públicas en entorno/EAS, webhook y pruebas sandbox.

## Precio de QuéFalta Plus confirmado (2026-08-21)

- Mensual: **3,99 €**, sin periodo de prueba.
- Anual: **19,99 €**, con **7 días gratis** para usuarios elegibles.
- El resto de decisiones de producto y configuración propuestas para RevenueCat,
  Apple y Google quedan confirmadas.

## Consulta visible al desplazar el Catálogo (local, 2026-08-21)

- Tras escribir una búsqueda de Productos y empezar a desplazar sus resultados,
  el buscador se contrae y la cabecera se amplía con el texto introducido en
  cursiva, situado debajo del botón circular de la lupa.
- Reabrir el buscador, cambiar de supermercado o entrar en Categorías retira el
  resumen; altura, desplazamiento y opacidad usan una curva progresiva más lenta
  salvo con Reducir movimiento, donde el cambio sigue siendo inmediato.

## Orden unitario de Novedades, Ofertas y Cambios de precio abre Plus (local, 2026-08-21)

- En `ProductFilterSheet`, solo los botones de «Ordenar por precio unitario»
  de Novedades, Ofertas y Cambios de precio requieren Plus y abren el paywall
  sin aplicar el orden.
- «Ordenar por precio» del envase permanece disponible para cuentas gratuitas.
- Si Plus caduca con un orden unitario activo, la selección se limpia.
- Ofertas vuelve a mostrar formato/cantidad y precio unitario en la línea
  secundaria, manteniendo al final el precio anterior cuando está disponible.
- Cambios de precio mantiene anterior/actual/porcentaje y vuelve a mostrar
  debajo el formato/cantidad y el precio unitario.

## Producto alternativo de comentarios pasa a Plus (local, 2026-08-21)

- Los comentarios de la cesta siguen abiertos a todas las cuentas, pero
  «Asignar producto» y «Cambiar» requieren Plus.
- El gate vive en `ProductNoteSheet`: abre el paywall antes de iniciar una
  búsqueda y vuelve a validarse al elegir y guardar. Las alternativas existentes
  se pueden ver, conservar o quitar aun sin suscripción.
- El beneficio se añadió al paywall en castellano y catalán. Sin cambios de BD.

## Historial de compra abierto (local, 2026-08-21)

- «Historial de compra» deja de pertenecer a QuéFalta Plus: Perfil navega
  directamente, sin candado ni popup.
- `HistoryScreen` carga para todas las cuentas y permite repetir cualquier
  compra, sin límite de antigüedad. Eliminados el gate, el CTA bloqueado, los
  textos Plus y la antigua constante del límite de tres compras.
- El beneficio «Historial de compra» se retiró del paywall.

## Dorado Plus en «Mejor precio» (local, actualizado 2026-08-22)

- Retirado el acceso QuéFalta Plus de la tarjeta de identidad. El fondo/tinta
  dorados de `PremiumGoldBackground` quedan solo en «Mejor precio» del plan
  anual; el sello propio de la cabecera conserva su variante dorada.
- Filas bloqueadas, Apariencia, alertas, comparador, orden unitario, selector
  «Todos» y el resto del paywall usan ahora el acento normal, sin alterar gates,
  candados ni navegación al paywall.
- Las insignias públicas y las del paywall usan el acento. La celebración de
  bienvenida mantiene movimiento y composición, y recupera la paleta y el
  resplandor dorados después de una compra confirmada.
- `PremiumGoldBackground` queda usado únicamente por la etiqueta anual de
  `PaywallModal`.

## Doble toque en categorías del carrito (local, 2026-08-21)

- El toque simple sigue plegando o desplegando solo la categoría pulsada.
- Un segundo toque sobre la misma categoría dentro de 300 ms extiende la
  dirección del primero a todas las categorías de ese supermercado, sin retrasar
  la respuesta del toque simple ni modificar otras tiendas.

> **Snapshot: 2026-07-15.** Este documento consolida el estado NO obvio del repo: qué está
> commiteado vs. solo en local, qué supers están implementados pero sin migrar, y las features
> transversales a medias. Todo esto vivía en la memoria de Claude Code (que Codex no ve) y **no
> está completo en git**. La lista canónica y anotada de migraciones SQL está en
> [CONTEXTO.md](CONTEXTO.md) §"Migraciones SQL pendientes"; aquí va lo que ESE documento no dice:
> el estado de commit y el trabajo transversal.

## Burbujas ambientales en Carrito (local, 2026-08-21)

- Carrito comparte ahora con Inicio las 21 burbujas radiales y los lavados
  ligados al acento elegido en Apariencia, también en estados vacíos, pero no
  su degradado superior: conserva el fondo plano de papel.
- La implementación se extrajo a `AmbientBubbleBackdrop`: un único SVG
  memoizado, decorativo, sin gestos ni exposición a accesibilidad.
- La cabecera de Inicio aprovecha el espacio a la izquierda de campana y avatar
  para mostrar «¡Prepara la compra!» (localizado también al catalán). No se
  muestra en Carrito.
>
> ⚠️ Fechas y detalles reflejan lo que era cierto el 2026-07-15. **Verifica contra `git log` y
> contra Supabase antes de fiarte** — algo puede haberse commiteado/ejecutado después.

## Comentarios y producto alternativo en el carrito (local + backend, 2026-08-21)

- El carrito añade a cada producto una extensión inferior unida a su tarjeta y
  separada con puntos. El texto vacío es «Añade comentarios sobre el producto»
  y abre un editor multilínea; una nota existente se muestra directamente.
- Desde el mismo editor se puede elegir entre los supermercados activos y
  buscar dentro de uno para asignar, sustituir o quitar un producto alternativo.
  El buscador respeta CCAA, CP y preferencias del perfil. La extensión muestra
  nombre, supermercado y miniatura del vínculo.
- Con varias tiendas disponibles, la hoja obliga primero a seleccionar una
  mediante su logotipo y nombre; el buscador permanece inactivo hasta hacerlo.
  Una única tienda se preselecciona sin mostrar este paso y cambiar de opción
  descarta la búsqueda anterior para no mezclar productos.
- Comentarios compartidos y optimistas: actualizar un producto fusionado cambia
  todas sus filas y revierte si falla. Se archivan/restauran con el historial y
  se muestran también en el detalle del grupo; el producto asociado sigue el
  mismo ciclo de persistencia.
- Restar y eliminar miden 28 pt, como Asignar, y tienen más separación vertical.
- `20260821175658_list_item_notes.sql` está desplegada y verificada en producción:
  `note` nullable en `list_items` y `purchase_items`, máximo 280 caracteres y
  privilegios/RLS existentes sin cambios.
- `20260821181503_list_item_note_product.sql` está desplegada como versión remota
  `20260821182635`: cinco campos de referencia/snapshot en ambas tablas,
  constraints validados, RLS activo, privilegios correctos y seis policies sin
  cambios. `npm run quality` pasa con 30/30 pruebas.

## Hallazgos altos de la auditoría corregidos (local + backend, 2026-08-24)

- Cesta guarda `store_key` explícito y fusiona por `tienda:id`; cantidades de
  Catálogo también usan esa clave compuesta. Se actualizaron todos los puntos de
  alta y la repetición del historial. El fallback por URL queda solo para datos
  históricos/builds antiguos.
- `set_list_items_in_cart`, `assign_list_items` y `finish_list_purchase` son RPC
  atómicas, invoker y limitadas a `authenticated`. La última archiva detalle y
  vacía la lista en una transacción serializada. Migración local
  `20260824165601_high_priority_cart_integrity.sql`, desplegada en producción
  como versión remota `20260824170527`; backfill con 0 `store_key` nulos.
- Pruebas remotas bajo RLS ejecutadas dentro de `BEGIN/ROLLBACK`: toggle masivo,
  asignación, finalización con detalle, limpieza y trigger legacy correctos. Los
  advisors no señalan ninguna de las tres funciones nuevas.
- `CartContext` serializa mutaciones y protege la restauración; Inicio invalida
  peticiones antiguas. Grupos bloquea todas las activaciones mientras hay una en
  vuelo y separa navegación/activación en objetivos táctiles hermanos.
- Catálogo conjunto usa paginador por tienda tolerante a fallos, bloques de 12 y
  buffers persistentes; conserva resultados parciales y deja de repetir descargas.
- Android: `app.json` registra `withAndroidReleaseHardening`, que elimina la
  firma debug del release y activa R8/resource shrinking tras cada prebuild;
  también bloquea `RECORD_AUDIO`, storage heredado y `SYSTEM_ALERT_WINDOW` en el
  manifest principal (debug conserva el overlay). EAS mantiene firma y versiones
  remotas. Prebuild comprobado con configuración Firebase ficticia temporal.
- Validación final: export Hermes correcto para iOS y Android y
  `npm run quality` verde (TypeScript, ESLint y 69/69 pruebas).

## Grupos ilimitados para todas las cuentas (local + migración, 2026-08-21)

- «Nuevo» ya no consulta Plus ni el número de grupos: siempre abre
  `NameInputSheet`. Retirados del cliente el paywall y `free_group_limit`.
- `20260821175745_allow_unlimited_group_creation.sql` elimina el trigger
  `groups_enforce_limit` y su función. `paywall_gates.sql` ya no los recrea.
- La creación y la pertenencia a grupos quedan ilimitadas; los demás gates Plus
  no cambian.

## Popup redondeado de grupos (local, 2026-08-21)

- `NameInputSheet`, compartido por crear y renombrar grupos, redondea la hoja,
  el icono, el cierre, el campo y el CTA de confirmación.
- Retirado el borde duro de `HardShadow` del CTA; no cambia la lógica del
  formulario, su bloqueo durante la petición ni el comportamiento del teclado.

## Pie redondeado en las fichas de producto (local, 2026-08-21)

- El selector horizontal de cantidad y «Añadir a la cesta» pasan a usar
  geometría de cápsula en las fichas de todos los supermercados.
- Es un cambio exclusivamente visual; conserva acciones, tamaños táctiles,
  estados desactivados y color de acento.

## Botón circular al crear el primer grupo (local, 2026-08-21)

- El estado vacío de Grupos sustituye el CTA rectangular con borde duro por
  una acción circular de acento con el icono de suma y «Crear grupo» debajo.
- Se mantiene un solo objetivo táctil accesible y no cambia la creación ni la
  activación automática del primer carrito.

## Cabeceras de Catálogo, Carrito y Grupos (local, 2026-08-21)

- «Mi Lista» y «Grupos» quedaron alineados con los 20 pt de «Catálogo»,
  incluidos sus iconos y contenedores circulares reducidos proporcionalmente.
- Catálogo reutiliza ese mismo bloque visual con un icono exclusivo de biblioteca a la
  izquierda y conserva el selector de supermercado dentro de la fila, a la derecha.
- La pestaña inferior de Catálogo usa la misma familia library en las barras
  clásica y Liquid Glass.

## Controles de categorías y subcategorías (local, 2026-08-21)

- El selector Productos/Categorías de Catálogo usa la nueva variante reforzada
  de `SlidingSegments`: 44 px, borde sensible al tema, reflejo interior, sombra
  exterior y selección de acento más visible. Orden y lista/cuadrícula aplican el
  mismo tratamiento dentro de Catálogo sin cambiar su altura original de 40 px;
  el bloque unitario bloqueado replica esa geometría. No se anida otra superficie
  de cristal ni se alteran los controles compactos de las demás cabeceras.
- Redondeado el botón Atrás de la pantalla de categoría y de los listados de
  productos de todos los supermercados que usan las cabeceras de catálogo.
- El buscador compartido tiene ahora radio 16, espaciado y sombra acordes al
  Catálogo actual. El selector lista/cuadrícula usa una pastilla más redondeada
  y resalta el modo activo con el color de acento; en Liquid Glass reutiliza
  `SlidingSegments` y su misma transición de Catálogo → Productos. El icono de
  cuadrícula se compensa 1 pt a la derecha para centrarlo ópticamente en ambos.
- Typecheck, lint y 30/30 pruebas correctos.

## Transición onboarding → Inicio e Inicio estable (local, 2026-08-21)

- Eliminada por completo la tarjeta «Completa tu perfil» y su código/traducciones.
- El CTA final marca la entrada desde onboarding e Inicio mantiene una cubierta
  de continuidad hasta que su layout y datos principales están estables; funde
  en 260 ms, limita la espera a 900 ms y respeta Reducir movimiento.
- La cabecera reserva su altura desde el primer frame. Favoritos, grupos y última
  compra distinguen carga de vacío; grupos muestra reintento ante error.
- Corregido el control táctil anidado de última compra y consolidado el fondo de
  21 burbujas en un único SVG memoizado que usa el acento elegido en Apariencia.
- Perfil parte también de la altura conocida de su cabecera Liquid Glass y
  descarta mediciones iguales, evitando el salto de todo el bloque al entrar.
- Validado con `npm run quality` (30/30 pruebas) y compilación Debug completa
  del scheme `QuFalta` en Xcode (`BUILD SUCCEEDED`).
- Para ejecutar en simulador se reinstaló un build firmado con «Sign to Run
  Locally». No usar `CODE_SIGNING_ALLOWED=NO` en pruebas de autenticación: el
  binario abre, pero SecureStore no puede leer/escribir el llavero y Google PKCE
  termina mostrando el error genérico de inicio de sesión.

## Refuerzo integral del onboarding (local + backend, 2026-08-21)

- Corregidos los diez hallazgos de la auditoría: gate recuperable, carrera de
  @usuario, grupo transaccional/idempotente, validación final en servidor,
  reanudación, accesibilidad/texto grande, error de fototeca, CTA sin duplicados,
  pantalla Done y fondo SVG compartido.
- Añadidas pruebas unitarias de progreso y validación de @usuario.
- `20260821130300_onboarding_integrity.sql` está aplicada en producción. Se
  verificaron columnas, índice, permisos de RPC y 0 desajustes de progreso.
- Validado con `npm run quality` (30/30 pruebas), export iOS de producción y
  compilación Debug en Xcode (`BUILD SUCCEEDED`). Queda únicamente un recorrido
  visual extremo a extremo cuando haya una cuenta de pruebas cuyo
  `onboarded_at` sea NULL.

## Desplegable de correo integrado en Login (local, 2026-08-21)

- Añadido el isotipo oficial de QuéFalta sobre el título del formulario,
  reutilizando `assets/quefalta-logo-blue.png`; todo el bloque principal queda
  situado 20 px por encima del centrado base.
- El papel de fondo muestra quince burbujas azules radiales de distintos
  tamaños, estáticas, no interactivas y ocultas para accesibilidad.
- Actualizados título y subtítulo para presentar la compra organizada y las
  funciones de comparación, ofertas, novedades y cambios de precio, también en
  catalán.
- El formulario de acceso por correo se despliega como continuación directa del
  botón que lo abre, compartiendo fondo, borde y radios exteriores.
- Altura y opacidad se animan al abrir y cerrar; Reducir movimiento mantiene el
  cambio inmediato. El panel oculto no recibe toques ni se anuncia por
  accesibilidad.
- El scroll conserva su offset al abrir: texto y botones superiores permanecen
  inmóviles y todo el crecimiento visible sucede bajo el botón de correo. Solo
  se revela la parte inferior al enfocar el campo y aparecer el teclado.
- Retirado del panel el texto «Sin contraseña…»; el campo de correo es ahora
  su primer elemento.

## Cierre de auditoría de arranque y Login (local, 2026-08-21)

- Eliminada la pantalla vacía potencial entre splash y fuentes con una vista de
  continuidad en `App`; `ThemeContext` y `LanguageContext` montan con valores
  seguros y exponen `ready`, incluidos en el `BootLoader` y su watchdog.
- `authStorage` captura lecturas fallidas del llavero y las interpreta como
  sesión vacía/legacy, por lo que Supabase deja de repetir `ERR_KEY_CHAIN` en su
  auto-refresh. Las escrituras nuevas siguen exigiendo SecureStore.
- Loader inicial mínimo 350 ms. Login validado en simulador con texto normal y
  `accessibility-large`; escalas acotadas, legal desplazable y panel de correo
  unido que abre hacia abajo sin mover cabecera, Apple ni Google.
- Google usa la G oficial multicolor; Apple reserva su espacio desde el primer
  frame de iOS. Las 15 burbujas se dibujan con un solo SVG.
- `inlineRequires` activado en `metro.config.js`; imágenes de mascota y Froiz
  ajustadas a resolución de uso. Export iOS: 1.868→1.828 módulos y
  15.236→11.532 KiB totales; Hermes 7.460.130→7.597.028 bytes.
- Metadatos Xcode alineados en 1.3.0 (34) y referencia huérfana a
  `QuFaltaTests` retirada del scheme compartido. Sin migraciones ni cambios
  remotos de Supabase.

## Bienvenida animada a QuéFalta Plus (local, 2026-08-22)

- Añadida `PlusWelcomeTransition`, superposición a pantalla completa del paywall
  con fundido negro de 1,5 s, sello dorado brillante sin halo, virutas,
  partículas y mensaje de bienvenida en castellano y catalán.
- Eliminado el antiguo modo de vista previa: ambos CTA compran ahora el paquete
  seleccionado y la transición solo aparece si RevenueCat devuelve el
  entitlement `plus` activo. La expiración validada se refleja inmediatamente en
  el perfil local mientras el webhook completa la persistencia en Supabase.
- Respeta Reducir movimiento y puede cerrarse con X, Atrás o escape de
  accesibilidad; al cerrarla se descarta también el paywall.

## Filtros en Cambios de precio (local, 2026-08-21)

- `PriceChangesScreen` añade un botón independiente a la izquierda del selector
  `Bajadas / Subidas` en Liquid Glass y fallback. Su estado activo se marca con
  el acento elegido.
- Reutiliza `ProductFilterSheet` para multiselección de categorías y rangos de
  variación absoluta (≤5 %, 5–10 %, 10–20 %, >20 %). En `Todos`, las categorías
  están agrupadas y cualificadas por supermercado.
- La hoja oculta los controles de precio/orden que no corresponden a este feed,
  conserva la paginación y muestra el vacío específico de filtros sin
  coincidencias. Textos añadidos en castellano y catalán.
- Corregida la salida de `ProductFilterSheet`: ya no encadena un desplazamiento
  manual con el `slide` nativo del modal. Al comenzar un gesto vertical hacia
  abajo desde el tirador, actualiza inmediatamente `visible=false`; la única
  transición nativa termina el cierre sin esperar a que se suelte ni poder
  rebotar. Botón, backdrop y Atrás usan exactamente el mismo cierre.
- Typecheck, lint y 27/27 tests correctos; falta recorrido visual en
  dispositivo/simulador.

## Buscador ampliado de Catálogo (local, 2026-08-21)

- Al enfocar el buscador de productos, su expansión desplaza y oculta todos los
  controles de orden y vista de la fila; al perder el foco reaparecen.
- La superficie y la lupa ya no se sustituyen al cambiar de estado: el mismo
  botón se transforma lentamente en una cápsula redondeada y vuelve exactamente
  a su posición circular, eliminando el tirón del icono al contraerse.
- Se aplica por igual a Liquid Glass y al fallback.
- Corregido el salto vertical de la cabecera: el campo expandido usa la misma
  altura que la fila contraída (40 px en Liquid Glass y 44 px en fallback), sin
  alterar la medida del chrome ni mover el contenido inferior.

## Orden unitario Plus en Catálogo y Novedades (local, 2026-08-21)

- `€/u↑` y `€/u↓` quedan bloqueados para cuentas gratuitas en las variantes
  Liquid Glass y fallback. Usan un tratamiento neutro con acento, sin candado,
  y abren el paywall con la cabecera compacta, sin texto descriptivo
  contextual y sin modificar la consulta ni el orden activo.
- En cuentas gratuitas, precio total y precio unitario se muestran como dos
  controles independientes. Con Plus se fusionan en la pastilla original de
  cuatro segmentos, incluida la transición del filtro seleccionado. Si Plus
  caduca con el orden unitario activo, se restaura el orden por precio total.
- La versión bloqueada iguala tamaño, pastilla y laterales redondeados al bloque
  de precio; las etiquetas quedan centradas en ambos ejes.
- Novedades y Ofertas exponen orden por precio total y unitario dentro de
  `ProductFilterSheet`; Cambios de precio conserva relevancia y añade el orden
  unitario. En free, solo los botones unitarios muestran candado y abren el
  paywall sin aplicar el orden; una caducidad elimina esa selección. El orden
  por precio total sigue libre donde existe.
- Typecheck, lint sin avisos y 30/30 tests correctos.

## Fondo del carrito activo ligado a Apariencia (local, 2026-08-21)

- `HomeScreen` usa el acento elegido en Perfil → Apariencia como base del
  resumen del carrito activo. Conserva el degradado y los dos círculos
  recortados mediante luces y sombras neutras, sin una paleta azul fija ni
  cambios en la lógica.

## Información y control de notificaciones (local, 2026-08-20)

- Perfil → Notificaciones incorpora una tarjeta de activación y explica tres
  tipos de aviso: carrito compartido, amistad y grupo. Esta pantalla ya no
  muestra una segunda bandeja: los avisos
  recibidos se consultan exclusivamente desde la campana de Inicio.
- El interruptor parte apagado por defecto, pide el permiso del sistema al
  activarse, registra/elimina el token push al instante y ofrece abrir Ajustes
  si el permiso fue denegado.
- La preferencia de AsyncStorage ahora usa
  `@notifications_enabled:${userId}`. Auth reconcilia el token al iniciar sesión
  y elimina uno anterior si la cuenta no tiene la preferencia activa.
- `npm run quality` correcto (typecheck, lint y 27/27 tests). Falta recorrido visual en dispositivo y probar
  aceptar/denegar el permiso con un build nativo.

## Alertas personalizadas (evaluación acotada activa; actualizado 2026-08-23)

- MVP completo en cliente: reglas exactas o por palabras, multi-súper, bajada
  mínima, oferta, vista previa, gestión/pausa y CTA «Avísame» compartido por
  todas las fichas, superpuesto en la esquina superior derecha de la imagen
  mediante `ProductDetailImage`/`ProductDetailHero`.
- «Avísame» conserva la campana y permite crear la primera regla gratuita o
  editar la alerta exacta que ocupa ese hueco. Si ya existe otra regla, abre el
  paywall. Plus mantiene creación ilimitada.
- Perfil abre «Alertas personalizadas» para todas las cuentas. La pantalla
  identifica el cupo gratuito y solo bloquea reglas sobrantes procedentes de
  una suscripción caducada.
- Desplegadas en producción la migración
  `20260820162731_personalized_price_alerts.sql` y sus correcciones de RPC e
  índices. El backfill contiene los 18 catálogos y el verificador transaccional
  pasa. `20260821210209_price_alert_notification_products.sql` está también
  desplegada como `20260823193941` y permite abrir los resultados exactos de
  cada aviso.
- El procesador agrupa por regla y lote de sync y usa la bandeja/push actuales;
  una RPC transaccional impide duplicar la fila de bandeja o el push al
  reintentar. No amplía `send-push` ni acepta contenido desde el cliente.
- Si un producto genera a la vez bajada y
  oferta, el procesador lo cuenta y comunica solo como oferta. Las novedades
  tienen textos propios en push y bandeja, sin caer en el texto de ofertas.
- Cada push `price_alert` lleva el `notificationId` y cada fila de bandeja ya
  conoce su propio id. Ambos abren `PriceAlertResults`, que consulta mediante la
  RPC protegida `get_price_alert_notification_products` los productos exactos
  del aviso y permite abrir sus fichas.
- El editor de reglas por palabras solo ofrece los supermercados activos en
  Perfil → Supermercados que además correspondan a la CCAA actual. Al editar,
  intersecta también la selección guardada con esa lista para no conservar
  cadenas que el usuario haya desactivado. Cada chip sitúa el logotipo local
  del supermercado a la derecha de su nombre.
- Las reglas persisten un emoji de clasificación. Cliente y carrito comparten
  `getSubcategoryEmoji`; el editor ofrece una vista viva y la tarjeta sustituye
  el icono genérico por el emoji. La migración
  `20260820165618_price_alert_rule_emoji.sql` está desplegada y asignó `🫒` a
  la regla existente de «aceite oliva»; el fallback es `🛒`.
- Añadido y desplegado el modo exclusivo «Novedad» (`new_arrival`): conserva
  los supermercados elegidos, usa `🆕` y no admite palabras, bajadas,
  ofertas, bajada mínima ni vista previa. La migración
  `20260820170935_personalized_alert_new_arrivals.sql` captura inserciones
  publicadas de los espejos y el RPC solo las entrega a este tipo de regla.
- Evaluación del lunes 24-08-2026: `process-price-alerts` v2 y la nueva RPC
  `claim_price_alert_deliveries_for_user` están acotadas exclusivamente a
  `@rruizosma`. Se crearon seis reglas `TEST 1` a `TEST 6` para novedades,
  bajadas, umbral del 10%, ofertas, mezcla/deduplicación y producto exacto.
  La RPC acotada se desplegó como `20260823194159` + corrección
  `20260823194414`.
  El cron de `ops/schedule_rruizosma_price_alert_evaluation.sql` corre cada 15
  minutos y se elimina solo el 25-08 a las 00:00 UTC; prueba HTTP 200 con cola
  inicial vacía.
- La ejecución real fallaba antes de crear la bandeja porque
  `create_price_alert_notification` leía `request.jwt.claim.role`, una GUC
  heredada que PostgREST ya no rellena. La migración
  `20260824194005_fix_price_alert_service_role_claim.sql` está aplicada y
  valida el rol con `auth.jwt()->>'role'`; la RPC continúa revocada para
  `anon`/`authenticated`. Desde `process-price-alerts` v3 se conserva el
  error estructurado si una llamada vuelve a fallar.
- Prueba remota controlada del 24-08 a las 19:42 UTC: un solo lote de `TEST 2`
  quedó `sent`, con entrada de bandeja y resultado del procesador
  `claimed=1`, `sentGroups=1`, `failedGroups=0`. Una segunda ejecución a las
  19:51 UTC envió cuatro grupos representativos adicionales (novedad, bajada
  ≥10 %, oferta y mixta): `claimed=11`, `sentGroups=4`, `failedGroups=0`.
  `process-price-alerts` v4 está ACTIVE: consulta `label, emoji` de la regla,
  limpia prefijos heredados `TEST N ·`, envía el emoji en `data` y lo muestra
  delante del título push. `NotificationsSheet` sustituye para `price_alert` el
  icono genérico por ese mismo emoji. Las cinco notificaciones existentes se
  actualizaron; prueba adicional a las 20:04 UTC correcta con título
  `🍫 Bajadas ≥10% · chocolate` (`claimed=3`, `sentGroups=1`, cero
  fallos). Quedan 500 entregas históricas agotadas en `failed`; no reactivarlas en bloque
  porque producirían varios avisos por regla y sync.
- Pendiente tras valorar la prueba: convertir el procesador en general,
  configurar `PROCESS_PRICE_ALERTS_SECRET` dedicado y activar el cron permanente
  de `ops/schedule_price_alerts.sql` para todas las cuentas.
- Corregido el bucle de «No se pudieron cargar tus alertas»: `ToastContext`
  conserva un valor estable y un error remoto ya no vuelve a disparar el
  `useFocusEffect` de la pantalla indefinidamente.
- Si Plus caduca, el procesador crea solo el registro deduplicador en estado
  `paused`; no envía y los avisos vencidos no reaparecen al renovar. Las reglas
  siguen en BD, pero el acceso desde Perfil queda reservado a cuentas Plus.

## Fondo Plus en «Todos» (local, 2026-08-20)

- El paywall abre con una cabecera más baja: sello dorado compartido de
  `VerifiedBadge` y título en una sola fila, sin el bloque «Más control para
  encontrar el mejor precio» ni subtítulos contextuales desde ningún acceso.
- La presentación es ahora de altura completa hasta el borde superior, con zona
  segura para el contenido. Se retiraron tirador y cierre exterior, y el gesto
  de descarte está desactivado; solo cierran la X o Atrás del sistema.
- Mensual y Anual ocupan dos columnas de una misma fila; Anual conserva la
  preselección y «Mejor precio». La etiqueta «Incluido» se retiró del título
  «Todo lo que desbloqueas». Anual reutiliza el ritmo del barrido diagonal de
  QuéCocino con una franja azul difuminada e irregular, estática cuando el
  sistema solicita Reducir movimiento. «Mejor precio» usa directamente
  `PremiumGoldBackground`, con su tinta oscura. «Todo lo que desbloqueas» no
  muestra checks a la derecha de sus filas.
  El comparador figura como «Radar de
  ahorro», con una descripción explícita de alternativas similares más baratas.
- El borde activo de los planes es una superposición absoluta: conserva los 2 px
  visuales sin alterar la altura de la fila ni mover el CTA al alternar entre
  Mensual y Anual.
- «Buscar productos más económicos» mantiene sus iconos de búsqueda, carga y
  resultado. En cuentas gratuitas reutiliza el fondo dorado, añade un candado y
  abre el paywall sin texto descriptivo contextual y sin invocar el comparador;
  con Plus usa el estilo normal.
- Catálogo y el selector compartido por Cambios de precio, Novedades y Ofertas
  muestran en «Todos» el fondo dorado animado solo cuando la opción está
  bloqueada para una cuenta gratuita; con Plus vuelve al diseño normal.
- El efecto se centralizó en `PremiumGoldBackground`, tiene una opacidad base
  del 30 %, respeta Reducir movimiento y detiene la animación cuando el panel de
  supermercados está cerrado. La etiqueta «Mejor precio» del plan anual mantiene
  una excepción al 70 %.
- Retirados los accesos Plus de la tarjeta de identidad. `@usuario` queda a la
  derecha del avatar y centrado solo en el eje Y; la fila de Cuenta es el único
  acceso al paywall o a la gestión de la suscripción.
- «Color personalizado» en Apariencia usa el mismo fondo solo cuando está
  bloqueado; con Plus activo muestra una fila normal.
- `premium_until` futuro es la única fuente de verdad de Plus. `verified` pasa a
  ser su reflejo público protegido para la insignia dorada en Perfil, Amigos y
  Grupos; el trigger lo sincroniza y el cliente no puede editarlo. Migración
  `20260820163441_sync_plus_verified_badge` aplicada en remoto: 2 cuentas Plus,
  2 insignias y 0 discrepancias tras el backfill.
- Cada bloque usa una semilla de movimiento propia para variar posiciones,
  trayectorias, fases y velocidad; no hay partículas sincronizadas entre ellos.
- La animación es una caída vertical continua: cada elemento cruza el borde
  inferior, se oculta durante el retorno y reaparece arriba sin reinicio grupal.
- Las rejillas añaden una celda invisible cuando el número de supermercados es
  impar para impedir que la última tarjeta ocupe las dos columnas.

## QuéCocino reactivado para desarrollo (local, 2026-08-30)

- La pestaña QuéCocino vuelve al árbol de navegación mediante
  `QUE_COCINO_ENABLED = true`, tanto en Liquid Glass como en la variante clásica.
- La pantalla, el icono y sus traducciones siguen siendo una implementación
  preliminar: muestra cuatro recetas de ejemplo escritas en el cliente y el
  espacio reservado para recetas oficiales de supermercados.
- Todavía no existe backend, persistencia ni detalle de receta. El contenido de
  muestra no debe interpretarse como contenido publicado por usuarios reales.

## Push de solicitudes de amistad (local + backend desplegado, 2026-08-20)

- La solicitud ahora selecciona su `friendshipId` y espera la invocación
  best-effort de `send-push`, evitando abandonar la petición remota al terminar
  inmediatamente la acción del cliente.
- `send-push` v7 está ACTIVE en producción. Valida la solicitud exacta y mantiene
  compatibilidad con versiones publicadas que solo mandan `addresseeId`.
- Los taps de tipo `friend` quedan en cola hasta que el navegador autenticado
  esté listo y abren directamente Perfil/Inicio → Amigos, también en arranque
  en frío. Pendiente: validar extremo a extremo con dos dispositivos reales y
  notificaciones activadas en el receptor.

## Valoración nativa de las tiendas (local, 2026-08-20)

- Sustituido el modal propio de valoración y su redirección por
  `expo-store-review`, que solicita el cuadro oficial de App Store o Google Play.
- La primera apertura autenticada arma el plazo local por usuario. Una
  reapertura posterior tras 24 horas realiza un solo intento; la tienda conserva
  el control sobre si lo muestra y no devuelve la puntuación ni el resultado.
- Eliminados el componente, estilos y textos del popup anterior. Requiere nuevo
  build nativo; pendiente de validar en dispositivo/distribución de pruebas.

## Fondo ambiental en Inicio (local, 2026-08-18)

- Implementado localmente en `HomeScreen`: degradado tenue basado en el accent,
  con formas ambientales amplias y discretas detrás del contenido.
- Añadida una prueba visual con veintiuna burbujas del color de acento estáticas, combinando
  tamaños pequeños, medianos y grandes, difuminadas mediante degradado radial
  y sin incorporar recursos raster.
- Respeta tema claro/oscuro, accent personalizado, gestos y accesibilidad. No
  incorpora recursos nuevos ni modifica la jerarquía funcional de Inicio.

---

## Login directo (local, 2026-08-20)

- Eliminada la portada gestual de la burbuja, junto con su shader, fallback,
  textos y estado de revelado. La app sin sesión muestra directamente el
  formulario actual de Apple, Google y correo, con sus enlaces legales.
- Retirada `@shopify/react-native-skia`, que no tenía otros consumidores. Se
  conservan Reanimated, Gesture Handler, SVG, Haptics y `expo-glass-effect`
  porque siguen siendo dependencias activas del resto de la app.
- Los flujos de autenticación no cambian; Google mantiene PKCE.

## Código postal y comunidad en el primer paso (local, 2026-08-18)

- Al completar un CP válido, la tarjeta del código postal se contrae desde la
  derecha y la comunidad autónoma aparece a su lado; ambas terminan al 50 % y
  con la misma altura.
- La transición respeta Reducir movimiento y solo se activa en el primer paso;
  Ajustes y el gate existente conservan su composición vertical.
- `npm run quality` correcto (typecheck, lint y 27/27 tests).

## Primer paso sin transición de entrada (local, 2026-08-19)

- Eliminada la bajada completa de `OnboardingShutter` y la transición entre la
  mascota agarrada y la sentada. Fondo, contenido y formulario aparecen desde
  el primer render.
- `berenjena-sentada-ok.png` queda directamente en su posición final y el campo
  de usuario conserva el enfoque automático al montar.
- `npm run quality` correcto (typecheck, lint y 27/27 tests).

## Paso 2 del onboarding con persiana azul (local, 2026-08-18)

- Implementado localmente, sin commit: `Username` navega inmediatamente a
  `Stores`, que ahora replica el fondo azul con lamas del primer paso.
- Se eliminaron «Paso 2 de 5» y el subtítulo «Mostraremos sus catálogos y
  precios…». La mascota con carrito queda fija, completa y
  adaptada a la altura sobre un grid desplazable; el CTA también permanece
  visible. El indicador de selección queda fijo en la esquina superior derecha.
  Recurso: `berenjena-carrito-transicion.png`.
- El grid usa la comunidad guardada en el paso 1. Se completó la huella de las
  cadenas regionales nuevas: Plusfresc `ES-CT`/`ES-AR`, Gadis `ES-GA`/`ES-CL`,
  Froiz `ES-GA`/`ES-CL`/`ES-CM`/`ES-MD` y Ahorramás
  `ES-CM`/`ES-MD`/`ES-CL`; HiperDino continúa limitado a `ES-CN`.
- `npm run quality` correcto (typecheck, lint y 27/27 tests).
- Falta validar la composición visual con una cuenta que tenga el onboarding
  incompleto en dispositivo o simulador.

## Paso 3 del onboarding con mascota selfie (local, 2026-08-19)

- Generada e integrada `assets/mascot/berenjena-selfie.png` (512×768, RGBA con
  alfa real): la berenjena aparece completa haciéndose un selfie con un móvil.
- `AvatarScreen` adopta fondo azul con lamas, volver flotante, título superior
  sin subtítulo, tarjeta clara de foto y footer fijo con Continuar/Ahora no. La
  cabecera empieza justo bajo el botón de volver y la mascota aparece entre la
  tarjeta y el footer, con 50 px adicionales de ancho y alto respecto al primer
  diseño reducido.
- Se conserva `expo-image-picker`, el recorte 1:1, la subida existente y la
  posibilidad de omitir; no hay cambios de backend ni migraciones.
- `npm run quality` correcto (typecheck, lint y 27/27 tests).

## Paso 4 del onboarding con amistades (local, 2026-08-19)

- Generada e integrada `assets/mascot/berenjena-amigos.png` (1024×1536, PNG
  RGBA): la berenjena aparece entre las nuevas mascotas plátano y tomate, que
  le dan una mano cada una.
- `FriendsScreen` replica la persiana azul con lamas, volver flotante, cabecera
  superior, composición de mascotas al 50 % de su tamaño inicial, buscador y
  resultados claros, y footer fijo con Continuar/Ahora no. Conserva la búsqueda
  y el envío de solicitudes existentes.
- El buscador queda fijo; la lista de usuarios es la única zona desplazable y
  muestra el indicador vertical nativo (persistente en Android).
- Optimizado el typeahead tanto aquí como en Perfil → Amigos: primera consulta
  válida inmediata, siguientes a 100 ms, cancelación con `AbortController` y
  filtrado local provisional del prefijo anterior. El `EXPLAIN ANALYZE` remoto
  con rol autenticado y RLS dio ~5 ms sobre unas 3.900 filas, así que no se tocó
  el esquema.
- `npm run quality` correcto (typecheck, lint y 27/27 tests).

## Paso 5 del onboarding con primer grupo (local, 2026-08-19)

- `GroupScreen` deja `OnboardingLayout` y completa el lenguaje visual de la
  persiana azul: volver flotante, título/subtítulo, mascota con carrito, tarjeta
  clara para el nombre y sugerencias rápidas sobre el fondo.
- El footer fijo mantiene visibles Continuar/Crear grupo y Ahora no; al aparecer
  el teclado, el contenido intermedio es desplazable sin perder la acción. Las
  dos acciones completan `onboarded_at` y abren directamente Inicio; se eliminó
  la pantalla terminal «Todo listo». Si se crea el grupo, queda como carrito
  activo; la misma autoactivación se aplica al primer grupo creado desde Grupos.
- Generada e integrada `assets/mascot/berenjena-grupo.png` (1024×1536, PNG
  RGBA): la berenjena empuja el carrito, el plátano va dentro y el tomate queda
  a la derecha; las tres mascotas saludan. `createGroup`, los hápticos, el toast
  y el carácter opcional del paso se conservan sin cambios de backend.
- Corregida la máscara alfa de los huecos interiores del carrito: ya no quedan
  placas blancas entre las barras, bajo la cesta ni alrededor de las ruedas.
- Igualado al morado de la mano el reflejo casi blanco que ocupaba el dedo
  central levantado de la berenjena, conservando un brillo pequeño y natural.
- `npm run quality` correcto (typecheck, lint y 27/27 tests).

## Hipercor (pendiente de migrar y primer sync, 2026-08-15)

- La POC terminó correctamente en GitHub Actions con Google Chrome. El sync
  completo queda en `scripts/sync-hipercor.mjs`, con workflow diario
  `sync-hipercor.yml` y esquema `supabase/migrations/hipercor_catalog.sql`.
- Ejecutar primero la migración y luego el workflow manual. El guardarraíl
  exige 10.000 productos antes de modificar Supabase. El catálogo representa
  únicamente el centro público sin CP/dirección; aún no añadir Hipercor al
  cliente, filtros ni comparativa hasta validar ese primer run.

## Actualización Fase 3 (2026-08-14)

Desplegada y verificada en Supabase, todavía sin commit local:

- Auditoría real: 44 avisos de seguridad y 121 de rendimiento.
- Nueva migración `20260814141719_phase_3_security_performance_hardening.sql`:
  rutas seguras de funciones, RPC privilegiados sin acceso anónimo, RLS
  consolidada y optimizada, y seis índices de claves foráneas.
- Resultado: seguridad 44→20 y rendimiento 121→69. Los seis índices nuevos aún
  figuran «sin uso» porque no han recibido tráfico suficiente.
- SQL validado, preflight correcto, verificador ejecutado y policies compiladas
  con rol autenticado. Falta QA manual con cuentas reales en la app.
- La repetición final de `npm run quality` queda bloqueada por trabajo local
  concurrente de Froiz/Gadis con errores TypeScript; no pertenece a la Fase 3 y
  no se modificó durante este despliegue.
- Debe aplicarse después de scripts legacy que vuelvan a crear estas funciones o
  policies. No mover `pg_trgm` ni borrar índices «sin uso» sin métricas.
- Reversión funcional disponible en `supabase/ops/rollback_phase_3_access_changes.sql`.
- Ajuste manual pendiente: activar leaked-password protection en Supabase Auth.

Detalle: `FASE-3-SEGURIDAD-RENDIMIENTO-DATOS.md`.

## Actualización Fase 2 (2026-08-14)

Implementada localmente, sin commit ni cambios remotos:

- Accesibilidad: animaciones, transiciones y expansiones respetan Reducir movimiento; toast, filtros, cantidades, segmentos, selectores y hojas exponen etiquetas/estados.
- Diseño: contraste AA reforzado para textos secundarios y los seis accents; objetivos táctiles compartidos de al menos 44 pt.
- Texto grande: Login se reorganiza en una columna con `accessibility-large` y evita desbordamientos; iPad mantiene la composición completa.
- Recursos: importación directa de Ionicons y Space Grotesk, Montserrat sin uso eliminada; export iOS 57→38 recursos, 1.524→1.470 módulos y 6,15→5,81 MB de Hermes.
- `npm run quality` y Xcode Release correctos; 27/27 tests. Falta recorrido VoiceOver/TalkBack autenticado y dispositivo físico.

Detalle: `FASE-2-ACCESIBILIDAD-DISENO.md`.

## Actualización Fase 1 (2026-08-14)

Implementada localmente, sin commit ni cambios remotos:

- ESLint: 82 → 0 avisos; CI exige cero.
- Arranque: mínimo del BootLoader 2.000 → 350 ms y pestañas bajo demanda.
- Catálogo/Novedades/Ofertas/Cambios: colecciones, comparadores, cachés y efectos estabilizados para evitar trabajo repetido.
- Login: fallos de Apple/Google localizados y sin texto técnico; contenido centrado en iPad.
- `npm run quality`, export iOS y Xcode Debug/Release correctos; Release revisada en iPhone 17e e iPad mini.
- `ios/.xcode.env.local` (ignorado) se corrigió de Node 24.9.0 a 22.23.2 en esta máquina.

Detalle y pendientes de QA física: `FASE-1-ESTABILIDAD-RENDIMIENTO.md`.

## Actualización Fase 0 (2026-08-13)

Se ha creado una línea base técnica sin cambios funcionales ni mutaciones remotas:

- Node 22.23.2/npm 10.9.8 fijados y controles de calidad reproducibles.
- CI para typecheck, lint y 27 pruebas existentes.
- Compilaciones Debug y Release verificadas en Xcode 26.5; login revisado en iPhone 17 Pro, iPhone 17e e iPad mini simulados.
- Supabase auditado en modo lectura: las columnas críticas y los tres RPC que usa el cliente existen. Las listas de migraciones de este handoff son históricas y no deben interpretarse ya como ausencia de columna sin contrastar el esquema remoto.
- No se aplicaron migraciones, no se modificó lógica de producto y no se creó commit.

Resultados y pendientes de dispositivo físico/cuenta QA: `FASE-0-LINEA-BASE.md`.

## Actualizacion CP: Consum y Plusfresc (2026-07-16)

Implementado localmente, sin migrar ni sincronizar en Supabase. Consum barre 5
`X-TOL-ZONE` y escribe `regions`/`regional_prices` (ejecutar
`consum_regions.sql` antes); Plusfresc barre sus 8 centros y escribe
`centers`/`center_prices` (incluido en `plusfresc_catalog.sql`, pendiente). El
cliente ya aplica el CP en busqueda, listado, categoria y detalle. DRY_RUN OK:
Consum 131 productos/1 pagina/zona; Plusfresc 7.927 en la union de los 8 centros.
Falta ejecutar SQL y los syncs reales con service_role.

El histórico de precios por ubicación de Consum/Plusfresc usa
`catalog_location_price_history.sql`: los syncs rellenan
`catalog_location_prices` (precio efectivo por producto+zona/centro) y un
trigger escribe los cambios en `catalog_location_price_changes`. La primera
pasada solo establece la base; los cambios se registran desde el siguiente sync.

## 1. Qué está commiteado/pusheado vs. SOLO en local

Esto es lo primero que se pierde en un traspaso. Repo de la app = `github.com/rruizosm/QueFalta`, rama `main`.

**Commiteado y pusheado a `main`:**
- Fix `markStale` 57014 (lotes+reintentos, `scripts/lib/stale.mjs`) — commit `1a6032c` (2026-07-10).
- OTA Android (fix "icono pillado") a canal production — commit `1a6032c` (2026-07-10).
- Eroski (8º) + Caprabo (9º), backend Tapestry compartido — commit `6e72611` (2026-07-11).
- Fix nombre de columna `ean` (bonÀrea/Consum/Dia, renombrado `ean13`→`ean`) — commit `3158318`
  (2026-07-15), **quirúrgico**: SOLO el nombre de columna, SIN arrastrar la multi-zona Dia/Carrefour.
- (Repo web aparte `QueFalta-Web`) AEO F0–F3 — commit `a5c4ff3` (2026-07-12).

**SOLO en local (NO commiteado) al 2026-07-15 — el grueso del trabajo reciente:**
- **Supers nuevos sin commitear:** Ametller (11º), Aldi (12º), Hiperdino (13º), Alcampo (14º), Plusfresc (15º).
  Condis (10º) estaba con "commit en espera" porque Ametller rompía el typecheck a medias — verifica su estado real.
- **Multi-zona Carrefour** (barrido por comunidad, `regions`/`regional_prices`) — local.
- **Multi-zona Dia** (barrido 48 CP, `regions`) — local.
- **Vínculo bonÀrea↔OpenFoodFacts** (`off_code`, script + migración) — local, sin ejecutar.
- **Comunidad autónoma → filtro de supers** (F0–F5: `profiles.region` + `regions.ts` + onboarding paso 3) — local.
- Distintas migraciones SQL **sin ejecutar** (ver §3).

> Regla de oro: antes de "seguir" cualquier súper o feature de abajo, comprueba con `git status` /
> `git log` si ya está dentro. La memoria decía "local" pero pudo commitearse después.

---

## 2. Supermercados (espejos de catálogo) — estado

15 espejos + Mercadona en vivo. Un sync por súper en `scripts/sync-*.mjs` (workflows `sync-*.yml`,
cron lunes escalonado). Tras CADA súper nuevo hay que **re-ejecutar `similar_products.sql`** (lleva un
brazo por tabla). Estado al 2026-07-15:

| # | Súper | Backend del sync | Commit | Migración ejecutada | Notas |
|---|-------|------------------|--------|---------------------|-------|
| 1 | Mercadona | API pública en vivo | ✅ | — | Publicado. Multi-almacén (~48 wh). Bilingüe `lang=ca`. |
| 2 | Bonpreu | Navegador headless (WAF) | ✅ | ⚠️ publicación reanudable | Staging bilingüe por Actions; falta desplegar `20260729184317_bonpreu_resumable_publication.sql` junto al script que recupera el cursor. |
| 3 | bonÀrea | API JSON propia (ShoppingBody) | ✅ (col `ean`) | ⚠️ ficha/off pend. | Ficha bilingüe es/ca. `off_code`↔OFF listo pero SIN ejecutar. |
| 4 | Carrefour | fetch SSR `__INITIAL_STATE__` | parcial | ⚠️ regions/offers | Ficha más rica. Multi-zona + ofertas LOCAL. Corre en local (Cloudflare). |
| 5 | Consum | API REST abierta | ✅ | ⚠️ | EAN + marca estructurados. Sin ficha (no la expone). |
| 6 | Dia | SSR Vike `vike_pageContext` | ✅ base | ⚠️ multi-zona local | Ficha es. Multi-zona 48 CP LOCAL. |
| 7 | Sorli | Playwright bootstrap + fetch | ✅ | ⚠️ | Bilingüe es/ca. nutriScore propio vacío 99%. |
| 8 | Eroski | Tapestry (`lib/eroski-tapestry.mjs`) | ✅ `6e72611` | ⚠️ nutrición | es-only, €/kg-L-ud desde el tile, sin EAN; nutrición PDP incremental local. |
| 9 | Caprabo | Tapestry (compartido con Eroski) | ✅ `6e72611` | ⚠️ nutrición | Idem Eroski. |
| 10 | Condis | Empathy.co API JSON abierta | ⚠️ dudoso | ⚠️ | Bilingüe. Sin ficha v1. "Commit en espera" por Ametller → VERIFICAR. |
| 11 | Ametller | SCAPI Salesforce (guest PKCE) | ❌ local | ⚠️ | Bilingüe + ficha + EAN. Logo placeholder. |
| 12 | Aldi | SSR Algolia embebido (`__NEXT_DATA__`) | ❌ local | ⚠️ | es-only, sin EAN. Guardarraíl <800. Logo placeholder. |
| 13 | Hiperdino | Magento 2 GraphQL abierto | ❌ local | ⚠️ | **SOLO Canarias (IGIC)** → filtrar por comunidad. es-only, sin ficha; €/ud local pendiente de backfill. |
| 14 | Alcampo | Ocado, patrón Dia (product-pages) | ❌ local | ⚠️ | es-only CON ficha (EAN/origen/operador). Nacional (no multi-zona). |
| 15 | Plusfresc | API REST ASP.NET (JWT guest) | ❌ local | ⚠️ | **Solo Catalunya (ES-CT)**. Bilingüe + ficha con ALÉRGENOS legibles. |

**Descartados/no viables:** Lidl (sin espejo: ~75% sin precio, IAN≠EAN). Alcampo NO multi-zona
(surtido nacional idéntico). Condis tienda 718 = superconjunto (no multi-tienda).

Cada súper tiene su `scripts/README-*-sync.md`. Los detalles de cada backend y sus gotchas están en
CONTEXTO.md §"Migraciones SQL pendientes" (cada `*_catalog.sql` lleva un párrafo).

---

## 3. Migraciones SQL — ejecutar en Supabase (a mano)

La lista **completa y anotada** está en CONTEXTO.md. Aquí, lo esencial y el ORDEN:

**Ya ejecutada:** `ean_unify.sql` (rename `ean13`→`ean` en las 14 tablas) ✅.

**Bloqueantes de arranque** (el cliente ya `SELECT`ea la columna → la app crashea sin ellas):
`profile_onboarding.sql`, `profile_premium.sql`, `profile_region.sql`, `profile_verified.sql`,
`list_items_store_product_id.sql`, `favorites_store.sql`, `catalog_unaccent_search.sql`,
`mercadona_catalog_ca.sql`.

**Órdenes que importan:**
- `fix_bonpreu_prices.sql` **ANTES** de `catalog_price_changes.sql` (si no, cambios de precio falsos).
- Bonpreu: `20260728182501_bonpreu_sync_staging.sql` → `20260729184317_bonpreu_resumable_publication.sql`; desplegar la segunda junto al sync actualizado, nunca con el script antiguo.
- `profile_premium.sql` → `paywall_gates.sql` → (re)`similar_products.sql`.
- `carrefour_offers.sql` y `carrefour_regions.sql` **ANTES** del próximo sync de Carrefour (el `upsert` las incluye).
- Cada `bonarea/dia/carrefour_product_detail.sql` antes del sync de su súper (pasada de ficha).
- `20260718133958_eroski_caprabo_nutrition.sql` y después
  `20260719102703_eroski_caprabo_product_detail.sql` antes de los próximos syncs
  de Eroski/Caprabo; añaden la ficha nutricional y los campos `ingredients`,
  `conservation` y `manufacturer`.
- `20260718183152_catalog_browse_indexes.sql` añade índices parciales para la
  navegación alfabética keyset de todos los catálogos. Es aditiva y no bloquea
  el arranque, pero debe ejecutarse para obtener toda la mejora de rendimiento.
- Migración de cada súper nuevo (`ametller/aldi/hiperdino/alcampo/plusfresc/condis/eroski/caprabo_catalog.sql`)
  → luego **re-ejecutar `similar_products.sql`**.

**Redeploys de Edge Functions asociados:** tras `push_tokens_lang.sql` y `notifications_inbox.sql` →
`supabase functions deploy send-push`.

**Multi-zona / OFF (local, sin ejecutar):** `dia_regions.sql`, `carrefour_regions.sql`, `bonarea_off_code.sql`.

---

## 4. Multi-zona por comunidad / código postal

- **Dia:** `sync-dia.mjs` barre 48 zonas (check-service + save-shipping-address por CP). `regions` =
  disponibilidad por CCAA (`null` = nacional = en todas las CCAA barridas). Falta `dia_regions.sql` + relanzar. LOCAL.
- **Carrefour:** regionaliza catálogo Y precio por almacén (`werks_id`, 48 en España; sin cookie = Madrid
  COL PINAR). El sync barre **1 capital por comunidad** (~18 crawls, ~2 h) fijando la cookie `salepoint`.
  Columnas base = Madrid (la app no cambia hasta implementar el filtro). Falta `carrefour_regions.sql` +
  1er run (subir el `-ExecutionTimeLimit` de la tarea de Windows a ~4 h). LOCAL.
- **Filtro por comunidad (transversal):** `profiles.region` + `src/constants/regions.ts` + código postal
  integrado en el paso 1 + gate/filtro de catálogo. Necesario para no enseñar cadenas regionales fuera
  de su zona. F0–F5 en local, typecheck verde, sin validar en device. Ver
  `COMUNIDAD-AUTONOMA.md`. **Ejecutar `profile_region.sql` antes de arrancar.**
- **Alcampo/Condis/Mercadona:** NO multi-zona (Alcampo surtido nacional; Condis 718 = superconjunto;
  Mercadona ya multi-almacén por su cuenta).

---

## 5. Nutrición / OpenFoodFacts (estrategia de datos)

- **OFF API** probada 2026-07-14/15: lookup por EAN sin API key (con User-Agent identificativo). v3 sin
  buscador (v2 `search` = única búsqueda estructurada). Tope anónimo 1.000/consulta → multi-ventana
  `sort_by`. 7,5 req/min o llueven 503. En marcas con carnicería ~70% son códigos de bandeja → auto-vincular
  solo EAN `84…`.
- **Cobertura con nutrición YA** (2026-07-15): Carrefour 8,6k · Dia 3,9k · Ametller 2,2k · bonÀrea ~80% al
  correr syncs · Consum sin ficha PERO 9,5k EAN→OFF directo · Sorli nutriScore propio vacío 99%.
- **Estrategia:** OFF-oficial > calculado-estimado > visión. (Health score por visión: solo Mercadona,
  Plus; backend hecho, falta UI+run — ver memoria `health-score-nutricional`.)
- **Vínculo bonÀrea↔OFF:** matcher token-set (231 ALTA / 242 revisar / resto fresco sin match). Usa
  `off_code` y **NO** `ean` (el sync pisa `ean` cada lunes + semántica multipack). Script + `bonarea_off_code.sql`
  LISTOS pero SIN ejecutar/relanzar. Matcher reutilizable para otros espejos sin EAN.

---

## 6. Otras features transversales en vuelo

- **Liquid Glass iOS** (solo iOS 26+, Android intacto): F0–F3 hechas (barra flotante, campana+panel,
  Cambios de precios, Catálogo). Typecheck verde, **sin validar en device**. Validación por canal `preview`
  (`eas update --channel preview --platform ios`). **PROHIBIDO glass a production hasta validar F1–F5.**
  Ver `LIQUID-GLASS.md`.
- **Android / Google Play** (`ANDROID.md`): closed testing corriendo desde ~2026-07-08 (12+ testers). Queda:
  pegar huella SHA-256 en `assetlinks.json`, push web, data safety, content rating, ficha es/ca, cuenta de
  prueba. ⚠️ iOS y Android comparten canal `production` → OTA a production es peligroso (el repo lleva glass
  sin validar).
- **Notificaciones:** bandeja server-side (`notifications` + `send-push` la rellena) e idioma por dispositivo
  (`push_tokens.lang`, es/ca). Faltan `notifications_inbox.sql` + `push_tokens_lang.sql` + redeploy `send-push`.
- **Sign in with Apple:** flujo nativo iOS funcionando. Revocación de token al borrar cuenta montada, **pendiente
  `.p8` + secrets + deploy**. (Nota: `AGENTS.md`/`AGENTS` viejo decía Expo v56 — el proyecto es SDK 54.)
- **Insignia Plus** (dorada): `profiles.verified` es un reflejo público protegido
  de `premium_until` + `VerifiedBadge`. Backfill/trigger desplegados en remoto.
  `revenuecat-webhook` aún no existe en producción: antes de desplegarlo hay que
  configurar `RC_WEBHOOK_TOKEN`; el código local ya sincroniza ambos campos.
- **Ranking de búsqueda:** Nivel 1 (cliente) hecho. BUG conocido: las 6 `search*` con `limit 50` SIN `order` →
  50 filas arbitrarias. Nivel 2 (RPC ranking en servidor + offset) especificado en
  `BUSQUEDA-RANKING-SERVIDOR.txt`, pendiente de implementar.
- **Comparativa entre supers** y **Monetización QuéFalta Plus**: ambas DESACTIVADAS por flags
  (`PRICE_COMPARISON_ENABLED` / `PAYWALL_ENABLED` en `src/constants/limits.ts`), código intacto. Ver
  `COMPARATIVA.md` / `MONETIZACION.md`.
- **Seguridad:** fix crítico (profiles legible por anon) + secure-store para tokens (requiere build nuevo) +
  4 SQL pendientes + redeploy webhook. Ver `PRIVACIDAD-SEGURIDAD.md` y memoria `security-hardening`.

---

## 7. Dónde vivía todo esto (para el humano)

El conocimiento acumulado estaba en la memoria de Claude Code, en
`~/.claude/projects/c--Users-ruben-OneDrive-Escritorio-MercaApp/memory/` (índice `MEMORY.md` + ~40 ficheros
`.md`, uno por tema). **Codex no lee esa carpeta.** Este HANDOFF.md + CONTEXTO.md son el volcado para Codex.
Si en el futuro quieres el detalle fino de un tema (p. ej. el truco exacto de la cookie de Carrefour, o el
mapa de APIs de Lidl), está en esos ficheros de memoria.

Repos ecosistema: app `rruizosm/QueFalta` · web `rruizosm/QueFalta-Web` (carpeta hermana `quefalta-web/`) ·
dashboard privado `rruizosm/QueFalta-Datos` (`QueFaltaDatos/`, Astro SSR + service_role).
