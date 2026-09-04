# CE-201/202 — Corpus preparado para anotación estricta

2026-09-03. **CE-201 y CE-202 EN CURSO. No cerradas; G2 pendiente.**
Autoridad: «adelante con las tareas 201 y 202».

## Resultado de este avance

Se ha pasado del piloto de 22 parejas a una herramienta de preanotación para
las **6.000 parejas congeladas en CE-200**, que utiliza 1.893 de sus referencias.
Hay ocho dimensiones independientes, fuentes originales y observaciones
identificadas por hash. No se ha cambiado el comparador de la aplicación.

- [Índice y manifiesto](dataset/label-corpus-v1/manifest.json): 12 archivos de
  500 parejas. Cada estado es un **borrador**, no una decisión confirmada.
- [Informe reproducible](dataset/label-corpus-v1/report.json): cantidades,
  limitaciones, hashes y estado real de cada tarea.
- [20 anotaciones editoriales con evidencia legible](dataset/label-corpus-v1/review.md):
  contrastadas por el asistente con los campos originales, no generadas desde
  un score del comparador. También disponibles en
  [JSON](dataset/label-corpus-v1/editorial.json), con sus
  [especificaciones explícitas](dataset/label-corpus-v1/editorial-specs.json).
- [Guía de esta versión](CE-202-corpus-labeling-guide.md): diferencia entre
  borrador, primera anotación, revisión independiente y verdad aprobada.

De las 20 anotaciones editoriales, **7 pertenecen al corpus congelado y 13 son
retos complementarios** elegidos a propósito entre las fuentes ya adquiridas.
No se suman a las 6.000 parejas ni alteran pesos o el muestreo. Quedan **5.993
parejas del corpus sin primera revisión semántica**. Las 20 propuestas aportan
7 rechazos, 3 exclusiones y 10 abstenciones; ninguna equivalencia íntegra aprobada.
Tu revisión CE-203 no se ha realizado ni se ha sorteado su 20 %.

## Qué muestran los borradores, no métricas del motor

| Dimensión / resultado | Recuento provisional |
|---|---:|
| Formato nominal coincidente | 160 |
| Formato nominal diferente | 822 |
| Evidencia de formato conflictiva | 24 |
| Formato no resuelto | 4.994 |
| Diferencia explícita de variante | 13 |
| Evidencia de variante conflictiva | 12 |
| Propuesta de rechazo, por cualquier dimensión | 834 |
| Propuesta de exclusión del piloto | 81 |
| Propuesta de abstención | 5.085 |

Los motivos pueden coexistir; no sumar columnas como parejas independientes.
Estas cifras corresponden a reglas locales finitas de ayuda a la anotación,
**no a 834 errores del comparador ni a 160 equivalentes válidos**. El índice
mantiene las propuestas iniciales; las anotaciones editoriales se superponen
por pareja y observación sin sobrescribirlas.

Se conservan los dos CP por pareja: **12.000 evaluaciones de contexto**, no
12.000 búsquedas ejecutadas ni parejas independientes. CE-200 sigue teniendo
1.200 Q y 600 orígenes. Precio, ubicación, disponibilidad y revisiones completas
permanecen desconocidos en ambos CP; se adjuntan observaciones locales cuando
existen, sin convertir el mapeo provincial de Consum en servicio exacto.

## Hallazgos que cambian la futura implementación

1. **Formato elegible ≠ producto equivalente.** E01/E02 comprueban 6×125 g en
   Carrefour y Mercadona, tanto en natural como en los que declaran azúcar de
   caña. Faltan atributos para aprobar la variante completa y evidencia comercial.
   E07 muestra el caso inverso: ambos son 4×120 g, pero fresa y macedonia difieren.
2. **Natural no rellena endulzado.** E03/E04 se abstienen ante natural frente a
   azúcar de caña. No son intercambiables por defecto. Tampoco se inventa una
   ausencia de azúcar añadido desde un título o una lista de integridad incierta.
3. **2 kg frente a 1 kg / 500 g no es ahorro equivalente.** E08/E09 conservan
   las cantidades originales y no multiplican compras para igualar el total.
4. **Una referencia puede ofrecer varias formas de venta.** E10 conserva las
   opciones unidad / pack de seis de Plusfresc `025303`. Hay 18 referencias con
   selección de formato no acreditada entre las utilizadas por los borradores.
   F3/F5 deberán vincular precio, cantidad y opción comercial elegida.
5. **Unidad nutricional y pack comercial pueden estar mezclados.** E15 registra
   seis unidades en el título y una botella de 300 ml en la descripción. No dar
   prioridad automática a detalle/OFF, ni declarar que el envase se vende suelto.
