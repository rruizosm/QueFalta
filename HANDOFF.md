# HANDOFF.md — Estado en vuelo (traspaso a Codex)

> **Snapshot: 2026-07-15.** Este documento consolida el estado NO obvio del repo: qué está
> commiteado vs. solo en local, qué supers están implementados pero sin migrar, y las features
> transversales a medias. Todo esto vivía en la memoria de Claude Code (que Codex no ve) y **no
> está completo en git**. La lista canónica y anotada de migraciones SQL está en
> [CONTEXTO.md](CONTEXTO.md) §"Migraciones SQL pendientes"; aquí va lo que ESE documento no dice:
> el estado de commit y el trabajo transversal.
>
> ⚠️ Fechas y detalles reflejan lo que era cierto el 2026-07-15. **Verifica contra `git log` y
> contra Supabase antes de fiarte** — algo puede haberse commiteado/ejecutado después.

## Fondo ambiental en Inicio (local, 2026-08-18)

- Implementado localmente en `HomeScreen`: degradado tenue basado en el accent,
  con formas ambientales amplias y discretas detrás del contenido.
- Respeta tema claro/oscuro, accent personalizado, gestos y accesibilidad. No
  incorpora recursos nuevos ni modifica la jerarquía funcional de Inicio.

---

## Rediseño completo del Login (local, 2026-08-19)

- Sustituida la transición automática `Bouncy Scale Ball` y toda la cabecera
  azul por una portada interactiva basada en `Wabi & More` del repositorio MIT
  `ImCitizen13/quattro4maggi`: la burbuja prismática parte del borde inferior,
  sigue el arrastre, vuelve si el gesto es corto y se encaja con muelle si el
  deslizamiento supera el umbral.
- Al encajarse despliega los 18 supermercados de `CATALOG_STORES` y después los
  accesos de Apple, Google y correo. Los logotipos respetan el área segura y se
  retiran al abrir correo para no cubrir el formulario.
- Eliminados el icono del login, del splash nativo y del cargador intermedio.
  `BootLoader` usa un fondo neutro con un indicador mínimo. App icon/adaptive
  icon se conservan porque identifican la app instalada, no el arranque.
- Conservados sin cambios los flujos de autenticación, incluido Google PKCE, el
  tratamiento de errores de magic links, los enlaces legales y la adaptación a
  tema, accent, texto grande, accesibilidad y Reducir movimiento.
- La burbuja usa `GlassSurface` con Liquid Glass `clear` nativo en iOS 26, sin
  tinte opaco y con una lente SVG neutra (doble borde, reflejos difusos y
  caústicas suaves); el texto de arrastre queda detrás para refractarse. En el
  resto conserva el fallback translúcido con la misma óptica. Durante el gesto,
  un Runtime Shader de `@shopify/react-native-skia@2.2.12` dibuja una retina
  dinámica cian/azul/violeta/rosa con el accent de la app; baja con el dedo y
  desaparece al completar el encaje. Skia se carga de forma perezosa y una OTA
  instalada sobre un binario antiguo usa una retina SVG sin crashear. El
  cristal no captura eventos: el `GestureDetector` exterior mantiene el
  arrastre fiable y evita el conflicto observado con `GlassView`.
- Validado en iPhone 15 Pro simulado: gesto corto con retorno, gesto completo,
  retina durante el arrastre, despliegue de los 18 logos y apertura del
  formulario de correo sin solapes. El cliente nativo se recompiló para enlazar
  Skia y arrancó correctamente en iOS 26.5.
- `npm run quality` correcto después del shader: typecheck, lint sin warnings y
  27/27 tests.

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
  el teclado, el contenido intermedio es desplazable sin perder la acción.
- Generada e integrada `assets/mascot/berenjena-grupo.png` (1024×1536, PNG
  RGBA): la berenjena empuja el carrito, el plátano va dentro y el tomate queda
  a la derecha; las tres mascotas saludan. `createGroup`, los hápticos, el toast
  y el carácter opcional del paso se conservan sin cambios de backend.
