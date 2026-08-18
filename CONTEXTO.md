# QuéFalta — Contexto del proyecto

> Documento de contexto para agentes (Claude Code) y nuevos colaboradores.
> Resume identidad, arquitectura, decisiones clave y estado. Mantener al día.

## Sync Mercadona: guardarraíl anti-bloqueo (2026-08-18)

- El sync semanal separa el catálogo del enriquecimiento nutricional: la tabla
  nutricional de Mercadona procede de la foto de etiqueta y de
  `extract-mercadona-nutrition.mjs`, no de la ficha API. Su ausencia no puede
  reencolar todo el catálogo en el sync principal.
- La pasada post-catálogo pide como máximo 300 EAN nuevos con concurrencia 2. El
  backfill intensivo, si hiciera falta, se ejecuta de forma reanudable con
  `scripts/backfill-mercadona-ean.mjs`.
- Si fallan más del 3% de subcategorías, se aborta antes de escribir o ejecutar
  `markStale`; así un 403/rate limit no despublica catálogo válido.

## Comparador: filtro estricto de identidad semántica (2026-08-17)

- Los tests de dispositivo detectaron que el comparador híbrido v4 podía
  aceptar productos cercanos semánticamente pero no comparables: por ejemplo,
  un refresco de té con limón frente a una gaseosa de limón. Unidad, cantidad,
  atributos y score no bastan para preservar la identidad principal.
- La migración
  `20260817124758_comparator_semantic_identity_guard.sql` añade familias
  deterministas y variantes explícitas como filtros duros, y expone
  `catalog_cheaper_products_v5`. El filtro se aplica **antes** del top-2 barato
  por tienda; GTIN global idéntico y revisión humana aprobada prevalecen.
- El cliente ya llama a v5. La migración está validada contra producción dentro
  de una transacción con `ROLLBACK`, pero **no está desplegada**. Debe aplicarse
  antes de distribuir este cliente. Verificador reproducible:
  `supabase/ops/verify_comparator_semantic_identity_guard.sql`.
- La misma migración normaliza `burger`, `burguer` y `hamburguesa` para el
  cálculo léxico. Es una equivalencia de términos, no una familia genérica:
  los filtros de identidad siguen evitando que pan, salsa, queso y carne se
  comparen entre sí solo por compartir esa palabra.

## Arranque estable y caché de pestañas (2026-08-17)

- Perfil, carrito activo y snapshots de Inicio/Carrito/Grupos se hidratan desde
  AsyncStorage con claves por usuario antes de entregar la navegación autenticada.
  Las pantallas pintan el snapshot y revalidan contra Supabase en segundo plano
  (stale-while-revalidate), sin borrar contenido ni sustituirlo por un loader.
- Solo un perfil cacheado con `onboarded_at` y `region` ya resueltos puede
  acelerar el gate. Un onboarding incompleto siempre espera el perfil remoto,
  para no mostrar pasos antiguos completados desde otro dispositivo.
- Inicio y Carrito comparten el snapshot de `list_items`; las lecturas simultáneas
  de grupos se agrupan en una única petición en vuelo por usuario. La checklist
  de perfil espera a conocer los grupos y no aparece con un conteo provisional.
- La caché vive en `src/lib/startupCache.ts`. Todo recurso nuevo debe mantener la
  regla por usuario y seguir revalidándose: nunca usar el snapshot como fuente
  definitiva de permisos o pertenencia a grupos.
- Las dos poses raster del primer paso se sirven a 512 px de ancho (su máximo
  visible es 150 pt): mantienen densidad suficiente para pantallas 3x y bajan
  juntas de 2,81 MB a unos 568 KB en el bundle.

## Persiana animada en el primer paso del onboarding (2026-08-16)

- El paso inicial de `@usuario` y código postal es una persiana azul a pantalla
  completa (`#2f6cb5`) que baja desde la parte superior y lleva a la mascota
  agarrada al borde inferior. No muestra la barra de progreso común: campos,
  selección de zona y botón Continuar viven dentro de la propia persiana.
- La pose vive en `assets/mascot/berenjena-persiana.png` y la composición en
  `src/screens/onboarding/OnboardingShutter.tsx`. La animación se desactiva al
  activar Reducir movimiento y el formulario aparece después de la bajada.
- Al terminar la bajada aparece desde arriba una segunda pose, guardada en
  `assets/mascot/berenjena-sentada-ok.png`: cae con rebote, se sienta sobre
  «¡Empezamos!» y mantiene el pulgar arriba. Solo entonces recibe el foco el
  campo de usuario.

## Portada de autenticación (2026-08-16)

- Login usa una composición vertical inspirada en la cesta: cabecera en el
  color de acento con los logos locales de supermercados cayendo hasta ocupar
  el espacio, transición SVG con el máximo centrado hacia el contenido y marca
  dentro de esa curva, antes de la propuesta de valor y de Apple, Google y
  correo. Los tres flujos de autenticación mantienen su lógica.
- Las tarjetas blancas de los logos entran una sola vez y después flotan con
  suavidad sobre pequeñas nubes; las animaciones usan el driver nativo, precargan
  recursos locales y quedan desactivadas cuando el sistema solicita Reducir
  movimiento. La pantalla sigue siendo desplazable y compatible con texto grande.

## Identidad pública basada en @usuario (2026-08-15)

- El onboarding ya no solicita idioma ni nombre visible: comienza con un único
  paso de `@usuario` + código postal y consta de cinco pasos con progreso.
- Inicio muestra `QuéFalta` como título fijo. La tarjeta de Perfil muestra solo
  el `@usuario` junto al botón Editar; el nombre y el correo no aparecen allí.
  Editar perfil conserva el correo de solo lectura, pero ya no permite editar ni
  muestra el nombre.
- La pantalla de miembros de un grupo identifica a cada persona por `@usuario`.
  El cliente sigue leyendo `profiles.name` como dato legacy y fallback para
  cuentas antiguas sin username; no se ha eliminado la columna de base de datos.

## Hipercor (pendiente de migrar y primer sync, 2026-08-15)

- Añadido el espejo de catálogo público de **Hipercor**: migración
  `hipercor_catalog.sql`, `scripts/sync-hipercor.mjs` y workflow diario
  `sync-hipercor.yml`. Recorre las diez raíces públicas y todas sus páginas SSR
  con Google Chrome; incluye precio, precio por unidad, disponibilidad, novedades
  y promociones explícitas, y sólo despublica después del guardarraíl de 10.000
  productos.
- Akamai bloquea Chromium de Playwright en GitHub Actions; tanto la POC como el
  sync usan el canal `PW_CHANNEL=chrome`, ya validado en el runner. El script
  no inicia sesión ni usa dirección/cesta: guarda el surtido del centro público
  observado en `raw.centerId`. No presentar estos precios como personalizados
  por código postal hasta implementar la normalización por centro.
- Antes del primer sync real: ejecutar `hipercor_catalog.sql` en Supabase. La
  integración en el cliente y la comparativa se incorporarán después de validar
  ese primer catálogo completo.

## Gadisline (pendiente de migrar y primer sync, 2026-08-14)

## Estado de sincronización de catálogos (pendiente de migrar, 2026-08-14)

- `20260814170000_catalog_sync_status.sql` crea el registro común de la última
  sincronización correcta de cada supermercado. La app lo muestra en Perfil →
  Soporte → Actualización de catálogos.
- Los scripts solo anotan el estado después de terminar de escribir catálogo y
  categorías; `DRY_RUN` y ejecuciones fallidas no modifican la fecha. Esto se
  aplica también a los runners locales de Carrefour, Alcampo, Eroski, Caprabo y
  Gadis (si se ejecuta localmente), porque escriben directamente en Supabase.

- Añadido el 16º espejo **Gadis**: `gadis_catalog.sql`, `scripts/sync-gadis.mjs`
  y workflow diario `sync-gadis.yml`. El espejo conserva productos, categorías,
  ofertas explícitas sin cupón, novedad explícita y el histórico de precio.
- Gadisline resuelve surtido/precio por código postal. La primera versión usa la
  tienda pública por defecto; no afirmar precios locales hasta normalizar por
  tienda/CP y validar el primer run real.

## Estadísticas personales de compra (2026-08-11)

- Perfil → Cuenta incluye **Estadísticas**, una función de QuéFalta Plus. Ordena
  los supermercados, categorías y productos de las compras finalizadas por el
  propio usuario, por unidades compradas.
- La migración `20260811203243_purchase_statistics.sql` añade `store_key` al
  historial nuevo y el RPC `my_purchase_statistics()`. El RPC conserva RLS,
  solo usa `completed_by = auth.uid()` y deduce la tienda desde la imagen para
  compras históricas sin clave. Debe desplegarse antes de publicar la pantalla.

## Filtros visuales de Novedades (2026-08-11)

