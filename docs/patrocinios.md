# Patrocinios de Inicio

La imagen y los datos de la campaña se gestionan en el proyecto **QueFalta** de
[Supabase Dashboard](https://supabase.com/dashboard/project/gkffvigcnsesbaihycay).
Los cambios llegan a las instalaciones que incluyan el nuevo cliente remoto.
Las versiones anteriores con Respira integrado en el código no se actualizan así.

## Cambiar de patrocinador

1. En **Storage → promotions**, sube una imagen 3:1 (1200 × 400 o 2400 × 800 px).
   Se admiten JPEG, PNG y WebP, máximo 2 MB. Usa una carpeta y un nombre nuevos,
   por ejemplo `marca/banner-v1.jpg`. No sobrescribas imágenes: el CDN y los
   dispositivos conservan copias en caché.
2. En **Table Editor → sponsor_campaigns**, crea una fila con `enabled = false`.
3. Completa los campos de la tabla siguiente, revisa imagen y enlaces y activa
   `enabled`. Desactiva la campaña anterior o establece su fecha de finalización.

| Campo | Uso |
| --- | --- |
| `slug` | Identificador único, p. ej. `respira` o `marca-octubre` |
| `placement` | Mantener `home_banner` |
| `sponsor_name` | Nombre del patrocinador |
| `image_path` | Ruta dentro de `promotions`, sin URL ni prefijo del bucket |
| `destination_ios` | URL HTTPS para iOS |
| `destination_android` | URL HTTPS para Android; vacío oculta la campaña allí |
| `destination_web` | URL HTTPS para web; vacío oculta la campaña allí |
| `accessibility_label_es` / `_ca` | Descripción del anuncio; la app añade «Publicidad» y el patrocinador |
| `starts_at` | Inicio, con fecha y zona horaria explícitas |
| `ends_at` | Fin exclusivo; vacío permite duración indefinida |
| `enabled` | Interruptor de publicación |
| `priority` | Mayor número gana si coinciden campañas compatibles |
| `updated_at` | Se actualiza automáticamente; desempata campañas con igual prioridad |

Al cambiar una creatividad ya publicada, sube primero el nuevo archivo y después
edita `image_path` y los enlaces juntos en la misma fila. Mantén el archivo anterior
al menos 24 horas para las instalaciones que aún conserven su referencia.
Un cambio de proporción/diseño del componente sí requiere actualización de código.

## Actualización y desconexión

Inicio consulta al entrar, al volver de segundo plano, al tirar para refrescar y
cada cinco minutos mientras la pestaña está enfocada. Metadatos en caché por
usuario durante un máximo de una hora; imagen con caché de disco de `expo-image`.
Un resultado vacío elimina la campaña almacenada. Ante fallo de red solo se usa
una copia válida y sin caducar. Una desactivación remota llega en la siguiente
consulta; sin conexión puede tardar hasta una hora. La fecha `ends_at` también
se comprueba localmente y un temporizador retira el anuncio al vencer.
La comprobación offline depende del reloj del dispositivo.

Sin campañas compatibles o con imagen que falla al cargar, se oculta el banner.
La imagen, el destino y el texto accesible se toman siempre de la misma campaña.
La tarjeta mantiene proporción 3:1 y máximo 372 × 124 pt.

## Primera campaña y permisos

Respira abre el App Store en iOS y `https://respiraapp.fit` en Android.
Web queda sin destino. No se asigna una fecha de fin comercial no facilitada.
Imagen: `respira/banner-d5c76205ca435aca.jpg`.

`sponsor_campaigns` tiene RLS: las cuentas de la app solo leen campañas activas
y vigentes. No pueden crear, editar ni borrar campañas ni subir imágenes al
bucket. Las imágenes son públicas; los borradores subidos no deben contener
información confidencial. La gestión se realiza con el acceso administrativo
del Dashboard; la clave de servicio nunca forma parte del cliente.

La migración es `20261001103011_sponsor_campaigns.sql`, aplicada remotamente como
`20261001103254_sponsor_campaigns`; no reaplicarla por la diferencia de timestamp.
El script administrativo
`node --env-file=.env.local scripts/setup-respira-campaign.mjs` sube y verifica la
imagen e inicializa Respira solo si aún no existe; no altera una campaña existente.

Verificación: `node --test scripts/tests/sponsor-campaign.test.mjs`,
`npx tsc --noEmit` y `supabase/tests/sponsor_campaigns.sql` en el SQL Editor
(prueba transaccional que revierte sus filas).

## Impresiones, clics y CTR (cliente 1.3.3)

Sin SDK externo ni PostHog. Backend desplegado mediante
`20261001200803_sponsor_banner_metrics.sql` (versión remota `20261001201247`).
Hace falta distribuir el cliente nuevo: las instalaciones antiguas no envían eventos.

- **Impresión:** imagen cargada, Inicio enfocado, app activa, sin notificaciones,
  paywall ni transición de entrada cubriéndolo. Al menos el 50 % del área debe
  estar dentro de la ventana útil durante 1 segundo. Se excluyen cabecera y barra
  inferior; muestreo cada 200 ms. Scroll, cambio de orientación y suspensión de JS
  reinician el tiempo: medición conservadora tras estabilizarse la pantalla.
- **Visita:** cada entrada/foco en Inicio; volver de segundo plano sin cambiar de
  pantalla no crea otra visita. Una impresión por campaña/visita, aunque haya
  renders, refrescos, cambios de creatividad o se vuelva a desplazar el banner.
- **Clic:** cada pulsación con destino válido, antes de abrir el enlace. No se
  espera a la red ni se registra una instalación o una conversión. Un fallo al
  abrir el enlace sigue siendo un clic; varios clics por visita son posibles.
- **Entrega:** máximo dos intentos de 4 s, mismo ID para evitar duplicados.
  Sin cola en disco; offline o si se cierra la app pueden perderse eventos.
  Cambiar de cuenta impide reintentos con la identidad de otra cuenta.
- **Validación:** RPC solo autenticada, campaña activa/vigente y con destino en
  esa plataforma; fechas de servidor y límite de 60 eventos/minuto por cuenta.
  No permite escritura directa ni lectura de métricas desde la app.

### Consultar en Supabase

En **SQL Editor**, ejecuta:

```sql
select day, slug, platform, app_version, impressions, clicks, ctr_percent
from public.sponsor_banner_daily_stats
order by day desc, slug, platform, app_version;
```

Los días usan `Europe/Madrid`. No hay filas hasta recibir el primer evento.
Para totales por campaña (incluidas campañas con cero eventos):

```sql
select c.slug,
  coalesce(sum(s.impressions),0) as impressions,
  coalesce(sum(s.clicks),0) as clicks,
  round(100.0 * sum(s.clicks) / nullif(sum(s.impressions),0),2) as ctr_percent
from public.sponsor_campaigns c
left join public.sponsor_banner_daily_stats s on s.campaign_id=c.id
group by c.id,c.slug
order by c.slug;
```

CTR = clics / impresiones × 100; es NULL si no hay impresiones. Puede superar
100 % si alguien pulsa varias veces o antes de cumplir el segundo de visibilidad.
No promediar los CTR diarios: calcular sobre las sumas. No son usuarios únicos.
Para otro patrocinio crea otra campaña; reutilizar el mismo ID mezcla sus cifras.

### Datos y seguridad

La tabla `sponsor_metrics_private.events` guarda campaña, visita aleatoria,
evento, fecha, plataforma, versión e ID interno de cuenta para el límite antiabuso.
No recoge nombre, email, ubicación ni contenido de listas. No son datos
completamente anónimos: los administradores pueden vincular el ID de cuenta.
Al borrar la cuenta, la FK deja ese ID a NULL y conserva el evento estadístico.
No se envían datos a terceros distintos del backend existente de Supabase.

Solo Dashboard/SQL Editor y servidores con service_role pueden consultar las
estadísticas; nunca poner esa clave en la app. La vista es `security_invoker`.
El escritor privilegiado está en un esquema no expuesto y valida `auth.uid()`.
El aviso informativo RLS sin políticas es intencional: la tabla deniega todo
acceso directo a clientes ([explicación del advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)).

No hay eliminación programada todavía: acordar retención antes de distribuir.
Borrar eventos también reduce los totales, porque la vista calcula desde el
histórico. Revisar la política pública y declaraciones de privacidad de tiendas
para incluir esta medición. La visibilidad la declara el cliente; los límites
reducen duplicados/abuso, pero no constituyen protección antifraude certificada.

Pruebas: `scripts/tests/sponsor-metrics.test.mjs` y
`supabase/tests/sponsor_banner_metrics.sql` (rollback, sin inflar contadores).
Runner PostgreSQL aislado: `node scripts/test-sponsor-metrics-sql.mjs RUTA_A_PGLITE`.
Verificación del 01/10: 8 tests de selección/visibilidad, SQL local y remoto con
rollback, TypeScript, lint focalizado y exportación iOS/Android correctos. Pendiente
QA visual en dispositivo. La exportación avisa de la ausencia local de
`google-services.json`, necesario para compilar Android nativamente.
