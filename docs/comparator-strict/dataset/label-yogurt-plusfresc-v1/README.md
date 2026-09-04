# CE-202 — Capa incremental de yogures Plusfresc

219 fichas nuevas de las observaciones congeladas CE-200. Se reutilizan las
212 fichas de `label-yogurt-v1` sin editarlas. Composición de 449 parejas
nuevas, no revisión humana individual ni evaluación del comparador publicado.

- `products.json`: hechos y citas originales, con profundidad de revisión.
- `index.json`: propuestas compactas de las 449 parejas del corpus.
- `report.json`: contadores, límites y puertas todavía pendientes.
- `manifest.json`: hashes de datos, código, guía e insumos anteriores.
- `review.md`: dossier legible; no formulario ciego de CE-203.

Las anotaciones completas se reproducen por stdout; su hash semántico está
fijado en el manifest. Los hashes de archivos completos están en el
[recibo de evidencia](../../CE-201-202-yogurt-plusfresc-evidence.json).
No sobrescribir esta capa al continuar Carrefour: crear otra versión y
contar la unión de parejas, no la suma de evaluaciones por código postal.

```sh
node scripts/prepare-comparator-strict-yogurt-plusfresc.mjs --artifact=report
node scripts/prepare-comparator-strict-yogurt-plusfresc.mjs --artifact=annotations --offset=0 --limit=20
node --test scripts/lib/comparator-strict-yogurt-plusfresc.test.mjs scripts/tests/comparator-strict-yogurt-plusfresc-evidence.test.mjs
```

[Guía editorial](../../CE-202-yogurt-plusfresc-guide.md) ·
[Estado y siguiente paso](../../CE-201-202-yogurt-plusfresc-progress.md).
Sin gold, positivos íntegros ni revisión independiente completada. CE-201,
CE-202, CE-203 y G2 no se cierran con este lote. Sin TTL comercial de 24 horas.
