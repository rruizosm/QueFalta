# CE-201/202 — Yogures Plusfresc y punto de reanudación

2026-09-03 · petición «adelante» · **CE-201/202 EN CURSO**.
Trabajo editorial y herramientas locales. No cambia el comparador publicado.

## Resultado del lote

Registradas las **219 observaciones Plusfresc** del bloque congelado de yogur:
207 revisadas por identidad, atributos y formato; 12 por exclusión de alcance,
sin aprobar la receta de productos ajenos al piloto. Revisión semántica en
español, no certificación multilingüe exhaustiva. Cada hecho conserva la
observación, captura, campo, valor original, taxonomía y huellas de la fuente.

Se reutilizan sin editar las 212 fichas del primer lote de yogur. Con ambos
extremos revisados se componen **449 parejas nuevas**: 271 rechazos propuestos,
23 exclusiones y 155 abstenciones. No son revisiones humanas individuales,
etiquetas gold ni resultados del motor de producción.

| Medida | Estado |
|---|---:|
| Corpus CE-200, intacto | 6.000 parejas / 1.200 consultas / 600 orígenes |
| Primera anotación anterior | 1.061 parejas |
| Parejas nuevas de este lote | 449 |
| Unión acumulada, sin duplicados | **1.510** |
| Pendientes de yogur | **2.007** |
| Pendientes de agua | **2.483** |
| Total pendiente | **4.490** |
| Fichas de yogur registradas entre ambas capas | 431 |
| Fichas del bloque yogur todavía sin registro | **545 Carrefour** |
| Nuevas parejas con formato íntegro compatible | 25 |
| Equivalencias completas / ahorros aprobados en este lote | **0 / 0** |
| Revisión independiente / gold | **0 / 0** |

Las evaluaciones en dos códigos postales no duplican parejas. No se añaden
los 13 retos editoriales complementarios al contador del corpus. No hay
solapamientos con anotaciones previas; las fuentes, borradores y capas
anteriores mantienen sus archivos y hashes originales.

## Problemas reales conservados en la evidencia

1. **Arándanos frente a frambuesa:** `027291` declara arándanos en el título,
   pero frambuesa en descripción e ingredientes. Queda en conflicto, sin
   elegir automáticamente un campo ganador ni compararlo como sabor seguro.
2. **Azucarado frente a sin añadido:** `027336` mezcla esas declaraciones.
   Se conserva el conflicto de añadido y, por separado, los edulcorantes y
   0 % MG explícitos. La descripción adquirida está truncada: no completarla.
3. **Seis frente a ocho envases:** `024113` y `036733` tienen conteos
   incompatibles entre campos. No resolverlos por el total aparentemente
   más plausible. La falta de unidad en `8X100` no borra el conflicto de conteo.
4. **Cantidad unitaria, total y datos incompletos:** 4X120 sin unidad no se
   convierte en 4×120 g por aparecer 480 g en otro campo. «4 unidades 120 g»
   tampoco es automáticamente 120 g totales: `033682` sí aclara 120gx4 en
   descripción; `033681` no aporta esa relación. Diferencias como 550/500 g
   sin papel declarado se mantienen ambiguas, no como dos totales confirmados.
5. **Masa y volumen:** `019933` dice envase de 940 ml y botella de 750 g.
   Se conserva un envase, pero no se elige cantidad ni se deduce densidad.
   `013655` y `034279` también retienen la incertidumbre g/ml. Las cantidades
   aisladas de `036753` (500/440 g) no sirven para escoger un nominal arbitrario.
6. **Logística y surtidos:** `036737`, con 125G P4, no recibe cuatro unidades
   comerciales sin acreditarlo. Un surtido necesita distribución por receta;
   la lista truncada de `026477` y el mix ambiguo de `033688` no se completan
   desde otra referencia. Un selector de venta sin resolver bloquea la firma.
7. **Azúcar, grasa y edulcorantes independientes:** `021893` contiene
   fructosa y edulcorantes, pero un 0 % sin objeto no acredita grasa cero.
   `027687` declara sin azúcar, no por ello sin añadido. `035827` sí declara
   0 % MG, 0 % añadidos y edulcorantes simultáneamente. Natural no completa
   ausencia de azúcar añadido ni de edulcorantes.
8. **Base y especie:** `012746` contiene leche/nata pese a mencionar soja.
   `026479` tiene base mixta soja+coco y `028550`, coco. No heredar soja por
   marca, leche de vaca desde una advertencia alérgica ni grasa final desde
   la de un ingrediente. Sin lactosa no equivale a sin lácteos.
