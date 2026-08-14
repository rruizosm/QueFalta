# Fase 0 — Línea base técnica de QuéFalta

**Fecha:** 2026-08-13  
**Alcance:** entorno reproducible, controles automáticos, compilación iOS, medidas iniciales, matriz visual y auditoría de Supabase.  
**Cambios funcionales:** ninguno. No se ha modificado lógica de producto, diseño, datos ni configuración remota.

## 1. Entorno reproducible

| Componente | Línea base |
|---|---|
| Node.js | 22.23.2 (`.nvmrc`) |
| npm | 10.9.8 (`packageManager`) |
| Expo | SDK 54 |
| React Native | 0.81.5 |
| TypeScript | 5.9.2 |
| Xcode usado | 26.5 |
| Workspace / scheme reales | `ios/QuFalta.xcworkspace` / `QuFalta` |
| Simuladores disponibles | iOS/iPadOS 26.5 |

Node queda limitado a la rama 22 LTS mediante `engines`. npm sigue siendo el gestor canónico porque el repositorio ya mantiene `package-lock.json`.

Archivos añadidos:

- `.nvmrc`: versión común para desarrollo y CI.
- `eslint.config.js`: configuración plana compatible con Expo.
- `.github/workflows/quality.yml`: control automático en `push` y pull requests.

## 2. Puerta de calidad

El comando único es:

```bash
npm run quality
```

Línea base obtenida:

| Control | Resultado |
|---|---|
| TypeScript | 0 errores |
| ESLint | 0 errores, 82 avisos conocidos |
| Pruebas automatizadas | 27/27 correctas |

El lint admite como máximo los 82 avisos actuales. Así la Fase 0 no mezcla una limpieza extensa con la creación de la línea base, pero CI fallará si aparece el aviso 83. El objetivo de fases posteriores es reducir el umbral gradualmente hasta cero.

> **Actualización 2026-08-14:** la Fase 1 eliminó los 82 avisos y fijó el umbral en cero. Ver `FASE-1-ESTABILIDAD-RENDIMIENTO.md`.

Los avisos actuales se concentran en dependencias de hooks, variables/imports sin uso, `require()` y estilo de tipos de arrays. Deben tratarse por lotes pequeños con validación funcional, especialmente los de dependencias de hooks.

## 3. Línea base de compilación y ejecución iOS

### Compilación

| Escenario | Resultado | Tiempo observado |
|---|---|---:|
| Debug limpio, iPhone 17 Pro, sin firma | Correcto | ~4 min |
| Debug incremental, misma caché | Correcto | 40,4 s |
| Debug incremental firmado | Correcto | 35,8 s |
| Release arm64 para simulador | Correcto | ~6–7 min; caché parcialmente calentada |

La compilación Release genera una aplicación de simulador de **55 MB**, con un bundle JavaScript de **6,9 MB**. Estas cifras no equivalen al tamaño descargable de App Store; para ese dato hace falta archivar y exportar una build de distribución.

### Arranque y memoria

- Primer bundle de Metro en Debug: **39,739 s**, 1.639 módulos.
- Bundles en caliente observados: **260 ms** y posteriormente 145–116 ms.
- Memoria residente en login Debug: **~44 MiB**.
- Memoria residente en login Release de simulador: **~242 MiB**.

Las cifras de memoria proceden del proceso del simulador y no deben usarse como presupuesto definitivo. El valor Release, especialmente alto, debe repetirse con Instruments en un dispositivo físico y una build de distribución antes de fijar objetivos.

### Avisos de Xcode

No se observaron avisos originados por código nativo propio de la app. La salida está dominada por Pods y módulos de terceros:

- React Native/Expo: cabeceras, nullability, APIs antiguas y compatibilidad futura con Swift 6.
- RevenueCat: concurrencia y `Sendable`.
- SDWebImage y codecs: deployment target antiguo y avisos de compilación.
- Scripts de Hermes/Expo Updates sin outputs declarados, por lo que se ejecutan siempre.
- Linker: biblioteca `-lc++` duplicada.

No conviene ocultarlos globalmente. Se revisarán al actualizar Expo/React Native y Pods, y se mantendrá una comprobación separada para detectar cualquier aviso nuevo que sí nazca en `ios/QuFalta`.

## 4. Matriz visual ejecutada

| Dispositivo | Sistema | Build | Resultado |
|---|---|---|---|
| iPhone 17 Pro | iOS 26.5 | Debug firmado | Login correcto |
| iPhone 17e | iOS 26.5 | Release arm64 | Login correcto, sin recortes |
| iPad mini (A17 Pro) | iPadOS 26.5 | Release arm64 | Login correcto |

Hallazgos:

- La pantalla de acceso se adapta correctamente al iPhone estrecho.
- En iPad mantiene una columna centrada legible, pero aprovecha poco la altura y deja una zona inferior muy vacía. Es una mejora de diseño, no un bloqueo.
- En un simulador reutilizado con refresh token inválido, Debug mostró al usuario el texto técnico completo de `AuthApiError`. La gestión de sesión debería limpiar el token y mostrar un mensaje comprensible.
- Un simulador nuevo pide confirmación para abrir el enlace del dev client; la build Release embebida evita esa interferencia.

