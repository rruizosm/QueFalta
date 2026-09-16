# BottomTabsPager

Pager horizontal propio con cinco páginas de ejemplo (Home, Reels, Mensajes,
Search, Profile), pill continuo, stretch e inercia al soltar. El contenido se
arrastra desde la página completa. No usa TabView. QuéFalta integra el mismo
motor en sus cinco pestañas reales mediante `src/navigation/createAppPagerNavigator.tsx`.
La demo social conserva un punto de entrada independiente de desarrollo.

## Ver el cambio en la app real / Xcode

Ejecuta `npm start` y abre `ios/QuFalta.xcworkspace`, scheme **QuFalta**, con
configuración Debug. Pulsa Run y recarga la app si ya estaba abierta. No actives
`EXPO_PUBLIC_BOTTOM_TABS_DEMO` para ver las pantallas reales. Para añadir el blur
iOS al binario, ejecuta `npx pod-install` y vuelve a compilar con Xcode.
Una actualización JS compatible puede mostrar el pager en un binario existente,
pero no puede instalar el módulo nativo de blur.

La integración conserva las rutas, foco, eventos y stacks de React Navigation.
Se montan vecinas en idle y se retienen las visitadas. Los detectores se adjuntan
mediante `screenLayout` dentro de las superficies de los stacks nativos iOS.
`PagerNativeScroll` coordina ScrollView, FlatList y SectionList. Los carruseles
horizontales tienen prioridad; las filas de productos de la pestaña raíz ceden
al pager (favoritos disponibles en la ficha). En detalle permanece el back nativo
y el swipe de favoritos. La barra usa `GlassSurface` y padding inferior medido.

## Ejecutar la demo opcional en este proyecto

Reanimated, Worklets, Gesture Handler, Safe Area, Expo Linear Gradient y los
iconos ya están instalados con versiones compatibles con Expo SDK 57.

```sh
npm ci
# Una vez en iOS, para enlazar el nuevo módulo local (macOS):
npx pod-install

# Terminal 1. Si hay otro Metro abierto, añade -- --port 8083.
npm run demo:tabs

# Terminal 2. Instala/abre el development client y selecciona el Metro de la demo.
npx expo run:ios --no-bundler
# O, con dispositivo/emulador Android preparado:
npx expo run:android --no-bundler
```

En PowerShell, en lugar del script con sintaxis POSIX:

```powershell
$env:EXPO_NO_DOTENV = '1'
$env:EXPO_PUBLIC_BOTTOM_TABS_DEMO = '1'
npx expo start --dev-client
```

Para volver a la app normal, detén ese Metro y ejecuta `npm start` (en PowerShell
elimina antes las dos variables con `Remove-Item Env:EXPO_NO_DOTENV` y
`Remove-Item Env:EXPO_PUBLIC_BOTTOM_TABS_DEMO`). El selector también exige
`__DEV__`: una compilación release no abre la demo. No se necesitan credenciales,
sesión, red ni migraciones SQL para la demo. Los dibujos son locales.

## Instalar en otro proyecto Expo

```sh
npx expo install react-native-reanimated react-native-worklets \
  react-native-gesture-handler react-native-safe-area-context \
  @expo/vector-icons expo-linear-gradient
```

Copia `src/components/bottom-tabs-pager/`, el hook `src/hooks/useReducedMotion.ts`
y `modules/pager-blur/`. Expo descubre automáticamente los módulos bajo `modules/`.
Para las pantallas de ejemplo copia también `src/examples/bottom-tabs-pager/`.
Ejecuta `npx pod-install` y reconstruye el binario iOS; una actualización OTA
no puede añadir el módulo nativo. Expo Go y binarios anteriores muestran la
demo con navegación funcional y un aviso de blur no disponible.

`babel-preset-expo` configura el plugin de Worklets. En un proyecto React Native
sin Expo necesitas instalar primero el soporte de Expo Modules, configurar
`react-native-worklets/plugin` al final de los plugins de Babel y enlazar este
módulo: el adaptador iOS usa Expo Modules. No instales una segunda versión de
Reanimated/Worklets diferente a la compatible con tu React Native.

