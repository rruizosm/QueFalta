# CE-202 — Guía de etiquetado por dimensiones

Versión `ce202-v1`, 2026-09-03. **Guía y piloto local; CE-202 no completada.**
Desarrolla [D01–D14/CU-01](decisions.md) y [FR-02](freshness-policy.md), no cambia
el contrato ni implementa un parser/motor. El diccionario definitivo por familia
y los extractores corresponden a CE-300–308.

## 1. Unidad de trabajo y evidencia

Una pareja comercial es no ordenada, pero **el ahorro tiene dirección**.
La anotación identifica origen, candidato, observaciones exactas, CP, canal y
reloj de referencia. Cambiar CP o invertir origen no crea una nueva pareja
independiente para CE-200. El precio del origen también debe estar verificado.

Cada afirmación debe conservar:

- Producto y tienda, sin quitar ceros iniciales de los IDs.
- Observación y hash del registro original; archivo de procedencia y hash
  disponibles en `seed-v1/products.json` y en el manifiesto del lote.
- Campo y valor original completos, no una frase reconstruida o una predicción.
- Razonamiento específico: qué demuestra y qué **no** demuestra esa evidencia.
- Fecha de captura separada de la fecha del retailer/sync y de la revisión.
  No rejuvenecer una observación al generar o revisar el documento.

Los estados del campo fuente siguen siendo `known`, `unknown` o `conflicting`.
Una columna no seleccionada, una columna ausente, `null` y un dato contradictorio
no significan lo mismo. Este snapshot tiene una proyección limitada: un `null`
no demuestra por sí mismo que el retailer no disponga del dato.

Las relaciones de pareja son `compatible`, `incompatible`, `unknown` o
`conflicting`. Para precio son `cheaper`, `equal_or_higher`, `invalid`, `unknown`
o `conflicting`. El contrato del piloto no admite `false` o `not_applicable`
como sustituto de una relación obligatoria desconocida.

## 2. Dimensiones independientes

| Dimensión | Evidencia necesaria antes de marcarla compatible |
|---|---|
| `scope` | Ambos productos pertenecen a una familia y modo de venta admitidos en el piloto |
| `identity` | Familia real y subtipo/uso compatibles; no basta compartir una palabra o marca |
| `variants` | Todos los atributos obligatorios aplicables, conocidos y compatibles; desglose en el razonamiento |
| `format` | Modo fijo, número de envases, contenido nominal por envase, dimensión de unidad, total y composición compatibles |
| `price` | Precio total EUR válido, misma base comercial/formato, dirección origen→candidato y condiciones aplicables |
| `location` | Origen y candidato con evidencia de precio/servicio para el CP y canal solicitados |
| `availability` | Disponibilidad demostrada en ese ámbito; `published=true` no sustituye stock |
| `catalog` | Publicación y revisiones compatibles de producto/perfil/precio/ámbito al reloj del caso |

La variante debe examinarse atributo por atributo. Mientras falte cualquiera
obligatorio, la relación global no se marca compatible. La siguiente lista es
una lista de revisión del contrato ya aprobado, no la taxonomía ejecutable F3:

| Familia | Lista mínima para revisar variantes/identidad |
|---|---|
| Agua | Clase, gas, sabor, aditivos y declaraciones relevantes |
| Yogur | Griego/estándar/líquido u otro subtipo; base y especie; sabor y mezcla; grasa; azúcar añadido; edulcorantes; declaraciones relevantes |
| Patatas congeladas | Conservación congelada; preparación/prefrita-cruda; corte; piel; condimentación y variantes relevantes |

No aplica a un **atributo** solo cuando la política explícita de esa familia lo
permita; no sirve para aprobar una dimensión incompleta. Si todavía no existe
política suficiente, mantener desconocido. Las exclusiones del piloto no
despublican productos de la aplicación ni cambian el comparador legacy.

## 3. Criterios estrictos y errores que evitar

- **Orden de palabras:** «yogur griego» y «griego yogur» pueden ser equivalentes
  cuando el resto está verificado. No ordenar tokens eliminando negaciones.
