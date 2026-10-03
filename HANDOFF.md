# HANDOFF.md — Estado en vuelo (traspaso a Codex)

## Catálogo: miniaturas sin parpadeo al entrar (local, 2026-10-01)

- `StoreProductList` ya no monta el primer viewport antes de que arranque la
  precarga: espera a que el lote visible se asiente, con escape a los 1,2 s para
  no bloquear la interfaz por una red lenta. Solo se aplica a la apertura; la
  búsqueda, filtros y paginación posteriores conservan la lista visible.
- `ProductImage` muestra fondo neutro mientras carga y enseña cesta/fallback
  únicamente tras un error real. `imagePrefetchQueue` conserva deduplicación,
  concurrencia 2 y cancelación por propietario, añadiendo una promesa `ready`
  por lote para coordinar el primer render.
- Sin SQL. Pruebas dirigidas, TypeScript, ESLint focalizado, `git diff --check`
  y build/arranque en iPhone 15 Pro Simulator correctos. Falta revisar la
  transición en dispositivo físico y con caché fría/red degradada.

## Navegación inferior nítida al compactarse (local, 2026-10-01)

- `AppPagerTabBar` separa la superficie/píldora escalable de la fila interactiva.
  La cápsula se compacta hasta una escala de 0,91 por scroll, mientras la fila
  ajusta ancho, padding y posición sin aplicar `scale` a Ionicons; los glifos se
  mantienen a tamaño nativo y nítidos. Áreas táctiles, badges, accesibilidad y
  física del scroll se conservan. Ocho pruebas dirigidas, TypeScript, ESLint
  focalizado y `git diff --check` correctos. Solo cliente; sin SQL. Pendiente
  revisión visual en dispositivo.

## Cesta: cabeceras de zona sin parpadeo al entrar (local, 2026-10-01)

- `ListScreen` siembra los pliegues automáticos desde la caché y estabiliza las
  zonas completadas de cada revalidación antes de publicar sus filas. Entrar en
  la pestaña ya no interpreta esos datos como una nueva finalización ni lanza
  el plegado de 520 ms; la animación real al completar el último producto sigue.
- `CompletedZoneHeader` usa el estilo final mientras espera su primera medida,
  evitando el frame neutro previo al acento. Solo cliente; sin SQL.
- El cambio de carrito activo reemplaza filas, miembros y pliegues en layout y
  protege las respuestas/caché por `listId`, para no revelar fugazmente las
  subcategorías del grupo anterior.

## Palabra de hoy: botón sin estrellas (local, 2026-10-01)

- `DailyWordButton` ya no muestra el icono `sparkles` situado después de
  «Palabra de hoy». Mantiene la ficha «P», el degradado y el brillo animado.
  Cambio visual del cliente, sin migración SQL.

## Catálogo: selectores Liquid Glass sin raya en oscuro (local, 2026-10-01)

- Los selectores Productos/Categorías, orden de precio y lista/cuadrícula ya no
  superponen el brillo horizontal manual de 1 pt cuando la apariencia es oscura.
  El material, contorno, selección y animación se conservan; en claro permanece
  el brillo sutil existente. El tramo Plus bloqueado de precio unitario aplica
  la misma regla. TypeScript, ESLint focalizado y `git diff --check` correctos.
  Cambio visual del cliente, sin migración SQL; falta revisión en iOS 26.

## Supermercado favorito (local, actualizado 2026-10-01)

- `CatalogStoreContext` carga y persiste un único supermercado favorito en
  AsyncStorage con clave por `userId`. Si está disponible para la región, el
  perfil y la suscripción actuales, reemplaza Mercadona como selección inicial
  compartida; una selección manual posterior sigue siendo de sesión.
- Las tarjetas de los dos paneles de supermercados (`StoreDropdown` y el modal
  propio de `CatalogScreen`) muestran la estrella abajo a la derecha. Info y
  favorito reutilizan `StoreCardActionButton`; el estado relleno marca el
  favorito y los textos accesibles están en castellano y catalán.
- Con un favorito visible, solo permanece su estrella rellena; las demás se
  ocultan y reaparecen al desmarcarlo. Si la cadena favorita queda fuera de las
  opciones del panel actual, se muestran todas para permitir reemplazarla.
- Marcar una cadena también la selecciona. Lidl bloqueado abre Plus al intentar
  marcarlo, pero un Lidl ya favorito puede desmarcarse sin quedar atrapado. La
  preferencia no tiene migración SQL ni sincronización entre dispositivos.
- Validación local: 8 pruebas dirigidas, `npx tsc --noEmit`, ESLint focalizado
  y `git diff --check` pasan. Pendiente revisar visualmente en dispositivo.

## Sesión perdida al renovar tokens (local, 2026-09-30)

- Corrección en `authStorage.ts`, nuevo `secureAuthStorage.ts` y `AuthContext`.
  Repro del adaptador anterior: una lectura durante la escritura borra `.cnt`,
  devuelve `null` y sigue devolviendo `null` después de terminar. El SDK local
  permite lecturas concurrentes; el patrón explica las peticiones anon, sin
  demostrar el instante exacto del fallo en el móvil de la usuaria.
- Dos slots cifrados, commit por puntero y operaciones serializadas por clave;
  migración de ambos formatos previos. Keychain inaccesible no se interpreta
  como logout. Marca persistente de borrado evita recuperar sesiones antiguas.
- Arranque sin `signOut` por errores transitorios, recuperación cada 5 s o en
  foreground y protección contra resultados anteriores a eventos de Auth.
- 44 pruebas de autenticación/juego, typecheck y ESLint focalizado correctos.
  Sin cambios productivos ni publicación. Requiere distribuir el cliente y
  validar en móvil. No volver al adaptador viejo tras migrar al formato v2.

## Navegación inferior solo con iconos (local, 2026-09-30)

- `AppPagerTabBar` oculta las etiquetas visuales de sus cinco accesos y amplía
  los iconos. Los nombres siguen disponibles para VoiceOver/TalkBack mediante
  `accessibilityLabel`. Sin migración SQL; pendiente revisión visual en dispositivo.

## El Jamón en Radar de ahorro (backend productivo + cliente local, 2026-09-30)

- El Jamón ya funciona como origen y destino. La migración productiva
  `20260930203842_extend_comparator_to_eljamon.sql` crea la vista
  `eljamon_comparator_products`, amplía los constraints y envuelve el resolutor
  anterior para usar `unit_price`/`price_per_unit` del catálogo común. Solo
  entran productos publicados, disponibles, positivos y con unidad canónica.
- `catalog_cheaper_products_v7` conserva su firma pública. La nueva función
  interna homónima reutiliza v6 para las veinte cadenas anteriores y añade El
  Jamón como destino con la misma caché híbrida, compatibilidad y top-2.
  Materializador, worker `catalog-embed` v16 y workflow admiten 21 catálogos.
- Backfill completo y asentado: 6.749/6.749 embeddings, cola global vacía y cero
  fallos. Se pausó con 6.649 completados para dejar actuar al autovacuum y luego
  se drenó el último lote. Postflight: 100 tuplas muertas (0,043 %), HNSW
  válido/listo/vivo, sin mantenimiento en curso y pipeline `paused`.
- Smoke productivo autenticado: 2 resultados El Jamón → Mercadona y 2 resultados
  Mercadona → El Jamón. El segundo sentido marcó correctamente como más barata
  una leche de El Jamón a 0,94 €/L frente a 0,96 €/L. Advisors sin avisos nuevos
  específicos de esta integración; permanecen avisos históricos del proyecto.
  111 pruebas dirigidas, TypeScript y `git diff --check` pasan.
- El cliente local ya no oculta el botón como origen ni destino y el workflow
  materializa tras cada sync correcto. Falta publicar una build para llevar el
  botón a los dispositivos. Las alertas de precio de El Jamón siguen excluidas.

## BM en Radar de ahorro (backend productivo + cliente local, 2026-09-30)

- BM ya funciona como origen y destino del comparador híbrido. La migración
  `20260930200241_extend_comparator_to_bm.sql` crea el snapshot semántico único
  `bm_comparator_products`, amplía los constraints y resuelve disponibilidad,
  precio efectivo y €/unidad con la ubicación provincial del CP del perfil.
  `catalog_cheaper_products_v7` conserva su contrato y delega en la nueva capa
  interna v6 para añadir BM sin duplicar el camino de las otras 19 cadenas.
- El stack actual (materializador y worker `catalog-embed` v16) admite 21
  catálogos. El cliente local deja de ocultar BM como origen/destino. Hace falta
  publicar una nueva build para que el botón llegue a los
  dispositivos instalados.
- Backfill productivo completo: 10.197/10.197 embeddings vigentes, 0 trabajos
  en cola y 0 fallos BM. Un autovacuum automático se dejó terminar con el
  pipeline pausado; postflight: 5.507 tuplas muertas (2,393 %), HNSW válido,
  listo y vivo. El pipeline vuelve a `paused`.
- Las cargas grandes destaparon el timeout de 8 s al cerrar/revalidar manifiestos.
  `20260930200823_raise_embedding_manifest_registration_timeout.sql` y
  `20260930201137_raise_embedding_run_completion_timeout.sql` dan 60 s solo a
  esas dos RPC. Las dos primeras tentativas quedaron auditadas como `failed`;
  la reconciliación idempotente posterior cerró las 10.197 dependencias sin
  duplicar trabajos.
- Smoke productivo: BM como origen devolvió 2 resultados; BM como destino
  devolvió 2 resultados usando un origen con GTIN compartido. 53 pruebas
  dirigidas y `npx tsc --noEmit` pasan. Advisors sin avisos nuevos de BM; quedan
  avisos históricos del proyecto fuera de este cambio.

## Embeddings del comparador: cola drenada (producción, 2026-09-30)

- Drenaje autorizado de 7.599 trabajos activos mediante canarios de una petición.
  Cada despacho volvió inmediatamente el control a `paused`, de modo que el
  worker no pudo encadenar la cola. Resultado final verificado: 0 trabajos
  activos, 0 fallos terminales, modo `paused` y `canaryRemainingRequests=0`.
- Hubo un fallo DNS local tras 4.400 confirmaciones; se verificó y reafirmó la
  pausa antes de continuar. No fue un fallo del worker ni dejó trabajos fallidos.
- Postflight: HNSW válido/listo/vivo, 597.745.664 bytes; 7.346 tuplas muertas
  (3,310 %, umbral 5 %); sin vacuum ni mantenimiento de índice y
  `requiresAttention=false`. No se cambiaron esquema, código ni catálogos.

## Palabra de hoy: rechazos esperados sin falsos errores Postgres (2026-09-29)

- Confirmado en Logs Explorer: 130 `WORD_INVALID` y 2 `WORD_REPEATED` en la
  ventana consultada aparecían con severidad `ERROR`; procedían de
  `private.word_submit`, no de una avería de Postgres.
- `20260929131848_word_game_expected_rejections.sql`, aplicada en Supabase como
  `20260929132148_word_game_expected_rejections`, incorpora el RPC compatible
  `word_game_guess_v2`, que captura solo esos dos resultados esperados y los
  devuelve como datos. El RPC legacy sigue sin cambios para clientes anteriores;
  `WORD_STALE`, `WORD_EXPIRED`, auth y demás fallos reales continúan propagándose.
- Cliente y pruebas locales preparados. La prueba remota READ ONLY devolvió
  `accepted: false` sin una entrada `ERROR`; ACL, invoker y `search_path` son
  correctos. Pendiente publicar el cliente que empieza a usar el RPC nuevo.

## Vídeo BM: versión independiente a 60 fps (2026-09-29)

- Entrega separada en `marketing/bm-launch-10s-60fps/`: MP4 de 10,00 s,
  1080 × 1920/60 fps, portada, HTML autónomo y ZIP de fuentes editables.
- Tres productos publicados/disponibles de BM Pagola (`14942D`, CP `20009`),
  verificados por SELECT. Sin precios ni descuentos; incluye la nota postal.
- Cierre fijo los últimos 90 fotogramas. Música y efectos originales, Anton y
  logos locales. Sin publicación ni cambios de app/backend; TypeScript correcto.
- Esta carpeta evita mezclar fuentes con la otra exportación de BM. Usar sus
  propios scripts, recursos y manifiesto de procedencia para regenerarla.

## Vídeo de lanzamiento BM (local, 2026-09-29)

- Entrega en `marketing/bm-launch-10s/`: MP4 vertical de 10 s, portada,
  composición editable, música original y verificaciones. Anton y paleta del
  logo BM local. Productos publicados/disponibles verificados por SELECT en
  BM Princesa (`14946`, CP `28008`); sin precios ni descuentos concretos.
- Material promocional sin publicar; no cambia la app ni sus datos. Detalle y
  trazabilidad en el README de la carpeta.

## Alcampo: ofertas regionales y límite de la prueba por CP (2026-09-28)

- Confirmadas ramas oficiales separadas: `OC3009192` (Folleto de Alimentación,
  excepto Canarias) y `OCFolletocanarias` (Folleto Alimentación Canarias).
  Directorios paginados completos: 2.048 y 882 productos en oferta; 875 comunes,
  1.173 solo en la primera rama y 7 solo en la segunda.
- **Ambas consultas usaron Vaguada**: prueban distinta composición de las ramas,
  no los precios/condiciones efectivos de dos tiendas. No extrapolar la antigua
  afirmación de catálogo nacional a todas las ofertas actuales.
- Cobertura `DELIVERABLE` para 28029, 08001, 41001, 35001 y 07001. El cambio de
  destino temporal para 08001 recibió 403; el selector web quedó cargando. No se
  logró una comparación válida de sesiones entre esos códigos postales.
- Evidencias locales: `scripts/logs/alcampo-regional/`. Análisis y límites en
  `scripts/README-alcampo-ofertas-regionales.md`. Sin cambios de datos productivos.


## Alcampo: acceso JSON parcial verificado (2026-09-28)

- Cliente anónimo `scripts/lib/alcampo-api.mjs` y prueba de solo lectura
  `scripts/probe-alcampo-api.mjs`: categorías, directorio paginado de ofertas y
  detalle de una promoción. Cookies solo en memoria, sin claves ni publicación.
- Prueba real: 28 raíces (4.513 apariciones de nodos), 4.726 productos en oferta
  en 16 páginas completas y 894 IDs de promoción. Detalle de «Todo a 1 €»:
  716 productos y vigencia estructurada. Región anónima Vaguada; incluye también
  no alimentación, no representa todo el catálogo ni acredita paridad regional.
- `/v6/product-pages` y PUT `/v6/products` siguen devolviendo HTTP 403. No dar por
  resuelto el acceso al catálogo general. La prueba termina con código 2 para
  distinguir este acceso parcial; el runner Playwright previo sigue separado.
- Datos locales en `scripts/logs/alcampo-api/` (gitignored); endpoints, comandos,
  límites y precios `price`/`promoPrice` en `scripts/README-alcampo-api.md`.
  Cuatro pruebas dirigidas y TypeScript correctos. Sin migraciones ni escrituras
  en producción; continúa pendiente el trabajo productivo descrito el 24-09.


## Inicio: campañas remotas y Respira (backend productivo, cliente local, 2026-10-01)

- Tabla `sponsor_campaigns` y bucket público `promotions` en producción mediante
  `20261001103011_sponsor_campaigns.sql` (versión remota `20261001103254`).
  Respira activa con imagen versionada
  verificada byte a byte, App Store en iOS y `https://respiraapp.fit` en Android;
  sin destino web. RLS permite
  solo lectura autenticada de campañas activas/vigentes y ninguna escritura.
- Inicio revalida al entrar, foreground, refresh y cada cinco minutos enfocado.
  Caché de metadatos por usuario limitada a una hora; expiración por temporizador
  y resultado vacío que retira el anuncio. `expo-image` cachea imágenes en disco.
  Cambios posteriores desde Dashboard, guía en `docs/patrocinios.md`.
  Backend listo; falta distribuir cliente y revisión visual en dispositivo.
- La creatividad remota se presenta mediante el
  componente reutilizable `ResponsivePromotionCard`. Mantiene 3:1, ancho fluido
  con máximo de 372 pt y altura máxima de 124 pt, etiqueta visible «Publicidad»
  y descripción accesible ES/CA. Sigue antes de «Última compra».
- Toda la creatividad es un enlace a la ficha de Respira en el App Store
  (`id6759206565`), con rol/hint accesible, respuesta visual al toque y error
  localizado si no puede abrirse. Antes de publicar, añadir el flujo para
  informar de anuncios inapropiados y revisar las declaraciones de App Store y
  Google Play.

## BM: nutrición sincronizada en Supabase (2026-09-28)

- `scripts/sync-bm.mjs` consulta el JSON nutricional público por EAN después
  del control de cobertura de las siete zonas. Guarda `nutrition`,
  `ingredients`, `allergens` y `conservation` en `bm_products`, con TTL de 90
  días, límite por run, deduplicación por EAN y conservación ante errores.
- Migración `20260928124545_bm_nutrition_details.sql` aplicada en producción;
  la vista `bm_product_locations` expone los cuatro campos. Dos syncs reales
  completaron el backfill: 10.197 EAN comprobados, 4.873 con nutrición y cero
  fallos de descarga. TypeScript y pruebas BM correctos.
- **Pendiente de cliente:** leer los campos en la ficha BM y conectar el Índice
  alimentario. Esta tarea cubrió el sync y almacenamiento, no la interfaz.

## Información de supermercados en Android (local, 2026-09-28)

- «Todos tus supermercados» y Lidl en Canarias comparten botón de información
  con superficie de acento suave de 34 pt en Android y objetivo de 44 pt. El
  botón junto al selector y el de la cabecera de tienda Lidl también se ajustan.
- El aviso Lidl de Android reutiliza el popup visual de «Todos tus
  supermercados» dentro de los selectores y del picker de tienda. iOS mantiene
  el diseño de botones y el aviso nativo existentes. Sin migración; prueba
  dirigida, TypeScript y lint correctos. Pendiente comprobación visual Android.

## Palabra de hoy: controles de Android (local, 2026-09-28)

- Los selectores Jugar/Ranking/Grupo y Hoy/Semana/Mes/Año/Histórico tienen
  pista opaca y selección sólida de acento en Android; el cristal iOS conserva
  su presentación. Volver, Premios e Info comparten el estilo transparente y
  la caja táctil de 44 × 44 pt en ambas plataformas.
- Cambio solo de cliente, sin migración. TypeScript y lint focalizado correctos;
  pendiente revisión visual en Android.

## Palabra de hoy: aviso de idioma una sola vez (local, 2026-09-28)

- La aceptación del aviso catalán se guarda por cuenta en AsyncStorage del
  dispositivo. Tras «Entesos», las siguientes entradas al juego ya no muestran
  el popup; no requiere migración SQL.

## Métricas de patrocinio implementadas (2026-10-01)

- Nueva RPC `record_sponsor_banner_event`, tabla `sponsor_metrics_private.events`
  y vista administrativa `sponsor_banner_daily_stats` desplegadas. Migración
  local `20261001200803` = remota `20261001201247`; no reaplicar por timestamp.
- Instrumentación de Inicio en cliente 1.3.3, sin PostHog: visibilidad 50 %/1 s,
  una impresión por campaña/visita, clics sin bloquear enlace. Ventanas superpuestas,
  carga fallida, blur/background y scroll interrumpen el tiempo de exposición.
- Tests SQL locales y remotos con rollback correctos; cero eventos de prueba.
  Pendiente publicar cliente, validar visualmente y revisar privacidad/retención.
  Consultas SQL de métricas en `docs/patrocinios.md`.

## PostHog: estado de retirada (2026-10-01)

- Eliminados SDK, instrumentación, consentimiento/UI, módulos propios, tests,
  POSTHOG.md y token local. Retiradas las dependencias exclusivas y el plugin
  expo-localization. ExpoFileSystem sigue siendo necesario transitivamente por Expo.
- Versión 1.3.3, campañas y métricas propias de actividad de Supabase intactas.
- CocoaPods sincronizado: ExpoDevice y ExpoLocalization eliminados. TypeScript,
  lint focalizado y diff-check correctos; sin referencias al SDK en código/lockfile.
- No se borró el proyecto ni datos remotos de PostHog. No había token en EAS.
  Las builds anteriores requieren sustitución/recompilación para reflejar la retirada.

## Palabra de hoy: participantes ficticios retirados (2026-09-27)

- `20260927090604_remove_four_word_ranking_demo_users.sql` revierte las cuatro
  filas virtuales `demo_001`–`demo_004` del ranking general y de las mejores
  posiciones del Perfil. Los resultados actuales se calculan solo con partidas
  reales en Hoy, Ayer y los periodos agregados.
- Las filas ficticias se generaban en SQL; no había cuentas ni partidas
  ficticias persistidas que borrar. Aplicada en Supabase como versión
  `20260927090604`; la consulta remota dio cero filas ficticias en Hoy y Ayer.
  La prueba PGlite valida la adición histórica y la retirada de ranking, Grupo,
  Histórico y la RPC legacy.


## Palabra de hoy: ranking general con puestos Plus (local, 2026-09-26)

- Podio y números de puesto (`#n`) visibles para todos. Desde el cuarto puesto,
  una cuenta sin Plus ve foto, nombre, aciertos y puntuación difuminados; el
  lector de pantalla solo anuncia `#n`.
  No hay mensaje explicativo en la lista ni se añade o destaca su fila propia.
  «Mi posición»
  muestra candado y abre Plus. El mismo gate cubre Hoy, Ayer, Semana, Mes,
  Año e Histórico.
- Grupo está exento. En Perfil, las mejores posiciones quedan bloqueadas;
  racha y calendario permanecen visibles. Copias ES/CA y beneficio del paywall
  actualizados.
- Restaurado `expo-blur` a petición del usuario para generar una nueva build en
  Xcode. La build anterior mostraba «Unimplemented component» porque no incluía
  el módulo nativo. Sin migración: la RPC conserva su respuesta por
  compatibilidad. El rediseño de vidrio del 27-09 usa tokens compartidos en
  `src/constants/wordRankingGlass.ts` y especificación CSS/prompt en
  `docs/word-ranking-glass-design.md`. Filas #4–#7 y acceso a Plus verificados
  en el simulador iOS; el Grupo de prueba no tenía cesta activa.


## Límite de 3 cestas de grupo gratuitas (local, 2026-09-26)

- Optimizada la carga de la pestaña Grupos: los botones usan el snapshot por
  usuario al primer render y la lista sigue revalidándose en segundo plano.
  `CartContext` comprueba la membresía actual en Supabase antes de activar.
  Si la recarga de la lista falla, la caché visible se mantiene. Si la caché
  es anterior a `joinedAt`, se completa con una consulta ligera de membresías.
- Solo se aplica desde la versión nativa 1.3.2: se lee el módulo nativo
  `ExpoApplication` de forma opcional para que una OTA con `runtimeVersion`
  por SDK no limite ni rompa builds anteriores.
  Expo Go/web toma la versión del proyecto para las pruebas.
- Implementación local: la cuenta gratuita conserva la cesta de sus tres
  primeras membresías por `group_members.joined_at`; puede crear o unirse a
  otros grupos, pero sus cestas quedan bloqueadas. Plus las desbloquea todas.
- `GroupsScreen` muestra el aviso cerrable con «x» solo a cuentas sin Plus con
  más de tres grupos (se recuerda por usuario y dispositivo), y botones con
  candado que abren el paywall.
  `GroupDetailScreen` no consulta el contenido de cestas bloqueadas y muestra
  un candado con CTA. El paywall añade «Grupos ilimitados» en ES/CA.
- `CartContext` valida activación, restauración del carrito y operaciones de
  repetición/alta; Home e Historial abren Plus si intentan repetir una compra
  en una cesta bloqueada. Falta validación visual en dispositivo y publicación.
- Sin migración SQL: la limitación es de cliente; las versiones publicadas y
  consultas directas autorizadas por las policies existentes no quedan bloqueadas.

## Palabra de hoy: banner de racha actual (2026-09-26)

- Una finalización local del reto, acierto o derrota, muestra arriba un banner
  temporal con `flame-outline` y «Racha actual · n días»/«Ratxa actual · n dies».
  Se presenta después de revelar la última fila, dura 4 s en total, respeta
  Reducir movimiento y no se repite al reabrir un resultado guardado.
- Ocupa el ancho útil y los 56 pt de la fila de cabecera. Etiqueta a 18 pt y
  contador a 24 pt: tras 300 ms la racha previa sale hacia arriba y la nueva
  entra desde abajo; el fuego acompaña con tres pulsos ascendentes.
- El dato no se infiere del calendario limitado a 12 meses: el RPC propio de
  estadísticas incorpora `currentStreak`, contando la isla de días terminados
  que acaba hoy según Europe/Madrid. Local
  `20260926133620_add_current_word_streak.sql`, aplicada en producción como
  `20260926134026_add_current_word_streak`.
- Se mantienen el wrapper `security invoker`, la comprobación de identidad de
  la función privada, `search_path` vacío y la denegación a `anon`. PGlite,
  verificación remota, pruebas dirigidas, lint y TypeScript correctos; falta QA
  visual en dispositivo.

## Tus favoritos: cabecera unificada (local, 2026-09-26)

- Productos en Tus favoritos usa buscador expandible, orden por precio/envase
  y precio unitario, y lista/cuadrícula con el mismo lenguaje Liquid Glass de
  las demás pantallas de producto. No se añade botón de filtros.
- Precio ascendente queda seleccionado por defecto y el precio unitario conserva
  el paywall Plus. Categorías y su buscador no cambian.
- Sin backend ni migración. TypeScript, lint focalizado y diff-check correctos;
  falta validación visual en dispositivo.

## Botón «Avísame» opaco en las fichas (local, 2026-09-26)

- `ProductAlertButton` sustituye el fondo de acento al 12 % y la capa blanca al
  8 % por una superficie sólida del tema, con borde de acento también opaco. La
  pastilla sigue superpuesta en la esquina superior derecha de la imagen.
- Sin cambios funcionales, backend ni migración. Prueba dirigida, lint,
  TypeScript y `git diff --check` correctos.

## Cesta BM: categoría principal para agrupar por zona (2026-09-27)

- BM persistía solo `category_name` N2 al añadir; así, productos de
  «Congelados › Verduras y hortalizas» terminaban en Fruta y verdura.
- La vista `bm_product_locations` incorpora `cart_category_name` (N1 › N2),
  sin alterar el `category_name` N2 usado por filtros. `mapBm` lo entrega a la
  cesta en búsqueda, categorías, ficha y feeds. `zones.ts` da prioridad a la
  N1 en secciones específicas (incluida Congelados) y a la N2 en raíces
  genéricas como Alimentación y Frescos.
- Migración `20260927080446_bm_cart_root_category.sql` aplicada remotamente.
  Corrigió 16 líneas BM en cestas; no había `purchase_items` BM. Verificación
  remota: ruta «Congelados › Verduras y hortalizas» y cero líneas pendientes.
  Pruebas focalizadas y `npx tsc --noEmit` correctos. Falta publicar el cliente.

## Carrito: clasificación de pollo, hamburguesas y lasaña (local, 2026-09-26)

- `src/constants/zones.ts` amplía las reglas de «Carne, pescado y charcutería»
  con las categorías/nombres de hamburguesas, burger, aves, pollo/pollastre,
  chicken y pechuga; «Platos preparados» reconoce también lasaña/lasanya y
  canelones.
- Corrige Burger Crunchy Chicken, Filetes pechuga de pollo corte fino y Lasaña
  Boloñesa Hacendado incluso en artículos antiguos cuya categoría sea nula o
  «Otros». Las categorías válidas conservan prioridad para no recolocar caldo de
  pollo ni lasaña ultracongelada.
- Cambio solo de cliente, sin migración. Cobertura dirigida, lint, TypeScript y
  `git diff --check` correctos.

## Onboarding sin paywall (local, 2026-09-26)

- «Entrar en QuéFalta» aplica el perfil completado y pasa directamente a Inicio
  con la transición existente. Retirado el paywall final y su estado temporal.
- Los accesos a Plus fuera del onboarding conservan su comportamiento.
- Sin cambios de backend ni migraciones.


## Brand film vertical de 10 segundos (2026-09-26)

- Vídeo terminado en `marketing/brand-film-10s/quefalta-brand-film-10s.mp4`,
  1080 × 1920 a 60 fps, con música original y animación por componentes de la UI.
- La carpeta incluye logo/activos reales, composición HTML editable, renderizador,
  partitura procedural, codificador y comprobaciones del MP4. Sin publicación.
- No modifica código de aplicación. El typecheck obligatorio detectó tres estilos
  inexistentes en `StoreDropdown.tsx`, fuera de esta tarea; documentados en README.

## Información de «Todos tus supermercados» bloqueado (local, 2026-09-26)

- La tarjeta bloqueada de «Todos tus supermercados» muestra una «ⓘ» a todas
  las cuentas sin Plus, independientemente de región/CP; desaparece al estar
  desbloqueada. Está cubierta en el modal propio de Catálogo y en el selector
  compartido de Ofertas, Novedades y Cambios de precio. La superficie visual
  Liquid Glass es de 30 pt y queda abajo a la izquierda, manteniendo 44 pt táctiles.
- El popup visual ES/CA describe la búsqueda y lista conjunta, ordenación de
  precios, consulta unificada de ofertas/novedades/cambios, logos de procedencia
  y mantenimiento de los filtros de cada pantalla. No abre el paywall al tocar
  la información; la tarjeta bloqueada conserva su apertura habitual del paywall.
- Debajo del texto replica tres filas del catálogo con productos reales de
  Mercadona, Carrefour y Lidl, imagen, envase y precio; el logo del súper queda
  superpuesto en la esquina superior izquierda. Las tres referencias de leche
  semidesnatada marcaban 0,84 € al verificarlas el 26-09-2026 y el popup aclara
  que es un ejemplo cuyo catálogo y precios pueden cambiar.
- El popup se monta como overlay dentro del propio selector; no debe volver a
  convertirse en un segundo `Modal`, porque iOS no lo presentaba sobre el modal
  de supermercados aunque el toque de la «i» sí llegaba correctamente.
- Reproducido el fallo original y validada la corrección en iPhone 15 Pro con
  iOS 26.5 Simulator: la «i» abre el ejemplo, carga las tres imágenes y Aceptar
  vuelve al selector. TypeScript, lint, prueba dirigida y diff-check correctos.
- Cambio solo de cliente, sin backend ni migración. Pruebas dirigidas, lint,
  TypeScript y diff-check correctos; pendiente QA visual.

## Aviso de catálogo Lidl para Canarias (local, 2026-09-26)

- El selector compartido muestra una «ⓘ» cuando Lidl está activo y el perfil
  pertenece a Canarias (`region = ES-CN`); se aplica a Catálogo, Ofertas,
  Novedades, Cambios de precio y Favoritos.
- Para que sea visible antes y después de seleccionar Lidl, también se pinta en
  la esquina inferior izquierda de su tarjeta en ambas rejillas de súpers y en
  la cabecera del selector de tienda Lidl. Se considera Canarias por región o,
  como fallback ante perfiles antiguos, por CP 35/38.
- Al pulsarla, un aviso nativo ES/CA explica que el contenido corresponde al
  catálogo principal de Madrid usado como referencia: se puede consultar con
  normalidad, pero surtido, promociones y algunos precios pueden diferir en
  Canarias y el importe final debe comprobarse en tienda.
- Sin backend ni migración. Pruebas dirigidas, lint, TypeScript y diff-check
  correctos. Con el perfil canario del simulador se verificaron la «i» sobre la
  tarjeta Lidl y la apertura del aviso en iPhone 15 Pro con iOS 26.5.

## Perfil: estadísticas de Palabra de hoy (2026-09-26)

- «Mis estadísticas» no se muestra en Perfil y «Editar» recupera su diseño
  anterior. La pantalla dedicada conserva el bloque: mejor racha de días
  consecutivos completados, mejores puestos diario/semanal/mensual/anual del
  ranking general y tablero mensual desplazable de los últimos 12 meses.
  El bloque ya no se muestra directamente en Perfil.
- Victoria y derrota cuentan igual para actividad/racha; iniciar sin terminar
  no cuenta. Fechas según Europe/Madrid, histórico desde el reinicio v2 del 16-09.
- Los puestos usan los mismos puntos/empates del ranking y comparan todos los
  periodos. Se muestra la fecha del mejor periodo; si aún está abierto se marca
  «En curso» y puede cambiar. No son máximos intradía guardados permanentemente.
- RPC `word_game_profile_statistics` sin parámetros de usuario, con comprobación
  de auth, implementación privada y wrapper invoker; solo devuelve datos propios.
  Migración `20260926113035_word_profile_statistics.sql` aplicada en Supabase.
- Cliente ES/CA, temas, carga/error/reintento y refresco al enfocar o volver a la
  app. Datos en memoria por instancia/cuenta; ninguna clave global persistida.
- Validación: integración PostgreSQL del juego y paridad de los cuatro récords,
  rachas y actividad, permisos, calendario bisiesto y parser, TypeScript y lint.
  Pendiente revisión visual en dispositivo; no se ha publicado build ni OTA.


## Versión comercial 1.3.2 (local, 2026-09-25)

- `app.json`, `ios/QuFalta/Info.plist` y `MARKETING_VERSION` de Debug/Release
  declaran `1.3.2`. El build iOS se conserva en 34 y Android tomará la versión
  comercial de Expo en el siguiente prebuild/build.
- No se cambian las claves históricas de avisos 1.3/1.3.1.

## Palabra de hoy: puntuación final destacada (local, 2026-09-25)

- En derrota se han retirado la frase «Mañana, otra oportunidad» y el sol;
  permanece la revelación de la palabra. Victoria conserva trofeo y título.
- Los puntos se muestran a 42 pt sin tarjeta, fondo, borde ni sombra; el tiempo
  queda en una fila separada justo debajo. Sin backend ni migración.
- Prueba de contrato visual, TypeScript y diff-check correctos. Falta validar el
  resultado final en dispositivo, especialmente con texto grande.

## Novedades y Cambios de precio: cabecera unificada (local, 2026-09-25)

- Novedades y Cambios de precio replican la fila compacta ya aplicada a Ofertas:
  buscador expandible, ordenación, Filtros Liquid Glass y lista/cuadrícula.
- Novedades empieza en precio ascendente. Cambios empieza en Bajadas y su nuevo
  buscador agota en segundo plano la paginación semanal disponible para buscar
  sobre todo el conjunto, no solo sobre la primera página.
- Los popups ya no duplican ordenaciones: Novedades conserva súper/categoría/
  rango; Cambios, categoría/magnitud. Precio unitario continúa sujeto a Plus.
- Sin backend ni migración. TypeScript, lint focalizado y diff-check correctos;
  pendiente revisión visual en dispositivo.

## Ofertas: cabecera alineada con Catálogo (local, 2026-09-25)

- Ofertas usa ahora la misma fila compacta que Productos en Catálogo: buscador
  expandible, orden por precio/envase y precio unitario, Filtros y vista.
- Filtros está situado entre ordenación y lista/cuadrícula. El popup conserva
  sus facetas y rango de precio, pero no muestra ni limpia la ordenación externa.
  El precio unitario sigue abriendo el paywall cuando corresponde.
- El botón Filtros comparte el segmentado Liquid Glass del resto de la fila y
  puede reabrirse aunque esté acentuado. Por defecto queda activo precio ascendente.
- Sin backend ni migración. TypeScript, lint focalizado y diff-check correctos;
  falta validación visual en dispositivo.

## Palabra de hoy: enlace compartido abre Inicio (local, 2026-09-25)

- Retirado `ES/CA` del mensaje compartido; la fecha queda en su propia línea.
- El mensaje usa `https://quefalta.es/inicio?v=3`. El receptor de enlaces guarda el
  destino durante el arranque/login/onboarding y, al estar listo, navega a
  `Inicio > HomeMain`; no abre el juego. Invitaciones `/join/<id>` intactas.
- Android incorpora `/inicio` al intent filter. Pruebas unitarias del parser y
  del mensaje, TypeScript y diff-check correctos.
- Web subida y desplegada en `QueFalta-Web` commit `d11fc12`: `/inicio/` y la
  copia AASA `.json` responden 200; rutas `/join/*`, `/inicio` y `/inicio/*`
  verificadas. Queda crear en Amplify el rewrite 200 documentado del endpoint
  AASA sin extensión hacia la copia `.json`: hoy sigue respondiendo 301 con barra
  final, que Apple no acepta para Universal Links.
- La preview de `/inicio` usa tarjeta `summary`, icono 180×180 a la izquierda y
  los textos de Palabra de hoy a la derecha; la query `v=3` renueva cachés sociales.

## Palabra de hoy: resultado compacto (local, actualizado 2026-09-26)

- El panel de resultado usa 18 pt de padding y puntos a 42 pt; el contenido se
  reparte hasta el margen inferior seguro para aprovechar el alto libre.

- Al terminar el revelado, el panel conserva icono/título solo en victoria y
  separa los puntos de la fila de tiempo. Mantiene solución en derrota,
  confirmación y Compartir.
- El tablero, la separación de filas, las casillas y sus letras conservan las
  mismas dimensiones antes y después de resolver la palabra. Conserva seis
  filas; oculta la leyenda al acabar y vuelve al inicio al mostrar el resultado.
- Scroll disponible como respaldo para texto de accesibilidad muy grande,
  errores o ventanas excepcionalmente pequeñas. Pendiente validación visual.


