# Onboarding (alta de primera vez) + demo

Asistente de bienvenida que se muestra **una vez**, la primera vez que un usuario
entra con sesión iniciada pero sin haber completado el alta. Incluye una **demo**
del funcionamiento mediante *coach marks* sobre la app real.

## Gate de navegación
`src/navigation/index.tsx`:
```
!session                                 → LoginScreen
session && profileLoading                → null (espera el 1er fetch del perfil)
session && profile && !profile.onboardedAt → OnboardingNavigator   ← asistente
resto (onboarded, o perfil falló)        → Tab.Navigator (la app) + CoachMarkProvider
```
- **Detección:** columna `profiles.onboarded_at timestamptz` (NULL = no completado).
  Migración manual: `supabase/migrations/profile_onboarding.sql`. **SIN backfill**
  → todos los usuarios actuales lo ven una vez.
- Si `fetchProfile` falla (perfil = null), NO se bloquea: cae a la app (no deja
  pantalla en blanco).

## Pasos del asistente (`src/screens/onboarding/`)
Stack propio (`OnboardingNavigator`), chrome común `OnboardingLayout` (barra de
progreso + título + botón accent + "Omitir"). Reutiliza la lógica existente, no
la reescribe.

| Paso | Pantalla | Tipo | Reutiliza |
|------|----------|------|-----------|
| 0 | Welcome  | — | — |
| 1 | Username | **Obligatorio** | `isUsernameAvailable` + `updateProfile` (validación en vivo, no avanza sin @ libre) |
| 2 | Stores   | **Obligatorio** | toggle de `CatalogStoresScreen` → `updateProfile({catalogStores})` (mín. 1) |
| 3 | Avatar   | Opcional | `expo-image-picker` + `uploadAvatar` |
| 4 | Friends  | Opcional | `searchUsersByUsername` + `sendFriendRequest` |
| 5 | Group    | Opcional | `createGroup` |
| 6 | Done     | — | `completeOnboarding` → sella `onboarded_at`, `applyProfile` cambia el gate |

Los obligatorios bloquean el avance; los opcionales se pueden omitir.

## Demo — tour INTERACTIVO guiado por acciones (`src/context/GuidedTourContext.tsx`)
No son tooltips pasivos: cada paso resalta un elemento y **solo avanza cuando el
usuario hace la acción real**. Secuencia (9 pasos):
1. Activa un carrito (Grupos) → `activeCart != null`
2. Abre el Catálogo → pestaña Catalog enfocada
3. Abre el selector de súper → `notify('storeMenu')` desde CatalogScreen
4. Entra en una categoría → ruta `SubCategory`
5. Abre una subcategoría → ruta `Products`/`<súper>Products`
6. Añade tu primer producto → `notify('cartAdd')` desde StoreProductList
7. Guarda un favorito (swipe) → sube el contador de `FavoritesContext`
8. Revísalo en Favoritos → pestaña Favorites
9. Revísalo en Mi lista → pestaña List

- **No bloquea** (decisión de producto "guiado, no bloqueante"): overlay con
  "agujero" atenuado sobre el objetivo, todo `pointerEvents="none"` salvo la
  burbuja → los toques pasan a la app.
- **Señales:** rutas vía `navigationRef` (live binding de `../navigation`),
  `useCart`/`useFavorites`, y `notify()` para acciones puntuales.
- **Anclaje:** pestañas por geometría (`TAB_COUNT`/índices `TAB`, ⚠️ deben
  coincidir con `navigation/index.tsx`); selector de súper por `useTourAnchor`.
- **Robustez:** el paso del selector se da por hecho si el usuario solo tiene 1
  súper o se adelanta a una categoría. "Saltar" en cada paso para no atrapar.
- **Arranca solo** la 1ª vez (tras el onboarding) si no hay flag
  `@guidedtour_seen_v1:<userId>` (por usuario, en AsyncStorage, no en BD).
- Re-lanzable desde **Perfil → "Ver tutorial"** (`startTour()`).
- **Instrumentación añadida:** `CatalogScreen` (ancla `storeSelector` +
  `notify('storeMenu')`), `StoreProductList` (`notify('cartAdd')`).

## Recuperar conversión de los opcionales
`src/components/ProfileChecklistCard.tsx` — tarjeta "Completa tu perfil" en el
Home con los pasos opcionales pendientes (foto / amigos / grupo). Se descarta
(flag `@checklist_dismissed_v1`) y desaparece sola al completarse los tres.

## Pendiente
- Ejecutar `profile_onboarding.sql` en Supabase **antes** de arrancar la app.
