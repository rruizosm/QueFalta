# CE-201/202: fuentes, borradores y primeras anotaciones

- `manifest.json` fija fuentes, código, especificaciones y hashes de resultados.
- `index-*.json`: 6.000 parejas en orden, en bloques de 500. Estados de borrador,
  no aprobaciones; `editorial_id` enlaza las siete revisadas en la capa editorial.
- `editorial-specs.json` / `editorial.json`: 20 propuestas tras contraste de
  fuentes (7 del corpus, 13 retos complementarios). No son gold ni revisión CE-203.
- `review.md`: dossier legible con razones y citas originales. Incluye propuestas;
  por tanto no sirve como formulario ciego de segunda revisión.
- `report.json`: recuentos reales, tareas abiertas y límites.

Los registros completos de borrador/producto/ubicación se reproducen con
`scripts/prepare-comparator-strict-corpus-labels.mjs`, artefactos `annotations`,
`products` y `locations`, usando `--offset` y `--limit`. Sus hashes están
congelados en el informe; el CLI solo imprime y nunca escribe ni consulta red.

No sustituir ni mezclar con `seed-v1`, `label-pilot-v1` o `corpus-v1`.
La extracción original permanece intacta. No contar dos CP como dos parejas,
ni añadir los retos editoriales a las 6.000 parejas representadas por sus pesos.
Estado y siguiente trabajo: [avance](../../CE-201-202-corpus-progress.md).
