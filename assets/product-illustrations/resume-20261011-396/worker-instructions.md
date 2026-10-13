# Reanudación Mercadona — 11-10-2026

Objetivo: completar los 396 productos publicados que faltan del encargo anterior de 1000. El coordinador reconstruye la selección y el snapshot remoto; trabaja solo en el lote que te asigne. No selecciones sustitutos por tu cuenta, no toques históricos, otros lotes, secretos, cliente, esquema, políticas o Git. No crees agentes adicionales.

Lee AGENTS.md, CONTEXTO.md, HANDOFF.md y las skills imagegen y supabase. Hay como máximo cuatro actores activos, incluido el coordinador; no declares diez simultáneos.

## Generación y revisión

- ImageGen integrado, una llamada por producto, con `transparent_background: true`. No usar CLI/API ni fotos procesadas como sustituto.
- Todas las referencias deben ser rutas absolutas. Foto oficial como imagen 1; `/private/tmp/mercadona-style-10699-reference.png` como imagen 2 exclusivamente para el estilo, sin copiar el producto o texto de esa referencia.
- Inspecciona las galerías de fuentes y la referencia antes de generar. Amplía cada fuente ambigua. Escribe un prompt específico por producto con envase, color, sabor, cantidad, unidades, textos y negaciones reales. Respeta todos los componentes, tapas, asas, packs y accesorios separados. Omite promociones externas. No inventes claims, marcas o cantidades.
- Máximo cuatro llamadas nativas simultáneas por actor. Guarda inmediatamente cada PNG y prompt exacto con `record`, muestra `generatedImage(result)` y cede con `await yield_control()`. No acumules más de veinte resultados de imagen en una misma celda. No repitas generaciones que tengan un PNG/job recuperable ni productos publicados.
- Si ImageGen devuelve `moderation_blocked`, conserva el error exacto y avisa al coordinador; no reintentes ni reformules esa solicitud. Continúa con otros IDs independientes.
- Si devuelve un 429 real `usage_limit_reached`, guarda el error exacto y reset, escribe `PAUSE` en la carpeta raíz de esta reanudación y avisa inmediatamente al coordinador. Todos deben detener nuevas llamadas nativas al detectar PAUSE; las llamadas ya en vuelo se guardan y las imágenes ya generadas pueden prepararse, revisarse y publicarse. No asumas que hay cuota agotada sin error real; no reintentes hasta autorización de reanudación.

## Rutas

Raíz nueva: `assets/product-illustrations/resume-20261011-396/`.
Temporales exclusivamente: `/private/tmp/mercadona-resume-20261011-396/<lote>/`.

JPG originales, galerías JPG y WebP de publicación viven solo en temporales. La carpeta del repositorio conserva PNG nativos, prompts exactos, manifiestos, jobs y recibos. No copies JPG/JPEG/WebP a `assets/product-illustrations/`.

Desde la raíz del repositorio:

```sh
node assets/product-illustrations/resume-20261011-396/workflow.mjs MODO DIR_LOTE INICIO FIN
```

1. `fetch DIR 1 100`: fuentes oficiales a sus rutas del manifiesto (ajusta el final al tamaño real del lote).
2. `source-gallery DIR 1 20`: galería de fuentes; repite por grupos de veinte e inspecciona todas.
3. `record DIR ID PNG_NATIVO PROMPT_EXACTO`: checkpoint durable inmediato del PNG y prompt. Guarda el fichero del prompt dentro de tu lote antes de llamar a ImageGen.
4. `prepare DIR INICIO FIN`: transparencia real; alfa <=8 a cero; recorte de todos los componentes visibles; padding 32 px; máximo 768 px; WebP calidad 84/alfa 100. Los jobs inexistentes se omiten; comprueba recuentos.
5. `gallery DIR INICIO FIN`: preview final temporal; para productos ya publicados descarga WebP en memoria y verifica SHA/bytes antes de mostrarlo.
6. Inspecciona cada WebP final y corrige mediante nueva versión únicamente los defectos reales. Después, `approve DIR INICIO FIN`.
7. `node --env-file=.env.local assets/product-illustrations/resume-20261011-396/workflow.mjs publish DIR INICIO FIN`: uploader local condicionado a `published=true` y URL vacía. Verifica SHA/MIME/bytes/URL, guarda recibo durable antes de borrar, relee BD y Storage, y elimina inmediatamente JPG fuente y WebP temporal tras comprobarlos.
8. `node --env-file=.env.local assets/product-illustrations/resume-20261011-396/workflow.mjs verify DIR`: todos los productos del lote y snapshot nuevo `existing-illustrations-before.json`. En una interrupción o moderación usa `verify DIR --allow-partial`; documenta el recuento real.
9. `status DIR`: recuento local de checkpoints, preparación, revisión, publicación y limpieza.

Si una ejecución se interrumpe tras subir, `publish` puede recuperar la limpieza con el recibo guardado. Nunca borres si falta ese recibo, cambió el producto, no está publicado o el SHA remoto no coincide. No uses `--replace-existing`.

## Cierre

Completa tu lote, revisa también galerías finales remotas, escribe README y resultados reales con IDs, bytes, correcciones, verificación y limpieza. Ejecuta `npx tsc --noEmit`. Informa al coordinador cada 10–20 publicaciones. Antes de cerrar debe haber cero JPG/JPEG/WebP dentro de `assets/product-illustrations/`; no borres los PNG, prompts ni recibos.
