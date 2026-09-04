# CE-202 — Anotación del corpus, versión ce202-corpus-v1

Complementa [ce202-v1](CE-202-labeling-guide.md), que se conserva como guía del
piloto histórico. No cambia D01–D14, CU-01 ni FR-02; no instala un parser en la app.

## Estados de trabajo, separados de etiquetas

| Capa | Autoría / estado | Qué permite afirmar |
|---|---|---|
| Borrador reproducible | rule_assisted_draft / requires_first_semantic_review | Pistas literales y propuestas con evidencia; no revisión realizada |
| Primera anotación editorial | assistant_editorial_first_annotation / awaiting_owner_independent_review | Interpretación explícita del asistente tras contrastar campos; todavía no gold |
| Revisión CE-203 | Aún no realizada | Debe registrarse aparte, sin fingir identidad humana ni reescribir propuesta |
| Verdad/holdout | Aún no asignados | Requieren resolución de disputas, control de entidades/exposición y gates posteriores |

`unknown` dentro de un borrador no significa «un revisor comprobó que el dato
falta». Hay que revisar la evidencia íntegra y todos los atributos aplicables.
`null` en una fuente, ausencia de columna, falta de extracción y contradicción
son situaciones distintas. No autorizar automáticamente los rechazos tampoco.

## Unidad, tiempo y contexto

Una pareja comercial sigue siendo no ordenada. El borrador económico usa
izquierda→derecha solo como convención técnica y no aprueba ahorro. Invertir
origen requiere otra evaluación de precio. Los dos CP se conservan como
contextos correlacionados, no duplican el número de parejas.

Cada cita contiene clave tienda:ID, observación, captura real, archivo fuente,
SHA-256, puntero a la fila y puntero JSON al campo original con su valor completo.
Los IDs con ceros iniciales permanecen textuales. El reloj de replay no reemplaza
`synced_at` ni la captura. No caducar a las 24 h ni renovar fechas al anotar.

La familia/estrato CE-200 es metadato de selección, no una etiqueta verdadera.
No usar embeddings, ranking, score del comparador ni su lista de resultados
como prueba. Los 13 retos editoriales complementarios son exposición deliberada,
no una ampliación representativa del corpus congelado.

## Reglas de cantidades para esta primera anotación

- Normalizar exactamente unidades compatibles, con aritmética decimal; no usar
  tolerancia ni calcular gramos/litros dividiendo precio por precio unitario.
- Guardar por separado conteo, contenido por envase, dimensión y total nominal.
  Multiplicar conteo explícito por contenido explícito permite comprobar total;
  dividir total por conteo no acredita la composición original.
- Cantidad aislada no da permiso para asumir un envase. «4 unidades 125 g»
  tampoco fija si 125 g es total o contenido de cada unidad.
- Un envase de 750 g, 6×125 g y 3×250 g no comparten formato. 6×124 g tampoco
  coincide con 6×125 g. Packs surtidos requieren revisar composición.
- Si la referencia permite unidad y pack, preservar las alternativas. Sin una
  selección vinculada al precio, la firma comercial es desconocida.
- Masa y volumen sin densidad/documentación no se convierten; su presencia
  simultánea no demuestra por sí sola datos contradictorios.
- Si dos fuentes del mismo ámbito dan conteos distintos, registrar conflicto.
  Si pueden corresponder a unidad y pack, registrar además esa ambigüedad de
  procedencia: no adjudicar automáticamente qué fuente corresponde a la venta.

Coincidencia de formato es solo una dimensión. No completa sabor, base,
especie, grasa, endulzado, edulcorantes, declaraciones, corte o preparación.
El preanotador implementa pocas declaraciones literales y deja las demás
pendientes; no es el diccionario ni extractor definitivo CE-300–308.

## Revisión práctica por pareja

1. Abrir ambos registros originales y sus observaciones de ubicación; verificar
   que las citas pertenecen a esas versiones y no a otro pack.
2. Anotar alcance e identidad desde denominación, ingredientes, categoría y
   conservación respaldadas; no desde palabras aisladas.
3. Revisar todos los atributos obligatorios por familia de la guía ce202-v1.
   Natural no demuestra endulzado; ausencia de palabra no significa false.
4. Resolver firma nominal con evidencias y roles explícitos. Si no se puede,
   conservar desconocido/conflicto, incluso si ambos precios parecen atractivos.
5. Revisar precio y condiciones, CP/canal, disponibilidad y revisiones por
   separado. En el corpus actual no hay evidencia comercial bilateral suficiente;
   `published=true`, un precio global o un centro aproximado no la sustituyen.
6. Redactar razón específica de cada etiqueta, incluidas las desconocidas.
   Comparar con el borrador después del examen, conservar cambios y su motivo.
7. Registrar primera anotación sin elevarla a gold. CE-203 seleccionará el 20 %
   aleatorio y las disputas; este dossier visible no es una revisión ciega.

Las 20 especificaciones editoriales son un ejemplo de primera anotación,
no una aprobación de las 5.993 pendientes. Antes del cierre hay que completar
ese trabajo y la cobertura de positivos reales exigida por CE-201.