## Palabra de hoy: participantes ficticios retirados (2026-09-25)

- Migración local `20260925092356_remove_word_ranking_demo_users.sql`, aplicada
  en producción como `20260925092539_remove_word_ranking_demo_users`.
- Retirados los 100 participantes `demo_001`–`demo_100`, sus 400 resultados y
  la tabla privada `private.word_ranking_fixtures`. Ese estado del 25/09 fue
  sustituido por cuatro participantes virtuales nuevos el 26/09.
- La función optimizada conserva periodos, grupos, privacidad, posición propia,
  límite de 150 filas y contratos legacy. La verificación del 25/09 devolvió
  cero `demo_` en Hoy/Semana/Mes/Año/Histórico y mantuvo los permisos autenticados.
- Prueba PostgreSQL completa correcta; no requiere cambio de cliente ni build.

## Buscador experimental retirado (2026-09-25)

- Eliminado por petición del usuario el motor de búsqueda v2: 160 funciones/RPC,
  19 tablas privadas con 475.151 documentos y 246.082 registros de mantenimiento,
  permisos y rol lector. Los catálogos fuente y el buscador vigente se conservan.
- Rama Supabase `catalog-search-v2-test` eliminada; solo queda `main`.
- Migración de retirada local `20260925091055_remove_catalog_search_experiment.sql`,
  aplicada en producción como `20260925091215`. No reaplicar las antiguas
  migraciones del experimento: se han retirado del árbol local junto al laboratorio,
  scripts, fixtures, pruebas y documentación específicos. Historial remoto conservado
  como auditoría; la migración de retirada documenta el estado final.
- Verificación remota: cero funciones, relaciones o roles del experimento;
  huella de las demás funciones idéntica. Tamaño lógico BD: 9,066 → 6,690 GB.
- Cliente local vuelve a las búsquedas existentes, sin selector remoto ni piloto.
  Se conserva la invalidación de caché por sesión. Sin build, OTA ni commit.
- Validación: TypeScript, lint focalizado y 24 pruebas de búsqueda/caché/BM/
  navegación correctos; RPC actual devuelve 10 resultados con rol authenticated.
  Prueba adicional Lidl: fallo previo por `LEGACY_PROFILE_COLUMNS` retirado en los
  cambios de privacidad del perfil, ajeno a esta tarea.

## Foto de perfil solo para amigos, revisión de funcionamiento (local, 2026-09-24)

- La migración `20260924143007_private_friend_avatars.sql` se aplicó en
  producción el 2026-09-24.
  Mantiene el bucket `avatars` público para las 5.882 fotos existentes y crea
  `avatars-private` para cuentas que activen la opción. El traslado elimina
  la copia pública antes de confirmar la preferencia y la policy privada exige
  ser titular o amistad aceptada.
- Tras aplicar, `avatars` sigue público y `avatars-private` es privado. La
  columna booleana existe con `default false`; la migración sustituyó ambos
  juegos anteriores de policies de escritura pública. La función de acceso es
  `SECURITY INVOKER` y solo `authenticated` puede ejecutarla; advisors sin
  avisos nuevos de avatares. Los objetos públicos existentes se conservaron.
- La app usa las URLs públicas históricas por defecto y URLs firmadas para la
  foto privada. Se revisaron grupos, amigos, recetas, ranking, edición y
  onboarding. TypeScript, lint de archivos tocados, diff-check y 3 pruebas del
  traslado/compensación pasan. Falta prueba E2E con dos cuentas antes de
  publicar el cliente.

## Avisos de incorporación BM y El Jamón (local, 2026-09-24)

- Dos prompts independientes comparten la apariencia y el flujo de Lidl:
  respuesta obligatoria, guardado de `catalog_stores`, logo, movimiento reducido
  y error recuperable. La decisión local se separa por tienda, versión 1.3.2 y usuario.
- BM se limita a los CP de `bmAvailableForPostalCode`; El Jamón, a Andalucía.
  Se encadenan tras Lidl y antes de Novedades/valoración, sin solaparse.
- Onboarding registra las respuestas de las tiendas visibles; un supermercado
  que ya figura seleccionado en el perfil se resuelve como aceptado.

## Palabra de hoy: carrusel manual de puntuaciones (local, 2026-09-24)

- Indicadores pulsables con `GlassSurface` en iOS compatible,
  tinte de acento en el activo. Tamaño visual original: 7×7 pt y activo 20×7 pt,
  sin separación extra; área táctil de 44 pt. Fallback anterior conservado.
- Rebote explícito en cada pulsación, incluida la página ya seleccionada y
  toques repetidos. Sustituye la respuesta nativa variable; respeta Reducir movimiento.

- La ayuda muestra tres páginas para 4, 5 y 6 letras, con una fila por
  intento y su puntuación. Deslizamiento horizontal manual, sin avance automático.
- Tres indicadores pulsables y «Desliza · n de 3» señalan la página actual;
  al reabrir empieza en 4 letras. Textos ES/CA, estilos de tema y accesibilidad.
- Conserva los valores y las reglas de tiempo/domingo. Sin cambios de backend.
- Pendiente comprobación visual en dispositivo.


## Alcampo: promociones completas y exclusivas online (local, 2026-09-24)

- `sync-alcampo-playwright.mjs` añade dos fases tras el catálogo normal: recorre
  las hojas especiales de promociones/campañas y abre `/offers/x/{id}` para
  obtener la membresía completa de cada oferta. Solo fusiona productos presentes
  en el catálogo alimentario de QuéFalta; informa cuántos productos de cada
  landing coinciden.
- Se guardan todas las promociones deduplicadas en `promo_details` y la señal
  agregada `promo_online_only`; la detección combina texto (`Solo Online`,
  `Exclusivo Online`) y pertenencia a la rama exclusiva online.
- Parser ampliado a fechas con año corto/separador `_` y al precio anterior SSR
  `price.original`. Checkpoint v2 reanuda catálogo, descubrimiento y landings.
- Migración local pendiente de aplicar:
  `20260924072152_alcampo_complete_promotions.sql`. Antes de publicar ejecutar
  DRY_RUN completo en Windows; producción sigue con sync del 21-08.
- Piloto real sin escritura correcto: 1 hoja normal, 2 promocionales, 3 landings,
  12/12 coincidencias y 0 incidencias. Verificación directa de `Todo a 1 €`:
  720/720 productos normalizados, fechas correctas y 17 precios anteriores.
  Pruebas dirigidas 10/10, TypeScript y diff-check pasan. La suite completa queda
  en 1.003/1.010 por 7 fallos preexistentes de hashes/contratos ajenos a Alcampo.

## QuéFalta Plus: paywall anterior restaurado (local, 2026-09-25)

- Restaurado el diseño anterior al plan vitalicio: Mensual y Anual vuelven a
  mostrarse en dos tarjetas paralelas, con el anual preseleccionado y el aspecto,
  prueba, CTA y texto legal que tenían antes del rediseño.
- El plan vitalicio y el cambio desde una anual quedan ocultos; Perfil vuelve a
  abrir la gestión oficial de la suscripción en vez de desviar las anuales al
  paywall. Se conserva el soporte interno ya escrito, pero no está expuesto.
- Sin migración ni despliegue backend. Las 8 pruebas dirigidas de Plus,
  TypeScript y `git diff --check` pasan. Pendiente validación visual en dispositivo.

## El Jamón — catálogo integrado en la app (2026-09-23)

- Añadido `scripts/sync-eljamon.mjs` y su guía
  `scripts/README-eljamon-sync.md`. El catálogo público Liferay/Comerzzia se
  recorre con Playwright: 11 raíces, paginación mediante el botón JavaScript,
  deduplicación por SKU y árbol completo de subcategorías.
- El sync selecciona recogida en el centro Comerzzia `268` (Lepe, CP 21440) y
  trata el resultado como catálogo común. Extrae precio vigente, precio anterior
  tachado, €/kg-L-ud canónico, imagen, marca, ofertas, tipo de promoción y
  distintivos. Puede enriquecer fichas con `ELJAMON_DETAILS_LIMIT`.
- DRY_RUN completo validado: **6.857 SKU únicos, 525 categorías, 1.336 ofertas y
  40 nuevos**. También se validaron 2 páginas con enriquecimiento de una ficha y
  la normalización `1,36 €/100gr` → `13,60 €/kg`. Las fichas muestreadas no
  renderizan información nutricional.
- Tablas `eljamon_products`/`eljamon_categories` creadas en Supabase el
  2026-09-23 con RLS, índices, ofertas normalizadas, novedades y trigger de
  cambios de precio. Primer sync real completado: **6.857 productos**, **525
  categorías**, 0 productos en raíz y 0 categorías terminales inválidas. El
  árbol publicado tiene 470 productos a profundidad 2, 6.106 a profundidad 3 y
  281 a profundidad 4.
- App integrada: selector y logo, disponibilidad en Andalucía, catálogo global,
  búsqueda, paginación por precio, árbol recursivo con «Todos los productos»,
  fichas, favoritos, cesta por categoría, ofertas, novedades, cambios de precio
  y estado del sync. Los perfiles existentes no activan la tienda de forma
  silenciosa; pueden seleccionarla en Supermercados. El comparador quedó
  integrado el 30-09 y la UI local ya no lo oculta. Las alertas de precio aún no
  incluyen El Jamón y siguen ocultas para esta tienda.
- Migración `20260923154841_allow_eljamon_cart_items.sql` aplicada en producción:
  `list_items` y `purchase_items` aceptan `bm`/`eljamon` tanto como tienda del
  artículo como en producto vinculado a una nota. Las cuatro restricciones se
  auditaron en `pg_constraint` con `convalidated = true`.
- `npx tsc --noEmit` correcto tras la integración. El script impide publicar
  ejecuciones limitadas o con menos de `MIN_PRODUCTS`.

## ÚLTIMO: esquema Hipercor multicentro desplegado (2026-09-23)

Todo el análisis, esquema, sync local y plan aplazado están consolidados en
[HIPERCOR.md](HIPERCOR.md). Leerlo antes de retomar la integración.

- Main contiene las migraciones `20260923104530_hipercor_multicenter_catalog` y
  `20260923104854_hipercor_multicenter_hardening`; archivos locales con las mismas
  versiones. No editar ni reaplicar estas migraciones productivas.
- Siete tablas nuevas y dos vistas `security_invoker`: centros, resolución
  CP+modalidad, maestro, productos/categorías por centro, historial y sync runs.
- Backfill exacto: 20.338 maestros + 20.338 variantes del centro `010130` y 10
  categorías; 0 diferencias respecto a legado. `hipercor_postal_centers` sigue
  vacío deliberadamente: no inventar cobertura ni sembrar CP de usuarios.
- RLS/grants, ocultación al despublicar centro y trigger de historial verificados;
  prueba de cambio de precio se hizo en transacción y quedó revertida. Advisors
  sin nuevos avisos Hipercor de seguridad ni FK sin índice.
- Legacy `hipercor_products`/`hipercor_categories` sigue siendo compatible. El sync
  multicentro ya está implementado LOCALMENTE, aún sin ejecución real: resuelve el
  selector público de envío, agrupa por `page.store_id`, exige huella idéntica para
  CP del mismo centro, descarga una vez por centro y escribe maestro/variantes/
  categorías/runs. Solo el centro `010130` se espeja al legado.
- Checkpoints separados para resolución postal y centro; stale acotado por centro;
  centros nuevos no son seleccionables hasta publicar catálogo completo. Runner
  Windows: `-PostalCodes`, `-PostalCodesFile`, `-DiscoverProvinces`, `-LocationOnly`,
  `-MaxPostalCodes`, `-MaxCenters`. Informe persistente en
  `scripts/logs/hipercor-location-report.json`. 7 tests Hipercor, TypeScript y
  diff-check pasan. Siguiente: piloto DRY en Windows con varios CP y solo después
  publicación. App todavía no consume el modelo nuevo.

## Hipercor: recuperación local preparada (2026-09-21)

- Diagnosticados ocho fallos consecutivos de GitHub Actions (14–21/09): Akamai
  bloquea al pasar de las ~204 páginas de Alimentación a Desayunos. El último
  éxito fue el 13/09 con 17.951 productos; mismo SHA en éxito y primer fallo.
- `sync-hipercor.yml` ya no tiene cron, solo ejecución manual diagnóstica.
  `scripts/run-hipercor-sync.ps1` es la nueva vía Windows: seguro por defecto,
  exige `-Publish`, carga secretos de `.env.local` solo al publicar y conserva
  logs. Falta ejecutar primero un recorrido completo sin `-Publish` en Windows.
- El crawler incorpora pausas 1,5–3 s/página y 15 s/categoría, cooldown WAF de
  90 s, diagnóstico HTTP/URL/referencia y checkpoint atómico por categoría.
  `-Resume` continúa sin repetir categorías terminadas; solo se publica y marca
  obsoletos tras completar todo y superar 10.000 productos.
- Hipercor sigue fuera de app, comparador y embeddings. No conectar esas capas
  hasta validar dos ejecuciones locales completas y la frescura del catálogo.

## BM integrado en catálogo y onboarding (local, 2026-09-20)

- BM ya es un `CatalogStore` y aparece en onboarding y Preferencias para todos
  los CP de las provincias `01`, `20`, `26`, `28`, `31`, `39` y `48`. Cada
  prefijo se traduce al CP de referencia sincronizado de esa provincia.
- El cliente resuelve el `bm_postal_locations.location_id` de referencia y filtra
  por ubicación todas las superficies: búsqueda/browse, categorías, ficha,
  ofertas, novedades e historial. Los perfiles antiguos no lo activan solos.
- Logo oficial local `assets/stores/bm.png` centralizado en `CATALOG_STORES`:
  cubre onboarding, catálogo, ofertas, novedades, cambios de precio y perfil.
- Navegación añadida con `BmProductsScreen`; ficha reutiliza el modal genérico.
  La exclusión histórica del comparador quedó retirada el 30-09; ver el estado
  productivo al inicio de este documento.
- La base de catálogo sigue en `20260830171924_bm_multizone_catalog.sql` y el
  sync BM continúa manual. Producción verificada por REST anónima: siete
  ubicaciones activas, 7.103–8.420 productos por zona y RPC zonal funcional.
  TypeScript y 27 pruebas focalizadas correctos. En la suite global, los
  tres fallos de contratos estáticos ya se corrigieron y pasan; queda sin poder
  cargar `lidl-release-prompt.test.mjs` porque falta el directorio nativo generado
  `android/`. El lint global actual falla solo por dos errores ajenos en
  `RecipeImageViewer.tsx`. Antes de publicar falta onboarding en dispositivo.

## Palabra de hoy: puntuación detallada en las reglas (local, 2026-09-20)

- `wordGame.rulesBody` muestra las puntuaciones de los seis intentos para 4, 5
  y 6 letras, y separa esos valores del descuento temporal y del doble dominical.
  Actualizado en ES/CA; TypeScript, lint y `git diff --check` correctos.

## Palabra de hoy: tiempo final visible (2026-09-20)

- Producción incluye `20260920165802_word_game_result_duration` (fuente local
  `20260920165521_word_game_result_duration.sql`). `private.word_snapshot`
  entrega la duración persistida sin otra consulta y conserva sus ACL.
- Cliente local pendiente de publicación: muestra `Tiempo: mm:ss` bajo los
  puntos; oculta la solución al ganar y la mantiene al perder. La sesión usa el
  valor persistido para evitar que el tiempo crezca al reabrir el resultado.
- 26 pruebas de sesión/contrato, integración SQL completa, TypeScript, lint y
  `git diff --check` correctos. Asesores de seguridad sin cambios.

## Palabra de hoy: «bonsai» aceptada (local, pendiente de migrar) (2026-09-20)

- `BONSAI` no pertenecía al banco activo RLA-ES v2.9 y el RPC la rechazaba.
  La migración `20260920163807_add_bonsai_to_word_game_dictionary.sql` la añade
  idempotentemente; no toca funciones, permisos, retos, partidas ni puntos.
- `scripts/test-word-game-sql-local.mjs` la ejecuta sobre PGlite y comprueba una
  victoria real por RPC con la entrada `bonsai`. Pendiente aplicar y verificar
  en producción; no requiere nueva build.

## Palabra de hoy: rendimiento de Ranking/Grupo (2026-09-20)

- Ajuste visual local: `WordRankingList` mantiene un marco exterior fijo con
  borde redondeado y 8 pt de margen superior/inferior; solo desplaza contenido.
  Offsets de posición propia actualizados. TypeScript/lint correctos; falta
  comprobación visual porque el simulador tenía una edición de receta abierta.
- `20260920155016_word_ranking_read_optimization.sql` aplicada en producción
  como `20260920155934_word_ranking_read_optimization`. Cambia solo funciones
  de lectura e índice parcial; diez comparaciones reales idénticas y ACL intacta.
- Cliente pendiente de publicación: `useWordRanking`/`WordRankingCache` precargan
  el periodo seleccionado, deduplican y acotan caché/red; `WordRankingList`
  virtualiza filas. Se conserva cabecera fija, periodos, podio y posición propia.
- Verificación SQL local con 10.000 participantes: 296,6 → 120,5 ms de mediana,
  mismos resultados. Test de SQL corregido para ejecutar también en domingo
  (los antiguos valores fijos ignoraban el multiplicador del día real).
- Detalles y límites en CONTEXTO.md y PALABRA-DE-HOY.md. No publicar el resto
  del trabajo en vuelo como parte de este cambio de rendimiento.

## Recetas editables por su propietario (local, 2026-09-20)

- Retirado el bloque de personas del formulario y del detalle; sin cambios de BD.
- Corregido panel blanco al cerrar: fondo transparente del modal/navegación,
  sin salida animada de rutas solo precargadas ni de hijos al desmontar el flujo.

- El detalle muestra un botón de lápiz junto al autor únicamente cuando
  `recipe.authorId === session.user.id`. Abre la ruta independiente `EditRecipe` con
  nombre, foto, raciones, ingredientes, cantidades, pasos, asociaciones y fotos.
- `updateCommunityRecipe` reutiliza rutas de Storage sin cambios, sube reemplazos
  antes de actualizar y retira fotos obsoletas solo después de éxito. Mantiene
  likes/guardados y sustituye la entrada del cache sin recargar toda la lista.
- El botón destructivo del editor abre confirmación nativa; `deleteCommunityRecipe`
  comprueba autor, filtra por `id`/`author_id`, exige fila devuelta, elimina del
  feed y limpia las imágenes. RLS y permisos ya existían; no hay SQL pendiente.
- Para evitar la espera al pulsar el lápiz, el detalle usa un Modal nativo sin
  animación y reproduce su entrada/salida vertical dentro del contenido.
  `RecipeFlowModal` mantiene detalle y editor en un stack dentro de la misma
  ventana: editar apila sobre el detalle sin mostrar el feed; cerrar vuelve a la
  receta actualizada y borrar cierra el flujo. El stack nativo bloqueaba toques
  dentro del Modal en iOS: sustituido por `RecipeModalStack` (StackRouter y vistas
  normales con SlideInRight/SlideOutRight), navegación independiente y raíz de
  gestos aislada del pager. Ambas rutas
  reutilizan `RecipeForm` para campos y persistencia. Creación
  mantiene su animación vertical. El borrado está en la cabecera, junto a Guardar.
- Apertura optimizada: preload de EditRecipe al enfocar un detalle propio;
  RecipeModalStack monta las rutas precargadas fuera de pantalla y reutiliza su
  key al navegar. Barrido de 260 ms al activar, sin montar campos al pulsar.
- Corregido error «Couldn't find a route with the key EditRecipe…»: usePreventRemove
  solo se activa con foco; no registra bloqueos sobre las rutas precargadas.
- Simulador: comprobados Pasos, abrir editor, cerrar conservando el detalle y
  volver a la lista. No se han generado likes públicos durante la verificación.
- Incluye pruebas de propietario, precarga, confirmación, conservación/reemplazo
  de fotos y borrado. Cambio de cliente pendiente de publicación.

## Recetas: carga restaurada en producción (2026-09-20)

- La carga fallaba porque el cliente seleccionaba `recipes.servings` y producción
  aún no tenía la columna. La consulta completa de PostgREST quedaba rechazada.
- Se aplicó `20260915062836_add_recipe_servings.sql` como migración remota
  `20260920112528_add_recipe_servings`. Verificados tipo `smallint`, nulabilidad
  para recetas antiguas, `CHECK` 1–99, permiso de actualización autenticado y las
  tres recetas existentes intactas con `servings = null`. No requiere nueva build.

## Inicio: accesos 2×2 y Favoritos como destino propio (local, 2026-09-19)

- Retirado de Inicio el carrusel de productos favoritos, su dependencia del
  estado de carga y su refresco. El acceso se conserva como tarjeta independiente.
- Novedades, Ofertas, Cambio de precio y Favoritos se presentan en un grid 2×2
  de tarjetas compactas con icono y título, sin texto descriptivo. Cambio local
  de cliente, sin migración SQL.
- Conservan iconos, chevrons y labels. Cada tarjeta añade detrás una marca de
  agua amplia, inclinada, recortada, difuminada y no accesible: NOV/OFE/PRE/FAV.

## Navegador inferior Liquid Glass a 20 pt en iOS (local, 2026-09-19)

- La cápsula queda a 20 pt exactos del borde físico inferior en iOS, sin sumar
  el safe area. Android conserva su cálculo anterior. App integrada y demo
  comparten la nueva geometría. Pendiente de publicar; sin migración SQL.

## Palabra de hoy: ranking demo (histórico, retirado 2026-09-25)

- Estado histórico: estos datos y su tabla fueron eliminados de producción el
  25/09; ver la sección de retirada al inicio del documento.
- `20260919102523_seed_word_ranking_demo_users` añade 100 participantes
  privados `demo_001`–`demo_100` y cuatro días de puntos. Verificados mediante
  el RPC: 100 en diario, semanal, mensual y anual; 0 en Grupo e Histórico.
- No son usuarios Auth ni miembros de grupos y la tabla privada no es legible
  desde roles cliente. Los rankings devuelven hasta 150 filas. PGlite,
  typecheck, lint y 26 pruebas de sesión correctos. Año sigue dependiendo de
  publicar el cliente nuevo; los periodos legacy ya reciben los demos.

## Directorio Lidl semanal y auditoría de syncs diarios (local, 2026-09-19)

- `.github/workflows/sync-lidl-stores.yml` pasa de diario a los lunes 04:35 UTC,
  antes del fleet Lidl de las 11:20 UTC; conserva el disparo manual. El README
  operativo refleja la frecuencia semanal.
- Quedan dos syncs diarios de supermercado en GitHub Actions: Gadis 05:20 UTC
  y Ahorramás 06:00 UTC. Hipercor pasó después a Windows local por Akamai. A las
  05:20 UTC corre además el mantenimiento de
  embeddings, que no sincroniza un catálogo.
- Motivo inmediato revisado: el run `35433253745` del 19/09 recibió HTTP 502 de
  la API oficial Lidl en la primera página, antes de cualquier escritura. El
  cambio de frecuencia es local, no está publicado y no modifica Supabase.

## Análisis de errores recientes (2026-09-17, ~22:06 Madrid)

- 15 errores en 21:06–22:06, sin timeouts: 7 actividad + 3 altas de carrito
  enviados como **anon** por iOS build 52 (HTTP 401); 4 cambios de carrito
  autenticados con IDs ausentes/inaccesibles (403); 1 cierre con pendientes (400).
- Confirmado contra Gateway y ACL/RLS. No abrir permisos: investigar sesión
  efectiva del cliente y reconciliación de carrito. Sin nuevos cambios de código
  ni producción; informe Postgres/catálogo actualizado. Cron y bloqueos sanos.

## Upgrade comprobado (2026-09-17, 20:25 Madrid)

- Usuario pasó a Small 2 GB. Producción recuperada en la ventana observada:
  20:00–20:23 sin timeouts Postgres ni 5xx Auth; catálogo probado 80–86 ms,
  CPU 21,32 % en últimos diez minutos y cron 18 correcto. Sin cambios remotos
  del agente. No confundir errores históricos de la última hora con actuales.
- Quedan errores puntuales de carrito/actividad, publicación del cliente y
  verificación bajo picos. Detalle en el informe Postgres/catálogo. Las notas
  anteriores a esta revisión que indican incidencia en curso son históricas.

## Postgres y carga de catálogo (2026-09-17)

- Confirmados 549 timeouts y 101 conexiones perdidas en una ventana de una hora.
  Saturación de recursos/E/S probable; detalle y pendientes en
  `docs/incidencia-postgres-catalogo-2026-09-17.md`. Sin cambios remotos.
- Cambios locales pendientes de publicación: `catalogBrowse.ts` ya no repite
  una consulta fallida cambiando el orden; `multiStorePager.ts` rellena la página
  global con menos consultas consecutivas, conservando el sondeo inicial pequeño.
- `catalog-browse-resilience.test.mjs` añade cinco pruebas de comportamiento.
  Total 19 dirigidas, typecheck, lint y diff-check correctos. No confundir las
  mejoras locales con una recuperación ya verificada de producción.

## Incidencia Supabase en curso al diagnosticar (2026-09-17)

- Analizada en lectura, ~19:33–19:43 Madrid. Auth: 1.316 HTTP 504 y 293 HTTP
  500 en una hora; SQL y REST reproducen timeouts. Micro 1 GB, CPU 96,07 % con
  IOwait predominante en muestras disponibles y swap alto. No hay bloqueo SQL
  observado; cron 17 continúa pausado; cron 18 falla al arrancar.
- No se ha reiniciado, ampliado compute, modificado producción ni publicado
  cliente. No se ha certificado recuperación. Revisar memoria/compute y posible
  problema del almacenamiento; falta identificar la carga desencadenante.
- Pendiente corregir `AuthContext.tsx:94/108`: hace signOut ante cualquier error
  de getSession, incluidos errores temporales. Typecheck del checkout correcto.
- Informe y siguiente actuación: `docs/incidencia-acceso-2026-09-17.md`.

## Aldi: categorías ausentes (2026-09-17)

- Confirmado en producción: el sync parcial del 14/09 dejó 895 productos y 45
  categorías publicados; Charcutería y Limpieza y hogar quedaron ocultas.
  Recuperados los 1.126 productos que ese run despublicó y ejecutado después
  el sync corregido: 1.985 productos y 129 categorías publicados. Verificación:
  Charcutería 107/4 y Limpieza y hogar 140/8 (productos/subcategorías). El
  comparador Aldi se actualizó; la cola de embeddings sigue pausada.
- Guardarraíles y nombres corregidos en `scripts/sync-aldi.mjs` local, con tests
  y typecheck correctos. **Falta desplegar este script al workflow** para que
  el siguiente sync semanal no repita la despublicación. No mezclar al enviar
  con los cambios locales de Palabra de hoy y otras tareas.

## Palabra de hoy: año e historial de clasificaciones (local, 2026-09-16)

- Ranking y Grupo añaden Año y permiten recorrer día, semana, mes y año
  cerrados desde el reinicio de puntuación. El botón para ver el periodo
  anterior aparece al cerrarse; los rangos usan Europe/Madrid. Histórico
  conserva el total acumulado. Grupo filtra por miembros actuales.
- Migración `20260916211402_word_ranking_period_history.sql` aplicada como
  `20260916211853_word_ranking_period_history`. PGlite cubre límites de
  calendario, disponibilidad, privacidad y permisos. Cliente local pendiente
  de publicación.

## Palabra de hoy: pestaña Grupo (local, 2026-09-16)

- Jugar/Ranking añade Grupo. Compara solo los miembros actuales del grupo
  activo, con el mismo podio y los periodos disponibles. Si no hay grupo activo,
  indica cómo activarlo. El selector y el RPC ya no aceptan «Anterior».
- Migración local `20260916210720_word_group_ranking.sql` con comprobación
  de membresía y privacidad de perfiles; aplicada en Supabase como
  `20260916211123_word_group_ranking`. Prueba SQL local correcta. Cliente
  pendiente de publicación.

## Palabra de hoy: diccionario general es_ES (local, 2026-09-16)

- Migración local `20260916201158_replace_word_game_dictionary_es_es.sql`:
  31.889 palabras/formas de 4–6 letras del RLA-ES `es_ES` v2.9, incluidos
  plurales, sin filtro temático. Las 439 anteriores se deshabilitan si no están
  en la fuente, pero no se borran por el historial; la solución de hoy sigue
  siendo válida aunque proceda solo del banco anterior.
- Generador reproducible `scripts/generate-word-game-es-es.py` y origen/licencia
  documentados en `PALABRA-DE-HOY.md`. PGlite y typecheck correctos. Aplicada
  en producción como **20260916201909_replace_word_game_dictionary_es_es**;
  31.889 activas, 37 antiguas deshabilitadas y retos/partidas/intentos intactos.
  Sin nueva build de app.

## Palabra de hoy: nuevo sistema de puntos (local, 2026-09-16)

- Código local preparado y migración `20260916192534_word_game_scoring_v2.sql`
  aplicada en producción como `20260916193755_word_game_scoring_v2`;
  **cliente todavía sin publicar**. Base 100/85/70/55/40/25,
  4/5/6 letras ×1/×1,2/×1,4, descuento compuesto del 5 % cada 20 s,
  mínimo 1 al acertar y doble el domingo. El inicio explícito queda en servidor.
- `20260916202316_word_game_start_now_reset_history` activó la fórmula el
  **2026-09-16** y borró las 2 partidas anteriores, sus 7 intentos y los
  1.250 puntos acumulados. Producción verificada: 0 partidas, 0 respuestas,
  0 puntos; se conservaron 4 retos y el diccionario. Sin ranking anterior.
  Publicar el cliente actualizado: requiere `word_game_start`; las versiones
  antiguas no podrán enviar intentos desde este corte.
  Ver `PALABRA-DE-HOY.md` y `CONTEXTO.md`.

## DIA en Windows: aviso de provincia 35 abortaba el runner (2026-09-16)

- El primer intento en Windows terminó en `NativeCommandError` al emitir Node
  el aviso esperado `provincia 35: sin servicio`. No llegó al barrido ni a los
  upserts. Causa: PowerShell 5.1 + `*>&1` + `$ErrorActionPreference = 'Stop'`.
- El runner pasa stdout/stderr por `cmd.exe` antes de `Tee-Object`, en el sync y
  el comparador, y conserva `$LASTEXITCODE`. Pendiente probar desde Windows;
  el éxito exige `[dia] OK` y `=== fin (exit 0) ===`.

## Número de personas por receta (local, 2026-09-15)

- El formulario de nueva receta muestra antes de Ingredientes un stepper de
  1–99 personas, inicializado en 2, y persiste el valor. El detalle lo enseña
  con singular/plural en castellano y catalán; las recetas antiguas omiten el
  indicador porque su valor se normaliza a `null`.
- SQL `supabase/migrations/20260915062836_add_recipe_servings.sql` aplicado en
  Supabase como `20260920112528_add_recipe_servings` (`smallint`, `CHECK` 1–99,
  nullable por compatibilidad y permiso de actualización autenticado). Typecheck,
  lint, 31 pruebas focalizadas y SQL/RLS en PGlite correctos. Suite 798/799; el
  único fallo es el previo de Lidl por faltar `android/app/build.gradle`.

## Nueva receta: transición modal desde el CTA (local, 2026-09-14)

- Sustituye la expansión de tamaño del 12 de septiembre por native-stack raíz
  `Tabs`/`NewRecipe`, modal transparente sin animación nativa, spring vertical,
  backdrop al 28 %, pill del CTA hacia Publicar y entradas por bloques a 50 ms.
- `CreateRecipeButton` mide su origen; el contexto solo guarda referencia/estado
  visual efímeros. El formulario conserva diseño y datos. Arranque coordinado
  con presentación/layout nativos para que el spring no transcurra fuera de vista.
- Swipe desde la cabecera en ambos SO, cancelación con spring, X/atrás/publicar
  con salida inversa, medición al cerrar y respaldo si desaparece el origen.
  Reducir movimiento: fade de 200 ms y lectura síncrona del ajuste al montar.
- Enlaces/notificaciones usan el stack de pestañas existente con `pop: true`.
  Se mantiene Reanimated 4.5.1 de Expo 57; no se añaden dependencias.
- Typecheck, lint y 40 pruebas dirigidas correctos; build/QA iPhone 15 Pro iOS
  26.5 y bundle Android correctos. Android nativo/rotación/fps físicos pendientes.
  Predictive back interactivo no disponible en el native-stack/config actuales;
  atrás Android sí conserva el cierre animado. Sin publicación ni migración.
- Detalle y limitaciones: `RECIPE-CREATOR-TRANSITION.md`.

## Compactación de la barra inferior al hacer scroll (local, 2026-09-14)

- La cápsula existente se compacta continuamente al bajar: altura 64→62 pt,
  escala 0,94, icono/label al 90 % y desplazamiento inferior de 4 pt. Conserva
  colores, iconos, selección, badges y pager horizontal. Valores en
  `src/components/bottom-tabs-pager/tabBarScrollPhysics.ts`.
- `TabBarScrollContext` + `useTabBarScroll` usan shared values/worklets:
  zona muerta de 18 pt al bajar, 10 pt de intención al subir y spring suave.
  Tap en fondo/tab, cambio de pestaña o foco expanden y cancelan la respuesta
  a la inercia anterior; cada pantalla conserva su offset. Reducir movimiento
  mantiene la barra grande. También se inhibe la compactación si el ancho
  disponible no permite mantener objetivos táctiles de 44 pt.
- Integradas las cinco pestañas y listas de catálogo mediante opt-in
  `tabBarScroll` en los adaptadores PagerNative. Un spacer animado sustituye
  parte del padding inferior y sigue la geometría real de la cápsula; acciones
  flotantes de cesta/añadir/crear receta acompañan el mismo desplazamiento.
  Carruseles, selectores y formularios modales no controlan la barra.
- Se conserva Reanimated 4.5.1 del stack Expo 57 (sin downgrade a v3).
  Typecheck, lint dirigido, 15 pruebas de física/scroll, bundles Hermes iOS y
  Android y compilación Xcode Debug correctos. En iPhone 15 Pro/iOS 26.5 se
  verificaron compactación al bajar y expansión por tap activo sin mover la
  lista. QA nativa parcial por interacciones/recargas concurrentes del simulador;
  pendientes matriz completa de gestos, Reducir movimiento, Android y fps físicos.
- Ejemplos y matriz de QA en `src/components/bottom-tabs-pager/README.md`.
  Sin migraciones, publicación ni commit.


## Pager inferior integrado en la app (local, 2026-09-14)

- La app normal usa `createAppPagerNavigator` y `AppPagerTabBar`: Inicio,
  Catálogo, Recetas, Carrito y Grupos, conservando TabRouter, stacks, foco,
  eventos, badges y navegación externa. Ya no hace falta abrir una demo para verlo.
- `Pager` y `useTabAnimation` comparten progreso en UI para páginas, pill,
  stretch y blur. Se precargan vecinas tras el primer render y se conservan
  páginas visitadas. Barra flotante con `GlassSurface` y safe areas en ambos SO.
- En iOS el detector vive dentro de cada pantalla nativa (`screenLayout`). Los
  scrolls verticales ceden al pan horizontal; carruseles mantienen su gesto.
  En la raíz de Catálogo el pager tiene prioridad sobre swipe-to-favorite de
  filas; favoritos siguen en la ficha. En listas de detalle se conserva ese swipe.
  Stacks de detalle mantienen el back nativo; DailyWord sigue ocultando la barra.
- Demo social opcional: `npm run demo:tabs`, cinco placeholders independientes.
  Arranque real: `npm start` y Run en `ios/QuFalta.xcworkspace` (scheme QuFalta).
- Módulo iOS local `modules/pager-blur`, enlazado en Pods; requiere recompilar
  el binario para blur (sin módulo el pager funciona nítido). UIKit usa intensidad
  aproximada, no sigma exacto. Android usa filtro GPU API 31+; anteriores sin blur.
- QA en iPhone 15 Pro / simulador iOS 26.5: tap, swipe entre las cinco pestañas,
  swipe corto que vuelve, flick rápido y scroll vertical. Typecheck y lint
  dirigidos correctos; física y regresiones de navegación verificadas. La prueba
  previa de Lidl sigue bloqueada por faltar `android/app/build.gradle`.
- Compilación nativa del target PagerBlur y bundles iOS/Android comprobados en
  la entrega inicial. Pendientes QA Android y medición de fps en dispositivos
  físicos; no se garantiza 60 fps por simulador. Sin publicación ni migraciones.
  Detalles en `src/components/bottom-tabs-pager/README.md`.

## Sync DIA trasladado a Windows (local, 2026-09-14)

- GitHub/Azure ya no es una ruta operativa fiable para DIA: los runs
  `34855549704` (`eastus2`) y `34861658987` (`westus3`) resolvieron las 48 zonas,
  recibieron `404` del BFF retirado y después `403 Access Denied` de Akamai en
  `/congelados/pescado-y-marisco/c/L2132`. Script y workflow eran idénticos a
  los del run correcto anterior; no hubo escrituras parciales.
- Producción sigue en el último éxito del 2026-09-07: 6.403 productos DIA
  publicados. Un dry-run local limitado validó el fallback SSR actual (28 N1,
  273 categorías y 3.521 productos acumulados en una zona) sin tocar Supabase.
