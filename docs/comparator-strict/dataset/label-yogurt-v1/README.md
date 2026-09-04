# Yogures v1 — Primera anotación incremental

212 fichas revisadas y 133 parejas nuevas compuestas dentro del corpus CE-200.
No es todo el bloque yogur, revisión humana individual, gold ni evaluación del motor.

- `products.json`: hechos editoriales, límites, citas completas y huellas de revisión.
- `index.json`: 133 parejas, estados por dimensión y referencias a fichas revisadas.
- `report.json`: conteos, pendientes, disputas y hashes reproducibles.
- `manifest.json`: huellas de generadores y entradas inmutables.
- `review.md`: dossier legible, expuesto; no formulario ciego CE-203.

Anotaciones completas reproducibles sin red ni escrituras:

```sh
node scripts/prepare-comparator-strict-yogurt-review.mjs --artifact=annotations --offset=0 --limit=20
```

Solo cuentan parejas cuyos dos extremos están revisados; las 212 fichas no
son 212 parejas ni sus dos contextos postales duplican la muestra. Unión con
capas anteriores: 1.061/6.000, sin solapamientos nuevos. Faltan 2.456 de yogur y
2.483 de agua. Cero positivos íntegros, gold, ahorro o segunda revisión aprobados.

Continuación: [estado del lote](../../CE-201-202-yogurt-progress.md) y
[guía editorial](../../CE-202-yogurt-source-review-guide.md). No sobrescribir
esta capa, CE-200, borradores ni editoriales previos al ampliar el trabajo.
