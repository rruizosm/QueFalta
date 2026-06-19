# Privacidad y seguridad — Estado y runbook

> Última actualización: 2026-06-15 (revisión de seguridad)

Pantalla: `src/screens/PrivacySecurityScreen.tsx` (Perfil → "Privacidad y seguridad").

---

## 1. Estado de funciones

| Función | Estado | Notas |
|---------|--------|-------|
| Cerrar sesión en todos los dispositivos | ✅ | `signOut('global')` en AuthContext |
| Visible para otros (`discoverable`) | ✅ | Ya se aplica: la búsqueda y la visibilidad de perfiles lo respetan (ver §3) |
| Política de privacidad / Qué datos guardamos | ✅ | Enlace a quefalta.es/privacidad + diálogo |
| Eliminar cuenta | ⚠️ | Requiere desplegar la Edge Function (§4) |
| Tokens en almacén cifrado | ⚠️ | Código listo; requiere build nuevo (§5) |

---

## 2. SQL de seguridad a ejecutar en Supabase (SQL Editor)

Todos idempotentes. Orden recomendado:

| Fichero | Qué hace |
|---|---|
| `supabase/policies/profiles_visibility.sql` | **CRÍTICO.** Cierra la fuga de `profiles` (era legible por `anon` por la policy `ver todos USING(true)`). Deja un perfil visible solo a: uno mismo, co-miembros, amigos y perfiles `discoverable`. |
| `supabase/policies/member_search.sql` | El admin solo añade al grupo a perfiles `discoverable` (helper `is_discoverable`). |
| `supabase/policies/storage_avatars.sql` | Bucket `avatars` público con límite 5 MB + solo imágenes; escritura restringida a `{uid}/`. Borra antes cualquier policy de escritura permisiva creada desde el dashboard. |
| `supabase/migrations/text_length_limits.sql` | CHECK de longitud en columnas de texto libres. |
| `supabase/migrations/username_available.sql` | RPC `username_available` (comprueba @ libre sin filtrar perfiles). |
| `supabase/migrations/friendship_rate_limit.sql` | Trigger anti-spam: máx. 20 solicitudes de amistad/hora por usuario. |

Verificación de la fuga (no debe salir ninguna policy SELECT con `qual = true` ni rol `{public}`/`{anon}`):

```sql
select polname, roles, cmd, qual from pg_policies
where schemaname='public' and tablename='profiles' and cmd='SELECT';
```

---

## 3. Modelo de visibilidad de perfiles

Un usuario autenticado ve un perfil ajeno solo si comparte grupo, hay amistad, o
el otro es `discoverable`. Puntos de enforcement:
- `searchUsersByUsername` (src/api/groups.ts) → `.eq('discoverable', true)`.
- RLS de `profiles` → `supabase/policies/profiles_visibility.sql`.
- `isUsernameAvailable` (src/api/profile.ts) usa la RPC `username_available`
  (SECURITY DEFINER) para no dar falsos "disponible" con el modelo restringido.

---

## 4. Edge Function `delete-account`

Código en `supabase/functions/delete-account/index.ts`. Desplegar:

```bash
supabase login
supabase link --project-ref <TU_PROJECT_REF>
supabase functions deploy delete-account
```

- La `SUPABASE_SERVICE_ROLE_KEY` se inyecta sola en el entorno de la función.
- Las tablas dependientes deben tener `ON DELETE CASCADE` sobre `profiles`/`auth.users`
  (ver `supabase/migrations/group_delete_cascade.sql`), o borrar a mano antes de
  `auth.admin.deleteUser`.
- Mientras no esté desplegada, el botón muestra "La función de borrado aún no está desplegada".

---

## 5. Tokens de sesión cifrados (expo-secure-store)

`src/lib/authStorage.ts` mueve los tokens de Supabase de AsyncStorage al almacén
cifrado del sistema (Keychain/Keystore), con troceado (límite ~2 KB), fallback
web a AsyncStorage y migración read-through (sin re-login). **Es módulo nativo:**
requiere **build nuevo + submit**; una OTA (`eas update`) sobre un build sin él
crashearía.

---

## 6. Deep links / Universal Links

- **iOS — OK.** `quefalta-web/public/.well-known/apple-app-site-association`
  declara `LX4BLQDZS4.com.quefalta.app` para `/join/*`, y `app.json` tiene
  `associatedDomains: ["applinks:quefalta.es"]`. Los enlaces de invitación
  (`https://quefalta.es/join/<id>`) abren la app de forma verificada, no por el
  esquema `quefalta://` (que es solo el fallback).
- **OAuth callback** usa `quefalta://auth/callback` (esquema custom). En iOS el
  secuestro de esquema es inviable en la práctica y PKCE protege el `code`.
  Opcional a futuro: añadir `/auth/*` al AASA y al `redirectTo`.
- **Android — DIFERIDO** (v1 se lanza en iOS). Al publicar en Android, activar
  **App Links** para evitar el secuestro del esquema custom:
  1. `app.json` → `android.intentFilters` con `autoVerify: true`, `scheme: https`,
     `host: quefalta.es`, `pathPrefix: /join`.
  2. Publicar `https://quefalta.es/.well-known/assetlinks.json` con `package_name`
     `com.quefalta.app` y el **SHA-256 del certificado de firma** (`eas credentials`).

---

## 7. Verificado / sano

- Sin secretos en el repo ni en el historial git (solo placeholders en docs).
  `.env*.local` gitignored y nunca commiteado. El bundle solo lleva la anon key;
  la service-role vive en GitHub Actions secrets / EAS env / Edge Functions.
- `premium_until` protegido por trigger contra manipulación desde el cliente
  (`supabase/migrations/profile_premium.sql`).

## 8. Deuda menor pendiente

- Acoso 1-a-1 vía borrar+reenviar solicitud de amistad: necesitaría tabla de
  bloqueos (el rate-limit por ventana no lo cubre).
- RevenueCat/paywall desactivado en v1 (app gratis). El webhook ya valida el
  token en tiempo constante; su redeploy no hace falta hasta activar Plus.

---

## 9. Archivos implicados

- `src/screens/PrivacySecurityScreen.tsx`, `src/api/account.ts`, `src/api/profile.ts`,
  `src/context/AuthContext.tsx`, `src/lib/authStorage.ts`, `src/lib/supabase.ts`.
- `supabase/functions/delete-account/index.ts`.
- `supabase/policies/*.sql`, `supabase/migrations/*.sql` (ver §2).
