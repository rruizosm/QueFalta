-- ─────────────────────────────────────────────────────────────
-- FUENTE DE VERDAD de la visibilidad (SELECT) de `profiles`.
-- ─────────────────────────────────────────────────────────────
-- PROBLEMA QUE ARREGLA:
--   add_profile_fields.sql creó  "profiles: ver todos"  USING (true)  SIN
--   `to authenticated` → la lee también el rol `anon`. Como las policies
--   SELECT se combinan con OR, esa policy ANULA las restringidas y deja toda
--   la tabla profiles legible por cualquiera que tenga la anon key (que va
--   embebida en el bundle → es pública): nombre, @usuario, avatar,
--   premium_until y catalog_stores de TODOS los usuarios. Además vacía de
--   sentido el toggle "Visible para otros" (discoverable).
--
-- MODELO RESULTANTE: un usuario autenticado puede ver un perfil solo si:
--   1. es el suyo,
--   2. comparte algún grupo con esa persona (para pintar avatares de miembros),
--   3. tiene una relación de amistad (pendiente o aceptada) con esa persona,
--   4. esa persona es `discoverable = true` (se deja encontrar por @usuario).
-- `anon` deja de poder leer profiles por completo (la app exige login).
--
-- Idempotente y autocontenido. Ejecutar en: Supabase → SQL Editor.
-- Reemplaza las policies SELECT de: add_profile_fields.sql, fix_rls_recursion.sql,
-- friendships.sql y member_search.sql (esas cuatro se consolidan aquí).

-- ── Helper: ¿comparto algún grupo con `other`? ─────────────────
-- SECURITY DEFINER para leer group_members sin disparar su RLS (evita
-- recursión y es más rápido). STABLE: el planner lo cachea por fila.
create or replace function public.shares_group_with(other uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.group_members a
    join public.group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid()
      and b.user_id = other
  );
$$;

-- ── Eliminar las policies demasiado amplias ────────────────────
drop policy if exists "profiles: ver todos"          on public.profiles;
drop policy if exists "profiles: lectura autenticada" on public.profiles;

-- ── (Re)crear las policies restringidas (todas to authenticated) ─
drop policy if exists "profiles select: own" on public.profiles;
create policy "profiles select: own"
  on public.profiles for select to authenticated
  using (id = auth.uid());

drop policy if exists "profiles select: co-member" on public.profiles;
create policy "profiles select: co-member"
  on public.profiles for select to authenticated
  using (public.shares_group_with(id));

-- Requiere has_friendship() de friendships.sql.
drop policy if exists "profiles select: friendship" on public.profiles;
create policy "profiles select: friendship"
  on public.profiles for select to authenticated
  using (public.has_friendship(id));

drop policy if exists "profiles select: discoverable" on public.profiles;
create policy "profiles select: discoverable"
  on public.profiles for select to authenticated
  using (discoverable = true);

-- ── Verificación (descomenta para auditar las policies vivas) ──
-- Tras ejecutar, NO debe aparecer ninguna policy SELECT con qual = `true`
-- ni con rol {public}/{anon}; todas deben ser {authenticated}.
--   select polname, roles, cmd, qual
--   from pg_policies
--   where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT';

-- NOTA (UX, no de seguridad): isUsernameAvailable() en src/api/profile.ts
-- comprueba la disponibilidad de un @usuario con un SELECT directo. Con este
-- modelo ya no "ve" usuarios ocultos, así que para un username ocupado por un
-- perfil no-discoverable devolvería "disponible" y el UPDATE fallaría luego por
-- el índice UNIQUE (la integridad se mantiene; solo cambia el mensaje). Si
-- molesta, convertir esa comprobación en un RPC SECURITY DEFINER que solo
-- devuelva un booleano (sin filtrar datos del perfil).
