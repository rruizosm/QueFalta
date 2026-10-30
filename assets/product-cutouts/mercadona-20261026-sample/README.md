# Mercadona: muestra de extracción de fondo, 26-10-2026

Petición: sustituir las ilustraciones por la fotografía oficial con fondo
transparente. El usuario eligió revisar primero cinco productos.

Los `*-original.jpg` son fotografías oficiales descargadas a 1200 × 1200
desde prod-mercadona.imgix.net. Los `*-preview.png` son pruebas de extracción
con la herramienta integrada ImageGen, no recursos aprobados ni publicados.

Productos: 10699 (leche sin lactosa), 12000 (chocolate La Candelaria),
16452 (aceitunas rellenas), 4040 (aceite de girasol), 4193 (aceite de coco).

Revisión visual: ImageGen ha cambiado tonos, contraste y detalles del envase.
Las pruebas no cumplen la conservación exacta de la fotografía solicitada.
No se han sustituido URL en Supabase ni borrado ilustraciones remotas.
La sustitución sigue pendiente: hace falta un recorte que conserve el original.

Prompt aplicado por separado a las cinco fotografías (herramienta integrada,
`transparent_background: true`):

> Use case: background-extraction. Edit target: the attached original Mercadona product photograph. Remove ONLY the external white background and any separate corner quantity badge outside the product (e.g. pink 1L badge). Deliver the single complete photographed product on actual transparent alpha background. Preserve the original photograph exactly: original packaging, printed text and logos verbatim, colors, photographic texture, perspective, silhouette, proportions and highlights. Do not redraw, illustrate, stylize, reinterpret, enhance or simplify the product. Keep white product surfaces opaque. No added shadow. Keep all product edges intact. Output a transparent PNG.
