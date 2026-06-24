-- ─────────────────────────────────────────────────────────────
-- Distintivo "verificado" (insignia dorada) en `profiles`.
-- ─────────────────────────────────────────────────────────────
-- Marca manual: la pones tú a mano en Supabase (Table editor →
-- profiles → columna `verified` → true) para los usuarios que
-- quieras destacar. La app pinta una insignia dorada junto a su
-- nombre en Perfil, Amigos y Miembros de grupo.
--
-- No requiere cambios de RLS: es una columna más de `profiles`, así
-- que la ve cualquiera que ya pueda ver esa fila según
-- policies/profiles_visibility.sql (yo mismo / co-miembro de grupo /
-- amistad / discoverable). No es secreta: es un sello público.
--
-- ⚠️ EJECUTAR ANTES de desplegar el cliente nuevo: fetchProfile()
--    (src/api/profile.ts) ya SELECCIONA `verified` y FALLA si la
--    columna no existe (igual que premium_until / onboarded_at).
--
-- Idempotente. Ejecutar en: Supabase → SQL Editor.

alter table public.profiles
  add column if not exists verified boolean not null default false;

comment on column public.profiles.verified is
  'Insignia dorada de cuenta verificada. Se asigna a mano desde Supabase.';

-- Para marcar a un usuario (ejemplo):
--   update public.profiles set verified = true where username = 'rruizosma';
