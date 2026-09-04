# CE-201/202 — Casos difíciles y etiquetado: avance local

## Actualización vigente: primera anotación completada

2026-09-03. [Acta de cierre](CE-201-202-water-closure.md) y
[evidencia reproducible](CE-201-202-water-evidence.json): **CE-201 y CE-202
completadas**. El bloque final de agua registra 771 fuentes y 2.485
composiciones; añade 2.483 parejas únicas y lleva la unión a **6.000/6.000**.
Existe un equivalente de producto respaldado por GTIN global y formato exacto;
no es ahorro por faltar comercio bilateral por CP. CE-203, gold, particiones,
holdout, evaluación y G2 siguen pendientes. La sección siguiente es histórica.

## Historial previo al cierre: corpus CE-200 incorporado

Petición «adelante con las tareas 201 y 202», 2026-09-03:
[avance actual y siguiente trabajo](CE-201-202-corpus-progress.md).
6.000 borradores reproducibles, 20 primeras anotaciones editoriales (7 del
corpus, 13 retos complementarios), 434/434 tests PASS. Quedan 5.993 primeras
revisiones del corpus y la cobertura de positivos íntegros. **CE-201/202 no
cerradas, CE-203 no realizada y G2 pendiente**. No repetir adquisición.

## Registro anterior tras cerrar CE-200

2026-09-03. **CE-200 está completada**: el [corpus v1](CE-200-closure.md)
aporta 6.000 parejas y 1.200 contextos Q, con fuentes y selección verificadas.
La adquisición ya no está pendiente y el límite acumulado de tiempo quedó
retirado por [CE-BU-002](CE-BU-002-corpus-authority.md). No repetirla.

**CE-201/202 siguen en curso.** La siguiente tarea es adaptar el flujo de
anotación al corpus completo, ampliar la cobertura de casos difíciles y
etiquetar por dimensiones con citas originales. Las 22 propuestas anteriores
no se convierten en gold ni se trasladan automáticamente a nuevas observaciones.
El propietario conserva CE-203: revisión y arbitraje. G2 sigue pendiente.

## Registro histórico del avance anterior

Lo que sigue conserva el estado y las pruebas del piloto previo a la extracción;
sus restricciones de adquisición y recuentos pendientes ya están superados por
el cierre enlazado arriba, no son instrucciones vigentes para reanudar.

2026-09-03. Autoridad: «continua con las tareas», después de acordar avanzar
CE-201/202 localmente mientras CE-200 conserva la adquisición pendiente.
**CE-201 y CE-202 EN CURSO, no completadas. F2 sigue abierta; G2 no aceptado.**

## Resultado

- [Guía de etiquetado `ce202-v1`](CE-202-labeling-guide.md): ocho dimensiones
  independientes, evidencia exacta, razones, decisión y procedimiento de revisión.
- [Lote legible de 22 parejas reales](dataset/label-pilot-v1/review.md), con
  [anotaciones propuestas y citas](dataset/label-pilot-v1/annotations.json).
  9 exclusiones del piloto, 8 incompatibilidades propuestas y 5 abstenciones.
  Cero positivos reales aprobados, cero gold, cero métricas de precisión.
- [56 casos sintéticos de contrato](dataset/label-pilot-v1/contracts.json):
  los 32 de CE-104 reutilizados, más 24 ampliaciones. Positivos, negativos y
  desconocidos separados del corpus real; no incrementan el tamaño CE-200.
- CLI y validador offline, sin tocar app, bases de datos ni fixtures originales.
  [Informe reproducible con hashes](dataset/label-pilot-v1/report.json).

## Hallazgos incorporados

1. **Ruido de recuperación:** colonia, filtros, higiene nasal, adhesivos,
   galletas, tortitas, salsa de yogur, peladores y puré. Coincidir por palabras
   no acredita familia. La semilla queda conservada; no se borran los malos casos.
2. **Marca/formato:** SOLAN DE CABRAS de 33 cl y de 5 l no son equivalentes por
   compartir marca. Natural de 8 unidades frente a 4 falla por pack, aunque
   no sepamos si ambos llevan azúcar añadido.
