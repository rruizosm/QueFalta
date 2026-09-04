# CE-200 — Preparación del dataset de comparación estricta

2026-09-03. Autoridad: «Continua con la tarea CE-200».
**Estado actualizado: CE-200 completada; F2 en curso y G2 pendiente.**
[Acta de cierre y corpus completo](CE-200-closure.md): 4.176 referencias activas,
5.189 observaciones de ubicación, 6.000 parejas y 1.200 Q, sin etiquetar.
CE-BU-002 revoca el techo SQL acumulado y autoriza el margen de extracción.
El resto de este documento conserva el **avance inicial histórico**; sus
restricciones «no más carga hoy» y adquisición pendiente ya no son el estado actual.
F1 permanece cerrada según su [acta](CE-105-106-closure.md).

Actualización posterior del mismo día: el propietario autoriza continuar las
tareas. [CE-201/202 avanzan localmente](CE-201-202-progress.md) con 22 propuestas
exploratorias en una capa separada y guía de etiquetado. El seed, recuentos y
evidencia de este avance CE-200 permanecen intactos; no son etiquetas gold ni
el corpus confirmatorio. CE-200 sigue abierta y la adquisición pendiente.

## Resultado de este avance

Se ha preparado el diseño de adquisición, un constructor local reproducible,
una semilla exploratoria y el inventario de fuentes/exposición. No se han
consultado Supabase, retailers, OFF o modelos de pago; tampoco se han cambiado
la app, los syncs, las reglas publicadas ni los contadores de presupuesto.

| Material | Cantidad comprobada | Uso permitido ahora |
|---|---:|---|
| Snapshot CE-104 | 72 productos, 18 por tienda | Exploración y prueba del contrato de datos |
| Parejas derivadas de ese snapshot | 648 IDs comerciales distintos, sin contar la dirección inversa | Candidatos exploratorios sin etiquetas |
| Borradores Q | 144 = 72 orígenes × 2 CP | Prueba de estructura; no 144 consultas remotas |
| Casos destino R | 432 = 144 Q × 3 tiendas | No se cuentan como 432 consultas Q |
| CSV antiguos | 400 parejas en dos archivos idénticos | Historial, no 800 parejas nuevas |
| Referencias del corpus antiguo | 683; 335 en tiendas del piloto | Índice de exposición; no corpus estricto activo |

El informe distingue **candidatos, etiquetas y casos confirmatorios**. Ninguna
de las 648 parejas ha sido declarada equivalente ni certificada como parte
de una muestra representativa. Hay cero etiquetas estrictas y cero casos
confirmatorios acreditados por este avance. No se ha reducido el objetivo
de 5.000–10.000 parejas y al menos 1.000 consultas.

## 1. Fuentes auditadas y limitaciones

La muestra CE-104 contiene los seis primeros IDs de cada tienda y pista léxica.
No es aleatoria. `water_candidate`, `yogurt_candidate` y `potato_candidate`
son pistas de búsqueda, **no familias validadas**. Conservamos literalmente
la evidencia original, incluido nombre, packaging, EAN, precio y `synced_at`.

Por ejemplo, la pista de agua devuelve colonia y filtros; la de yogur devuelve
tortitas, galletas y salsa; la de patatas devuelve peladores, aperitivos y
patata fresca. La semilla no elimina esos casos ni los marca automáticamente
como negativos: el etiquetado formal corresponde a CE-201/202. Las patatas
prefritas de Consum no acreditan congelación por su título; la palabra
«ultracongeladas» sí está presente en una referencia de Mercadona. Ambas
necesitan su evidencia original completa, no defaults deducidos.

La proyección de CE-104 no incluye todos los campos comerciales ni la revisión
de catálogo. `packaging=null` puede significar que no se seleccionó una columna,
no que el retailer carezca del dato. `published=true` acredita el snapshot,
no stock o servicio en los CP. El reloj de captura se conserva; no se sustituye
la observación del retailer por la fecha de generación de estos archivos.

Los dos CSV de agosto tienen el mismo SHA-256 y 400 filas de datos. Una lectura
independiente verifica 122 etiquetas `identico`, 178 `comparable` y 100
`no_relacionado`; solo 66 parejas tienen ambos lados en las cuatro tiendas
del piloto, **sin acreditar que pertenezcan a las tres familias**. Esas etiquetas
no se trasladan a CE-1. El resumen antiguo todavía decía cero etiquetas, por lo
que no se ha usado ese resumen desactualizado como recuento actual.

