# Notificaciones — Estado y hoja de ruta

> Última actualización: 2026-08-28
> SDK actual: **Expo SDK 57** · Push real requiere **dev/prod build** (no Expo Go)

Documento de seguimiento para las notificaciones de la app. Resume qué está
hecho, qué funciona hoy y qué falta para tener notificaciones push completas.

> **Fase 2 (push remotas) implementada y desplegada.** Eventos elegidos:
> producto añadido al carrito compartido · solicitud de amistad · invitación a
> un grupo. (El "carrito activado por otro miembro" se descartó.)

> **Alertas personalizadas: entrega general activa.** Añade un
> cuarto tipo `price_alert`, generado exclusivamente por el procesador servidor
> `process-price-alerts`; nunca por contenido enviado desde el cliente. Free
> dispone de una regla y Plus de reglas ilimitadas. Desde el 28-08-2026 el
> procesador cubre todas las cuentas mediante un cron permanente cada 15 minutos.

---

## 1. Resumen rápido

Hay **dos tipos** de notificaciones, no confundir:

| Tipo | Qué es | ¿Funciona en Expo Go SDK 57? |
|------|--------|------------------------------|
| **Locales** | Las dispara la propia app en el dispositivo (recordatorios, avisos in-app) | ✅ Sí |
| **Push (remotas)** | Las envía un servidor aunque la app esté cerrada ("Rubén añadió leche al carrito") | ❌ No — requiere *development build* |

> **Limitación clave:** desde SDK 53, Expo Go (Android) **no soporta push tokens**
> (`getExpoPushTokenAsync`). Para push reales hace falta un *development build*
> (EAS Build + `expo-dev-client`).

### Alertas personalizadas de precio/oferta

- `price_alert_rules` guarda reglas exactas o por palabras y aplica RLS por
  propietario. El servidor permite una regla a free y reglas ilimitadas a Plus.
- Los triggers de los espejos escriben eventos duraderos; la outbox
  `price_alert_deliveries` deduplica cada pareja regla+evento.
- El procesador agrupa por regla y actualización antes de insertar en
  `notifications` y mandar push. Así «Patata» produce un aviso resumido, no uno
  por cada producto coincidente. Una RPC transaccional reserva el lote y
  reutiliza la misma fila de bandeja en reintentos, sin repetir el push.
- Un producto que genere simultáneamente bajada y nueva oferta se deduplica como
  oferta. `new_arrival` conserva mensajes específicos de novedad en push y
  bandeja.
- El payload estructurado lleva `type=price_alert`, `notificationId`, `ruleId`,
  `rule`, `product`, `count` y `eventTypes`; la bandeja vuelve a traducirlo al
  idioma actual. Tanto el push como la bandeja abren `PriceAlertResults` con la
  lista exacta que originó el aviso.
- La lista no viaja dentro del push: la resuelve
  `get_price_alert_notification_products(notificationId)` desde la relación
  duradera de entregas y eventos. La RPC valida que la fila `notifications`
  pertenece a `auth.uid()` y aplica prioridad novedad → oferta → bajada por
  producto.
- La consulta de resultados y `process-price-alerts` están desplegados. El cron
  permanente llama al procesador cada 15 minutos para todas las cuentas. La RPC
  espera la finalización registrada del sync y omite lotes de más de 400 altas
  para no convertir un llenado inicial en una notificación masiva.
- La primera cola real expuso una comprobación obsoleta de la claim
  `service_role`. Quedó corregida con
  `20260824194005_fix_price_alert_service_role_claim.sql` y la v3 del
  procesador. Un reintento acotado de `TEST 2` envió un grupo
  correctamente (`claimed=1`, `sentGroups=1`, `failedGroups=0`). Una segunda
  ejecución envió cuatro grupos reales adicionales para novedad, bajada fuerte,
  oferta y mixta (`claimed=11`, `sentGroups=4`, `failedGroups=0`).
- `process-price-alerts` v4 toma el nombre y el emoji actuales de la regla,
  elimina prefijos heredados `TEST N ·`, antepone el emoji al título del push y
  lo guarda como dato estructurado. La bandeja interna muestra ese emoji como
  icono de la alerta personalizada. Se limpiaron las cinco entradas anteriores
  de `@rruizosma` y una sexta prueba con 🍫 confirmó el flujo completo. Las 500
  entregas agotadas restantes no se reabrieron para evitar una ráfaga.
- `process-price-alerts` v6 retiró el usuario fijo de evaluación y usa la RPC
  general. El cron `process-price-alerts-every-15-minutes` está activo desde el
  28-08-2026; la migración
  `20260828164258_generalize_price_alert_processor.sql` incorpora las guardas de
  sync terminado y lote masivo.
