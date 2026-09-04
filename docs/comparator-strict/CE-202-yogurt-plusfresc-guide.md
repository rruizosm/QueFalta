# CE-202 — Capa editorial Plusfresc, yogures v1

2026-09-03. Extiende la cobertura, no reemplaza el
[contrato editorial de yogures](CE-202-yogurt-source-review-guide.md).
No es un parser general F3 ni una modificación del comparador publicado.

## Lectura y reutilización

Se han leído las 219 observaciones Plusfresc del bloque de muestreo yogur:
título, descripción, ingredientes, conservación, formato seleccionado y
árbol original de categorías. Los hechos y cantidades de las tablas se han
transcrito editorialmente después de la lectura, no generado desde borradores.

Idioma de la revisión semántica: español. Ingredientes catalanes no presentes
como texto en este lote; las cinco descripciones catalanas no nulas se leyeron
y la secuencia de cifras de ambos títulos coincide en las 219 referencias.
Eso **no** certifica equivalencia semántica completa entre todos los títulos
en ambos idiomas. Se declara `review_language=es`; no afirmar una revisión
multilingüe exhaustiva. Las fuentes originales con sus otros campos se conservan.

Las 212 fichas de la capa anterior se reutilizan sin modificar ningún byte.
Las nuevas fichas mantienen su contrato de datos y relaciones
`ce202-yogurt-source-review-v1`, con procedencia adicional
`editorial_layer=ce202-yogurt-plusfresc-v1`. La versión del contrato no implica
que se hayan modificado sus archivos: el generador y manifest de esta capa son
independientes. Cada ficha conserva SHA-256 del cuerpo y de la observación.

Solo se componen parejas CE-200 con ambos extremos revisados y al menos un
extremo de esta nueva capa. Se deduplican contra editoriales, patatas y yogur
v1. No se cuentan fichas, contextos postales ni retos complementarios como
parejas nuevas. Las comprobaciones de integridad no sustituyen a CE-203.

## Cantidades: transcripción y comprobación separadas

- `4x120g` o `120gx4` acreditan conteo y cantidad por unidad. Un título con
  una unidad explícita, botella/envase/tarrina/terrina y cantidad puede
  acreditar un envase. Un importe o peso de referencia de precio nunca sirve.
- `4X120` sin unidad no se convierte en 4×120 g porque aparezca 480 g en otro
  campo. No dividir total, inventar unidad ni tomar el número menor como
  conteo. Dos posiciones de conteo sin unidad se han adjudicado explícitamente
  por ID (`016654` y `024113`), sin completar contenido unitario.
- «4 unidades 500 gramos» conserva cuatro y 500 g con papel desconocido.
  «115gr 4 uds.» también deja sin acreditar la relación entre ambos datos.
  Cantidad aislada nunca implica un envase único.
- Un título puede expresar cantidad unitaria: `033682` dice cuatro unidades
  120 gramos y la descripción sí dice 120gx4. No declarar contradicción
  suponiendo que los 120 g del título son el total.
- Una cantidad nominal distinta sin papel (641/600, 550/500, 460/440) se
  conserva como ambigüedad, no como dos totales enfrentados. La firma completa
  permanece desconocida. Si hay dos cantidades aisladas distintas, no elegir
  arbitrariamente una para rechazar otra referencia.
- Se bloquea la selección silenciosa entre masa y volumen. `019933` conserva
  envase único, pero no elige 940 ml o 750 g como firma. `013655` y `034279`
  mantienen conteo sin aprobar masa/volumen. No usar densidad inferida.
- Los conteos seis frente a ocho en `024113` y `036733` son conflictos,
  independientemente de que las unidades de contenido falten o difieran.
- Los surtidos necesitan distribución por receta; no copiar 2+2+2+2 de otro
  SKU. `026477` conserva la segunda lista de ingredientes truncada y
  `033688` la ambigüedad entre mix de sabores y receta fresa-plátano.
- `125G P4` no aprueba automáticamente un pack comercial: posible logística,
  conteo activo desconocido. Un formato de venta alternativo sin seleccionar
  suprime los componentes numéricos activos, conservando las declaraciones.

El lector de literales solo valida las transcripciones seleccionadas. No
produce hechos semánticos ni eleva candidatos a revisión. Toda firma conocida
debe superar comprobaciones de conteo, cantidad y aritmética sin advertencias
pendientes; no basta con que una expresión regular encuentre un tamaño.

## Semántica y conflictos

Se mantienen las reglas de azúcar añadido, azúcares totales, edulcorantes,
grasa, especie y base del contrato previo. «0%» no completa el objeto ausente;
fructosa y edulcorantes pueden coexistir. Oligofructosa no se reconoce como
fructosa por subcadena; lactosa de ingredientes tampoco es automáticamente
una declaración de añadido para endulzar. Una advertencia sobre alergia a
proteína de vaca no completa especie de la base por sí sola.

`027291` conserva conflicto arándanos/frambuesa y `027336`, azucarado/sin
añadido. «Soja» en `012746` no elimina la leche y nata de su receta. La base
mixta soja+coco de `026479` no se representa como soja pura, ni la de coco
`028550` como soja por compartir marca. Ausencia de lácteos requiere evidencia
explícita, no un claim sin lactosa.

Skyr se conserva como subtipo pendiente de homologar; kéfir no se asigna desde
una categoría cercana. Pudding, galleta, premios para mascotas, potito de
frutas y comida completa tienen revisión limitada a alcance. En cambio,
«lemon cheesecake», «muffin arándanos» y «pastel de arándanos» pueden describir
el sabor de una referencia fermentada: no se excluyen por esas palabras solas.
Los perfiles compuestos preservan sus solapamientos; multifrutas no es una
fruta concreta disjunta. No se usa esta capa como clasificador de catálogo.

## Contexto comercial y estado

Se añaden vínculos a las observaciones Plusfresc de los centros 3 y 12 para
los contextos 08006 y 25001 ya documentados. Son trazabilidad, **no** nueva
verificación retailer del mapa ni aprobación de precio/stock/servicio local.
Se conservan también los vínculos Consum del contrato previo. Las cuatro
dimensiones comerciales siguen desconocidas; sin TTL de 24 h ni ahorro calculado.

Primera anotación compuesta desde fuentes, no revisión humana pareja por
pareja, gold ni evaluación de producción. La revisión del propietario sigue
pendiente (20 % aleatorio + disputas), todavía sin sorteo. Este dossier muestra
propuestas y no es el formulario ciego futuro. CE-201/202 y G2 siguen abiertos;
en particular hacen falta positivos íntegros respaldados antes de cerrar CE-201.
