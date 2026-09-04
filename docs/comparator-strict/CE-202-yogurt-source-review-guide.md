# CE-202 — Reutilización editorial de yogures v1

Extiende el mecanismo de [patatas](CE-202-source-review-reuse-guide.md), sin
modificar sus hechos, hashes ni decisiones. Lote incremental, no extractor F3
ni motor de producción. No cambia el contrato CE-1 ni reduce sus gates.

## Alcance de esta versión

Selección explícita de 212 observaciones del bloque de muestreo yogur: todas
las 72 Mercadona y 118 Consum, más 22 Carrefour que cubren conflictos de
endulzado, especies, bases vegetales y surtidos. La selección editorial no es
aleatoria ni representativa del rendimiento; no sirve para calcular precisión.

Las tablas fueron escritas después de leer títulos, descripciones,
denominaciones, ingredientes, conservación, preparación, formato y categorías
originales disponibles. Los campos ausentes y null se conservan por separado.
Las categorías de Mercadona proceden de `raw.categories`; las demás se enlazan
a filas originales de taxonomía. `sampling.family` solo selecciona el bloque.

Cada fuente citada conserva archivo, fila, valor, observación, captura y SHA-256.
Los hechos son editoriales, no promoción de borradores mediante expresiones
regulares. Las comprobaciones numéricas comprueban transcripción, no demuestran
por sí solas la corrección semántica. Solo se componen parejas del corpus con
**ambas** observaciones revisadas. Los cambios posteriores exigirán otra capa
y trazabilidad explícita de las discrepancias, no sobrescribir esta versión.

## Semántica

- Natural es un perfil nominal, no una declaración sin azúcar añadido ni sin
  edulcorantes. Ambos campos y el claim de azúcares totales son independientes.
- Azúcar añadido y edulcorantes pueden coexistir. «0%» sin objeto no resuelve
  ninguno; no usar una categoría desnatado para completar un título ambiguo.
- Grasa del ingrediente no es automáticamente grasa del producto. «Ligero»,
  «desnatado», «0% MG» y «2% MG» no son sinónimos. Esta versión solo opone
  porcentajes explícitos 0 y 2, sin convertir denominaciones en rangos legales.
- Especie es la base láctea nombrada explícitamente en estas fichas, no cualquier
  mención de una especie en un ingrediente. Cabra, oveja y vaca nombradas como
  base difieren; base mixta o no especificada requiere otro estado, nunca vaca
  por defecto. Una coincidencia de especie no aprueba la composición completa.
- Soja como ingrediente no significa exclusivamente vegetal. `milk_presence`
  solo opone leche presente a una declaración explícita sin lácteos. Sin
  lactosa no significa sin leche. No se trasladan recetas entre tiendas.
- Matriz yogur es identidad gruesa. Greek, líquido, bífidus, proteína, lactosa,
  sabor y forma de la fruta se registran aparte. Falta de «griego» no prueba
  estándar; griego y líquido no son identidades excluyentes.
- Dos perfiles nominales de sabor concretos y disjuntos pueden rechazarse.
  Perfiles que se solapan, macedonia, tropical, grupos de frutas, cereales o
  natural no se rechazan solo por desigualdad de tokens. No se eleva la falta
  de mención a ausencia. «Natural» de una base con topping no es sabor simple.
- Bicapa, confitura y topping no son categorías necesariamente disjuntas.
  Sus diferencias se reservan para completar política/evidencia; no se
  convierten en incompatibilidades por una comparación genérica `a != b`.
- Productos explícitamente postre, kéfir, helado, caramelo, tarta, potito de
  frutas o comida completa se excluyen del piloto. Bebida láctea, bífidus sin
  denominación suficiente, petit ambiguo y alternativa fermentada vegetal
  conservan alcance pendiente; marca o proximidad de categoría no bastan.

## Cantidades y surtidos

Transcripción exacta de conteo y cantidad por unidad cuando lo declara la
fuente. Mercadona exige `is_pack`, `approx_size=false`, `selling_method=0` y
consistencia del total. Consum utiliza el formato explícito `N x Y Gr`.
Carrefour usa `N unidades/bolsitas de Y g/ml`; no se interpreta «2 unidades
125 g» como 2×125 g. Cantidad aislada nunca genera `count=1`.

Se comparan conteo, contenido unitario, total y composición. 6×125 g no equivale
a 4×125 g ni a 1×750 g. Masa y volumen no se convierten sin densidad. Un conteo
distinto sigue siendo incompatibilidad independiente aunque los otros datos
estén en g/ml. Dos cantidades sin papel conocido no se rechazan por defecto.

Un pack con sabores no es una receta que mezcla todos esos sabores. Se exige
distribución acreditada para aprobar surtidos; no dividir 4 entre dos sabores
automáticamente. Los dos Danone 8×120 g seleccionados sí declaran 2 unidades de
cada receta en denominación; ambos tienen el mismo total pero distinto surtido.

## Conflictos, comercio y revisión

Carrefour 852100300 conserva `added_sugar=conflicting`: título sin añadido,
denominación azucarada e ingredientes con azúcar/jarabe. Ninguna prioridad de
campos resuelve silenciosamente ese conflicto. 522715570 y 647801823 conservan
azúcar y edulcorantes de denominación, con disputa documental por fructosa no
enumerada en ingredientes. 819115325 conserva composición sin resolver ante
la discordancia mezcla/surtido. Disputas de fuente se mantienen aunque una
dimensión independiente permita rechazar una pareja.

Un EAN compartido no salta variantes/formato; una oposición con EAN coincidente
se conserva como conflicto. Ninguna igualdad parcial aprueba variantes completas:
faltan datos obligatorios y exhaustividad de declaraciones. Cero equivalencias
íntegras en este lote no demuestra que no existan equivalentes en el catálogo.
CE-201 no se puede cerrar sin positivos respaldados; no usar este lote como
política de producción que siempre se abstiene.

Precio, disponibilidad, CP y revisiones siguen separados y pendientes. Sin
TTL de 24 h ni cálculo de ahorro desde precios globales. Se conservan enlaces
a las observaciones locales pertinentes, sin atribuir precisión de CP a una
aproximación provincial. No se consulta ni modifica Supabase para este trabajo.

Autoría: `assistant_source_review_with_deterministic_pair_composition`.
Primera anotación, no revisión humana pareja por pareja. `gold_eligible=false`;
CE-203 sigue a cargo del propietario (20 % aleatorio más disputas), sin sorteo
ni revisión completada. Este dossier visible no es la interfaz ciega futura.
