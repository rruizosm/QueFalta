# Errores Postgres y lentitud de catálogo — 17/09/2026

## Estado

**Nueva revisión, ~22:06–22:12 Madrid:** en la ventana de Logs Explorer
21:06:18–22:06:18 hay **15 errores**, sin timeouts, FATAL/PANIC ni warnings.
Se correlacionaron los mensajes SQL con los estados y roles JWT del API Gateway:

| Operación | Eventos | HTTP / rol | Diagnóstico |
| --- | ---: | --- | --- |
| `record_app_activity` | 7 | 401 / anon | Peticiones sin sesión de usuario; no es un permiso faltante para authenticated. |
| INSERT `list_items` | 3 | 401 / anon | La app intentó añadir productos sin sesión; RLS los rechazó. |
| `set_list_items_in_cart` | 4 | 403 / authenticated | La función no pudo actualizar todos los IDs solicitados: filas ausentes o inaccesibles. |
| `finish_list_purchase` | 1 | 400 / authenticated | Quedaban artículos sin recoger ni aplazar; validación del servidor. |

Los primeros tres grupos proceden del user-agent `QuFalta/52` de iOS; el último,
de `okhttp/4.9.2` (cliente Android, sin número de build en el user-agent).
No se deduce el número de usuarios a partir de esos grupos. Los siete rechazos
de actividad van de 21:09:51 a 21:50:53; los INSERT de 21:50:42 a 21:50:47;
los cuatro cambios de carrito de 21:56:41 a 21:56:50; el cierre a las 21:28:31.

Comprobadas las ACL remotas: authenticated tiene EXECUTE sobre ambas funciones
de actividad; anon no. Las policies INSERT/UPDATE de `list_items` exigen
authenticated y acceso a la lista como creador o miembro del grupo. Por tanto,
no corresponde ampliar permisos para evitar esos errores.

Muestra SQL de las 22:06:43: 26 conexiones, cero bloqueos y ninguna otra consulta
activa. Mismo arranque del proceso que tras el upgrade. Cron 18 completó las
21:30, 21:45 y 22:00 en ~49, 52 y 23 ms. La evidencia disponible sigue sin
mostrar la saturación anterior; no se volvieron a medir CPU ni latencia HTTP.

Prioridad del cliente: impedir escrituras y actividad cuando la sesión efectiva
ha desaparecido, y reconciliar la UI con ese estado. Para los cuatro 403,
refrescar el carrito tras el rechazo; no se puede distinguir con estos logs
entre borrado por otro miembro y pérdida de acceso. En el código local,
`ListScreen.toggle` revierte el estado optimista pero no recarga tras el fallo;
`handleFinish` tampoco espera a que terminen los cambios optimistas pendientes.
Esto ofrece causas plausibles para estados desactualizados y cierres prematuros,
pero no prueba que fueran el desencadenante de cada petición registrada.
Esta revisión es de análisis: no añade cambios de cliente ni de producción.

**Revisión tras upgrade, 20:22–20:25 Madrid:** recuperación observada. El usuario
amplió a **Small, 2 GB** (`t4g.small`); el proceso Postgres arrancó a las
19:49:21 Madrid. Desde las 20:00 hasta las 20:23, Logs Explorer devuelve **cero
timeouts de Postgres y cero HTTP 500/502/503/504 de Auth** (2.226 eventos de Auth,
no confundir con número de peticiones). Quedan cinco errores Postgres:
tres `All list items must be collected or deferred`, uno `Some list items are
missing or inaccessible` y un `permission denied for function record_app_activity`.

- Pruebas HTTP reales en `auth.quefalta.es`, secuenciales y de solo lectura:
  Auth health 200 en 248 ms; primeras páginas de 50 productos por precio de
  Mercadona 81 ms, Carrefour 86 ms y Aldi 80 ms, todas HTTP 200 y 50 filas.
  Son muestras puntuales con anon/RLS y proyección reducida, no p95 ni medición
  completa de la UI autenticada o del catálogo combinado.
- Muestra SQL: 26 conexiones frente a límite de 90, cero consultas bloqueadas
  y una sola consulta ajena activa de menos de un segundo.
- CPU indicada **21,32 %** para 20:14–20:24. Memoria indicada 1,79 GB con gran
  parte de caché/buffers y swap todavía presente. No equivale a 1,79 GB de
  memoria de procesos ni demuestra desaparición de toda presión de memoria.
  Algunas gráficas de red/IOPS no cargaron; no se certifica su valor actual.
- Cron 18 completó correctamente los ciclos de las 20:00 y 20:15 (20 y 81 ms).
- Recuperación confirmada en esta ventana; queda comprobar estabilidad con
  picos de carga. Las correcciones locales del cliente siguen sin publicar.
  No se realizaron cambios remotos durante esta revisión.

