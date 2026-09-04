# CE-1 / F0 — Baseline local y cierre de CE-000

> Fecha: 2026-09-02.
> Estado al cierre de CE-000: completada; F0 entonces EN CURSO, G0 sin aceptación.
> Plan aplicable: v1.1 / decisión CE-ENV-001.

Nota de continuidad: esta acta conserva la captura histórica de CE-000. La
verificación remota posterior está cerrada en
[CE-001-supabase-inventory.md](CE-001-supabase-inventory.md), y la revisión de
parches en [CE-002-independent-review.md](CE-002-independent-review.md).
CE-003 está cerrada en [decisions.md](decisions.md) y CE-004 en
[budget.md](budget.md); CE-005 está cerrada en [acceptance.md](acceptance.md):
FR-02 y QA-01 confirmadas, F0 ACEPTADA / G0 PASS. CE-100 en curso en
[CE-100-readiness.md](CE-100-readiness.md). Las menciones a tareas pendientes
describen el cierre original de CE-000.

## 1. Alcance de este registro

Esta acta cierra únicamente CE-000: revisar el plan, la auditoría y los documentos
de contexto, y registrar el commit y los cambios locales existentes sin
sobrescribirlos. No cierra CE-001 ni la fase F0.

Se incorporó antes la instrucción del usuario de permitir trabajo directo en el
Supabase actual, incluida producción. Esa autorización ya consta en el plan; no
se necesitan otra rama o proyecto remoto como requisito. Sigue siendo necesario
respetar fases, límites de operación y aprobaciones de costes nuevos, operaciones
destructivas/masivas y activación para usuarios.

**Operaciones remotas de base de datos en esta tarea: ninguna.** Consultar
documentación oficial de Supabase no equivale a verificar su estado desplegado.

## 2. Documentos revisados y decisiones conservadas

| Fuente | Resultado relevante para retomar |
|---|---|
| [AGENTS.md](../../AGENTS.md) | Expo SDK 54 / React Native 0.81.5; preservar cambios; typecheck obligatorio |
| [Plan maestro](../../PROYECTO-COMPARADOR-ESTRICTO.md) | Secuencia F0–F8, criterios de calidad y trabajo directo bajo CE-ENV-001 |
| [Auditoría](../../COMPARADOR-ESTRICTO.md) | Evidencia de cantidad, identidad, precio y zona; cifras históricas, no medición nueva |
| [CONTEXTO.md](../../CONTEXTO.md) | Estado reciente del comparador/pipeline, arquitectura, gotchas y referencias históricas de migraciones |
| [HANDOFF.md](../../HANDOFF.md) | Cambios locales, despliegues documentados, trabajos operativos en vuelo y OFF nutricional |
| [COMPARATIVA.md](../../COMPARATIVA.md) | Diseño histórico; no trasladar su equivalencia de tamaños a CE-1 |

Permanecen obligatorias:

- igualdad nominal de cantidad y estructura del pack;
- identidad, variantes y endulzado con evidencia; orden de palabras no es identidad;
- desconocidos/conflictos se abstienen;
- precio, disponibilidad, fecha y zona verificables;
- GTIN/IA/revisión humana no saltan las puertas;
- piloto propuesto de agua, yogur y patatas congeladas; carne/embutidos en cuarentena;
- PKCE, claves locales por usuario, tema dinámico y categoría al añadir a cesta;
- ninguna nueva promesa comercial en la web antes de publicar la funcionalidad.

El cambio de entorno no ratifica automáticamente presupuesto, TTL, alcance de
tiendas ni métricas: siguen en CE-003–CE-005.

## 3. Identidad del checkout