- Primera ejecución general verificada el 28-08 a las 17:00 UTC: función HTTP
  200, cero grupos atascados y cero entregas para las 1.568 falsas novedades de
  Esclat. Las 10 novedades de Mercadona aplicables a `@rruizosma` quedaron
  `sent` dentro de una notificación agrupada.

---

## 2. FASE 1 — HECHA ✅ (notificaciones locales)

Funciona y es testeable en Expo Go ahora mismo.

### Archivos implicados
- **`src/lib/notifications.ts`** *(nuevo)* — toda la lógica encapsulada:
  - `configureNotificationHandler()` — banners visibles con la app abierta.
  - `requestPermission()` / `hasPermission()` — permisos OS + canal Android.
  - `sendTestNotification()` — dispara una notificación local inmediata.
  - `getNotificationsEnabled(userId)` / `setNotificationsEnabled(userId, …)` —
    persiste la preferencia por cuenta y dispositivo en **AsyncStorage** (clave
    `@notifications_enabled:${userId}`); si no existe, devuelve `false`.
- **`App.tsx`** — llama a `configureNotificationHandler()` una vez al arrancar.
- **`src/screens/NotificationsScreen.tsx`** — información y toggle dentro de
  Perfil → Notificaciones:
  - La tarjeta del interruptor muestra solo «Avisos en el dispositivo», sin
    texto explicativo debajo; el detalle permanece en la tarjeta informativa.
  - Explica los avisos de carrito compartido, amistad, grupo y alertas personalizadas, y remite la
    bandeja interna a la campana de Inicio sin duplicarla dentro de esta pantalla.
  - Al montar refleja la preferencia guardada **y** el permiso real del OS.
  - Activar → pide permiso → guarda preferencia → notificación de prueba.
  - Si el permiso está denegado → ofrece abrir ajustes del sistema.
  - Desactivar → guarda la preferencia en off y elimina el token del dispositivo.
- **`src/context/AuthContext.tsx`** — al iniciar sesión reconcilia el token con
  la preferencia: registra si está activa y elimina un token anterior si está
  apagada.

### Cómo probar
Perfil → Notificaciones → activar switch → aceptar permiso → debe aparecer la
notificación *"Notificaciones activadas ✅"* en el dispositivo.

### Dependencia añadida
```
expo-notifications ~0.32.17   (instalada con: npx expo install expo-notifications)
```

---

## 3. FASE 2 — IMPLEMENTADA Y DESPLEGADA ✅ (push remotas)

Avisos que llegan aunque la app esté cerrada. **Requiere dev/prod build** (en
Expo Go los helpers de push son no-op; las locales siguen funcionando).

### Arquitectura elegida
El cliente **invoca una Edge Function** tras cada acción (mismo patrón que
`apple-link`/`delete-account`), enviando **solo IDs**. La función autentica con
el JWT del que llama, **deriva el texto y los destinatarios en servidor** (no se
puede falsear ni spamear) y envía por la **Expo Push API**. Lee `push_tokens`
con la service-role key (salta RLS). No usa triggers de BD ni webhooks del
dashboard → todo queda en código y SQL versionado.

> Si en el futuro hace falta que las push se disparen también desde fuera de la
> app (web, escrituras externas), se puede añadir un trigger Postgres con
> `pg_net` que llame a la MISMA función `send-push`.

### Archivos (ya escritos)
- **`app.json`** — plugin `["expo-notifications", { "color": "#2f6cb5" }]`
  (sin `icon` propio: usa el de la app; añadir un `notification-icon.png`
  96×96 blanco/transparente es opcional). ⚠️ Cambiar el plugin obliga a un
  **build nuevo**.
- **`supabase/migrations/push_tokens.sql`** — tabla `push_tokens`
  (`unique(token)`, RLS por dueño + policy de "reclamar" para cambio de cuenta
  en el mismo dispositivo) **+ tabla `push_throttle`** (cooldown anti-saturación,
  solo la gestiona la función; RLS sin policies).
- **`src/lib/notifications.ts`** — `registerForPushNotificationsAsync(userId)`
  (pide el Expo push token y lo guarda; gated por permiso + preferencia ON;
  no-op en Expo Go/web), `unregisterPushNotificationsAsync(userId)` (logout),
  y helpers de tap: `addNotificationResponseListener` /
  `getInitialNotificationData` + tipo `PushData`.
- **`supabase/functions/send-push/index.ts`** — Edge Function con los 3 eventos.
- **`src/api/push.ts`** — `notifyCartItemAdded` / `notifyFriendRequest` /
  `notifyGroupInvite` (fire-and-forget; nunca lanzan).
