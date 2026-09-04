# CE-201/202 — Cierre de la primera anotación

2026-09-03. Continuación autorizada por «adelante».
**CE-201 y CE-202 completadas. CE-203 y G2 siguen pendientes.**

## Resultado

- 771 observaciones del estrato agua registradas desde sus fuentes congeladas.
- 2.485 parejas compuestas; 2.483 aumentan cobertura y dos revisitan E11/E16
  sin cambiar su decisión ni contarlas dos veces.
- Unión final: **6.000/6.000 parejas con primera anotación** y 0 pendientes.
- 410 rechazos por oposición demostrada, 595 exclusiones del piloto y 1.480
  abstenciones por evidencia incompleta o conflicto.
- 226 productos con firma numérica completa; 21 parejas con formato compatible,
  que no se elevan automáticamente a equivalentes.
- Ocho fichas en disputa documental afectan a 68 parejas.
- Un positivo de producto íntegro: Aquarel botella 1,5 L de Consum y Mercadona,
  con el mismo GTIN global válido y formato exacto.

El positivo sigue sin ser un ahorro elegible porque precio, ubicación,
disponibilidad y revisión activa bilateral por CP son desconocidos. Por tanto,
hay cero ahorros, cero gold y cero revisiones independientes.

## Por qué pueden cerrarse CE-201 y CE-202

CE-201 exigía conservar casos positivos, negativos difíciles y desconocidos con
evidencia original y fecha. Los tres estados están presentes en el corpus; el
positivo no se ha forzado desde similitud, marca o cantidad parcial.

CE-202 exigía etiquetar por separado identidad, variantes, formato, precio,
ubicación, disponibilidad/catálogo y decisión final. La primera anotación cubre
las 6.000 parejas. Las dimensiones comerciales quedan explícitamente
desconocidas cuando la captura no las acredita; completar la tarea no equivale
a fingir esos datos.

La [guía de agua](CE-202-water-source-review-guide.md) documenta las reglas,
los límites y el positivo. Los artefactos completos de productos, anotaciones e
índice se reproducen por salida estándar y sus hashes quedan fijados; no se
convierten en datos de producción.

```sh
node scripts/prepare-comparator-strict-water-review.mjs --artifact=report
node scripts/prepare-comparator-strict-water-review.mjs --artifact=annotations --offset=0 --limit=20
node --test scripts/lib/comparator-strict-water-review.test.mjs
npm run quality
```

## Siguiente paso obligatorio

CE-203: sortear con semilla registrada el 20 % de las 6.000 parejas y añadir
todas las disputadas. El propietario revisará evidencia y formulario sin ver
las propuestas primero; su revisión se almacenará aparte. Resolver desacuerdos
no autoriza todavía el comparador: CE-204/205 deben evitar fugas por producto o
GTIN y bloquear el holdout antes de medir motores en CE-206.

No se consultó Supabase ni retailers, no se modificó app, SQL, sincronización,
cron o embeddings, y no hubo despliegue, commit ni push. No se añadió ni contrató
ninguna integración.

