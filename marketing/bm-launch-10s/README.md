# BM llega a QuéFalta

Entrega local del 29-09-2026. Vídeo vertical de 10,00 segundos, 1080 × 1920, 30 fps constantes, H.264 y AAC estéreo. Música instrumental original procedimental a 120 BPM y efectos sincronizados; sin locución.

- `bm-quefalta-10s.mp4`: vídeo final, optimizado para reproducción progresiva.
- `portada.jpg`: portada vertical.
- `film.html`: proyecto gráfico editable (Canvas, capas independientes, tipografías y recursos locales). Añadir `?play` para reproducir la animación. La música se encuentra en el WAV separado; el MP4 incluye la mezcla.
- `render.mjs`, `score.py`, `encode.swift`: fuentes reproducibles de imagen, sonido y exportación.
- `verify.swift`, `verification.json`, `container-check.json`: verificaciones técnicas.
- `review/all-frames-*.jpg`: revisión de los 300 fotogramas originales.

## Guion

0–1,5 s: anuncio y unión de logos sobre azul profundo. 1,5–3,5 s: catálogo BM y dos productos reales. 3,5–6,8 s: Ofertas · Novedades · Cambios de precio, con entradas escalonadas. 6,8–8,5 s: unión de marcas y móvil. 8,5–10 s: «Abre QuéFalta y descubre BM», inmóvil durante 45 fotogramas, con quefalta.es.

Titulares en Anton, licencia OFL incluida. Texto secundario en Space Grotesk del proyecto. Paleta BM basada en el archivo local (amarillo y negro), logos copiados sin recolorear ni deformar. Interfaz como composición gráfica inspirada en `BmProductsScreen`, `StoreProductList` y los colores del cliente; no es una captura exacta ni una grabación de la app.

## Trazabilidad de productos

Consulta Supabase exclusivamente SELECT, proyecto QuéFalta, el 29-09-2026. Ubicación `14946`, BM PRINCESA, CP de referencia `28008`. Se exigió `published = true` y `available = true` en `bm_product_locations`, y ubicación `published = true`, `enabled = true` en `bm_locations`.

- `21801`: Plátano de Canarias IGP a granel (150 g aprox).
- `21990`: Aguacate a granel unidad (300 g aprox).

Fotografías originales descargadas del CDN oficial que figura en `thumbnail`; títulos abreviados en el móvil. La sincronización de ambos registros es del 28-09-2026 a las 12:54 UTC. Respuesta de auditoría conservada en `source-query.json`. No se muestran precios, descuentos ni se atribuye una promoción, novedad o cambio de precio a estos productos. Los beneficios se representan únicamente por sus nombres. Nota visible: «Consulta BM según tu código postal».

## Regenerar

Desde la raíz del repositorio, con Playwright/Chromium disponibles:

```sh
node marketing/bm-launch-10s/render.mjs
python3 marketing/bm-launch-10s/score.py
xcrun swiftc -swift-version 5 marketing/bm-launch-10s/encode.swift -o /tmp/bm-encode
/tmp/bm-encode "$PWD/marketing/bm-launch-10s"
xcrun swiftc -swift-version 5 marketing/bm-launch-10s/verify.swift -o /tmp/bm-verify
/tmp/bm-verify "$PWD/marketing/bm-launch-10s"
```

Python necesita NumPy. La exportación y la verificación requieren macOS/AVFoundation con acceso a los servicios multimedia. `render.mjs --preview` genera fotogramas de muestra; el render completo genera exactamente 300 imágenes a intervalos de 1/30 s.

Typecheck del repositorio: `npx tsc --noEmit` correcto. No se ha publicado el vídeo, conectado cuentas sociales ni escrito datos en Supabase. Este material no cambia el estado de publicación de la app.