## Uso

```tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text } from 'react-native';
import {
  BottomTabsPager, PagerScrollView, type PagerTab,
} from './src/components/bottom-tabs-pager';

const definitions: Pick<PagerTab, 'key' | 'label' | 'icon'>[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'reels', label: 'Reels', icon: 'play-circle' },
  { key: 'messages', label: 'Mensajes', icon: 'message-circle' },
  { key: 'search', label: 'Search', icon: 'search' },
  { key: 'profile', label: 'Profile', icon: 'user' },
];
const tabs: PagerTab[] = definitions.map((tab) => ({
  ...tab,
  renderPage: ({ pagerGesture, topInset, bottomInset }) => (
    <PagerScrollView pagerGesture={pagerGesture}
      contentContainerStyle={{ paddingTop: topInset, paddingBottom: bottomInset }}>
      <Text>{tab.label}</Text>
    </PagerScrollView>
  ),
}));

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <BottomTabsPager tabs={tabs} initialIndex={0}
          onIndexChange={(index) => console.log('Página asentada:', index)} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

`ref.current.goTo(index)` ofrece navegación imperativa con el mismo spring que
el tap. Mantén las claves y el orden estables; si cambia el conjunto de pestañas,
remonta el pager con una `key` nueva. Para integración con React Navigation,
el consumidor debe conectar sus rutas/eventos/foco; `createAppPagerNavigator`
es la integración incluida para las rutas reales de QuéFalta.

## Componentes y gesto

- `BottomTabsPager`: mide el contenedor, safe areas, selección accesible y API.
- `Pager`: strip de páginas, `translateX = -scrollX`, recorte al viewport.
- `PagerScrollView`: scroll vertical nativo que espera a que falle el pan horizontal.
- `CustomTabBar` / `TabIcon`: barra absoluta, iconos lineales, pill situado por
  `progress * slotWidth`, opacidad continua sin cambio de color.
- `useTabAnimation`: pan, velocidad, decay del blur, cancelación, tap y springs.
- `ContentBlur`: filtro GPU Android/web y backdrop nativo de iOS.
- `physics` / `constants`: funciones comprobables y parámetros de ajuste.

El gesto se activa al superar 16 pt/dp horizontales y falla si primero se
superan 12 verticales. `PagerScrollView` usa un `Gesture.Native` con
`requireExternalGestureToFail(pagerGesture)`; **no** añadas otro `Gesture.Native`
sobre el ScrollView de RNGH, que ya lo incorpora. Para FlatList puedes aplicar
ese mismo detector sobre la FlatList de React Native. Los carruseles horizontales
requieren decidir explícitamente si el carrusel o el pager tiene prioridad.

Cada página permanece montada, conservando scroll y estado local. Solo se
publica la selección en React al terminar el spring. El pan, posición,
opacidad, stretch y blur se calculan en worklets. No hay snapshots del contenido,
lectura de píxeles en JS, `setState` ni `runOnJS` por frame. `runOnJS` comunica
únicamente la selección asentada. Al cambiar el tamaño, cancelar el gesto,
pasar a segundo plano o desmontar, se limpian animaciones y blur residual.

## Ajustes

Todos están en `constants.ts`, en unidades lógicas (pt/dp, no píxeles físicos):

| Parámetro | Valor inicial |
| --- | --- |
| Desplazamiento para cambiar | 22% de página |
| Velocidad para cambiar | 650 pt/dp por segundo |
| Velocidad que activa blur | >1050 pt/dp por segundo |
| Velocidad de blur máximo | 2400 pt/dp por segundo |
| Sigma objetivo rápido | 3,25–5 |
| Ataque / limpieza del blur | 45 / 90 ms |
| Velocidad obsoleta con dedo quieto | 70 ms |
| Stretch máximo | 24% |
| Adelanto máximo del pill | 7,5% de una casilla |
| Spring páginas | stiffness 280, damping 30, mass 1 |
| Spring pill | stiffness 340, damping 18, mass 0,7 |

Un frame callback suaviza el blur y el stretch durante el gesto; al soltar,
`withTiming(0)` elimina el blur en 90 ms. El spring de páginas no sobrepasa sus
extremos; el pequeño desplazamiento adicional del pill sí puede oscilar y acaba
exactamente en cero. Reducir movimiento suprime blur/stretch/inercia y hace
instantáneo el asentamiento; el arrastre directo sigue respondiendo al dedo.

## Blur y límites de plataforma

| Plataforma | Contenido rápido | Barra |
| --- | --- | --- |
| iOS 16.4+ con módulo compilado | UIKit `UIVisualEffectView`, intensidad animada | Backdrop UIKit y tinte claro |
| Android 12 / API 31+ | `filter: [{ blur: sigma }]` nativo GPU | Superficie translúcida con borde y sombra |
| Android 11 o anterior | Sin blur de contenido | Mismo diseño de barra |
| iOS sin el módulo / Expo Go | Sin blur de contenido; aviso visible | Superficie translúcida |
| Web | Filtro CSS animado | Superficie translúcida |

UIKit **no expone un sigma gaussiano público**. `sigma / 20` calibra la fracción
de un `UIViewPropertyAnimator` pausado para un blur visualmente sutil; no promete
equivalencia exacta en píxeles con Android. En cero se elimina el efecto por
completo. Reducir transparencia de iOS también desactiva ese backdrop. No se usan
APIs privadas ni librerías de blur para el swipe.

El filtro Android se aplica al viewport y sus descendientes; el backdrop iOS
se dibuja inmediatamente encima de las páginas. La barra es un hermano posterior
y nunca recibe el blur del gesto. No se filtra un bitmap de cinco pantallas.
Vídeos reales en Android deben renderizarse en una textura compatible, pues un
`SurfaceView` separado no forma parte del árbol que recibe el filtro.

El objetivo es 60 fps, con 16,7 ms de presupuesto por frame; mover el trabajo a
UI/GPU no garantiza esa cifra en cualquier dispositivo. Hay que medir builds
optimizadas en iOS y Android físicos, particularmente con feeds/vídeos reales.

## Verificación

Verificado en esta entrega: typecheck, lint dirigido, siete pruebas de física,
bundles Metro de iOS y Android y compilación nativa del target `PagerBlur`.
La compilación completa de la app superó el límite de 300 s de XcodeBuildMCP;
el módulo se compiló correctamente por separado con `xcodebuild`. La revisión
visual del pager integrado se comprobó en iPhone 15 Pro / simulador iOS 26.5:
taps, swipes entre las cinco pestañas, swipe corto, flick rápido y scroll vertical.
Siguen pendientes Android nativo y la medición de 60 fps en dispositivos físicos.

```sh
npx tsc --noEmit
npx eslint src/components/bottom-tabs-pager src/examples/bottom-tabs-pager index.ts
node --test scripts/tests/bottom-tabs-pager.test.mjs
```

QA nativa: arrastre lento, flick rápido, dedo detenido tras un flick sin soltar,
soltar antes/después del umbral, invertir dirección, extremos, tap de Home a
Profile, tap durante spring, scroll vertical sobre tarjetas, rotación, retorno
del segundo plano, safe areas, VoiceOver/TalkBack y Reducir movimiento. En reposo
no debe quedar blur, el pill debe centrarse y solo la página seleccionada debe
ser accesible para el lector de pantalla.

Referencias: [filtros de React Native](https://reactnative.dev/docs/view-style-props#filter),
[vistas nativas Expo](https://docs.expo.dev/modules/native-view-tutorial/),
[Expo Modules en React Native](https://docs.expo.dev/bare/installing-expo-modules/).

## Cápsula compacta al leer (2026-09-14)

La barra real conserva su aspecto y el pager horizontal. `TabBarScrollContext`
comparte `compactProgress` (0–1), `setCompact` y `expandTabBar`; `AppPagerTabBar`
recibe el progreso y `onBarPress` como props. El scroll se procesa en worklets,
sin estado React por frame. El proyecto mantiene Reanimated **4.5.1**, ya
instalado para Expo 57, usando las APIs de shared values/scroll de Reanimated.

Valores ajustables en `tabBarScrollPhysics.ts`:

- Altura 64 → 62 pt y escala global 1 → 0,94 (altura visual final 58,28 pt).
- Bloque icono/label al 90 % total; píldora activa escalada con la cápsula.
- Desplazamiento inferior 4 pt; sombra 18 → 14 y elevation 6 → 4.
- Zona muerta inicial/inversión hacia abajo 18 pt, recorrido 100 pt hasta 1.
- Subida intencionada 10 pt; spring masa 0,9 / damping 20 / stiffness 220,
  sin overshoot. Reducir movimiento desactiva la compactación (retorno 180 ms).

Cada lista principal activa opta por `tabBarScroll`:

```tsx
import { PagerNativeFlatList as FlatList } from '../components/bottom-tabs-pager/PagerNativeScroll';
// Dentro de una pantalla del tab navigator:
const bottomPad = useTabBarBottomPadding(24);
return <FlatList tabBarScroll data={items} renderItem={renderItem}
  contentContainerStyle={{ paddingBottom: bottomPad }} />;