- Al abrir un producto desde Novedades, su ficha muestra la etiqueta localizada
  `Novedad`/`Novetat` dentro de la imagen principal, en la esquina inferior
  derecha. La misma ficha abierta desde otras pantallas no muestra la etiqueta.
- La hoja de filtros de Novedades usa la misma composición visual del paywall
  QuéFalta Plus: fondo oscurecido, modal inferior redondeado, cabecera destacada
  y CTA principal. El resto de pantallas que reutilizan `ProductFilterSheet`
  conserva su aspecto anterior.
- La franja superior de Novedades es ahora compacta (sin texto), funciona como
  asa de arrastre para cerrar deslizando hacia abajo y el CTA no usa el borde
  oscuro heredado de `HardShadow`.
- Mantiene el orden por precio del envase y añade un orden independiente por
  precio unitario (`pricePerUnit`), con los productos sin €/kg, €/l o €/ud al
  final en ambos sentidos. Elegir uno de los dos órdenes desactiva el otro.
- Las categorías muestran los emojis de `getSubcategoryEmoji`, el mismo mapa
  visual utilizado por las subcategorías del catálogo.

## Orden del catálogo por precio por unidad (2026-08-11)

- En la pestaña **Productos**, el buscador queda reducido a una lupa mientras no
  tiene foco y recupera el campo completo al tocarla. El hueco mantiene visibles
  los controles existentes de orden por precio de envase, un nuevo par de orden
  ascendente/descendente por `price_per_unit` y el selector lista/cuadrícula; al
  expandir la búsqueda se oculta temporalmente este último.
- La navegación pagina por `(price_per_unit, id)`, conserva los empates y deja al
  final los productos sin precio por unidad en ambos sentidos. La migración
  `20260811112706_catalog_price_per_unit_browse_indexes.sql` añade los índices
  parciales ascendente y descendente necesarios; sigue pendiente de desplegar.

## Inicio de sesión por enlace mágico (2026-08-03)

- `LoginScreen` ofrece correo electrónico además de Google y Apple. Envía un
  enlace de un solo uso con `supabase.auth.signInWithOtp`; las cuentas nuevas se
  crean al confirmar el correo y Supabase enlaza automáticamente identidades que
  compartan el mismo email verificado.
- En nativo vuelve por `quefalta://auth/callback`. `AuthContext` captura tanto el
  arranque en frío como la app abierta y acepta callback PKCE (`code`) o tokens
  del flujo implícito, sin canjear dos veces el mismo enlace. Web conserva el
  retorno al origen y `detectSessionInUrl`.
- Para producción, `quefalta://auth/callback` debe figurar en Supabase Auth > URL
  Configuration. Además hace falta SMTP propio: el SMTP por defecto de Supabase
  solo entrega a miembros autorizados del proyecto y no sirve para usuarios reales.

## Catálogo combinado y filtros por supermercado (2026-07-27)

- Con **Todos** activo, la segunda pestaña del Catálogo es **Comparador** en
  lugar de Categorías. Es una comparación manual: las tarjetas pasan a modo
  selección, una barra inferior habilita **Comparar** desde dos productos y un
  panel descendente llega hasta el límite del navegador inferior y muestra
  producto, supermercado, formato, precio y precio por unidad; la opción con
  menor precio de envase se marca en dorado. No usa
  el RPC de similitud ni reactiva `PRICE_COMPARISON_ENABLED`.

- El selector de supermercado de Catálogo, Ofertas, Novedades y Cambios de
  precios incluye **Todos** como fila
  compacta a ancho completo sobre la rejilla. Solo combina los supermercados
  elegidos en el perfil y disponibles en la región del usuario.
- Catálogo mezcla los cursores por precio y entrega páginas globales de 50
  productos; no concatena 50 resultados por supermercado. La búsqueda conjunta
  conserva también un máximo global de 50.
- Si una tabla sin índice de precio agota el tiempo de consulta, Catálogo
  recupera esa página alfabéticamente y mantiene disponible la mezcla de hasta
  50 productos en lugar de mostrar un error global.
- La migración `20260727090948_catalog_price_browse_indexes.sql` está aplicada
  en producción: añade índices parciales `(unit_price, id)` para los 15
  catálogos publicados y evita que la carga inicial de **Todos** espere al
  timeout de la API.
- Con **Todos** activo, las tarjetas de lista y cuadrícula muestran el logo
  legible del supermercado en la esquina superior izquierda; se aplica a
  Catálogo, Ofertas, Novedades y Cambios de precios.
- En la hoja de filtros, Supermercado usa esos logos y las facetas agrupadas
  de Categoría y Tipo de oferta los muestran en cada bloque. Al tocar un bloque,
  este se expande en línea conservando su borde, fondo y color.
- Con **Todos** en Categorías se muestran primero los nombres de los
  supermercados y, al tocar uno, se abre su árbol habitual.
- En Ofertas, el filtro de supermercado es multiselección. Categoría y Tipo de
  oferta se abren primero por supermercado y después muestran las facetas de esa
  tienda; la paginación keyset sigue recorriendo resultados hasta completar la
  página combinada.
- En Novedades, **Todos** carga hasta 50 novedades por supermercado para sus
  facetas locales y muestra como máximo 50 resultados combinados; su filtro de
  categoría se navega igualmente por supermercado. En Cambios de precios, las
  dos pestañas combinan el cambio porcentual de todas las tiendas y muestran
  los 50 cambios más relevantes de la dirección elegida.

## Rendimiento del catálogo (2026-07-18)

- La pestaña **Productos** conserva en memoria la primera página por
  `súper + idioma + comunidad + código postal` durante 5 minutos. Al volver a
  una tienda muestra la copia inmediatamente; si está caducada usa
  stale-while-revalidate y la renueva sin ocultar la lista ni mostrar el spinner
  inicial.
- Los árboles de categorías no se solicitan al cambiar de súper en Productos:
  se cargan únicamente al abrir la pestaña **Categorías**. Las peticiones de
  navegación, búsqueda y categorías usan `AbortController`, de modo que cambiar
  de tienda cancela el trabajo anterior y evita respuestas fuera de orden.
- Los `SELECT` de navegación/búsqueda piden solo los campos de las tarjetas. En
  particular, Mercadona ya no descarga `raw` para cada fila; las columnas de
  detalle y promoción quedan reservadas para ficha u Ofertas.
- `20260718183152_catalog_browse_indexes.sql` crea índices B-tree parciales
  `(display_name_norm, id) WHERE published = true` para todos los espejos y su
  variante catalana donde existe. Coinciden con el filtro y el orden de la
  paginación keyset. La migración es aditiva, pero sigue pendiente de ejecutar
  manualmente en producción.

## Índice alimentario (2026-07-16)

- La ficha de Mercadona consulta Open Food Facts por EAN y muestra un **Índice
  alimentario 0-100**. No requiere migración: se calcula en cliente con los
  `match` oficiales de los atributos `nutriscore`, `nova` y `ecoscore`, usando
  solo atributos con `status='known'`.
- Todas las fichas con EAN consultan primero Open Food Facts. Si devuelve un
  Nutri-Score aplicable (A–E), usan sus datos; si no hay coincidencia o el
  Nutri-Score no aplica, calculan el índice con la tabla nutricional publicada en
  Supabase para que el desglose de puntos se refiera a sus valores. Carrefour y
  Alcampo seleccionan su EAN solo en el detalle; Ametller ya lo aporta en la ficha
  estructurada.
- Plusfresc reutiliza también el bloque desplegable, pero como no ofrece EAN usa
  directamente `nutrition` en castellano y `nutrition_ca` en catalán, calculándolo
  en cliente con el mismo parser nutricional de catálogo.
- Eroski y Caprabo guardan también la tabla nutricional de su ficha HTML en
  `nutrition`, normalizada por 100 g/ml para reutilizar `parseCatalogNutrition`.
  El sync compartido la completa incrementalmente y sus modales reutilizan el
  mismo bloque visual del índice, sin consulta a Open Food Facts porque no hay EAN.
- Pesos según cobertura: nutrición sola 100%; nutrición+procesamiento 70/30;
  nutrición+sostenibilidad 80/20; los tres bloques 60/25/15. Sin nutrición no se
  publica índice. La UI muestra los pesos y la aportación de cada bloque.
- El bloque desplegable del índice alimentario enseña puntos positivos y negativos en
  escala 1-10 (10 siempre significa mejor), derivados de los componentes
  oficiales del Nutri-Score 2023, además de los valores por 100 g/ml.
- La respuesta de Open Food Facts se cachea por EAN durante la sesión para que
  el prefetch del detalle y la apertura del bloque no dupliquen la petición.

**Correccion 2026-07-17:** el desglose de componentes muestra los puntos
originales de Nutri-Score y su maximo por componente; no se convierte a una
escala propia de 1 a 10.

**Procesados y aditivos 2026-07-17:** el bloque desplegable muestra una seccion de
procesados cuando Open Food Facts clasifica el producto en NOVA 4, y una
seccion de aditivos con sus codigos y, cuando se conoce, su nombre.

