# Monetización — "QuéFalta Plus"

> Spec por fases del modelo freemium. Decisiones cerradas en junio 2026.
> Estado premium en código desde Fase 1; el paywall está activado localmente para continuar su desarrollo, con los gates del servidor aún apagados.

## Decisiones cerradas

- **Plan:** suscripción "QuéFalta Plus" — **1,99 €/mes** y **11,99 €/año** (con prueba
  gratis de 7 días en el anual como oferta introductoria).
- **Premium es por usuario, no por grupo.** Si en una pareja paga uno, el otro sigue
  en free. El paywall habla de "tu cuenta", no de "tu grupo".
- **Neto real por suscriptor mensual:** ~1,40 € (1,99 € − IVA 21% − 15% Apple
  Small Business Program).
- Se lanza **con el modelo puesto desde el día 1** (nadie pierde nada que tuviera) y
  se regala Plus a los testers de TestFlight previos al lanzamiento.

## Free vs Plus

| | Free | Plus |
|---|---|---|
| Catálogo, búsqueda, favoritos, novedades | ✅ por supermercado | ✅ todos a la vez |
| Unirse a grupos (enlace de invitación) | ✅ **ilimitado, siempre** | ✅ |
| Crear grupos | 1 | Ilimitados |
| Comparador "Más barato en otros súper" | Teaser: muestra que existe y en qué súper, precio/producto bloqueados 🔒 | Completo |
| Repetir compras del historial | Las 3 más recientes | Todo el historial |
| Futuro: alertas de bajada de precio, histórico de precios | — | ✅ |
| Estadísticas personales de compra (supermercados, categorías y productos) | — | ✅ |
| Extra cosmético: accents exclusivos | — | ✅ |

## Beneficios comunicados en el paywall (2026-08-11)

- Ordenar los productos por precio unitario para comparar por kg, litro o unidad.
- Aplicar filtros avanzados en Ofertas, Cambios de precio y Novedades.
- Seleccionar **Todos** los supermercados y consultarlos en una sola vista.
- Crear notificaciones personalizadas para productos.
- Consultar estadísticas personales de supermercados, categorías y productos más comprados.

El modal presenta estos beneficios como propuesta comercial principal. El
plan anual sigue preseleccionado, con 7 días gratis, y el mensual permanece como
alternativa. Compra, restauración, precios localizados y enlaces legales conservan el
flujo de RevenueCat existente.

**Regla de oro:** unirse a grupos y colaborar en tiempo real jamás se paywallea — el
enlace de invitación es el único mecanismo viral de la app. Y el comparador nunca se
apaga del todo en free: el teaser es a la vez la feature y su propio anuncio.

## Fases

### Fase 0 — Papeleo (manual, en paralelo) ⏳
- [ ] Acuerdo de apps de pago en App Store Connect (datos fiscales + bancarios).
- [ ] Alta en Apple Small Business Program (15%).
- [ ] Grupo de suscripción "QuéFalta Plus" con los 2 productos (mensual/anual) + intro
      offer 7 días en el anual.
- [ ] Cuenta RevenueCat conectada a App Store Connect.
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
- [x] `src/constants/limits.ts`: `PAYWALL_ENABLED = true` para desarrollo local, `FREE_LIMITS`,
      `limitsApply(isPremium)` (el gate estándar — NUNCA comprobar isPremium a secas).
- [x] `UserProfile.premiumUntil` en `src/api/profile.ts`.
- [x] `isPremium` expuesto por `ProfileContext`.

### Fase 2 — Gates, apagados tras el flag ✅ (código; SQL pendiente de ejecutar)
- [x] **Servidor** (`supabase/migrations/paywall_gates.sql`, **ejecutar ANTES de
      re-ejecutar `similar_products.sql`**): `paywall_enabled()` (flag servidor,
      hoy `false` — Fase 4 = re-ejecutar con `true`), `is_premium(uid)` y trigger
      `groups_enforce_limit` que cuenta `groups.created_by` para no-premium
      (error `free_group_limit`, el cliente lo reconoce y abre el paywall).
- [x] Grupos: `handleNewGroup` en `GroupsScreen` comprueba el límite con `createdBy`
      (ser miembro no cuenta) y abre paywall; `handleCreate` captura `free_group_limit`.
- [x] Comparador: `similar_products` devuelve columna `locked` (tienda visible,
      producto/precios a NULL para free con paywall activo); `SimilarProductsSection`
      pinta la fila teaser con candado → paywall. El cliente tolera el RPC viejo sin
      la columna. ⚠️ Siguen pendientes el fix bonÀrea y la re-ejecución del RPC.
- [x] Historial: en `HistoryScreen` solo se repiten las `maxRepeatableHistory` más
      recientes (ver el historial es libre); el resto muestra "Repetir con Plus" 🔒
      (gate solo cliente, no merece servidor).
