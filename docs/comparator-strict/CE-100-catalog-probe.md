# CE-100 — Prueba controlada de lectura del catálogo

2026-09-03. **Histórico de preparación; ejecución posterior realizada. CE-100 abierta.**
Ver [resultado y limitaciones](CE-100-catalog-probe-results.md): 61/61 lecturas
válidas, p95 3,49 s, pero densidad insuficiente por coordinación. El texto
siguiente conserva el protocolo y los pendientes existentes al prepararlo;
la autorización condicional y su ejecución posterior están en el resultado.
El propietario responde «si» a preparar una prueba que no consuma búsquedas.
No se interpreta como dispensa de los límites BU-01 ni de la observación.

## Entregables

- [Manifiesto de destino, límites y autorizaciones pendientes](CE-100-catalog-probe-manifest.json).
- [Auditoría SQL y validación](CE-100-catalog-probe-evidence.json).
- [CLI de una lectura acotada](../../scripts/probe-comparator-strict-catalog.mjs),
  [validador y analizador](../../scripts/lib/comparator-catalog-probe.mjs) y
  [18 pruebas locales](../../scripts/lib/comparator-catalog-probe.test.mjs).

La CLI no lanza un bucle ni un job: emite un plan offline por defecto. Cada GET
necesita confirmación de su hash y manifiesto vigente. La coordinación de la
ventana, SQL y métricas corresponde al operador de esta tarea, que debe reservar
y registrar cada petición. **No es el coordinador duradero CE-102**, no protege
otros procesos y no debe ejecutarse en paralelo al observador de métricas.

## Lectura elegida y alcance representativo

Primera página del catálogo Mercadona, castellano, filtro regional Catalunya,
50 productos publicados, orden por `display_name_norm ASC NULLS LAST, id ASC`.
Son los campos ligeros y la forma de consulta de `browseProducts` / `keysetPage`
en [src/api/catalog.ts](../../src/api/catalog.ts). Su SHA-256 queda fijado: si
cambia el archivo, la CLI se detiene para revisar el caso.

Endpoint único: GET `https://auth.quefalta.es/rest/v1/mercadona_products`.
Proyección, filtros, límite y orden están fijados en el código; no se aceptan
SQL, tablas, destinos o parámetros arbitrarios. Identidad pública `anon`, sin
sesión del propietario ni `service_role` para leer productos. La clave de
servidor del observador de métricas permanece en su vía separada.

La lectura **no llama a v7**, no reclama usos, no genera matches/caché de ahorro,
no manda notificaciones y no consulta al retailer. Se valida un GET real con
contenido, no un HEAD trivial. No equivale a buscar todas las familias/tiendas,
al comparador estricto, al renderizado móvil ni a una prueba de la cuenta
`@rruizosma`. La correspondencia se auditó contra el código local, no contra
los binarios de la versión 1.3. La primera página repetida favorece caché caliente;
no extrapolar a páginas profundas o consultas frías.

## Comprobaciones remotas realizadas

Dos transacciones READ ONLY, timeout 5 s, lock_timeout 500 ms y ROLLBACK; cero
errores y cero escrituras. La segunda usa `SET LOCAL ROLE anon` y EXPLAIN
**sin ANALYZE**: comprueba el plan, no ejecuta la consulta de catálogo para
medir su duración. No se han enviado GET de catálogo en esta preparación.

- RLS activa; SELECT autorizado a `anon`/`authenticated` mediante política
  `catalog read`, condición `true`.
- Plan `Limit → Index Scan`, índice
  `mercadona_products_display_name_norm_browse_idx`. Costes del plan no son ms.
- `anon.statement_timeout=3s`; `authenticated.statement_timeout=8s`;
  `authenticator.statement_timeout=8s` y `lock_timeout=8s`. No se observó un
  override de lock para anon. No se ha provocado un timeout real para validarlo.