- Se eliminó el cron alojado de `sync-dia.yml`, se actualizó su diagnóstico
  manual a Node 22 y se estableció `scripts/run-dia-sync.ps1` como vía operativa.
  El README contiene la Tarea Programada semanal de Windows (lunes 09:50 local,
  `StartWhenAvailable`, límite 2 h, sin solapamiento). Pendiente primer run real
  desde Windows y verificación de `[dia] OK`, comparador y `exit 0`.

## Índice alimentario de Condis sin EAN (local, 2026-09-14)

- `CondisProductModal` calcula el índice local con nutrición, nombre, categoría e
  ingredientes, sin `ean` y sin Open Food Facts. Se integra mediante
  `ProductDetailDiscoverySection` y pasa la nutrición normalizada a la fila propia.
- `parseCatalogNutrition` admite ahora `GR`, el formato real de Condis, además de
  `g`. Producción: 7.585 publicados, 3.797 con nutrición, 4.314 con ingredientes,
  cero con EAN y todas las fichas comprobadas. Sin migración ni escritura remota.
- Typecheck, lint dirigido, `git diff --check`, 9 pruebas focalizadas y parser con
  una tabla real correctos. Suite general 775/776; solo falla la prueba previa de
  Lidl por la ausencia de `android/app/build.gradle`. Pendiente QA y publicación.

## Índice alimentario de DIA sin EAN (local, 2026-09-14)

- `DiaProductModal` reutiliza `useNutritionInfoDisclosure` sin `ean`, usando
  nutrición, nombre, categoría e ingredientes. Calcula con `parseCatalogNutrition`
  y no llama a Open Food Facts.
- `ProductDetailDiscoverySection` muestra coordinadamente el índice y el comparador;
  la fila nutricional recibe el resultado normalizado para el desglose estructurado.
- Producción verificada en lectura: 6.403 publicados, 3.893 con nutrición, 4.373 con
  ingredientes, cero con EAN y 6.403 fichas comprobadas. Sin migración, despliegue
  ni escritura remota.
- Typecheck, lint dirigido, `git diff --check`, 6 pruebas focalizadas y parser con
  tabla real correctos. Suite general 772/773; el único fallo es la prueba previa
  de Lidl por la ausencia de `android/app/build.gradle`. Pendiente QA visual y
  publicación del cliente.

## Índice alimentario de bonÀrea sin EAN (local, 2026-09-14)

- `BonareaProductModal` reutiliza `useNutritionInfoDisclosure` sin `ean`, con
  nutrición, nombre, categoría e ingredientes como entrada. Por contrato no llama
  a Open Food Facts y calcula el índice con `parseCatalogNutrition`.
- El índice y el comparador se revelan coordinados mediante
  `ProductDetailDiscoverySection`; la fila nutricional recibe también el resultado
  normalizado para mostrar valores estructurados.
- El parser textual acepta comparadores `<`/`≤`, presentes en tablas reales de
  bonÀrea. Producción: 3.148 publicados, 2.537 con nutrición ES, 2.542 CA y
  3.148 fichas comprobadas. Sin migración, despliegue ni escritura remota.
- Typecheck, lint dirigido, `git diff --check`, 5 pruebas focalizadas y parser
  ejecutado con una tabla representativa correctos. Suite general 771/772; solo
  falla la prueba previa de Lidl porque falta `android/app/build.gradle`.
  Pendiente QA visual y publicación del cliente.

## Sync Ahorramás robusto (local, 2026-09-14)

- `sync-ahorramas.mjs` ya no dispara ráfagas: usa 3 s entre peticiones, conserva
  cookies, respeta `Retry-After`, reintenta 429/408/425/5xx/red con backoff y
  jitter, y aplica timeout configurable. `.env.local` se carga antes del config.
- Paginación adaptada al SFCC real: tamaño 40, offset monotónico aunque el botón
  repita `start`, corte ante el último bloque repetido y detección de ciclos.
  Raíces y hojas se paginan completas; ramas intermedias solo una vez para evitar
  surtidos agregados repetidos sin perder cobertura global ni taxonomía fina.
- Dry-run integral completado: 7.498 productos, 776 categorías, 1.251 ofertas,
  sin 429 y sin tocar Supabase. Producción sigue en 7.472/775 con sync del 7-Sep.
  Embeddings Ahorramás: solo `53270` pendiente; pipeline pausado, cron 17 apagado,
  cero en vuelo. Cola global actual 4.630 disponibles por otros catálogos.
- Workflow: Node 22, timeout 120 min. Pruebas dirigidas/integración/typecheck OK;
  suite 768/769 con el único fallo conocido de Lidl por ausencia de
  `android/app/build.gradle`. Falta commit/push y lanzar el workflow productivo.

## Información nutricional estructurada (local, 2026-09-14)

- La nutrición normalizada se pasa como `nutritionInfo` a `ProductInfoSections`
  en las once fichas que resuelven el Índice. Se muestra como primera fila dentro
  de la misma tarjeta que ingredientes, alérgenos, conservación y el resto de
  características, también cuando no existe `foodIndex`. Se retiró la tarjeta
  independiente `NutritionValuesSummary` para no duplicar superficies.
- `NutritionInfoButton` ya no repite los valores por 100 g/ml dentro del detalle
  expandido del Índice. Estos quedan exclusivamente en la fila «Información
  nutricional»; el cálculo y el desglose de puntos del Índice no cambian.
- `ProductInfoSections` detecta la fila `nutrition` y, al desplegarla, sustituye
  el bloque de texto por filas estructuradas con icono, etiqueta y valor. El
  parser compartido `nutritionDisplay` reconoce castellano/catalán, formatos
  con dos puntos y la salida real de Carrefour sin separador; los campos
  desconocidos se conservan con icono genérico.
- `ProductInfoSections.Row` mantiene el contenido nutricional siempre montado y
  anima un contenedor recortado con altura, opacidad, desplazamiento y chevron
  durante 360 ms. Así no hay montaje/desmontaje entre pulsaciones. La respuesta
  táctil usa `activeOpacity=0.94` (antes 0,6), se excluye `LayoutAnimation` y
  Reducir movimiento fija directamente el estado final.
- `NutritionInfoButton` rediseña también el detalle expandido del Índice
  alimentario con cabeceras visuales por sección e iconos en componentes/puntos.
  Colores y superficies usan tokens temados; textos ES/CA completos.
- Cambio local de cliente, sin backend ni migración. `npx tsc --noEmit`, ESLint
  dirigido, `git diff --check` y 9 pruebas focalizadas correctos. Suite general
  775/776: solo falla la regresión previa de Lidl por el generado ausente
  `android/app/build.gradle`. Pendiente QA visual en dispositivo y publicación.

## Ficha completa de Carrefour e índice alimentario (local, 2026-09-14)

- `CarrefourProductModal` incluye ahora la tabla nutricional como fila explícita
  y mantiene las filas existentes de ingredientes, alérgenos, conservación,
  preparación, origen, denominación legal y operador.
- La conexión por EAN con Open Food Facts y el `FoodIndexSummary` ya estaban
  implementados mediante `useNutritionInfoDisclosure`; se conservan, con
  `product.nutrition` como respaldo cuando OFF no aporta Nutri-Score aplicable.
- Auditoría remota de solo lectura: 33.660 publicados; 11.398 con ficha revisada,
  5.480 con nutrición, 9.818 con EAN. Para ampliar cobertura hay que continuar
  los backfills incrementales del sync/`backfill-carrefour-ean.mjs`; no falta SQL.
- Añadida prueba unitaria del parser de ficha completa. Typecheck, lint dirigido,
  2 pruebas nuevas y `git diff --check` correctos. Suite general 764/765: solo
  falla `lidl-release-prompt.test.mjs` por el generado ausente
  `android/app/build.gradle`, regresión previa y ajena. Sin migración, despliegue
  ni escritura en producción.

## Recetas reactivadas (local, 2026-09-12)

- Rendimiento de apertura: `fetchCommunityRecipes` integra `recipe_likes` y
  `recipe_saves` por FK, filtradas por userId y RLS, en la consulta original.
  Tres peticiones → una; conserva recetas sin interacciones y contadores públicos.
  Timeout abortable de 12 s para no retener indefinidamente una petición compartida.
- `recipeFeedCache` + `recipeFeed` + `useRecipeFeed`: snapshot por cuenta,
  lectura síncrona desde memoria, hidratación de disco concurrente con red,
  deduplicación, frescura de 60 s y snapshots persistidos válidos hasta 24 h.
  Revalidación al enfocar sin vaciar lista ni mostrar carga encima de contenido.
  Creación, optimismo y rollback actualizan caché; revisiones y bloqueo de
  mutaciones evitan que un fetch tardío deshaga cambios. Errores permiten reintento.
- `startupKeys.recipes(userId)` se hidrata con las otras pestañas; corregida
  carrera disco/red en `readStartupCache`. Navegación precarga a los 350 ms de
  estar listo Inicio, sin bloquearlo ni montar Recetas; anticipa hasta cuatro fotos
  en la cola compartida. Previews usan `expo-image` con `memory-disk`; el creador
  solo se monta al abrirlo. Typecheck, lint y 37 pruebas dirigidas correctos.
  Consulta SQL equivalente validada con rol authenticated en producción: 0,455 ms,
  tres filas, índices de interacciones usados. No es medición de red/UI; pendiente
  QA y tiempos en dispositivo. Sin cambios remotos ni nueva migración.
- Fotos opcionales de pasos completas en creador/API/detalle, ES/CA. Una foto
  por paso, con añadir/cambiar/quitar y vista previa. Solo se suben al publicar;
  pasos con foto requieren descripción para no descartarla al limpiar vacíos.
  Compresión JPEG a 1200 px, subida secuencial y limpieza ante fallo de subida
  o rechazo definitivo de BD. Respuestas de inserción inciertas conservan las
  fotos por si la receta llegó a guardarse. No se añaden fotos obligatorias.
- `recipes.step_image_paths text[]` con default vacío y null por paso sin foto;
  se mantiene `steps` como textos para clientes antiguos. Migración local
  `20260912164705_recipe_step_images.sql` → remota `20260912165038` aplicada.
  RLS/bucket existentes conservados; tres recetas con huella idéntica tras migrar.
  Typecheck, lint, 22 pruebas (incluyen subida/lectura/alineación/fallos) y prueba
  PGlite de defaults/constraints/RLS correctos. SQL remoto en tabla temporal
  verificado y revertido; sin nuevos avisos de seguridad. Pendiente galería y
  revisión visual en dispositivo; cliente sin publicar.
- `CreateRecipeModal`: retirados los iconos de las cabeceras «Ingredientes» y
  «Pasos a seguir»; ambos reutilizan `fieldLabel` (13 pt, negrita), como
  «Nombre de la receta». Se mantienen contadores y textos de ayuda.
- Apertura/cierre de «Nueva receta» desde/hacia «Crear receta» mediante
  `useRecipeCreatorTransition`: mide botón y raíz del modal en coordenadas de
  ventana, anima contorno/color en Reanimated (420/340 ms) y revela el formulario
  sin escalar sus textos. Remide al cerrar, oculta teclado, evita cierres duplicados
  y respeta Reducir movimiento. Cerrar, escape accesible, atrás Android y guardar
  completado comparten transición; no se permite cerrar durante guardado.
  Typecheck, lint dirigido y 15 pruebas existentes correctos. Pendiente QA visual
  nativa de animación/rotación/teclado. Cliente local; sin SQL ni publicación.
- Visor de foto a pantalla completa desde la imagen del detalle: nuevo
  `RecipeImageViewer`, imagen completa y transición Reanimated 380/360 ms.
  Comparte progreso con el panel del detalle: al cerrar la imagen regresa al
  encuadre real de la cabecera y el contenido sube desde abajo. Geometría medida
  al abrir/cerrar, proporción preservada mediante recorte progresivo.
  Cierre accesible sobre cristal y reintento de carga. Respeta Reducir movimiento,
  conserva la ficha debajo y no requiere backend. Pendiente QA visual nativa.
- `RecipeEngagementActions`: Me gusta y Guardar del detalle ahora miden
  36 × 36 pt, radio de 18 pt e iconos de 17 pt. Cristal y `hitSlop={4}` conservados.
- Guardar en previews compactado a 36 pt, radio de 18 pt, icono de 17 pt y
  contador de 11 pt; `hitSlop={4}` mantiene el área táctil. Cristal conservado.
- Filtros de Usuarios reducidos a 36 pt (antes 48), con radio de 18 pt y
  padding horizontal de 12 pt. Inset del scroll sincronizado; cristal conservado.
- Selector «Usuarios / Supermercado» en la cabecera con `SlidingSegments`
  sobre el cristal existente, sin superficies anidadas y con fallback temado.
  Usuarios conserva las recetas reales y sus filtros; Supermercado todavía no
  tiene fuente conectada y muestra un aviso vacío. Localizado ES/CA; sin SQL.
- «Crear receta» fijo abajo a la derecha en `QueCocinoScreen`, fuera del scroll
  y solo en Usuarios (también sin recetas). Compensa la barra de pestañas con
  `useTabBarBottomPadding` y reserva su altura real al final del contenido.
- `src/constants/limits.ts` vuelve a declarar `QUE_COCINO_ENABLED = true`.
  «Recetas» reaparece como quinta pestaña entre Catálogo y Carrito tanto en la
  barra clásica como en Liquid Glass.
- La implementación y el backend ya existían: vuelven a ser accesibles consulta,
  creación, detalle, Me gusta, guardado y añadido de ingredientes al carrito.
  Sin migración SQL ni publicación del cliente.

## Palabra de hoy (cliente local + backend, 2026-09-11)

- Fila activa editable por casilla (2026-09-16): cada celda se puede seleccionar
  con un toque; se resalta la seleccionada. Teclear rellena o sustituye esa
  posición y avanza al siguiente hueco; borrar limpia la celda seleccionada o
  la anterior ocupada. El borrador conserva huecos y cursor al reabrir, admite
  los borradores anteriores y solo permite enviar una palabra completa.
  Ayuda visible ES/CA, sin cambiar intentos ni evaluación del servidor.
- Teclado (2026-09-16): `WordKeyboardKey` comprime cada tecla al 90 % al
  presionar y recupera su tamaño al soltar/cancelar, con spring nativo sin rebote.
  Un velo del acento elegido aparece en la tecla y se desvanece al soltar;
  se actualiza con el tema sin alterar el color persistente de las pistas.
  Área táctil estable, pulsaciones rápidas interrumpibles, sin retrasar entrada.
  Reducir movimiento usa solo opacidad; deshabilitar/desmontar limpia el efecto.
  Letras y borrar comparten feedback. Sin cambios en reglas ni backend.
- Botón de premios restaurado a petición del usuario: regalo en la cabecera y
  popup opaco con premio mensual y premios anuales y textos ES/CA.
  Solo informa; no hay adjudicación automática ni activación de suscripciones.
- La ayuda usa `WordGameInfoModal`, con tarjeta y pie opacos en
  `colors.paper` (claro/oscuro), sin material nativo translúcido ni GlassSurface.
  Fondo exterior atenuado, texto desplazable y cierre visible/atrás en Android.
- Alineación final del podio: las tres tarjetas comparten base inferior, sin
  desplazamientos superiores; se conservan sus tamaños decrecientes por puesto.
- Podio compactado: segundo y tercero alineados a 16 pt respecto al primero;
  reducidos márgenes y rellenos verticales sin reducir fotos ni tipografía.
  Ajuste posterior: tercer puesto con tarjeta más baja (8 pt menos de relleno
  vertical y avatar hasta 8 pt menor), conservando alineación superior y textos.
- Demo del ranking retirada: eliminados cinco perfiles ficticios, selector y
  textos de demostración. Solo se muestran resultados reales, también en desarrollo.
  No se borraron cuentas ni partidas: la demo nunca se guardó en Supabase.
- Podio del ranking (2026-09-12): `WordRankingPodium` coloca las primeras tres
  entradas en orden 2–1–3. Rediseñado a petición del usuario: sin cilindros,
  tarjetas redondeadas con tintes oro/plata/bronce, retratos enmarcados,
  medalla circular superpuesta y primer puesto elevado con sombra suave.
  Adaptación al ancho disponible, tema claro/oscuro y nombres largos;
  @ sobre foto, insignia dorada `VerifiedBadge` para Plus y avatar de reserva.
  La elevación/medallas siguen el puesto real en empates; el resto sigue en lista.
  La RPC añade avatarUrl/isPlus solo para perfiles descubribles o el propio;
  Plus se deriva de premium_until sin exponer su fecha. No cambia puntuación.
  Migración local `20260912154950_word_ranking_podium.sql` aplicada como
  `20260912155231_word_ranking_podium`. Typecheck, lint, 20 pruebas del motor y
  PGlite correctos (privacidad, Plus caducado, cuatro periodos, datos intactos).
  Producción sin partidas completadas al verificar: campos comprobados en función,
  rankings ES/CA iguales; no se añadieron resultados. Pendiente revisión visual
  en dispositivo y publicación del cliente.
- Unificación en castellano (2026-09-12): una misma palabra y cuatro rankings
  comunes para toda la app. UI catalana conservada; aviso en catalán antes de
  activar el juego, palabras/teclado siempre ES (Ñ, sin Ç), borrador por cuenta
  con la clave ES anterior. Backend aplicado: local
  `20260912153336_spanish_only_word_game.sql` → remota
  `20260912153657_spanish_only_word_game`. Fuerza ES también para clientes antiguos;
  bloquea partidas CA y deshabilita sus 386 palabras; 439 ES activas. Sin partidas
  CA previas, sin borrar ni alterar intentos/puntuaciones existentes (huellas iguales).
  Typecheck, ESLint, 20 pruebas del motor y PGlite correctos; reto y rankings
  ES/CA idénticos verificados en remoto. Popup pendiente de prueba visual; cliente
  local sin publicar.
- Animación de revisión 2026-09-12: nuevo `DailyWordTile` con giro horizontal
  (rotateY), frente neutro y reverso evaluado; 420 ms por letra/180 ms de desfase.
  `DailyWordScreen` coordina el intento enviado y bloquea entrada mientras revela;
  resultado final y feedback háptico esperan al final. Historial no se reanima.
  Cancelación al salir/cambiar pestaña/cuenta/día y soporte de Reducir movimiento.
  Typecheck y ESLint focalizado correctos. Sin cambios en reglas, datos ni API.
- Ajuste visual 2026-09-12: retiradas las marcas ✓/↔/· de cada letra enviada.
  Colores, leyenda y etiquetas accesibles siguen indicando el resultado.
- Ampliación 2026-09-12 desplegada: **439 ES activas / 386 CA hoy deshabilitadas** (antes 168/161).
  Local `20260912120048_expand_word_game_dictionary.sql` → remota
  `20260912120558_expand_word_game_dictionary`. Añade 271 ES y 225 CA mediante
  INSERT por lotes con ON CONFLICT DO NOTHING; no altera soluciones ni progreso.
  Se admiten LAVAR/COCER/PELAR/PLATOS/NEVERA/BUFFET/OFERTA/SUPER/REBAJA.
  PGlite comprueba todos esos ejemplos, equivalentes CA, idempotencia y conservación
  de datos previos. Typecheck, lint de textos y 19 pruebas del motor correctos.
  No requiere nueva build para aceptar palabras; cambios de ayuda siguen locales.
- Cambio visual 2026-09-12: `DailyWordScreen` ya no muestra el bloque fecha/letras/idioma.
  Revertida la retirada del selector Jugar/Ranking: ambos destinos y los cuatro
  periodos vuelven a funcionar, con su diseño glass y fallback. No se borran
  datos ni se modifica la API. El bloque informativo permanece eliminado.
- Lógica completada en `src/lib/wordGameSession.ts` y `useWordGame`: operaciones
  serializadas, borrador AsyncStorage por usuario con validez por partida
  e intento, recuperación segura tras timeout/reinicio, protección frente a
  refrescos tardíos y cambio de día con reintento espaciado. API valida payloads
  y limita esperas a 15 s. No se modifica el esquema ni se publica la app.
- 19 pruebas ejecutables del motor en `scripts/tests/word-game-session.test.mjs`.
  La prueba PGlite ahora conecta el cliente real a los RPC SQL y comprueba
  victoria/derrota, recuperación de respuesta perdida y los cuatro rankings.
  Reanudación del borrador verificada en iOS 26.5 sin enviar una palabra válida.
- Ajuste visual solicitado: `DailyWordScreen` usa Liquid Glass mediante el
  wrapper existente. Cabecera superpuesta con `SlidingSegments`, selector de
  periodos glass, teclado flotante con una sola superficie nativa y fondo
  `AmbientBubbleBackdrop`. Alturas medidas para no tapar el contenido; ningún
  cristal anidado. Fallback previo conservado. Sin cambios SQL.
- Implementados `DailyWordButton`, `DailyWordScreen`, API `wordGame` y copy
  ES/CA. Acceso desde la antigua frase de la cabecera de Inicio. Ruta
  `Home → DailyWord`; oculta la barra general solo mientras está abierta.
- Juego real de 4–6 letras y seis intentos; teclado fijo, estados de red,
  reanudación, resultado compartible y rankings por los cuatro periodos.
- Backend ya desplegado: migración local
  `20260911184021_daily_word_game.sql` → remota `20260911184500_daily_word_game`.
  Tablas en `private`, no en `public`; respuestas y puntuaciones solo se
  escriben mediante RPC. Una partida/día por usuario aunque cambie idioma.
  Banco activo de 439 ES, selección diaria aleatoria sin repetir 30 días.
- PGlite valida la migración real y los casos de integridad; prueba real bajo
  rol autenticado revertida por completo. En el simulador se validó escritura
  de borrador y rechazo de palabra inválida sin consumir la partida.
- Typecheck, lint focalizado y diff-check correctos. Suite 736/737: fallo
  ajeno en `lidl-release-prompt.test.mjs` por `android/app/build.gradle` ausente.
  No publicar ni afirmar que ya llegó a App Store/Play: cliente todavía local.
- Ver reglas, tablas, mantenimiento del vocabulario y comprobaciones en
  `PALABRA-DE-HOY.md`. El ranking histórico suma puntos; no usa medias ni rachas.

## Comparativa de huevos para Instagram (local, 2026-09-11)

- Nueva pieza `marketing/instagram-egg-comparison/comparativa-huevos-instagram.png`
  (1080 × 1350), con fuente HTML, fondo generado, logos locales y fotos de
  Mercadona, Carrefour y Lidl tomadas de las URL guardadas en producción.
- Datos del 07/09/2026: Mercadona M 12 ud 2,85 €, Carrefour M suelo 12 ud
  2,85 € y Lidl M 12 ud 2,84 €. Aldi se muestra sin dato porque su espejo no
  contiene una docena de huevos frescos, ni publicada ni despublicada.
- No se ha publicado ni desplegado nada. La carpeta incluye `README.md` con los
  ids exactos y la limitación de Aldi.

## Producto no disponible para la próxima compra (local, 2026-09-11)

- `ListScreen` divide el pie de cada tarjeta entre «Notas» y «No estaba en la
  tienda». Ya no existe botón global de guardar en la cabecera, diálogo ni modo
  general. El marcador por producto usa el mismo `bookmark` relleno de recetas.
- El producto aplazado queda tachado y cuenta como gestionado, pero muestra
  «Producto incluido en la próxima compra» en lugar de las notas. Se puede
  deshacer desde el propio estado. Solo se finaliza cuando todos están recogidos
  o aplazados y al menos uno se ha recogido realmente.
- Nueva migración `20260911173959_defer_unavailable_products.sql`: añade
  `deferred_to_next_purchase`, los RPC atómicos para alternarlo y la exclusión
  mutua con `in_cart`. `finish_list_purchase(uuid)` mantiene la firma legacy,
  archiva únicamente lo recogido y deja lo aplazado como pendiente normal,
  sin responsable anterior, para la siguiente compra. Mantiene `SECURITY
  INVOKER`, RLS, permisos solo para `authenticated`, bloqueo por lista y
  controles de filas afectadas.
- Desplegada en producción como migración remota
  `20260911180408_defer_unavailable_products`. Se verificaron columna `NOT
  NULL DEFAULT false`, RPC invoker con `search_path` vacío, ejecución exclusiva
  de `authenticated`, exclusión de `anon` y cero estados incompatibles. El
  botón se probó marcando y desmarcando un producto real en el simulador; el
  estado de prueba quedó completamente revertido.
- Verificación local cerrada: TypeScript, lint dirigido, 13 pruebas focalizadas,
  `git diff --check` y prueba SQL PGlite de aplazado, exclusión mutua,
  finalización parcial, compatibilidad legacy, atomicidad y RLS correctos. La
  suite completa queda en 718/719 únicamente porque la regresión previa de
  `lidl-release-prompt.test.mjs` exige el fichero generado y actualmente ausente
  `android/app/build.gradle`; no está relacionada con este cambio.

## Prueba AGP 9.0.1 preparada (2026-09-09)

- Perfil EAS `agp9-audit` hereda producción sin incrementar versión y activa
  `QUEFALTA_AGP9=1`. El plugin `withAndroidAgp9` fija AGP 9.0.1 y conserva
  temporalmente Kotlin externo y DSL antiguo, usados por Expo/RN.
- Prebuild temporal verificado. Tras autorización explícita se ejecutó EAS
  `33f0b6b2-a00d-4e1d-8e39-028859abe13c`: falló al configurar `:expo` por
  `LibraryDefaultConfig.setTargetSdk(java.lang.Integer)`, API retirada en AGP 9
  que utiliza el plugin nativo de Expo. No generó AAB ni se publicó nada.
  Producción no activa este experimento.
- Adaptaciones aisladas en el plugin opt-in: target SDK de biblioteca Expo pasa
  a `lint.targetSdk`; los callbacks globales de React Native se registran solo
  desde el plugin de aplicación para evitar registrar `finalizeDsl` demasiado tarde.
  El segundo intento `6df181b2-5e9a-466d-9305-18a1ba194f7b` detectó ese problema
  de callbacks; el tercero `082f6800-e4b2-4df7-85df-61c5dea2968f` lo superó y
  falló por los Provider en sourceSets de Expo. Se añadió la compatibilidad
  `android.sourceset.disallowProvider=false`: Expo ya declara la dependencia
  `preBuild -> generatePackagesList` explícitamente.
- Cuarto intento `cba45904-d8d7-473a-a216-95c39f7c471c` **FINISHED**, Gradle
  exitoso en 28m23s. AAB local `/private/tmp/quefalta-agp9-audit.aab`:
  AGP **9.0.1**, R8 **9.0.32**, `isOptimizedShrinkingEnabled=true`, pero
  **`isOptimizationsEnabled=false` y `noOptimizationPercentage=100`**.
  La actualización de AGP compila, pero NO resuelve todavía el aviso de optimización.
  No se ha promovido a producción ni publicado en Play. Siguiente diagnóstico:
  obtener `configuration.txt` fusionado de R8 y localizar el origen del bloqueo;
  no aparece `-dontoptimize` en fuentes locales ni en `proguard.txt` de AAR locales.
- Typecheck y tres pruebas aisladas del plugin pasan (opt-in, idempotencia y
  detección de cambios incompatibles). ESLint dirigido a estos archivos falla
  por configuración de `@typescript-eslint/no-require-imports` sin plugin registrado.
  R8 advierte sobre stack maps de amazon-appstore-sdk 3.0.5. Pendiente prueba real.
- Verificar metadata R8 y flujos nativos antes de adoptar AGP 9 en producción.

## R8 completo y Android adaptable (local, 2026-09-09)

- `withAndroidReleaseHardening` sustituye las reglas antiguas
  `proguard-android.txt` por `proguard-android-optimize.txt` y añade
  `android.r8.optimizedResourceShrinking=true` para AGP 8.12. El AAB anterior
  reducía y ofuscaba, pero su metadata confirmaba optimización de código y
  reducción optimizada de recursos desactivadas.
- `app.json` fija `orientation: default`; el prebuild genera
  `MainActivity` con `android:screenOrientation="unspecified"`, incluso si el
  manifest anterior estaba bloqueado en vertical. iOS conserva explícitamente
  sus orientaciones anteriores mediante `UISupportedInterfaceOrientations`.
- `DoneScreen` permite desplazar todo su contenido cuando no cabe en horizontal
  o multiventana y respeta también los insets laterales. Pendiente prueba visual.
- Pendiente publicar un nuevo AAB y confirmar en su metadata `r8.json` que
  `isOptimizationsEnabled` e `isOptimizedShrinkingEnabled` sean `true`, además
  de validar visualmente horizontal, tablet y multiventana.

## Tecla «Done» retirada del código postal (local, 2026-09-07)

- `RegionPicker` ya no define `returnKeyType="done"` en el `TextInput` de
  código postal. Al ser un componente compartido, desaparece en onboarding,
  gate postal y ajustes de región, sin cambiar validación ni persistencia.
- Cambio solo de cliente, sin migración.

## Lidl como beneficio propio de QuéFalta Plus (local, 2026-09-07)

- El paywall presenta Lidl en una fila independiente con su logo local y deja
  «Todos tus supermercados» en otra fila para la consulta conjunta. Copy ES/CA
  y regresión en `scripts/tests/plus-activation.test.mjs`.
- Cabecera, título de beneficios y bloque de planes/CTA/legal quedan fijos; solo
  la lista central de beneficios se desplaza cuando no cabe. Sin migración.

## Carrefour reconciliado y drenaje preventivo de embeddings (producción, 2026-09-07)

- Con autorización explícita del propietario se ejecutó
  `EMBEDDING_ANOMALY_OVERRIDE=1 STORES=carrefour` tras un DRY_RUN idéntico:
  33.529 productos, 6.375 upserts, 1.671 despublicaciones y 3.998 embeddings
  (3.864 altas + 134 cambios semánticos). Run
  `0117af2e-21c4-4ce0-9d65-e2eae987f2c9`, manifiesto 3.998/3.998, estado
  `draining`, sin error.
- Canario request 3380: HTTP 200, 99 completed, 1 stale, 0 failed/deferred.
  Después se abrió `active` temporal con un solo worker inicial; el cron 17 no
  se activó. La cola descendió 4.571→3.171 y se volvió a `paused` para no cruzar
  el umbral preventivo de autovacuum.
- Estado final 14:30 CEST: Carrefour 828/3.998 completados y 3.170 pendientes;
  queda además 1 Ahorramás. Total 3.171 disponibles, 0 en vuelo, 0 fallos
  abiertos/archivados, cron inactivo. HNSW válido/listo/vivo, sin vacuum ni
  reindex y 9.232 tuplas muertas (4,199 %, alerta 5 %). Antes de reanudar,
  consultar `catalog_embedding_maintenance_status()` y no solapar el drenaje
  con mantenimiento del índice.

## Acciones rápidas de Instagram y sugerencias en Perfil (local, 2026-09-07)

- `ProfileScreen` muestra debajo de la tarjeta de identidad y antes de Cuenta
  una fila con Instagram compacto y «Sugerir una función» en una sola línea;
  Instagram ya no se repite en Soporte.
- La sugerencia replica el correo de `HelpScreen`, incluido el asunto y el pie
  con versión/plataforma. El botón de Ayuda permanece intacto. Sin migración.

## Ofertas exclusivas Lidl Plus identificadas (local + producción, 2026-09-07)

- `scripts/lib/lidl.mjs` interpreta el tipo confirmado
  `StoreSpecialPriceDiscount` como exclusivo de Lidl Plus y asigna siempre
  `is_lidl_plus_offer`; otros tipos del feed lo limpian para evitar conservar
  el valor de una campaña previa cuando el feed, que tiene prioridad, la
  sustituye.
- `LidlProduct` y `LIDL_COLS` exponen `is_lidl_plus_offer`. `lidlToUI` añade
  «Lidl Plus» a la etiqueta sin duplicados y `AldiProductModal` muestra
  «Requisito» indicando que la oferta es exclusiva con Lidl Plus. Localizado ES/CA.
- Backfill productivo ejecutado sobre `lidl_store_products` y `lidl_products`
  usando `raw.offer.offerType`: 17.535 + 28 filas actualizadas. Verificación:
  18.600/18.600 filas publicadas `StoreSpecialPriceDiscount` a `true`, cero
  filas de otros tipos a `true` y 480/480 ofertas vigentes del Escalopín de
  vacuno correctamente marcadas. Sin migración ni nueva descarga.
- Pruebas Lidl/UI (34/34), TypeScript, ESLint y suite completa (716/716)
  correctos; `git diff --check` limpio.

## Productos Lidl admitidos en carrito e histórico (local + producción, 2026-09-07)

- Causa resuelta: el modal enviaba correctamente `store_key='lidl'`, pero los
  checks de `list_items` y `purchase_items` no contenían Lidl y Postgres
  rechazaba la inserción.
- `20260907111958_allow_lidl_cart_items.sql` ya está aplicada en producción y
  actualiza los checks del producto principal y del producto vinculado a notas.
- Verificación real del esquema mediante clones temporales: 2/2 inserciones
  aceptadas en `list_items` y 2/2 en `purchase_items`. Regresión local en
  `scripts/tests/lidl-cart-schema.test.mjs`. No requiere publicar cliente.

## Aviso en fichas Lidl sin imagen (local, 2026-09-07)

- `ProductDetailImage` admite `emptyMessage` y considera sin imagen tanto URI
  nula como el placeholder de Lidl descartado por `productImageSource`.
- `AldiProductModal` pasa el aviso únicamente para Lidl; el área de la foto
  explica que Lidl no ofrece imagen y pide disculpas. Sin SQL ni sync.

## Decisión obligatoria de Lidl al actualizar a 1.3.1 (local, 2026-09-07)

- `LidlReleasePrompt` se monta después del gate postal y no admite cierre,
  gesto exterior ni botón atrás. Muestra el logo local y obliga a elegir «Sí,
  añadir Lidl» o «No, gracias»; si Supabase falla, permanece abierto y muestra
  el error para reintentar.
- Ambas respuestas escriben la selección canónica en `profiles.catalog_stores`
  y actualizan `ProfileContext`. AsyncStorage recuerda `yes`/`no` por
  `1.3.1:userId`; `StoresScreen` registra la elección equivalente para que las
  altas que ya eligieron en onboarding no vean el popup de actualización.
- `normalizeCatalogStores` conserva las selecciones antiguas sin añadir Lidl de
  forma automática. WhatsNew y la valoración nativa esperan a que la decisión
  quede resuelta. Expo, iOS y Android declaran 1.3.1; build numbers intactos.
- Cambio solo de cliente y documentación, sin migración ni publicación.
- TypeScript, ESLint focalizado, 18 pruebas específicas y suite completa
  (708/708) correctos; `git diff --check` limpio.

## Condiciones y vigencia en el detalle de ofertas Lidl (local, 2026-09-07)

- `AldiProductModal`, reutilizado por Lidl, etiqueta la condición como
  «Condiciones» y muestra `promoStart`/`promoEnd` bajo «Vigencia» con formato
  día/mes/año. Si `promoText` es nulo, omite Condiciones; nunca usa el porcentaje
  de `promoName` como si fuera una condición.
- `sync-lidl.mjs` consulta `/offers/{id}` para cada campaña verificada y
  `lidlOfferConditions` prioriza `characteristicsDescription`, el campo que usa
  la app de Lidl. Conserva respaldos para otras formas del contrato.
- Backfill aplicado en producción: 40 campañas, 16.883 filas vigentes. Plátano
  de Canarias tiene la condición esperada en sus 480 tiendas y vigencia del
  07/09/2026 al 13/09/2026. Quedan 15 filas sin condición porque seis UUID de
  campaña ya no devuelven detalle. Sin migración.

## Fallback de tienda maestra Lidl (local, 2026-09-07)

- `sync-lidl-fleet.mjs` reintenta con la fuente maestra `ES3572` únicamente
  cuando la fuente devuelve HTTP 204 sin cuerpo en categorías, un árbol raíz
  vacío o confirma pan, fruta y carne vacíos tras reintentos. La tienda
  reclamada sigue siendo el destino; se copian catálogo, categorías, precios,
  stock y ofertas de la
  maestra y el trabajo se cierra como `succeeded`.
- `sync-lidl.mjs` separa `LIDL_STORE_ID` (destino) de
  `LIDL_SOURCE_STORE_ID` (fuente). Las promociones del feed y las campañas web
  se consultan y regionalizan con la fuente maestra. La variante guarda
  `raw.fallbackSourceStoreId=ES3572` para conservar procedencia.
- 403/429, fallos de red, JSON truncado y catálogos parciales no activan el
  fallback. No hay migración. Esta política reemplaza la decisión previa de no
  publicar sustitutos para las 39 tiendas canarias y los tres outlets.
- Pruebas focalizadas correctas y DRY_RUN real `ES0951 ← ES3572`: 2.812
  productos, 43 categorías y 29 productos con oferta; sin escrituras. Pendiente
  publicar el código y ejecutar `recover` para rellenar las tiendas afectadas.

## Varios administradores por grupo (local + producción, 2026-09-07)

- `group_members.role` (`member`/`admin`) es ya la autoridad operativa. Todos
  los administradores pueden promocionar/degradar miembros, expulsar, añadir,
  renombrar y cambiar el icono. El creador queda protegido frente a degradación
  o expulsión y es la única cuenta autorizada para eliminar el grupo.
- El cliente deja de transferir un único `owner_id`: carga el rol de cada
  miembro, muestra «Creador»/«Administrador» y ofrece añadir o retirar permisos.
  El borrado solo aparece al creador y la API comprueba que UPDATE/DELETE hayan
  afectado una fila para no convertir una denegación RLS en éxito aparente.
