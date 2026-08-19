# Liquid Glass en iOS — plan por fases

> Adopción incremental del diseño Liquid Glass (iOS 26) SOLO en iOS.
> Android e iOS ≤ 18 se quedan EXACTAMENTE como están (fallback automático).
> Cada fase es visible y evaluable por separado: se implementa, se mira en el
> dispositivo, y se decide si gusta antes de pasar a la siguiente.

## Reglas del proyecto (NO romper)

- **Nunca usar `GlassView` directo en pantallas.** Toda superficie de cristal pasa por
  el wrapper `GlassSurface` (F0). Es el único sitio donde se decide glass vs fallback.
- **Sin ramas `Platform.OS` en pantallas** para esto: la decisión vive en `GlassSurface`
  vía `isLiquidGlassAvailable()` (false en Android y en iOS ≤ 18 → fallback temado).
- **Glass solo en la capa de navegación y controles flotantes** (tab bar, cabeceras,
  campana, barras de modales). El contenido (listas, fichas, formularios) sigue opaco.
  Es la guía de Apple y evita problemas de legibilidad.
- **`useHeaderTopPadding` sigue mandando** en el layout de cabeceras. El glass solo
  cambia el FONDO, nunca las alturas/paddings.
- **Estrategia de entrega (decisión 2026-07-08): EAS Update (OTA), sin build dedicado.**
  Ver sección siguiente: el efecto solo puede VERSE en builds que lleven el módulo
  nativo (del build 34 en adelante); en builds anteriores el update corre en fallback.

## Requisitos para VER el efecto (estrategia OTA)

- `expo-glass-effect` es un **módulo nativo**: un EAS Update solo envía JS y **nunca**
  puede hacer aparecer el cristal en un build que no lo lleve compilado. Instalado el
  paquete (F0, 2026-07-08), **cualquier build posterior** (p. ej. el build 34 del fix
  5.1.1) ya lo incluirá; es invisible y sin riesgo para la review.
- `runtimeVersion.policy` es `"sdkVersion"` → los updates SÍ llegan a los builds viejos
  aunque no lleven el módulo. Por eso `GlassSurface` hace el require perezoso en
  try/catch: en esos builds el import del paquete lanza (GlassView.ios.js resuelve el
  módulo nativo a nivel de módulo) y sin la guarda el update los crashearía.
- **Validación INTERNA (decisión 2026-07-08): todo el desarrollo glass va al canal
  `preview`, NUNCA a `production` hasta validarlo entero.** El canal `production` no
  distingue TestFlight de App Store: cuando el build 34 esté publicado, un update a
  `production` llegaría a los usuarios reales.
  1. **Una vez:** registrar el iPhone si no lo está (`eas device:create`) y hacer un
     build interno iOS: `eas build --platform ios --profile preview` (canal `preview`,
     distribution internal → se instala directo en el iPhone, sin TestFlight).
     Lleva el módulo nativo → es donde se VE el cristal.
  2. **Por fase:** implementar → `eas update --channel preview --platform ios` → mirar
     en el iPhone. Iteración sin más builds.
  3. **Al validar TODO (F1–F5):** publicar a `production` (llega como fallback a
     builds &lt; 34 y con cristal a builds ≥ 34, que ya llevan el módulo).
  - Alternativa para afinar rápido (paddings, tintes): build `development` (dev client)
    + Metro en caliente, como en Android. El preview basta si se prefiere solo-updates.
- Hace falta un **iPhone con iOS 26** (sin Mac no hay simulador). En iOS ≤ 18 se ve el
  fallback.
- SDK 54 en EAS ya compila con Xcode 26 → no hay que tocar nada de imágenes de build.

---

## F0 — Infraestructura (sin cambio visual) ✅ 2026-07-08

