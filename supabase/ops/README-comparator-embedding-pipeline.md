# Operación del pipeline de embeddings

El pipeline permanece apagado hasta completar este orden:

1. Desplegar `20260809120628_comparator_embeddings_layer.sql` y
   `20260809123232_comparator_embedding_pipeline.sql`.
2. Crear un token aleatorio exclusivo para el worker. No reutilizar la clave de
   OpenAI ni la `service_role`.
3. Configurar como Edge Secrets `OPENAI_API_KEY` y
   `EMBEDDING_WORKER_TOKEN`.
4. Guardar en Supabase Vault:
   - `catalog_embed_project_url`: URL del proyecto sin barra final;
   - `catalog_embed_worker_token`: el mismo token del paso 2.
5. Desplegar `catalog-embed`, cuya verificación JWT está desactivada porque se
   autentica con el token interno constante enviado por `pg_net`.
6. Desplegar `event_driven_catalog_embedding_dispatch`, que permite a
   `service_role` arrancar lotes y deja el cron como respaldo cada 15 minutos.
7. Ejecutar `enable-comparator-embedding-cron.sql` solo si hay que reconstruir
   manualmente ese cron de respaldo.

Para pausar sin perder trabajos, ejecutar
`disable-comparator-embedding-cron.sql`. La Fase 0 instala un interruptor
central: `paused` bloquea tanto el cron como el impulso del materializador y el
encadenamiento del worker. Los mensajes quedan en `catalog_embedding_jobs`.

## Control operativo de Fases 0 y 1

El estado inicial tras desplegar
`20260831203004_embedding_pipeline_phase_zero_control.sql` es siempre
`paused`; la migración no procesa la cola existente. Estados disponibles:

- `paused`: materializa y encola, pero ninguna ruta invoca `catalog-embed`;
- `canary`: concede un presupuesto global de una sola petición por activación;
  el primer despacho lo consume y el encadenamiento del worker se detiene;
- `active`: respeta la concurrencia solicitada, hasta el límite existente.

Estado y cambios manuales, siempre con rol de servicio o desde SQL administrativo:

```sql
select public.catalog_embedding_pipeline_status();
select public.catalog_set_embedding_pipeline_mode('paused', 'motivo operativo');
select public.catalog_set_embedding_pipeline_mode('canary', 'canario supervisado');
select public.catalog_set_embedding_pipeline_mode('active', 'activacion aprobada');
```

`enable-comparator-embedding-cron.sql` entra deliberadamente en `canary`, no
en `active`, y rearma ese único permiso. `disable-comparator-embedding-cron.sql`
pone el control en `paused` y desactiva el cron, sin eliminarlo.

Cada reconciliación real registra una fila privada en
`comparator_internal.catalog_embedding_runs`. Si prevé más de 1.000 embeddings
o más del 10 % de la tienda, pausa automáticamente el pipeline antes de
escribir el snapshot. Desde Fase 1, el materializador bloquea también upserts,
despublicaciones y encolado, y detiene el resto de tiendas de esa ejecución.
Una carga excepcional ya revisada exige
`EMBEDDING_ANOMALY_OVERRIDE=1`; el override queda auditado y nunca cambia por sí
solo un pipeline que ya estuviera pausado.

Fase 1 se despliega en este orden: migración
`20260831214031_embedding_materializer_phase_one_idempotency.sql`, worker
`catalog-embed` compatible con payload legacy/nuevo y, por último,
materializador. La migración exige `paused` y cero jobs en vuelo. Añade sin
backfill tres identidades separadas:

- `embedding_input_hash`: hash del texto exacto enviado al modelo;
- `semantic_identity_hash`: huella estable para decidir si el input debe
  cambiar;
- `match_metadata_hash`: GTIN, unidad, cantidad, publicación y filtros de
  matching, sin invalidar el vector.

