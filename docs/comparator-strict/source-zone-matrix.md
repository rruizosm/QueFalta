# CE-004 — Matriz de fuentes y zonas del piloto

> 2026-09-02 · versión 1.0 · CE-004 COMPLETADA.
>
> Alcance de evaluación confirmado por el propietario; no es una activación.
> F0 sigue en curso. Reglas D01–D14 y CU-01 sin cambios.

## 1. Alcance aceptado

Evaluar **Mercadona, Carrefour, Consum y Plusfresc** para agua, yogur y patatas
congeladas de formato fijo, con dos CP de referencia:

- **08006, Barcelona**: contraste entre almacén, zona y centro; Plusfresc tiene
  un centro distinto del de referencia de su catálogo.
- **25001, Lleida**: contraste dentro de la misma comunidad, sin asumir que una
  observación de Barcelona o València sea válida aquí.

Son CP de prueba elegidos del contexto técnico, no datos extraídos de perfiles
ni una inferencia sobre el domicilio del usuario. Cataluña es el ámbito
aceptado del piloto acotado, no una exclusión futura de otras comunidades.

Las cuatro tiendas son **candidatas a evaluación**, no cuatro fuentes ya aptas
para mostrar ahorro en ambos CP. Se probarán como origen y destino, excluyendo
la propia tienda como destino y respetando las preferencias del usuario.
No fijar Mercadona como único origen ni ofrecer una tienda no seleccionada.

Motivo de selección: Mercadona comprueba el precio del almacén de origen;
Carrefour pone a prueba la pérdida de precisión al agrupar por CCAA; Consum
aporta EAN y precios por zona; Plusfresc permite contrastar centros de reparto.
No se ha medido todavía cobertura de equivalentes por familia: corresponde a F2.

## 2. Capacidad observada y brechas

| Tienda | Fuente existente | Qué falta para un resultado estricto local | Seguimiento |
|---|---|---|---|
| Mercadona | `mercadona_products`: `source_wh`, `regions`, precio, formato y fecha; API por almacén en el cliente | El espejo conserva una sola observación con prioridad de almacén, empezando por `mad1`; aparecer en `regions` no demuestra precio/stock del almacén del CP | CE-504/505: resolver almacén y conservar observación del mismo contexto también para el origen |
| Carrefour | `carrefour_products`: precio base, `regional_prices` y `regions`; sync con CP representativo por CCAA | El precio de `Catalunya` procede del CP de muestreo, no de todos sus almacenes; falta identidad comercial de la zona observada y su resolución para cada CP | CE-504/505: CP → almacén, trazabilidad de la observación y vigencia; sin herencia silenciosa |
| Consum | `consum_products` + `catalog_location_prices`; cinco `X-TOL-ZONE`; EAN y formato estructurado/parcial | El mapeo del cliente es por prefijo provincial y solo cubre cinco provincias; no prueba servicio al CP exacto. No inventar una zona para Lleida | CE-504/505: resolución fiable, observación por zona y datos obligatorios de identidad |
| Plusfresc | `plusfresc_products` + `catalog_location_prices`; ocho centros y mapa explícito CP → centro | Revalidar el mapa y las observaciones, su disponibilidad y la semántica del formato; el indicador almacenado no sustituye la evidencia del origen | CE-504/505: CP → centro vigente y precio/stock de ese centro |

La consulta remota confirma filas en `catalog_location_prices` para Consum,
Plusfresc y BM. No hay filas de Mercadona/Carrefour en esa relación en la captura.
Eso no implica que no tengan precios en sus espejos ni que BM deba añadirse
automáticamente al piloto. No se crea otra tabla por defecto: F3/F5 decidirán
si ampliar la existente o usar almacenamiento CE-1, tras revisar consumidores.

## 3. Matriz CP × tienda

Esta tabla describe el conocimiento actual; **ninguna celda certifica todavía
una alternativa de CE-1**. Las asociaciones son locales/documentadas y no se han
revalidado contra los retailers durante CE-004.

| CP | Mercadona | Carrefour | Consum | Plusfresc |
|---|---|---|---|---|
| 08006 | Almacén exacto pendiente; no copiar `mad1` por defecto ni asumir `bcn1` | El sync muestrea `08001` para `Catalunya`; no equipararlo a `08006` sin demostrar mismo almacén | El helper devuelve zona `575` por prefijo `08`; el sync la referencia con `08201`. Validar servicio/ámbito del CP | El mapa local devuelve centro `3`; revalidarlo y usar su fila de precio, no la de `12` |
| 25001 | Resolver almacén y precio del producto en él; no deducirlo de `ES-CT` | No hay observación específica de este CP en el muestreo por CCAA; resolver almacén antes de heredar un precio | El helper devuelve `null`: zona desconocida. No usar València `147` como precio local | El mapa local devuelve centro `12`; revalidar ámbito, precio y disponibilidad |

Consum sin mapeo no equivale a «Consum no tiene servicio»: significa **no
verificado**. Igualmente, un CP no incluido en el mapa de Plusfresc no autoriza
a usar su centro base. El selector «Toda España», CP ausente/inválido y cambio
de CP se incluyen como casos negativos, no como nuevas zonas de lanzamiento.

## 4. Condición de habilitación de cada contexto

Antes de activar tienda/CP/familia en F8 deben cumplirse los gates del plan y:

