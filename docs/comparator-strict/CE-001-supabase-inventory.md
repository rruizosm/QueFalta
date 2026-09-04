# CE-1 / F0 — Inventario real de Supabase y cierre de CE-001

> Fecha: 2026-09-02 · plan v1.1 / CE-ENV-001.
>
> CE-001 COMPLETADA. En aquella captura: F0 EN CURSO; G0 no aceptado.
>
> Solo lectura remota y documentación local. Sin despliegues, migraciones,
> instalaciones, búsquedas del comparador ni procesamiento de colas.

Nota de continuidad: esta acta conserva la captura y el cierre de CE-001.
[CE-002-independent-review.md](CE-002-independent-review.md) registra la revisión
posterior de parches. CE-003 está cerrada en [decisions.md](decisions.md) y CE-004
en [budget.md](budget.md); CE-005 está cerrada en [acceptance.md](acceptance.md):
FR-02 y QA-01 confirmadas, F0 ACEPTADA / G0 PASS. CE-100 en curso en
[CE-100-readiness.md](CE-100-readiness.md). La sección de cierre mantiene el
próximo paso que correspondía entonces.

## 1. Resultado y alcance

Se ha reconciliado el estado desplegado con el checkout, sin convertir diferencias
de historial en instrucciones de despliegue. La evidencia estructurada está en
[CE-001-supabase-inventory.json](CE-001-supabase-inventory.json); incluye metadatos,
huellas de funciones, historial remoto, correspondencias de migraciones, horarios
y las cinco consultas SQL de inventario.

Resultados que condicionan las siguientes tareas:

- El dominio de la app apunta al proyecto real verificado `gkffvigcnsesbaihycay`.
  No hay ramas remotas; no hacen falta como prerrequisito bajo CE-ENV-001.
- La RPC utilizada por el cliente es v7. Consume cuota antes de obtener resultados
  y delega en v5/v3; no es una prueba de lectura inocua.
- El timeout de la finalizadora ya está aplicado. El ajuste HNSW filtrado no.
  Un SQL local sin seguimiento no equivale a una migración pendiente.
- Hay 20 mensajes pendientes de embeddings con pipeline pausado y cron 17
  inactivo. No se ha intentado drenarlos ni reactivar el procesamiento.
- Los horarios actuales son mayoritariamente semanales o manuales. La propuesta
  de vigencia de 24 h necesita una decisión explícita en CE-005.
- Hay diferencias de historial y un timeout de DIA distinto entre `main` y este
  checkout. Deben reconciliarse, no desplegarse por arrastre.

No se han reejecutado comparaciones de productos ni medido precisión, recall,
latencia del comparador o disponibilidad por zona. Siguen vigentes los casos y
problemas de la [auditoría](../../COMPARADOR-ESTRICTO.md), no como una medición
nueva de esta tarea.

## 2. Método, destino y trazabilidad

Se usaron la guía de Supabase y las prácticas de Postgres para acotar las lecturas:
cinco transacciones `READ ONLY`, `statement_timeout=5s`,
`lock_timeout=1s`, cierre con `ROLLBACK`, agregados y límites de filas.
Se revisó el cuerpo de la RPC de mantenimiento antes de invocarla; solo consulta
metadatos/estadísticas. No se llamó al comparador, al dispatcher ni a funciones
que reclamen mensajes o consuman cuota.

Las capturas son sucesivas, no un snapshot atómico:

| Fuente | Referencia de captura |
|---|---|
| Inventario SQL de funciones/relaciones | 2026-09-02 19:16:10 UTC |
| Estado operativo y sincronizaciones | 2026-09-02 19:18:48 UTC |
| Configuración GitHub congelada para lectura | 2026-09-02 19:20:44 UTC |

En Madrid esas horas corresponden a UTC+2 en esta fecha. No se han guardado
credenciales, valores de secrets, perfiles/listas de usuarios ni cuerpos de
comandos cron. Los MD5 sirven para detectar deriva, no como firma de seguridad.

