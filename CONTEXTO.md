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
- `src/screens/` — Home, Catalog, SubCategory, Products, List, Groups, GroupDetail, Login, Profile, EditProfile, PrivacySecurity, DefaultGroup.
- `src/context/` — `AuthContext` (sesión), `ProfileContext` (perfil cacheado), `CartContext` (carrito activo + grupo por defecto), `AppContext` (placeholder).
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

## Migraciones SQL pendientes en Supabase (ejecutar a mano)
- `profiles`: columnas `username text unique`, `avatar_url text`, `discoverable boolean not null default true`.
- Bucket `avatars` (público) + policies de subida/lectura. Path de avatar: `{userId}/avatar.{ext}`.
- `list_items`: columna `image_url text`.
- Edge Function `delete-account` desplegada.
- (Futuro Fase 2) tabla `push_tokens`.
- **`group_members` INSERT policy** `with check (user_id = auth.uid())` — IMPRESCINDIBLE para que las invitaciones por enlace funcionen (si falta, `joinGroup` da 42501 y el grupo no carga). Está en `supabase/policies/group_join.sql`.
- **Modelo de admin de grupo** (`supabase/policies/groups_owner.sql`): `groups.created_by` = creador (inmutable), `groups.owner_id` = admin actual (cambia al transferir). Incluye `is_group_admin(gid)` (SECURITY DEFINER, evita recursión), la policy UPDATE de groups (admin) y la DELETE de group_members (abandonar/expulsar). El admin se calcula con `owner_id`, NO con `created_by`.
- Hay SQL previo en `supabase/` (RLS, policies de groups/group_members/shopping_lists/list_items).

## Estado / pendientes
- ✅ App funcional en Expo Go: auth, grupos, carrito, catálogo, perfil, notificaciones locales, privacidad.
- ⏳ Desplegar `quefalta-web` en Vercel + DNS de `quefalta.es` (Hostinger: A `@` → IP de Vercel, CNAME `www` → `cname.vercel-dns.com`).
- ⏳ Primer `eas build` iOS / `expo run:ios` para probar en dispositivo y los Universal Links.
- ⏳ URL real de App Store (sustituir `#`/`APP_STORE_URL` en la web).
- ❌ No publicar en App Store todavía (solo pruebas en dispositivo propio).
