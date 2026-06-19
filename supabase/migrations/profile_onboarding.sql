-- profiles.onboarded_at — marca cuándo el usuario completó el alta inicial
-- (asistente de bienvenida: @usuario + supermercados obligatorios, + pasos
-- opcionales y la demo con coach marks).
--
-- NULL  = aún no ha pasado el alta  → la app muestra el OnboardingNavigator.
-- fecha = ya incorporado            → entra directo a la app.
--
-- Decisión de producto: SIN backfill. Todos los usuarios actuales lo verán una
-- vez (la columna nace NULL para todos). Si en el futuro se quisiera saltar a
-- los existentes, bastaría con:  update public.profiles set onboarded_at = now();
--
-- ⚠️ IMPRESCINDIBLE ejecutar antes de arrancar la app tras este cambio:
-- `fetchProfile` (src/api/profile.ts) ya selecciona `onboarded_at` y falla si la
-- columna no existe (mismo patrón que premium_until / catalog_stores).
--
-- Ejecutar en: Supabase → SQL Editor. Es aditivo (no toca columnas existentes).

alter table public.profiles
  add column if not exists onboarded_at timestamptz;
