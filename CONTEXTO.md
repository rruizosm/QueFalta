# QuéFalta — Contexto del proyecto

> Documento de contexto para agentes (Claude Code) y nuevos colaboradores.
> Resume identidad, arquitectura, decisiones clave y estado. Mantener al día.

## Identidad
- **Nombre:** QuéFalta (antes "MercaApp"/"LaCompra"). La carpeta del repo sigue llamándose `MercaAppMobile`.
- **Qué es:** app móvil para organizar la compra **en grupo** (lista compartida en tiempo real, carrito por grupos) con catálogo real de **Mercadona**.
- **Stack app:** Expo **SDK 54**, React Native 0.81.5, TypeScript. Backend **Supabase** (auth + Postgres + storage + edge functions). Catálogo: **API pública de Mercadona** (`https://tienda.mercadona.es/api`).
- **iOS:** bundle `com.quefalta.app`, scheme `quefalta`, Apple Team ID `LX4BLQDZS4`, EAS projectId `cdae19f5-47a5-4a4c-9f94-2befcada0885`.
- **Dominio:** `quefalta.es` (web Astro, repo aparte).
- **Repos:** app → `github.com/rruizosm/QueFalta` · web → `github.com/rruizosm/QueFalta-Web` (carpeta hermana `quefalta-web/`, NO está en este repo).

## ⚠️ Imprescindible para arrancar en una máquina nueva
`.env.local` está **gitignored** (no viaja con el repo). Sin él, Supabase no funciona. Crear en la raíz de `MercaAppMobile`:
```
EXPO_PUBLIC_SUPABASE_URL=https://gkffvigcnsesbaihycay.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key del dashboard de Supabase>
```
La anon key se copia de Supabase → Project Settings → API. (Es pública/segura por RLS, pero no se commitea.)

## Cómo ejecutar
- **Dev rápido (Expo Go):** `npx expo start` (en Windows con varios adaptadores de red, fijar IP de Wi-Fi: `REACT_NATIVE_PACKAGER_HOSTNAME=<ip>` y usar `--offline` si el CLI crashea con error `body`).
- **Mac / simulador iOS:** `npx expo run:ios` (hace prebuild + pods + build + Metro). Para iPhone USB: `npx expo run:ios --device`.
- **Dev build (EAS):** perfil `development` en `eas.json` (`developmentClient: true`). Expo Go NO soporta push notifications ni Universal Links → para eso hace falta dev build.

## Estructura
- `src/screens/` — Home, Catalog, SubCategory, Products, List, Groups, GroupDetail, Login, Profile, EditProfile, PrivacySecurity, DefaultGroup, Appearance (color de la app).
- `src/context/` — `AuthContext` (sesión), `ProfileContext` (perfil cacheado), `CartContext` (carrito activo + grupo por defecto), `ThemeContext` (accent elegido + `useThemedStyles`), `AppContext` (placeholder).
- `src/api/` — `profile`, `groups`, `lists`, `mercadona`, `account`.
- `src/lib/` — `supabase` (cliente), `notifications` (locales).
- `src/navigation/index.tsx` — Bottom Tabs + stacks; maneja deep links de invitación.
- `supabase/functions/delete-account/` — Edge Function de borrado de cuenta.

## Decisiones clave y gotchas (NO romper)
- **Login Google OAuth = PKCE.** `src/lib/supabase.ts` usa `flowType: 'pkce'`. En `AuthContext` (nativo): tras `WebBrowser.openAuthSessionAsync`, **extraer el `code` de la URL** (`Linking.parse(url).queryParams.code`) y pasar SOLO el code a `exchangeCodeForSession`. Pasar la URL entera da `invalid flow state`. La redirect URL del build será `quefalta://auth/callback` → debe estar en Supabase → Auth → URL Configuration (ya hay comodines `exp://**`, `exp://*.exp.direct/**`).
- **ProfileContext** carga el perfil UNA vez al haber sesión → evita el "flash" de campos vacíos al editar. Al guardar, `applyProfile(patch)` actualiza la caché.
- **Invitaciones por enlace:** `getInviteLink` devuelve `https://quefalta.es/join/{id}` (Universal Link). La recepción está en `navigation/index.tsx` (`parseInviteUrl` + listener de `Linking` → `joinGroup` → navega). `app.json` tiene `ios.associatedDomains: ["applinks:quefalta.es"]`. El fichero AASA vive en el repo web (`quefalta-web/public/.well-known/apple-app-site-association`, appID `LX4BLQDZS4.com.quefalta.app`, paths `/join/*`). Universal Links solo funcionan en build real + web desplegada.
- **Notificaciones:** Fase 1 (locales) hecha (`src/lib/notifications.ts`, toggle en ProfileScreen). Fase 2 (push) pendiente: requiere dev build + tabla `push_tokens` + Edge Function de envío. Ver `NOTIFICACIONES.md`.
- **Privacidad y seguridad:** `signOut('global')`, columna `discoverable` en profiles (el toggle se guarda pero aún no hay búsqueda por @usuario que lo aplique), y "Eliminar cuenta" vía Edge Function `delete-account` (hay que desplegarla: `supabase functions deploy delete-account`). Ver `PRIVACIDAD-SEGURIDAD.md`.
- **Imágenes de producto:** `list_items.image_url` se guarda al añadir (de `thumbnail` de Mercadona). `ProductDetailModal` consulta `GET /products/{id}/` y limpia el HTML que devuelve la API.
- **Tipos:** existe `src/types.ts` Y `src/types/index.ts`; el import `'../types'` resuelve a `types.ts`. Producto de API = `MercadonaProduct` (no `Product`).
- **Tema (color de la app):** Perfil → Apariencia permite elegir el accent (`ACCENT_OPTIONS` en `constants/colors.ts`; persistido en AsyncStorage `@accent_color`). `colors.accent/accentLight/accentMid` son **getters** sobre un valor mutable (`applyAccent`). Los `StyleSheet.create` que usan accent NO pueden ser estáticos: se definen como fábrica `const themedStyles = () => StyleSheet.create({...})` y se consumen con `const styles = useThemedStyles(themedStyles)` (de `ThemeContext`), que los recrea al cambiar el color. Si añades una pantalla/componente nuevo que use `colors.accent*` en su StyleSheet, sigue ese patrón; si solo lo usa inline en JSX basta con que el padre re-renderice (no hay React.memo en el código).

