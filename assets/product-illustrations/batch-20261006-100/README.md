# Mercadona — 100 ilustraciones adicionales (2026-10-06)

Lote solicitado de 80–100 productos: se seleccionaron 100 productos publicados sin ilustración. Se parte de 31 ilustraciones previas.

Cada producto se genera con ImageGen integrado usando su fotografía oficial como referencia de contenido y el producto `10699` como referencia de estilo. Se conservan forma, colores, marca, denominación y formato del envase, incluidos los packs. Los rótulos del catálogo que aparecen fuera del envase se excluyen.

Los PNG se recortan mediante `scripts/clean-product-illustration-alpha.mjs` y se codifican como WebP con lado máximo 768 px, calidad 84 y alfa 100. Se comprueba transparencia real y ausencia de píxeles visibles en el borde exterior.

## Archivos y trazabilidad

- `manifest.json`: selección, fotografía original y, tras la comprobación final, inventario completo de publicaciones y verificación.
- `prompts.json`: instrucciones exactas de los 100 productos.
- `jobs/<id>.json`: procedencia del PNG generado, estado, métricas WebP, revisión y recibo de publicación.
- `originals/`: fotografías oficiales usadas como referencia.
- `existing-illustrations-before.json`: las 31 URL anteriores, para comprobar su conservación.
- `mercadona-<id>-<nombre>.png` y `.webp`: maestros procesados y archivos de producción. Los PNG originales de ImageGen se conservan en la ruta indicada en cada job.
- `sources-1.jpg` a `sources-5.jpg`: vistas de las fotografías originales, revisadas antes de generar.
- `preview-<inicio>-<fin>.jpg`: vistas de los WebP finales para revisión visual.

## Publicación

Solo se publican imágenes revisadas, mediante `scripts/upload-mercadona-illustration.mjs`. Cada subida usa un objeto nuevo con hash en el bucket público `product-illustrations`, verifica `image/webp` y SHA-256 mediante descarga pública, y actualiza únicamente `mercadona_products.illustration_url` si todavía está vacía. La fotografía `thumbnail` se conserva.

**Completado:** 100 productos nuevos publicados y verificados; el catálogo tiene **131 ilustraciones WebP**. Los WebP de este lote ocupan **7.667.782 bytes** (7,67 MB), entre 30.594 y 166.020 bytes por producto.

Se revisaron visualmente los 100 WebP finales y se verificaron alfa real, bordes transparentes, 100 hashes distintos, MIME `image/webp` y SHA-256 local/remoto en cada publicación. La lectura anónima final confirmó las 100 URL, estado publicado, fotografías originales intactas y conservación de las 31 ilustraciones anteriores. Typecheck: `npx tsc --noEmit`, correcto.

El producto `15101` se corrigió antes de publicar para restaurar «SIN/SEM» en el sello de gluten. Su PNG anterior y el prompt de corrección quedan registrados en el job; el archivo de producción es la versión `v2`.

## Vistas previas

- [Productos 1–20](preview-1-20.jpg)
- [Productos 21–40](preview-21-40.jpg)
- [Productos 41–60](preview-41-60.jpg)
- [Productos 61–80](preview-61-80.jpg)
- [Productos 81–100](preview-81-100.jpg)

## Inventario publicado

Las URL públicas y recibos de subida están en `manifest.json` y `jobs/<id>.json`.