| Elemento | Estado comprobado |
|---|---|
| Nombre / región | QueFalta / eu-west-1 |
| Project ref | `gkffvigcnsesbaihycay` |
| Estado de Management API | `ACTIVE_HEALTHY`, puntual; no prueba un SLO |
| Postgres | 17.6; versión gestionada 17.6.1.127 |
| API base | `https://gkffvigcnsesbaihycay.supabase.co` |
| URL local de la app | `https://auth.quefalta.es` |
| Asociación del dominio | HEAD sin credenciales a `/auth/v1/health`: cabecera `sb-project-ref` coincide |
| Respuesta de esa comprobación | HTTP 401 esperado sin credenciales; no es una avería de Auth |
| Ramas remotas | Lista vacía |
| Enlace local de CLI | No existe `supabase/.temp/project-ref`; no asumir destino por CLI |
| Checkout | `codex/phase5-observation` · `03b8ba273e17709fd8fc69c20dddb68c147a7e2a` |
| GitHub main leído | `78542449361897f614fffa29b0f49ae15fbd9383` |

No se creó rama, commit ni recurso; no se hizo checkout, push, migración ni
reparación de historial. El contenido preexistente se protege con las huellas del
[baseline de CE-000](F0-baseline.md).

## 3. Motor desplegado, permisos y dependencias

El cliente en `src/api/catalog.ts` llama a `catalog_cheaper_products_v7`
con tienda/producto origen, destinos e idioma. El cuerpo remoto confirma:

1. v7 llama primero a `private.claim_free_comparator_use()`.
2. Obtiene resultados de `comparator_internal.catalog_cheaper_products_v5`.
3. v5 exige `auth.uid()` y llama a v3 antes de consultar matches; puede usar la
   materialización/caché del motor existente.
4. v7 localiza el nombre con `catalog_localized_product_name_v1`.

La comprobación fue de definiciones, no una ejecución con cuenta de usuario.
No se deben usar estas RPC como smoke de inventario ni prometer cero escrituras
porque la interfaz cliente use `rpc()`.

| Objeto | Estado relevante |
|---|---|
| public v7 y v6 | SECURITY INVOKER; timeout configurado 60 s; anon sin EXECUTE, authenticated y service_role con EXECUTE |
| public v3/v4/v5 | Wrappers presentes, sin EXECUTE para anon |
| comparator_internal v3/v4/v5 | SECURITY DEFINER; authenticated con EXECUTE; v5 comprueba identidad de sesión |
| catalog_embedding_candidates_v3 | Solo service_role entre roles comprobados; sin ajuste iterativo en cuerpo/configuración |
| catalog_finalize_embedding_batch | Timeout configurado 60 s; solo service_role entre roles comprobados |
| Helpers de familia/variantes/identidad/nombre | Presentes; hashes registrados |
| similar_products | Presente, legacy |
| similar_products_v2 | No encontrada en public/comparator_internal; no es la RPC del cliente actual |

`comparator_internal` permite USAGE a authenticated, no a anon; `pgmq` no
lo permite a ninguno de esos dos roles. Las dos tablas de caché tienen RLS y no
permiten SELECT directo a anon/authenticated; sí a service_role. Sus estimaciones
son 3.745 filas de estados y 15.446 matches: **no son conteos exactos ni métricas
de calidad**. Este inventario no sustituye los tests completos de permisos/RLS.

Limitaciones de v5 confirmadas en su definición:

- versión de matching `embedding_hybrid_v3_0_60`;
- máximo dos resultados por tienda;
- embeddings vigentes obligatorios tanto en origen como en destino;
- `relation=identico` y revisión `aprobado` pueden saltar el guard actual de
  identidad; CE-1 deberá aplicar las puertas duras también a esas rutas;
- excepciones de precio total para Caprabo, Eroski e HiperDino; el resto usa
  precio por unidad en la decisión actual;
- 18 tiendas de destino: BM e Hipercor no están en esa lista, aunque ambos
  aparezcan entre los 20 estados de sincronización.