El bloque de procesamiento entra siempre en el indice cuando existe NOVA:
NOVA 1 = 100, NOVA 2 = 75, NOVA 3 = 50 y NOVA 4 = 0; se aplica el peso de
cobertura correspondiente.

**Detalle de cambios de precio 2026-07-17:** todas las fichas consultan el
ultimo cambio semanal: muestran el precio anterior tachado y una etiqueta roja
de aumento o verde de bajada. Ejecutar `catalog_price_changes_all_stores.sql`
para que los espejos fuera de las seis tablas originales guarden el historial.
En la pantalla Cambios de precios, la cuadricula muestra anterior tachado y
nuevo precio verde/rojo sin porcentaje; la lista conserva el porcentaje.

**Sync Alcampo 2026-07-18:** el upsert de productos usa lotes de 50 con cuatro
reintentos y backoff. Los lotes de 500, por el `raw` jsonb, la ficha, los índices
trigram y el trigger de precios, podían superar el `statement_timeout` de
PostgREST (57014). El `timeout-minutes` de GitHub Actions es independiente.

**Categorías Alcampo 2026-07-19:** el árbol de Ocado repite las etiquetas de
alimentación dentro de Folletos, Club, campañas y ramas regionales. El sync
acepta únicamente las diez raíces de primer nivel —las de mayor número de
subcategorías— y sus hijos directos; no se deben volver a recorrer coincidencias
por nombre en todo el árbol. Se eliminaron de producción 162 categorías y 817
productos de esas ramas secundarias; quedan 120 categorías y 15.024 productos
del surtido nacional canónico.

## Identidad

## Actualizacion CP: Consum y Plusfresc (2026-07-16)

- Los feeds de Home **Novedades**, **Ofertas** y **Cambios de precios** también
  reciben `region`/`postalCode`: filtran la disponibilidad por CCAA o centro y
  muestran el precio regional cuando existe. Consum y Plusfresc guardan además
  el precio efectivo por zona/centro en `catalog_location_prices` y cada cambio
  en `catalog_location_price_changes`; la pantalla consulta ese histórico para
  el CP activo. Ejecutar `catalog_location_price_history.sql` antes del sync.

- `supabase/migrations/consum_regions.sql` añade disponibilidad por CCAA y
  `regional_prices` por `X-TOL-ZONE` a Consum. Ejecutarla antes del primer sync
  multi-zona; se barren València, Barcelona, Murcia, Albacete y Almería.
- `plusfresc_catalog.sql` incorpora `centers` y `center_prices`. El sync barre
  los ocho centros y el cliente resuelve el CP exacto contra `zones/zipcodes`
  (mapa en `src/constants/retailerZones.ts`). Centros no atendidos conservan el
  catálogo de referencia 12 para no ocultar productos incorrectamente.
- `consum_offers.sql` añade la señal de oferta explícita de Consum: el sync solo
  incluye en Ofertas productos con `OFFER_PRICE` junto a su `PRICE` habitual,
  y los filtra por la zona resuelta desde el CP. Una bajada semanal sin esa
  señal nunca se muestra como oferta.
- `plusfresc_offers.sql` incorpora las promociones `Oferta2` por centro. El
  precio normal no se altera en el catálogo: Ofertas usa `new_value_cents` y su
  fecha de fin para el CP activo, también para promociones de lote.
- `hiperdino_offers.sql` guarda el precio regular tachado de Magento. Solo se
  muestra como oferta si es estrictamente mayor que el precio final actual; no
  usa cambios entre syncs como señal de promoción.
- `aldi_offers.sql` normaliza el precio tachado, la etiqueta y la vigencia de
  Algolia. Ofertas solo incluye filas con precio tachado superior y campaña no
  caducada, nunca simples variaciones semanales.
- `20260723204711_dia_offers.sql` normaliza las dos señales del PLP de DIA:
  descuentos directos CLUB (precio tachado + porcentaje) y promociones de lote
  (`3x2`, `2ª unidad`, precio por varias unidades). El sync acumula además la
  oferta y su precio por CCAA; catálogo, Ofertas y ficha muestran la misma
  etiqueta regional.
- `20260723212240_sorli_offers.sql` normaliza la señal explícita de Sorliclic:
  tipo bilingüe, condiciones de promociones complejas, precio anterior y
  vigencia. La misma señal está en el catálogo general y en `/es/ofertas`, por
  lo que no se repite el crawl.

- **Nombre:** QuéFalta (antes "MercaApp"/"LaCompra"). La carpeta del repo sigue llamándose `MercaAppMobile`.
- **Qué es:** app móvil para organizar la compra **en grupo** (lista compartida en tiempo real, carrito por grupos) con catálogo real de **Mercadona**.
- **Stack app:** Expo **SDK 54**, React Native 0.81.5, TypeScript. Backend **Supabase** (auth + Postgres + storage + edge functions). Catálogo: **API pública de Mercadona** (`https://tienda.mercadona.es/api`).
- **iOS:** bundle `com.quefalta.app`, scheme `quefalta`, Apple Team ID `LX4BLQDZS4`, EAS projectId `cdae19f5-47a5-4a4c-9f94-2befcada0885`.
- **Dominio:** `quefalta.es` (web Astro, repo aparte).
- **Repos:** app → `github.com/rruizosm/QueFalta` · web → `github.com/rruizosm/QueFalta-Web` (carpeta hermana `quefalta-web/`, NO está en este repo).

## ⚠️ Imprescindible para arrancar en una máquina nueva
`.env.local` está **gitignored** (no viaja con el repo). Sin él, Supabase no funciona. Crear en la raíz de `MercaAppMobile`:
```
EXPO_PUBLIC_SUPABASE_URL=https://auth.quefalta.es
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key del dashboard de Supabase>
```
La anon key se copia de Supabase → Project Settings → API. (Es pública/segura por RLS, pero no se commitea.)

**`google-services.json` también está gitignored (2026-07-10):** el repo es público y GitHub secret scanning avisó de la API key de Firebase (commit `1a6032c`; la clave sigue en ese historial — mitigación real = restringirla/rotarla en Google Cloud Console). Los builds de EAS la reciben vía la **file env var `GOOGLE_SERVICES_JSON`** (subida a los 3 entornos con `eas env:create --type file --visibility secret`); `app.config.js` (envoltorio dinámico sobre app.json, NO meter ahí más config) resuelve `android.googleServicesFile` = esa env var con fallback a `./google-services.json` en local. En máquina nueva: descargar el fichero de Firebase Console → raíz de `MercaAppMobile` (solo hace falta para `expo run:android`/prebuild local; los builds EAS no lo necesitan en disco).

**Custom domain (2026-06-21):** la API de Supabase se sirve por `https://auth.quefalta.es` (add-on Custom Domain). Así el popup de iOS al iniciar sesión muestra `auth.quefalta.es` en vez del subdominio `…supabase.co`. El subdominio original `https://gkffvigcnsesbaihycay.supabase.co` sigue funcionando (fallback de los syncs). El callback OAuth de Google `https://auth.quefalta.es/auth/v1/callback` está dado de alta en Google Cloud Console. La anon key NO cambia.

## Cómo ejecutar
- **Dev rápido (Expo Go):** `npx expo start` (en Windows con varios adaptadores de red, fijar IP de Wi-Fi: `REACT_NATIVE_PACKAGER_HOSTNAME=<ip>` y usar `--offline` si el CLI crashea con error `body`).
- **Mac / simulador iOS:** `npx expo run:ios` (hace prebuild + pods + build + Metro). Para iPhone USB: `npx expo run:ios --device`.
- **Dev build (EAS):** perfil `development` en `eas.json` (`developmentClient: true`). Expo Go NO soporta push notifications ni Universal Links → para eso hace falta dev build.

## Estructura
- `src/screens/` — Home, Catalog, SubCategory, Products, List, Groups, GroupDetail, Login, Profile, EditProfile, PrivacySecurity, DefaultGroup, Appearance (color de la app). `src/screens/onboarding/` — asistente de bienvenida (Welcome, Username, Stores, Avatar, Friends, Group, Done + `OnboardingNavigator`/`OnboardingLayout`). Ver `ONBOARDING.md`.
- `src/context/` — `AuthContext` (sesión), `ProfileContext` (perfil cacheado), `CartContext` (carrito activo + grupo por defecto), `ThemeContext` (accent elegido + `useThemedStyles`), `CoachMarkContext` (demo/tour sobre la app), `AppContext` (placeholder).
- `src/api/` — `profile`, `groups`, `lists`, `mercadona`, `account`.
- `src/lib/` — `supabase` (cliente), `notifications` (locales).
- `src/navigation/index.tsx` — Bottom Tabs + stacks; maneja deep links de invitación.
- `supabase/functions/delete-account/` — Edge Function de borrado de cuenta.

