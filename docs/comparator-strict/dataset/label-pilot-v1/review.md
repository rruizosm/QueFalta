# CE-201/202 — Lote exploratorio de revisión

Propuestas del asistente, NO etiquetas gold. 22 parejas elegidas de la semilla histórica; no representativas.
No se ha realizado tu segunda revisión CE-203 ni sorteado el 20 % del corpus completo.
Revisar evidencia y razonamiento; no aceptar una propuesta por coincidir con un resultado del motor.

Reloj del snapshot: 2026-09-03T08:08:57.223041+00:00. CP 08006 = contexto de prueba, no ubicación acreditada.
En TODAS las parejas: precio, ubicación, disponibilidad y revisiones comerciales = desconocidos.
Los casos rechazados/excluidos conservan esas lagunas; el rechazo no prueba el resto de dimensiones.

| Caso | Origen | Candidato | Propuesta | Motivo |
|---|---|---|---|---|
| R01 | Agua Mineral Natural Tapón Rosca (consum:1191998) | Agua de colonia Gotas Frescas Baby Instituto Español 750 ml (carrefour:2002870135) | excluded_scope | El candidato es colonia, no agua de bebida. |
| R02 | Agua FONT VELLA, 50 cl (plusfresc:003281) | Set 3 Filtros de Agua BRITA MicroDisc (carrefour:2020197538) | excluded_scope | Un filtro de agua no es agua envasada. |
| R03 | Agua Mineral Natural (consum:1192004) | Agua de mar higiene nasal en spray Senti2 pack de 2 unidades de 100 ml. (carrefour:2047290071) | excluded_scope | El spray de higiene nasal queda fuera de agua de bebida. |
| R04 | Agua Mineral Natural Tapón Rosca (consum:1191998) | Tiras adhesivas protectoras de poliuretano Aqua Deliplus surtidas resistentes al agua (mercadona:12779) | excluded_scope | La resistencia al agua de unas tiras adhesivas es ruido léxico. |
| R05 | Yogur Sabor Limón Pack de 4 Unidades (consum:204230) | Galletas con chocolate, leche y yogur Gerblé sin aceite de palma 230 g. (carrefour:521004510) | excluded_scope | Galletas con yogur no son un yogur del piloto. |
| R06 | Yogur natural DANONE, 4 unidades 480 gramos (plusfresc:004447) | Salsa Yogur Hacendado (mercadona:17327) | excluded_scope | Salsa de yogur no equivale a yogur. |
| R07 | Yogur Sabor Fresa Pack de 4 Unidades (consum:204420) | Tortitas de arroz con chocolate blanco sabor yogur Hacendado (mercadona:14141) | excluded_scope | Tortitas sabor yogur no son yogures. |
| R08 | Patatas prefritas Waffle con piel Hacendado ultracongeladas (mercadona:15286) | Pelador Patatas FACKELMANN Cooking 11,5cm - Inox (carrefour:2047790350) | excluded_scope | Un pelador no es un alimento, aunque contenga la palabra patatas. |
| R09 | Patatas prefritas Waffle con piel Hacendado ultracongeladas (mercadona:15286) | Puré de patatas con leche MOUSLINE, 115 g (plusfresc:001410) | excluded_scope | Puré con leche no pertenece al piloto de patatas congeladas comparables. |
| R10 | Agua mineral Solan de Cabras 33 cl. (carrefour:520661019) | Agua mineral SOLAN DE CABRAS, 5 l (plusfresc:000599) | rejected | Misma marca SOLAN DE CABRAS no permite comparar 33 cl con 5 l. |
| R11 | Agua Mineral Natural Tapón Rosca (consum:1191998) | Agua FONT VELLA, 50 cl (plusfresc:003281) | abstain | 0,5 L y 50 cl son la misma cantidad declarada, pero eso no verifica conteo, variantes ni precio local. |
| R12 | Agua mineral Solan de Cabras 33 cl. (carrefour:520661019) | Agua mineral AQUAREL, 33 cl (plusfresc:003588) | abstain | Dos títulos con 33 cl no bastan para aprobar equivalencia ni ahorro. |
| R13 | Patatas prefritas Waffle con piel Hacendado ultracongeladas (mercadona:15286) | Patatas Prefritas Corte Grueso (consum:7028475) | abstain | Ultracongeladas está explícito solo en Mercadona; prefritas no demuestra congelación por sí sola. |
| R14 | Yogur Natural Pack de 8 Unidades (consum:227652) | Yogur natural DANONE, 4 unidades 480 gramos (plusfresc:004447) | rejected | Yogur natural de 8 unidades frente a 4: pack incompatible; natural no acredita endulzado. |
| R15 | Yogur Natural Azucarado Pack de 8 Unidades (consum:230920) | Yogur natural azucarado DANONE, pack 4 unidades 480 gramos (plusfresc:004448) | rejected | Que ambos sean azucarados no permite aceptar 8 unidades frente a 4. |
| R16 | Yogur Sabor Limón Pack de 4 Unidades (consum:204230) | Yogur desnatado con piña ACTIVIA DANONE,  pack 4 uds 480 grs (plusfresc:002684) | rejected | Los perfiles de sabor declarados son limón y piña; el total parecido no elimina la diferencia. |
| R17 | Yogur Sabor Fresa Pack de 4 Unidades (consum:204420) | Yogur desnatado con ciruelas ACTIVIA DANONE, pack 4 unidades (plusfresc:002694) | rejected | Sabor fresa frente a yogur con ciruelas: variante declarada distinta. |
| R18 | Activia Frutas Bosque Yogur Bífidus P-4 ud. (consum:236141) | Yogur líquido frutos silvestres Hacendado 0% MG 0% azúcares añadidos (mercadona:15661) | abstain | Frutas del bosque y frutos silvestres no demuestran misma mezcla, base o subtipo. |
| R19 | Yogur sabores Hacendado 0% MG 0% azúcares añadidos (mercadona:13951) | Yogur natural azucarado DANONE, pack 4 unidades 480 gramos (plusfresc:004448) | rejected | 0% azúcares añadidos frente a azucarado: contradicción explícita de endulzado. |
| R20 | Yogur Natural Pack de 8 Unidades (consum:227652) | Yogur natural azucarado DANONE, pack 4 unidades 480 gramos (plusfresc:004448) | rejected | El rechazo demostrado es por pack de 8 frente a 4; no se atribuye a azúcar que no está documentado en origen. |
| R21 | Agua mineral pequeña Fontébil tapón infantil (mercadona:12975) | Agua mineral FONT VELLA Junior, 33 cl (plusfresc:005162) | abstain | Pequeña/tapón infantil y Junior no verifican volumen ni pack; no calcularlos desde €/L. |
| R22 | Agua mineral con gas FONTER, 1 l (plusfresc:003683) | Agua Mineral con Gas Pack de 6 Vidrio (consum:138297) | rejected | Que ambas aguas tengan gas no compensa 1 l frente a 6 × 0,3 l. |

## Cómo leer las propuestas

- `excluded_scope`: al menos un producto está fuera del piloto; no se declara similitud ni ahorro.
- `rejected`: existe una incompatibilidad explícita; no implica que todos los demás datos sean conocidos.
- `abstain`: faltan datos o hay conflicto; no equivale a un negativo confirmado.
- Cada etiqueta y cita literal está en [annotations.json](annotations.json), ligada a producto, observación y SHA-256.
- Guía completa: [CE-202-labeling-guide.md](../../CE-202-labeling-guide.md).
- Sin positivos reales aprobados: los positivos hipotéticos están aparte en [contracts.json](contracts.json).

La revisión independiente debe registrarse aparte, conservando propuesta, cambios, motivo y evidencia.
Este lote no sustituye el corpus CE-200 ni el muestreo aleatorio/arbitraje de CE-203.
