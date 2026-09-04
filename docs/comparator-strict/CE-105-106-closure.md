# CE-105 y CE-106 — Acta de cierre de F1

2026-09-03. Responsable de ejecución y verificación: Codex, bajo la instrucción
del propietario «Sigue avanzando con las tareas CE-105 y 106 hasta darlas por
finalizadas» y CE-SEQ-003. **CE-105 y CE-106 completadas. G1 PASS para la base
privada e inactiva de F1.** F2 no iniciada; no se acepta el rendimiento global
ni se activa el comparador nuevo.

Entorno real: `gkffvigcnsesbaihycay`, `https://auth.quefalta.es`, PG17.6.
Rama `codex/phase5-observation`, HEAD
`03b8ba273e17709fd8fc69c20dddb68c147a7e2a`; cambios locales sin commit/push.
Cambios previos de app, modal, HNSW y pipeline preservados.

Evidencia completa: [JSON de cierre](CE-105-106-closure-evidence.json).
Diseño y límites: [protocolo atómico](CE-105-106-protocol.md).
El [informe de las 08:13 UTC](CE-103-106-progress.md) y su JSON conservan el
bootstrap anterior; no se reescriben sus resultados históricos.

## 1. Qué se ha terminado

**CE-105:** ejecutor de dos fases con reserva duradera, exclusión por proyecto,
identidad/hash de operación y recibo confirmado junto con el efecto. Cada
mensaje a Management API es una transacción completa: no se supone que dos
llamadas compartan sesión. Se validan límites y efectos antes del COMMIT.
Las reservas sobreviven al proceso; un resultado incierto bloquea nuevos
trabajos hasta reconciliación. Nunca se repite automáticamente una escritura.

Aplicada únicamente la migración aditiva
`20260903084621_comparator_strict_atomic_receipts.sql`, posterior a la base
CE-103. Añade identidad, reserva y recibo a `execution_jobs`, conserva el
registro antiguo y sus permisos. SHA-256:
`62a805075786342cdf7208745ae91e4771706030840d33fe3fccb5a3ed79025c`.
No se han creado funciones persistentes, triggers ni extensiones.

**CE-106:** inserción mínima de un control desactivado y reversión posterior
mediante el mismo ejecutor/puente autenticado. Son dos trabajos distintos con
recibos persistidos. El resultado real se volvió a comprobar desde otra llamada.

## 2. Pruebas realizadas

- PostgreSQL **17.6 nativo**, no WASM: 16 grupos PASS con sesiones independientes.
  Incluyen 28 negativos de permisos/constraints y RLS, dos reservas simultáneas,
  ejecución concurrente sin duplicado, pérdida de respuesta antes/después de
  COMMIT, cancelación SQL, límite de transacción completa de 2 s, resultado
  inválido antes de COMMIT, trigger no revisado, presupuesto agotado, cambio
  de día, plazo original vencido, muerte SIGKILL del proceso propio y lock timeout.
- Los fallos se inyectaron solo en bases nuevas locales `ce1_test_*`. Esas bases
  se eliminaron al terminar; el servidor temporal quedó detenido, sin servicio
  permanente ni puerto TCP abierto. No hubo pruebas de caída sobre Supabase.
- `npm run quality`: TypeScript, lint y **353/353 pruebas generales PASS**,
  incluidas cuatro comprobaciones de integridad de la evidencia capturada.
  Estas pruebas generales no miden precisión comercial del motor.
- CI manual preparada con postgres:17 y cliente `pg` 8.16.3 fijado mediante
  lockfile en herramientas de test separadas. **No se ha ejecutado en GitHub**,
  no usa secretos de Supabase y no modifica dependencias de la app.
- En Supabase: 12 lecturas denegadas a los tres roles de app sobre las cuatro
  tablas; sin grants de lectura/escritura ni USAGE/CREATE, RLS en las cuatro,
  cero políticas y cero grants a PUBLIC. Data API devuelve 406/PGRST106.

## 3. Canario, incidencia y recuperación

| Momento UTC | Resultado comprobado |
|---|---|
| 08:48:54 | Primer intento: reserva confirmada, payload todavía no enviado |
| 08:55:52 | Reconciliación explícita del intento caducado: `rolled_back`, sin efecto ni devolución de presupuesto |
| 08:58:09 | Nueva operación revisada: reserva duradera confirmada |
| 08:58:38 | Control insertado: `enabled=false`, `halted=true`; recibo y cambio confirmados juntos |
| 08:59:16 | Otro trabajo elimina solo ese control; reversión y recibo confirmados juntos |
| 09:00:31 | Verificación independiente: cero controles, cero identidades y cero trabajos pendientes |