| # | ID | Producto | WebP local | Tamaño | Bytes |
| --- | --- | --- | --- | --- | ---: |
| 1 | 5002 | Arroz basmati aromático Hacendado | [WebP](mercadona-5002-arroz-basmati-aromatico-hacendado.webp) | 475 × 768 | 66432 |
| 2 | 5184 | Arroz integral largo Hacendado | [WebP](mercadona-5184-arroz-integral-largo-hacendado.webp) | 438 × 768 | 54644 |
| 3 | 5063 | Arroz largo Hacendado | [WebP](mercadona-5063-arroz-largo-hacendado.webp) | 418 × 768 | 58368 |
| 4 | 5020 | Arroz vaporizado Hacendado | [WebP](mercadona-5020-arroz-vaporizado-hacendado.webp) | 473 × 768 | 79542 |
| 5 | 5124 | Alubia blanca Hacendado | [WebP](mercadona-5124-alubia-blanca-hacendado.webp) | 412 × 768 | 79458 |
| 6 | 26041 | Alubia cocida negra Hacendado | [WebP](mercadona-26041-alubia-cocida-negra-hacendado.webp) | 489 × 768 | 75572 |
| 7 | 26001 | Alubia cocida pinta Hacendado | [WebP](mercadona-26001-alubia-cocida-pinta-hacendado.webp) | 343 × 768 | 68446 |
| 8 | 60547 | Alubia cocida roja Hacendado | [WebP](mercadona-60547-alubia-cocida-roja-hacendado.webp) | 404 × 768 | 82042 |
| 9 | 26030 | Lenteja cocida Hacendado | [WebP](mercadona-26030-lenteja-cocida-hacendado.webp) | 343 × 768 | 70636 |
| 10 | 5214 | Garbanzo Hacendado | [WebP](mercadona-5214-garbanzo-hacendado.webp) | 440 × 768 | 88778 |
| 11 | 6300 | Macarrón al huevo Hacendado | [WebP](mercadona-6300-macarron-al-huevo-hacendado.webp) | 418 × 768 | 95950 |
| 12 | 6260 | Macarrón fino Hacendado | [WebP](mercadona-6260-macarron-fino-hacendado.webp) | 466 × 768 | 109222 |
| 13 | 6326 | Macarrón Hacendado | [WebP](mercadona-6326-macarron-hacendado.webp) | 424 × 768 | 92984 |
| 14 | 35777 | Macarrón rayado integral Hacendado | [WebP](mercadona-35777-macarron-rayado-integral-hacendado.webp) | 388 × 768 | 94976 |
| 15 | 6246 | Tallarines Hacendado | [WebP](mercadona-6246-tallarines-hacendado.webp) | 249 × 768 | 38986 |
| 16 | 13577 | Fideo cabello de ángel Hacendado | [WebP](mercadona-13577-fideo-cabello-de-angel-hacendado.webp) | 432 × 768 | 106114 |
| 17 | 6261 | Fideo grueso Hacendado | [WebP](mercadona-6261-fideo-grueso-hacendado.webp) | 495 × 768 | 109516 |
| 18 | 6363 | Pasta estrellas Hacendado | [WebP](mercadona-6363-pasta-estrellas-hacendado.webp) | 367 × 768 | 88712 |
| 19 | 29019 | Harina de fuerza Hacendado | [WebP](mercadona-29019-harina-de-fuerza-hacendado.webp) | 444 × 768 | 75842 |
| 20 | 29134 | Harina integral de trigo Hacendado | [WebP](mercadona-29134-harina-integral-de-trigo-hacendado.webp) | 443 × 768 | 79182 |
| 21 | 16625 | Champiñón entero Hacendado | [WebP](mercadona-16625-champinon-entero-hacendado.webp) | 420 × 768 | 78706 |
| 22 | 16616 | Champiñón laminado Hacendado | [WebP](mercadona-16616-champinon-laminado-hacendado.webp) | 768 × 458 | 94066 |
| 23 | 16416 | Guisantes extra Hacendado | [WebP](mercadona-16416-guisantes-extra-hacendado.webp) | 477 × 768 | 87264 |
| 24 | 16313 | Judías verdes planas Hacendado | [WebP](mercadona-16313-judias-verdes-planas-hacendado.webp) | 353 × 768 | 67134 |
| 25 | 70744 | Espárragos blancos delgados Hacendado cortos | [WebP](mercadona-70744-esparragos-blancos-delgados-hacendado-cortos.webp) | 408 × 768 | 62924 |
| 26 | 35404 | Espárragos blancos gruesos Hacendado cortos | [WebP](mercadona-35404-esparragos-blancos-gruesos-hacendado-cortos.webp) | 504 × 768 | 60192 |
| 27 | 13327 | Remolacha en tiras Hacendado | [WebP](mercadona-13327-remolacha-en-tiras-hacendado.webp) | 639 × 768 | 102088 |
| 28 | 13328 | Zanahoria en tiras Hacendado | [WebP](mercadona-13328-zanahoria-en-tiras-hacendado.webp) | 581 × 768 | 90726 |
| 29 | 16041 | Tomate entero pelado Hacendado | [WebP](mercadona-16041-tomate-entero-pelado-hacendado.webp) | 551 × 768 | 85070 |
| 30 | 16022 | Tomate troceado pelado Hacendado | [WebP](mercadona-16022-tomate-troceado-pelado-hacendado.webp) | 487 × 768 | 99370 |
| 31 | 52728 | Mayonesa Hacendado | [WebP](mercadona-52728-mayonesa-hacendado.webp) | 446 × 768 | 63428 |
| 32 | 23410 | Mostaza clásica Hacendado | [WebP](mercadona-23410-mostaza-clasica-hacendado.webp) | 352 × 768 | 50944 |
| 33 | 17228 | Mostaza de Dijon Hacendado | [WebP](mercadona-17228-mostaza-de-dijon-hacendado.webp) | 442 × 768 | 63814 |
| 34 | 17346 | Salsa Barbacoa Hacendado | [WebP](mercadona-17346-salsa-barbacoa-hacendado.webp) | 436 × 768 | 73010 |
| 35 | 17360 | Salsa de Soja Hacendado | [WebP](mercadona-17360-salsa-de-soja-hacendado.webp) | 221 × 768 | 49314 |
| 36 | 17362 | Salsa Teriyaki Hacendado | [WebP](mercadona-17362-salsa-teriyaki-hacendado.webp) | 293 × 768 | 56612 |
| 37 | 17366 | Salsa César Hacendado | [WebP](mercadona-17366-salsa-cesar-hacendado.webp) | 439 × 768 | 71936 |
| 38 | 52467 | Salsa Miel y Mostaza Hacendado | [WebP](mercadona-52467-salsa-miel-y-mostaza-hacendado.webp) | 240 × 768 | 45782 |
| 39 | 35438 | Salsa Pesto con albahaca Hacendado | [WebP](mercadona-35438-salsa-pesto-con-albahaca-hacendado.webp) | 462 × 768 | 88020 |
| 40 | 16074 | Tomate doble concentrado Hacendado extra | [WebP](mercadona-16074-tomate-doble-concentrado-hacendado-extra.webp) | 464 × 768 | 76398 |
| 41 | 18018 | Atún claro al natural Hacendado | [WebP](mercadona-18018-atun-claro-al-natural-hacendado.webp) | 768 × 371 | 68762 |
| 42 | 18092 | Atún claro en aceite de girasol Hacendado | [WebP](mercadona-18092-atun-claro-en-aceite-de-girasol-hacendado.webp) | 768 × 303 | 65844 |
| 43 | 18031 | Atún claro en escabeche blanco Hacendado | [WebP](mercadona-18031-atun-claro-en-escabeche-blanco-hacendado.webp) | 768 × 346 | 69498 |
| 44 | 12911 | Atún listado al natural Hacendado | [WebP](mercadona-12911-atun-listado-al-natural-hacendado.webp) | 768 × 597 | 85724 |
| 45 | 18116 | Bonito del norte en aceite de oliva Hacendado | [WebP](mercadona-18116-bonito-del-norte-en-aceite-de-oliva-hacendado.webp) | 768 × 431 | 77182 |
| 46 | 18564 | Berberechos al natural M Hacendado | [WebP](mercadona-18564-berberechos-al-natural-m-hacendado.webp) | 768 × 488 | 74080 |
| 47 | 18602 | Mejillones en escabeche Hacendado medianos | [WebP](mercadona-18602-mejillones-en-escabeche-hacendado-medianos.webp) | 768 × 482 | 72050 |
| 48 | 18620 | Mejillones al natural Hacendado pequeños | [WebP](mercadona-18620-mejillones-al-natural-hacendado-pequenos.webp) | 768 × 495 | 83810 |
| 49 | 18225 | Sardinas en aceite de oliva Hacendado | [WebP](mercadona-18225-sardinas-en-aceite-de-oliva-hacendado.webp) | 768 × 291 | 51694 |
| 50 | 18210 | Sardinillas en aceite de oliva Hacendado | [WebP](mercadona-18210-sardinillas-en-aceite-de-oliva-hacendado.webp) | 768 × 279 | 52866 |
| 51 | 34177 | Canela molida Hacendado | [WebP](mercadona-34177-canela-molida-hacendado.webp) | 311 × 768 | 54542 |
| 52 | 34120 | Comino molido Hacendado | [WebP](mercadona-34120-comino-molido-hacendado.webp) | 300 × 768 | 75984 |
| 53 | 34125 | Curry Hacendado | [WebP](mercadona-34125-curry-hacendado.webp) | 300 × 768 | 70226 |
| 54 | 5599 | Perejil Hacendado | [WebP](mercadona-5599-perejil-hacendado.webp) | 275 × 768 | 77562 |
| 55 | 60573 | Pimentón dulce Hacendado | [WebP](mercadona-60573-pimenton-dulce-hacendado.webp) | 516 × 768 | 87234 |
| 56 | 34183 | Pimentón picante Hacendado | [WebP](mercadona-34183-pimenton-picante-hacendado.webp) | 311 × 768 | 78966 |
| 57 | 14981 | Romero Hacendado | [WebP](mercadona-14981-romero-hacendado.webp) | 294 × 768 | 77900 |
| 58 | 5547 | Tomillo Hacendado | [WebP](mercadona-5547-tomillo-hacendado.webp) | 303 × 768 | 85140 |
| 59 | 34173 | Nuez moscada molida Hacendado | [WebP](mercadona-34173-nuez-moscada-molida-hacendado.webp) | 295 × 768 | 77242 |
| 60 | 52880 | Canela en rama Hacendado | [WebP](mercadona-52880-canela-en-rama-hacendado.webp) | 312 × 768 | 60764 |
| 61 | 10933 | Leche entera Hacendado | [WebP](mercadona-10933-leche-entera-hacendado.webp) | 280 × 768 | 30594 |
| 62 | 10922 | Leche semidesnatada Hacendado | [WebP](mercadona-10922-leche-semidesnatada-hacendado.webp) | 278 × 768 | 31970 |
| 63 | 10544 | Leche desnatada Hacendado | [WebP](mercadona-10544-leche-desnatada-hacendado.webp) | 270 × 768 | 43076 |
| 64 | 10731 | Leche desnatada sin lactosa Hacendado | [WebP](mercadona-10731-leche-desnatada-sin-lactosa-hacendado.webp) | 345 × 768 | 56316 |
| 65 | 10732 | Leche semidesnatada sin lactosa Hacendado | [WebP](mercadona-10732-leche-semidesnatada-sin-lactosa-hacendado.webp) | 768 × 686 | 115100 |
| 66 | 60348 | Leche condensada Hacendado | [WebP](mercadona-60348-leche-condensada-hacendado.webp) | 439 × 768 | 61768 |
| 67 | 15599 | Leche evaporada Hacendado | [WebP](mercadona-15599-leche-evaporada-hacendado.webp) | 768 × 601 | 82546 |
| 68 | 86168 | Bebida de avena con calcio sin azúcares añadidos Hacendado | [WebP](mercadona-86168-bebida-de-avena-con-calcio-sin-azucares-anadidos-hacendado.webp) | 768 × 705 | 70260 |
| 69 | 29322 | Bebida de soja 0% azúcar Hacendado | [WebP](mercadona-29322-bebida-de-soja-0-azucar-hacendado.webp) | 768 × 732 | 70452 |
| 70 | 13847 | Bebida de coco y arroz sin azúcares añadidos Hacendado | [WebP](mercadona-13847-bebida-de-coco-y-arroz-sin-azucares-anadidos-hacendado.webp) | 768 × 753 | 68814 |
| 71 | 22544 | Café molido natural Hacendado | [WebP](mercadona-22544-cafe-molido-natural-hacendado.webp) | 407 × 768 | 76204 |
| 72 | 13593 | Café molido descafeinado Hacendado | [WebP](mercadona-13593-cafe-molido-descafeinado-hacendado.webp) | 430 × 768 | 81230 |
| 73 | 22718 | Café soluble Classic Hacendado | [WebP](mercadona-22718-cafe-soluble-classic-hacendado.webp) | 348 × 768 | 78646 |
| 74 | 22719 | Café soluble descafeinado Hacendado | [WebP](mercadona-22719-cafe-soluble-descafeinado-hacendado.webp) | 372 × 768 | 88040 |
| 75 | 22966 | Cereales copos de maíz Corn Flakes Hacendado 0% azúcares añadidos | [WebP](mercadona-22966-cereales-copos-de-maiz-corn-flakes-hacendado-0-azucares-anadidos.webp) | 567 × 768 | 98342 |
| 76 | 9377 | Cereales rellenos de cacao y avellana Hacendado | [WebP](mercadona-9377-cereales-rellenos-de-cacao-y-avellana-hacendado.webp) | 513 × 768 | 71432 |
| 77 | 14214 | Galletas Digestive Hacendado | [WebP](mercadona-14214-galletas-digestive-hacendado.webp) | 768 × 578 | 79918 |
| 78 | 14212 | Galletas Cookies Hacendado | [WebP](mercadona-14212-galletas-cookies-hacendado.webp) | 768 × 281 | 69092 |
| 79 | 14430 | Galletas canela Hacendado | [WebP](mercadona-14430-galletas-canela-hacendado.webp) | 639 × 768 | 142324 |
| 80 | 14006 | Galletas María Integral Hacendado | [WebP](mercadona-14006-galletas-maria-integral-hacendado.webp) | 768 × 673 | 166020 |
| 81 | 12476 | Chocolate blanco Hacendado | [WebP](mercadona-12476-chocolate-blanco-hacendado.webp) | 376 × 768 | 41546 |
| 82 | 15101 | Chocolate con leche classic Hacendado extrafino | [WebP](mercadona-15101-chocolate-con-leche-classic-hacendado-extrafino-v2.webp) | 349 × 768 | 34098 |
| 83 | 23773 | Chocolate negro 72% de cacao Hacendado | [WebP](mercadona-23773-chocolate-negro-72-de-cacao-hacendado.webp) | 373 × 768 | 48688 |
| 84 | 60722 | Chocolate negro 85% cacao Hacendado | [WebP](mercadona-60722-chocolate-negro-85-cacao-hacendado.webp) | 368 × 768 | 51742 |
| 85 | 15068 | Mermelada de albaricoque Hacendado | [WebP](mercadona-15068-mermelada-de-albaricoque-hacendado.webp) | 632 × 768 | 78944 |
| 86 | 35932 | Mermelada de arándanos Hacendado | [WebP](mercadona-35932-mermelada-de-arandanos-hacendado.webp) | 561 × 768 | 104380 |
| 87 | 86684 | Mermelada de melocotón Hacendado | [WebP](mercadona-86684-mermelada-de-melocoton-hacendado.webp) | 642 × 768 | 95422 |
| 88 | 15450 | Miel de montaña Hacendado | [WebP](mercadona-15450-miel-de-montana-hacendado.webp) | 467 × 768 | 57252 |
| 89 | 35649 | Azúcar glas Hacendado | [WebP](mercadona-35649-azucar-glas-hacendado.webp) | 306 × 768 | 46142 |
| 90 | 22349 | Azúcar moreno de caña Hacendado | [WebP](mercadona-22349-azucar-moreno-de-cana-hacendado.webp) | 415 × 768 | 84414 |
| 91 | 34865 | Almendra natural Hacendado | [WebP](mercadona-34865-almendra-natural-hacendado.webp) | 483 × 768 | 81382 |
| 92 | 34025 | Avellana tostada Hacendado 0% sal añadida | [WebP](mercadona-34025-avellana-tostada-hacendado-0-sal-anadida.webp) | 520 × 768 | 72992 |
| 93 | 34024 | Nuez natural Hacendado pelada | [WebP](mercadona-34024-nuez-natural-hacendado-pelada.webp) | 601 × 768 | 86542 |
| 94 | 86202 | Pistacho tostado Hacendado con sal | [WebP](mercadona-86202-pistacho-tostado-hacendado-con-sal.webp) | 537 × 768 | 74000 |
| 95 | 34820 | Cacahuete frito con sal Hacendado pelado | [WebP](mercadona-34820-cacahuete-frito-con-sal-hacendado-pelado.webp) | 487 × 768 | 80674 |
| 96 | 23010 | Pasas sultanas sin semillas Hacendado | [WebP](mercadona-23010-pasas-sultanas-sin-semillas-hacendado.webp) | 479 × 768 | 98032 |
| 97 | 20020 | Ciruelas desecadas sin hueso Hacendado | [WebP](mercadona-20020-ciruelas-desecadas-sin-hueso-hacendado.webp) | 565 × 768 | 119544 |
| 98 | 7032 | Caldo de verduras Hacendado | [WebP](mercadona-7032-caldo-de-verduras-hacendado.webp) | 414 × 768 | 85054 |
| 99 | 7325 | Caldo de pescado Hacendado | [WebP](mercadona-7325-caldo-de-pescado-hacendado.webp) | 433 × 768 | 94906 |
| 100 | 39934 | Gazpacho tradicional Hacendado | [WebP](mercadona-39934-gazpacho-tradicional-hacendado.webp) | 768 × 658 | 120614 |
