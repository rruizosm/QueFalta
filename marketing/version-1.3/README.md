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

## Ritmo de la animática con movimiento

1. `0,0–0,8 s`: aparición del `1.2.1` viejo entre polvo y telarañas.
2. `0,8–2,2 s`: plátano y tomate agarran los dígitos; la berenjena entra.
3. `2,2–3,2 s`: tirón fuerte, vibración, estelas y caída de polvo; la escalera
   se planta y el `2` y el último `1` se desprenden.
4. `3,2–3,6 s`: impacto, destello y transformación al `1.3` limpio.
5. `3,6–6,0 s`: celebración, destellos y pausa final para leer la versión.

## Elementos móviles y escenario

- `assets/escenario-vacio-v1.png`: placa limpia del escenario, sin personajes,
  dígitos ni sombras de primer plano.
- `assets/digito-2-viejo-rgba-v2.png`: `2` envejecido aislado y listo para
  desplazar, inclinar y rotar.
- `assets/digito-1-final-viejo-rgba-v2.png`: último `1` envejecido aislado para
  el tirón del tomate.
- `assets/punto-viejo-rgba-v1.png`: punto envejecido aislado, usado dos veces
  para conservar la lectura exacta de `1.2.1` durante el movimiento.

Los dos dígitos son PNG RGBA de 941 x 1672 px con alfa real verificado. Se
extrajeron desde croma magenta para no dañar la pintura azul; las pruebas sobre
croma cian se descartaron porque contaminaban el color del metal.

## Keyframes y animáticas

- `keyframe-ruptura-v1.png`: momento de máxima fuerza, separación de los
  dígitos, polvo y rotura de telarañas.
- `keyframe-revelado-1.3-v1.png`: cierre luminoso con `1.3` limpio y las tres
  mascotas celebrando.
- `animatica-1.2.1-a-1.3-v1.mp4`: montaje vertical de 5 segundos, 1080 x 1920,
  30 fps y H.264, sin sonido.
- `animatica-1.2.1-a-1.3-v4.mp4`: referencia actual de 6 segundos, 1080 x 1920,
  30 fps, H.264 y audio AAC estéreo. Anima de verdad los dígitos, intercala las
  poses de las mascotas y añade entrada de la berenjena, escalera, polvo,
  vibración de cámara, estelas, destello de transición y destellos finales.
- `render_animatica_v2.py`: render reproducible de la composición y el
  movimiento a partir de los PNG separados.
- `sound-design-v1.ffilter`: mezcla reproducible de ambiente, tensión,
  crujidos, impacto, barrido y acorde de celebración, sin archivos de audio
  externos.

Las versiones `v2` y `v3` son renders intermedios conservados para comparación;
`v4` es la referencia vigente. Sigue siendo una animática de recortes y poses,
no una animación esquelética final, pero ya permite evaluar ritmo, claridad de
las acciones, transición, partículas y diseño sonoro como una pieza continua.