- **Endulzado:** natural no significa sin azúcar añadido. Azúcar añadido,
  azúcares totales, edulcorantes y declaraciones son conceptos distintos.
  «Sin azúcares añadidos» y «sin azúcar» no son etiquetas intercambiables.
  La tabla nutricional, por sí sola, no resuelve si se añadió azúcar.
- **Cantidades:** 1 L = 1000 ml; 2 kg = 2000 g. Exigir además estructura igual.
  No admitir tolerancias nominales: 6×125 g no equivale a 6×124 g.
- **Multipacks:** 6×125 g no equivale a 3×250 g, una tarrina de 750 g o 8×125 g.
  2 kg en una bolsa no equivale a dos bolsas de 1 kg. No deducir composición
  del peso total ni asumir un envase por defecto al fallar la extracción.
- **Cantidad parcial:** que ambos títulos mencionen 33 cl solo verifica esa
  coincidencia textual; no toda la firma ni el gas, sabor, stock o precio.
- **Unidades:** no convertir kg en L sin evidencia específica; el piloto se
  abstiene. Nunca obtener el peso nominal dividiendo precio entre €/kg.
- **Familia:** yogur como ingrediente/sabor de galletas no las convierte en
  yogur. Agua de colonia/filtros/spray nasal y peladores son ruido léxico.
- **Congelación:** prefrita no demuestra congelada; ausencia de esa palabra
  tampoco demuestra fresca. No completar una conservación que no se exportó.
- **GTIN:** distinguir pack comercial de código nutricional de una unidad.
  Un GTIN igual con formato contradictorio es conflicto, no permiso de aceptar.
- **Peso variable/carne/embutidos:** fuera del piloto. Comparar €/kg no elimina
  la exclusión ni convierte pesos aproximados en nominales fijos.
- **Precio/zona:** un detalle global, el CP de referencia de una provincia o un
  dato `published` no certifican precio/servicio/stock en 08006 o 25001.
- **Vigencia:** usar catálogo activo/revisiones, sin TTL de 24 h ni de siete
  días. Respetar bajas, agotados, promociones vencidas y versiones contradictorias.
  Un sync parcial/fallido no prueba nuevas observaciones ni bajas por ausencia.

Se puede demostrar una incompatibilidad con un dato concreto y mantener otras
dimensiones desconocidas. Ejemplo R20: ocho yogures frente a cuatro permite
rechazar por pack; no permite decir que «natural» es sin azúcar. No etiquetar
todas las columnas como negativas porque la decisión final sea rechazar.

## 4. Decisión final y qué significa

El comprobador offline verifica esta coherencia **entre etiquetas introducidas**:

1. Si hay conflicto, `abstain`: registrar las evidencias enfrentadas.
2. Si consta exclusión de alcance, `excluded_scope`.
3. Si hay una incompatibilidad demostrada o precio inválido, `rejected`, aun
   conservando las demás lagunas. Nunca convierte esas lagunas en datos conocidos.
4. Si falta alguna dimensión obligatoria, `abstain`.
5. Todas compatibles y precio menor: `eligible_saving`.
6. Todas compatibles y precio igual/mayor: `equivalent_no_saving`.

Son etiquetas de **pareja**, no estados completos de la consulta ni órdenes para
descontar usos. CU-01 requiere una respuesta final correcta con al menos una
alternativa elegible incluida; errores/pendientes, reintentos y carreras tienen
pruebas propias CE-207/607/610. No afirmar mínimo de todo el mercado ni que no
existe equivalente a partir de una muestra incompleta. `unknown` revisado es
distinto de un registro todavía no revisado con etiqueta `null`.

## 5. Propuestas, revisión humana y conjunto de verdad

El [lote de 22 parejas](dataset/label-pilot-v1/review.md) está marcado como
`assistant_proposal`, `awaiting_independent_review`, `gold_eligible=false`.
**No ha sido revisado por el propietario ni es el 20 % aleatorio CE-203.**
Su elección manual y exposición previa impiden tratarlo como muestra confirmatoria
o futuro holdout limpio. Sirve para ensayar la guía y localizar faltas de evidencia.