- Aplicadas en producción `20260907084525_multiple_group_admins.sql` y
  `20260907085000_backfill_adminless_group_admins.sql`. El backfill conserva
  creadores/owners históricos presentes y resolvió dos grupos huérfanos
  promocionando a su único miembro. Al no existir ya sus creadores, esos grupos
  pueden gestionarse pero no eliminarse desde otra identidad.
- RLS, grants por columna, helpers privados y wrapper RPC revisados. PGlite
  valida promoción, degradación, protección del creador y borrado exclusivo;
  las pruebas de fuente cubren cliente y policies. TypeScript, lint completo,
  suite completa (695/695) y `git diff --check` correctos. El advisor posterior
  no añadió hallazgos de esta funcionalidad. `supabase/policies/groups_owner.sql`
  es solo una advertencia de compatibilidad y no debe ejecutarse.

## Cesta integrada en el bloque del detalle de grupo (local, 2026-09-07)

- Corregida la regresión visual de `GroupDetailScreen` causada por la migración
  histórica de `ScrollView` a `SectionList`: la cabecera de cesta ya no termina
  como tarjeta independiente antes de las filas.
- Cabecera, progreso, tiendas, zonas y productos forman una superficie continua;
  la última fila aporta el borde y radios inferiores. Se conserva la
  virtualización para cestas grandes. Sin migración.
- TypeScript, ESLint focalizado, 4 pruebas de auditoría y `git diff --check`
  correctos.

## Icono y gestión alineados en el detalle de grupo (local, 2026-09-07)

- `GroupDetailScreen` sustituye las tarjetas apiladas de miembros/icono por una
  fila de dos acciones independientes para los administradores: selector de icono a
  la izquierda y «Gestionar» a la derecha. El selector mantiene el mismo sheet,
  guardado, haptics y actualización del carrito activo.
- Los no propietarios conservan avatares a la izquierda y gestión a la derecha.
  Cambio de cliente sin migración.

## Fondo ambiental propio en Grupos (local, 2026-09-07)

- `GroupsScreen` monta `AmbientBubbleBackdrop` en todos sus estados mediante la
  variante `groups`, con 18 burbujas de radios/posiciones distintos a Inicio y
  una geometría propia para halo, anillo y lavado inferior.
- Sigue el acento del tema, no intercepta gestos y no modifica la composición
  predeterminada que comparten Inicio, Carrito y onboarding. En Grupos se
  desactiva el degradado superior izquierdo y se conserva el papel plano. Sin
  migración.
- TypeScript, ESLint focalizado y `git diff --check` correctos.

## Etiquetas de oferta compactas en cuadrícula (local, 2026-09-07)

- `ProductGridCard` usa la etiqueta compacta para las ofertas de todos los
  supermercados: ancho máximo del 68 %, padding, icono y texto reducidos.
- La vista de lista conserva su diseño. Cambio solo de cliente; sin migración ni
  publicación. TypeScript, ESLint focalizado, 6 pruebas de ofertas y
  `git diff --check` correctos.
- El bloque promocional de la ficha Lidl recupera exactamente las dimensiones
  de Carrefour: ancho completo, padding 12, gap 8, icono/etiqueta 12 y cuerpo
  12,5/18. Conserva Condiciones y Vigencia dentro del bloque.

## Imágenes Lidl verificadas en Xcode (local, 2026-09-07)

- Corregida la optimización anterior de 192 px: disparaba una transformación
  CDN lenta y con caché de solo 300 segundos. Lista, cuadrícula, ficha y precarga
  comparten ahora la variante publicada de 384 px, con caché larga. Los
  placeholders remotos de Lidl se sustituyen por el icono local.
- Precarga compartida entre pantallas: máximo dos descargas simultáneas,
  deduplicación, 24 trabajos y doce imágenes por solicitud; cancelar una
  pantalla retira sus pendientes sin cancelar trabajos compartidos.
- Medición real en simulador iPhone 15 Pro / iOS 26.5: mismas 16 imágenes sin
  caché local, mediana 5.257 → 627 ms y máximo 8.065 → 835 ms. Con caché de
  disco: mediana 5,5 ms. Cuadrícula y ficha comprobadas visualmente; la ficha
  reutiliza memoria (2–8 ms). Red/CDN no controlados; no es un benchmark de
  dispositivo físico. Evidencia: `docs/lidl-image-performance-20260907.json`.
- Compilación nativa Xcode, TypeScript, ESLint focalizado y 14 pruebas
  focalizadas correctos; `git diff --check` limpio. Instrumentación y borrado
  temporal de cachés retirados. Sin migraciones ni publicación.


## Rendimiento de navegación e imágenes (local, 2026-09-07)

- Catálogo/Ofertas/Novedades/Cambios comparten caché acotada de cinco minutos,
  deduplicación y precarga del supermercado individual seleccionado.
- Fichas con vista previa inmediata, caché de detalle, fuentes Mercadona en
  paralelo y ficha Lidl reutilizada por producto/tienda. Imágenes Lidl corregidas
  a 384 px y medidas en Xcode, según el apartado anterior.
- TypeScript, ESLint, 686 pruebas de suite, 10 focalizadas finales y bundle
  Hermes iOS correctos.
- Ver el apartado de rendimiento en CONTEXTO.md. Sin migraciones ni despliegue;
  imágenes verificadas en simulador; pendiente validar en dispositivo físico.

## Recetas desactivadas para publicación (local, 2026-09-07)

- `src/constants/limits.ts`: `QUE_COCINO_ENABLED = false`. Recetas queda fuera
  del navegador y de ambas barras de pestañas; no se monta ni ejecuta consultas.
- Todos sus flujos (crear, consultar detalle, Me gusta, guardar y añadir
  ingredientes al carrito) quedan inaccesibles. Código y datos conservados.
- Cambio preparado para la siguiente versión, sin publicar ni modificar el
  backend. Esta decisión sustituye la reactivación de desarrollo del 2026-08-30.

## Capacidad de recuperación Lidl y ES0548 (local, 2026-09-07)

- Tras el recover `34053713271`, la cola quedó en 199 `succeeded`, 1 `retry`
  (`ES0548`) y 521 `pending`: el límite anterior de 2×100 no podía vaciarla.
- `recover` usa ahora ocho workers (hasta 800 trabajos) sin reprogramar éxitos.
  `ES0548` se añade a `LIDL_VERIFIED_SMALL_CATALOGS` con 2.199 productos y suelo
  2.155 después de tres observaciones completas coincidentes.
- Pendiente publicar y ejecutar `recover` sin `store_ids`. Sin migración SQL.

## Filtro vacío del sync Lidl (local, 2026-09-06)

- `sync-lidl-fleet.mjs` normaliza el input vacío que GitHub Actions pasa en
  `weekly`/`recover` a `null`, en vez de producir `[]` y abortar los workers con
  `LIDL_FLEET_STORE_IDS inválido`.
- Regresiones cubren cadena vacía, espacios, segmentos inválidos y duplicados.
  Tras publicar, ejecutar `recover` sin `store_ids` para consumir la cola ya
  programada; no volver a ejecutar `weekly` para esa recuperación.

## Filtros de recetas fijos (local, 2026-09-06)

- `QueCocinoScreen` renderiza la toolbar de filtros fuera del `ScrollView`, en
  posición absoluta bajo la altura medida de la cabecera (`zIndex: 9`; cabecera
  Liquid Glass: 10).
- El padding superior reserva `RECIPE_FILTER_HEIGHT=48`; se mantienen 12 pt de
  separación antes del filtro y antes de la primera receta. Funciona igual en
  cabecera clásica y Liquid Glass.

## Insignia Plus dorada global (local, 2026-09-06)

- El tono predeterminado de `VerifiedBadge` pasa de `accent` a `gold`; todas las
  insignias Plus sin override, incluida la del autor en el preview de recetas,
  usan el degradado `#F7D25A` → `#D2900F` y check blanco.
- Cambio exclusivamente visual; no altera `verified`, `premium_until` ni gates.

## Liquid Glass en acciones de recetas (local, 2026-09-05)

- `RecipeEngagementActions` envuelve las superficies visuales de Me gusta y
  Guardar con `GlassSurface interactive`; siguen siendo dos círculos de 48 pt,
  solo icono, superpuestos a la imagen del detalle.
- Los filtros y el Guardar de `QueCocinoScreen` usan el mismo patrón y conservan
  texto/contador, accesibilidad y estados. Todos comparten base blanca/acento,
  borde y pulsación con opacidad 0,84 y escala 0,93.
- Los iconos inactivos usan `colors.ink` para no perderse sobre el cristal; los
  activos se mantienen blancos sobre el tinte de acento.
- Sin `GlassView` directo, rama de plataforma ni migración.
- TypeScript, ESLint focalizado, 677 pruebas y `git diff --check` correctos.

## Insignia Plus en autores de recetas (local, 2026-09-05)

- `fetchCommunityRecipes` incluye `verified` en la relación con `profiles` y
  `CommunityRecipe.author` lo normaliza a booleano; el fallback de una receta
  recién creada usa `profile.verified`.
- `QueCocinoScreen` coloca `VerifiedBadge` de 14 pt inmediatamente después del
  nombre del autor en el preview. No se añade al detalle ni se consulta la fecha
  privada `premium_until`. Sin migración.
- Verificado en producción mediante consulta agregada de solo lectura: columna
  booleana y FK disponibles. TypeScript, ESLint focalizado, 9 pruebas y
  `git diff --check` correctos.

## Separación simétrica alrededor de filtros de recetas (local, 2026-09-05)

- `QueCocinoScreen` reutiliza `RECIPE_FILTER_GAP=12` para el espacio desde la
  cabecera hasta los filtros y desde estos hasta la primera tarjeta.
- Cubre las variantes Liquid Glass y clásica; cambio solo visual.
- TypeScript, ESLint focalizado, 5 pruebas de recetas y `git diff --check`
  correctos.

## Campañas web semanales de Lidl (local, 2026-09-05)

- `scripts/lib/lidl-campaigns.mjs` descubre desde `lidl.es` y parsea las cinco
  campañas alimentarias acordadas: XXL, Ofertas semanales, Super finde, Precios
  imbatibles y Bajadas permanentes. Consume el JSON SSR de las tarjetas, con
  precio/región/fechas/Lidl Plus; no hay OCR ni autenticación.
- `sync-lidl.mjs` obtiene `offer_region` de `lidl_stores`, elige su
  `regionPriceId` y exige coincidencia final `nat`/`ians` ↔ `productCodes`.
  Aplica primero la campaña y después el feed de tienda, que conserva prioridad.
  Las filas sin enlace exacto se omiten y los nombres solo reducen candidatos.
- `sync-lidl-fleet.mjs` descarga una caché temporal por worker y la pasa a todos
  sus procesos de tienda mediante `LIDL_CAMPAIGNS_FILE`; si la web falla, omite
  el complemento para todo ese worker en vez de repetir cinco descargas por
  tienda. No hay migración SQL.
- DRY_RUN completo real `ES0219`, región 26: 2.807 productos, 117 anuncios, 116
  regionales y 31 productos de campaña confirmados exactamente. El feed vigente
  confirmó además 27 campañas/37 productos. Pendiente publicar/ejecutar en
  producción; no se ha escrito en Supabase.

## Me gusta y Guardar sobre la imagen de la receta (local, 2026-09-05)

- `CommunityRecipeDetailModal` monta `RecipeEngagementActions` en la cabecera
  superpuesta de la imagen, alineado a la derecha frente al botón de volver.
- `RecipeEngagementActions` queda como dos botones circulares de 42 pt, solo
  icono, con estado activo en acento y toda la semántica accesible previa. Ya no
  existe la fila de acciones bajo la imagen.
- TypeScript, ESLint, 674 pruebas y `git diff --check` correctos.

## Ingredientes vinculados a los pasos de una receta (local, 2026-09-05)

- `CreateRecipeModal` ofrece en cada paso chips seleccionables de todos los
  ingredientes añadidos. Al borrar un ingrediente elimina también sus vínculos
  y los pasos vacíos no desajustan los índices al publicar.
- La persistencia conserva `recipes.steps` como `string[]` por compatibilidad
  con las builds anteriores. Cada snapshot de ingrediente puede incorporar
  `stepIndexes: number[]`; no requiere migración porque `ingredients` ya es
  JSONB. La lectura deduplica, ordena y limita los índices al número de pasos.
- `CommunityRecipeDetailModal` enseña los ingredientes asociados y sus
  cantidades dentro de cada paso. Copy localizado en castellano y catalán.
- TypeScript, ESLint focalizado, 666 pruebas y `git diff --check` correctos.

## Lidl en comparador (2026-09-05)

- Petición explícita del propietario: integrar Lidl en el comparador actual.
  No es activación de CE-1. Migración local `20260905175806_lidl_comparator_multistore.sql`
  aplicada por MCP y `catalog-embed` v14 desplegado. La prueba previa con rollback
  devolvió 3.321 productos únicos; permisos de lectura solo para service_role.
- El materializador admite la vista `lidl_comparator_products`. Backfill de 3.321
  filas aplicado con override exclusivamente para la primera carga; run
  `4989d170-a884-4c9d-8494-a4d21871abc3`. No repetir el override en cron.
- Procesamiento inicial secuencial filtrado a Lidl mediante el SQL de
  `supabase/ops/dispatch-lidl-embedding-batch.sql`; primer canario HTTP 3176,
  20 completed, cero failed/stale/deferred. El pipeline global sigue paused y
  los 155 mensajes previos de Gadis/Ahorramás no se reclaman en esta operación.
- Cliente, workflow y runner PowerShell modificados localmente. El resultado
  respeta tienda del perfil/Plus/stock/promociones y se invalida al cambiar tienda.
  El workflow admite fallos parciales porque cada surtido publicado ya está validado.
- `scripts/test-lidl-comparator-sql-local.mjs` prueba el SQL real con fixtures
  ficticios en PGlite: origen/destino, dos precios/tiendas, stock, Plus, auth,
  promociones, hashes obsoletos, desaparición de surtido y permisos. PASS.
- El único fallo inicial de la suite era el hash histórico de SimilarProductsSection;
  registrada la transición autorizada en el helper, conservando las evidencias.
- Cierre confirmado a las 18:24 UTC: 3.321/3.321 vectores vigentes y 511/511 altas
  multitienda cubiertas. 35 requests HTTP 200 (20 + 33×100 + 1), cero fallos,
  obsoletos o diferidos; run `settled`, generación 2, cola Lidl vacía. Se conservan
  107 Gadis + 48 Ahorramás con read_ct=0, pipeline paused y cron 17 inactivo.
- TypeScript, ESLint, 663 pruebas y SQL ficticio PASS. Caché real comprobada con
  rollback en ambos sentidos (20 Lidl→Mercadona y 9 Mercadona→Lidl); no se consumió
  cuota de búsqueda ni se guardaron esas cachés de prueba. El perfil habitual
  carece de lidl_store_id en producción: el resolver se abstiene correctamente.
- Estado de mantenimiento: autovacuum en `vacuuming indexes`, IO/DataFileRead,
  sin blockers; HNSW válido/listo, aviso por 5,666 % de tuplas muertas mientras
  termina. No se canceló ni se lanzó VACUUM/REINDEX o cambio de compute.
  Evidencia final en `docs/lidl-comparator-20260905.json`. Cliente/workflow sin publicar.
- Segunda simulación final: 3.321 unchanged, cero upserts y cero embeddings
  previstos; confirmada la idempotencia del catálogo Lidl materializado.


## Precio individual correcto en lotes Lidl (local, 2026-09-05)

- Reproducido en producción con Floopy pistacho: `unit_price=0,59`, promoción
  `3x1,49€`, compra mínima de 3 y `largePartNumeric=0,49`. El último valor es
  el coste efectivo por unidad del lote, no un precio individual.
- `scripts/lib/lidl.mjs` detecta la cantidad mínima por la condición `NxPrecio`
  o por `Compra min. N uds.` y deja `promo_price`/`promo_base_price` a NULL.
  `mapLidl` aplica la misma defensa a filas antiguas para mostrar 0,59 €.
- Regresión añadida en `scripts/lib/lidl.test.mjs`; sin migración de esquema.
- La ficha Lidl a pantalla completa representa las rebajas directas como precio
  anterior tachado + precio rebajado y mantiene los lotes sin falso descuento
  individual. `AldiProductModal` elimina el detalle Lidl cuando repite la
  etiqueta exacta. Las tarjetas/listados de Ofertas no cambian.
- TypeScript, ESLint focalizado, 17 pruebas Lidl/ofertas y `git diff --check`
  correctos. La suite global queda bloqueada por un hash de
  `SimilarProductsSection` modificado en paralelo y ajeno a esta corrección.

## Migración a Expo SDK 57 (local, 2026-09-05)

- `package.json` y el lockfile están actualizados a Expo 57.0.20, React Native
  0.86.3, React 19.2.3, TypeScript 6.0.3 y todas las versiones compatibles que
  resolvió `expo install --fix`.
- `app.json` declara SDK 57 y añade los plugins requeridos por los módulos que
  ya usa la app. El runtime basado en `sdkVersion` cambia, por lo que hace falta
  una build nativa nueva; no publicar este salto como OTA para builds SDK 54.
- iOS adopta mínimo 16.4, el Podfile/AppDelegate de SDK 57 y módulos Expo
  precompilados. Android adopta el host RN 0.86, Hermes externo y Gradle 9.3.1;
  se conserva el hardening de release y Google Services existente.
- Verificado: Expo Doctor 21/21, `npm run typecheck`, `npm run lint`, 658 tests y
  build Debug iOS en iPhone 15 Pro / iOS 26.5. Android queda por compilar en un
  entorno con JDK; esta máquina no tiene Java ni el JDK de Android Studio.

## Supermercado compartido entre listados (local, 2026-09-05)

- `CatalogStoreProvider`, montado sobre ambos navegadores, mantiene una sola
  selección para `CatalogScreen`, `NewArrivalsScreen`, `OffersScreen` y
  `PriceChangesScreen`; se reinicia al cambiar el usuario autenticado.
- `CatalogScreen` conserva un estado aparte únicamente en `productSelection`,
  por lo que el selector de ingredientes de recetas no contamina la navegación.
- Ofertas ofrece el mismo conjunto de supermercados que los demás listados. Su
  carga y sus filtros siguen limitados a `OFFER_STORES`; para una cadena sin
  feed muestra vacío y nunca cae implícitamente en Carrefour.
- Sin SQL ni dependencias. Regresión en `shared-catalog-store.test.mjs`.

## Logo de Lidl sin redondeo en selectores (local, 2026-09-05)

- `CatalogStoresScreen` anula el `borderRadius` únicamente para el logo de Lidl;
  `StoreDropdown` hace lo mismo tanto en la rejilla como en el botón de la
  selección activa. El selector propio «Elige supermercado» de `CatalogScreen`
  y su fila para ingredientes también eliminan el recorte de Lidl. Los demás
  logos y los contenedores no cambian.

## Lidl en segunda posición en selectores de supermercados (local, 2026-09-05)

- `CatalogStoresScreen` usa un orden visual local que sitúa Lidl justo después
  de Mercadona. `CATALOG_STORES` y el orden guardado no cambian.
- `storesWithLidlSecond` aplica el mismo orden visual en Catálogo, Ofertas,
  Cambios de precio y Novedades, incluidos sus modales de selección.

## Popup Lidl reubicado en Catálogo (local, 2026-09-05)

- Botón de tienda igualado al diseño de ordenación/vista, reutilizando sus
  componentes y estilos para cristal, Android y fallback clásico.
- `RegionPicker` ya no monta el selector. `CatalogScreen` monta `LidlStorePicker`
  cuando Lidl está activo y la pantalla enfocada: obligatorio sin tienda, o
  mediante botón storefront entre ordenación y lista/cuadrícula si hay tienda.
- `LidlStorePicker` es ahora un modal controlado; la selección espera el guardado
  de `lidl_store_id` antes de actualizar ProfileContext y habilitar productos.
  Bloquea doble escritura y expone errores de carga/guardado. Sin nueva migración.
- TypeScript, lint focalizado y 12 pruebas Lidl/onboarding correctos. Compilado
  e instalado en iPhone 15 Pro / iOS 26.5; verificados posición del botón y popup
  con dirección y mapa reales. No se modificó la tienda de la cuenta usada.


## Error nativo del mapa Lidl resuelto (2026-09-05)

- `RNCWebViewModule could not be found`: el simulador ejecutaba un binario sin
  la dependencia nativa. Recompilado e instalado Debug con XcodeBuildMCP.
- Apertura real verificada en iPhone 15 Pro / iOS 26.5: mapa de Badalona (08915),
  logos Lidl y selección persistida visibles, sin el error. No se cambió la tienda.


## Mapa Lidl (local, 2026-09-05)

- `LidlStoreMap` sustituye el listado inicial por un mapa interactivo; todas las
  tiendas tienen el logo local embebido y coordenadas reales. Solo un marcador
  seleccionado, reflejando el `lidl_store_id` del perfil y su rollback existente.
- CP transmitido desde `RegionPicker`; geocodificación Zippopotam.us con timeout
  de 8 s y cancelación. Si falla, aviso y navegación nacional/búsqueda disponibles.
- Leaflet 1.9.4 con SRI y OpenStreetMap con atribución; WebView 13.16.1 está en el
  lockfile. Hace falta recompilar la app: no desplegar únicamente por OTA.
- Prueba del mapa real en Chrome: cartografía, logos, clic y selección única
  correctos con tiendas de prueba. Captura temporal: `/private/tmp/lidl-map-check.png`.
  Pendiente prueba visual de la hoja nativa en dispositivo.


## Ajustes de Comunidad Autónoma sin «Toda España» (local, 2026-09-05)

- `RegionSettingsScreen` pasa `allowAll={false}` a `RegionPicker`: la sección
  elimina por completo la tarjeta y el separador de «Toda España».
- El copy de ayuda en ES/CA pide el CP para adaptar supermercados y precios.
  Sin SQL ni cambio del sentinel histórico almacenado.

## Selector nacional de tiendas Lidl (local, 2026-09-05)

- `LidlStorePicker` ya no consulta `find_lidl_stores` por CP: carga las tiendas
  `published + selectable` de `lidl_stores` y ofrece un modal virtualizado con
  búsqueda por ciudad, dirección, nombre o CP.
- La selección aparece en Perfil → Comunidad autónoma cuando ya existe una
  región válida. El CP y `lidl_store_id` son independientes: cambiar de CP
  conserva la tienda confirmada.
- Sin migración: la tabla ya tiene RLS y `SELECT` para la app. Falta publicar
  el cliente para que llegue a usuarios instalados.

## Código postal obligatorio para cuentas existentes en 1.3.1 (local, 2026-09-05)

- `Navigation` monta la app y superpone `RegionGateScreen` a todo perfil ya
  incorporado cuyo `postalCode` sea nulo. El modal no admite cierre ni «Toda
  España» y bloquea hasta guardar un CP válido.
- El mensaje explica precios locales y comparaciones más relevantes entre
  productos y supermercados. Mientras el gate está activo no se muestran
  `WhatsNewPrompt` ni `NativeStoreReviewPrompt`.
- Guarda región y CP en Supabase/ProfileContext y oculta el selector de tienda
  Lidl. El CP persistido es el sello; no necesita migración adicional.


## Arranque sin segunda animación de logo (local, 2026-09-05)

- Fuentes y estado inicial reutilizan el mismo `BootLoader` estático, con el
  fondo y el logo de 180 pt del splash nativo. Se retiran el latido, la entrada
  animada, el nombre adicional y los puntos de carga.
- Eliminado el mínimo artificial de 350 ms: se abre Login/onboarding/Inicio
  en cuanto se resuelven los requisitos existentes. Se mantienen la espera de
  sesión, perfil, idioma, tema y carrito, los watchdogs y el reintento de perfil.
- Cambio solo de cliente, sin dependencias, migraciones ni despliegue.
- TypeScript, ESLint de los archivos modificados, 652 pruebas y
  `git diff --check` correctos. Pendiente revisión visual en dispositivo.

## «Todos tus supermercados»: exclusivo de Plus (local + backend, 2026-09-05)

- `StoreDropdown` y `CatalogScreen` permiten «Todos» únicamente a Plus; cualquier
  cuenta gratuita ve candado y abre `PaywallModal`, sin excepción histórica.
- Los cuatro listados abandonan la selección combinada al vencer Plus y evitan
  usar «Todos» como fallback de Lidl.
- El primer beneficio del paywall comunica la vista conjunta e incluye Lidl.
- La migración `20260905120906_remove_legacy_all_stores_access.sql`, aplicada en
  producción, mantiene el default a false y deja los 6.948 perfiles sin el flag,
  protegiendo también las builds antiguas. Verificación: cero permisos activos.

## Inicio sin «Mis grupos» (local, 2026-09-05)

- Retirada la sección completa de grupos de `HomeScreen`, junto con su consulta,
  estado y estilos. La pestaña Grupos y la caché compartida siguen intactas.
- La transición desde onboarding ya no espera esa consulta; solo espera Favoritos
  y Última compra, con el mismo límite de 900 ms.

## Código postal obligatorio en onboarding (local, 2026-09-05)

- `UsernameScreen` oculta la salida «¿Prefieres no darlo?»/«Toda España» y solo
  habilita Continuar cuando hay un código postal válido, además del @ disponible.
- La ayuda bajo el CP indica que se usa para mostrar supermercados y precios de
  la zona, con copy equivalente en castellano y catalán.
- Eliminado `OnboardingSlats`: todos los pasos y la confirmación final reutilizan
  `AmbientBubbleBackdrop` con la variante `onBlue`, sin rayas horizontales.
- Eliminado también `bottomRail` de los cinco pasos que lo dibujaban: ya no hay
  una franja azul oscura fija en el borde inferior.
- `UsernameScreen` pasa `showLidlStorePicker={false}`: validar el CP ya no revela
  el bloque Lidl durante el alta; otros consumidores del picker lo mantienen.
- `StoresScreen` fija su título a una sola línea con ajuste automático de tamaño
  y ancho explícito para evitar saltos en castellano y catalán.
- `StoresScreen` usa un orden visual local que inserta Lidl justo después de
  Mercadona; `CATALOG_STORES` y el resto de pantallas no cambian.
- `RegionPicker` expone `allowAll` con valor predeterminado `true`, de modo que
  Ajustes y el gate de cuentas antiguas mantienen su comportamiento. Sin SQL.

## Versión comercial 1.3.1 (local, 2026-09-05)

- `app.json`, el `MARKETING_VERSION` de iOS y el `versionName` de Android están
  alineados en `1.3.1`.
- No se modifican `CURRENT_PROJECT_VERSION` ni `versionCode`: producción usa
  las versiones remotas y el autoincremento configurados en EAS.
- El aviso de novedades conserva su clave `1.3.0` deliberadamente para no
  reaparecer a quienes ya vieron las novedades de la versión 1.3.

## Separación entre productos de la cesta (local, 2026-09-05)

- `ListScreen` usa un separador de 2 pt entre las filas de producto de cada
  categoría. No deja espacio adicional después del último producto.
- Cambio solo visual, sin SQL ni dependencias.

## Lidl incluido en QuéFalta Plus (local, 2026-09-05)

- El onboarding y Perfil permiten seleccionar Lidl en cualquier cuenta. El gate
  se aplica al consultar contenido: Catálogo, Novedades, Ofertas y Cambios de
  precio lo muestran con candado y abren el paywall para cuentas gratuitas.
- Lidl y «Todos tus supermercados» requieren Plus. Una expiración retira ambas
  selecciones protegidas y vuelve al primer supermercado individual gratuito.
- El beneficio se añadió al paywall en ES/CA. Sin SQL ni cambio de preferencias.
- `npm run quality` pasa: TypeScript, ESLint y 649 pruebas; `git diff --check`
  sin errores.

## Etiqueta del selector combinado (local, 2026-09-05)

- «Todos» se muestra como «Todos tus supermercados» en el selector de Catálogo,
  Novedades, Ofertas y Cambios de precio, con equivalente catalán. Otros usos
  genéricos de «Todos» permanecen intactos.

## Categorías completadas de la cesta (local, 2026-09-05)

- `CompletedZoneHeader` anima el acento y el texto blanco de izquierda a derecha
  mediante capas recortadas y transformaciones nativas. Comparte 520 ms con el
  plegado vertical de productos y omite la animación con Reducir movimiento.

- `ListScreen` detecta la transición de una zona/categoría a completada y la
  pliega al marcar su último producto como recogido. La cabecera completada usa
  `colors.accent`, por lo que sigue la opción activa de Apariencia.
- Una categoría completada admite reapertura manual. El estado distingue los
  pliegues automáticos para reabrirlos ante una reversión del cambio optimista,
  sin alterar las decisiones manuales.
- Regresión en `scripts/tests/list-category-completion.test.mjs`. Sin SQL ni
  dependencias nuevas.
- ESLint de `ListScreen`, 10 pruebas focalizadas y `git diff --check` pasan. La
  suite global queda en 647/648 por la regresión legacy de Todos frente a los
  cambios ajenos en `StoreDropdown`/`PaywallModal`; TypeScript se detiene antes
  en el estilo ausente `pickerStoreLocked` de `CatalogScreen`, también ajeno.

## Favoritos: scroll y filas redondeadas (local, 2026-09-05)

- Eliminado el `TouchableWithoutFeedback` que envolvía toda la pantalla y
  competía con los gestos del `FlatList`/`Swipeable`; el scroll vertical vuelve
  a llegar directamente a la lista y sigue cerrando el teclado al arrastrar.
- `FavoritesScreen` activa `roundedCards`. El contenedor de `Swipeable` recibe
  también el radio de 18 pt, por lo que recorta el fondo verde de la acción y
  evita esquinas cuadradas al marcar o mostrar un favorito en vista de fila.
- Sin dependencias ni SQL. TypeScript, ESLint, la prueba de regresión específica
  y `git diff --check` correctos.

## Orden de recetas por interacción (local, 2026-09-05)

- QuéCocino muestra encima de la primera receta dos opciones excluyentes:
  «Más gustados» y «Más guardados». Ordenan todas las recetas de mayor a
  menor por su contador correspondiente; al desactivar la opción se recupera
  el orden original por fecha.
- La ordenación reutiliza `likeCount` y `saveCount`, responde a las acciones
  optimistas de las tarjetas y no añade consultas, dependencias ni migraciones.
- TypeScript, lint, 644 pruebas y `git diff --check` correctos.

## Investigación de los 42 Lidl pendientes (2026-09-04)

- Diagnóstico refinado: ES5016, ES5026 y ES5093 son outlets `(FD)-Non Food Restanten`; su selección por estar abiertos es un defecto del filtro alimentario, no un fallo transitorio de JSON.
- Censo de las 39 tiendas abiertas de Canarias: categorías HTTP 200 y fruta vacía en todas; dos controles peninsulares devuelven 138 productos. El barrido anterior ya comprobó todas las hojas vacías. No hay causa interna regional confirmada ni garantía de recuperación por reintentar.
- Ofertas idénticas incluso con ES0000: no usar ese feed como prueba de cobertura/precios locales. Lidl Plus sí opera en Canarias.
- Investigación sin cambios en producción. Pendiente excluir los tres outlets y contrastar la fuente regional con la app oficial. Evidencia y límites en `docs/lidl-42-investigation-20260904.md` y JSON adjunto.

## Selector de ingredientes basado en Catálogo (local, 2026-09-04)

- «Buscar un producto» abre `RecipeIngredientPickerModal`, una hoja sobre
  «Nueva receta» que reutiliza `CatalogScreen` en modo `productSelection`.
  No muestra Productos/Categorías ni el botón selector de supermercados.
- En esa posición aparece una fila horizontal de supermercados del perfil,
  con logo, nombre y selección visible. Respeta la disponibilidad regional;
  si no hay coincidencias muestra un estado vacío, sin añadir otros súpers.
- Conserva búsqueda, ordenación, paginación, lista/cuadrícula y restricciones
  del catálogo. Al cambiar de supermercado mantiene el texto de búsqueda.
  Los datos siguen usando idioma, región, CP y tienda Lidl del perfil.
- `StoreProductList` y `ProductGridCard` aceptan selección para formularios:
  tocar un producto lo devuelve a la receta y cierra el popup; los existentes
  quedan marcados y deshabilitados. Esta variante no abre fichas ni añade a
  la cesta ni modifica favoritos. El catálogo normal mantiene su flujo.
- La cantidad previa se conserva al elegir; cerrar sin elegir mantiene el
  borrador. El formulario de fondo queda oculto a accesibilidad mientras el
  popup está abierto. Sin dependencias nuevas, SQL ni despliegue.
- Validado en iPhone 15 Pro/iOS 26.5: búsqueda «arroz» en Mercadona y
  BonpreuEsclat, cambio de tienda conservando consulta, selección en cuadrícula,
  retorno con 250 g, bloqueo visual de duplicados y cierre sin añadir.
  `npx tsc --noEmit`, `npm run lint`, 642 pruebas y `git diff --check` pasan.

## Ingredientes de receta al carrito (local, 2026-09-04)

- El detalle incluye «Añadir ingredientes al carrito» en un pie fijo exclusivo
  de Ingredientes, con el nombre del carrito activo y estados de carga/éxito.
  Usa `CartContext.addToActiveCart` y una única inserción para toda la receta;
  bloquea dobles toques y avisa si falta carrito o falla la escritura.
- Cada ingrediente añade un envase y conserva la cantidad culinaria como nota
  (p. ej. «250 g»), sin multiplicar el precio del envase por gramos. Mantiene
  supermercado, id, imagen, precio y `categoryName` para la agrupación por zonas.
- Las recetas nuevas guardan categoría y precio numérico en el JSON existente.
  Las antiguas admiten campos ausentes y recuperan solo precios simples en
  euros del snapshot; categorías desconocidas van a Otros. Sin migraciones.
- TypeScript, ESLint de los archivos editados y 9 pruebas de recetas/carrito
  correctos. Pantalla revisada en iPhone 15 Pro (iOS 26.5); envío y rechazo
  verificados con API simulada, sin modificar una lista compartida real.

## Recuperación de fallos Lidl (2026-09-04)

- Corrección integrada en `main` con PR #56 (`451df4b`): escrituras con orden estable y reintentos acotados,
  errores reales por IPC, pausa tras dos rechazos 403/429, recuperación filtrada
  que conserva éxitos y verificación final de la cola en Actions.
- La migración `20260904210752_lidl_fleet_recovery.sql` está aplicada y probada
  transaccionalmente como `service_role`: filtro, propietario del lease, reset
  exclusivo de dead y conservación de tiendas exitosas. Ninguna de las tres
  RPC nuevas admite anon/authenticated; son `SECURITY INVOKER`.
- Los cinco catálogos pequeños repiten exactamente su recuento en tres
  observaciones completas: ES0367=2145, ES0431=2151, ES0529=2195,
  ES0530=2166 y ES0848=2146, 40 hojas y 100 % de precio/imagen. Solo esos IDs
  usan un mínimo del 98 % del recuento validado; sigue activo el control de
  cobertura frente al catálogo anterior. Ver `scripts/README-lidl-sync.md`.
- Diagnóstico de fuente: las 39 tiendas canarias devolvieron todas las hojas
  vacías en el barrido inicial. La muestra posterior de tres islas/tiendas
  repitió HTTP 200 con cero productos. ES5016, ES5026 y ES5093 devuelven
  HTTP 204 en categorías y cero productos al consultar fruta. No confundir
  estos tres 204 con JSON truncado ni publicar catálogos de sustitución.
- Canary productivo: ES0367, ES2106 y ES4003 recuperadas; ES5016 conserva
  el bloqueo de fuente. Actions `33920142081` PASS verifica el modo canary
  sobre las tres completadas, sin reprogramarlas y con informe final.
- Validación local: TypeScript, lint, 637 pruebas y `git diff --check` correctos.
  Recuperación final: 36 tiendas (3 canary + 33 en dos workers, sin fallos en
  la tanda ampliada). Cola: 679 succeeded y 42 retry por ausencia de fuente,
  cero running/dead. Las 643 completadas del barrido original conservaron su
  fecha de cierre; no se reprocesaron. Los 36 recuentos publicados coinciden
  exactamente con las descargas. Evidencia: `docs/lidl-sync-recovery-20260904.json`.
  CI del merge `33920588521` PASS; `LIDL_SYNC_ENABLED=true` verificado.


## Nueva receta: ingredientes y preparación (local, 2026-09-04)

- `CreateRecipeModal` usa fichas con numeración persistente a la izquierda: la
  ficha «Por añadir» muestra el siguiente número incluso con la receta vacía.
  Ingrediente y cantidad tienen espacio propio; la cantidad del borrador se
  conserva al seleccionar el producto y se reinicia para el siguiente.
- La búsqueda de ingredientes se trasladó al popup del catálogo descrito
  arriba; la ficha numerada conserva su papel como entrada al selector.
- Preparación como secuencia vertical de tarjetas, guía con ejemplo, foco visual
  y controles de 44 pt. Los pasos tienen identidad estable al borrar, conservan
  el texto y se renumeran; al añadir uno se enfoca y desplaza el formulario.
- Superficies opacas, paleta dinámica claro/oscuro/acento y textos ES/CA.
  ScrollView ajusta los insets del teclado de forma nativa en iOS; Android
  conserva el ajuste de ventana del sistema. Sin dependencias ni migraciones.