1. ✅ `expo-glass-effect@0.1.10` instalado (`npx expo install`).
2. ✅ `src/components/GlassSurface.tsx` creado:
   - Props: `style`, `tintColor?`, `glassEffectStyle?` (`'regular' | 'clear'`),
     `interactive?`, `fallbackColor?` (por defecto `colors.white`) + resto de ViewProps.
   - Require perezoso en try/catch (patrón `lib/purchases.ts`) + `isLiquidGlassAvailable()`
     → `GlassView`; si no → `View` opaca con `fallbackColor`. Exporta `glassAvailable`
     (const) para las decisiones de layout de F1/F3.
   - Pasa `colorScheme={scheme}` (de `useTheme()`) al GlassView → el cristal sigue el
     tema DE LA APP aunque el usuario fuerce Claro/Oscuro distinto del sistema. Esto
     resuelve de serie el gotcha que estaba previsto para F5.
   - Colores leídos dentro del render (getters mutables), como el resto de la app.
3. ✅ Typecheck verde. Sin build dedicado (decisión: estrategia OTA, ver arriba).
4. **Validar tras el update:** la app se ve IDÉNTICA a hoy (nadie usa aún el wrapper) y
   NO crashea en el build de tester actual (prueba de que la guarda funciona).

## Portada gestual del Login ✅ código y simulador 2026-08-19

- La burbuja interactiva de `LoginBubbleIntro` es una superficie flotante y usa
  el wrapper obligatorio `GlassSurface`, nunca `GlassView` directo. En iOS 26
  aplica material `clear` sin tinte. Una única lente SVG superpuesta dibuja el
  doble borde, el reflejo superior amplio y caústicas interiores casi neutras,
  sin tapar la refracción nativa; el texto se compone detrás del cristal.
- El arco cromático que aparece al arrastrar no es una imagen ni una animación
  prerenderizada: `@shopify/react-native-skia@2.2.12` ejecuta un Runtime Shader
  que calcula en cada frame una curva de aberración cromática con el accent de
  la app, cian, azul, violeta y rosa. Su posición y opacidad dependen del mismo
  valor animado que mueve y reduce la esfera. Si Skia no existe en un binario
  antiguo, la carga perezosa mantiene una versión SVG compatible con OTA.
- El fallback conserva la esfera translúcida completa en Android, iOS anterior
  y builds sin el módulo. Los 18 logos que nacen de ella siguen siendo contenido
  opaco: no hay superficies glass anidadas ni necesidad de `GlassContainer`.
- `GlassSurface` es solo la capa visual y lleva `pointerEvents="none"`. Darle
  captación táctil propia hizo competir `GlassView` con el gesto Pan en la prueba
  inicial; el `GestureDetector` exterior sigue siendo el único dueño del arrastre
  y ya aporta la respuesta interactiva moviendo y reduciendo la esfera.
- Validado en iPhone 15 Pro con iOS 26.5: gesto corto vuelve al borde, gesto largo
  encaja la esfera y despliega los supermercados sin abrir controles subyacentes.

## F1 — Tab bar ✅ código 2026-07-08 (pendiente de VALIDAR en dispositivo)

Implementado así (todo condicionado a `glassAvailable`; en fallback CERO cambios):

1. **Cristal:** `tabBarBackground: () => <GlassSurface style={absoluteFill} />` (opción
   oficial de bottom-tabs: se pinta en absoluteFill DETRÁS de los ítems) + en glass
   `tabBarStyle` pasa a `backgroundColor: 'transparent'` y `borderTopWidth: 0`.
   Alturas/paddings idénticos en ambos modos.
2. **Contenido por debajo:** el `position: 'absolute'` va en el WRAPPER de
   `TourTabBar`, NO en `tabBarStyle` — si fuera en la barra interna, el wrapper
   colapsaría a alto 0 y `measureInWindow` registraría un rect vacío (ancla del tour
   rota). Con el absolute en el wrapper, el ancla mide el rect real como siempre.