- Corregida la máscara alfa de los huecos interiores del carrito: ya no quedan
  placas blancas entre las barras, bajo la cesta ni alrededor de las ruedas.
- Igualado al morado de la mano el reflejo casi blanco que ocupaba el dedo
  central levantado de la berenjena, conservando un brillo pequeño y natural.
- `npm run quality` correcto (typecheck, lint y 27/27 tests).

## Hipercor (pendiente de migrar y primer sync, 2026-08-15)

- La POC terminó correctamente en GitHub Actions con Google Chrome. El sync
  completo queda en `scripts/sync-hipercor.mjs`, con workflow diario
  `sync-hipercor.yml` y esquema `supabase/migrations/hipercor_catalog.sql`.
- Ejecutar primero la migración y luego el workflow manual. El guardarraíl
  exige 10.000 productos antes de modificar Supabase. El catálogo representa
  únicamente el centro público sin CP/dirección; aún no añadir Hipercor al
  cliente, filtros ni comparativa hasta validar ese primer run.

## Actualización Fase 3 (2026-08-14)

Desplegada y verificada en Supabase, todavía sin commit local:

- Auditoría real: 44 avisos de seguridad y 121 de rendimiento.
- Nueva migración `20260814141719_phase_3_security_performance_hardening.sql`:
  rutas seguras de funciones, RPC privilegiados sin acceso anónimo, RLS
  consolidada y optimizada, y seis índices de claves foráneas.
- Resultado: seguridad 44→20 y rendimiento 121→69. Los seis índices nuevos aún
  figuran «sin uso» porque no han recibido tráfico suficiente.
- SQL validado, preflight correcto, verificador ejecutado y policies compiladas
  con rol autenticado. Falta QA manual con cuentas reales en la app.
- La repetición final de `npm run quality` queda bloqueada por trabajo local
  concurrente de Froiz/Gadis con errores TypeScript; no pertenece a la Fase 3 y
  no se modificó durante este despliegue.
- Debe aplicarse después de scripts legacy que vuelvan a crear estas funciones o
  policies. No mover `pg_trgm` ni borrar índices «sin uso» sin métricas.
- Reversión funcional disponible en `supabase/ops/rollback_phase_3_access_changes.sql`.
- Ajuste manual pendiente: activar leaked-password protection en Supabase Auth.

Detalle: `FASE-3-SEGURIDAD-RENDIMIENTO-DATOS.md`.

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
| 8 | Eroski | Tapestry (`lib/eroski-tapestry.mjs`) | ✅ `6e72611` | ⚠️ nutrición | es-only, sin €/ud/EAN; nutrición PDP incremental local. |
| 9 | Caprabo | Tapestry (compartido con Eroski) | ✅ `6e72611` | ⚠️ nutrición | Idem Eroski. |
| 10 | Condis | Empathy.co API JSON abierta | ⚠️ dudoso | ⚠️ | Bilingüe. Sin ficha v1. "Commit en espera" por Ametller → VERIFICAR. |
| 11 | Ametller | SCAPI Salesforce (guest PKCE) | ❌ local | ⚠️ | Bilingüe + ficha + EAN. Logo placeholder. |
| 12 | Aldi | SSR Algolia embebido (`__NEXT_DATA__`) | ❌ local | ⚠️ | es-only, sin EAN. Guardarraíl <800. Logo placeholder. |
| 13 | Hiperdino | Magento 2 GraphQL abierto | ❌ local | ⚠️ | **SOLO Canarias (IGIC)** → filtrar por comunidad. es-only, sin ficha/EAN/€ud. |
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
  `.p8` + secrets + deploy**. (Nota: `AGENTS.md`/`AGENTS` viejo decía Expo v56 — el proyecto es SDK 54.)
- **Insignia verificado** (dorada): `profiles.verified` (marca manual) + `VerifiedBadge`. Falta `profile_verified.sql`.
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