- Verificado en iPhone 15 Pro (simulador iOS 26.5): estado vacío numerado,
  búsqueda real, cantidad previa conservada, edición/borrado y renumeración de
  pasos. TypeScript, ESLint de los archivos editados y las cuatro pruebas de
  recetas pasan. Sin publicar receta de prueba ni desplegar la app.

## Recetas solo de la comunidad (local, 2026-09-04)

- QuéCocino queda fijado a Comunidad y oculta por completo el selector
  Comunidad/Supermercados mientras no exista una fuente oficial. La cabecera
  «Recetas de la comunidad» también se eliminó para reservar ese hueco a los
  filtros futuros, sin añadir aún ningún control provisional.
- Eliminadas las cuatro ideas de muestra y la rama provisional de recetas de
  supermercados. La pantalla enseña únicamente filas reales de `recipes` y un
  estado vacío ES/CA cuando no hay publicaciones.
- En la tarjeta, Me gusta sigue en la fila de metadatos con ingredientes y pasos.
  Guardar aparece sobre la esquina superior derecha de la imagen, con contador y
  un objetivo táctil de al menos 48 pt. El detalle conserva las acciones completas;
  ambas vistas actualizan la misma receta de forma optimista, con reversión y toast
  en caso de error.
- `20260904190745_recipe_engagement.sql` está aplicada en producción: añade
  contadores protegidos en `recipes`, relaciones privadas `recipe_likes` y
  `recipe_saves`, RLS de propietario y triggers de recuento en `private`.
  La prueba transaccional remota confirmó insert/delete, recuentos y que otro
  usuario no puede leer la interacción. Los advisors no muestran avisos de
  seguridad para estas tablas o funciones; los índices nuevos figuran como
  no usados porque aún no han recibido tráfico real.
- Crear receta y abrir su detalle siguen activos. Las regresiones viven en
  `scripts/tests/community-recipes-ui.test.mjs` y
  `scripts/tests/community-recipes-schema.test.mjs`.

## Correcciones de los primeros runs de `Sync Lidl catalog fleet` (2026-09-04)

- El run manual `33905985690` falló en el job `schedule`, antes de ejecutar
  ninguna RPC: `const URL` ocultaba al constructor global `URL` y
  `new URL('./sync-lidl.mjs', import.meta.url)` lanzó `TypeError: URL is not a
  constructor`.
- La consulta posterior confirmó cero filas en
  `private.lidl_catalog_sync_queue`; no hubo escrituras de productos ni una
  ejecución parcial que reconciliar.
- El orquestador usa ahora `SUPABASE_URL`/`SUPABASE_KEY`. La prueba sucesora
  arranca un proceso Node real en `--schedule-only`, simula `fetch` sin red y
  valida endpoint, POST, bearer y respuesta. La comprobación anterior solo
  inspeccionaba patrones del fichero y no ejecutaba su inicialización.
- El segundo run manual (`33907980290`) superó ese arranque y falló en la RPC
  con `42501`: a `service_role` le faltaba el permiso `DELETE` que necesita la
  función `SECURITY INVOKER` para retirar tiendas no seleccionables. Se aplicó
  `20260904185536_lidl_catalog_sync_queue_delete_grant.sql`, sin ampliar acceso
  a `anon` ni `authenticated`. La prueba productiva como `service_role`
  programó 721 tiendas dentro de una transacción; el `ROLLBACK` dejó la cola en
  cero.
- El primer run del directorio (`33905318554`) falló por el secreto ausente;
  `LIDL_STORES_API_KEY` ya está configurado y el segundo (`33905697909`) pasó.
  El barrido completo no se relanza automáticamente con esta corrección.

## Orquestador semanal Lidl desplegado (2026-09-04)

- La primera versión de la cola priorizaba una tienda cuando el usuario la
  seleccionaba. Ese diseño se retiró por completo con la migración aplicada
  `20260904175757_lidl_weekly_full_fleet.sql`: no queda trigger en `profiles`,
  ni columnas/RPC de prioridad, ni workflow cada 15 minutos. Elegir tienda solo
  decide qué catálogo lee la app.
- `private.lidl_catalog_sync_queue` queda como cola técnica para repartir un
  único lote semanal. Cada lunes `schedule_all_lidl_catalog_sync_jobs()` vuelve
  a programar todas las tiendas `published + selectable`, sin consultar si un
  usuario las ha elegido y sin excluir catálogos actualizados durante la semana.
- `scripts/sync-lidl-fleet.mjs` reclama una tienda cada vez y delega en
  `sync-lidl.mjs` con su `LIDL_STORE_ID`. Mantiene claims atómicos con
  `FOR UPDATE SKIP LOCKED`, lease de 45 minutos, timeout de 35, tres intentos,
  backoff y estado terminal `dead`.
- `.github/workflows/sync-lidl.yml` está preparado para los lunes a las 11:20
  UTC: 24 workers × 32 tiendas dan capacidad para 768, con hasta seis workers
  simultáneos para cubrir las 721 tiendas abiertas actuales.
- Verificación productiva con `ROLLBACK`: cambiar la tienda de un perfil no
  encola nada; el planificador genera exactamente 721 filas; claim, cierre y
  retry funcionan. El rollback dejó la cola en cero. El workflow está publicado
  y `LIDL_SYNC_ENABLED=true` está activo. Los dos primeros dispatch manuales
  fallaron antes de encolar por los errores de arranque y permisos ya corregidos
  arriba.
  TypeScript, ESLint, YAML, `git diff --check`, advisors y la suite completa
  (**623/623**) pasan.
- Los tres secretos GitHub necesarios (`SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE` y `LIDL_STORES_API_KEY`) están configurados. La
  revisión de autorización comercial sigue separada. Hasta ejecutar el primer
  barrido completo continúan sin catálogo las otras 720 tiendas abiertas.

## Lidl multitienda y directorio nacional desplegados (2026-09-04)

- Se aplicó `20260904134138_lidl_multistore_catalog.sql` en Supabase.
  Separa ficha maestra de producto y variante `(store_id, product_id)`, guarda
  directorio/candidatos postales y añade `profiles.lidl_store_id`. La tabla
  `lidl_products` se mantiene para no romper las builds publicadas.
- Se aplicó también `20260904134454_lidl_multistore_fk_indexes.sql`: cubre las
  cuatro claves foráneas que señaló el advisor. No quedan avisos de seguridad
  ni claves foráneas sin índice atribuibles al cambio multitienda.
- El sync del directorio nacional se ejecutó en producción a las 13:49 UTC:
  730 tiendas, 721 abiertas, 652 CP totales, 645 CP con tienda abierta y 721
  candidatos exactos. Hay 71 CP con varias tiendas abiertas y hasta 3 opciones.
  Publica por el momento candidatos de CP exacto; las tres tiendas cercanas sin
  coincidencia exacta necesitan todavía un índice de centroides postales.
- `LIDL_STORES_API_KEY` se resolvió de forma transitoria desde el cliente web
  público de Lidl y se configuró después como secreto rotatorio en GitHub. El
  segundo dispatch del workflow diario terminó correctamente.
- El sync de catálogo ya escribe master, productos y categorías por tienda;
  los obsoletos se limitan a la tienda procesada. `ES3572` mantiene en paralelo
  el contrato legacy. El orquestador semanal de las 721 tiendas abiertas ya
  está desplegado en base de datos y su publicación/activación ha sido
  autorizada por el propietario.
- El selector vive después del CP en `RegionPicker`; no autoconfirma la tienda.
  La app guarda el id elegido y todas las lecturas Lidl relevantes lo exigen.
  Sin elección, Catálogo explica dónde configurarla y los feeds transversales
  no incluyen Lidl: nunca se usa silenciosamente el precio alicantino.
- Compatibilidad de despliegue: si `profiles.lidl_store_id` todavía no existe,
  `fetchProfile` y `updateProfile` reintentan únicamente ese caso contra el
  esquema anterior, de modo que comunidad y CP se siguen leyendo/guardando.
  Si falta la RPC `find_lidl_stores`, el selector muestra un aviso neutro en vez
  de un error; fallos de red, permisos u otros códigos no se silencian.
- Antes de mostrar productos de tiendas adicionales hay que sincronizar sus
  catálogos: ahora todas aparecen en el selector, pero solo `ES3572` tiene
  productos cargados. El primer dispatch del barrido falló antes de encolar; la
  corrección no lo relanza automáticamente.

## Main sincronizado e integración posterior al merge (2026-09-04)

- `main` local se adelantó sin conflictos de `724058e` a `97fe3b8`; incluye
  los merges #51 (comparador estricto/auditoría) y #52 (catálogo Lidl).
- No hubo cambios de dependencias raíz. Las dos migraciones Lidl ya estaban
  aplicadas en producción según la evidencia del merge y no se ejecutaron de
  nuevo.
- El merge #52 cambió `src/api/catalog.ts`, `StoreProductModal.tsx` y
  `SimilarProductsSection.tsx`, que recibos históricos CE habían congelado como
  protección temporal. Esos recibos permanecen byte-idénticos. La suite omite
  solo las ocho aserciones ya obsoletas y las sustituye por comprobaciones que
  aceptan exclusivamente la transición de hashes de `97fe3b8`, mantienen el
  resto de referencias congeladas y exigen que la sonda CE-100 antigua falle
  cerrada tras cambiar el cliente de catálogo.

## Lidl: catálogo cargado e integración cliente local (2026-09-04)

- La conclusión histórica de Lidl como «sin espejo» queda superada: Product
  Catalog de Lidl Plus sí entrega el árbol y los precios para una tienda.
- El sync productivo de `ES3572` terminó OK: 2.811 productos, 43 categorías,
  2.811 con precio/imagen, 2.736 con precio por unidad y 2.633 disponibles.
  «Butifarra fresca de cerdo» está publicada a 3,69 € y la búsqueda RPC la
  devuelve como primer resultado.
- El origen de 2.531 frente a 2.811 era Cosmética devolviendo temporalmente 0
  en una pasada. Se añadieron 3 reintentos exponenciales y bloqueo si no hay
  40/40 hojas con producto antes de cualquier upsert/mark-stale.
- No confundir los ids terminados en `_ES` con EAN. El esquema deja `ean=NULL`;
  Scan&Go expone `barcode` en una masterdata autenticada y no se consulta.
- Las migraciones de tablas y búsqueda están aplicadas; RLS, lectura anon,
  búsqueda, índices y `catalog_sync_status` se verificaron en producción. Lidl
  está integrado localmente en selector, categorías, browse/búsqueda, ficha,
  carrito y favoritos, pero no en comparador. TypeScript pasa.
- Workflow semanal publicado con `LIDL_SYNC_ENABLED=true`. Sigue pendiente el
  primer barrido completo después de corregir su error de arranque, además del
  contraste multi-tienda y la revisión de autorización comercial. Ver
  `scripts/README-lidl-sync.md`.
- Ofertas implementadas después del merge: fuente pública separada
  `offers.lidlplus.com/app/api/v4/ES/{storeId}/offers`, solo canal `Store` y
  vigencia activa. La correspondencia solo se acepta si `productCodes` del
  detalle contiene un `productId` de la oferta; imagen o nombre+precio sirven
  únicamente para reducir candidatos. DRY_RUN: 28 campañas, 27 de tienda, 17
  enlaces exactos y 10 sin producto alimentario.
- Cliente conectado a Ofertas (selector, categorías, búsqueda, tipo, precio
  promocional/anterior y detalle). La ficha replica el bloque de oferta de
  Bonpreu y no superpone la promoción sobre la imagen. La migración
  `20260904122841_lidl_offers.sql` está aplicada y verificada en producción.
  El sync de las 12:30 UTC publicó 17 ofertas (12 con precio directo); lectura
  anónima y RPC correctas, incluida Banana a 0,99 € frente a 1,49 €.
- `npx tsc --noEmit`, `npm run lint`, suite completa `npm test` y
  `git diff --check` correctos tras la integración.

## Compilación Xcode: caché de React y sesión PIF (local, 2026-09-03)

- Identificados los fallos `Framework 'React' not found` y sesión PIF ocupada.
  El framework de DerivedData carecía del binario; el Pod original sí lo tenía.
- Apartada solo la copia incompleta y reiniciado el `SWBBuildService` del editor.
  CocoaPods ya ha restaurado el framework; SHA-256 idéntico al original.
- TypeScript y Debug con XcodeBuildMCP correctos. Verificación final con el
  DerivedData habitual de Xcode: `BUILD SUCCEEDED`, cero errores, simulador
  iPhone 17 Pro/iOS 26.5 arm64. Persisten avisos de dependencias; no se arrancó
  la app. Ver CONTEXTO.md para el diagnóstico.
- Sin cambios funcionales, migraciones, reinstalación de Pods ni actualización
  de versiones. El workspace correcto sigue siendo `ios/QuFalta.xcworkspace`.

## CE-1: plan v1.1, Supabase directo autorizado (2026-09-02)

- ÚLTIMO AVANCE CE-203 (2026-09-04): [selección y formulario](docs/comparator-strict/CE-203-progress.md).
  Paquete `ce203-owner-independent-review-v1`: 1.200/6.000 aleatorias (20 %)
  por familia × confirmatoria/reto y 175 disputas obligatorias; solape 39,
  total **1.336**, 54 lotes. Semilla derivada de entradas congeladas, no elegida
  por resultados. Libro `outputs/ce203-owner-review-v1/CE-203-revision-ciega.xlsx`
  con evidencia original y formulario de ocho dimensiones; omite etiquetas
  previas, predicciones, cohorte, disputa y selección. Propietario: `owner-01`;
  0/1.336 respuestas, 0 arbitrajes, 0 gold. CE-203/G2 abiertas; no seguir a
  CE-204/205 hasta revisión y confrontación. Sin red, Supabase, retailers,
  app/SQL/cron/syncs/embeddings, integración, despliegue, commit o push.
  Verificación integral: TypeScript, ESLint y **592/592 pruebas PASS**.

- ÚLTIMO AVANCE CE-201/202 (2026-09-03): [cierre y reanudación](docs/comparator-strict/CE-201-202-water-closure.md).
  CE-201 y CE-202 completadas como primera anotación: lote agua con 771 fuentes,
  2.485 composiciones y 2.483 parejas nuevas; unión **6.000/6.000**, cero
  pendientes. 410 rechazos, 595 exclusiones y 1.480 abstenciones en agua.
  Ocho fichas en disputa/68 parejas. Positivo íntegro: Aquarel botella 1,5 L
  Consum `2569879` ↔ Mercadona `27232`, mismo GTIN global `3700123300014`,
  conteo/volumen total/envase exactos y sin oposición. Sigue `abstain` comercial:
  precio, CP, stock y revisiones bilaterales no acreditados; cero ahorros/gold.
  CE-203 es lo siguiente: propietario revisa 20 % aleatorio + todas las disputas,
  en capa separada y ciega a propuestas. CE-204–208/G2 pendientes. CLI
  `prepare-comparator-strict-water-review.mjs`; salida completa fijada por hash,
  informe/manifiesto compactos. Sin Supabase/retailers, app, SQL, cron, syncs,
  embeddings, integraciones, despliegue, commit o push. No repetir CE-200–202.

- AVANCE ANTERIOR CE-201/202 (2026-09-03): [Carrefour y reanudación](docs/comparator-strict/CE-201-202-yogurt-carrefour-progress.md).
  Capa `label-yogurt-carrefour-v1`: 545 fichas nuevas (445 atributos/formato,
  100 por alcance); 431 previas byte-idénticas. Registradas las 976 observaciones
  del bloque yogur. 2.011 composiciones, **2.007 parejas nuevas**, cuatro
  solapes E05/E06/E07/E17. Unión **3.517/6.000**, pendientes **2.483 de agua**.
  1.001 rechazos, 169 exclusiones y 841 abstenciones propuestas en este lote;
  no revisión humana individual ni evaluación del motor. 281 fichas nuevas sin
  denominación/ingredientes; sell_pack_unit no demuestra conteo de envases.
  Ocho fichas nuevas en disputa; E07 fresa/macedonia cambia de rechazo propuesto
  a abstención y queda para arbitraje, ambas versiones intactas. Política local
  conservadora cacao/chocolate/stracciatella: relación desconocida, no positiva.
  108 formatos compatibles, cero positivos íntegros/gold/ahorros. CE-201/202
  abiertas; CE-203 del propietario 20% + disputas aún sin sortear ni realizar.
  35 tests nuevos, TypeScript/lint y **567/567 PASS**. CLI
  `prepare-comparator-strict-yogurt-carrefour.mjs`; anotaciones completas por
  stdout con hash, fichas/índice/dossier materializados. Capas anteriores intactas.
  Seguir con fuentes/parejas de agua en nueva capa, después positivos completos
  y revisión independiente. No repetir lectura de yogur salvo disputa concreta,
  ni CE-200/canarios; no saltar a producción del motor. Sin consultas al
  proyecto/retailers, cambios app/SQL/cron/syncs/embeddings ni integraciones.

- AVANCE ANTERIOR CE-201/202 (2026-09-03): [Plusfresc y reanudación](docs/comparator-strict/CE-201-202-yogurt-plusfresc-progress.md).
  Lote `label-yogurt-plusfresc-v1`: 219 fichas nuevas (207 atributos/formato,
  12 por alcance), reutilizando 212 anteriores sin cambios. 449 parejas
  compuestas: 271 rechazos, 23 exclusiones, 155 abstenciones propuestas.
  No revisión humana individual ni resultado del motor. Unión **1.510/6.000**;
  pendientes **4.490** (2.007 yogur / 2.483 agua). 25 formatos compatibles
  nuevos, cero equivalencias completas/ahorros/gold. CE-201/202 abiertas;
  CE-203 del propietario, 20 % + disputas, sin sortear ni realizar.
  Cuatro nuevas fichas en disputa; no elegir ganador entre 6/8 unidades,
  arándanos/frambuesa o azucarado/sin añadido. Cantidades sin papel, masa/volumen,
  sufijos logísticos y surtidos incompletos conservan incertidumbre.
  CLI `prepare-comparator-strict-yogurt-plusfresc.mjs`, capa editorial nueva
  con contrato de datos v1 reutilizado. 35 tests nuevos; `npm run quality`:
  TypeScript/lint y **532/532 PASS**. Fuentes/artefactos anteriores intactos.
  Seguir con 545 observaciones Carrefour sin ficha del bloque yogur; crear
  otra capa, no alterar anteriores. No repetir Mercadona/Consum/Plusfresc
  salvo disputa, ni CE-200/canarios. Sin consultas al proyecto/retailers,
  escrituras app/SQL/cron/syncs/embeddings, contrataciones o integraciones.

- AVANCE ANTERIOR CE-201/202 (2026-09-03): [punto de reanudación de yogur](docs/comparator-strict/CE-201-202-yogurt-progress.md).
  Nuevo lote `label-yogurt-v1`: 212 fichas registradas (72 Mercadona, 118 Consum,
  22 Carrefour), 133 parejas nuevas; 92 rechazos, 2 exclusiones y 39 abstenciones
  propuestas. Composición desde hechos revisados, no revisión humana individual.
  Acumulado **1.061/6.000**, pendientes **4.939**: 2.456 yogur y 2.483 agua.
  Cero positivos íntegros/gold/ahorros; 20 formatos compatibles no bastan.
  Azúcar añadido/total/edulcorantes independientes; cuatro fichas en disputa,
  títulos 0% ambiguos sin completar, soja no implica vegetal, surtido no es mezcla.
  CE-201/202 EN CURSO; segunda revisión CE-203 del propietario no realizada.
  35 pruebas nuevas, `npm run quality`: TypeScript/lint y **497/497 PASS**.
  No consultas al proyecto ni cambios en producción; artefactos anteriores
  verificados byte a byte. Contadores históricos; el lote Plusfresc y el
  pendiente actual figuran arriba. No reescribir v1 ni repetir CE-200.
  Lectura preliminar sin hechos registrados no cuenta como anotación.

- AVANCE ANTERIOR CE-201/202 (2026-09-03): [patatas](docs/comparator-strict/CE-201-202-potatoes-progress.md).
  Nuevo lote `label-potatoes-v1`: 146 fuentes revisadas, 922 primeras anotaciones
  compuestas por reutilización de esos hechos exactos. No revisión humana
  individual; 93 confusores revisados por alcance y 53 congelados por atributos/formato.
  319 rechazos propuestos / 104 exclusiones / 499 abstenciones. E09 se solapa
  y mantiene estados: unión acumulada 928 parejas, pendientes 5.072 (yogur 2.589,
  agua 2.483). CE-201/202 EN CURSO, cero positivos íntegros/gold/CE-203/G2.
  Revisar después yogures y aguas; segunda revisión 20 % + disputas del propietario
  todavía pendiente. No promover propuestas por pasar tests ni fabricar positivos.
  CLI offline `scripts/prepare-comparator-strict-potato-review.mjs`; especificaciones
  editoriales, citas originales y hashes congelados. 28 pruebas nuevas;
  `npm run quality`: TypeScript/lint y **462/462 PASS**. No tocar artefactos v1: sus hashes
  siguen comprobándose, incluidos sus informes históricos de 5.993 pendientes.
  Diferenciar rebozado explícito/ausente/desconocido, corte/forma/grosor, puré
  moldeado, patatas Bravas refrigeradas/congeladas y papel unidad/total. No
  normalizar automáticamente «gueso», rústico o grandes a corte grueso.
  Sin app, SQL, cron, syncs, integraciones, nuevas contrataciones o consultas al
  proyecto. No repetir extracción/canarios ni usar esta anotación como motor F3.

- ACTUALIZACIÓN VIGENTE 2026-09-03, plan v1.2: **CE-200 completada**.
  [Acta y siguientes tareas](docs/comparator-strict/CE-200-closure.md);
  corpus-v1: 4.176 productos, 5.189 observaciones de ubicación, 6.000 parejas
  únicas y 1.200 Q de 600 orígenes. Descarga y segunda lectura de huellas coinciden.
  Muestreo/alias/exposición/pesos/hashes congelados. No hay gold, particiones ni
  holdout; seguir CE-201/202 con este corpus y luego CE-203–208, sin saltar G2.
  CE-BU-002 revoca el límite acumulado SQL y autoriza 128 MiB / 50.000 filas
  para este corpus. Migración privada **20260903101356** aplicada; counters
  conservados, 119 jobs correctos/1 reconciliado, 0 pendientes/controles/principals.
  Reserva final: 1.518.920 ms, 108.246.478 bytes, 34.177 lecturas, 399 escrituras
  técnicas; transporte extraído 16,59 MiB. No nuevas contrataciones ni cambios
  de app/legacy/cron/catálogo/compute. No volver a adquirir ni repetir canarios.
  Dos incidencias resueltas: censo agregado cancelado y microsegundo de diferencia
  entre relojes de lease; protocolo v3 correcto. Archivo de guarda F1 original
  conservado por su SHA-256; sucesor sin techo acumulado probado por separado.
  TypeScript/lint y **404/404 tests PASS**, más 14 comprobaciones PGlite del lector.
  No baseline de rendimiento completo. Las notas inferiores «no más carga hoy»,
  CE-200 abierta/sin consultas y límite 300.000 ms describen el estado anterior.

- NUEVA AUTORIDAD 2026-09-03, CE-SEQ-003: «Cierra CE-100 y continua con el resto
  de tareas». [Cierre administrativo](docs/comparator-strict/CE-100-owner-closure.md)
  con limitaciones aceptadas, sin PASS ficticio. Continuar CE-103–106, no saltar
  permisos, presupuesto, reversión o validación real. G1 verificado en el acta
  siguiente; sin contratación/ampliación de recursos. CE-100 abierta en notas
  inferiores es histórico.

- ESTADO ACTUAL 2026-09-03: CE-100 cerrada por el propietario;
  **CE-103–106 completadas; F1/G1 PASS acotado al canario privado**.
  [Acta y siguiente paso](docs/comparator-strict/CE-105-106-closure.md).
  Base privada `20260903080621` + recibos duraderos `20260903084621` aplicados.
  Ejecutor atómico probado: reserva persistida, control y reversión confirmados
  mediante transacciones completas por llamada, sin asumir sesión MCP estable.
  Cero controles/identidades/trabajos pendientes; cuatro trabajos de auditoría
  y una reserva diaria. No borrar pruebas ni repetir planes históricos.
  16 grupos PG17.6 nativo PASS (concurrencia, cancelación, SIGKILL local);
  `npm run quality`: TypeScript/lint y 353/353 tests PASS.
  servidor temporal detenido. CI manual configurada/no ejecutada en GitHub.
  El TTY truncaba JSON: corregido con entrada raw. Intento caducado reconciliado,
  sin payload ni devolución de su reserva de 6 s; nuevos jobs limitados por
  PostgreSQL a 2 s/transacción y 4 s reservados por trabajo.
  Reserva diaria: 22.623.694/23.068.672 bytes y 299.920/300.000 ms; 4.128
  lecturas, 35 escrituras técnicas. No nueva carga remota CE-1 hoy.
  CE-200/F2 iniciado localmente según la nota siguiente; CE-100 sigue sin baseline de rendimiento
  completo. Ningún cambio de app/legacy, grants globales, cron ni activación.
  Las notas inferiores «G1 pendiente/sin escrituras» son históricas. No aplicar
  migraciones locales por arrastre ni reutilizar autorizaciones caducadas.

- CE-200 EN CURSO (2026-09-03): [punto exacto de reanudación](docs/comparator-strict/CE-200-dataset.md).
  Solo preparación local: diseño de muestreo, CLI offline, semilla y hashes.
  72 referencias CE-104 → 648 parejas sin dirección duplicada, 144 Q/432 R;
  sin etiquetas, evidencia confirmatoria o holdout. Los 400 casos legacy están
  duplicados byte a byte en dos CSV; no sumarlos como 800 ni heredar etiquetas.
  Índice de 683 referencias previamente expuestas; 335 son de tiendas del
  piloto, no necesariamente sus tres familias. Corpus completo aún pendiente.
  14 nuevos tests; `npm run quality` 367/367, TypeScript y lint PASS.
  No más consultas a Supabase por el presupuesto documentado de 299.920 ms.
  Siguiente: operación nueva de lectura/censo paginado, con ref/salud/permisos y
  presupuesto revalidados; congelar diseño antes de nuevas etiquetas. No usar
  las excepciones F1 para importar corpus, ejecutar scripts legacy o llamar a
  retailers/OFF. Estado CE-201/202 actualizado en la nota siguiente; G2 no
  aceptado, nada programado.

- CE-201/202 EN CURSO (2026-09-03), petición «continua con las tareas»:
  [reanudación exacta](docs/comparator-strict/CE-201-202-progress.md) y
  [guía ce202-v1](docs/comparator-strict/CE-202-labeling-guide.md).
  CLI `scripts/prepare-comparator-strict-labels.mjs`, ocho dimensiones con
  citas ligadas a observación/hash, 22 propuestas reales (9 fuera de piloto,
  8 incompatibilidades, 5 abstenciones), ninguna gold ni revisada por propietario.
  56 sintéticos: 32 F1 reutilizados sin reescribirlos + 24 ampliaciones.
  Aclarados natural/azúcar y GTIN/formato contradictorio; no heredar predicciones.
  Semilla CE-200 intacta; anotaciones en `dataset/label-pilot-v1/` separadas.
  Cero nuevas consultas remotas, cambios de app/BD/cron/cuotas o dependencias.
  No cerrar CE-201/202: falta corpus completo y etiquetado respaldado; no marcar
  CE-203 hecha por haber generado un lote. CE-204–208 pendientes; el validador
  no es un matcher ni un harness de métricas. Siguiente avance local posible:
  CE-206/207; adquisición CE-200 requiere presupuesto/ref/salud/permisos revisados.
  Validación: 22/22 tests nuevos, `npm run quality` 389/389 PASS con TypeScript/lint.

- Punto de reanudación: [PROYECTO-COMPARADOR-ESTRICTO.md](PROYECTO-COMPARADOR-ESTRICTO.md).
  Evidencia y ejemplos: [COMPARADOR-ESTRICTO.md](COMPARADOR-ESTRICTO.md).
- El usuario ha autorizado trabajar en el Supabase actual, incluida producción:
  decisión CE-ENV-001 del plan. Se retira el backend separado obligatorio y la
  espera hasta F8 para aplicar cambios de BD; se mantienen fases y controles.
- CE-000 completada tras actualizar la política: ver
  [docs/comparator-strict/F0-baseline.md](docs/comparator-strict/F0-baseline.md).
  HEAD `03b8ba273e17709fd8fc69c20dddb68c147a7e2a`, rama
  `codex/phase5-observation`; cambios previos preservados. Estado actual:
  F0 ACEPTADA / G0 PASS; F1 COMPLETADA / G1 PASS acotado, CE-100 cerrada
  por el propietario con limitaciones.
  CE-001 completada en solo lectura: ver
  [docs/comparator-strict/CE-001-supabase-inventory.md](docs/comparator-strict/CE-001-supabase-inventory.md)
  y su JSON de evidencia. CE-002 completada: ver
  [docs/comparator-strict/CE-002-independent-review.md](docs/comparator-strict/CE-002-independent-review.md).
  CE-003 completada: [decisions.md](docs/comparator-strict/decisions.md)
  consolida D01–D14, piloto, cuarentenas, estados y cuota. El usuario revoca la
  propuesta anterior de CU-01: debe haber al menos un equivalente válido.
  En la lista principal de CE-1 esto exige una alternativa válida más económica
  incluida en la respuesta final correcta, no un candidato evaluado internamente.
  Sin ahorro válido ofrecido, cero usos. Tres usos por cuenta y Plus se conservan.
  CE-004 completada: [budget.md](docs/comparator-strict/budget.md),
  [source-zone-matrix.md](docs/comparator-strict/source-zone-matrix.md) y
  [CE-004-evidence.json](docs/comparator-strict/CE-004-evidence.json).
  RV-01 confirmada: el usuario se encargará de la segunda revisión (20 % aleatorio
  y todos los casos discutidos); preparar lotes con evidencia en F2, sin dar la
  revisión por realizada ni fijar horas. SC-01/BU-01 confirmadas con «si exacto,
  eso es» ante la pregunta expresa sobre alcance y límites. CE-005 COMPLETADA:
  [vigencia](docs/comparator-strict/freshness-policy.md) y
  [aceptación](docs/comparator-strict/acceptance.md) ratificadas. FR-01 descartada,
  FR-02 confirmada (catálogo activo, sin TTL de 24 h); QA-01 y G0 aceptados con
  «cierra CE-005 y empieza CE-100». No pedir de nuevo estas aprobaciones ni
  dar por alcanzadas las métricas del motor todavía no implementado.
- Resultado CE-002: no adoptar los parches tal cual en CE-1. El guard propuesto
  sigue pasando diferencias de pack, cantidad y endulzado en sondas aisladas;
  no son resultados finales del comparador. Separar HNSW del 0,59 y del UPDATE
  de todas las generaciones; seguimiento CE-602/606/608/609.
- Modal: conservar error/reintento; resolver la ficha anterior que reaparece al
  reabrir mientras carga y la pérdida de procedencia del fallback global.
  Hay una segunda petición global incluso tras cerrar si el fetch local da null.
  Sonda lógica con hooks/red simulados, no dispositivo. Seguimiento CE-703/706.
  `npm run quality`: 213/213; los cinco tests focalizados solo inspeccionan texto.
- Destino confirmado: `auth.quefalta.es` → `gkffvigcnsesbaihycay`; sin ramas
  remotas. v7 es la RPC del cliente y reclama cuota antes de devolver resultados;
  no invocarla como simple comprobación de lectura.
- El timeout `20260901203103` ya está aplicado; la función tiene 60 s.
  HNSW `20260902122234` sigue pendiente. Ledger remoto: 80 entradas; locales:
  163 SQL. Hay 51 correspondencias de nombre con versión distinta/legacy y dos
  entradas remotas sin archivo homónimo. Reconciliar contenido en CE-103, sin
  `db push` por arrastre ni reparación automática de historial.
- Captura 2026-09-02 19:18 UTC: pipeline pausado, cron 17 inactivo y 20 mensajes
  visibles (19 Gadis + 1 Ahorramás). Índice sano y dead tuples estimadas 4,222 %.
  No se procesaron colas ni se corrigieron runs antiguos; seguimiento operativo
  independiente. Revalidar estado mutable antes de una escritura posterior.
- Syncs mayoritariamente semanales/manuales: 15/20 estados globales tienen más
  de 24 h, sin afirmar vigencia por producto. FR-02 no excluye por esa edad; el scheduler
  Windows de Carrefour solo consta documentado, no verificado en esa máquina.
  GitHub main tiene timeout DIA de 45 min y el checkout 60 min; no se publicó.
- Igualdad nominal exacta (sin tolerancia genérica del 0,5 %), estructura de
  pack y variantes verificadas. «Natural» no prueba ausencia de azúcar;
  «yogur griego»/«griego yogur» pueden ser equivalentes si lo demás coincide.
- OFF nutricional ya existe y su `off_code` puede ser de una unidad, no del
  pack vendido. No convertirlo en identidad comercial sin evidencia.
- Hasta CE-101 solo documentación; CE-102/103 añaden herramientas Node locales
  y tests, sin modificar la app. CE-103 ya aplica una base privada inactiva;
  sin nuevas extensiones, ramas remotas ni syncs. Mantener separados el HNSW pendiente,
  la resiliencia del modal y las fases operativas del pipeline existentes.
- CE-003 no hace consultas remotas ni cambia contadores. Define cuota cero por
  error, pending, falta de alternativas válidas más económicas o reintento de
  la misma petición. Exige formato/variante y precio/zona/fecha válidos antes
  de contar resultados finales. Una respuesta de red perdida se recupera
  por idempotencia, sin asumir que el servidor revirtió su transacción.
- CE-004 fija Mercadona/Carrefour/Consum/Plusfresc, CP de referencia 08006 y
  25001, sin nuevas contrataciones/ampliaciones y con trabajo remoto secuencial.
  Son candidatas a evaluar, no cuatro fuentes habilitadas: Consum devuelve zona
  desconocida para 25001, Carrefour muestrea 08001 para Catalunya y Mercadona
  prioriza mad1 en el espejo. No heredar esos precios como locales sin prueba.
  Plusfresc mapea 08006→3 y 25001→12 en el código; revalidar antes de activar.
  Tres muestras locales de 200 filas tienen ~31 h; no son equivalentes ni una
  estimación de calidad. FR-02 no las excluye por edad ni rejuvenece sus fechas.
- Lecturas CE-004: proyecto/plan Pro, metadatos e índices, 25 conexiones y cero
  activas/locks/idle-in-transaction en dos instantes. No prueba capacidad libre
  ni compute efectivo; no se han verificado factura, margen ni CPU/I/O.
  Cinco intentos SQL READ ONLY (uno con error sintáctico corregido), sin writes,
  consultas de usuarios, llamadas a retailers, cambios de cron o embeddings.
  CE-004 cerrada documentalmente; después CE-005 y G0 quedan aceptados.
- CE-005 / FR-02 confirmada: catálogo activo tras sync, sin TTL comercial de
  24 h ni otro plazo fijo sustituto. Se descarta FR-01 por petición del usuario.
  Cambios semánticos reconcilian perfil/vector; precio/stock recalculan ahorro
  sin generar un vector idéntico. Invalidar también vacíos ante altas/bajadas,
  cambios de origen/destino y bajas antes de que termine el worker. Respetar
  promociones vencidas y detectar versiones mezcladas/fallos de sync; no
  declarar tiempo real ni completar un sync por el mero final de la descarga.
  35/35 tests existentes de identidad/reconciliación pasan; no prueban recálculo
  comercial CE-1. [CE-005-evidence.json](docs/comparator-strict/CE-005-evidence.json)
  conserva cálculos y 16 escenarios del TTL anterior como historial descartado.
  CU-01 y presupuesto intactos; sin cambios de código, Supabase o integraciones.
  QA-01 (precisión ≥99,5 %, utilidad, latencia) y G0 aceptados por el propietario
  al ordenar cerrar CE-005. Se aprueba el contrato, no resultados medidos.
- CE-100 iniciada, todavía EN CURSO: [informe](docs/comparator-strict/CE-100-readiness.md)
  y [JSON](docs/comparator-strict/CE-100-evidence.json). Reconfirmado proyecto
  `gkffvigcnsesbaihycay`, Pro, eu-west-1, PostgreSQL 17.6. Cuatro lecturas SQL
  con READ ONLY, timeout 5 s y lock_timeout 500 ms; cero errores SQL,
  escrituras, RPC comerciales, nuevas instalaciones o cambios de cron.
  Muestras de actividad sin locks/idle-in-transaction; no baseline de 15 min.
  `postgres` tiene BYPASSRLS; grants/políticas no sustituyen pruebas de cliente.
  Pipeline pausado y cron 17 inactivo en captura de 21:27 UTC. No contar como
  relectura de los 20 mensajes históricos: la cola no se ha consultado aquí.
  Acceso al panel resuelto: diez copias PHYSICAL, última 2026-09-02 08:00:12 UTC;
  PITR no activado. Ninguna restauración ensayada. Compute MICRO/t4g.micro,
  1 GB, no Medium; la UI de consumo registra 309 h Micro y 2 h Medium sin
  explicar el cambio. No se modificó tamaño. Cuotas Pro no superadas, spend
  cap habilitado. Ventana de métricas de 30 min incompleta: fallan siete
  gráficos de I/O/red/disco/conexiones tras un reintento; alternativa de
  conexiones pide preview que no se activó. Completar baseline de al menos
  15 min antes de cerrar CE-100/permitir carga. Actualización CE-SEQ-001:
  el usuario autoriza expresamente empezar CE-101 dejando CE-100 pendiente.