## Decisiones clave y gotchas (NO romper)
- **Login Google OAuth = PKCE.** `src/lib/supabase.ts` usa `flowType: 'pkce'`. En `AuthContext` (nativo): tras `WebBrowser.openAuthSessionAsync`, **extraer el `code` de la URL** (`Linking.parse(url).queryParams.code`) y pasar SOLO el code a `exchangeCodeForSession`. Pasar la URL entera da `invalid flow state`. La redirect URL del build será `quefalta://auth/callback` → debe estar en Supabase → Auth → URL Configuration (ya hay comodines `exp://**`, `exp://*.exp.direct/**`).
- **ProfileContext** carga el perfil UNA vez al haber sesión → evita el "flash" de campos vacíos al editar. Al guardar, `applyProfile(patch)` actualiza la caché.
- **Estado por-dispositivo en AsyncStorage = SIEMPRE por usuario** (`${KEY}:${userId}`), NUNCA con clave global: si no, se filtra entre cuentas del mismo móvil. Ya pasó (bug 2026-06-16): `CartContext` guardaba `activeCart`/`defaultGroup` con clave global → un usuario nuevo heredaba el carrito/grupo por defecto del anterior. Arreglado con claves por-usuario + limpieza de las globales heredadas + validación del carrito/grupo contra `fetchMyGroups` (descarta grupo borrado o del que te saliste). Mismo patrón en `@coachmarks_seen_v1` y `@checklist_dismissed_v1`.
- **Invitaciones por enlace:** `getInviteLink` devuelve `https://quefalta.es/join/{id}` (Universal Link). La recepción está en `navigation/index.tsx` (`parseInviteUrl` + listener de `Linking` → `joinGroup` → navega). `app.json` tiene `ios.associatedDomains: ["applinks:quefalta.es"]`. El fichero AASA vive en el repo web (`quefalta-web/public/.well-known/apple-app-site-association`, appID `LX4BLQDZS4.com.quefalta.app`, paths `/join/*`). Universal Links solo funcionan en build real + web desplegada.
- **Notificaciones:** Fase 1 (locales) hecha (`src/lib/notifications.ts`, toggle en ProfileScreen). Fase 2 (push) pendiente: requiere dev build + tabla `push_tokens` + Edge Function de envío. Ver `NOTIFICACIONES.md`.
- **Privacidad y seguridad:** `signOut('global')`, columna `discoverable` en profiles (el toggle se guarda pero aún no hay búsqueda por @usuario que lo aplique), y "Eliminar cuenta" vía Edge Function `delete-account` (hay que desplegarla: `supabase functions deploy delete-account`). Ver `PRIVACIDAD-SEGURIDAD.md`.
- **Imágenes de producto:** `list_items.image_url` se guarda al añadir (de `thumbnail` de Mercadona). `ProductDetailModal` consulta `GET /products/{id}/` y limpia el HTML que devuelve la API.
- **Tipos:** existe `src/types.ts` Y `src/types/index.ts`; el import `'../types'` resuelve a `types.ts`. Producto de API = `MercadonaProduct` (no `Product`).
- **Tema (color de la app):** Perfil → Apariencia permite elegir el accent (`ACCENT_OPTIONS` en `constants/colors.ts`; persistido en AsyncStorage `@accent_color`). `colors.accent/accentLight/accentMid` son **getters** sobre un valor mutable (`applyAccent`). Los `StyleSheet.create` que usan accent NO pueden ser estáticos: se definen como fábrica `const themedStyles = () => StyleSheet.create({...})` y se consumen con `const styles = useThemedStyles(themedStyles)` (de `ThemeContext`), que los recrea al cambiar el color. Si añades una pantalla/componente nuevo que use `colors.accent*` en su StyleSheet, sigue ese patrón; si solo lo usa inline en JSX basta con que el padre re-renderice (no hay React.memo en el código).