## Migraciones SQL pendientes en Supabase (ejecutar a mano)
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
- Tras las dos anteriores, **re-ejecutar `similar_products.sql`** (ya incluye los brazos de consum y dia, y sus marcas blancas en la limpieza del needle).
- Hay SQL previo en `supabase/` (RLS, policies de groups/group_members/shopping_lists/list_items).

## Estado / pendientes
- ✅ App funcional en Expo Go: auth, grupos, carrito, catálogo, perfil, notificaciones locales, privacidad.
- ⏳ Desplegar `quefalta-web` en Vercel + DNS de `quefalta.es` (Hostinger: A `@` → IP de Vercel, CNAME `www` → `cname.vercel-dns.com`).
- ⏳ Primer `eas build` iOS / `expo run:ios` para probar en dispositivo y los Universal Links.
- ⏳ URL real de App Store (sustituir `#`/`APP_STORE_URL` en la web).
- ⏳ **Consum añadido como 5º súper** (2026-06-12): código completo — sync (`scripts/sync-consum.mjs`, API REST abierta de Consum, DRY_RUN completo OK: 9.351 productos), espejo (`consum_catalog.sql`), app (stores/catalog/pantalla/modales) y comparativa. Pendiente: ejecutar la migración en Supabase, primer run real del sync y re-ejecutar `similar_products.sql`. Consum es el único súper con EAN y marca estructurados.
- ⏳ **Dia añadido como 6º súper** (2026-06-12): código completo — sync (`scripts/sync-dia.mjs`, SSR Vike de dia.es con JSON `vike_pageContext` embebido, DRY_RUN completo OK: 5.433 productos en 287 N2, ~6 min), espejo (`dia_catalog.sql`), app y comparativa. Mismos pendientes que Consum (migración + run + `similar_products.sql`). `lib/price.mjs` ahora convierte DOCENA→€/ud.
- ⏳ Comparativa de productos similares entre supers (detalle de producto) — spec por fases en `COMPARATIVA.md`. Fases 0–2 ✅ en código (sección "Más barato en otros súper" vía `SimilarProductsSection` en los 4 modales; RPC `similar_products` aplicado). Pendiente: re-lanzar workflow bonÀrea (fix de base €/unidad), re-ejecutar `similar_products.sql` (limpieza de envase/paréntesis) y probar en la app.
- ⏳ Monetización «QuéFalta Plus» (1,99 €/mes · 12,99 €/año): Fases 1-4 ✅ en código (`premium_until` + `isPremium`, gates, `PaywallModal` + `react-native-purchases` + `lib/purchases.ts`, webhook `revenuecat-webhook`). Estado de flags: **cliente ENCENDIDO** (`PAYWALL_ENABLED = true` en limits.ts — un build nuevo ya limita a usuarios free: regalar Plus a testers antes, `supabase/ops/grant_plus_testers.sql`), **servidor APAGADO** hasta ejecutar `migrations/paywall_on.sql` el día del lanzamiento. Runbook completo, prerrequisitos (falta `EXPO_PUBLIC_REVENUECAT_IOS_KEY` en .env.local/EAS, webhook sin desplegar, sandbox sin probar) y decisiones en `MONETIZACION.md`. El SDK degrada a placeholder en Expo Go o sin API key.
- ❌ No publicar en App Store todavía (solo pruebas en dispositivo propio).