```

Lo mismo funciona con `PagerNativeScrollView` y `PagerNativeSectionList`.
Estos adaptadores montan componentes Reanimated, conectan `useTabBarScroll` a
`onScroll` con `scrollEventThrottle={16}`, mantienen refs y listeners existentes,
y conservan la coordinación con el gesto horizontal. No se activan carruseles,
selectores de ingredientes ni scrolls de hojas modales.

Para una lista Reanimated propia, `useTabBarScroll()` devuelve `onScroll`,
`spacerBudget` y `spacerStyle`, además del controlador. Restar `spacerBudget`
del `paddingBottom` calculado por `useTabBarBottomPadding` y añadir al final:

```tsx
const bottomPad = useTabBarBottomPadding(24);
const { onScroll, spacerBudget, spacerStyle } = useTabBarScroll();
return <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16}
  scrollToOverflowEnabled={false} overScrollMode="never"
  contentContainerStyle={{ paddingBottom: bottomPad - spacerBudget }}>
  {content}
  <Animated.View pointerEvents="none" style={spacerStyle} />
</Animated.ScrollView>;
```

En ventanas muy estrechas se mantiene el tamaño completo si compactar llevaría
el ancho táctil de un tab por debajo de 44 pt.

El spacer sustituye ~7,86 pt del padding existente y sigue exactamente el borde
superior transformado de la barra. El contenido no cambia al montar. Se preserva
el footer original. `useTabBarScrollOffsetStyle()` traslada los controles fijos
(Añadir, total de cesta y Crear receta) con el mismo desplazamiento.

Pulsar el fondo o un tab expande y cambia una generación de gesto: la inercia
anterior ya no puede compactar. El siguiente drag toma su offset actual como
origen. Cambiar de tab (tap, swipe o navegación externa), foco o lista principal
expande sin resetear el scroll de la pantalla. Los eventos de tabs sin foco,
scroll programático, rebotes y clamps del footer no deben controlar la barra.

Validación automática: `node --test scripts/tests/tab-bar-scroll.test.mjs
scripts/tests/bottom-tabs-pager.test.mjs`. Recorrido manual: listas cortas/largas,
scroll lento, fling en ambas direcciones, reversión pequeña, tap del tab activo,
tap de otro tab durante inercia, vuelta a offset conservado, fondo de cápsula,
último elemento visible, swipe horizontal y Reducir movimiento. Medir fps en
hardware físico antes de afirmar rendimiento sostenido de 60 fps.
