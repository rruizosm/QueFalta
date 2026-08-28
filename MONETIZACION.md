# Monetización — "QuéFalta Plus"

> Spec por fases del modelo freemium. Decisiones cerradas en junio 2026.
> Estado premium en código desde Fase 1; paywall de cliente y gates del servidor activados para la revisión de la versión 1.3 el 2026-08-25.

## Decisiones cerradas

- **Plan:** suscripción "QuéFalta Plus" — **3,99 €/mes** y **19,99 €/año** (con prueba
  gratis de 7 días en el anual como oferta introductoria).
- **Premium es por usuario, no por grupo.** Si en una pareja paga uno, el otro sigue
  en free. El paywall habla de "tu cuenta", no de "tu grupo".
- **Neto real por suscriptor mensual:** ~2,80 € (3,99 € − IVA 21% − 15% Apple
  Small Business Program).
- Se lanza **con el modelo puesto desde el día 1** (nadie pierde nada que tuviera) y
  se regala Plus a los testers de TestFlight previos al lanzamiento.

## Free vs Plus

| | Free | Plus |
|---|---|---|
| Catálogo, búsqueda, favoritos, novedades | ✅ por supermercado; cuentas anteriores a 1.3 conservan «Todos» | ✅ todos a la vez |
| Unirse a grupos (enlace de invitación) | ✅ **ilimitado, siempre** | ✅ |
| Crear grupos | ✅ ilimitados | ✅ ilimitados |
| Comparador "Más barato en otros súper" | 3 búsquedas por cuenta; después abre Plus | Ilimitado |
| Consultar y repetir compras del historial | ✅ ilimitado | ✅ ilimitado |
| Asignar productos alternativos a comentarios de la cesta | Bloqueado 🔒 | ✅ |
| Ordenar Novedades por precio unitario | Bloqueado 🔒 | ✅ |
| Alertas personalizadas de precio y ofertas | 1 alerta | Ilimitadas |
| Estadísticas personales de compra (supermercados, categorías y productos) | — | ✅ |
| Extra cosmético: accents exclusivos | — | ✅ |

## Beneficios comunicados en el paywall (2026-08-11)

- Ordenar los productos por precio unitario para comparar por kg, litro o unidad.
- **Radar de ahorro ilimitado:** seguir encontrando alternativas similares después de las 3 búsquedas gratuitas.
- Aplicar filtros avanzados en Ofertas, Cambios de precio y Novedades.
- Seleccionar **Todos** los supermercados y consultarlos en una sola vista.
- Crear alertas personalizadas ilimitadas después de la primera gratuita.
- Asignar productos alternativos a los comentarios de la cesta.
- Consultar estadísticas personales de supermercados, categorías y productos más comprados.

El modal de altura completa presenta estos beneficios como propuesta comercial principal. Su
cabecera compacta muestra el sello dorado que identifica una cuenta Plus junto
a «QuéFalta Plus», sin un bloque de eslogan independiente ni la etiqueta
«Incluido» junto a los beneficios. Mensual y Anual se muestran en dos columnas
de una sola fila; el anual sigue preseleccionado, ofrece 7 días gratis y lleva
un barrido azul difuminado basado en el antiguo botón QuéCocino. Su etiqueta
«Mejor precio» conserva el fondo dorado animado de `PremiumGoldBackground`.
El CTA bajo demanda del comparador permite tres búsquedas gratuitas por cuenta
y muestra el cupo restante tras cada uso. El cuarto intento abre el paywall sin
ejecutar la búsqueda. Con Plus activo el flujo es ilimitado. Compra, restauración, precios
localizados y enlaces legales conservan el flujo de RevenueCat existente.

No muestra tirador ni admite cierre por arrastre o toque exterior. El contenido
respeta las zonas seguras y el cierre queda en la X o Atrás del sistema.

**Regla de oro:** crear grupos, unirse a ellos y colaborar en tiempo real jamás
se paywallea. Las cuentas gratuitas conservan una alerta personalizada y tres
búsquedas del comparador; Plus amplía ambos beneficios sin límite.

## Fases

