# QuéFalta — Despliegue en Android (Google Play)

> Revisión del proyecto (2026-07-06) de cara al primer build/publicación Android.
> Estado: la app iOS ya está enviada al App Store. El código es multiplataforma
> (Expo SDK 54) y la mayor parte ya funciona en Android; esto lista lo que falta.

## ✅ Lo que YA está listo para Android

- `android.package` = `com.quefalta.app`, adaptive icon completo (foreground +
  monochrome 1024×1024, fondo `#E1EBF7`), `predictiveBackGestureEnabled: false`.
- **Sign in with Apple bien acotado a iOS**: `LoginScreen` solo muestra el botón
  con `Platform.OS === 'ios'` + `isAvailableAsync()`; en Android no se llama.
- **Google OAuth PKCE**: el flujo (`WebBrowser.openAuthSessionAsync` + extraer
  `code`) es idéntico en Android; el redirect `quefalta://auth/callback` ya está
  dado de alta en Supabase. El scheme `quefalta://` lo genera prebuild solo.
- **Notificaciones**: canal Android creado (`ensureAndroidChannel`), `color` del
  plugin configurado, `push_tokens.platform` guarda `android`. El servidor
  (`send-push`) usa la Expo Push API → no cambia nada.
- **Botón atrás**: los 11 usos de `<Modal>` tienen `onRequestClose`.
- **LayoutAnimation** habilitado para Android donde se usa (3 pantallas).
- **Insets inferiores**: la tab bar añade `insets.bottom` en Android y los sheets
  usan `Math.max(insets.bottom, 20)` → la barra de gestos no tapa nada.
- **EAS**: `appVersionSource: remote` + `autoIncrement` → `versionCode` automático.
  Las env vars de EAS (Supabase URL/key) son por perfil, no por plataforma → los
  builds Android las heredan sin tocar nada.
- SDK 54 compila con target API ≥ 35 → cumple el requisito vigente de Google Play.
- **Release endurecido (2026-08-24):** el plugin local
  `plugins/withAndroidReleaseHardening.js` se reaplica en cada prebuild, elimina
  el fallback a `debug.keystore` del bloque release y activa minificación/R8 y
  recorte de recursos. EAS inyecta después el keystore de upload real. El
  manifest de producción bloquea además `RECORD_AUDIO`, permisos de storage
  heredados y `SYSTEM_ALERT_WINDOW`; los manifests debug conservan el overlay
  que necesita el dev client. `versionCode` continúa gestionado en remoto con
  `appVersionSource: remote` + `autoIncrement`.

## 🔴 Bloqueantes antes del primer build de producción

### 1. Push en Android = FCM (Firebase)
`getExpoPushTokenAsync` en Android necesita Firebase configurado; hoy el registro
falla en silencio (el `catch` de `lib/notifications.ts` se lo traga) → sin push.

1. Crear proyecto en Firebase Console y añadir app Android `com.quefalta.app`.
2. Descargar `google-services.json` → `android.googleServicesFile` en `app.json`.
   (Si no se quiere commitear: subirlo como *file env var* de EAS, mismo patrón
   que se usó con `.env.local`.)
3. Subir la credencial **FCM V1** (service account de Firebase) a EAS:
   `eas credentials` → Android → Google Service Account → FCM V1. Sin este paso
   Expo acepta el push pero el dispositivo nunca lo recibe.
4. **Icono de notificación**: el plugin `expo-notifications` solo tiene `color`;
   sin `icon` Android pinta un glifo genérico/cuadrado blanco. Añadir
   `"icon": "./assets/notification-icon.png"` (96×96, blanco puro sobre
   transparente — se puede derivar de `android-icon-monochrome.png`).

### 2. App Links (invitaciones `quefalta.es/join/*`)
La recepción por listener de `Linking` ya es multiplataforma, pero Android no
abrirá esos enlaces sin declararlos:

1. En `app.json` → `android.intentFilters` con `autoVerify: true`, scheme https,
   host `quefalta.es`, pathPrefix `/join`.
2. Publicar `https://quefalta.es/.well-known/assetlinks.json` en el repo
   `quefalta-web` (hermano del AASA de iOS) con `package_name` y la huella
   **SHA-256 del certificado de FIRMA**. ⚠️ Con Play App Signing la huella buena
   es la de *App signing key certificate* (Play Console → App integrity), NO la
   del keystore de upload de EAS. Hasta la primera subida a Play no existe →
   orden: build → subir AAB → copiar huella → desplegar assetlinks.json.

