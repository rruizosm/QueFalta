# CE-103–106 — Avance histórico y enlace al cierre

2026-09-03. Autoridad: CE-SEQ-003. CE-100 cerrada por decisión del propietario,
no por haber superado la medición de rendimiento. **Actualización posterior:
CE-105/106 completadas y G1 PASS acotado** en el [acta de cierre](CE-105-106-closure.md).
Los apartados siguientes conservan el snapshot de las 08:13 UTC; sus pendientes,
contadores y primera migración son históricos, no el estado actual.

| Tarea | Estado | Resultado / pendiente |
|---|---|---|
| CE-100 | Cerrada por el propietario | Se conserva el baseline incompleto, sin PASS ficticio |
| CE-103 | Completada | Reconciliación relevante, base privada aplicada, permisos y reversión preparados/verificados |
| CE-104 | Completada | 72 productos reales activos capturados y 32 casos sintéticos; cuenta de pruebas documentada, inactiva |
| CE-105 | Completada después de este snapshot | Integración duradera y 16 grupos PG17 nativo PASS; ver acta de cierre |
| CE-106 | Completada después de este snapshot | Canario/reversión vía ejecutor y permisos reales verificados; ver acta de cierre |

## 1. Cambios realizados en Supabase

Proyecto `gkffvigcnsesbaihycay`, región eu-west-1, PostgreSQL 17.6. Se aplicó
**una sola migración**: `20260903080621_comparator_strict_private_foundation.sql`.
El fichero se generó con CLI 2.116.0 a las 07:59:46 UTC y se alineó después con
la versión real asignada por MCP, sin cambiar su SQL ni reparar el historial.
SHA-256: `11ff64042b6b372699a80c005d2ff23c217531a41f4bf76b7fb8e3740170df86`.

Cuatro tablas en `comparator_strict`: control, trabajos, presupuesto y
identidades de prueba. Todas con RLS, sin políticas de acceso, sin grants a
PUBLIC/anon/authenticated/service_role y sin exposición por Data API
(respuesta HTTP 406/PGRST106 verificada antes y después del canario).
Solo el operador de base de datos puede acceder. No se ha concedido acceso a
la cuenta `@rruizosma`: todavía no se ha verificado su UID autenticado.

No hay cambios en tablas de catálogo, funciones legacy, Auth, Plus, cuotas
comerciales, cron, colas, embeddings, Storage, notificaciones o código de app.
El esquema **no constituye aislamiento de recursos ni un comparador activo**.
Los defaults por esquema no sustituyen los REVOKE explícitos de cada futura
función: un REVOKE por esquema no elimina grants globales por defecto. No se
ha creado ninguna función persistente ni SECURITY DEFINER.

Las dos migraciones antes sin candidato se acotan a
`public.claim_price_alert_deliveries_for_user` y
`public.dashboard_app_active_user_metrics`. La primera tiene un archivo local
relacionado con nombre/versiones distintos; no se ha acreditado igualdad del
SQL completo. La segunda sigue sin copia SQL local. Quedan documentadas y
separadas de CE-1, sin reproducirlas ni alterar sus registros. Tampoco se
aplicó el parche HNSW pendiente.

## 2. Muestra y reglas de comparación

[Muestra real](fixtures/catalog-sample-2026-09-03.json): 72 filas, seis por cada
combinación de tienda y pista léxica, en Mercadona, Carrefour, Consum y Plusfresc.
Captura 08:08:57 UTC, consulta READ ONLY limitada a 5 s, sin embeddings ni RPC
que consuman usos. Incluye precio, nombre, formato disponible, EAN disponible
y fecha del snapshot. No contiene datos personales ni productos inventados.

Es una muestra por ID, **no aleatoria ni representativa**; `published=true`
no acredita stock/precio aplicable a cada CP. Los campos extraídos tampoco son
la ficha completa. Los candidatos no están etiquetados como equivalentes.
Ejemplos reales: «Agua de colonia Gotas Frescas Baby…» al buscar agua;
«Pelador Patatas FACKELMANN…» al buscar patata; patata fresca y aperitivos en
la misma búsqueda. Confirman por qué familia y preparación deben validarse
antes de precio/formato, sin medir la tasa de errores del comparador actual.

[Contrato sintético](fixtures/contract-cases-v1.json): 24 parejas y ocho escenarios
de precio/vigencia, separados de la muestra real y del futuro holdout:

- 1 L = 1000 ml, pero no 1,5 L; igual contenido nominal exacto.
- Yogur 6×125 g solo frente al mismo formato; no 4×125, 3×250 ni un bote de 750 g.
- «Yogur griego» y «griego yogur» pueden coincidir si las demás dimensiones
  críticas se prueban iguales. Natural, azucarado, sabor, edulcorantes y
  negaciones no se mezclan; «natural» no demuestra ausencia de azúcar añadido.
- Patatas congeladas 2 kg = 2000 g, no 1 kg/0,5 kg, patata fresca o aperitivo.
- Carne, embutidos y peso variable siguen en cuarentena.
- Producto activo sin TTL de 24 h; cambios de precio invalidan el ahorro sin
  regenerar necesariamente el vector. Sin ahorro válido ofrecido, cero usos.

Estos archivos son material de prueba y contrato, **no implementación del motor**.
El etiquetado del dataset real y la revisión del propietario pertenecen a F2.

## 3. Pruebas realizadas y límites

