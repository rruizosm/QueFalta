# CE-100 — Preparación del Supabase real

> 2026-09-02 · F1 EN CURSO · CE-100 INICIADA, NO CERRADA.
> CE-005 completada y F0 aceptada (G0 PASS) por instrucción del propietario.
> Diagnóstico de lectura; sin implementación, migraciones ni activaciones.

**Revisión 2026-09-03:** [comprobación de capacidad](CE-100-capacity-recheck.md).
El acceso a CPU/memoria/I/O/conexiones mediante Metrics API ya funciona con
la credencial local existente, sin instalar servicios. CE-100 sigue abierta:
faltan latencia p95, tasa de errores y cobertura temporal comparables del
catálogo. Las secciones siguientes conservan la captura original del 2 de
septiembre; los nuevos datos no convierten las medias o logs incompletos en
una aprobación para escribir.

**Ejecución posterior, 2026-09-03:** [resultados de catálogo](CE-100-catalog-probe-results.md).
61/61 lecturas válidas, p95 3,49 s; densidad insuficiente por la coordinación
de la prueba (18/14/18 muestras por tramo, exigidas 20). CE-100 continúa abierta.
Cuota incluida verificada antes de ejecutar, permiso condicionado a no añadir
coste; 20,94/22 MiB. Roles y ajustes globales intactos; ejecución terminada.

## 1. Resultado y decisión operativa

El destino y los permisos administrativos están identificados. Se verificaron
copias físicas disponibles en el panel, PITR desactivado y margen en las cuotas
incluidas. El compute actual es **Micro, no Medium**: el historial de observación
de Medium no acredita la capacidad de la instancia actual.

CE-100 permanece abierta por evidencia de rendimiento incompleta. El panel
muestra CPU/memoria, pero siete gráficos de red, disco y conexiones no cargan
incluso tras un reintento. Una ventana seleccionada de 30 minutos con indicadores
ausentes no cumple la línea base completa de [BU-01](budget.md). No se aprueba
nueva carga ni escrituras a partir de estas capturas. Se puede continuar con
documentación y comprobaciones de lectura acotadas. Actualización CE-SEQ-001:
el propietario ordena «Empieza con CE-101 y dejamos pendiente cerrar CE-100»;
se inicia su inventario sin dar CE-100 por cerrada ni autorizar carga/escrituras.

El acceso al panel **ya está resuelto**: tras el aviso inicial de login se pudo
consultar la sesión autenticada. No hacen falta contraseñas por chat. Evidencia
estructurada, SQL y limitaciones: [CE-100-evidence.json](CE-100-evidence.json).

## 2. Destino y permisos comprobados

| Elemento | Evidencia | Consecuencia |
|---|---|---|
| Proyecto | QueFalta, `gkffvigcnsesbaihycay`, eu-west-1, ACTIVE_HEALTHY | Ref explícita para operaciones posteriores; el estado es puntual |
| Organización | `trnqzlirexddfnowcifm`, Pro, un proyecto mostrado | Sin nueva instancia ni contratación |
| Postgres | 17.6; release gestionada 17.6.1.127; primario | No es una réplica de pruebas |
| Endpoint | `https://gkffvigcnsesbaihycay.supabase.co` | Metadatos del proveedor reconfirmados |
| Cliente local | `.env.local` presente; URL `https://auth.quefalta.es` | Mapeo al proyecto acreditado en CE-001; no se imprimieron claves |
| Enlace CLI local | No existe `supabase/.temp/project-ref` | No ejecutar `db push`/`link` por inferencia; guardas explícitas en CE-102 |
| Sesión SQL | `postgres`, BYPASSRLS, CREATE ROLE/DB, no superusuario | Permite diagnóstico administrativo; no demuestra permisos del cliente |

El reintento de comprobación DNS pública no obtuvo CNAME (`ENODATA`), tras un
fallo de red en sandbox. Es inconcluso: no invalida el mapeo previo ni demuestra
un fallo del dominio. No se alteró DNS ni la configuración local.

Se inspeccionaron once relaciones y seis funciones, no todo el esquema:

- RLS activada en las once relaciones. Los cuatro catálogos piloto y
  `catalog_location_prices` tienen únicamente políticas SELECT para `anon` y
  `authenticated` entre las políticas consultadas.
- Los cuatro catálogos legacy tienen al menos un grant INSERT/UPDATE/DELETE
  para esos roles. Esto es un punto de mínimo privilegio para CE-103, **no una
  escritura pública demostrada**: RLS no concede escrituras mediante una
  política SELECT. No se ejecutaron pruebas de escritura.
- Embeddings, estado de caché y las cuatro tablas internas consultadas no
  conceden SELECT/escritura a roles de cliente; RLS está activa sin políticas.
