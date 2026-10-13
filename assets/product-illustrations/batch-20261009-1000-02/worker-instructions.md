# Encargo 2026-10-09: 100 productos WebP por responsable

El usuario autoriza seleccionar 1000 productos Mercadona con `illustration_url` vacío, ilustrarlos con ImageGen integrado, publicarlos en Supabase y borrar cada archivo fuente `.jpg` y producto `.webp` de sus ubicaciones temporales después de confirmar la publicación. Hay diez lotes numerados de 100.

## Límites

- Lee `AGENTS.md`, `CONTEXTO.md`, `HANDOFF.md`, esta guía y las skills `imagegen` y `supabase`.
- Eres dueño solo del lote indicado. No cambies otro lote, el cliente, el esquema, las políticas, secretos ni Git; no crees subagentes.
- La plataforma permite cuatro actores activos incluido el coordinador; los responsables trabajan en tandas. No declares que diez se ejecutan simultáneamente.
- ImageGen integrado: una llamada por producto, `transparent_background: true`, fotos oficiales como Image 1 y referencia absoluta `/private/tmp/mercadona-style-10699-reference.png` como Image 2 (solo estilo; no copies brik, marca o texto). Máximo cuatro llamadas nativas simultáneas por actor.
- Inspecciona primero las cinco galerías de veinte fotos y la referencia; amplía fuentes ambiguas. Cada prompt debe reflejar el envase, sabor, tamaño, unidades, texto y negaciones que aparecen en la foto. No inventes Hacendado, claims ni cantidades. Mantén objetos separados, tapas, asas, aplicadores y el paquete entero. Los cuadros promocionales externos se omiten.
- Guarda cada llamada en cuanto llegue: `record`, `generatedImage(result)` y `await yield_control()` sin acumular imágenes. Usa un productor con PAUSE durable y checkpoint por ID. No repitas generaciones que tengan PNG/job recuperable.

## Ubicación y orden obligatorio

JPG de origen, galería de fotos, galería WebP y WebP de publicación viven exclusivamente en `/private/tmp/mercadona-batch-20261009-1000-02/<lote>/`. No copies ningún `.jpg` ni `.webp` a `assets/product-illustrations/`. La carpeta del repositorio conserva los PNG nativos, prompts, manifiestos, jobs y recibos.

Desde la raíz del repositorio:

```sh
node assets/product-illustrations/batch-20261009-1000-02/workflow.mjs MODO DIR_LOTE INICIO FIN
```

- `fetch DIR 1 100`: descarga fuentes a `/private/tmp`.
- `source-gallery DIR 1 20` (y 21–40, 41–60, 61–80, 81–100): genera una galería JPG en `/private/tmp`.
- `record DIR ID RUTA_PNG_NATIVO FICHERO_PROMPT`: checkpoint PNG y prompt.
- `prepare DIR INICIO FIN`: WebP temporal, máximo 768 px, calidad 84/alfa 100; preserva componentes reales.
- `gallery DIR INICIO FIN`: preview JPG temporal para QA.
- `approve DIR INICIO FIN`: solo después de ver todo el WebP final.
- `publish DIR INICIO FIN`: upload con uploader existente, readback público SHA/MIME/bytes, vínculo condicionado a `illustration_url` nulo; **inmediatamente después elimina el JPG de origen y el WebP temporal** y escribe el recibo/checkpoint.
- `verify DIR`: verifica los cien enlaces y objetos remotos, sus hashes, tipo, tamaño, transparencia/dimensiones, miniaturas y las 3959 ilustraciones previas. No exige WebP/JPG locales, porque se eliminan tras publicarse.

Si un proceso muere después de actualizar el producto pero antes de borrar la copia temporal, `publish` recupera la limpieza solo tras encontrar un recibo de Storage válido. No borres archivos si falta la verificación o cambia la URL del producto. Nunca uses `--replace-existing`.

## Cierre

Prepara y revisa los cien; publica y verifica el lote completo. Genera las cinco galerías finales en `/private/tmp`. Escribe README de lote con IDs, bytes, correcciones, verificación e informes reales. Ejecuta `npx tsc --noEmit`. Informa cada 10–20 publicaciones. La carpeta `assets/product-illustrations/` debe terminar con cero `.jpg` y `.webp`.

## Output moderation and quota
On moderation_blocked, preserve the exact error, do not retry or rewrite that request, isolate that ID and continue independent products. On actual 429 usage_limit_reached, stop new native calls and report/reset timestamp; do not retry until reset. Never substitute photos or processed photos for generated illustrations. Report partial counts honestly.
