# Incidencia de acceso — 17 de septiembre de 2026

Diagnóstico de producción en lectura entre 19:33 y 19:43, Europe/Madrid.
Proyecto `gkffvigcnsesbaihycay`, región `eu-west-1`. El usuario sitúa el inicio
aproximadamente una hora antes del diagnóstico. No se han hecho cambios en
producción, reinicios, ampliaciones, despliegues ni modificaciones del cliente.

## Conclusión

Hay una degradación real del backend que afecta a autenticación y consultas
normales de la app. La evidencia apunta a un cuello de botella de E/S y presión
de memoria en la instancia Micro de 1 GB. No está demostrado qué carga o evento
inició la degradación ni si interviene un problema del almacenamiento subyacente.
No debe atribuirse automáticamente a la incidencia pública de JWT/401.

## Evidencia

- Auth, ventana aproximada 18:37–19:37: **1.316 respuestas 504**, **293 respuestas
  500** y **120 respuestas 429**. También hay respuestas correctas: el fallo es
  intermitente. Son registros/respuestas, no usuarios únicos ni intentos únicos.
- Comprobación posterior: último 504 visible a las **19:41:15 Madrid**;
  no hay recuperación acreditada al cerrar el diagnóstico.
- Errores dominantes: `context deadline exceeded`, `context canceled`,
  `error finding flow state` y `error finding refresh token` asociados a timeout.
  Afectan a `/token`, `/authorize`, `/callback`, `/otp`, `/user` y `/verify`.
- Postgres, muestra de una hora: 571 cancelaciones por `statement timeout`,
  98 conexiones perdidas, 97 `Broken pipe` y 60 `Connection reset by peer`.
  En otra muestra cercana, consultas afectadas: actividad (82), carrito (71),
  grupos (36), búsqueda Mercadona (26), disponibilidad de usuario (18) y compras
  (15). Estos recuentos no prueban qué consulta origina la carga.
- Varias llamadas SQL de diagnóstico no llegan a conectar:
  `Connection terminated due to connection timeout`. Otras sí funcionan.
- Sonda HTTPS de las 19:36 con anon key local, sin sesiones de usuarios:
  health del dominio original devuelve 200 en 345 ms; settings y lectura mínima
  de categorías agotan 15 s tanto en `auth.quefalta.es` como en el dominio
  original. Health del dominio personalizado también agota 15 s. Esto descarta
  que el fallo sea exclusivamente del dominio personalizado. Las primeras
  sondas dentro del sandbox se descartaron por restricciones de red.
- Observability Database, 18:37–19:37: indicador CPU **96,07 %**, con predominio
  visual de **IOwait** en las muestras disponibles; hay huecos de telemetría.
  No equivale a 96 % de CPU ejecutando SQL. Memoria: indicador 904,27 MB y swap
  elevado; memoria comprometida 3,06 GB (no es RAM física consumida).
- Infrastructure confirma `t4g.micro`, **1 GB RAM**, almacenamiento GP3 de
  **12 GB**, 3.000 IOPS configuradas. Base de datos de unos 6 GB; el disco no está
  lleno. No se ha obtenido una métrica fiable del saldo de ráfaga de E/S:
  el indicador «Disk IO 0 %» no basta para afirmar que los créditos se agotaron.
- Instantánea SQL 19:37: 45 procesos en `pg_stat_activity`, `max_connections=60`,
  cero sesiones bloqueadas y ningún vacuum en progreso. El total incluye procesos
  internos, no equivale a 45 conexiones de clientes. El autovacuum de `auth.users`
  observado antes terminó; no hay prueba de un vacuum atascado.
- Cron de embeddings (17) continúa inactivo. Alertas (18) registra
  `job startup timeout` a las 18:30, 18:45, 19:00 y 19:30. No se cambió ningún cron.
- Postgres está iniciado desde 2026-08-31 20:01 UTC; no hay reinicio reciente
  confirmado. El estado administrativo `ACTIVE_HEALTHY` no refleja estos fallos.

## Factor agravante en el cliente

`src/context/AuthContext.tsx:94` y `:108` llaman a `signOut({scope:'local'})`
ante cualquier error de recuperación de sesión. La librería instalada conserva
la sesión ante `AuthRetryableFetchError`; el cliente no distingue esos errores
de un refresh token definitivamente inválido. Puede llevar al usuario al login
durante una caída transitoria y provocar más intentos. No se ha reproducido en
un dispositivo afectado ni verificado la equivalencia con cada build publicada.

Corrección propuesta: conservar credenciales ante errores transitorios, exponer
estado recuperable con reintento acotado y purgar solo sesiones definitivamente
inválidas. Validar arranque con token caducado + 500/504/sin red y posterior
recuperación, además del caso de token revocado. Requiere trabajo y publicación
del cliente; no arreglaría por sí solo la saturación actual.

## Actuación recomendada

1. Mitigar la presión de memoria ampliando compute y comprobar de nuevo Auth,
   REST, IOwait y swap. Micro→Small duplica RAM a 2 GB, unos 5 USD/mes adicionales;
   Micro→Medium ofrece 4 GB, unos 50 USD/mes adicionales. Medium da mayor margen
   para la carga actual, pero no garantiza resolver un problema de infraestructura.
   Son diferencias de compute, no la factura total; precios del panel a esta fecha.
   El cambio implica coste y una interrupción; todavía no está autorizado ni hecho.
2. Un reinicio puede aliviar temporalmente el estado, pero no añade recursos.
   Evitar usarlo como solución permanente o reiniciar repetidamente sin medir.
3. Si persiste IOwait elevado tras mitigar la presión, escalar a soporte Supabase
   con proyecto, región, ventana UTC 16:30–17:40, errores y métricas; solicitar
   revisión de almacenamiento/host. No se ha enviado ningún mensaje a soporte.
4. Cuando responda con estabilidad, medir deltas de `pg_stat_statements`, revisar
   consultas de arranque y patrones de tráfico. Dos intentos de leer esas
   estadísticas agotaron la conexión; no se ejecutaron cargas ni EXPLAIN ANALYZE.

## Fuentes y comprobación

- [Registros de Auth](https://supabase.com/dashboard/project/gkffvigcnsesbaihycay/logs/auth-logs)
- [Métricas Database](https://supabase.com/dashboard/project/gkffvigcnsesbaihycay/observability/database)
- [Infraestructura](https://supabase.com/dashboard/project/gkffvigcnsesbaihycay/settings/infrastructure)
- [Supabase: espera de E/S y degradación](https://supabase.com/docs/guides/troubleshooting/exhaust-disk-io)
- [Supabase: swap](https://supabase.com/docs/guides/troubleshooting/exhaust-swap)
- [Compute, precios e interrupción al ampliar](https://supabase.com/docs/guides/platform/compute-and-disk)
- [Incidencia pública 401/JWT](https://status.supabase.com/incidents/6q5902p2xd9f):
  abierta; patrón diferente del predominio 500/504 observado aquí.
- [Caída pública de Auth del 16/09](https://status.supabase.com/incidents/frmk3zk2cwql):
  declarada resuelta el día anterior; no prueba causalidad con esta incidencia.

`npx tsc --noEmit` correcto. No se ha certificado recuperación del servicio.
