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
profile.onboardedAt + postal_code NULL   → Tab.Navigator + modal CP obligatorio (1.3.1)
profile.onboardedAt + postal_code válido → Tab.Navigator (la app) + CoachMarkProvider
```
- En arranques posteriores se acepta el perfil cacheado por usuario si ya tiene
  `onboarded_at` y `region`. Si aún no tiene `postal_code`, la app se monta pero
  queda cubierta por el modal obligatorio mientras se revalida el perfil.
- **Detección:** `profiles.onboarded_at` (NULL = no completado) y
  `profiles.onboarding_step` (0–5 = siguiente pantalla).
- Si `fetchProfile` falla o vence el watchdog, nunca se salta el alta: aparece
  una pantalla de error con reintento.
- Después de autenticar, la portada de acceso permanece montada mientras llega
  el perfil y da paso directamente al primer paso si `onboarded_at` es NULL. El
  BootLoader con la marca queda reservado al arranque en frío.

## Pasos del asistente (`src/screens/onboarding/`)
Stack propio (`OnboardingNavigator`). Los cinco pasos comparten un fondo azul
sin las antiguas líneas horizontales y reutilizan las burbujas ambientales de
Inicio en una variante clara y translúcida. Los títulos admiten varias líneas y
los campos/acciones exponen etiquetas y estados para VoiceOver.
`onboarding_step` permite reanudar exactamente el paso pendiente.

| Paso | Pantalla | Tipo | Reutiliza |
|------|----------|------|-----------|
| 1 | Username | **Obligatorio** | `isUsernameAvailable` + código postal obligatorio/CCAA + `updateProfile` |
| 2 | Stores   | **Obligatorio** | toggle de `CatalogStoresScreen` → `updateProfile({catalogStores})` (mín. 1) |
| 3 | Avatar   | Opcional | `expo-image-picker` + `uploadAvatar`; cabecera con `berenjena-selfie.png` |
| 4 | Friends  | Opcional | `useUsernameSearch` (typeahead cancelable) + `sendFriendRequest`; cabecera con `berenjena-amigos.png` |
| 5 | Group    | Opcional | RPC transaccional e idempotente `create_group_with_owner` |
| — | Done     | — | confirmación visual; su CTA aplica el perfil completo y cambia el gate |

Los obligatorios bloquean el avance; los opcionales se pueden omitir.
En la cuadrícula del segundo paso, Lidl aparece inmediatamente al lado de
Mercadona; este orden es exclusivo del onboarding.
En el primer paso no se ofrece «Toda España»: hace falta introducir un código
postal válido de cinco dígitos para continuar. El selector compartido conserva
el soporte técnico del sentinel histórico, pero ya no presenta esa alternativa
en ningún flujo visible.
El bloque de selección de tienda Lidl tampoco se muestra durante el onboarding;
permanece disponible fuera del alta en los flujos de configuración de zona.

Lidl se puede seleccionar y guardar normalmente en este paso aunque la cuenta
sea gratuita. La preferencia no concede acceso: al intentar abrir Lidl después
en Catálogo, Novedades, Ofertas o Cambios de precio se muestra como opción Plus
bloqueada y se abre el paywall. «Todos tus supermercados» también requiere Plus.

## Gate obligatorio de código postal para cuentas existentes (1.3.1)

- Al montar la app, cualquier perfil con `onboarded_at` pero sin `postal_code`
  muestra un modal sobre Inicio. No dispone de cierre, botón atrás ni «Toda
  España»; Android tampoco lo cierra con el botón del sistema.
- El CTA solo se habilita con un CP válido. Al guardarlo se actualizan región y
  CP en Supabase y en `ProfileContext`; ese dato persistente evita que el modal
  vuelva a aparecer en posteriores aperturas o en otros dispositivos.
- El texto explica que la ubicación permite mostrar los mejores precios de la
  zona y comparar productos y supermercados con información más relevante.
- Mientras está visible no se montan el aviso de novedades ni la solicitud de
  reseña, evitando modales superpuestos. No muestra la selección de tienda Lidl.

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
