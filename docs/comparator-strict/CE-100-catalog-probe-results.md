# CE-100 — Resultado de la lectura controlada

2026-09-03. **Prueba ejecutada; baseline incompleto; CE-100 sigue abierta.**

Las 61 lecturas medidas devolvieron 50 productos válidos, sin errores.
La ejecución no mantuvo las 20 muestras exigidas por tramo de cinco minutos.
No cerrar CE-100 ni autorizar escrituras con este resultado.

Evidencia: [capturas y alcance](CE-100-catalog-probe-run.json),
[cálculos reproducibles](CE-100-catalog-probe-analysis.json),
[manifiesto deshabilitado al terminar](CE-100-catalog-probe-manifest.json).
El [protocolo inicial](CE-100-catalog-probe.md) se conserva como historial.

## Coste y autorización

El propietario autorizó continuar con «ok, si no consume coste monetario
adicional adelante», tras la explicación de las excepciones para esta prueba.
Antes de ejecutarla se comprobó el [consumo de toda la organización](https://supabase.com/dashboard/org/trnqzlirexddfnowcifm/usage):
Pro, ciclo 21 agosto–21 septiembre, 3,901 GB de egress de 250 GB incluidos,
0 GB de exceso y aviso de que no se facturan overages actualmente. El panel
puede tardar hasta una hora en actualizarse; no es una factura final.

Este volumen cabe holgadamente en la cuota observada. Compute sigue siendo la
instancia ya activa, sin aumentar su tamaño. No se invocan funciones Edge,
IA, transformaciones de imágenes ni autenticación de usuarios. No se autoriza
ningún coste monetario adicional. Las guías Supabase motivaron separar cuota
incluida, coste existente y gasto incremental: [egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress),
[compute](https://supabase.com/docs/guides/platform/manage-your-usage/compute),
[control de costes](https://supabase.com/docs/guides/platform/cost-control).

Se usaron el lock HTTP existente de 8 s y statement_timeout anónimo de 3 s,
solo para este GET. No se modificaron roles; los SELECT administrativos
mantuvieron 5 s / 500 ms locales y ROLLBACK. La excepción interna a **22 MiB
solo el 3 de septiembre UTC** no modifica el plan contratado ni futuros días.

## Ejecución y resultados

Una lectura previa de transporte devolvió 50 productos en 287 ms. Se conservó
y se anunció su exclusión de la ventana antes de iniciarla, no después de ver
el resultado. Más 61 lecturas medidas: **62 GET y 3.100 filas totales**,
dentro del tope general de 5.000 filas/día. La lectura previa añade una petición
respecto al protocolo inicial; se comunicó antes de iniciar la ventana.

Misma primera página publicada Mercadona/Catalunya y proyección ligera del
código local. Todos los cuerpos tuvieron el mismo hash. No se guardan productos.
Cada GET usó un proceso Node nuevo y el helper probado, con manifiesto en
memoria y preflight vigente; la CLI en disco nunca se habilitó. Hubo 18 SELECT
administrativos y 18 capturas de métricas, incluidos preflights; 17 muestras
de infraestructura cubren la medición. Todo en serie, sin retries ni daemon.

| Medida | Resultado |
|---|---:|
| Ventana UTC | 07:20:02,615–07:37:34,700 |
| Duración entre primera y última lectura | 17 min 32,085 s |
| Respuestas válidas | 61/61 |
| Mediana / p95 / máximo HTTP | 368 / 3.490 / 4.484 ms |
| Respuestas superiores a 1 s / 3 s | 9 / 4 |
| Muestras en los tres primeros tramos de 5 min | 18 / 14 / 18; exigidas ≥20 por tramo |
| Separación mínima / máxima entre inicios | 15,002 / 51,955 s |
| CPU media ponderada / máximo de intervalo | 4,10 % / 9,14 % |
| Menor memoria disponible | 27,61 % |
| Máximo de conexiones observado | 16/60 |
| Bloqueos / nuevos deadlocks observados | 0 / 0 |

El p95 incluye red, conexión y lectura/validación del cuerpo; no es p95 SQL
ni renderizado móvil. El roundtrip del conector administrativo varió entre
3,602 y 31,749 s y tampoco equivale al tiempo SQL. Intercalarlo en serie con
el arranque de procesos produjo huecos de cadencia: limitación de esta
instrumentación, no prueba de errores del catálogo. No se redistribuyeron
muestras ni se rebajaron umbrales para aprobar el ensayo.

No atribuir los picos HTTP a CPU sin evidencia: faltan DNS/TLS, tiempo hasta
primer byte y tiempo de servidor. Hubo swap (+24.033 páginas leídas,
+25.526 escritas), sin causalidad demostrada con la prueba. Cinco muestras
repitieron contadores CPU: no se contaron como intervalos de CPU cero.
El exporter no proporcionó series PSI. Los locks fueron muestreados,
no observados continuamente.

Cero errores en 61 sondas no demuestra error real <1 % (límite superior
Wilson 95 %: 5,92 %); no certifica el criterio de errores BU-01 con ≥100
intentos. Tampoco acredita equivalencias, ahorro, cuota o capacidad de escritura.

## Presupuesto y cierre de ejecución

Total conservador: **21.960.142 bytes (20,94 MiB) de 22 MiB**.

- Métricas de la revisión anterior: 9.309.177 bytes.
- Reserva para otras lecturas previas: 1.048.576 bytes.
- Nuevos cuerpos de métricas: 9.863.967 bytes.
- Catálogo, incluida comprobación previa: 1.474.608 bytes.
- Cota de respuestas SQL nuevas: 263.814 bytes; la primera captura de este
  paso está incluida en la reserva de otras lecturas.

No confundir respuestas útiles/reservas con el medidor exacto de egress
facturable. Restan 1.108.530 bytes: no cabe otra ventana completa y no se inició
otra. Tiempo SQL contabilizado: cota de 180.520 ms de 300.000 ms diarios,
combinando reservas por SELECT y roundtrips HTTP completos; no es CPU.
El SQL del recolector gestionado de métricas no es observable en este transporte.

La ejecución terminó y el manifiesto está deshabilitado. Ninguna búsqueda
comercial consumida, escritura ni cambio de configuración. CE-100 abierta,
CE-103 en curso y G1 no aceptado.

Próximo paso: corregir y probar localmente la coordinación temporal antes de
otra ventana, con margen para las capturas sin perder densidad, solapar
operaciones ni generar ráfagas. Añadir desglose de tiempos del cliente para
investigar los picos. Ese trabajo local no requiere nuevas integraciones.
Otra ejecución debe revalidar cuota, presupuesto diario y alcance; no se ha
programado ningún observador permanente.

Verificación local al terminar: `npm run quality` PASS (TypeScript, lint,
326/326 tests); `git diff --check` sin incidencias. Quince JSON y dieciocho
documentos Markdown validados, sin enlaces rotos; 67 tareas, ocho cerradas.
Los nueve archivos preexistentes protegidos conservan sus hashes. No hay
cambios de código funcional, migraciones ni pruebas nuevas en este paso.
