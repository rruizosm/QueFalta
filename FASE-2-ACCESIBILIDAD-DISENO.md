# Fase 2 — Accesibilidad, coherencia visual y recursos

**Fecha:** 2026-08-14  
**Alcance:** completar los pendientes de accesibilidad y diseño de las fases 0–1 y reducir recursos incluidos en el binario, sin modificar procesos de negocio ni datos.  
**Cambios remotos:** ninguno. No se han aplicado migraciones ni modificado Supabase.

## 1. Resultado

La aplicación respeta ahora la preferencia del sistema **Reducir movimiento**, comunica mejor sus controles a VoiceOver/TalkBack y mejora la legibilidad de todos los temas. La carga de recursos se reduce sin cambiar los iconos ni la tipografía visibles.

| Área | Antes | Después |
|---|---:|---:|
| Recursos de la exportación iOS | 57 | 38 |
| Módulos del bundle | 1.524 | 1.470 |
| Bundle Hermes | 6,15 MB | 5,81 MB |
| Exportación en disco | 11,4 MiB | 7,4 MiB |
| Familias de iconos empaquetadas | 16 | 1 (Ionicons) |
| Pesos de Space Grotesk empaquetados | 5 | 4 usados |

La exportación ocupa aproximadamente un **35 % menos** en disco. El tamaño de la app Release de simulador queda en unos 55 MiB; no equivale al tamaño descargable de App Store.

## 2. Accesibilidad de movimiento

Se añade `useReducedMotion`, conectado a `AccessibilityInfo`, con actualización en caliente cuando cambia la preferencia del sistema.

Con **Reducir movimiento** activo:

- BootLoader conserva la información de carga, pero elimina entrada y latido continuos.
- La barra Liquid Glass y los controles segmentados cambian de posición sin rebote ni estiramiento.
- Toasts aparecen y desaparecen sin desplazamiento.
- Las expansiones de catálogo, lista, historial, nutrición y ficha omiten `LayoutAnimation`.
- Las hojas, modales, filtros, paywall, notificaciones y fichas omiten las transiciones `slide`/`fade`.
- El arrastre manual de la hoja de filtros sigue respondiendo al dedo, pero su cierre o retorno no añade animación.

Los procesos, estados y tiempos de red no cambian.

## 3. Lectura y operación asistida

- Los mensajes toast se anuncian como alertas y ya no truncan el texto a dos líneas.
- Atrás, cerrar, limpiar y los controles de cantidad tienen etiquetas localizadas en castellano y catalán.
- Cantidad, selector lista/cuadrícula, segmentos, supermercados, chips de filtros y grupos desplegables exponen sus estados seleccionado, marcado, deshabilitado o expandido.
- Las hojas compartidas se identifican como contenido modal y sus fondos decorativos quedan fuera del recorrido accesible.
- Los botones y chips compartidos principales alcanzan un objetivo táctil mínimo efectivo de 44 puntos.
- Las filas desplegables de información de producto exponen su estado abierto/cerrado.
- BootLoader comunica un estado de progreso en lugar de presentar solo elementos visuales.

No se declara una certificación completa de VoiceOver/TalkBack: falta recorrer los flujos autenticados con una cuenta QA y dispositivos físicos.

## 4. Texto grande y composición

La pantalla de acceso se probó con la categoría iOS `accessibility-large`.

- La tarjeta promocional cambia de rejilla a una sola columna.
- El icono decorativo lateral desaparece para reservar anchura al contenido.
- Los textos decorativos de portada se limitan a 2×; campos, errores, textos legales y botones conservan su escalado normal.
- El título de supermercados se encoge dentro de la tarjeta y centra sus líneas sin desbordarse.
- La pantalla mantiene desplazamiento hasta los proveedores de acceso y los enlaces legales.

En iPad, la composición mantiene la columna centrada, todos los proveedores y los textos legales visibles sin recortes.

## 5. Contraste y coherencia visual

Se reforzaron los tokens secundarios sin alterar la jerarquía de superficies:

| Token | Contraste anterior | Contraste actual |
|---|---:|---:|
| `inkSoft` sobre `paper` claro | 3,64:1 | 4,97:1 |
| `inkFaint` sobre `paper` claro | 1,82:1 | 4,55:1 |
| `inkFaint` sobre `paper` oscuro | 3,05:1 | 5,02:1 |

Sobre las tarjetas oscuras, el nuevo `inkFaint` mantiene 4,58:1. Naranja, verde y turquesa se oscurecieron levemente para que el texto blanco de botones y chips supere 4,5:1. Azul, morado y rosa ya cumplían y conservan su valor. Los bordes mantienen tokens propios y no se han convertido en texto de alto contraste.

El selector lista/cuadrícula adopta radios coherentes, un objetivo táctil mayor y estado seleccionado accesible.

## 6. Recursos y rendimiento

- Las 83 importaciones de `Ionicons` apuntan al módulo directo. El índice general de `@expo/vector-icons` arrastraba todas las fuentes disponibles.
- `useFonts` se importa desde `expo-font` y cada peso de Space Grotesk desde su entrada directa; deja de incluirse `300Light`, que no se usa.
- Se elimina la dependencia `@expo-google-fonts/montserrat`, sin referencias en el proyecto.
- No se han cambiado nombres de iconos, familias tipográficas aplicadas ni composición normal.

## 7. Verificación

| Prueba | Resultado |
|---|---|
| `npm run quality` | Correcto |
| TypeScript | 0 errores |
| ESLint | 0 errores, 0 avisos |
| Tests | 27/27 correctos |
| Export de producción iOS | Correcto |
| Xcode Release, Node 22.23.2 | Correcto |
| iPhone 17e, texto `accessibility-large` | Correcto tras adaptar Login |
| iPhone 17e, Reducir movimiento | Preferencia activada y app ejecutada sin fallos |
| iPad mini, tamaño normal | Correcto, sin recortes |
| `git diff --check` | Correcto |

Los avisos de Xcode continúan procediendo de Hermes, Expo y Pods; no se detectaron errores nativos propios.

## 8. Pendientes posteriores

- Recorrido completo con VoiceOver y TalkBack en una cuenta QA autenticada.
- Validación en dispositivos físicos de texto grande, contraste aumentado, transparencia reducida y orientación.
- Revisar pantallas densas autenticadas en los dos tamaños de texto de accesibilidad más altos; no conviene imponer límites globales de fuente.
- Medir lanzamiento, memoria, red y frames con Instruments en dispositivo físico.
- Evaluar el peso de las imágenes de marca por separado; no se han recomprimido para evitar degradación visual.

La Fase 2 queda funcionalmente terminada dentro del alcance local disponible.