3. **Cantidad parcial no es firma completa:** 0,5 L/50 cl o 33 cl/33 cl dejan
   abiertos conteo, variante y evidencia comercial; no se aprueban automáticamente.
4. **Ausencias reales:** prefritas no prueba congelación; pequeño/Junior no
   acredita cantidad. No obtener pesos/volúmenes dividiendo precios unitarios.
5. **Casos F1 que necesitaban precisión:** natural/azucarado requiere evidencia
   del endulzado del origen; GTIN igual con formato contrario se registra como
   conflicto. Las aclaraciones viven en una versión nueva, con fuente histórica.

Las 22 parejas fueron elegidas manualmente de la semilla CE-104 para cubrir
estas lagunas. **No constituyen un muestreo representativo ni un holdout.**
Se usa el reloj original `2026-09-03T08:08:57.223041+00:00`, no la fecha del
etiquetado. CP 08006 es un contexto de prueba; no prueba de precio/stock local.
Las cuatro dimensiones comerciales siguen desconocidas en las 22 parejas.

## Lo que se ha probado y lo que no

Las pruebas verifican citas/IDs/hashes, observación y contexto, desconocidos,
negaciones explícitas en las propuestas, conflictos, deduplicación, límites,
no promoción a gold y regeneración de artefactos. La tabla de decisión comprueba
coherencia **de etiquetas suministradas**, no extrae ni compara productos.

Validación ejecutada: **22/22 pruebas nuevas PASS; `npm run quality` con
389/389 tests PASS, TypeScript y lint correctos**. Regeneración de anotaciones,
contratos e informe verificada; no se han alterado los snapshots fuente.

No se ha medido precisión, recall, utilidad, latencia del comparador, ni
funcionamiento de cuotas/cachés. No se han instalado servicios, consultado
retailers/OFF, llamado a modelos externos ni creado contadores/tareas remotas.
La guía Supabase ha mantenido este avance fuera de la BD bajo BU-01; se consultó
el [changelog público](https://supabase.com/changelog) sin usar APIs del proyecto.
Ninguna nueva función de Supabase ha requerido cambios o integración en esta tarea.

## Pendientes y secuencia

| Tarea | Estado real / condición de cierre |
|---|---|
| CE-200 | Abierta: marco, extracción revisada y corpus de 5.000–10.000 parejas / ≥1.000 Q aún pendientes |
| CE-201 | En curso: casos difíciles preparados; completar cobertura real de positivos/negativos/desconocidos con evidencia original |
| CE-202 | En curso: guía/contrato y 22 propuestas preparados; etiquetar el corpus completo con dimensiones respaldadas |
| CE-203 | Pendiente: segunda revisión del propietario y arbitraje; este lote no es el 20 % aleatorio ni acredita su revisión |
| CE-204/205 | Pendientes: particiones por entidades/exposición y bloqueo de holdout |
| CE-206 | Pendiente: harness de resultados reales, denominadores y métricas; el validador de etiquetas no lo sustituye |
| CE-207/208 | Pendientes: negativos ejecutables de cuota/error/carreras/caché y replay versionado, no solo ilustraciones |

La preparación de CE-201/202 no salta G2 ni cambia el plan de muestreo antes
de etiquetar el corpus confirmatorio. El seed de CE-200 permanece sin modificar;
estas propuestas son una capa exploratoria aparte. No arrastrar sus conclusiones
a nuevas observaciones ni al dataset confirmatorio.

Puede continuarse **localmente** preparando CE-206/207 mientras faltan datos:
interfaces de evaluación y pruebas con dobles, sin ejecutar RPC legacy que
puedan consumir cuota o crear cachés/colas. Deberán quedar identificadas como
pruebas locales y no certificar las implementaciones que aún no existen.

Para adquisición remota sigue siendo necesaria una operación nueva de lectura
acotada con destino, permisos, salud y presupuesto revalidados. La última
reserva comprobada del 2026-09-03 sigue en 299.920/300.000 ms SQL; no se ha
consultado ni reiniciado. El cambio de día no autoriza por sí solo cualquier
consulta ni hereda las excepciones de los canarios F1. No hay reanudación programada.

Validación y huellas finales: [CE-201-202-evidence.json](CE-201-202-evidence.json).
