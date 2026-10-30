# Carrefour: cinco regeneraciones con ImageGen

Tanda solicitada el 27-10-2026, usando ImageGen integrado, una edición por
fotografía original y `transparent_background: true`. Las fuentes son los
cinco `*-original.jpg` de `../carrefour-20261027-sample/`.

- `520664611.png`: caldo de pollo Original Carrefour 1 l.
- `520660281.png`: aceite de oliva virgen extra Carrefour Bio 500 ml.
- `521002680.png`: galletas horneadas Original Carrefour 500 g.
- `521003205.png`: leche condensada Carrefour 397 g.
- `521001754.png`: cera líquida Carrefour 1 l.

Se conservan los PNG nativos de ImageGen sin procesarlos con el script de
recorte. Cada prompt exacto está en su `ID-prompt.txt`. `verification.json`
registra dimensiones, SHA-256 y presencia de alfa real.

Revisión visual: los cinco productos están completos y tienen fondo
transparente, incluido el asa de la cera. Se observan cambios de brillo y
detalles de etiquetas, así como restos en algunos bordes. En particular, el
caldo ha cambiado los textos de los sellos inferiores: no es una reproducción
exacta de la fotografía. La verificación de alfa no implica fidelidad de texto.

Actualización: el usuario pidió expresamente sustituir las imágenes anteriores
por esta tanda. Los cinco PNG están subidos y vinculados en
`carrefour_products.illustration_url`; cambios aplicados en una transacción.
Verificados MIME/SHA-256 públicos y los cinco enlaces con cliente público.
Las fotos originales `thumbnail`, los objetos anteriores y las pruebas locales
se conservan. Recibo: `docs/carrefour-imagegen-replacement-20261027.json`.