- v6/v7 permiten EXECUTE a `authenticated`, no a `anon`. La finalizadora y
  el estado del pipeline no permiten ejecución a ninguno de esos dos roles.
- `authenticated` tiene USAGE en `private`/`comparator_internal` y EXECUTE
  en las dos funciones SECURITY DEFINER seleccionadas, con `search_path`
  vacío. No equivale a exposición HTTP pública ni certifica toda la cadena.
  Inventario de exposición y negativos por rol: CE-101/103/105/106.

No se invocó v7 ni `claim_free_comparator_use`: pueden consumir cuota. Tampoco
se crearon roles, se cambiaron grants o se probaron credenciales de usuario.

## 3. Salud, capacidad y diferencia Micro/Medium

Cuatro SELECT de diagnóstico, secuenciales, en transacciones READ ONLY, cada
una con `statement_timeout=5s`, `lock_timeout=500ms` y ROLLBACK. Cero errores
SQL. Capturas entre 21:24:25 y 21:32:27 UTC; no se exportaron productos, vectores,
perfiles, tokens ni textos de consultas de otros usuarios.

Las dos muestras de actividad no mostraron consultas activas, esperas de lock
ni sesiones idle-in-transaction. La primera tiene 26 conexiones cliente de la
BD actual, excluida la propia; la última 25 en todas las BD, excluida la propia.
Los ámbitos difieren: no convertirlo en tendencia ni capacidad disponible.
`max_connections=60`; las conexiones administrativas y reservas también importan.

El pipeline está `paused` y el cron 17 inactivo a las 21:27 UTC. No se releyó
la longitud de la cola, no se procesaron mensajes y no se reactivó nada.
`pg_stat_statements`, `pg_cron`, `pgmq` y `vector` ya están instaladas.