El JSONL antiguo contiene 683 referencias, sin campos de publicación o fecha
de observación comercial. Su constructor deriva cantidades y atributos desde
texto y convierte ausencia de ciertas palabras en `false`: no es evidencia
estructurada del retailer. Solo se extraen IDs y GTIN crudos para registrar
exposición anterior, nunca esos atributos, etiquetas, cantidades o vectores.
Hay un ID compartido con CE-104: `carrefour:520661019`.

[Inventario y auditoría de fuentes](dataset/CE-200-source-inventory.json).
Los originales permanecen intactos; no se reejecutó ningún extractor antiguo.

## 2. Diseño del corpus completo

[Plan de muestreo versionado](dataset/CE-200-sampling-plan.json).

Objetivo operativo inicial: **6.000 parejas y 1.200 consultas Q**, dentro del
contrato aprobado. Con dos CP por origen, 1.200 Q requieren al menos 600
referencias de origen distintas en este diseño; no se generarán combinaciones
artificiales de tiendas, fechas o reintentos para alcanzar el número.

Se propone una cohorte confirmatoria de 4.000 parejas y otra dirigida de 2.000
casos difíciles. Estas cifras son una planificación, no disponibilidad probada.
Antes de etiquetar nuevos datos se congelarán el marco de muestreo, cuotas,
semilla, probabilidades de inclusión y pesos por familia/tiendas/marca/formato.
La factibilidad se comprueba con el censo del piloto: si faltan referencias de
una familia o formato, se registra la carencia y se revisa el diseño antes de
evaluar, sin rellenar con duplicados ni rebajar los mínimos de CE-200.

La muestra confirmatoria debe representar su **marco de catálogo del piloto**.
No afirmará representar todo el tráfico de la aplicación, del que no se han
extraído perfiles ni historiales. Los casos difíciles se reportarán aparte;
no deben alterar a posteriori los pesos para mejorar una métrica.

Se conservarán las cuatro tiendas como origen y destino y los CP 08006/25001.
La propia tienda nunca aparece como destino. Se inventariarán marcas propias
y de fabricante, envases individuales y multipacks, variantes y formatos raros.
Agua, yogur y patatas congeladas deben comprobarse como familias, no por una
subcadena del título. Carne, embutidos y peso variable siguen en cuarentena.

La cantidad y estructura del envase se conservan sin normalización destructiva:
1 L frente a 1 L; 6×125 g frente a 6×125 g; 2 kg congelados frente a 2 kg
congelados. Natural, azucarado, sabor y declaraciones se mantienen separados.
No se eliminan negaciones ni se divide un peso total para inventar el envase.
CE-300 y siguientes implementarán el parser y las reglas; aquí no se adelantan.

## 3. Identidades, observaciones y consultas

- Producto comercial: tienda + ID original como texto, incluidos ceros iniciales.
- Pareja: combinación no ordenada de dos productos de tiendas distintas.
  Invertir origen/destino o repetir el mismo par en otro CP no crea otra pareja.
- Observación: producto + snapshot/evidencia original. Versiones distintas se
  conservan, pero no se suponen observaciones independientes de identidad.
- Consulta Q: origen y observación, conjunto completo de destinos seleccionados,
  CP/canal y reloj fijo. Polling, reaperturas y reintentos no aumentan Q.
- Caso R: Q y una tienda destino; la recuperación devolverá como máximo 50
  candidatos por destino, pero el conjunto de verdad no se limita al top del motor.

La semilla enumera parejas con alguna pista léxica compartida, solo para probar
la estructura. **No implementa el muestreo del corpus completo ni mide recall.**
Cada Q referencia sus parejas exploradas por destino y mantiene `null` en
equivalentes conocidos, mínimo, cobertura y decisión. `null` significa «no
revisado», no «no existe equivalente». Tampoco es una etiqueta gold «desconocido».

Se registran los datos ya expuestos para CE-204/205; no se ha asignado ninguna
partición ni bloqueado un holdout. Compartir GTIN no demuestra mismo pack.
Al crear componentes de identidad, no confundir una arista de candidato
negativo con una prueba de que los dos productos son la misma entidad.

