# CE-100 — Nueva comprobación de capacidad

2026-09-03. Solicitud: «Puedes cerrar CE-100?».

**CE-100 sigue abierta.** Se ha resuelto el acceso a métricas de infraestructura,
pero no se ha obtenido una línea base completa de latencia y errores del flujo
de catálogo. No se rebaja BU-01 ni se interpreta la solicitud de cierre como
una dispensa de sus criterios. CE-103 puede continuar en lectura/local; no se
autoriza una escritura ni se acepta G1 con esta observación.

## Qué se ha desbloqueado

- Proyecto `gkffvigcnsesbaihycay`, `ACTIVE_HEALTHY`, PG 17.6.1.127 reconfirmado.
  El panel sigue mostrando MICRO/t4g.micro, 1 GB, 2 cores, sin réplicas; no se
  ha cambiado el tamaño, disco o spend cap.
- Los siete gráficos de red, I/O, conexiones y disco siguen fallando. La
  **Metrics API existente sí responde 200**. Se usa la credencial de servidor
  ya presente en `.env.local`, validando ref/rol, sin imprimirla ni crear claves.
  El primer intento en sandbox no tuvo acceso de red; la lectura con acceso
  de red autorizado funcionó. No era necesario contratar ni instalar Grafana.
- Se preparó un [observador puntual](../../scripts/observe-comparator-strict-capacity.mjs):
  plan offline por defecto; ejecución explícita, una lectura por minuto,
  timeout HTTP de 10 s, sin redirecciones ni reintentos, máximo 1 MiB por
  respuesta y presupuesto conservador de 10 MiB para las métricas de esta revisión.
  No es un servicio, cron ni automatización permanente.
- Solo se conservan series seleccionadas de infraestructura. No se exportan
  claves, cuerpos de consultas, IP, tokens, filas de clientes ni respuestas
  completas de logs. Las consultas SQL son agregados READ ONLY con timeout
  5 s, lock_timeout 500 ms y ROLLBACK; no invocan el comparador ni generan cuota.

Capturas y cálculos reproducibles: [evidencia](CE-100-capacity-recheck.json).
Analizador local: [código](../../scripts/lib/comparator-strict-capacity.mjs) y
[pruebas](../../scripts/lib/comparator-strict-capacity.test.mjs).

### Resultado de la ventana de infraestructura

16 muestras entre **06:13:33 y 06:28:33 UTC**, 900,104 segundos de adquisición.
El proceso terminó correctamente y no queda ningún recolector ejecutándose.
La primera muestra conserva una transcripción de sus métricas necesarias desde
la salida de la herramienta; las otras quince se conservaron desde stdout.

| Indicador | Resultado observado |
|---|---:|
| CPU media ponderada por diferencias de contadores | 2,82 % |
| Mayor media de CPU de los intervalos medidos, no pico instantáneo | 6,84 % |
| Menor memoria disponible / memoria total | 35,06 % |
| Máximo de conexiones del exporter | 15 / 60 (25 %) |
| Aumento del contador de deadlocks | 0 |
| Contadores `pswpin` / `pswpout`: aumento | 17.960 / 3.149 páginas |
| Respuestas con contadores de CPU repetidos | 6 |
| Cuerpos de métricas recibidos, incluida la sonda inicial | 9.309.177 bytes |

La CPU y las conexiones muestreadas no alcanzan los umbrales de BU-01. No
obstante, hay actividad de swap y no se certifica ausencia de presión durante
los huecos. Cuatro SELECT entre 06:14:34 y 06:28:38 UTC muestran 11–13 conexiones
cliente excluida la sonda y cero clientes activos/bloqueados/idle-in-transaction;
**no cubren continuamente los 15 minutos** ni prueban cero bloqueos transitorios.
Los 17 GET de métricas fueron correctos; los cuatro SELECT también. Sus errores
no son el denominador comercial de errores de la app.

## Cómo interpretar las mediciones

CPU se calcula por diferencias de contadores por core/modo, con denominador
de segundos de CPU. I/O usa diferencias por dispositivo y tiempo transcurrido.
Las respuestas que repiten contadores no se cuentan como otro minuto de CPU
cero ni de IOPS cero; se conserva el origen anterior para calcular la tasa.
Se observaron repeticiones compatibles con datos cacheados/refrescados con
menor frecuencia que la adquisición: no afirmar resolución real de un minuto.

