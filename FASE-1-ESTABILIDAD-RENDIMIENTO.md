# Fase 1 — Estabilidad y rendimiento inicial

**Fecha:** 2026-08-14  
**Alcance:** resolver los hallazgos inmediatos de la Fase 0, eliminar deuda estática y reducir trabajo de arranque sin alterar funciones de negocio ni datos.  
**Cambios remotos:** ninguno. No se han aplicado migraciones ni modificado Supabase.

## 1. Resultado

La Fase 1 deja la aplicación con una puerta de calidad sin avisos, un arranque menos artificial y una carga inicial más contenida:

| Área | Antes | Después |
|---|---:|---:|
| Avisos ESLint | 82 | 0 |
| Límite admitido en CI | 82 | 0 |
| Espera mínima del BootLoader autenticado | 2.000 ms | 350 ms |
| Montaje inicial de pestañas | Las 4 durante el arranque | Bajo demanda |
| Error de proveedor de acceso | Podía quedar oculto/técnico | Mensaje localizado y comprensible |

## 2. Estabilidad

### Acceso y sesión

- Google y Apple propagan ahora los fallos reales hasta la pantalla de acceso.
- El usuario recibe un mensaje genérico y localizado en castellano/catalán; no se muestran objetos ni textos internos de Supabase.
- Cancelar voluntariamente Apple o cerrar el navegador de Google sigue sin tratarse como error.
- El arranque conserva la recuperación existente de refresh token inválido: Supabase elimina la sesión no recuperable y la app vuelve a login.
- No se ha cambiado PKCE: `exchangeCodeForSession` sigue recibiendo únicamente el `code`.

Supabase documenta que un refresh token inválido hace fallar la renovación y que `signOut({ scope: 'local' })` limpia solo la sesión del dispositivo. El flujo implementado mantiene ese alcance local para no desconectar otros dispositivos.

### Efectos y asincronía

- Se completaron las dependencias seguras de efectos de carrito, checklist, invitaciones y favoritos.
- El dispatcher de fichas de producto ya no reinicia una petición si solo cambia la identidad de callbacks o traducciones del padre; usa la referencia actual para mostrar el error/cerrar.
- Eroski/Caprabo usan dependencias estables para carga y adaptación.
- Las cargas de categorías del catálogo quedaron declaradas con sus longitudes reales, sin introducir ciclos de recarga por el estado `loading`.

## 3. Rendimiento

### Arranque

- La espera mínima de marca baja de 2 s a 350 ms. La sesión y el perfil siguen mandando: si necesitan más tiempo, el loader permanece hasta resolverlos o alcanzar el timeout de seguridad.
- React Navigation monta Catálogo, Lista y Grupos cuando se visitan por primera vez. Antes se construían las cuatro pestañas al arrancar Home, incluyendo efectos y árboles que el usuario quizá no iba a abrir.
- `freezeOnBlur` se conserva, por lo que una pestaña visitada mantiene su estado al cambiar a otra.

### Render y consultas

- Las listas de supermercados permitidos se memorizan en Catálogo, Novedades, Ofertas y Cambios de precios.
- Los comparadores y subconjuntos de filtros se mantienen estables entre renders.
- Se estabilizaron las claves de caché usadas por las pantallas paginadas.
- Esto evita reejecuciones causadas únicamente por arrays o funciones nuevas creadas en cada render.

## 4. Diseño de acceso

- El contenido se centra verticalmente cuando sobra altura, especialmente en iPad.
- En pantallas pequeñas conserva scroll, safe area y acceso a los textos legales.
- Los fallos de Apple/Google aparecen en una caja accesible (`alert`) integrada en la pantalla.
- Validación Release correcta en iPhone 17e e iPad mini, ambos con iOS/iPadOS 26.5.

## 5. Calidad del código

- ESLint queda en **0 errores y 0 avisos**, y CI exige `--max-warnings 0`.
- Se eliminaron imports, variables y expresiones sin uso.
- Se normalizaron tipos de arrays y el orden de imports.
- La configuración reconoce los `require()` relativos y de módulos nativos que son intencionados: assets de React Native, dispatcher cíclico de modales y fallbacks para Expo Go/builds antiguos.
- No se aplicaron correcciones automáticas a la lógica de hooks sin revisar su ciclo de vida.

## 6. Verificación

| Prueba | Resultado |
|---|---|
| `npm run quality` | Correcto |
| TypeScript | 0 errores |
| ESLint | 0 errores, 0 avisos |
| Tests | 27/27 correctos |
| Export de producción iOS | Correcto, 1.523 módulos |
| Bundle Hermes exportado | 6,14 MB |
| Xcode Debug incremental | Correcto |
| Xcode Release para simulador | Correcto |
| iPhone 17e Release | Login correcto, sin recortes |
| iPad mini Release | Login centrado y correcto |

El archivo local ignorado `ios/.xcode.env.local` apuntaba todavía a Node 24.9.0. Se alineó en esta máquina con Node 22.23.2, la versión de `.nvmrc`; al no estar versionado, cada desarrollador debe comprobarlo si Xcode conserva una ruta antigua.

## 7. Pendientes que pasan a la siguiente fase

- Medir arranque, memoria, red y frames en dispositivo físico con Instruments y una cuenta QA representativa.
- Validar de extremo a extremo Apple, Google y magic link en dispositivo físico.
- Medir el coste del primer acceso a cada pestaña tras activar montaje perezoso; si alguna supera el objetivo, añadir precarga selectiva después de que Home quede interactivo.
- Tratar las alertas de seguridad y rendimiento de Supabase mediante migraciones revisables, en una fase separada.
- Revisar tamaño de assets y fuentes: el export incluye familias de iconos que podrían reducirse, pero hacerlo exige una prueba visual completa.

> **Actualización:** la Fase 2 completó la reducción de fuentes/iconos y la validación visual correspondiente. Ver `FASE-2-ACCESIBILIDAD-DISENO.md`.

La Fase 1 queda funcionalmente terminada. Los puntos pendientes requieren condiciones externas de QA y no bloquean el trabajo de la siguiente fase, pero sí una declaración de preparación para App Store.