La incidencia fue local: el TTY de macOS truncaba una respuesta JSON larga en
modo canónico. No fue un fallo de Supabase. Se corrigió el puente para entrada
raw, conservando secuencia y límite de respuesta. La autorización original
caducó durante la espera: no se renovó ese trabajo ni se envió su payload.
Su reserva de 6 s sigue intacta. No se contabiliza como canario exitoso.

Los nuevos trabajos usan límites **más estrictos**: transaction_timeout de 2 s
por transacción en lugar de 3 s, y reserva de 4 s para dos transacciones.
El servidor aplica el límite; un test nativo observa el error 25P04 a los 2 s.
No se redujeron contadores pasados ni se aumentaron los límites diarios.

Las respuestas completas del control y de la reversión fueron validadas por
el puente corregido, que terminó con código 0 en ambos casos. Permanecen cuatro
trabajos de auditoría (dos `rolled_back`, dos `succeeded`) y una fila de presupuesto.
El rollback de esquema sigue rechazando borrar esas evidencias; no forzarlo.

## 4. Comprobación de G1

| Criterio | Evidencia | Resultado |
|---|---|---|
| Destino y alcance | Ref/origen comprobados; dos payloads fijos en objetos propios | PASS |
| Escritura y reversión reales | Dos transacciones confirmadas con recibos enlazados | PASS |
| Exclusión y recuperación | Pruebas PG17 multisesión y de muerte del proceso; reserva remota reconciliada | PASS |
| Permisos mínimos | 12 denegaciones reales, cuatro RLS, ningún grant público; API 406 | PASS |
| Compatibilidad legacy | Hashes idénticos de v7, dispatch, finalizadora y cuota privada | PASS |
| Salud puntual antes/después | Cero bloqueos y cero consultas activas >30 s en ambas capturas | PASS acotado |
| API de catálogo | Una fila HTTP 200, 76,5 ms antes / 77,4 ms después | PASS acotado |
| Efectos comerciales | Sin llamadas a cuotas, compras, notificaciones, colas ni cambios de app | PASS de alcance |

Estas sondas puntuales no son p95 ni certifican ausencia de degradación global.
CE-100 continúa **cerrada por el propietario con baseline incompleto**, sin
convertirlo en PASS. G1 acredita los criterios del canario, no carga masiva,
precisión comercial, permisos para usuarios ni activación F8.

## 5. Presupuesto, integraciones y continuación

Reserva final del 2026-09-03 UTC: **299.920 / 300.000 ms SQL**,
**22.623.694 / 23.068.672 bytes**, **4.128 / 5.000 lecturas** y
**35 / 2.000 escrituras técnicas**. Incluye gasto anterior, preparación,
intento cancelado, refresco acotado, canario y reversión. La verificación final
usa el margen de diagnóstico reservado antes; no se carga dos veces ni se
interpreta la reserva como factura o CPU medida. Solo quedan 80 ms de nueva
capacidad SQL: **no ejecutar más carga remota CE-1 hoy**.

No hace falta instalar pgTAP ni otro servicio en Supabase para cerrar F1:
las aserciones SQL y PG17 aislado cubren estos contratos. No se contrataron
integraciones ni se amplió compute/plan. OFF/GS1/pg_jsonschema se valorarán en
sus fases; este cierre no los autoriza automáticamente.

Se verificaron permisos/RLS de forma dirigida después de la migración. No se
repitió el escaneo general de asesores por el presupuesto acotado; el informe
previo conserva sus cuatro INFO esperados y WARN ajenos a CE-1, sin ocultarlos
ni modificar Auth/objetos externos.

**Siguiente tarea: CE-200 (F2), dataset real etiquetado.** Preparar primero el
muestreo/etiquetado dentro de sus límites. La segunda revisión del propietario
sigue pendiente para esa fase. Mantener formato exacto, variantes separadas,
catálogo activo/versionado sin TTL comercial de 24 h y abstención ante dudas.
Ninguna regla de equivalencia está implementada por esta infraestructura.
Las autorizaciones y planes de canario adjuntos son históricos y caducan;
no volver a ejecutarlos ni renovar fechas/counters para reutilizarlos.

Las guías Supabase/Postgres han determinado las transacciones completas y
cortas, las pruebas con permisos efectivos y la conservación del presupuesto
ante fallos. Esta acta cierra F1, no inicia F2 ni publica una versión de la app.
