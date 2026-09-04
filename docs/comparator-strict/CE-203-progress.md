# CE-203 — Segunda revisión: selección y formulario preparados

2026-09-03. Autoridad: «adelante».

**CE-203 está EN CURSO. La selección está congelada; la revisión del propietario
no ha comenzado y la tarea no está cerrada.**

## Resultado preparado

- Población cerrada CE-201/202: 6.000 parejas.
- Muestra aleatoria proporcional: 1.200 parejas, exactamente el 20 %.
- Estratos: familia × cohorte confirmatoria/reto, con asignación de Hamilton.
- Disputas obligatorias: 175 parejas. Hay 39 dentro de la muestra aleatoria y
  se añaden 136, sin duplicados.
- Total de revisión ciega: **1.336 casos**, 54 lotes de hasta 25.
- Semilla congelada:
  `57eb418dad5f506e53236c211b177425c6c2964b0797fb14988add4435ee81d7`.
- Casos seleccionados: 570 de agua, 185 de patatas congeladas y 581 de yogur;
  886 confirmatorios y 450 retos.

Las 175 disputas son la unión de parejas con conflicto de evidencia, ficha
marcada como fuente disputada o diferencia entre dos anotaciones históricas.
Los motivos solo se usan para demostrar cobertura: no aparecen en el libro del
revisor.

## Entregables

- [Guía de revisión](CE-203-owner-review-guide.md).
- [Informe y manifiesto](dataset/owner-review-v1/README.md).
- [Libro de revisión ciega](../../outputs/ce203-owner-review-v1/CE-203-revision-ciega.xlsx).
- Generador offline `scripts/prepare-comparator-strict-owner-review.mjs`.

El libro contiene las fuentes de ambos extremos, captura, campos presentes/null,
formato, identidad/receta, categoría y evidencia comercial para 08006/25001.
Las columnas editables tienen listas cerradas para las ocho dimensiones,
decisión, motivo, referencias, arbitraje, fecha y seudónimo `owner-01`. La hoja
Inicio calcula el progreso; “Completo” significa formulario rellenado, no gold.

No contiene propuestas de la primera anotación, predicciones, scores, cohorte,
motivo de selección, indicador de disputa ni resultado esperado. Los casos se
mezclan en un orden SHA-256 independiente del orden del sorteo.

## Qué falta para cerrar CE-203

1. El propietario rellena los 1.336 casos sin abrir los dosieres de propuestas.
2. Se importa y valida cada respuesta contra su `case_id`, `pair_id`, hash de
   evidencia, vocabulario y coherencia de decisión.
3. Solo después se confronta con la primera anotación.
4. Se arbitran todas las diferencias con evidencia y sin predicciones; si no se
   resuelven, permanecen `unknown` o `conflicting`.
5. Se registra el recibo de cierre sin sobrescribir ninguna capa anterior.

Hasta entonces: 0 revisiones, 0 arbitrajes, 0 gold, CE-203 `false` y G2 `false`.
CE-204/205 no deben iniciarse porque todavía no existe una verdad revisada que
particionar o bloquear.

## Seguridad y alcance

Todo se generó offline desde el corpus congelado. No hubo consultas o cambios en
Supabase/retailers, código de app, SQL, cron, sincronización, embeddings o
producción; tampoco despliegue, commit, push ni integración nueva.