El porcentaje de memoria **disponible** usa `MemAvailable / MemTotal`; no es
equivalente a `MemFree` ni al compromiso de memoria. Swap ocupado puede ser
residual, pero aquí también se comprueban los cambios de `pswpin/pswpout`.
No se declara ausencia de presión de memoria solo por CPU baja.

Las conexiones de Metrics API se suman sobre las categorías devueltas; el
denominador es el `max_connections` publicado (60). Los SELECT de actividad
son una comprobación independiente y excluyen su propia conexión. No se
presentan muestras espaciadas de locks como vigilancia continua sin huecos.

`track_io_timing=off` sigue vigente. Los contadores de dispositivo proporcionan
I/O del host; no son tiempos de cada consulta SQL. Un exporter sano o cero
deadlocks tampoco son una tasa de errores HTTP del catálogo.

## Qué impide el cierre

| Fuente | Lo observado | Por qué no completa BU-01 |
|---|---|---|
| Data API del panel | 390 peticiones y media 197,96 ms; algunos grupos Carrefour muestran medias de 2.031 y 1.871 ms con solo 2 y 1 peticiones | Media no es p95; los ejes visibles y la ventana seleccionada no establecen una serie comparable a la observación actual |
| Errores del panel | «No data to show», con aviso de retraso de hasta 24 h | No demuestra cero errores ni un denominador completo |
| Logs API por MCP | Últimas 100 entradas recibidas, 04:03:09–04:13:37 UTC | Sin campo de duración y fuera de la ventana actual; muestra limitada, no historial íntegro |
| Logs Postgres por MCP | 100 entradas LOG, 00:01:48–04:21:52 UTC; ninguna con duración | No cubren la ventana actual ni acreditan ausencia de errores de clientes |

No se corrigen desfases de hora por intuición, ni se infiere que no hubo tráfico
porque una fuente no lo devuelve. Tampoco se usa la duración de descargar
`/metrics` o de llamar al MCP como latencia de la app.

El pendiente se concreta en obtener una **misma ventana de al menos 15 min**
con timestamps verificables, latencias individuales o histograma válido,
conteo completo de solicitudes/fallos y observaciones de locks. Para aplicar
el umbral de degradación de BU-01 se necesitan al menos 20 observaciones por
ventana de 5 min del flujo vigilado; con menos tráfico no se afirma estabilidad
ni se amplía carga. La infraestructura debe muestrearse en esa misma ventana.

Siguiente vía propuesta: instrumentar una lectura representativa del catálogo,
sin `catalog_cheaper_products_v7`, cuota, caché comercial o escrituras, y separar
sus sondas sintéticas del tráfico real. Antes de ejecutarla, fijar consulta,
rol, límites y cancelación; un `HEAD` trivial o un promedio global no sustituyen
el flujo representativo. Alternativamente, obtener una exportación de logs
contemporáneos que incluya duraciones y cobertura completa. No se ha cambiado
la observabilidad global ni activado previews o log drains.

Ejecución posterior del 2026-09-03: [resultado de la lectura del catálogo](CE-100-catalog-probe-results.md).
61/61 respuestas válidas, p95 3,49 s; muestra temporal insuficiente por la
coordinación de la prueba, sin cierre de CE-100. Cuota incluida verificada,
20,94/22 MiB contabilizados; ningún recurso contratado o ajuste global cambiado.

## Alcance y validación

Solo herramientas, pruebas y documentación locales; Supabase se ha consultado
en lectura. Backups/PITR y permisos conservan la evidencia anterior, no se
presentan como reensayados en este paso. No se han cambiado app, SQL desplegado,
compute, colas, cron, secretos, planes de usuario ni integraciones.

`npm run quality`: TypeScript, lint y **308/308 pruebas** correctas, incluidas
7 del analizador/CLI. No son pruebas del comparador estricto en producción.

Las guías de Supabase/Postgres han motivado reutilizar la API existente,
acotar las lecturas y distinguir contadores, medias y evidencia ausente.
Fuentes: [Metrics API](https://supabase.com/docs/guides/monitoring-and-debugging/metrics),
[autenticación y cadencia](https://supabase.com/docs/guides/monitoring-and-debugging/metrics/vendor-agnostic),
[Reports](https://supabase.com/docs/guides/monitoring-and-debugging/reports).
