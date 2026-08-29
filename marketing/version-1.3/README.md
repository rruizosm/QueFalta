# Vídeo promocional 1.3

## Style frame inicial

`style-frame-1.2.1-viejo-v1.png` fija el lenguaje visual del arranque:

- composición vertical 9:16;
- número `1.2.1` monumental, viejo, sucio y cubierto de telarañas;
- plátano intentando arrancar el `2`;
- tomate intentando arrancar el último `1`;
- berenjena entrando desde la derecha con una escalera;
- iluminación azul cinematográfica con personajes cálidos y tono cómico.

Es una referencia de preproducción. Las acciones exactas se reconstruirán con
personajes y objetos separados para que el montaje sea controlable.

## Style frame de acciones v2

`style-frame-1.2.1-acciones-v2.png` corrige la dirección de las fuerzas y sirve
como referencia principal para el montaje: el plátano tira del `2` hacia la
izquierda, el tomate se coloca a la derecha y tira del último `1`, y la
berenjena conserva espacio para entrar desde el extremo derecho con la escalera.
El número sigue siendo exactamente `1.2.1` y mantiene el acabado viejo, sucio y
cubierto de telarañas.

## Poses maestras v1

- `assets/platano-tirando-2-v1.png`: colocado a la izquierda del `2`, mirando
  hacia la derecha, con el cuerpo inclinado hacia fuera y las manos preparadas
  para abrazar el borde del dígito.
- `assets/tomate-tirando-1-final-v1.png`: colocado a la derecha del último `1`,
  mirando hacia la izquierda, con piernas abiertas y manos preparadas para
  abrazar su borde.
- `assets/berenjena-caminando-escalera-v1.png`: zancada de derecha a izquierda
  sujetando una escalera completa con ambas manos.

Los tres PNG son masters RGB de pose. ImageGen dibujó el damero dentro de la
imagen en vez de entregar alfa real, incluso tras repetir la extracción. Se
conservan como referencia y no deben sobrescribirse.

## Recortes transparentes v2

- `assets/platano-tirando-2-rgba-v2.png`
- `assets/tomate-tirando-1-final-rgba-v2.png`
- `assets/berenjena-caminando-escalera-rgba-v2.png`

Estas versiones se regeneraron sobre un fondo croma cian plano y se procesaron
localmente para retirar el croma, limpiar el derrame de color y suavizar el
contorno. Los tres archivos son PNG de 1024 x 1536 px, RGBA con canal alfa real,
verificado, y están listos para componer sobre los dígitos y el escenario.

## Poses intermedias transparentes v3

- `assets/platano-agarre-inicial-rgba-v3.png`: primer agarre y comienzo del
  esfuerzo, antes del tirón fuerte de la pose v2.
- `assets/tomate-arranque-1-rgba-v3.png`: tirón más abierto cuando el último `1`
  empieza a soltarse.
- `assets/berenjena-plantando-escalera-rgba-v3.png`: transición entre caminar
  con la escalera y apoyarla en el suelo.

Los tres recursos son PNG de 1024 x 1536 px con alfa real verificado. Junto con
las poses v2 permiten construir una primera animática sin tener que deformar de
forma extrema una única ilustración.

## Ritmo provisional de la secuencia

1. `0,0–0,8 s`: aparición del `1.2.1` viejo entre polvo y telarañas.
2. `0,8–1,8 s`: plátano y tomate agarran los dígitos; la berenjena entra.
3. `1,8–2,8 s`: tirón fuerte, vibración de los dígitos y caída de polvo.
4. `2,8–3,6 s`: la berenjena planta la escalera mientras el `2` y el último `1`
   se desprenden.
5. `3,6–4,8 s`: transición de polvo y golpe visual para revelar `1.3` limpio.
