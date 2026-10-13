# Lidl: primer producto ilustrado — 13-10-2026

Completado 1/1: **Leche semi desnatada Leyma Natura, 1 l**, ID `8804651149163_ES`. Seleccionado de `lidl_product_master`, publicado y presente en al menos una tienda publicada y seleccionable. Foto oficial real, sin placeholder.

[WebP publicado](https://auth.quefalta.es/storage/v1/object/public/product-illustrations/lidl/8804651149163_ES/3dc19433a467466d.webp): 512 × 768 px, 44.698 bytes, alfa real. SHA-256 `3dc19433a467466d8560163e1c5b9a8721180a35c421242c5c94f565b59a9566`.

Generado con **ImageGen integrado**, usando la fotografía oficial y la ilustración Mercadona 10699 como referencia de estilo. Prompts exactos: [inicial](prompt.txt) y [revisión final](prompt-v2.txt). Se conservan las dos versiones PNG nativas; la segunda es el maestro aprobado. La revisión sobre blanco y oscuro del WebP remoto confirma silueta, etiqueta y transparencia. Solo se redimensionó y exportó con Sharp, conservando el alfa nativo.

La URL quedó guardada en el nuevo campo `lidl_product_master.illustration_url`; la fotografía `thumbnail` se conserva idéntica. La ilustración es común al producto, sin duplicarla por tienda. Migración local `20261013141332_add_lidl_illustration_url.sql`, aplicada remotamente como `20261013141404`. No añade permisos, políticas ni cambios de RLS. Los advisors de seguridad no señalan esta tabla ni el bucket en la revisión posterior. No se ha cambiado el consumo de imágenes del cliente ni la vista de catálogo Lidl; este encargo publica el recurso y su vínculo en la ficha maestra.

Verificación administrativa y anónima: MIME, SHA-256, bytes, dimensiones, transparencia, estado publicado, tienda activa y URL en BD. Evidencias: `verification.json`, `public-readback.json`, `product-before.json` y `export.json`. TypeScript `npx tsc --noEmit`: salida 0.

WebP temporal y foto fuente temporal eliminados tras verificar la subida. Los PNG, prompts, recibos y previews se conservan. No se han modificado los recursos Mercadona ni creado commit/push.
