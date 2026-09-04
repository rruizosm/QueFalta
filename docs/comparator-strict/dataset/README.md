# Dataset CE-200

Estado vigente: [CE-200 completada](../CE-200-closure.md), sin etiquetas gold.

CE-201/202 también están [completadas como primera anotación](../CE-201-202-water-closure.md):
6.000/6.000 parejas cubiertas, un equivalente de producto respaldado y cero
ahorros elegibles. CE-203 y G2 pendientes.

CE-203 ya tiene [selección y formulario ciego](owner-review-v1/README.md):
1.200 parejas aleatorias (20 %) más 175 disputas; 39 solapan, total 1.336.
La revisión humana continúa en 0/1.336, sin arbitraje ni gold.

- **corpus-v1/**: manifiesto, selección, pesos y casos finales. Concatenar
  pairs-*.json y queries-*.json en orden de nombre. Son 6.000 parejas y 1.200 Q.
- **acquisition-v1/**: fuentes originales, consultas, relojes, censo, taxonomías,
  verificación de huellas e incidencias. No reejecutar la extracción cerrada.
- **seed-v1/** y **label-pilot-v1/**: trabajo exploratorio anterior conservado;
  no sumarlo al corpus ni copiar sus propuestas como gold.
- **label-corpus-v1/**: borradores y primeras anotaciones anteriores, congelados:
  20 editoriales (7 del corpus, 13 retos); sus 5.993 pendientes son históricos.
- **label-potatoes-v1/**: 146 fuentes revisadas / 922 parejas compuestas del
  bloque patatas. Unión acumulada 928 parejas del corpus, 5.072 pendientes.
  Sin gold ni segunda revisión. [Estado actual](../CE-201-202-potatoes-progress.md).
- **label-yogurt-v1/**, **label-yogurt-plusfresc-v1/** y
  **label-yogurt-carrefour-v1/**: capas incrementales congeladas del bloque yogur.
- **label-water-v1/**: cierre compacto; 771 fuentes y 2.485 composiciones
  reproducibles por CLI, hashes completos sin duplicar las fuentes crudas.
- **owner-review-v1/**: semilla, manifiesto y hashes del paquete ciego CE-203;
  los casos completos y la plantilla vacía se reproducen por CLI. No expone
  propuestas ni predicciones.
- **CE-200-sampling-plan.json**: propuesta inicial histórica, conservada con
  el hash del avance original. Sus restricciones de adquisición y estado pendiente
  fueron sustituidos por [CE-BU-002](../CE-BU-002-corpus-authority.md) y el diseño
  congelado de corpus-v1/selection.json; no son límites vigentes.

Reproducir offline con scripts/prepare-comparator-strict-corpus.mjs. El hash
de cada fuente y del generador figura en corpus-v1/manifest.json. Las anotaciones
formales deben ir en una capa nueva de CE-202, sin sobrescribir los datos crudos.
