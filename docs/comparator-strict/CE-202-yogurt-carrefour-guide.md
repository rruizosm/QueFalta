# CE-202 — Revisión editorial Carrefour, yogures v1

2026-09-03. Capa local independiente `ce202-yogurt-carrefour-v1`.
Extiende el [contrato de yogures](CE-202-yogurt-source-review-guide.md),
sin modificar sus archivos congelados ni el comparador publicado.

## Cobertura y procedencia

545 observaciones Carrefour pendientes leídas en español: título y nombre
original, denominación, ingredientes, alérgenos, conservación, preparación,
nutrición, EAN, campos de unidad comercial y árbol original de categorías.
445 se revisan por atributos/formato; 100 solo por exclusión de alcance.
281 no tienen denominación ni ingredientes: leerlas no completa esos datos.
Cada literal citado se vincula a archivo, fila, observación, captura y hash.
Se distingue un campo nulo de uno ausente de la proyección.

Las tablas contienen transcripciones editoriales explícitas por referencia.
No son etiquetas producidas por borradores, embeddings o una regex.
El lector numérico solo contrasta los hechos transcritos con sus literales.
Las 431 fichas previas se reutilizan intactas para la misma observación.
En total quedan registradas las 976 observaciones del bloque de muestreo
yogur, incluidos confusores: no significa 976 yogures válidos del piloto.

Se componen 2.011 parejas del corpus, con ambos extremos revisados.
Cuatro ya tenían anotación editorial (E05/E06/E07/E17): solo **2.007**
aumentan la cobertura. No contar contextos postales ni nuevas versiones
como nuevas parejas. La unión pasa a 3.517; faltan 2.483 de agua.

## Formato estricto

- «6 unidades de 125 g» acredita 6×125 g y total 750 g; 4×125 g, 6×120 g
  y una cantidad aislada de 750 g no acreditan el mismo formato.
- `sell_pack_unit=1` también aparece en multipacks; no acredita un envase.
  Peso de referencia de precio y base nutricional por 100 g no son formato.
- «4 unidades 115 g» conserva conteo cuatro y cantidad de papel desconocido.
  No introducir la relación «de» por contexto, marca o aritmética.
- «4 unidades de125 g» conserva relación explícita aunque falte un espacio;
  «pack d 4 unidades de 160 g» también conserva la relación unidades/contenido.
- Cantidad aislada: sin inferir count=1. `1,5 l` se normaliza exactamente a
  1.500 ml; `1 kg`, a 1.000.000 mg. Nunca convertir masa en volumen por densidad
  inventada ni por `measure_unit` del precio.
- VC4AECOMM-225693 dice «4 unidades 25 g»: conservar literal y conteo,
  señalar anomalía y no activar 25 g como veto; tampoco corregir a 125 g.
- VC4AECOMM-720359 termina en «pack» sin cantidades: firma desconocida.
- Surtidos necesitan reparto por receta. Ocho unidades y cuatro sabores no
  prueban dos unidades de cada uno. Componentes numéricos inequívocos todavía
  pueden sostener un rechazo independiente, no una firma completa.

## Semántica y anomalías

Natural no demuestra sin añadido. Azúcar añadido, azúcares totales y
edulcorantes se registran por separado. La lista puede declarar azúcar y
edulcorantes simultáneamente. No atribuir características por Danacol,
Benecol, YoPro u Oikos. El orden de palabras no aporta identidad adicional:
los hechos declarados sí; esta capa no implementa todavía el normalizador F3.

Grasa del ingrediente leche no es una alegación del producto final.
Light no equivale a 0% ni desnatado. VC4AECOMM-715028 enfrenta desnatado
(título) y semidesnatado (denominación): conflicto, sin jerarquía automática
ni resolución por cifras nutricionales. Un campo omitido no es contradicción.

Base vegetal o sin lactosa no prueban por sí solos ausencia de lácteos.
Colágeno, vitaminas, proteínas, esteroles, cereales y complementos se conservan
en fuentes/notas; no se certifica fórmula completa con los atributos parciales.
Kéfir puede figurar solo en denominación/ingredientes. Skyr explícitamente
denominado queso se excluye por esa evidencia; otros skyr siguen sin homologar.
Yogur infantil se distingue de puré infantil con yogur como ingrediente.

Ocho fichas nuevas para arbitraje documental:
prod395624 y VC4AECOMM-127708 (recetas contradictorias), prod64313 y
VC4AECOMM-593783 (nutrición sospechosa), VC4AECOMM-225693 (cantidad),
VC4AECOMM-384263 (lista parcial de surtido), VC4AECOMM-593780 (coco declarado
sin detalle en lista), VC4AECOMM-715028 (grasa). No todas las anomalías
invalidan una diferencia independiente de formato. Un conflicto explícito
en una dimensión sí tiene precedencia y exige abstención.

### Relaciones y versiones

Contrato de fichas `ce202-yogurt-source-review-v1` preservado. Política de
relaciones versionada en esta capa: cacao/chocolate/stracciatella no se
declaran sabores disjuntos por usar etiquetas distintas. La relación queda
desconocida, no compatible. Afecta a una pareja de este lote, cuyo rechazo
por formato sigue vigente. No se modifican parejas ni hashes anteriores.

La anotación E07 anterior rechazaba fresa frente a macedonia. La composición
conservadora actual trata macedonia como grupo amplio y se abstiene, aunque
el formato 4×120 g coincide. **Desacuerdo editorial pendiente del propietario**,
no corrección silenciosa ni decisión gold. Ambas versiones se conservan.
Los cambios de alcance/identidad de E05/E06/E17 se enumeran en el informe;
sus decisiones finales no cambian.

## Comercio y cierre

Se conservan vínculos Consum y Plusfresc 3/12 para los dos contextos del
corpus. No inventar disponibilidad Carrefour por CP desde catálogo global,
ni homologar stock, precio o condición promocional bilateral. Continúa FR-02:
catálogo activo y revisiones, sin TTL comercial artificial de 24 horas.

Primera anotación compuesta desde fuentes, no revisión humana individual,
evaluación del motor ni gold. Las 108 parejas con formato compatible no
prueban equivalencia completa. CE-201/202 abiertas; CE-203 del propietario,
20% aleatorio más disputas, todavía sin sorteo. Se necesitan positivos
íntegros respaldados para cerrar CE-201: cero positivos documentados no
demuestra que el catálogo carezca de equivalentes ni justifica forzarlos.

No se necesitan integraciones nuevas para esta lectura offline. Para
completar evidencia faltante, priorizar detalle oficial y trazable del mismo
SKU/pack; un catálogo externo u OCR solo podrán proponer datos con procedencia,
confianza y revisión. No contratar, enriquecer ni activar ese flujo en este lote.
