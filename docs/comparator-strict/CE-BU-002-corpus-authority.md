# CE-BU-002 — Retirada del límite acumulado de tiempo y extracción CE-200

2026-09-03. Nueva instrucción del propietario:

> Revierte el limite de tiempo, no hay limite, extrae toda la información necesaria para poder completar la tarea CE-200

Confirma además «Si» a ampliar filas y transferencia **solo hasta completar el
corpus CE-200**, manteniendo lotes pequeños, margen incluido y sin nuevos costes.

## Cambio autorizado

- Se retira el techo de cinco minutos SQL acumulados al día para CE-1. El tiempo
  sigue contabilizado; no se borran ni devuelven reservas anteriores.
- La extracción CE-200 puede superar los topes diarios iniciales de filas y
  transferencia. Presupuesto operativo acotado del corpus: hasta 128 MiB de
  respuesta contabilizada y 50.000 filas exportadas (incluidas relecturas y
  ubicaciones), sin ampliar el alcance de 6.000 referencias / 12.000 observaciones
  de ubicación únicas. Son márgenes máximos, no objetivos que deban consumirse.
- Se conserva un máximo de 500 filas por página, una operación remota en vuelo,
  `statement_timeout` de hasta 5 s y `lock_timeout` de hasta 500 ms. Los plazos
  de transacción/lease impiden trabajos colgados; no limitan la duración total
  de la tarea, que puede continuar mediante lotes sucesivos.
- Sin cambio de plan/compute, nuevos proveedores, imágenes, vectores o datos
  personales exportados. Sin RPC comerciales, cuotas de usuarios, cron o syncs.
- Salud, paginación, procedencia, idempotencia y separación de datos reales /
  propuestas / sintéticos permanecen. No certificar equivalencias ni G2 al
  completar solo CE-200.

## Evidencia previa

- Proyecto `gkffvigcnsesbaihycay`, ACTIVE_HEALTHY, PG17.6, eu-west-1 revalidado.
- Lectura 10:03:42 UTC: 21 conexiones, 0 bloqueos observados, 0 consultas activas
  de más de 30 s, 0 trabajos CE-1 sin resolver. Muestra puntual, no baseline PASS.
- Contadores conservados: 299.920 ms, 22.623.694 bytes, 4.128 filas leídas,
  35 escrituras técnicas. No representan tiempo CPU ni coste facturado.
- Panel autenticado de organización, consultado en esta ejecución: Pro,
  3,917/250 GB de egress (resumen), 0 GB de sobreconsumo; indica que no se
  facturan overages actualmente y que los datos pueden retrasarse una hora.
  Disco provisionado 8 GB; no se modifican recursos. El margen observado cubre
  ampliamente el máximo de transferencia de este corpus, no acredita uso gratis
  ilimitado ni reemplaza la vigilancia de carga.

## Aplicación y compatibilidad

La política nueva se aplicó mediante migración aditiva/revisada sobre la
tabla **privada** de presupuesto, conservando sus filas, RLS y grants. Los
artefactos y protocolos exactos de los canarios F1 quedan como evidencia histórica,
no se reejecutan ni se cambian sus hashes/autorizaciones antiguas. El nuevo lector
CE-200 tiene operación y contabilidad propias; no reutiliza esas excepciones F1.

Aplicada y comprobada: migración **20260903101356**. El lector CE-200 terminó
con 119 trabajos correctos, uno reconciliado y cero pendientes. Reservas finales:
1.518.920 ms, 108.246.478 bytes, 34.177 lecturas y 399 escrituras técnicas,
sin borrar consumo anterior. [Cierre y fuentes](CE-200-closure.md).
[Versiones del runtime](CE-BU-002-runtime-supersession.json): guarda F1 original
archivada byte a byte y sucesora autorizada comprobada por separado.

Las frases anteriores «no más carga hoy por 299.920/300.000 ms» describen el
estado antes de CE-BU-002 y quedan sustituidas por esta decisión, no por un
reinicio del contador. CE-200 está completada como adquisición/muestreo, no
como etiquetado ni G2. No repetir la extracción cerrada ni ampliar esta excepción
a otro proyecto o fase. Continúa CE-201/202 sobre los datos locales.
