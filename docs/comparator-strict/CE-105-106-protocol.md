# CE-105/106 — Protocolo atómico de F1

2026-09-03. Implementación acotada de CE-SEQ-003; no cambia el contrato de
equivalencia ni activa el motor. No es una aceptación ficticia del baseline.

## Decisión de implementación

Management API no garantiza la misma sesión entre llamadas. No se envían
BEGIN y COMMIT por separado. Cada mensaje SQL contiene su transacción completa,
con validaciones servidor antes de confirmar. El registro inicial admite solo
`f1_stopped_control` y `f1_revert_control`, con SQL/hash/presupuesto fijos.
No se admiten payloads SQL del cliente ni operaciones comerciales genéricas.

1. Preflight CE-102 verifica ref/origen, estado del proyecto, hash, modo apply,
   salud puntual y presupuesto existente. La excepción F1 solo vale para estos
   dos descriptores exactos el 2026-09-03; otros writes siguen exigiendo baseline.
2. Reserva: lock transaccional por proyecto, rechazo de trabajo no resuelto,
   incremento atómico del presupuesto y fila de trabajo con inicio/plazo original.
   Se confirma antes del payload. No se recrea el presupuesto ni se reembolsa.
3. Ejecución: mismo lock lógico, fila de trabajo bloqueada, comprobación del
   día/plazo/identidad y de triggers/rules/cascadas no revisadas. Cambio y recibo
   se confirman en la misma transacción, después de verificar fila, permisos
   lógicos, bytes y límites. Los locks de tabla impiden cambios concurrentes de
   triggers/rules entre inspección y ejecución.
4. Respuesta perdida: no hay reintento automático. `planned` bloquea otros
   trabajos hasta reconciliación explícita; `succeeded` permite recuperar su
   recibo duradero sin repetir el payload. Una reserva existente `planned` no
   se ejecuta automáticamente al volver a llamar al runner.
5. Reversión: otro trabajo identificado elimina solo el control desactivado
   vinculado al canario confirmado. Se conservan ambos recibos y reservas.

La parada ante error/timeout es más conservadora que el máximo de dos timeouts
del runner interactivo: el primer resultado incierto deja trabajo pendiente y
bloquea nuevos despachos hasta revisión. No se libera un lease por reloj o por
muerte del proceso. La reserva no depende de memoria JavaScript.

## Límites y contabilidad

Cada transacción: statement_timeout 1 s, lock_timeout 250 ms,
idle_in_transaction_session_timeout 1,5 s y transaction_timeout 2 s (PG17).
Cada trabajo nuevo reserva 4 s SQL para sus dos transacciones, 32 KiB, 32 lecturas
y cuatro escrituras técnicas (dos de coordinación y dos de ejecución/recibo).
Dos trabajos exitosos para canario y reversión, además del intento abortado
registrado en el acta. El plazo original es 20 minutos;
la autoridad de cada plan caduca a los cinco minutos y no cruza día UTC.

La migración aditiva añade identidad/recibo/reserva a `execution_jobs`, sin
reescribir el registro bootstrap anterior ni cambiar RLS/grants. Reserva además
5 s SQL, 32 KiB, 100 lecturas y dos escrituras de administración/migración.
El intento inicial conservó su reserva original de 6 s (transacciones de 3 s)
tras caducar sin enviar payload; no se recortó esa reserva al endurecer los
timeouts. El refresco posterior reservó 400 ms/8 KiB/32 lecturas/una escritura
y se ejecutó en una transacción limitada a 300 ms. Cierre real:
299.920/300.000 ms, 22.623.694/23.068.672 bytes, 4.128/5.000 lecturas y
35/2.000 escrituras. No hay presupuesto para nuevos trabajos remotos hoy.
Son reservas conservadoras, no factura ni medición de CPU exacta. No se liberan
automáticamente aunque el uso real sea menor. No habrá otra ventana de carga hoy.

`receipt.sqlMs` mide el cuerpo validado antes del UPDATE del recibo, no toda
la transacción ni la latencia HTTP. La reserva cubre las dos transacciones
completas mediante sus timers de servidor; las filas son efectos lógicos y
contabilidad, no una medición de filas físicas escaneadas por PostgreSQL.

## Pruebas y límites de confianza

La suite usa PostgreSQL 17 nativo con múltiples conexiones y bases nuevas
`ce1_test_*` locales. Se prueban permisos reales, dobles despachos, reservas y
respuestas perdidas, cancelación servidor, locks, muerte SIGKILL de un proceso
propio, plazos/días y presupuesto persistido. Los fallos se inyectan solo en
esas bases nuevas; nunca se envía pg_sleep, kill o SQL destructivo a Supabase.

La CI manual usa la misma suite. Puede anclar el reloj de fixtures a la fecha
histórica de autorización sin cambiar el reloj del sistema ni la política del
ejecutor productivo; los timers y las conexiones Postgres siguen siendo reales.
No se ha lanzado un job de GitHub ni instalado PostgreSQL como servicio permanente.

Prueba nativa final: 16 grupos PASS, incluido el timer de transacción completo
con varias sentencias individualmente inferiores a 1 s. Reproducir en un
Postgres 17 local/CI aislado con `scripts/test-comparator-strict-postgres.mjs`
y cliente `pg` del lockfile en `scripts/comparator-strict-tools`. La opción
`--fixture-clock=true` es exclusiva del runner de test, no del ejecutor remoto.

El puente local emite transacciones completas y consume respuestas del conector
autenticado de esta tarea. No extrae OAuth, no solicita contraseñas ni expone
funciones nuevas por Data API. La cuenta administradora sigue siendo la frontera
de confianza: estas guardas no pueden impedir SQL manual de otro administrador.
No es un framework que habilite cualquier operación futura; cada nueva operación
necesita registro, validaciones servidor, evidencia de efectos y presupuesto.

El puente habilita entrada raw cuando recibe un TTY para evitar el truncado
canónico de JSON en macOS; conserva el límite de 32 KiB y la secuencia. Una
respuesta incompleta/inválida detiene sin reintentar. Los planes de evidencia
ya ejecutados o caducados no son autorización para volver a ejecutar.

**Estado:** CE-105/106 cerradas; [acta y recuperación observada](CE-105-106-closure.md).

Referencias: [transacciones Postgres](https://www.postgresql.org/docs/17/tutorial-transactions.html),
[locks](https://www.postgresql.org/docs/17/explicit-locking.html),
[timeouts PG17](https://www.postgresql.org/docs/17/runtime-config-client.html).