### 3. Edge-to-edge: cabeceras con `paddingTop` fijo
SDK 54 fuerza edge-to-edge en Android: el contenido se dibuja BAJO la status bar
y su altura varía por dispositivo (24–48+ dp). Todas las cabeceras usan
`paddingTop: 52/56` fijo (calibrado para iPhone) → en Android puede solapar con
la status bar o quedar descompensado. Afecta a ~20 pantallas +
`OnboardingLayout` + `LoginScreen`.

- Fix recomendado: sustituir el número mágico por `insets.top + K` vía
  `useSafeAreaInsets()` (o un hook compartido `useHeaderPadding()` para no
  repetir). En iOS el resultado debe quedar visualmente IGUAL que hoy.
- `StatusBar backgroundColor={...}` es no-op con edge-to-edge (inofensivo pero
  inerte); `barStyle` sí sigue funcionando — no hay que tocarlo.

### 4. Splash nativo
`app.json` no tiene config de splash. En Android 12+ el sistema pinta el icono
sobre fondo por defecto (blanco) → salto brusco al `BootLoader` (fondo
`#E1EBF7`). Añadir el plugin:

```json
["expo-splash-screen", { "backgroundColor": "#E1EBF7", "image": "./assets/splash-icon.png", "imageWidth": 200 }]
```

(Aplica también a iOS; revisar que no cambie lo ya aprobado antes del próximo
build 34.)

### 5. Permisos innecesarios en el manifest
`expo-image-picker` añade `RECORD_AUDIO` al manifest y la app jamás graba audio
(mismo problema conceptual que el rechazo 5.1.1 de Apple, versión Google).
Añadir en `app.json`:

```json
"android": { "blockedPermissions": ["android.permission.RECORD_AUDIO"] }
```

`CAMERA` y `READ_MEDIA_IMAGES` sí se usan (foto de perfil) → se quedan.

## 🟠 Google Play Console (proceso, no código)

- Cuenta de desarrollador (25 USD, pago único).
- ⚠️ **Cuenta personal nueva = prueba cerrada obligatoria**: 12 testers durante
  14 días seguidos antes de poder pasar a producción. Esto marca el calendario:
  crear la app en Play Console y arrancar el closed testing CUANTO ANTES.
- La **primera** subida del `.aab` es manual en Play Console (EAS submit no puede
  crear la app). Después: `eas submit -p android` con un service account de
  Google Cloud (`submit.production.android.serviceAccountKeyPath` en `eas.json`).
- **Data safety form**: declarar email/nombre/foto (cuenta), sin tracking.
- **URL de borrado de cuenta**: Google exige una URL web pública para solicitar
  el borrado (además del borrado in-app ya existente) → página nueva en
  `quefalta-web` (p. ej. `quefalta.es/eliminar-cuenta`) que explique el flujo o
  reciba solicitudes.
- Política de privacidad: URL ya existente del App Store sirve.
- **Ficha**: utilizar `PLAY-STORE-LISTING.md` (es + ca), adaptada a los límites
  y al formato específico de Google Play. Capturas: las 1290×2796 del generador (`marketing/appstore`) están
  dentro de los límites de Play (320–3840 px) → valen tal cual, aunque el marco
  sea de iPhone; opcional regenerar con marco Android. **Falta el feature
  graphic 1024×500 (obligatorio)** — se puede hacer con el mismo generador.
- Cuestionario de clasificación de contenido + declarar la cuenta de Google de
  prueba para el equipo de revisión (mismo usuario que en App Store Connect).

## 🟡 Recomendado (no bloquea el build)

- **Login con Apple en Android**: quien creó su cuenta con Apple en iOS no puede
  entrar en Android (el flujo es nativo iOS). Supabase soporta Apple como OAuth
  web (mismo patrón PKCE que Google) → requiere el Services ID + client secret
  del `.p8`, que es EXACTAMENTE el trabajo ya pendiente de `apple-link` (ver
  SIGNIN-APPLE). Si no entra en v1, al menos no bloquea: son cuentas distintas,
  pero conviene tenerlo en el radar para la continuidad multi-dispositivo.
- **Limpieza de `package.json`**: `firebase` (SDK web) no se importa en ningún
  sitio → eliminar (el push Android NO va por ese paquete, va por
  `google-services.json` + credencial FCM en EAS). `playwright` → mover a
  `devDependencies` (es del generador de capturas). Ninguno afecta al bundle,
  pero confunden.
- **`locales`**: los JSON de `locales/ios/` contienen claves `NS*` (purpose
  strings de iOS); Android no las necesita. Verificar en el primer prebuild que
  no generan entradas basura en `strings.xml`; si molestan, pasar los ficheros a
  formato por plataforma (`{ "ios": {...} }`).
