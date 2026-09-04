# CE-201/202 — Primer lote de yogures y punto de reanudación

2026-09-03 · petición «adelante, continua» · **CE-201/202 EN CURSO**.
Trabajo editorial y comprobaciones locales, sin modificar el comparador publicado.

## Resultado de este avance

212 fichas registradas tras lectura de las fuentes congeladas: **72 Mercadona,
118 Consum y 22 Carrefour**. 198 tienen revisión de atributos/formato; otras
14, revisión suficiente para excluirlas del piloto, sin aprobar sus recetas.
Los hechos quedan vinculados a la observación exacta, no solo al ID del producto.

Con ellas se componen **133 parejas nuevas** del corpus: 92 rechazos propuestos,
2 exclusiones y 39 abstenciones. No son 133 revisiones humanas individuales,
resultados del motor ni etiquetas gold. Solo se cuentan parejas cuyos dos
productos están revisados. El resto del bloque yogur permanece pendiente.

| Medida | Estado |
|---|---:|
| Parejas del corpus CE-200, sin cambiar | 6.000 |
| Consultas/orígenes del corpus, sin cambiar | 1.200 / 600 |
| Primera anotación anterior, patatas + editoriales | 928 |
| Nuevas primeras anotaciones de este lote | 133 |
| Unión de parejas anotadas, sin duplicados | **1.061** |
| Parejas pendientes de yogur | **2.456** |
| Parejas pendientes de agua | **2.483** |
| Total pendiente | **4.939** |
| Nuevas parejas con formato íntegro compatible | 20 |
| Equivalencias completas/ahorros aprobados en el lote | **0 / 0** |
| Revisión independiente/gold | **0 / 0** |

Las dos evaluaciones postales de cada pareja no duplican la muestra. No se
añaden los 13 retos editoriales complementarios al contador del corpus.
No hay solapamiento con las siete anotaciones editoriales anteriores ni con
las 922 del bloque patatas. Sus artefactos y hashes permanecen intactos.

## Hallazgos y decisiones editoriales

1. **Contradicción real de azúcar añadido.** Carrefour `852100300` anuncia
   bífidus de kiwi sin azúcar añadido; la denominación dice azucarada y los
   ingredientes contienen azúcar y jarabe. Se registra conflicto, no una
   elección silenciosa del campo preferido. Afecta a cuatro parejas de este
   lote, que se abstienen incluso cuando el formato también difiere.
2. **Natural no define el endulzado.** Natural, azucarado y edulcorado no son
   tres sabores mutuamente excluyentes. Mercadona `20221` declara natural,
   edulcorado y 0 % azúcares añadidos simultáneamente. Un natural sin más datos
   no se convierte automáticamente en «sin añadido» ni «sin edulcorantes».
3. **Azúcar y edulcorantes pueden coexistir.** Carrefour `522715570` y
   `647801823` declaran fructosa y edulcorantes en denominación, pero la lista
   adquirida no enumera fructosa. Se conservan los claims y la disputa
   documental; la omisión no demuestra ausencia. No copiar resolución entre SKUs.
4. **0 % sin objeto es insuficiente.** En Consum aparecen `0%`, `00%` y
   `0%0%` sin especificar azúcar o grasa. Se mantienen desconocidos esos
   atributos. Tampoco se convierte «ligero» en 0 % MG, ni la grasa de un
   ingrediente en el contenido graso del yogur terminado.
5. **Soja no implica sin lácteos.** Carrefour `521029633` declara leche
   fermentada con soja y contiene leche/nata. Consum `7031974`, de nombre
   parecido, no recibe su receta por herencia: sus ingredientes no están en
   la proyección. Alpro `VC4AECOMM-004276` sí declara expresamente sin lácteos.
   Sin lactosa no se utiliza para demostrar ausencia de leche.
6. **Cantidad, unidad y número de envases son puertas diferentes.** Se
   conserva 6×125 g distinto de 4×125 g y de un envase único de 750 g.
   Carrefour `VC4AECOMM-084930` dice «2 unidades 125 g» sin aclarar el papel
   de la cantidad; no se inventa 250 g totales. `653701722` sí acredita
   cuatro bolsitas de 70 g. Una cantidad aislada no genera un envase único.
7. **Surtido no es mezcla.** `804987724` tiene dos recetas alternativas;
   no se asume reparto 6+6. `819115325` tiene discordancia de mezcla/surtido
   entre denominación e ingredientes y queda pendiente. Los Danone
   `521029416`/`521029418` sí detallan dos unidades de cada receta: ambos
   son 8×120 g, pero no el mismo surtido. Formato total igual no basta.
8. **Especie, sabor, base y complementos se separan.** Cabra/oveja/vaca
   solo donde la base está nombrada. No se deduce vaca de «leche» genérica.
   Natural con cereales/fresas o coco/almendras/chocolate no se reduce a
   natural simple. «Stracciatell» truncado permanece por resolver. Las
   clases amplias de fruta y perfiles que se solapan no se rechazan por
   una simple desigualdad de palabras.
