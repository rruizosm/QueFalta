# CE-200 — Corpus completo y punto de reanudación

2026-09-03. **CE-200 completada. F2 continúa; G2 pendiente.**

Retirado el límite acumulado de tiempo y completada la adquisición y el muestreo
autorizados en [CE-BU-002](CE-BU-002-corpus-authority.md). Este cierre entrega
casos para etiquetar, **no 6.000 equivalencias verificadas ni resultados nuevos
para usuarios**. No se ha cambiado o activado el comparador publicado.

## Entregables verificados

- **4.176 referencias comerciales activas** con ID textual, campos originales,
  fechas, precios, ingredientes disponibles, formato y payload del retailer.
- **5.189 observaciones de ubicación**: 1.988 Consum y 3.201 Plusfresc. De ellas,
  1.211 corresponden a ubicaciones del mapa de los dos CP; las restantes son
  contexto de adquisición, no acreditan esos CP.
- **1.701 nodos de taxonomía** de Carrefour, Consum y Plusfresc. Mercadona
  conserva la categoría raíz en el payload de cada producto.
- **6.000 parejas distintas**: 4.000 de muestreo estratificado y 2.000 difíciles,
  sin duplicar la dirección ni contar repetición por CP.
- **1.200 Q = 600 orígenes × 2 CP**, con otros tres destinos por Q: 3.600 casos
  destino R, que no se presentan como otras 3.600 consultas.
- Marco, selección, cuotas, probabilidades, pesos, fuentes y hashes congelados
  antes del etiquetado. **Cero etiquetas gold, cero holdout asignado**.

[Manifiesto](dataset/corpus-v1/manifest.json), [selección](dataset/corpus-v1/selection.json),
[recuentos](dataset/corpus-v1/report.json), [inventario de candidatos](dataset/corpus-v1/pools.json)
y [calidad de datos](CE-200-data-quality.json). Los archivos pairs-*.json y
queries-*.json del directorio corpus-v1 se concatenan en orden de nombre.
Cada proyección, sentencia y respuesta está en dataset/acquisition-v1.

| Tienda | Adquiridas | Agua respaldada | Yogur/bífidus respaldado | Patatas congeladas respaldadas |
|---|---:|---:|---:|---:|
| Carrefour | 2.745 | 295 | 439 | 32 |
| Consum | 488 | 76 | 113 | 8 |
| Mercadona | 490 | 188 | 66 | 7 |
| Plusfresc | 453 | 57 | 219 | 8 |

Son estratos de adquisición, no identidad ni equivalencia gold. Dentro de
yogur/bífidus aún hay que distinguir fermentación, base, variantes, formato y
declaraciones en CE-202. Las **2.668 referencias restantes** se conservan como
adyacentes, fuera de piloto o no resueltas; no se convierten automáticamente en
negativos. Carne, embutidos y peso variable no entran en la muestra confirmatoria.

## Muestreo e independencia

El marco condicionado y documentado tiene **1.439 referencias elegibles y
312.493 parejas entre tiendas**. Excluye grupos expuestos en CE-104/legacy y
colapsa conservadoramente posibles alias dentro de una tienda. Se registran
33 grupos de posibles alias, **sin declararlos identidades GTIN verificadas**.
Los 50 productos de familias respaldadas cuyos grupos estaban expuestos no se
cuentan como referencias confirmatorias nuevas. CE-204 todavía debe resolver
identidades/GTIN y evitar fugas entre particiones.

La semilla ce1-ce200-v1-2026-09-03 estaba declarada antes de las nuevas lecturas.
Se usa muestreo sin reemplazo por ranking SHA-256, con 136 estratos observados
de familia, par de tiendas, evidencia de marca y estructura de envase.

- Agua: **1.682 parejas**; yogur/bífidus: **1.500**.
- Patatas congeladas: **818**, todas las parejas elegibles disponibles. No se
  fabrican las 182 que faltarían para la asignación inicial de 1.000.
- Cada estrato guarda N, n, probabilidad n/N y peso N/n. Son pesos del marco
  documentado, **no del tráfico total de la aplicación**.
- Los 2.000 difíciles son cuatro grupos de 500: contraste de formato observado,
  palabras de variante distintas, evidencia estructurada ausente y confusores
  léxicos ajenos a la familia respaldada. Se informan aparte, sin peso poblacional
  ni etiquetas automáticas de rechazo.

