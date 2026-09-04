# CE-102 — Guardas de destino, alcance y ejecución

2026-09-03. **Componente local completado y probado; integración F1 posterior
completada en CE-105/106.** [Acta](CE-105-106-closure.md) y
[protocolo atómico](CE-105-106-protocol.md). Los apartados de adaptadores
interactivos conservan el diseño inicial; la integración final usa transacciones
completas por mensaje, no sesión MCP compartida. No protege globalmente todos
los scripts ni habilita operaciones comerciales arbitrarias.

Actualización CE-BU-002: retirado únicamente el techo acumulado SQL de la guarda
actual (`daySqlMs=null`); contadores, timeouts por sentencia y demás controles
permanecen. [Sucesión de versiones](CE-BU-002-runtime-supersession.json): el
runtime exacto probado en F1 se conserva por su SHA-256, sin reescribir recibos.
CE-200 usa un lector nuevo y revisado, con su excepción acotada de filas/bytes;
los canarios F1 y su SQL fechado no se reutilizan para el corpus.

## Entregables y frontera de confianza

- [Guardas y runner](../../scripts/lib/comparator-strict-guard.mjs): funciones
  puras de preflight y controlador de transacción para operaciones registradas.
- [Pruebas ejecutables](../../scripts/lib/comparator-strict-guard.test.mjs):
  escenarios positivos, rechazos y fallos con dobles de transporte/coordinador.
- [CLI de planificación offline](../../scripts/comparator-strict-preflight.mjs):
  sin carga de `.env`, conexiones, claves, SQL aplicado ni cuentas de usuario.
- [Evidencia](CE-102-evidence.json): pruebas, límites y estado de las tareas.

El registro de operaciones lo define código revisado, no un JSON arbitrario
aportado por el usuario. El hash SHA-256 vincula SQL, objetos, claves de filas y
presupuestos; no sustituye la revisión del SQL. No se pretende decidir que un
SQL sea seguro buscando palabras con expresiones regulares.

El runner necesita dos adaptadores de confianza: transporte transaccional y
coordinador exclusivo/duradero por proyecto. **Si faltan, rechaza la ejecución**;
no crea una alternativa en memoria ni usa REST con autocommit. La variante
atómica CE-105 añade un coordinador SQL duradero y fue probada con PG17 real,
además del canario remoto CE-106. Los dobles de estos tests iniciales por sí
solos no acreditan transacciones ni concurrencia reales.

## Controles implementados

| Control | Comportamiento |
|---|---|
| Destino | Ref exacta `gkffvigcnsesbaihycay`; solo origen canónico o `https://auth.quefalta.es`, sin credenciales, rutas, query, fragmentos ni otro puerto |
| Modo por defecto | `plan`, sin red. `read` no permite escribir; `apply` requiere confirmar explícitamente la ref y el hash de la operación |
| Evidencia de destino | El adaptador debe observar ref/origen/estado saludable y aportar la fecha; no basta la URL del cliente ni un claim JWT decodificado |
| Ámbito | Operaciones registradas e inmutables; escrituras solo en los objetos CE-1 exactos enumerados, no en `public`, Auth, Storage, cron o pipeline legacy |
| Filas | Claves explícitas para DML; presupuestos de filas directas e inducidas. Rechazo si los efectos inducidos son desconocidos |
| Efectos laterales | Cero llamadas externas, trabajos de cola, usos comerciales y cambios globales en este registro inicial |
| Capacidad | Regla general: baseline completo y revisiones. Excepción CE-SEQ-003 solo para los dos hashes F1 exactos el 2026-09-03, con salud puntual; nunca se simula baseline PASS |
| Recursos | Topes de BU-01 para páginas, lotes, canario, trabajo, día UTC, bytes y SQL; valores ausentes/NaN/texto/negativos no equivalen a cero |
| Concurrencia | Una operación por runner y lease exclusivo por proyecto obligatorio; un segundo runner usa el mismo coordinador, no reinicia presupuesto |
| Resultado | Validar límites, objetos y claves realmente afectados antes del COMMIT; lectura termina con ROLLBACK |
| Fallos | Reservas conservadas; sin reintentos automáticos. Dos cancelaciones SQL consecutivas detienen; fallo grave o rollback fallido detiene inmediatamente |
| COMMIT incierto | Respuesta perdida no se interpreta como rollback; detener, reconciliar y no repetir automáticamente |

