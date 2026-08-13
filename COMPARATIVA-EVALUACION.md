# Evaluación del comparador entre supermercados

> Contrato de calidad previo a embeddings y a cualquier activación de la UI.
> Estado: 400 candidatos generados el 9 de agosto de 2026; revisión humana
> pendiente.

## Objetivo

Medir si el sistema recupera alternativas útiles sin presentar equivalencias
engañosas. El conjunto de evaluación debe comparar el baseline léxico actual,
las reglas estructuradas y la futura recuperación híbrida con embeddings.

La fuente de verdad son pares revisados manualmente. Open Food Facts queda
excluido como fuente de GTIN/EAN y como autoridad para etiquetar pares.

## Etiquetas

| Etiqueta | Condición necesaria | Uso permitido |
| --- | --- | --- |
| `identico` | Mismo GTIN global válido y misma unidad de consumo | «Mismo producto» |
| `comparable` | Misma necesidad, variante compatible y base de precio comparable | Ahorro principal |
| `sustituto` | Relacionado, pero cambia variante, formato o necesidad | Recomendación secundaria futura |
| `no_relacionado` | Familia distinta o atributo excluyente | Nunca mostrar |

Un GTIN con checksum válido pero prefijo restringido no demuestra identidad
entre cadenas. Los productos con varios GTIN tampoco se fuerzan dentro de una
columna individual.

## Reglas duras

Un par no puede etiquetarse como `comparable` si incumple alguna regla:

1. La base de precio debe coincidir: `l` con `l`, `kg` con `kg`, `ud` con `ud`.
2. Los atributos excluyentes deben coincidir: sin lactosa, vegetal, infantil,
   sin gluten, sin azúcar, bio, alto en proteína y equivalentes que se añadan.
3. El formato debe representar una compra comparable. Una diferencia de
   cantidad extrema se excluye aunque el precio unitario coincida.
4. La disponibilidad y el precio deben corresponder a la región efectiva.
5. Los frescos o productos a granel sin formato fiable no se usan en el ahorro
   principal hasta disponer de datos suficientes.

## Composición del conjunto

Objetivo: 300–500 pares, con al menos:

- 25 % comparables claros;
- 20 % falsos positivos difíciles;
- 15 % variantes con atributos excluyentes;
- 10 % español/catalán con nombres distintos;
- 10 % formatos o cantidades incompatibles;
- 10 % marca nacional con GTIN global;
- 10 % frescos, granel y casos sin información suficiente.

Cada cadena debe aparecer como origen y como destino cuando sus datos lo
permitan. Caprabo, Eroski e HiperDino no se evaluarán para ahorro hasta que
tengan precio unitario; sí pueden aportar casos de identidad o recuperación.

## Campos del dataset

El fichero generado `supabase/experiments/comparator-evaluation-candidates.csv`
contiene las señales automáticas y mantiene `human_label` vacío. Tras revisar un
par, se incorpora al conjunto de referencia
`supabase/experiments/comparator-evaluation-pairs.csv`. Ambos usan:

- identificadores y tiendas de origen/destino;
- nombre, marca, GTIN, precio unitario, unidad y cantidad de ambos productos;
- scores léxico y vectorial;
- etiqueta humana, atributos bloqueantes, motivo y revisor;
- versión del matcher para reproducir cada resultado.

La generación se repite con:

```powershell
node .\scripts\build-comparator-evaluation.mjs
```

El script es de solo lectura y produce además
`comparator-evaluation-summary.json`. Los valores `automated_suggestion` y
`automated_reason` sirven para priorizar la revisión; nunca se copian
automáticamente a `human_label`.

La revisión humana se realiza con guardado después de cada decisión:

```powershell
$env:REVIEWER='nombre'; node .\scripts\review-comparator-evaluation.mjs
```

El revisor muestra ambos productos y las señales disponibles, pero exige una
etiqueta y un motivo explícitos. Cada decisión actualiza el candidato y regenera
`comparator-evaluation-pairs.csv` únicamente con las filas revisadas.

También vuelve a mostrar automáticamente las filas con GTIN global coincidente
que no estén etiquetadas como `identico`, para resolver conflictos del contrato.

Las métricas se calculan con:

```powershell
node .\scripts\evaluate-comparator-baseline.mjs
```

El informe bloquea la siguiente fase si quedan pares pendientes, etiquetas
inválidas o conflictos de GTIN.

### Primera generación

La primera ejecución leyó los 172.076 productos publicados y produjo 400 pares
sin modificar Supabase:

| Grupo | Pares |
| --- | ---: |
| GTIN global coincidente | 122 |
| Candidato léxico con unidad compatible | 138 |
| Falso positivo difícil | 140 |

Las 15 cadenas aparecen como origen. La sugerencia automática distribuye 122
`identico`, 121 `comparable`, 140 `no_relacionado` y 17 `revisar`. Estas cifras
no son métricas de calidad: `human_label` permanece vacío en los 400 pares.

La inspección inicial confirma que el conjunto contiene precisamente los casos
que debe resolver la siguiente fase: productos con vocabulario casi idéntico
pero función distinta, variantes incompatibles y candidatos con la misma unidad
que siguen sin ser comparables. Por ejemplo, compartir «merluza» y unidad no
convierte automáticamente palitos rebozados y centros de merluza en alternativas
equivalentes.

## Resultado de la revisión y baseline híbrido

La revisión terminó con 400/400 pares etiquetados, 0 etiquetas inválidas y
0 conflictos de GTIN. La distribución final es 122 `identico`, 178
`comparable` y 100 `no_relacionado`.

El prototipo offline `scripts/prototype-comparator-hybrid.mjs` combina GTIN
global, reglas duras de unidad/atributos y las señales léxicas existentes. No
consulta Supabase ni modifica datos. El punto conservador seleccionado es
0,525: precisión de `comparable` 99,2 %, precisión de GTIN 100 % y 86,25 % de
exactitud global. El detalle reproducible queda en
`supabase/experiments/comparator-hybrid-prototype-metrics.json`.

Es un baseline de seguridad, no la implementación final de embeddings: la
siguiente fase debe probar si la recuperación vectorial aumenta la cobertura
sin bajar esas precisiones.

## Métricas y puertas de salida

- Precisión de `identico`: 100 % en la muestra; cualquier error bloquea salida.
- Precisión de `comparable` mostrado: al menos 98 %.
- Falsos positivos con atributo excluyente: 0.
- Comparaciones entre bases de precio distintas: 0.
- Cobertura/recall: se mide, pero no justifica reducir los mínimos de precisión.
- Latencia de lectura: se medirá sobre matches precalculados, no llamando a un
  modelo desde el modal.

## Protocolo de revisión

1. Un primer revisor etiqueta sin ver el score del algoritmo.
2. Los casos `identico`, ambiguos o con atributo bloqueante tienen segunda
   revisión.
3. Los desacuerdos no se fuerzan: quedan pendientes y no entran en el conjunto
   de alta confianza.
4. Cada cambio de reglas o modelo crea una nueva `match_version`; nunca se
   sobrescriben resultados históricos sin conservar su procedencia.
