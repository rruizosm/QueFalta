# CE-203 · Paquete ciego `owner-review-v1`

Estado: selección preparada; revisión del propietario y arbitraje pendientes.

- `report.json`: recuentos, semilla y hashes del sorteo.
- `manifest.json`: fija corpus, cierre CE-201/202, código y guía.
- Los 1.336 casos ciegos, índice y plantilla vacía se reproducen por salida
  estándar; no se guarda una copia redundante de varios megabytes.
- Libro de trabajo: `outputs/ce203-owner-review-v1/CE-203-revision-ciega.xlsx`.

El libro y el artefacto `review` solo contienen evidencia fuente. No contienen
propuestas de la primera anotación, predicciones, motivo de selección ni gold.

```sh
node scripts/prepare-comparator-strict-owner-review.mjs --artifact=report
node scripts/prepare-comparator-strict-owner-review.mjs --artifact=index --offset=0 --limit=25
node scripts/prepare-comparator-strict-owner-review.mjs --artifact=review --batch=1 --batch-size=25
node scripts/prepare-comparator-strict-owner-review.mjs --artifact=responses --offset=0 --limit=25
```

No editar el corpus, la semilla o los hashes para regenerar una muestra distinta.
CE-203 solo podrá cerrarse tras las 1.336 respuestas ciegas y su confrontación y
arbitraje posterior, siempre sin predicciones del motor.
