# Mercadona — otras 100 ilustraciones (2026-10-07)

Se seleccionaron 100 productos publicados sin ilustración. Se parte de 131
ilustraciones anteriores; sus URL y fotografías están registradas para verificar
su conservación. Hay 20 productos en cada grupo: café e infusiones, cocina y
condimentos, desayuno y pan seco, aperitivos y frutos secos, conservas y cremas.

ImageGen integrado utiliza la fotografía oficial de cada producto como referencia
de contenido y el producto `10699` como referencia de estilo. Se mantienen el
envase, los colores, los textos principales y los packs completos. El fondo tiene
alfa real. Los PNG originales se conservan en su ruta de procedencia y los maestros
procesados se guardan junto a los WebP del proyecto.

La limpieza técnica de alfa usa `scripts/clean-product-illustration-alpha.mjs`;
WebP con lado máximo 768 px, calidad 84 y alfa 100. Se comprueban transparencia,
borde exterior sin píxeles visibles y revisión visual antes de publicar.

## Trazabilidad

- `manifest.json`: selección, fuentes e inventario final verificado.
- `prompts.json`: instrucciones exactas por producto y referencia de estilo.
- `jobs/<id>.json`: PNG generado, procedencia, prompt, métricas, revisión y recibo.
- `originals/`: fotografías oficiales de los 100 productos.
- `existing-illustrations-before.json`: las 131 ilustraciones anteriores.
- `sources-1.jpg` a `sources-5.jpg`: fuentes revisadas antes de generar.
- `preview-<inicio>-<fin>.jpg`: vistas de los WebP finales.

## Publicación

Se utiliza `scripts/upload-mercadona-illustration.mjs`, sin sustituir ilustraciones
existentes. Cada objeto nuevo tiene hash en su ruta del bucket público
`product-illustrations`. Se verifican MIME `image/webp` y SHA-256 por descarga
pública y se actualiza únicamente `mercadona_products.illustration_url`, conservando
la fotografía `thumbnail`. Una lectura anónima final comprueba las filas y URL.

**Completado:** 100 productos nuevos publicados y verificados. Total actual:
**231 ilustraciones WebP**. El lote ocupa **8.510.550 bytes**
(8,51 MB); entre 31.100 y 150.436 bytes por producto.

Los 100 pasan revisión visual, alfa real y borde exterior transparente. Cada
publicación confirmó MIME público y SHA-256 local/remoto. La lectura anónima
final verificó URL, estado publicado, fotografías originales intactas y
conservación de las 131 ilustraciones anteriores. TypeScript correcto.

Se restauró «SIN/SEM GLUTEN» del cacao a la taza `11609` y de las cremas
de cacahuete `16883` y avellanas/cacao `11630` antes de publicar.
La procedencia, versiones anteriores y prompts de corrección se conservan
en sus jobs.

## Vistas previas

- [Productos 1–20](preview-1-20.jpg)
- [Productos 21–40](preview-21-40.jpg)
- [Productos 41–60](preview-41-60.jpg)
- [Productos 61–80](preview-61-80.jpg)
- [Productos 81–100](preview-81-100.jpg)

## Inventario publicado

Las URL públicas, hashes y recibos de subida están en `manifest.json`.