## Migraciones SQL pendientes en Supabase (ejecutar a mano)
- ⚠️ **`profiles`: columna `onboarded_at timestamptz`** (`supabase/migrations/profile_onboarding.sql`). IMPRESCINDIBLE antes de arrancar tras el onboarding: `fetchProfile` ya la selecciona y falla si no existe (igual que premium_until). NULL = el usuario ve el asistente de bienvenida. SIN backfill (todos lo ven una vez). Ver `ONBOARDING.md`.
- ⚠️ **`profiles`: columna `premium_until timestamptz` + trigger de protección** (`supabase/migrations/profile_premium.sql`). IMPRESCINDIBLE antes de arrancar la app: `fetchProfile` ya selecciona la columna y falla si no existe. Ver `MONETIZACION.md`.
- **Gates del paywall en servidor** (`supabase/migrations/paywall_gates.sql`): `paywall_enabled()` (hoy false), `is_premium()`, trigger de límite de grupos. Ejecutar DESPUÉS de profile_premium.sql y ANTES de re-ejecutar similar_products.sql (el RPC, ya con columna `locked`, usa esas funciones).
- `profiles`: columnas `username text unique`, `avatar_url text`, `discoverable boolean not null default true`.
- `profiles`: columna `catalog_stores text[]` (preferencia "Supermercados del catálogo"; NULL/[] = todos). En `supabase/migrations/profile_catalog_stores.sql`.
- Bucket `avatars` (público) + policies de subida/lectura. Path de avatar: `{userId}/avatar.{ext}`.
- `list_items`: columna `image_url text`.
- Edge Function `delete-account` desplegada.
- (Futuro Fase 2) tabla `push_tokens`.
- **`group_members` INSERT policy** `with check (user_id = auth.uid())` — IMPRESCINDIBLE para que las invitaciones por enlace funcionen (si falta, `joinGroup` da 42501 y el grupo no carga). Está en `supabase/policies/group_join.sql`.
- **Modelo de admin de grupo** (`supabase/policies/groups_owner.sql`): `groups.created_by` = creador (inmutable), `groups.owner_id` = admin actual (cambia al transferir). Incluye `is_group_admin(gid)` (SECURITY DEFINER, evita recursión), la policy UPDATE de groups (admin) y la DELETE de group_members (abandonar/expulsar). El admin se calcula con `owner_id`, NO con `created_by`.
- **Borrado de grupo por el admin** (`supabase/migrations/group_delete_cascade.sql`): recrea los FK de group_members/shopping_lists/list_items con ON DELETE CASCADE para que borrar el grupo arrastre miembros, listas e ítems. La policy DELETE ya está en groups_owner.sql (owner_id).
- **Catálogo Consum** (`supabase/migrations/consum_catalog.sql`): tablas `consum_products`/`consum_categories`. Tras ejecutarla, lanzar el sync (workflow `sync-consum.yml` o `scripts/run-consum-sync.ps1`). Ver `scripts/README-consum-sync.md`.
- **Catálogo Dia** (`supabase/migrations/dia_catalog.sql`): tablas `dia_products`/`dia_categories`. Tras ejecutarla, lanzar el sync (workflow `sync-dia.yml` o `scripts/run-dia-sync.ps1`). Ver `scripts/README-dia-sync.md`.
- **Catálogo Sorli** (`supabase/migrations/sorli_catalog.sql`): tablas `sorli_products`/`sorli_categories` (7º súper, catalán). Migración AUTOCONTENIDA: incluye ya las columnas que en los otros súpers añadieron migraciones posteriores (`display_name_norm`+`display_name_ca_norm` para búsqueda sin acentos bilingüe, `first_seen_at` para novedades, `prev_unit_price`/`price_changed_at`/`price_delta_pct` + trigger para cambios de precio). Sorli tiene API JSON propia protegida por un token de sesión que firma su SPA → el sync (`scripts/sync-sorli.mjs`) ARRANCA la sesión con navegador headless (Playwright, como Bonpreu) y luego pagina el catálogo entero (~9.460 productos) con fetch, en 2 pasadas es/ca (bilingüe). Tras ejecutarla, lanzar el sync (workflow `sync-sorli.yml` o `scripts/run-sorli-sync.ps1`) y **re-ejecutar `similar_products.sql`** (ya incluye el brazo de Sorli). Ver `scripts/README-sorli-sync.md`.
- **Catálogo Ametller Origen** (`supabase/migrations/ametller_catalog.sql`): tablas `ametller_products`/`ametller_categories` (11º súper, catalán de frescos). Migración AUTOCONTENIDA (mismas columnas base que Sorli) + columnas de FICHA bilingüe (`ingredients`/`nutrition`/`conservation`/`origin` + sus `_ca`) + `ean`. Ametller corre sobre Salesforce Commerce Cloud → su SCAPI responde con un token de invitado por PKCE que se obtiene 100% con fetch (SIN navegador headless, a diferencia de Sorli/Bonpreu); el sync (`scripts/sync-ametller.mjs`) enumera los ids con product-search (cgid=root, offset) y trae el detalle por lotes de 24 (`/products?ids=`) en 2 pasadas es/ca. DRY_RUN OK: 2.994 productos, 0 sin precio/imagen/EAN, 2.573 con ingredientes, 2.759 con nombre catalán. Único espejo (con Consum) con EAN estructurado. Logo placeholder en `assets/stores/ametller.png` (sustituir por el real). Tras ejecutarla, lanzar el sync (workflow `sync-ametller.yml`) y **re-ejecutar `similar_products.sql`** (ya incluye el brazo de Ametller + su marca en la limpieza del needle).
- **Catálogo Aldi** (`supabase/migrations/aldi_catalog.sql`): tablas `aldi_products`/`aldi_categories` (12º súper). Migración AUTOCONTENIDA, **SOLO castellano** (aldi.es no es bilingüe), SIN ficha ni EAN. Aldi no vende con reparto pero publica su surtido permanente con precios online: la web es Next.js con Algolia y los productos van RENDERIZADOS EN EL SERVIDOR, embebidos en el `__NEXT_DATA__` (`props.pageProps.algoliaState.initialResults[idx].results[0].hits`) de cada categoría HOJA (`/productos/{n1}/{n2}.html`, hitsPerPage 1000). El sync (`scripts/sync-aldi.mjs`) enumera hojas crawleando las N1 (del sitemap `/.aldi-nord-sitemap.xml` sale la lista de PDPs, pero se usan las hojas) y raspa el JSON embebido — fetch puro sin cookies/navegador (patrón Carrefour/Dia). Precio + €/unidad (basePrice) + imagen Scene7; sin EAN (solo nº de artículo interno → comparador por nombre). GUARDARRAÍL: aborta si <800 productos (scrape parcial) para que markStale no borre el catálogo vivo. Logo placeholder en `assets/stores/aldi.png`. Tras ejecutarla, lanzar el sync (workflow `sync-aldi.yml`, lunes 08:20) y **re-ejecutar `similar_products.sql`** (ya con el brazo de Aldi).
- **Catálogo HiperDino** (`supabase/migrations/hiperdino_catalog.sql`): tablas `hiperdino_products`/`hiperdino_categories` (13º espejo). Migración AUTOCONTENIDA, **SOLO castellano**, SIN ficha, SIN EAN y SIN €/unidad. HiperDino (cadena líder de **Canarias**) es Magento 2 con **GraphQL abierto** (`POST hiperdino.es/graphql`, sin auth/cookies/navegador): el sync (`scripts/sync-hiperdino.mjs`) enumera los productos por las 13 ramas de súper (anchor, `products(category_id)` agrega el subárbol) con `pageSize` alto y dedup por sku, y reconstruye el árbol N1→N2 desde el `path` embebido de las categorías — fetch puro (patrón Carrefour/Dia). OJO: NO se pide el campo `image` (un producto con imagen rota tira toda la query GraphQL) → la miniatura se DERIVA del sku (`cdn.hiperdino.es/catalog/product/x/{sku}_1.jpg`, patrón determinista verificado). DRY_RUN OK: **14.684 productos · 127 categorías**, 0 sin precio/imagen/categoría (1.073 con precio tachado, guardado en `raw` para futuras ofertas). GUARDARRAÍL: aborta si <10.000 productos. Logo placeholder en `assets/stores/hiperdino.png`. **⚠️ OJO NEGOCIO: HiperDino solo opera en Canarias** (precios con IGIC, no IVA) → solo relevante para usuarios canarios; el filtrado por comunidad autónoma decide si se muestra (ver `COMUNIDAD-AUTONOMA.md`). Tras ejecutarla, lanzar el sync (workflow `sync-hiperdino.yml`, lunes 08:40) y **re-ejecutar `similar_products.sql`** (ya con el brazo de HiperDino).
- **Catálogo Plusfresc** (`supabase/migrations/plusfresc_catalog.sql`): tablas `plusfresc_products`/`plusfresc_categories` (15º espejo, súper catalán de Lleida — Supsa; 8 centros online, todos en Catalunya → filtrado por comunidad `ES-CT`). Migración AUTOCONTENIDA, **BILINGÜE es/ca nativa** y con FICHA rica (descripción/ingredientes/**ALÉRGENOS legibles**/nutrición/conservación, bilingüe; único espejo con alérgenos junto a Carrefour). API REST ASP.NET abierta (`wscompra.plusfresc.cat/api`) con JWT de INVITADO (`POST loginGuest/{centro}`, 30 min, re-login en 401): fetch puro, sin cookies ni navegador — el sync más simple junto a Condis. El sync (`scripts/sync-plusfresc.mjs`) baja TODO el catálogo en UNA petición (`products/category/Root/{centro}`, centro 12 = Lleida Cap Pont como referencia; ~7.5k filas → dedup por `item_id`), el árbol bilingüe en otra (`categories/tree/{centro}/Root`; ids numéricos jerárquicos por PREFIJO: "09"→"0901"→"090110"→"09011001"; ramas de marketing con id no numérico excluidas) y la ficha INCREMENTAL por producto (`productdetails/files/{item}/{lang}`, es+ca, TTL 30 días, flags `SKIP_DETAIL`/`DETAIL_MAX`, patrón bonÀrea). DRY_RUN OK 2026-07-15: **7.316 productos · 787 categorías**, 0 sin precio/imagen/categoría/nombre-ca, 20 sin €/unidad. Ofertas (copias de "Oferta2" con `new_value_cents`/`end_date`) NO se aplican al precio (rotan entre semana): quedan en `raw.offer` para futuro. Sin EAN. GUARDARRAÍL: aborta si <6.000 productos. Logo real (icono "és") en `assets/stores/plusfresc.png`. Tras ejecutarla, lanzar el sync (workflow `sync-plusfresc.yml`, lunes 10:40) y **re-ejecutar `similar_products.sql`** (ya con el brazo de Plusfresc + su marca en la limpieza del needle).
- Tras las dos anteriores, **re-ejecutar `similar_products.sql`** (ya incluye los brazos de consum y dia, y sus marcas blancas en la limpieza del needle).
- **Lista por zonas** (`supabase/migrations/list_items_category.sql`): columna `category_name` en `list_items` Y en `purchase_items` (para que "repetir compra" conserve las zonas). Sin ella, añadir a la cesta falla (el insert incluye la columna).
- **Idioma de las notificaciones push** (`supabase/migrations/push_tokens_lang.sql`): columna `lang text` en `push_tokens`. El texto de las push se genera en servidor (`send-push`) y antes salía siempre en castellano aunque el usuario tuviera la app en català. Ahora el cliente guarda el idioma de CADA dispositivo en el token (al registrar y al cambiar de idioma) y `send-push` agrupa los tokens del destinatario por `lang` y traduce el mensaje por grupo (es/ca, dict `STRINGS` en la función). Aditiva (NULL = castellano). **Tras ejecutarla, RE-DESPLEGAR la función:** `supabase functions deploy send-push`.
- **Bandeja de notificaciones server-side** (`supabase/migrations/notifications_inbox.sql`): tabla `notifications` (user_id, type, title, body, data jsonb, read, created_at) con RLS (select/update/delete propias; INSERT solo `send-push` con service-role). Antes la campana del Home guardaba la bandeja LOCAL en AsyncStorage y solo registraba lo recibido en primer plano o tocado → lo de SEGUNDO PLANO no se contaba. Ahora `send-push` inserta una fila por destinatario (en su idioma) a la vez que manda el push, y `NotificationsContext` lee/gestiona esa tabla (refetch al volver a primer plano + al recibir/tocar; el proyecto no usa realtime). **Tras ejecutarla, RE-DESPLEGAR la función:** `supabase functions deploy send-push`.
- ⚠️ **Ficha de producto desde la cesta para todos los súpers** (`supabase/migrations/list_items_store_product_id.sql`): columna `store_product_id text` en `list_items` Y en `purchase_items`. Guarda el id del producto en su propio súper para poder abrir su ficha al tocarlo en la cesta (antes solo Mercadona, vía `mercadona_product_id`). La tienda se sigue deduciendo en cliente del dominio de la imagen (`storeOfItem`), así que con `{tienda, store_product_id}` la cesta abre el modal correcto vía `StoreProductModal`. IMPRESCINDIBLE antes de arrancar: `fetchListItems`/`fetchGroupItems`/`fetchPurchaseItems` ya seleccionan la columna y la cesta falla al cargar si no existe. NULL en ítems manuales o anteriores (no abren ficha, como hasta ahora); solo los productos añadidos tras la migración la tendrán.
- **Fix precios Bonpreu** (`supabase/migrations/fix_bonpreu_prices.sql`): UPDATE one-off que repara `unit_price` desde el raw (~50% del catálogo guardaba el €/kg de referencia como precio del envase). El sync ya está corregido; ejecutar el SQL para arreglar lo existente sin esperar al re-scrapeo. ⚠️ Ejecutarlo ANTES que `catalog_price_changes.sql` (si el trigger ya está instalado, la reparación masiva se registraría como "cambios de precio" falsos).
- ⚠️ **Publicación reanudable de Bonpreu** (`supabase/migrations/20260728182501_bonpreu_sync_staging.sql` → `20260729184317_bonpreu_resumable_publication.sql`): el crawler congela el árbol y guarda snapshots bilingües sin retirar el catálogo vivo; la finalización conserva un único `publication_started_at`, cursor y fase. Publica como máximo 1.000 productos por Action en micro-lotes de 50, confirma cada lote con compare-and-swap y solo ejecuta `markStale` tras verificar el plan completo. La segunda migración recupera automáticamente el prefijo exacto de un ciclo interrumpido (20.890 staged; 6.750 ya escritos en el incidente del 2026-07-29). **Aplicar la migración nueva a la vez que el script/workflow actualizado; el script antiguo ignora el cursor.**
- **Novedades de la semana** (`supabase/migrations/catalog_first_seen.sql`): columna `first_seen_at` + índice en las 6 tablas `*_products`. Se añade con default sentinel antiguo (solo metadatos, sin UPDATE masivo) y luego se cambia el default a `now()` → lo existente queda "antiguo" y solo lo que aparezca en próximos syncs cuenta como novedad; los syncs NO se tocan (merge-duplicates no pisa columnas fuera del payload). La lee `fetchWeeklyNewProducts` (`src/api/catalog.ts`) para la pantalla "Novedades de la semana" del Home (botón junto a la campana); Mercadona no la necesita (usa su endpoint oficial `/home/new-arrivals/` en vivo). Guarda en cliente: un lote > ~400 = primer llenado de un súper nuevo (Consum/Dia sin run), se oculta. Sin la migración, la pantalla funciona solo para Mercadona (el resto muestra su error).
- **Cambios de precios** (`supabase/migrations/catalog_price_changes.sql`): columnas `prev_unit_price` + `price_changed_at` + `price_delta_pct` (% de variación; las TRES las rellena el trigger — la 1ª versión usaba columna generada y la reescritura de tabla moría por 57014 en el SQL Editor) + trigger `BEFORE UPDATE OF unit_price` + índice parcial en las 6 tablas `*_products`. Migración 100% metadatos (instantánea, sin bloqueos); idempotente, ejecutable entera o por bloques. El upsert semanal de los syncs dispara el trigger solo (syncs intactos); markStale no toca `unit_price` → no lo dispara. Lo lee `fetchPriceChanges` (`src/api/catalog.ts`) para la pantalla "Cambios de precios" del Home (pestañas Bajadas/Subidas ordenadas por magnitud). **No hay datos hasta el primer sync (lunes) posterior a ejecutarla** → ejecutarla cuanto antes. ⚠️ ORDEN: `fix_bonpreu_prices.sql` va ANTES.
- ⚠️ **Ofertas de Carrefour** (`supabase/migrations/carrefour_offers.sql`): columnas `promo_name/promo_text/promo_start/promo_end` + `strikethrough_price` en `carrefour_products`, **con BACKFILL desde `raw`** (los badges de promo y el precio tachado ya venían en el SSR de listado y el sync los guardaba enteros en `raw` → hay datos nada más ejecutarla, sin esperar al lunes) + índice parcial para el keyset del listado. Las lee `fetchCarrefourOffers` (paginación keyset, filtro de caducidad por `promo_end`) para la pantalla "Ofertas" del Home (4º círculo glass de la cabecera, `OffersScreen`, hoy solo Carrefour vía `OFFER_STORES`) y `fetchCarrefourProduct` para el banner de oferta de la ficha (`CarrefourProductModal`: precio tachado + píldora con el badge y sus condiciones). **IMPRESCINDIBLE ejecutarla antes del próximo sync de Carrefour**: `normalize()` ya incluye las columnas en el upsert y falla sin ellas. Requiere `catalog_unaccent_search.sql` previa (usa `display_name_norm`).
- ⚠️ **Ofertas de Consum** (`supabase/migrations/consum_offers.sql`): columnas `promo_base_price` y `offer_zones` en `consum_products`. La API de Consum solo marca oferta cuando publica la pareja `PRICE` + `OFFER_PRICE`; el sync guarda la primera como precio anterior y todas las zonas con `OFFER_PRICE`. `OffersScreen` consulta exclusivamente `offer_zones` del CP activo, por lo que un simple cambio de precio histórico no puede entrar como oferta. **Ejecutarla antes del próximo sync de Consum**: el UPSERT ya envía ambas columnas.
- ⚠️ **Ofertas de Plusfresc** (`supabase/migrations/plusfresc_offers.sql`): columnas de promoción y `offer_centers` en `plusfresc_products`. La API crea una copia `Oferta2` por promoción con `new_value_cents`, etiqueta y fecha de fin. El sync guarda esa señal por centro; Ofertas muestra exclusivamente los centros correspondientes al CP, incluso para promos de lote con el mismo precio individual. **Ejecutarla antes del próximo sync de Plusfresc**: el UPSERT ya envía estas columnas.
- ⚠️ **Ofertas de HiperDino** (`supabase/migrations/hiperdino_offers.sql`): columna `promo_base_price` en `hiperdino_products`. Magento entrega `final_price` y `regular_price`; el sync guarda el regular únicamente si es mayor. Ofertas filtra esa columna y no consulta el historial semanal, por lo que una variación ordinaria de precio no se presenta como promoción. **Ejecutarla antes del próximo sync de HiperDino**: el UPSERT ya envía la columna.
- ⚠️ **Ofertas de Aldi** (`supabase/migrations/aldi_offers.sql`): columnas `promo_name`, `promo_base_price` y `promo_end` en `aldi_products`. Algolia publica `strikePrice`, etiqueta y vigencia dentro de `currentPrice`; el sync solo conserva la promoción cuando el precio tachado supera al actual. Ofertas excluye campañas caducadas y no consulta el historial semanal. **Ejecutarla antes del próximo sync de Aldi**: el UPSERT ya envía las columnas.
- ✅ **Ofertas de DIA** (`supabase/migrations/20260723204711_dia_offers.sql`, aplicada en producción el 2026-07-23): columnas `promo_name`, `promo_text`, `promo_base_price`, `offer_regions` y `regional_offers` en `dia_products`, con backfill desde `raw`. El PLP general ya contiene la misma señal que `/ofertas`, incluidos `promotions[].description` para 3x2/2ª unidad y el precio tachado/porcentaje de CLUB Dia. El sync une esa señal por CCAA y la app la consume en catálogo (lista/cuadrícula), Ofertas y ficha.
- ✅ **Ofertas de Sorli** (`supabase/migrations/20260723212240_sorli_offers.sql`, aplicada en producción el 2026-07-23): columnas bilingües `promo_name(_ca)`/`promo_text(_ca)`, `promo_base_price` y vigencia en `sorli_products`, con backfill desde `raw`. Sorliclic publica tipos estructurados (`Precio`, `2ª 50/70%`, `2x1`, `3x2`, `4x3`, lotes y regalo); el sync prioriza las condiciones concretas cuando contradicen el tipo genérico. La app lo consume en catálogo (lista/cuadrícula), Ofertas y ficha.
- ✅ **Ofertas de Condis, Ametller, Alcampo, Eroski y Caprabo** (`supabase/migrations/20260726200544_retailer_offers_condis_ametller_alcampo_eroski_caprabo.sql`, aplicada en producción el 2026-07-26): las cinco tablas comparten `promo_name`, `promo_text`, `promo_price`, `promo_base_price`, `promo_start` y `promo_end`. El backfill normaliza solo señales explícitas ya presentes en `raw` (promoción/club/lote o precio regular frente al promocional), sin convertir cambios semanales en ofertas. El parser compartido de Eroski/Caprabo extrae badge, condiciones, precio promocional, precio anterior y vigencia del HTML de cada tarjeta. Tras los syncs completos del 2026-07-26, producción contiene 1.075 ofertas de Condis, 344 de Ametller, 1.521 de Alcampo, 2.378 de Eroski y 1.002 de Caprabo; la app las consume en la sección Ofertas con el precio anterior tachado solo cuando existe una rebaja directa real.
- **Filtros de Ofertas:** la hoja permite multiselección por tipo (`Precio rebajado`, `Segunda unidad`, `3x2/2x1/lotes`, `Club/cupones` y `Otras promociones`) y por categoría del producto, además de precio, orden y búsqueda. Las etiquetas heterogéneas de cada retailer se clasifican en cliente después de resolver idioma/región, recorriendo páginas keyset hasta reunir coincidencias para no filtrar solo los productos ya visibles. Las categorías se obtienen paginando `id, category_name` y deduplicando: los agregados del Data API están deshabilitados en producción (`PGRST123`), por lo que no se usa `count()`.
- ⚠️ **Multi-zona de Carrefour por comunidad autónoma** (`supabase/migrations/carrefour_regions.sql`): columnas `regions text[]` + `regional_prices jsonb` en `carrefour_products`. Carrefour REGIONALIZA catálogo Y precio por CP (cada CP → un almacén `werks_id`; 48 en España; SIN cookie = Madrid COL PINAR). `scripts/sync-carrefour.mjs` ahora BARRE una capital por comunidad (~18 almacenes deduplicados, ~2 h) fijando la cookie `salepoint` y une por `product_id`; guarda `regions` (CCAA donde disponible; NULL = nacional, semántica de mercadona/dia) y `regional_prices` (precio por CCAA cuando difiere del de Madrid). Las **columnas base siguen siendo las de Madrid** (COL PINAR = comportamiento sin cookie) → la app NO cambia hasta implementar el filtro por comunidad (`regions.ts`); hoy solo se GUARDA. **IMPRESCINDIBLE ejecutarla antes del próximo sync**: el upsert incluye ambas columnas y falla sin ellas. Sube el `-ExecutionTimeLimit` de la tarea de Windows a ~4 h (barrido ×18). Ver `scripts/README-carrefour-sync.md`.
- **Ficha de producto bonÀrea** (`supabase/migrations/bonarea_product_detail.sql`): columnas anulables `description/ingredients/allergens/nutrition/conservation/denomination/origin/operator` **+ sus `_ca`** (bilingüe es/ca) + `detail_synced_at` en `bonarea_products`. La rellena `scripts/sync-bonarea.mjs` leyendo la página de cada producto (HTML server-rendered, bloque `.general-product-info`); **bilingüe**: la ficha catalana va por una urlFriendly distinta (`/online/producte/…`) que sale de la 2ª pasada `/ca/`. Descarga **incremental** (solo productos sin ficha o con `detail_synced_at` viejo, flags `DETAIL_*`/`SKIP_DETAIL`). `mapBonarea` elige idioma (fallback es) y `BonareaProductModal` pinta las secciones sin cambios. **Imprescindible ejecutarla antes del próximo sync**, si no el upsert de la pasada de ficha falla por columnas inexistentes. bonÀrea y Dia son los únicos espejos que exponen ficha; Consum NO (su API solo da códigos de filtro y el JSON nutricional del CDN da 404 — verificado en vivo 2026-06-26).
- **Ficha de producto Dia** (`supabase/migrations/dia_product_detail.sql`): columnas anulables `description/ingredients/nutrition/conservation/preparation/denomination/operator` + `detail_synced_at` en `dia_products`. La rellena `scripts/sync-dia.mjs` leyendo la página de cada producto (raw.url): dia.es es SSR Vike con el producto ESTRUCTURADO en `vike_pageContext` (`ingredients.text`, `nutritional_info`, `instructions`, `manufacturer_contact`, `product_info`). **Solo castellano** (dia.es no es bilingüe) → sin columnas `_ca`. Descarga **incremental** (flags `DETAIL_*`/`SKIP_DETAIL`, igual que bonÀrea). `mapDia`/`DiaProductModal` ya lo pintan. **Imprescindible ejecutarla antes del próximo sync de Dia**.
- **Ficha de producto Carrefour** (`supabase/migrations/carrefour_product_detail.sql`): columnas anulables `ingredients/allergens/nutrition/conservation/preparation/denomination/origin/operator` + `detail_synced_at` en `carrefour_products`. La rellena `scripts/sync-carrefour.mjs` leyendo la PDP de cada producto (raw.url): Carrefour embebe `window.__INITIAL_STATE__` con `nutrition_info` TOTALMENTE estructurado (ingredientes, `alergenos`{contiene,puedeContener}, valorEnergetico, macros, y `masInfo` grupos→listaInfo de nombre/valor: conservación, denominación legal, operador…). **Solo castellano** → sin `_ca`. Descarga **incremental** (flags `DETAIL_*`/`SKIP_DETAIL`). OJO Cloudflare: el sync corre en local y la pasada de ficha multiplica peticiones → `DETAIL_MAX`/conc. baja la reparten. `mapCarrefour`/`CarrefourProductModal` ya lo pintan. **Imprescindible ejecutarla antes del próximo sync de Carrefour**. El backfill independiente `scripts/backfill-carrefour-ean.mjs` descarga la misma PDP para las filas publicadas sin EAN y guarda `product.ean`; es reanudable (`ean IS NULL`) y admite `DRY_RUN`, `LIMIT` y `PRODUCT_ID`. (Bonpreu es el único espejo con ficha aún sin implementar: requiere el navegador headless del WAF, 1 nav/producto.)
- **Ficha Eroski/Caprabo** (`supabase/migrations/20260718133958_eroski_caprabo_nutrition.sql` + `20260719102703_eroski_caprabo_product_detail.sql`): añade `nutrition`, `ingredients`, `conservation`, `manufacturer` y `detail_synced_at` a ambas tablas. `scripts/lib/eroski-tapestry.mjs` descarga la PDP con GET y extrae esos bloques; normaliza la nutrición por 100 g/ml para el Índice Alimentario. La segunda migración invalida de forma segura el TTL para completar el backfill gradual (`DETAIL_MAX=1000`; TTL 90 días después). **Ejecutar ambas migraciones, en ese orden, antes del siguiente sync**; no se han aplicado automáticamente a producción.
- **Índices de navegación del catálogo** (`supabase/migrations/20260718183152_catalog_browse_indexes.sql`): índices B-tree parciales por `(display_name_norm, id)` y `(display_name_ca_norm, id)` donde corresponde, con `WHERE published = true`. Aceleran la primera página y el keyset de Productos sin cambiar el esquema que selecciona el cliente. El SQL omite de forma segura las tablas/columnas aún no creadas. **Pendiente de ejecutar manualmente en producción**.
- ⚠️ **Favoritos por tienda** (`supabase/migrations/favorites_store.sql`): añade columna `store` a `favorites` + cambia la unicidad a `(user_id, kind, store, ref_id)` (los ids se solapan entre súpers). IMPRESCINDIBLE antes de arrancar tras este cambio: `fetchFavorites` ya selecciona `store` y falla sin ella. La migración hace backfill de filas viejas (productos por dominio de imagen, categorías → mercadona). Habilita: favoritos de producto/categoría en los 6 súpers (swipe en listas/búsqueda + estrella en los modales) y el agrupado de favoritos por súper en el Home.
- **Búsqueda insensible a acentos** (`supabase/migrations/catalog_unaccent_search.sql`): añade columna generada `display_name_norm` (minúsculas + sin acentos vía wrapper inmutable `f_unaccent`) + índice trigram a las 6 tablas `*_products`. La app (`src/api/catalog.ts` → `filterByNameWords`) ya busca sobre esa columna normalizando el texto del usuario, así que "platano" encuentra "Plátano". Aditiva (no toca columnas/índices viejos), backfill automático, sin cambios en los syncs. Sin ejecutarla, la búsqueda no devuelve nada (filtra por una columna inexistente).
- **Catálogo Mercadona en catalán (Fase 2 bilingüe)** (`supabase/migrations/mercadona_catalog_ca.sql`): añade a `mercadona_products` la columna `display_name_ca` + la generada `display_name_ca_norm` (= `coalesce(display_name_ca, display_name)` normalizada) + índice trigram. La pestaña "Productos" del catálogo (espejo) busca/muestra en català cuando la UI está en català (`searchProducts` mira el idioma con `getLanguage()`); el resto de vistas de Mercadona van en vivo con `lang=ca` y no necesitan BD. **Imprescindible ejecutarla antes de arrancar en català** (si no, `searchProducts` filtra por `display_name_ca_norm`, inexistente → la búsqueda peta en català). Tras ejecutarla, **relanzar el sync** (`scripts/sync-catalog.mjs` / workflow `sync-catalog.yml`) para que su 2ª pasada `lang=ca` rellene `display_name_ca` (hasta entonces, búsqueda en català funciona pero muestra nombres en castellano por el coalesce). Solo Mercadona soporta catalán por API.
- Hay SQL previo en `supabase/` (RLS, policies de groups/group_members/shopping_lists/list_items).

