# CE-103 — Reconciliación de migraciones y base aditiva

2026-09-03. **COMPLETADA.** CE-SEQ-003 permite continuar tras el cierre de
CE-100 por el propietario, sin convertir su baseline en PASS. Se ha aplicado
únicamente la base privada `20260903080621_comparator_strict_private_foundation.sql`.
El nuevo archivo local se alineó con la versión real asignada por MCP, sin
alterar el SQL ni reparar el historial. No se han aplicado migraciones legacy.

Estado operativo y pruebas: [CE-103–106](CE-103-106-progress.md),
[evidencia actual](CE-103-106-execution-evidence.json). Las secciones 1–2
conservan el inventario previo de 80 entradas/163 archivos; la migración propia
añade una entrada y un archivo. Coordinador/adaptador general y G1 pendientes.

## 1. Evidencia actual

Proyecto reconfirmado `gkffvigcnsesbaihycay`, `ACTIVE_HEALTHY`, PG 17.6.
Tres consultas READ ONLY entre 05:39:29 y 05:40:36 UTC, con timeout 5 s,
lock_timeout 500 ms y ROLLBACK. Cero errores, sin consultas a clientes ni
RPC comerciales. Muestra inicial: diez conexiones cliente y cero activas,
locks/idle-in-transaction; no demuestra capacidad ni cubre CE-100.

- [Capturas SQL y resultados](CE-103-evidence.json).
- [Reconciliación completa](CE-103-migration-reconciliation.json).
- [Reconciliador local](../../scripts/reconcile-comparator-strict-migrations.mjs)
  y [tests](../../scripts/lib/comparator-strict-migrations.test.mjs).

No se exportaron los cuerpos SQL remotos: podrían contener literales sensibles.
Se obtuvieron versión/nombre, tamaño, número de sentencias y huellas. La consulta
de historial devolvió sus **80 filas completas**, sin truncado (límite 500).

| Comparación | Resultado |
|---|---:|
| Archivos SQL locales | 163 |
| Locales con timestamp | 89 |
| Registros remotos | 80 |
| Asociación por versión exacta | 27 |
| Asociación solo por nombre, con versión distinta o archivo legacy | 51 |
| Registros remotos sin candidato por versión/nombre | 2 |
| Texto correlacionado tras normalización de bordes | 50 |
| Candidatos cuyo texto no se ha acreditado equivalente | 28 |
| Locales sin asociación por versión/nombre | 85 |

Las dos entradas sin candidato son:

- `20260823194414_fix_targeted_price_alert_processor_alias`.
- `20260824172919_dashboard_metrics_and_match_review`.

