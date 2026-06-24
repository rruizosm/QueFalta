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

## Demo — tour INTERACTIVO guiado por acciones (`src/context/GuidedTourContext.tsx`)
No son tooltips pasivos: cada paso resalta un elemento y **solo avanza cuando el
usuario hace la acción real**. Recortado al *core loop* — 5 pasos (antes 10):
1. Prepara un carrito (Grupos) → `activeCart != null`. El spotlight tiene **3
   estados** (resueltos solo si estás EN la pestaña Grupos, porque la pantalla
   sigue montada al cambiar de tab y sus anclas quedan registradas): **con grupo**
   → botón "Activar carrito" (ancla `activateCart`, 1er grupo) con texto
   `cartActivate*`; **sin grupo** → CTA "crear grupo" (`createGroup`); **fuera de
   Grupos** → pestaña Grupos (para ir allí). Así, tras crear el grupo durante el
   paso, el foco salta del tab/“crear” a "Activar carrito". El paso espera
   `cartActive` (no bloquea con "Saltar").
2. Abre el Catálogo → pestaña Catalog enfocada
3. Elige un supermercado (dos fases) → `notify('storeSelect')` desde CatalogScreen.
   Fase 1: resalta el selector ("abre la lista"). Fase 2 (desplegable abierto):
   ilumina el **2º** súper para enseñar a cambiar — o el **1º** si el usuario
   solo tiene uno (el texto se adapta vía `storeCount` en `setStoreMenuOpen`). Con
   un único súper el selector está oculto en condiciones normales: se **fuerza
   visible** durante este paso (`tourStepId === 'store'`). El súper objetivo se
   indica con **anillo que respira** (opacidad ida/vuelta, `menuPulse` en
   CatalogScreen), **sin** chevron (el menú es un Modal).
4. Añade el **2º producto** → `notify('cartAdd')` desde StoreProductList. NO hay
   paso de categoría: el usuario navega categoría/subcategoría por su cuenta. Dos
   fases (un solo "dot", como el paso 3): **fase A** resalta el `+` del 2º
   producto (ancla `productStepper`, atada a `index === 1`); al pulsarlo
   (`notify('qtyPicked')` → flag `addQtyPicked`) pasa a **fase B**, el objetivo
   salta al botón "Añadir" (ancla `addButton`) — anillo+chevron del `+`
   desaparecen — y el texto cambia a `addConfirm*`. La tarjeta va **arriba**
   (`bubble: 'top'`) para no tapar la barra "Añadir" del fondo en ninguna fase.
5. Revísalo en Mi lista → pestaña List

> Quitados: los pasos de favoritos (swipe + revisión) y el de categoría. Sus
> emisores/anclas (`qtyPicked`, `firstSubcategory`, `addButton`, `firstCategory`)
> siguen en el código pero quedan inertes (ningún paso los espera).

- **No bloquea** (decisión de producto "guiado, no bloqueante"): overlay con
  "agujero" atenuado sobre el objetivo, todo `pointerEvents="none"` salvo la
  burbuja → los toques pasan a la app.
- **Señales de "dónde tocar"** (diseño `design/onboarding-cataleg.dc.html`, Claude
  Design): sobre cualquier objetivo medido se animan, con `Animated` (native
  driver), un **anillo accent que respira** (`pulseRing`, `opacity 0.3↔1` en bucle
  + leve escala, halo justo por fuera del marco) y un **chevron que rebota**
  apuntándolo (`chevron`, `chevron-down` accent). En los pasos de pestaña la
  tarjeta lleva un **pico** (`beak`) alineado al centro del objetivo. Los loops
  solo corren con el tour activo. ⚠️ Ambos indicadores se pintan **después** de la
  tarjeta en el JSX: si no, en el paso 'add' (tarjeta arriba, objetivo justo
  detrás) la tarjeta opaca taparía el anillo.
- **Señales:** rutas vía `navigationRef` (live binding de `../navigation`),
  `useCart`/`useFavorites`, y `notify()` para acciones puntuales.
- **Anclaje:** pestañas por geometría (`TAB_COUNT`/índices `TAB`, ⚠️ deben
  coincidir con `navigation/index.tsx`); selector de súper por `useTourAnchor`.
- **Robustez:** el paso del selector se da por hecho si el usuario solo tiene 1
  súper o se adelanta a una categoría. "Saltar" en cada paso para no atrapar.
  El paso 1 ilumina el CTA "crear grupo" del estado vacío cuando el usuario no
  tiene grupos (ancla `createGroup` en `GroupsScreen`, `clearOnUnmount`: se monta
  con el botón y se limpia al crear el grupo).
- **Opt-in la 1ª vez** (no auto-lanza): tras el onboarding, si no hay flag
  `@guidedtour_seen_v1:<userId>`, se muestra un AVISO ("¿Te enseño cómo
  funciona?") con "Empezar" / "Ahora no". "Ahora no" sella el flag (no insiste).
  Flag por usuario, en AsyncStorage, no en BD.
- Re-lanzable desde **Perfil → "Ver tutorial"** (`startTour()`).
- **Instrumentación:** `CatalogScreen` (ancla `storeSelector` +
  `notify('storeSelect')`), `StoreProductList` (`notify('cartAdd')`),
  `GroupsScreen` (ancla `createGroup`).

## Recuperar conversión de los opcionales
`src/components/ProfileChecklistCard.tsx` — tarjeta "Completa tu perfil" en el
Home con los pasos opcionales pendientes (foto / amigos / grupo). Se descarta
(flag `@checklist_dismissed_v1`) y desaparece sola al completarse los tres.

## Pendiente
- Ejecutar `profile_onboarding.sql` en Supabase **antes** de arrancar la app.
