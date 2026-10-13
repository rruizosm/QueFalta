# Lote 01 — Mercadona, 12-10-2026

108 de 112 productos ilustrados, publicados y verificados en Supabase. Los cuatro restantes fueron rechazados por la moderación de ImageGen y no se han reintentado ni reformulado:

- `27201`: Agua mineral grande Veri.
- `46920`: Eau de toilette infantil Minnie Mouse Disney.
- `8260`: Eau de toilette infantil Spiderman Marvel.
- `52821`: Enjuague bucal Kids Deliplus zero alcohol.

Cada rechazo conserva el error exacto en `moderation-ID.json`. No hubo error de cuota 429 en esta continuación.

Se reutilizaron los PNG ya generados y las publicaciones existentes. ImageGen integrado generó individualmente los restantes, con foto oficial y referencia de estilo 10699, máximo cuatro llamadas simultáneas. Las fuentes y el estilo se inspeccionaron antes de generar. Los prompts exactos utilizados se conservan en `actual-prompts/` y `jobs/`.

Antes de generar se corrigió el texto de las etiquetas de pavo a `TACOS JARDINEIRA` (12874, 86912) y la descripción de las bandejas de sushi a bandejas abiertas (13234, 13233), conforme a las fotos. Se conservaron las revisiones v2 anteriores de 81638.1, 16286.2 y 81204.1, junto con sus PNG originales: hay 111 PNG nativos para 108 productos finales.

Los 108 WebP finales se revisaron visualmente antes de aprobar. Después de publicar se volvieron a descargar y revisar las seis galerías remotas, registradas en `remote-review.json`. `native-alpha-qa.json` confirma transparencia nativa y coincidencia exacta entre el prompt del job y su archivo para los 108 resultados finales.

La auditoría `workflow verify --allow-partial`, en `verification.json`, confirma 108 objetos remotos con MIME, SHA, bytes, alfa y tamaño máximo de 768 px correctos; 108 JPG fuente y 108 WebP temporales eliminados tras verificar cada subida; 112 miniaturas y 5835 ilustraciones preexistentes conservadas. Total publicado: 10333400 bytes. El estado `complete: false` corresponde exclusivamente a los cuatro rechazos indicados.

No quedan JPG ni WebP dentro de esta carpeta. Se conservan PNG, prompts, jobs y recibos. Las fotos de los productos rechazados permanecen en el directorio temporal, sin publicación. No se han realizado operaciones Git ni cambios en otros lotes.

## Nota de auditoría conjunta posterior

La auditoría final de 2026-10-12 15:45:12 UTC registra cambios concurrentes de catálogo (miniaturas y estado published). Las afirmaciones de miniaturas intactas de la verificación original de este lote corresponden a su timestamp original. Ver ../verification.json y ../README.md para el estado posterior. Las URLs de ilustración, hashes, alfa, archivos y limpieza de la tanda siguen verificados.
