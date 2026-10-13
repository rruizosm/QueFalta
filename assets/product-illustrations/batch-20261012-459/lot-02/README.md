# Mercadona — lote 02 completado

111/111 productos publicados de Mercadona convertidos con ImageGen integrado, WebP con transparencia y máximo 768 px, publicados y verificados en Supabase. Cierre: 12-10-2026, 15:27 UTC. Total remoto: 8.649.166 bytes.

## Verificación y limpieza

- [verification.json](verification.json): 111 MIME, SHA256, bytes, alfa y URLs de BD correctos; sin pendientes. 111 miniaturas originales y las 5.835 ilustraciones previas preservadas.
- [native-alpha-qa.json](native-alpha-qa.json): 111 PNG nativos con canal alfa, fondo alfa 0 y contenido alfa máximo >=250; 111 prompts exactos comparados con sus archivos.
- [remote-visual-review.json](remote-visual-review.json): galerías remotas de todos los 111 productos vistas, con hash/MIME/bytes comprobados antes de renderizar.
- 111 JPG fuente y 111 WebP temporales eliminados después de verificar cada subida y readback de BD. Se conservan PNG nativos versionados, prompts exactos, jobs y recibos. Las galerías de revisión quedan en /private/tmp/mercadona-batch-20261012-459/lot-02.

## Recuperación y control visual

Se recuperó el PNG nativo ya generado de 17575, cotejado con la fuente oficial y registrado con su prompt histórico exacto, evitando regenerarlo.

69971: corrección v2 de la malla de tomates, con huecos transparentes en el cuello superior; realizada y publicada por root tras cesión explícita. Véase [correction-69971.json](correction-69971.json). El error previo [error-69971.json](error-69971.json) fue una validación de ruta relativa antes de generar, resuelta usando rutas absolutas; no fue moderación ni límite de uso.

60089: corrección v2 de la tortilla con cebolla para retirar una etiqueta central inventada y conservar la tortilla sin etiqueta de la foto oficial. Se revisó el WebP final antes de publicarlo y después en la galería remota.

27666 y 27487: la foto oficial individual muestra ocho latas, y los resultados conservan esas ocho, aunque el prompt inicial describía seis por error. Se conservaron los prompts exactos realmente utilizados y se validaron las ocho latas en las fuentes, el WebP final y la galería remota.

82906: la foto oficial muestra Tortitas Nevadas aunque el nombre de catálogo dice canela; la ilustración conserva el envase de la foto oficial. Cantidades, multipacks y marcas SIN/SEM revisadas según las fuentes.

No hubo rechazos de moderación ni límite de uso en este lote. No quedan generaciones, correcciones, publicaciones o verificaciones pendientes.

## Nota de auditoría conjunta posterior

La auditoría final de 2026-10-12 15:45:12 UTC registra cambios concurrentes de catálogo (miniaturas y estado published). Las afirmaciones de miniaturas intactas de la verificación original de este lote corresponden a su timestamp original. Ver ../verification.json y ../README.md para el estado posterior. Las URLs de ilustración, hashes, alfa, archivos y limpieza de la tanda siguen verificados.