## Estado / pendientes
- ✅ **Fase 3 de seguridad y rendimiento de datos (2026-08-14):** auditoría
  remota actualizada (44 avisos de seguridad y 121 de rendimiento) y migración
  desplegada para fijar `search_path`, cerrar RPC privilegiados a `anon`,
  consolidar RLS, evaluar `auth.uid()` una vez por consulta y cubrir 6 claves
  foráneas con índices. Resultado verificado: 20 avisos de seguridad y 69 de
  rendimiento; sin avisos RLS por fila, policies solapadas ni claves foráneas
  sin índice. Si un SQL legacy recrea estas funciones/policies, reauditar antes
  de desplegarlo. Detalle en
  `FASE-3-SEGURIDAD-RENDIMIENTO-DATOS.md`.
- ✅ **Fase 1 de estabilidad y rendimiento inicial (2026-08-14):** ESLint pasa de 82 avisos a cero y CI no admite nuevos; errores de Apple/Google se traducen a UI comprensible; BootLoader baja su mínimo artificial de 2 s a 350 ms; las pestañas se montan bajo demanda; arrays, filtros y efectos de catálogo estabilizados; Release validada en iPhone 17e e iPad mini. Sin cambios remotos ni migraciones. Detalle en `FASE-1-ESTABILIDAD-RENDIMIENTO.md`.
- ✅ **Fase 2 de accesibilidad, diseño y recursos (2026-08-14):** animaciones y transiciones respetan Reducir movimiento; controles compartidos exponen etiquetas y estados accesibles; contraste secundario y accents cumplen AA; Login se adapta a texto `accessibility-large`; el bundle importa solo Ionicons y los cuatro pesos usados de Space Grotesk. Export iOS: 57→38 recursos, 1.524→1.470 módulos, 6,15→5,81 MB de Hermes y ~35 % menos tamaño exportado. Sin cambios remotos ni migraciones. Detalle en `FASE-2-ACCESIBILIDAD-DISENO.md`.
- ✅ **Fase 0 de calidad y línea base (2026-08-13):** Node 22.23.2 y npm 10.9.8 fijados; `npm run quality` agrupa TypeScript, ESLint y 27 tests; workflow de CI añadido; Debug/Release verificados en iPhone y iPad simulados. Auditoría remota de Supabase de solo lectura confirma que las columnas críticas y los RPC usados por el cliente existen. No se aplicó ninguna migración. Detalle, medidas y backlog en `FASE-0-LINEA-BASE.md`. Las listas históricas de migraciones pendientes de este documento deben contrastarse con esa auditoría antes de tratar una columna como ausente.
- ✅ App funcional en Expo Go: auth, grupos, carrito, catálogo, perfil, notificaciones locales, privacidad.
- ⏳ Desplegar `quefalta-web` en Vercel + DNS de `quefalta.es` (Hostinger: A `@` → IP de Vercel, CNAME `www` → `cname.vercel-dns.com`).
- ⏳ Primer `eas build` iOS / `expo run:ios` para probar en dispositivo y los Universal Links.
- ⏳ URL real de App Store (sustituir `#`/`APP_STORE_URL` en la web).
- ⏳ **Consum añadido como 5º súper** (2026-06-12): código completo — sync (`scripts/sync-consum.mjs`, API REST abierta de Consum, DRY_RUN completo OK: 9.351 productos), espejo (`consum_catalog.sql`), app (stores/catalog/pantalla/modales) y comparativa. Pendiente: ejecutar la migración en Supabase, primer run real del sync y re-ejecutar `similar_products.sql`. Consum es el único súper con EAN y marca estructurados.
- ⏳ **Dia añadido como 6º súper** (2026-06-12): código completo — sync (`scripts/sync-dia.mjs`, SSR Vike de dia.es con JSON `vike_pageContext` embebido, DRY_RUN completo OK: 5.433 productos en 287 N2, ~6 min), espejo (`dia_catalog.sql`), app y comparativa. Mismos pendientes que Consum (migración + run + `similar_products.sql`). `lib/price.mjs` ahora convierte DOCENA→€/ud.
- ⏳ **Sorli añadido como 7º súper** (2026-07-10): código completo — sync (`scripts/sync-sorli.mjs`: la API firma un token de sesión en el navegador, así que arranca con Playwright y pagina con fetch; BILINGÜE es/ca en 2 pasadas; DRY_RUN OK: 9.460 productos, 1.109 categorías), espejo (`sorli_catalog.sql`, autocontenida), app completa (selector, búsqueda, navegación, categorías, ficha `SorliProductModal`, favoritos, zonas) y comparativa. Pendientes: ejecutar la migración, re-ejecutar `similar_products.sql`, primer run del sync (workflow `sync-sorli.yml`, lunes 06:50, tras Dia) y validar en device. Logo en `assets/stores/sorli.png`.
- ⏳ **Eroski (8º) y Caprabo (9º) añadidos** (2026-07-11): comparten backend (Apache Tapestry) → un scraper compartido `scripts/lib/eroski-tapestry.mjs` (GET de la página de categoría —SSR del 1er lote de 20— y después `POST supermarket:loadpage` con cookies de sesión + Origin/Referer; saca cada producto del JSON `data-metrics` del tile: id/nombre/marca/categoría/precio; ⚠️ la paginación `?pageNumber=N` original DEJÓ de funcionar el 2026-07-11: el server devuelve "No se obtuvieron resultados") y dos syncs mínimos (`sync-eroski.mjs`, `sync-caprabo.mjs`). Solo castellano, SIN €/unidad ni EAN, pero con nutrición de ficha HTML incremental normalizada para el Índice Alimentario. DRY_RUN completo OK (2026-07-11, ya con loadpage): **Eroski 21.073 productos** / 803 hojas / 0% sin tiles; **Caprabo 10.657** / 750 hojas (8% sin tiles por 429 de rate-limit tras encadenar crawls desde la misma IP — en CI no pasa). OJO: los crawls con `?pageNumber` daban 10.694 en Eroski = LA MITAD del catálogo (solo el 1er lote de cada hoja). GUARDARRAÍL anti-throttling: bajo carga el server sirve la página sin productos (o 429, con backoff largo + Retry-After) → reintentos en la pág. 1 + aborta el run si >20% de hojas llegan SIN TILES (para que markStale no despublique productos vivos); las hojas cuyo contenido ya se vio en otras categorías (~60 por súper, solapamiento del árbol) se cuentan APARTE como "solo-duplicados" y no disparan el aborto (la 1ª versión las mezclaba y abortó el run de CI del 2026-07-11 con un falso "56% vacías"). App: tipo/adaptador/modal (`TapestryProductModal`)/pantalla (`TapestryProductsScreen`) COMPARTIDOS por ambos, con funciones de `catalog.ts` por tabla. Migraciones `eroski_catalog.sql`+`caprabo_catalog.sql` (autocontenidas, es-only) + ampliación `20260718133958_eroski_caprabo_nutrition.sql` para tablas ya creadas. Pendientes: ejecutar las migraciones, re-ejecutar `similar_products.sql` (ya con ambos brazos), primer run (`sync-eroski.yml` lunes 09:00 / `sync-caprabo.yml` 09:30) y validar en device. Logos en `assets/stores/{eroski,caprabo}.png`. Ver `scripts/README-eroski-caprabo-sync.md`.
- ⏳ **Lista agrupada por zonas del súper** (2026-06-12): Lista y cesta de grupo agrupan Tienda → Zona ("pasillo": Fruta y verdura, Congelados al final…) con alfabético dentro. Mapeo de N1 de los 6 supers → ~15 zonas canónicas por keywords en `src/constants/zones.ts` (solo cliente, afinable sin migrar). La categoría se captura al añadir (`list_items.category_name`); manuales/históricos → "Otros". ⚠️ Si se añade un nuevo punto de "añadir a la cesta", pasar `categoryName`. Pendiente: ejecutar `list_items_category.sql`.
- 🧪 Comparativa de productos similares entre supers (detalle de producto) — **ACTIVADA PARA TESTERS** con `PRICE_COMPARISON_ENABLED = true`: funciona bajo demanda, usa la capa híbrida/caché y el cliente ya apunta a `catalog_cheaper_products_v5`. Antes de distribuir ese cliente debe desplegarse `20260817124758_comparator_semantic_identity_guard.sql`; la RPC v4 permanece disponible para builds anteriores.
- Monetización «QuéFalta Plus» (1,99 €/mes · 11,99 €/año): **ACTIVADA LOCALMENTE PARA DESARROLLO (2026-08-11)**. El paywall presenta orden por precio unitario, filtros en Ofertas/Cambios/Novedades, selección «Todos» y alertas personalizadas. El cliente usa `PAYWALL_ENABLED = true`; el servidor permanece apagado con `paywall_enabled() = false` hasta completar RevenueCat y las pruebas sandbox.
- ⏳ **Onboarding de primera vez + demo** (2026-06-16): asistente de bienvenida (obligatorios @usuario + supermercados; opcionales foto/amigos/grupo) + demo con coach marks sobre la app. Código completo y typecheck verde. Gate por `profiles.onboarded_at`. Pendiente: **ejecutar `supabase/migrations/profile_onboarding.sql`** en Supabase y probar el flujo. Ver `ONBOARDING.md`.
- ❌ No publicar en App Store todavía (solo pruebas en dispositivo propio).
- ⏳ **Nota de salud estilo Yuka (Plus, solo Mercadona)**: backend incorporado en
  `scripts/lib/health-score.mjs`, `scripts/extract-mercadona-nutrition.mjs`,
  `supabase/migrations/mercadona_health.sql` y el workflow correspondiente.
  Pendiente: ejecutar la migración, configurar `ANTHROPIC_API_KEY`, lanzar el
  backfill y completar la Fase 3 de UI.
