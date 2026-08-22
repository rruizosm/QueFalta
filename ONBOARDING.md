# Onboarding (alta de primera vez) + demo

Asistente de bienvenida que se muestra **una vez**, la primera vez que un usuario
entra con sesión iniciada pero sin haber completado el alta. Incluye una **demo**
del funcionamiento mediante *coach marks* sobre la app real.

## Gate de navegación
`src/navigation/index.tsx`:
```
!session                                 → LoginScreen
session && profileLoading tras Login     → mantiene LoginScreen (sin pantalla intermedia)
session cacheada && profileLoading       → BootLoader de arranque
session && profile && !profile.onboardedAt → OnboardingNavigator   ← asistente
session && profile null/error            → error recuperable + Reintentar
profile.onboardedAt                      → Tab.Navigator (la app) + CoachMarkProvider
```
- En arranques posteriores se acepta el perfil cacheado por usuario solo si ya
  tiene `onboarded_at` y `region`. Se revalida en segundo plano sin desmontar el
  Home; perfiles incompletos esperan siempre la respuesta remota.
- **Detección:** `profiles.onboarded_at` (NULL = no completado) y
  `profiles.onboarding_step` (0–5 = siguiente pantalla).
- Si `fetchProfile` falla o vence el watchdog, nunca se salta el alta: aparece
  una pantalla de error con reintento.
- Después de autenticar, la portada de acceso permanece montada mientras llega
  el perfil y da paso directamente al primer paso si `onboarded_at` es NULL. El
  BootLoader con la marca queda reservado al arranque en frío.

## Pasos del asistente (`src/screens/onboarding/`)
Stack propio (`OnboardingNavigator`). Los cinco pasos comparten la persiana azul
y `OnboardingSlats`, un único fondo SVG sin 26 vistas nativas repetidas. Los
títulos admiten varias líneas y los campos/acciones exponen etiquetas y estados
para VoiceOver. `onboarding_step` permite reanudar exactamente el paso pendiente.

| Paso | Pantalla | Tipo | Reutiliza |
|------|----------|------|-----------|
| 1 | Username | **Obligatorio** | `isUsernameAvailable` + código postal/CCAA + `updateProfile` |
| 2 | Stores   | **Obligatorio** | toggle de `CatalogStoresScreen` → `updateProfile({catalogStores})` (mín. 1) |
| 3 | Avatar   | Opcional | `expo-image-picker` + `uploadAvatar`; cabecera con `berenjena-selfie.png` |
| 4 | Friends  | Opcional | `useUsernameSearch` (typeahead cancelable) + `sendFriendRequest`; cabecera con `berenjena-amigos.png` |
| 5 | Group    | Opcional | RPC transaccional e idempotente `create_group_with_owner` |
| — | Done     | — | confirmación visual; su CTA aplica el perfil completo y cambia el gate |

Los obligatorios bloquean el avance; los opcionales se pueden omitir.

`complete_onboarding()` valida en Postgres que existan @usuario con formato
correcto, región y al menos un supermercado; usa la hora del servidor y marca
el paso 5. Solo el rol `authenticated` puede ejecutar las dos RPC.

## Transición a Inicio
Al pulsar «Entrar en QuéFalta», Inicio se monta cubierto por una superficie de
continuidad y solo se revela cuando su primer layout y sus bloques asíncronos
principales están resueltos. Hay un límite de 900 ms para que una red lenta no
bloquee la entrada y el fundido respeta Reducir movimiento.

La antigua tarjeta «Completa tu perfil» se eliminó por completo. Los pasos de
foto, amigos y grupo continúan siendo opcionales y se gestionan desde sus
pantallas normales, sin insertar contenido tardío en la parte superior de
Inicio.

## Migración

`supabase/migrations/20260821130300_onboarding_integrity.sql` está aplicada en
producción. Añade el progreso, la idempotencia de grupos y las RPC de cierre.

Validación local: `npm run quality`, export de producción para iOS y build
Debug de Xcode completados correctamente el 2026-08-21.
