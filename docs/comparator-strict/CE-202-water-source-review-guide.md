# CE-201/202 — Revisión estricta de agua, versión v1

2026-09-03. Capa local `ce202-water-source-review-v1` sobre el corpus CE-200
congelado. Completa la primera anotación de las parejas que quedaban pendientes;
no implementa el comparador, no consulta catálogos actuales y no crea gold.

## Alcance y procedencia

La capa recorre las 771 observaciones usadas por el estrato de agua: 439 de
Carrefour, 85 de Consum, 190 de Mercadona y 57 de Plusfresc. Contrasta los
campos originales disponibles de nombre, denominación, descripción,
ingredientes, conservación, categoría, EAN/GTIN y metadatos de formato. Registra
`null`, campo ausente y contradicción como estados diferentes. La familia de
muestreo y la similitud previa no se usan como verdad.

Se registran 520 aguas potables simples dentro del piloto y 251 observaciones
fuera de ese alcance: aguas saborizadas, bebidas/refrescos, agua de coco,
destilada, agua de mar o azahar, zumos, cosmética, perfumería, alimentos,
destilados y otros confusores léxicos. La exclusión solo afecta a este piloto;
no despublica el producto de la app.

Es una primera revisión asistida de fuentes y composición determinista de
parejas, identificada como tal. No es una revisión humana individual de cada
pareja ni el extractor de producción futuro de CE-300–308.

## Clase, gas, sabor y aditivos

- La clase de agua se conserva únicamente cuando consta en la ficha: mineral
  natural, mineral, manantial o seltz/soda. Una marca no completa la clase.
- `con gas` y `sin gas` son opuestos estrictos. Carbonatada, carbónica, seltz y
  gas carbónico añadido acreditan gas; bicarbonatos de un análisis mineral no.
- Un nombre sin «con gas» no demuestra que sea agua sin gas. Consum y
  Plusfresc sí aportan categorías explícitas con/sin gas; la categoría genérica
  `Agua` de Mercadona y `Aguas y Zumos` de Carrefour no lo hacen.
- Limón, lima, naranja, mango, melocotón, manzana, fresa, frambuesa, sandía,
  piña, pomelo y otros perfiles se conservan como sabores. «Sabor intenso» en
  Saint George describe intensidad de la carbonatación, no un aroma añadido.
- Azúcar añadido, edulcorantes, zumo, acidulantes, aromas, vitaminas y extractos
  funcionales son señales independientes. «Sin azúcar» no equivale a «sin
  azúcares añadidos» y ninguna de las dos elimina una lista contradictoria.
- Mineralización muy débil/débil, sodio, magnesio y alcalinidad son
  declaraciones relevantes; la composición mineral analítica no se convierte
  en aditivo.
- Tapón infantil, sport, kids, toy, junior o trekking se conserva como variante
  comercial. La ausencia de esos términos no acredita cierre estándar.

Para aceptar `variants=compatible` deben conocerse y coincidir los atributos
obligatorios, o existir un GTIN global válido idéntico, formato exacto y ninguna
oposición documental. Un GTIN nunca prevalece ante formato o variante
contradictorios.

## Formato exacto

Se exige conteo, volumen por envase, volumen total y forma de envase. Botella,
garrafa, lata, cartón, sifón y bag-in-box no son formatos intercambiables.

- 1 L equivale exactamente a 1.000 ml, pero no a 1,5 L.
- Una botella de 1,5 L no equivale a 6×1,5 L ni a una garrafa de 1,5 L.
- Una cantidad aislada no permite asumir un envase. El precio por litro no se
  usa para reconstruir volumen o conteo.
- Los metadatos fijos de Mercadona acreditan botella o pack solo cuando el modo
  de venta no es aproximado y la aritmética es exacta.
- En Plusfresc, una referencia con opción unidad/pack queda sin formato activo
  hasta conocer qué opción corresponde al precio y al resultado mostrado.
- Cantidades o envases incompatibles dentro de la misma ficha producen
  `conflicting`; no se elige la fuente más conveniente.

Ocho observaciones conservan disputa explícita. Entre ellas: Plusfresc 007307
enfrenta 6×150 cl con una descripción de 300 ml; 014934 enfrenta 1 L con 75 cl;
032380 enfrenta categoría sin gas con descripción de agua con gas; 029934
enfrenta Ribes con Font Agudes. Carrefour `prod170182` conserva literalmente
1,25 cl sin autocorregirlo a litros. Dos Aquabona omiten gas en el título, pero
su denominación declara gas carbónico añadido. El aloe Goya conserva el
conflicto entre «sin azúcar» y sus ingredientes con azúcar/jarabe.

## Positivo íntegro respaldado

La pareja `consum:2569879` ↔ `mercadona:27232` queda como equivalencia de
producto demostrada:

- ambos registros contienen el GTIN global válido `3700123300014`;
- Consum declara Agua Mineral Natural Aquarel, botella de 1,5 L, en la categoría
  original de agua sin gas;
- Mercadona declara Agua mineral Nestlé Aquarel, botella fija de 1,5 L;
- conteo 1, volumen unitario 1.500 ml, total 1.500 ml y envase botella coinciden;
- no hay declaración contradictoria entre las dos observaciones.

La coincidencia certifica la misma referencia comercial en estas observaciones,
no disponibilidad ni ahorro. El resultado final sigue en `abstain`: el corpus
no acredita precio dirigido, servicio del código postal, stock bilateral y
revisiones activas conjuntas. No se convierte el precio global coincidente en
una prueba local.

## Cierre y límites

Las 2.485 composiciones de agua aportan 2.483 parejas nuevas; E11 y E16 ya
tenían una propuesta y no se duplican. La unión llega a 6.000/6.000 primeras
anotaciones. Con positivos, negativos difíciles, desconocidos, citas y las ocho
dimensiones separadas, CE-201 y CE-202 quedan completas como primera pasada.

Esto no cierra CE-203, no crea gold y no acepta G2. El propietario debe revisar
un 20 % aleatorio y todas las disputas en una capa independiente y ciega a las
propuestas. Después siguen particiones por entidad, holdout y evaluación del
motor. Continúa FR-02: productos activos y revisiones, sin TTL artificial de
24 horas.

No se necesita una integración nueva para esta lectura offline. Supabase ya
dispone de los componentes necesarios para las fases posteriores; enriquecer
con otra fuente, OCR o modelo solo tendría sentido si una laguna medida lo
justifica y conserva licencia, coste, procedencia y revisión.

