# Privacidad y seguridad — Estado y pasos

> Última actualización: 2026-06-03

Pantalla: `src/screens/PrivacySecurityScreen.tsx` (accesible desde Perfil →
"Privacidad y seguridad").

---

## 1. Funciones implementadas

| Función | Estado | Notas |
|---------|--------|-------|
| Cerrar sesión en todos los dispositivos | ✅ Funciona | `signOut('global')` en AuthContext |
| Visible para otros (descubrimiento) | ⚠️ Parcial | Guarda preferencia; falta enforcement (ver §3) |
| Política de privacidad / Qué datos guardamos | ✅ Funciona | Enlace + diálogo informativo |
| Eliminar cuenta | ⚠️ Requiere desplegar Edge Function (§2) |

---

## 2. PENDIENTE — pasos para que funcione del todo

### 2.1 Columna `discoverable` en `profiles` (REQUERIDO)
La app ya lee/escribe `profiles.discoverable`. Hay que crear la columna:

```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS discoverable boolean NOT NULL DEFAULT true;
```
> Sin esto, `fetchProfile` fallará al seleccionar la columna.

### 2.2 Edge Function `delete-account` (REQUERIDO para eliminar cuenta)
El código ya está en `supabase/functions/delete-account/index.ts`. Desplegar:

```bash
# 1. (si no está) instalar la CLI y enlazar el proyecto
npm install -g supabase
supabase login
supabase link --project-ref <TU_PROJECT_REF>

# 2. desplegar la función
supabase functions deploy delete-account
```

- La `SUPABASE_SERVICE_ROLE_KEY` se inyecta sola en el entorno de la función.
- Verifica que las tablas dependientes (`group_members`, `shopping_lists`, …)
  tengan `ON DELETE CASCADE` sobre `profiles`/`auth.users`, o añade los borrados
  manuales en la función antes de `auth.admin.deleteUser`.
- Mientras no esté desplegada, el botón "Eliminar mi cuenta" muestra un aviso
  controlado ("La función de borrado aún no está desplegada").

---

## 3. Hueco conocido: "Visible para otros" no se aplica aún

Hoy **solo se entra a un grupo por enlace de invitación** (`joinGroup` desde un
deep link). **No existe búsqueda por @usuario** para añadir gente, así que la
preferencia `discoverable` se guarda pero todavía no filtra nada.

**Dónde habrá que aplicarla** cuando se construya la búsqueda de usuarios:
- En la futura query tipo `searchUsersByUsername(...)` → añadir
  `.eq('discoverable', true)`.
- Es decir: el toggle ya deja la preferencia lista; solo falta el punto de
  enforcement cuando exista el descubrimiento por @usuario.

---

## 4. Archivos implicados

- `src/screens/PrivacySecurityScreen.tsx` — la pantalla.
- `src/api/account.ts` — `deleteAccount()` (invoca la Edge Function).
- `src/api/profile.ts` — campo `discoverable` en `UserProfile` + `updateProfile`.
- `src/context/AuthContext.tsx` — `signOut(scope)` con soporte `'global'`.
- `supabase/functions/delete-account/index.ts` — Edge Function de borrado.
- `src/navigation/index.tsx` + `src/types.ts` — ruta `PrivacySecurity`.