9. **Vecindad de categoría no es identidad.** Hay helado, caramelo y tarta
   con sabor yogur y kéfir junto a yogures. Se excluyen los ajenos demostrados;
   bebidas lácteas, bífidus, petit o alternativas vegetales de subtipo
   insuficiente conservan alcance pendiente, no una clasificación inventada.

Hay **cuatro fichas con disputa documental**, vinculadas a 15 parejas. Las
disputas permanecen visibles aunque otra dimensión independiente permita un
rechazo. Es un subconjunto a revisar, no el sorteo CE-203 ya realizado.

Frente a los borradores intactos cambian **30 propuestas de decisión**:
28 abstenciones pasan a rechazo, una a exclusión y un rechazo a abstención.
Este último es `852100300` frente a Consum `7371029`: el conflicto semántico
tiene prioridad sobre el rechazo por formato. No son 30 errores del motor
corregidos: se compara anotación editorial con borradores, no con producción.

## Archivos y reproducción

- [Guía editorial de yogures](CE-202-yogurt-source-review-guide.md).
- [Dossier legible](dataset/label-yogurt-v1/review.md),
  [212 fichas con citas](dataset/label-yogurt-v1/products.json),
  [índice de parejas](dataset/label-yogurt-v1/index.json),
  [informe](dataset/label-yogurt-v1/report.json) y
  [manifest](dataset/label-yogurt-v1/manifest.json).
- [Recibo de evidencia y validación](CE-201-202-yogurt-evidence.json).
- [Especificaciones editoriales](../../scripts/lib/comparator-strict-yogurt-review-specs.mjs)
  y [composición reproducible](../../scripts/lib/comparator-strict-yogurt-review.mjs).

```sh
node scripts/prepare-comparator-strict-yogurt-review.mjs --artifact=report
node scripts/prepare-comparator-strict-yogurt-review.mjs --artifact=annotations --offset=0 --limit=20
node --test scripts/lib/comparator-strict-yogurt-review.test.mjs scripts/tests/comparator-strict-yogurt-review-evidence.test.mjs
npm run quality
```

Validación observada: TypeScript y lint PASS, **497/497 tests PASS**; 35 nuevos
(30 de hechos/composición y cinco de evidencia/reproducción). Se comprueban
valores originales, hashes de fichas y taxonomías, vigencia de observación,
conteos, unidades, conflictos, falta de atributos, ausencia de gold y
preservación byte a byte de las capas anteriores. Pasar tests comprueba
consistencia/reproducción, no sustituye la validación humana de interpretaciones.

## Límites y siguiente paso exacto

Este lote no resuelve receta completa ni ámbitos comerciales. Los 20 formatos
compatibles no son 20 equivalencias aprobadas. Faltan atributos obligatorios
y positivos íntegros respaldados; **CE-201 no puede cerrarse con cero positivos**.
Tampoco se puede presentar la abstención sistemática como mejora desplegable.
No demuestra que falten equivalentes en el catálogo, solo que este lote no
los acredita todavía con todos los campos exigidos.

1. Ampliar la revisión de fuentes de yogur: quedan **764 observaciones** sin
   ficha editorial en esta capa (**545 Carrefour y 219 Plusfresc**). La lectura
   preliminar de otras fichas Carrefour no cuenta como ficha aprobada ni pareja
   anotada: requiere transcripción y contraste de sus hechos. Mercadona y
   Consum del bloque ya están en el registro; no repetir su lectura completa
   salvo disputa o cambio de fuente.
2. Crear una capa incremental versionada para las nuevas fichas y componer
   las parejas adicionales cuyos extremos estén revisados. Reutilizar las
   212 fichas solo para su misma observación; no modificar esta capa congelada
   ni sumar parejas ya contadas. Restan **2.456 parejas de yogur**.
3. Continuar después las **2.483 parejas de agua**, con clase/gas/sabor/
   aditivos y formato exacto. No reextraer CE-200 ni repetir canarios cerrados.
4. Completar positivos y cobertura exigida por CE-201 con evidencia suficiente;
   los campos faltantes no se arreglan asignando defaults ni pidiendo a un
   modelo que adivine. Si la proyección resulta insuficiente, concretar el
   enriquecimiento necesario antes de ampliar fuentes/alcance.
5. CE-203: revisión del propietario, 20 % aleatorio y disputas, aún sin
   sorteo ni revisión completada. No sustituirla por esta primera anotación.
   Después siguen CE-204–208 y G2, sin saltar fases.

No se consultó el proyecto Supabase ni retailers, ni se cambiaron SQL, app,
cron, syncs, embeddings, flags o servicios. Sin nuevas integraciones, contratos
ni recursos de pago. La guía de Supabase se consultó para mantener el trabajo
local acotado; no se volvió a medir salud de producción ni se afirma estabilidad
actual desde un snapshot histórico. Se mantiene FR-02: catálogo activo y
revisiones, **sin caducidad comercial de 24 h**.

Se conservan el [cierre de CE-200](CE-200-closure.md), el
[avance previo de patatas](CE-201-202-potatoes-progress.md) y sus respectivos
recibos, sin reescribir sus contadores históricos. Cambios locales sin commit
ni push; no revertir trabajo ajeno del árbol sucio.