Esto mantiene la prioridad del plan: identidad y formato verificables antes del
precio. No se han añadido igualdad estricta de packs ni reglas nuevas de azúcar,
ni se ha ampliado el comparador a las dos tiendas ausentes.

## 4. Migraciones: qué está aplicado y qué no

| Inventario | Resultado |
|---|---:|
| Archivos SQL locales | 163 |
| Locales con timestamp / nombres legacy | 89 / 74 |
| Entradas en historial remoto | 80 |
| Coincidencia exacta de versión y nombre | 27 |
| Mismo nombre, versión distinta o archivo legacy sin timestamp | 51 |
| De esas 51: timestamp distinto / nombre legacy | 49 / 2 |
| Entradas remotas sin archivo local del mismo nombre | 2 |

Las correspondencias por nombre no prueban igualdad del contenido SQL. Tampoco
las 163 rutas locales representan 163 migraciones aplicables. El JSON conserva
el historial remoto y las 51 correspondencias para una revisión reproducible.

| Archivo o entrada | Conclusión de CE-001 |
|---|---|
| `20260901203103_extend_embedding_finalize_statement_timeout.sql` | Aplicada: entrada remota y configuración real de 60 s coinciden |
| `20260902122234_fix_comparator_filtered_hnsw_recall.sql` | Pendiente: sin entrada remota y sin ajuste iterativo en la función actual |
| `20260809102018_comparator_source_unit_v2.sql` | Sin entrada del mismo nombre; similar_products_v2 ausente. Legacy, no dependencia automática de v7 |
| `20260817124758_comparator_semantic_identity_guard.sql` | Sin entrada del mismo nombre, pero helpers y v5 existen. No concluir que falte su efecto sin comparar evolución posterior |
| `similar_products.sql` | Sin entrada del mismo nombre; función existente. Nombre de archivo no determina estado |
| `20260823194414_fix_targeted_price_alert_processor_alias` | En historial remoto, sin archivo local del mismo nombre |
| `20260824172919_dashboard_metrics_and_match_review` | En historial remoto, sin archivo local del mismo nombre |

No se observaron overrides HNSW en `pg_db_role_setting`; la función de candidatos
no contiene `hnsw.iterative_scan` ni `relaxed_order`. Esto confirma que el
parche local no se ha incorporado; no se infiere un valor de sesión no consultado.

**Acción de F1/CE-103:** reconciliar contenido y dependencias, recuperar los
antecedentes que falten y preparar solo migraciones de la fase. No ejecutar un
`db push` genérico, renombrar archivos históricos o reparar el ledger basándose
únicamente en nombres. CE-002 revisa el parche HNSW de forma independiente.

## 5. Extensiones e integraciones

Extensiones instaladas a la fecha de captura:

| Extensión | Versión instalada | Esquema |
|---|---|---|
| `pgcrypto` | 1.3 | `extensions` |
| `supabase_vault` | 0.3.1 | `vault` |
| `pg_stat_statements` | 1.11 | `extensions` |
| `uuid-ossp` | 1.1 | `extensions` |
| `pg_trgm` | 1.6 | `public` |
| `pg_cron` | 1.6.4 | `pg_catalog` |
| `unaccent` | 1.1 | `extensions` |
| `pg_net` | 0.20.3 | `extensions` |
| `pgmq` | 1.5.1 | `pgmq` |
| `vector` | 0.8.0 | `extensions` |
| `plpgsql` | 1.0 | `pg_catalog` |

Disponibles pero no instaladas: pgTAP 1.3.3, pg_jsonschema 0.3.3, isn 1.2,
hypopg 1.4.1, index_advisor 0.2.0, PGroonga 3.2.5 y fuzzystrmatch 1.2.

El inventario no modifica la decisión del plan:

- pgTAP sigue siendo candidato para tests SQL en F1; preferir dev/CI, sin pruebas
  destructivas sobre objetos productivos.
- pg_jsonschema es condicional a la necesidad real del perfil estructurado.
  Comprobar la API y versión efectiva antes de instalar; disponible no significa
  instalada ni contrato idéntico a versiones nuevas.
