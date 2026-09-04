# CE-203 — Guía de revisión ciega del propietario

Versión `ce203-owner-independent-review-v1`, 2026-09-03. Esta fase prepara la
segunda revisión acordada; **no atribuye ninguna respuesta al propietario y no
cierra CE-203** hasta que la revisión y el arbitraje se hayan realizado.

## Muestra congelada

- Población: 6.000 parejas con primera anotación cerrada en CE-201/202.
- Muestra aleatoria: 1.200 parejas, exactamente el 20 %.
- Estratificación: familia × cohorte confirmatoria/reto. Se asigna el 20 % de
  forma proporcional mediante restos mayores y se ordena cada celda por SHA-256.
- Casos obligatorios en disputa: 175. Incluyen conflicto de fuente/estado y
  diferencias entre dos anotaciones históricas de la misma pareja.
- 39 disputas ya estaban en la muestra aleatoria; se añaden 136 sin duplicar.
- Revisión total: **1.336 casos**, distribuidos en 54 lotes de hasta 25.

La semilla no se eligió probando resultados. Se deriva una sola vez de la
versión del flujo, el hash del corpus y el recibo inmutable de cierre CE-201/202:

`57eb418dad5f506e53236c211b177425c6c2964b0797fb14988add4435ee81d7`

Repetir el generador con las mismas entradas produce los mismos casos, orden y
hashes. No se permite cambiar la semilla porque un lote resulte fácil o difícil.

## Qué verá el revisor

Cada caso muestra únicamente los campos originales disponibles de ambos
productos, su procedencia, fecha de captura y las observaciones comerciales que
el corpus realmente conserva para 08006 y 25001. También diferencia un campo
ausente de uno seleccionado como `null`.

La vista ciega no contiene:

- propuesta, razonamiento o decisión de la primera anotación;
- predicción, score o ranking de ningún motor;
- motivo de selección, cohorte, estrato o indicador de disputa;
- gold, resultado esperado ni sugerencia de respuesta.

No abrir los antiguos dosieres con propuestas mientras se revisa un lote. La
comparación de opiniones se hará después de guardar la respuesta ciega.

## Cómo rellenar cada caso

Estados permitidos salvo precio: `compatible`, `incompatible`, `unknown` o
`conflicting`. Para precio: `cheaper`, `equal_or_higher`, `invalid`, `unknown`
o `conflicting`.

1. `scope`: ambos productos pertenecen al alcance estricto.
2. `identity`: son el mismo tipo real de producto y uso.
3. `variants`: coinciden todos los atributos aplicables demostrados.
4. `format`: coinciden envases, conteo, cantidad por envase, total, unidad y
   forma de envase. 6×125 g no es 3×250 g; 2 kg no es 1 kg; 1 L no es 1,5 L.
5. `price`: el candidato es más barato en la dirección del caso y con el mismo
   formato comercial.
6. `location`: los dos extremos están acreditados para el mismo CP y canal.
7. `availability`: ambos están disponibles en ese ámbito.
8. `catalog`: publicación y revisiones activas de producto/precio/ubicación son
   coherentes con el reloj del caso.

Decisiones permitidas: `eligible_saving`, `equivalent_no_saving`, `rejected`,
`excluded_scope` o `abstain`. La decisión debe ser coherente con las ocho
dimensiones. Si falta evidencia, usar `unknown` y normalmente `abstain`; no
completar información por semejanza del título.

El motivo debe explicar la decisión y `evidence_refs` debe contener al menos la
referencia de los campos que la sostienen. `needs_arbitration` indica si la
respuesta necesita una confrontación posterior; no revela si la primera
anotación pensaba diferente.

## Reglas estrictas que se conservan

- «Yogur griego» y «griego yogur» pueden expresar lo mismo, pero natural,
  azucarado, sabores, especie/base, grasa, edulcorantes y declaraciones no se
  borran por reordenar palabras.
- El formato debe ser exacto: número de envases, contenido unitario, contenido
  total y recipiente. Igual peso total no basta.
- Agua sin calificar no demuestra «sin gas»; gas, sabor, aditivos y clase de
  agua se revisan por separado.
- Un GTIN válido igual no anula una contradicción de formato o variante.
- Carne, embutidos, granel y peso variable siguen fuera del piloto estricto.
- No existe TTL de 24 horas. Se revisan las revisiones activas producidas por
  sincronización; la edad por sí sola no hace válido o inválido un producto.
- Precio unitario no sustituye el precio del formato exacto ni evidencia de CP,
  stock y publicación bilateral.

## Autoría, arbitraje y cierre

El revisor se registra con el seudónimo `owner-01`; no se añade su cuenta o
correo al dataset. Cada respuesta se guarda separada y no sobrescribe la primera
anotación.

Después de completar los 1.336 casos se confrontarán ambas capas. Toda diferencia
se resolverá con evidencia, sin consultar predicciones. Si no puede resolverse,
seguirá `unknown` o `conflicting`. Esa confrontación y su registro son necesarios
para cerrar CE-203; rellenar el formulario por sí solo no crea gold ni supera G2.

## Reproducción y seguridad

```sh
node scripts/prepare-comparator-strict-owner-review.mjs --artifact=report
node scripts/prepare-comparator-strict-owner-review.mjs --artifact=review --batch=1 --batch-size=25
node scripts/prepare-comparator-strict-owner-review.mjs --artifact=responses --offset=0 --limit=25
node --test scripts/lib/comparator-strict-owner-review.test.mjs
```

El generador es local y solo escribe a la salida estándar. No usa credenciales,
Supabase, retailers, modelos ni datos de producción. Para esta fase una nueva
integración introduciría más superficie y no mejoraría la independencia; se
mantienen archivos locales versionados hasta terminar la revisión.
