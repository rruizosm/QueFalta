-- ─────────────────────────────────────────────────────────────
-- RPC: ¿está libre un @usuario?  (username_available)
-- ─────────────────────────────────────────────────────────────
-- Antes la app comprobaba la disponibilidad con un SELECT directo sobre
-- profiles (src/api/profile.ts → isUsernameAvailable). Con el nuevo modelo de
-- visibilidad (profiles_visibility.sql), ese SELECT ya NO ve a los usuarios
-- ocultos (no discoverable, sin relación) → para un @ ocupado por uno de ellos
-- devolvía "disponible" y el guardado fallaba luego por el índice UNIQUE.
--
-- Esta función SECURITY DEFINER comprueba la unicidad saltándose RLS y solo
-- devuelve un booleano (no filtra ningún dato del perfil). Usa auth.uid() para
-- excluir tu propia fila (puedes "conservar" tu @ actual). Comparación
-- case-insensitive: la app guarda el @ en minúsculas, esto lo blinda.
--
-- Ejecutar en: Supabase → SQL Editor.

create or replace function public.username_available(uname text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1 from public.profiles
    where lower(username) = lower(btrim(uname))
      and id <> auth.uid()
  );
$$;

-- Solo usuarios autenticados pueden sondear disponibilidad (no anon).
revoke all on function public.username_available(text) from public, anon;
grant execute on function public.username_available(text) to authenticated;
