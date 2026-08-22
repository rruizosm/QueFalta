# AGENTS.md — QuéFalta (MercaAppMobile)

> Punto de entrada para agentes (Codex, etc.). Codex NO lee `CLAUDE.md` ni la memoria
> de Claude Code: este fichero y los que enlaza son toda tu fuente de contexto.

## Lee esto antes de tocar nada
1. **[CONTEXTO.md](CONTEXTO.md)** — documento canónico: identidad, stack, arquitectura,
   decisiones clave/gotchas, migraciones SQL y estado. Es la fuente de verdad; mantenlo al día.
2. **[HANDOFF.md](HANDOFF.md)** — **estado EN VUELO** (trabajo local sin commitear, supers
   implementados pero sin migrar, SQL pendientes, multi-zona). Esto vivía en la memoria de
   Claude Code y NO está en git de forma completa. Léelo o repetirás trabajo ya hecho.
3. Docs temáticos según la tarea: [ONBOARDING.md](ONBOARDING.md), [NOTIFICACIONES.md](NOTIFICACIONES.md),
   [PRIVACIDAD-SEGURIDAD.md](PRIVACIDAD-SEGURIDAD.md), [COMPARATIVA.md](COMPARATIVA.md),
   [MONETIZACION.md](MONETIZACION.md), [COMUNIDAD-AUTONOMA.md](COMUNIDAD-AUTONOMA.md),
   [LIQUID-GLASS.md](LIQUID-GLASS.md), [ANDROID.md](ANDROID.md), [MEJORAS-FUTURAS.md](MEJORAS-FUTURAS.md),
   y los `scripts/README-*-sync.md` para cada súper.

## Stack (¡correcto!)
- **Expo SDK 54** · React Native 0.81.5 · TypeScript. **NO es SDK 56.** Docs versionados:
  https://docs.expo.dev/versions/v54.0.0/ (una versión anterior de este fichero decía v56 — era erróneo).
- Backend **Supabase** (auth + Postgres + storage + edge functions). Catálogo Mercadona = API pública.
- iOS bundle `com.quefalta.app`, scheme `QuFalta`, Apple Team `LX4BLQDZS4`.
- App publicada en App Store (build 34). Repos: app `github.com/rruizosm/QueFalta` · web `github.com/rruizosm/QueFalta-Web`.

## Imprescindible para arrancar en una máquina nueva
Dos ficheros **gitignored** (no viajan con el repo), ambos en la raíz de `MercaAppMobile/`:
- `.env.local` con `EXPO_PUBLIC_SUPABASE_URL=https://auth.quefalta.es` y `EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>`.
- `google-services.json` (descargar de Firebase Console; solo para `expo run:android`/prebuild local).

Sin `.env.local`, Supabase no funciona. Detalles en CONTEXTO.md §Imprescindible.

## Comandos
- Typecheck (hazlo siempre antes de dar por terminado): `npx tsc --noEmit`
- Dev (Expo Go): `npx expo start`  ·  iOS device: `npx expo run:ios --device`
- Los syncs de catálogo viven en `scripts/sync-*.mjs` (Node); DRY_RUN sin escribir a BD.

## Reglas que NO se rompen (ver CONTEXTO.md para el detalle)
- **Login Google = PKCE**: extraer el `code` de la URL y pasar SOLO el code a `exchangeCodeForSession`.
- **Estado por-dispositivo en AsyncStorage = SIEMPRE por usuario** (`${KEY}:${userId}`), nunca clave global.
- **Accent/tema**: los `StyleSheet` con `colors.accent*` van como fábrica + `useThemedStyles`, no estáticos.
- **Lista por zonas**: todo nuevo "añadir a la cesta" debe pasar `categoryName`.
- **Migraciones SQL**: muchas columnas nuevas se seleccionan ya en el cliente → la app CRASHEA si no
  ejecutas la migración en Supabase. Antes de arrancar, revisa la lista de pendientes en CONTEXTO.md y HANDOFF.md.
- La web (`quefalta.es`) solo afirma lo que hay en la app publicada (6 supers, sin ofertas ni comparativa).
