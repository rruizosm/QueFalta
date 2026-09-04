# CE-201/202 — Carrefour completado como bloque de fuentes

2026-09-03. Continuación autorizada por «adelante».
**CE-201 y CE-202 siguen EN CURSO.** Se termina la lectura y registro de las
observaciones pendientes del bloque de muestreo yogur, no la validación
íntegra de equivalentes, CE-203 ni G2.

## Resultado de este lote

- 545 fichas Carrefour nuevas: 445 por atributos/formato y 100 por exclusión
  de alcance. Las 431 fichas anteriores se reutilizan sin modificar bytes.
- Quedan registradas las 976 observaciones del bloque yogur, incluidos
  confusores. No son 976 productos aprobados como yogur equivalente.
- 2.011 parejas compuestas desde fuentes revisadas; cuatro ya constaban
  en editoriales. Se añaden **2.007 parejas únicas** al acumulado.
- Unión: **3.517/6.000 parejas con primera anotación**; **2.483 pendientes**,
  todas del bloque agua. Los 13 retos complementarios no se suman al corpus.

| Propuesta | Composiciones de este lote | Parejas nuevas, sin los cuatro solapes |
|---|---:|---:|
| Rechazo por diferencia acreditada | 1.001 | 999 |
| Exclusión del piloto | 169 | 168 |
| Abstención por evidencia insuficiente/conflicto | 841 | 840 |
| Total | 2.011 | 2.007 |

Son propuestas editoriales reproducibles, **no revisiones humanas individuales
de cada pareja ni resultados del motor publicado**. Los solapes E05/E06/E07/E17
se enumeran en el informe; no se suman dos veces ni sobrescriben sus versiones.

264 fichas nuevas tienen formato completo y 108 parejas de este lote tienen
formato bilateral compatible. Esto no aprueba sus variantes ni el comercio.
Hay **cero equivalencias completas, gold y ahorros acreditados**. No significa
que no existan equivalentes en el catálogo: faltan pruebas para aprobarlos.
No cerrar CE-201 sin positivos íntegros ni presentar abstención sistemática
como un comparador útil.

## Hallazgos que quedan incorporados al trabajo

1. **281 fichas sin denominación ni ingredientes.** El título por sí solo
   no completa especie, receta, funcionalidad o ausencia de azúcar/edulcorantes.
   Los campos nulos y los ausentes quedan diferenciados.
2. **Unidad de venta y envases no son lo mismo.** `sell_pack_unit=1` aparece
   en packs de cuatro u ocho. Se exige relación explícita entre conteo y peso;
   «4 unidades 115 g» no se transforma en 4×115 g. No usar 100 g nutricionales
   como tamaño del producto. No convertir kg/ml por la unidad del precio.
3. **Cantidad sospechosa sin autocorrección.** VC4AECOMM-225693 declara 25 g
   en un pack de cuatro. Se preserva el literal, pero no se usa como cantidad
   fiable para rechazar; no inventar 125 g. VC4AECOMM-720359 ni siquiera declara
   cantidad tras la palabra pack.
4. **Nombre, denominación e ingredientes se contrastan.** VC4AECOMM-715028
   enfrenta desnatado/semidesnatado. VC4AECOMM-945603 omite azucarado en título
   pero lo declara en detalle: omisión no es negación. Porcentajes de grasa de
   la leche ingrediente no son alegaciones finales del yogur.
5. **No completar recetas desde marcas.** Benecol/Danacol no acreditan
   esteroles por su nombre; YoPro no basta para registrar alegación proteica;
   Oikos no basta para estilo griego. Colágeno, cereal, galletas y grageas no
   deben desaparecer al reducir un producto a yogur más sabor.
6. **Alcance real, no palabra clave.** Kéfir puede aparecer solo en detalle;
   una salsa, un cosmético, comida para mascotas o porridge con yogur no son
   yogures del piloto. Un yogur infantil no se excluye automáticamente como
   potito, ni todos los skyr se convierten en queso por analogía.
7. **Surtidos y sabores relacionados.** No inventar distribución de envases
   entre recetas. Cacao/chocolate/stracciatella se conservan como perfiles
   relacionados no resueltos, no como sabores necesariamente disjuntos ni
   equivalentes. Un ajuste de relación de este lote mantiene el rechazo
   independiente por formato.

Ocho fichas nuevas con anomalía o conflicto documental; 46 parejas de este
lote enlazan alguna ficha en disputa, incluidas las previas. Se conservan
dos anomalías nutricionales y listas de ingredientes parciales/contradictorias,
sin copiar una corrección de productos vecinos. Una anomalía ajena al formato
no elimina necesariamente una diferencia de formato independiente; un conflicto
explícito de dimensión tiene precedencia y fuerza abstención.