Los 600 orígenes se eligen en 35 estratos; ambos CP son contextos correlacionados
del mismo origen. No tratar Q o parejas que comparten producto como ensayos
Bernoulli independientes. Los inventarios por destino no se limitan al top-50
del futuro recuperador. Mínimos y equivalentes conocidos siguen null hasta
CE-202/208, que deben revisar el conjunto de verdad suficiente.

## Cantidades, variantes y hallazgos prácticos

1. **El título solo no basta.** Mercadona distingue is_pack, contenido total,
   contenido individual y número de unidades. Se conservan todos; no se divide
   un total para inventar unidades. packaging=null no elimina la evidencia
   anidada. Carrefour y Plusfresc no tienen columna packaging en esta proyección:
   cantidades y packs aparecen en título/payload.
2. Hay evidencia real de **agua individual de 1 L** y de packs de botellas, y de
   **yogur 6×125 g** en Mercadona y Carrefour. 750 g sin estructura conocida no se
   convierte en 6×125 g. La futura regla sigue exigiendo el mismo formato.
3. mercadona:61405 es patata congelada de **2 kg**, preservada y presente en
   parejas. consum:7028475 es de **1 kg** y plusfresc:032789 de **500 g**: no se
   ofrecerán como ahorro equivalente por tener un precio de envase menor.
4. mercadona:20559 y carrefour:VC4AECOMM-621804 aportan formato 6×125 g y nombre
   griego natural; mercadona:52441 y carrefour:VC4AECOMM-652994 mencionan azúcar
   de caña. Son evidencia para revisar por dimensiones, no autorización para
   intercambiarlos. «Natural» no prueba ausencia de azúcar.
5. Recuperada la cadena **Patatas → Congelados** de Carrefour, Consum y Plusfresc.
   Evita perder productos cuyo título omite «congelado». Se excluyeron platos
   de pulpo con puré de patata: una palabra compartida y estar congelado no bastan.
6. La categoría «Yogures» contiene postres lácteos, batidos, kéfir y petit.
   Se preservan sus denominaciones y se separan; no inferir yogur solo por la
   categoría ni por parecido del embedding.
7. Persisten carencias: **490/490** ingredientes seleccionados de Mercadona son
   null; Consum no tiene esa columna en la proyección; Plusfresc no aporta columna
   EAN. Carrefour aporta ingredientes en 929/2.745 referencias y Plusfresc en
   337/453. Son recuentos del marco amplio, no precisión del comparador.

Las expresiones del muestreo **no se reutilizan como parser o matcher de F3**.
No se han implementado equivalencias, conversiones destructivas ni supuestos de
stock. «Yogur griego» / «griego yogur» conserva la familia de muestreo, pero
natural/azucarado y negaciones permanecen en la evidencia.

## Ubicación y vigencia

La tabla de precios locales no devuelve filas de Carrefour o Mercadona para
este marco. Consum 575 se asocia por provincia a 08006; **no acredita servicio
exacto**. Consum 25001 sigue sin mapa. Plusfresc usa 3/12 según el mapa local
verificado el 16 de julio: no se afirma haber revalidado ahora la entrega con
el retailer. F5 debe cerrar estas brechas.

Las 4.176 referencias y 5.189 ubicaciones coinciden íntegramente con una segunda
lectura de IDs/huellas de contenido. No se observaron diferencias entre descarga
y verificación. El censo léxico inicial de Plusfresc pasó de 420 a 421 durante
la adquisición; la descarga y verificación incluyen esa referencia, más 32
incorporadas al ampliar por categoría. No se rellenaron recuentos artificialmente.

Es una colección paginada con dos pasadas verificadas y relojes por observación,
**no una transacción snapshot global atómica**. El replay fija su reloj; synced_at
y captura se conservan separados. FR-02: catálogo activo y revisiones,
**sin exigencia de 24 horas**. El snapshot no certifica una compra posterior
ni disponibilidad actual en un CP no acreditado.

## Supabase, recursos e incidencias

Solo se aplicó 20260903101356_comparator_strict_ce200_corpus_authority.sql
(scaffold CLI 20260903101235, nombre alineado al registro remoto). Retira el
CHECK de 300.000 ms acumulados y habilita 50.000 filas / 128 MiB para CE-200.
Conserva reservas previas, cuatro tablas privadas RLS, roles app sin USAGE y
ningún dato comercial escrito. La guarda refleja el cambio; el runtime antiguo
se archiva **con su hash original** para no alterar la evidencia F1.