- **Probar en dispositivo**: en Android es fácil — `eas build --profile
  preview --platform android` produce un APK instalable directamente (sin
  TestFlight ni cables). Primer objetivo: login Google, invitaciones, push
  (tras FCM), edge-to-edge en un móvil con notch.
- **RevenueCat**: el código ya lee `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`
  (`lib/purchases.ts`); cuando se reactive el paywall, crear la app Android en
  RevenueCat y añadir la key. Hoy no aplica (paywall OFF).

## Plan por fases

> Camino crítico = esperas EXTERNAS: verificación de la cuenta de Play (días) y
> closed testing obligatorio (14 días con 12 testers). Todo lo que desbloquea
> esas esperas va primero; el código (F1–F2) se hace en paralelo mientras corren.

### Fase 0 — Cuentas y servicios (arrancar YA, sin código)
- [ ] Crear cuenta **Google Play Developer** (25 USD, pago único). La
      verificación de identidad puede tardar días → primer paso de todos.
- [ ] Crear proyecto **Firebase** (gratis) + app Android `com.quefalta.app` →
      descargar `google-services.json`.
- [ ] En Firebase → Project settings → Service accounts: generar la clave del
      **service account** (JSON) para la credencial FCM V1 (se sube a EAS en F3).

**Salida:** cuenta Play verificada + `google-services.json` + service account JSON.

### Fase 1 — Config nativa en `app.json` ✅ (2026-07-06)
- [x] `android.intentFilters` con `autoVerify: true` para `quefalta.es` + `/join`.
- [x] `android.blockedPermissions: ["android.permission.RECORD_AUDIO"]`.
- [x] Icono de notificación: `assets/notification-icon.png` generado (96×96,
      silueta blanca sólida binarizada del monochrome — el original tiene el
      relleno al ~35% de alfa y Android solo usa el canal alfa) + `"icon"` en el
      plugin `expo-notifications`.
- [x] Plugin `expo-splash-screen`: `backgroundColor #E1EBF7` +
      `quefalta-logo-blue.png` (552×458, MISMO asset que el BootLoader → relevo
      sin salto; `splash-icon.png` era el placeholder de Expo, NO usarlo) +
      `imageWidth: 180` (180dp × 3x = 540px ≤ 552 nativos). ⚠️ Afecta TAMBIÉN a
      iOS → entra con el build 34 del resubmit (confirmado). ⚠️ En Android 12+
      el sistema enmascara el icono del splash en un CÍRCULO → verificar en F3
      que el logo (más ancho que alto) no se recorta feo; si pasa, bajar
      `imageWidth` o hacer variante con padding.
- [x] `android.googleServicesFile: "./google-services.json"` — fichero COLOCADO
      y verificado (proyecto Firebase `mercaapp-cfea2`, paquete
      `com.quefalta.app`). Va commiteado (no es secreto — viaja dentro del APK;
      NO añadirlo a `.gitignore` o EAS no lo subiría — mismo gotcha que
      `.env.local`).
- [x] `expo-system-ui` instalado: sin él, `userInterfaceStyle: "automatic"` no
      se aplica en Android (aviso de prebuild) y el modo "Automático" de
      Apariencia no seguiría el tema del sistema. Dependencia nativa nueva →
      incluida en los próximos builds de AMBAS plataformas.
- [x] Locales pasados a formato por plataforma (`{"ios": {...}}` en
      `locales/ios/*.json`): antes las purpose strings `NS*` de iOS se colaban
      como basura en los `strings.xml` de Android. iOS genera EXACTAMENTE lo
      mismo que antes (verificado en el código del plugin: `{...rest, ...ios}`).
- [x] **Validado con `expo prebuild -p android` real** (2026-07-06): manifest
      con `RECORD_AUDIO tools:node="remove"`, intent-filter `autoVerify` de
      quefalta.es/join, icono de notificación en 5 densidades + color,
      `splashscreen_logo` en 5 densidades + fondo `#E1EBF7`,
      `google-services.json` copiado, `strings.xml` de locales vacíos. La
      carpeta `android/` generada se borró después (gitignorada; EAS la
      regenera). Nota: prebuild cambió los scripts de npm (`npm run android` →
      `expo run:android`, antes `expo start --android`) — se deja así, es la
      convención Expo.
- [x] Typecheck verde + `expo config --type prebuild` resuelve sin errores.

**Salida:** `app.json` listo para builds Android. F3 desbloqueada (falta solo
`eas credentials`: keystore + FCM V1).

