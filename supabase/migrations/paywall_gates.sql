-- Fase 2 de MONETIZACION.md — enforcement en SERVIDOR del modelo freemium.
-- Todo cuelga de paywall_enabled(): mientras devuelva false, ni el trigger de
-- grupos ni el recorte del comparador hacen nada. Es el espejo del
-- PAYWALL_ENABLED del cliente (src/constants/limits.ts): en Fase 4 se cambian
-- LOS DOS a la vez (aquí basta re-ejecutar la función con `true`).
--
-- Ejecutar en: Supabase → SQL Editor, ANTES de re-ejecutar similar_products.sql
-- (el RPC usa estas funciones). Requiere profile_premium.sql (premium_until).

-- Interruptor del paywall en servidor. Fase 4: re-ejecutar con `select true`.
create or replace function public.paywall_enabled()
returns boolean language sql immutable as $$ select false $$;

-- ¿Tiene el usuario QuéFalta Plus activo? SECURITY DEFINER para poder leer
-- profiles desde triggers/RPC sin depender de las policies del llamante.
create or replace function public.is_premium(uid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select premium_until > now() from public.profiles where id = uid),
    false
  );
$$;

-- Crear y unirse a grupos es ilimitado para todas las cuentas. Estos DROP
-- hacen el script seguro también si se reejecuta sobre una instalación antigua.
drop trigger if exists groups_enforce_limit on public.groups;
drop function if exists public.enforce_group_limit();