### Fase 0 — Papeleo (manual, en paralelo) ⏳
- [x] Acuerdo de apps de pago en App Store Connect activo (confirmado el
      2026-08-27 tras la revisión de la versión 1.3).
- [ ] Alta en Apple Small Business Program (15%).
- [x] Grupo de suscripción "QuéFalta Plus" creado en App Store Connect, ambos
      productos en el nivel 1: `com.quefalta.app.plus.monthly` (3,99 €/mes) y
      `com.quefalta.app.plus.annual` (19,99 €/año), con prueba introductoria de
      7 días en el anual. Disponibilidad inicial: España; localizaciones ES/CA.
- [x] App iOS `com.quefalta.app` conectada a RevenueCat. La clave de compras dentro
      de la app figura como válida; la clave de App Store Connect para importación
      automática de productos continúa pendiente.
- [x] Términos de servicio + política de privacidad redactados en quefalta-web
      (`src/pages/condiciones.astro` y `privacidad.astro`, enlazados en el footer).
      ⚠️ Antes de publicar: sustituir el placeholder `[NOMBRE LEGAL]` en ambas
      páginas, desplegar la web, e idealmente pasarlas por un profesional.
- [x] Precios y modelo decididos.

### Fase 1 — Cimientos (estado premium, invisible) ✅
- [x] Migración `supabase/migrations/profile_premium.sql`: columna
      `profiles.premium_until timestamptz` + trigger que impide que anon/authenticated
      la modifiquen (sin él, la policy UPDATE de profiles dejaría auto-asignarse premium).
      **Pendiente de ejecutar en Supabase → SQL Editor** (sin ella, fetchProfile falla).
- [x] `src/constants/limits.ts`: `PAYWALL_ENABLED = true` para desarrollo local y
      `limitsApply(isPremium)` (el gate estándar — NUNCA comprobar isPremium a secas).
- [x] `UserProfile.premiumUntil` en `src/api/profile.ts`.
- [x] `isPremium` expuesto por `ProfileContext`.
- [x] `profiles.verified` redefinido como reflejo público protegido de una fecha
      `premium_until` vigente. `profile_verified.sql` hace backfill e instala el
      trigger; permite mostrar la insignia en Amigos/Grupos sin exponer el vencimiento.

### Fase 2 — Gates, apagados tras el flag ✅ (código; SQL pendiente de ejecutar)
- [x] **Servidor** (`supabase/migrations/paywall_gates.sql`, **ejecutar ANTES de
      re-ejecutar `similar_products.sql`**): `paywall_enabled()` (flag servidor,
      hoy `false` — Fase 4 = re-ejecutar con `true`) e `is_premium(uid)` para los
      gates Plus restantes. No limita la creación de grupos.
- [x] Grupos: crear y unirse a grupos es ilimitado para todas las cuentas.
      `GroupsScreen` abre siempre el formulario y la migración
      `20260821175745_allow_unlimited_group_creation.sql` retira el antiguo trigger.
- [x] Comparador: `SimilarProductsSection` permite tres búsquedas por cuenta
      gratuita y abre el paywall en la cuarta; Plus es ilimitado. La cuota se
      reserva en servidor dentro de `catalog_cheaper_products_v6` y v5 queda
      protegida para clientes anteriores. Las migraciones de cupo y policy
      privada están desplegadas y verificadas en producción. Estos dos cupos se
      aplican antes del encendido comercial aunque `paywall_enabled()` sea false.
- [x] Historial: consultar y repetir cualquier compra es gratuito e ilimitado.
      `HistoryScreen` no contiene gates, límites ni accesos al paywall.
- [x] Comentarios de la cesta: escribir, editar y borrar comentarios es gratuito.
      Asignar o cambiar el producto alternativo asociado requiere Plus y abre el
      paywall sin iniciar la búsqueda. Una alternativa ya guardada puede seguir
      viéndose, conservarse al editar el texto o eliminarse sin suscripción.
- [x] Novedades: los dos sentidos del orden por precio unitario requieren Plus.
      En free abren el paywall sin aplicar el orden; una expiración limpia la
      selección unitaria que siguiera activa. El orden por precio total es libre.
