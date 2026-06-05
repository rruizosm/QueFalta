# Notificaciones — Estado y hoja de ruta

> Última actualización: 2026-06-03
> SDK actual: **Expo SDK 54** · Probando en **Expo Go**

Documento de seguimiento para las notificaciones de la app. Resume qué está
hecho, qué funciona hoy y qué falta para tener notificaciones push completas.

---

## 1. Resumen rápido

Hay **dos tipos** de notificaciones, no confundir:

| Tipo | Qué es | ¿Funciona en Expo Go SDK 54? |
|------|--------|------------------------------|
| **Locales** | Las dispara la propia app en el dispositivo (recordatorios, avisos in-app) | ✅ Sí |
| **Push (remotas)** | Las envía un servidor aunque la app esté cerrada ("Rubén añadió leche al carrito") | ❌ No — requiere *development build* |

> **Limitación clave:** desde SDK 53, Expo Go (Android) **no soporta push tokens**
> (`getExpoPushTokenAsync`). Para push reales hace falta un *development build*
> (EAS Build + `expo-dev-client`).

---

## 2. FASE 1 — HECHA ✅ (notificaciones locales)

Funciona y es testeable en Expo Go ahora mismo.

### Archivos implicados
- **`src/lib/notifications.ts`** *(nuevo)* — toda la lógica encapsulada:
  - `configureNotificationHandler()` — banners visibles con la app abierta.
  - `requestPermission()` / `hasPermission()` — permisos OS + canal Android.
  - `sendTestNotification()` — dispara una notificación local inmediata.
  - `getNotificationsEnabled()` / `setNotificationsEnabled()` — persiste la
    preferencia del usuario en **AsyncStorage** (clave `@notifications_enabled`).
- **`App.tsx`** — llama a `configureNotificationHandler()` una vez al arrancar.
- **`src/screens/ProfileScreen.tsx`** — el toggle "Notificaciones":
  - Al montar refleja la preferencia guardada **y** el permiso real del OS.
  - Activar → pide permiso → guarda preferencia → notificación de prueba.
  - Si el permiso está denegado → ofrece abrir ajustes del sistema.
  - Desactivar → guarda la preferencia en off.

### Cómo probar
Perfil → Notificaciones → activar switch → aceptar permiso → debe aparecer la
notificación *"Notificaciones activadas ✅"* en el dispositivo.

### Dependencia añadida
```
expo-notifications ~0.32.17   (instalada con: npx expo install expo-notifications)
```

---

## 3. FASE 2 — PENDIENTE ⏳ (push remotas)

Esto es lo necesario para que lleguen avisos aunque la app esté cerrada.
**Requiere development build** (no se puede probar en Expo Go).

### Requisitos previos (infraestructura)
1. **Development build** con EAS:
   - `npm install -g eas-cli` (si no está)
   - `npx expo install expo-dev-client`
   - `eas build --profile development --platform android`
   - (iOS necesita **cuenta Apple Developer**, 99 $/año, para certificados APNs)
2. Añadir el plugin de notificaciones en **`app.json`**:
   ```json
   {
     "expo": {
       "plugins": [
         ["expo-notifications", {
           "icon": "./assets/notification-icon.png",
           "color": "#FF6B35"
         }]
       ]
     }
   }
   ```

### Pasos de implementación
1. **Obtener el push token** en `src/lib/notifications.ts`:
   - Tras conceder permiso, llamar a `Notifications.getExpoPushTokenAsync({ projectId })`.
   - El `projectId` se saca de `Constants.expoConfig.extra.eas.projectId`.
   - En Android: llamar a `setNotificationChannelAsync` ANTES de pedir el token.

2. **Guardar el token en Supabase** — nueva tabla:
   ```sql
   CREATE TABLE push_tokens (
     id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
     token       text NOT NULL,
     platform    text,                       -- 'ios' | 'android'
     created_at  timestamptz DEFAULT now(),
     UNIQUE (user_id, token)
   );
   ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "own tokens" ON push_tokens
     FOR ALL TO authenticated
     USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
   ```
   - Un usuario puede tener varios dispositivos → varios tokens.
   - Borrar el token al cerrar sesión.

3. **Edge Function de envío** (Supabase) que llame a la **Expo Push API**:
   - Endpoint: `POST https://exp.host/--/api/v2/push/send`
   - Body: `{ "to": "<ExpoPushToken>", "title": "...", "body": "...", "data": {...} }`
   - Recomendado usar Expo Push API (abstrae FCM/APNs con un solo endpoint).

4. **Disparar la función ante eventos reales** (elegir cuáles avisar):
   - Item añadido a un carrito compartido.
   - Carrito activado por otro miembro.
   - Invitación a un grupo.
   - Vía trigger de base de datos o webhook → Edge Function.

5. **Manejar la recepción y el tap** en la app:
   - `Notifications.addNotificationResponseReceivedListener` → deep-link a la
     pantalla correcta (grupo / carrito) usando el campo `data`.

---

## 4. Decisiones y notas

- La preferencia del toggle se guarda **local (AsyncStorage)**, no en Supabase.
  Si en el futuro quieres que la preferencia se sincronice entre dispositivos,
  mover a una columna `notifications_enabled` en la tabla `profiles`.
- El permiso de notificaciones es **por dispositivo** (lo gestiona el OS), por eso
  el switch comprueba el permiso real además de la preferencia guardada.
- Para push se eligió **Expo Push API** sobre FCM/APNs directo por simplicidad
  multiplataforma.

---

## 5. Checklist para "tener push funcionando"

- [ ] Crear cuenta Apple Developer (solo para iOS)
- [ ] `expo-dev-client` + primer `eas build` (Android sirve para empezar)
- [ ] Plugin `expo-notifications` en `app.json`
- [ ] Obtener y guardar push token en tabla `push_tokens`
- [ ] Edge Function que llama a Expo Push API
- [ ] Triggers/eventos que disparan los envíos
- [ ] Listener de tap → deep-link a la pantalla