1. Resolver y versionar CP de prueba → almacén/zona/centro y canal de venta.
2. Conservar precio y disponibilidad observados del origen y de cada destino,
   con fecha, fuente y ubicación. No inferir stock de `published` ni certeza de
   una disponibilidad que el extractor haya completado por defecto.
3. Completar identidad y firma de formato; aplicar D01–D14 y FR-02 (catálogo
   activo y versiones, sin TTL de 24 h). Una zona correcta no compensa un pack incorrecto.
4. Probar el contexto con origen y al menos un destino de otra tienda elegibles;
   si solo una tienda puede verificarse, mantener ese contexto sin activación
   de ahorro hasta cubrir otra. No saltarse G2/G5/G7 para lanzar un piloto vacío.
5. Distinguir «sin equivalente», «sin ahorro», «datos insuficientes» y «sin
   cobertura verificada». No garantizar un equivalente para cada búsqueda.

CU-01 se mantiene: no descontar sin al menos una alternativa válida más barata
incluida en una respuesta final correcta; no rellenar para consumir un uso.

## 5. Frescura y coste de actualización

Captura remota de 2026-09-02 20:23 UTC, mediante agregados de solo lectura:

| Fuente | Último sync global UTC | Horario existente según CE-001 |
|---|---|---|
| Mercadona | 2026-09-01 13:49:13 | Lunes 06:00 UTC |
| Carrefour | 2026-08-31 09:22:40 | Windows, lunes 08:00 local documentado; instalación no comprobada |
| Consum | 2026-09-01 13:12:26 | Lunes 07:30 UTC |
| Plusfresc | 2026-09-01 12:51:13 | Lunes 10:40 UTC |

La muestra de las primeras 200 filas publicadas por `product_id` en cada una de
las ubicaciones siguientes confirma que las observaciones locales tampoco son
necesariamente recientes:

| Ubicación | Filas examinadas | Precio positivo | `available=true` | `synced_at` de todas las filas de la muestra, UTC |
|---|---:|---:|---:|---|
| Consum 575 | 200 | 200 | 200 | 2026-09-01 13:10:38 |
| Plusfresc 3 | 200 | 200 | 195 | 2026-09-01 12:49:13 |
| Plusfresc 12 | 200 | 200 | 196 | 2026-09-01 12:49:13 |

Son 600 filas, no 600 equivalentes. Muestra no aleatoria ni estratificada por
familia, sin exportar productos o perfiles; no estima precisión ni cobertura.
Las fechas están unas 31 horas antes de la captura. La propuesta inicial de
TTL de 24 h las habría excluido, pero fue descartada por el propietario en
FR-02: esa edad ya no las excluye ni las convierte automáticamente en elegibles.
`synced_at` se asigna al inicio del run; no sustituirlo por lectura de caché o
`updated_at` general como si fueran nuevas observaciones del retailer.

Validar y reconciliar contra el catálogo activo según FR-02; no exigir un
refresco externo para satisfacer el TTL descartado. No aumentar frecuencia de
todos los syncs ni ejecutar un sync completo con una
bandera parcial que pueda despublicar filas fuera de la muestra. Presupuesto y
límites de estas operaciones en [budget.md](budget.md).

El README de Consum conserva referencias antiguas a ejecución diaria y precio
anónimo; prevalecen para este alcance el código multi-zona y el workflow
semanal, contrastado con CE-001. No se ha modificado el scheduler de ninguna tienda.

## 6. Fuera del piloto y expansión

El resto de tiendas continúa en legacy sin cambios. Bonpreu/bonÀrea se mantienen
como casos de regresión del problema HNSW, sin convertir los huevos en una cuarta
familia. DIA añade sesión/CP y precio de primera zona; incorporarlo será otra
decisión de alcance. HiperDino no se incorpora a CP peninsulares; BM/Hipercor no
se habilitan por aparecer en tablas de backend. Ninguna exclusión declara que
esas tiendas sean malas fuentes en general.

Después de validar estas tres familias y las zonas aceptadas, ampliar una
combinación tienda/zona cada vez, con evidencia, presupuesto y aceptación
propios. No añadir una tienda solo para mejorar la cifra de resultados.

## 7. Evidencia y estado

- Captura reproducible: [CE-004-evidence.json](CE-004-evidence.json).
- Precios locales: [catalog_location_price_history.sql](../../supabase/migrations/catalog_location_price_history.sql).
- Mapeo cliente: [retailerZones.ts](../../src/constants/retailerZones.ts).
- Extractores: [Mercadona](../../scripts/sync-catalog.mjs),
  [Carrefour](../../scripts/sync-carrefour.mjs), [Consum](../../scripts/sync-consum.mjs),
  [Plusfresc](../../scripts/sync-plusfresc.mjs).
- Horarios y sus límites: [CE-001](CE-001-supabase-inventory.md).

SC-01 confirmada el 2026-09-02: estas cuatro tiendas y ambos CP son el alcance
de evaluación aceptado. BU-01 confirma los límites y la ausencia de nuevas
contrataciones; RV-01 asigna la segunda revisión al propietario. Nada de ello
certifica cobertura ni activa CE-1. Acta en [budget.md](budget.md). CE-005 está
cerrada en [freshness-policy.md](freshness-policy.md) y [acceptance.md](acceptance.md):
FR-02 y QA-01 confirmadas; G0 PASS. CE-100 inicia F1 en
[CE-100-readiness.md](CE-100-readiness.md), sin habilitar estas fuentes.