3. **Hook nuevo `useTabBarBottomPadding(designPadding)`** (espejo de
   useHeaderTopPadding): fallback → devuelve el valor de diseño tal cual; glass →
   + `useBottomTabBarHeight()`. ⚠️ REGLA: toda pantalla de pestañas nueva con scroll
   debe pasar su paddingBottom por este hook; los elementos FIJOS pegados abajo se
   elevan con `useTabBarBottomPadding(0)` como offset de `bottom`.
4. **Barrido hecho (20 pantallas + StoreProductList):** todas las
   `contentContainerStyle` de las pestañas compensan con el hook, y las barras fijas
   quedan elevadas por encima del cristal: `totalBar`/`doneBar` (ListScreen),
   `totalBar` ×2 pantalla+overlay (GroupDetailScreen), `cartBar` "Añadir"
   (StoreProductList). Los modales (RN Modal) flotan sobre la tab bar → sin cambios.
5. **Validar en iPhone iOS 26 (build preview):** scroll en Home/Catálogo/Lista →
   contenido refractado bajo la barra; tour alineado con la barra; barras de
   total/añadir visibles sobre el cristal; Android/fallback idéntico a hoy.
6. **Test 1 en device (2026-07-09): el cristal salía como PLANCHA OSCURA opaca con
   todo en claro.** Causa: la prop `colorScheme` de GlassView no re-aplica el efecto
   (expo/expo#43743) → el material se queda con la apariencia con la que se creó.
   FIX aplicado (pendiente de re-test vía `eas update --channel preview`):
   - `GlassSurface` ya NO pasa `colorScheme`; añade `key={scheme}` (remonta el
     cristal al cambiar tema en caliente, el efecto no se refresca solo).
   - `ThemeContext`: nuevo `applyNativeScheme(mode)` → `Appearance.setColorScheme`
     (null en 'system') al cargar y al cambiar tema. El cristal en 'auto' hereda el
     trait YA correcto al crearse, y de paso esto era el punto 1 de F5 (adelantado).
   - OJO orden en setThemeMode: `applyNativeScheme` ANTES de `getColorScheme()` (al
     pasar a 'system' limpia el override y la lectura devuelve el del dispositivo).

### F1b — Rediseño a barra FLOTANTE con píldora (2026-07-09, Claude design handoff)

El usuario rediseñó la tab bar con Claude ("Liquid Glass Nav"): ya no es la barra
full-width con solo el fondo de cristal, sino una **barra flotante** con píldora
deslizante. Recreado en `src/components/LiquidGlassTabBar.tsx` (reemplaza a
`BottomTabBar` SOLO cuando `glassAvailable`; sin glass, la clásica intacta).

- **Barra flotante:** despegada de los bordes (SIDE_INSET 18), muy redondeada
  (radio 30), `position:absolute` a `insets.bottom + GAP(10)` del fondo, material
  `GlassSurface`. Constantes `LIQUID_TABBAR_HEIGHT(66)`/`LIQUID_TABBAR_GAP(10)`
  exportadas → `navigation` fija `tabBarStyle.height = 66+10+insets.bottom` para que
  `useBottomTabBarHeight`/`useTabBarBottomPadding` (el barrido de F1) sigan cuadrando.
- **Píldora deslizante de acento:** absolute detrás de los ítems; `Animated.spring`
  (translateX con overshoot) + pulso de estiramiento `scaleX 1.14 / scaleY 0.94`
  (el "líquido"). Geometría = 4px inset dentro de cada pestaña; ancho medido por
  onLayout del cristal. Driver nativo (solo transforms; el width es estático).
- **Adaptación clave al proyecto:** el verde fijo del handoff (#2f9e44) → `colors.accent`
  (sistema de acento dinámico) en píldora + activo; gris inactivo → `colors.inkSoft`
  (respeta oscuro). Iconos = Ionicons **outline SIEMPRE** (el diseño no rellena el
  activo, solo lo colorea/agranda con glow). Badge de no-leídas replicado.
- **Tour:** `barRef`+`onBarLayout` bajan a LiquidGlassTabBar y miden SOLO la barra
  flotante (el ancla 'tabBar' encaja con ella). Navegación = réplica exacta del
  handler de bottom-tabs (`CommonActions.navigate(route)` por key + tabPress).
- `tabBarBackground` (el fondo glass de F1) YA NO se usa: la barra custom pinta su
  propio cristal. `GlassSurface`/`StyleSheet` quitados de navigation/index.
- ⚠️ El handoff original (carpeta "Liquid glass navegador app") se ELIMINÓ tras
  recrearlo, a petición del usuario.
- **Validar en device (iPhone iOS 26):** píldora desliza con rebote al cambiar de
  pestaña; barra flotante clara/translúcida (no plancha oscura); badge visible;
  contenido pasa por debajo; los 6 accents tiñen la píldora; Android intacto.

## F2 — Campana + panel de notificaciones (Home) ✅ código 2026-07-09 (falta validar)

1. ✅ **Campana** (HomeScreen): el círculo lo pinta ahora `GlassSurface`
   (`bellGlass`, radio 22, `interactive`, `tintColor=accentLight`, borde acento,
   overflow hidden). El `TouchableOpacity` (`bellBtn`) queda como mero contexto de
   posición del badge (que va FUERA del cristal para no recortarse). Fallback =
   círculo blanco de siempre.
2. ✅ **`NotificationsSheet`**: se aplicó el repliegue previsto (cabecera glass +
   cuerpo opaco). La cabecera pasa a `position:absolute` + `GlassSurface`
   (`fallbackColor=paper`), va al FINAL del árbol para renderse encima, y el
   listado/empty llevan `paddingTop = insets.top + 64` para pasar por debajo y
   refractarse. Filas = contenido → siguen opacas. Botón de cerrar sin caja (solo
   icono) sobre el cristal (evita glass anidado). Layout idéntico en fallback.
3. **Validar en device:** campana con los 6 accents y claro/oscuro; badge de
   no-leídas visible sobre el cristal; al abrir el panel y hacer scroll, las filas
   se refractan bajo la cabecera; cerrar funciona; Android/fallback intacto.

## F3 — Cabeceras de pantalla + banner del carrito 🔄 piloto ✅ 2026-07-10

20 pantallas usan cabecera custom con `useHeaderTopPadding`. NO tocar las 20 de golpe.

1. ~~Crear `GlassHeader`~~ → **PILOTO HECHO en `PriceChangesScreen`** (código ✅
   2026-07-10, typecheck verde, falta validar en device) con una variante más ambiciosa
   que la cabecera suelta: TODO el chrome (ActiveCartBanner + cabecera + StoreDropdown +
   pestañas) va en UNA franja `GlassSurface` flotante (`fallbackColor=paper`), absolute
   al final del árbol (patrón NotificationsSheet), y la lista pasa por debajo y se
   refracta. Piezas reutilizables que deja para el resto de F3:
   - **`StoreProductList` gana `topInset`** (paddingTop del contenido scrolleable +
     desplaza spinner/error): la pantalla mide el chrome con onLayout y se lo pasa.
     Usar junto con `hideToolbar` (el toolbar interno quedaría oculto bajo el cristal);
     el ViewModeToggle sube al chrome con `viewMode`/`onViewModeChange` controlados.
   - **`SlidingSegments`** (componente nuevo): switcher segmentado con píldora
     deslizante de acento (mismas curvas spring+squash que la tab bar F1b). Solo para
     chrome glass — NO pinta cristal propio (no anidar GlassSurface): pista = velo
     blanco translúcido. En fallback cada pantalla conserva su switcher clásico.
   - Back button sin caja sobre el cristal (como el cerrar de NotificationsSheet).
   - El StoreDropdown puede vivir DENTRO de la franja: el cristal arranca en y=0, así
     que su onLayout sigue dando coordenadas de pantalla para anclar el menú.
2. Igual que la tab bar: la cabecera debe superponerse al scroll (absolute arriba +
   `paddingTop` equivalente en el contenido) para que el efecto exista. En fallback,
   en flujo y opaca como hoy. ✓ (así está hecho el piloto)
3. Si gusta → extender al resto de pantallas mecánicamente (una a una, mismo patrón;
   candidatas naturales: NewArrivals/Offers, que comparten estructura exacta).
4. `ActiveCartBanner` (flotante) → `GlassSurface`, misma fase por ser elemento
   flotante. (En el piloto va dentro de la franja como control opaco; su versión
   glass propia queda pendiente para cuando se haga en todas las pantallas.)
5. **Validar (piloto):** título/pestañas legibles al pasar filas claras Y oscuras por
   debajo; píldora desliza con rebote al cambiar Bajadas/Subidas; toggle
   lista/cuadrícula funciona desde el chrome; menú del selector de súper se ancla
   bien; regla `useHeaderTopPadding` intacta (alturas idénticas al fallback);
   Android/fallback pixel-idéntico a hoy.

## F4 — Hojas y modales ⬜

`ActionSheet`, `NameInputSheet`, `ConfirmDialog`, `PaywallModal` y los modales de
producto (`ProductDetailModal`, `StoreProductModal`, Bonarea/Bonpreu/Carrefour/Dia/
Consum via `ProductInfoSections`).

1. Regla: el CUERPO de los modales sigue opaco (fichas de producto = contenido).
   El glass va en la "chrome": barra superior (título/cerrar) y botonera inferior
   (añadir a la cesta) de los modales de producto.
2. Hojas pequeñas (`ActionSheet`, `NameInputSheet`, `ConfirmDialog`): probar superficie
   entera en glass `regular`; si la legibilidad sufre, solo la botonera.
3. Recordar la regla existente: hojas con `insets.bottom` (no cambia).
4. **Validar:** ficha de producto legible (ingredientes/nutrición); botón añadir
   destaca; teclado sobre `NameInputSheet` sin glitches.

## F5 — Pulido, rendimiento y coherencia ⬜

1. ~~Modo oscuro forzado~~ → RESUELTO (rehecho en F1-test1): la prop `colorScheme`
   de GlassView está ROTA (expo/expo#43743, no re-aplica el efecto) → el tema del
   cristal se alinea vía `applyNativeScheme` (Appearance.setColorScheme) en
   ThemeContext + `key={scheme}` en GlassSurface. Verificar aquí el cambio de tema
   en caliente con superficies glass a la vista.
2. **Accesibilidad:** con "Reducir transparencia" activado, iOS vuelve el glass opaco
   solo → comprobar que se ve digno (equivale ~al fallback).
3. **Rendimiento:** no anidar `GlassSurface`; si hay varias piezas de cristal juntas
   (p. ej. campana + banner), evaluar `GlassContainer` para fundirlas.
4. Barrido final: 8 accents × claro/oscuro × iOS 26 / iOS 18 (fallback) / Android.
5. Decidir qué superficies se quedan. Si el look cambia mucho → regenerar capturas de
   la App Store (marketing/appstore) tras publicar la versión.

---

## Estado

- ✅ F0 (2026-07-08) · 🔄 F1 (código ✅ 2026-07-08 + test1 fix tema + F1b barra flotante
  con píldora ✅ 2026-07-09; falta validar en device) · 🔄 F2 (código ✅ 2026-07-09,
  falta validar) · 🔄 F3 (piloto Cambios de precios ✅ 2026-07-10, falta validar;
  resto de pantallas ⬜) · ⬜ F4 · ⬜ F5
- Siguiente paso: build interno `preview` de iOS (una vez): `eas device:create` si
  hace falta + `eas build -p ios --profile preview` → instalar en el iPhone (iOS 26)
  → para iterar, `eas update --channel preview --platform ios`.
- `production` NO recibe nada de glass hasta validar F1–F5 al completo. (El build 34
  llevará el módulo nativo dentro — inofensivo e invisible — pero ningún update con
  superficies glass debe ir a `production` hasta el visto bueno final.)