6. **No inventar el papel de una cantidad.** «4 unidades 125 g» no demuestra
   total 125 g. «4 uds. 550 g» frente a «4×125 g» queda no resuelto, sin corregir
   550 a 500. Una primera versión del preanotador interpretaba demasiado ese
   total; se corrigió antes de congelar artefactos y se añadió regresión.
7. **Gramos y mililitros no son automáticamente un conflicto.** E19 conserva
   940 ml / 750 g como no resuelto, sin inventar densidad. E13 sí tiene un
   conflicto independiente: seis frente a ocho unidades dentro de la referencia.
8. **Los ingredientes importan, pero su ámbito también.** E12 documenta
   «azucarado» frente a «sin azúcares añadidos»/edulcorantes. E18 diferencia
   leche y soja sin lácteos. El programa no interpreta ausencia de ingredientes
   ni una tabla nutricional como ausencia de azúcar añadido.
9. **La categoría y el parecido léxico no son verdad.** Colonia, salsa sabor
   yogur y kéfir siguen como casos difíciles E16/E17/E20. No heredar la familia
   de muestreo como identidad final.

La guía de Supabase mantuvo el trabajo sobre fuentes locales sin alterar la BD;
su [changelog público](https://supabase.com/changelog) no exige cambios de
plataforma para este avance. Sin consultas al proyecto, retailers, OFF o modelos
externos; sin nuevas dependencias, integraciones, costes contratados o cron.
Los antiguos contadores remotos no se han reiniciado ni consultado de nuevo.

## Estado y condición exacta de cierre

| Tarea | Hecho | Pendiente |
|---|---|---|
| CE-201 | Casos difíciles reales, positivos parciales de formato, desconocidos y fuentes trazables; 56 contratos sintéticos anteriores conservados | Completar cobertura semántica real y positivos de equivalencia respaldados; no sustituirlos por coincidencias nominales o sintéticos |
| CE-202 | Preanotación de las 6.000 parejas, dimensiones y contexto separados, 20 primeras anotaciones editoriales | Primera revisión semántica de las 5.993 parejas restantes del corpus, comprobar todos los atributos aplicables y documentar desconocidos reales |
| CE-203 | Propietario ya designado | Segunda revisión aleatoria del 20 % y disputas, con evidencia/formulario ciegos antes de mostrar propuestas |

No se rebaja el cierre a «se ha generado un JSON». Los borradores que no
extraen un atributo no prueban que la fuente carezca de él. Revisión pendiente
y evidencia verdaderamente insuficiente son estados diferentes.

Siguiente trabajo: continuar la primera anotación por familias/lotes y usar
los conflictos como casos de arbitraje. No repetir la extracción CE-200. No
activar el motor ni dar G2 por aceptado. El corpus aún no está listo para
medir precisión, recall o mínimos conocidos.

**Integraciones:** ninguna nueva necesaria para preparar/anotar lo ya adquirido.
Si la revisión confirma campos realmente ausentes, F4 puede evaluar ampliar el
OFF existente con GTIN y ámbito unidad/pack verificados. OFF no resuelve CP,
precio o stock. La selección comercial y los cruces de ficha detectados requieren
corregir procedencia/modelado, no instalar otro buscador o un reranker.

## Reproducción y verificación

    node scripts/prepare-comparator-strict-corpus-labels.mjs --artifact=report
    node scripts/prepare-comparator-strict-corpus-labels.mjs --artifact=editorial
    node scripts/prepare-comparator-strict-corpus-labels.mjs --artifact=annotations --offset=0 --limit=20
    node scripts/prepare-comparator-strict-corpus-labels.mjs --artifact=products --offset=0 --limit=20
    node --test scripts/lib/comparator-strict-corpus-labels.test.mjs scripts/tests/comparator-strict-label-corpus-evidence.test.mjs
    npm run quality

Solo lectura local y stdout. Manifiesto CE-200 fijado a su SHA-256 original;
el generador rechaza cambios de fuente, versión, parejas o consultas. Las
anotaciones completas bajo demanda se fijan por hash; no hay que volver a
consultar Supabase. El índice y los 20 casos editoriales se guardan materializados.
No se escribe sobre la semilla, el corpus ni las evidencias históricas.

30 pruebas nuevas verifican contratos, citas, cantidades exactas, desconocidos,
negaciones, reproducción e integridad. No prueban por sí mismas la interpretación
semántica de todos los productos. Resultado de la suite y hashes finales en
[evidencia de este avance](CE-201-202-corpus-evidence.json).