## 4. Archivos y reproducción local

Semilla en [seed-v1](dataset/seed-v1/manifest.json):

- `products.json`: 72 observaciones, campos originales y puntero a la fuente.
- `pairs.json`: 648 parejas únicas, sin dirección duplicada y sin etiquetas.
- `queries.json`: 144 borradores con tres destinos y reloj de replay fijo.
- `exposure.json`: 683 referencias legacy ya expuestas, no un holdout.
- `manifest.json` y `report.json`: procedencia, hashes, recuentos y carencias.

```sh
node scripts/prepare-comparator-strict-dataset.mjs
node scripts/prepare-comparator-strict-dataset.mjs --artifact=manifest
node --test scripts/lib/comparator-strict-dataset.test.mjs
npm run quality
```

La CLI lee exclusivamente los dos archivos locales identificados y escribe
solo en stdout. No carga `.env`, conecta a Supabase, modifica fuentes ni
publica artefactos. Solo construye esta semilla (máximo 500 filas de entrada
y 10.000 parejas exploratorias); no se presenta como importador completo.
Los JSON derivados están guardados con hashes verificables. Las pruebas cubren
duplicados, conflictos, dirección de pareja, CP, ceros iniciales, GTIN,
replay sin TTL comercial, ausencia de etiquetas y regeneración exacta.

Validación de este avance: **14/14 tests nuevos PASS; `npm run quality`
367/367 PASS, TypeScript y lint correctos**. Artefactos del dataset: ~608 KiB
antes del informe final, por debajo del límite local de 250 MiB. Son pruebas
de preparación e integridad, no precisión del comparador. Evidencia de ejecución
en [CE-200-evidence.json](CE-200-evidence.json).

## 5. Pendientes del avance inicial (resueltos en el acta de cierre)

1. Preparar y revisar una operación **nueva de lectura de corpus**, con
   proyección de campos y paginación coherentes con los esquemas actuales.
   Las excepciones de los dos canarios F1 no autorizan esa operación.
2. Revalidar presupuesto diario, destino, permisos, salud y margen incluido
   antes de ejecutar. El 2026-09-03 tiene 299.920/300.000 ms SQL reservados:
   **no se hace más carga remota CE-1 hoy**. No hay programación automática.
3. Obtener el marco y las observaciones faltantes incrementalmente: máximo
   500 filas/página, 5.000 filas/día, 10 MiB/día ordinarios, hasta 6.000 referencias
   y 12.000 observaciones de ubicación. Los 22 MiB fueron excepción de una fecha,
   no el nuevo límite normal. Trabajo intenso y cruces se hacen localmente.
4. Congelar un diseño viable antes de nuevas etiquetas; conservar revisión,
   procedencia, campos ausentes/no seleccionados, CP y relojes. Desconocidos
   legítimos permanecen: completar un formulario no debe inventar datos.
5. Generar y verificar 5.000–10.000 parejas únicas y ≥1.000 Q, con cobertura
   documentada y sin confundir las cohortes histórica, dirigida y confirmatoria.
6. Registrar el acta de CE-200 y entregar los casos a CE-201/202. Etiquetado,
   segunda revisión del propietario, particiones, holdout y métricas siguen
   en sus tareas posteriores. CE-201/202 ya tienen preparación exploratoria
   solicitada según la actualización superior, no etiquetado final del corpus.

El corpus no requiere instalar una integración nueva ahora. No se harán
llamadas a retailers/OFF en F2 para compensar un campo ausente en la exportación;
las integraciones se evalúan en F4 con su autorización. Un snapshot antiguo
no se descarta solo por tener más de 24 h: sirve para replay, sin acreditar
precio, cobertura o stock actual. Se mantiene FR-02.

La guía Supabase mantiene esta ejecución fuera de la BD por el presupuesto;
la revisión de los CSV ha separado recuentos reales de resúmenes antiguos y
evitado reutilizar etiquetas incompatibles con el contrato estricto. El
[changelog oficial](https://supabase.com/changelog) se consultó sin acceder al
proyecto: no ha sido necesario cambiar ninguna API ni servicio.