### Desacuerdo editorial E07

Fresa Carrefour frente a macedonia Mercadona: ambos 4×120 g. E07 proponía
rechazar por sabor; el contrato conservador de fuentes mantiene macedonia como
grupo amplio y ahora propone abstenerse. Ambas versiones se conservan para
**arbitraje del propietario**, sin convertir ninguna en gold. E05/E06 refinan
alcance e identidad y E17 limita la revisión a exclusión; sus decisiones no
cambian. Ver `overlapping_previous_annotations` en el informe.

## Comparación con los borradores congelados

De 2.011 propuestas, 738 cambian respecto al borrador: 570 abstenciones pasan
a rechazo, 150 a exclusión y 18 rechazos pasan a exclusión. Otras 1.273
mantienen su decisión. El informe conserva la matriz exacta de transiciones.

No son 738 errores de producción corregidos ni una medida de precisión o
recall. Se comparan borradores con primeras propuestas desde fuentes, todavía
sin arbitraje independiente, particiones ni evaluación del motor.

## Evidencia y comprobaciones

- [Guía editorial](CE-202-yogurt-carrefour-guide.md).
- [Dossier legible](dataset/label-yogurt-carrefour-v1/review.md),
  [545 fichas y citas](dataset/label-yogurt-carrefour-v1/products.json),
  [índice de parejas](dataset/label-yogurt-carrefour-v1/index.json),
  [informe](dataset/label-yogurt-carrefour-v1/report.json) y
  [manifest](dataset/label-yogurt-carrefour-v1/manifest.json).
- [Recibo de evidencia](CE-201-202-yogurt-carrefour-evidence.json).
- [Lote Plusfresc anterior, intacto](CE-201-202-yogurt-plusfresc-progress.md).

```sh
node scripts/prepare-comparator-strict-yogurt-carrefour.mjs --artifact=report
node scripts/prepare-comparator-strict-yogurt-carrefour.mjs --artifact=annotations --offset=0 --limit=20
node --test scripts/lib/comparator-strict-yogurt-carrefour.test.mjs scripts/tests/comparator-strict-yogurt-carrefour-evidence.test.mjs
npm run quality
```

**35/35 pruebas nuevas PASS**; TypeScript y lint PASS; **567/567 tests PASS**,
cero fallos ni saltos. Se verifican todas las citas, hashes, cobertura exacta,
reproducción, incertidumbres y conservación de artefactos/código productivo.
Un test nuevo inicialmente equiparaba conteo/peso explícitos con firma completa
de un surtido: se corrigió el test para conservar el reparto desconocido, no
se relajó la regla. Durante el desarrollo se ajustó el lector de literales
para «de125» y la contabilidad para conservar cuatro solapes editoriales.
Los tests no sustituyen la revisión humana de las interpretaciones.
Persiste el aviso preexistente de Node sobre módulo TypeScript sin tipo
declarado; no se ha cambiado package.json para silenciarlo.

## Siguiente paso exacto

1. Continuar CE-201/202 con las **2.483 parejas de agua** y sus fuentes:
   clase, gas, sabores/aditivos y formato nominal exacto. Nueva capa editorial
   desde el corpus congelado; no repetir CE-200, canarios ni lectura completa
   de yogures salvo disputa o necesidad concreta de completar evidencia.
2. Completar cobertura y **positivos íntegros demostrables**, incluidos
   atributos obligatorios y contexto comercial bilateral. No forzar positivos,
   degradar reglas de formato ni aceptar cero resultados como éxito.
3. Preparar CE-203 en su fase: el propietario revisa un 20% aleatorio y todas
   las disputas, incluyendo E07. No se ha sorteado ni realizado esa revisión.
   CE-203–208, gold, holdout y G2 no quedan iniciados o aprobados por este lote.

Continúa FR-02: productos activos y revisiones, sin TTL comercial de 24 horas.
Las observaciones Consum/Plusfresc por contexto conservan procedencia, no
acreditan por sí solas disponibilidad/precio bilateral aplicable a cada CP.

No se necesitan integraciones nuevas para terminar esta lectura offline.
Antes de incorporar otro buscador o modelo, resolver fuentes faltantes y
contradicciones mediante evidencia oficial del mismo SKU/pack; fuentes externas
u OCR requerirían trazabilidad, licencia/coste y validación explícitos. No se ha
instalado ni contratado nada. Cero consultas al proyecto/retailers y cero
escrituras de app, SQL, cron, syncs o embeddings; sin despliegue, commit o push.