- [x] Selector «Todos»: las cuentas ya registradas antes de 1.3 conservan el
      acceso en Catálogo, Novedades, Ofertas y Cambios de precio sin desbloquear
      ningún otro gate. `profiles.legacy_all_stores_access` guarda el permiso y
      un trigger impide que el cliente se lo autoasigne.
- [x] Paywall: `src/components/PaywallModal.tsx` — beneficios, 2 planes (anual
      preseleccionado con "7 días gratis"), CTA placeholder (toast hasta Fase 3),
      "Restaurar compras" y enlaces a quefalta.es/condiciones y /privacidad
      (⚠️ esas páginas hay que crearlas en el repo web — Fase 0). Es un **Modal
      anidable, no pantalla de stack**: el comparador vive dentro de los modales de
      producto y ahí una pantalla quedaría tapada; el patrón de la app es apilar
      modales. La entrada de Perfil vive en Cuenta: abre el paywall para free y
      la gestión oficial de tienda para una suscripción activa. La tarjeta de
      identidad no contiene ya ningún acceso promocional Plus.

### Fase 3 — Cobro real (RevenueCat) ✅ código · ⏳ cuentas y pruebas
- [x] `react-native-purchases` v10 instalado + wrapper `src/lib/purchases.ts`:
      degrada a placeholder sin módulo nativo (Expo Go) o sin
      `EXPO_PUBLIC_REVENUECAT_IOS_KEY` en el entorno. **Requiere dev build nuevo.**
- [x] SDK configurado al iniciar sesión (`AuthContext`): `appUserID` = uid de
      Supabase (así el webhook sabe qué fila tocar); `logOut` al cerrar sesión.
- [x] `PaywallModal` conectado: offerings reales al abrir (precio localizado de la
      tienda con fallback a los estáticos), compra con spinner, restore, y refresco
      del perfil con reintentos tras comprar (el webhook tarda unos segundos). La
      bienvenida solo aparece si RevenueCat devuelve el entitlement `plus` activo;
      no existe ya el atajo de vista previa que simulaba la activación.
- [x] Activación sin carrera: el entitlement validado se conserva localmente un
      máximo de 60 segundos aunque un primer fetch de Supabase siga antiguo, y la
      Edge Function autenticada `sync-plus-subscription` consulta RevenueCat con
      `REVENUECAT_REST_API_KEY` para persistir el acceso sin esperar al webhook.
      No recibe uid ni expiración del cliente; el webhook mantiene el ciclo futuro.
- [x] Perfil → Cuenta expone QuéFalta Plus para free y premium: free abre el
      paywall; una suscripción real abre la gestión oficial de la tienda mediante
      `CustomerInfo.managementURL` (con fallback nativo), y el Plus regalado sin
      entitlement aparece como «De cortesía» sin falsa cancelación.
- [x] Edge Function `revenuecat-webhook`: para todo evento relevante,
      `premium_until = expiration_at_ms` y sincroniza `verified` (cubre compra/
      renovación/cancelación/expiración/billing issue). Autentica por header `Authorization` == secret
      `RC_WEBHOOK_TOKEN`; desplegar con `--no-verify-jwt`.
- [x] **RevenueCat dashboard — catálogo:** entitlement **`plus`**, offering
      **`default`** y paquetes `$rc_monthly`/`$rc_annual`. Cada paquete contiene
      ya su producto de Test Store, Apple (`com.quefalta.app.plus.monthly` /
      `.annual`) y Google (`quefalta_plus:monthly` / `:annual`). App Android
      `com.quefalta.app` creada en RevenueCat.
- [ ] **RevenueCat — credenciales:** copiar la API key pública iOS y la pública
      Android a `.env.local` y a EAS; añadir la clave App Store Connect para
      importación/sincronización, el JSON de cuenta de servicio de Google Play y
      guardar `REVENUECAT_REST_API_KEY` como secret de Supabase.
- [ ] **Google Play:** la suscripción `quefalta_plus` y sus textos ES/CA están
      creados. Google no permite guardar todavía los planes `monthly` y `annual`:
      primero exige subir a cualquier canal (sirve prueba interna) una build que
      incluya Google Play Billing/RevenueCat. Después crear 3,99 €/mes y
      19,99 €/año, y la oferta anual de 7 días; no activar hasta las pruebas.
