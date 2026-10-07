# Balda de roble individual

- Recurso integrado: `assets/pantry/oak-shelf-source.png` (2079 × 756 px).
- Fecha: 2026-10-05. Herramienta integrada `image_gen`, sin CLI/API externa.
- Referencia: captura de Despensa adjunta por el usuario en esta tarea. Se pidió
  replicar una sola balda, no sus productos, cabecera ni navegación.
- Original generado: `exec-7044d2f5-2e0e-4f48-b16a-1477c98d7515.png`.
- El generador devolvió una cuadrícula opaca, **no un canal alfa**. El archivo
  se conserva intacto y NO debe mostrarse directamente como fondo. El componente
  `PantryWoodShelf.tsx` usa una máscara SVG limitada a la tabla y sus dos soportes;
  excluye toda la cuadrícula y añade una sombra suave mediante un degradado.
  No hay procesamiento de imagen ni nuevos paquetes. Verificado sobre los
  fondos claro y oscuro del cliente en una vista previa web aislada.
- La máscara está calibrada a las coordenadas del recurso. Si se cambia la
  imagen, revisar conjuntamente dimensiones, máscara y vista previa.

## Prompt final enviado a la herramienta integrada

```text
Use case: background-extraction / precise-object-edit. Image 1 is the edit target and exact design reference. Extract/recreate ONLY ONE of the thin horizontal wooden shelf boards visible in the supplied pantry screenshot as a standalone mobile-app asset. Keep the exact straight frontal view, warm medium honey-oak hue, fine natural horizontal wood grain, slender softly rounded front lip and the two short wooden support blocks under the left and right ends. Match the proportions from the screenshot: board width about 720 units, board thickness about 25 units, little support blocks extend about 17 units below it, subtle soft brown contact shadow immediately underneath. It should look like the very same shelf, NOT the full cabinet. Single shelf ONLY. No change of style, no exaggerated perspective, no thick chunky beam.
Remove all products, all jars, all labels, all UI, all icons, all text, all plants, all background, the other shelves and any phone elements. Nothing standing on the shelf. Background must be genuinely transparent with an alpha channel, NOT a drawn checkerboard, NOT cream or white. Preserve the soft semitransparent shadow. Use a wide landscape transparent canvas, tightly framed horizontally with about 3% clear margin on each end and enough vertical transparent space for shadow. The shelf remains exceptionally wide and slender, exactly like the screenshot, not scaled up in thickness to fill the canvas. Output a clean reusable transparent PNG asset.
```