- `npm run quality`: typecheck, lint y **334/334 tests PASS**; ocho tests nuevos
  verifican artefactos, presupuestos, límites y evidencia capturada, no el motor.
- PostgreSQL temporal PGlite 0.5.8 (**PG 18.3 WASM**, no PG17 productivo): 28
  negativos de permisos/constraints, estructura, defaults, RLS con grant de
  SELECT deliberado en rol efímero, eliminación del esquema vacío/recreación,
  rechazo de rollback con datos, canario local y rechazo de repetición.
- Supabase PG17 real: 12 lecturas bajo roles anon/authenticated/service_role
  denegadas; metadatos RLS/grants comprobados; canario validado dentro de la
  transacción, COMMIT observado desde otra llamada y compensación posterior.
- [CI SQL aislada](../../.github/workflows/comparator-strict-sql.yml) preparada
  con postgres:17, roles simulados y solo la migración nueva. Es manual, no
  usa secretos Supabase, no hace `db push` y **no se ha ejecutado en GitHub**.
- No se instalan pgTAP, pg_jsonschema, buscadores o enriquecedores en Supabase:
  las aserciones SQL nativas bastan para esta base. La prueba WASM es temporal
  y no modifica las dependencias de la app.

El asesor de seguridad devuelve cuatro INFO propios `rls_enabled_no_policy`,
esperados en tablas privadas cerradas. Los 13 WARN se refieren a objetos/Auth
fuera de CE-1; no se han corregido por arrastre. Añadir políticas permisivas
solo para ocultar el INFO sería incorrecto.
[Referencia del aviso](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## 4. Canario y reversión

08:11:34 UTC: tres inserciones propias (reserva del día, registro del trabajo,
control desactivado). 08:11:51: COMMIT confirmado, enabled=false, halted=true,
cero identidades de prueba. 08:12:07: segunda transacción elimina **solo esa
fila de control** y marca el trabajo `rolled_back`. Cierre observado 08:12:41.
Se conservan dos filas de evidencia (trabajo y presupuesto); no se recupera
artificialmente presupuesto por revertir.

Catálogo público: HTTP 200, una fila, 91,3 ms antes / 89,9 ms después. Son dos
comprobaciones puntuales, **no p95 ni prueba de ausencia de degradación global**.
Bloqueos y consultas activas >30 s: cero en las capturas. Hashes de v7,
dispatch, finalizadora y cuota privada: sin cambios. No se invocaron esas RPC.

[Rollback de esquema](../../supabase/ops/rollback-comparator-strict-foundation.sql):
probado solo en la BD local vacía, sin CASCADE. Ahora se niega correctamente
a eliminar las tablas remotas porque contienen evidencia operativa. No borrarla
para forzar el rollback ni reparar automáticamente el historial.

## 5. Presupuesto y recuperación del trabajo

Se arrastra todo el consumo/reserva anterior. La continuación reserva 0,5 MiB,
100.000 ms SQL, 800 filas leídas y 20 escrituras técnicas incluyendo reversión.
Total reservado del día: **22.484.430 / 23.068.672 bytes**, **280.520 / 300.000 ms**,
3.900/5.000 lecturas y 20/2.000 escrituras. Respuestas capturadas de esta
continuación: 78.999 bytes; once llamadas directas SQL/DDL con cota agregada
60.000 ms para sus cuerpos SQL (la prueba de roles tiene DO y SELECT), más
preparación transaccional y coste no cronometrado del asesor cubiertos por reserva.
No confundir reserva conservadora ni tamaño de respuestas con factura exacta.

No se han contratado servicios, ampliado compute, cambiado el plan ni lanzado
jobs facturables en GitHub. Se trabaja dentro de la cuota incluida comprobada
previamente. No se repite una ventana de métricas hoy ni se libera la reserva
duradera por iniciar otro proceso.

## 6. Pendientes históricos — completados en el acta posterior

Esta lista se conserva para trazar el avance. No repetirla: [CE-105/106 cerradas](CE-105-106-closure.md).

**CE-105:** conectar las guardas locales CE-102 a un adaptador transaccional y
coordinador duradero reales, con pruebas PG17 aisladas de dos sesiones,
cancelación, caída antes/después de COMMIT, resultado incierto, reserva que
sobrevive a reinicios y cambio de día UTC. Las tablas y el índice único no
implementan por sí solos esas capacidades. Management API ha permitido este
bootstrap único; no se presenta como adaptador transaccional interactivo.
El runner general sigue rechazando baseline incompleto: no falsificarlo para
avanzar. Cualquier excepción futura debe reflejar CE-SEQ-003 de forma acotada.

**CE-106:** repetir la operación mínima a través de esa integración una vez
probada, verificar los negativos y registrar G1 solo cuando cumpla sus criterios.
Si hace falta una credencial nueva de conexión directa, prepararla por un canal
seguro; no pedir ni pegar contraseñas en el chat, rotar Auth o modificar grants
globales para obtener acceso. F2 no comienza todavía.

Evidencia: [JSON de ejecución](CE-103-106-execution-evidence.json),
[manifiesto bootstrap](CE-103-bootstrap-manifest.json),
[manifiesto canario](CE-106-canary-manifest.json). Las guías Supabase/Postgres
han determinado permisos explícitos, transacciones cortas, reversión específica
y la separación entre pruebas locales, cambios reales y capacidades pendientes.