Los objetos propuestos permitidos son `comparator_strict` y sus tablas
`execution_control`, `execution_jobs`, `execution_budget`, `test_principals`.
Esta lista **no los crea** ni concede permisos. Ampliarla requiere operación
revisada, no un comodín de esquema. Las escrituras de negocio de fases futuras
no quedan habilitadas automáticamente por estas guardas iniciales.

Los plazos de evidencia de destino/baseline (5 minutos) son para la seguridad
de una operación de mantenimiento. **No son un TTL para productos, precios o
embeddings**: FR-02 conserva catálogo activo/versionado sin exigencia de 24 h.

## Contrato original de los adaptadores interactivos

Cumplimiento F1 mediante protocolo atómico: ver el acta CE-105/106 enlazada.
Los locks transaccionales y el trabajo persistido cubren la exclusión entre
mensajes, sin dependencia de sesión estable. Nuevas operaciones siguen pendientes
de sus propios contratos y pruebas.

Antes de registrar una operación que realmente escriba:

1. Resolver y verificar el proyecto de la conexión efectiva; no aceptar una
   ref autodeclarada del plan como prueba del servidor conectado.
2. Coordinar todos los operadores CE-1 mediante un lease único por proyecto,
   con presupuesto persistente por día UTC/trabajo y reservas atómicas previas.
   Incluir el coste y las filas de la propia contabilidad operativa. No devolver
   reservas automáticamente ante error, caída del proceso o commit incierto.
3. Mantener el lease y la conexión ligados. Aplicar `statement_timeout` ≤ 5 s,
   `lock_timeout` ≤ 500 ms y cancelación real; una promesa JavaScript abandonada
   no cancela SQL. No liberar el lease mientras siga ejecutándose una petición.
4. Usar una sola transacción, sin auto-commit: BEGIN, configuración local,
   ejecución acotada, medición de resultado, comprobación y COMMIT/ROLLBACK.
   El transporte debe medir filas directas/inducidas, objetos, bytes y tiempo SQL
   completos, no solo el primer SELECT o el rowCount principal.
5. Registrar versión de operación, resultados y estado de parada; conservar
   las reservas/estados inciertos al cambiar de día y no renovar artificialmente
   el inicio del mismo trabajo. Comprobar crash/reanudación en CE-105/106.
6. Negativos de permisos reales, canario y reversión antes de G1. El registro
   inicial no tiene operación de escritura habilitada desde la CLI.

Este contrato no modifica límites de funciones legacy (algunas tienen 60 s),
ni permite usar el importador/materializador existente como vía alternativa.
El propietario conserva acceso administrativo: las guardas protegen el camino
CE-1 que las use, no pueden impedir a un operador ejecutar SQL por otra vía.

## Verificación reproducible

```sh
node scripts/comparator-strict-preflight.mjs
node --test scripts/lib/comparator-strict-guard.test.mjs
npm run quality
```

El primer comando devuelve `planned`, cero llamadas y adaptador remoto ausente.
Una ref distinta falla con `ce1_wrong_project`. Intentar ejecutar sin adaptador
falla con `ce1_adapter_required`. Los positivos de `apply` se ensayan con dobles,
sin tocar producción. El runner exige capacidad acreditada incluso con permiso
para usar el proyecto productivo.

Las guías Supabase/Postgres han motivado privilegios mínimos, transacciones
cortas y separación entre metadatos y permisos efectivos. No se han instalado
integraciones ni dependencias. SQL/CI remoto y pgTAP siguen en CE-105.

**Continuidad histórica:** CE-SEQ-002 permitió iniciar CE-103. CE-SEQ-003 cerró
después CE-100 con limitaciones y autorizó continuar F1. CE-105/106 ya verifican
la integración y cierran G1; no hay uso comercial ni activación de resultados.