Los 85 archivos sin asociación **no son 85 migraciones pendientes de aplicar**:
pueden corresponder a cambios manuales, bases previas al historial o versiones
renombradas. El informe no autoriza `db push`, `migration repair` ni eliminación
de archivos. Supabase compara archivos e historial por versiones; reparar el
historial no ejecuta ni revierte el SQL.
[Documentación oficial de migraciones](https://supabase.com/docs/guides/deployment/database-migrations).

## 2. Método y límites de la comparación

Primero se busca versión exacta; si no existe, nombre exacto. Las coincidencias
ambiguas o reutilizaciones de un mismo fichero por varias entradas se señalan,
no se resuelven arbitrariamente. Se comparan MD5 del texto local y del SQL remoto
unido por LF o punto y coma/LF. Solo se normalizan CRLF y espacios/delimitadores
exteriores. **No se eliminan comentarios ni se colapsan espacios de literales.**

Una coincidencia de esta forma textual es evidencia más fuerte que el nombre,
pero no demuestra el estado actual del esquema: otra migración puede haber
reemplazado después el objeto. MD5 se usa para correlación, no autorización;
los archivos locales conservan SHA-256 y las guardas CE-102 usan SHA-256.

Una diferencia no implica conflicto funcional. Ejemplo: la migración local
`20260901203103_extend_embedding_finalize_statement_timeout.sql` contiene
comentarios que no están acreditados por la huella del historial. La inspección
del objeto actual sí confirma `catalog_finalize_embedding_batch` con timeout
de 60 s. **No se vuelve a aplicar por no coincidir la huella del archivo.**

El cambio HNSW `20260902122234_fix_comparator_filtered_hnsw_recall.sql` sigue
sin entrada correspondiente. La fuente de la función de candidatos actual no
menciona `hnsw.iterative_scan`. Se mantiene como cambio separado no desplegado;
CE-002 ya rechazó adoptar todo el paquete por arrastre. v7 conserva el mismo
hash observado en CE-100 y timeout de 60 s. Embeddings continúan `paused`, cron
17 inactivo y cron 18 de alertas activo; no se han cambiado.

## 3. Base aditiva creada, privada e inactiva

El esquema `comparator_strict` se creó a las 08:06 UTC con estos cuatro objetos.
La tabla no sustituye la implementación del coordinador CE-102:

| Objeto creado | Propósito / restricciones |
|---|---|
| `comparator_strict.execution_control` | Estado deshabilitado/parada y coordinación exclusiva; no reutilizar el control del pipeline legacy |
| `comparator_strict.execution_jobs` | Identidad inmutable del trabajo, inicio, operación/hash, estado e incidencias; no reiniciar 20 min con otro proceso |
| `comparator_strict.execution_budget` | Reservas técnicas acumuladas por proyecto/día UTC; presupuesto atómico, no tres usos comerciales |
| `comparator_strict.test_principals` | Lista controlada por servidor de UID verificados; inicialmente vacía/inactiva, nunca autorización por username |

Condiciones aplicadas / dependencias de integración:

1. Crear solo objetos propios revisados; sin modificar tablas/RPC actuales ni
   mover sus grants. Verificar defaults de la cuenta creadora y revocar acceso
   de PUBLIC/anon/authenticated en los objetos nuevos dentro de la migración.
   RLS como defensa adicional, permisos concretos para el operador necesario.
2. Mantener el esquema fuera de Data API. CE-101 observó autoexposición de
   tablas nuevas habilitada; no asumir seguridad solo por el nombre privado.
   No cambiar el ajuste global como efecto colateral.
3. Sin triggers sobre catálogos, cron nuevo, workers activos o integración
   comercial. La contabilidad operativa también consume filas/tiempo y debe
   incluirse en el presupuesto del bootstrap y de cada trabajo.
4. Bootstrap único con ref/hash comprobados, salud puntual y autoridad CE-SEQ-003;
   no se afirma capacidad validada por un baseline completo. Contabilidad previa
   conservada y reserva del avance persistida con el canario. No hay bypass genérico.
5. Preparar reversión específica de los objetos nuevos y comprobar dependencias;
   no `DROP ... CASCADE` ni restauración global. No depender de una copia de BD
   para recuperar archivos de Storage.
6. Adaptador transaccional con cancelación real y validación previa al COMMIT;
   coordinador duradero exclusivo por proyecto, estados inciertos y presupuesto
   que sobrevive a crashes y medianoche. Integración y negativos en CE-105/106.
7. Solo vincular `@rruizosma` a su UID con comprobación autenticada cuando se
   prepare el acceso real. La confirmación de catálogo 1.3 no habilita CE-1 ni
   verifica un token. No modificar Plus, cuota, Auth o perfil público.

Se utilizó `supabase migration new` con CLI 2.116.0 temporal; SQL probado en
PG18.3 WASM antes de aplicar esa sola migración mediante MCP. PG17 remoto
confirma las cuatro tablas RLS y sus permisos. Data API rechaza el esquema
con PGRST106; 12 comprobaciones con roles reales denegadas. Cero funciones
persistentes, políticas públicas, triggers de catálogo o cuentas activadas.

## 4. Cierre de CE-103 y dependencias siguientes

- Las dos entradas se acotan a las funciones de alertas dirigidas y métricas
  detalladas en el informe conjunto; no equivalen a cambios CE-1 pendientes.
  No se exportan/reconstruyen sus cuerpos ni se reparan entradas por nombre.
- Hashes actuales de v7, dispatch, finalizadora y cuota privada conservados antes
  y después. No se invocaron RPC comerciales como prueba de lectura.
- Reversión del esquema vacío verificada localmente; rechazo si contiene datos.
  Canario remoto propio confirmado y compensado en CE-106, sin eliminar auditoría.
- CE-104 completada; CE-105/106 continúan para integrar y probar el coordinador,
  exclusividad concurrente, cancelación y resultados inciertos. G1 no aceptado.

No hacen falta nuevas integraciones para esta base. CE-105 usa aserciones SQL
nativas y CI aislada preparada; pgTAP no instalado. Las guías Supabase/Postgres
han guiado transacciones cortas, permisos explícitos y separación de evidencia,
revisión y despliegue. Véase el informe conjunto para límites y siguiente tarea.
