# Capa editorial Carrefour — yogures

545 fichas nuevas, 431 previas intactas. Se completa la lectura de las 976
observaciones del bloque yogur del corpus, incluidos los confusores.
2.011 composiciones, 2.007 parejas nuevas y cuatro editoriales solapadas.
Unión acumulada 3.517/6.000; 2.483 parejas de agua pendientes.

- [Dossier legible](review.md), [fichas con citas](products.json), [índice](index.json).
- [Informe](report.json), [manifest](manifest.json), [guía](../../CE-202-yogurt-carrefour-guide.md).
- [Avance y pendientes](../../CE-201-202-yogurt-carrefour-progress.md).

Propuestas desde fuentes, no revisión humana individual, gold ni evaluación
de producción. E07 conserva desacuerdo editorial para arbitraje del propietario.
Sin equivalencias completas/ahorros acreditados. CE-201/202 abiertas.

Reproducción local sin escrituras:

```sh
node scripts/prepare-comparator-strict-yogurt-carrefour.mjs --artifact=report
node scripts/prepare-comparator-strict-yogurt-carrefour.mjs --artifact=annotations --offset=0 --limit=20
```

Las anotaciones completas se reproducen por stdout; su hash está fijado en
el manifest. Las fichas y el índice compacto sí se conservan materializados.
No modificar las capas anteriores ni repetir la extracción CE-200.
