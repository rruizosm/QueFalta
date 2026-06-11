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

-- Límite free de grupos CREADOS (espejo de FREE_LIMITS.maxCreatedGroups en
-- limits.ts: mantener ambos en sincronía). Cuenta groups.created_by, NO la
-- pertenencia: unirse a grupos por invitación es siempre ilimitado (es el
-- mecanismo viral de la app, regla de oro de MONETIZACION.md).
-- El cliente reconoce el error por el texto 'free_group_limit' y abre el paywall.
create or replace function public.enforce_group_limit()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if public.paywall_enabled()
     and not public.is_premium(new.created_by)
     and (select count(*) from public.groups where created_by = new.created_by) >= 1
  then
    raise exception 'free_group_limit';
  end if;
  return new;
end;
$$;

drop trigger if exists groups_enforce_limit on public.groups;
create trigger groups_enforce_limit
  before insert on public.groups
  for each row execute function public.enforce_group_limit();