**Diagnóstico anterior al upgrade:** incidencia de producción confirmada. Investigación en
lectura y dos correcciones locales de cliente, pendientes de publicación. No se
han reiniciado servicios, cambiado capacidad, aplicado migraciones ni modificado
datos por parte del agente. Complementa `incidencia-acceso-2026-09-17.md`.

## Evidencia de producción

Proyecto `gkffvigcnsesbaihycay`, ventana de una hora consultada alrededor de las
19:45 de Madrid en Logs Explorer:

| Mensaje | Eventos |
| --- | ---: |
| `canceling statement due to statement timeout` | 549 |
| `canceling statement due to user request` | 119 |
| `connection to client lost` | 101 |
| `permission denied for function record_app_activity` | 11 |
| `Some list items are missing or inaccessible` | 10 |

También hay dos conflictos de correo duplicado y eventos aislados de validación
de compras y favoritos duplicados. Las cancelaciones solicitadas por el cliente
y los rechazos de validación no son equivalentes a fallos internos del servidor.

Una segunda agrupación de timeouts identificó 75 llamadas de actividad, 68 de
ítems del carrito, 36 de grupos, 21 de búsqueda Mercadona y 17 de disponibilidad
de nombre de usuario. No afecta únicamente al catálogo. Las ventanas móviles
pueden diferir entre consultas; estos números no representan todo el día.

- Un INSERT de Auth en `flow_state` tardó **27.813 ms** según el log de plan.
- Dos consultas diagnósticas no pudieron conectar al servidor por timeout.
  Después volvió a aceptar lecturas, con latencia variable.
- `pg_stat_activity` mostró lecturas de catálogo esperando `DataFileRead` y una
  consulta de carrito activa durante siete segundos. Las tres consultas activas
  de esa muestra tenían cero bloqueadores.
- La investigación de acceso simultánea comprobó instancia Micro de 1 GB, CPU
  reportada de 96,07 %, gran componente de IOwait y swap elevado. La evidencia
  apunta a presión de recursos/E/S, pero no identifica el desencadenante exacto.
- `EXPLAIN` de la primera página Mercadona por precio (50 filas, publicada,
  precio no nulo) usa `mercadona_products_price_browse_idx`. No se ejecutó
  `EXPLAIN ANALYZE` ni una carga de estrés durante la incidencia. Esta comprobación
  no cubre todos los supermercados, filtros regionales ni políticas RLS.
- En estadísticas acumuladas, `catalog_cheaper_products_v7` destaca con 2.610
  llamadas y media de 4.107 ms; merece una revisión posterior. Es un acumulado
  sin ventana comparable y **no demuestra** que causara la incidencia de hoy.
- Las dos funciones `record_app_activity` conservan EXECUTE para authenticated
  y service_role; anon no lo tiene, como establece la migración. No se abrió
  acceso anónimo para eliminar ruido. Falta correlacionar los 11 rechazos con
  la recuperación de sesión antes de atribuirles una causa concreta.

## Correcciones locales

1. `src/api/catalogBrowse.ts`: eliminado el segundo intento alfabético ante
   cualquier error del listado por precio. Duplicaba peticiones cuando la BD
   estaba lenta y reutilizaba un cursor numérico como nombre, alterando el orden
   y la paginación. Los errores se propagan; la caché no retiene fallos y permite
   reintentar. El paginador combinado conserva tiendas que sí respondieron.
2. `src/lib/multiStorePager.ts`: mantiene el sondeo inicial pequeño (12 filas en
   Catálogo) y pide las filas que faltan de la página global cuando se agota una
   tienda. En el caso de 50 productos consecutivos de la misma tienda pasa de
   cinco consultas encadenadas (12+12+12+12+12) a dos (12+38). No aumenta el
   sondeo inicial de todas las tiendas. Beneficia listado y búsqueda combinada.

Validación: 19 pruebas dirigidas, `npx tsc --noEmit`, ESLint de ambos archivos y
`git diff --check` correctos. Las nuevas pruebas ejecutan los módulos y cubren
timeout sin reintento oculto, cursor por precio, reintento explícito, mezcla sin
saltos, resultados parciales, fallo total y cancelación previa. La reducción de
consultas se verifica con datos simulados; no se ha medido latencia UI en móvil.

## Trabajo restante

- El usuario ya amplió compute a Small. La revisión posterior confirma
  recuperación en la ventana descrita; falta comprobar estabilidad bajo picos.
- Publicar las correcciones del cliente para que beneficien a los usuarios.
- Una vez estable, comparar deltas de `pg_stat_statements` y planes de consultas
  costosas, en especial comparador y enumeración de categorías de ofertas. No
  aumentar timeouts globales ni crear índices a ciegas durante la saturación.

Fuentes: [registros del proyecto](https://supabase.com/dashboard/project/gkffvigcnsesbaihycay/logs/postgres-logs),
[documentación de swap](https://supabase.com/docs/guides/troubleshooting/exhaust-swap).
