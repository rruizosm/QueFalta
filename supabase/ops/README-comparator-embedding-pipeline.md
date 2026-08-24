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
6. Ejecutar `enable-comparator-embedding-cron.sql`.

Para pausar sin perder trabajos, ejecutar
`disable-comparator-embedding-cron.sql`. Los mensajes quedan en
`catalog_embedding_jobs` y vuelven a estar disponibles al reactivar el cron.

## Integración con los syncs de catálogo

Los workflows de los 17 supermercados compatibles ejecutan, después de un sync
correcto, `sync-comparator-embedding-catalog.mjs` con `STORES` limitado a la
tienda actual. Bonpreu/Esclat espera al último lote del ciclo encadenado. Los
runners PowerShell locales repiten el mismo postproceso y lo omiten en
`DRY_RUN`; Carrefour se integra por esta vía porque su sync productivo no corre
en GitHub Actions.

El postproceso materializa e invalida, pero no consume la cola por sí mismo. El
cron `catalog-embedding-dispatch` debe estar activo para que la Edge Function
genere los vectores pendientes. Hipercor queda fuera hasta incorporarlo al
contrato completo del comparador.

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