Procedimiento al completar el corpus:

1. Congelar primero marco/diseño de muestreo de los datos confirmatorios CE-200.
   Este lote histórico se mantiene separado; no altera los pesos de ese diseño.
2. Primera anotación independiente de scores, ranking y predicciones del motor.
   Una propuesta asistida debe identificarse como tal; no fingir autoría humana.
3. En CE-203 seleccionar aleatoriamente el 20 % del corpus elegible con semilla
   registrada y añadir todos los disputados. El propietario hará esa revisión,
   como ya acordó; no es necesario volver a pedirle que asuma esa tarea.
4. Para la segunda pasada mostrar primero evidencia y formulario sin propuestas
   ni predicciones; después confrontar opiniones. Este resumen con propuestas
   es exploratorio, **no una interfaz ciega de segunda revisión**.
5. Guardar revisiones separadas y trazables: quién/revisión seudónima, fecha,
   campos cambiados, motivo, fuentes y vínculo a propuesta. No sobrescribirla
   ni añadir datos personales innecesarios al dataset versionado.
6. Resolver diferencias con evidencia y arbitraje independiente de predicciones.
   Si la evidencia no permite resolver, mantener `unknown/conflicting`.
7. CE-204/205 fijarán particiones por entidad/exposición y holdout. Ni estas
   propuestas ni los casos sintéticos pasan automáticamente a gold/holdout.

El validador actual es intencionadamente un validador de **propuestas del seed**:
no admite falsificar revisión humana ni ascenderlas a gold. Un flujo de revisión
real requerirá un contrato separado en CE-203, no desactivar estas restricciones.

## 6. Casos sintéticos y reutilización de F1

[56 casos de contrato](dataset/label-pilot-v1/contracts.json): reutilizan los
32 originales de CE-104, con 24 ampliaciones. Los positivos tienen premisas
hipotéticas explícitas de todos los atributos/formatos/comercio; no se han
inventado productos de supermercado ni evidencias de disponibilidad.

Dos precisiones versionadas conservan el original:

- `yogurt-natural-sweetened`: para demostrar rechazo, S07 añade explícitamente
  ausencia de azúcar añadido en origen. Sin esa evidencia, S34 se abstiene.
- `same-ean-conflicting-format`: el antiguo `not_equivalent` impedía mostrarlo;
  S24 ahora distingue el conflicto y la abstención de un negativo inequívoco.

Los casos referencian T01–T29 y algunos supuestos de T30/T31. Eso **no acredita
tests ejecutables de cuota/carreras/caché CE-207 ni replay de eventos CE-208**.
Las pruebas actuales comprueban estructura, procedencia y coherencia de etiquetas,
no ejecutan un parser de F3 ni miden respuestas del motor antiguo/nuevo.

## 7. Reproducción y límites del validador

```sh
node scripts/prepare-comparator-strict-labels.mjs
node scripts/prepare-comparator-strict-labels.mjs --artifact=review
node scripts/prepare-comparator-strict-labels.mjs --artifact=annotations
node --test scripts/lib/comparator-strict-labels.test.mjs
npm run quality
```

CLI con archivos locales explícitos y salida stdout; sin `.env`, red, escritura
automática, RPC comerciales, modelos ni nuevas dependencias. Comprueba el seed
contra el snapshot original antes de usarlo, no solo contra hashes que él mismo
declare. Los artefactos se versionan con hashes en el informe del lote.

Verifica vínculos y citas exactas, dimensiones completas, evidencia bilateral
para compatibilidad, duplicados y coherencia de la decisión. En esta proyección
impide promover precio/ubicación/disponibilidad/revisiones desde los campos
globales. **Una cita auténtica no demuestra que su interpretación sea correcta**:
esa tarea corresponde a la revisión. El comprobador no sustituye fuentes más
completas, arbitraje, extractor, motor, pruebas remotas ni métricas representativas.