- No hay evidencia aquí para incorporar otro buscador, PGroonga o fuzzystrmatch.
  La similitud no sustituye las restricciones de 1 L, 6×125 g o 2 kg.
- OFF nutricional ya existe según el código/auditoría; la ampliación se evalúa en
  F4. GS1 sigue siendo un piloto opcional sujeto a cobertura/licencia/coste.

No se ha instalado extensión, contratado proveedor ni cambiado la infraestructura.

### Edge Functions desplegadas

| Función | Versión | Estado | verify_jwt |
|---|---:|---|---|
| `delete-account` | 10 | ACTIVE | true |
| `apple-link` | 8 | ACTIVE | true |
| `send-push` | 13 | ACTIVE | true |
| `catalog-embed` | 13 | ACTIVE | false |
| `revenuecat-webhook` | 6 | ACTIVE | false |
| `process-price-alerts` | 6 | ACTIVE | false |
| `sync-plus-subscription` | 2 | ACTIVE | true |

`verify_jwt=false` describe una configuración, no demuestra una vulnerabilidad:
la autenticación propia del handler se revisará en F1. CE-001 no invocó esos
handlers ni certifica su seguridad. `catalog-embed` ACTIVE tampoco significa
procesamiento automático habilitado: el control de BD está pausado.

## 6. Estado operativo y carga observada

Captura de 19:18:48 UTC:

| Indicador | Resultado |
|---|---|
| Pipeline | paused; última actualización 2026-09-01 20:37:38 UTC |
| Presupuesto canario restante | 0 solicitudes |
| Límites almacenados | max_auto_jobs=1000; max_auto_ratio=0,1; canary_max_requests=1 |
| Cola | 20 mensajes, todos visibles: Gadis 19 y Ahorramás 1 |
| Estados de runs | settled 15; draining 2; materialized 3; running 1 |
| Cron 17, embeddings | Cada 15 min; inactivo |
| Cron 18, alertas de precio | Cada 15 min; activo; fuera del cambio CE-1 |
| Zona horaria pg_cron | GMT |
| HNSW | Válido/listo/vivo; 597.745.664 bytes |
| Tuplas vivas / muertas | 202.953 / 8.946, estimadas |
| Proporción de muertas | 4,222 %, por debajo de alerta de 5 % |
| Mantenimiento | requiresAttention=false; ningún vacuum/index maintenance observado |
| Actividad, excluida esta consulta | 0 sesiones activas, 0 esperas de lock, 0 idle in transaction |

El conteo de cola se limitó a 5.001 filas: al devolver 20 no quedó truncado.
Las estadísticas de tablas siguen siendo estimaciones. Cero actividad en un
instante **no demuestra** ausencia de usuarios, capacidad sobrante o impacto cero
de futuras escrituras; no autoriza subir lotes ni sustituye la observación de
dos ciclos del pipeline.

Los dos runs draining corresponden a los mensajes nuevos. Hay tres materialized
antiguos de Gadis y un running de DIA del 1 de septiembre a las 13:55 UTC,
anterior a otro DIA settled a las 20:37 UTC. Se registra la inconsistencia aparente,
sin declararlos fallidos ni corregirlos automáticamente. El historial reciente
del cron 17 incluye fallos anteriores a su pausa; no prueba un incidente actual.

No se drenó la cola, reactivó cron, limpió runs ni ejecutó VACUUM/REINDEX.

## 7. Horarios reales y discrepancias del checkout

Se leyeron mediante GET los workflows de GitHub en el commit de `main` indicado:
20 relevantes de 23 existentes (19 de sync y uno de mantenimiento).
Los 20 figuran activos como workflows; 15 tienen cron y cinco son manuales.
`active` no significa que tengan ejecución programada ni que la última haya
terminado correctamente.

Cron en UTC; corresponde sumar dos horas en Madrid en esta fecha, una en invierno.
Son configuraciones, no garantía de puntualidad ni una auditoría de todos los runs.