- [ ] **Manual — webhook:** `supabase secrets set RC_WEBHOOK_TOKEN=<token largo>` →
      `supabase functions deploy revenuecat-webhook --no-verify-jwt` → en RevenueCat
      → Integrations → Webhooks poner la URL de la función y ese mismo token en el
      header Authorization. `sync-plus-subscription` v1 ya está desplegada con
      verificación JWT; falta guardar `REVENUECAT_REST_API_KEY` para activarla.
- [ ] Pruebas sandbox vía TestFlight: compra, renovación acelerada, expiración,
      restore en dispositivo nuevo, y verificar que `premium_until` se mueve en BD.

### Fase 4 — Encendido y lanzamiento (runbook)

Preparado en código/SQL: `PAYWALL_ENABLED = true` en limits.ts,
`migrations/paywall_on.sql` (encendido servidor) y
`ops/grant_plus_testers.sql` (regalo a testers). El servidor se encendió y se
verificó en producción el 2026-08-25 para enviar la versión 1.3 a revisión.

**Prerrequisitos (bloqueantes, en orden):**
- [ ] Migraciones base ejecutadas: `profile_premium.sql` → `paywall_gates.sql` →
      `similar_products.sql`.
- [ ] App Store Connect: precio, localización, prueba anual y mismo nivel ya están
      configurados; faltan confirmar el acuerdo Paid Apps, subir las capturas de
      revisión y dejar ambos productos "Listos para enviar".
- [ ] RevenueCat: catálogo, entitlement y offering ya están configurados para
      Apple y Google; faltan credenciales de tienda, API keys públicas en
      `.env.local`/EAS y validar que los productos se resuelven desde una build.
- [ ] Webhook desplegado: `supabase secrets set RC_WEBHOOK_TOKEN=...` →
      `supabase functions deploy revenuecat-webhook --no-verify-jwt` → URL + token
      en RevenueCat → Integrations → Webhooks.
- [ ] Sandbox OK en dev build/TestFlight (F3): compra, renovación, expiración,
      restore, y `premium_until` moviéndose en BD.

**Día de lanzamiento (orden):**
1. [x] Snapshot legacy aplicado y ampliado con
       `20260824174500_grant_legacy_all_stores_to_pre_1_3_accounts.sql`: las
       4.054 cuentas existentes conservan «Todos» tras repetirlo el 2026-08-25.
       Repetir una última vez justo antes de publicar la 1.3.
2. [ ] Regalar Plus a los testers: `ops/grant_plus_testers.sql` (opción A).
3. [x] Encender servidor: `migrations/paywall_on.sql` aplicado y
       `paywall_enabled() = true` verificado el 2026-08-25.
4. [ ] Build de release (el cliente ya está en true) + subir a App Store Connect.
5. [ ] ⚠️ En la página de la versión, seleccionar las 2 suscripciones en "Compras
      dentro de la app y suscripciones" — la PRIMERA suscripción solo pasa revisión
      junto a una versión nueva.
6. [ ] Enviar a revisión → publicar → anunciar en IG (ángulo: early testers con
      Plus de por vida, construyendo en público).

**Apagado de emergencia:** re-ejecutar `paywall_enabled()` con `select false`
(apaga los gates Plus de servidor al instante sin build); los gates de cliente
caen en el siguiente build con `PAYWALL_ENABLED = false`.

### Fase 5 — Premium que vende solo (post-lanzamiento)
- [x] MVP local de alertas personalizadas: producto exacto o palabras,
      multi-súper, bajada mínima, oferta y vista previa. Free conserva una regla
      activa y Plus reglas ilimitadas; al caducar Plus solo la regla free más
      reciente sigue entregando. El cupo está desplegado y verificado; sigue
      pendiente desplegar el procesador/Cron y validar las entregas end-to-end.
- [ ] Histórico de precios por producto visible para el usuario.
- [x] Estadísticas personales de compra: supermercados, categorías y productos más comprados.
- [ ] Accents exclusivos Plus en Apariencia.