Pendiente para cerrar una matriz de publicación:

- iPhone físico con la versión mínima soportada por la app.
- iPhone físico en la versión estable más reciente.
- Dispositivo pequeño y accesibilidad con texto grande.
- Modo claro/oscuro, orientación y conectividad degradada.

## 5. Red, catálogo y fluidez

Se confirmó el arranque y la petición de renovación de autenticación. No se ha establecido todavía una cifra fiable de red ni de scroll de catálogo porque no hay una cuenta de pruebas autenticada disponible en esta máquina y la captura de Instruments no consiguió adjuntarse al proceso del simulador.

Protocolo para completar la medida, sin cambiar código:

1. Usar una cuenta de QA con carrito, grupo, favoritos e histórico representativos.
2. Instalar una build Release firmada en dispositivo físico.
3. Medir con Instruments: App Launch, Network y Time Profiler.
4. Repetir tres veces arranque frío y cinco veces arranque caliente; registrar mediana y peor caso.
5. Recorrer Home, catálogo, búsqueda, detalle, añadir a cesta y finalizar compra.
6. Registrar tiempo hasta contenido útil, número/bytes de peticiones, memoria máxima, frames lentos y bloqueos del hilo principal.

Hasta completar este protocolo no se fijan objetivos numéricos artificiales para catálogo o red.

## 6. Estado real de Supabase

Auditoría de solo lectura contra el proyecto activo `gkffvigcnsesbaihycay`:

- Proyecto saludable, PostgreSQL 17.6.1, región `eu-west-1`.
- Existen las columnas críticas que el cliente selecciona en `profiles`, `list_items` y `purchase_items`, incluidas `onboarded_at`, `premium_until`, `region`, `verified`, `catalog_stores`, `category_name` y `store_product_id`.
- RLS está activo en las tablas principales de usuario y grupos revisadas.
- Existen los RPC usados actualmente por el cliente: `catalog_cheaper_products_v4`, `my_purchase_statistics_visuals` y `username_available`.
- Están desplegadas `delete-account`, `apple-link`, `send-push` y `catalog-embed`.
- Hay tablas de catálogo para los 15 supermercados documentados.

Los nombres/fechas del historial remoto no coinciden uno a uno con todos los ficheros SQL locales, porque parte del despliegue se hizo manualmente o con nombres diferentes. La comprobación de esquema confirma compatibilidad de arranque; **no significa que todos los ficheros locales estén registrados en el historial remoto**. No se ha aplicado ninguna migración durante esta fase.

### Alertas del asesor

| Área | Avisos | Información | Prioridad |
|---|---:|---:|---|
| Seguridad | 33 | 11 | Alta |
| Rendimiento | 52 | 69 | Media/alta |

Bloques principales:

1. Funciones con `search_path` mutable: fijar un `search_path` explícito y seguro.
2. Funciones `SECURITY DEFINER` ejecutables por `anon`/`authenticated`: retirar permisos innecesarios y conservar solo los RPC públicos deliberados.
3. Protección contra contraseñas filtradas desactivada.
4. Policies RLS con reevaluación de `auth.*` por fila y varias policies permisivas solapadas.
5. Índices no usados: revisar con tráfico representativo antes de eliminar; no son candidatos a borrado automático.

`username_available` es `SECURITY DEFINER`; los otros dos RPC actuales no lo son. `catalog-embed` tiene `verify_jwt=false`, por lo que su autenticación interna con secreto/service role debe revisarse expresamente antes de ampliar su exposición.

## 7. Dependencias

`npm audit` informa de **35 vulnerabilidades transitivas** (15 moderadas, 18 altas y 2 críticas), también al omitir dependencias de desarrollo. Las correcciones automáticas propuestas implican saltos mayores e incompatibles de Expo/React Native, por lo que **no se ha ejecutado `npm audit fix`**.

Tratamiento recomendado:

1. Clasificar cuáles alcanzan realmente el binario o servicios de producción y cuáles pertenecen al toolchain.
2. Actualizar primero dentro de Expo SDK 54 mediante `expo install`.
3. Preparar en una rama separada la actualización de SDK con matriz completa y comparación de esta línea base.
4. No aceptar una bajada de versión de React Native ni un salto mayor automático sugerido por npm.

## 8. Criterios de salida de Fase 0

- [x] Versiones de Node/npm fijadas.
- [x] Typecheck, lint y tests agrupados en un comando.
- [x] CI de calidad creado.
- [x] Debug y Release compilan.
- [x] Login revisado en iPhone y iPad simulados.
- [x] Línea base inicial de build, bundle y memoria registrada.
- [x] Esquema/RPC/asesores de Supabase contrastados sin mutaciones.
- [x] Alertas de dependencias registradas sin aplicar cambios incompatibles.
- [ ] Métricas completas de red, lanzamiento y scroll en dispositivo físico con cuenta QA.
- [ ] Matriz de versiones reales de iOS y accesibilidad.

Los dos puntos abiertos necesitan credenciales/dispositivos de prueba, pero no bloquean el comienzo de la Fase 1. Deben completarse antes de declarar preparada una nueva versión para App Store.