| # | ID | Producto | WebP local | Tamaño | Bytes |
| --- | --- | --- | --- | --- | ---: |
| 1 | 11609 | Cacao en polvo a la taza Hacendado | [WebP](mercadona-11609-cacao-en-polvo-a-la-taza-hacendado-v2.webp) | 360 × 768 | 42164 |
| 2 | 13037 | Cacao soluble Hacendado | [WebP](mercadona-13037-cacao-soluble-hacendado.webp) | 416 × 768 | 72672 |
| 3 | 20919 | Cacao soluble instantáneo Hacendado | [WebP](mercadona-20919-cacao-soluble-instantaneo-hacendado.webp) | 476 × 768 | 71604 |
| 4 | 11172 | Café molido natural Hacendado | [WebP](mercadona-11172-cafe-molido-natural-hacendado.webp) | 423 × 768 | 84752 |
| 5 | 13592 | Café molido descafeinado Hacendado | [WebP](mercadona-13592-cafe-molido-descafeinado-hacendado.webp) | 419 × 768 | 79010 |
| 6 | 15922 | Café molido mezcla Hacendado | [WebP](mercadona-15922-cafe-molido-mezcla-hacendado.webp) | 412 × 768 | 78608 |
| 7 | 11171 | Café molido fuerte Hacendado | [WebP](mercadona-11171-cafe-molido-fuerte-hacendado.webp) | 418 × 768 | 85758 |
| 8 | 11714 | Café molido natural Hacendado Espresso | [WebP](mercadona-11714-cafe-molido-natural-hacendado-espresso.webp) | 434 × 768 | 59786 |
| 9 | 22163 | Café soluble Classic Hacendado | [WebP](mercadona-22163-cafe-soluble-classic-hacendado.webp) | 370 × 768 | 82292 |
| 10 | 22164 | Café soluble descafeinado Hacendado | [WebP](mercadona-22164-cafe-soluble-descafeinado-hacendado.webp) | 381 × 768 | 88134 |
| 11 | 11168 | Infusión Manzanilla Hacendado | [WebP](mercadona-11168-infusion-manzanilla-hacendado.webp) | 768 × 541 | 109282 |
| 12 | 11430 | Infusión Manzanilla con anís Hacendado | [WebP](mercadona-11430-infusion-manzanilla-con-anis-hacendado.webp) | 768 × 559 | 113936 |
| 13 | 60671 | Infusión Menta Poleo Hacendado | [WebP](mercadona-60671-infusion-menta-poleo-hacendado.webp) | 768 × 568 | 123606 |
| 14 | 11431 | Infusión Tila Hacendado | [WebP](mercadona-11431-infusion-tila-hacendado.webp) | 768 × 513 | 92402 |
| 15 | 13651 | Té verde Hacendado | [WebP](mercadona-13651-te-verde-hacendado.webp) | 768 × 521 | 126062 |
| 16 | 8804 | Té negro Hacendado | [WebP](mercadona-8804-te-negro-hacendado.webp) | 768 × 559 | 125930 |
| 17 | 11433 | Té Chai Hacendado | [WebP](mercadona-11433-te-chai-hacendado.webp) | 768 × 531 | 107254 |
| 18 | 13652 | Infusión Rooibos cítricos Hacendado | [WebP](mercadona-13652-infusion-rooibos-citricos-hacendado.webp) | 768 × 536 | 113724 |
| 19 | 11400 | Infusión Jengibre Hacendado | [WebP](mercadona-11400-infusion-jengibre-hacendado.webp) | 768 × 515 | 97068 |
| 20 | 8805 | Infusión frutos rojos Hacendado | [WebP](mercadona-8805-infusion-frutos-rojos-hacendado.webp) | 768 × 550 | 121096 |
| 21 | 4240 | Aceite de oliva 0,4º Hacendado | [WebP](mercadona-4240-aceite-de-oliva-0-4-hacendado.webp) | 225 × 768 | 44914 |
| 22 | 4640 | Aceite de oliva 1º Hacendado | [WebP](mercadona-4640-aceite-de-oliva-1-hacendado.webp) | 223 × 768 | 44640 |
| 23 | 4717 | Aceite de oliva virgen extra Hacendado | [WebP](mercadona-4717-aceite-de-oliva-virgen-extra-hacendado.webp) | 302 × 768 | 57682 |
| 24 | 4711 | Aceite de oliva virgen Hacendado | [WebP](mercadona-4711-aceite-de-oliva-virgen-hacendado.webp) | 305 × 768 | 61446 |
| 25 | 29006 | Bicarbonato de sódio Hacendado | [WebP](mercadona-29006-bicarbonato-de-sodio-hacendado.webp) | 261 × 768 | 42778 |
| 26 | 32525 | Azúcar vainillado Hacendado | [WebP](mercadona-32525-azucar-vainillado-hacendado.webp) | 451 × 768 | 83972 |
| 27 | 29130 | Harina de arroz Hacendado | [WebP](mercadona-29130-harina-de-arroz-hacendado.webp) | 585 × 768 | 49172 |
| 28 | 29373 | Harina de garbanzo Hacendado | [WebP](mercadona-29373-harina-de-garbanzo-hacendado.webp) | 622 × 768 | 80412 |
| 29 | 9588 | Harina fina de maíz Hacendado | [WebP](mercadona-9588-harina-fina-de-maiz-hacendado.webp) | 573 × 768 | 81496 |
| 30 | 86998 | Levadura de panadería Hacendado | [WebP](mercadona-86998-levadura-de-panaderia-hacendado.webp) | 534 × 768 | 106454 |
| 31 | 82219 | Pan rallado Hacendado | [WebP](mercadona-82219-pan-rallado-hacendado.webp) | 468 × 768 | 103156 |
| 32 | 82227 | Pan rallado con ajo y perejil Hacendado | [WebP](mercadona-82227-pan-rallado-con-ajo-y-perejil-hacendado.webp) | 487 × 768 | 144014 |
| 33 | 8930 | Sal rosa del Himalaya Hacendado | [WebP](mercadona-8930-sal-rosa-del-himalaya-hacendado.webp) | 521 × 768 | 64206 |
| 34 | 19732 | Sal yodada fina Hacendado | [WebP](mercadona-19732-sal-yodada-fina-hacendado.webp) | 460 × 768 | 60188 |
| 35 | 17347 | Salsa Burger Hacendado | [WebP](mercadona-17347-salsa-burger-hacendado.webp) | 399 × 768 | 62732 |
| 36 | 12847 | Salsa Chimichurri Hacendado | [WebP](mercadona-12847-salsa-chimichurri-hacendado.webp) | 343 × 768 | 53026 |
| 37 | 17382 | Salsa de Soja sin gluten Hacendado | [WebP](mercadona-17382-salsa-de-soja-sin-gluten-hacendado.webp) | 221 × 768 | 53128 |
| 38 | 26496 | Vinagre balsámico de Módena Hacendado | [WebP](mercadona-26496-vinagre-balsamico-de-modena-hacendado.webp) | 193 × 768 | 31100 |
| 39 | 4940 | Vinagre de vino blanco Hacendado | [WebP](mercadona-4940-vinagre-de-vino-blanco-hacendado.webp) | 219 × 768 | 46564 |
| 40 | 16486 | Vinagre de manzana Hacendado sin filtrar | [WebP](mercadona-16486-vinagre-de-manzana-hacendado-sin-filtrar.webp) | 327 × 768 | 48692 |
| 41 | 15611 | Cereales avena Crunchy Hacendado | [WebP](mercadona-15611-cereales-avena-crunchy-hacendado.webp) | 547 × 768 | 110744 |
| 42 | 52751 | Cereales avena Crunchy Hacendado de cacao | [WebP](mercadona-52751-cereales-avena-crunchy-hacendado-de-cacao.webp) | 548 × 768 | 101520 |
| 43 | 9532 | Cereales Cereal Mix Hacendado 0% azúcares añadidos | [WebP](mercadona-9532-cereales-cereal-mix-hacendado-0-azucares-anadidos.webp) | 468 × 768 | 119638 |
| 44 | 60236 | Cereales con salvado de trigo Fibra Sticks Hacendado | [WebP](mercadona-60236-cereales-con-salvado-de-trigo-fibra-sticks-hacendado.webp) | 619 × 768 | 116940 |
| 45 | 9508 | Cereales copos de trigo Chocodays Hacendado con chocolate | [WebP](mercadona-9508-cereales-copos-de-trigo-chocodays-hacendado-con-chocolate.webp) | 571 × 768 | 108896 |
| 46 | 9571 | Cereales copos de trigo espelta integral Hacendado 0% azúcares añadidos | [WebP](mercadona-9571-cereales-copos-de-trigo-espelta-integral-hacendado-0-azucares-anadidos.webp) | 413 × 768 | 109126 |
| 47 | 9488 | Cereales copos de trigo integral y arroz Hacendado 0% azúcares añadidos | [WebP](mercadona-9488-cereales-copos-de-trigo-integral-y-arroz-hacendado-0-azucares-anadidos.webp) | 550 × 768 | 115380 |
| 48 | 80515 | Cereales estrellas de maíz Stars Hacendado con miel | [WebP](mercadona-80515-cereales-estrellas-de-maiz-stars-hacendado-con-miel.webp) | 547 × 768 | 87906 |
| 49 | 9547 | Cereales rellenos de crema de cacao y avellana Hacendado sin gluten | [WebP](mercadona-9547-cereales-rellenos-de-crema-de-cacao-y-avellana-hacendado-sin-gluten.webp) | 491 × 768 | 100360 |
| 50 | 9264 | Cereales rellenos de leche Hacendado | [WebP](mercadona-9264-cereales-rellenos-de-leche-hacendado.webp) | 637 × 768 | 89584 |
| 51 | 9355 | Muesli Crunchy Hacendado con chocolate | [WebP](mercadona-9355-muesli-crunchy-hacendado-con-chocolate.webp) | 582 × 768 | 101146 |
| 52 | 9356 | Muesli Crunchy Hacendado con fruta | [WebP](mercadona-9356-muesli-crunchy-hacendado-con-fruta.webp) | 584 × 768 | 91024 |
| 53 | 9357 | Muesli Crunchy Hacendado con frutos secos | [WebP](mercadona-9357-muesli-crunchy-hacendado-con-frutos-secos.webp) | 605 × 768 | 104792 |
| 54 | 9492 | Muesli Hacendado 50% frutas y frutos secos | [WebP](mercadona-9492-muesli-hacendado-50-frutas-y-frutos-secos.webp) | 536 × 768 | 89568 |
| 55 | 82287 | Pan tostado classic Hacendado | [WebP](mercadona-82287-pan-tostado-classic-hacendado.webp) | 473 × 768 | 81260 |
| 56 | 83789 | Pan tostado 100% integral bajo en sal y en azúcares Hacendado | [WebP](mercadona-83789-pan-tostado-100-integral-bajo-en-sal-y-en-azucares-hacendado.webp) | 465 × 768 | 106474 |
| 57 | 82190 | Pan tostado con tomate Hacendado | [WebP](mercadona-82190-pan-tostado-con-tomate-hacendado.webp) | 626 × 768 | 132830 |
| 58 | 14241 | Barquillos con crema de avellanas Hacendado | [WebP](mercadona-14241-barquillos-con-crema-de-avellanas-hacendado.webp) | 524 × 768 | 89712 |
| 59 | 14239 | Barquillos rellenos con crema de cacao Hacendado | [WebP](mercadona-14239-barquillos-rellenos-con-crema-de-cacao-hacendado.webp) | 768 × 331 | 50366 |
| 60 | 14240 | Barquillos rellenos sabor vainilla Hacendado | [WebP](mercadona-14240-barquillos-rellenos-sabor-vainilla-hacendado.webp) | 768 × 323 | 56556 |
| 61 | 34009 | Almendra frita y salada Hacendado pelada | [WebP](mercadona-34009-almendra-frita-y-salada-hacendado-pelada.webp) | 503 × 768 | 65914 |
| 62 | 20920 | Almendra laminada Hacendado | [WebP](mercadona-20920-almendra-laminada-hacendado.webp) | 511 × 768 | 90634 |
| 63 | 20924 | Almendra molida Hacendado | [WebP](mercadona-20924-almendra-molida-hacendado.webp) | 541 × 768 | 97020 |
| 64 | 34014 | Almendra tostada Hacendado 0% sal añadida con piel | [WebP](mercadona-34014-almendra-tostada-hacendado-0-sal-anadida-con-piel.webp) | 559 × 768 | 77770 |
| 65 | 34027 | Anacardo frito salado Hacendado | [WebP](mercadona-34027-anacardo-frito-salado-hacendado.webp) | 523 × 768 | 70406 |
| 66 | 23365 | Anacardo natural Hacendado | [WebP](mercadona-23365-anacardo-natural-hacendado.webp) | 485 × 768 | 72834 |
| 67 | 52668 | Anacardo tostado 0% sal añadida Hacendado | [WebP](mercadona-52668-anacardo-tostado-0-sal-anadida-hacendado.webp) | 521 × 768 | 67742 |
| 68 | 34143 | Cacahuete frito con miel Hacendado | [WebP](mercadona-34143-cacahuete-frito-con-miel-hacendado.webp) | 560 × 768 | 86228 |
| 69 | 34016 | Cacahuete tostado con sal Hacendado | [WebP](mercadona-34016-cacahuete-tostado-con-sal-hacendado.webp) | 471 × 768 | 82946 |
| 70 | 15301 | Dátiles desecados sin hueso Hacendado | [WebP](mercadona-15301-datiles-desecados-sin-hueso-hacendado.webp) | 519 × 768 | 108812 |
| 71 | 22974 | Dátiles Medjoul con hueso Hacendado | [WebP](mercadona-22974-datiles-medjoul-con-hueso-hacendado.webp) | 768 × 437 | 77264 |
| 72 | 34821 | Maíz frito crujiente y tierno Hacendado | [WebP](mercadona-34821-maiz-frito-crujiente-y-tierno-hacendado.webp) | 313 × 768 | 64342 |
| 73 | 13597 | Maíz frito gigante Hacendado | [WebP](mercadona-13597-maiz-frito-gigante-hacendado.webp) | 438 × 768 | 77164 |
| 74 | 17754 | Nachos Hacendado | [WebP](mercadona-17754-nachos-hacendado.webp) | 560 × 768 | 86662 |
| 75 | 33641 | Nachos tex-mex sabor queso Hacendado | [WebP](mercadona-33641-nachos-tex-mex-sabor-queso-hacendado.webp) | 515 × 768 | 84088 |
| 76 | 34822 | Palomitas de maíz con sal Hacendado para microondas | [WebP](mercadona-34822-palomitas-de-maiz-con-sal-hacendado-para-microondas.webp) | 489 × 768 | 71192 |
| 77 | 34212 | Palomitas de maíz sabor mantequilla Hacendado para microondas | [WebP](mercadona-34212-palomitas-de-maiz-sabor-mantequilla-hacendado-para-microondas.webp) | 461 × 768 | 63824 |
| 78 | 22245 | Patatas fritas clásicas Hacendado | [WebP](mercadona-22245-patatas-fritas-clasicas-hacendado.webp) | 447 × 768 | 67514 |
| 79 | 15589 | Patatas fritas onduladas Hacendado | [WebP](mercadona-15589-patatas-fritas-onduladas-hacendado.webp) | 527 × 768 | 59644 |
| 80 | 34095 | Pipas calabaza tostadas Hacendado aguasal | [WebP](mercadona-34095-pipas-calabaza-tostadas-hacendado-aguasal.webp) | 441 × 768 | 77966 |
| 81 | 33127 | Aceitunas negras Cuquillo con hueso Hacendado | [WebP](mercadona-33127-aceitunas-negras-cuquillo-con-hueso-hacendado.webp) | 400 × 768 | 91626 |
| 82 | 8309 | Aceitunas negras en rodajas Hacendado | [WebP](mercadona-8309-aceitunas-negras-en-rodajas-hacendado.webp) | 768 × 325 | 77692 |
| 83 | 52733 | Aceitunas negras sin hueso Hacendado | [WebP](mercadona-52733-aceitunas-negras-sin-hueso-hacendado.webp) | 768 × 523 | 123018 |
| 84 | 60693 | Aceitunas verdes Arbequina con hueso Hacendado | [WebP](mercadona-60693-aceitunas-verdes-arbequina-con-hueso-hacendado.webp) | 348 × 768 | 62310 |
| 85 | 13422 | Aceitunas verdes estilo casero Hacendado partidas aliñadas | [WebP](mercadona-13422-aceitunas-verdes-estilo-casero-hacendado-partidas-alinadas.webp) | 377 × 768 | 75104 |
| 86 | 33190 | Alcaparras Hacendado | [WebP](mercadona-33190-alcaparras-hacendado.webp) | 604 × 768 | 137368 |
| 87 | 22154 | Banderillas dulces Hacendado | [WebP](mercadona-22154-banderillas-dulces-hacendado.webp) | 640 × 768 | 122678 |
| 88 | 33235 | Banderillas picantes Hacendado | [WebP](mercadona-33235-banderillas-picantes-hacendado.webp) | 624 × 768 | 117528 |
| 89 | 18553 | Berberechos al natural S Hacendado | [WebP](mercadona-18553-berberechos-al-natural-s-hacendado.webp) | 768 × 490 | 79514 |
| 90 | 18108 | Bonito del norte en escabeche Hacendado | [WebP](mercadona-18108-bonito-del-norte-en-escabeche-hacendado.webp) | 768 × 728 | 150436 |
| 91 | 16883 | Crema de cacahuete 100% Hacendado | [WebP](mercadona-16883-crema-de-cacahuete-100-hacendado-v2.webp) | 500 × 768 | 74926 |
| 92 | 11630 | Crema de avellanas y cacao Hacendado | [WebP](mercadona-11630-crema-de-avellanas-y-cacao-hacendado-v2.webp) | 546 × 768 | 67256 |
| 93 | 16519 | Espárragos blancos medianos Hacendado | [WebP](mercadona-16519-esparragos-blancos-medianos-hacendado.webp) | 384 × 768 | 69812 |
| 94 | 16507 | Espárragos blancos muy gruesos Hacendado cortos | [WebP](mercadona-16507-esparragos-blancos-muy-gruesos-hacendado-cortos.webp) | 552 × 768 | 65396 |
| 95 | 16415 | Guisantes extra Hacendado | [WebP](mercadona-16415-guisantes-extra-hacendado.webp) | 768 × 355 | 76480 |
| 96 | 15206 | Melocotón en almíbar Hacendado | [WebP](mercadona-15206-melocoton-en-almibar-hacendado.webp) | 768 × 289 | 60914 |
| 97 | 15203 | Piña en su jugo Hacendado rodajas | [WebP](mercadona-15203-pina-en-su-jugo-hacendado-rodajas.webp) | 768 × 276 | 65202 |
| 98 | 16103 | Pimientos asados en tiras Hacendado | [WebP](mercadona-16103-pimientos-asados-en-tiras-hacendado.webp) | 768 × 570 | 90954 |
| 99 | 16005 | Pimientos del piquillo enteros Hacendado extra | [WebP](mercadona-16005-pimientos-del-piquillo-enteros-hacendado-extra.webp) | 542 × 768 | 81974 |
| 100 | 86033 | Mermelada de frambuesa Hacendado | [WebP](mercadona-86033-mermelada-de-frambuesa-hacendado.webp) | 588 × 768 | 111662 |