| Workflow | Cron UTC / disparador | Igual al archivo local |
|---|---|---|
| Catalog embedding maintenance | `20 5 * * *` | Sí |
| Sync Ahorramás catalog | `0 6 * * *` | Sí |
| Sync Alcampo catalog | Manual, sin cron | Sí |
| Sync Aldi catalog | `40 10 * * 1` | Sí |
| Sync Ametller catalog | `20 10 * * 1` | Sí |
| Sync BM catalog | Manual, sin cron | Sí |
| Sync bonArea catalog | `10 7 * * 1` | Sí |
| Sync BonpreuEsclat catalog | `0 7 * * 2` | Sí |
| Sync Caprabo catalog | Manual, sin cron | Sí |
| Sync Mercadona catalog | `0 6 * * 1` | Sí |
| Sync Condis catalog | `0 10 * * 1` | Sí |
| Sync Consum catalog | `30 7 * * 1` | Sí |
| Sync Dia catalog | `50 7 * * 1` | No: timeout remoto 45 min / local 60 min |
| Sync Eroski catalog | Manual, sin cron | Sí |
| Sync Froiz catalog | Manual, sin cron | Sí |
| Sync Gadis catalog | `20 5 * * *` | Sí |
| Sync Hipercor catalog | `40 4 * * *` | Sí |
| Sync HiperDino catalog | `40 11 * * 1` | Sí |
| Sync Plusfresc catalog | `40 10 * * 1` | Sí |
| Sync Sorli catalog | `20 8 * * 1` | Sí |

DIA difiere solo en la línea del timeout: `main` tiene 45 minutos; este checkout,
60. No se publicó el cambio. Gadis y mantenimiento comparten las 05:20 UTC:
posible coincidencia de carga a considerar en CE-004, no un conflicto demostrado.

Carrefour no tiene workflow de sync dedicado en la lista. El
[README local](../../scripts/README-carrefour-sync.md) documenta Task Scheduler
de Windows los lunes a las 08:00 locales y el wrapper PowerShell.
**La instalación efectiva del scheduler de esa máquina no se ha verificado.**
Los horarios externos de Windows y los valores de secrets de los workflows se
dejan como límite explícito; no se presentan como configuración remota comprobada.

### Antigüedad de la última sincronización global

Edades calculadas frente a la captura operativa, redondeadas a una décima de hora:

| Tienda | synced_at UTC | Edad, horas |
|---|---|---:|
| ahorramas | 2026-09-02 11:20:40 | 8.0 |
| alcampo | 2026-08-21 09:05:06 | 298.2 |
| aldi | 2026-09-01 12:50:13 | 30.5 |
| ametller | 2026-09-01 13:10:59 | 30.1 |
| bm | 2026-08-30 18:20:35 | 73.0 |
| bonarea | 2026-09-01 13:18:03 | 30.0 |
| caprabo | 2026-08-31 09:24:40 | 57.9 |
| carrefour | 2026-08-31 09:22:40 | 57.9 |
| condis | 2026-09-01 13:12:15 | 30.1 |
| consum | 2026-09-01 13:12:26 | 30.1 |
| dia | 2026-09-01 20:20:14 | 23.0 |
| eroski | 2026-08-31 08:12:35 | 59.1 |
| esclat | 2026-09-01 19:30:59 | 23.8 |
| froiz | 2026-08-29 11:30:34 | 103.8 |
| gadis | 2026-09-02 09:58:52 | 9.3 |
| hipercor | 2026-09-02 09:23:05 | 9.9 |
| hiperdino | 2026-09-01 12:50:47 | 30.5 |
| mercadona | 2026-09-01 13:49:13 | 29.5 |
| plusfresc | 2026-09-01 12:51:13 | 30.5 |
| sorli | 2026-09-01 13:13:15 | 30.1 |

Solo 5/20 estados globales quedan dentro de 24 h; 15/20 las superan.
**No significa que 15/20 catálogos tengan todos sus precios caducados:** este dato
global no sustituye timestamps, publicación ni disponibilidad por producto/zona.
En Alcampo `updated_at` es posterior a `synced_at`; no rejuvenecer precios
usando una actualización administrativa del estado.

