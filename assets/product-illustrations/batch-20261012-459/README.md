# Mercadona — resultado de los 459 pendientes (12-10-2026)

**441 ilustraciones WebP nuevas subidas y verificadas en Supabase.** Los 18 restantes de este encargo tienen rechazos de ImageGen registrados: 14 históricos y 4 nuevos. No se reintentaron ni reformularon los productos rechazados por moderación.

| Lote | Seleccionados | Ilustraciones verificadas | Bloqueados nuevos |
|---|---:|---:|---:|
| 01 |112|108|4|
| 02 |111|111|0|
| 03 |111|111|0|
| 04 |111|111|0|
| Total elegible |445|441|4|

Los 14 bloqueos históricos se excluyeron antes de repartir los lotes. IDs históricos: 44973,14159,86913,14087,12421,47038,47039,13299,17790,17791,13301,13321,17792,16262. Nuevos: 27201,46920,8260,52821.

Auditoría final: **2026-10-12 15:45:12 UTC**. Los 441 archivos (29.292.088 bytes) superan MIME, SHA-256, bytes, dimensiones (máximo 768 px), alfa nativo y WebP, prompt exacto y vínculo en BD. Foto oficial y referencia de estilo 10699; ImageGen integrado individual. Todos los WebP finales y las galerías recuperadas desde Storage se revisaron visualmente. Se corrigieron las imágenes que fallaron la revisión antes de publicarlas.

Los 441 JPG fuente y 441 WebP temporales se eliminaron después de verificar cada subida. La carpeta assets/product-illustrations contiene **cero JPG/JPEG/WebP**. Se conservan los PNG nativos y sus versiones, prompts exactos, metadatos y recibos. Typecheck: `npx tsc --noEmit`, salida 0. Todos los productores y el guardián de cuota terminaron; no se alcanzó cuota 429.

Durante la auditoría cambió el catálogo: **55 miniaturas** (52 anteriores y 3 seleccionadas) y 3 productos de esta tanda pasaron a published=false: 3768,4326,37001. El proceso de subida solo escribe illustration_url. Se conservaron los cambios de catálogo y se documentaron en la auditoría; las **5835 URLs de ilustración anteriores siguen intactas**. Los 441 productos estaban publicados al subir; 438 seguían publicados al cierre y los 441 conservan su ilustración enlazada. La auditoría estricta de 15:30:48 anterior a esos cambios se conserva como evidencia histórica.

Al **2026-10-12 15:46:54 UTC**, el catálogo tiene **6276 productos ilustrados** y **56 publicados sin ilustración**: los 18 bloqueados de este encargo más **38 productos publicados adicionales fuera del snapshot inicial**. Estos 38 aparecieron en la cola durante la actualización del catálogo y no forman parte del encargo de 459. Sus IDs y nombres quedan guardados para una siguiente tanda.

Evidencias: [auditoría final](verification.json), [auditoría estricta anterior](verification-strict-153048.json), [cola adicional de 38](new-published-pending-after.json), [cambios de miniaturas observados](catalog-thumbnail-drift.json), [exclusiones históricas](historical-exclusions.json), [typecheck](typecheck.json), y los README/QA/recibos de cada lote.

Para verificar de nuevo el snapshot con cambios concurrentes de catálogo: `node --env-file=.env.local assets/product-illustrations/batch-20261012-459/audit.mjs --allow-partial --allow-catalog-state-drift`. Sin la opción explícita de cambios de catálogo, el verificador sigue siendo estricto con miniaturas y published. Los checks de URL de ilustración, bytes, MIME, SHA, alfa y limpieza permanecen obligatorios.
