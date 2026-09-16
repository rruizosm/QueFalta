# Transición de «Nueva receta»

Implementación local del 2026-09-14. Conserva el formulario, colores, validación,
selector de ingredientes y publicación existentes. Sin dependencias nuevas.

## Navegación y origen

- `src/navigation/index.tsx` añade un native-stack raíz: `Tabs` y `NewRecipe`.
  `src/navigation/recipeCreator.ts` fija `presentation: 'transparentModal'`,
  `animation: 'none'`, cabecera oculta y fondo transparente. La hoja cubre la
  tab bar; las pestañas permanecen montadas detrás, sin alternar su visibilidad.
- Los enlaces y notificaciones entran por `Tabs` con `pop: true`, para reutilizar
  el navigator existente incluso si el formulario está abierto. Sus params
  anidados están tipados con `NavigatorScreenParams`.
- `CreateRecipeButton` mide un contenedor sin escala (`collapsable={false}`) y
  pasa solo `{ origin: { x, y, width, height } }` por params. El contexto conserva
  una referencia efímera al CTA y una shared value para ocultar el original
  mientras lo representa el pill animado; no contiene datos del formulario.

## Movimiento

`useRecipeCreatorTransition` coordina todo con Reanimated en el hilo UI:

- Spring físico de entrada: masa 1, damping 22, stiffness 180, sin rebote visible;
  aproximadamente 420 ms. El CTA responde con scale 1 → 1.035 y spring suave.
- La superficie conserva dimensiones constantes y sube mediante `translateY`.
  No se redimensionan ni se escalan el texto, imágenes o campos por fotograma.
- Backdrop negro al 28 %. El pill azul viaja desde su posición medida hacia
  `Publicar`, desaparece y entrega el movimiento al botón real (fade + 0.92 → 1).
  Es un fallback explícito con Reanimated; no depende de shared transitions
  experimentales ni de capturas de pantalla.
- Se coordina el arranque con `transitionEnd` y el layout nativo medido. Dos
  frames tras el layout sirven como respaldo para versiones de screens que
  omiten ese evento cuando `animation` es `none`. Así no se consume la entrada
  antes de mostrar la superficie ni se espera indefinidamente un evento. El
  formulario se monta fuera de vista y termina su primer layout antes del spring.
- Header a los 35 ms; nombre 85, imagen 135, ingredientes 185 y pasos 235 ms.
  Cada bloque usa `FadeInDown` de 200 ms con desplazamiento inicial de 14 pt.
- Cierre de 340 ms, con salida escalonada inversa y retorno del pill al CTA
  medido de nuevo. Si desaparece o queda fuera de la ventana, se omite el pill.
  Las mediciones nativas tienen un respaldo de 100 ms si el nodo desaparece.

## Gestos, teclado y accesibilidad

- Swipe **desde la cabecera** en ambos SO; la zona desplazable conserva sus
  gestos de scroll, selección y edición. Umbral de distancia adaptable, flick
  hacia abajo y recuperación mediante spring al cancelar o invertir el gesto.
- X, escape accesible, atrás de Android y publicación completada usan el mismo
  cierre. `usePreventRemove` conserva la ruta hasta finalizar y después reproduce
  la acción de navegación pendiente. No se permite salir mientras se publica.
- Insets superior/inferior estables, `contentInsetAdjustmentBehavior="never"`
  y ajuste de teclado del scroll. No se abre el teclado al entrar; los pasos
  añadidos por el usuario conservan su foco habitual.
- Reducir movimiento usa fade de 200 ms, sin desplazamientos, spring, morph ni
  stagger. El hook compartido lee el valor nativo sincrónicamente al montar y
  sigue escuchando cambios. `ReduceMotion.Never` se usa únicamente para que el
  fade de accesibilidad no se convierta automáticamente en un salto instantáneo.
- Al cambiar el tamaño se invalida el origen antiguo, se actualiza el contenedor
  y se mide la nueva posición al cerrar. No depende de medidas fijas de iPhone.

## iOS y Android

La transición no tiene ramas por plataforma. El native-stack maneja la ventana
modal y Reanimated/RNGH comparten la física. No activar también el swipe nativo
de UIKit: competiría con el pan y duplicaría el movimiento.

El **predictive back interactivo no está disponible en este stack instalado**:
`@react-navigation/native-stack` 7.16 desactiva `gestureEnabled` en Android y
`nativeBackButtonDismissalEnabled`; además, `app.json` ya conserva
`predictiveBackGestureEnabled: false`. Atrás sí cierra con la animación inversa.
No se ha cambiado esa configuración global. Para adoptar predictive back hay
que revisar la integración nativa y sustituir la intercepción diferida del pop;
activar solo el flag no proporciona un gesto predictivo de esta hoja.

Se mantiene Reanimated **4.5.1**, ya instalado con Expo 57/RN 0.86. No se baja a
3.x: las APIs solicitadas (`withSpring`, worklets y entering) están disponibles
en la versión actual del proyecto.

## Validación

- Typecheck, lint dirigido y 40 pruebas de recetas/pager/geometría correctos.
- Build y arranque nativos iOS: iPhone 15 Pro, iOS 26.5. Apertura, X, swipe largo,
  recuperación del swipe corto, vuelta a la lista/tab bar y apertura/cierre con
  Reducir movimiento activado. Preferencia del simulador restaurada después.
- Bundle Hermes Android generado. El checkout carece de `android/` y de
  `google-services.json`, así que no se ha ejecutado Android nativo.
- Pendientes: recorrido Android con gesture navigation, rotación real/iPad y
  medición de fps en dispositivos físicos. El simulador no acredita 60 fps.
- No se ha publicado ninguna receta de prueba, migración, build ni OTA.

Referencias: [native-stack](https://reactnavigation.org/docs/native-stack-navigator/),
[withSpring](https://docs.swmansion.com/react-native-reanimated/docs/animations/withSpring/),
[accesibilidad Reanimated](https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility/).