118 respuestas guardadas: **17.391.429 bytes de transporte (16,59 MiB)**,
incluyendo censos y relecturas. Se reserva conservadoramente capacidad máxima,
sin devolver márgenes no usados. Cierre: **108.246.478 bytes, 34.177 filas y
1.518.920 ms reservados**, incluidos trabajos anteriores; 399 escrituras
técnicas contabilizadas. El tiempo no tiene techo acumulado. Páginas de producto
de 100, ubicación de 200, verificaciones/taxonomía ≤500; concurrencia 1,
statement_timeout de 5 s y lock_timeout de 500 ms.

El panel Pro consultado antes y después mostraba 3,917/250 GB de egress, 0 GB
de exceso y 8 GB provisionados; avisa de retraso de hasta una hora. El corpus
cabe ampliamente en ese margen. **Sin cambios de plan, compute, disco, servicios,
extensiones, cron o cuotas de usuarios.** Cero consultas a retailers, OFF o
modelos de pago; sin descarga de imágenes/vectores/datos personales. Esto no
convierte la factura existente en cero ni en uso ilimitado.

Se registraron y corrigieron dos incidencias, sin ocultarlas como éxitos:

- Un censo con hash agregado excedió 5 s: cancelado, reserva conservada y trabajo
  reconciliado. Se separó el censo ligero de la verificación paginada.
- Dos lecturas del reloj diferían un microsegundo al reservar el lease: el CHECK
  rechazó la transacción **antes del catálogo**. Se usa un único reloj; no hubo
  reserva parcial ni avance del cursor. Añadida prueba de regresión local.

La versión final del protocolo aporta 61 operaciones correctas incluida salud
final; no basta para certificar un baseline de rendimiento. La prueba histórica
de hashes detectó el cambio intencional de política: ahora comprueba ambas
versiones sin modificar la evidencia F1.

[Cierre remoto](CE-200-remote-closure.json): 119 jobs CE-200 correctos, uno
reconciliado, **0 sin resolver, 0 controles, 0 identidades de prueba, 0 bloqueos y
0 consultas ajenas activas de más de 30 s** en la comprobación puntual.
Los avisos RLS sin policies son esperados en tablas privadas sin grants;
persisten avisos previos ajenos a CE-200. No se declara PASS de capacidad ni
se modifican esos objetos por arrastre.

## Reproducción y siguiente tarea

    node scripts/prepare-comparator-strict-corpus.mjs --artifact=report
    node scripts/prepare-comparator-strict-corpus.mjs --artifact=manifest
    node scripts/audit-comparator-strict-corpus.mjs
    node --test scripts/tests/comparator-strict-corpus-evidence.test.mjs
    npm run quality

Comandos offline, stdout, sin cargar credenciales ni escribir fuentes. El
manifiesto identifica código y fuentes. Las pruebas verifican hashes,
reconstrucción exacta, pesos, ausencia de duplicados, familias/tiendas,
600 orígenes, contextos desconocidos y rechazo de fuentes modificadas.
Migración y lector también tienen pruebas de PostgreSQL embebido; no se
presentan como otra prueba de estrés remota.

Validación final: **404/404 tests PASS, TypeScript y lint PASS**, más 14
comprobaciones del lector/migración en PostgreSQL embebido. `git diff --check`
correcto. La semilla histórica y los archivos protegidos de la app conservan
sus huellas. [Evidencia de cierre y hashes](CE-200-closure-evidence.json).

**Siguiente: CE-201/202**, etiquetar este corpus por dimensiones con citas
originales. Después CE-203: propietario revisa disputas y 20 % aleatorio;
CE-204/205: entidades/particiones/holdout; CE-206–208: harness, negativos
operativos, reloj y mínimos conocidos. Ninguna de ellas queda cerrada al generar
las parejas. No repetir extracción ni canario F1.

**Integraciones:** CE-200 no necesita ninguna nueva. En F4 conviene evaluar
ingredientes/atributos de Mercadona y Consum mediante datos existentes y OFF
con GTIN/pack verificados; Plusfresc necesita identificación fiable. OFF no
prueba precio ni stock local. pg_jsonschema puede valorarse en F3 para contratos
estructurados; no sustituye la evidencia. No contratar ni instalar antes de
medir cobertura y utilidad.

Las guías Supabase/Postgres han influido en paginación, reservas duraderas,
separación del censo pesado y transacciones cortas; no en relajar equivalencia
o convertir ausencias en defaults.