9. **Familia real frente a palabras sueltas:** skyr conserva homologación
   pendiente. La categoría kéfir no demuestra la familia del SKU. Pudding,
   premio para mascota, galleta, potito y comida completa pueden excluirse
   por identidad, pero cheesecake/muffin pueden ser el sabor de un fermentado
   y no una tarta. Los perfiles frutales amplios o solapados no se rechazan
   mediante simple desigualdad de cadenas.

Hay **cuatro fichas nuevas en disputa**, presentes en nueve parejas. En el
lote hay **17 parejas con disputa** en total, incluyendo conflictos de fichas
Carrefour reutilizadas. Una disputa documental sigue visible aunque exista
otra diferencia independiente. No es el sorteo CE-203 ya realizado.

## Comparación con los borradores congelados

Cambian **207 propuestas**: 182 abstenciones pasan a rechazo, 20 a exclusión,
tres rechazos a abstención y dos a exclusión. Otras 242 conservan su decisión.
La transcripción de fuentes permite distinguir negativos demostrables,
productos ajenos y contradicciones que no deben resolverse automáticamente.

Esto **no mide precisión del motor** ni significa que se hayan corregido 207
errores en producción. Se comparan borradores con propuestas editoriales;
la revisión independiente, partición y evaluación todavía no están hechas.

## Archivos y validación

- [Guía editorial y límites](CE-202-yogurt-plusfresc-guide.md).
- [Dossier legible](dataset/label-yogurt-plusfresc-v1/review.md),
  [219 fichas y citas](dataset/label-yogurt-plusfresc-v1/products.json),
  [índice](dataset/label-yogurt-plusfresc-v1/index.json),
  [informe](dataset/label-yogurt-plusfresc-v1/report.json) y
  [manifest](dataset/label-yogurt-plusfresc-v1/manifest.json).
- [Recibo de evidencia](CE-201-202-yogurt-plusfresc-evidence.json).
- [Avance anterior de yogur, preservado](CE-201-202-yogurt-progress.md).

```sh
node scripts/prepare-comparator-strict-yogurt-plusfresc.mjs --artifact=report
node scripts/prepare-comparator-strict-yogurt-plusfresc.mjs --artifact=annotations --offset=0 --limit=20
node --test scripts/lib/comparator-strict-yogurt-plusfresc.test.mjs scripts/tests/comparator-strict-yogurt-plusfresc-evidence.test.mjs
npm run quality
```

Validación específica: **35/35 PASS** (30 de fuentes/composición y cinco de
integridad/reproducción). `npm run quality`: TypeScript y lint PASS,
**532/532 tests PASS**, cero fallos ni saltos. Un test nuevo inicialmente
asumía un array donde el recibo histórico de patatas conserva un objeto;
se corrigió el lector del test para admitir ambos, sin modificar la evidencia.
Los tests verifican consistencia y procedencia, no sustituyen la revisión
humana de las interpretaciones.

## Siguiente paso exacto

1. Registrar las **545 observaciones Carrefour** que faltan del bloque yogur
   en una nueva capa editorial. Reutilizar sin sobrescribir las 431 fichas
   existentes, solo para la misma observación congelada. Una lectura preliminar
   sin transcripción contrastada no cuenta como anotación. Así podrán
   componerse las **2.007 parejas pendientes de yogur**.
2. Continuar después las **2.483 parejas de agua**: clase, gas, sabor,
   aditivos y formato exacto. No repetir CE-200, extracción ni canarios cerrados.
3. Acreditar positivos íntegros y cobertura CE-201. Los 25 formatos compatibles
   nuevos no bastan: faltan atributos obligatorios y contexto comercial.
   Cero positivos documentados no demuestra que el catálogo carezca de
   equivalentes. No cerrar CE-201 ni convertir abstención sistemática en éxito.
4. Preparar CE-203 cuando corresponda: el propietario revisará una muestra
   aleatoria del 20 % y todas las disputas, con arbitraje independiente.
   Todavía no hay sorteo, revisión independiente, gold, holdout ni G2.

Las observaciones locales de Plusfresc de centros 3/12 se enlazan con los
contextos 08006/25001 del corpus como procedencia; no se ha vuelto a verificar
cobertura retailer ni se aprueban precio, stock o ahorro. Continúa FR-02:
catálogo activo y versiones, sin caducidad comercial automática de 24 horas.

No hace falta instalar integraciones para completar este bloque offline.
Los campos ausentes o contradictorios no se arreglan agregando otro motor de
similitud. Una ampliación futura de fuentes debe acreditar SKU, formato,
procedencia y revisión; no heredar recetas de productos vecinos. No se ha
contratado nada ni llamado a Supabase, retailers o APIs de modelos en este lote.
Sin cambios de app, SQL, cron, sincronizaciones o embeddings; sin despliegue.