CE-005 debe decidir el TTL con evidencia por producto y CE-004 presupuestar la
frecuencia necesaria. Opciones a evaluar, no aprobadas aquí: limitar el piloto
a fuentes con vigencia demostrable; refresco selectivo por referencia; o aumentar
syncs solo con presupuesto y límites de origen/carga. No alargar el TTL
automáticamente para evitar resultados vacíos ni prometer ahorro con datos dudosos.

## 8. Pendientes derivados, sin ampliación de alcance

| Hallazgo / límite | Seguimiento previsto |
|---|---|
| HNSW pendiente y modal local | CE-002: separar efectos, pruebas, riesgos y decisión de incorporación |
| BM/Hipercor fuera de destinos v5 | CE-003/CE-004: delimitar tiendas del piloto; no habilitarlas automáticamente |
| Cuota reclamada antes del resultado | CE-003: ratificar política de cuota/mensajes |
| Sync semanal/manual frente a 24 h | CE-004/CE-005: presupuesto y regla de vigencia |
| Deriva de ledger, archivos y timeout DIA | CE-103; evitar despliegue por arrastre |
| Destinos guardados en secrets / scheduler Windows | CE-100–CE-102: verificar sin exportar secretos, antes de operar esos procesos |
| Permisos/handlers no auditados íntegramente | CE-101/CE-105: pruebas específicas de autorización |
| Cola pendiente y runs antiguos | Mantener seguimiento operativo del pipeline separado de CE-1 |
| Backups/PITR, costes, capacidad y carga sostenida | CE-100/CE-004; no inferidos del estado ACTIVE_HEALTHY |

Los apartados históricos que piden autorización por el mero destino productivo
no sustituyen CE-ENV-001. Esto tampoco aprueba un parche ajeno por arrastre:
CE-002 y los controles de su fase siguen siendo obligatorios.

## 9. Validación y acta

- TypeScript: `npx tsc --noEmit`, salida 0.
- Comprobaciones documentales: enlaces y bloques válidos; 67 tareas sin IDs
  duplicados, solo CE-000/CE-001 cerradas y 35 casos de regresión conservados.
- JSON de evidencia válido; conteos de inventario y envolturas READ ONLY
  comprobados. `git diff --check`: correcto.
- Huellas SHA-256: 8/8 archivos preexistentes de aplicación, tests, SQL y
  operación sin cambios respecto al baseline de CE-000.
- Los cinco bloques SQL terminaron sin errores y con ROLLBACK; no hubo escritura
  persistente de la tarea en tablas, funciones, configuración o ledger.
- Lecturas de metadatos y estadísticas tienen consumo de recursos; no se promete
  impacto físico cero. No se detectó una incidencia durante las comprobaciones,
  sin sustituir una medición de carga.
- Ningún secreto ni dato personal exportado al acta/evidencia.
- No se declara que la precisión, cobertura o velocidad hayan mejorado.

| Campo | Resultado |
|---|---|
| Proyecto / tarea | CE-1 / F0 / CE-001 |
| Resultado | Inventario remoto y diferencias documentados |
| Estado de tarea | COMPLETADA |
| Estado de fase | F0 EN CURSO; CE-002–CE-005 pendientes; G0 no aceptado |
| Autoridad | Continuación «adelante» + CE-ENV-001 |
| Responsable técnico | Codex en esta tarea |
| Cambios remotos persistentes | Ninguno; solo consultas de lectura y GET de metadatos |
| Nuevos recursos / contratos | Ninguno; coste marginal de lectura no cuantificado |
| Reversión remota | No aplicable; no hubo cambios persistentes |
| Entregables | Esta acta y JSON de evidencia, enlazados en plan/contexto/handoff |
| Próxima tarea | CE-002: revisión independiente del HNSW pendiente y la resiliencia del modal |

Revalidar el estado mutable antes de cualquier escritura posterior. El cierre de
CE-001 no acepta F0 ni habilita el inicio de F1.
