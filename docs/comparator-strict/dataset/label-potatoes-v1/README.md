# Primera anotación CE-201/202 — Patatas

Estado vigente y siguiente trabajo: [avance del bloque](../../CE-201-202-potatoes-progress.md).

146 referencias leídas, 922 parejas compuestas desde sus hechos editoriales.
319 rechazos propuestos, 104 exclusiones y 499 abstenciones. No son 922
revisiones humanas individuales, gold, ni resultados del motor en producción.

- `products.json`: hechos, razones, campos ausentes/null, citas originales,
  observación y hash de revisión. 53 fichas de congelados y 93 confusores.
- `index.json`: todas las parejas del bloque, dimensiones y decisiones;
  referencias a las dos fichas revisadas. El muestreo CE-200 no cambia.
- `review.md`: dossier legible; expone propuestas, no sirve como revisión ciega.
- `report.json` / `manifest.json`: recuentos, estado e integridad reproducible.

Las anotaciones completas, con atributos y ambos CP, se regeneran por stdout:

```sh
node scripts/prepare-comparator-strict-potato-review.mjs --artifact=annotations --offset=0 --limit=20
```

Todos los originales y el lote `label-corpus-v1` permanecen intactos. E09 es un
solapamiento sin cambio de estados, no una pareja nueva. Unión acumulada:
928 primeras anotaciones de 6.000; 5.072 pendientes. Los 13 retos editoriales
adicionales no se suman. CE-203 y G2 siguen pendientes; cero ahorro aprobado.