### Fase 2 — Edge-to-edge (el grueso del código) ✅ (2026-07-06)
- [x] Hook compartido `useHeaderTopPadding(iosPadding)` en
      `src/hooks/useHeaderTopPadding.ts`: en iOS devuelve el MISMO valor fijo de
      siempre (52/54/56 — iOS no cambia ni un punto); en Android devuelve
      `insets.top + (iosPadding − 46)` (46 = status bar "de diseño" con la que
      se calibraron los fijos → 52→+6, 54→+8, 56→+10 de aire real).
- [x] Aplicado a TODAS las cabeceras propias (paddingTop pasa a inline sobre el
      estilo): About, Profile, EditProfile, Appearance, AddMember,
      CatalogStores, GroupMembers, PrivacySecurity, GroupDetail (header +
      overlay expandido), Language, Friends, History, Help, Catalog (52);
      Home (scroll), Groups, List ×3 (56); OnboardingLayout topBar (54).
- [x] `ActiveCartBanner` topInset: `marginTop: 52` fijo → hook(52). Cubre las 9
      pantallas que despejan la status bar con el banner (Products ×6,
      SubCategory, Favorites — sus cabeceras de paddingTop 4 no se tocan).
- [x] `StoreProductModal`: `topInset` fullScreen 56 → hook(56); `SHEET_TOP`
      100 → `hook(52) + 48` (en iOS sigue siendo exactamente 100).
- [x] Footers/hojas sobre la navbar de 3 botones (opaca, ~48dp):
      OnboardingLayout footer (Continuar/Omitir) → `insets.bottom`;
      ActionSheet, hoja de GroupMembers y hoja de asignar de ListScreen →
      mismo patrón `Math.max(insets.bottom, 20)` que ya llevaban
      NameInputSheet/PaywallModal/ActiveCartBanner/LoginScreen.
- [x] Repaso: `StatusBar backgroundColor` queda inerte (no se toca),
      NotificationsSheet ya usaba insets por ambos lados; typecheck verde.
- [x] **Teclado**: con edge-to-edge el `adjustResize` del sistema deja de
      encoger la ventana → el teclado TAPABA la hoja "Nuevo grupo" y los campos
      de Editar perfil. Fix: `KeyboardAvoidingView behavior="padding"` también
      en Android (antes era iOS-only con `undefined` en Android) en
      NameInputSheet y EditProfileScreen. En iOS no cambia nada (ya era
      'padding'). REGLA: cualquier input nuevo en la mitad inferior de la
      pantalla necesita KAV con 'padding' en ambas plataformas.
- [x] Verificado en emulador Pixel_8_Botones (API 35, 3 botones): Home,
      Catálogo, Mi Lista, Grupos, Perfil, hoja "Nuevo grupo" — cabeceras con
      aire correcto bajo la status bar y hojas por encima de la navbar.

**Salida:** UI correcta con edge-to-edge. ⚠️ En iOS TODO queda idéntico por
construcción (rama `Platform.OS === 'ios'` devuelve los valores antiguos), pero
conviene un vistazo rápido en el simulador iOS antes del build 34.

### Fase 3 — Dev build Android + FCM + pruebas en dispositivo 🔄 EN CURSO
- [x] **Keystore**: ya existía en EAS (`Build Credentials -sWx5ZuMxV`, default) —
      no hizo falta generarlo.
- [ ] Subir la credencial **FCM V1** (service account JSON de Firebase) a EAS.
      Sin CLI no-interactivo → hacerlo en expo.dev (proyecto quefalta →
      Credentials → Android → Google Service Account Keys → FCM V1) o con
      `eas credentials -p android` en una terminal interactiva. Necesario para
      RECIBIR push, no para compilar (se puede hacer con el build en marcha).
- [x] `eas build --profile development -p android` ✅ FINISHED (2026-07-06,
      build `bb1c15d1`). APK:
      https://expo.dev/artifacts/eas/Bi4XP5KwXzZXJ6wePFJ95YwJ_UOL0KeEFEYa2bk15xw.apk Nota: el perfil development NO tiene env vars en EAS y no
      las necesita (el JS lo sirve Metro en local, que lee `.env.local`); ⚠️
      ANTES de un build `preview` Android, comprobar que el entorno preview
      tiene las env vars de Supabase en EAS (production ya las tiene).
- [ ] Instalar el APK en móvil real (ideal uno con notch/cutout) y/o emulador.
- [ ] Probar: login Google (PKCE), edge-to-edge (F2), catálogo/cesta/zonas,
      modo oscuro, botón atrás en modales, teclado (inputs), cambio de idioma.
