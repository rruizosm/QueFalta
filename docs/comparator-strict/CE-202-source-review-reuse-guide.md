# CE-202 — Reutilización de hechos revisados, versión patatas v1

Complementa las guías congeladas ce202-v1 y ce202-corpus-v1; no las sobrescribe.
Permite anotar por familias sin releer la misma observación cientos de veces.
No cambia D01–D14, FR-02, CU-01 ni el umbral de aceptación del comparador.

1. **Revisión editorial de cada ficha.** Selección explícita de IDs, lectura del
   título, campos semánticos originales, formato y árbol original de categorías.
   El revisor escribe hechos y razones por referencia; la familia de muestreo,
   los borradores, GTIN ajenos o scores no generan esos hechos.
2. **Identidad exacta de la evidencia.** Ficha, captura, observación, archivo,
   fila, campo y valores citados; hash del cuerpo revisado. Las categorías se
   vinculan a las filas originales del árbol. Campo ausente y campo null son
   estados distintos, ambos limitados a la proyección adquirida.
3. **Alcance de la revisión.** Confusores: revisión suficiente para el criterio
   de exclusión, `scope_gate_only`. Congelados: atributos y formato,
   `family_attributes_and_format`. No presentar la primera como validación de
   todos los ingredientes y condiciones de venta del producto excluido.
4. **Reutilización restringida.** Una ficha revisada solo sirve para su misma
   observación. Cambios de hecho/fecha/fuente invalidan el hash y requieren
   nueva revisión; no se trasladan al producto equivalente de otra tienda.
5. **Composición declarada.** Las parejas usan esas fichas para comparar cada
   dimensión. Autoría `assistant_source_review_with_deterministic_pair_composition`;
   estado `first_annotation_composed_from_reviewed_sources`. No equivale a
   revisión humana individual. Precio/stock/CP/revisiones se conservan por
   contexto, sin aprobarlos desde una etiqueta semántica.
6. **No equivalencia por coincidencias parciales.** Patata cortada o matriz
   preparada son identidades gruesas; que coincidan no completa variantes.
   Coincidencia fino/fino no demuestra el mismo tamaño exacto. Solo una
   oposición explícita entre valores disjuntos puede demostrar incompatibilidad.
   Las declaraciones completas aún no están acreditadas; variantes no se
   aprueban por rellenar las que el extractor encontró.
7. **Cantidades.** Masa en mg exactos; solo se aprueba firma completa en el
   caso soportado de un envase acreditado. No inferir count=1 por cantidad
   aislada ni desde unidad mínima de compra. Dos cantidades aisladas con roles
   desconocidos no son incompatibles por defecto; una firma de un solo envase
   sí puede descartarse ante una cantidad nominal distinta del otro producto.
   Un EAN coincidente con formato contrario conserva conflicto y abstención.
8. **Trazabilidad de cambios.** Borradores y editoriales anteriores se mantienen.
   La unión de `pair_id` evita contar dos veces E09; un cambio de propuesta
   debe quedar separado para arbitraje, nunca sustituirse silenciosamente.
9. **Segunda revisión.** Propietario, 20 % aleatorio y disputas, todavía pendiente.
   Mostrará primero evidencias/formulario sin estas propuestas. Este dossier
   público entre los participantes está expuesto y no es una revisión ciega.
10. **Sin aprobación automática.** `gold_eligible=false`, revisión independiente
    no completada. Un validador puede comprobar una cita, pero no demuestra que
    su interpretación sea correcta. No cerrar CE-201/202, promover a holdout o
    afirmar precisión del motor por el mero paso de tests.

Este mecanismo es offline y acotado al lote editorial. No es un extractor
general, nuevo esquema Supabase ni algoritmo desplegado de comparación.
