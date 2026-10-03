# Prompt maestro — lanzamiento de Supermercados BM en QuéFalta

## Prompt para el agente de vídeo

Actúa como director creativo, realizador, editor, motion designer y estratega de publicidad de respuesta directa de primer nivel. Crea una pieza promocional de **10 segundos exactos** para anunciar que **Supermercados BM ya está disponible en QuéFalta**. Debe captar la atención desde el primer segundo, explicar la novedad sin rodeos y cerrar con una llamada clara a abrir QuéFalta.

### Idea central

**BM llega a QuéFalta.** Ahora se puede consultar desde la app el catálogo BM y sus secciones de ofertas, novedades y cambios de precio. La pieza debe transmitir descubrimiento, utilidad cotidiana y claridad: la información de BM reunida en la app QuéFalta.

### Recursos y preparación

- Usa el logotipo oficial local de BM: `assets/stores/bm.png`.
- Usa el logotipo oficial de QuéFalta: `assets/quefalta-logo-blue.png` (o `assets/quefalta-logo.png` si encaja mejor con el fondo).
- Consulta el proyecto Supabase **solo en lectura** si necesitas seleccionar productos, imágenes, ofertas o cambios de precio actuales de BM. Usa únicamente filas publicadas y disponibles de `bm_product_locations`, asociadas a una ubicación BM publicada y habilitada. Respeta la zona/ubicación: BM puede variar surtido, disponibilidad, promociones y precio entre zonas.
- Para mostrar ofertas o precios concretos, comprueba que la oferta siga publicada y vigente para la ubicación elegida. Para un cambio de precio, utiliza un registro real reciente de `catalog_location_price_changes` con `store = 'bm'`, vinculado a su producto y ubicación. No inventes cifras, descuentos, vigencias, disponibilidad ni etiquetas.
- El repositorio documenta BM en siete zonas de referencia. No lo presentes como cobertura nacional; si aparece una nota de disponibilidad, usa: **«Consulta BM según tu código postal»**.
- Toma la interfaz real de QuéFalta como referencia visual. Si no dispones de una captura verificable, construye una composición gráfica inspirada en la app y deja textos y cifras perfectamente legibles; no simules una captura exacta.

### Guion visual y ritmo

**0,0–1,5 s — Gancho.** Fondo azul profundo y sonido breve de entrada. El logo BM aparece con una entrada limpia y enérgica; un destello o trazo conecta con el icono de cesta de QuéFalta. Texto grande: **«¡BM ya está en QuéFalta!»**

**1,5–3,5 s — Descubrimiento.** Transición rápida hacia una vista de móvil con QuéFalta. Se selecciona BM y aparece una pequeña selección de productos reales de BM, con fotografías recortadas limpias. Texto: **«Tu catálogo BM, en la app»**.

**3,5–6,8 s — Beneficios.** Tres tarjetas o pestañas reales de la app entran al ritmo de la música: **«Ofertas»**, **«Novedades»**, **«Cambios de precio»**. Acompaña cada una con un gesto visual simple y legible: etiqueta de oferta, destello de novedad y flecha de variación de precio. Si se muestran datos concretos, que sean datos verificados de la misma ubicación y actuales; de lo contrario, usa solo los nombres de las secciones, sin cifras.

**6,8–8,5 s — Unión de marcas.** El logo BM y el de QuéFalta quedan juntos, con los elementos de la interfaz agrupándose con orden en la pantalla del móvil. Texto: **«BM, ahora en QuéFalta»**.

**8,5–10,0 s — Cierre/CTA.** End card sencilla, logos nítidos y llamada a la acción: **«Abre QuéFalta y descubre BM»**. Mantén el cierre estable y legible hasta el último fotograma. Si se incluye la web, usar exactamente **quefalta.es**.

### Dirección de arte y sonido

- Formato vertical **9:16**, **1080 × 1920**, duración exacta **10,00 s**, pensado para Reels, TikTok y Stories.
- Estética actual, premium y cercana; diseño limpio, energético y apetecible, coherente con la identidad azul de QuéFalta. La identidad BM debe conservar sus colores y proporciones originales.
- **Paleta protagonista: colores oficiales de Supermercados BM**, tomados del logo y los recursos de marca disponibles en `assets`. Construye fondos, acentos, tarjetas y transiciones alrededor de esa paleta; reserva los colores de QuéFalta para el logo y detalles de interfaz, sin competir visualmente con BM.
- Usa **Anton** como tipografía principal de titulares y mensajes clave, con jerarquía contundente y alta legibilidad en móvil. Para textos secundarios pequeños, usa una sans serif limpia y legible; no sustituyas Anton en los titulares.
- Motion design preciso, con transiciones suaves y ágiles sincronizadas con una base musical original optimista. Añade efectos sonoros discretos a las selecciones y a la aparición de cada beneficio.
- Alto contraste, tipografía sans serif legible en móvil, pocos elementos por plano y márgenes seguros para las interfaces de las redes sociales.
- Mantén los logotipos correctos, sin deformarlos, recolorearlos ni generar versiones parecidas mediante IA. Evita que la generación de vídeo escriba texto dentro de la imagen: compón los textos como capas gráficas nítidas en edición.

### Locución opcional

Voz española natural, cálida y segura, con ritmo publicitario ágil. Texto exacto, sin añadir promesas:

> «¡Supermercados BM ya está en QuéFalta! Descubre sus ofertas, novedades y cambios de precio. Abre QuéFalta y encuentra BM en tu zona.»

La locución debe caber con claridad en 10 segundos. Si compite con los textos en pantalla, prioriza la legibilidad y reduce la locución, no aceleres hasta hacerla difícil de entender.

### Texto en pantalla — respetar literalmente

1. «¡BM ya está en QuéFalta!»
2. «Tu catálogo BM, en la app»
3. «Ofertas · Novedades · Cambios de precio»
4. «Abre QuéFalta y descubre BM»
5. Opcional, en cuerpo pequeño pero legible: «Consulta BM según tu código postal»

### Evitar

No afirmar que BM está disponible en toda España. No prometer que cada código postal tiene idéntico catálogo, precio u oferta. No decir que hay una oferta, novedad o bajada concreta sin comprobarla en los datos actuales de la zona mostrada. No inventar descuentos, precios tachados, temporizadores, testimonios, pantallas, funciones ni resultados de ahorro. No introducir marcas de supermercados competidores. No usar imágenes de productos con etiquetas o envases deformados ni texto generado ilegible. No publicar el vídeo ni conectar cuentas sociales.

### Entrega

Entrega el MP4 final y, si la herramienta lo permite, el proyecto editable y una portada. Exporta H.264 con audio AAC estéreo, 1080 × 1920, 30 o 60 fps constantes, duración exacta de 10 segundos y reproducción optimizada para redes. Revisa el vídeo completo antes de entregarlo: ortografía española, logos, lectura en móvil, sincronía, continuidad del CTA y correspondencia de cualquier dato de producto con la zona y los registros consultados.