- Revisión CE-100 del 2026-09-03: [nueva evidencia](docs/comparator-strict/CE-100-capacity-recheck.md).
  Se recupera la lectura de CPU/memoria/I/O/conexiones por Metrics API, usando
  la credencial local existente sin exponerla ni crear otra. Observador puntual,
  analizador y 7 tests locales; quality 308/308. Sin servicios nuevos ni cambios
  de app/BD. Sigue pendiente una ventana comparable de p95/errores/locks del
  catálogo: medias y logs incompletos no permiten cerrar CE-100 ni escribir.
- CE-100, prueba ejecutada el 2026-09-03: [resultados y continuación](docs/comparator-strict/CE-100-catalog-probe-results.md).
  61/61 lecturas válidas más una previa, p95 3,49 s; 18/14/18 muestras por
  tramo de 5 min (<20). La coordinación serializada del conector no mantuvo
  densidad: no cerrar CE-100 ni cambiar umbrales para aprobarla. Corregir
  instrumentación local y desglosar latencia antes de otra ventana.
  Cuota incluida 3,901/250 GB verificada; permiso condicionado a no añadir
  coste, excepción a 22 MiB solo hoy y lock HTTP existente sin ALTER ROLE.
  Contabilidad 20,94/22 MiB; quedan 1.108.530 bytes, insuficientes para repetir.
  Todos los procesos terminaron; manifiesto deshabilitado, ninguna búsqueda
  comercial ni escritura. CE-100 abierta, CE-103 en curso, G1 no aceptado.
- CE-101 COMPLETADA: [inventario](docs/comparator-strict/CE-101-services-inventory.md)
  y [JSON](docs/comparator-strict/CE-101-evidence.json), documentados 2026-09-03.
  Tres SQL READ ONLY, cero errores; HEAD local y GET Auth/settings 200 con ref
  correcta. Siete Edge ACTIVE, dos buckets públicos, Data API public/graphql_public
  y autoexposición de tablas ON. Cron 18 de alertas activo cada 15 min; cron 17 y
  embeddings siguen pausados. No sembrar fixtures en catálogos reales. Auth sin
  Hooks; Site URL localhost y comodines Expo existentes, sin cambiar configuración.
  Cuenta habitual elegida `@rruizosma`, una coincidencia de perfil; no se leyó UID
  ni se verificó token. [Manifiesto](docs/comparator-strict/CE-101-test-access.json)
  documental `enabled=false`, sin runtime ni concesión de permisos. CE-VAL-001:
  el propietario confirma catálogo en su móvil, producción 1.3. Se corrige la
  exigencia prematura de build de desarrollo; no es prueba de código no publicado.
  No invocar comparador comercial como smoke. Sin cambios
  de servicios globales, cuentas, cuota, notificaciones o activación del motor.
  La excepción de secuencia no cierra CE-100/G1 ni autoriza CE-102 por arrastre.
- CE-SEQ-002 (2026-09-03) añade autorización expresa condicionada: al terminar
  CE-101 empezar CE-102; si sus guardas y tests son correctos, empezar CE-103.
  Secuencia cumplida tras CE-VAL-001. No se ha arrancado/instalado ninguna app.
  Los scripts legacy de importación/materialización escriben salvo DRY_RUN:
  no ejecutarlos como smoke ni suponer que las guardas nuevas ya los protegen.
- CE-102 COMPLETADA como componente local: [informe](docs/comparator-strict/CE-102-execution-guards.md).
  Guardas ejecutables de ref/origen, apply explícito, hash, objetos/filas,
  recursos, capacidad, COMMIT/rollback y resultado incierto; preflight offline.
  Sin transporte/coordinador remoto, ejecución rechazada. Los tests con dobles
  pasan; falta integración transaccional y presupuesto duradero real en
  CE-103/105/106. No confundir con RLS o protección de todas las vías administrativas.
- CE-103 EN CURSO: [informe](docs/comparator-strict/CE-103-migration-readiness.md),
  [evidencia](docs/comparator-strict/CE-103-evidence.json) y reconciliador reproducible.
  Tres SQL READ ONLY, cero errores/escrituras: 80 remotas/163 locales; 50 huellas
  textuales correlacionadas, 28 diferencias no resueltas, 2 remotas sin candidato.
  85 locales sin asociación no autorizan db push. Esquema comparator_strict
  ausente; propuesta de base/coordinador, sin SQL nuevo de despliegue. Finalizadora
  sigue a 60 s; HNSW pendiente; pipeline paused/cron 17 off/18 on. Mantener CE-100
  abierta: baseline antes de escrituras. Próximo: continuar reconciliación CE-103
  y diseño local del bootstrap/adaptadores; no iniciar CE-104 por arrastre.
- F1 prepara operación segura en la BD compartida: project ref, alcance,
  permisos, límites, canario y reversión. La autorización incluye cambios
  ordinarios de CE-1; no se vuelve a pedir por el mero destino productivo.
- F8 exige aprobación de activación para usuarios, no de acceso a Supabase.
  Costes nuevos no acordados y operaciones destructivas/masivas siguen separados.
  La retirada segura apaga CE-1 y detiene sus jobs, sin sustituirlos por
  resultados legacy presentados como estrictos.

## Radar sin resultados de Bonpreu/bonÀrea (local; despliegue pendiente, 2026-09-02)

- Reproducción productiva: Mercadona `31504` («Huevos grandes L») dejó estado
  de caché para Bonpreu y bonÀrea pero 0 matches; Carrefour devolvió 2. Los
  espejos no tienen huecos: Bonpreu 21.079/21.079 y bonÀrea 3.145/3.145
  productos publicados con embedding vigente, y casi todos tienen precio.
- El HNSW de ~201k filas se detenía antes de superar el filtro por tienda. La
  prueba de sesión con `hnsw.iterative_scan = relaxed_order` recuperó 20
  candidatos por destino y encontró «Huevos L rubio estuchado» en bonÀrea.
  Bonpreu tenía un segundo fallo: el prefijo `BONPREU` impedía reconocer la
  familia anclada `eggs`, y el match L/XL quedaba 0,5936, justo bajo 0,60.
- Preparada
  `20260902122234_fix_comparator_filtered_hnsw_recall.sql`: ajuste HNSW solo en
  la función, familia de identidad con marca propia normalizada, separación de
  codorniz/cocido, margen 0,59 condicionado a familia+identidad e invalidación
  perezosa de generaciones. Añadidos test estático y smoke SQL con `ROLLBACK`.
- Validación local: test focalizado 3/3, `npx tsc --noEmit` y `git diff --check`
  correctos. **No desplegada; CE-002 no aprueba el paquete para CE-1.** El UPDATE
  afecta a todas las generaciones existentes, no tiene un límite de 18 tiendas.
  CE-ENV-001 autoriza el destino productivo, pero no sustituye separación de
  cambios, pruebas y reversión. No ejecutar este smoke por arrastre en F0:
  escribe caché dentro de una transacción, aunque termine en ROLLBACK.

## Fichas del Radar de ahorro estables (local, 2026-09-02)

- `SimilarProductsSection` activa un fallback global controlado al abrir un
  resultado. Soluciona las filas de Carrefour, Consum, Dia o Plusfresc que el
  RPC devuelve desde el catálogo global pero cuyo detalle se filtraba después
  por la región/centro del perfil y respondía `null`.
- `StoreProductModal` ya no ejecuta `onClose()` ante `null` o error. Mantiene la
  hoja con un estado de error y botón «Reintentar»; las respuestas asíncronas se
  asocian a una clave de producto+ubicación+idioma+intento para no reutilizar un
  detalle anterior. El resto de aperturas continúa respetando la ubicación.
- Regresión en `scripts/tests/store-product-modal-resilience.test.mjs`.
  `npm run quality`: TypeScript, ESLint y 210/210 pruebas correctos.

## Hardening batch anterior, canarios sanos (2026-09-01)

- Producción conserva `embedding_worker_phase_three_batch_writes` (versión
  remota `20260901072452`); su worker v12 fue reemplazado por v13 al desplegar
  la Fase 3 HNSW. El contrato usa OpenAI 50 y
  escritura 20; `catalog_finalize_embedding_batch` admite hasta 25, ejecuta
  `UPDATE ... FROM jsonb_to_recordset`, revalida con CAS y confirma PGMQ en la
  misma transacción. Fallos agrupados y aislamiento acotado de poison rows.
- Smoke transaccional bajo `service_role` correcto, incluidos multi-write,
  multi-failure, archive terminal, hash/versión/publicación concurrentes,
  identidad incorrecta y rollback por vector inválido. Cero productos, jobs,
  fallos o archivos sintéticos persistidos. Advisors sin hallazgos nuevos
  relacionados con la fase.
- Canario 2688 con tamaño 25: HTTP 200, 100 completados, 0 failed/stale/deferred,
  cuatro RPC, máximo SQL 6,91 s; se redujo por margen frente a 8 s. Canario 2690
  con tamaño 20: HTTP 200, 100 completados, 0 failed/stale/deferred, seis RPC,
  ~15,7 s total y ~12,34 s SQL; 0 locks, consultas largas o vacuum. La cola bajó
  3.601→3.401 y HiperDino quedó en 11.419 listos.
- Estado operativo final: `paused`, cron 17 inactivo, 3.401 visibles, 0 en
  vuelo, duplicados y fallos abiertos. No habilitar `active`: aún puede abrir
  tres workers y el trigger row-level de caché actualiza la generación una vez
  por vector. Antes del drenaje continuo implementar invalidación set-based por
  sentencia/run; mientras tanto, no solapar sync y canario. Este hardening
  reduce las llamadas REST (100→6 por request); la Fase 3 HNSW posterior sigue
  pendiente de desplegar.

## Fase 1 de embeddings desplegada y pipeline pausado (2026-09-01)

- Producción tiene aplicada
  `embedding_materializer_phase_one_idempotency` y `catalog-embed` v10 ACTIVE.
  El PR #48 está fusionado en `main` (`11e2c2c`). Estado operativo: control
  `paused`, cron 17 inactivo, 3.601 jobs visibles de
  HiperDino, 0 en vuelo, 0 duplicados y 0 filas sintéticas del smoke.
- La migración añadió, sin backfill, `embedding_input_hash`,
  `semantic_identity_hash`, `match_metadata_hash` y `category_family`; el
  índice único de PGMQ y las RPC de reparación/eliminación/supresión están
  desplegados y solo `service_role` puede ejecutarlos.
- Validación productiva: smoke transaccional A→B→A/legacy/terminal correcto;
  Gadis tuvo `DRY_RUN` + dos runs reales consecutivos con 0 upserts, 0
  despublicaciones y 0 jobs. Runs auditados:
  `1aa1d547-31f0-41c5-94fc-47e7a640770f` y
  `aae8add6-64a4-40cc-9ed4-79420d2ffd78`.
- Dos canarios productivos ejecutados manualmente con el cron siempre apagado:
  request 2682 procesó los jobs 239803..239902 y request 2684 los
  239903..240002, todos de HiperDino. Ambos devolvieron HTTP 200,
  `completed=100`, `failed=0`, `stale=0`, `dispatched=0`; cola 3.801→3.601,
  11.219 vectores HiperDino listos y generación de caché 6.605. La comprobación
  estabilizada dejó 0 invisibles, fallos, duplicados, bloqueos, consultas largas
  y autovacuum. El pipeline volvió a `paused` en la misma transacción,
  `canaryRemainingRequests=0`, y el cron 17 sigue inactivo.
- El `DRY_RUN` de las 18 tiendas revisó 203.073 productos y proyectó 7.733
  embeddings: 7.024 altas + 709 cambios semánticos. No es churn de 200k, pero
  Esclat (1.873) y Carrefour (3.864) activan el límite de 1.000. No ejecutar el
  materializador global ni usar override: revisar/trocear esos deltas. Mantener
  el cron apagado. Los dos canarios simples ya son sanos; antes de `active`,
  implementar o ejecutar un drenaje de varios lotes con presupuesto total
  explícito, baja concurrencia y observación entre lotes.
- El guardarraíl local bloquea ahora todas las escrituras y corta el recorrido
  cuando `anomalyBlocked=true`. `npm run quality` pasa 172/172. Advisors: ningún
  hallazgo nuevo bloqueante de Fase 1; los avisos relevantes son INFO esperados
  por RLS sin políticas en tablas privadas y un índice de runs aún sin uso.

## Fase 0 del pipeline de embeddings (local + backend, 2026-08-31)

- Ya están aplicadas en producción las migraciones
  `embedding_pipeline_phase_zero_control` y
  `fix_embedding_phase_zero_special_expressions`. La segunda corrige el uso
  prefijado de expresiones especiales de PostgreSQL detectado por la prueba
  transaccional. `enforce_single_canary_dispatch_budget` impide además que el
  encadenamiento convierta el canario en un vaciado serial de toda la cola.
  Ninguna ejecución de prueba quedó persistida.
- El control central permanece en `paused`. El cron 17 continúa inactivo, con
  frecuencia `*/15 * * * *` y comando
  `select public.catalog_dispatch_embedding_jobs(3);`; aunque alguien invoque
  materializador, cron o worker, la RPC devuelve cero lotes mientras esté
  pausado.
- Estado productivo final: 3.901 trabajos visibles, cero en vuelo y cero filas
  en `catalog_embedding_runs`. La cola no se vació ni se reescribió. `anon` y
  `authenticated` no pueden ejecutar la RPC; `service_role` sí.
- El materializador local audita el desglose, calcula los embeddings esperados
  y bloquea automáticamente si supera 1.000 o el 10 % de la tienda. Solo altas,
  cambios semánticos o republicaciones sin vector cuentan como embeddings;
  cambios de metadatos de comparación no regeneran el vector.
- El código de Fase 0 está publicado en la rama
  `codex/catalog-comparator-ui-hardening`. Dos canarios de Fase 1 ya validaron
  lotes individuales; mantener el cron inactivo y no pasar a drenaje continuo
  sin un presupuesto total acotado y observación entre lotes. No habilitar
  directamente el cron antiguo.
- Validación focalizada y prueba funcional remota correctas. Los advisors solo
  añaden avisos INFO esperados: tablas internas con RLS sin políticas (acceso
  exclusivo por `service_role`) e índices de auditoría todavía sin uso.

## Incidencia de Favoritos y carga de Catálogo (local + diagnóstico, 2026-08-31)

- Producción conserva `favorites.store`, la restricción única por
  usuario+tipo+tienda+referencia y 3.878 favoritos de 684 usuarios. El vacío no
  procede de una migración ausente: `FavoritesContext` silenciaba cualquier
  error inicial y, al no tener snapshot ni reintento, dejaba el estado vacío
  durante toda la sesión.
- El contexto hidrata ahora un snapshot por usuario mediante `startupCache`,
  revalida sin ocultarlo, reintenta dos veces y expone un refresh que Inicio
  ejecuta al arrastrar. Añadir o quitar favoritos mantiene la caché optimista y
  la revierte junto con el estado si Supabase falla.
- Catálogo → «Todos» precarga 12 filas por súper en vez de las 50 implícitas.
  Antes podía descargar hasta 900 filas para componer solo 50 resultados; la
  búsqueda conjunta ya usaba correctamente el lote de 12.
- Durante el diagnóstico Postgres mostró una ráfaga de timeouts, conexiones
  rotas y un autovacuum de `catalog_product_embeddings` atascado en
  `vacuuming indexes` (5/6) durante más de 2,8 h. El HNSW ocupa ~598 MB y la
  tabla tenía ~53.900 tuplas muertas tras el trabajo de embeddings. Se intentó
  cancelar únicamente el PID 1242429, pero Supabase lo rechazó porque el
  trabajador pertenece al superusuario; no se alteraron datos. No es un vacuum
  anti-wraparound (`xid_age` 1,17 M frente al límite 200 M).
- Mitigación productiva activa: el cron `catalog-embedding-dispatch` (job 17)
  quedó pausado mediante `cron.alter_job(... active := false)` para no generar
  más escritura mientras termina el vacuum. El cron 18 de alertas continúa
  activo. Aunque concluya el vacuum, ya no se debe reactivar directamente: la
  Fase 0 exige pasar primero por `canary`. El mantenimiento posterior debe ser
  `REINDEX INDEX CONCURRENTLY` del HNSW y después `VACUUM (ANALYZE)` en una
  ventana de baja actividad.
- `npm run quality` pasa TypeScript, lint y 132/132 pruebas. Nueva regresión:
  `scripts/tests/favorites-resilience.test.mjs`.

## Timeouts de Gadis resueltos con reconciliación incremental (2026-08-30)

- Causa confirmada en Supabase: el materializador reescribía las 10.901 filas
  de Gadis aunque no hubieran cambiado. Los upserts sobre
  `catalog_product_embeddings` y sus índices agotaban el timeout de 8 s y
  dejaron 5 productos sin snapshot y 14 snapshots huérfanos publicados.
- El materializador local ya consulta el estado existente y solo escribe filas
  nuevas, con cambios semánticos/de normalización o republicadas. Usa lotes de
  25 para upsert y de 100 para despublicar identificadores ausentes exactos; no
  vuelve a depender de `source_seen_at < seenAt` ni refresca timestamps de las
  filas sin cambios.
- Ejecutado en producción para `STORES=gadis`: 5 upserts, 10.896 sin cambios y
  14 despublicaciones. Estado posterior: fuente=10.901, snapshot publicado=10.901,
  faltantes=0, huérfanos=0, vectores pendientes=0, mensajes en cola=0 y fallos
  abiertos=0. No hubo errores Postgres nuevos en la ventana de reparación.
- No hay migración pendiente. `npm run quality` pasa TypeScript, lint y 107/107
  pruebas. Archivos centrales: `scripts/sync-comparator-embedding-catalog.mjs`
  y `scripts/lib/catalog-embedding-reconcile.mjs`.

## «Todos» para todas las cuentas registradas (local + backend, 2026-08-29)

> Estado histórico, sustituido en el cliente local del 2026-09-05: la vista
> conjunta es ahora exclusiva de Plus. La concesión universal y después la
> heredada quedaron retiradas en producción con `20260905120906`.

- La versión 1.3 ya está desplegada. La regla cambia: Catálogo, Novedades,
  Ofertas y Cambios de precio permiten seleccionar «Todos» a cualquier cuenta
  registrada, no solo a Plus o a cuentas anteriores a 1.3.
- La compatibilidad inmediata con el cliente publicado se resuelve en
  `profiles.legacy_all_stores_access`: la nueva migración cambia el default a
  `true` y hace backfill de los `false`. Antes de aplicarla había 4.211/4.211
  usuarios con perfil, 4.051 habilitados y 160 bloqueados.
- Aplicada en producción como `20260829124046`: 4.211 perfiles habilitados,
  cero bloqueados, default `true` y trigger protector activo.
- El cliente local elimina ambos gates y el beneficio correspondiente del
  paywall. `WhatsNewPrompt` usa ahora `profiles.created_at` frente al instante
  de despliegue para no confundir el permiso universal con ser una cuenta
  anterior a 1.3.

## Froiz y Alcampo: cron remoto retirado y embeddings locales (2026-08-29)

- `sync-froiz.yml` y `sync-alcampo.yml` ya no tienen programación automática;
  solo conservan `workflow_dispatch` para diagnóstico manual porque los
  orígenes fallan desde GitHub Actions.
- Nuevo `scripts/run-froiz-sync.ps1` y ampliado
  `scripts/run-alcampo-playwright.ps1`: tras una publicación con código 0
  ejecutan el materializador limitado a su tienda. Froiz omite el paso con
  `DRY_RUN=1` y Alcampo cuando falta `-Publish`.
- Verificado en código y regresión que ambos syncs llaman a
  `recordCatalogSync` después de upsert+`markStale`; la pantalla
  «Actualización de catálogos» consulta esa tabla e incluye Froiz y Alcampo.
  No hizo falta migración ni cambio de cliente.
- Comprobación remota: Froiz tiene fecha del 29-08 a las 11:30 UTC. Alcampo no
  había creado la fila de estado aunque sus productos más recientes estaban
  sellados el 21-08 a las 09:05 UTC. A petición operativa se registró en
  `catalog_sync_status` esa marca real ya comprobada, sin usar la fecha actual:
  la fila devuelve `2026-08-21T09:05:06.908+00:00` y la app ya puede mostrarla.
- Pruebas focalizadas de integración y dispatch: 12/12 correctas.

## Procesador general de alertas personalizadas (local + backend, 2026-08-28)

- `process-price-alerts` v6 está ACTIVE y reclama con la RPC general, sin el id
  fijo de la evaluación de `@rruizosma`.
- El cron permanente `process-price-alerts-every-15-minutes` (job 18) está
  activo. Usa `catalog_embed_project_url` y `catalog_embed_worker_token` desde
  Vault; no guarda valores secretos en el repositorio ni en `cron.job`.
- La migración `20260828164258_generalize_price_alert_processor.sql`, ya aplicada
  en producción, exige un `catalog_sync_status` posterior al lote antes de
  materializarlo y omite lotes `new_arrival` de más de 400 eventos. Así el lote
  inicial de 1.568 altas de Esclat no genera una notificación masiva.
- Estado al activar: `@rruizosma` tiene seis reglas (cinco activas) y
  `@peperuben` seis (todas activas). `npm run quality` pasa 100/100.
- Primer cron permanente correcto a las 17:00 UTC: HTTP 200, cero entregas en
  proceso y cero entregas del lote masivo de Esclat. `@rruizosma` terminó con
  105 entregas `sent` en cinco notificaciones (10 son novedades de Mercadona).
  `@peperuben` terminó con 21 novedades `sent` en una entrada de bandeja y 124
  coincidencias `paused` por su cupo gratuito; no tiene token push registrado.

## Resiliencia del sync de Mercadona ante 403/429 (local, 2026-08-28)

- El run `33162575907` recibió 408 `403` en ráfagas temporales y activó el
  cortafuegos del 3% antes de escribir. No fallaron categorías concretas: 148
  de 151 IDs aparecieron al menos una vez y una muestra de URLs volvió a dar
  HTTP 200 fuera de la ventana de bloqueo.
- El cliente de Mercadona comparte ahora un cooldown de 30 segundos entre todos
  los workers, amplía la espera si existe `Retry-After` y deja una muestra
  diagnóstica de la primera respuesta de cada ráfaga. La concurrencia baja a 2
  y la separación base sube a 250 ms.
- Tras el barrido inicial se reintentan únicamente las parejas fallidas en dos
  pasadas seriales con 60 segundos de enfriamiento. Las recuperaciones respetan
  el orden original de almacenes para no cambiar `source_wh` o el precio de
  referencia. El 3% se calcula después y continúa bloqueando cualquier escritura.
- Workflow ampliado de 75 a 90 minutos. Pruebas nuevas en
  `scripts/lib/mercadona-rate-limit.test.mjs` y
  `scripts/tests/sync-mercadona-resilience.test.mjs`. Pendiente de validar la
  corrección en un sync real de GitHub Actions.

## Paywall 1.3 build 49: términos claros y prueba solo para elegibles (local, 2026-08-28)

- App Review no continuó con la versión 1.3 build 46. Además de la elegibilidad,
  señaló bajo 3.1.2(c) que el flujo no aclaraba el cobro automático ni el importe
  aplicable después de los siete días gratis.
## Paywall 1.3.1: prueba anual solo para cuentas elegibles (local, 2026-08-27)

- App Review permitió que la versión 1.3 build 46 continúe como bug-fix
  submission, pero señaló que su compra anual no recibía los siete días que
  el paywall anunciaba incondicionalmente.
- `getPlusOfferings` valida que Apple publique una prueba gratis de una semana y
  consulta `checkTrialOrIntroductoryPriceEligibility` para la Cuenta de Apple.
  La UI solo muestra la insignia y el CTA de prueba si el estado es `eligible`;
  ante `unknown`, no elegible, ausencia de oferta o error presenta el CTA normal.
- El texto situado bajo el CTA cambia con el plan y usa el precio localizado de
  StoreKit. Para una prueba elegible indica los siete días, el precio anual que
  se cobrará después y el inicio automático del pago; para mensual y anual sin
  prueba indica el cobro al confirmar. Los tres casos explican la renovación
  automática hasta la cancelación en castellano y catalán.
- La oferta remota está activa solo en España, del 21-08-2026 al 21-08-2036, y
  el Paid Apps Agreement está activo. `app.json` permanece en 1.3.0 para sustituir
  la build rechazada dentro de la misma versión 1.3. Las builds 47 (1.3.0) y 48
  (1.3.1) ya están generadas con la elegibilidad, pero sin el nuevo texto de
  renovación exigido por Apple; producción usará el auto-incremento remoto de
  EAS y se espera que el reemplazo sea la build 49.
- Regresión añadida en `scripts/tests/plus-activation.test.mjs`. Pendiente de
  generar y subir la build de producción.

## Upserts del materializador en lotes de 50 (local, 2026-08-27)

- `sync-comparator-embedding-catalog.mjs` limita ahora cada upsert a 50 filas.
  El lote anterior de 500 superó repetidamente el `statement_timeout` efectivo
  de 8 segundos de la Data API (`57014`) tras los syncs de Gadis, Esclat y
  Ahorramás.
- El cambio es común a los 17 workflows y ocho runners locales que invocan el
  materializador. No modifica el sync de origen, la cola, la RPC de dispatch ni
  los lotes de 100 que procesa `catalog-embed`.
- `sync-gadis.yml` amplía su timeout global de 30 a 60 minutos: el rastreo tarda
  unos 17 minutos y los lotes cortos necesitan margen adicional para completar
  el postproceso.
- Ejecución productiva completa: 10.885/10.885 productos materializados,
  dispatch inicial de un worker, cero ausentes, cero obsoletos publicados, cola
  vacía y cero fallos. Regresión incluida en
  `scripts/tests/embedding-dispatch.test.mjs`; `npm run quality` pasa 92/92.

## Embeddings por evento en vez de polling continuo (local + backend, 2026-08-25)

- `sync-comparator-embedding-catalog.mjs` llama al terminar a la nueva RPC
  `catalog_dispatch_embedding_jobs` con hasta tres peticiones. Se omite en
  `DRY_RUN`, por lo que los 17 workflows y ocho runners ya integrados obtendrán
  el impulso sin duplicar cambios en cada wrapper.
- La RPC es `SECURITY INVOKER`, fija lote/timeout en servidor y solo concede
  ejecución a `service_role`; `anon` y `authenticated` no tienen permiso.
  `catalog-embed` v9 encadena una sola petición al terminar cada lote para
  conservar la concurrencia inicial hasta vaciar la cola.
- El cron de producción `catalog-embedding-dispatch` pasó de 10 segundos a
  `*/15 * * * *` y queda exclusivamente como recuperación de impulsos fallidos
  o mensajes que vuelvan a ser visibles. Migración local
  `20260825174505_event_driven_catalog_embedding_dispatch.sql`, desplegada como
  `20260825175141`.
- Prueba remota controlada: el mensaje 212732 se reclamó mediante la RPC,
  `pg_net` 2047 devolvió HTTP 200 con
  `completed=0, failed=0, stale=1, dispatched=0` y la cola quedó vacía. Sin
  advisors nuevos; TypeScript, lint y 90/90 pruebas correctos.

## Nombres catalanes en el Radar de ahorro (local, 2026-08-24)

- `fetchSimilarProducts` usa la nueva RPC `catalog_cheaper_products_v7` y envía
  el idioma activo. La RPC conserva el cupo transaccional de v6 y reemplaza el
  nombre del resultado por `display_name_ca` en los siete catálogos bilingües,
  con fallback al nombre original.
- La v6 no se elimina para mantener compatibles las versiones publicadas. La
  migración `20260824213612_localize_comparator_results.sql` está desplegada en
  producción como `20260824213809`; una llamada autenticada real a v7 devolvió
  un nombre catalán y se revirtió para no consumir cupo. Regresión en
  `comparator-regional-stores.test.mjs`.
- `ProductNoteSheet` activa búsqueda bilingüe para «Producto asociado»: consulta
  ES+CA en los siete catálogos bilingües, deduplica los resultados y conserva el
  mapper del idioma activo. Así una consulta castellana muestra/guarda el nombre
  catalán cuando la app está en catalán. Sin migración adicional.

## Beneficios del paywall de QuéFalta Plus (local, 2026-08-24)

- Se ha retirado «Filtros avanzados» / «Filtres avançats» de la lista de
  beneficios. Los beneficios restantes mantienen tipografías e iconos legibles, con
  descripciones ES/CA más directas y separaciones verticales ajustadas.
- El contenedor usa toda la altura de pantalla y el bloque «Elige tu plan»,
  planes, CTA y enlaces queda anclado abajo mediante `marginTop: 'auto'`. El
  scroll queda como fallback de accesibilidad, no como recorrido normal.
- Regresión incluida en `scripts/tests/plus-activation.test.mjs`. Sin backend.

## Teclado del editor de alertas personalizadas (local, 2026-08-24)

- `PriceAlertEditorModal` usa `KeyboardAvoidingView` con padding en iOS y
  Android, necesario también con edge-to-edge de Expo SDK 57. La hoja deja de
  quedar tapada al escribir el nombre y el formulario se puede desplazar o
  cerrar el teclado arrastrando.
- Regresión incluida en `scripts/tests/price-alerts-ui.test.mjs`. Sin backend.

## Popup de novedades 1.3 (local, 2026-08-24)

- `WhatsNewPrompt` se monta sobre la navegación autenticada y usa
  `profile.legacyAllStoresAccess` para dirigirse exclusivamente a las cuentas
  existentes antes de 1.3. El cierre se recuerda con una clave de AsyncStorage
  versionada y separada por usuario.
- Es un modal central compacto, desplazable en pantallas pequeñas y cerrable por
  X, fondo, Atrás o CTA. Incluye castellano/catalán y respeta tema, acento y
  Reducir movimiento.
- Resume 18 supermercados+«Todos» heredado, búsqueda inteligente, Radar de
  ahorro y mejoras de carritos/grupos. No anuncia alertas mientras su procesador
  general continúe pendiente.
- Prueba de regresión en `scripts/tests/whats-new-prompt.test.mjs`.

## Activación inmediata de Plus sin carrera (local, 2026-08-24)

- `ProfileContext` conserva durante un máximo de 60 segundos el entitlement que
  RevenueCat acaba de validar, de modo que un primer refresh todavía antiguo no
  apaga el badge dorado ni vuelve a cerrar las funciones locales. Se descarta al
  recibir cualquier Plus activo de servidor, al vencer la ventana o al cambiar
  de usuario.
- Nueva Edge Function autenticada `sync-plus-subscription`: obtiene el uid del
  JWT, consulta a RevenueCat desde servidor y persiste la fecha verificada. No
  confía en ids ni fechas del dispositivo y no revoca; el webhook sigue siendo
  la fuente del ciclo de vida posterior.
- `sync-plus-subscription` v1 está desplegada en producción con verificación JWT.
  Antes de probar falta guardar `REVENUECAT_REST_API_KEY`; sin ese secret
  responde 503 de forma segura y el webhook conserva el respaldo. Sin migración SQL.
- Regresión en `scripts/tests/plus-activation.test.mjs`; TypeScript, lint de los
  archivos tocados y 77/77 pruebas correctos. El lint global solo queda rojo por
  un warning preexistente de `WhatsNewPrompt.tsx`, trabajo local concurrente.
- Supabase confirma que `revenuecat-webhook` v5 también está activo en
  producción. La confirmación directa real y su prueba sandbox siguen pendientes
  del secret externo indicado arriba.

## Alertas personalizadas: texto y estado visual (local, 2026-08-24)

- La cabecera deja de truncar «Alertas personalizadas» al convivir con Atrás y
  Añadir; usa el tamaño compacto ya previsto por `ProfileSubscreenHeader`.
- El switch de una regla activa pasa de `accentMid` translúcido a `accent`
  sólido, con thumb blanco y estado accesible sincronizado. El estado apagado
  sigue neutro y no cambia la persistencia ni los límites free/Plus.
- Los tres switches de tipo dentro de `PriceAlertEditorModal` usan ya el mismo
  estilo sólido/neutro y el mismo estado accesible, evitando que una alerta se
  vea distinta al editarla.
- Regresión cubierta en `scripts/tests/price-alerts-ui.test.mjs`. Sin backend.

## Hallazgos medios de la auditoría corregidos (local, 2026-08-24)

- Accesibilidad cerrada para los controles señalados de Catálogo, Cesta y
  Grupos: nombres, roles y estados de selección/checkbox/expansión en
  VoiceOver y TalkBack.
- `GroupDetailScreen` fusiona y agrupa una sola vez, usa listas virtualizadas y
  desmonta la vista normal al abrir la cesta completa. No quedan `ScrollView`
  de productos ni dos copias completas montadas.
- `ListScreen` elimina la animación JS de altura por producto: una zona plegada
  no conserva filas en `SectionList` y usa un único `LayoutAnimation` salvo con
  movimiento reducido.
- `AddMemberScreen` ya no silencia cargas parciales, ofrece reintento, evita
  presentar como disponible a un miembro existente y serializa incluso dobles
  toques mediante un guard síncrono. Su geometría queda alineada con Grupos.
- La transferencia única descrita en esta auditoría histórica abría
  `ConfirmDialog`; desde 2026-09-07 fue sustituida por promoción/degradación de
  varios administradores, también con confirmación. Expulsar sigue confirmando.
  La cuadrícula de productos responde al ancho actual con 3/4/5 columnas y las
  imágenes fallidas conservan un placeholder visible.
- Regresiones en `scripts/tests/medium-priority-audit.test.mjs`. Validación:
  `npm run quality` verde (73/73), exports Hermes iOS/Android correctos y build
  Release iOS instalada y abierta en iPhone 15 Pro con iOS 26.5. No se tocó
  onboarding ni fue necesaria una migración.

## DAU, WAU y MAU exactos (local + backend, 2026-08-24)

- `AuthContext` registra el arranque autenticado en primer plano y las
  transiciones reales a `active` mediante `src/lib/appActivity.ts`. La llamada
  es best-effort y no altera el flujo de sesión si falla.
- La fecha y el usuario se fijan en Supabase. La app solo envía plataforma y
  versión; `private.app_daily_activity` agrega una fila por usuario/día de
  Madrid y cuenta entradas al primer plano sin exponer actividad individual.
- `private.app_active_user_metrics` calcula DAU, WAU de 7 días y MAU de 30 días.
  No se mezcló el histórico aproximado de Auth: empezará a poblarse cuando se
  distribuya este cliente y `tracking_started_on` indica desde cuándo hay datos.
- Desplegadas `20260824170826_app_active_user_metrics.sql` como
  `20260824171037` y `20260824171201_app_active_user_metrics_hardening.sql`
  como `20260824171226`. La escritura autenticada se probó dentro de una
  transacción revertida; `anon` no ejecuta la RPC y los clientes no leen tabla
  ni agregados. TypeScript y lint pasan; falta publicar el cambio de cliente.

## Imágenes y categorías de Froiz (local + backend, 2026-08-24)

- `sync-froiz.mjs` usa ahora URLs públicas estables de Cloudflare Images a
  partir de `image_id`; deja de concatenar la ruta firmada `image` sobre una base
  que ya incluía la cuenta y generaba 404. Hay tests para el id directo y el
  fallback extraído de la ruta.
- Catálogo ofrece la pestaña Categorías de Froiz, carga perezosamente su árbol,
  admite favoritos y abre `FroizProductsScreen` para cada subcategoría.
- En producción existen 12 categorías N1, 539 N2 y 6.889 productos categorizados.
  Se repararon 6.877 miniaturas desde `raw.image_id`; las 12 filas cuyo origen no
  publica imagen quedan a NULL. Verificación posterior: cero rutas duplicadas y
  una muestra real responde 200.
- DRY_RUN completo correcto: 6.893 productos, 551 categorías y 861 ofertas
  procesados sin escribir. `npm run quality` pasa TypeScript, lint y 66/66 tests.

## Precio unitario de Gadis corregido (local + backend, 2026-08-24)

- El origen publicaba `el kilo`, `el litro`, `la unidad`, `la docena`, `los
  100 ml` y `los 100 gr.`, pero el cliente reducía todos los textos no
  canónicos a €/ud. El sync guarda ahora exclusivamente `kg`, `l` o `ud` y
  convierte las cantidades de referencia.
- Los frescos sin sufijo usan `weight=P` y quedan en €/kg; los demás productos
  sin sufijo permanecen en €/ud. Metro y dosis se dejan sin precio unitario
  canónico para no presentar una equivalencia falsa.
- Incluida prueba de regresión. La migración local
  `20260824143104_normalize_gadis_reference_units.sql` está desplegada como
  `20260824143221`. Verificación remota: 6.065 productos en kg, 3.150 en L,
  1.638 en ud, cero unidades no canónicas y cero precios con unidad vacía.
- DRY_RUN real limitado: 150 productos y 112 categorías procesados. `npm run
  quality` correcto: TypeScript, lint y 66/66 pruebas.

## Comparador Froiz, Gadis y Ahorramás (local + backend, 2026-08-24)

- La acción compartida «Buscar productos más económicos» usa ya Froiz,
  Gadis y Ahorramás tanto como origen como destino sin cambiar la API v6 del
  cliente. Se ampliaron materializador, worker, detalle público, candidatos,
  matches internos y estado de caché.
