# CE-201/202 — Agua v1

Capa offline `ce202-water-source-review-v1` sobre el corpus congelado. Registra
771 observaciones y compone 2.485 parejas. Los productos, las anotaciones y el
índice completos se obtienen con el CLI stdout-only y se fijan por hash para no
duplicar varios megabytes de evidencia ya conservada en los archivos fuente.

```sh
node scripts/prepare-comparator-strict-water-review.mjs --artifact=products
node scripts/prepare-comparator-strict-water-review.mjs --artifact=annotations --offset=0 --limit=100
node scripts/prepare-comparator-strict-water-review.mjs --artifact=index
node scripts/prepare-comparator-strict-water-review.mjs --artifact=report
```

Estado: CE-201/202 completadas como primera anotación; CE-203, gold, particiones,
holdout, evaluación del motor y G2 pendientes. Un equivalente de producto
respaldado, cero ahorros elegibles. Véanse la
[guía](../../CE-202-water-source-review-guide.md) y el
[acta](../../CE-201-202-water-closure.md).

