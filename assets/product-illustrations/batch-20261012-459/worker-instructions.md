# Mercadona: 459 pendientes, 12-10-2026

445 elegibles en cuatro lotes exclusivos: 01=112, 02=111, 03=111, 04=111(root). Los14 rechazos históricos están fuera de manifiestos; no reintentar ni reformular esos productos. No sustituir IDs: se está cerrando todo el catálogo publicado pendiente.

Usar solo ImageGen integrado, una llamada por producto. Leer skill imagegen y supabase. Ver fuente oficial y referencia de estilo antes de generar; descargar con workflow fetch, validar también fuentes existentes >=300px y que contengan producto visible. Referencia /private/tmp/mercadona-style-10699-reference.png.

Flujo: fetch DIR START END; source-gallery DIR START END y view_image; crear prompt específico y guardarlo EXACTO en actual-prompts; ImageGen con foto+referencia y transparent_background=true; persistir inmediato con record DIR ID NATIVE_PNG PROMPT_FILE y mostrar generatedImage(result); prepare, gallery y view_image del WebP FINAL antes de approve y publish. Siempre usar rango explícito (lotes tienen más de100).

node assets/product-illustrations/batch-20261012-459/workflow.mjs MODE DIR START END. Publicar/verificar con node --env-file=.env.local y require_escalated para red. La URL se actualiza solo si published=true y vacía; MIME/SHA/bytes/readback BD antes de borrar cada JPG/WebP. No exponer claves. Conservar PNG nativo, prompt, jobs y recibos en workspace. Fuentes y galerías están en /private/tmp/mercadona-batch-20261012-459.

Max4 llamadas ImageGen simultáneas por actor, max20 imágenes por celda functions.exec para evitar límite IPC. Celda imagegen yield120000, no esperas >60s sin comentario. Inspeccionar cada resultado y corregir errores de producto/texto importantes antes de publicar. Preservar multipacks/tapas separadas, SIN/SEM y cantidades; no inferir texto del nombre de catálogo.

Antes de CADA llamada comprobar que no existe assets/product-illustrations/batch-20261012-459/PAUSE. Si llega error real429 usage_limit_reached: guardar error exacto, crear PAUSE global INMEDIATO y avisar root; no nuevas llamadas. Drenar resultados en vuelo, checkpoint, QA y publicar todo lo aprovechable. Si moderación rechaza un producto: error exacto en moderation-ID.json, no repetir ni reformular, avisar root y continuar con IDs diferentes si no hay cuota.

Cerrar lote con verify estricto (o --allow-partial si moderación/cuota), galerías REMOTAS de todos publicados vistas, README con números reales, correcciones, pendientes y limpieza. No editar docs globales, ni git commit/push/merge, ni lotes ajenos. No terminar anticipadamente por tiempo/tokens; completar lote asignado salvo cuota real.