- El snapshot contiene 6.889 productos de Froiz, 10.898 de Gadis y 7.453 de
  Ahorramás. La unidad y la cantidad canónica aceptan las etiquetas comerciales
  reales; dosis, lavado y metro quedan fuera de las comparaciones kg/L/ud. El
  backfill final deja 6.889/6.889, 10.898/10.898 y 7.453/7.453 embeddings,
  respectivamente, con cola y fallos a cero.
- Desplegadas `20260824140442` como `20260824140836`, `20260824141713` como
  `20260824141904` y `20260824150548` como `20260824150622`. Edge Function
  `catalog-embed` activa en v7.
- Pruebas reales correctas con leches de las tres cadenas como origen: cada RPC
  devolvió alternativas de las otras dos con match semántico, precio unitario
  compatible e `is_cheaper`. La validación local pasa TypeScript, lint y 66/66
  tests; los asesores remotos no añaden incidencias ligadas a este cambio.

## Embeddings enlazados a los syncs (local, 2026-08-24)

- Los 17 workflows de los supermercados admitidos por el comparador ejecutan
  ahora el materializador transversal para una sola tienda tras un sync
  correcto. Bonpreu lo hace solo cuando `continue_sync` deja de ser `true`.
- Los diez wrappers PowerShell hacen lo mismo tras ejecuciones reales y omiten
  el postproceso en `DRY_RUN`; así quedan cubiertos también los syncs productivos
  locales de Carrefour, Eroski, Caprabo, Froiz y Alcampo.
- Hipercor no se conecta todavía porque no está admitido por la capa de
  embeddings. El materializador da el impulso inicial y los workers encadenan
  los lotes; el cron remoto queda como respaldo cada 15 minutos.

## Reportes de resultados del comparador (local + backend, 2026-08-24)

- `SimilarProductsSection` incorpora dentro de cada fila una bandera a la
  izquierda del producto. Envía el reporte sin abrir la ficha, muestra loader,
  confirmación y estado completado, y conserva accesibilidad ES/CA.
- `src/api/catalog.ts` llama a `public.report_catalog_product_match`; la RPC
  autenticada valida el match y delega la escritura privilegiada. No se expone
  acceso directo a la cola privada.
- `private.catalog_match_reports` conserva usuario, pareja, versión, estados de
  revisión, nota/revisor y snapshots de productos+métricas. Un índice único
  evita duplicados por usuario y hay índices para pendientes y agrupación por
  pareja.
- `20260824140037_catalog_match_reports.sql` está desplegada como
  `20260824140510`. La prueba real confirmó idempotencia y snapshots; el reporte
  de prueba fue eliminado. TypeScript, lint y la suite global son correctos.

## Fondo del onboarding sin líneas blancas (local, 2026-08-24)

- Retirados del SVG compartido los reflejos horizontales blancos de la persiana
  y el borde blanco del remate inferior de los cinco pasos. Se mantienen el
  fondo azul y las separaciones oscuras; no cambia la lógica del flujo.

## Diseño unificado de filtros en Ofertas y Novedades (local, 2026-08-24)

- `OffersScreen` activa en `ProductFilterSheet` la misma variante visual Plus
  y los iconos de categoría de Novedades. La lógica y las facetas específicas
  de Ofertas no cambian.

## Timeout ampliado del comparador (local + backend, 2026-08-24)

- `catalog_cheaper_products_v6` ya no hereda los 8 segundos del rol
  `authenticated`: usa una excepción de función de 60 segundos, el máximo
  admitido por la Data API. El resto de consultas conserva 8 segundos y v5 no
  cambia.
- `20260824131021_extend_comparator_statement_timeout.sql` está desplegada como
  `20260824131133`. Verificación real con Mercadona 4717 y caché fría: la
  consulta terminó y devolvió 20 resultados en vez de HTTP 500.
- Es un cambio exclusivamente de backend; no hace falta modificar ni publicar
  el cliente.

## Logotipo local de Ahorramás (local, 2026-08-23)

- `CATALOG_STORES` enlaza ya `assets/stores/ahorramas.jpg`; desaparece el
  fallback genérico en todos los consumidores de los metadatos compartidos.
- Las rejillas temporales de tres y cuatro columnas usadas para las capturas
  fueron restauradas a las dos columnas actuales; no queda ningún cambio de
  layout en el cliente.

## Motor de búsqueda del catálogo (local + backend, 2026-08-23)

- Sustituida la búsqueda directa `ILIKE + limit(50)` de los 18 supermercados
  por RPC con FTS por prefijo, fallback trigram para erratas, ranking estable y
  paginación. Mantiene idioma, región, CP/centro, RLS y los adaptadores actuales.
- Catálogo usa relevancia por defecto durante la búsqueda y conserva precio y
  precio unitario como órdenes alternativos. El orden se aplica en el servidor
  antes de `limit`/`offset`, por lo que las tiendas individuales cargan páginas
  estables; «Todos» mezcla las cadenas habilitadas con el mismo criterio.
- Se corrigió el hueco previo de Froiz: existía el texto de búsqueda, pero no
  había efecto ni render de resultados. Su árbol de categorías, ya presente en
  el espejo, también queda conectado a la interfaz.
- El mismo motor queda conectado a Novedades y Ofertas cuando se escribe una
  búsqueda. Novedades deja de buscar solo en las páginas ya descargadas y
  Ofertas sustituye el filtro de palabras sin ranking; ambos aplican categoría,
  rango y orden antes de paginar y mantienen sus reglas de feed.
- `20260823101900_catalog_search_engine_v1.sql`,
  `20260823103646_catalog_search_language_index_planner.sql` y
  `20260823104120_catalog_search_server_sort_orders.sql` están desplegadas como
  `20260823103505`/`20260823103803`/`20260823104828`. Probadas las 18 RPC con rol
  `anon` y la ruta REST pública (HTTP 200), incluido orden por precio y páginas
  sin solape. Rendimiento caliente medido: 26–69 ms en Mercadona, Carrefour y
  Alcampo; suite completa, TypeScript y lint correctos.
- Backend listo antes del cliente, por lo que una build/OTA posterior no tendrá
  una ventana en la que falten las RPC.
- `20260823110039_catalog_feed_search_engine.sql` está desplegada como
  `20260823110849`: 18 RPC `SECURITY INVOKER`, acceso `anon` verificado,
  búsqueda con errata y paginación sin solape. Carrefour: ~51 ms/50 ofertas.

## Cupos gratuitos de alertas y comparador (local + backend, 2026-08-23)

- Las cuentas gratuitas pueden gestionar una alerta personalizada; Perfil ya
  no bloquea la pantalla y «Avísame» permite crearla o editarla. Al ocupar el
  hueco, intentar crear otra abre Plus. Las cuentas Plus siguen ilimitadas.
- «Buscar productos más económicos» permite tres ejecuciones gratuitas por
  cuenta. La cuarta abre el paywall; después de cada búsqueda se muestra el
  cupo restante. Plus sigue ilimitado.
- La cuota no usa AsyncStorage: `private.free_tier_usage` persiste el contador y
  `catalog_cheaper_products_v6` reserva uso+consulta de forma atómica. El
  procesador de alertas entrega la única regla free y pausa reglas sobrantes de
  una suscripción caducada.
- Los dos cupos están desacoplados del encendido comercial. El servidor se
  activó para la revisión de la versión 1.3 el 2026-08-25 y se verificó
  `paywall_enabled() = true`; los demás gates Plus están ya encendidos.
- `20260823063529_free_tier_alert_and_comparator_allowances.sql` y la policy
  defensiva `20260823065123_restrict_free_tier_usage_direct_access.sql` y
  `20260823065448_enforce_free_allowances_before_paywall_launch.sql` están
  desplegadas como versiones remotas `20260823064939`, `20260823065153` y
  `20260823065550`.
  Verificación transaccional real: usos restantes 2→1→0, 4º bloqueado y segunda
  alerta free rechazada; advisors sin avisos relacionados.

## Precio unitario de Eroski y Caprabo recuperado (local, 2026-08-22)

- Verificado en ambas webs que las tarjetas publican `1 KILO A ...`, `1 LITRO
  A ...` y `1 UNIDAD A ...`; el parser compartido ignoraba el bloque
  `quantity-text`/`quantity-price` y escribía siempre null.
- El sync normaliza ya esos valores a kg/L/ud, conserva null cuando la web omite
  la etiqueta y el cliente vuelve a seleccionarlos y mostrarlos. Las columnas
  ya existen: no hay migración; falta relanzar los syncs de Eroski y Caprabo
  para rellenar producción.
- DRY_RUN real de 3 hojas: Eroski 14/42 y Caprabo 10/31 productos con precio
  unitario, ambos con 0 hojas sin tiles. Suite 41/41, lint y typecheck correctos.

## Apertura estable de las fichas nutricionales (local, 2026-08-22)

- Corregido el salto por el que el comparador aparecía primero y bajaba al
  insertarse después el Índice alimentario. Un bloque compartido espera la
  resolución nutricional y revela índice+comparador en la misma actualización,
  con loader compacto, fundido y soporte para Reducir movimiento.
- El hook nutricional diferencia consulta pendiente y resuelta y evita exponer
  datos de la identidad anterior. Afecta a las nueve cadenas con índice y no
  modifica el comparador bajo demanda ni las fichas sin fuente nutricional.
- Añadidas dos pruebas de regresión; 39/39 tests y lint de los archivos tocados
  correctos. El chequeo global queda bloqueado por trabajo local concurrente en
  `ListScreen` y `GeneralStatisticsScreen`, ajeno a esta corrección.

## Plegado progresivo de categorías del carrito (local, 2026-08-22)

- `ListScreen` mantiene montadas las tarjetas de una zona al plegarla y anima
  su altura real con recorte: cierra de abajo hacia arriba y abre en el orden
  inverso, sin el salto instantáneo anterior.
- La ventana escalonada está acotada para que las categorías grandes no hagan
  lenta la interacción. Se conservan el doble toque por supermercado, la
  respuesta háptica, Reducir movimiento y la ocultación accesible.
- El plegado de la cabecera de supermercado incorpora también una transición
  suave de layout. Cambio solo de cliente, sin migración SQL.

## Precio unitario de HiperDino recuperado (local, 2026-08-22)

- La API GraphQL sí publica el precio de referencia en `price_text`; el sync
  anterior no solicitaba ese campo y escribía siempre `price_per_unit = null`.
- `scripts/sync-hiperdino.mjs` usa ahora `sap_final_price`/`sap_price` para el
  precio final y tachado, evitando el fallo actual de un resolver `price_range`,
  y normaliza kilo, litro, 100 g/ml, unidad y docena a l/kg/ud.
- Lavado, dosis y metro permanecen solo en `raw` para no mezclarlos con €/ud.
  DRY_RUN completo: 14.775 productos, 127 categorías, 0 sin precio y 11.357 con
  precio unitario canónico. Pruebas específicas del parser correctas.
- No requiere migración: las columnas y el cliente ya estaban preparados.
  Pendiente desplegar el sync y relanzarlo para rellenar producción.

## Estadísticas generales de la comunidad (local + backend, 2026-08-22)

- «Estadísticas generales» queda disponible también sin compras personales y
  abre `GeneralStatisticsScreen`, con refresco, errores recuperables, acceso
  Plus y versiones castellana/catalana.
- La pantalla ordena supermercados elegidos en preferencias, top 10 de
  productos de catálogo añadidos y top 10 de supermercados por unidades. Usa
  logos, miniaturas, barras proporcionales y etiquetas completas de accesibilidad.
- La implementación privada une `list_items` y `purchase_items`, excluye textos
  manuales y solo expone agregados. El RPC `public` es `SECURITY INVOKER`, exige
  sesión y Plus y revoca `anon`; no devuelve ids de usuarios, grupos, listas o
  compras. La lectura privilegiada vive en el esquema no expuesto `private`.
- `20260822165410_general_statistics.sql` y
  `20260822171122_general_statistics_private_boundary.sql` están desplegadas en
  producción como `20260822171009` y `20260822171221`. Verificación real: 17
  preferencias, 10 productos y 10 supermercados; sin avisos nuevos en advisors.

## Resultados del comparador rediseñados (local, 2026-08-22)

- «Buscar productos más económicos» muestra ahora una cabecera de resultados,
  un resumen del veredicto y tarjetas agrupadas únicamente para tiendas con
  coincidencias. Las filas priorizan miniatura, nombre y precios y marcan en
  verde las alternativas cuyo `isCheaper` es verdadero.
- Si hay alternativas fiables pero ninguna mejora el precio, aparece el aviso
  «Tu opción actual es la más económica». El vacío sin matches conserva su
  mensaje separado. Textos y accesibilidad están cubiertos en español y catalán.
- Cambio solo de cliente en `SimilarProductsSection`; no requiere migración SQL.
- `npm run quality` correcto: TypeScript, ESLint y 33/33 pruebas.

## Identidad centrada en Perfil (local, 2026-08-22)

- Retirado el botón promocional QuéFalta Plus de la tarjeta de identidad; la
  entrada de Cuenta añadida para compra/gestión es ahora el único acceso.
- El `@usuario` y su insignia vuelven a quedar a la derecha del avatar en el eje
  X, alineados a la izquierda, y centrados verticalmente en el eje Y.

## Gestión de suscripción en Perfil (local, 2026-08-22)

- La sección Cuenta incorpora QuéFalta Plus para free y premium: abre el
  paywall en free y la gestión oficial de App Store/Google Play en suscriptores.
- Lee `CustomerInfo` de RevenueCat para mostrar mensual, anual, prueba o fecha
  final. Si Supabase concede Plus sin entitlement (testers), muestra «De
  cortesía» sin enlazar a una cancelación inexistente.
- No hay cambios de esquema. Pendiente validar el destino real en las pruebas
  sandbox de iOS y Android ya previstas para Fase 3.

## Acceso heredado a «Todos» (local + backend, 2026-08-24)

- Catálogo y el selector compartido de Novedades, Ofertas y Cambios de precio
  mantienen «Todos» habilitado para cuentas anteriores a QuéFalta 1.3.
- La excepción usa `profiles.legacy_all_stores_access`; solo afecta a este gate,
  no a los demás beneficios Plus, y un trigger impide cambiarla desde el cliente.
- La columna, el primer snapshot y el trigger ya estaban en producción, pero 66
  altas posteriores habían quedado fuera mientras la versión pública seguía en
  1.2.1. `20260824174500_grant_legacy_all_stores_to_pre_1_3_accounts.sql` está
  desplegada como `20260824174522` y amplía el permiso a esas cuentas.
- Snapshot operativo repetido el 2026-08-25: 22 altas adicionales habilitadas.
  Verificación remota: 4.054 perfiles, 4.054 con acceso heredado y cero sin él.
  El valor por defecto continúa en `false` y el trigger protector sigue activo,
  por lo que hay que repetir el snapshot justo antes de publicar la versión 1.3.

## Icono personalizado por grupo (local + backend, 2026-08-22)

- El detalle de grupo incorpora una tarjeta propia, separada por completo de
  gestionar miembros, desde la que el administrador elige un emoji.
- El selector reúne y deduplica todos los iconos de categoría y subcategoría ya
  usados por los catálogos. El icono elegido se refleja en Inicio, la cabecera
  de Carrito, la barra flotante de selección y todas las fichas de producto.
- `CartContext` conserva `groupIcon` en la clave por usuario, migra snapshots
  antiguos sin ese campo y actualiza nombre/icono al revalidar la pertenencia.
- `20260822071818_add_group_icon.sql` está desplegada en producción como versión
  remota `20260822073002`. Verificados columna, constraint, RLS y policy UPDATE
  del administrador. Typecheck, lint y 30/30 pruebas pasan.

## Barra de selección de productos actualizada (local, 2026-08-22)

- La barra que aparece al elegir cantidades en `StoreProductList` adopta una
  tarjeta flotante redondeada con superficie glass/fallback temado, icono de
  cesta y botón «Añadir» en cápsula. Sustituye la antigua franja oscura de ancho
  completo sin modificar la lógica de alta, el grupo de destino ni el offset de
  la navegación inferior.

## Suscripciones creadas en Apple y RevenueCat (2026-08-22)

- App Store Connect: grupo «QuéFalta Plus», nivel 1, España y localizaciones
  castellano/catalán. Productos definitivos:
  `com.quefalta.app.plus.monthly` (Apple ID `6804053263`, 3,99 €/mes) y
  `com.quefalta.app.plus.annual` (Apple ID `6804054501`, 19,99 €/año, prueba
  gratuita de una semana). No se enviaron a revisión ni se activó el paywall.
- Google Play: suscripción `quefalta_plus` creada con ficha ES/CA. Los planes
  definitivos siguen siendo `monthly` y `annual`, pero Play rechaza guardarlos
  porque la app aún no tiene ninguna build publicada en un canal (prueba interna
  figura inactiva, 0/3). Subir primero una build Android con RevenueCat/Google
  Play Billing; después crear los planes y la prueba anual de 7 días.
- RevenueCat: apps Apple y Google (`com.quefalta.app`), entitlement `plus`,
  offering `default` y paquetes `$rc_monthly`/`$rc_annual` configurados. Cada
  paquete ya enlaza Test Store, Apple y el producto Google futuro
  (`quefalta_plus:monthly` o `quefalta_plus:annual`). Pendientes: credencial de
  cuenta de servicio Google, clave App Store Connect para importación automática,
  API keys públicas en entorno/EAS, webhook y pruebas sandbox.

## Precio de QuéFalta Plus confirmado (2026-08-21)

- Mensual: **3,99 €**, sin periodo de prueba.
- Anual: **19,99 €**, con **7 días gratis** para usuarios elegibles.
- El resto de decisiones de producto y configuración propuestas para RevenueCat,
  Apple y Google quedan confirmadas.

## Consulta visible al desplazar el Catálogo (local, 2026-08-21)

- Tras escribir una búsqueda de Productos y empezar a desplazar sus resultados,
  el buscador se contrae y la cabecera se amplía con el texto introducido en
  cursiva, situado debajo del botón circular de la lupa.
- Reabrir el buscador, cambiar de supermercado o entrar en Categorías retira el
  resumen; altura, desplazamiento y opacidad usan una curva progresiva más lenta
  salvo con Reducir movimiento, donde el cambio sigue siendo inmediato.

## Orden unitario de Novedades, Ofertas y Cambios de precio abre Plus (local, 2026-08-21)

- En `ProductFilterSheet`, solo los botones de «Ordenar por precio unitario»
  de Novedades, Ofertas y Cambios de precio requieren Plus y abren el paywall
  sin aplicar el orden.
- «Ordenar por precio» del envase permanece disponible para cuentas gratuitas.
- Si Plus caduca con un orden unitario activo, la selección se limpia.
- Ofertas vuelve a mostrar formato/cantidad y precio unitario en la línea
  secundaria, manteniendo al final el precio anterior cuando está disponible.
- Cambios de precio mantiene anterior/actual/porcentaje y vuelve a mostrar
  debajo el formato/cantidad y el precio unitario.

## Producto alternativo de notas pasa a Plus (local, 2026-08-21)

- Las notas de la cesta siguen abiertas a todas las cuentas, pero
  «Asignar producto» y «Cambiar» requieren Plus.
- El gate vive en `ProductNoteSheet`: abre el paywall antes de iniciar una
  búsqueda y vuelve a validarse al elegir y guardar. Las alternativas existentes
  se pueden ver, conservar o quitar aun sin suscripción.
- El beneficio se añadió al paywall en castellano y catalán. Sin cambios de BD.

## Historial de compra abierto (local, 2026-08-21)

- «Historial de compra» deja de pertenecer a QuéFalta Plus: Perfil navega
  directamente, sin candado ni popup.
- `HistoryScreen` carga para todas las cuentas y permite repetir cualquier
  compra, sin límite de antigüedad. Eliminados el gate, el CTA bloqueado, los
  textos Plus y la antigua constante del límite de tres compras.
- El beneficio «Historial de compra» se retiró del paywall.

## Dorado Plus en «Mejor precio» (local, actualizado 2026-08-22)

- Retirado el acceso QuéFalta Plus de la tarjeta de identidad. El fondo/tinta
  dorados de `PremiumGoldBackground` quedan solo en «Mejor precio» del plan
  anual; el sello propio de la cabecera conserva su variante dorada.
- Filas bloqueadas, Apariencia, alertas, comparador, orden unitario, selector
  «Todos» y el resto del paywall usan ahora el acento normal, sin alterar gates,
  candados ni navegación al paywall.
- Las insignias públicas y las del paywall usan el acento. La celebración de
  bienvenida mantiene movimiento y composición, y recupera la paleta y el
  resplandor dorados después de una compra confirmada.
- `PremiumGoldBackground` queda usado únicamente por la etiqueta anual de
  `PaywallModal`.

## Doble toque en categorías del carrito (local, 2026-08-21)

- El toque simple sigue plegando o desplegando solo la categoría pulsada.
- Un segundo toque sobre la misma categoría dentro de 300 ms extiende la
  dirección del primero a todas las categorías de ese supermercado, sin retrasar
  la respuesta del toque simple ni modificar otras tiendas.

> **Snapshot: 2026-07-15.** Este documento consolida el estado NO obvio del repo: qué está
> commiteado vs. solo en local, qué supers están implementados pero sin migrar, y las features
> transversales a medias. Todo esto vivía en la memoria de Claude Code (que Codex no ve) y **no
> está completo en git**. La lista canónica y anotada de migraciones SQL está en
> [CONTEXTO.md](CONTEXTO.md) §"Migraciones SQL pendientes"; aquí va lo que ESE documento no dice:
> el estado de commit y el trabajo transversal.

## Burbujas ambientales en Carrito (local, 2026-08-21)

- Carrito comparte ahora con Inicio las 21 burbujas radiales y los lavados
  ligados al acento elegido en Apariencia, también en estados vacíos, pero no
  su degradado superior: conserva el fondo plano de papel.
- La implementación se extrajo a `AmbientBubbleBackdrop`: un único SVG
  memoizado, decorativo, sin gestos ni exposición a accesibilidad.
- La cabecera de Inicio aprovecha el espacio a la izquierda de campana y avatar
  para mostrar «¡Prepara la compra!» (localizado también al catalán). No se
  muestra en Carrito.
>
> ⚠️ Fechas y detalles reflejan lo que era cierto el 2026-07-15. **Verifica contra `git log` y
> contra Supabase antes de fiarte** — algo puede haberse commiteado/ejecutado después.

## Notas y producto alternativo en el carrito (local + backend, 2026-08-21)

- El carrito añade a cada producto una extensión inferior unida a su tarjeta y
  separada con puntos. La acción se llama «Notas» y abre un editor multilínea;
  una nota existente se muestra directamente.
- Desde el mismo editor se puede elegir entre los supermercados activos y
  buscar dentro de uno para asignar, sustituir o quitar un producto alternativo.
  El buscador respeta CCAA, CP y preferencias del perfil. La extensión muestra
  nombre, supermercado y miniatura del vínculo.
- Con varias tiendas disponibles, la hoja obliga primero a seleccionar una
  mediante su logotipo y nombre; el buscador permanece inactivo hasta hacerlo.
  Una única tienda se preselecciona sin mostrar este paso y cambiar de opción
  descarta la búsqueda anterior para no mezclar productos.
- Notas compartidas y optimistas: actualizar un producto fusionado cambia
  todas sus filas y revierte si falla. Se archivan/restauran con el historial y
  se muestran también en el detalle del grupo; el producto asociado sigue el
  mismo ciclo de persistencia.
- Restar y eliminar miden 28 pt, como Asignar, y tienen más separación vertical.
- `20260821175658_list_item_notes.sql` está desplegada y verificada en producción:
  `note` nullable en `list_items` y `purchase_items`, máximo 280 caracteres y
  privilegios/RLS existentes sin cambios.
- `20260821181503_list_item_note_product.sql` está desplegada como versión remota
  `20260821182635`: cinco campos de referencia/snapshot en ambas tablas,
  constraints validados, RLS activo, privilegios correctos y seis policies sin
  cambios. `npm run quality` pasa con 30/30 pruebas.

## Hallazgos altos de la auditoría corregidos (local + backend, 2026-08-24)

- Cesta guarda `store_key` explícito y fusiona por `tienda:id`; cantidades de
  Catálogo también usan esa clave compuesta. Se actualizaron todos los puntos de
  alta y la repetición del historial. El fallback por URL queda solo para datos
  históricos/builds antiguos.
- `set_list_items_in_cart`, `assign_list_items` y `finish_list_purchase` son RPC
  atómicas, invoker y limitadas a `authenticated`. La última archiva detalle y
  vacía la lista en una transacción serializada. Migración local
  `20260824165601_high_priority_cart_integrity.sql`, desplegada en producción
  como versión remota `20260824170527`; backfill con 0 `store_key` nulos.
- Pruebas remotas bajo RLS ejecutadas dentro de `BEGIN/ROLLBACK`: toggle masivo,
  asignación, finalización con detalle, limpieza y trigger legacy correctos. Los
  advisors no señalan ninguna de las tres funciones nuevas.
- `CartContext` serializa mutaciones y protege la restauración; Inicio invalida
  peticiones antiguas. Grupos bloquea todas las activaciones mientras hay una en
  vuelo y separa navegación/activación en objetivos táctiles hermanos.
- Catálogo conjunto usa paginador por tienda tolerante a fallos, bloques de 12 y
  buffers persistentes; conserva resultados parciales y deja de repetir descargas.
- Android: `app.json` registra `withAndroidReleaseHardening`, que elimina la
  firma debug del release y activa R8/resource shrinking tras cada prebuild;
  también bloquea `RECORD_AUDIO`, storage heredado y `SYSTEM_ALERT_WINDOW` en el
  manifest principal (debug conserva el overlay). EAS mantiene firma y versiones
  remotas. Prebuild comprobado con configuración Firebase ficticia temporal.
- Validación final: export Hermes correcto para iOS y Android y
  `npm run quality` verde (TypeScript, ESLint y 69/69 pruebas).

## Grupos ilimitados para todas las cuentas (local + migración, 2026-08-21)

- «Nuevo» ya no consulta Plus ni el número de grupos: siempre abre
  `NameInputSheet`. Retirados del cliente el paywall y `free_group_limit`.
- `20260821175745_allow_unlimited_group_creation.sql` elimina el trigger
  `groups_enforce_limit` y su función. `paywall_gates.sql` ya no los recrea.
- La creación y la pertenencia a grupos quedan ilimitadas; los demás gates Plus
  no cambian.

## Popup redondeado de grupos (local, 2026-08-21)

- `NameInputSheet`, compartido por crear y renombrar grupos, redondea la hoja,
  el icono, el cierre, el campo y el CTA de confirmación.
- Retirado el borde duro de `HardShadow` del CTA; no cambia la lógica del
  formulario, su bloqueo durante la petición ni el comportamiento del teclado.

## Pie redondeado en las fichas de producto (local, 2026-08-21)

- El selector horizontal de cantidad y «Añadir a la cesta» pasan a usar
  geometría de cápsula en las fichas de todos los supermercados.
- Es un cambio exclusivamente visual; conserva acciones, tamaños táctiles,
  estados desactivados y color de acento.

## Botón circular al crear el primer grupo (local, 2026-08-21)

- El estado vacío de Grupos sustituye el CTA rectangular con borde duro por
  una acción circular de acento con el icono de suma y «Crear grupo» debajo.
- Se mantiene un solo objetivo táctil accesible y no cambia la creación ni la
  activación automática del primer carrito.

## Cabeceras de Catálogo, Carrito y Grupos (local, 2026-08-21)

- «Mi Lista» y «Grupos» quedaron alineados con los 20 pt de «Catálogo»,
  incluidos sus iconos y contenedores circulares reducidos proporcionalmente.
- Catálogo reutiliza ese mismo bloque visual con un icono exclusivo de biblioteca a la
  izquierda y conserva el selector de supermercado dentro de la fila, a la derecha.
- La pestaña inferior de Catálogo usa la misma familia library en las barras
  clásica y Liquid Glass.

## Controles de categorías y subcategorías (local, 2026-08-21)

- El selector Productos/Categorías de Catálogo usa la nueva variante reforzada
  de `SlidingSegments`: 44 px, borde sensible al tema, reflejo interior, sombra
  exterior y selección de acento más visible. Orden y lista/cuadrícula aplican el
  mismo tratamiento dentro de Catálogo sin cambiar su altura original de 40 px;
  el bloque unitario bloqueado replica esa geometría. No se anida otra superficie
  de cristal ni se alteran los controles compactos de las demás cabeceras.
- Redondeado el botón Atrás de la pantalla de categoría y de los listados de
  productos de todos los supermercados que usan las cabeceras de catálogo.
- El buscador compartido tiene ahora radio 16, espaciado y sombra acordes al
  Catálogo actual. El selector lista/cuadrícula usa una pastilla más redondeada
  y resalta el modo activo con el color de acento; en Liquid Glass reutiliza
  `SlidingSegments` y su misma transición de Catálogo → Productos. El icono de
  cuadrícula se compensa 1 pt a la derecha para centrarlo ópticamente en ambos.
- Typecheck, lint y 30/30 pruebas correctos.

## Transición onboarding → Inicio e Inicio estable (local, 2026-08-21)

- Eliminada por completo la tarjeta «Completa tu perfil» y su código/traducciones.
- El CTA final marca la entrada desde onboarding e Inicio mantiene una cubierta
  de continuidad hasta que su layout y datos principales están estables; funde
  en 260 ms, limita la espera a 900 ms y respeta Reducir movimiento.
- La cabecera reserva su altura desde el primer frame. Favoritos, grupos y última
  compra distinguen carga de vacío; grupos muestra reintento ante error.
- Corregido el control táctil anidado de última compra y consolidado el fondo de
  21 burbujas en un único SVG memoizado que usa el acento elegido en Apariencia.
- Perfil parte también de la altura conocida de su cabecera Liquid Glass y
  descarta mediciones iguales, evitando el salto de todo el bloque al entrar.
- Validado con `npm run quality` (30/30 pruebas) y compilación Debug completa
  del scheme `QuFalta` en Xcode (`BUILD SUCCEEDED`).
- Para ejecutar en simulador se reinstaló un build firmado con «Sign to Run
  Locally». No usar `CODE_SIGNING_ALLOWED=NO` en pruebas de autenticación: el
  binario abre, pero SecureStore no puede leer/escribir el llavero y Google PKCE
  termina mostrando el error genérico de inicio de sesión.

## Refuerzo integral del onboarding (local + backend, 2026-08-21)

- Corregidos los diez hallazgos de la auditoría: gate recuperable, carrera de
  @usuario, grupo transaccional/idempotente, validación final en servidor,
  reanudación, accesibilidad/texto grande, error de fototeca, CTA sin duplicados,
  pantalla Done y fondo SVG compartido.
- Añadidas pruebas unitarias de progreso y validación de @usuario.
- `20260821130300_onboarding_integrity.sql` está aplicada en producción. Se
  verificaron columnas, índice, permisos de RPC y 0 desajustes de progreso.
- Validado con `npm run quality` (30/30 pruebas), export iOS de producción y
  compilación Debug en Xcode (`BUILD SUCCEEDED`). Queda únicamente un recorrido
  visual extremo a extremo cuando haya una cuenta de pruebas cuyo
  `onboarded_at` sea NULL.

## Desplegable de correo integrado en Login (local, 2026-08-21)

- Añadido el isotipo oficial de QuéFalta sobre el título del formulario,
  reutilizando `assets/quefalta-logo-blue.png`; todo el bloque principal queda
  situado 20 px por encima del centrado base.
- El papel de fondo muestra quince burbujas azules radiales de distintos
  tamaños, estáticas, no interactivas y ocultas para accesibilidad.
- Actualizados título y subtítulo para presentar la compra organizada y las
  funciones de comparación, ofertas, novedades y cambios de precio, también en
  catalán.
- El formulario de acceso por correo se despliega como continuación directa del
  botón que lo abre, compartiendo fondo, borde y radios exteriores.
- Altura y opacidad se animan al abrir y cerrar; Reducir movimiento mantiene el
  cambio inmediato. El panel oculto no recibe toques ni se anuncia por
  accesibilidad.
- El scroll conserva su offset al abrir: texto y botones superiores permanecen
  inmóviles y todo el crecimiento visible sucede bajo el botón de correo. Solo
  se revela la parte inferior al enfocar el campo y aparecer el teclado.
- Retirado del panel el texto «Sin contraseña…»; el campo de correo es ahora
  su primer elemento.

## Cierre de auditoría de arranque y Login (local, 2026-08-21)

- Eliminada la pantalla vacía potencial entre splash y fuentes con una vista de
  continuidad en `App`; `ThemeContext` y `LanguageContext` montan con valores
  seguros y exponen `ready`, incluidos en el `BootLoader` y su watchdog.
- `authStorage` captura lecturas fallidas del llavero y las interpreta como
  sesión vacía/legacy, por lo que Supabase deja de repetir `ERR_KEY_CHAIN` en su
  auto-refresh. Las escrituras nuevas siguen exigiendo SecureStore.
- Loader inicial mínimo 350 ms. Login validado en simulador con texto normal y
  `accessibility-large`; escalas acotadas, legal desplazable y panel de correo
  unido que abre hacia abajo sin mover cabecera, Apple ni Google.
- Google usa la G oficial multicolor; Apple reserva su espacio desde el primer
  frame de iOS. Las 15 burbujas se dibujan con un solo SVG.
- `inlineRequires` activado en `metro.config.js`; imágenes de mascota y Froiz
  ajustadas a resolución de uso. Export iOS: 1.868→1.828 módulos y
  15.236→11.532 KiB totales; Hermes 7.460.130→7.597.028 bytes.
- Metadatos Xcode alineados en 1.3.0 (34) y referencia huérfana a
  `QuFaltaTests` retirada del scheme compartido. Sin migraciones ni cambios
  remotos de Supabase.

## Bienvenida animada a QuéFalta Plus (local, 2026-08-22)

- Añadida `PlusWelcomeTransition`, superposición a pantalla completa del paywall
  con fundido negro de 1,5 s, sello dorado brillante sin halo, virutas,
  partículas y mensaje de bienvenida en castellano y catalán.
- Eliminado el antiguo modo de vista previa: ambos CTA compran ahora el paquete
  seleccionado y la transición solo aparece si RevenueCat devuelve el
  entitlement `plus` activo. La expiración validada se refleja inmediatamente en
  el perfil local mientras el webhook completa la persistencia en Supabase.
- Respeta Reducir movimiento y puede cerrarse con X, Atrás o escape de
  accesibilidad; al cerrarla se descarta también el paywall.

## Filtros en Cambios de precio (local, 2026-08-21)

- `PriceChangesScreen` añade un botón independiente a la izquierda del selector
  `Bajadas / Subidas` en Liquid Glass y fallback. Su estado activo se marca con
  el acento elegido.
- Reutiliza `ProductFilterSheet` para multiselección de categorías y rangos de
  variación absoluta (≤5 %, 5–10 %, 10–20 %, >20 %). En `Todos`, las categorías
  están agrupadas y cualificadas por supermercado.
- La hoja oculta los controles de precio/orden que no corresponden a este feed,
  conserva la paginación y muestra el vacío específico de filtros sin
  coincidencias. Textos añadidos en castellano y catalán.
- Corregida la salida de `ProductFilterSheet`: ya no encadena un desplazamiento
  manual con el `slide` nativo del modal. Al comenzar un gesto vertical hacia
  abajo desde el tirador, actualiza inmediatamente `visible=false`; la única
  transición nativa termina el cierre sin esperar a que se suelte ni poder
  rebotar. Botón, backdrop y Atrás usan exactamente el mismo cierre.
- Typecheck, lint y 27/27 tests correctos; falta recorrido visual en
  dispositivo/simulador.

## Buscador ampliado de Catálogo (local, 2026-08-21)

- Al enfocar el buscador de productos, su expansión desplaza y oculta todos los
  controles de orden y vista de la fila; al perder el foco reaparecen.
- La superficie y la lupa ya no se sustituyen al cambiar de estado: el mismo
  botón se transforma lentamente en una cápsula redondeada y vuelve exactamente
  a su posición circular, eliminando el tirón del icono al contraerse.
- Se aplica por igual a Liquid Glass y al fallback.
- Corregido el salto vertical de la cabecera: el campo expandido usa la misma
  altura que la fila contraída (40 px en Liquid Glass y 44 px en fallback), sin
  alterar la medida del chrome ni mover el contenido inferior.

## Orden unitario Plus en Catálogo y Novedades (local, 2026-08-21)

- `€/u↑` y `€/u↓` quedan bloqueados para cuentas gratuitas en las variantes
  Liquid Glass y fallback. Usan un tratamiento neutro con acento, sin candado,
  y abren el paywall con la cabecera compacta, sin texto descriptivo
  contextual y sin modificar la consulta ni el orden activo.
- En cuentas gratuitas, precio total y precio unitario se muestran como dos
  controles independientes. Con Plus se fusionan en la pastilla original de
  cuatro segmentos, incluida la transición del filtro seleccionado. Si Plus
  caduca con el orden unitario activo, se restaura el orden por precio total.
- La versión bloqueada iguala tamaño, pastilla y laterales redondeados al bloque
  de precio; las etiquetas quedan centradas en ambos ejes.
- Novedades y Ofertas exponen orden por precio total y unitario dentro de
  `ProductFilterSheet`; Cambios de precio conserva relevancia y añade el orden
  unitario. En free, solo los botones unitarios muestran candado y abren el
  paywall sin aplicar el orden; una caducidad elimina esa selección. El orden
  por precio total sigue libre donde existe.
