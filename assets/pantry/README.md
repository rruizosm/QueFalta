# Estantería vacía de Despensa

La despensa utiliza ahora **tres instancias de una balda individual de roble**,
documentada en [oak-shelf.md](oak-shelf.md). El resto de este archivo describe
el mueble antiguo.

**Retirada de la app el 2026-10-05 a petición del usuario.** El archivo se
conserva únicamente como referencia recuperable y ya no se importa en el cliente.
La despensa mantiene un lienzo neutro, los productos y sus posiciones guardadas.

`empty-shelf.png` es la variante vacía de la estantería vertical aprobada por el
propietario de QuéFalta en esta tarea. Se generó con la herramienta integrada
de imágenes (`image_gen`), sin CLI ni API externa. Resolución: 1065 × 1477 px.
La imagen tiene fondo crema opaco y conserva cuatro baldas, sin productos ni
marcas de posición. Originalmente se presentaba con `contentFit="contain"`.

No representa inventario real ni incorpora acciones de añadir productos.

## Prompt de vaciado

```text
Use case: precise-object-edit.
Edit this exact approved QuéFalta pantry shelf illustration into an EMPTY SHELF asset for the actual mobile app. Keep the shelf's exact green rounded upright structure, four warm wooden horizontal shelf boards, pale cream back panels, two small dark feet, proportions, palette and existing straight-on frontal view. Preserve the reference's illustration treatment and the structure; do not redesign it or rotate it. Front view only; no angled outside side panels.
REMOVE EVERY PRODUCT AND EVERY OBJECT FROM ALL FOUR LEVELS. Remove bread, milk, pasta, bottles, cans, cereal, jars, packets, fruit, vegetables, bowls, crates, mesh bag and their cast shadows. Also REMOVE THE DASHED RECTANGLE indicating the missing product. The result is completely empty clean shelf levels, with unbroken pale cream back panels and natural clean board surfaces, ready for future product overlays in the app. Nothing sitting on any shelf.
Background: make the area OUTSIDE the shelf genuinely TRANSPARENT with alpha. Keep the cream back panels INSIDE the shelf opaque. No white or cream external rectangle; no checkerboard drawn into the image. A very subtle tight shadow directly under the feet is acceptable but avoid wide blurry margins.
Composition: portrait asset, centered and tightly framed with about 4 percent clear padding on each side, full shelf including feet visible and uncropped. Keep the same natural tall four-level proportions as the reference. No stretching.
Constraints: no food, no products, no containers, no dotted outlines, no labels, no text, no logos, no watermark, no characters, no kitchen scenery, no device frame, no UI. Change only by removing all stocked items and the dashed outline, and extracting the shelf onto transparent background. This is the empty version of the existing approved shelf, not a fridge.
```

La primera salida no contenía canal alfa; se descartó el fondo de cuadrícula
con esta segunda edición. Solo se incorpora la salida final a la app.

## Prompt de fondo final

```text
Precise-object-edit: Keep this EMPTY four-level pantry shelf exactly unchanged, preserving all green uprights, four wood boards, cream back panels, feet, geometry, framing, viewpoint, colors and all interior details. Replace ONLY every gray-and-white checkerboard pixel OUTSIDE the shelf with a perfectly solid uniform warm cream background, hexadecimal #FBF6EE. This output intentionally has an OPAQUE solid background, not transparency. No checkerboard pattern anywhere, no mottling, no texture outside the shelf, no background gradient. Preserve a small subtle contact shadow below feet, otherwise the background is perfectly flat cream. No additions: the shelf must remain COMPLETELY EMPTY, with zero products, zero food, zero dotted outlines and zero text. Keep entire shelf visible, centered, same tall portrait proportions and tight margins. Finished clean app illustration.
```