- [ ] Probar **push real**: registro del token (`push_tokens.platform =
      'android'`) + recepción con `send-push`. Prerrequisito: los pendientes de
      push del proyecto (ejecutar `push_tokens_lang.sql` y
      `notifications_inbox.sql` + redeploy `send-push`) si aún no se hicieron.

**Salida:** app validada en Android de verdad. Requiere F0+F1+F2.

### Validación de QuéFalta Plus en Google Play (2026-08-29)

- El cliente detecta la prueba anual de siete días a partir de
  `defaultOption.freePhase`: Google Play solo devuelve ofertas elegibles para la
  cuenta y RevenueCat aplica esa opción automáticamente al comprar el paquete.
  Si no existe una fase gratuita elegible, el paywall no promete la prueba.
- Las builds Android de producción 19 (1.3.0) y 20 (1.3.1) ya existen, pero son
  anteriores al texto final de renovación y a esta detección de ofertas Android.
  La siguiente build de validación esperada es `versionCode` 21.
- Los envíos automatizados a la pista interna fallan con
  `SUBMISSION_SERVICE_ANDROID_SERVICE_ACCOUNT_IS_MISSING_PERMISSIONS`. Hasta
  corregir los permisos de la cuenta de servicio en Play Console, subir el AAB
  manualmente o publicar manualmente una release interna/cerrada existente.
- Validar con un tester de licencia: mensual, anual con prueba, anual sin prueba,
  restauración, cancelación/expiración y sincronización del entitlement `plus`
  con `premium_until`. Play Billing Lab permite repetir la prueba introductoria.

### Fase 4 — Play Console + closed testing ⏱️ (aquí arranca el reloj de 14 días)
- [ ] Crear la app en Play Console (es + ca como idiomas de ficha).
- [ ] `eas build --profile production -p android` → `.aab`.
- [ ] **Primera subida MANUAL** del AAB al track de closed testing (EAS submit
      no puede crear la app; a partir de la segunda ya se automatiza).
- [ ] Reclutar **12 testers** (lista de emails o grupo de Google) y repartir el
      opt-in link. Los 14 días cuentan con el testing ACTIVO → cuanto antes.
- [ ] Copiar la huella **SHA-256 de App signing** (Play Console → App
      integrity) → `assetlinks.json` en `quefalta-web/public/.well-known/` →
      desplegar web → verificar App Links en dispositivo.
      *(2026-07-08: fichero CREADO con la huella en placeholder
      `PEGAR_AQUI_LA_HUELLA_SHA256_DE_APP_SIGNING` + Content-Type fijado en
      `customHttp.yml`; falta pegar la huella real y push/deploy.)*
- [ ] Página web de **borrado de cuenta** (`quefalta.es/eliminar-cuenta`) en
      quefalta-web (requisito de Play; el borrado in-app ya existe).
      *(2026-07-08: página CREADA —`src/pages/eliminar-cuenta.astro`, enlazada
      en ambos pies, build verde, verificada en preview; promete respuesta al
      borrado por email en ≤30 días; falta push/deploy.)*
- [ ] Ficha completa: textos de `PLAY-STORE-LISTING.md` (es+ca), capturas del
      generador (valen tal cual), **feature graphic 1024×500**, data safety,
      content rating, cuenta de Google de prueba para el equipo de revisión.
      *(2026-07-08: feature graphic GENERADO es+ca —solo marca, sin capturas—
      con `marketing/appstore/feature-graphic.mjs` →
      `marketing/appstore/out/feature-graphic/{es,ca}.png`.)*

**Salida:** closed testing corriendo. Requiere F3. Mientras corre: cerrar
cualquier feedback de testers vía updates OTA o nuevos AAB al mismo track.

### Fase 5 — Producción
- [ ] Cumplidos los 14 días + criterios de Play → solicitar acceso a producción
      desde Play Console (formulario; Google puede tardar unos días en aprobar).
- [ ] `eas.json`: añadir `submit.production.android.serviceAccountKeyPath`
      (service account de Google Cloud con rol en Play Android Publisher) →
      `eas submit -p android` para las siguientes subidas.
- [ ] Publicar en producción con **staged rollout** (10% → 50% → 100%).
- [ ] Web: añadir badge/URL de Google Play junto al del App Store.

### Post-lanzamiento (no bloquea nada)
- Apple como OAuth **web** en Supabase para que cuentas Apple de iOS entren en
  Android (reutiliza el `.p8` pendiente de SIGNIN-APPLE).
- Limpieza `package.json`: quitar `firebase` (sin imports), `playwright` →
  devDependencies.
- RevenueCat: app Android + `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` cuando se
  reactive el paywall.
