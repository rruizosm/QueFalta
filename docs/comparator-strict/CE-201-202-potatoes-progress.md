# CE-201/202 — Primera anotación del bloque de patatas

2026-09-03. Avance autorizado por «Okey, continua». **CE-201/202 siguen en
curso; se completa la primera anotación del bloque de patatas, no G2.**

## Resultado y estado exacto

Se han contrastado las fuentes de **146 referencias**: 53 patatas congeladas
y 93 confusores. De esos hechos editoriales se han compuesto las **922 parejas
del bloque**, ligadas a las mismas observaciones y fuentes. Es una primera
anotación asistida por reutilización de evidencia, **no 922 revisiones humanas
individuales ni una segunda revisión**. No son borradores promovidos sin lectura.

| Propuesta del bloque | Parejas |
|---|---:|
| Rechazar por incompatibilidad demostrada | 319 |
| Excluir por familia/uso fuera del piloto | 104 |
| Abstenerse por evidencia insuficiente | 499 |
| Total de parejas anotadas | 922 |

Los 93 confusores se revisan hasta el criterio de exclusión; no se pretende haber
verificado su receta, formato y comercio íntegros. Las 53 fichas de congelados
incluyen revisión de atributos y formato, con desconocidos explícitos.

Hay **928 parejas distintas con primera anotación dentro del corpus**: 922 de
este lote y 7 editoriales anteriores, descontando el solapamiento E09. E09
mantiene estados y decisión. Quedan **5.072**: **2.589 de yogur** y **2.483 de
agua**. Los 13 retos editoriales complementarios siguen fuera del denominador.
Se mantienen 6.000 parejas, 1.200 Q y 600 orígenes; 1.844 contextos CP de este
lote son evaluaciones correlacionadas, no búsquedas nuevas.

CE-201 sigue abierta porque faltan positivos íntegros respaldados y cobertura
de las otras familias. CE-202 sigue abierta por la primera anotación pendiente.
Tu segunda revisión CE-203 sigue pendiente: 20 % aleatorio y disputas, con
evidencia ciega antes de mostrar propuestas. No se ha sorteado ni simulado.

## Evidencia entregada

- [Dossier legible de las 146 referencias](dataset/label-potatoes-v1/review.md).
- [Fichas con hechos, desconocidos, citas y presencia de campos](dataset/label-potatoes-v1/products.json).
- [Índice de las 922 parejas](dataset/label-potatoes-v1/index.json).
- [Informe y recuentos reproducibles](dataset/label-potatoes-v1/report.json)
  y [manifiesto de integridad](dataset/label-potatoes-v1/manifest.json).
- [Guía de reutilización de evidencia](CE-202-source-review-reuse-guide.md).
- [Evidencia de verificación de este avance](CE-201-202-potatoes-evidence.json).

El preanotador, las 20 editoriales y su [informe anterior](CE-201-202-corpus-progress.md)
permanecen congelados. Sus 5.993 pendientes describen ese momento anterior;
el estado vigente es este documento. También se conservan semilla, extracción,
muestreo, pesos y fuentes originales. Ningún producto se elimina de la app.

## Qué ha cambiado tras leer las fuentes

**402 propuestas de decisión difieren del borrador anterior**: 303 abstenciones
pasan a rechazo por evidencia, 95 a exclusión y 4 rechazos a exclusión. Otras
499 siguen abstención, 16 rechazo y 5 exclusión. Esta diferencia demuestra
trabajo de anotación, **no una mejora de precisión del motor medida en producción**.

1. **Rebozado es una variante relevante.** Golden Long declara explícitamente
   que no tiene rebozado, mientras Chef Gourmet y otras referencias sí lo
   declaran. Se identifican 10 parejas con esa oposición. Una lista que no
   menciona rebozado no basta para etiquetar su ausencia.
2. **Forma, matriz y grosor se separan.** Las caras sonrientes son puré moldeado;
   bolitas y letras son preparados, no patata entera cortada. Hay 12 diferencias
   de forma y 8 fino/grueso. «Rústico», «grande», «casero» u «ondulado» no se
   normalizan automáticamente a un grosor. «Crispy Pops» no demuestra bolitas.
3. **Mismo nombre puede ocultar otra conservación.** Consum `7393366` es
   «Patatas Bravas» de congelados y `7443120` es «Patatas Bravas» de preparados
   refrigerados. Nombre ordenado o embedding parecido no acredita equivalencia.
4. **Congelado no significa misma identidad.** Una tortilla, un revuelto con
   salchichas o verduras con patata siguen siendo platos/mezclas fuera del
   piloto, aunque se vendan congelados. No confundirlo con despublicarlos.