- [x] Paywall: `src/components/PaywallModal.tsx` — beneficios, 2 planes (anual
      preseleccionado con "7 días gratis"), CTA placeholder (toast hasta Fase 3),
      "Restaurar compras" y enlaces a quefalta.es/condiciones y /privacidad
      (⚠️ esas páginas hay que crearlas en el repo web — Fase 0). Es un **Modal
      anidable, no pantalla de stack**: el comparador vive dentro de los modales de
      producto y ahí una pantalla quedaría tapada; el patrón de la app es apilar
      modales. Entrada también en Perfil (tarjeta Plus, oculta con el flag apagado).

### Fase 3 — Cobro real (RevenueCat) ✅ código · ⏳ cuentas y pruebas
- [x] `react-native-purchases` v10 instalado + wrapper `src/lib/purchases.ts`:
      degrada a placeholder sin módulo nativo (Expo Go) o sin
      `EXPO_PUBLIC_REVENUECAT_IOS_KEY` en el entorno. **Requiere dev build nuevo.**
- [x] SDK configurado al iniciar sesión (`AuthContext`): `appUserID` = uid de
      Supabase (así el webhook sabe qué fila tocar); `logOut` al cerrar sesión.
- [x] `PaywallModal` conectado: offerings reales al abrir (precio localizado de la
      tienda con fallback a los estáticos), compra con spinner, restore, y refresco
      del perfil con reintentos tras comprar (el webhook tarda unos segundos).
- [x] Edge Function `revenuecat-webhook`: para todo evento relevante,
      `premium_until = expiration_at_ms` (cubre compra/renovación/cancelación/
      expiración/billing issue). Autentica por header `Authorization` == secret
      `RC_WEBHOOK_TOKEN`; desplegar con `--no-verify-jwt`.
- [ ] **Manual — RevenueCat dashboard:** proyecto + app iOS, entitlement **`plus`**
      (el id exacto que espera `lib/purchases.ts`), productos mensual/anual ligados
      a App Store Connect, offering `default` con paquetes `$rc_monthly`/`$rc_annual`.
      Copiar la API key pública iOS a `.env.local` y a EAS env vars como
      `EXPO_PUBLIC_REVENUECAT_IOS_KEY`.
- [ ] **Manual — webhook:** `supabase secrets set RC_WEBHOOK_TOKEN=<token largo>` →
      `supabase functions deploy revenuecat-webhook --no-verify-jwt` → en RevenueCat
      → Integrations → Webhooks poner la URL de la función y ese mismo token en el
      header Authorization.
- [ ] Pruebas sandbox vía TestFlight: compra, renovación acelerada, expiración,
      restore en dispositivo nuevo, y verificar que `premium_until` se mueve en BD.

### Fase 4 — Encendido y lanzamiento (runbook)

Preparado en código/SQL: `PAYWALL_ENABLED = true` en limits.ts para desarrollo
local, `migrations/paywall_on.sql` (encendido servidor) y
`ops/grant_plus_testers.sql` (regalo a testers). ⚠️ El servidor continúa apagado;
no debe activarse hasta completar la configuración externa y las pruebas sandbox.

**Prerrequisitos (bloqueantes, en orden):**
- [ ] Migraciones base ejecutadas: `profile_premium.sql` → `paywall_gates.sql` →
      `similar_products.sql`.
- [ ] App Store Connect: acuerdo Paid Apps activo; metadatos de las 2 suscripciones
      completos (precio, localización, intro 7 días en la anual, MISMO nivel,
      captura de revisión); estado "Listo para enviar".
- [ ] RevenueCat: productos importados y atados al entitlement `plus`; offering
      `default` con `$rc_monthly`/`$rc_annual`; API key iOS en `.env.local` Y en
      EAS env vars como `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (**aún falta en ambos**).
- [ ] Webhook desplegado: `supabase secrets set RC_WEBHOOK_TOKEN=...` →
      `supabase functions deploy revenuecat-webhook --no-verify-jwt` → URL + token
      en RevenueCat → Integrations → Webhooks.
- [ ] Sandbox OK en dev build/TestFlight (F3): compra, renovación, expiración,
      restore, y `premium_until` moviéndose en BD.

**Día de lanzamiento (orden):**
1. [ ] Regalar Plus a los testers: `ops/grant_plus_testers.sql` (opción A).
2. [ ] Encender servidor: `migrations/paywall_on.sql`.
3. [ ] Build de release (el cliente ya está en true) + subir a App Store Connect.
4. [ ] ⚠️ En la página de la versión, seleccionar las 2 suscripciones en "Compras
      dentro de la app y suscripciones" — la PRIMERA suscripción solo pasa revisión
      junto a una versión nueva.
5. [ ] Enviar a revisión → publicar → anunciar en IG (ángulo: early testers con
      Plus de por vida, construyendo en público).

**Apagado de emergencia:** re-ejecutar `paywall_enabled()` con `select false`
(apaga comparador y límite de grupos al instante sin build); los gates de cliente
caen en el siguiente build con `PAYWALL_ENABLED = false`.

### Fase 5 — Premium que vende solo (post-lanzamiento)
- [ ] Histórico de precios por producto + alertas de bajada (el sync diario ya genera el dato).
- [x] Estadísticas personales de compra: supermercados, categorías y productos más comprados.
- [ ] Accents exclusivos Plus en Apariencia.