El [panel de infraestructura](https://supabase.com/dashboard/project/gkffvigcnsesbaihycay/settings/infrastructure)
muestra `t4g.micro` y MICRO seleccionado (1 GB, 2 cores), sin réplicas. Disco GP3
de 8 GB, 4,07 GB usados; tarjeta puntual: CPU 4 %, RAM 68 %, disco 52 %,
27/60 conexiones. La organización registra 309 horas Micro y 2 horas Medium
en el ciclo: no establece quién, cuándo o por qué cambió el tamaño. No se
restauró Medium ni se modificó compute. Las notas anteriores se conservan como
historial, no como configuración vigente.

En el [informe de base de datos](https://supabase.com/dashboard/project/gkffvigcnsesbaihycay/observability/database),
ventana 21:07:33–21:37:33 UTC, se muestran CPU 2,61 %, memoria 904,27 MB y
compromiso de memoria 2,16 GB. Son indicadores del panel: no se estableció si
son último valor/promedio, ni se midieron máximos/p95. No deben compararse
directamente con la tarjeta puntual o con el resumen semanal que muestra CPU
91 %. El compromiso de memoria no es RAM física utilizada.

Persisten errores de carga de red, IOPS, throughput de disco, conexiones BD,
pooler dedicado, pooler compartido y uso de disco. El informe alternativo de
conexiones solicita habilitar una función preview; no se habilitó. Las lecturas
SQL son alternativa para instantáneas, no sustituyen las series temporales.

Otros límites de interpretación:

- `track_io_timing=off`: tiempos de lectura/escritura a cero no prueban I/O cero.
- Contadores SQL son acumulados; `stats_reset` de BD es null. Los rollbacks
  incluyen los deliberados del diagnóstico, no son tasa de error de la app.
- `pg_stat_user_tables` estima 202.953 embeddings vivos y 8.946 muertos;
  no es recuento exacto ni medición de bloat. No se ejecutó VACUUM/ANALYZE.
- El resumen de disco incluye WAL/sistema; 3,14 GB de base de datos no es
  todo el disco consumido. La UI muestra tanto límite de 8 GB por spend cap
  como aviso genérico de autoscale: no se dedujo cómo se resolverá esa tensión.

## 4. Backups y recuperación

El [panel de backups](https://supabase.com/dashboard/project/gkffvigcnsesbaihycay/database/backups/scheduled)
lista diez puntos PHYSICAL, con acciones Restore visibles, del 26 de agosto al
2 de septiembre. Más reciente: **2026-09-02 08:00:12 UTC**. El JSON conserva
las diez fechas. Es evidencia de puntos listados, no de contenido validado o
restauración ensayada; no se pulsó Restore.

El [panel PITR](https://supabase.com/dashboard/project/gkffvigcnsesbaihycay/database/backups/pitr)
ofrece habilitar el add-on: **PITR no está activado**. `archive_mode=on` y WAL
archivado no prueban lo contrario. El archivador registra un fallo el 31 de
agosto y archivos posteriores el 2 de septiembre; no prueba una incidencia
actual ni basta para acreditar recuperación.

Procedimiento para F1, sin ejecutarlo aquí:

1. Antes de una escritura futura, reconfirmar destino, punto recuperable y
   estado; conservar definición/filas anteriores de los objetos afectados.
2. Favorecer reversión acotada de objetos propios de CE-1, con canario y
   prueba en CE-106. No usar una restauración de toda la BD como rollback normal.
3. Una recuperación global podría perder cambios de toda la aplicación
   posteriores al punto elegido. El intervalo desde la última copia no es un
   RPO garantizado; RTO no medido. Restaurar producción requiere decisión
   específica y coordinación, no está autorizado como prueba de preparación.
4. Las copias de BD no restauran los archivos de Storage eliminados; mantener
   ese alcance separado antes de depender de una recuperación global.

Supabase documenta copias diarias en Pro, PITR opcional, exclusión de archivos
Storage y parada del proyecto durante una restauración. El plan contratado no
sustituye la comprobación de los puntos reales anterior.
[Documentación oficial de backups](https://supabase.com/docs/guides/platform/backups).
No se instala PITR por defecto ni se propone gasto nuevo para iniciar F1.

## 5. Cuotas, límites y nuevas integraciones

La [pantalla Usage](https://supabase.com/dashboard/org/trnqzlirexddfnowcifm/usage)
del ciclo 21 de agosto–21 de septiembre indica cuotas Pro no superadas:
egress 3,881/250 GB, Edge Functions 10.799/2.000.000 y Storage 0,029/100 GB.
Compute acumulado mostrado: 4,15 USD Micro y 0,16 USD Medium; descripción de
10 USD de crédito de compute. No es factura final ni coste marginal de CE-1.
Spend cap aparece habilitado; no se desactivó. Los datos tienen retraso de
actualización y el margen de cuota no acredita margen de CPU/RAM.

BU-01 no cambia: cero nuevas contrataciones/ampliaciones; concurrencia remota 1;
20 min por trabajo, hasta 5 min SQL/día y límites de muestras/lotes del presupuesto.
No se lanzaron campañas ni exports. Parar ante umbrales de CPU/conexiones,
bloqueos, errores o dos timeouts; no ampliar timeouts globales para continuar.

No hace falta instalar otra integración para esta tarea: el panel y las
extensiones existentes cubren las vías de diagnóstico. Si persisten los
gráficos ausentes, comprobar primero una vía de métricas ya autorizada;
Supabase ofrece métricas de CPU/I/O/conexiones, pero no se configuró un servicio
ni se extrajeron credenciales para usarlo.
[Métricas oficiales](https://supabase.com/docs/guides/monitoring-and-debugging/metrics).
pgTAP se decide en CE-105 y enriquecimiento de productos en F4.

La revisión de novedades oficiales identifica un cambio del endpoint de logs
el 23 de septiembre: verificar compatibilidad del cliente antes de automatizar
observabilidad; no modificarlo por arrastre aquí.
[Aviso oficial](https://supabase.com/changelog/48235-migration-of-supabase-management-api-logs-all-analytics-endpoint-to-logs-endpoint).

## 6. Pendiente para cerrar CE-100

- Obtener una línea base completa de al menos 15 minutos en Micro: CPU,
  memoria, I/O, conexiones, locks, latencia y errores, con denominadores y
  agregación conocidos. Resolver el acceso a métricas fallidas o documentar
  una alternativa segura dentro de BU-01, sin activar previews/servicios por
  inercia. Repetirla junto a la ventana de cualquier escritura posterior.
- Evaluar esa evidencia contra BU-01 y registrar el resultado de preparación,
  conservando las limitaciones de recuperación. No hace falta habilitar PITR
  ni restaurar producción para cerrar un diagnóstico.
- Cerrar CE-100 explícitamente cuando se complete su evidencia. CE-SEQ-001
  permite empezar CE-101 en lectura sin esperar ese cierre; no elimina este
  pendiente. F1/G1 exige además inventario, guardas, negativos de permisos y
  canario con reversión de tareas posteriores.

Las guías Supabase/Postgres han llevado a limitar consultas a metadatos,
transacciones cortas y privilegios observados, y a separar estadísticas
acumuladas de mediciones de carga. No se modificó código de aplicación ni SQL
de despliegue. Validación local: TypeScript, 35/35 tests de helpers y
`git diff --check` correctos; 14 documentos comprobados, 67 tareas (seis cerradas),
35 regresiones, 14 decisiones y ocho hashes previos conservados. No son pruebas
del comparador estricto desplegado. Evidencia en los JSON de CE-005 y CE-100.