- Raíz: `/Users/rruizosmaalohacloud/Desktop/ProyectoGeneralQueFalta/QueFalta`.
- Rama: `codex/phase5-observation`.
- Commit HEAD: `03b8ba273e17709fd8fc69c20dddb68c147a7e2a`.
- Fecha del commit: `2026-09-01T21:32:18+02:00`.
- Asunto del commit: `fix: allow Dia sync one hour`.
- Índice de Git: sin cambios preparados para commit.
- No se creó rama, commit, stash ni se ejecutó checkout/reset/fetch/push.
- El contenido de archivos ignorados de credenciales no se ha volcado al registro.

El dominio `auth.quefalta.es` y la ref `gkffvigcnsesbaihycay` aparecen en la
documentación local. **El destino real y su asociación se verificarán en CE-001
antes de operar**; esta acta no afirma una comprobación remota nueva.

## 4. Inventario del worktree

Captura: `2026-09-02T18:53:08.868Z` (20:53:08 en Europe/Madrid).
Se tomó después de actualizar la política a v1.1 y antes de añadir esta acta y
marcar CE-000 completada.

- 6 archivos versionados modificados.
- 7 archivos sin seguimiento.
- 0 archivos preparados en el índice.
- Ninguna eliminación en la captura.

Los hashes de los documentos describen ese instante; el cierre de CE-000 cambia
después sus enlaces/estado de forma intencionada. Los ocho archivos de aplicación,
tests, SQL y operación listados fuera de la documentación CE-1 se conservan
íntegros y se verifican al terminar.

| Estado Git | Archivo | Bytes | SHA-256 de la captura |
|---|---|---:|---|
| `M` | `COMPARATIVA.md` | 12775 | `352d220d1fe547cb714beb75157533fbe79a7158b543d5b9667e8ae4c0f23ad1` |
| `M` | `CONTEXTO.md` | 172328 | `a3dd25194c900ce22a05636f161d1b9fb2cf75325805b066c103f4357471ca16` |
| `M` | `HANDOFF.md` | 111412 | `b4e2e26c2bad6fe482203ba81b124a45ca5e352b3abf38aecf4b73f798754607` |
| `M` | `src/components/SimilarProductsSection.tsx` | 23444 | `d2e594cfd4ba184e839e13c0fd5e049917a16900dfea4fa2f884992234a1127e` |
| `M` | `src/components/StoreProductModal.tsx` | 14383 | `f467d6a7604f797e7b944a543310f1c30bfe3bafc40e3f8fa5cf7d4e696a45c4` |
| `M` | `supabase/ops/README-comparator-embedding-pipeline.md` | 19649 | `424a293c99b0b843a9c7032da5b813b889da324a05ffddcf3349970e53379f40` |
| `??` | `COMPARADOR-ESTRICTO.md` | 40863 | `3a130b936108310021b422be4a2f75017b510a6f6e5bb47c414a46b384ae5b64` |
| `??` | `PROYECTO-COMPARADOR-ESTRICTO.md` | 54914 | `3a9070eb4174b5ec0b41f1ea8583720495fdd78d9628a8af7c8d6997917534ad` |
| `??` | `scripts/tests/comparator-filtered-hnsw-recall.test.mjs` | 1466 | `77f062b789bff88cf0b3384794fec58a00c5752944a978dc6aa5f7016386eec4` |
| `??` | `scripts/tests/store-product-modal-resilience.test.mjs` | 1171 | `5aecf3e3f1cc8150a2f0f870e58efbd6121b07c84670fe68c6840eda5ab4022d` |
| `??` | `supabase/migrations/20260901203103_extend_embedding_finalize_statement_timeout.sql` | 373 | `9a32b3054833c30d0ae23873211799fdf7341e9098ed16a9ed9ec2274b844c9f` |
| `??` | `supabase/migrations/20260902122234_fix_comparator_filtered_hnsw_recall.sql` | 11521 | `ac9fa3360afa4be72a7ae0d1e1336282a5ec1c5991d78e6e249381ffbb97646d` |
| `??` | `supabase/ops/verify-comparator-filtered-hnsw-recall.sql` | 2865 | `3e14c005dff3673b847e3a9ed816ea9bbeaecb98485acc5e9a1978d723e3aab4` |