- Cableado de disparo:
  - `src/api/lists.ts` → `addItemsToList` (carrito; no-op si la lista es personal).
  - `src/api/friends.ts` → `sendFriendRequest`: selecciona el `friendshipId` y
    espera a que la función termine de procesar el aviso (best-effort).
  - `src/api/groups.ts` → `addMemberToGroup` (no en `joinGroup`/`createGroup`).
- `src/context/AuthContext.tsx` — registra el token al haber sesión y lo borra
  en `signOut` (antes de cerrar, por la RLS).
- `src/navigation/index.tsx` — tap en la push → `Groups→GroupDetail` (carrito /
  invitación) o `Home→Friends` (solicitud). En arranque en frío conserva el
  destino hasta que el navegador autenticado esté listo.
- `src/screens/NotificationsScreen.tsx` — el toggle registra/borra el token al instante.

### Eventos y mensajes
| Evento | Disparo | Destinatarios | Texto | Cooldown |
|--------|---------|---------------|-------|----------|
| `cart_item` | añadir al carrito de grupo | resto de miembros | "Ana añadió Leche (y N más)" | **5 min por grupo** |
| `friend_request` | enviar solicitud | el destinatario | "Ana te ha enviado una solicitud de amistad" | — |
| `group_invite` | añadir a un miembro | el nuevo miembro | "Ana te añadió al grupo Casa" | — |

> **Anti-saturación (carrito):** tras enviar un aviso de carrito, ese grupo entra
> en cooldown de 5 min (clave `cart:<group_id>` en `push_throttle`). Mientras dure,
> añadir más productos NO genera más notificaciones (lo añada quien lo añada);
> pasados los 5 min, el siguiente añadido vuelve a avisar. El cooldown arranca
> solo cuando se envía de verdad (si no hay destinatarios con token, no cuenta).
> Cambiar `THROTTLE_MS` o la clave (`cart:` → por actor) en `send-push/index.ts`.

---

## 4. Decisiones y notas

- La preferencia del toggle se guarda **local por usuario y dispositivo
  (AsyncStorage)**, no en Supabase.
  El push token **solo se registra si la preferencia está ON** → apagar el
  switch borra el token de este dispositivo y dejan de llegar push.
- El permiso de notificaciones es **por dispositivo** (lo gestiona el OS), por eso
  el switch comprueba el permiso real además de la preferencia guardada.
- Para push se eligió **Expo Push API** sobre FCM/APNs directo por simplicidad
  multiplataforma.
- **El cliente manda solo IDs**; el contenido lo arma la función → un cliente
  manipulado no puede inventar el texto ni enviar a quien no debe (se valida la
  pertenencia al grupo / la existencia de la solicitud).
- `push_tokens.unique(token)`: si el mismo dispositivo cambia de cuenta, la fila
  se reasigna (upsert on conflict). La policy UPDATE permite "reclamar" un token
  siempre que se deje a nombre propio.

---

## 5. Decisiones de envío
- **iOS**: funciona con el build EAS + credenciales APNs (ya tienes cuenta Apple
  Developer; EAS gestiona la APNs key al hacer el build).
- **Android**: la Expo Push API necesita **credenciales FCM** subidas a Expo
  (`eas credentials` → Android → FCM, o `google-services.json`). Sin eso,
  `getExpoPushTokenAsync` falla en Android → no hay token → no llegan push ahí
  (se traga el error; la app sigue). iOS no se ve afectado.

---

## 6. Estado de despliegue y prueba

SQL, función y soporte nativo ya están desplegados. `send-push` v7 quedó ACTIVE
el 2026-08-20 y mantiene compatibilidad con las versiones publicadas anteriores.

Para validar un flujo concreto en dispositivo: Perfil → Notificaciones → activar
«Avisos en el dispositivo» (aceptar permiso) → debe crearse una fila en
`push_tokens`. Con dos
cuentas/dispositivos: añadir un producto a un carrito compartido / enviar
solicitud / añadir a un grupo → llega la push y, al tocarla, abre la pantalla
correcta.

### Checklist
- [x] Plugin `expo-notifications` en `app.json`
- [x] Captura/guardado del push token (`push_tokens` + register/unregister)
- [x] Edge Function `send-push` (Expo Push API, 3 eventos, JWT)
- [x] Disparo de los 3 eventos desde la app
- [x] Listener de tap → deep-link a la pantalla
- [x] Ejecutar `push_tokens.sql` en Supabase
- [x] `supabase functions deploy send-push` (v7)
- [x] Build nativo con el plugin
- [ ] (Opcional Android) credenciales FCM en Expo