PostgREST documenta GET de tablas como READ ONLY y aplica los ajustes del rol
de conexión y después los del rol asumido. La configuración observada implica
3 s por sentencia anónima y 8 s de lock configurado; la sentencia debería
limitar antes la espera total. **No son los 500 ms de lock de BU-01** ni una
comprobación del estado efectivo de todas las conexiones del pool.
[Transacciones y roles de PostgREST](https://docs.postgrest.org/en/stable/references/transactions.html),
[timeouts de Supabase](https://supabase.com/docs/guides/database/postgres/timeouts).

Abortar el cliente a 5 s no demuestra que Postgres haya cancelado la sentencia.
Ante ese caso se registra fallo, se detiene la prueba y se comprueba actividad;
nunca se reintenta automáticamente ni se cancelan sesiones ajenas.

## Protocolo de la ventana, una vez autorizada

1. Reconfirmar ref, hash del caso/código, rol, timeouts, exclusividad del operador
   y presupuesto diario completo. Preflight de menos de 5 min. Registrar cualquier
   excepción con cita del propietario, fecha UTC y alcance exacto. Revalidar
   durante la ventana; no rejuvenecer evidencias copiando su fecha.
2. Obtener una muestra de infraestructura y actividad inmediatamente antes del
   primer GET. Usar la API de métricas existente y el SQL agregado READ ONLY
   de [la revisión anterior](CE-100-capacity-recheck.json), sin textos/IP/UID.
3. Hacer **61 GET** separados por al menos 15 s: 60 pertenecen a tres ventanas
   de 5 min con 20 observaciones; el último cierra al menos 15 min. Máximo
   3.050 filas recibidas, 50 por GET. No aumentar frecuencia para recuperar
   retrasos. Trabajo completo ≤20 min; si faltan muestras, resultado incompleto.
4. Intercalar métricas y actividad en los límites de cada minuto y al final,
   sin solapar operaciones remotas CE-1. El operador espera el final de cada
   operación; el colector autónomo anterior no se arranca en paralelo. La
   cadencia de locks queda explícita: muestreo, no prueba de ausencia continua.
5. Medir tiempo monotónico desde inicio de fetch hasta lectura completa y
   validación. Registrar UTC de inicio, ms, estado, bytes, filas, hash de la
   respuesta o clase de fallo. No guardar claves ni cuerpos de productos/logs.
   Cada CLI crea una conexión cliente nueva; mantener ese mismo procedimiento
   para comparar con un canario posterior, sin llamarlo latencia del móvil.
6. Detener ante cualquier fallo, 403/429, contenido inválido, límite excedido,
   presión de plataforma, bloqueo observado o falta de telemetría. No hay
   retries. No cambiar compute, roles, cron ni configuración para continuar.
7. Correlacionar la misma ventana de lecturas, CPU/memoria/I/O/swap/conexiones
   y locks. Revisar BU-01 y solo entonces proponer cierre de CE-100. La ventana
   anterior de infraestructura no sustituye la nueva captura coincidente.

### Estadísticas y límites de la conclusión

El analizador calcula p95 por rango más próximo (`ceil(0,95×n)`) sobre éxitos;
los fallos siguen en el denominador de la tasa de error y conservan duración.
Informa las tres ventanas y rechaza datos desordenados, cadencia excesiva,
solapamientos, éxitos inválidos o continuar después de un fallo.

Cero fallos en 61 sondas no demuestra una tasa real <1 %: se entrega también
el límite superior Wilson al 95 %. La regla de errores de BU-01 con ≥100 intentos
no se da por certificada con 61. La prueba caracteriza este flujo sintético,
no el tráfico completo. El helper **nunca cierra CE-100 ni autoriza escrituras**
por sí solo; tampoco acepta G1, que conserva las tareas CE-103/105/106.

## Pendientes históricos antes de ejecutar

1. **Transferencia:** la revisión anterior recibió 9.309.177 bytes de métricas.
   Del máximo diario de 10 MiB quedan como mucho 1.176.583 bytes, antes de otras
   lecturas. Una nueva ventana equivalente necesita aproximadamente otros 9 MB
   de métricas, más catálogo/SQL. Se solicitó elevar **solo hoy** el tope a
   22 MiB; todavía no está aprobado. La propuesta no es un gasto nuevo ni un
   cambio de plan contratado, y no garantiza coste marginal cero. Reservar y
   detenerse al alcanzar el tope, incluso si la estimación resultó insuficiente.
2. **Espera HTTP:** aprobar, solo para este caso anónimo, usar la configuración
   existente descrita arriba en lugar del lock de 500 ms. La alternativa exige
   revisar otra vía de ejecución; no modificar roles globales o crear una RPC
   por arrastre para sortear el requisito.
3. Una vez resueltas esas decisiones: renovar captura, reconciliar el presupuesto
   y confirmar coordinación del operador. Los ceros del manifiesto indican
   presupuesto no reconciliado, no que el proyecto tenga cero recursos.

El permiso para preparar y la autorización general de trabajar en Supabase no
se registran como aprobación de estas excepciones. No se crea una automatización
para mañana sin petición del usuario.

## Verificación local

Comando offline para ver el caso y los bloqueos actuales:

```sh
node scripts/probe-comparator-strict-catalog.mjs
```

`npm run quality`: TypeScript y lint correctos; **326/326 tests**, incluidos
18 nuevos. El modo remoto fue rechazado por el manifiesto antes de leer claves
o llamar a la red. Los tests HTTP usan respuestas simuladas, no producción.
La guía Supabase/Postgres ha orientado la revisión de roles/índice y ha evitado
presentar EXPLAIN, abortos de cliente o promedios como validación completa.