La cola es única por `(store, productId, embeddingInputHash, model)`. Tanto los
jobs visibles como invisibles suprimen duplicados; un fallo terminal archivado
suprime reintentos automáticos. `catalog_delete_embedding_jobs` bloquea primero
los productos, elimina después los mensajes y vuelve a garantizar la identidad
vigente, cerrando la carrera A→B→A.

Antes de activar un canario:

1. ejecutar `DRY_RUN=1 STORES=<tienda> node scripts/sync-comparator-embedding-catalog.mjs`;
2. repetir dos runs reales con el pipeline todavía en `paused`;
3. exigir 0 cambios en la segunda ejecución salvo delta real de la fuente;
4. comprobar cola, runs, fallos, cron y advisors;
5. entrar en `canary` solo con un lote revisado y presupuesto explícito.

La verificación SQL reproducible está en
`supabase/ops/verify-embedding-materializer-phase-one.sql`; siempre termina en
`ROLLBACK` y debe mostrar `PHASE_ONE_SMOKE_OK`.

## Hardening batch del worker (preparatorio)

Desplegada el 01-09-2026 con la migración
`20260901072452_embedding_worker_phase_three_batch_writes.sql` y
`catalog-embed` v12. El orden seguro es: pipeline `paused` y cero jobs en vuelo,
migración, `verify-embedding-worker-phase-three.sql`, despliegue del worker,
smoke HTTP sin jobs y solo después un canario. El smoke usa `service_role`,
prueba escritura y fallo multi-fila, CAS de hash/versión/publicación, archivo
terminal, identidad incorrecta y atomicidad, y termina siempre en `ROLLBACK`.

El worker divide cada request en bloques OpenAI de 50 textos. Cada respuesta se
finaliza en sublotes de 20 productos mediante una sola RPC
`catalog_finalize_embedding_batch`; la RPC admite como defensa un máximo de 25.
Cada llamada ejecuta un `UPDATE ... FROM jsonb_to_recordset(...)`, vuelve a
validar tienda, producto, publicación, hash efectivo, `content_hash`, versión y
modelo, y confirma los mensajes PGMQ dentro de la misma transacción. Los fallos
se auditan también por lote. Si una fila provoca un error determinista, el
worker la aísla por bisección acotada y deja avanzar las sanas; un error
sistémico devuelve 500, no encadena otro worker y conserva los jobs pendientes.

Canarios productivos de aceptación:

- request 2688, worker v11 y escritura 25: 100 completados, 0 fallidos/stale/
  deferred, cuatro RPC; la RPC más lenta alcanzó 6,91 s, demasiado cerca del
  límite heredado de 8 s;
- request 2690, worker v12 y escritura 20: 100 completados, 0 fallidos/stale/
  deferred, seis RPC (20+20+10 por cada bloque OpenAI), unos 15,7 s totales y
  ~12,34 s SQL agregados; cero locks, consultas largas o vacuum activo.

Estado posterior: `paused`, cron 17 inactivo, 3.401 jobs visibles, cero en
vuelo, duplicados o fallos abiertos. No usar aún `active`: esa ruta puede abrir
hasta tres workers y el trigger row-level de generación de caché sigue
actualizando una vez por vector. Hasta sustituirlo por invalidación set-based
por sentencia/run, no solapar un drenaje con un sync y usar únicamente canarios
de una petición. Este paso reduce viajes REST/transacciones; no es la Fase 3
HNSW.

## Fase 3: una sola sustitución de vector por cambio

Implementada localmente en
`20260901075343_phase_three_single_hnsw_mutation.sql`, pendiente de producción.
Añade `embedded_content_hash` sin actualizar en masa las filas existentes. Para
compatibilidad, un hash embebido `NULL` con vector presente equivale al input
actual; cuando cambia el input, el trigger fija el hash anterior y conserva el
vector. La fila queda pendiente porque ambos hashes ya no coinciden.