### Agrupación del trabajo preexistente

1. **Resiliencia de ficha:** `SimilarProductsSection.tsx`,
   `StoreProductModal.tsx` y su test. Fallback global limitado al Radar,
   estado de error persistente y reintento. No confundir abrir una ficha global
   con demostrar disponibilidad/precio local.
2. **Recall HNSW:** migración `20260902122234`, test y verificador SQL.
   Documentada como pendiente de despliegue. No aplicar por arrastre.
3. **Finalización de embeddings:** migración `20260901203103` y actualización
   del documento operativo. HANDOFF la describe como desplegada, aunque el
   archivo SQL figure sin seguimiento en este checkout.
4. **Documentación CE-1:** auditoría, plan, enlaces y política de entorno.
   Estas son las únicas áreas editadas al retomar esta tarea.

## 5. Hechos locales frente a estado remoto pendiente

| Asunto | Evidencia local | Acción posterior |
|---|---|---|
| RPC activa | Auditoría reciente describe v7; apartados históricos aún hablan de v5 pendiente | CE-001: comprobar funciones reales e historial |
| HNSW filtrado | SQL local y regresión presentes; documentación reciente dice no desplegado | CE-001/CE-002: reconciliar sin ejecutar automáticamente |
| Timeout de finalizadora | SQL sin seguimiento, pero HANDOFF registra despliegue y drenaje posterior | CE-001: verificar definición e historial antes de aplicar |
| Pipeline de embeddings | Último estado documentado: pausado, cron 17 inactivo, observación de ciclos pendiente | CE-001: comprobar estado actual; no activar ni drenar por efecto colateral |
| Ficha de producto | Diffs locales presentes | Preservar; incorporación al release con pruebas independientes |
| Open Food Facts | Uso nutricional y semántica especial de `off_code` documentados | No tratarlo como nueva instalación ni GTIN comercial del pack |
| Entorno | Usuario permite el Supabase actual | CE-001 identifica destino; F1 habilita controles, no un segundo backend |

Los apartados antiguos de CONTEXTO/HANDOFF son históricos y pueden contradecir
despliegues posteriores. No convertir sus listas de «pendientes» en órdenes de
ejecución. Tampoco asumir que un archivo sin seguimiento corresponde a una
migración no aplicada remotamente.

## 6. Validación y límites

- `npx tsc --noEmit`: correcto, código de salida 0.
- `git diff --check`: correcto tras el cierre documental.
- Comprobación documental: enlaces y bloques válidos, 67 tareas sin IDs
  duplicados, solo CE-000 completada, 35 casos de regresión y estados coherentes.
- Verificación SHA-256 de los ocho archivos preexistentes no editados: 8/8
  coinciden con la captura de la sección 4.
- No se ejecutan aquí SQL, migraciones, syncs, backfills, llamadas al comparador,
  instalación de extensiones ni pruebas de carga remotas.
- No se declara precisión nueva ni cobertura nueva del comparador.

## 7. Acta de tarea y siguiente paso

| Campo | Resultado |
|---|---|
| Proyecto / tarea | CE-1 / F0 / CE-000 |
| Resultado | Revisión y baseline local registrados |
| Estado de tarea | COMPLETADA |
| Estado de fase | F0 EN CURSO; G0 no aceptado |
| Responsable técnico | Codex en esta tarea |
| Autoridad | Petición «Adelante con la primera tarea» + revisión CE-ENV-001 |
| Impacto real en producción | Ninguno en esta tarea |
| Cambios de código/SQL preexistentes | Preservados; no desplegados por esta tarea |
| Coste nuevo / contratación | Ninguno |
| Reversión remota | No aplicable; no hubo escritura remota |
| Próxima tarea | CE-001: reconciliar el estado real de Supabase mediante metadatos acotados |

Faltan CE-001–CE-005 y su evidencia. No avanzar a F1 ni dar G0 por aprobado
por el mero cierre de esta primera tarea.
