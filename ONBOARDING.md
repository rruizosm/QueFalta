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
| 1 | Name     | **Obligatorio** | `updateProfile({name, initials})` (nombre visible; se prefija con el del proveedor — Google, o Apple vía `credential.fullName`; iniciales con `initialsFromName`). No avanza vacío |
| 2 | Username | **Obligatorio** | `isUsernameAvailable` + `updateProfile` (validación en vivo, no avanza sin @ libre) |
| 3 | Stores   | **Obligatorio** | toggle de `CatalogStoresScreen` → `updateProfile({catalogStores})` (mín. 1) |
| 4 | Avatar   | Opcional | `expo-image-picker` + `uploadAvatar` |
| 5 | Friends  | Opcional | `searchUsersByUsername` + `sendFriendRequest` |
| 6 | Group    | Opcional | `createGroup` |
| — | Done     | — | `completeOnboarding` → sella `onboarded_at`, `applyProfile` cambia el gate |

Los obligatorios bloquean el avance; los opcionales se pueden omitir.

## Recuperar conversión de los opcionales
`src/components/ProfileChecklistCard.tsx` — tarjeta "Completa tu perfil" en el
Home con los pasos opcionales pendientes (foto / amigos / grupo). Se descarta
(flag `@checklist_dismissed_v1`) y desaparece sola al completarse los tres.

## Pendiente
- Ejecutar `profile_onboarding.sql` en Supabase **antes** de arrancar la app.