El materializador y el worker reconocen ese estado. Las búsquedas v1/v2/v3 y
las rutas de caché v3/v5 excluyen fuentes y candidatos pendientes. Tras OpenAI,
`catalog_finalize_embedding_batch` revalida la identidad actual y escribe
`embedding` y `embedded_content_hash` juntos. Si el producto cambió durante la
petición, confirma el trabajo como obsoleto y garantiza la identidad nueva sin
pisar el vector conservado.

Orden de despliegue obligatorio:

1. confirmar pipeline `paused`, cron apagado y cero jobs en vuelo;
2. aplicar `20260901075343_phase_three_single_hnsw_mutation.sql`;
3. ejecutar `verify-embedding-phase-three-single-hnsw-mutation.sql` y exigir
   `PHASE_THREE_SINGLE_HNSW_MUTATION_SMOKE_OK`;
4. desplegar el worker actualizado;
5. ejecutar un smoke HTTP que no reclame cola;
6. abrir un único canario con presupuesto explícito, observar y volver a
   `paused`.

No se modifica el predicado del índice HNSW para incluir la igualdad de hashes:
eso volvería a sacar y reinsertar la fila en el índice. La separación física
entre catálogo mutable y tabla mínima de vectores queda como evolución
posterior.

Diagnóstico de ejecuciones recientes:

```sql
select store, status, source_products, new_products,
       semantic_changed_products, metadata_only_products,
       expected_embedding_jobs, change_ratio, anomaly_blocked,
       started_at, materialized_at
from comparator_internal.catalog_embedding_runs
order by started_at desc
limit 20;
```

## Integración con los syncs de catálogo

Los workflows de los 18 supermercados compatibles ejecutan, después de un sync
correcto, `sync-comparator-embedding-catalog.mjs` con `STORES` limitado a la
tienda actual. Bonpreu/Esclat espera al último lote del ciclo encadenado. Los
runners PowerShell locales repiten el mismo postproceso y lo omiten en
`DRY_RUN`; Carrefour se integra por esta vía porque su sync productivo no corre
en GitHub Actions.

El postproceso materializa e invalida siempre, pero el despacho depende del modo
central: cero lotes en `paused`, uno en `canary` y hasta tres en `active`. Cada
instancia de `catalog-embed` reclama un lote adicional al terminar pasando por
el mismo control. El cron `catalog-embedding-dispatch`, cuando se habilita,
ejecuta cada 15 minutos únicamente como red de seguridad para impulsos fallidos
y reintentos. Hipercor queda fuera hasta incorporarlo al contrato completo del
comparador.

Los trabajos fallidos se reintentan mediante el visibility timeout de `pgmq`.
Tras cinco intentos se archivan y quedan auditados en
`catalog_embedding_failures`; los errores de saldo de OpenAI permiten veinte
intentos antes de archivarse.

No se debe guardar ninguno de los secretos en este repositorio ni pasarlos como
argumentos visibles en scripts versionados.

## Caché de coincidencias

`catalog_cheaper_products_v3` rellena la caché de forma perezosa por producto y
tienda destino. No necesita `pg_cron`, `pg_net`, OpenAI ni una Edge Function:
reutiliza los embeddings ya persistidos y solo calcula una combinación cuando
falta o ha quedado obsoleta.

Los precios no forman parte de la caché. Se leen de las tablas de catálogo en
cada RPC, de modo que un sync de precios no obliga a recalcular similitud.
Cambios semánticos o de publicación incrementan la generación de la tienda y
provocan un refresco automático en el siguiente acceso.

Consultas de diagnóstico:

```sql
select count(*) from public.catalog_product_match_cache_status;
select count(*) from public.catalog_product_matches
where match_version = 'embedding_hybrid_v3_0_60';
```

No borrar solo los matches positivos: el estado separado representa también
los resultados negativos. Para vaciar una entrada concreta, eliminar primero
su fila de `catalog_product_match_cache_status`; la siguiente RPC la reconstruirá
y reconciliará sus matches dentro de la misma transacción.