5. **La cantidad debe conservar su papel.** Ocho fichas acreditan un paquete
   nominal individual; las otras 45 congeladas aportan masa nominal, pero no
   toda la estructura. Hay 293 parejas con formato incompatible demostrado.
   Una bolsa de 2 kg no coincide con la referencia nominal de 1 kg/500 g; no
   se multiplican compras. Dos masas aisladas diferentes, sin papel unidad/total,
   tampoco justifican inventar la estructura de ambas.
6. **Formato positivo no es equivalente positivo.** Solo dos parejas acreditan
   formato completo igual: Mercadona `61421` frente a Plusfresc `010985` y
   `019865`, una bolsa/paquete de 1 kg. Ambas se abstienen por otros atributos
   y comercio. En ARTIQ aparece «corte gueso»: se conserva la errata, no se
   convierte silenciosamente en una certificación de corte grueso.
7. **La ausencia es específica de la proyección.** Consum no trae ingredientes
   en estas filas; Mercadona los trae nulos; algunas fichas Carrefour sí tienen
   detalle suficiente para resolver corte y rebozado. No afirmar que el
   supermercado carece del dato ni completar desde una marca/GTIN ajenos.

Los motivos pueden coexistir; no sumar cifras de formato/variante como parejas
distintas. Cero equivalentes íntegros o ahorros aprobados en este lote no prueba
que no existan en el catálogo, y no cambia CU-01: el uso solo se consume con al
menos un equivalente válido más económico incluido en una respuesta correcta.

## Consecuencias para las siguientes fases e integraciones

- F3 deberá separar corte/forma/grosor, patata cortada/preparado, piel,
  prefritura, rebozado, condimentos y declaraciones. Estas anotaciones no son
  el diccionario ejecutable ni la implementación de CE-300–308.
- Separar **envases interiores, cantidad por envase, total y opción de venta**.
  `sell_pack_unit`, el mínimo de compra o una caja logística no certifican por
  sí solos el contenido del pack. Sin esa distinción se pueden inventar ahorros.
- La prioridad de enriquecimiento es la procedencia y el contenido de las
  fichas: revisar las proyecciones/adaptadores actuales y la unión entre ficha,
  GTIN y pack comercial. Después, si siguen faltando datos, evaluar ampliar el
  OFF existente o lectura de etiqueta, con coste/calidad/procedencia medidos.
  No propagar atributos entre tiendas sin validar producto, formato y revisión.
- **No hace falta instalar una nueva integración para este avance.** Otro
  buscador o reranker no demuestra cantidades, rebozado ni stock. OFF tampoco
  verifica el CP, precio o disponibilidad. No se ha instalado ni contratado nada.
- Precio, disponibilidad y revisiones siguen separados por CP/canal. No se
  impone TTL de 24 h ni se usa el reloj de anotación como fecha del catálogo.

La guía de Supabase mantuvo este trabajo sobre la extracción local validada:
**cero consultas al proyecto, cero DDL/DML o cambios de producción**, sin nuevas
contrataciones. El comparador publicado, los embeddings y los syncs no se han
modificado en este avance. No se ha vuelto a consultar la salud remota.

## Orden exacto para retomar

1. Continuar primera revisión de **yogures (2.589 pendientes)**: subtipo,
   especie/base, sabores y mezclas, grasa, azúcar añadido, edulcorantes,
   declaraciones y estructura real del pack. No natural→sin azúcar por defecto.
2. Continuar **aguas (2.483 pendientes)**: clase, gas, sabor/aditivos,
   declaraciones, envase y multipack. No GTIN→equivalencia automática.
3. Recoger positivos íntegros realmente respaldados o precisar las carencias
   de evidencia que impiden acreditarlos. No convertir dos formatos coincidentes
   o casos sintéticos en equivalentes gold para cerrar CE-201.
4. Cuando esté completa esa primera pasada, preparar CE-203 para el propietario
   y seguir CE-204–208. No saltar G2 ni activar el motor por pasar tests.

Comandos locales, sin credenciales ni red:

```sh
node scripts/prepare-comparator-strict-potato-review.mjs --artifact=report
node scripts/prepare-comparator-strict-potato-review.mjs --artifact=annotations --offset=0 --limit=20
node --test scripts/lib/comparator-strict-potato-review.test.mjs scripts/tests/comparator-strict-potato-review-evidence.test.mjs
npm run quality
```

Las pruebas verifican integridad, composición y regresiones; no sustituyen la
revisión semántica independiente ni miden precisión/recall del comparador.

Verificación final: `npm run quality` **PASS**, TypeScript y lint sin errores,
**462/462 tests correctos** (28 nuevos), cero fallos/omitidos. `git diff --check`
sin incidencias. Las pruebas comprueban que todas las fuentes y archivos del
avance anterior siguen idénticos a sus hashes; los cuatro archivos protegidos
del cliente/operación conservan también sus huellas iniciales. Cambios locales
sin commit, push, despliegue ni activación del comparador.
