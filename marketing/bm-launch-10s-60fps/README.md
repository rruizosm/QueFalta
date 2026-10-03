# BM llega a QuéFalta — versión 60 fps

Entrega local del 29 de septiembre de 2026. Vídeo vertical **1080 × 1920, 10,00 s exactos, 600 fotogramas a 60 fps constantes**, H.264 y AAC estéreo a 48 kHz, con inicio rápido para reproducción en redes. No se ha publicado.

- `bm-quefalta-10s.mp4`: vídeo final con música original y efectos sincronizados.
- `portada.jpg`: portada vertical a resolución completa.
- `bm-quefalta-editable.html`: composición autónoma con fuentes, imágenes y audio incrustados. Abrir en el navegador y pulsar «Reproducir con sonido». El HTML/JavaScript es editable.
- `bm-quefalta-editable.zip`: fuentes de la composición, recursos, música, scripts de exportación y verificaciones.
- `storyboard.jpg`: seis momentos de la pieza, extraídos del MP4 entregado.

## Montaje

| Tiempo | Contenido |
| --- | --- |
| 0–1,5 s | Gancho sobre azul profundo, marca BM local y conexión con la cesta de QuéFalta. |
| 1,5–3,5 s | Composición gráfica de móvil, selección BM y tres fotografías reales de productos. |
| 3,5–6,8 s | Tarjetas «Ofertas», «Novedades» y «Cambios de precio», con entrada escalonada. |
| 6,8–8,5 s | Unión de marcas y agrupación de las tarjetas en el móvil. |
| 8,5–10 s | «Abre QuéFalta y descubre BM», quefalta.es y nota postal. Cierre fijo durante los 90 fotogramas finales. |

Titulares en **Anton**, textos secundarios en Space Grotesk. Amarillo `#F9EC23` y negro `#1D1D1B`, medidos en el logo BM local, con azul reservado al gancho y a la identidad de QuéFalta. Los dos logos son los archivos originales, escalados conservando sus proporciones y colores. No hay imágenes, texto de envases ni logos generados por IA.

Música original a 120 BPM en do mayor, sintetizada en `score.py`: percusión, bajo, acordes suaves y motivo de marimba, con acentos en las transiciones y las tarjetas. No utiliza grabaciones ni samples de terceros. Sin locución, para dar espacio a la lectura.

## Procedencia y alcance

Consulta Supabase exclusivamente mediante SELECT el 29-09-2026. Tres filas de `bm_product_locations`, publicadas y disponibles, vinculadas a la ubicación publicada y habilitada **BM Pagola Online, `14942D`, CP 20009**. La relación postal también estaba habilitada.

| ID BM | Producto verificado |
| --- | --- |
| 21801 | Plátano de Canarias IGP a granel (150 g aprox) |
| 21990 | Aguacate a granel unidad (300 g aprox) |
| 76411 | Leche entera 1 l, marca BM |

Las fotos se descargaron de las URLs exactas del CDN de BM devueltas por esas filas. Se conservan sobre blanco sin alterar el envase. Los rótulos se han abreviado para facilitar la lectura. `provenance.json` conserva las URLs, los IDs, la zona y el estado comprobado; la última sincronización de estas filas era el 28-09-2026.

No aparecen precios, descuentos, vigencias ni señales de que estos tres productos sean novedades u ofertas. Las tarjetas anuncian las secciones de la app. Se incluye «Consulta BM según tu código postal»; no se afirma cobertura nacional.

La pantalla es una **composición gráfica inspirada en la interfaz del repositorio**, con sus superficies claras, selector de tienda, catálogo y azul de acento. No es una captura ni una grabación de la app. No se accedió a cuentas o datos de usuarios.

Recursos locales: `assets/stores/bm.png` y `assets/quefalta-logo-blue.png`. [Anton proviene del repositorio oficial de Google Fonts](https://github.com/google/fonts/tree/main/ofl/anton), con licencia OFL incluida. Space Grotesk procede de los recursos ya presentes en el repositorio.

## Editar y exportar

Editar `film.html` para cambiar escenas, textos, tiempos y movimientos. Editar `score.py` para cambiar la música. La versión HTML autónoma se genera con `package.py` después de cualquier modificación.

Desde la raíz del repositorio, con su dependencia Playwright instalada:

```sh
node marketing/bm-launch-10s-60fps/render.mjs --preview
node marketing/bm-launch-10s-60fps/render.mjs
python3 marketing/bm-launch-10s-60fps/score.py
xcrun swiftc -swift-version 5 -suppress-warnings marketing/bm-launch-10s-60fps/encode.swift -o /tmp/bm-launch-encode
/tmp/bm-launch-encode "$PWD/marketing/bm-launch-10s-60fps"
xcrun swiftc -swift-version 5 -suppress-warnings marketing/bm-launch-10s-60fps/verify.swift -o /tmp/bm-launch-verify
/tmp/bm-launch-verify "$PWD/marketing/bm-launch-10s-60fps"
python3 marketing/bm-launch-10s-60fps/package.py
```

El renderizador usa Playwright 1.60.0 y Chromium; Python necesita NumPy para la música y Pillow para portada/storyboard. La exportación y verificación requieren macOS y sus herramientas Swift/AVFoundation. Los directorios `frames/`, `review/` y `silent-master.mov` son intermedios regenerables, excluidos del ZIP y de Git.

## Comprobación de la entrega

`verification.json` registra la decodificación de los 600 fotogramas y del audio completo, los intervalos constantes de 1/60 s, duración exacta, resolución, códecs, canales, ausencia de saturación y estabilidad del cierre. Se revisaron visualmente los planos y las transiciones a partir del MP4, con 101 fotogramas de control repartidos por toda la pieza. `container-check.json` verifica que `moov` precede a `mdat` para permitir inicio rápido.

`npx tsc --noEmit` completado correctamente. No se modifica código de la app ni datos del backend. Esta versión se guarda por separado de la otra exportación existente en `marketing/bm-launch-10s/`.