- Typecheck, lint sin avisos y 30/30 tests correctos.

## Fondo del carrito activo ligado a Apariencia (local, 2026-08-21)

- `HomeScreen` usa el acento elegido en Perfil → Apariencia como base del
  resumen del carrito activo. Conserva el degradado y los dos círculos
  recortados mediante luces y sombras neutras, sin una paleta azul fija ni
  cambios en la lógica.

## Información y control de notificaciones (local, 2026-08-20)

- Perfil → Notificaciones incorpora una tarjeta de activación y explica tres
  tipos de aviso: carrito compartido, amistad y grupo. Esta pantalla ya no
  muestra una segunda bandeja: los avisos
  recibidos se consultan exclusivamente desde la campana de Inicio.
- El interruptor parte apagado por defecto, pide el permiso del sistema al
  activarse, registra/elimina el token push al instante y ofrece abrir Ajustes
  si el permiso fue denegado.
- La preferencia de AsyncStorage ahora usa
  `@notifications_enabled:${userId}`. Auth reconcilia el token al iniciar sesión
  y elimina uno anterior si la cuenta no tiene la preferencia activa.
- `npm run quality` correcto (typecheck, lint y 27/27 tests). Falta recorrido visual en dispositivo y probar
  aceptar/denegar el permiso con un build nativo.

## Alertas personalizadas (evaluación acotada activa; actualizado 2026-08-23)

- MVP completo en cliente: reglas exactas o por palabras, multi-súper, bajada
  mínima, oferta, vista previa, gestión/pausa y CTA «Avísame» compartido por
  todas las fichas, superpuesto en la esquina superior derecha de la imagen
  mediante `ProductDetailImage`/`ProductDetailHero`.
- «Avísame» conserva la campana y permite crear la primera regla gratuita o
  editar la alerta exacta que ocupa ese hueco. Si ya existe otra regla, abre el
  paywall. Plus mantiene creación ilimitada.
- Perfil abre «Alertas personalizadas» para todas las cuentas. La pantalla
  identifica el cupo gratuito y solo bloquea reglas sobrantes procedentes de
  una suscripción caducada.
- Desplegadas en producción la migración
  `20260820162731_personalized_price_alerts.sql` y sus correcciones de RPC e
  índices. El backfill contiene los 18 catálogos y el verificador transaccional
  pasa. `20260821210209_price_alert_notification_products.sql` está también
  desplegada como `20260823193941` y permite abrir los resultados exactos de
  cada aviso.
- El procesador agrupa por regla y lote de sync y usa la bandeja/push actuales;
  una RPC transaccional impide duplicar la fila de bandeja o el push al
  reintentar. No amplía `send-push` ni acepta contenido desde el cliente.
- Si un producto genera a la vez bajada y
  oferta, el procesador lo cuenta y comunica solo como oferta. Las novedades
  tienen textos propios en push y bandeja, sin caer en el texto de ofertas.
- Cada push `price_alert` lleva el `notificationId` y cada fila de bandeja ya
  conoce su propio id. Ambos abren `PriceAlertResults`, que consulta mediante la
  RPC protegida `get_price_alert_notification_products` los productos exactos
  del aviso y permite abrir sus fichas.
- El editor de reglas por palabras solo ofrece los supermercados activos en
  Perfil → Supermercados que además correspondan a la CCAA actual. Al editar,
  intersecta también la selección guardada con esa lista para no conservar
  cadenas que el usuario haya desactivado. Cada chip sitúa el logotipo local
  del supermercado a la derecha de su nombre.
- Las reglas persisten un emoji de clasificación. Cliente y carrito comparten
  `getSubcategoryEmoji`; el editor ofrece una vista viva y la tarjeta sustituye
  el icono genérico por el emoji. La migración
  `20260820165618_price_alert_rule_emoji.sql` está desplegada y asignó `🫒` a
  la regla existente de «aceite oliva»; el fallback es `🛒`.
- Añadido y desplegado el modo exclusivo «Novedad» (`new_arrival`): conserva
  los supermercados elegidos, usa `🆕` y no admite palabras, bajadas,
  ofertas, bajada mínima ni vista previa. La migración
  `20260820170935_personalized_alert_new_arrivals.sql` captura inserciones
  publicadas de los espejos y el RPC solo las entrega a este tipo de regla.
- Evaluación del lunes 24-08-2026: `process-price-alerts` v2 y la nueva RPC
  `claim_price_alert_deliveries_for_user` están acotadas exclusivamente a
  `@rruizosma`. Se crearon seis reglas `TEST 1` a `TEST 6` para novedades,
  bajadas, umbral del 10%, ofertas, mezcla/deduplicación y producto exacto.
  La RPC acotada se desplegó como `20260823194159` + corrección
  `20260823194414`.
  El cron de `ops/schedule_rruizosma_price_alert_evaluation.sql` corre cada 15
  minutos y se elimina solo el 25-08 a las 00:00 UTC; prueba HTTP 200 con cola
  inicial vacía.
- La ejecución real fallaba antes de crear la bandeja porque
  `create_price_alert_notification` leía `request.jwt.claim.role`, una GUC
  heredada que PostgREST ya no rellena. La migración
  `20260824194005_fix_price_alert_service_role_claim.sql` está aplicada y
  valida el rol con `auth.jwt()->>'role'`; la RPC continúa revocada para
  `anon`/`authenticated`. Desde `process-price-alerts` v3 se conserva el
  error estructurado si una llamada vuelve a fallar.
- Prueba remota controlada del 24-08 a las 19:42 UTC: un solo lote de `TEST 2`
  quedó `sent`, con entrada de bandeja y resultado del procesador
  `claimed=1`, `sentGroups=1`, `failedGroups=0`. Una segunda ejecución a las
  19:51 UTC envió cuatro grupos representativos adicionales (novedad, bajada
  ≥10 %, oferta y mixta): `claimed=11`, `sentGroups=4`, `failedGroups=0`.
  `process-price-alerts` v4 está ACTIVE: consulta `label, emoji` de la regla,
  limpia prefijos heredados `TEST N ·`, envía el emoji en `data` y lo muestra
  delante del título push. `NotificationsSheet` sustituye para `price_alert` el
  icono genérico por ese mismo emoji. Las cinco notificaciones existentes se
  actualizaron; prueba adicional a las 20:04 UTC correcta con título
  `🍫 Bajadas ≥10% · chocolate` (`claimed=3`, `sentGroups=1`, cero
  fallos). Quedan 500 entregas históricas agotadas en `failed`; no reactivarlas en bloque
  porque producirían varios avisos por regla y sync.
- Pendiente tras valorar la prueba: convertir el procesador en general,
  configurar `PROCESS_PRICE_ALERTS_SECRET` dedicado y activar el cron permanente
  de `ops/schedule_price_alerts.sql` para todas las cuentas.
- Corregido el bucle de «No se pudieron cargar tus alertas»: `ToastContext`
  conserva un valor estable y un error remoto ya no vuelve a disparar el
  `useFocusEffect` de la pantalla indefinidamente.
- Si Plus caduca, el procesador crea solo el registro deduplicador en estado
  `paused`; no envía y los avisos vencidos no reaparecen al renovar. Las reglas
  siguen en BD, pero el acceso desde Perfil queda reservado a cuentas Plus.

## Fondo Plus en «Todos» (local, 2026-08-20)

- El paywall abre con una cabecera más baja: sello dorado compartido de
  `VerifiedBadge` y título en una sola fila, sin el bloque «Más control para
  encontrar el mejor precio» ni subtítulos contextuales desde ningún acceso.
- La presentación es ahora de altura completa hasta el borde superior, con zona
  segura para el contenido. Se retiraron tirador y cierre exterior, y el gesto
  de descarte está desactivado; solo cierran la X o Atrás del sistema.
- Mensual y Anual ocupan dos columnas de una misma fila; Anual conserva la
  preselección y «Mejor precio». La etiqueta «Incluido» se retiró del título
  «Todo lo que desbloqueas». Anual reutiliza el ritmo del barrido diagonal de
  QuéCocino con una franja azul difuminada e irregular, estática cuando el
  sistema solicita Reducir movimiento. «Mejor precio» usa directamente
  `PremiumGoldBackground`, con su tinta oscura. «Todo lo que desbloqueas» no
  muestra checks a la derecha de sus filas.
  El comparador figura como «Radar de
  ahorro», con una descripción explícita de alternativas similares más baratas.
- El borde activo de los planes es una superposición absoluta: conserva los 2 px
  visuales sin alterar la altura de la fila ni mover el CTA al alternar entre
  Mensual y Anual.
- «Buscar productos más económicos» mantiene sus iconos de búsqueda, carga y
  resultado. En cuentas gratuitas reutiliza el fondo dorado, añade un candado y
  abre el paywall sin texto descriptivo contextual y sin invocar el comparador;
  con Plus usa el estilo normal.
- Catálogo y el selector compartido por Cambios de precio, Novedades y Ofertas
  muestran en «Todos» el fondo dorado animado solo cuando la opción está
  bloqueada para una cuenta gratuita; con Plus vuelve al diseño normal.
- El efecto se centralizó en `PremiumGoldBackground`, tiene una opacidad base
  del 30 %, respeta Reducir movimiento y detiene la animación cuando el panel de
  supermercados está cerrado. La etiqueta «Mejor precio» del plan anual mantiene
  una excepción al 70 %.
- Retirados los accesos Plus de la tarjeta de identidad. `@usuario` queda a la
  derecha del avatar y centrado solo en el eje Y; la fila de Cuenta es el único
  acceso al paywall o a la gestión de la suscripción.
- «Color personalizado» en Apariencia usa el mismo fondo solo cuando está
  bloqueado; con Plus activo muestra una fila normal.
- `premium_until` futuro es la única fuente de verdad de Plus. `verified` pasa a
  ser su reflejo público protegido para la insignia dorada en Perfil, Amigos y
  Grupos; el trigger lo sincroniza y el cliente no puede editarlo. Migración
  `20260820163441_sync_plus_verified_badge` aplicada en remoto: 2 cuentas Plus,
  2 insignias y 0 discrepancias tras el backfill.
- Cada bloque usa una semilla de movimiento propia para variar posiciones,
  trayectorias, fases y velocidad; no hay partículas sincronizadas entre ellos.
- La animación es una caída vertical continua: cada elemento cruza el borde
  inferior, se oculta durante el retorno y reaparece arriba sin reinicio grupal.
- Las rejillas añaden una celda invisible cuando el número de supermercados es
  impar para impedir que la última tarjeta ocupe las dos columnas.

## QuéCocino reactivado para desarrollo (local, 2026-08-30)

- La pestaña QuéCocino vuelve al árbol de navegación mediante
  `QUE_COCINO_ENABLED = true`, tanto en Liquid Glass como en la variante clásica.
- La reactivación original incluía cuatro recetas locales de ejemplo y un área
  reservada a supermercados. Ambos contenidos provisionales se retiraron el
  2026-09-04; el selector Comunidad/Supermercados queda oculto.
- Ya existe backend, persistencia, creación y detalle para recetas comunitarias.
  No existe todavía una fuente de recetas oficiales de supermercados.

## Push de solicitudes de amistad (local + backend desplegado, 2026-08-20)

- La solicitud ahora selecciona su `friendshipId` y espera la invocación
  best-effort de `send-push`, evitando abandonar la petición remota al terminar
  inmediatamente la acción del cliente.
- `send-push` v7 está ACTIVE en producción. Valida la solicitud exacta y mantiene
  compatibilidad con versiones publicadas que solo mandan `addresseeId`.
- Los taps de tipo `friend` quedan en cola hasta que el navegador autenticado
  esté listo y abren directamente Perfil/Inicio → Amigos, también en arranque
  en frío. Pendiente: validar extremo a extremo con dos dispositivos reales y
  notificaciones activadas en el receptor.

## Valoración nativa de las tiendas (local, 2026-08-20)

- Sustituido el modal propio de valoración y su redirección por
  `expo-store-review`, que solicita el cuadro oficial de App Store o Google Play.
- La primera apertura autenticada arma el plazo local por usuario. Una
  reapertura posterior tras 24 horas realiza un solo intento; la tienda conserva
  el control sobre si lo muestra y no devuelve la puntuación ni el resultado.
- Eliminados el componente, estilos y textos del popup anterior. Requiere nuevo
  build nativo; pendiente de validar en dispositivo/distribución de pruebas.

## Fondo ambiental en Inicio (local, 2026-08-18)

- Implementado localmente en `HomeScreen`: degradado tenue basado en el accent,
  con formas ambientales amplias y discretas detrás del contenido.
- Añadida una prueba visual con veintiuna burbujas del color de acento estáticas, combinando
  tamaños pequeños, medianos y grandes, difuminadas mediante degradado radial
  y sin incorporar recursos raster.
- Respeta tema claro/oscuro, accent personalizado, gestos y accesibilidad. No
  incorpora recursos nuevos ni modifica la jerarquía funcional de Inicio.

---

## Login directo (local, 2026-08-20)

- Eliminada la portada gestual de la burbuja, junto con su shader, fallback,
  textos y estado de revelado. La app sin sesión muestra directamente el
  formulario actual de Apple, Google y correo, con sus enlaces legales.
- Retirada `@shopify/react-native-skia`, que no tenía otros consumidores. Se
  conservan Reanimated, Gesture Handler, SVG, Haptics y `expo-glass-effect`
  porque siguen siendo dependencias activas del resto de la app.
- Los flujos de autenticación no cambian; Google mantiene PKCE.

## Código postal y comunidad en el primer paso (local, 2026-08-18)

- Al completar un CP válido, la tarjeta del código postal se contrae desde la
  derecha y la comunidad autónoma aparece a su lado; ambas terminan al 50 % y
  con la misma altura.
- La transición respeta Reducir movimiento y solo se activa en el primer paso;
  Ajustes y el gate existente conservan su composición vertical.
- `npm run quality` correcto (typecheck, lint y 27/27 tests).

## Primer paso sin transición de entrada (local, 2026-08-19)

- Eliminada la bajada completa de `OnboardingShutter` y la transición entre la
  mascota agarrada y la sentada. Fondo, contenido y formulario aparecen desde
  el primer render.
- `berenjena-sentada-ok.png` queda directamente en su posición final y el campo
  de usuario conserva el enfoque automático al montar.
- `npm run quality` correcto (typecheck, lint y 27/27 tests).

## Paso 2 del onboarding con persiana azul (local, 2026-08-18)

- Implementado localmente, sin commit: `Username` navega inmediatamente a
  `Stores`, que ahora replica el fondo azul con lamas del primer paso.
- Se eliminaron «Paso 2 de 5» y el subtítulo «Mostraremos sus catálogos y
  precios…». La mascota con carrito queda fija, completa y
  adaptada a la altura sobre un grid desplazable; el CTA también permanece
  visible. El indicador de selección queda fijo en la esquina superior derecha.
  Recurso: `berenjena-carrito-transicion.png`.
- El grid usa la comunidad guardada en el paso 1. Se completó la huella de las
  cadenas regionales nuevas: Plusfresc `ES-CT`/`ES-AR`, Gadis `ES-GA`/`ES-CL`,
  Froiz `ES-GA`/`ES-CL`/`ES-CM`/`ES-MD` y Ahorramás
  `ES-CM`/`ES-MD`/`ES-CL`; HiperDino continúa limitado a `ES-CN`.
- `npm run quality` correcto (typecheck, lint y 27/27 tests).
- Falta validar la composición visual con una cuenta que tenga el onboarding
  incompleto en dispositivo o simulador.

## Paso 3 del onboarding con mascota selfie (local, 2026-08-19)

- Generada e integrada `assets/mascot/berenjena-selfie.png` (512×768, RGBA con
  alfa real): la berenjena aparece completa haciéndose un selfie con un móvil.
- `AvatarScreen` adopta fondo azul con lamas, volver flotante, título superior
  sin subtítulo, tarjeta clara de foto y footer fijo con Continuar/Ahora no. La
  cabecera empieza justo bajo el botón de volver y la mascota aparece entre la
  tarjeta y el footer, con 50 px adicionales de ancho y alto respecto al primer
  diseño reducido.
- Se conserva `expo-image-picker`, el recorte 1:1, la subida existente y la
  posibilidad de omitir; no hay cambios de backend ni migraciones.
- `npm run quality` correcto (typecheck, lint y 27/27 tests).

## Paso 4 del onboarding con amistades (local, 2026-08-19)

- Generada e integrada `assets/mascot/berenjena-amigos.png` (1024×1536, PNG
  RGBA): la berenjena aparece entre las nuevas mascotas plátano y tomate, que
  le dan una mano cada una.
- `FriendsScreen` replica la persiana azul con lamas, volver flotante, cabecera
  superior, composición de mascotas al 50 % de su tamaño inicial, buscador y
  resultados claros, y footer fijo con Continuar/Ahora no. Conserva la búsqueda
  y el envío de solicitudes existentes.
- El buscador queda fijo; la lista de usuarios es la única zona desplazable y
  muestra el indicador vertical nativo (persistente en Android).
- Optimizado el typeahead tanto aquí como en Perfil → Amigos: primera consulta
  válida inmediata, siguientes a 100 ms, cancelación con `AbortController` y
  filtrado local provisional del prefijo anterior. El `EXPLAIN ANALYZE` remoto
  con rol autenticado y RLS dio ~5 ms sobre unas 3.900 filas, así que no se tocó
  el esquema.
- `npm run quality` correcto (typecheck, lint y 27/27 tests).

## Paso 5 del onboarding con primer grupo (local, 2026-08-19)

- `GroupScreen` deja `OnboardingLayout` y completa el lenguaje visual de la
  persiana azul: volver flotante, título/subtítulo, mascota con carrito, tarjeta
  clara para el nombre y sugerencias rápidas sobre el fondo.
- El footer fijo mantiene visibles Continuar/Crear grupo y Ahora no; al aparecer
  el teclado, el contenido intermedio es desplazable sin perder la acción. Las
  dos acciones completan `onboarded_at` y abren directamente Inicio; se eliminó
  la pantalla terminal «Todo listo». Si se crea el grupo, queda como carrito
  activo; la misma autoactivación se aplica al primer grupo creado desde Grupos.
- Generada e integrada `assets/mascot/berenjena-grupo.png` (1024×1536, PNG
  RGBA): la berenjena empuja el carrito, el plátano va dentro y el tomate queda
  a la derecha; las tres mascotas saludan. `createGroup`, los hápticos, el toast
  y el carácter opcional del paso se conservan sin cambios de backend.
- Corregida la máscara alfa de los huecos interiores del carrito: ya no quedan
  placas blancas entre las barras, bajo la cesta ni alrededor de las ruedas.
- Igualado al morado de la mano el reflejo casi blanco que ocupaba el dedo
  central levantado de la berenjena, conservando un brillo pequeño y natural.
- `npm run quality` correcto (typecheck, lint y 27/27 tests).

## Histórico: preparación inicial de Hipercor (2026-08-15)

- La POC terminó correctamente en GitHub Actions con Google Chrome. El sync
  completo queda en `scripts/sync-hipercor.mjs`, con workflow diario
  `sync-hipercor.yml` y esquema `supabase/migrations/hipercor_catalog.sql`.
- El esquema y varios catálogos completos se desplegaron después. El estado
  operativo vigente y el runner Windows están al inicio de este documento. El
  guardarraíl sigue exigiendo 10.000 productos; el catálogo representa solo el
  centro público sin CP/dirección y continúa fuera de cliente y comparativa.

## Actualización Fase 2 (2026-08-14)

Implementada localmente, sin commit ni cambios remotos:

- Accesibilidad: animaciones, transiciones y expansiones respetan Reducir movimiento; toast, filtros, cantidades, segmentos, selectores y hojas exponen etiquetas/estados.
- Diseño: contraste AA reforzado para textos secundarios y los seis accents; objetivos táctiles compartidos de al menos 44 pt.
- Texto grande: Login se reorganiza en una columna con `accessibility-large` y evita desbordamientos; iPad mantiene la composición completa.
- Recursos: importación directa de Ionicons y Space Grotesk, Montserrat sin uso eliminada; export iOS 57→38 recursos, 1.524→1.470 módulos y 6,15→5,81 MB de Hermes.
- `npm run quality` y Xcode Release correctos; 27/27 tests. Falta recorrido VoiceOver/TalkBack autenticado y dispositivo físico.

Detalle: `FASE-2-ACCESIBILIDAD-DISENO.md`.

## Actualización Fase 1 (2026-08-14)

Implementada localmente, sin commit ni cambios remotos:

- ESLint: 82 → 0 avisos; CI exige cero.
- Arranque: mínimo del BootLoader 2.000 → 350 ms y pestañas bajo demanda.
- Catálogo/Novedades/Ofertas/Cambios: colecciones, comparadores, cachés y efectos estabilizados para evitar trabajo repetido.
- Login: fallos de Apple/Google localizados y sin texto técnico; contenido centrado en iPad.
- `npm run quality`, export iOS y Xcode Debug/Release correctos; Release revisada en iPhone 17e e iPad mini.
- `ios/.xcode.env.local` (ignorado) se corrigió de Node 24.9.0 a 22.23.2 en esta máquina.

Detalle y pendientes de QA física: `FASE-1-ESTABILIDAD-RENDIMIENTO.md`.

## Actualización Fase 0 (2026-08-13)

Se ha creado una línea base técnica sin cambios funcionales ni mutaciones remotas:

- Node 22.23.2/npm 10.9.8 fijados y controles de calidad reproducibles.
- CI para typecheck, lint y 27 pruebas existentes.
- Compilaciones Debug y Release verificadas en Xcode 26.5; login revisado en iPhone 17 Pro, iPhone 17e e iPad mini simulados.
- Supabase auditado en modo lectura: las columnas críticas y los tres RPC que usa el cliente existen. Las listas de migraciones de este handoff son históricas y no deben interpretarse ya como ausencia de columna sin contrastar el esquema remoto.
- No se aplicaron migraciones, no se modificó lógica de producto y no se creó commit.

Resultados y pendientes de dispositivo físico/cuenta QA: `FASE-0-LINEA-BASE.md`.

## Actualizacion CP: Consum y Plusfresc (2026-07-16)

Implementado localmente, sin migrar ni sincronizar en Supabase. Consum barre 5
`X-TOL-ZONE` y escribe `regions`/`regional_prices` (ejecutar
`consum_regions.sql` antes); Plusfresc barre sus 8 centros y escribe
`centers`/`center_prices` (incluido en `plusfresc_catalog.sql`, pendiente). El
cliente ya aplica el CP en busqueda, listado, categoria y detalle. DRY_RUN OK:
Consum 131 productos/1 pagina/zona; Plusfresc 7.927 en la union de los 8 centros.
Falta ejecutar SQL y los syncs reales con service_role.

El histórico de precios por ubicación de Consum/Plusfresc usa
`catalog_location_price_history.sql`: los syncs rellenan
`catalog_location_prices` (precio efectivo por producto+zona/centro) y un
trigger escribe los cambios en `catalog_location_price_changes`. La primera
pasada solo establece la base; los cambios se registran desde el siguiente sync.

## 1. Qué está commiteado/pusheado vs. SOLO en local

Esto es lo primero que se pierde en un traspaso. Repo de la app = `github.com/rruizosm/QueFalta`, rama `main`.

**Commiteado y pusheado a `main`:**
- Fix `markStale` 57014 (lotes+reintentos, `scripts/lib/stale.mjs`) — commit `1a6032c` (2026-07-10).
- OTA Android (fix "icono pillado") a canal production — commit `1a6032c` (2026-07-10).
- Eroski (8º) + Caprabo (9º), backend Tapestry compartido — commit `6e72611` (2026-07-11).
- Fix nombre de columna `ean` (bonÀrea/Consum/Dia, renombrado `ean13`→`ean`) — commit `3158318`
  (2026-07-15), **quirúrgico**: SOLO el nombre de columna, SIN arrastrar la multi-zona Dia/Carrefour.
- (Repo web aparte `QueFalta-Web`) AEO F0–F3 — commit `a5c4ff3` (2026-07-12).

**SOLO en local (NO commiteado) al 2026-07-15 — el grueso del trabajo reciente:**
- **Supers nuevos sin commitear:** Ametller (11º), Aldi (12º), Hiperdino (13º), Alcampo (14º), Plusfresc (15º).
  Condis (10º) estaba con "commit en espera" porque Ametller rompía el typecheck a medias — verifica su estado real.
- **Multi-zona Carrefour** (barrido por comunidad, `regions`/`regional_prices`) — local.
- **Multi-zona Dia** (barrido 48 CP, `regions`) — local.
- **Vínculo bonÀrea↔OpenFoodFacts** (`off_code`, script + migración) — local, sin ejecutar.
- **Comunidad autónoma → filtro de supers** (F0–F5: `profiles.region` + `regions.ts` + onboarding paso 3) — local.
- Distintas migraciones SQL **sin ejecutar** (ver §3).

> Regla de oro: antes de "seguir" cualquier súper o feature de abajo, comprueba con `git status` /
> `git log` si ya está dentro. La memoria decía "local" pero pudo commitearse después.

---

## 2. Supermercados (espejos de catálogo) — estado

15 espejos + Mercadona en vivo. Un sync por súper en `scripts/sync-*.mjs` (workflows `sync-*.yml`,
cron lunes escalonado). Tras CADA súper nuevo hay que **re-ejecutar `similar_products.sql`** (lleva un
brazo por tabla). Estado al 2026-07-15:

| # | Súper | Backend del sync | Commit | Migración ejecutada | Notas |
|---|-------|------------------|--------|---------------------|-------|
| 1 | Mercadona | API pública en vivo | ✅ | — | Publicado. Multi-almacén (~48 wh). Bilingüe `lang=ca`. |
| 2 | Bonpreu | Navegador headless (WAF) | ✅ | ⚠️ publicación reanudable | Staging bilingüe por Actions; falta desplegar `20260729184317_bonpreu_resumable_publication.sql` junto al script que recupera el cursor. |
| 3 | bonÀrea | API JSON propia (ShoppingBody) | ✅ (col `ean`) | ⚠️ ficha/off pend. | Ficha bilingüe es/ca. `off_code`↔OFF listo pero SIN ejecutar. |
| 4 | Carrefour | fetch SSR `__INITIAL_STATE__` | parcial | ⚠️ regions/offers | Ficha más rica. Multi-zona + ofertas LOCAL. Corre en local (Cloudflare). |
| 5 | Consum | API REST abierta | ✅ | ⚠️ | EAN + marca estructurados. Sin ficha (no la expone). |
| 6 | Dia | SSR Vike `vike_pageContext` | ✅ base | ⚠️ multi-zona local | Ficha es. Multi-zona 48 CP LOCAL. |
| 7 | Sorli | Playwright bootstrap + fetch | ✅ | ⚠️ | Bilingüe es/ca. nutriScore propio vacío 99%. |
| 8 | Eroski | Tapestry (`lib/eroski-tapestry.mjs`) | ✅ `6e72611` | ⚠️ nutrición | es-only, €/kg-L-ud desde el tile, sin EAN; nutrición PDP incremental local. |
| 9 | Caprabo | Tapestry (compartido con Eroski) | ✅ `6e72611` | ⚠️ nutrición | Idem Eroski. |
| 10 | Condis | Empathy.co API JSON abierta | ⚠️ dudoso | ⚠️ | Bilingüe. Sin ficha v1. "Commit en espera" por Ametller → VERIFICAR. |
| 11 | Ametller | SCAPI Salesforce (guest PKCE) | ❌ local | ⚠️ | Bilingüe + ficha + EAN. Logo placeholder. |
| 12 | Aldi | SSR Algolia embebido (`__NEXT_DATA__`) | ❌ local | ⚠️ | es-only, sin EAN. Guardarraíl <800. Logo placeholder. |
| 13 | Hiperdino | Magento 2 GraphQL abierto | ❌ local | ⚠️ | **SOLO Canarias (IGIC)** → filtrar por comunidad. es-only, sin ficha; €/ud local pendiente de backfill. |
| 14 | Alcampo | Ocado, patrón Dia (product-pages) | ❌ local | ⚠️ | es-only CON ficha (EAN/origen/operador). Nacional (no multi-zona). |
| 15 | Plusfresc | API REST ASP.NET (JWT guest) | ❌ local | ⚠️ | **Solo Catalunya (ES-CT)**. Bilingüe + ficha con ALÉRGENOS legibles. |

**Descartados/no viables:** Lidl (sin espejo: ~75% sin precio, IAN≠EAN). Alcampo NO multi-zona
(surtido nacional idéntico). Condis tienda 718 = superconjunto (no multi-tienda).

Cada súper tiene su `scripts/README-*-sync.md`. Los detalles de cada backend y sus gotchas están en
CONTEXTO.md §"Migraciones SQL pendientes" (cada `*_catalog.sql` lleva un párrafo).

---

## 3. Migraciones SQL — ejecutar en Supabase (a mano)

La lista **completa y anotada** está en CONTEXTO.md. Aquí, lo esencial y el ORDEN:

**Ya ejecutada:** `ean_unify.sql` (rename `ean13`→`ean` en las 14 tablas) ✅.

**Bloqueantes de arranque** (el cliente ya `SELECT`ea la columna → la app crashea sin ellas):
`profile_onboarding.sql`, `profile_premium.sql`, `profile_region.sql`, `profile_verified.sql`,
`list_items_store_product_id.sql`, `favorites_store.sql`, `catalog_unaccent_search.sql`,
`mercadona_catalog_ca.sql`.

**Órdenes que importan:**
- `fix_bonpreu_prices.sql` **ANTES** de `catalog_price_changes.sql` (si no, cambios de precio falsos).
- Bonpreu: `20260728182501_bonpreu_sync_staging.sql` → `20260729184317_bonpreu_resumable_publication.sql`; desplegar la segunda junto al sync actualizado, nunca con el script antiguo.
- `profile_premium.sql` → `paywall_gates.sql` → (re)`similar_products.sql`.
- `carrefour_offers.sql` y `carrefour_regions.sql` **ANTES** del próximo sync de Carrefour (el `upsert` las incluye).
- Cada `bonarea/dia/carrefour_product_detail.sql` antes del sync de su súper (pasada de ficha).
- `20260718133958_eroski_caprabo_nutrition.sql` y después
  `20260719102703_eroski_caprabo_product_detail.sql` antes de los próximos syncs
  de Eroski/Caprabo; añaden la ficha nutricional y los campos `ingredients`,
  `conservation` y `manufacturer`.
- `20260718183152_catalog_browse_indexes.sql` añade índices parciales para la
  navegación alfabética keyset de todos los catálogos. Es aditiva y no bloquea
  el arranque, pero debe ejecutarse para obtener toda la mejora de rendimiento.
- Migración de cada súper nuevo (`ametller/aldi/hiperdino/alcampo/plusfresc/condis/eroski/caprabo_catalog.sql`)
  → luego **re-ejecutar `similar_products.sql`**.

**Redeploys de Edge Functions asociados:** tras `push_tokens_lang.sql` y `notifications_inbox.sql` →
`supabase functions deploy send-push`.

**Multi-zona / OFF (local, sin ejecutar):** `dia_regions.sql`, `carrefour_regions.sql`, `bonarea_off_code.sql`.

---

## 4. Multi-zona por comunidad / código postal

- **Dia:** `sync-dia.mjs` barre 48 zonas (check-service + save-shipping-address por CP). `regions` =
  disponibilidad por CCAA (`null` = nacional = en todas las CCAA barridas). Falta `dia_regions.sql` + relanzar. LOCAL.
- **Carrefour:** regionaliza catálogo Y precio por almacén (`werks_id`, 48 en España; sin cookie = Madrid
  COL PINAR). El sync barre **1 capital por comunidad** (~18 crawls, ~2 h) fijando la cookie `salepoint`.
  Columnas base = Madrid (la app no cambia hasta implementar el filtro). Falta `carrefour_regions.sql` +
  1er run (subir el `-ExecutionTimeLimit` de la tarea de Windows a ~4 h). LOCAL.
- **Filtro por comunidad (transversal):** `profiles.region` + `src/constants/regions.ts` + código postal
  integrado en el paso 1 + gate/filtro de catálogo. Necesario para no enseñar cadenas regionales fuera
  de su zona. F0–F5 en local, typecheck verde, sin validar en device. Ver
  `COMUNIDAD-AUTONOMA.md`. **Ejecutar `profile_region.sql` antes de arrancar.**
- **Alcampo/Condis/Mercadona:** NO multi-zona (Alcampo surtido nacional; Condis 718 = superconjunto;
  Mercadona ya multi-almacén por su cuenta).

---

## 5. Nutrición / OpenFoodFacts (estrategia de datos)

- **OFF API** probada 2026-07-14/15: lookup por EAN sin API key (con User-Agent identificativo). v3 sin
  buscador (v2 `search` = única búsqueda estructurada). Tope anónimo 1.000/consulta → multi-ventana
  `sort_by`. 7,5 req/min o llueven 503. En marcas con carnicería ~70% son códigos de bandeja → auto-vincular
  solo EAN `84…`.
- **Cobertura con nutrición YA** (2026-07-15): Carrefour 8,6k · Dia 3,9k · Ametller 2,2k · bonÀrea ~80% al
  correr syncs · Consum sin ficha PERO 9,5k EAN→OFF directo · Sorli nutriScore propio vacío 99%.
- **Estrategia:** OFF-oficial > calculado-estimado > visión. (Health score por visión: solo Mercadona,
  Plus; backend hecho, falta UI+run — ver memoria `health-score-nutricional`.)
- **Vínculo bonÀrea↔OFF:** matcher token-set (231 ALTA / 242 revisar / resto fresco sin match). Usa
  `off_code` y **NO** `ean` (el sync pisa `ean` cada lunes + semántica multipack). Script + `bonarea_off_code.sql`
  LISTOS pero SIN ejecutar/relanzar. Matcher reutilizable para otros espejos sin EAN.

---

## 6. Otras features transversales en vuelo

- **Liquid Glass iOS** (solo iOS 26+, Android intacto): F0–F3 hechas (barra flotante, campana+panel,
  Cambios de precios, Catálogo). Typecheck verde, **sin validar en device**. Validación por canal `preview`
  (`eas update --channel preview --platform ios`). **PROHIBIDO glass a production hasta validar F1–F5.**
  Ver `LIQUID-GLASS.md`.
- **Android / Google Play** (`ANDROID.md`): closed testing corriendo desde ~2026-07-08 (12+ testers). Queda:
  pegar huella SHA-256 en `assetlinks.json`, push web, data safety, content rating, ficha es/ca, cuenta de
  prueba. ⚠️ iOS y Android comparten canal `production` → OTA a production es peligroso (el repo lleva glass
  sin validar).
- **Notificaciones:** bandeja server-side (`notifications` + `send-push` la rellena) e idioma por dispositivo
  (`push_tokens.lang`, es/ca). Faltan `notifications_inbox.sql` + `push_tokens_lang.sql` + redeploy `send-push`.
- **Sign in with Apple:** flujo nativo iOS funcionando. Revocación de token al borrar cuenta montada, **pendiente
  `.p8` + secrets + deploy**. (Nota histórica: el proyecto era SDK 54 antes de
  la migración local a SDK 57 del 2026-09-05.)
- **Insignia Plus** (dorada): `profiles.verified` es un reflejo público protegido
  de `premium_until` + `VerifiedBadge`. Backfill/trigger desplegados en remoto.
  `revenuecat-webhook` aún no existe en producción: antes de desplegarlo hay que
  configurar `RC_WEBHOOK_TOKEN`; el código local ya sincroniza ambos campos.
- **Ranking de búsqueda:** Nivel 1 (cliente) hecho. BUG conocido: las 6 `search*` con `limit 50` SIN `order` →
  50 filas arbitrarias. Nivel 2 (RPC ranking en servidor + offset) especificado en
  `BUSQUEDA-RANKING-SERVIDOR.txt`, pendiente de implementar.
- **Comparativa entre supers** y **Monetización QuéFalta Plus**: ambas DESACTIVADAS por flags
  (`PRICE_COMPARISON_ENABLED` / `PAYWALL_ENABLED` en `src/constants/limits.ts`), código intacto. Ver
  `COMPARATIVA.md` / `MONETIZACION.md`.
- **Seguridad:** fix crítico (profiles legible por anon) + secure-store para tokens (requiere build nuevo) +
  4 SQL pendientes + redeploy webhook. Ver `PRIVACIDAD-SEGURIDAD.md` y memoria `security-hardening`.

---

## 7. Dónde vivía todo esto (para el humano)

El conocimiento acumulado estaba en la memoria de Claude Code, en
`~/.claude/projects/c--Users-ruben-OneDrive-Escritorio-MercaApp/memory/` (índice `MEMORY.md` + ~40 ficheros
`.md`, uno por tema). **Codex no lee esa carpeta.** Este HANDOFF.md + CONTEXTO.md son el volcado para Codex.
Si en el futuro quieres el detalle fino de un tema (p. ej. el truco exacto de la cookie de Carrefour, o el
mapa de APIs de Lidl), está en esos ficheros de memoria.

Repos ecosistema: app `rruizosm/QueFalta` · web `rruizosm/QueFalta-Web` (carpeta hermana `quefalta-web/`) ·
dashboard privado `rruizosm/QueFalta-Datos` (`QueFaltaDatos/`, Astro SSR + service_role).
